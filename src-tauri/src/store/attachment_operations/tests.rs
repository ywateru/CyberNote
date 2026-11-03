use super::*;
use std::process::Command;

fn owner() -> AttachmentOwner {
    AttachmentOwner {
        session: id(),
        window: "main".into(),
        incarnation: id(),
    }
}
fn fixture() -> (tempfile::TempDir, Store, String, AttachmentOwner) {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    let note = store.action(json!({"type":"createNote"})).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    (dir, store, note, owner())
}
fn attachment(value: &Value) -> Attachment {
    serde_json::from_value(value["attachment"].clone()).unwrap()
}
fn put(store: &mut Store, op: &str, note: &str, owner: &AttachmentOwner) -> Value {
    store
        .store_attachment_operation(
            op,
            note,
            owner,
            "sample.pdf",
            "application/pdf",
            b"owned-new-file",
        )
        .unwrap()
}
fn doc(a: &Attachment) -> Value {
    json!({"type":"doc","content":[{"type":"heading","attrs":{"level":1}},{"type":"attachment","attrs":{"id":a.id,"kind":a.kind,"name":a.display_name}}]})
}
fn save(store: &mut Store, note: &str, document: Value) {
    store.action(json!({"type":"saveNote","id":note,"revision":store.note(note).unwrap().revision,"document":document})).unwrap();
}
fn legacy(store: &mut Store, note: &str) -> Attachment {
    let old = store
        .store_attachment(note, "old.txt", "text/plain", b"legacy-content".to_vec())
        .unwrap();
    fs::write(
        store.root.join("attachments/legacy-orphan.bin"),
        b"legacy-orphan",
    )
    .unwrap();
    old
}
fn assert_legacy(store: &Store, old: &Attachment) {
    assert_eq!(
        fs::read(store.attachment_path(&old.relative_path).unwrap()).unwrap(),
        b"legacy-content"
    );
    assert_eq!(
        fs::read(store.root.join("attachments/legacy-orphan.bin")).unwrap(),
        b"legacy-orphan"
    );
    assert!(store.attachments().unwrap().contains(old));
}

#[test]
fn duplicate_response_loss_and_foreign_identity_do_not_create_or_overwrite() {
    let (_dir, mut store, note, owner) = fixture();
    let op = id();
    // The first return value can be dropped: the real durable query still knows it.
    drop(put(&mut store, &op, &note, &owner));
    let actual = store
        .query_attachment_operation(&op, &note, &owner)
        .unwrap();
    assert_eq!(actual["status"], "stored");
    let a = attachment(&actual);
    assert_eq!(put(&mut store, &op, &note, &owner), actual);
    assert!(store.attachments().unwrap() == vec![a.clone()]);
    assert_eq!(
        fs::read_dir(store.root.join("attachments"))
            .unwrap()
            .count(),
        1
    );
    for (name, mime, bytes) in [
        (
            "changed.pdf",
            "application/pdf",
            b"owned-new-file".as_slice(),
        ),
        ("sample.pdf", "text/plain", b"owned-new-file".as_slice()),
        (
            "sample.pdf",
            "application/pdf",
            b"different-data".as_slice(),
        ),
    ] {
        assert_eq!(
            store
                .store_attachment_operation(&op, &note, &owner, name, mime, bytes)
                .unwrap_err()
                .code,
            "attachment_operation_conflict"
        );
    }
    let mut foreign = owner.clone();
    foreign.incarnation = id();
    let another = store.action(json!({"type":"createNote"})).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    for (target, identity) in [(&note, &foreign), (&another, &owner)] {
        assert_eq!(
            store
                .query_attachment_operation(&op, target, identity)
                .unwrap_err()
                .code,
            "attachment_operation_conflict"
        );
        assert_eq!(
            store
                .cancel_attachment_operation(&op, target, identity)
                .unwrap_err()
                .code,
            "attachment_operation_conflict"
        );
        assert_eq!(
            store
                .store_attachment_operation(
                    &op,
                    target,
                    identity,
                    "sample.pdf",
                    "application/pdf",
                    b"owned-new-file"
                )
                .unwrap_err()
                .code,
            "attachment_operation_conflict"
        );
    }
    assert_eq!(
        fs::read(store.attachment_path(&a.relative_path).unwrap()).unwrap(),
        b"owned-new-file"
    );
    assert_eq!(
        store
            .query_attachment_operation(&id(), &note, &owner)
            .unwrap()["status"],
        "notPersisted"
    );
    assert_eq!(
        store
            .query_attachment_operation("not-a-uuid", &note, &owner)
            .unwrap_err()
            .code,
        "invalid"
    );
}

#[test]
fn invalid_operation_shape_and_history_limit_fail_before_new_file_creation() {
    let (_dir, mut store, note, owner) = fixture();
    for op in ["00000000-0000-1000-8000-000000000000", "NOT-AN-OPERATION"] {
        assert_eq!(
            store
                .store_attachment_operation(
                    op,
                    &note,
                    &owner,
                    "proof.pdf",
                    "application/pdf",
                    b"data"
                )
                .unwrap_err()
                .code,
            "invalid"
        );
    }
    assert!(store
        .store_attachment_operation(
            &id(),
            &note,
            &owner,
            "bad\nname",
            "application/pdf",
            b"data"
        )
        .is_err());
    let operation = id();
    // Populate only terminal history in the actual private SQLite table. This
    // fixture is deliberately not an alternative store implementation.
    store.db.execute("WITH RECURSIVE seq(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM seq WHERE x < ?1) INSERT INTO attachment_operations(operation_id,note_id,owner,attachment,state) SELECT 'terminal-fixture-'||x,?2,'{}','{}','aborted' FROM seq",params![MAX_OPERATIONS,note]).unwrap();
    assert_eq!(
        store
            .store_attachment_operation(
                &operation,
                &note,
                &owner,
                "proof.pdf",
                "application/pdf",
                b"data"
            )
            .unwrap_err()
            .code,
        "attachment_operation_limit"
    );
    assert!(store.attachments().unwrap().is_empty());
    assert_eq!(
        fs::read_dir(store.root.join("attachments"))
            .unwrap()
            .count(),
        0
    );
    assert!(store.attachment_operation(&operation).unwrap().is_none());
}

#[test]
fn cancel_is_narrow_repeatable_and_committed_documents_are_preserved() {
    let (_dir, mut store, note, owner) = fixture();
    let old = legacy(&mut store, &note);
    let op = id();
    let a = attachment(&put(&mut store, &op, &note, &owner));
    assert_eq!(
        store
            .cancel_attachment_operation(&op, &note, &owner)
            .unwrap()["status"],
        "aborted"
    );
    assert_eq!(
        store
            .cancel_attachment_operation(&op, &note, &owner)
            .unwrap()["status"],
        "aborted"
    );
    assert!(!store.attachment_path(&a.relative_path).unwrap().exists());
    assert!(!store.attachments().unwrap().contains(&a));
    assert_legacy(&store, &old);
    let committed = id();
    let a = attachment(&put(&mut store, &committed, &note, &owner));
    save(&mut store, &note, doc(&a));
    assert_eq!(
        store
            .query_attachment_operation(&committed, &note, &owner)
            .unwrap()["status"],
        "committed"
    );
    assert_eq!(
        store
            .cancel_attachment_operation(&committed, &note, &owner)
            .unwrap()["status"],
        "committed"
    );
    assert!(store.attachment_path(&a.relative_path).unwrap().exists());
    // Historical successful commits remain terminal even after a later real edit.
    save(&mut store, &note, empty_doc());
    assert_eq!(
        store
            .cancel_attachment_operation(&committed, &note, &owner)
            .unwrap()["status"],
        "committed"
    );
    assert_legacy(&store, &old);
}

#[test]
fn inconsistent_identity_is_deferred_and_never_treated_as_safe_absence() {
    let (_dir, mut store, note, owner) = fixture();
    let op = id();
    let a = attachment(&put(&mut store, &op, &note, &owner));
    // Deliberately corrupt persisted state, bypassing the actual save validator.
    let mut n = store.note(&note).unwrap();
    n.document = doc(&a);
    n.document["content"][1]["attrs"]["kind"] = json!("audio");
    store.put_note(&n).unwrap();
    assert_eq!(
        store
            .query_attachment_operation(&op, &note, &owner)
            .unwrap()["status"],
        "deferred"
    );
    assert_eq!(
        store
            .cancel_attachment_operation(&op, &note, &owner)
            .unwrap()["status"],
        "deferred"
    );
    assert!(store.attachment_path(&a.relative_path).unwrap().exists());
    n.document = empty_doc();
    store.put_note(&n).unwrap();
    store
        .db
        .execute("DELETE FROM attachments WHERE id=?1", [&a.id])
        .unwrap();
    assert_eq!(
        store
            .cancel_attachment_operation(&op, &note, &owner)
            .unwrap()["reason"],
        "attachment_metadata_missing"
    );
    assert!(store.attachment_path(&a.relative_path).unwrap().exists());
}

#[test]
fn filesystem_and_sqlite_failures_keep_recoverable_private_records() {
    let (dir, mut store, note, owner) = fixture();
    let old = legacy(&mut store, &note);
    let op = id();
    store.db.execute_batch("CREATE TEMP TRIGGER fail_attachment_insert BEFORE INSERT ON attachments BEGIN SELECT RAISE(ABORT,'fixture insert failure'); END;").unwrap();
    assert!(store
        .store_attachment_operation(
            &op,
            &note,
            &owner,
            "sample.pdf",
            "application/pdf",
            b"owned-new-file"
        )
        .is_err());
    let pending = store.attachment_operation(&op).unwrap().unwrap();
    assert_eq!(pending.state, "preparing");
    assert!(store
        .attachment_path(&pending.attachment.relative_path)
        .unwrap()
        .exists());
    assert_eq!(
        store
            .query_attachment_operation(&op, &note, &owner)
            .unwrap()["status"],
        "deferred"
    );
    assert_eq!(
        store
            .store_attachment_operation(
                &op,
                &note,
                &owner,
                "sample.pdf",
                "application/pdf",
                b"owned-new-file"
            )
            .unwrap_err()
            .code,
        "attachment_operation_incomplete"
    );
    store
        .db
        .execute_batch("DROP TRIGGER fail_attachment_insert;")
        .unwrap();
    assert_eq!(
        store
            .cancel_attachment_operation(&op, &note, &owner)
            .unwrap()["status"],
        "aborted"
    );
    assert_legacy(&store, &old);
    // A real remove_file failure must not be reported as a successful cancel.
    let op = id();
    let a = attachment(&put(&mut store, &op, &note, &owner));
    let path = store.attachment_path(&a.relative_path).unwrap();
    fs::remove_file(&path).unwrap();
    fs::create_dir(&path).unwrap();
    fs::write(path.join("unknown-child"), b"preserve").unwrap();
    assert!(store
        .cancel_attachment_operation(&op, &note, &owner)
        .is_err());
    assert_eq!(
        store.attachment_operation(&op).unwrap().unwrap().state,
        "aborting"
    );
    assert_eq!(
        store
            .query_attachment_operation(&op, &note, &owner)
            .unwrap()["status"],
        "deferred"
    );
    assert_eq!(fs::read(path.join("unknown-child")).unwrap(), b"preserve");
    // Only the fixture undoes its deliberate directory substitution.
    fs::remove_file(path.join("unknown-child")).unwrap();
    fs::remove_dir(&path).unwrap();
    drop(store);
    let store = Store::open(dir.path()).unwrap();
    assert_eq!(
        store.attachment_operation(&op).unwrap().unwrap().state,
        "aborted"
    );
    assert_legacy(&store, &old);
    drop(store);
    // Fail the first actual file open after the durable prepare by replacing
    // an otherwise empty attachments directory with a regular file.
    let (dir, mut store, note, owner) = fixture();
    fs::remove_dir(dir.path().join("attachments")).unwrap();
    fs::write(dir.path().join("attachments"), b"not-directory").unwrap();
    let op = id();
    assert!(store
        .store_attachment_operation(
            &op,
            &note,
            &owner,
            "sample.pdf",
            "application/pdf",
            b"owned-new-file"
        )
        .is_err());
    assert_eq!(
        store.attachment_operation(&op).unwrap().unwrap().state,
        "preparing"
    );
    fs::remove_file(dir.path().join("attachments")).unwrap();
    fs::create_dir(dir.path().join("attachments")).unwrap();
    drop(store);
    let store = Store::open(dir.path()).unwrap();
    assert_eq!(
        store.attachment_operation(&op).unwrap().unwrap().state,
        "aborted"
    );
}

#[test]
fn true_process_crashes_recover_at_file_and_sqlite_boundaries_preserving_legacy() {
    for stage in [
        "after_prepare",
        "after_file",
        "before_store_commit",
        "after_store_commit",
        "after_cancel_metadata",
        "after_cancel_file",
    ] {
        let (dir, mut store, note, owner) = fixture();
        let old = legacy(&mut store, &note);
        let op = id();
        drop(store);
        let status = Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "store::attachment_operations::tests::crash_worker",
                "--ignored",
            ])
            .env("NOTES_TEST_ATTACHMENT_CRASH", stage)
            .env("NOTES_TEST_ATTACHMENT_ROOT", dir.path())
            .env("NOTES_TEST_ATTACHMENT_NOTE", &note)
            .env("NOTES_TEST_ATTACHMENT_OP", &op)
            .env(
                "NOTES_TEST_ATTACHMENT_OWNER",
                serde_json::to_string(&owner).unwrap(),
            )
            .status()
            .unwrap();
        assert_eq!(status.code(), Some(78), "checkpoint not reached: {stage}");
        // Inspect the real DB before open() can perform recovery.
        let db = Connection::open(dir.path().join("notes.sqlite3")).unwrap();
        let (state, body): (String, String) = db
            .query_row(
                "SELECT state,attachment FROM attachment_operations WHERE operation_id=?1",
                [&op],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        let a: Attachment = serde_json::from_str(&body).unwrap();
        let count: i64 = db
            .query_row(
                "SELECT count(*) FROM attachments WHERE id=?1",
                [&a.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            state,
            match stage {
                "after_store_commit" => "stored",
                "after_cancel_metadata" | "after_cancel_file" => "aborting",
                _ => "preparing",
            },
            "{stage}"
        );
        assert_eq!(
            count,
            if stage == "after_store_commit" { 1 } else { 0 },
            "{stage}"
        );
        assert_eq!(
            dir.path()
                .join("attachments")
                .join(&a.relative_path)
                .exists(),
            !matches!(stage, "after_prepare" | "after_cancel_file"),
            "{stage}"
        );
        drop(db);
        let store = Store::open(dir.path()).unwrap();
        assert_eq!(
            store.attachment_operation(&op).unwrap().unwrap().state,
            "aborted",
            "{stage}"
        );
        assert!(
            !store.attachment_path(&a.relative_path).unwrap().exists(),
            "{stage}"
        );
        assert_legacy(&store, &old);
        drop(store);
        let store = Store::open(dir.path()).unwrap();
        assert_legacy(&store, &old);
    }
}

#[test]
fn cold_reopen_preserves_actual_reference_and_purge_retires_old_path() {
    let (dir, mut store, note, owner) = fixture();
    let op = id();
    let a = attachment(&put(&mut store, &op, &note, &owner));
    let document = doc(&a);
    save(&mut store, &note, document.clone());
    drop(store);
    let mut store = Store::open(dir.path()).unwrap();
    assert_eq!(
        store.attachment_operation(&op).unwrap().unwrap().state,
        "committed"
    );
    assert_eq!(store.note(&note).unwrap().document, document);
    assert_eq!(
        fs::read(store.attachment_path(&a.relative_path).unwrap()).unwrap(),
        b"owned-new-file"
    );
    store
        .action(json!({"type":"deleteNote","id":note}))
        .unwrap();
    store.action(json!({"type":"purgeNote","id":note})).unwrap();
    assert_eq!(
        store.attachment_operation(&op).unwrap().unwrap().state,
        "retired"
    );
    assert!(!store.attachment_path(&a.relative_path).unwrap().exists());
    fs::write(
        store.attachment_path(&a.relative_path).unwrap(),
        b"later-path-object",
    )
    .unwrap();
    drop(store);
    let store = Store::open(dir.path()).unwrap();
    assert_eq!(
        fs::read(store.attachment_path(&a.relative_path).unwrap()).unwrap(),
        b"later-path-object"
    );
}

#[test]
fn locked_owner_defers_cold_cleanup_and_pending_purge_collects_its_new_file() {
    let (dir, mut store, note, owner) = fixture();
    let legacy_note = store.action(json!({"type":"createNote"})).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let old = legacy(&mut store, &legacy_note);
    let op = id();
    store.db.execute_batch("CREATE TEMP TRIGGER fail_before_lock BEFORE INSERT ON attachments BEGIN SELECT RAISE(ABORT,'fixture prepare before lock'); END;").unwrap();
    assert!(store
        .store_attachment_operation(
            &op,
            &note,
            &owner,
            "sample.pdf",
            "application/pdf",
            b"owned-new-file"
        )
        .is_err());
    store
        .db
        .execute_batch("DROP TRIGGER fail_before_lock;")
        .unwrap();
    let a = store.attachment_operation(&op).unwrap().unwrap().attachment;
    store
        .action(json!({"type":"lockNote","id":note,"password":"operation-fixture-only"}))
        .unwrap();
    drop(store);
    let mut store = Store::open(dir.path()).unwrap();
    assert_eq!(
        store.attachment_operation(&op).unwrap().unwrap().state,
        "preparing"
    );
    assert!(store.attachment_path(&a.relative_path).unwrap().exists());
    assert_legacy(&store, &old);
    assert_eq!(
        store
            .query_attachment_operation(&op, &note, &owner)
            .unwrap()["reason"],
        "owner_document_locked"
    );
    store
        .action(json!({"type":"unlockNote","id":note,"password":"operation-fixture-only"}))
        .unwrap();
    // Even authorized locked documents have sealed authoritative persisted body;
    // that is deliberately not evidence of no attachment reference.
    assert_eq!(
        store
            .cancel_attachment_operation(&op, &note, &owner)
            .unwrap()["status"],
        "deferred"
    );
    drop(store);
    let (_dir, mut store, note, owner) = fixture();
    let op = id();
    store.db.execute_batch("CREATE TEMP TRIGGER fail_pending_purge BEFORE INSERT ON attachments BEGIN SELECT RAISE(ABORT,'fixture pending purge'); END;").unwrap();
    assert!(store
        .store_attachment_operation(
            &op,
            &note,
            &owner,
            "sample.pdf",
            "application/pdf",
            b"owned-new-file"
        )
        .is_err());
    store
        .db
        .execute_batch("DROP TRIGGER fail_pending_purge;")
        .unwrap();
    let a = store.attachment_operation(&op).unwrap().unwrap().attachment;
    assert!(store.attachment_path(&a.relative_path).unwrap().exists());
    store
        .action(json!({"type":"deleteNote","id":note}))
        .unwrap();
    store.action(json!({"type":"purgeNote","id":note})).unwrap();
    assert_eq!(
        store.attachment_operation(&op).unwrap().unwrap().state,
        "retired"
    );
    assert!(!store.attachment_path(&a.relative_path).unwrap().exists());
}

#[test]
#[ignore = "real subprocess worker invoked by boundary test"]
fn crash_worker() {
    let mut store = Store::open(std::env::var_os("NOTES_TEST_ATTACHMENT_ROOT").unwrap()).unwrap();
    let note = std::env::var("NOTES_TEST_ATTACHMENT_NOTE").unwrap();
    let op = std::env::var("NOTES_TEST_ATTACHMENT_OP").unwrap();
    let owner: AttachmentOwner =
        serde_json::from_str(&std::env::var("NOTES_TEST_ATTACHMENT_OWNER").unwrap()).unwrap();
    put(&mut store, &op, &note, &owner);
    store
        .cancel_attachment_operation(&op, &note, &owner)
        .unwrap();
    panic!("requested crash checkpoint was not reached");
}
