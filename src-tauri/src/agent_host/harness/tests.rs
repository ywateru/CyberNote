//! Transport/authority/persistence module tests. ProbeHandler only observes the injected
//! boundary; it does not implement notes, imitate a Store, or prove business integration.
use super::{
    agent_access::TrustedContext,
    agent_host::*,
    application::{ToolError, ToolResult},
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    fs,
    os::unix::fs::{symlink, MetadataExt, PermissionsExt},
    path::PathBuf,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::UnixStream,
    sync::{Notify, Semaphore},
};
use uuid::Uuid;
fn registry(temp: &Temp) -> PathBuf {
    temp.0.join(format!(
        "grants-{}.json",
        &format!("{:x}", Sha256::digest(b"workspace"))[..12]
    ))
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}
struct Temp(PathBuf);
impl Temp {
    fn new() -> Self {
        let base = fs::canonicalize(std::env::temp_dir()).unwrap();
        let dir = base.join(format!("ah-{}", &Uuid::new_v4().to_string()[..8]));
        fs::create_dir(&dir).unwrap();
        fs::set_permissions(&dir, fs::Permissions::from_mode(0o700)).unwrap();
        Self(dir)
    }
    fn config(&self) -> HostConfig {
        HostConfig {
            runtime_dir: self.0.clone(),
            workspace_id: "workspace".into(),
            incarnation: "incarnation-1".into(),
        }
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
#[derive(Default)]
struct ProbeHandler {
    calls: AtomicUsize,
    contexts: Mutex<Vec<TrustedContext>>,
    entered: Notify,
    gate: Option<Arc<Semaphore>>,
    output: Option<Value>,
}
impl ApplicationHandler for Arc<ProbeHandler> {
    fn call(&self, ctx: TrustedContext, _tool: String, _arguments: Value) -> HandlerFuture {
        let this = self.clone();
        Box::pin(async move {
            this.calls.fetch_add(1, Ordering::SeqCst);
            this.contexts.lock().unwrap().push(ctx);
            this.entered.notify_one();
            if let Some(gate) = &this.gate {
                gate.acquire().await.unwrap().forget();
            }
            Ok(this
                .output
                .clone()
                .unwrap_or_else(|| json!({"noteId":"visible-note"})))
        })
    }
}
fn open(temp: &Temp, probe: Arc<ProbeHandler>) -> AgentHost {
    AgentHost::open(temp.config(), Arc::new(probe)).unwrap()
}
fn input(scopes: &[&str]) -> CreateGrant {
    CreateGrant {
        client_id: "test-client".into(),
        scopes: scopes.iter().map(|s| s.to_string()).collect(),
        folder_ids: BTreeSet::from(["folder-1".into()]),
        expires_at: now() + 60_000,
    }
}
fn credential(temp: &Temp, grant: &CreatedGrant) -> Value {
    serde_json::from_slice(
        &fs::read(
            temp.0
                .join("credentials")
                .join(format!("{}.json", grant.connection.credential_ref)),
        )
        .unwrap(),
    )
    .unwrap()
}
fn request(cred: &Value, tool: &str, arguments: Value) -> Value {
    json!({"version":1,"requestId":Uuid::new_v4().to_string(),"workspaceId":cred["workspaceId"],"clientId":cred["clientId"],"credential":cred["credential"],"tool":tool,"arguments":arguments})
}
async fn raw(cred: &Value, bytes: &[u8], eof: bool) -> HostResponse {
    let mut stream = UnixStream::connect(cred["socketPath"].as_str().unwrap())
        .await
        .unwrap();
    // Oversized send may be closed before all bytes are accepted.
    let _ = stream.write_all(bytes).await;
    if eof {
        stream.shutdown().await.unwrap();
    }
    let mut response = Vec::new();
    tokio::time::timeout(Duration::from_secs(30), stream.read_to_end(&mut response))
        .await
        .unwrap()
        .unwrap();
    serde_json::from_slice(&response).unwrap()
}
async fn call(cred: &Value, req: Value) -> HostResponse {
    let mut bytes = serde_json::to_vec(&req).unwrap();
    bytes.push(b'\n');
    raw(cred, &bytes, false).await
}
fn code(response: &HostResponse) -> &str {
    response.result["code"].as_str().unwrap()
}
async fn entered(probe: &ProbeHandler, count: usize) {
    tokio::time::timeout(Duration::from_secs(2), async {
        loop {
            let notified = probe.entered.notified();
            if probe.calls.load(Ordering::SeqCst) >= count {
                return;
            }
            notified.await;
        }
    })
    .await
    .unwrap();
}
#[tokio::test]
async fn default_off_typed_results_private_credential_and_roundtrip() {
    let temp = Temp::new();
    let probe = Arc::new(ProbeHandler::default());
    let mut host = open(&temp, probe.clone());
    assert!(!host.settings().unwrap().enabled);
    assert!(host.create_grant(input(&["notes:read"])).is_err());
    host.start().await.unwrap();
    let grant = host.create_grant(input(&["notes:read"])).unwrap();
    let cred = credential(&temp, &grant);
    let credential_path = temp
        .0
        .join("credentials")
        .join(format!("{}.json", grant.connection.credential_ref));
    assert_eq!(
        fs::metadata(credential_path).unwrap().mode() & 0o7777,
        0o600
    );
    assert_eq!(
        fs::metadata(temp.0.join("credentials")).unwrap().mode() & 0o7777,
        0o700
    );
    assert_eq!(
        fs::metadata(cred["socketPath"].as_str().unwrap())
            .unwrap()
            .mode()
            & 0o7777,
        0o600
    );
    let req = request(&cred, "notes_read", json!({"noteId":"visible-note"}));
    let id = req["requestId"].clone();
    let result = call(&cred, req).await;
    assert!(!result.is_error);
    assert_eq!(result.request_id, id);
    let secret = cred["credential"].as_str().unwrap();
    for bytes in [
        serde_json::to_vec(&grant).unwrap(),
        serde_json::to_vec(&host.settings().unwrap()).unwrap(),
        fs::read(registry(&temp)).unwrap(),
    ] {
        assert!(!String::from_utf8(bytes).unwrap().contains(secret));
    }
    assert_eq!(host.settings().unwrap().recent_operations[0].outcome, "OK");
    host.stop().await.unwrap();
    assert!(!PathBuf::from(cred["socketPath"].as_str().unwrap()).exists());
}
#[tokio::test]
async fn strict_envelope_and_lf_frames_reject_without_dispatch() {
    let temp = Temp::new();
    let probe = Arc::new(ProbeHandler::default());
    let mut host = open(&temp, probe.clone());
    host.start().await.unwrap();
    let grant = host.create_grant(input(&["notes:read"])).unwrap();
    let cred = credential(&temp, &grant);
    let good = request(&cred, "notes_read", json!({}));
    for (key, val) in [
        ("unknown", json!(true)),
        ("version", json!(2)),
        ("requestId", json!("invalid")),
        ("arguments", json!([])),
        ("tool", json!("arbitrary")),
    ] {
        let mut bad = good.clone();
        bad[key] = val;
        let r = call(&cred, bad).await;
        assert!(r.is_error);
        assert_eq!(code(&r), "SCHEMA_INVALID");
    }
    let mut duplicate = serde_json::to_vec(&good).unwrap();
    duplicate.pop();
    duplicate.extend_from_slice(b",\"version\":1}\n");
    assert_eq!(code(&raw(&cred, &duplicate, false).await), "SCHEMA_INVALID");
    let bytes = serde_json::to_vec(&good).unwrap();
    assert_eq!(code(&raw(&cred, &bytes, true).await), "SCHEMA_INVALID");
    let mut crlf = bytes.clone();
    crlf.extend_from_slice(b"\r\n");
    assert_eq!(code(&raw(&cred, &crlf, false).await), "SCHEMA_INVALID");
    let mut two = bytes.clone();
    two.push(b'\n');
    two.extend_from_slice(&bytes);
    two.push(b'\n');
    assert_eq!(code(&raw(&cred, &two, false).await), "SCHEMA_INVALID");
    assert_eq!(code(&raw(&cred, b"\xff\n", false).await), "SCHEMA_INVALID");
    assert_eq!(probe.calls.load(Ordering::SeqCst), 0);
    host.stop().await.unwrap();
}
#[tokio::test]
async fn frame_limit_is_bounded_and_includes_newline() {
    let temp = Temp::new();
    let probe = Arc::new(ProbeHandler::default());
    let mut host = open(&temp, probe.clone());
    host.start().await.unwrap();
    let grant = host.create_grant(input(&["notes:read"])).unwrap();
    let cred = credential(&temp, &grant);
    let mut req = request(&cred, "notes_read", json!({"padding":""}));
    let overhead = serde_json::to_vec(&req).unwrap().len();
    req["arguments"]["padding"] = Value::String("x".repeat(MAX_FRAME - 1 - overhead));
    assert!(!call(&cred, req).await.is_error);
    let huge = vec![b'x'; MAX_FRAME];
    assert_eq!(code(&raw(&cred, &huge, false).await), "CONTENT_TOO_LARGE");
    assert_eq!(probe.calls.load(Ordering::SeqCst), 1);
    host.stop().await.unwrap();
}
#[tokio::test]
async fn authentication_scope_folder_workspace_and_expiry_are_checked() {
    let temp = Temp::new();
    let probe = Arc::new(ProbeHandler::default());
    let mut host = open(&temp, probe.clone());
    host.start().await.unwrap();
    let grant = host.create_grant(input(&["notes:create"])).unwrap();
    let cred = credential(&temp, &grant);
    assert_eq!(
        code(&call(&cred, request(&cred, "notes_read", json!({}))).await),
        "FORBIDDEN"
    );
    assert_eq!(
        code(
            &call(
                &cred,
                request(&cred, "notes_create", json!({"folderId":"outside"}))
            )
            .await
        ),
        "NOT_FOUND"
    );
    let mut bad = request(&cred, "notes_create", json!({"folderId":"folder-1"}));
    bad["workspaceId"] = json!("other");
    assert_eq!(code(&call(&cred, bad).await), "WORKSPACE_UNAVAILABLE");
    let mut bad = request(&cred, "notes_create", json!({}));
    bad["credential"] = json!("0".repeat(64));
    assert_eq!(code(&call(&cred, bad).await), "UNAUTHORIZED");
    let mut bad = request(&cred, "notes_create", json!({}));
    bad["clientId"] = json!("other-client");
    assert_eq!(code(&call(&cred, bad).await), "UNAUTHORIZED");
    assert!(
        !call(
            &cred,
            request(&cred, "notes_create", json!({"folderId":"folder-1"}))
        )
        .await
        .is_error
    );
    // Operation lookup is allowed without notes:read; actual original scope is application's job.
    assert!(
        !call(
            &cred,
            request(&cred, "notes_get_operation", json!({"operationId":"op"}))
        )
        .await
        .is_error
    );
    for scopes in [&[][..], &["notes:delete"][..]] {
        assert!(host.create_grant(input(scopes)).is_err());
    }
    let mut expired = input(&["notes:read"]);
    expired.expires_at = now() - 1;
    assert!(host.create_grant(expired).is_err());
    let mut expiring = input(&["notes:read"]);
    expiring.expires_at = now() + 100;
    let grant2 = host.create_grant(expiring).unwrap();
    let cred2 = credential(&temp, &grant2);
    tokio::time::sleep(Duration::from_millis(150)).await;
    assert_eq!(
        code(&call(&cred2, request(&cred2, "notes_read", json!({}))).await),
        "UNAUTHORIZED"
    );
    host.stop().await.unwrap();
}
#[tokio::test]
async fn restart_is_off_reuses_grants_and_rejects_other_incarnation() {
    let temp = Temp::new();
    let probe = Arc::new(ProbeHandler::default());
    let mut host = open(&temp, probe.clone());
    host.start().await.unwrap();
    let grant = host.create_grant(input(&["notes:read"])).unwrap();
    let old = credential(&temp, &grant);
    let old_socket = old["socketPath"].clone();
    host.stop().await.unwrap();
    drop(host);
    let mut config = temp.config();
    config.incarnation = "restored-library".into();
    assert!(
        matches!(AgentHost::open(config, Arc::new(probe.clone())), Err(e) if e.code == "WORKSPACE_UNAVAILABLE")
    );
    let mut host = open(&temp, probe);
    assert!(!host.settings().unwrap().enabled);
    assert_eq!(host.settings().unwrap().grants.len(), 1);
    host.start().await.unwrap();
    let cred = credential(&temp, &grant);
    assert_ne!(old_socket, cred["socketPath"]);
    assert!(
        !call(&cred, request(&cred, "notes_read", json!({})))
            .await
            .is_error
    );
    host.revoke_grant(&grant.grant.grant_id).unwrap();
    assert_eq!(
        code(&call(&cred, request(&cred, "notes_read", json!({}))).await),
        "UNAUTHORIZED"
    );
    host.stop().await.unwrap();
    drop(host);
    let mut host = open(&temp, Arc::new(ProbeHandler::default()));
    host.start().await.unwrap();
    assert!(host.settings().unwrap().grants[0].revoked);
    let mut stale = old;
    stale["socketPath"] = json!(fs::read_dir(&temp.0)
        .unwrap()
        .map(|e| e.unwrap().path())
        .find(|p| p.extension().is_some_and(|e| e == "sock"))
        .unwrap());
    assert_eq!(
        code(&call(&stale, request(&stale, "notes_read", json!({}))).await),
        "UNAUTHORIZED"
    );
    host.stop().await.unwrap();
}
#[tokio::test]
async fn same_grant_context_is_shared_and_revoke_invalidates_queued_and_inflight() {
    let temp = Temp::new();
    let gate = Arc::new(Semaphore::new(0));
    let probe = Arc::new(ProbeHandler {
        gate: Some(gate.clone()),
        ..Default::default()
    });
    let mut host = open(&temp, probe.clone());
    host.start().await.unwrap();
    let grant = host.create_grant(input(&["notes:update"])).unwrap();
    let cred = credential(&temp, &grant);
    let c = cred.clone();
    let first = tokio::spawn(async move { call(&c, request(&c, "notes_update", json!({}))).await });
    entered(&probe, 1).await;
    let c = cred.clone();
    let queued =
        tokio::spawn(async move { call(&c, request(&c, "notes_append", json!({}))).await });
    tokio::task::yield_now().await;
    host.revoke_grant(&grant.grant.grant_id).unwrap();
    gate.add_permits(1);
    assert_eq!(code(&first.await.unwrap()), "UNAUTHORIZED");
    assert_eq!(code(&queued.await.unwrap()), "UNAUTHORIZED");
    assert_eq!(probe.calls.load(Ordering::SeqCst), 1);
    let ctx = probe.contexts.lock().unwrap()[0].clone();
    assert!(
        matches!(ctx.check("workspace","incarnation-1",Some("notes:update")),Err(e) if e.code=="UNAUTHORIZED")
    );
    host.stop().await.unwrap();
}
#[tokio::test]
async fn two_delivered_contexts_share_one_revocation_and_stop_invalidates_them() {
    let temp = Temp::new();
    let probe = Arc::new(ProbeHandler::default());
    let mut host = open(&temp, probe.clone());
    host.start().await.unwrap();
    let grant = host.create_grant(input(&["notes:read"])).unwrap();
    let cred = credential(&temp, &grant);
    for _ in 0..2 {
        assert!(
            !call(&cred, request(&cred, "notes_read", json!({})))
                .await
                .is_error
        );
    }
    host.revoke_grant(&grant.grant.grant_id).unwrap();
    for ctx in probe.contexts.lock().unwrap().iter() {
        assert!(ctx.check("workspace", "incarnation-1", None).is_err());
    }
    let grant2 = host.create_grant(input(&["notes:read"])).unwrap();
    let cred2 = credential(&temp, &grant2);
    assert!(
        !call(&cred2, request(&cred2, "notes_read", json!({})))
            .await
            .is_error
    );
    host.stop().await.unwrap();
    let old = probe.contexts.lock().unwrap().last().unwrap().clone();
    assert!(old.check("workspace", "incarnation-1", None).is_err());
    host.start().await.unwrap();
    let cred2 = credential(&temp, &grant2);
    assert!(
        !call(&cred2, request(&cred2, "notes_read", json!({})))
            .await
            .is_error
    );
    assert!(old.check("workspace", "incarnation-1", None).is_err());
    host.stop().await.unwrap();
}
#[tokio::test]
async fn limits_are_per_client_across_grants_and_write_queue_is_eight() {
    let temp = Temp::new();
    let gate = Arc::new(Semaphore::new(0));
    let probe = Arc::new(ProbeHandler {
        gate: Some(gate.clone()),
        ..Default::default()
    });
    let mut host = open(&temp, probe.clone());
    host.start().await.unwrap();
    let g1 = host
        .create_grant(input(&["notes:read", "notes:update"]))
        .unwrap();
    let c1 = credential(&temp, &g1);
    let g2 = host
        .create_grant(input(&["notes:read", "notes:update"]))
        .unwrap();
    let c2 = credential(&temp, &g2);
    let mut reads = Vec::new();
    for i in 0..4 {
        let c = if i % 2 == 0 { c1.clone() } else { c2.clone() };
        reads.push(tokio::spawn(async move {
            call(&c, request(&c, "notes_read", json!({}))).await
        }));
    }
    entered(&probe, 4).await;
    assert_eq!(
        code(&call(&c2, request(&c2, "notes_read", json!({}))).await),
        "RATE_LIMITED"
    );
    gate.add_permits(4);
    for r in reads {
        assert!(!r.await.unwrap().is_error);
    }
    let mut writes = Vec::new();
    for i in 0..9 {
        let c = if i % 2 == 0 { c1.clone() } else { c2.clone() };
        writes.push(tokio::spawn(async move {
            call(&c, request(&c, "notes_update", json!({}))).await
        }));
    }
    entered(&probe, 5).await;
    // Let all nine already-spawned connections enter the bounded host queue.
    for _ in 0..20 {
        tokio::task::yield_now().await;
    }
    assert_eq!(
        code(&call(&c2, request(&c2, "notes_update", json!({}))).await),
        "RATE_LIMITED"
    );
    assert_eq!(probe.calls.load(Ordering::SeqCst), 5);
    gate.add_permits(9);
    for w in writes {
        assert!(!w.await.unwrap().is_error);
    }
    host.stop().await.unwrap();
}
#[tokio::test]
async fn symlinks_modes_hardlinks_and_lifetime_lock_fail_closed() {
    let temp = Temp::new();
    let probe = Arc::new(ProbeHandler::default());
    let mut host = open(&temp, probe.clone());
    assert!(AgentHost::open(temp.config(), Arc::new(probe.clone())).is_err());
    host.start().await.unwrap();
    let grant = host.create_grant(input(&["notes:read"])).unwrap();
    host.stop().await.unwrap();
    drop(host);
    let leaf = temp
        .0
        .join("credentials")
        .join(format!("{}.json", grant.connection.credential_ref));
    fs::set_permissions(&leaf, fs::Permissions::from_mode(0o644)).unwrap();
    let mut host = open(&temp, probe.clone());
    assert!(host.start().await.is_err());
    drop(host);
    fs::set_permissions(&leaf, fs::Permissions::from_mode(0o600)).unwrap();
    let target = temp.0.join("original");
    fs::rename(&leaf, &target).unwrap();
    symlink(&target, &leaf).unwrap();
    let mut host = open(&temp, probe.clone());
    assert!(host.start().await.is_err());
    drop(host);
    fs::remove_file(&leaf).unwrap();
    fs::hard_link(&target, &leaf).unwrap();
    let mut host = open(&temp, probe.clone());
    assert!(host.start().await.is_err());
    drop(host);
    fs::remove_file(&leaf).unwrap();
    fs::rename(&target, &leaf).unwrap();
    let registry = registry(&temp);
    let saved = temp.0.join("saved");
    fs::rename(&registry, &saved).unwrap();
    symlink(&saved, &registry).unwrap();
    assert!(AgentHost::open(temp.config(), Arc::new(probe.clone())).is_err());
    let linked = Temp::new();
    let p = linked.0.join("link");
    symlink(&temp.0, &p).unwrap();
    let mut config = linked.config();
    config.runtime_dir = p;
    assert!(AgentHost::open(config, Arc::new(probe.clone())).is_err());
    let wrong = Temp::new();
    fs::set_permissions(&wrong.0, fs::Permissions::from_mode(0o755)).unwrap();
    assert!(AgentHost::open(wrong.config(), Arc::new(probe)).is_err());
}
#[tokio::test]
async fn socket_cleanup_never_removes_replacement_or_symlink() {
    let temp = Temp::new();
    let probe = Arc::new(ProbeHandler::default());
    let mut host = open(&temp, probe);
    host.start().await.unwrap();
    let grant = host.create_grant(input(&["notes:read"])).unwrap();
    let cred = credential(&temp, &grant);
    let path = PathBuf::from(cred["socketPath"].as_str().unwrap());
    fs::rename(&path, temp.0.join("old.sock")).unwrap();
    let replacement = std::os::unix::net::UnixListener::bind(&path).unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
    host.stop().await.unwrap();
    assert!(path.exists());
    drop(replacement);
    fs::remove_file(&path).unwrap();
    symlink(temp.0.join("old.sock"), &path).unwrap();
    assert!(host.start().await.is_err());
    assert!(fs::symlink_metadata(&path)
        .unwrap()
        .file_type()
        .is_symlink());
}
#[test]
fn short_socket_path_is_enforced_without_truncation_or_fallback() {
    let temp = Temp::new();
    let long = temp.0.join("x".repeat(90));
    fs::create_dir(&long).unwrap();
    fs::set_permissions(&long, fs::Permissions::from_mode(0o700)).unwrap();
    let mut config = temp.config();
    config.runtime_dir = long.clone();
    assert!(
        matches!(AgentHost::open(config,Arc::new(Arc::new(ProbeHandler::default()))),Err(e) if e.code=="HOST_UNAVAILABLE")
    );
    assert!(fs::read_dir(long).unwrap().all(|e| e
        .unwrap()
        .path()
        .extension()
        .is_none_or(|e| e != "sock")));
}
#[tokio::test]
async fn persistent_revocation_survives_credential_cleanup_failure() {
    let temp = Temp::new();
    let mut host = open(&temp, Arc::new(ProbeHandler::default()));
    host.start().await.unwrap();
    let grant = host.create_grant(input(&["notes:read"])).unwrap();
    let cred = credential(&temp, &grant);
    let leaf = temp
        .0
        .join("credentials")
        .join(format!("{}.json", grant.connection.credential_ref));
    fs::set_permissions(&leaf, fs::Permissions::from_mode(0o644)).unwrap();
    assert!(host.revoke_grant(&grant.grant.grant_id).is_err());
    assert_eq!(
        code(&call(&cred, request(&cred, "notes_read", json!({}))).await),
        "UNAUTHORIZED"
    );
    host.stop().await.unwrap();
    drop(host);
    let mut host = open(&temp, Arc::new(ProbeHandler::default()));
    host.start().await.unwrap();
    assert!(host.settings().unwrap().grants[0].revoked);
    host.stop().await.unwrap();
}
#[tokio::test]
async fn failed_revocation_persistence_disables_and_retries_flush() {
    let temp = Temp::new();
    let probe = Arc::new(ProbeHandler::default());
    let mut host = open(&temp, probe.clone());
    host.start().await.unwrap();
    let grant = host.create_grant(input(&["notes:read"])).unwrap();
    let cred = credential(&temp, &grant);
    assert!(
        !call(&cred, request(&cred, "notes_read", json!({})))
            .await
            .is_error
    );
    let registry = registry(&temp);
    fs::set_permissions(&registry, fs::Permissions::from_mode(0o644)).unwrap();
    assert!(host.revoke_grant(&grant.grant.grant_id).is_err());
    assert!(!host.settings().unwrap().enabled);
    assert!(probe.contexts.lock().unwrap()[0]
        .check("workspace", "incarnation-1", None)
        .is_err());
    assert!(host.start().await.is_err());
    fs::set_permissions(&registry, fs::Permissions::from_mode(0o600)).unwrap();
    host.start().await.unwrap();
    host.stop().await.unwrap();
    drop(host);
    let host = open(&temp, probe);
    assert!(host.settings().unwrap().grants[0].revoked);
}
#[tokio::test]
async fn bounded_audit_contains_no_arguments_or_error_text() {
    let temp = Temp::new();
    let probe = Arc::new(ProbeHandler::default());
    let mut host = open(&temp, probe);
    host.start().await.unwrap();
    let grant = host.create_grant(input(&["notes:read"])).unwrap();
    let cred = credential(&temp, &grant);
    for _ in 0..205 {
        assert!(
            !call(
                &cred,
                request(
                    &cred,
                    "notes_read",
                    json!({"noteId":"visible-note","body":"BODY_SENTINEL"})
                )
            )
            .await
            .is_error
        );
    }
    let settings = host.settings().unwrap();
    assert_eq!(settings.recent_operations.len(), MAX_AUDIT);
    let text = serde_json::to_string(&settings).unwrap();
    assert!(!text.contains("BODY_SENTINEL"));
    assert!(!text.contains(cred["credential"].as_str().unwrap()));
    host.stop().await.unwrap();
}
#[tokio::test]
async fn oversized_and_nonobject_handler_outputs_become_typed_errors() {
    for (output, expected) in [
        (json!({"data":"x".repeat(MAX_FRAME)}), "CONTENT_TOO_LARGE"),
        (json!([]), "STORAGE_ERROR"),
    ] {
        let temp = Temp::new();
        let probe = Arc::new(ProbeHandler {
            output: Some(output),
            ..Default::default()
        });
        let mut host = open(&temp, probe);
        host.start().await.unwrap();
        let grant = host.create_grant(input(&["notes:read"])).unwrap();
        let cred = credential(&temp, &grant);
        assert_eq!(
            code(&call(&cred, request(&cred, "notes_read", json!({}))).await),
            expected
        );
        host.stop().await.unwrap();
    }
}
#[tokio::test]
async fn disconnect_cancels_handler_and_stop_cancels_live_connections() {
    let temp = Temp::new();
    let gate = Arc::new(Semaphore::new(0));
    let probe = Arc::new(ProbeHandler {
        gate: Some(gate),
        ..Default::default()
    });
    let mut host = open(&temp, probe.clone());
    host.start().await.unwrap();
    let grant = host.create_grant(input(&["notes:update"])).unwrap();
    let cred = credential(&temp, &grant);
    let mut stream = UnixStream::connect(cred["socketPath"].as_str().unwrap())
        .await
        .unwrap();
    let mut bytes = serde_json::to_vec(&request(&cred, "notes_update", json!({}))).unwrap();
    bytes.push(b'\n');
    stream.write_all(&bytes).await.unwrap();
    entered(&probe, 1).await;
    drop(stream);
    // The first cancelled handler must release its client write permit.
    let c = cred.clone();
    let pending = tokio::spawn(async move {
        let mut stream = UnixStream::connect(c["socketPath"].as_str().unwrap())
            .await
            .unwrap();
        let mut bytes = serde_json::to_vec(&request(&c, "notes_update", json!({}))).unwrap();
        bytes.push(b'\n');
        stream.write_all(&bytes).await.unwrap();
        let mut result = Vec::new();
        stream.read_to_end(&mut result).await.unwrap();
        result
    });
    entered(&probe, 2).await;
    host.stop().await.unwrap();
    // Shutdown closes the transport without delivering a stale response.
    assert!(pending.await.unwrap().is_empty());
    for ctx in probe.contexts.lock().unwrap().iter() {
        assert!(ctx.check("workspace", "incarnation-1", None).is_err());
    }
}
// Compile-time proof: UI-facing results are serializable, the host owns no Tauri type.
fn _dto_types(_: ToolResult<HostSettings>, _: ToolError) {}

#[tokio::test]
async fn two_workspaces_share_runtime_registry_credentials_and_independent_endpoints() {
    let temp = Temp::new();
    let p1 = Arc::new(ProbeHandler::default());
    let p2 = Arc::new(ProbeHandler::default());
    let mut a = open(&temp, p1.clone());
    let mut b_config = temp.config();
    b_config.workspace_id = "workspace-b".into();
    b_config.incarnation = "incarnation-b".into();
    let mut b = AgentHost::open(b_config, Arc::new(p2.clone())).unwrap();
    a.start().await.unwrap();
    b.start().await.unwrap();
    let ga = a.create_grant(input(&["notes:read"])).unwrap();
    let gb = b.create_grant(input(&["notes:read"])).unwrap();
    let ca = credential(&temp, &ga);
    let cb = credential(&temp, &gb);
    assert_ne!(ca["socketPath"], cb["socketPath"]);
    assert!(
        !call(&ca, request(&ca, "notes_read", json!({})))
            .await
            .is_error
    );
    assert!(
        !call(&cb, request(&cb, "notes_read", json!({})))
            .await
            .is_error
    );
    let mut cross = request(&ca, "notes_read", json!({}));
    cross["workspaceId"] = json!("workspace-b");
    assert_eq!(code(&call(&cb, cross).await), "UNAUTHORIZED");
    a.revoke_grant(&ga.grant.grant_id).unwrap();
    assert!(temp
        .0
        .join("credentials")
        .join(format!("{}.json", gb.connection.credential_ref))
        .exists());
    a.stop().await.unwrap();
    drop(a);
    assert!(PathBuf::from(cb["socketPath"].as_str().unwrap()).exists());
    assert!(
        !call(&cb, request(&cb, "notes_read", json!({})))
            .await
            .is_error
    );
    let mut a = open(&temp, p1);
    assert!(!a.settings().unwrap().enabled);
    a.start().await.unwrap();
    assert!(a.settings().unwrap().grants[0].revoked);
    // Stopping B cannot remove the new A endpoint; A's revoked grant stays isolated.
    let ga2 = a.create_grant(input(&["notes:read"])).unwrap();
    let ca2 = credential(&temp, &ga2);
    b.stop().await.unwrap();
    drop(b);
    assert!(PathBuf::from(ca2["socketPath"].as_str().unwrap()).exists());
    assert!(
        !call(&ca2, request(&ca2, "notes_read", json!({})))
            .await
            .is_error
    );
    let mut config = temp.config();
    config.workspace_id = "workspace-b".into();
    config.incarnation = "incarnation-b".into();
    let mut b = AgentHost::open(config, Arc::new(p2)).unwrap();
    assert_eq!(b.settings().unwrap().grants.len(), 1);
    b.start().await.unwrap();
    let cb2 = credential(&temp, &gb);
    assert!(
        !call(&cb2, request(&cb2, "notes_read", json!({})))
            .await
            .is_error
    );
    a.stop().await.unwrap();
    assert!(PathBuf::from(cb2["socketPath"].as_str().unwrap()).exists());
    b.stop().await.unwrap();
    let registries = fs::read_dir(&temp.0)
        .unwrap()
        .filter(|e| {
            e.as_ref()
                .unwrap()
                .file_name()
                .to_str()
                .unwrap()
                .starts_with("grants-")
        })
        .count();
    assert_eq!(registries, 2);
}

#[tokio::test]
async fn read_and_write_deadlines_cancel_handlers_and_release_permits() {
    for (tool, seconds) in [("notes_read", 5), ("notes_update", 20)] {
        let temp = Temp::new();
        let gate = Arc::new(Semaphore::new(0));
        let probe = Arc::new(ProbeHandler {
            gate: Some(gate.clone()),
            ..Default::default()
        });
        let mut host = open(&temp, probe.clone());
        host.start().await.unwrap();
        let grant = host
            .create_grant(input(&["notes:read", "notes:update"]))
            .unwrap();
        let cred = credential(&temp, &grant);
        let c = cred.clone();
        let pending = tokio::spawn(async move { call(&c, request(&c, tool, json!({}))).await });
        entered(&probe, 1).await;
        tokio::time::pause();
        tokio::time::advance(Duration::from_secs(seconds + 1)).await;
        for _ in 0..5 {
            tokio::task::yield_now().await;
        }
        tokio::time::resume();
        assert_eq!(code(&pending.await.unwrap()), "TIMEOUT");
        gate.add_permits(1);
        assert!(!call(&cred, request(&cred, tool, json!({}))).await.is_error);
        host.stop().await.unwrap();
    }
}
#[tokio::test]
async fn expiry_during_handler_suppresses_delivery() {
    let temp = Temp::new();
    let gate = Arc::new(Semaphore::new(0));
    let probe = Arc::new(ProbeHandler {
        gate: Some(gate.clone()),
        ..Default::default()
    });
    let mut host = open(&temp, probe.clone());
    host.start().await.unwrap();
    let mut grant_input = input(&["notes:read"]);
    grant_input.expires_at = now() + 100;
    let grant = host.create_grant(grant_input).unwrap();
    let cred = credential(&temp, &grant);
    let c = cred.clone();
    let pending = tokio::spawn(async move { call(&c, request(&c, "notes_read", json!({}))).await });
    entered(&probe, 1).await;
    tokio::time::sleep(Duration::from_millis(150)).await;
    gate.add_permits(1);
    assert_eq!(code(&pending.await.unwrap()), "UNAUTHORIZED");
    host.stop().await.unwrap();
}
#[tokio::test]
async fn revoke_during_blocked_delivery_closes_without_finishing_old_body() {
    let temp = Temp::new();
    let output = json!({"body":"x".repeat(1024*1024)});
    let probe = Arc::new(ProbeHandler {
        output: Some(output),
        ..Default::default()
    });
    let mut host = open(&temp, probe.clone());
    host.start().await.unwrap();
    let grant = host.create_grant(input(&["notes:read"])).unwrap();
    let cred = credential(&temp, &grant);
    let mut stream = UnixStream::connect(cred["socketPath"].as_str().unwrap())
        .await
        .unwrap();
    let mut bytes = serde_json::to_vec(&request(&cred, "notes_read", json!({}))).unwrap();
    bytes.push(b'\n');
    stream.write_all(&bytes).await.unwrap();
    entered(&probe, 1).await;
    for _ in 0..20 {
        tokio::task::yield_now().await;
    }
    host.revoke_grant(&grant.grant.grant_id).unwrap();
    let mut output = Vec::new();
    tokio::time::timeout(Duration::from_secs(2), stream.read_to_end(&mut output))
        .await
        .unwrap()
        .unwrap();
    // Bytes buffered before revocation are already delivered and cannot be recalled.
    if output.last() == Some(&b'\n') {
        let r: HostResponse = serde_json::from_slice(&output).unwrap();
        assert_eq!(code(&r), "UNAUTHORIZED");
    } else {
        assert!(output.len() < 1024 * 1024);
    }
    host.stop().await.unwrap();
}
#[tokio::test]
async fn connection_budget_is_bounded_before_request_frames_arrive() {
    let temp = Temp::new();
    let mut host = open(&temp, Arc::new(ProbeHandler::default()));
    host.start().await.unwrap();
    let grant = host.create_grant(input(&["notes:read"])).unwrap();
    let cred = credential(&temp, &grant);
    let mut streams = Vec::new();
    for _ in 0..64 {
        streams.push(
            UnixStream::connect(cred["socketPath"].as_str().unwrap())
                .await
                .unwrap(),
        );
    }
    let mut excess = UnixStream::connect(cred["socketPath"].as_str().unwrap())
        .await
        .unwrap();
    let mut byte = [0u8; 1];
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(2), excess.read(&mut byte))
            .await
            .unwrap()
            .unwrap(),
        0
    );
    drop(streams);
    host.stop().await.unwrap();
}
