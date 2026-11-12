//! These tests call the same runtime used by lib.rs, with actual Session/Store,
//! on-disk files and TCP bodies. Tauri only injects a trusted label at its edge.
use crate::{
    attachment_media::{
        runtime::{MediaRuntime, Purpose},
        MediaCore,
    },
    session::{Session, Token},
    store::Store,
};
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    sync::{atomic::Ordering, Arc, Condvar, Mutex},
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
};
struct App {
    _dir: tempfile::TempDir,
    shared: Arc<(Mutex<Session>, Condvar)>,
    runtime: Arc<MediaRuntime>,
    note: String,
    id: String,
    token: Token,
}
fn token(session: &Session, id: Option<&str>) -> Token {
    let a = session.snapshot().unwrap();
    Token {
        session_id: a["sessionId"].as_str().unwrap().into(),
        epoch: a["epoch"].as_u64().unwrap(),
        note_epoch: id.map(|id| a["notes"][id]["epoch"].as_u64().unwrap()),
    }
}
impl App {
    async fn new(bytes: Vec<u8>, mime: &str) -> Self {
        let dir = tempfile::tempdir().unwrap();
        let mut session = Session::new(Store::open(&dir.path().join("store")).unwrap());
        let global = token(&session, None);
        let note = session
            .ordinary(json!({"type":"createNote"}), &global)
            .unwrap()
            .0["id"]
            .as_str()
            .unwrap()
            .to_owned();
        let t = token(&session, Some(&note));
        let id = session
            .store_attachment(&note, "sample", mime, bytes, &t)
            .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_owned();
        let shared = Arc::new((Mutex::new(session), Condvar::new()));
        let runtime = MediaRuntime::start(
            shared.clone(),
            dir.path().join("cache"),
            HashSet::from(["http://tauri.localhost".into()]),
        )
        .await
        .unwrap();
        runtime.opened("main").unwrap();
        runtime.opened("note-second").unwrap();
        Self {
            _dir: dir,
            shared,
            runtime,
            note,
            id,
            token: t,
        }
    }
    async fn grant(&self, purpose: Purpose) -> Value {
        self.runtime
            .acquire(
                self.runtime.window("main").unwrap(),
                self.id.clone(),
                self.token.clone(),
                purpose,
                (purpose == Purpose::Thumbnail).then_some(160),
            )
            .await
            .unwrap()
    }
    fn global(&self) -> Token {
        token(&self.shared.0.lock().unwrap(), None)
    }
}
impl Drop for App {
    fn drop(&mut self) {
        self.runtime.stop();
    }
}
async fn connection(value: &Value, extra: &str) -> TcpStream {
    let url = url::Url::parse(value["url"].as_str().unwrap()).unwrap();
    let host = format!("127.0.0.1:{}", url.port().unwrap());
    let mut socket = TcpStream::connect(&host).await.unwrap();
    socket
        .write_all(
            format!(
                "GET {} HTTP/1.1\r\nHost: {host}\r\n{extra}Connection: close\r\n\r\n",
                url.path()
            )
            .as_bytes(),
        )
        .await
        .unwrap();
    socket
}
async fn response(value: &Value, extra: &str) -> Vec<u8> {
    let mut data = vec![];
    connection(value, extra)
        .await
        .read_to_end(&mut data)
        .await
        .unwrap();
    data
}
async fn streams(core: &MediaCore, count: usize) {
    tokio::time::timeout(Duration::from_secs(4), async {
        while core.metrics.active_streams.load(Ordering::Relaxed) != count {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
}
pub async fn platform_creation_tagged_grant_release_and_incarnation() {
    let app = App::new(b"real original bytes".to_vec(), "audio/wav").await;
    assert_eq!(
        app.runtime.window("renderer-invented").err().unwrap().code,
        "access_changed"
    );
    let grant = app.grant(Purpose::Original).await;
    assert_eq!(grant["noteId"], app.note);
    assert_eq!(grant["attachmentId"], app.id);
    assert_eq!(
        grant["access"],
        app.shared.0.lock().unwrap().snapshot().unwrap()
    );
    assert_eq!(grant["metadata"], app.shared.0.lock().unwrap().metadata());
    let data = response(&grant, "").await;
    assert!(data.starts_with(b"HTTP/1.1 200"));
    assert!(data.ends_with(b"real original bytes"));
    let id = grant["leaseId"].as_str().unwrap();
    assert_eq!(
        app.runtime
            .release(&app.runtime.window("note-second").unwrap(), id)
            .unwrap_err()
            .code,
        "access_changed"
    );
    assert!(response(&grant, "").await.starts_with(b"HTTP/1.1 200"));
    let old = app.runtime.window("main").unwrap();
    app.runtime.closed("main");
    app.runtime.opened("main").unwrap();
    assert!(response(&grant, "").await.starts_with(b"HTTP/1.1 404"));
    assert_eq!(
        app.runtime
            .acquire(
                old,
                app.id.clone(),
                app.token.clone(),
                Purpose::Original,
                None
            )
            .await
            .unwrap_err()
            .code,
        "access_changed"
    );
    let current = app.grant(Purpose::Original).await;
    app.runtime
        .release(
            &app.runtime.window("main").unwrap(),
            current["leaseId"].as_str().unwrap(),
        )
        .unwrap();
    assert!(response(&current, "").await.starts_with(b"HTTP/1.1 404"));
}
pub async fn platform_prepare_sync_and_window_close_cancel_stalled_no_range() {
    let app = App::new(vec![0x69; 24 * 1024 * 1024], "video/mp4").await;
    let grant = app.grant(Purpose::Original).await;
    let mut socket = connection(&grant, "").await;
    let mut one = [0; 1];
    socket.read_exact(&mut one).await.unwrap();
    streams(&app.runtime.core, 1).await;
    let event = {
        let mut s = app.shared.0.lock().unwrap();
        let t = token(&s, None);
        s.begin(
            json!({"type":"deleteNote","id":app.note}),
            HashSet::from(["main".into()]),
            &t,
        )
        .unwrap()
    };
    app.runtime.event("notes-access", &event).unwrap();
    streams(&app.runtime.core, 0).await;
    assert!(response(&grant, "").await.starts_with(b"HTTP/1.1 404"));
    assert_eq!(
        app.runtime
            .acquire(
                app.runtime.window("main").unwrap(),
                app.id.clone(),
                app.token.clone(),
                Purpose::Original,
                None
            )
            .await
            .unwrap_err()
            .code,
        "access_changed"
    );
    drop(socket);
    // A fresh real application executes the sync adapter event route, which is
    // distinct from notes-access, and then the real host destruction route.
    let other = App::new(vec![0x42; 24 * 1024 * 1024], "audio/wav").await;
    let grant = other.grant(Purpose::Original).await;
    let socket = connection(&grant, "").await;
    streams(&other.runtime.core, 1).await;
    other
        .runtime
        .event(
            "notes-sync",
            &json!({"phase":"prepare","operationId":"sync-real","noteIds":[other.note]}),
        )
        .unwrap();
    streams(&other.runtime.core, 0).await;
    drop(socket);
    assert_eq!(
        other
            .runtime
            .acquire(
                other.runtime.window("main").unwrap(),
                other.id.clone(),
                other.token.clone(),
                Purpose::Original,
                None
            )
            .await
            .unwrap_err()
            .code,
        "access_changed"
    );
    other
        .runtime
        .event(
            "notes-sync",
            &json!({"phase":"release","operationId":"old-sync","outcome":"abort"}),
        )
        .unwrap();
    assert!(other
        .runtime
        .acquire(
            other.runtime.window("main").unwrap(),
            other.id.clone(),
            other.token.clone(),
            Purpose::Original,
            None
        )
        .await
        .is_err());
    other
        .runtime
        .event(
            "notes-sync",
            &json!({"phase":"release","operationId":"sync-real","outcome":"abort"}),
        )
        .unwrap();
    let grant = other.grant(Purpose::Original).await;
    let socket = connection(&grant, "").await;
    streams(&other.runtime.core, 1).await;
    other.runtime.closed("main");
    streams(&other.runtime.core, 0).await;
    drop(socket);
}
pub async fn platform_metadata_keeps_unrelated_and_cancels_replaced_source() {
    let app = App::new(b"abc123".to_vec(), "video/mp4").await;
    let grant = app.grant(Purpose::Original).await;
    let event = {
        let mut s = app.shared.0.lock().unwrap();
        let t = token(&s, None);
        s.ordinary(json!({"type":"patchNote","id":app.note,"pinned":true}), &t)
            .unwrap();
        s.take_metadata_event().unwrap()
    };
    app.runtime.event("notes-metadata", &event).unwrap();
    assert!(response(&grant, "Range: bytes=3-5\r\n")
        .await
        .ends_with(b"123"));
    let path = {
        let s = app.shared.0.lock().unwrap();
        s.store.media_attachment(&app.id).unwrap()
    };
    // Replace real file with equal length, just as a committed sync replacement
    // would invalidate the detached descriptor's filesystem fingerprint.
    let file = app
        ._dir
        .path()
        .join("store/attachments")
        .join(path.attachment.relative_path);
    std::fs::write(file, b"xyz789").unwrap();
    app.runtime
        .event(
            "notes-metadata",
            &json!({"changes":[{"kind":"note","id":app.note}]}),
        )
        .unwrap();
    assert!(response(&grant, "").await.starts_with(b"HTTP/1.1 404"));
    assert!(response(&app.grant(Purpose::Original).await, "")
        .await
        .ends_with(b"xyz789"));
}
pub async fn platform_cache_snapshot_clear_preserves_original_and_rejects_old_token() {
    let app=App::new(br##"<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#fca"/></svg>"##.to_vec(),"image/svg+xml").await;
    let original = app.grant(Purpose::Original).await;
    let thumb = app.grant(Purpose::Thumbnail).await;
    let global = app.global();
    let snapshot = app.runtime.data_management(&global).unwrap();
    assert_eq!(snapshot["version"], 1);
    assert_eq!(snapshot["mediaCache"]["version"], 1);
    assert!(snapshot["mediaCache"]["bytes"].as_u64().unwrap() > 0);
    assert_eq!(snapshot["mediaCache"]["files"], 1);
    let mut wrong = global.clone();
    wrong.epoch += 1;
    assert!(app.runtime.clear_cache(&wrong).is_err());
    assert!(response(&thumb, "").await.starts_with(b"HTTP/1.1 200"));
    assert_eq!(app.runtime.clear_cache(&global).unwrap()["cleared"], true);
    assert!(response(&thumb, "").await.starts_with(b"HTTP/1.1 404"));
    assert!(response(&original, "").await.starts_with(b"HTTP/1.1 200"));
    assert_eq!(
        app.runtime.data_management(&global).unwrap()["mediaCache"]["bytes"],
        0
    );
    assert!(response(&app.grant(Purpose::Thumbnail).await, "")
        .await
        .starts_with(b"HTTP/1.1 200"));
}
pub async fn platform_stopped_and_invalid_start_are_explicit_errors() {
    let app = App::new(vec![1; 10], "audio/wav").await;
    let grant = app.grant(Purpose::Original).await;
    let url = url::Url::parse(grant["url"].as_str().unwrap()).unwrap();
    let window = app.runtime.window("main").unwrap();
    app.runtime.stop();
    assert_eq!(
        app.runtime
            .acquire(
                window,
                app.id.clone(),
                app.token.clone(),
                Purpose::Original,
                None
            )
            .await
            .unwrap_err()
            .code,
        "media_unavailable"
    );
    assert!(TcpStream::connect(("127.0.0.1", url.port().unwrap()))
        .await
        .is_err());
    let invalid = MediaRuntime::start(
        app.shared.clone(),
        app._dir.path().join("bad-cache"),
        HashSet::from(["null".into()]),
    )
    .await;
    assert_eq!(invalid.err().unwrap().code, "invalid");
}

pub async fn platform_zero_lease_soft_and_actual_sync_delete_reclaim_cache() {
    use crate::session::synchronization::WindowReply;
    let svg=br##"<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="#fac"/></svg>"##;
    for sync in [false, true] {
        let app = App::new(svg.to_vec(), "image/svg+xml").await;
        let thumb = app.grant(Purpose::Thumbnail).await;
        app.runtime
            .release(
                &app.runtime.window("main").unwrap(),
                thumb["leaseId"].as_str().unwrap(),
            )
            .unwrap();
        assert_eq!(app.runtime.core.cache_usage().unwrap().files, 1);
        if !sync {
            let prepare = {
                let mut s = app.shared.0.lock().unwrap();
                let t = token(&s, None);
                s.begin(
                    json!({"type":"deleteNote","id":app.note}),
                    HashSet::from(["main".into()]),
                    &t,
                )
                .unwrap()
            };
            app.runtime.event("notes-access", &prepare).unwrap();
            let (access, metadata) = {
                let mut s = app.shared.0.lock().unwrap();
                let op = prepare["operationId"].as_str().unwrap();
                s.acknowledge(op, "main", true).unwrap();
                let (out, event) = s
                    .finish(op, &HashSet::from(["main".into()]), false)
                    .unwrap();
                out.unwrap();
                (event, s.take_metadata_event().unwrap())
            };
            app.runtime.event("notes-access", &access).unwrap();
            app.runtime.event("notes-metadata", &metadata).unwrap();
            assert!(app
                .shared
                .0
                .lock()
                .unwrap()
                .store
                .note(&app.note)
                .unwrap()
                .deleted_at
                .is_some());
        } else {
            // Real second Store receives the local wire, commits deletion and
            // returns its actual tombstone. No forged metadata/boolean apply.
            let remote_dir = tempfile::tempdir().unwrap();
            let mut remote = Store::open(remote_dir.path()).unwrap();
            {
                let mut s = app.shared.0.lock().unwrap();
                let identity = s.store.sync_enable(None).unwrap();
                remote.sync_enable(Some(&identity.workspace_id)).unwrap();
                s.store.sync_flush().unwrap();
                let wires = s
                    .store
                    .sync_inventory()
                    .unwrap()
                    .iter()
                    .map(|v| s.store.sync_version(&v.digest).unwrap())
                    .collect();
                remote.sync_receive(wires).unwrap();
                remote.sync_apply_pending().unwrap();
            }
            remote
                .action(json!({"type":"deleteNote","id":app.note}))
                .unwrap();
            remote
                .action(json!({"type":"purgeNote","id":app.note}))
                .unwrap();
            remote.sync_flush().unwrap();
            let wires = remote
                .sync_inventory()
                .unwrap()
                .iter()
                .map(|v| remote.sync_version(&v.digest).unwrap())
                .collect();
            let (operation, prepare) = {
                let mut s = app.shared.0.lock().unwrap();
                s.store.sync_receive(wires).unwrap();
                let event = s.sync_begin(HashSet::from(["main".into()]), None).unwrap();
                let operation = event["operationId"].as_str().unwrap().to_owned();
                let t = token(&s, None);
                s.sync_reply(
                    "main",
                    WindowReply::Probe {
                        operation_id: operation.clone(),
                        protected_note_ids: vec![],
                        blocked: false,
                    },
                    &t,
                )
                .unwrap();
                let prepare = s
                    .sync_tick(&HashSet::from(["main".into()]))
                    .unwrap()
                    .unwrap()
                    .0;
                assert_eq!(prepare["phase"], "prepare");
                (operation, prepare)
            };
            app.runtime.event("notes-sync", &prepare).unwrap();
            assert!(app
                .runtime
                .acquire(
                    app.runtime.window("main").unwrap(),
                    app.id.clone(),
                    app.token.clone(),
                    Purpose::Original,
                    None
                )
                .await
                .is_err());
            let (release, access, metadata) = {
                let mut s = app.shared.0.lock().unwrap();
                let t = token(&s, None);
                s.sync_reply(
                    "main",
                    WindowReply::Prepare {
                        operation_id: operation,
                        ready: true,
                    },
                    &t,
                )
                .unwrap();
                let (release, access) = s
                    .sync_tick(&HashSet::from(["main".into()]))
                    .unwrap()
                    .unwrap();
                assert_eq!(release["outcome"], "commit");
                (release, access, s.take_metadata_event().unwrap())
            };
            app.runtime.event("notes-metadata", &metadata).unwrap();
            if let Some(access) = access {
                app.runtime.event("notes-access", &access).unwrap();
            }
            app.runtime.event("notes-sync", &release).unwrap();
            assert!(app.shared.0.lock().unwrap().store.note(&app.note).is_err());
            assert!(app
                .shared
                .0
                .lock()
                .unwrap()
                .store
                .attachment(&app.id)
                .is_err());
        }
        assert_eq!(app.runtime.core.cache_usage().unwrap().files, 0);
        assert_eq!(app.runtime.core.cache_usage().unwrap().bytes, 0);
    }
}

pub async fn platform_overlapping_prepare_requires_each_own_terminal() {
    let app = App::new(b"original".to_vec(), "audio/wav").await;
    let active = app.grant(Purpose::Original).await;
    for operation in ["sync-A", "access-B"] {
        app.runtime
            .event(
                "notes-sync",
                &json!({"phase":"prepare","operationId":operation,"noteIds":[app.note]}),
            )
            .unwrap();
    }
    assert!(response(&active, "").await.starts_with(b"HTTP/1.1 404"));
    for operation in ["unknown", "sync-A"] {
        app.runtime
            .event(
                "notes-sync",
                &json!({"phase":"release","operationId":operation,"outcome":"abort"}),
            )
            .unwrap();
        assert!(app
            .runtime
            .acquire(
                app.runtime.window("main").unwrap(),
                app.id.clone(),
                app.token.clone(),
                Purpose::Original,
                None
            )
            .await
            .is_err());
    }
    app.runtime
        .event(
            "notes-access",
            &json!({"phase":"abort","operationId":"access-B"}),
        )
        .unwrap();
    assert!(response(&app.grant(Purpose::Original).await, "")
        .await
        .ends_with(b"original"));
}
