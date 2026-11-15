//! Actual SQLite Store + authenticated listener tests. No app, account login or provider traffic.
#![allow(dead_code)]
#[path = "../../src-tauri/src/sync/identity.rs"]
pub(crate) mod identity;
#[path = "../../src-tauri/src/sync/model.rs"]
pub(crate) mod model;
#[path = "../../src-tauri/src/sync/network.rs"]
pub(crate) mod network;
#[path = "../../src-tauri/src/store.rs"]
mod store;
mod sync {
    pub(crate) use crate::{identity, model, network};
}

use serde_json::{json, Value};
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use store::Store;
use sync::{
    identity::{IdentityStore, Result, SyncError},
    model::WireVersion,
    network::{
        BlobRef, InventoryPage, Receipt, ReplicationPolicy, SyncBackend, SyncService,
        TransferDirection,
    },
};

#[track_caller]
fn mapped<T>(result: store::Result<T>) -> Result<T> {
    result.map_err(|error| {
        eprintln!(
            "Store fixture error code={} caller={}",
            error.code,
            std::panic::Location::caller()
        );
        SyncError::Backend
    })
}
struct Backend(Mutex<Store>);
impl Backend {
    fn prepared<T>(
        &self,
        incoming: &[WireVersion],
        f: impl FnOnce(&mut Store) -> store::Result<T>,
    ) -> Result<T> {
        let mut store = self.0.lock().unwrap();
        let media = mapped(store.sync_media_snapshot(incoming, false))?;
        let media = mapped(media.verify())?;
        mapped(store.sync_with_media(media, f))
    }
}
impl SyncBackend for Backend {
    fn device_id(&self) -> Result<String> {
        Ok(mapped(self.0.lock().unwrap().sync_identity())?
            .unwrap()
            .device_id)
    }
    fn workspace_id(&self) -> Result<String> {
        Ok(mapped(self.0.lock().unwrap().sync_identity())?
            .unwrap()
            .workspace_id)
    }
    fn prepare_pairing(&self, workspace: &str) -> Result<()> {
        if self.workspace_id()? != workspace {
            return Err(SyncError::WorkspaceMismatch);
        }
        Ok(())
    }
    fn adopt_workspace(&self, workspace: &str) -> Result<()> {
        self.prepare_pairing(workspace)
    }
    fn flush(&self) -> Result<()> {
        self.prepared(&[], |s| s.sync_flush())
    }
    fn inventory(&self, after: Option<&str>, limit: usize) -> Result<InventoryPage> {
        let mut ids: Vec<_> = mapped(self.0.lock().unwrap().sync_inventory())?
            .into_iter()
            .map(|v| v.digest)
            .filter(|d| after.is_none_or(|a| d.as_str() > a))
            .collect();
        ids.sort();
        let next = if ids.len() > limit {
            ids.get(limit - 1).cloned()
        } else {
            None
        };
        ids.truncate(limit);
        Ok(InventoryPage { digests: ids, next })
    }
    fn version(&self, digest: &str) -> Result<Value> {
        serde_json::to_value(mapped(self.0.lock().unwrap().sync_version(digest))?)
            .map_err(|_| SyncError::Backend)
    }
    fn required_blobs(&self, value: &Value) -> Result<Vec<BlobRef>> {
        let wire: WireVersion =
            serde_json::from_value(value.clone()).map_err(|_| SyncError::Protocol)?;
        let refs = self.prepared(std::slice::from_ref(&wire), |s| {
            s.sync_validate_receive(std::slice::from_ref(&wire))?;
            s.sync_required_blobs(&wire)
        })?;
        Ok(refs
            .into_iter()
            .map(|b| BlobRef {
                sha256: b.hash,
                size: b.size,
            })
            .collect())
    }
    fn has_blob(&self, blob: &BlobRef) -> Result<bool> {
        mapped(
            mapped(self.0.lock().unwrap().sync_blob_storage())?.contains(&blob.sha256, blob.size),
        )
    }
    fn read_blob_chunk(&self, blob: &BlobRef, offset: u64, max: usize) -> Result<Vec<u8>> {
        let path = mapped(self.0.lock().unwrap().sync_blob_path(&blob.sha256))?;
        let mut file = File::open(path).map_err(|_| SyncError::Io)?;
        file.seek(SeekFrom::Start(offset))
            .map_err(|_| SyncError::Io)?;
        let mut bytes = vec![0; (blob.size - offset).min(max as u64) as usize];
        file.read_exact(&mut bytes).map_err(|_| SyncError::Io)?;
        Ok(bytes)
    }
    fn store_blob(&self, blob: &BlobRef, source: &Path) -> Result<()> {
        mapped(
            mapped(self.0.lock().unwrap().sync_blob_storage())?.publish_staged(
                &blob.sha256,
                blob.size,
                source,
            ),
        )
    }
    fn receive_head(&self, value: Value) -> Result<Receipt> {
        let wire: WireVersion = serde_json::from_value(value).map_err(|_| SyncError::Protocol)?;
        let report = self.prepared(std::slice::from_ref(&wire), |s| {
            s.sync_receive(vec![wire.clone()])
        })?;
        Ok(Receipt {
            durable: report.durable,
            applied: false,
        })
    }
}
struct Policy {
    open: AtomicBool,
    endpoint: Mutex<String>,
}
impl ReplicationPolicy for Policy {
    fn authorize(&self, _: &str, _: &str) -> Result<()> {
        if self.open.load(Ordering::Acquire) {
            Ok(())
        } else {
            Err(SyncError::Revoked)
        }
    }
    fn endpoint(&self, _: &str) -> Result<String> {
        Ok(self.endpoint.lock().unwrap().clone())
    }
}
struct Node {
    root: tempfile::TempDir,
    backend: Arc<Backend>,
    policy: Arc<Policy>,
    identity: Arc<IdentityStore>,
    service: SyncService,
}
impl Node {
    fn new(workspace: &str, account: bool) -> Self {
        let root = tempfile::tempdir().unwrap();
        let mut store = Store::open(root.path()).unwrap();
        let device = store.sync_enable(Some(workspace)).unwrap().device_id;
        let backend = Arc::new(Backend(Mutex::new(store)));
        let identity = Arc::new(IdentityStore::open(&root.path().join(".sync"), &device).unwrap());
        let policy = Arc::new(Policy {
            open: AtomicBool::new(true),
            endpoint: Mutex::new(String::new()),
        });
        let service = SyncService::with_policy(
            backend.clone(),
            identity.clone(),
            root.path().join(".sync/network-staging"),
            account.then(|| policy.clone() as Arc<dyn ReplicationPolicy>),
        )
        .unwrap();
        Self {
            root,
            backend,
            policy,
            identity,
            service,
        }
    }
    fn note(&self, text: &str) -> (String, String, Vec<u8>) {
        let mut store = self.backend.0.lock().unwrap();
        let id = store.action(json!({"type":"createNote"})).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        let bytes = text.as_bytes().repeat(40_000); // Multi-chunk distinct attachment per direction.
        let a = store
            .store_attachment(&id, "direction.png", "image/png", bytes.clone())
            .unwrap();
        store.action(json!({"type":"saveNote","id":id,"revision":0,"document":{"type":"doc","content":[
            {"type":"paragraph","content":[{"type":"text","text":text,"marks":[{"type":"bold"}]}]},
            {"type":"attachment","attrs":{"id":a.id,"kind":"image","name":"direction.png"}}
        ]}})).unwrap();
        (id, a.id, bytes)
    }
    fn pair_from(&self, remote: &Self) -> String {
        let address = remote
            .service
            .start_listener("127.0.0.1:0".parse().unwrap())
            .unwrap();
        let endpoint = format!("ws://{address}/");
        *self.policy.endpoint.lock().unwrap() = endpoint.clone();
        self.service
            .pair(&remote.service.invitation(&endpoint).unwrap())
            .unwrap()
            .peer_id
    }
    fn absence(&self, note: &str, attachment: &str, bytes: &[u8]) {
        assert!(self.backend.0.lock().unwrap().note(note).is_err());
        let db = rusqlite::Connection::open_with_flags(
            self.root.path().join("notes.sqlite3"),
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .unwrap();
        for table in ["sync_heads", "sync_seen", "sync_inbox"] {
            let entity = if table == "sync_inbox" {
                "json_extract(wire,'$.entityId')"
            } else {
                "entity_id"
            };
            assert_eq!(
                db.query_row::<i64, _, _>(
                    &format!("SELECT count(*) FROM {table} WHERE {entity}=?1"),
                    [note],
                    |r| r.get(0)
                )
                .unwrap(),
                0,
                "unexpected version in {table}"
            );
        }
        assert!(self
            .backend
            .0
            .lock()
            .unwrap()
            .read_attachment(attachment)
            .is_err());
        use sha2::{Digest, Sha256};
        assert!(!self
            .backend
            .has_blob(&BlobRef {
                sha256: format!("{:x}", Sha256::digest(bytes)),
                size: bytes.len() as u64
            })
            .unwrap());
    }
    fn apply_and_compare(&self, source: &Self, note: &str, attachment: &str, bytes: &[u8]) {
        // Receipt must stage into inbox, with no UI projection by the listener.
        assert!(self.backend.0.lock().unwrap().note(note).is_err());
        assert!(self.backend.0.lock().unwrap().sync_pending_count().unwrap() > 0);
        self.backend
            .prepared(&[], |s| s.sync_apply_pending())
            .unwrap();
        let target = self.backend.0.lock().unwrap();
        let source = source.backend.0.lock().unwrap();
        assert_eq!(
            target.note(note).unwrap().document,
            source.note(note).unwrap().document
        );
        assert_eq!(
            target.note(note).unwrap().plain_text,
            source.note(note).unwrap().plain_text
        );
        assert_eq!(
            target.read_attachment(attachment).unwrap(),
            source.read_attachment(attachment).unwrap()
        );
        use sha2::{Digest, Sha256};
        let blob = BlobRef {
            sha256: format!("{:x}", Sha256::digest(bytes)),
            size: bytes.len() as u64,
        };
        drop(target);
        drop(source);
        assert!(self.backend.has_blob(&blob).unwrap());
    }
}

fn account110_actual_store_push_pull_both_and_idle_exclude_reverse_versions_and_blobs() {
    for direction in [
        TransferDirection::Push,
        TransferDirection::Pull,
        TransferDirection::Both,
    ] {
        let workspace = uuid::Uuid::new_v4().to_string();
        let a = Node::new(&workspace, true);
        let b = Node::new(&workspace, true);
        let an = a.note("from A");
        let bn = b.note("from B");
        let peer = a.pair_from(&b);
        a.service.connect(&peer).unwrap();
        a.service.sync_now().unwrap();
        std::thread::sleep(Duration::from_millis(2200)); // Exceeds the old automatic 2s cycle.
        a.absence(&bn.0, &bn.1, &bn.2);
        b.absence(&an.0, &an.1, &an.2);
        a.service.transfer_once(&peer, direction).unwrap();
        if direction != TransferDirection::Push {
            a.apply_and_compare(&b, &bn.0, &bn.1, &bn.2);
        } else {
            a.absence(&bn.0, &bn.1, &bn.2);
        }
        if direction != TransferDirection::Pull {
            b.apply_and_compare(&a, &an.0, &an.1, &an.2);
        } else {
            b.absence(&an.0, &an.1, &an.2);
        }
        let late_a = a.note("late A");
        let late_b = b.note("late B");
        a.service.connect(&peer).unwrap();
        for _ in 0..3 {
            a.service.sync_now().unwrap();
        }
        std::thread::sleep(Duration::from_millis(2200));
        a.absence(&late_b.0, &late_b.1, &late_b.2);
        b.absence(&late_a.0, &late_a.1, &late_a.2);
        // Explicit retry is allowed, targeting the same pinned peer only.
        a.service
            .transfer_once(&peer, TransferDirection::Both)
            .unwrap();
        a.apply_and_compare(&b, &late_b.0, &late_b.1, &late_b.2);
        b.apply_and_compare(&a, &late_a.0, &late_a.1, &late_a.2);
    }
}

fn account110_legacy_none_still_pairs_and_automatically_transfers_both_directions() {
    let workspace = uuid::Uuid::new_v4().to_string();
    let a = Node::new(&workspace, false);
    let b = Node::new(&workspace, false);
    let an = a.note("manual A");
    let bn = b.note("manual B");
    a.pair_from(&b);
    let deadline = std::time::Instant::now() + Duration::from_secs(10);
    while a.backend.0.lock().unwrap().sync_pending_count().unwrap() == 0
        || b.backend.0.lock().unwrap().sync_pending_count().unwrap() == 0
    {
        assert!(std::time::Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(20));
    }
    a.apply_and_compare(&b, &bn.0, &bn.1, &bn.2);
    b.apply_and_compare(&a, &an.0, &an.1, &an.2);
}

fn account110_new_client_rejects_legacy_listener_without_data_downgrade() {
    let workspace = uuid::Uuid::new_v4().to_string();
    let a = Node::new(&workspace, true);
    let b = Node::new(&workspace, false);
    let an = a.note("capability A");
    let bn = b.note("capability B");
    let peer = a.pair_from(&b);
    assert_eq!(
        a.service.transfer_once(&peer, TransferDirection::Both),
        Err(SyncError::Protocol)
    );
    a.absence(&bn.0, &bn.1, &bn.2);
    b.absence(&an.0, &an.1, &an.2);
}

fn account110_busy_cancellation_releases_single_account_slot_without_retry() {
    let workspace = uuid::Uuid::new_v4().to_string();
    let a = Node::new(&workspace, true);
    let b = Node::new(&workspace, true);
    let an = a.note("cancelled then explicit retry");
    let peer = a.pair_from(&b);
    let endpoint = a.policy.endpoint.lock().unwrap().clone();
    let blackhole = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    *a.policy.endpoint.lock().unwrap() = format!("ws://{}/", blackhole.local_addr().unwrap());
    blackhole.set_nonblocking(true).unwrap();
    std::thread::scope(|scope| {
        let task = scope.spawn(|| a.service.transfer_once(&peer, TransferDirection::Push));
        let until = std::time::Instant::now() + Duration::from_secs(2);
        let stream = loop {
            match blackhole.accept() {
                Ok((stream, _)) => break stream,
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    assert!(
                        std::time::Instant::now() < until,
                        "one-shot never attempted connection"
                    );
                    std::thread::sleep(Duration::from_millis(5));
                }
                Err(e) => panic!("test listener failed: {e}"),
            }
        };
        // A stalled socket does not block status or cancellation behind a lifecycle mutex.
        a.service.status().unwrap();
        assert_eq!(
            a.service.transfer_once(&peer, TransferDirection::Pull),
            Err(SyncError::Busy)
        );
        assert_eq!(a.service.connect(&peer), Err(SyncError::Busy));
        let start = std::time::Instant::now();
        a.service.disconnect(&peer).unwrap();
        assert_eq!(task.join().unwrap(), Err(SyncError::Stopped));
        assert!(start.elapsed() < Duration::from_secs(2));
        drop(stream);
    });
    b.absence(&an.0, &an.1, &an.2);
    *a.policy.endpoint.lock().unwrap() = endpoint;
    a.service
        .transfer_once(&peer, TransferDirection::Push)
        .unwrap();
    b.apply_and_compare(&a, &an.0, &an.1, &an.2);
    // Revocation rejects even a paired peer; explicit calls do not repair/retry authorization.
    a.policy.open.store(false, Ordering::Release);
    assert_eq!(
        a.service.transfer_once(&peer, TransferDirection::Both),
        Err(SyncError::Revoked)
    );
}

fn main() {
    account110_actual_store_push_pull_both_and_idle_exclude_reverse_versions_and_blobs();
    println!("PASS actual_store_push_pull_both_idle_reverse_exclusion");
    account110_legacy_none_still_pairs_and_automatically_transfers_both_directions();
    println!("PASS actual_store_legacy_automatic_both");
    account110_new_client_rejects_legacy_listener_without_data_downgrade();
    println!("PASS actual_store_no_legacy_downgrade");
    account110_busy_cancellation_releases_single_account_slot_without_retry();
    println!("PASS actual_store_busy_cancel_explicit_retry_revoked");
}
