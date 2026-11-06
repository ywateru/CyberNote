use super::*;
use std::collections::BTreeMap;

const START: u64 = 1_793_743_199_123;
const AUDIO: &[u8] = b"synthetic-audio-bytes-only";
fn setup() -> (tempfile::TempDir, Store, String, AttachmentOwner) {
    setup_in(None)
}
fn setup_in(subdirectory: Option<&str>) -> (tempfile::TempDir, Store, String, AttachmentOwner) {
    let dir = tempfile::tempdir().unwrap();
    let root = subdirectory.map_or_else(|| dir.path().to_path_buf(), |name| dir.path().join(name));
    let mut store = Store::open(root).unwrap();
    let note = store.action(json!({"type":"createNote"})).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let owner = AttachmentOwner {
        session: id(),
        window: "main".into(),
        incarnation: id(),
    };
    (dir, store, note, owner)
}
fn put(
    store: &mut Store,
    note: &str,
    owner: &AttachmentOwner,
    op: &str,
    date: Option<u64>,
) -> Value {
    store
        .store_attachment_operation(op, note, owner, "新录音.webm", "audio/webm", AUDIO, date)
        .unwrap()
}
fn body(store: &Store, table: &str, key: &str, id: &str) -> String {
    store
        .db
        .query_row(
            &format!(
                "SELECT {} FROM {} WHERE {}=?1",
                if table == "attachments" {
                    "body"
                } else {
                    "attachment"
                },
                table,
                key
            ),
            [id],
            |r| r.get(0),
        )
        .unwrap()
}
fn files(store: &Store) -> BTreeMap<String, Vec<u8>> {
    fs::read_dir(store.root.join("attachments"))
        .unwrap()
        .map(|entry| {
            let p = entry.unwrap().path();
            (
                p.file_name().unwrap().to_str().unwrap().to_string(),
                fs::read(p).unwrap(),
            )
        })
        .collect()
}
fn save(store: &mut Store, note: &str, attachment: &Value) {
    store.action(json!({"type":"saveNote","id":note,"revision":store.note(note).unwrap().revision,"document":{"type":"doc","content":[{"type":"paragraph"},{"type":"attachment","attrs":{"id":attachment["id"],"kind":"audio","name":"新录音.webm"}}]}})).unwrap();
}

#[test]
fn recorded_at_operation_snapshot_reopen_and_full_identity() {
    let (dir, mut store, note, owner) = setup();
    let op = id();
    let first = put(&mut store, &note, &owner, &op, Some(START));
    let a = &first["attachment"];
    let aid = a["id"].as_str().unwrap();
    assert_eq!(a["recordedAt"], START);
    let public = body(&store, "attachments", "id", aid);
    let journal = body(&store, "attachment_operations", "operation_id", &op);
    assert_eq!(public, journal);
    let before = files(&store);
    for date in [None, Some(START + 1)] {
        assert_eq!(
            store
                .store_attachment_operation(
                    &op,
                    &note,
                    &owner,
                    "新录音.webm",
                    "audio/webm",
                    AUDIO,
                    date
                )
                .unwrap_err()
                .code,
            "attachment_operation_conflict"
        );
        assert_eq!(body(&store, "attachments", "id", aid), public);
        assert_eq!(
            body(&store, "attachment_operations", "operation_id", &op),
            journal
        );
        assert_eq!(files(&store), before);
    }
    save(&mut store, &note, a);
    drop(store);
    let mut store = Store::open(dir.path()).unwrap();
    let recovered = put(&mut store, &note, &owner, &op, Some(START));
    assert_eq!(recovered["status"], "committed");
    assert_eq!(recovered["attachment"], first["attachment"]);
    assert_eq!(store.read_attachment(aid).unwrap()["recordedAt"], START);
    assert_eq!(files(&store), before);
    assert_eq!(body(&store, "attachments", "id", aid), public);
}

#[test]
fn recorded_at_old_unknown_and_invalid_persisted_values_are_not_rewritten() {
    let (dir, mut store, note, owner) = setup();
    let old = store
        .store_attachment(&note, "external.webm", "audio/webm", AUDIO.to_vec())
        .unwrap();
    let old_body = body(&store, "attachments", "id", &old.id);
    assert!(!old_body.contains("recordedAt"));
    let old_op = id();
    let operation = put(&mut store, &note, &owner, &old_op, None);
    let journal = body(&store, "attachment_operations", "operation_id", &old_op);
    assert!(!journal.contains("recordedAt"));
    let old_file = store.attachment_path(&old.relative_path).unwrap();
    let modified = fs::metadata(&old_file).unwrap().modified().unwrap();
    drop(store);
    let store = Store::open(dir.path()).unwrap();
    assert!(store.read_attachment(&old.id).unwrap()["recordedAt"].is_null());
    assert!(store
        .query_attachment_operation(&old_op, &note, &owner)
        .unwrap()["attachment"]["recordedAt"]
        .is_null());
    assert_eq!(body(&store, "attachments", "id", &old.id), old_body);
    assert_eq!(
        body(&store, "attachment_operations", "operation_id", &old_op),
        journal
    );
    assert_eq!(
        fs::metadata(&old_file).unwrap().modified().unwrap(),
        modified
    );
    let before = files(&store);
    for date in [
        json!("2026-11-04"),
        json!(1.25),
        json!(-1),
        json!(MAX_RECORDED_AT + 1),
    ] {
        let mut value = serde_json::to_value(&old).unwrap();
        value["recordedAt"] = date.clone();
        let bad = value.to_string();
        store
            .db
            .execute(
                "UPDATE attachments SET body=?1 WHERE id=?2",
                params![bad, old.id],
            )
            .unwrap();
        assert!(store.read_attachment(&old.id).is_err());
        assert!(store.workspace().is_err());
        assert_eq!(body(&store, "attachments", "id", &old.id), bad);
        assert_eq!(files(&store), before);
        store
            .db
            .execute(
                "UPDATE attachments SET body=?1 WHERE id=?2",
                params![old_body, old.id],
            )
            .unwrap();
        let mut op = operation["attachment"].clone();
        op["recordedAt"] = date;
        let bad = op.to_string();
        store
            .db
            .execute(
                "UPDATE attachment_operations SET attachment=?1 WHERE operation_id=?2",
                params![bad, old_op],
            )
            .unwrap();
        assert!(store
            .query_attachment_operation(&old_op, &note, &owner)
            .is_err());
        assert_eq!(
            body(&store, "attachment_operations", "operation_id", &old_op),
            bad
        );
        assert_eq!(files(&store), before);
    }
    let mut bad = serde_json::to_value(&old).unwrap();
    bad["kind"] = json!("file");
    bad["mime"] = json!("text/plain");
    bad["recordedAt"] = json!(START);
    store
        .db
        .execute(
            "UPDATE attachments SET body=?1 WHERE id=?2",
            params![bad.to_string(), old.id],
        )
        .unwrap();
    assert!(store.read_attachment(&old.id).is_err());
    assert_eq!(body(&store, "attachments", "id", &old.id), bad.to_string());
    assert_eq!(files(&store), before);
}

#[test]
fn recorded_at_archive_v2_twice_remaps_ids_and_preserves_date_and_bytes() {
    let (dir, mut source, note, owner) = setup_in(Some("data"));
    let a = put(&mut source, &note, &owner, &id(), Some(MAX_RECORDED_AT))["attachment"].clone();
    save(&mut source, &note, &a);
    let path = dir.path().join("v2.notesbackup");
    source.export_archive(&path).unwrap();
    let archive: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    assert_eq!(archive["version"], 2);
    let mut target = Store::open(dir.path().join("target")).unwrap();
    target.import_archive(&path).unwrap();
    target.import_archive(&path).unwrap();
    let all = target.attachments().unwrap();
    assert_eq!(all.len(), 2);
    assert_ne!(all[0].id, all[1].id);
    assert_ne!(all[0].note_id, all[1].note_id);
    for a in all {
        assert_eq!(a.recorded_at, Some(MAX_RECORDED_AT));
        assert_eq!(
            target.read_attachment(&a.id).unwrap()["data"],
            B64.encode(AUDIO)
        );
        let n = target.note(&a.note_id).unwrap();
        assert!(n.document.to_string().contains(&a.id));
    }
    let next = dir.path().join("again.notesbackup");
    target.export_archive(&next).unwrap();
    let mut fresh = Store::open(dir.path().join("fresh")).unwrap();
    fresh.import_archive(&next).unwrap();
    assert_eq!(fresh.attachments().unwrap().len(), 2);
    assert!(fresh
        .attachments()
        .unwrap()
        .iter()
        .all(|a| a.recorded_at == Some(MAX_RECORDED_AT)));
}

#[test]
fn recorded_at_invalid_archives_reject_atomically_and_v1_stays_unknown() {
    let (dir, mut source, note, owner) = setup_in(Some("data"));
    let a = put(&mut source, &note, &owner, &id(), Some(START))["attachment"].clone();
    save(&mut source, &note, &a);
    let path = dir.path().join("source.notesbackup");
    source.export_archive(&path).unwrap();
    let archive: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    let mut target = Store::open(dir.path().join("target")).unwrap();
    target.action(json!({"type":"createNote"})).unwrap();
    let before = target.workspace().unwrap();
    let before_files = files(&target);
    for date in [
        json!("bad"),
        json!(-1),
        json!(1.5),
        json!(MAX_RECORDED_AT + 1),
    ] {
        let mut bad = archive.clone();
        bad["attachments"][0]["recordedAt"] = date;
        let bytes = serde_json::to_vec(&bad).unwrap();
        let p = dir.path().join("bad.notesbackup");
        fs::write(&p, &bytes).unwrap();
        assert!(target.import_archive(&p).is_err());
        assert_eq!(target.workspace().unwrap(), before);
        assert_eq!(files(&target), before_files);
        assert_eq!(fs::read(&p).unwrap(), bytes);
    }
    for variant in ["v1-date", "wrong-kind"] {
        let mut bad = archive.clone();
        if variant == "v1-date" {
            bad["version"] = json!(1);
        } else {
            bad["attachments"][0]["kind"] = json!("file");
            bad["attachments"][0]["mime"] = json!("text/plain");
        }
        let p = dir.path().join("bad.notesbackup");
        fs::write(&p, serde_json::to_vec(&bad).unwrap()).unwrap();
        assert!(target.import_archive(&p).is_err());
        assert_eq!(target.workspace().unwrap(), before);
        assert_eq!(files(&target), before_files);
    }
    let mut old = archive;
    old["version"] = json!(1);
    old["attachments"][0]
        .as_object_mut()
        .unwrap()
        .remove("recordedAt");
    let old_path = dir.path().join("old.notesbackup");
    fs::write(&old_path, serde_json::to_vec(&old).unwrap()).unwrap();
    target.import_archive(&old_path).unwrap();
    assert!(target
        .attachments()
        .unwrap()
        .iter()
        .all(|a| a.recorded_at.is_none()));
    let exported = dir.path().join("old-export.notesbackup");
    target.export_archive(&exported).unwrap();
    let value: Value = serde_json::from_slice(&fs::read(exported).unwrap()).unwrap();
    assert_eq!(value["version"], 1);
    assert!(value["attachments"][0].get("recordedAt").is_none());
}

#[test]
fn recorded_at_preparing_and_public_are_the_same_durable_snapshot() {
    for stage in ["after_prepare", "after_store_commit"] {
        let (dir, store, note, owner) = setup();
        let operation = id();
        drop(store);
        let status = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "store::recorded_at_tests::recorded_at_crash_worker",
                "--ignored",
            ])
            .env("NOTES_TEST_ATTACHMENT_CRASH", stage)
            .env("NOTES_AUDIO_DATE_ROOT", dir.path())
            .env("NOTES_AUDIO_DATE_NOTE", &note)
            .env("NOTES_AUDIO_DATE_OPERATION", &operation)
            .env(
                "NOTES_AUDIO_DATE_OWNER",
                serde_json::to_string(&owner).unwrap(),
            )
            .status()
            .unwrap();
        assert_eq!(status.code(), Some(78));
        let db = Connection::open(dir.path().join("notes.sqlite3")).unwrap();
        let (state, raw): (String, String) = db
            .query_row(
                "SELECT state,attachment FROM attachment_operations WHERE operation_id=?1",
                [&operation],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        let a: Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(a["recordedAt"], START);
        let public: Option<String> = db
            .query_row(
                "SELECT body FROM attachments WHERE id=?1",
                [a["id"].as_str().unwrap()],
                |r| r.get(0),
            )
            .optional()
            .unwrap();
        if stage == "after_prepare" {
            assert_eq!(state, "preparing");
            assert!(public.is_none());
            assert!(!dir
                .path()
                .join("attachments")
                .join(a["relativePath"].as_str().unwrap())
                .exists());
        } else {
            assert_eq!(state, "stored");
            assert_eq!(public, Some(raw));
            assert_eq!(
                fs::read(
                    dir.path()
                        .join("attachments")
                        .join(a["relativePath"].as_str().unwrap())
                )
                .unwrap(),
                AUDIO
            );
        }
    }
}
#[test]
#[ignore]
fn recorded_at_crash_worker() {
    let root = std::env::var("NOTES_AUDIO_DATE_ROOT").unwrap();
    let note = std::env::var("NOTES_AUDIO_DATE_NOTE").unwrap();
    let op = std::env::var("NOTES_AUDIO_DATE_OPERATION").unwrap();
    let owner: AttachmentOwner =
        serde_json::from_str(&std::env::var("NOTES_AUDIO_DATE_OWNER").unwrap()).unwrap();
    put(
        &mut Store::open(root).unwrap(),
        &note,
        &owner,
        &op,
        Some(START),
    );
    panic!("crash checkpoint not reached");
}
#[test]
fn recorded_at_zero_null_and_invalid_direct_requests() {
    let (_dir, mut store, note, owner) = setup();
    let a = put(&mut store, &note, &owner, &id(), Some(0))["attachment"].clone();
    assert_eq!(
        store.read_attachment(a["id"].as_str().unwrap()).unwrap()["recordedAt"],
        0
    );
    let unknown = put(&mut store, &note, &owner, &id(), None)["attachment"].clone();
    let aid = unknown["id"].as_str().unwrap();
    let mut raw = unknown.clone();
    raw["recordedAt"] = Value::Null;
    let raw = raw.to_string();
    store
        .db
        .execute(
            "UPDATE attachments SET body=?1 WHERE id=?2",
            params![raw, aid],
        )
        .unwrap();
    assert!(store.read_attachment(aid).unwrap()["recordedAt"].is_null());
    assert_eq!(body(&store, "attachments", "id", aid), raw);
    let before = store.workspace().unwrap();
    let bytes = files(&store);
    for (mime, date) in [("audio/webm", MAX_RECORDED_AT + 1), ("text/plain", START)] {
        assert!(store
            .store_attachment_operation(
                &id(),
                &note,
                &owner,
                "invalid.bin",
                mime,
                AUDIO,
                Some(date)
            )
            .is_err());
        assert_eq!(store.workspace().unwrap(), before);
        assert_eq!(files(&store), bytes);
    }
}
