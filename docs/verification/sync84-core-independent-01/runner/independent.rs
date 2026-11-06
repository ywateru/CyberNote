use crate::{
    store::{AttachmentOwner, Store},
    sync::model::*,
};
use rusqlite::Connection;
use serde_json::{json, Value};
use std::{collections::BTreeMap, fs, path::Path};
fn uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}
fn document(body: &str) -> Value {
    json!({"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Public title"}]},{"type":"paragraph","content":[{"type":"text","text":body}]}]})
}
fn create(s: &mut Store, body: &str) -> String {
    let id = s.action(json!({"type":"createNote"})).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    edit(s, &id, body);
    id
}
fn edit(s: &mut Store, id: &str, body: &str) {
    let rev = s.note(id).unwrap().revision;
    s.action(json!({"type":"saveNote","id":id,"revision":rev,"document":document(body)}))
        .unwrap();
}
fn versions(s: &mut Store) -> Vec<WireVersion> {
    s.sync_flush().unwrap();
    s.sync_inventory()
        .unwrap()
        .iter()
        .map(|v| s.sync_version(&v.digest).unwrap())
        .collect()
}
fn one(s: &mut Store, id: &str) -> WireVersion {
    versions(s)
        .into_iter()
        .find(|w| w.kind == EntityKind::Note && w.entity_id == id)
        .unwrap()
}
fn pair() -> (tempfile::TempDir, Store, tempfile::TempDir, Store) {
    let a = tempfile::tempdir().unwrap();
    let b = tempfile::tempdir().unwrap();
    let mut sa = Store::open(a.path()).unwrap();
    let mut sb = Store::open(b.path()).unwrap();
    let ident = sa.sync_enable(None).unwrap();
    sb.sync_enable(Some(&ident.workspace_id)).unwrap();
    (a, sa, b, sb)
}
fn snapshot(dir: &Path) -> BTreeMap<String, Vec<u8>> {
    fn walk(root: &Path, p: &Path, out: &mut BTreeMap<String, Vec<u8>>) {
        if !p.exists() {
            return;
        }
        for e in fs::read_dir(p).unwrap() {
            let p = e.unwrap().path();
            if p.is_dir() {
                walk(root, &p, out)
            } else {
                out.insert(
                    p.strip_prefix(root).unwrap().to_string_lossy().to_string(),
                    fs::read(p).unwrap(),
                );
            }
        }
    }
    let mut out = BTreeMap::new();
    walk(dir, &dir.join("attachments"), &mut out);
    walk(dir, &dir.join(".sync"), &mut out);
    out
}
fn media(s: &mut Store, id: &str, bytes: &[u8]) -> String {
    let a = s
        .store_attachment(id, "sample.png", "image/png", bytes.to_vec())
        .unwrap();
    let rev = s.note(id).unwrap().revision;
    s.action(json!({"type":"saveNote","id":id,"revision":rev,"document":{"type":"doc","content":[{"type":"paragraph"},{"type":"attachment","attrs":{"id":a.id,"kind":"image","name":"sample.png"}}]}})).unwrap();
    a.id
}
fn attachments(root: &Path) -> Vec<crate::store::Attachment> {
    let c = db(root);
    let mut q = c
        .prepare("SELECT body FROM attachments ORDER BY id")
        .unwrap();
    q.query_map([], |r| r.get::<_, String>(0))
        .unwrap()
        .map(|r| serde_json::from_str(&r.unwrap()).unwrap())
        .collect()
}
fn db(root: &Path) -> Connection {
    Connection::open(root.join("notes.sqlite3")).unwrap()
}
fn count(c: &Connection, t: &str) -> i64 {
    c.query_row(&format!("SELECT count(*) FROM {t}"), [], |r| r.get(0))
        .unwrap()
}

#[test]
fn natural_compaction_frontier_keeps_old_selected_branch_independent_across_restart() {
    let (root, mut a, _br, mut b) = pair();
    let id = create(&mut a, "base");
    let base = one(&mut a, &id);
    let device = a.sync_identity().unwrap().unwrap().device_id;
    edit(&mut a, &id, "A2");
    let a2 = one(&mut a, &id);
    let mut successor = a2.clone();
    successor.vector.insert(uuid(), 1);
    successor.payload.as_mut().unwrap()["note"]["plainText"] =
        json!("Public title\nA2 causal successor");
    successor.payload.as_mut().unwrap()["note"]["document"] = document("A2 causal successor");
    successor = successor.seal();
    let mut old = base.clone();
    old.vector.insert(uuid(), 1);
    old.payload.as_mut().unwrap()["note"]["deletedAt"] = json!(42);
    old.payload.as_mut().unwrap()["note"]["folderId"] = json!("trash");
    old.payload.as_mut().unwrap()["note"]["originalFolderId"] = json!("default");
    old = old.seal();
    a.sync_receive(vec![successor.clone(), old.clone()])
        .unwrap();
    a.sync_apply_pending().unwrap();
    assert!(a.note(&id).unwrap().deleted_at.is_some());
    let heads = versions(&mut a);
    assert!(!heads.iter().any(|h| h.digest == a2.digest));
    assert!(heads.iter().any(|h| h.digest == successor.digest));
    a.action(json!({"type":"restoreNote","id":id})).unwrap();
    a.sync_flush().unwrap();
    let c = db(root.path());
    let digest: String = c
        .query_row(
            "SELECT digest FROM sync_projection WHERE kind='note' AND entity_id=?1",
            [&id],
            |r| r.get(0),
        )
        .unwrap();
    let branch = a.sync_version(&digest).unwrap();
    assert_eq!(branch.vector[&device], 1);
    assert!(branch.vector.keys().any(|k| !old.vector.contains_key(k)));
    assert!(!dominates(&branch.vector, &successor.vector));
    let actor = branch
        .vector
        .keys()
        .find(|k| !old.vector.contains_key(*k))
        .unwrap()
        .clone();
    drop(c);
    drop(a);
    let mut a = Store::open(root.path()).unwrap();
    edit(&mut a, &id, "autosave one");
    a.sync_flush().unwrap();
    edit(&mut a, &id, "autosave two");
    a.sync_flush().unwrap();
    let c = db(root.path());
    let digest: String = c
        .query_row(
            "SELECT digest FROM sync_projection WHERE kind='note' AND entity_id=?1",
            [&id],
            |r| r.get(0),
        )
        .unwrap();
    let autosave = a.sync_version(&digest).unwrap();
    assert_eq!(autosave.vector[&actor], 3);
    assert_eq!(autosave.vector.len(), branch.vector.len());
    assert_eq!(autosave.vector[&device], 1);
    assert!(!dominates(&autosave.vector, &successor.vector));
    b.sync_receive(versions(&mut a)).unwrap();
    b.sync_apply_pending().unwrap();
    a.sync_receive(versions(&mut b)).unwrap();
    a.sync_apply_pending().unwrap();
    assert_eq!(a.sync_inventory().unwrap(), b.sync_inventory().unwrap());
    assert_eq!(a.note(&id).unwrap().document, b.note(&id).unwrap().document);
}

#[test]
fn planning_never_publishes_files_and_stale_plan_cannot_apply_after_blob_loss() {
    let (_ar, mut a, br, mut b) = pair();
    let id = create(&mut a, "media");
    let aid = media(&mut a, &id, b"independent media bytes");
    let wire = one(&mut a, &id);
    let blob = a.sync_required_blobs(&wire).unwrap().remove(0);
    assert!(!b.sync_receive(vec![wire.clone()]).unwrap().durable);
    assert!(b.sync_plan_apply(&[]).unwrap().eligible_digests.is_empty());
    b.sync_store_blob(
        &blob.hash,
        blob.size,
        fs::File::open(a.sync_blob_path(&blob.hash).unwrap()).unwrap(),
    )
    .unwrap();
    let before = snapshot(br.path());
    let plan = b.sync_plan_apply(&[]).unwrap();
    assert!(plan.targets.contains(&id));
    assert_eq!(snapshot(br.path()), before);
    assert!(b.note(&id).is_err());
    let path = b.sync_blob_path(&blob.hash).unwrap();
    fs::remove_file(&path).unwrap();
    let error = b.sync_apply_plan(&plan).unwrap_err();
    assert_eq!(error.code, "sync_plan_stale");
    assert!(b.note(&id).is_err());
    assert_eq!(count(&db(br.path()), "sync_inbox"), 1);
    b.sync_store_blob(
        &blob.hash,
        blob.size,
        fs::File::open(a.sync_blob_path(&blob.hash).unwrap()).unwrap(),
    )
    .unwrap();
    b.sync_apply_plan(&plan).unwrap();
    assert_eq!(
        b.read_attachment(&aid).unwrap()["data"],
        base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            b"independent media bytes"
        )
    );
}

#[test]
fn receive_rejects_attachment_owner_and_reference_mismatch_atomically() {
    let (_ar, mut a, br, mut b) = pair();
    let id = create(&mut a, "media");
    media(&mut a, &id, b"owner bytes");
    let good = one(&mut a, &id);
    for mutate in [0, 1, 2] {
        let mut bad = good.clone();
        if mutate == 0 {
            bad.payload.as_mut().unwrap()["attachments"][0]["noteId"] = json!("wrong-note");
        } else if mutate == 1 {
            bad.payload.as_mut().unwrap()["attachments"] = json!([]);
        } else {
            bad.payload.as_mut().unwrap()["attachments"][0]["relativePath"] = json!("/outside");
        }
        bad = bad.seal();
        assert!(b.sync_receive(vec![good.clone(), bad]).is_err());
        let c = db(br.path());
        assert_eq!(count(&c, "sync_inbox"), 0);
        assert_eq!(count(&c, "sync_attachments"), 0);
        assert_eq!(count(&c, "sync_frontiers"), 0);
        assert!(b.notes().unwrap().is_empty());
    }
    let blob = a.sync_required_blobs(&good).unwrap().remove(0);
    let before = snapshot(br.path());
    assert!(b
        .sync_store_blob(&blob.hash, blob.size, &b"partial"[..])
        .is_err());
    assert_eq!(snapshot(br.path()), before);
    let r = b.sync_receive(vec![good]).unwrap();
    assert!(!r.durable);
    assert_eq!(r.pending, 1);
    assert!(b.sync_apply_pending().unwrap().changes.is_empty());
}

#[test]
fn inbox_delete_failure_rolls_back_local_lock_and_late_replay_keeps_wal_clean() {
    let (_ar, mut a, br, mut b) = pair();
    let id = create(&mut a, "INDEPENDENT_SECRET_ANCESTOR");
    let ancestor = one(&mut a, &id);
    edit(&mut a, &id, "INDEPENDENT_SECRET_SELECTED");
    let current = one(&mut a, &id);
    b.sync_receive(vec![current]).unwrap();
    b.sync_apply_pending().unwrap();
    b.sync_receive(vec![ancestor.clone()]).unwrap();
    let c = db(br.path());
    assert_eq!(count(&c, "sync_inbox"), 1);
    c.execute_batch("CREATE TRIGGER fail_independent84 BEFORE DELETE ON sync_inbox BEGIN SELECT RAISE(ABORT,'independent inbox fault'); END;").unwrap();
    assert!(b
        .action(json!({"type":"lockNote","id":id,"password":"independent-pass"}))
        .is_err());
    assert!(!b.note(&id).unwrap().locked);
    assert_eq!(count(&c, "sync_inbox"), 1);
    assert_eq!(
        c.query_row(
            "SELECT count(*) FROM sync_heads WHERE payload IS NOT NULL",
            [],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        1
    );
    c.execute_batch("DROP TRIGGER fail_independent84").unwrap();
    b.action(json!({"type":"lockNote","id":id,"password":"independent-pass"}))
        .unwrap();
    assert_eq!(count(&c, "sync_inbox"), 0);
    b.sync_receive(vec![ancestor]).unwrap();
    assert_eq!(count(&c, "sync_inbox"), 0);
    assert_eq!(
        c.query_row(
            "SELECT count(*) FROM sync_heads WHERE payload IS NOT NULL",
            [],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        0
    );
    drop(c);
    for file in ["notes.sqlite3", "notes.sqlite3-wal"] {
        if let Ok(bytes) = fs::read(br.path().join(file)) {
            for secret in ["INDEPENDENT_SECRET_ANCESTOR", "INDEPENDENT_SECRET_SELECTED"] {
                assert!(
                    !bytes.windows(secret.len()).any(|w| w == secret.as_bytes()),
                    "plaintext in {file}"
                );
            }
        }
    }
    drop(b);
    let mut b = Store::open(br.path()).unwrap();
    assert!(b.note(&id).unwrap().locked);
    b.sync_flush().unwrap();
    let sealed = one(&mut b, &id);
    assert!(sealed.payload.as_ref().unwrap()["note"]["sealed"].is_object());
    assert!(!serde_json::to_string(&sealed)
        .unwrap()
        .contains("INDEPENDENT_SECRET"));
}

#[test]
fn adoption_mismatch_preserves_exact_identity_and_system_folders_never_enter_wire() {
    let root = tempfile::tempdir().unwrap();
    let mut s = Store::open(root.path()).unwrap();
    let id = create(&mut s, "existing local");
    let workspace = uuid();
    let device = uuid();
    let ident = s
        .sync_enable_with_device(Some(&workspace), &device)
        .unwrap();
    let inventory = s.sync_inventory().unwrap();
    assert_eq!(inventory.len(), 1);
    assert_eq!(inventory[0].entity_id, id);
    let c = db(root.path());
    let before: String = c
        .query_row(
            "SELECT group_concat(sql,';') FROM sqlite_schema WHERE name GLOB 'sync_*'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        s.sync_enable_with_device(Some(&uuid()), &device)
            .unwrap_err()
            .code,
        "sync_workspace_mismatch"
    );
    assert_eq!(
        s.sync_enable_with_device(Some(&workspace), &uuid())
            .unwrap_err()
            .code,
        "sync_device_mismatch"
    );
    assert_eq!(s.sync_identity().unwrap().unwrap(), ident);
    assert_eq!(s.sync_inventory().unwrap(), inventory);
    assert_eq!(
        c.query_row(
            "SELECT group_concat(sql,';') FROM sqlite_schema WHERE name GLOB 'sync_*'",
            [],
            |r| r.get::<_, String>(0)
        )
        .unwrap(),
        before
    );
    for id in ["default", "quick", "trash"] {
        let wire = WireVersion {
            version: 1,
            workspace_id: workspace.clone(),
            kind: EntityKind::Folder,
            entity_id: id.into(),
            vector: Vector::from([(uuid(), 1)]),
            payload: None,
            digest: String::new(),
        }
        .seal();
        assert!(s.sync_receive(vec![wire]).is_err());
    }
    assert_eq!(count(&c, "sync_inbox"), 0);
    drop(c);
    drop(s);
    let s = Store::open(root.path()).unwrap();
    assert_eq!(s.sync_identity().unwrap().unwrap(), ident);
}

const AUDIO: &[u8] = b"independent synthetic recorded audio";
const DATE: u64 = 1_793_743_199_123;
fn audio_store(root: &Path) -> (Store, String, String) {
    let mut s = Store::open(root).unwrap();
    let id = create(&mut s, "audio");
    let owner = AttachmentOwner {
        session: uuid(),
        window: "main".into(),
        incarnation: uuid(),
    };
    let attachment = s
        .store_attachment_operation(
            &uuid(),
            &id,
            &owner,
            "recording.webm",
            "audio/webm",
            AUDIO,
            Some(DATE),
        )
        .unwrap()["attachment"]
        .clone();
    let aid = attachment["id"].as_str().unwrap().to_string();
    let rev = s.note(&id).unwrap().revision;
    s.action(json!({"type":"saveNote","id":id,"revision":rev,"document":{"type":"doc","content":[{"type":"paragraph"},{"type":"attachment","attrs":{"id":aid,"kind":"audio","name":"recording.webm"}}]}})).unwrap();
    (s, id, aid)
}

#[test]
fn external_archive_recorded_at_twice_remaps_ids_and_preserves_date_bytes() {
    let root = tempfile::tempdir().unwrap();
    let output = tempfile::tempdir().unwrap();
    let (s, _, _) = audio_store(root.path());
    let archive = output.path().join("audio.notesbackup");
    s.export_archive(&archive).unwrap();
    let t = tempfile::tempdir().unwrap();
    let mut target = Store::open(t.path()).unwrap();
    target.import_archive(&archive).unwrap();
    target.import_archive(&archive).unwrap();
    let media = attachments(t.path());
    assert_eq!(media.len(), 2);
    assert_ne!(media[0].id, media[1].id);
    assert_ne!(media[0].note_id, media[1].note_id);
    for a in media {
        assert_eq!(a.recorded_at, Some(DATE));
        assert_eq!(
            target.read_attachment(&a.id).unwrap()["data"],
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, AUDIO)
        );
        assert!(target
            .note(&a.note_id)
            .unwrap()
            .document
            .to_string()
            .contains(&a.id));
    }
    let again = output.path().join("again.notesbackup");
    target.export_archive(&again).unwrap();
    let fresh = tempfile::tempdir().unwrap();
    let mut f = Store::open(fresh.path()).unwrap();
    f.import_archive(&again).unwrap();
    assert_eq!(attachments(fresh.path()).len(), 2);
    assert!(attachments(fresh.path())
        .iter()
        .all(|a| a.recorded_at == Some(DATE)));
}
#[test]
fn external_invalid_recorded_at_archives_reject_atomically_v1_stays_unknown() {
    let root = tempfile::tempdir().unwrap();
    let output = tempfile::tempdir().unwrap();
    let (source, _, _) = audio_store(root.path());
    let path = output.path().join("source.notesbackup");
    source.export_archive(&path).unwrap();
    let archive: Value = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
    let dest = tempfile::tempdir().unwrap();
    let mut target = Store::open(dest.path()).unwrap();
    create(&mut target, "preexisting");
    let before = target.workspace().unwrap();
    let files = snapshot(dest.path());
    for date in [
        json!("bad"),
        json!(-1),
        json!(1.5),
        json!(4_000_000_000_000_001u64),
    ] {
        let mut bad = archive.clone();
        bad["attachments"][0]["recordedAt"] = date;
        let p = output.path().join("bad.notesbackup");
        let bytes = serde_json::to_vec(&bad).unwrap();
        fs::write(&p, &bytes).unwrap();
        assert!(target.import_archive(&p).is_err());
        assert_eq!(target.workspace().unwrap(), before);
        assert_eq!(snapshot(dest.path()), files);
        assert_eq!(fs::read(p).unwrap(), bytes);
    }
    for variant in [0, 1] {
        let mut bad = archive.clone();
        if variant == 0 {
            bad["version"] = json!(1);
        } else {
            bad["attachments"][0]["kind"] = json!("file");
            bad["attachments"][0]["mime"] = json!("text/plain");
        }
        let p = output.path().join("bad.notesbackup");
        fs::write(&p, serde_json::to_vec(&bad).unwrap()).unwrap();
        assert!(target.import_archive(&p).is_err());
        assert_eq!(target.workspace().unwrap(), before);
        assert_eq!(snapshot(dest.path()), files);
    }
    let mut old = archive;
    old["version"] = json!(1);
    old["attachments"][0]
        .as_object_mut()
        .unwrap()
        .remove("recordedAt");
    let p = output.path().join("old.notesbackup");
    fs::write(&p, serde_json::to_vec(&old).unwrap()).unwrap();
    target.import_archive(&p).unwrap();
    assert!(attachments(dest.path())
        .iter()
        .all(|a| a.recorded_at.is_none()));
    let p = output.path().join("old-export.notesbackup");
    target.export_archive(&p).unwrap();
    let val: Value = serde_json::from_slice(&fs::read(p).unwrap()).unwrap();
    assert_eq!(val["version"], 1);
    assert!(val["attachments"][0].get("recordedAt").is_none());
}
#[test]
fn external_archive_attachment_and_cycle_guard_remain_compatible() {
    let root = tempfile::tempdir().unwrap();
    let export = tempfile::tempdir().unwrap();
    let mut s = Store::open(root.path()).unwrap();
    let f = s
        .action(json!({"type":"createFolder","name":"Work"}))
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    assert!(s
        .action(json!({"type":"moveFolder","id":f,"parentId":f}))
        .is_err());
    let id = s.action(json!({"type":"createNote","folderId":f})).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let a = s
        .store_attachment(&id, "hello.txt", "text/plain", b"hello".to_vec())
        .unwrap();
    assert!(s.sync_blob_path("../secrets").is_err());
    assert!(s
        .export_archive(&root.path().join("forbidden.notesbackup"))
        .is_err());
    let path = export.path().join("archive.notesbackup");
    s.export_archive(&path).unwrap();
    let dest = tempfile::tempdir().unwrap();
    let mut t = Store::open(dest.path()).unwrap();
    t.import_archive(&path).unwrap();
    assert_eq!(t.read_attachment(&a.id).unwrap()["data"], "aGVsbG8=");
    t.action(json!({"type":"deleteFolder","id":f})).unwrap();
    assert_eq!(t.note(&id).unwrap().folder_id, "trash");
    t.action(json!({"type":"restoreNote","id":id})).unwrap();
    assert_eq!(t.note(&id).unwrap().folder_id, "default");
}

#[test]
fn locked_wire_must_reject_unencrypted_drawing_body() {
    let (_ar, mut a, br, mut b) = pair();
    let id = create(&mut a, "secret stays encrypted");
    a.action(json!({"type":"lockNote","id":id,"password":"independent-pass"}))
        .unwrap();
    let mut wire = one(&mut a, &id);
    wire.payload.as_mut().unwrap()["note"]["document"] = json!({"type":"doc","content":[{"type":"drawing","attrs":{"strokes":[{"color":"#112233","points":[[10,10],[80,70],[140,20]],"tool":"pen","width":2.5}]}}]});
    wire = wire.seal();
    let result = b.sync_receive(vec![wire]);
    assert!(
        result.is_err(),
        "locked wire with plaintext drawing was accepted: {result:?}"
    );
    assert_eq!(count(&db(br.path()), "sync_inbox"), 0);
}
