//! The same Session methods reached by lib.rs, before barrier/state/file writes.
use super::*;
use std::{fs, path::Path};

fn token(s: &Session, note: Option<&str>) -> Token {
    Token {
        session_id: s.id.clone(),
        epoch: s.epoch,
        note_epoch: note.map(|id| s.note_epoch(id)),
    }
}
fn code<T>(result: Result<T>) -> String {
    match result {
        Err(e) => e.code,
        Ok(_) => panic!("expected failure"),
    }
}
fn smart(store: &mut Store) {
    store.create_smart_folder(json!({"name":"internal only","query":{"version":1,"combine":"all","rules":[{"type":"pinned","value":true}]}})).unwrap();
}
fn bytes(root: &Path) -> Vec<(String, Vec<u8>)> {
    let mut out: Vec<_> = fs::read_dir(root.join("attachments"))
        .unwrap()
        .map(|e| {
            let p = e.unwrap().path();
            (
                p.file_name().unwrap().to_string_lossy().into_owned(),
                fs::read(p).unwrap(),
            )
        })
        .collect();
    out.sort();
    out
}

#[test]
fn smart_live_database_closes_all_session_and_lib_seams_before_side_effects() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("live");
    let mut s = Session::new(Store::open(&root).unwrap());
    let n = s
        .ordinary(json!({"type":"createNote"}), &token(&s, None))
        .unwrap()
        .0["id"]
        .as_str()
        .unwrap()
        .to_string();
    let access = token(&s, Some(&n));
    s.register_save("main", &n, "keep-intent", access.clone())
        .unwrap();
    let op = Uuid::new_v4().to_string();
    s.store_attachment_operation(
        "main",
        &op,
        &n,
        "keep.txt",
        "text/plain",
        b"keep",
        &access,
        None,
    )
    .unwrap();
    // Internal Store API is intentionally available to the next implementation
    // layer; all old renderer-facing Session seams close as soon as it is used.
    smart(&mut s.store);
    let before = s.store.workspace().unwrap();
    let files = bytes(&root);
    let intents = s.intents.len();
    let windows = s.attachment_windows.clone();
    let epoch = s.epoch;
    assert_eq!(code(s.workspace()), "capability_unavailable");
    assert_eq!(code(s.snapshot()), "capability_unavailable");
    assert_eq!(code(s.check(&access, Some(&n))), "capability_unavailable");
    assert_eq!(code(s.sensitive(&n, &access)), "capability_unavailable");
    assert_eq!(
        code(s.register_save("main", &n, "new-intent", access.clone())),
        "capability_unavailable"
    );
    assert_eq!(code(s.save("main",json!({"type":"saveNote","id":n,"saveIntent":"keep-intent","revision":0,"document":{"type":"doc","content":[{"type":"paragraph"}]}}))),"capability_unavailable");
    assert_eq!(s.intents.len(), intents);
    assert!(s.intents.contains_key("keep-intent"));
    assert_eq!(
        code(s.ordinary(json!({"type":"createNote"}), &token(&s, None))),
        "capability_unavailable"
    );
    assert_eq!(
        code(s.begin(
            json!({"type":"deleteNote","id":n}),
            HashSet::new(),
            &token(&s, None)
        )),
        "capability_unavailable"
    );
    assert!(s.pending.is_none());
    assert_eq!(
        code(s.store_attachment_operation(
            "new-window",
            &Uuid::new_v4().to_string(),
            &n,
            "no.txt",
            "text/plain",
            b"no",
            &access,
            None
        )),
        "capability_unavailable"
    );
    assert_eq!(
        code(s.query_attachment_operation("main", &op, &n, &access)),
        "capability_unavailable"
    );
    assert_eq!(
        code(s.cancel_attachment_operation("main", &op, &n, &access)),
        "capability_unavailable"
    );
    let export = temp.path().join("keep.notesbackup");
    fs::write(&export, b"prior export").unwrap();
    // lib export_archive delegates to this real method after its explicit gate.
    assert_eq!(
        code(s.export_archive(&export, &token(&s, None))),
        "capability_unavailable"
    );
    assert_eq!(fs::read(export).unwrap(), b"prior export");
    assert_eq!(s.store.workspace().unwrap(), before);
    assert_eq!(bytes(&root), files);
    assert_eq!(s.attachment_windows, windows);
    assert_eq!(s.epoch, epoch);
    // Cleanup remains possible without reading or modifying smart data.
    s.forget_attachment_window("main");
    assert!(!s.attachment_windows.contains_key("main"));
}

#[test]
fn smart_import_is_rejected_before_prepare_and_rechecked_from_actual_finish_bytes() {
    let temp = tempfile::tempdir().unwrap();
    let mut source = Store::open(temp.path().join("source")).unwrap();
    source.action(json!({"type":"createNote"})).unwrap();
    let plain = temp.path().join("plain.notesbackup");
    source.export_archive(&plain).unwrap();
    smart(&mut source);
    let smart_path = temp.path().join("smart.notesbackup");
    source.export_archive(&smart_path).unwrap();
    let root = temp.path().join("target");
    let mut s = Session::new(Store::open(&root).unwrap());
    let before = s.workspace().unwrap();
    let files = bytes(&root);
    let epoch = s.epoch;
    assert_eq!(
        code(s.begin(
            json!({"type":"importArchive","path":smart_path}),
            HashSet::new(),
            &token(&s, None)
        )),
        "capability_unavailable"
    );
    assert!(s.pending.is_none());
    assert_eq!(s.workspace().unwrap(), before);
    assert_eq!(s.epoch, epoch);
    assert!(!root.join(".imports").exists());
    let event = s
        .begin(
            json!({"type":"importArchive","path":plain}),
            HashSet::new(),
            &token(&s, None),
        )
        .unwrap();
    let operation = event["operationId"].as_str().unwrap();
    assert_eq!(event["phase"], "prepare");
    assert!(s.ready());
    // Replace the chosen archive after preflight. finish parses once again and
    // rejects before recover_imports/staging/file publication/SQL mutation.
    fs::write(&plain, fs::read(&smart_path).unwrap()).unwrap();
    let (result, event) = s.finish(operation, &HashSet::new(), false).unwrap();
    assert_eq!(code(result), "capability_unavailable");
    assert_eq!(event["phase"], "abort");
    assert!(s.pending.is_none());
    assert_eq!(s.workspace().unwrap(), before);
    assert_eq!(bytes(&root), files);
    assert_eq!(s.epoch, epoch);
    assert!(!root.join(".imports").exists());
    // Existing ordinary archive behavior remains reachable through the same
    // public begin/finish path when the input has no smart definitions.
    let normal = Store::open(temp.path().join("normal")).unwrap();
    normal.export_archive(&plain).unwrap();
    let event = s
        .begin(
            json!({"type":"importArchive","path":plain}),
            HashSet::new(),
            &token(&s, None),
        )
        .unwrap();
    let (result, event) = s
        .finish(
            event["operationId"].as_str().unwrap(),
            &HashSet::new(),
            false,
        )
        .unwrap();
    result.unwrap();
    assert_eq!(event["phase"], "commit");
}
