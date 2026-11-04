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

#[test]
fn conflict_copy_obeys_live_session_source_epoch_and_prepare() {
    let (_dir, mut s, id) = setup();
    let action = json!({"type":"recoverConflictCopy","id":id,"revision":0,"document":document("LOCAL PENDING COPY")});
    let before = s.workspace().unwrap();
    let mut stale = token(&s, Some(&id));
    stale.note_epoch = Some(999);
    assert!(s.ordinary(action.clone(), &stale).is_err());
    assert_eq!(s.workspace().unwrap(), before);
    let mut stale = token(&s, Some(&id));
    stale.epoch = 999;
    assert!(s.ordinary(action.clone(), &stale).is_err());
    let op = begin(&mut s, json!({"type":"deleteNote","id":id}));
    assert!(s.ordinary(action.clone(), &token(&s, Some(&id))).is_err());
    s.acknowledge(&op, "main", false).unwrap();
    let (result, event) = s.finish(&op, &windows(), false).unwrap();
    assert!(result.is_err());
    assert_eq!(event["phase"], "abort");
    let copy = s.ordinary(action.clone(), &token(&s, Some(&id))).unwrap().0;
    assert_ne!(copy["id"], id);
    assert_eq!(
        s.store.note(&id).unwrap().document,
        document("PRIVATE INITIAL")
    );
    assert_eq!(copy["document"], document("LOCAL PENDING COPY"));
    let old = token(&s, Some(&id));
    commit(&mut s, json!({"type":"deleteNote","id":id}));
    let count = s.store.notes().unwrap().len();
    assert!(s.ordinary(action.clone(), &old).is_err());
    assert!(s.ordinary(action, &token(&s, Some(&id))).is_err());
    assert_eq!(s.store.notes().unwrap().len(), count);
}

#[test]
fn attachment_owner_uses_real_session_window_incarnation_and_current_access() {
    let (_dir, mut s, id) = setup();
    let op = Uuid::new_v4().to_string();
    let value = s
        .store_attachment_operation(
            "main",
            &op,
            &id,
            "proof.pdf",
            "application/pdf",
            b"local-only",
            &token(&s, Some(&id)),
            None,
        )
        .unwrap();
    assert_eq!(value["status"], "stored");
    assert_eq!(value["access"]["sessionId"], s.id);
    for query in [true, false] {
        let response = if query {
            s.query_attachment_operation("note-real-second", &op, &id, &token(&s, Some(&id)))
        } else {
            s.cancel_attachment_operation("note-real-second", &op, &id, &token(&s, Some(&id)))
        };
        assert_eq!(response.unwrap_err().code, "attachment_operation_conflict");
    }
    let mut stale = token(&s, Some(&id));
    stale.note_epoch = Some(900);
    assert_eq!(
        s.query_attachment_operation("main", &op, &id, &stale)
            .unwrap_err()
            .code,
        "access_changed"
    );
    let mut stale = token(&s, Some(&id));
    stale.session_id = Uuid::new_v4().to_string();
    assert_eq!(
        s.cancel_attachment_operation("main", &op, &id, &stale)
            .unwrap_err()
            .code,
        "access_changed"
    );
    let barrier = begin(&mut s, json!({"type":"deleteNote","id":id}));
    assert_eq!(
        s.query_attachment_operation("main", &op, &id, &token(&s, Some(&id)))
            .unwrap_err()
            .code,
        "access_changed"
    );
    assert_eq!(
        s.cancel_attachment_operation("main", &op, &id, &token(&s, Some(&id)))
            .unwrap_err()
            .code,
        "access_changed"
    );
    s.acknowledge(&barrier, "main", false).unwrap();
    assert!(s.finish(&barrier, &windows(), false).unwrap().0.is_err());
    assert_eq!(
        s.query_attachment_operation("main", &op, &id, &token(&s, Some(&id)))
            .unwrap()["status"],
        "stored"
    );
    s.forget_attachment_window("main");
    assert_eq!(
        s.query_attachment_operation("main", &op, &id, &token(&s, Some(&id)))
            .unwrap_err()
            .code,
        "attachment_operation_conflict"
    );
    // Same real label in a later Session cannot assume the previous ownership.
    let mut fresh = Session::new(s.store);
    assert_eq!(
        fresh
            .query_attachment_operation("main", &op, &id, &token(&fresh, Some(&id)))
            .unwrap_err()
            .code,
        "attachment_operation_conflict"
    );
}

#[test]
fn attachment_cancel_waits_for_other_windows_registered_save_and_retains_committed_ref() {
    let (_dir, mut s, id) = setup();
    let op = Uuid::new_v4().to_string();
    let value = s
        .store_attachment_operation(
            "main",
            &op,
            &id,
            "proof.pdf",
            "application/pdf",
            b"local-only",
            &token(&s, Some(&id)),
            None,
        )
        .unwrap();
    let attachment = value["attachment"].clone();
    s.register_save(
        "note-real-second",
        &id,
        "other-window-pending",
        token(&s, Some(&id)),
    )
    .unwrap();
    assert_eq!(
        s.cancel_attachment_operation("main", &op, &id, &token(&s, Some(&id)))
            .unwrap()["status"],
        "deferred"
    );
    assert!(s
        .store
        .read_attachment(attachment["id"].as_str().unwrap())
        .is_ok());
    s.save("note-real-second",json!({"type":"saveNote","id":id,"saveIntent":"other-window-pending","revision":1,"document":document("drained without attachment")})).unwrap();
    assert_eq!(
        s.cancel_attachment_operation("main", &op, &id, &token(&s, Some(&id)))
            .unwrap()["status"],
        "aborted"
    );
    assert!(s
        .store
        .read_attachment(attachment["id"].as_str().unwrap())
        .is_err());
    let op = Uuid::new_v4().to_string();
    let attachment = s
        .store_attachment_operation(
            "main",
            &op,
            &id,
            "proof.pdf",
            "application/pdf",
            b"local-only",
            &token(&s, Some(&id)),
            None,
        )
        .unwrap()["attachment"]
        .clone();
    let doc = json!({"type":"doc","content":[{"type":"heading","attrs":{"level":1}},{"type":"attachment","attrs":{"id":attachment["id"],"kind":attachment["kind"],"name":attachment["displayName"]}}]});
    save(&mut s, "main", &id, "actual-reference", 2, doc);
    s.register_save(
        "note-real-second",
        &id,
        "future-pending",
        token(&s, Some(&id)),
    )
    .unwrap();
    assert_eq!(
        s.cancel_attachment_operation("main", &op, &id, &token(&s, Some(&id)))
            .unwrap()["status"],
        "committed"
    );
    assert!(s
        .store
        .read_attachment(attachment["id"].as_str().unwrap())
        .is_ok());
}

#[test]
fn recorded_at_retains_session_and_note_authority() {
    let (_dir, mut s, id) = setup();
    let op = Uuid::new_v4().to_string();
    let initial = token(&s, Some(&id));
    let stored = s
        .store_attachment_operation(
            "main",
            &op,
            &id,
            "新录音.webm",
            "audio/webm",
            b"synthetic-only",
            &initial,
            Some(1793743199123),
        )
        .unwrap();
    let aid = stored["attachment"]["id"].as_str().unwrap();
    s.sensitive(&s.store.attachment_note(aid).unwrap(), &initial)
        .unwrap();
    assert_eq!(
        s.store.read_attachment(aid).unwrap()["recordedAt"],
        1793743199123u64
    );
    assert_eq!(
        s.query_attachment_operation("note-real-second", &op, &id, &initial)
            .unwrap_err()
            .code,
        "attachment_operation_conflict"
    );
    let barrier = begin(
        &mut s,
        json!({"type":"lockNote", "id":id, "password":PASSWORD}),
    );
    assert_eq!(
        s.sensitive(&id, &initial).unwrap_err().code,
        "access_changed"
    );
    assert_eq!(
        s.query_attachment_operation("main", &op, &id, &initial)
            .unwrap_err()
            .code,
        "access_changed"
    );
    assert_eq!(
        s.store_attachment_operation(
            "main",
            &op,
            &id,
            "新录音.webm",
            "audio/webm",
            b"synthetic-only",
            &initial,
            Some(1793743199123)
        )
        .unwrap_err()
        .code,
        "access_changed"
    );
    s.acknowledge(&barrier, "main", false).unwrap();
    assert!(s.finish(&barrier, &windows(), false).unwrap().0.is_err());
    let fresh = token(&s, Some(&id));
    s.sensitive(&id, &fresh).unwrap();
    assert_eq!(
        s.query_attachment_operation("main", &op, &id, &fresh)
            .unwrap()["attachment"]["recordedAt"],
        1793743199123u64
    );
}
