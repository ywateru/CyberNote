use super::*;
#[test]
fn initial_enable_is_opt_in_and_persistent() {
    let root = tempfile::tempdir().unwrap();
    let mut store = Store::open(root.path()).unwrap();
    assert!(store.sync_identity().unwrap().is_none());
    let note = store.action(json!({"type":"createNote"})).unwrap();
    let identity = store.sync_enable(None).unwrap();
    let inventory = store.sync_inventory().unwrap();
    assert_eq!(inventory.len(), 1);
    assert_eq!(inventory[0].entity_id, note["id"].as_str().unwrap());
    drop(store);
    let mut reopened = Store::open(root.path()).unwrap();
    assert_eq!(reopened.sync_enable(None).unwrap(), identity);
}

fn pair() -> (tempfile::TempDir, Store, tempfile::TempDir, Store) {
    let a = tempfile::tempdir().unwrap();
    let b = tempfile::tempdir().unwrap();
    let mut sa = Store::open(a.path()).unwrap();
    let workspace = sa.sync_enable(None).unwrap().workspace_id;
    let mut sb = Store::open(b.path()).unwrap();
    sb.sync_enable(Some(&workspace)).unwrap();
    (a, sa, b, sb)
}
fn create(store: &mut Store, text: &str) -> String {
    let value = store.action(json!({"type":"createNote"})).unwrap();
    let id = value["id"].as_str().unwrap().to_string();
    edit(store, &id, text);
    id
}
fn edit(store: &mut Store, id: &str, text: &str) {
    let revision = store.note(id).unwrap().revision;
    store.action(json!({"type":"saveNote","id":id,"revision":revision,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":text}]}]}})).unwrap();
}
fn versions(store: &mut Store) -> Vec<WireVersion> {
    store.sync_flush().unwrap();
    store
        .sync_inventory()
        .unwrap()
        .iter()
        .map(|s| store.sync_version(&s.digest).unwrap())
        .collect()
}
fn exchange(source: &mut Store, target: &mut Store) -> SyncApplyReport {
    let versions = versions(source);
    for version in &versions {
        for blob in source.sync_required_blobs(version).unwrap() {
            target
                .sync_store_blob(
                    &blob.hash,
                    blob.size,
                    fs::File::open(source.sync_blob_path(&blob.hash).unwrap()).unwrap(),
                )
                .unwrap();
        }
    }
    target.sync_receive(versions).unwrap();
    target.sync_apply_pending().unwrap()
}
fn local_note_wire(store: &mut Store, id: &str) -> WireVersion {
    let all = versions(store);
    let digest: String = store
        .db
        .query_row(
            "SELECT digest FROM sync_projection WHERE kind='note' AND entity_id=?1",
            [id],
            |r| r.get(0),
        )
        .unwrap();
    all.into_iter().find(|w| w.digest == digest).unwrap()
}
fn foreign_note(store: &Store, id: &str, text: &str, device: &str) -> WireVersion {
    let note = Note {
        id: id.into(),
        folder_id: "default".into(),
        document: json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":text}]}]}),
        title: text.into(),
        plain_text: text.into(),
        created_at: 1,
        updated_at: 1,
        pinned: false,
        deleted_at: None,
        original_folder_id: None,
        locked: false,
        paper_style: "plain".into(),
        revision: 0,
        sealed: None,
    };
    WireVersion {
        version: 1,
        workspace_id: store.sync_identity().unwrap().unwrap().workspace_id,
        kind: EntityKind::Note,
        entity_id: id.into(),
        vector: Vector::from([(device.into(), 1)]),
        payload: Some(validation::wire_note(&note, vec![]).unwrap()),
        digest: String::new(),
    }
    .seal()
}
#[test]
fn causal_round_trip_restarts_and_does_not_echo_local_operations() {
    let (_ar, mut a, br, mut b) = pair();
    let id = create(&mut a, "A");
    let first = local_note_wire(&mut a, &id);
    let staged = b.sync_receive(vec![first]).unwrap();
    assert!(!staged.applied);
    assert!(b.notes().unwrap().is_empty());
    drop(b);
    let mut b = Store::open(br.path()).unwrap();
    let applied = b.sync_apply_pending().unwrap();
    assert!(applied.applied);
    assert_eq!(b.note(&id).unwrap().plain_text, "A");
    assert_eq!(
        b.db.query_row("SELECT count(*) FROM sync_dirty", [], |r| r
            .get::<_, usize>(0))
            .unwrap(),
        0
    );
    edit(&mut b, &id, "B edit");
    exchange(&mut b, &mut a);
    assert_eq!(a.note(&id).unwrap().plain_text, "B edit");
    assert_eq!(a.sync_inventory().unwrap().len(), 1);
    let before = a.note(&id).unwrap().revision;
    for _ in 0..100 {
        exchange(&mut b, &mut a);
    }
    assert_eq!(a.note(&id).unwrap().revision, before);
    assert_eq!(a.sync_inventory().unwrap().len(), 1);
}
#[test]
fn dirty_is_transactional_for_replace_smart_archive_and_attachment_owner() {
    let root = tempfile::tempdir().unwrap();
    let mut s = Store::open(root.path()).unwrap();
    s.sync_enable(None).unwrap();
    let id = create(&mut s, "initial");
    s.sync_flush().unwrap();
    s.db.execute_batch("BEGIN IMMEDIATE").unwrap();
    edit(&mut s, &id, "rolled back");
    assert_eq!(
        s.db.query_row("SELECT count(*) FROM sync_dirty", [], |r| r
            .get::<_, usize>(0))
            .unwrap(),
        1
    );
    s.db.execute_batch("ROLLBACK").unwrap();
    assert_eq!(s.note(&id).unwrap().plain_text, "initial");
    assert!(s.sync_inventory().is_ok());
    let f=s.create_smart_folder(json!({"name":"pinned","query":{"version":1,"combine":"all","rules":[{"type":"pinned","value":true}]}})).unwrap();
    assert!(versions(&mut s).iter().any(|v| v.entity_id == f.id));
    let before = s.sync_inventory().unwrap().len();
    s.action(json!({"type":"settings","settings":{"secretLocalSetting":"not-wire"}}))
        .unwrap();
    assert_eq!(s.sync_inventory().unwrap().len(), before);
    let attachment = s
        .store_attachment(&id, "orphan.png", "image/png", vec![1, 2, 3])
        .unwrap();
    assert!(s.sync_inventory().is_err());
    s.sync_flush().unwrap();
    let wire = local_note_wire(&mut s, &id);
    assert!(wire.payload.unwrap()["attachments"]
        .as_array()
        .unwrap()
        .is_empty());
    let export = tempfile::tempdir().unwrap();
    let archive = export.path().join("saved.notesbackup");
    s.export_archive(&archive).unwrap();
    s.import_archive(&archive).unwrap();
    assert!(
        s.db.query_row("SELECT count(*) FROM sync_dirty", [], |r| r
            .get::<_, usize>(0))
            .unwrap()
            > 0
    );
    assert!(s
        .attachments()
        .unwrap()
        .iter()
        .any(|a| a.id == attachment.id));
}
#[test]
fn concurrent_heads_converge_and_local_edit_does_not_implicitly_join() {
    let (_ar, mut a, _br, mut b) = pair();
    let id = create(&mut a, "base");
    exchange(&mut a, &mut b);
    edit(&mut a, &id, "offline A");
    edit(&mut b, &id, "offline B");
    let wa = local_note_wire(&mut a, &id);
    let wb = local_note_wire(&mut b, &id);
    a.sync_receive(vec![wb.clone()]).unwrap();
    a.sync_apply_pending().unwrap();
    b.sync_receive(vec![wa.clone()]).unwrap();
    b.sync_apply_pending().unwrap();
    assert_eq!(
        a.note(&id).unwrap().plain_text,
        b.note(&id).unwrap().plain_text
    );
    assert_eq!(a.sync_conflicts().unwrap()[0].versions.len(), 2);
    let base = projected_base(&a.db, &EntityKind::Note, &id).unwrap();
    edit(&mut a, &id, "continued selected branch");
    a.sync_flush().unwrap();
    let all = heads(&a.db).unwrap();
    assert_eq!(all.len(), 2);
    let next = all
        .iter()
        .find(|h| {
            h.wire.payload.as_ref().unwrap()["note"]["plainText"] == "continued selected branch"
        })
        .unwrap();
    assert!(dominates(&next.wire.vector, &base));
    let other = if base == wa.vector {
        &wb.vector
    } else {
        &wa.vector
    };
    assert!(!dominates(&next.wire.vector, other));
    let chosen = all[0].wire.digest.clone();
    a.sync_resolve(EntityKind::Note, &id, &chosen, false)
        .unwrap();
    assert!(a.sync_conflicts().unwrap().is_empty());
    exchange(&mut a, &mut b);
    assert!(b.sync_conflicts().unwrap().is_empty());
}
#[test]
fn same_vector_different_content_rejected_even_after_compaction() {
    let (_ar, mut a, _br, mut b) = pair();
    let id = create(&mut a, "first");
    let first = local_note_wire(&mut a, &id);
    exchange(&mut a, &mut b);
    edit(&mut a, &id, "successor");
    exchange(&mut a, &mut b);
    let mut altered = first.clone();
    altered.payload.as_mut().unwrap()["note"]["title"] = json!("equivocation");
    altered = altered.seal();
    assert_eq!(
        b.sync_receive(vec![altered]).unwrap_err().code,
        "sync_equivocation"
    );
    assert!(b.sync_version(&first.digest).is_err());
    assert_eq!(b.note(&id).unwrap().plain_text, "successor");
}
#[test]
fn deleted_beats_old_edit_restore_is_causal_and_purge_does_not_resurrect() {
    let (_ar, mut a, _br, mut b) = pair();
    let id = create(&mut a, "base");
    exchange(&mut a, &mut b);
    edit(&mut b, &id, "old offline edit");
    let unseen = local_note_wire(&mut b, &id);
    a.action(json!({"type":"deleteNote","id":id})).unwrap();
    exchange(&mut a, &mut b);
    assert!(b.note(&id).unwrap().deleted_at.is_some());
    b.action(json!({"type":"restoreNote","id":id})).unwrap();
    exchange(&mut b, &mut a);
    assert!(a.note(&id).unwrap().deleted_at.is_none());
    let independent = foreign_note(&a, &id, "known independent conflict", &super::id());
    a.sync_receive(vec![independent]).unwrap();
    a.sync_apply_pending().unwrap();
    a.action(json!({"type":"deleteNote","id":id})).unwrap();
    a.sync_flush().unwrap();
    assert!(heads(&a.db).unwrap().len() > 1);
    a.action(json!({"type":"purgeNote","id":id})).unwrap();
    assert!(heads(&a.db)
        .unwrap()
        .iter()
        .all(|h| h.wire.payload.is_none() && h.redacted));
    a.sync_flush().unwrap();
    assert_eq!(heads(&a.db).unwrap().len(), 1);
    a.sync_receive(vec![unseen]).unwrap();
    a.sync_apply_pending().unwrap();
    assert!(a.note(&id).is_err());
    assert!(a.sync_inventory().unwrap()[0].digest.len() == 64);
}
#[test]
fn unseen_concurrent_version_after_purge_is_preserved_as_conflict_only() {
    let (_ar, mut a, _br, mut b) = pair();
    let id = create(&mut a, "base");
    exchange(&mut a, &mut b);
    edit(&mut b, &id, "unseen rescue");
    let unseen = local_note_wire(&mut b, &id);
    a.action(json!({"type":"deleteNote","id":id})).unwrap();
    a.action(json!({"type":"purgeNote","id":id})).unwrap();
    a.sync_flush().unwrap();
    a.sync_receive(vec![unseen]).unwrap();
    a.sync_apply_pending().unwrap();
    assert!(a.note(&id).is_err());
    assert_eq!(a.sync_conflicts().unwrap().len(), 1);
}
#[test]
fn lock_prunes_linear_plaintext_inside_business_sql_and_rolls_back_on_failure() {
    let (root, mut s, _br, _b) = pair();
    let nid = create(&mut s, "public title\nSECRET_LINEAR_BODY_84");
    let wire = local_note_wire(&mut s, &nid);
    s.db.execute(
        "INSERT INTO sync_inbox(digest,wire)VALUES(?1,?2)",
        params![wire.digest, serde_json::to_string(&wire).unwrap()],
    )
    .unwrap();
    s.db.execute_batch("CREATE TRIGGER fail84 BEFORE UPDATE ON sync_heads BEGIN SELECT RAISE(ABORT,'injected lock rollback'); END").unwrap();
    assert!(s
        .action(json!({"type":"lockNote","id":nid,"password":"test-password84"}))
        .is_err());
    assert!(!s.note(&nid).unwrap().locked);
    assert!(heads(&s.db).unwrap()[0].wire.payload.is_some());
    assert_eq!(s.inbox().unwrap().len(), 1);
    s.db.execute_batch("DROP TRIGGER fail84").unwrap();
    s.action(json!({"type":"lockNote","id":nid,"password":"test-password84"}))
        .unwrap();
    assert!(heads(&s.db).unwrap()[0].redacted);
    assert!(heads(&s.db).unwrap()[0].wire.payload.is_none());
    assert!(s.inbox().unwrap().is_empty());
    assert!(s.sync_version(&wire.digest).is_err());
    let bytes = fs::read(root.path().join("notes.sqlite3")).unwrap();
    assert!(!bytes
        .windows(b"SECRET_LINEAR_BODY_84".len())
        .any(|v| v == b"SECRET_LINEAR_BODY_84"));
    drop(s);
    let mut s = Store::open(root.path()).unwrap();
    s.sync_flush().unwrap();
    let locked = local_note_wire(&mut s, &nid);
    let raw = locked.payload.unwrap();
    assert_eq!(raw["note"]["plainText"], "");
    assert!(raw["note"]["sealed"].is_object());
    assert!(!serde_json::to_string(&raw)
        .unwrap()
        .contains("SECRET_LINEAR_BODY_84"));
    s.action(json!({"type":"unlockNote","id":nid,"password":"test-password84"}))
        .unwrap();
    assert!(s.workspace().unwrap()["notes"][0]["plainText"]
        .as_str()
        .unwrap()
        .contains("SECRET_LINEAR_BODY_84"));
    let wire = local_note_wire(&mut s, &nid);
    assert!(!serde_json::to_string(&wire)
        .unwrap()
        .contains("SECRET_LINEAR_BODY_84"));
}
#[test]
fn locked_heads_round_trip_and_keep_all_without_decryption() {
    let (_ar, mut a, _br, mut b) = pair();
    let id = create(&mut a, "public\nsecret");
    exchange(&mut a, &mut b);
    a.action(json!({"type":"lockNote","id":id,"password":"A-password"}))
        .unwrap();
    b.action(json!({"type":"lockNote","id":id,"password":"B-password"}))
        .unwrap();
    let wa = local_note_wire(&mut a, &id);
    let wb = local_note_wire(&mut b, &id);
    a.sync_receive(vec![wb]).unwrap();
    a.sync_apply_pending().unwrap();
    assert_eq!(a.sync_conflicts().unwrap()[0].versions.len(), 2);
    a.sync_resolve(EntityKind::Note, &id, &wa.digest, true)
        .unwrap();
    let notes = a.notes().unwrap();
    assert_eq!(notes.len(), 2);
    assert!(notes
        .iter()
        .all(|n| n.locked && n.plain_text.is_empty() && n.sealed.is_some()));
    assert!(a.sync_conflicts().unwrap().is_empty());
}
fn add_media(s: &mut Store, id: &str, name: &str, bytes: &[u8]) -> Attachment {
    let attachment = s
        .store_attachment(id, name, "image/png", bytes.to_vec())
        .unwrap();
    let rev = s.note(id).unwrap().revision;
    s.action(json!({"type":"saveNote","id":id,"revision":rev,"document":{"type":"doc","content":[{"type":"paragraph"},{"type":"attachment","attrs":{"id":attachment.id,"kind":"image","name":name}}]}})).unwrap();
    attachment
}
#[test]
fn independent_blobs_stage_then_publish_and_survive_conflict_copy_purge() {
    let (_ar, mut a, br, mut b) = pair();
    let nid = create(&mut a, "base");
    let attachment = add_media(&mut a, &nid, "original.png", b"original image bytes84");
    let wire = local_note_wire(&mut a, &nid);
    let blob = a.sync_required_blobs(&wire).unwrap().remove(0);
    assert!(!serde_json::to_string(&wire)
        .unwrap()
        .contains("relativePath"));
    let staged = b.sync_receive(vec![wire.clone()]).unwrap();
    assert_eq!(staged.missing_blobs, vec![blob.clone()]);
    assert_eq!(b.sync_apply_pending().unwrap().pending, 1);
    assert!(b.note(&nid).is_err());
    assert!(b
        .sync_store_blob(&blob.hash, blob.size, &b"half"[..])
        .is_err());
    assert!(b.sync_blob_path(&blob.hash).is_err());
    assert!(b
        .sync_store_blob(&blob.hash, blob.size, &b"wrong same size bytes84"[..])
        .is_err());
    b.sync_store_blob(
        &blob.hash,
        blob.size,
        fs::File::open(a.sync_blob_path(&blob.hash).unwrap()).unwrap(),
    )
    .unwrap();
    drop(b);
    let mut b = Store::open(br.path()).unwrap();
    b.sync_apply_pending().unwrap();
    assert_eq!(
        b.read_attachment(&attachment.id).unwrap()["data"],
        B64.encode(b"original image bytes84")
    );
    // Concurrent head adds a second image. keep-all must allocate independent
    // business attachment IDs/paths while retaining content-addressed blobs.
    add_media(&mut a, &nid, "A-second.png", b"second84");
    let wa = local_note_wire(&mut a, &nid);
    edit(&mut b, &nid, "B concurrent text");
    exchange(&mut b, &mut a);
    assert!(!a.sync_conflicts().unwrap().is_empty());
    a.sync_resolve(EntityKind::Note, &nid, &wa.digest, true)
        .unwrap();
    let notes = a.notes().unwrap();
    assert_eq!(notes.len(), 2);
    let media = a.attachments().unwrap();
    let paths = media
        .iter()
        .map(|a| a.relative_path.clone())
        .collect::<HashSet<_>>();
    assert_eq!(paths.len(), media.len());
    let copy = notes.iter().find(|n| n.id != nid).unwrap().id.clone();
    a.action(json!({"type":"deleteNote","id":copy})).unwrap();
    a.action(json!({"type":"purgeNote","id":copy})).unwrap();
    assert!(a.sync_blob_path(&blob.hash).is_ok());
    assert!(a.note(&nid).is_ok());
}

fn foreign_folder(
    s: &Store,
    id: &str,
    parent: Option<&str>,
    device: &str,
    counter: u64,
) -> WireVersion {
    let mut f = validation::normal_folder(id);
    f.name = id.into();
    f.parent_id = parent.map(str::to_string);
    WireVersion {
        version: 1,
        workspace_id: s.sync_identity().unwrap().unwrap().workspace_id,
        kind: EntityKind::Folder,
        entity_id: id.into(),
        vector: Vector::from([(device.into(), counter)]),
        payload: Some(validation::wire_folder(&f).unwrap()),
        digest: String::new(),
    }
    .seal()
}
#[test]
fn out_of_order_folder_dependency_reprojects_existing_note_and_reports_derived_target() {
    let (_r, mut s, _b, _) = pair();
    let device = id();
    let mut note = foreign_note(&s, "dependent-note84", "dependent", &device);
    note.payload.as_mut().unwrap()["note"]["folderId"] = json!("later-folder84");
    note = note.seal();
    s.sync_receive(vec![note]).unwrap();
    s.sync_apply_pending().unwrap();
    assert_eq!(s.note("dependent-note84").unwrap().folder_id, "default");
    let folder = foreign_folder(&s, "later-folder84", None, &device, 2);
    s.sync_receive(vec![folder.clone()]).unwrap();
    let plan = s.sync_plan_apply(&[]).unwrap();
    assert!(plan.targets.contains(&"dependent-note84".to_string()));
    s.sync_apply_plan(&plan).unwrap();
    assert_eq!(
        s.note("dependent-note84").unwrap().folder_id,
        "later-folder84"
    );
    let deleted = WireVersion {
        payload: None,
        vector: Vector::from([(device.clone(), 3)]),
        digest: String::new(),
        ..folder.clone()
    }
    .seal();
    s.sync_receive(vec![deleted]).unwrap();
    assert!(s
        .sync_apply_pending()
        .unwrap()
        .changes
        .iter()
        .any(|v| v.entity_id == "dependent-note84"));
    assert_eq!(s.note("dependent-note84").unwrap().folder_id, "default");
    let restored = WireVersion {
        vector: Vector::from([(device, 4)]),
        digest: String::new(),
        ..folder
    }
    .seal();
    s.sync_receive(vec![restored]).unwrap();
    s.sync_apply_pending().unwrap();
    assert_eq!(
        s.note("dependent-note84").unwrap().folder_id,
        "later-folder84"
    );
    let revision = s.note("dependent-note84").unwrap().revision;
    let report = s.sync_apply_pending().unwrap();
    assert!(report.changes.is_empty());
    assert_eq!(s.note("dependent-note84").unwrap().revision, revision);
}
#[test]
fn concurrent_folder_cycle_projection_converges_in_reverse_delivery_order() {
    let (_r, mut a, _r2, mut b) = pair();
    let fa = foreign_folder(&a, "folder-a84", Some("folder-b84"), &id(), 1);
    let fb = foreign_folder(&a, "folder-b84", Some("folder-a84"), &id(), 1);
    a.sync_receive(vec![fa.clone()]).unwrap();
    a.sync_apply_pending().unwrap();
    a.sync_receive(vec![fb.clone()]).unwrap();
    a.sync_apply_pending().unwrap();
    b.sync_receive(vec![fb]).unwrap();
    b.sync_apply_pending().unwrap();
    b.sync_receive(vec![fa]).unwrap();
    b.sync_apply_pending().unwrap();
    for fid in ["folder-a84", "folder-b84"] {
        assert_eq!(
            serde_json::to_value(a.folder(fid).unwrap()).unwrap(),
            serde_json::to_value(b.folder(fid).unwrap()).unwrap()
        );
    }
    assert!(a.folder("folder-a84").unwrap().parent_id.is_none());
    assert_eq!(
        a.folder("folder-b84").unwrap().parent_id.as_deref(),
        Some("folder-a84")
    );
}
#[test]
fn plans_exclude_busy_owner_and_folder_updates_but_apply_unrelated_notes() {
    let (_r, mut a, _r2, mut b) = pair();
    let active = create(&mut a, "recording owner");
    let other = create(&mut a, "unrelated");
    exchange(&mut a, &mut b);
    edit(&mut b, &active, "remote active");
    edit(&mut b, &other, "remote unrelated");
    let folder = foreign_folder(&a, "deferred-folder84", None, &id(), 1);
    let mut remote = versions(&mut b);
    remote.push(folder);
    a.sync_receive(remote).unwrap();
    let plan = a.sync_plan_apply(std::slice::from_ref(&active)).unwrap();
    assert!(!plan.targets.contains(&active));
    assert!(plan.targets.contains(&other));
    assert!(plan.changes.iter().all(|v| v.kind != EntityKind::Folder));
    let report = a.sync_apply_plan(&plan).unwrap();
    assert!(!report.applied);
    assert_eq!(a.note(&active).unwrap().plain_text, "recording owner");
    assert_eq!(a.note(&other).unwrap().plain_text, "remote unrelated");
    assert!(a.folder("deferred-folder84").is_err());
    a.sync_apply_pending().unwrap();
    assert_eq!(a.note(&active).unwrap().plain_text, "remote active");
    assert!(a.folder("deferred-folder84").is_ok());
}
#[test]
fn stale_plan_cannot_cover_a_new_local_edit_or_changed_target() {
    let (_r, mut a, _r2, mut b) = pair();
    let nid = create(&mut a, "base");
    exchange(&mut a, &mut b);
    edit(&mut b, &nid, "remote");
    a.sync_receive(versions(&mut b)).unwrap();
    let plan = a.sync_plan_apply(&[]).unwrap();
    edit(&mut a, &nid, "new local draft");
    assert_eq!(
        a.sync_apply_plan(&plan).unwrap_err().code,
        "sync_plan_stale"
    );
    assert_eq!(a.note(&nid).unwrap().plain_text, "new local draft");
    let mut newplan = a.sync_plan_apply(&[]).unwrap();
    newplan.targets.push("forged-extra-target84".into());
    assert_eq!(
        a.sync_apply_plan(&newplan).unwrap_err().code,
        "sync_plan_stale"
    );
    assert_eq!(a.note(&nid).unwrap().plain_text, "new local draft");
}
#[test]
fn apply_and_flush_faults_roll_back_capture_counter_inbox_heads_and_rows() {
    let (_r, mut a, _r2, mut b) = pair();
    let nid = create(&mut a, "base");
    a.db.execute_batch("CREATE TRIGGER fail84 BEFORE INSERT ON sync_seen BEGIN SELECT RAISE(ABORT,'flush rollback'); END").unwrap();
    let counter: u64 =
        a.db.query_row("SELECT counter FROM sync_identity", [], |r| r.get(0))
            .unwrap();
    assert!(a.sync_flush().is_err());
    assert_eq!(
        a.db.query_row("SELECT counter FROM sync_identity", [], |r| r
            .get::<_, u64>(0))
            .unwrap(),
        counter
    );
    assert!(a.sync_inventory().is_err());
    a.db.execute_batch("DROP TRIGGER fail84").unwrap();
    exchange(&mut a, &mut b);
    edit(&mut a, &nid, "remote changed");
    b.sync_receive(versions(&mut a)).unwrap();
    let plan = b.sync_plan_apply(&[]).unwrap();
    let before = b.note(&nid).unwrap().plain_text;
    b.db.execute_batch("CREATE TRIGGER fail84 BEFORE UPDATE ON sync_identity WHEN OLD.capture=0 AND NEW.capture=1 BEGIN SELECT RAISE(ABORT,'apply rollback'); END").unwrap();
    assert!(b.sync_apply_plan(&plan).is_err());
    assert_eq!(b.note(&nid).unwrap().plain_text, before);
    assert_eq!(
        b.db.query_row("SELECT capture FROM sync_identity", [], |r| r
            .get::<_, u32>(0))
            .unwrap(),
        1
    );
    assert_eq!(b.inbox().unwrap().len(), 1);
    assert_eq!(b.sync_inventory().unwrap().len(), 1);
    b.db.execute_batch("DROP TRIGGER fail84").unwrap();
    b.sync_apply_plan(&plan).unwrap();
    assert_eq!(b.note(&nid).unwrap().plain_text, "remote changed");
}
#[test]
fn malformed_wire_system_edits_paths_time_depth_and_head_overflow_are_atomic() {
    let (_r, mut a, _r2, _b) = pair();
    let valid = foreign_note(&a, "malformed84", "valid", &id());
    let mut variants = Vec::new();
    let mut wrong = valid.clone();
    wrong.workspace_id = id();
    variants.push(wrong.seal());
    let mut wrong = valid.clone();
    wrong.payload.as_mut().unwrap()["note"]["revision"] = json!(100);
    variants.push(wrong.seal());
    let mut wrong = valid.clone();
    wrong.payload.as_mut().unwrap()["note"]["createdAt"] = json!(-1);
    variants.push(wrong.seal());
    let mut wrong = valid.clone();
    wrong.payload.as_mut().unwrap()["note"]["sealed"] =
        json!({"salt":"bad","nonce":"bad","ciphertext":"bad"});
    variants.push(wrong.seal());
    let mut wrong = valid.clone();
    wrong.vector.clear();
    variants.push(wrong.seal());
    let mut wrong = valid.clone();
    wrong.version = 2;
    variants.push(wrong.seal());
    let mut wrong = valid.clone();
    wrong.digest = "0".repeat(64);
    variants.push(wrong);
    let mut nested = json!({"type":"text","text":"deep"});
    for _ in 0..65 {
        nested = json!({"type":"paragraph","content":[nested]});
    }
    let mut wrong = valid.clone();
    wrong.payload.as_mut().unwrap()["note"]["document"] = nested;
    variants.push(wrong.seal());
    let mut wrong = foreign_folder(&a, "valid-folder84", None, &id(), 1);
    wrong.entity_id = "default".into();
    wrong.payload.as_mut().unwrap()["id"] = json!("default");
    variants.push(wrong.seal());
    for wrong in variants {
        assert!(a.sync_receive(vec![wrong]).is_err());
        assert!(a.inbox().unwrap().is_empty());
        assert!(a.notes().unwrap().is_empty());
    }
    let concurrent = (0..33)
        .map(|_| foreign_note(&a, "head-overflow84", "one", &id()))
        .collect();
    assert_eq!(a.sync_receive(concurrent).unwrap_err().code, "sync_limit");
    assert!(a.inbox().unwrap().is_empty());
    let mut top = serde_json::to_value(valid).unwrap();
    top["accessToken"] = json!("never allowed");
    assert!(serde_json::from_value::<WireVersion>(top).is_err());
}
#[test]
fn bad_extension_schema_is_rejected_and_failed_bootstrap_leaves_old_store_usable() {
    let root = tempfile::tempdir().unwrap();
    let s = Store::open(root.path()).unwrap();
    s.db.execute_batch("CREATE TABLE sync_identity(x TEXT)")
        .unwrap();
    drop(s);
    assert_eq!(
        Store::open(root.path()).err().unwrap().code,
        "sync_schema_invalid"
    );
    let root = tempfile::tempdir().unwrap();
    let mut s = Store::open(root.path()).unwrap();
    let nid = create(&mut s, "with media");
    let attachment = add_media(&mut s, &nid, "missing.png", b"will go missing");
    fs::remove_file(s.attachment_path(&attachment.relative_path).unwrap()).unwrap();
    assert!(s.sync_enable(None).is_err());
    assert!(s.sync_identity().unwrap().is_none());
    assert!(s.note(&nid).is_ok());
    drop(s);
    assert!(Store::open(root.path()).is_ok());
    let root = tempfile::tempdir().unwrap();
    let mut s = Store::open(root.path()).unwrap();
    s.sync_enable(None).unwrap();
    s.db.execute_batch("DROP TRIGGER sync_capture_notes_update")
        .unwrap();
    drop(s);
    assert_eq!(
        Store::open(root.path()).err().unwrap().code,
        "sync_schema_invalid"
    );
}
#[test]
fn blob_budgets_duplicate_hash_staging_recovery_and_corruption_are_explicit() {
    let (root, s, _r2, _b) = pair();
    let data = b"durable blob84";
    let hash = sha256(data);
    s.sync_store_blob(&hash, data.len() as u64, &data[..])
        .unwrap();
    for i in 0..4 {
        fs::write(
            root.path().join(format!(".sync/staging/{i}.part")),
            b"pending",
        )
        .unwrap();
    }
    let other = b"new blob";
    assert_eq!(
        s.sync_store_blob(&sha256(other), other.len() as u64, &other[..])
            .unwrap_err()
            .code,
        "sync_limit"
    );
    s.sync_store_blob(&hash, data.len() as u64, &data[..])
        .unwrap();
    assert_eq!(
        fs::read_dir(root.path().join(".sync/staging"))
            .unwrap()
            .count(),
        4
    );
    drop(s);
    let s = Store::open(root.path()).unwrap();
    assert_eq!(
        fs::read_dir(root.path().join(".sync/staging"))
            .unwrap()
            .count(),
        0
    );
    let sparse = root
        .path()
        .join(".sync/blobs")
        .join(format!("{}.blob", "0".repeat(64)));
    fs::File::create(&sparse)
        .unwrap()
        .set_len(4 * 1024 * 1024 * 1024)
        .unwrap();
    assert_eq!(
        s.sync_store_blob(&sha256(other), other.len() as u64, &other[..])
            .unwrap_err()
            .code,
        "sync_limit"
    );
    fs::remove_file(sparse).unwrap();
    fs::write(s.sync_blob_path(&hash).unwrap(), b"corrupt").unwrap();
    assert_eq!(
        s.sync_blob_path(&hash).unwrap_err().code,
        "sync_blob_corrupt"
    );
}

#[test]
fn branch_actor_forks_deterministically_and_reuses_across_restart() {
    let (root, mut a, _r2, _b) = pair();
    let nid = create(&mut a, "base");
    let base = local_note_wire(&mut a, &nid);
    let device = a.sync_identity().unwrap().unwrap().device_id;
    edit(&mut a, &nid, "local A2");
    let a2 = local_note_wire(&mut a, &nid);
    assert_eq!(a2.vector[&device], 2);
    // A trashed concurrent version always projects ahead of a live version;
    // this fixture does not depend on random IDs or digest ordering.
    let mut remote = base.clone();
    remote.vector.insert(id(), 1);
    remote.payload.as_mut().unwrap()["note"]["deletedAt"] = json!(2);
    remote.payload.as_mut().unwrap()["note"]["folderId"] = json!("trash");
    remote.payload.as_mut().unwrap()["note"]["originalFolderId"] = json!("default");
    remote = remote.seal();
    a.sync_receive(vec![remote.clone()]).unwrap();
    a.sync_apply_pending().unwrap();
    assert_eq!(
        projected_base(&a.db, &EntityKind::Note, &nid).unwrap(),
        remote.vector
    );
    a.action(json!({"type":"restoreNote","id":nid})).unwrap();
    let next = local_note_wire(&mut a, &nid);
    assert!(!dominates(&next.vector, &a2.vector));
    assert_eq!(next.vector[&device], 1);
    assert_eq!(a.sync_conflicts().unwrap()[0].versions.len(), 2);
    let fresh = next
        .vector
        .keys()
        .find(|actor| !remote.vector.contains_key(*actor))
        .unwrap()
        .clone();
    assert_ne!(fresh, device);
    assert_eq!(next.vector[&fresh], 1);
    drop(a);
    let mut a = Store::open(root.path()).unwrap();
    edit(&mut a, &nid, "continue branch");
    let resumed = local_note_wire(&mut a, &nid);
    assert_eq!(resumed.vector[&fresh], 2);
    assert_eq!(resumed.vector.len(), next.vector.len());
    assert!(!dominates(&resumed.vector, &a2.vector));
}
#[test]
fn frontier_protects_pending_and_compacted_history_after_restart() {
    let (root, mut a, _r2, _b) = pair();
    let nid = create(&mut a, "base");
    let base = local_note_wire(&mut a, &nid);
    let device = a.sync_identity().unwrap().unwrap().device_id;
    let mut future = base.clone();
    future.vector.insert(device.clone(), 9);
    future.payload.as_mut().unwrap()["note"]["title"] = json!("pending future");
    future = future.seal();
    a.sync_receive(vec![future.clone()]).unwrap();
    // A durable inbox component already belongs to a distinct branch, even
    // before it can be projected or is later compacted from current heads.
    drop(a);
    let mut a = Store::open(root.path()).unwrap();
    assert_eq!(a.inbox().unwrap().len(), 1);
    edit(&mut a, &nid, "selected old branch");
    let next = local_note_wire(&mut a, &nid);
    assert_eq!(next.vector[&device], 1);
    assert!(!dominates(&next.vector, &future.vector));
    assert_eq!(next.vector.len(), 2);
    // The frontier is independent of head/inbox retention, surviving restart.
    a.db.execute("DELETE FROM sync_inbox", []).unwrap();
    a.db.execute("DELETE FROM sync_heads", []).unwrap();
    set_projection(&a.db, &base).unwrap();
    drop(a);
    let mut a = Store::open(root.path()).unwrap();
    edit(&mut a, &nid, "edit compacted projected branch");
    let after = local_note_wire(&mut a, &nid);
    assert_eq!(after.vector[&device], 1);
    assert_eq!(after.vector.len(), 2);
    assert!(!dominates(&after.vector, &future.vector));
}

#[cfg(unix)]
#[test]
fn crash84_child() {
    use std::io::Write;
    let Ok(root) = std::env::var("NOTES_SYNC84_CRASH_ROOT") else {
        return;
    };
    let mut store = Store::open(Path::new(&root)).unwrap();
    store.sync_enable(None).unwrap();
    store.db.execute_batch("BEGIN IMMEDIATE").unwrap();
    let nid = create(&mut store, "crash-durable-business84");
    if std::env::var("NOTES_SYNC84_CRASH_STAGE").unwrap() == "after" {
        store.db.execute_batch("COMMIT").unwrap();
    }
    println!("SYNC84_READY:{nid}");
    std::io::stdout().flush().unwrap();
    loop {
        std::thread::park();
    }
}
#[cfg(unix)]
#[test]
fn real_sigkill_preserves_exact_business_and_dirty_commit_boundary() {
    use std::{
        io::{BufRead, BufReader},
        process::{Command, Stdio},
        sync::mpsc,
        time::Duration,
    };
    for stage in ["before", "after"] {
        let root = tempfile::tempdir().unwrap();
        let mut child = Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "store::synchronization::tests::crash84_child",
                "--nocapture",
            ])
            .env("NOTES_SYNC84_CRASH_ROOT", root.path())
            .env("NOTES_SYNC84_CRASH_STAGE", stage)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        let stdout = child.stdout.take().unwrap();
        let (sender, receiver) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                if let Ok(line) = line {
                    if let Some(nid) = line.strip_prefix("SYNC84_READY:") {
                        let _ = sender.send(nid.to_string());
                        return;
                    }
                }
            }
        });
        let ready = receiver.recv_timeout(Duration::from_secs(10));
        let killed = Command::new("kill")
            .args(["-KILL", &child.id().to_string()])
            .status()
            .unwrap();
        assert!(killed.success());
        let status = child.wait().unwrap();
        assert!(!status.success());
        let nid = ready.unwrap();
        let mut store = Store::open(root.path()).unwrap();
        let dirty: usize = store
            .db
            .query_row("SELECT count(*) FROM sync_dirty", [], |r| r.get(0))
            .unwrap();
        if stage == "before" {
            assert!(store.note(&nid).is_err());
            assert_eq!(dirty, 0);
            assert!(store.sync_inventory().unwrap().is_empty());
        } else {
            assert_eq!(
                store.note(&nid).unwrap().plain_text,
                "crash-durable-business84"
            );
            assert_eq!(dirty, 1);
            assert_eq!(
                local_note_wire(&mut store, &nid).payload.unwrap()["note"]["plainText"],
                "crash-durable-business84"
            );
        }
    }
}
#[test]
fn actor_and_counter_budgets_roll_back_without_losing_dirty() {
    let (_r, mut a, _r2, _b) = pair();
    let nid = create(&mut a, "base");
    let base = local_note_wire(&mut a, &nid);
    let mut maximum = base.clone();
    maximum.vector = (0..64).map(|_| (id(), 1)).collect();
    maximum = maximum.seal();
    // A 64-component incoming branch is valid alone; this entity already owns
    // another actor, so its conservative persistent frontier budget rejects it.
    assert_eq!(
        a.sync_receive(vec![maximum]).unwrap_err().code,
        "sync_limit"
    );
    assert!(a.inbox().unwrap().is_empty());
    let mut invalid = base.clone();
    invalid.vector = (0..65).map(|_| (id(), 1)).collect();
    assert!(a.sync_receive(vec![invalid.seal()]).is_err());
    a.db.execute("UPDATE sync_identity SET counter=?1", [MAX_COUNTER])
        .unwrap();
    edit(&mut a, &nid, "must retain draft");
    assert_eq!(a.sync_flush().unwrap_err().code, "sync_limit");
    assert_eq!(a.note(&nid).unwrap().plain_text, "must retain draft");
    assert_eq!(
        a.db.query_row("SELECT count(*) FROM sync_dirty", [], |r| r
            .get::<_, usize>(0))
            .unwrap(),
        1
    );
    assert_eq!(heads(&a.db).unwrap()[0].wire.digest, base.digest);
}
#[test]
fn inbox_count_limit_and_wire_shape_are_strict() {
    let (_r, mut a, _r2, _b) = pair();
    let actor = id();
    for batch in 0..8 {
        let versions = (0..128)
            .map(|i| {
                foreign_note(
                    &a,
                    &format!("inbox84-{}", batch * 128 + i),
                    "staged",
                    &actor,
                )
            })
            .collect();
        a.sync_receive(versions).unwrap();
    }
    assert_eq!(a.inbox().unwrap().len(), 1024);
    let excess = foreign_note(&a, "inbox84-excess", "excess", &actor);
    assert_eq!(a.sync_receive(vec![excess]).unwrap_err().code, "sync_limit");
    assert_eq!(a.inbox().unwrap().len(), 1024);
    let valid = foreign_note(&a, "shape84", "shape", &actor);
    let mut raw = serde_json::to_value(valid).unwrap();
    raw.as_object_mut().unwrap().remove("payload");
    assert!(serde_json::from_value::<WireVersion>(raw).is_err());
    let forbidden = json!({"id":"a","noteId":"n","kind":"image","mime":"image/png","displayName":"x.png","size":1,"sha256":"0".repeat(64),"relativePath":"../never-wire"});
    assert!(serde_json::from_value::<WireAttachment>(forbidden).is_err());
}
#[test]
fn remote_attachment_id_cannot_replace_unreferenced_local_bytes() {
    let (_r, mut a, _r2, _b) = pair();
    let nid = create(&mut a, "owner");
    let local = a
        .store_attachment(&nid, "orphan.png", "image/png", b"local orphan84".to_vec())
        .unwrap();
    a.sync_flush().unwrap();
    let mut wire = foreign_note(&a, &nid, "remote", &id());
    let attachment = WireAttachment {
        id: local.id.clone(),
        note_id: nid.clone(),
        kind: local.kind.clone(),
        mime: local.mime.clone(),
        display_name: local.display_name.clone(),
        size: local.size,
        recorded_at: None,
        sha256: sha256(b"other orphan84"),
    };
    wire.payload.as_mut().unwrap()["note"]["document"] = json!({"type":"doc","content":[{"type":"attachment","attrs":{"id":local.id,"kind":"image","name":"orphan.png"}}]});
    wire.payload.as_mut().unwrap()["attachments"] = json!([attachment]);
    wire = wire.seal();
    assert_eq!(
        a.sync_receive(vec![wire]).unwrap_err().code,
        "sync_attachment_conflict"
    );
    assert!(a.inbox().unwrap().is_empty());
    assert_eq!(
        a.read_attachment(&local.id).unwrap()["data"],
        B64.encode(b"local orphan84")
    );
}

#[test]
fn prepared_identity_adoption_is_atomic_opt_in_and_cannot_drift() {
    for with_note in [false, true] {
        let root = tempfile::tempdir().unwrap();
        let mut s = Store::open(root.path()).unwrap();
        let local = if with_note {
            Some(create(&mut s, "preexisting local note"))
        } else {
            None
        };
        let workspace = id();
        let prepared_device = id();
        // Preparing transport credentials has not called adopt: an auth failure
        // may discard those files without leaving any Store sync extension.
        assert!(s.sync_identity().unwrap().is_none());
        assert!(!enabled(&s.db).unwrap());
        assert!(s
            .sync_enable_with_device(Some(&workspace), "bad-device")
            .is_err());
        assert!(!enabled(&s.db).unwrap());
        let adopted = s
            .sync_enable_with_device(Some(&workspace), &prepared_device)
            .unwrap();
        assert_eq!(adopted.workspace_id, workspace);
        assert_eq!(adopted.device_id, prepared_device);
        assert_eq!(
            s.sync_enable_with_device(Some(&workspace), &prepared_device)
                .unwrap(),
            adopted
        );
        assert_eq!(s.sync_enable(None).unwrap(), adopted);
        assert_eq!(
            s.sync_enable_with_device(Some(&id()), &prepared_device)
                .unwrap_err()
                .code,
            "sync_workspace_mismatch"
        );
        assert_eq!(
            s.sync_enable_with_device(Some(&workspace), &id())
                .unwrap_err()
                .code,
            "sync_device_mismatch"
        );
        let inventory = s.sync_inventory().unwrap();
        assert_eq!(inventory.len(), usize::from(with_note));
        if let Some(local) = local {
            assert_eq!(inventory[0].entity_id, local);
            assert_eq!(s.note(&local).unwrap().plain_text, "preexisting local note");
        }
        drop(s);
        let s = Store::open(root.path()).unwrap();
        assert_eq!(s.sync_identity().unwrap().unwrap(), adopted);
    }
}
#[test]
fn remote_lock_retires_local_media_metadata_and_preserves_explicit_plaintext_conflict() {
    let (_r, mut a, _r2, mut b) = pair();
    let nid = create(&mut a, "base\nSECRET_CONFLICT84");
    exchange(&mut a, &mut b);
    let attachment = add_media(&mut a, &nid, "old.png", b"old media84");
    // B locks the causal continuation. A has independently edited plaintext,
    // so the unselected concurrent head remains explicit until resolution.
    b.action(json!({"type":"lockNote","id":nid,"password":"remote-password84"}))
        .unwrap();
    let locked = local_note_wire(&mut b, &nid);
    edit(&mut a, &nid, "public branch\nSECRET_EXPLICIT_CONFLICT84");
    let plain = local_note_wire(&mut a, &nid);
    a.sync_receive(vec![locked.clone()]).unwrap();
    a.sync_apply_pending().unwrap();
    assert_eq!(a.sync_conflicts().unwrap()[0].versions.len(), 2);
    assert!(heads(&a.db)
        .unwrap()
        .iter()
        .any(|h| h.wire.digest == plain.digest && h.wire.payload.is_some()));
    a.sync_resolve(EntityKind::Note, &nid, &locked.digest, false)
        .unwrap();
    assert!(a.note(&nid).unwrap().locked);
    assert!(!a
        .attachments()
        .unwrap()
        .iter()
        .any(|item| item.id == attachment.id));
    assert!(a.sync_conflicts().unwrap().is_empty());
    assert!(a
        .sync_inventory()
        .unwrap()
        .iter()
        .all(
            |v| !serde_json::to_string(&a.sync_version(&v.digest).unwrap())
                .unwrap()
                .contains("SECRET_EXPLICIT_CONFLICT84")
        ));
}

#[test]
fn lock_clears_staged_causal_ancestors_before_flush_and_keeps_concurrent_plaintext() {
    let (_r, mut a, root, mut b) = pair();
    let nid = create(&mut a, "public\nSECRET_ANCESTOR84");
    let ancestor = local_note_wire(&mut a, &nid);
    edit(&mut a, &nid, "public\nSECRET_SELECTED84");
    let latest = local_note_wire(&mut a, &nid);
    b.sync_receive(vec![latest]).unwrap();
    b.sync_apply_pending().unwrap();
    b.sync_receive(vec![ancestor.clone()]).unwrap();
    let concurrent = foreign_note(&b, &nid, "public\nSECRET_CONCURRENT84", &id());
    b.sync_receive(vec![concurrent.clone()]).unwrap();
    assert_eq!(b.inbox().unwrap().len(), 2);
    b.action(json!({"type":"lockNote","id":nid,"password":"ancestor-password84"}))
        .unwrap();
    assert!(b.sync_inventory().is_err());
    let inbox = b.inbox().unwrap();
    assert_eq!(inbox.len(), 1);
    assert_eq!(inbox[0].digest, concurrent.digest);
    b.sync_receive(vec![ancestor]).unwrap();
    assert_eq!(b.inbox().unwrap().len(), 1);
    assert!(heads(&b.db)
        .unwrap()
        .iter()
        .all(|h| h.wire.payload.is_none() && h.redacted));
    // lockNote already checkpoints WAL. Check SQL and persisted bytes before
    // background flush, then reopen while the sealed dirty row is still pending.
    let bytes = fs::read(root.path().join("notes.sqlite3")).unwrap();
    for secret in ["SECRET_ANCESTOR84", "SECRET_SELECTED84"] {
        assert!(!bytes
            .windows(secret.len())
            .any(|window| window == secret.as_bytes()));
    }
    assert!(bytes
        .windows("SECRET_CONCURRENT84".len())
        .any(|window| window == b"SECRET_CONCURRENT84"));
    drop(b);
    let mut b = Store::open(root.path()).unwrap();
    assert!(b.note(&nid).unwrap().locked);
    assert!(heads(&b.db).unwrap().iter().all(|h| h.redacted));
    assert_eq!(b.inbox().unwrap()[0].digest, concurrent.digest);
    b.sync_flush().unwrap();
    b.sync_apply_pending().unwrap();
    let conflicts = b.sync_conflicts().unwrap();
    assert_eq!(conflicts.len(), 1);
    assert!(conflicts[0]
        .versions
        .iter()
        .any(|v| v.digest == concurrent.digest && !v.locked));
    assert!(heads(&b.db)
        .unwrap()
        .iter()
        .any(|h| h.wire.digest == concurrent.digest && h.wire.payload.is_some()));
}
#[test]
fn known_version_with_missing_blob_cannot_ack_durable() {
    let (_r, mut a, _r2, mut b) = pair();
    let nid = create(&mut a, "media");
    add_media(&mut a, &nid, "known.png", b"known version blob84");
    let wire = local_note_wire(&mut a, &nid);
    exchange(&mut a, &mut b);
    let reference = a.sync_required_blobs(&wire).unwrap().remove(0);
    fs::remove_file(b.sync_blob_path(&reference.hash).unwrap()).unwrap();
    let revision = b.note(&nid).unwrap().revision;
    let report = b.sync_receive(vec![wire.clone()]).unwrap();
    assert!(!report.durable);
    assert_eq!(report.missing_blobs, vec![reference.clone()]);
    assert!(b.inbox().unwrap().is_empty());
    b.sync_store_blob(
        &reference.hash,
        reference.size,
        fs::File::open(a.sync_blob_path(&reference.hash).unwrap()).unwrap(),
    )
    .unwrap();
    assert!(b.sync_receive(vec![wire]).unwrap().durable);
    assert_eq!(b.note(&nid).unwrap().revision, revision);
}

#[test]
fn locked_wire_accepts_canonical_local_bootstrap_and_rejects_nonempty_node_content() {
    let root = tempfile::tempdir().unwrap();
    let mut a = Store::open(root.path()).unwrap();
    let nid = create(&mut a, "public\nsealed body84");
    a.action(json!({"type":"lockNote","id":nid,"password":"locked-wire84-password"}))
        .unwrap();
    // A note locked before sync opt-in must bootstrap using its real raw sealed
    // row. Required-blob discovery and receipt accept the same canonical body.
    let workspace = a.sync_enable(None).unwrap().workspace_id;
    let wire = local_note_wire(&mut a, &nid);
    assert_eq!(
        wire.payload.as_ref().unwrap()["note"]["document"],
        empty_doc()
    );
    assert!(a.sync_required_blobs(&wire).unwrap().is_empty());
    let target = tempfile::tempdir().unwrap();
    let mut b = Store::open(target.path()).unwrap();
    b.sync_enable(Some(&workspace)).unwrap();
    assert!(b.sync_receive(vec![wire.clone()]).unwrap().durable);
    b.sync_apply_pending().unwrap();
    assert!(b.note(&nid).unwrap().locked);
    assert_eq!(b.note(&nid).unwrap().document, empty_doc());
    let drawing = json!({"type":"doc","content":[{"type":"drawing","attrs":{"strokes":[{"color":"#112233","points":[[10,10],[80,70],[140,20]],"tool":"pen","width":2.5}]}}]});
    let documents = [
        drawing,
        json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"plaintext"}]}]}),
        json!({"type":"doc","content":[{"type":"horizontalRule"}]}),
        json!({"type":"doc","content":[{"type":"attachment","attrs":{"id":"hidden-media84","kind":"image","name":"private.png"}}]}),
    ];
    for document in documents {
        let mut bad = wire.clone();
        bad.payload.as_mut().unwrap()["note"]["document"] = document;
        bad.vector.insert(id(), 1);
        bad = bad.seal();
        let before = b.generation(&b.db).unwrap();
        assert_eq!(
            b.sync_required_blobs(&bad).unwrap_err().code,
            "sync_invalid"
        );
        assert_eq!(b.sync_receive(vec![bad]).unwrap_err().code, "sync_invalid");
        assert_eq!(b.generation(&b.db).unwrap(), before);
        assert!(b.inbox().unwrap().is_empty());
    }
}
