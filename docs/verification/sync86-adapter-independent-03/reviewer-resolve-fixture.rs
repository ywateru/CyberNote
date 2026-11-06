use super::*;
use std::sync::{atomic::AtomicUsize, Weak};

#[derive(Clone, Copy)]
enum AfterCommit {
    Unchanged,
    CloseWindow,
    ReplaceSession,
    ReplaceStore,
    AdvanceAuthorization,
    DirtyWithoutEpoch,
}
struct Windows {
    runtime: Mutex<Weak<Runtime>>,
    shared: SharedSession,
    root: PathBuf,
    live: AtomicBool,
    commits: AtomicUsize,
    after: AfterCommit,
}
impl WindowHost for Windows {
    fn participants(&self) -> HashSet<String> {
        if self.live.load(Ordering::SeqCst) {
            HashSet::from(["main".into()])
        } else {
            HashSet::new()
        }
    }
    fn emit(&self, name: &str, event: &Value) -> Result<()> {
        if name != "notes-sync" {
            return Ok(());
        }
        let runtime = self.runtime.lock().unwrap().upgrade().unwrap();
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
            "release" => {
                assert_eq!(event["outcome"], "commit");
                self.commits.fetch_add(1, Ordering::SeqCst);
                match self.after {
                    AfterCommit::Unchanged => {}
                    AfterCommit::CloseWindow => self.live.store(false, Ordering::SeqCst),
                    AfterCommit::ReplaceSession => {
                        *self.shared.0.lock().unwrap() =
                            Session::new(Store::open(&self.root).unwrap());
                    }
                    AfterCommit::ReplaceStore => {
                        self.shared.0.lock().unwrap().store = Store::open(&self.root).unwrap();
                    }
                    AfterCommit::AdvanceAuthorization => {
                        let mut s = self.shared.0.lock().unwrap();
                        let id = s.store.notes().unwrap()[0].id.clone();
                        let before = s.sync_media_token().epoch;
                        let mut unlocked = false;
                        for password in ["A-password", "B-password"] {
                            let token = s.sync_media_token();
                            if s.ordinary(json!({"type":"unlockNote","id":id,"password":password}), &token).is_ok() { unlocked = true; break; }
                        }
                        assert!(unlocked && s.sync_media_token().epoch > before);
                    }
                    AfterCommit::DirtyWithoutEpoch => {
                        let mut s = self.shared.0.lock().unwrap();
                        let token = s.sync_media_token();
                        s.ordinary(json!({"type":"createNote"}), &token).unwrap();
                        assert_eq!(s.sync_media_token().epoch, token.epoch);
                        drop(s);
                        let db = rusqlite::Connection::open(self.root.join("notes.sqlite3")).unwrap();
                        db.execute_batch("CREATE TRIGGER independent_no_reflush BEFORE UPDATE ON sync_identity BEGIN SELECT RAISE(ABORT,'postcommit must not flush'); END;").unwrap();
                    }

                }
                None
            }
            _ => unreachable!(),
        };
        if let Some(reply) = reply {
            let token = self.shared.0.lock().unwrap().sync_media_token();
            runtime.reply("main", reply, &token)?;
            // A deterministic real window pump, using production media preparation
            // and quiet coordination; no mock result or direct resolution.
            runtime.coordinate();
        }
        Ok(())
    }
}
fn note_wire(store: &mut Store, id: &str) -> WireVersion {
    store.sync_flush().unwrap();
    let version = store
        .sync_inventory()
        .unwrap()
        .into_iter()
        .find(|v| v.entity_id == id)
        .unwrap();
    store.sync_version(&version.digest).unwrap()
}
fn resolve_locked(keep_all: bool, after: AfterCommit) {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("A");
    let mut a = Store::open(&root).unwrap();
    let identity = a.sync_enable(None).unwrap();
    let mut b = Store::open(temp.path().join("B")).unwrap();
    b.sync_enable(Some(&identity.workspace_id)).unwrap();
    let id = a.action(json!({"type":"createNote"})).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    a.action(json!({"type":"saveNote","id":id,"revision":0,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"synthetic secret"}]}]}})).unwrap();
    b.sync_receive(vec![note_wire(&mut a, &id)]).unwrap();
    b.sync_apply_pending().unwrap();
    a.action(json!({"type":"lockNote","id":id,"password":"A-password"}))
        .unwrap();
    b.action(json!({"type":"lockNote","id":id,"password":"B-password"}))
        .unwrap();
    let wa = note_wire(&mut a, &id);
    let wb = note_wire(&mut b, &id);
    a.sync_receive(vec![wb.clone()]).unwrap();
    a.sync_apply_pending().unwrap();
    assert_eq!(a.sync_conflicts().unwrap()[0].versions.len(), 2);
    // Choose the other sealed branch so keep-one must change authorization too.
    let current = serde_json::to_value(a.note(&id).unwrap()).unwrap()["sealed"].clone();
    let chosen = [&wa, &wb]
        .into_iter()
        .find(|w| w.payload.as_ref().unwrap()["note"]["sealed"] != current)
        .unwrap();
    let shared = Arc::new((Mutex::new(Session::new(a)), Condvar::new()));
    let original = shared.0.lock().unwrap().sync_media_token();
    let windows = Arc::new(Windows {
        runtime: Mutex::new(Weak::new()),
        shared: shared.clone(),
        root: root.clone(),
        live: AtomicBool::new(true),
        commits: AtomicUsize::new(0),
        after,
    });
    let runtime = Runtime::new(shared.clone(), root, windows.clone()).unwrap();
    // Stop only the periodic scheduler. The synchronous WindowHost pump above
    // drives the actual Runtime reply/coordinate path without timing races.
    runtime.stopped.store(true, Ordering::Release);
    runtime
        .worker
        .lock()
        .unwrap()
        .take()
        .unwrap()
        .join()
        .unwrap();
    *windows.runtime.lock().unwrap() = Arc::downgrade(&runtime);
    let result = runtime.command(
        Command::Resolve {
            kind: EntityKind::Note,
            entity_id: id.clone(),
            digest: chosen.digest.clone(),
            keep_all,
        },
        "main",
        &original,
    );
    assert_eq!(
        windows.commits.load(Ordering::SeqCst),
        1,
        "resolution must commit exactly once"
    );
    let mut session = shared.0.lock().unwrap();
    if matches!(after, AfterCommit::Unchanged | AfterCommit::DirtyWithoutEpoch) {
        assert!(
            session.sync_media_token().epoch > original.epoch,
            "locked resolution must actually revoke and advance epoch"
        );
        let value = result.unwrap();
        assert_eq!(value["conflicts"], json!([]));
        // Ordinary Conflicts retains its original expected-token final gate.
        drop(session);
        assert_eq!(
            runtime
                .command(Command::Conflicts {}, "main", &original)
                .unwrap_err()
                .code,
            "access_changed"
        );
        session = shared.0.lock().unwrap();
    } else {
        assert_eq!(result.unwrap_err().code, "access_changed");
    }
    assert!(session.store.sync_conflicts().unwrap().is_empty());
    let notes = session.store.notes().unwrap();
    assert_eq!(notes.len(), (if keep_all { 2 } else { 1 }) + usize::from(matches!(after, AfterCommit::DirtyWithoutEpoch)));
    if matches!(after, AfterCommit::DirtyWithoutEpoch) {
        let db = rusqlite::Connection::open(windows.root.join("notes.sqlite3")).unwrap();
        assert!(db.query_row::<u64,_,_>("SELECT count(*) FROM sync_dirty", [], |r|r.get(0)).unwrap() > 0);
        println!("INDEPENDENT_RESOLVE pure_rows=true dirty_preserved=true forbidden_second_flush=true");
    }
    for note in notes.into_iter().filter(|note| note.locked) {
        assert!(note.locked);
        let sealed = serde_json::to_value(&note).unwrap()["sealed"].clone();
        let password = if wa.payload.as_ref().unwrap()["note"]["sealed"] == sealed {
            "A-password"
        } else {
            "B-password"
        };
        session
            .store
            .action(json!({"type":"unlockNote","id":note.id,"password":password}))
            .unwrap();
        assert_eq!(
            session.store.workspace().unwrap()["notes"]
                .as_array()
                .unwrap()
                .iter()
                .find(|n| n["id"] == note.id)
                .unwrap()["plainText"],
            "synthetic secret"
        );
    }
    println!("RESOLVE_RECEIPT keep_all={keep_all} commit_count=1 original_epoch={} final_epoch={} returned_success={} all_copies_decrypt=true", original.epoch, session.sync_media_token().epoch, matches!(after, AfterCommit::Unchanged | AfterCommit::DirtyWithoutEpoch));
    drop(session);
    runtime.shutdown().unwrap();
}
#[test]
fn locked_keep_all_returns_committed_rows_after_real_epoch_change() {
    resolve_locked(true, AfterCommit::Unchanged);
}
#[test]
fn locked_keep_one_returns_committed_rows_after_real_epoch_change() {
    resolve_locked(false, AfterCommit::Unchanged);
}
#[test]
fn committed_resolve_rejects_closed_current_window() {
    resolve_locked(true, AfterCommit::CloseWindow);
}
#[test]
fn committed_resolve_rejects_replaced_session() {
    resolve_locked(true, AfterCommit::ReplaceSession);
}
#[test]
fn committed_resolve_rejects_reopened_store_in_same_session() {
    resolve_locked(true, AfterCommit::ReplaceStore);
}

#[test]
fn independent_committed_resolve_rejects_extra_real_unlock_epoch() {
    resolve_locked(true, AfterCommit::AdvanceAuthorization);
}
#[test]
fn independent_committed_resolve_reads_rows_without_reflushing_new_dirty() {
    resolve_locked(true, AfterCommit::DirtyWithoutEpoch);
}
