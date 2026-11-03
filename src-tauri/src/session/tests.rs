use super::*;
use std::path::Path;

const PASSWORD: &str = "FIX03-synthetic-only-2026";
fn document(text: &str) -> Value {
    json!({"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"PUBLIC TEST TITLE"}]},{"type":"paragraph","content":[{"type":"text","text":text}]}]})
}
fn token(s: &Session, id: Option<&str>) -> Token {
    Token {
        session_id: s.id.clone(),
        epoch: s.epoch,
        note_epoch: id.map(|id| s.note_epoch(id)),
    }
}
fn windows() -> HashSet<String> {
    ["main".into(), "note-real-second".into()].into()
}
fn setup() -> (tempfile::TempDir, Session, String) {
    let dir = tempfile::tempdir().unwrap();
    let mut s = Session::new(Store::open(dir.path()).unwrap());
    let n = s
        .ordinary(json!({"type":"createNote"}), &token(&s, None))
        .unwrap()
        .0;
    let id = n["id"].as_str().unwrap().to_string();
    save(
        &mut s,
        "main",
        &id,
        "initial",
        0,
        document("PRIVATE INITIAL"),
    );
    (dir, s, id)
}
fn save(s: &mut Session, window: &str, id: &str, ticket: &str, revision: i64, doc: Value) -> Value {
    s.register_save(window, id, ticket, token(s, Some(id)))
        .unwrap();
    s.save(
        window,
        json!({"type":"saveNote","id":id,"saveIntent":ticket,"revision":revision,"document":doc}),
    )
    .unwrap()
}
fn begin(s: &mut Session, action: Value) -> String {
    let event = s.begin(action, windows(), &token(s, None)).unwrap();
    assert_eq!(
        event["participantWindows"],
        json!(["main", "note-real-second"])
    );
    event["operationId"].as_str().unwrap().to_string()
}
fn commit(s: &mut Session, action: Value) -> Value {
    let op = begin(s, action);
    for w in windows() {
        s.acknowledge(&op, &w, true).unwrap();
    }
    let (result, event) = s.finish(&op, &windows(), false).unwrap();
    assert_eq!(event["phase"], "commit");
    result.unwrap()
}
fn note<'a>(workspace: &'a Value, id: &str) -> &'a Value {
    workspace["notes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["id"] == id)
        .unwrap()
}

#[test]
fn registered_save_drains_before_two_window_commit_and_old_access_expires() {
    let (_dir, mut s, id) = setup();
    let old = token(&s, Some(&id));
    s.register_save("note-real-second", &id, "drain", old.clone())
        .unwrap();
    let op = begin(
        &mut s,
        json!({"type":"lockNote","id":id,"password":PASSWORD}),
    );
    assert!(!s
        .workspace()
        .unwrap()
        .to_string()
        .contains("PRIVATE INITIAL"));
    assert!(s.sensitive(&id, &old).is_err());
    assert!(s
        .register_save("main", &id, "late-register", old.clone())
        .is_err());
    s.acknowledge(&op, "main", true).unwrap();
    assert!(!s.ready());
    let saved=s.save("note-real-second",json!({"type":"saveNote","id":id,"saveIntent":"drain","revision":1,"document":document("PRIVATE DRAINED")})).unwrap();
    assert_eq!(saved["revision"], 2);
    assert!(!saved.to_string().contains("PRIVATE DRAINED"));
    s.acknowledge(&op, "note-real-second", true).unwrap();
    assert!(s.ready());
    let (result, event) = s.finish(&op, &windows(), false).unwrap();
    assert_eq!(event["phase"], "commit");
    assert!(!result.unwrap().to_string().contains("PRIVATE"));
    assert!(s.check(&old, Some(&id)).is_err());
    assert!(s.store.note_text(&id).is_err());
    assert!(s.register_save("main", &id, "post-commit", old).is_err());
    s.ordinary(
        json!({"type":"unlockNote","id":id,"password":PASSWORD}),
        &token(&s, None),
    )
    .unwrap();
    assert!(s.store.note_text(&id).unwrap()["text"]
        .as_str()
        .unwrap()
        .contains("PRIVATE DRAINED"));
}

#[test]
fn pending_intent_cannot_ack_and_failed_barrier_preserves_authorization_and_retry() {
    let (_dir, mut s, id) = setup();
    let before = s.snapshot().unwrap();
    s.register_save(
        "note-real-second",
        &id,
        "still-pending",
        token(&s, Some(&id)),
    )
    .unwrap();
    let op = begin(
        &mut s,
        json!({"type":"lockNote","id":id,"password":PASSWORD}),
    );
    s.acknowledge(&op, "note-real-second", true).unwrap();
    let (result, event) = s.finish(&op, &windows(), false).unwrap();
    assert!(result.is_err());
    assert_eq!(event["phase"], "abort");
    assert_eq!(s.snapshot().unwrap(), before);
    assert!(s.intents.contains_key("still-pending"));
    s.save("note-real-second",json!({"type":"saveNote","id":id,"saveIntent":"still-pending","revision":1,"document":document("PRIVATE RETRY PRESERVED")})).unwrap();
    assert!(s
        .store
        .note_text(&id)
        .unwrap()
        .to_string()
        .contains("PRIVATE RETRY PRESERVED"));
}

#[test]
fn real_revision_conflict_forces_abort_even_if_window_claims_success() {
    let (_dir, mut s, id) = setup();
    let before = s.snapshot().unwrap();
    s.register_save("note-real-second", &id, "conflict", token(&s, Some(&id)))
        .unwrap();
    let op = begin(
        &mut s,
        json!({"type":"lockNote","id":id,"password":PASSWORD}),
    );
    let error=s.save("note-real-second",json!({"type":"saveNote","id":id,"saveIntent":"conflict","revision":0,"document":document("PRIVATE CONFLICT PENDING")})).unwrap_err();
    assert_eq!(error.code, "conflict");
    for w in windows() {
        s.acknowledge(&op, &w, true).unwrap();
    }
    let (result, event) = s.finish(&op, &windows(), false).unwrap();
    assert!(result.is_err());
    assert_eq!(event["phase"], "abort");
    assert_eq!(s.snapshot().unwrap(), before);
    assert_eq!(s.store.note(&id).unwrap().revision, 1);
    save(
        &mut s,
        "note-real-second",
        &id,
        "conflict-retry",
        1,
        document("PRIVATE CONFLICT PENDING"),
    );
    assert!(s
        .store
        .note_text(&id)
        .unwrap()
        .to_string()
        .contains("PRIVATE CONFLICT PENDING"));
}

#[test]
fn timeout_missing_window_and_failed_ack_never_commit() {
    for case in 0..3 {
        let (_dir, mut s, id) = setup();
        let before = s.snapshot().unwrap();
        let op = begin(
            &mut s,
            json!({"type":"lockNote","id":id,"password":PASSWORD}),
        );
        s.acknowledge(&op, "main", true).unwrap();
        if case == 1 {
            s.acknowledge(&op, "note-real-second", true).unwrap();
        }
        if case == 2 {
            s.acknowledge(&op, "note-real-second", false).unwrap();
        }
        let live = if case == 1 {
            ["main".into()].into()
        } else {
            windows()
        };
        let (result, event) = s.finish(&op, &live, case == 0).unwrap();
        assert!(result.is_err());
        assert_eq!(event["phase"], "abort");
        assert_eq!(s.snapshot().unwrap(), before);
        assert!(s.store.note_text(&id).is_ok());
    }
}

#[test]
fn close_locks_rejects_late_commands_and_delete_response_cannot_publish_decrypted_body() {
    let (_dir, mut s, id) = setup();
    commit(
        &mut s,
        json!({"type":"lockNote","id":id,"password":PASSWORD}),
    );
    s.ordinary(
        json!({"type":"unlockNote","id":id,"password":PASSWORD}),
        &token(&s, None),
    )
    .unwrap();
    let old = token(&s, Some(&id));
    commit(&mut s, json!({"type":"closeLocks"}));
    assert!(s.sensitive(&id, &old).is_err());
    assert!(s
        .ordinary(json!({"type":"removeLock","id":id}), &token(&s, None))
        .is_err());
    assert!(s.store.note_text(&id).is_err());
    s.ordinary(
        json!({"type":"unlockNote","id":id,"password":PASSWORD}),
        &token(&s, None),
    )
    .unwrap();
    let response = commit(&mut s, json!({"type":"deleteNote","id":id}));
    assert_eq!(note(&response, &id)["locked"], true);
    assert!(!response.to_string().contains("PRIVATE INITIAL"));
    assert!(!s.store.authorized(&id).unwrap());
}

#[test]
fn window_identity_and_session_identity_cannot_be_supplied_by_saved_action() {
    let (_dir, mut s, id) = setup();
    let mut forged = token(&s, Some(&id));
    forged.session_id = "previous-process".into();
    assert!(s.register_save("main", &id, "forged", forged).is_err());
    s.register_save("main", &id, "owned", token(&s, Some(&id)))
        .unwrap();
    assert!(s.save("note-real-second",json!({"type":"saveNote","id":id,"saveIntent":"owned","revision":1,"document":document("PRIVATE OTHER WINDOW")})).is_err());
    assert!(s.intents.contains_key("owned"));
    let op = begin(
        &mut s,
        json!({"type":"lockNote","id":id,"password":PASSWORD}),
    );
    assert!(s.acknowledge(&op, "renderer-forged-window", true).is_err());
}

#[test]
fn frozen_ciphertexts_validate_after_decrypt_before_publishing_key() {
    let base =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../docs/verification/app-001-fix-03/fixtures");
    for (name, valid) in [
        ("valid-rich", true),
        ("valid-drawing", true),
        ("invalid-structure", false),
        ("invalid-drawing-attribute", false),
    ] {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Session::new(Store::open(dir.path()).unwrap());
        s.store
            .import_archive(&base.join(format!("{name}.notesbackup")))
            .unwrap();
        let raw = s.store.notes().unwrap().remove(0);
        let id = raw.id.clone();
        let before = s.workspace().unwrap();
        assert!(!before.to_string().contains("PRIVATE-"));
        assert!(s
            .ordinary(
                json!({"type":"unlockNote","id":id,"password":"incorrect"}),
                &token(&s, None)
            )
            .is_err());
        assert_eq!(s.workspace().unwrap(), before);
        let unlocked = s.ordinary(
            json!({"type":"unlockNote","id":id,"password":PASSWORD}),
            &token(&s, None),
        );
        if !valid {
            assert_eq!(unlocked.unwrap_err().code, "archive_invalid");
            assert_eq!(s.workspace().unwrap(), before);
            assert_eq!(s.store.note(&id).unwrap().sealed, raw.sealed);
            assert!(!s.store.authorized(&id).unwrap());
            continue;
        }
        let expected: Value = serde_json::from_slice(
            &std::fs::read(base.join(format!("{name}.document.json"))).unwrap(),
        )
        .unwrap();
        let response = unlocked.unwrap().0;
        assert_eq!(note(&response, &id)["document"], expected);
        save(
            &mut s,
            "main",
            &id,
            "reencrypt",
            raw.revision,
            expected.clone(),
        );
        assert_ne!(s.store.note(&id).unwrap().sealed, raw.sealed);
        assert!(!s
            .store
            .note(&id)
            .unwrap()
            .document
            .to_string()
            .contains("PRIVATE-"));
        commit(&mut s, json!({"type":"closeLocks"}));
        drop(s);
        let mut s = Session::new(Store::open(dir.path()).unwrap());
        assert!(!s.workspace().unwrap().to_string().contains("PRIVATE-"));
        s.ordinary(
            json!({"type":"unlockNote","id":id,"password":PASSWORD}),
            &token(&s, None),
        )
        .unwrap();
        assert_eq!(note(&s.workspace().unwrap(), &id)["document"], expected);
    }
}

#[test]
fn live_schema_rejects_invalid_saves_without_changing_revision_or_body() {
    let (_dir, mut s, id) = setup();
    let before = s.store.note(&id).unwrap().document;
    for (i,doc) in [json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"paragraph"}]}]}),json!({"type":"doc","content":[{"type":"drawing","attrs":{"strokes":[{"tool":"spray","color":"#000","width":2,"points":[[1,2]]}]}}]})].into_iter().enumerate() {
        let ticket=format!("invalid-{i}");
        s.register_save("main",&id,&ticket,token(&s,Some(&id))).unwrap();
        assert_eq!(s.save("main",json!({"type":"saveNote","id":id,"saveIntent":ticket,"revision":1,"document":doc})).unwrap_err().code,"archive_invalid");
        assert_eq!(s.store.note(&id).unwrap().revision,1);
        assert_eq!(s.store.note(&id).unwrap().document,before);
    }
}
