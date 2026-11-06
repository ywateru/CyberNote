use notes_sync_network_tests::{
    fixture::Fixture,
    identity::{IdentityStore, PairingInvite, SyncError},
    network::{SyncBackend, SyncService},
};
use std::{
    net::TcpStream,
    sync::{atomic::Ordering, Arc},
    time::{Duration, Instant},
};
use uuid::Uuid;
struct Node {
    dir: tempfile::TempDir,
    backend: Arc<Fixture>,
    identity: Arc<IdentityStore>,
    service: SyncService,
}
impl Node {
    fn new(workspace: &str) -> Self {
        let dir = tempfile::tempdir().unwrap();
        let backend = Arc::new(Fixture::open(dir.path(), workspace).unwrap());
        let identity = Arc::new(
            IdentityStore::open(&dir.path().join(".sync"), &backend.device_id().unwrap()).unwrap(),
        );
        let service = SyncService::new(
            backend.clone(),
            identity.clone(),
            dir.path().join(".sync/staging"),
        )
        .unwrap();
        Self {
            dir,
            backend,
            identity,
            service,
        }
    }
    fn host(&self) -> (std::net::SocketAddr, String) {
        let addr = self
            .service
            .start_listener("127.0.0.1:0".parse().unwrap())
            .unwrap();
        let token = self.service.invitation(&format!("ws://{addr}/")).unwrap();
        (addr, token)
    }
    fn wait(&self, count: usize) {
        let until = Instant::now() + Duration::from_secs(20);
        while self.backend.digests().unwrap().len() != count {
            assert!(
                Instant::now() < until,
                "count={:?}; status={:?}",
                self.backend.digests().unwrap().len(),
                self.service.status().unwrap()
            );
            std::thread::sleep(Duration::from_millis(25));
        }
    }
}
#[test]
fn pagination_and_large_head_blob_are_bidirectional_and_idempotent() {
    let workspace = Uuid::new_v4().to_string();
    let a = Node::new(&workspace);
    let b = Node::new(&workspace);
    for i in 0..131 {
        a.backend.insert(&format!("paged note {i}"), None).unwrap();
    }
    let media: Vec<_> = (0..300_123).map(|n| (n % 251) as u8).collect();
    let large = "中文大段正文".repeat(30_000);
    let id = b.backend.insert(&large, Some(&media)).unwrap();
    let (_, token) = a.host();
    let peer = b.service.pair(&token).unwrap();
    a.wait(132);
    b.wait(132);
    assert_eq!(
        a.backend.version(&id).unwrap(),
        b.backend.version(&id).unwrap()
    );
    for _ in 0..5 {
        b.service.sync_now().unwrap();
        std::thread::sleep(Duration::from_millis(20));
    }
    assert_eq!(a.backend.digests().unwrap(), b.backend.digests().unwrap());
    assert_eq!(a.backend.digests().unwrap().len(), 132);
    b.service.disconnect(&peer.peer_id).unwrap();
}
#[test]
fn wrong_psk_host_key_workspace_duplicate_redeem_and_unknown_fields_fail_closed() {
    let ws = Uuid::new_v4().to_string();
    let a = Node::new(&ws);
    let b = Node::new(&ws);
    let (_, token) = a.host();
    let invite = PairingInvite::decode(&token).unwrap();
    let mut wrong = invite.clone();
    wrong.psk =
        base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, [9u8; 32]);
    assert!(b.service.pair(&wrong.token().unwrap()).is_err());
    assert!(b.identity.peer_ids().unwrap().is_empty());
    let mut wrong = invite.clone();
    wrong.host_key = b.identity.public_key().unwrap();
    assert!(b.service.pair(&wrong.token().unwrap()).is_err());
    let mut wrong = invite.clone();
    wrong.workspace_id = Uuid::new_v4().to_string();
    assert!(b.service.pair(&wrong.token().unwrap()).is_err());
    let p = b.service.pair(&token).unwrap();
    let c = Node::new(&ws);
    assert!(c.service.pair(&token).is_err());
    assert!(c.identity.peer_ids().unwrap().is_empty());
    b.service.disconnect(&p.peer_id).unwrap();
    assert_eq!(a.backend.digests().unwrap().len(), 0);
    let raw = base64::Engine::decode(
        &base64::engine::general_purpose::URL_SAFE_NO_PAD,
        token.strip_prefix("notes-sync-v1:").unwrap(),
    )
    .unwrap();
    let mut v: serde_json::Value = serde_json::from_slice(&raw).unwrap();
    v["path"] = serde_json::json!("/etc/passwd");
    let invalid = format!(
        "notes-sync-v1:{}",
        base64::Engine::encode(
            &base64::engine::general_purpose::URL_SAFE_NO_PAD,
            serde_json::to_vec(&v).unwrap()
        )
    );
    assert!(PairingInvite::decode(&invalid).is_err());
}
#[test]
fn provisional_pairing_survives_adoption_failure_and_restart() {
    let ws = Uuid::new_v4().to_string();
    let a = Node::new(&ws);
    let mut b = Node::new(&Uuid::new_v4().to_string());
    a.backend.insert("never before adoption", None).unwrap();
    let (_, token) = a.host();
    b.backend.fail_adopt.store(true, Ordering::SeqCst);
    assert_eq!(b.service.pair(&token).unwrap_err(), SyncError::Backend);
    let pending = b.service.pending_pairings().unwrap();
    assert_eq!(pending.len(), 1);
    assert!(!pending[0].ready);
    assert!(b.backend.digests().unwrap().is_empty());
    b.service.shutdown().unwrap();
    let identity = Arc::new(
        IdentityStore::open(&b.dir.path().join(".sync"), &b.backend.device_id().unwrap()).unwrap(),
    );
    let mut service = SyncService::new(
        b.backend.clone(),
        identity,
        b.dir.path().join(".sync/staging"),
    )
    .unwrap();
    assert_eq!(service.pending_pairings().unwrap().len(), 1);
    b.backend.fail_adopt.store(false, Ordering::SeqCst);
    let recovered = service.recover_pairing(&pending[0].peer_id).unwrap();
    assert!(recovered.ready);
    service.connect(&recovered.peer_id).unwrap();
    let until = Instant::now() + Duration::from_secs(10);
    while b.backend.digests().unwrap().is_empty() {
        assert!(Instant::now() < until);
        std::thread::sleep(Duration::from_millis(25));
    }
    service.shutdown().unwrap();
}
#[test]
fn revoked_live_connection_cannot_read_or_write_more_data() {
    let ws = Uuid::new_v4().to_string();
    let a = Node::new(&ws);
    let b = Node::new(&ws);
    let (_, token) = a.host();
    let p = b.service.pair(&token).unwrap();
    a.backend.insert("before revoke", None).unwrap();
    b.wait(1);
    a.service.revoke(&p.peer_id).unwrap();
    std::thread::sleep(Duration::from_millis(250));
    a.backend.insert("after revoke A", None).unwrap();
    b.backend.insert("after revoke B", None).unwrap();
    b.service.sync_now().unwrap();
    std::thread::sleep(Duration::from_secs(3));
    assert_eq!(a.backend.digests().unwrap().len(), 2);
    assert_eq!(b.backend.digests().unwrap().len(), 2);
    assert_ne!(a.backend.digests().unwrap(), b.backend.digests().unwrap());
}
#[test]
fn stop_releases_socket_short_unauthenticated_connections_and_restart() {
    let ws = Uuid::new_v4().to_string();
    let mut a = Node::new(&ws);
    let (addr, _) = a.host();
    for _ in 0..20 {
        drop(TcpStream::connect(addr).unwrap());
    }
    let start = Instant::now();
    a.service.stop_listener().unwrap();
    assert!(start.elapsed() < Duration::from_secs(2));
    assert!(TcpStream::connect(addr).is_err());
    let (addr, token) = a.host();
    let b = Node::new(&ws);
    let p = b.service.pair(&token).unwrap();
    b.service.disconnect(&p.peer_id).unwrap();
    a.service.shutdown().unwrap();
    assert!(TcpStream::connect(addr).is_err());
    assert_eq!(
        a.service
            .start_listener("127.0.0.1:0".parse().unwrap())
            .unwrap_err(),
        SyncError::Stopped
    );
}
#[test]
fn credentials_are_private_persistent_and_never_present_in_status() {
    let ws = Uuid::new_v4().to_string();
    let a = Node::new(&ws);
    let b = Node::new(&ws);
    let (_, token) = a.host();
    let invite = PairingInvite::decode(&token).unwrap();
    let p = b.service.pair(&token).unwrap();
    let state = serde_json::to_string(&b.service.status().unwrap()).unwrap();
    assert!(!state.contains(&invite.psk));
    assert!(!state.contains(&invite.host_key));
    let reload =
        IdentityStore::open(&b.dir.path().join(".sync"), &b.backend.device_id().unwrap()).unwrap();
    assert_eq!(
        reload.public_key().unwrap(),
        b.identity.public_key().unwrap()
    );
    assert_eq!(reload.peer_ids().unwrap(), vec![p.peer_id]);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let path = b.dir.path().join(".sync/identity-v1.json");
        assert_eq!(
            std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert!(
            IdentityStore::open(&b.dir.path().join(".sync"), &b.backend.device_id().unwrap())
                .is_err()
        );
    }
}
