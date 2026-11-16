//! Actual Unix listener + application driver + temporary production Session/SQLite.
//! Window replies here are native protocol test inputs, NOT real WebView evidence.
use super::*;
use crate::{
    agent_host::{AgentHost, CreateGrant, HostConfig},
    application::WindowReply,
    session::Token,
    store::Store,
};
use serde_json::json;
use sha2::Digest;
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    net::UnixStream,
};
use uuid::Uuid;

struct Windows {
    shared: SharedSession,
    events: Mutex<Vec<(String, Value)>>,
    mode: std::sync::atomic::AtomicU8,
}
fn token(s: &Session) -> Token {
    let snapshot = s.snapshot().unwrap();
    Token {
        session_id: snapshot["sessionId"].as_str().unwrap().into(),
        epoch: snapshot["epoch"].as_u64().unwrap(),
        note_epoch: None,
    }
}
impl WindowHost for Windows {
    fn participants(&self) -> HashSet<String> {
        HashSet::from(["main".into()])
    }
    fn emit(&self, name: &str, event: &Value) -> ToolResult<()> {
        // A different concurrent caller may hold the gate briefly. Bounded retry
        // catches this driver's accidental lock retention without a CAS-test race.
        let deadline = Instant::now() + Duration::from_secs(1);
        let mut s = loop {
            if let Ok(s) = self.shared.0.try_lock() {
                break s;
            }
            assert!(
                Instant::now() < deadline,
                "event IO must be outside Session"
            );
            std::thread::yield_now();
        };
        self.events
            .lock()
            .unwrap()
            .push((name.into(), event.clone()));
        if name != "notes-agent" {
            return Ok(());
        }
        let mode = self.mode.load(Ordering::SeqCst);
        let operation_id = event["operationId"].as_str().unwrap().to_owned();
        let reply = match event["phase"].as_str().unwrap() {
            "probe" if mode == 1 => return Ok(()),
            "probe" => WindowReply::Probe {
                operation_id,
                protected_note_ids: vec![],
                unsaved_note_ids: vec![],
                blocked: mode == 4,
            },
            "prepare" => WindowReply::Prepare {
                operation_id,
                ready: true,
            },
            "release" if event["outcome"] == "abort" || mode == 3 => return Ok(()),
            "release" => WindowReply::Release {
                operation_id,
                refreshed: mode != 2,
            },
            _ => unreachable!(),
        };
        let expected = token(&s);
        let result = NotesApplicationService::new(&mut s).external_reply(
            "main",
            reply,
            &expected,
            &self.participants(),
        );
        drop(s);
        self.shared.1.notify_all();
        result.map(|_| ())
    }
}
struct Fixture {
    _dir: tempfile::TempDir,
    root: std::path::PathBuf,
    runtime: std::path::PathBuf,
    shared: SharedSession,
    windows: Arc<Windows>,
    service: Service,
    host: AgentHost,
}
impl Fixture {
    fn new() -> Self {
        let dir = tempfile::Builder::new()
            .prefix("ai-")
            .tempdir_in("/private/tmp")
            .unwrap();
        let base = dir.path().canonicalize().unwrap();
        let root = base.join("data");
        let runtime = base.join("run");
        let shared = Arc::new((
            Mutex::new(Session::new(Store::open(&root).unwrap())),
            Condvar::new(),
        ));
        let windows = Arc::new(Windows {
            shared: shared.clone(),
            events: Mutex::default(),
            mode: std::sync::atomic::AtomicU8::new(0),
        });
        let service = Service::new(shared.clone(), windows.clone());
        let (workspace_id, incarnation) = shared
            .0
            .lock()
            .unwrap()
            .store
            .application_identity()
            .unwrap();
        let host = AgentHost::open_for_application(
            HostConfig {
                runtime_dir: runtime.clone(),
                workspace_id,
                incarnation,
            },
            Arc::new(service.clone()),
        )
        .unwrap();
        Self {
            _dir: dir,
            root,
            runtime,
            shared,
            windows,
            service,
            host,
        }
    }
    fn record(&self, client: &str) -> (Value, String) {
        let grant = self
            .host
            .create_grant(CreateGrant {
                client_id: client.into(),
                scopes: ["notes:read", "notes:create", "notes:update"]
                    .into_iter()
                    .map(String::from)
                    .collect(),
                folder_ids: ["default".into()].into_iter().collect(),
                expires_at: crate::application::now() + 60_000,
            })
            .unwrap();
        let bytes = std::fs::read(
            self.runtime
                .join("credentials")
                .join(format!("{}.json", grant.grant.credential_ref)),
        )
        .unwrap();
        (
            serde_json::from_slice(&bytes).unwrap(),
            grant.grant.grant_id,
        )
    }
    async fn restart_host(&mut self) {
        self.host.stop().await.unwrap();
        self.service.wait_idle().unwrap();
        // Drop the host/registry lock before opening another owner.
        let config = {
            let s = self.shared.0.lock().unwrap();
            let (workspace_id, incarnation) = s.store.application_identity().unwrap();
            HostConfig {
                runtime_dir: self.runtime.clone(),
                workspace_id,
                incarnation,
            }
        };
        // Move the stopped owner into a temporary Option so its lock is released.
        let replacement_dir = self._dir.path().join("other-run");
        let (w, i) = self
            .shared
            .0
            .lock()
            .unwrap()
            .store
            .application_identity()
            .unwrap();
        let placeholder = AgentHost::open(
            HostConfig {
                runtime_dir: replacement_dir,
                workspace_id: w,
                incarnation: i,
            },
            Arc::new(self.service.clone()),
        )
        .unwrap();
        drop(std::mem::replace(&mut self.host, placeholder));
        self.host =
            AgentHost::open_for_application(config, Arc::new(self.service.clone())).unwrap();
        self.host.restore_enabled().await.unwrap();
    }
}
fn create(text: &str) -> Value {
    json!({"folderId":"default","format":"text","content":text,"idempotencyKey":Uuid::new_v4().to_string()})
}
async fn connect(record: &Value, tool: &str, args: Value) -> UnixStream {
    let mut stream = UnixStream::connect(record["socketPath"].as_str().unwrap())
        .await
        .unwrap();
    let req = json!({"version":1,"requestId":Uuid::new_v4().to_string(),"workspaceId":record["workspaceId"],"clientId":record["clientId"],"credential":record["credential"],"tool":tool,"arguments":args});
    let mut bytes = serde_json::to_vec(&req).unwrap();
    bytes.push(b'\n');
    stream.write_all(&bytes).await.unwrap();
    stream
}
async fn call(record: &Value, tool: &str, args: Value) -> Value {
    let stream = connect(record, tool, args).await;
    let mut line = String::new();
    tokio::time::timeout(
        Duration::from_secs(8),
        BufReader::new(stream).read_line(&mut line),
    )
    .await
    .unwrap()
    .unwrap();
    serde_json::from_str(&line).unwrap()
}
async fn until(mut predicate: impl FnMut() -> bool) {
    tokio::time::timeout(Duration::from_secs(8), async {
        while !predicate() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
}

#[tokio::test]
async fn actual_ipc_service_receipt_metadata_ack_restart_idempotency_and_revoke() {
    let mut f = Fixture::new();
    assert!(!f.host.restore_enabled().await.unwrap().enabled);
    f.host.set_enabled(true).await.unwrap();
    let (mut record, id) = f.record("real-client");
    let args = create("集成标题\n中文正文");
    let result = call(&record, "notes_create", args.clone()).await;
    assert_eq!(result["isError"], false);
    assert_eq!(result["result"]["committed"], true);
    assert_eq!(result["result"]["warnings"], json!([]));
    let note = result["result"]["noteId"].clone();
    let read = call(&record, "notes_read", json!({"noteId":note})).await;
    assert_eq!(read["result"]["content"], "集成标题\n中文正文");
    for (tool, args) in [
        ("notes_get_capabilities", json!({})),
        ("notes_list_folders", json!({})),
        ("notes_list", json!({})),
        ("notes_search", json!({"query":"中文"})),
        (
            "notes_get_operation",
            json!({"operationId":result["result"]["operationId"]}),
        ),
    ] {
        assert_eq!(call(&record, tool, args).await["isError"], false);
    }
    let events = f.windows.events.lock().unwrap();
    let metadata = events
        .iter()
        .position(|(name, _)| name == "notes-metadata")
        .unwrap();
    let release = events
        .iter()
        .position(|(_, e)| e["phase"] == "release")
        .unwrap();
    assert!(metadata < release);
    drop(events);
    f.restart_host().await;
    let reference = f.host.settings().unwrap().grants[0].credential_ref.clone();
    record = serde_json::from_slice(
        &std::fs::read(
            f.runtime
                .join("credentials")
                .join(format!("{reference}.json")),
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(
        call(&record, "notes_create", args).await["result"],
        result["result"]
    );
    assert_eq!(f.shared.0.lock().unwrap().store.notes().unwrap().len(), 1);
    f.host.revoke_grant(&id).unwrap();
    assert_eq!(
        call(&record, "notes_read", json!({"noteId":note})).await["result"]["code"],
        "UNAUTHORIZED"
    );
    f.host.set_enabled(false).await.unwrap();
    f.restart_host().await;
    assert!(!f.host.settings().unwrap().enabled);
    f.host.stop().await.unwrap();
    f.service.wait_idle().unwrap();
    // A new true Store connection confirms SQLite persistence independently.
    let store = Store::open(&f.root).unwrap();
    assert_eq!(store.notes().unwrap().len(), 1);
}

#[tokio::test]
async fn two_clients_share_application_admission_and_cas_one_winner() {
    let mut f = Fixture::new();
    f.host.set_enabled(true).await.unwrap();
    let (a, _) = f.record("a");
    let (b, _) = f.record("b");
    let created = call(&a, "notes_create", create("before")).await;
    let note = created["result"]["noteId"].clone();
    let version = created["result"]["committedVersion"].clone();
    let args = |text| json!({"noteId":note,"expectedVersion":version,"format":"text","content":text,"idempotencyKey":Uuid::new_v4().to_string()});
    let (ra, rb) = tokio::join!(
        call(&a, "notes_update", args("a")),
        call(&b, "notes_update", args("b"))
    );
    assert_ne!(ra["isError"], rb["isError"]);
    let loser = if ra["isError"] == true { ra } else { rb };
    assert_eq!(loser["result"]["code"], "REVISION_CONFLICT");
    let read = call(&a, "notes_read", json!({"noteId":note})).await;
    assert_eq!(read["result"]["revision"], 2);
    let append = call(&a, "notes_append", json!({"noteId":note,"expectedVersion":read["result"]["version"],"text":"追加","idempotencyKey":Uuid::new_v4().to_string()})).await;
    assert_eq!(append["result"]["committedRevision"], 3);
    f.host.stop().await.unwrap();
}

#[tokio::test]
async fn disconnect_precommit_aborts_own_operation_and_releases_reservation() {
    let mut f = Fixture::new();
    f.host.set_enabled(true).await.unwrap();
    let (record, _) = f.record("cancel");
    f.windows.mode.store(1, Ordering::SeqCst);
    let stream = connect(&record, "notes_create", create("never committed")).await;
    until(|| f.shared.0.lock().unwrap().external_has_operation()).await;
    drop(stream);
    until(|| !f.shared.0.lock().unwrap().external_has_operation()).await;
    assert!(f.shared.0.lock().unwrap().store.notes().unwrap().is_empty());
    f.windows.mode.store(0, Ordering::SeqCst);
    assert_eq!(
        call(&record, "notes_create", create("after cancel")).await["result"]["committed"],
        true
    );
    f.host.stop().await.unwrap();
}

#[tokio::test]
async fn actual_negative_release_ack_persist_failure_preserves_commit_and_recovers() {
    let mut f = Fixture::new();
    f.host.set_enabled(true).await.unwrap();
    let (record, _) = f.record("negative-ack");
    let db = rusqlite::Connection::open(f.root.join("notes.sqlite3")).unwrap();
    db.execute_batch("CREATE TRIGGER fail_agent_warning BEFORE UPDATE ON application_operations BEGIN SELECT RAISE(ABORT,'test warning persistence'); END;").unwrap();
    f.windows.mode.store(2, Ordering::SeqCst);
    let args = create("committed despite failed warning");
    let result = call(&record, "notes_create", args.clone()).await;
    assert_eq!(result["result"]["committed"], true);
    let warnings = result["result"]["warnings"].as_array().unwrap();
    assert!(warnings.contains(&json!("WINDOW_REFRESH_REQUIRED")));
    assert!(warnings.contains(&json!("WARNING_PERSIST_FAILED")));
    db.execute_batch("DROP TRIGGER fail_agent_warning").unwrap();
    let operation = result["result"]["operationId"].as_str().unwrap();
    let info = f.host.settings().unwrap().grants[0].clone();
    let (ctx, _) = crate::agent_access::TrustedContext::from_verified_grant(
        info.client_id,
        info.grant_id,
        info.workspace_id,
        info.incarnation,
        info.scopes,
        info.folder_ids,
        info.expires_at,
        info.revocation,
    )
    .unwrap();
    let recovered = NotesApplicationService::new(&mut f.shared.0.lock().unwrap())
        .finish_delivery(&ctx, operation, &f.windows.participants())
        .unwrap()
        .unwrap();
    assert!(recovered.committed);
    assert_eq!(recovered.committed_revision, 1);
    let replay = call(&record, "notes_create", args).await;
    assert_eq!(replay["result"]["committedRevision"], 1);
    assert_eq!(f.shared.0.lock().unwrap().store.notes().unwrap().len(), 1);
    f.host.stop().await.unwrap();
}

#[tokio::test]
async fn disconnect_after_commit_finishes_real_ack_timeout_and_persistent_warning() {
    let mut f = Fixture::new();
    f.host.set_enabled(true).await.unwrap();
    let (record, _) = f.record("postcommit");
    f.windows.mode.store(3, Ordering::SeqCst);
    let args = create("keep committed fact");
    let stream = connect(&record, "notes_create", args.clone()).await;
    until(|| !f.shared.0.lock().unwrap().store.notes().unwrap().is_empty()).await;
    drop(stream);
    until(|| f.service.active.load(Ordering::SeqCst) == 0).await;
    let replay = call(&record, "notes_create", args).await;
    assert_eq!(replay["result"]["committed"], true);
    assert!(replay["result"]["warnings"]
        .as_array()
        .unwrap()
        .contains(&json!("WINDOW_REFRESH_REQUIRED")));
    assert_eq!(f.shared.0.lock().unwrap().store.notes().unwrap().len(), 1);
    f.host.stop().await.unwrap();
}

#[tokio::test]
async fn real_archive_incarnation_rotation_retires_grants_and_defaults_new_identity_off() {
    let mut f = Fixture::new();
    f.host.set_enabled(true).await.unwrap();
    let (_, id) = f.record("retire");
    let archive = f._dir.path().join("copy.notesbackup");
    f.shared
        .0
        .lock()
        .unwrap()
        .store
        .export_archive(&archive)
        .unwrap();
    let old = f.host.settings().unwrap();
    f.host.retire().await.unwrap();
    f.service.wait_idle().unwrap();
    assert!(
        f.host
            .settings()
            .unwrap()
            .grants
            .iter()
            .find(|g| g.grant_id == id)
            .unwrap()
            .revoked
    );
    f.shared
        .0
        .lock()
        .unwrap()
        .store
        .import_archive(&archive)
        .unwrap();
    f.restart_host().await;
    let new = f.host.settings().unwrap();
    assert_eq!(new.workspace_id, old.workspace_id);
    assert_ne!(new.incarnation, old.incarnation);
    assert!(!new.enabled);
    assert!(new.grants.is_empty());
}

#[tokio::test]
async fn revocation_after_real_commit_rejects_delivery_without_erasing_commit_fact() {
    let mut f = Fixture::new();
    f.host.set_enabled(true).await.unwrap();
    let (record, id) = f.record("commit-revoke");
    f.windows.mode.store(3, Ordering::SeqCst);
    let request = tokio::spawn(async move {
        call(&record, "notes_create", create("durable before revoke")).await
    });
    until(|| {
        f.windows
            .events
            .lock()
            .unwrap()
            .iter()
            .any(|(_, e)| e["phase"] == "release")
    })
    .await;
    f.host.revoke_grant(&id).unwrap();
    let reply = request.await.unwrap();
    assert_eq!(reply["isError"], true);
    assert_eq!(reply["result"]["code"], "UNAUTHORIZED");
    assert_eq!(reply["result"]["committed"], true);
    assert!(Uuid::parse_str(reply["result"]["operationId"].as_str().unwrap()).is_ok());
    assert_eq!(f.shared.0.lock().unwrap().store.notes().unwrap().len(), 1);
    f.host.stop().await.unwrap();
}

#[tokio::test]
async fn preference_failure_stops_listener_and_retry_restores_truthful_state() {
    use std::os::unix::fs::PermissionsExt;
    let mut f = Fixture::new();
    // A non-file leaf forces atomic preference persistence to fail after bind.
    let hash = format!(
        "{:x}",
        sha2::Sha256::digest(f.host.settings().unwrap().workspace_id.as_bytes())
    );
    let leaf = f.runtime.join(format!("enabled-{}.json", &hash[..12]));
    std::fs::create_dir(&leaf).unwrap();
    assert!(f.host.set_enabled(true).await.is_err());
    assert!(!f.host.settings().unwrap().enabled);
    assert!(!std::fs::read_dir(&f.runtime).unwrap().any(|e| e
        .unwrap()
        .path()
        .extension()
        .is_some_and(|x| x == "sock")));
    std::fs::remove_dir(&leaf).unwrap();
    assert!(f.host.set_enabled(true).await.unwrap().enabled);
    assert_eq!(
        std::fs::metadata(&leaf).unwrap().permissions().mode() & 0o777,
        0o600
    );
    assert!(!f.root.join(leaf.file_name().unwrap()).exists());
    f.host.stop().await.unwrap();
    // Quit retains the preference; it does not impersonate an explicit off.
    f.restart_host().await;
    assert!(f.host.settings().unwrap().enabled);
    f.host.set_enabled(false).await.unwrap();
}

#[tokio::test]
async fn application_permit_survives_result_until_delivery_and_revoked_waiter_exits() {
    let mut f = Fixture::new();
    f.host.set_enabled(true).await.unwrap();
    f.record("first");
    f.record("queued");
    let contexts: Vec<_> = f
        .host
        .settings()
        .unwrap()
        .grants
        .into_iter()
        .map(|g| {
            TrustedContext::from_verified_grant(
                g.client_id,
                g.grant_id,
                g.workspace_id,
                g.incarnation,
                g.scopes,
                g.folder_ids,
                g.expires_at,
                g.revocation,
            )
            .unwrap()
        })
        .collect();
    let first = f
        .service
        .request(
            contexts[0].0.clone(),
            "notes_create".into(),
            create("held delivery"),
            Instant::now() + Duration::from_secs(20),
        )
        .await;
    assert!(first.result.is_ok());
    let queued = tokio::spawn(f.service.request(
        contexts[1].0.clone(),
        "notes_create".into(),
        create("revoked queued"),
        Instant::now() + Duration::from_secs(20),
    ));
    tokio::time::sleep(Duration::from_millis(60)).await;
    assert!(!queued.is_finished());
    assert_eq!(f.shared.0.lock().unwrap().store.notes().unwrap().len(), 1);
    contexts[1].1.revoke();
    let denied = tokio::time::timeout(Duration::from_secs(1), queued)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(denied.result.unwrap_err().code, "UNAUTHORIZED");
    // A dropped request waiting for the writer must also release its queue ticket.
    let cancelled = tokio::spawn(f.service.request(
        contexts[0].0.clone(),
        "notes_create".into(),
        create("cancel queued"),
        Instant::now() + Duration::from_secs(20),
    ));
    until(|| f.service.active.load(Ordering::SeqCst) == 1).await;
    cancelled.abort();
    let _ = cancelled.await;
    until(|| f.service.active.load(Ordering::SeqCst) == 0).await;
    drop(first);
    let next = f
        .service
        .request(
            contexts[0].0.clone(),
            "notes_create".into(),
            create("next writer"),
            Instant::now() + Duration::from_secs(20),
        )
        .await;
    assert!(next.result.is_ok());
    assert_eq!(f.shared.0.lock().unwrap().store.notes().unwrap().len(), 2);
    drop(next);
    f.host.stop().await.unwrap();
}
