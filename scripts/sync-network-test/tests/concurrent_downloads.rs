//! Real sockets force two source hosts to answer offset-zero blob reads together.
use notes_sync_network_tests::{
    fixture::Fixture,
    identity::{IdentityStore, Result, SyncError},
    network::{BlobRef, InventoryPage, Receipt, SyncBackend, SyncService},
};
use serde_json::Value;
use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use uuid::Uuid;
struct Source {
    fixture: Fixture,
    gate: Arc<AtomicUsize>,
    first: AtomicBool,
}
impl SyncBackend for Source {
    fn workspace_id(&self) -> Result<String> {
        self.fixture.workspace_id()
    }
    fn device_id(&self) -> Result<String> {
        self.fixture.device_id()
    }
    fn prepare_pairing(&self, w: &str) -> Result<()> {
        self.fixture.prepare_pairing(w)
    }
    fn adopt_workspace(&self, w: &str) -> Result<()> {
        self.fixture.adopt_workspace(w)
    }
    fn flush(&self) -> Result<()> {
        self.fixture.flush()
    }
    fn inventory(&self, a: Option<&str>, n: usize) -> Result<InventoryPage> {
        self.fixture.inventory(a, n)
    }
    fn version(&self, d: &str) -> Result<Value> {
        self.fixture.version(d)
    }
    fn required_blobs(&self, v: &Value) -> Result<Vec<BlobRef>> {
        self.fixture.required_blobs(v)
    }
    fn has_blob(&self, b: &BlobRef) -> Result<bool> {
        self.fixture.has_blob(b)
    }
    fn read_blob_chunk(&self, b: &BlobRef, o: u64, n: usize) -> Result<Vec<u8>> {
        if o == 0 && !self.first.swap(true, Ordering::SeqCst) {
            self.gate.fetch_add(1, Ordering::SeqCst);
            let until = Instant::now() + Duration::from_secs(5);
            while self.gate.load(Ordering::SeqCst) < 2 {
                if Instant::now() >= until {
                    return Err(SyncError::Timeout);
                }
                std::thread::sleep(Duration::from_millis(1));
            }
        }
        self.fixture.read_blob_chunk(b, o, n)
    }
    fn store_blob(&self, b: &BlobRef, p: &Path) -> Result<()> {
        self.fixture.store_blob(b, p)
    }
    fn receive_head(&self, v: Value) -> Result<Receipt> {
        self.fixture.receive_head(v)
    }
}
fn service(backend: Arc<dyn SyncBackend>, root: &Path) -> SyncService {
    let identity =
        Arc::new(IdentityStore::open(&root.join(".sync"), &backend.device_id().unwrap()).unwrap());
    SyncService::new(backend, identity, root.join(".sync/staging")).unwrap()
}
#[test]
fn concurrent_downloads_reuse_shared_partial_and_completed_blob_without_manual_retry() {
    let workspace = Uuid::new_v4().to_string();
    let destination_dir = tempfile::tempdir().unwrap();
    let b_dir = tempfile::tempdir().unwrap();
    let c_dir = tempfile::tempdir().unwrap();
    let destination = Arc::new(Fixture::open(destination_dir.path(), &workspace).unwrap());
    let gate = Arc::new(AtomicUsize::new(0));
    let b = Arc::new(Source {
        fixture: Fixture::open(b_dir.path(), &workspace).unwrap(),
        gate: gate.clone(),
        first: AtomicBool::new(false),
    });
    let c = Arc::new(Source {
        fixture: Fixture::open(c_dir.path(), &workspace).unwrap(),
        gate: gate.clone(),
        first: AtomicBool::new(false),
    });
    let data: Vec<u8> = (0..(48 * 1024 + 177)).map(|i| (i % 251) as u8).collect();
    b.fixture
        .insert("B source with shared blob", Some(&data))
        .unwrap();
    c.fixture
        .insert("C source with shared blob", Some(&data))
        .unwrap();
    let destination_service = service(destination.clone(), destination_dir.path());
    let b_service = service(b.clone(), b_dir.path());
    let c_service = service(c.clone(), c_dir.path());
    for source in [&b_service, &c_service] {
        let address = source
            .start_listener("127.0.0.1:0".parse().unwrap())
            .unwrap();
        let token = source.invitation(&format!("ws://{address}/")).unwrap();
        destination_service.pair(&token).unwrap();
    }
    let until = Instant::now() + Duration::from_secs(10);
    loop {
        if destination.digests().unwrap().len() == 2
            && b.fixture.digests().unwrap().len() == 2
            && c.fixture.digests().unwrap().len() == 2
        {
            break;
        }
        assert!(
            Instant::now() < until,
            "automatic convergence failed: {:?}",
            destination_service.status().unwrap()
        );
        std::thread::sleep(Duration::from_millis(20));
    }
    assert_eq!(gate.load(Ordering::SeqCst), 2);
    assert_eq!(
        std::fs::read_dir(destination_dir.path().join("blobs"))
            .unwrap()
            .count(),
        1
    );
    assert_eq!(
        std::fs::read_dir(destination_dir.path().join(".sync/staging"))
            .unwrap()
            .count(),
        0
    );
    let ids = destination.digests().unwrap();
    assert_eq!(ids, b.fixture.digests().unwrap());
    assert_eq!(ids, c.fixture.digests().unwrap());
}
