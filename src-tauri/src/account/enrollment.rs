//! Authorization comes exclusively from the CyberBus authenticated account and
//! peer profile. There is no coordinator JWT or trust in a TCP source address.
use super::{
    private::Binding,
    types::{Error, Result},
};
use crate::sync::{
    identity::{IdentityStore, SyncError},
    network::ReplicationPolicy,
};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

/// Domain + length-prefixed UTF-8 issuer, subject and product. UUID version 8
/// identifies the application SHA-256 derivation; client and installation IDs
/// intentionally do not participate. Input is an SDK-verified AccountSummary.
pub(super) fn workspace(issuer: &str, subject: &str, product: &str) -> Result<String> {
    if [issuer, subject, product]
        .iter()
        .any(|s| s.is_empty() || s.len() > 4096 || s.chars().any(char::is_control))
    {
        return Err(Error::OwnershipMismatch);
    }
    let mut hash = Sha256::new();
    hash.update(b"cybernote/cyberbus/workspace/v1\0");
    for field in [issuer, subject, product] {
        hash.update((field.len() as u32).to_be_bytes());
        hash.update(field.as_bytes());
    }
    let digest = hash.finalize();
    let mut bytes = [0; 16];
    bytes.copy_from_slice(&digest[..16]);
    bytes[6] = (bytes[6] & 0x0f) | 0x80;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Ok(uuid::Uuid::from_bytes(bytes).to_string())
}

/// Native-only capability constructed after matching the verified SDK owner.
pub(crate) struct VerifiedWorkspace {
    workspace: String,
    device: String,
    noise_key: String,
}
impl VerifiedWorkspace {
    pub(super) fn from_binding(binding: &Binding) -> Result<Self> {
        if workspace(&binding.issuer, &binding.subject, &binding.product_id)?
            != binding.workspace_id
        {
            return Err(Error::OwnershipMismatch);
        }
        Ok(Self {
            workspace: binding.workspace_id.clone(),
            device: binding.device_id.clone(),
            noise_key: binding.noise_public_key.clone(),
        })
    }
    pub(crate) fn workspace(&self) -> &str {
        &self.workspace
    }
    pub(crate) fn matches(&self, identity: &IdentityStore) -> bool {
        identity.device_id().is_ok_and(|id| id == self.device)
            && identity.public_key().is_ok_and(|key| key == self.noise_key)
    }
}
type PeerLease = Arc<dyn Fn(&[u8; 32], &str, &str) -> bool + Send + Sync>;
#[derive(Default)]
struct State {
    closed: bool,
    lifecycle: Option<Arc<dyn Fn() -> bool + Send + Sync>>,
    peer_lease: Option<PeerLease>,
    peers: HashMap<String, ([u8; 32], String)>,
    routes: HashMap<String, String>,
}
#[derive(Default)]
pub(crate) struct Gate(Mutex<State>);
impl Gate {
    pub fn bind_lifecycle(&self, active: Arc<dyn Fn() -> bool + Send + Sync>) {
        if let Ok(mut s) = self.0.lock() {
            s.lifecycle = Some(active);
        }
    }
    pub(crate) fn bind_peers(&self, active: PeerLease) {
        if let Ok(mut s) = self.0.lock() {
            s.peer_lease = Some(active);
        }
    }
    pub(crate) fn is_current(&self) -> bool {
        self.0
            .lock()
            .is_ok_and(|s| !s.closed && s.lifecycle.as_ref().is_some_and(|f| f()))
    }
    pub(crate) fn admit(&self, peer: [u8; 32], device: &str, key: &str) -> Result<()> {
        let mut s = self.0.lock().map_err(|_| Error::Storage)?;
        if s.closed
            || !s.lifecycle.as_ref().is_some_and(|f| f())
            || !s.peer_lease.as_ref().is_some_and(|f| f(&peer, device, key))
        {
            return Err(Error::InvalidProof);
        }
        if s.peers
            .get(device)
            .is_some_and(|(id, k)| id != &peer || k != key)
        {
            return Err(Error::InvalidProof);
        }
        s.peers.insert(device.into(), (peer, key.into()));
        Ok(())
    }
    pub fn route(&self, device: &str, endpoint: String) {
        if let Ok(mut s) = self.0.lock() {
            if !s.closed && s.peers.contains_key(device) {
                s.routes.insert(device.into(), endpoint);
            }
        }
    }
    pub fn close(&self) {
        if let Ok(mut s) = self.0.lock() {
            s.closed = true;
            s.peers.clear();
            s.routes.clear();
        }
    }
    #[cfg(test)]
    fn fixture() -> Self {
        let gate = Self::default();
        gate.bind_lifecycle(Arc::new(|| true));
        gate.bind_peers(Arc::new(|_, _, _| true));
        gate
    }
}
impl ReplicationPolicy for Gate {
    fn authorize(&self, device: &str, key: &str) -> crate::sync::identity::Result<()> {
        let s = self.0.lock().map_err(|_| SyncError::Revoked)?;
        if s.closed || !s.lifecycle.as_ref().is_some_and(|f| f()) {
            return Err(SyncError::Revoked);
        }
        let (peer, pinned) = s.peers.get(device).ok_or(SyncError::Revoked)?;
        if pinned != key || !s.peer_lease.as_ref().is_some_and(|f| f(peer, device, key)) {
            return Err(SyncError::Revoked);
        }
        Ok(())
    }
    fn endpoint(&self, device: &str) -> crate::sync::identity::Result<String> {
        let (key, endpoint) = {
            let s = self.0.lock().map_err(|_| SyncError::Revoked)?;
            (
                s.peers.get(device).ok_or(SyncError::Revoked)?.1.clone(),
                s.routes.get(device).cloned().ok_or(SyncError::Transport)?,
            )
        };
        self.authorize(device, &key)?;
        Ok(endpoint)
    }
}
#[cfg(test)]
mod tests {
    use super::super::config;
    use super::*;
    #[test]
    fn workspace_is_domain_separated_and_unambiguous() {
        let base = workspace("https://issuer.test/oidc", "user", "notes").unwrap();
        assert_eq!(
            base,
            workspace("https://issuer.test/oidc", "user", "notes").unwrap()
        );
        for args in [
            ("https://other.test/oidc", "user", "notes"),
            ("https://issuer.test/oidc", "other", "notes"),
            ("https://issuer.test/oidc", "user", "other"),
            ("ab", "c", "d"),
            ("a", "bc", "d"),
        ] {
            assert_ne!(base, workspace(args.0, args.1, args.2).unwrap());
        }
        assert_ne!(
            workspace("ab", "c", "d").unwrap(),
            workspace("a", "bc", "d").unwrap()
        );
        assert!(workspace("", "user", "notes").is_err());
    }
    #[test]
    fn default_closed_and_profile_replacement_revokes_key_and_route() {
        use std::sync::atomic::{AtomicBool, Ordering};
        let live = Arc::new(AtomicBool::new(true));
        let gate = Gate::default();
        assert!(!gate.is_current());
        let current = live.clone();
        gate.bind_lifecycle(Arc::new(move || current.load(Ordering::Acquire)));
        gate.bind_peers(Arc::new(|id, device, key| {
            *id == [7; 32] && device == "device" && key == "key"
        }));
        assert!(gate.admit([8; 32], "device", "key").is_err());
        gate.admit([7; 32], "device", "key").unwrap();
        gate.route("device", "ws://127.0.0.1:1234/".into());
        assert!(gate.authorize("device", "key").is_ok());
        gate.bind_peers(Arc::new(|_, _, _| false));
        assert!(gate.authorize("device", "key").is_err());
        assert!(gate.endpoint("device").is_err());
        live.store(false, Ordering::Release);
        assert!(!gate.is_current());
        gate.close();
        assert!(gate.authorize("device", "key").is_err());
    }
    struct Windows;
    impl crate::sync::adapter::WindowHost for Windows {
        fn participants(&self) -> std::collections::HashSet<String> {
            std::collections::HashSet::new()
        }
        fn emit(&self, _: &str, _: &serde_json::Value) -> crate::store::Result<()> {
            Ok(())
        }
    }
    // Device-free renderer fixture exercising the real Session reply boundary.
    // Production renderers must supply these ACKs themselves.
    struct AdoptionWindows {
        shared: crate::sync::adapter::SharedSession,
        blocked: bool,
    }
    impl crate::sync::adapter::WindowHost for AdoptionWindows {
        fn participants(&self) -> std::collections::HashSet<String> {
            std::collections::HashSet::from(["main".into()])
        }
        fn emit(&self, name: &str, value: &serde_json::Value) -> crate::store::Result<()> {
            use crate::session::synchronization::WindowReply;
            if name != "notes-sync" {
                return Ok(());
            }
            let operation = value["operationId"].as_str().unwrap().to_string();
            let reply = match value["phase"].as_str() {
                Some("probe") => WindowReply::Probe {
                    operation_id: operation,
                    protected_note_ids: vec![],
                    blocked: self.blocked,
                },
                Some("prepare") => WindowReply::Prepare {
                    operation_id: operation,
                    ready: true,
                },
                _ => return Ok(()),
            };
            let mut s = self.shared.0.lock().unwrap();
            let token = s.sync_media_token();
            s.sync_reply("main", reply, &token)?;
            Ok(())
        }
    }
    #[test]
    fn fresh_account_status_metrics_do_not_require_or_enable_sync() {
        use crate::{session::Session, store::Store, sync::adapter::Runtime};
        use std::sync::{Arc, Condvar, Mutex};
        let directory = tempfile::tempdir().unwrap();
        let mut store = Store::open(directory.path()).unwrap();
        store
            .action(serde_json::json!({"type":"createNote"}))
            .unwrap();
        let shared = Arc::new((Mutex::new(Session::new(store)), Condvar::new()));
        let before = shared.0.lock().unwrap().workspace().unwrap();
        let runtime =
            Runtime::new(shared.clone(), directory.path().into(), Arc::new(Windows)).unwrap();
        assert_eq!(runtime.account_metrics().unwrap(), (0, 0));
        assert_eq!(runtime.account_metrics().unwrap(), (0, 0));
        assert!(shared
            .0
            .lock()
            .unwrap()
            .store
            .sync_identity()
            .unwrap()
            .is_none());
        assert_eq!(
            shared.0.lock().unwrap().workspace().unwrap()["notes"],
            before["notes"]
        );
        assert!(!directory.path().join(".account/noise").exists());
        assert!(!directory.path().join(".sync/identity-v1.json").exists());
        runtime.shutdown().unwrap();
    }
    #[test]
    fn account_foreground_does_not_construct_manual_identity_or_policy_free_service() {
        use crate::{session::Session, store::Store, sync::adapter::Runtime};
        use std::sync::{Arc, Condvar, Mutex};
        let dir = tempfile::tempdir().unwrap();
        super::super::private::directory(&dir.path().join(".account")).unwrap();
        let shared = Arc::new((
            Mutex::new(Session::new(Store::open(dir.path()).unwrap())),
            Condvar::new(),
        ));
        let runtime = Runtime::new(
            shared.clone(),
            dir.path().into(),
            Arc::new(AdoptionWindows {
                shared: shared.clone(),
                blocked: false,
            }),
        )
        .unwrap();
        let identity = runtime.account_identity().unwrap();
        let device = identity.device_id().unwrap();
        let key = identity.public_key().unwrap();
        let verified = VerifiedWorkspace {
            workspace: uuid::Uuid::new_v4().to_string(),
            device: device.clone(),
            noise_key: key.clone(),
        };
        super::super::private::write(
            &dir.path().join(".account/binding.json"),
            &Binding {
                issuer: config::ISSUER.into(),
                subject: "synthetic-owner".into(),
                product_id: "cybernote".into(),
                workspace_id: verified.workspace.clone(),
                device_id: device.clone(),
                noise_public_key: key.clone(),
                enabled: true,
            },
        )
        .unwrap();
        let mut service = runtime
            .activate_account(&verified, identity, Arc::new(Gate::fixture()))
            .unwrap();
        let manual_identity = || {
            crate::sync::identity::IdentityStore::existing_device_id(&dir.path().join(".sync"))
                .unwrap()
        };
        // Store owns shared .sync/blob directories independently of a manual
        // Noise service. Check the actual identity, not directory existence.
        assert_eq!(manual_identity(), None);
        runtime.foreground();
        assert_eq!(
            manual_identity(),
            None,
            "account foreground created a manual Noise identity"
        );
        runtime.pause_account();
        runtime.foreground();
        assert_eq!(manual_identity(), None);
        // Logout/pause preserves the account binding. An explicit manual start
        // cannot open a policy-free service over the account credentials.
        let token = serde_json::from_value(serde_json::json!({
            "sessionId": shared.0.lock().unwrap().sync_session_id(), "epoch": 1
        }))
        .unwrap();
        let denied = runtime
            .command(
                crate::sync::adapter::Command::StartHost {
                    device_name: "Synthetic manual".into(),
                    port: 0,
                },
                "main",
                &token,
            )
            .unwrap_err();
        assert_eq!(denied.code, "sync_workspace_mismatch");
        assert_eq!(manual_identity(), None);
        let restored = runtime.account_identity().unwrap();
        assert_eq!(restored.device_id().unwrap(), device);
        assert_eq!(restored.public_key().unwrap(), key);
        service.shutdown().unwrap();
        runtime.shutdown().unwrap();
    }
    #[test]
    fn aborted_local_recovery_blocks_adoption_until_release_or_real_session_reopen() {
        use crate::{session::Session, store::Store};
        use std::collections::HashSet;
        for recovery in ["release", "reopen"] {
            let dir = tempfile::tempdir().unwrap();
            let mut store = Store::open(dir.path()).unwrap();
            store
                .action(serde_json::json!({"type":"createNote"}))
                .unwrap();
            let identity = store.sync_enable(None).unwrap();
            store.sync_flush().unwrap();
            let mut session = Session::new(store);
            let before = session.workspace().unwrap();
            let next_workspace = uuid::Uuid::new_v4().to_string();
            let next_device = uuid::Uuid::new_v4().to_string();
            let live = HashSet::from(["main".into()]);
            let operation = session.sync_begin_local_recovery(live.clone()).unwrap();
            // This is the real pause_account transition, without a coordinator
            // racing to tick/release it before we can observe the finite state.
            session.sync_abort();
            assert!(session.pending.is_none());
            assert!(session.sync_has_operation());
            assert_eq!(session.sync_diagnostics()["activePhase"], "probe");
            let denied = session
                .sync_adoption_preflight(&next_workspace, &next_device)
                .unwrap_err();
            assert_eq!(denied.code, "sync_adoption_blocked");
            assert_eq!(
                denied.message,
                "本机仍有未完成的保存或同步屏障，请先完成后再开启新账户同步"
            );
            session
                .sync_adoption_preflight(&identity.workspace_id, &identity.device_id)
                .unwrap();
            eprintln!("restart fixture: path={recovery} before_retirement pending=false quiet=true phase=probe different_workspace=blocked same_workspace=allowed");
            if recovery == "release" {
                // Exercise the actual coordinator release protocol, not a
                // fixture-only clearing of quiet/pending/intent structures.
                let (release, access) = session.sync_tick(&live).unwrap().unwrap();
                assert_eq!(release["phase"], "release");
                assert_eq!(release["outcome"], "abort");
                assert_eq!(release["operationId"], operation["operationId"]);
                assert!(access.is_none());
                assert_eq!(
                    session.sync_diagnostics()["latestAbortReason"],
                    "externalAbort"
                );
            } else {
                drop(session); // closes the real Store/SQLite connection too
                session = Session::new(Store::open(dir.path()).unwrap());
            }
            assert!(session.pending.is_none());
            assert!(!session.sync_has_operation());
            assert!(session.sync_diagnostics()["activePhase"].is_null());
            session
                .sync_adoption_preflight(&next_workspace, &next_device)
                .unwrap();
            assert_eq!(session.store.sync_identity().unwrap().unwrap(), identity);
            assert_eq!(session.workspace().unwrap()["notes"], before["notes"]);
            eprintln!("restart fixture: path={recovery} after_retirement pending=false quiet=false phase=none different_workspace=allowed identity_preserved=true notes_preserved=true");
        }
    }
    #[test]
    fn real_store_activation_preserves_documents_and_restart_identity_and_allows_explicit_adoption()
    {
        use crate::{session::Session, store::Store, sync::adapter::Runtime};
        use std::sync::{Arc, Condvar, Mutex};
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(dir.path()).unwrap();
        store
            .action(serde_json::json!({"type":"createNote"}))
            .unwrap();
        let shared = Arc::new((Mutex::new(Session::new(store)), Condvar::new()));
        let original = shared.0.lock().unwrap().workspace().unwrap();
        let runtime = Runtime::new(
            shared.clone(),
            dir.path().into(),
            Arc::new(AdoptionWindows {
                shared: shared.clone(),
                blocked: false,
            }),
        )
        .unwrap();
        let noise = runtime.account_identity().unwrap();
        let device = noise.device_id().unwrap();
        let key = noise.public_key().unwrap();
        let workspace = uuid::Uuid::new_v4().to_string();
        runtime
            .account_adoption_preflight(&workspace, &device)
            .unwrap();
        let verified = VerifiedWorkspace {
            workspace: workspace.clone(),
            device: device.clone(),
            noise_key: key.clone(),
        };
        let mut service = runtime
            .activate_account(&verified, noise, Arc::new(Gate::fixture()))
            .unwrap();
        assert_eq!(
            shared.0.lock().unwrap().workspace().unwrap()["notes"],
            original["notes"]
        );
        runtime.pause_account();
        service.shutdown().unwrap();
        runtime.shutdown().unwrap();
        drop(service);
        drop(runtime);
        {
            let session = shared.0.lock().unwrap();
            // Shutdown joins the coordinator; it need not consume the last
            // aborted quiet operation before process exit. Observe it, without
            // assuming which side of that scheduling race won this time.
            eprintln!(
                "restart fixture: stopped_session pending={} quiet={} phase={}",
                session.pending.is_some(),
                session.sync_has_operation(),
                session.sync_diagnostics()["activePhase"]
            );
        }
        // Simulate an actual process restart: every Arc owner is gone, so the
        // old Session and its Store connection close. Reusing it here raced
        // the new coordinator against an aborted local-recovery quiet barrier.
        assert_eq!(Arc::strong_count(&shared), 1);
        drop(shared);
        let shared = Arc::new((
            Mutex::new(Session::new(Store::open(dir.path()).unwrap())),
            Condvar::new(),
        ));
        {
            let session = shared.0.lock().unwrap();
            assert!(session.pending.is_none());
            assert!(!session.sync_has_operation());
            assert!(session.sync_diagnostics()["activePhase"].is_null());
        }
        let runtime = Runtime::new(
            shared.clone(),
            dir.path().into(),
            Arc::new(AdoptionWindows {
                shared: shared.clone(),
                blocked: false,
            }),
        )
        .unwrap();
        let noise = runtime.account_identity().unwrap();
        assert_eq!(noise.device_id().unwrap(), device);
        assert_eq!(noise.public_key().unwrap(), key);
        runtime
            .account_adoption_preflight(&workspace, &device)
            .unwrap();
        assert!(!runtime
            .account_adoption_needed(&workspace, &device)
            .unwrap());
        let other_workspace = uuid::Uuid::new_v4().to_string();
        let other_device = uuid::Uuid::new_v4().to_string();
        assert!(runtime
            .account_adoption_needed(&other_workspace, &other_device)
            .unwrap());
        runtime
            .account_adoption_preflight(&other_workspace, &other_device)
            .unwrap();
        let identity = shared
            .0
            .lock()
            .unwrap()
            .store
            .sync_identity()
            .unwrap()
            .unwrap();
        assert_eq!(identity.workspace_id, workspace);
        assert_eq!(identity.device_id, device);
        assert_eq!(
            shared.0.lock().unwrap().workspace().unwrap()["notes"],
            original["notes"]
        );
        runtime.shutdown().unwrap();
    }
    #[test]
    fn workspace_adoption_native_handshake_preserves_manual_content_and_blocks_unready_window() {
        use crate::{session::Session, store::Store, sync::adapter::Runtime};
        use std::sync::{Arc, Condvar, Mutex};
        for blocked in [true, false] {
            let dir = tempfile::tempdir().unwrap();
            let mut store = Store::open(dir.path()).unwrap();
            store
                .action(serde_json::json!({"type":"createNote"}))
                .unwrap();
            let original_identity = store.sync_enable(None).unwrap();
            let shared = Arc::new((Mutex::new(Session::new(store)), Condvar::new()));
            let before = shared.0.lock().unwrap().workspace().unwrap();
            let runtime = Runtime::new(
                shared.clone(),
                dir.path().into(),
                Arc::new(AdoptionWindows {
                    shared: shared.clone(),
                    blocked,
                }),
            )
            .unwrap();
            runtime.pause_for_account().unwrap();
            let identity = runtime
                .account_identity_for(&uuid::Uuid::new_v4().to_string())
                .unwrap();
            let target = VerifiedWorkspace {
                workspace: uuid::Uuid::new_v4().to_string(),
                device: identity.device_id().unwrap(),
                noise_key: identity.public_key().unwrap(),
            };
            let private_root = dir.path().join(".account");
            super::super::private::begin_adoption(&private_root).unwrap();
            let result = runtime.activate_account(&target, identity, Arc::new(Gate::fixture()));
            if blocked {
                assert!(result.is_err());
                assert_eq!(
                    shared
                        .0
                        .lock()
                        .unwrap()
                        .store
                        .sync_identity()
                        .unwrap()
                        .unwrap()
                        .workspace_id,
                    original_identity.workspace_id
                );
                assert!(super::super::private::adoption_pending(&private_root).unwrap());
            } else {
                let mut service = result.unwrap();
                assert_eq!(
                    shared
                        .0
                        .lock()
                        .unwrap()
                        .store
                        .sync_identity()
                        .unwrap()
                        .unwrap()
                        .workspace_id,
                    target.workspace
                );
                assert!(!super::super::private::adoption_pending(&private_root).unwrap());
                service.shutdown().unwrap();
            }
            assert_eq!(
                shared.0.lock().unwrap().workspace().unwrap()["notes"],
                before["notes"]
            );
            runtime.shutdown().unwrap();
        }
    }
    #[test]
    fn workspace_adoption_partial_release_retries_keep_editor_authority_and_terminal_receipt() {
        use crate::{
            session::{synchronization::WindowReply, Session, Token},
            store::Store,
            sync::adapter::{Runtime, SharedSession, WindowHost},
        };
        use std::{
            collections::HashSet,
            sync::{Arc, Condvar, Mutex},
        };
        struct PartialWindows {
            shared: SharedSession,
            failures: Mutex<u8>,
            deliveries: Mutex<Vec<(String, String, serde_json::Value)>>,
        }
        impl WindowHost for PartialWindows {
            fn participants(&self) -> HashSet<String> {
                HashSet::from(["main".into(), "note-second".into()])
            }
            fn emit(&self, name: &str, value: &serde_json::Value) -> crate::store::Result<()> {
                for window in ["main", "note-second"] {
                    if name == "notes-sync"
                        && value["phase"] == "release"
                        && window == "note-second"
                    {
                        let mut remaining = self.failures.lock().unwrap();
                        if *remaining > 0 {
                            *remaining -= 1;
                            return Err(crate::store::AppError {
                                code: "fixture_emit_failed".into(),
                                message: "synthetic partial delivery".into(),
                                commit: None,
                            });
                        }
                    }
                    self.deliveries.lock().unwrap().push((
                        window.into(),
                        name.into(),
                        value.clone(),
                    ));
                    if name == "notes-sync" {
                        let operation = value["operationId"].as_str().unwrap().to_string();
                        let reply = match value["phase"].as_str() {
                            Some("probe") => WindowReply::Probe {
                                operation_id: operation,
                                protected_note_ids: vec![],
                                blocked: false,
                            },
                            Some("prepare") => WindowReply::Prepare {
                                operation_id: operation,
                                ready: true,
                            },
                            _ => continue,
                        };
                        let mut s = self.shared.0.lock().unwrap();
                        let token = s.sync_media_token();
                        s.sync_reply(window, reply, &token)?;
                    }
                }
                Ok(())
            }
        }
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(dir.path()).unwrap();
        let note = store
            .action(serde_json::json!({"type":"createNote"}))
            .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        store.sync_enable(None).unwrap();
        let shared = Arc::new((Mutex::new(Session::new(store)), Condvar::new()));
        let old_token = shared.0.lock().unwrap().sync_media_token();
        let host = Arc::new(PartialWindows {
            shared: shared.clone(),
            failures: Mutex::new(2),
            deliveries: Mutex::new(vec![]),
        });
        let runtime = Runtime::new(shared.clone(), dir.path().into(), host.clone()).unwrap();
        runtime.pause_for_account().unwrap();
        let identity = runtime
            .account_identity_for(&uuid::Uuid::new_v4().to_string())
            .unwrap();
        let target = VerifiedWorkspace {
            workspace: uuid::Uuid::new_v4().to_string(),
            device: identity.device_id().unwrap(),
            noise_key: identity.public_key().unwrap(),
        };
        let private_root = dir.path().join(".account");
        super::super::private::begin_adoption(&private_root).unwrap();
        assert!(runtime
            .activate_account(&target, identity.clone(), Arc::new(Gate::fixture()))
            .is_err());
        let instance = shared.0.lock().unwrap().store.sync_store_instance();
        let release = host
            .deliveries
            .lock()
            .unwrap()
            .iter()
            .find(|(_, name, value)| name == "notes-sync" && value["phase"] == "release")
            .unwrap()
            .2
            .clone();
        assert_eq!(release["sessionId"], old_token.session_id);
        assert_eq!(release["outcome"], "commit");
        assert!(super::super::private::adoption_pending(&private_root).unwrap());
        {
            let mut s = shared.0.lock().unwrap();
            // A missed release can query the real terminal with its original
            // Session token; it is not stranded behind a rotated authority.
            assert_eq!(
                s.sync_reply(
                    "note-second",
                    WindowReply::Prepare {
                        operation_id: release["operationId"].as_str().unwrap().into(),
                        ready: true
                    },
                    &old_token
                )
                .unwrap()["outcome"],
                "commit"
            );
            let revision = s.store.note(&note).unwrap().revision;
            let token = Token {
                note_epoch: Some(0),
                ..old_token.clone()
            };
            s.register_save("main", &note, "post-partial-draft", token)
                .unwrap();
            s.save("main", serde_json::json!({"type":"saveNote", "id":note, "saveIntent":"post-partial-draft", "revision":revision,
                "document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"draft after partial release"}]}]}})).unwrap();
        }
        assert!(runtime
            .activate_account(&target, identity.clone(), Arc::new(Gate::fixture()))
            .is_err());
        assert!(super::super::private::adoption_pending(&private_root).unwrap());
        assert_eq!(
            shared.0.lock().unwrap().store.sync_store_instance(),
            instance
        );
        let mut service = runtime
            .activate_account(&target, identity, Arc::new(Gate::fixture()))
            .unwrap();
        assert!(!super::super::private::adoption_pending(&private_root).unwrap());
        {
            let s = shared.0.lock().unwrap();
            assert_eq!(s.store.sync_store_instance(), instance);
            s.check(&old_token, None).unwrap();
            assert_eq!(
                s.store.note(&note).unwrap().plain_text,
                "draft after partial release"
            );
        }
        let deliveries = host.deliveries.lock().unwrap();
        assert!(deliveries.iter().all(|(_, name, _)| name != "notes-access"));
        let releases: Vec<_> = deliveries
            .iter()
            .filter(|(_, name, value)| name == "notes-sync" && value["phase"] == "release")
            .collect();
        assert_eq!(
            releases
                .iter()
                .filter(|(window, _, _)| window == "main")
                .count(),
            3
        );
        assert_eq!(
            releases
                .iter()
                .filter(|(window, _, _)| window == "note-second")
                .count(),
            1
        );
        assert!(releases.iter().all(|(_, _, value)| value == &release));
        drop(deliveries);
        service.shutdown().unwrap();
        runtime.shutdown().unwrap();
    }
    #[test]
    fn closed_or_stale_account_gate_cannot_adopt_a_local_library() {
        use crate::{session::Session, store::Store, sync::adapter::Runtime};
        use std::sync::{Arc, Condvar, Mutex};
        for closed in [false, true] {
            let dir = tempfile::tempdir().unwrap();
            let shared = Arc::new((
                Mutex::new(Session::new(Store::open(dir.path()).unwrap())),
                Condvar::new(),
            ));
            let runtime =
                Runtime::new(shared.clone(), dir.path().into(), Arc::new(Windows)).unwrap();
            let identity = runtime
                .account_identity_for(&uuid::Uuid::new_v4().to_string())
                .unwrap();
            let verified = VerifiedWorkspace {
                workspace: uuid::Uuid::new_v4().to_string(),
                device: identity.device_id().unwrap(),
                noise_key: identity.public_key().unwrap(),
            };
            let gate = Arc::new(Gate::fixture());
            if closed {
                gate.close();
            } else {
                gate.bind_lifecycle(Arc::new(|| false));
            }
            assert!(runtime.activate_account(&verified, identity, gate).is_err());
            assert!(shared
                .0
                .lock()
                .unwrap()
                .store
                .sync_identity()
                .unwrap()
                .is_none());
            runtime.shutdown().unwrap();
        }
    }
}
