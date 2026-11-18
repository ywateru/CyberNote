//! Synthetic Store/Session integration, not an OAuth/SDK or live App test.
//! The policy and Noise peers are pinned, but no original data or credentials
//! are read. Traces contain only fixed backend method names and SyncError.
use super::*;
use crate::account::enrollment::Gate;

struct TracedStore {
    inner: StoreBackend,
    calls: Mutex<Vec<(&'static str, Option<SyncError>)>>,
}
impl TracedStore {
    fn observe<T>(
        &self,
        method: &'static str,
        result: crate::sync::identity::Result<T>,
    ) -> crate::sync::identity::Result<T> {
        let mut calls = self.calls.lock().unwrap();
        // Fixed finite trace, including cleanup metadata calls after a failure.
        if calls.len() < 512 {
            calls.push((method, result.as_ref().err().copied()));
        }
        result
    }
    fn clear(&self) {
        self.calls.lock().unwrap().clear();
    }
    fn content_calls(&self) -> usize {
        self.calls
            .lock()
            .unwrap()
            .iter()
            .filter(|(method, _)| {
                matches!(
                    *method,
                    "inventory" | "version" | "required_blobs" | "store_blob" | "receive_head"
                )
            })
            .count()
    }
}
macro_rules! delegate {
    ($name:ident($($arg:ident:$ty:ty),*)->$out:ty) => {
        fn $name(&self,$($arg:$ty),*)->crate::sync::identity::Result<$out> {
            self.observe(stringify!($name), self.inner.$name($($arg),*))
        }
    };
}
impl SyncBackend for TracedStore {
    delegate!(device_id()->String);
    delegate!(workspace_id()->String);
    delegate!(prepare_pairing(workspace:&str)->());
    delegate!(adopt_workspace(workspace:&str)->());
    delegate!(flush()->());
    delegate!(inventory(after:Option<&str>,limit:usize)->network::InventoryPage);
    delegate!(version(digest:&str)->Value);
    delegate!(required_blobs(version:&Value)->Vec<network::BlobRef>);
    delegate!(has_blob(blob:&network::BlobRef)->bool);
    delegate!(read_blob_chunk(blob:&network::BlobRef,offset:u64,max:usize)->Vec<u8>);
    delegate!(store_blob(blob:&network::BlobRef,source:&Path)->());
    delegate!(receive_head(version:Value)->network::Receipt);
}
fn backend(store: Store, device: String, staging: NetworkStaging) -> Arc<TracedStore> {
    Arc::new(TracedStore {
        inner: StoreBackend {
            outgoing: Mutex::new(None),
            staging,
            shared: Arc::new((Mutex::new(Session::new(store)), Condvar::new())),
            device,
            fence: Some((Arc::new(AtomicU64::new(1)), 1)),
        },
        calls: Mutex::new(Vec::new()),
    })
}
fn admit(gate: &Gate, identity: &IdentityStore, workspace: &str) {
    let _ = workspace;
    let device = identity.device_id().unwrap();
    let key = identity.public_key().unwrap();
    gate.bind_lifecycle(Arc::new(|| true));
    let expected_device = device.clone();
    let expected_key = key.clone();
    gate.bind_peers(Arc::new(move |peer, d, k| {
        *peer == [9; 32] && d == expected_device && k == expected_key
    }));
    gate.admit([9; 32], &device, &key).unwrap();
}
fn seed(store: &mut Store, text: &str, attachments: &[(&str, &str, &[u8])]) -> String {
    let id = store.action(json!({"type":"createNote"})).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let mut content = vec![json!({"type":"paragraph","content":[{"type":"text","text":text}]})];
    for (name, mime, bytes) in attachments {
        let media = store
            .store_attachment(&id, name, mime, bytes.to_vec())
            .unwrap();
        content.push(
            json!({"type":"attachment","attrs":{"id":media.id,"kind":media.kind,"name":name}}),
        );
    }
    store
        .action(json!({"type":"saveNote","id":id,"revision":0,
        "document":{"type":"doc","content":content}}))
        .unwrap();
    id
}
fn actual_store_transfer(attachment: bool, pull: bool) {
    let root = tempfile::tempdir().unwrap();
    let aroot = root.path().join("A");
    let broot = root.path().join("B");
    let mut a = Store::open(&aroot).unwrap();
    let ai = a.sync_enable(None).unwrap();
    let mut b = Store::open(&broot).unwrap();
    let bi = b.sync_enable(Some(&ai.workspace_id)).unwrap();
    // The same fixed capabilities used by activate_account own both the
    // transport directory and publication authority; no environment override.
    let astaging = NetworkStaging::account(&aroot, &ai.device_id).unwrap();
    let bstaging = NetworkStaging::account(&broot, &bi.device_id).unwrap();
    let astage = astaging.prepare().unwrap();
    let bstage = bstaging.prepare().unwrap();
    let mut png = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut png, 1, 1);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().unwrap();
        writer.write_image_data(&[1, 2, 3, 255]).unwrap();
        writer.finish().unwrap();
    }
    // Cross two complete pipeline windows plus a partial final chunk, using
    // normal attachment publication and persisted pairing rather than mocks.
    let binary = vec![7u8; network::CHUNK * (network::BLOB_WINDOW * 2 + 1) + 17];
    let attachments = [
        ("synthetic.png", "image/png", png.as_slice()),
        (
            "synthetic.bin",
            "application/octet-stream",
            binary.as_slice(),
        ),
    ];
    let anote = seed(
        &mut a,
        "A-origin",
        if attachment { &attachments } else { &[] },
    );
    let bnote = seed(&mut b, "B-origin", &[]);
    let aoriginal = serde_json::to_value(a.note(&anote).unwrap()).unwrap();
    let boriginal = serde_json::to_value(b.note(&bnote).unwrap()).unwrap();
    let aid = Arc::new(IdentityStore::open(&aroot.join(".sync"), &ai.device_id).unwrap());
    let bid = Arc::new(IdentityStore::open(&broot.join(".sync"), &bi.device_id).unwrap());
    let agate = Arc::new(Gate::default());
    let bgate = Arc::new(Gate::default());
    admit(&agate, &bid, &ai.workspace_id);
    admit(&bgate, &aid, &ai.workspace_id);
    let abackend = backend(a, ai.device_id.clone(), astaging.clone());
    let bbackend = backend(b, bi.device_id.clone(), bstaging.clone());
    abackend.flush().unwrap();
    bbackend.flush().unwrap();
    let mut aservice = SyncService::with_policy(
        abackend.clone(),
        aid.clone(),
        astage.clone(),
        Some(agate.clone()),
    )
    .unwrap();
    let mut bservice = SyncService::with_policy(
        bbackend.clone(),
        bid.clone(),
        bstage.clone(),
        Some(bgate.clone()),
    )
    .unwrap();
    let aa = aservice
        .start_listener("127.0.0.1:0".parse().unwrap())
        .unwrap();
    let ba = bservice
        .start_listener("127.0.0.1:0".parse().unwrap())
        .unwrap();
    agate.route(&bid.device_id().unwrap(), format!("ws://{ba}/"));
    bgate.route(&aid.device_id().unwrap(), format!("ws://{aa}/"));
    abackend.clear();
    bbackend.clear();
    let paired = if pull {
        bservice.pair(&aservice.invitation(&format!("ws://{aa}/")).unwrap())
    } else {
        aservice.pair(&bservice.invitation(&format!("ws://{ba}/")).unwrap())
    }
    .unwrap();
    assert!(paired.ready);
    assert_eq!(abackend.content_calls(), 0, "pair must not cycle content");
    assert_eq!(bbackend.content_calls(), 0, "pair must not cycle content");
    aservice.shutdown().unwrap();
    bservice.shutdown().unwrap();
    agate.close();
    bgate.close();
    drop((
        aservice, bservice, abackend, bbackend, aid, bid, agate, bgate,
    ));

    // A real restart: close/reopen SQLite/Session, persisted IdentityStore and
    // services; no new invitation or second pair. Policy supplies fresh routes,
    // so the persisted old endpoint is not used for this selected operation.
    let aid = Arc::new(IdentityStore::open(&aroot.join(".sync"), &ai.device_id).unwrap());
    let bid = Arc::new(IdentityStore::open(&broot.join(".sync"), &bi.device_id).unwrap());
    assert_eq!(
        if pull {
            bid.peer_for_device(&ai.device_id).unwrap()
        } else {
            aid.peer_for_device(&bi.device_id).unwrap()
        }
        .as_deref(),
        Some(paired.peer_id.as_str())
    );
    let agate = Arc::new(Gate::default());
    let bgate = Arc::new(Gate::default());
    admit(&agate, &bid, &ai.workspace_id);
    admit(&bgate, &aid, &ai.workspace_id);
    let abackend = backend(Store::open(&aroot).unwrap(), ai.device_id, astaging);
    let bbackend = backend(Store::open(&broot).unwrap(), bi.device_id, bstaging);
    let mut aservice =
        SyncService::with_policy(abackend.clone(), aid.clone(), astage, Some(agate.clone()))
            .unwrap();
    let mut bservice =
        SyncService::with_policy(bbackend.clone(), bid.clone(), bstage, Some(bgate.clone()))
            .unwrap();
    let aa = aservice
        .start_listener("127.0.0.1:0".parse().unwrap())
        .unwrap();
    let ba = bservice
        .start_listener("127.0.0.1:0".parse().unwrap())
        .unwrap();
    agate.route(&bid.device_id().unwrap(), format!("ws://{ba}/"));
    bgate.route(&aid.device_id().unwrap(), format!("ws://{aa}/"));
    assert_eq!(abackend.content_calls(), 0);
    assert_eq!(bbackend.content_calls(), 0);
    let result = if pull {
        bservice.transfer_once(&paired.peer_id, network::TransferDirection::Pull)
    } else {
        aservice.transfer_once(&paired.peer_id, network::TransferDirection::Push)
    };
    // These traces do not contain note/attachment/peer IDs, hashes or paths.
    println!(
        "ACTUAL_STORE_PUSH attachment={attachment} result={result:?} A={:?} B={:?}",
        abackend.calls.lock().unwrap(),
        bbackend.calls.lock().unwrap()
    );
    aservice.disconnect(&paired.peer_id).unwrap();
    bservice.disconnect(&paired.peer_id).unwrap();
    aservice.shutdown().unwrap();
    bservice.shutdown().unwrap();
    assert_eq!(result, Ok(()));
    let a = abackend.inner.shared.0.lock().unwrap();
    let b = bbackend.inner.shared.0.lock().unwrap();
    assert_eq!(
        a.store.sync_pending_count().unwrap(),
        0,
        "push must not pull"
    );
    assert!(a.store.note(&bnote).is_err());
    assert!(
        b.store.sync_pending_count().unwrap() > 0,
        "push receipt must be durable"
    );
    assert!(
        b.store.note(&anote).is_err(),
        "durable inbox must not foreground-apply"
    );
    assert_eq!(
        serde_json::to_value(a.store.note(&anote).unwrap()).unwrap(),
        aoriginal
    );
    assert_eq!(
        serde_json::to_value(b.store.note(&bnote).unwrap()).unwrap(),
        boriginal
    );
    if attachment {
        for bytes in [&png, &binary] {
            let hash = crate::sync::model::sha256(bytes);
            assert_eq!(
                std::fs::read(b.store.sync_blob_path(&hash).unwrap()).unwrap(),
                *bytes
            );
        }
    }
}
#[test]
fn account_policy_real_store_plain_push_has_durable_directional_receipt() {
    actual_store_transfer(false, false);
}
#[test]
fn account_policy_real_store_attachment_push_has_durable_directional_receipt() {
    actual_store_transfer(true, false);
}
#[test]
fn account_policy_real_store_attachment_pull_has_durable_directional_receipt() {
    actual_store_transfer(true, true);
}
