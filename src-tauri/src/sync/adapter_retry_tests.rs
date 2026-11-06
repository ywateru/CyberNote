use super::*;
use std::sync::atomic::AtomicUsize;
struct StaleOnce {
    inner: StoreBackend,
    flushes: AtomicUsize,
    note: String,
}
macro_rules! forward {
    ($name:ident($($arg:ident:$ty:ty),*)->$out:ty) => {
        fn $name(&self,$($arg:$ty),*)->super::super::identity::Result<$out>{self.inner.$name($($arg),*)}
    };
}
impl SyncBackend for StaleOnce {
    forward!(device_id()->String);
    forward!(workspace_id()->String);
    forward!(prepare_pairing(workspace:&str)->());
    forward!(adopt_workspace(workspace:&str)->());
    forward!(inventory(after:Option<&str>,limit:usize)->network::InventoryPage);
    forward!(version(digest:&str)->Value);
    forward!(required_blobs(version:&Value)->Vec<network::BlobRef>);
    forward!(has_blob(blob:&network::BlobRef)->bool);
    forward!(read_blob_chunk(blob:&network::BlobRef,offset:u64,max:usize)->Vec<u8>);
    forward!(store_blob(blob:&network::BlobRef,source:&Path)->());
    forward!(receive_head(version:Value)->network::Receipt);
    fn flush(&self) -> super::super::identity::Result<()> {
        if self.flushes.fetch_add(1, Ordering::SeqCst) == 0 {
            // Create the same genuine Store generation race deterministically:
            // prepare, ordinary foreground write, then final production gate.
            let media = {
                let s = self.inner.shared.0.lock().unwrap();
                s.store.sync_media_snapshot(&[], false).unwrap()
            }
            .verify()
            .unwrap();
            let mut s = self.inner.shared.0.lock().unwrap();
            let token = s.sync_media_token();
            s.ordinary(
                json!({"type":"patchNote","id":self.note,"pinned":true}),
                &token,
            )
            .unwrap();
            let error = s
                .store
                .sync_with_media(media, |store| store.sync_flush())
                .unwrap_err();
            assert_eq!(error.code, "sync_plan_stale");
            return Err(backend_error(error));
        }
        self.inner.flush()
    }
}
#[derive(Default)]
struct Windows(Mutex<Vec<Value>>);
impl WindowHost for Windows {
    fn participants(&self) -> HashSet<String> {
        HashSet::from(["main".into()])
    }
    fn emit(&self, name: &str, payload: &Value) -> Result<()> {
        if name == "notes-sync" {
            self.0.lock().unwrap().push(payload.clone());
        }
        Ok(())
    }
}
#[test]
fn actual_store_stale_automatically_reconnects_and_quiet_converges_dirty_and_inbox() {
    let d = tempfile::tempdir().unwrap();
    let aroot = d.path().join("A");
    let broot = d.path().join("B");
    let mut a = Store::open(&aroot).unwrap();
    let identity = a.sync_enable(None).unwrap();
    let note = a.action(json!({"type":"createNote"})).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let ashared = Arc::new((Mutex::new(Session::new(a)), Condvar::new()));
    let bshared = Arc::new((
        Mutex::new(Session::new(Store::open(&broot).unwrap())),
        Condvar::new(),
    ));
    let abackend = Arc::new(StaleOnce {
        inner: StoreBackend {
            shared: ashared.clone(),
            device: identity.device_id.clone(),
        },
        flushes: AtomicUsize::new(0),
        note: note.clone(),
    });
    let bdevice = uuid::Uuid::new_v4().to_string();
    let bbackend = Arc::new(StoreBackend {
        shared: bshared.clone(),
        device: bdevice.clone(),
    });
    let aid = Arc::new(IdentityStore::open(&aroot.join(".sync"), &identity.device_id).unwrap());
    let bid = Arc::new(IdentityStore::open(&broot.join(".sync"), &bdevice).unwrap());
    let mut host =
        SyncService::new(abackend.clone(), aid, aroot.join(".sync/network-staging")).unwrap();
    let address = host.start_listener("127.0.0.1:0".parse().unwrap()).unwrap();
    let mut client = SyncService::new(bbackend, bid, broot.join(".sync/network-staging")).unwrap();
    let windows = Arc::new(Windows::default());
    let runtime = Runtime::new(bshared.clone(), broot.clone(), windows.clone()).unwrap();
    runtime.active.store(true, Ordering::Release);
    client
        .pair(&host.invitation(&format!("ws://{address}/")).unwrap())
        .unwrap();
    // No sync_now, connect, wake, second pair or manual Store apply is allowed.
    // Only the ordinary real window quiet replies are delivered.
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        let events = std::mem::take(&mut *windows.0.lock().unwrap());
        for event in events {
            println!(
                "AUTO_STALE_EVENT phase={} outcome={}",
                event["phase"], event["outcome"]
            );
            let token = bshared.0.lock().unwrap().sync_media_token();
            let operation_id = event["operationId"].as_str().unwrap().to_string();
            let reply = match event["phase"].as_str().unwrap() {
                "probe" => Some(WindowReply::Probe {
                    operation_id,
                    protected_note_ids: vec![],
                    blocked: false,
                }),
                "prepare" => Some(WindowReply::Prepare {
                    operation_id,
                    ready: true,
                }),
                _ => None,
            };
            if let Some(reply) = reply {
                runtime.reply("main", reply, &token).unwrap();
            }
        }
        let applied = {
            let s = bshared.0.lock().unwrap();
            s.store.note(&note).is_ok_and(|note| note.pinned)
                && s.store.sync_pending_count().unwrap() == 0
        };
        let reconnected = client
            .status()
            .unwrap()
            .connections
            .iter()
            .any(|c| c.last_success.is_some());
        if applied && reconnected {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "automatic retry/quiet did not converge: flushes={} client={:?} host={:?}",
            abackend.flushes.load(Ordering::SeqCst),
            client.status().unwrap(),
            host.status().unwrap()
        );
        thread::sleep(Duration::from_millis(20));
    }
    assert!(abackend.flushes.load(Ordering::SeqCst) >= 2);
    for root in [&aroot, &broot] {
        let db = rusqlite::Connection::open_with_flags(
            root.join("notes.sqlite3"),
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .unwrap();
        for table in ["sync_dirty", "sync_inbox"] {
            assert_eq!(
                db.query_row::<i64, _, _>(&format!("SELECT count(*) FROM {table}"), [], |r| r
                    .get(0))
                    .unwrap(),
                0
            );
        }
    }
    println!("AUTO_STALE_RECOVERY actual_foreground_edit=true rejected=1 flush_attempts={} automatic_reconnect=true quiet_commit=true both_dirty=0 both_inbox=0",abackend.flushes.load(Ordering::SeqCst));
    client.shutdown().unwrap();
    host.shutdown().unwrap();
    runtime.shutdown().unwrap();
}
