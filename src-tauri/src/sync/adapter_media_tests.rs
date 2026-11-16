use super::*;
use std::sync::mpsc;
#[derive(Default)]
struct Windows(Mutex<Vec<Value>>);
impl WindowHost for Windows {
    fn participants(&self) -> HashSet<String> {
        HashSet::from(["main".into()])
    }
    fn emit(&self, event: &str, payload: &Value) -> Result<()> {
        if event == "notes-sync" {
            self.0.lock().unwrap().push(payload.clone());
        }
        Ok(())
    }
}
fn measure<T: Send + 'static>(
    name: &str,
    shared: &SharedSession,
    write: Option<&str>,
    operation: impl FnOnce() -> T + Send + 'static,
) -> T {
    let (tx, rx) = mpsc::channel();
    let task = thread::spawn(move || {
        tx.send(()).unwrap();
        operation()
    });
    rx.recv().unwrap();
    let start = Instant::now();
    let mut latency = vec![];
    let mut wrote = false;
    while !task.is_finished() {
        assert!(
            start.elapsed() < Duration::from_secs(120),
            "{name}: bounded real IO wait exceeded 120s"
        );
        let at = Instant::now();
        let mut s = shared.0.lock().unwrap();
        let workspace = s.workspace().unwrap();
        assert!(workspace.get("access").is_some());
        if !wrote && latency.len() >= 5 {
            if let Some(id) = write {
                let token = s.sync_media_token();
                s.ordinary(json!({"type":"patchNote","id":id,"title":name}), &token)
                    .unwrap();
                wrote = true;
            }
        }
        drop(s);
        latency.push(at.elapsed().as_micros());
        thread::sleep(Duration::from_millis(2));
    }
    let result = task.join().unwrap();
    latency.sort_unstable();
    let count = latency.len();
    let max = *latency.last().unwrap_or(&0);
    let p99 = latency
        .get(count.saturating_sub(1) * 99 / 100)
        .copied()
        .unwrap_or(0);
    println!("MEDIA_RESPONSE name={name} wall_ms={} foreground_reads={count} ordinary_writes={} max_us={max} p99_us={p99}",start.elapsed().as_millis(),u8::from(wrote));
    assert!(
        max < 500_000,
        "{name}: foreground Session command took {max}us"
    );
    if write.is_some() {
        assert!(wrote && count > 10, "real read/write concurrency required");
    }
    result
}
#[test]
fn real_64mib_preflight_capture_receive_and_quiet_keep_foreground_responsive() {
    let d = tempfile::tempdir().unwrap();
    let root = d.path().join("local");
    let mut local = Store::open(&root).unwrap();
    let identity = local.sync_enable(None).unwrap();
    let mut remote = Store::open(d.path().join("remote")).unwrap();
    remote.sync_enable(Some(&identity.workspace_id)).unwrap();
    let id = remote.action(json!({"type":"createNote"})).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let a = remote
        .store_attachment(&id, "synthetic.png", "image/png", vec![7; 64 * 1024 * 1024])
        .unwrap();
    remote.action(json!({"type":"saveNote","id":id,"revision":0,"document":{"type":"doc","content":[{"type":"attachment","attrs":{"id":a.id,"kind":"image","name":"synthetic.png"}}]}})).unwrap();
    remote.sync_flush().unwrap();
    let version = remote
        .sync_inventory()
        .unwrap()
        .into_iter()
        .find(|v| v.entity_id == id)
        .unwrap();
    let wire = remote.sync_version(&version.digest).unwrap();
    let reference = remote.sync_required_blobs(&wire).unwrap().remove(0);
    local
        .sync_store_blob(
            &reference.hash,
            reference.size,
            File::open(remote.sync_blob_path(&reference.hash).unwrap()).unwrap(),
        )
        .unwrap();
    local.sync_receive(vec![wire.clone()]).unwrap();
    local.sync_apply_pending().unwrap();
    let other = local.action(json!({"type":"createNote"})).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let shared = Arc::new((Mutex::new(Session::new(local)), Condvar::new()));
    let make_backend = || StoreBackend {
        outgoing: Mutex::new(None),
        staging: NetworkStaging::manual(&root),
        shared: shared.clone(),
        device: identity.device_id.clone(),
        fence: None,
    };
    let backend = make_backend();
    let v = serde_json::to_value(&wire).unwrap();
    let result = measure(
        "cold_required_blobs_reprepare",
        &shared,
        Some(&other),
        move || backend.required_blobs(&v),
    );
    result.unwrap();
    make_backend()
        .required_blobs(&serde_json::to_value(&wire).unwrap())
        .unwrap();
    {
        let mut s = shared.0.lock().unwrap();
        let token = s.sync_media_token();
        s.ordinary(json!({"type":"patchNote","id":id,"pinned":true}), &token)
            .unwrap();
        // Missing immutable cache forces real serial capture of the 64MiB local file.
        fs::remove_file(
            root.join(".sync/blobs")
                .join(format!("{}.blob", reference.hash)),
        )
        .unwrap();
        *s = Session::new(Store::open(&root).unwrap());
    }
    let backend = make_backend();
    let result = measure(
        "cold_flush_capture_reprepare",
        &shared,
        Some(&other),
        move || backend.flush(),
    );
    result.unwrap();
    assert!(shared.0.lock().unwrap().store.note(&id).unwrap().pinned);
    make_backend().flush().unwrap();
    // A new attachment ID with the same real64MiB blob requires an independent
    // prepared publication, rather than reusing the already-present old path.
    let replacement = remote
        .store_attachment(&id, "new-path.png", "image/png", vec![7; 64 * 1024 * 1024])
        .unwrap();
    let revision = remote.note(&id).unwrap().revision;
    remote.action(json!({"type":"saveNote","id":id,"revision":revision,"document":{"type":"doc","content":[{"type":"attachment","attrs":{"id":replacement.id,"kind":"image","name":"new-path.png"}}]}})).unwrap();
    remote
        .action(json!({"type":"patchNote","id":id,"title":"remote metadata"}))
        .unwrap();
    remote.sync_flush().unwrap();
    let version = remote
        .sync_inventory()
        .unwrap()
        .into_iter()
        .find(|v| v.entity_id == id)
        .unwrap();
    let wire = remote.sync_version(&version.digest).unwrap();
    {
        let mut s = shared.0.lock().unwrap();
        *s = Session::new(Store::open(&root).unwrap());
    }
    let backend = make_backend();
    let v = serde_json::to_value(&wire).unwrap();
    let receipt = measure("cold_receive", &shared, None, move || {
        backend.receive_head(v)
    })
    .unwrap();
    assert!(receipt.durable && !receipt.applied);
    {
        let mut s = shared.0.lock().unwrap();
        *s = Session::new(Store::open(&root).unwrap());
    }
    let host = Arc::new(Windows::default());
    let runtime = Runtime::new(shared.clone(), root, host.clone()).unwrap();
    runtime.shutdown().unwrap();
    runtime.active.store(true, Ordering::Release);
    // This test measures actual 64MiB IO and foreground Session latency. Keep
    // those wall-clock assertions, but drive protocol time explicitly so a slow
    // hashing pass cannot turn a valid prepare into a five-second timeout.
    // Dedicated timeout tests advance this same clock and assert the unchanged
    // five-second production deadline. Production builds never use this clock.
    shared.0.lock().unwrap().sync_advance_clock(Duration::ZERO);
    let r = runtime.clone();
    measure("cold_quiet_prepare", &shared, None, move || r.coordinate());
    let probe = host.0.lock().unwrap().last().unwrap().clone();
    assert_eq!(probe["phase"], "probe");
    let op = probe["operationId"].as_str().unwrap().to_string();
    let token = shared.0.lock().unwrap().sync_media_token();
    runtime
        .reply(
            "main",
            WindowReply::Probe {
                operation_id: op.clone(),
                protected_note_ids: vec![],
                blocked: false,
            },
            &token,
        )
        .unwrap();
    let r = runtime.clone();
    measure("cached_quiet_plan", &shared, None, move || r.coordinate());
    assert_eq!(host.0.lock().unwrap().last().unwrap()["phase"], "prepare");
    runtime
        .reply(
            "main",
            WindowReply::Prepare {
                operation_id: op,
                ready: true,
            },
            &token,
        )
        .unwrap();
    let r = runtime.clone();
    measure("cached_quiet_apply", &shared, None, move || r.coordinate());
    let events = host.0.lock().unwrap();
    assert_eq!(events.last().unwrap()["phase"], "release");
    assert_eq!(events.last().unwrap()["outcome"], "commit");
    assert_eq!(
        shared.0.lock().unwrap().store.sync_pending_count().unwrap(),
        0
    );
}
