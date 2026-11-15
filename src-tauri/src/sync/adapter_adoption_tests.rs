//! Small real Stores, real ACK/commit paths, and a controlled media clock.
//! No network, accounts, large files, or wall-clock lease waits.
use super::*;
use crate::account::enrollment::Gate;

struct AckWindows {
    shared: SharedSession,
    live: Mutex<HashSet<String>>,
    events: Mutex<Vec<Value>>,
    fail_media: Mutex<bool>,
}
impl WindowHost for AckWindows {
    fn participants(&self) -> HashSet<String> {
        self.live.lock().unwrap().clone()
    }
    fn emit(&self, name: &str, event: &Value) -> Result<()> {
        if name != "notes-sync" {
            return Ok(());
        }
        self.events.lock().unwrap().push(event.clone());
        if event["phase"] == "adoptionMedia" && *self.fail_media.lock().unwrap() {
            return Err(error("synthetic_emit_failure"));
        }
        let operation = event["operationId"].as_str().unwrap().to_string();
        for window in self.participants() {
            let reply = match event["phase"].as_str() {
                Some("probe") => WindowReply::Probe {
                    operation_id: operation.clone(),
                    protected_note_ids: vec![],
                    blocked: false,
                },
                Some("prepare") => WindowReply::Prepare {
                    operation_id: operation.clone(),
                    ready: true,
                },
                _ => continue,
            };
            let mut s = self.shared.0.lock().unwrap();
            let token = s.sync_media_token();
            s.sync_reply(&window, reply, &token)?;
        }
        Ok(())
    }
}
fn fixture() -> (tempfile::TempDir, Arc<Runtime>, Arc<AckWindows>, String) {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    let note = store.action(json!({"type":"createNote"})).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    store.sync_enable(None).unwrap();
    let shared = Arc::new((Mutex::new(Session::new(store)), Condvar::new()));
    shared.0.lock().unwrap().sync_advance_clock(Duration::ZERO);
    let host = Arc::new(AckWindows {
        shared: shared.clone(),
        live: Mutex::new(HashSet::from(["main".into()])),
        events: Mutex::new(vec![]),
        fail_media: Mutex::new(false),
    });
    let runtime = Runtime::new(shared, dir.path().into(), host.clone()).unwrap();
    // Deterministic: the adopter must advance ACKs even if an ordinary worker
    // is unavailable (for example, finishing an old slow media preparation).
    runtime.shutdown().unwrap();
    (dir, runtime, host, note)
}
fn pair() -> (String, String) {
    (
        uuid::Uuid::new_v4().to_string(),
        uuid::Uuid::new_v4().to_string(),
    )
}
fn tiny_attachment(runtime: &Runtime, note: &str) -> PathBuf {
    let mut s = runtime.shared.0.lock().unwrap();
    let attachment = s
        .store
        .store_attachment(note, "tiny.png", "image/png", vec![1, 2, 3])
        .unwrap();
    let revision = s.store.note(note).unwrap().revision;
    s.store.action(json!({"type":"saveNote", "id":note, "revision":revision,
        "document":{"type":"doc", "content":[{"type":"attachment", "attrs":{"id":attachment.id, "kind":"image", "name":"tiny.png"}}]}})).unwrap();
    runtime
        .root
        .join("attachments")
        .join(attachment.relative_path)
}

#[test]
fn workspace_adoption_actual_commit_accepts_25766ms_media_without_old_apply_worker() {
    let (_dir, runtime, host, _) = fixture();
    let before = runtime.shared.0.lock().unwrap().workspace().unwrap()["notes"].clone();
    let (workspace, device) = pair();
    let shared = runtime.shared.clone();
    *runtime.before_adoption_verify.lock().unwrap() = Some(Box::new(move || {
        let mut s = shared.0.lock().unwrap();
        assert_eq!(s.sync_diagnostics()["activePhase"], "adoptionMedia");
        s.sync_advance_clock(Duration::from_millis(25_766));
    }));
    runtime
        .adopt_account_store(&workspace, &device, &Gate::default())
        .unwrap();
    let s = runtime.shared.0.lock().unwrap();
    let identity = s.store.sync_identity().unwrap().unwrap();
    assert_eq!(
        (identity.workspace_id, identity.device_id),
        (workspace, device)
    );
    assert_eq!(s.workspace().unwrap()["notes"], before);
    assert_eq!(s.sync_diagnostics()["commits"], 1);
    let events = host.events.lock().unwrap();
    assert_eq!(
        events
            .iter()
            .map(|e| e["phase"].as_str().unwrap())
            .collect::<Vec<_>>(),
        ["probe", "prepare", "adoptionMedia", "release"]
    );
    assert_eq!(events[2].as_object().unwrap().len(), 3);
    assert_eq!(events[3]["outcome"], "commit");
}

#[test]
fn workspace_adoption_late_verifier_never_commits_and_timeout_survives_coordinator_release() {
    for coordinator_releases in [false, true] {
        let (_dir, runtime, host, _) = fixture();
        let old = runtime
            .shared
            .0
            .lock()
            .unwrap()
            .store
            .sync_identity()
            .unwrap()
            .unwrap();
        let instance = runtime.shared.0.lock().unwrap().store.sync_store_instance();
        let (workspace, device) = pair();
        let controlled = runtime.clone();
        *runtime.before_adoption_verify.lock().unwrap() = Some(Box::new(move || {
            controlled
                .shared
                .0
                .lock()
                .unwrap()
                .sync_advance_clock(Duration::from_millis(60_001));
            if coordinator_releases {
                controlled.coordinate();
            }
        }));
        let error = runtime
            .adopt_account_store(&workspace, &device, &Gate::default())
            .unwrap_err();
        assert_eq!(error.code, "sync_adoption_media_timeout");
        let safe = serde_json::to_value(crate::account::types::Error::from(error).safe()).unwrap();
        assert_eq!(safe["adoptionStage"], "media");
        assert_eq!(safe["adoptionReason"], "timeout");
        let s = runtime.shared.0.lock().unwrap();
        assert_eq!(s.store.sync_identity().unwrap().unwrap(), old);
        assert_eq!(s.store.sync_store_instance(), instance);
        assert_eq!(s.sync_diagnostics()["latestAbortReason"], "timeout");
        let events = host.events.lock().unwrap();
        assert_eq!(events.iter().filter(|e| e["phase"] == "release").count(), 1);
        assert_eq!(events.last().unwrap()["outcome"], "abort");
    }
}

#[test]
fn workspace_adoption_retained_timeout_precedes_late_verifier_failure_only_for_expired_operation() {
    for expires in [true, false] {
        let (_dir, runtime, host, note) = fixture();
        let path = tiny_attachment(&runtime, &note);
        let old = runtime
            .shared
            .0
            .lock()
            .unwrap()
            .store
            .sync_identity()
            .unwrap()
            .unwrap();
        let controlled = runtime.clone();
        *runtime.before_adoption_verify.lock().unwrap() = Some(Box::new(move || {
            if expires {
                controlled
                    .shared
                    .0
                    .lock()
                    .unwrap()
                    .sync_advance_clock(Duration::from_millis(60_001));
                controlled.coordinate(); // establishes and retains the terminal first
            }
            fs::write(path, [9]).unwrap(); // verifier subsequently fails on length
        }));
        let (workspace, device) = pair();
        let failure = runtime
            .adopt_account_store(&workspace, &device, &Gate::default())
            .unwrap_err();
        assert_eq!(
            failure.code,
            if expires {
                "sync_adoption_media_timeout"
            } else {
                "sync_attachment_conflict"
            }
        );
        assert_eq!(
            runtime
                .shared
                .0
                .lock()
                .unwrap()
                .store
                .sync_identity()
                .unwrap()
                .unwrap(),
            old
        );
        assert_eq!(
            host.events.lock().unwrap().last().unwrap()["outcome"],
            "abort"
        );
    }
}

#[test]
fn workspace_adoption_media_rechecks_real_gate_window_intent_and_media_generation() {
    for scenario in ["gate", "window", "intent", "generation", "cancel"] {
        let (_dir, runtime, host, note) = fixture();
        let old = runtime
            .shared
            .0
            .lock()
            .unwrap()
            .store
            .sync_identity()
            .unwrap()
            .unwrap();
        let (workspace, device) = pair();
        let gate = Arc::new(Gate::default());
        let controlled_gate = gate.clone();
        let shared = runtime.shared.clone();
        let windows = host.clone();
        *runtime.before_adoption_verify.lock().unwrap() = Some(Box::new(move || {
            if scenario == "gate" {
                controlled_gate.close();
                return;
            }
            if scenario == "window" {
                windows.live.lock().unwrap().insert("note-new".into());
                return;
            }
            let mut s = shared.0.lock().unwrap();
            let token = s.sync_media_token();
            match scenario {
                "intent" => {
                    s.register_save(
                        "main",
                        &note,
                        "late-media-save",
                        Token {
                            note_epoch: Some(0),
                            ..token
                        },
                    )
                    .unwrap();
                }
                "generation" => {
                    s.ordinary(
                        json!({"type":"patchNote", "id":note, "pinned":true}),
                        &token,
                    )
                    .unwrap();
                }
                "cancel" => {
                    let operation = windows.events.lock().unwrap().last().unwrap()["operationId"]
                        .as_str()
                        .unwrap()
                        .to_string();
                    s.sync_reply(
                        "main",
                        WindowReply::Prepare {
                            operation_id: operation,
                            ready: false,
                        },
                        &token,
                    )
                    .unwrap();
                }
                _ => unreachable!(),
            }
        }));
        assert!(
            runtime
                .adopt_account_store(&workspace, &device, &gate)
                .is_err(),
            "{scenario}"
        );
        assert_eq!(
            runtime
                .shared
                .0
                .lock()
                .unwrap()
                .store
                .sync_identity()
                .unwrap()
                .unwrap(),
            old,
            "{scenario}"
        );
        assert_eq!(
            host.events.lock().unwrap().last().unwrap()["outcome"],
            "abort",
            "{scenario}"
        );
    }
}

#[test]
fn workspace_adoption_media_event_failure_aborts_before_verifier() {
    let (_dir, runtime, host, _) = fixture();
    let old = runtime
        .shared
        .0
        .lock()
        .unwrap()
        .store
        .sync_identity()
        .unwrap()
        .unwrap();
    *host.fail_media.lock().unwrap() = true;
    *runtime.before_adoption_verify.lock().unwrap() =
        Some(Box::new(|| panic!("failed event must not reach verifier")));
    let (workspace, device) = pair();
    assert_eq!(
        runtime
            .adopt_account_store(&workspace, &device, &Gate::default())
            .unwrap_err()
            .code,
        "synthetic_emit_failure"
    );
    assert_eq!(
        runtime
            .shared
            .0
            .lock()
            .unwrap()
            .store
            .sync_identity()
            .unwrap()
            .unwrap(),
        old
    );
    assert_eq!(
        host.events.lock().unwrap().last().unwrap()["outcome"],
        "abort"
    );
}

#[test]
fn workspace_adoption_coordinator_skips_apply_media_but_ordinary_apply_still_verifies() {
    for adoption in [true, false] {
        let (_dir, runtime, host, note) = fixture();
        let path = tiny_attachment(&runtime, &note);
        let event = {
            let mut s = runtime.shared.0.lock().unwrap();
            // A generic media verify deterministically fails, without slow IO.
            fs::write(path, [9]).unwrap();
            if adoption {
                let (workspace, device) = pair();
                s.sync_begin_workspace_adoption(&workspace, &device, host.participants())
                    .unwrap()
            } else {
                s.sync_begin(host.participants(), None).unwrap()
            }
        };
        host.emit("notes-sync", &event).unwrap();
        runtime.coordinate();
        let diagnostics = runtime.shared.0.lock().unwrap().sync_diagnostics();
        if adoption {
            assert_eq!(diagnostics["activePhase"], "prepare");
            assert_eq!(diagnostics["aborts"], 0);
        } else {
            assert_eq!(diagnostics["activePhase"], Value::Null);
            assert_eq!(diagnostics["latestAbortReason"], "mediaPrepareError");
        }
    }
}
