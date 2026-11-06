//! Independent real-socket checks. Opaque Fixture is a network test backend, never production Store.
use notes_sync_network_tests::{
    fixture::Fixture,
    identity::{IdentityStore, Result, SyncError},
    network::{BlobRef, InventoryPage, Receipt, SyncBackend, SyncService},
};
use serde_json::Value;
use std::{
    path::Path,
    sync::{atomic::{AtomicBool, AtomicUsize, Ordering}, Arc},
    time::{Duration, Instant},
};
use uuid::Uuid;

struct Spy {
    inner: Fixture,
    reject: AtomicBool,
    validations: AtomicUsize,
    reads: AtomicUsize,
    writes: AtomicUsize,
    receives: AtomicUsize,
    first_upload: AtomicBool,
    upload_gate: Option<Arc<AtomicUsize>>,
    fail_ready: AtomicBool,
}
impl SyncBackend for Spy {
    fn workspace_id(&self) -> Result<String> { self.inner.workspace_id() }
    fn device_id(&self) -> Result<String> { self.inner.device_id() }
    fn prepare_pairing(&self, w: &str) -> Result<()> { self.inner.prepare_pairing(w) }
    fn adopt_workspace(&self, w: &str) -> Result<()> {
        self.inner.adopt_workspace(w)?;
        if self.fail_ready.swap(false, Ordering::SeqCst) {
            let p = self.inner.root.join(".sync/identity-v1.json");
            std::fs::rename(&p, p.with_extension("prepared-backup")).map_err(|_| SyncError::Io)?;
            std::fs::create_dir(&p).map_err(|_| SyncError::Io)?;
        }
        Ok(())
    }
    fn flush(&self) -> Result<()> { self.inner.flush() }
    fn inventory(&self, a: Option<&str>, n: usize) -> Result<InventoryPage> { self.inner.inventory(a,n) }
    fn version(&self, d: &str) -> Result<Value> { self.inner.version(d) }
    fn required_blobs(&self, v: &Value) -> Result<Vec<BlobRef>> {
        self.validations.fetch_add(1,Ordering::SeqCst);
        if self.reject.load(Ordering::SeqCst) { return Err(SyncError::Protocol); }
        self.inner.required_blobs(v)
    }
    fn has_blob(&self, b: &BlobRef) -> Result<bool> { self.inner.has_blob(b) }
    fn read_blob_chunk(&self, b: &BlobRef, o: u64, n: usize) -> Result<Vec<u8>> {
        self.reads.fetch_add(1,Ordering::SeqCst);
        if o == 0 && !self.first_upload.swap(true,Ordering::SeqCst) {
            if let Some(gate) = &self.upload_gate {
                // Both clients already received remote BlobOffset=0 before either uploads.
                gate.fetch_add(1,Ordering::SeqCst);
                let until=Instant::now()+Duration::from_secs(5);
                while gate.load(Ordering::SeqCst)<2 {
                    if Instant::now()>=until { return Err(SyncError::Timeout); }
                    std::thread::sleep(Duration::from_millis(1));
                }
            }
        }
        self.inner.read_blob_chunk(b,o,n)
    }
    fn store_blob(&self, b: &BlobRef, p: &Path) -> Result<()> {
        self.writes.fetch_add(1,Ordering::SeqCst); self.inner.store_blob(b,p)
    }
    fn receive_head(&self, v: Value) -> Result<Receipt> {
        self.receives.fetch_add(1,Ordering::SeqCst); self.inner.receive_head(v)
    }
}
struct Node {
    dir: tempfile::TempDir,
    backend: Arc<Spy>,
    service: SyncService,
}
impl Node {
    fn new(w: &str, gate: Option<Arc<AtomicUsize>>) -> Self {
        let dir=tempfile::tempdir().unwrap();
        let backend=Arc::new(Spy {
            inner:Fixture::open(dir.path(),w).unwrap(),reject:AtomicBool::new(false),
            validations:AtomicUsize::new(0),reads:AtomicUsize::new(0),writes:AtomicUsize::new(0),
            receives:AtomicUsize::new(0),first_upload:AtomicBool::new(false),upload_gate:gate,
            fail_ready:AtomicBool::new(false),
        });
        let identity=Arc::new(IdentityStore::open(&dir.path().join(".sync"),&backend.device_id().unwrap()).unwrap());
        let service=SyncService::new(backend.clone(),identity,dir.path().join(".sync/staging")).unwrap();
        Self {dir,backend,service}
    }
    fn host(&self) -> String {
        let a=self.service.start_listener("127.0.0.1:0".parse().unwrap()).unwrap();
        format!("ws://{a}/")
    }
    fn wait_until(&self, f: impl Fn()->bool) {
        let until=Instant::now()+Duration::from_secs(7);
        while !f() { assert!(Instant::now()<until,"status={:?}",self.service.status().unwrap());std::thread::sleep(Duration::from_millis(10)); }
    }
}

#[test]
fn simultaneous_same_blob_uploads_automatically_converge_without_manual_retry() {
    let ws=Uuid::new_v4().to_string();
    let gate=Arc::new(AtomicUsize::new(0));
    let a=Node::new(&ws,None);
    let b=Node::new(&ws,Some(gate.clone()));
    let c=Node::new(&ws,Some(gate.clone()));
    let bytes=vec![71u8;24*1024+111];
    b.backend.inner.insert("different B note, shared attachment",Some(&bytes)).unwrap();
    c.backend.inner.insert("different C note, shared attachment",Some(&bytes)).unwrap();
    let endpoint=a.host();
    b.service.pair(&a.service.invitation(&endpoint).unwrap()).unwrap();
    c.service.pair(&a.service.invitation(&endpoint).unwrap()).unwrap();
    a.wait_until(|| gate.load(Ordering::SeqCst)==2);
    let until=Instant::now()+Duration::from_secs(7);
    loop {
        let counts=[a.backend.inner.digests().unwrap().len(),b.backend.inner.digests().unwrap().len(),c.backend.inner.digests().unwrap().len()];
        if counts==[2,2,2] { break; }
        if Instant::now()>=until {
            eprintln!("INDEPENDENT_SAME_BLOB_FAILURE counts={counts:?} B={:?} C={:?}",b.service.status().unwrap(),c.service.status().unwrap());
            panic!("shared-blob concurrent uploads must recover automatically; no sync_now was called");
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

#[test]
fn required_blobs_rejection_precedes_blob_io_on_push_and_pull() {
    for reject_host in [true,false] {
        let ws=Uuid::new_v4().to_string();let a=Node::new(&ws,None);let b=Node::new(&ws,None);
        let source=if reject_host {&b} else {&a};
        let destination=if reject_host {&a} else {&b};
        source.backend.inner.insert("rejected before any media allocation",Some(&vec![9u8;50_000])).unwrap();
        destination.backend.reject.store(true,Ordering::SeqCst);
        let endpoint=a.host();b.service.pair(&a.service.invitation(&endpoint).unwrap()).unwrap();
        destination.wait_until(|| destination.backend.validations.load(Ordering::SeqCst)>0);
        std::thread::sleep(Duration::from_millis(100));
        assert_eq!(source.backend.reads.load(Ordering::SeqCst),0);
        assert_eq!(destination.backend.writes.load(Ordering::SeqCst),0);
        assert_eq!(destination.backend.receives.load(Ordering::SeqCst),0);
        assert_eq!(std::fs::read_dir(destination.dir.path().join(".sync/staging")).unwrap().count(),0);
        assert!(destination.backend.inner.digests().unwrap().is_empty());
    }
}

#[test]
fn prepared_credentials_survive_ready_file_failure_after_successful_adoption() {
    let ws=Uuid::new_v4().to_string();let a=Node::new(&ws,None);let mut b=Node::new(&Uuid::new_v4().to_string(),None);
    a.backend.inner.insert("not exposed while Prepared",None).unwrap();
    b.backend.fail_ready.store(true,Ordering::SeqCst);
    let endpoint=a.host();let token=a.service.invitation(&endpoint).unwrap();
    assert_eq!(b.service.pair(&token).unwrap_err(),SyncError::Io);
    let pending=b.service.pending_pairings().unwrap();assert_eq!(pending.len(),1);assert!(!pending[0].ready);
    assert_eq!(b.backend.workspace_id().unwrap(),ws);assert!(b.backend.inner.digests().unwrap().is_empty());
    assert_eq!(b.backend.validations.load(Ordering::SeqCst),0);
    b.service.shutdown().unwrap();
    let path=b.dir.path().join(".sync/identity-v1.json");std::fs::remove_dir(&path).unwrap();std::fs::rename(path.with_extension("prepared-backup"),&path).unwrap();
    let identity=Arc::new(IdentityStore::open(&b.dir.path().join(".sync"),&b.backend.device_id().unwrap()).unwrap());
    let mut restored=SyncService::new(b.backend.clone(),identity,b.dir.path().join(".sync/staging")).unwrap();
    assert_eq!(restored.pending_pairings().unwrap().len(),1);
    let ready=restored.recover_pairing(&pending[0].peer_id).unwrap();assert!(ready.ready);
    restored.connect(&ready.peer_id).unwrap();
    let until=Instant::now()+Duration::from_secs(7);
    while b.backend.inner.digests().unwrap().is_empty() {assert!(Instant::now()<until);std::thread::sleep(Duration::from_millis(10));}
    restored.shutdown().unwrap();
}
