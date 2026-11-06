use super::*;
use std::io::{Seek, SeekFrom, Write};
fn setup() -> (tempfile::TempDir, Store, String, Attachment) {
    let d = tempfile::tempdir().unwrap();
    let mut s = Store::open(d.path()).unwrap();
    s.sync_enable(None).unwrap();
    let id = s.action(json!({"type":"createNote"})).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let a = s
        .store_attachment(&id, "proof.png", "image/png", vec![7; 4096])
        .unwrap();
    s.action(json!({"type":"saveNote","id":id,"revision":0,"document":{"type":"doc","content":[{"type":"attachment","attrs":{"id":a.id,"kind":"image","name":"proof.png"}}]}})).unwrap();
    (d, s, id, a)
}
#[test]
fn prepared_media_rejects_changed_generation_without_losing_dirty_and_retries() {
    let (_d, mut s, id, _) = setup();
    let media = s.sync_media_snapshot(&[], false).unwrap().verify().unwrap();
    let before: i64 =
        s.db.query_row("SELECT counter FROM sync_identity", [], |r| r.get(0))
            .unwrap();
    s.action(json!({"type":"patchNote","id":id,"pinned":true}))
        .unwrap();
    assert_eq!(
        s.sync_begin_media(media).unwrap_err().code,
        "sync_plan_stale"
    );
    assert_eq!(
        s.db.query_row::<i64, _, _>("SELECT counter FROM sync_identity", [], |r| r.get(0))
            .unwrap(),
        before
    );
    assert!(
        s.db.query_row::<i64, _, _>("SELECT count(*) FROM sync_dirty", [], |r| r.get(0))
            .unwrap()
            > 0
    );
    let retry = s.sync_media_snapshot(&[], false).unwrap().verify().unwrap();
    s.sync_with_media(retry, |s| s.sync_flush()).unwrap();
    assert_eq!(
        s.db.query_row::<i64, _, _>("SELECT count(*) FROM sync_dirty", [], |r| r.get(0))
            .unwrap(),
        0
    );
    let media = s.sync_media_snapshot(&[], false).unwrap().verify().unwrap();
    s.action(json!({"type":"deleteNote","id":id})).unwrap();
    assert_eq!(
        s.sync_begin_media(media).unwrap_err().code,
        "sync_plan_stale"
    );
}
#[test]
fn prepared_media_rejects_in_place_replacement_deletion_and_symlink() {
    for change in 0..4 {
        let (_d, mut s, _id, a) = setup();
        let media = s.sync_media_snapshot(&[], false).unwrap().verify().unwrap();
        let path = s.attachment_path(&a.relative_path).unwrap();
        match change {
            0 => {
                let mut f = fs::OpenOptions::new().write(true).open(&path).unwrap();
                f.seek(SeekFrom::Start(2048)).unwrap();
                f.write_all(&[8]).unwrap();
                f.sync_all().unwrap();
            }
            1 => {
                fs::rename(&path, path.with_extension("old")).unwrap();
                fs::write(&path, vec![7; 4096]).unwrap();
            }
            2 => fs::remove_file(&path).unwrap(),
            _ => {
                fs::remove_file(&path).unwrap();
                #[cfg(unix)]
                std::os::unix::fs::symlink("/dev/null", &path).unwrap();
            }
        }
        assert_eq!(
            s.sync_begin_media(media).unwrap_err().code,
            "sync_plan_stale",
            "mutation {change}"
        );
    }
}
#[test]
fn immutable_sha_cache_reuses_file_only_and_never_generation_or_missing_proof() {
    let (_d, mut s, id, a) = setup();
    let media = s.sync_media_snapshot(&[], false).unwrap().verify().unwrap();
    s.sync_with_media(media, |s| s.sync_flush()).unwrap();
    let path = s.attachment_path(&a.relative_path).unwrap();
    let original = s.sync_media_cache.get(&path).unwrap().file.clone();
    let media = s.sync_media_snapshot(&[], false).unwrap().verify().unwrap();
    assert!(Arc::ptr_eq(&original, &media.files.borrow()[&path].file));
    s.action(json!({"type":"patchNote","id":id,"pinned":true}))
        .unwrap();
    assert_eq!(
        s.sync_begin_media(media).unwrap_err().code,
        "sync_plan_stale"
    );
    let media = s.sync_media_snapshot(&[], false).unwrap().verify().unwrap();
    s.sync_with_media(media, |s| {
        let mut unproved = a.clone();
        unproved.relative_path = "not-prepared.png".into();
        assert_eq!(
            s.sync_local_hash(&unproved).unwrap_err().code,
            "sync_plan_stale"
        );
        Ok(())
    })
    .unwrap();
    fs::write(&path, vec![8; 4096]).unwrap();
    assert!(s.sync_media_snapshot(&[], false).unwrap().verify().is_err());
}
#[test]
fn controlled_hard_links_have_unique_paths_repeat_safely_and_refresh_own_identity() {
    let (_d, mut s, id, _) = setup();
    s.sync_flush().unwrap();
    let v = s
        .sync_inventory()
        .unwrap()
        .into_iter()
        .find(|v| v.entity_id == id)
        .unwrap();
    let wire = s.sync_version(&v.digest).unwrap();
    let mut a = validation::note_payload(wire.payload.as_ref().unwrap())
        .unwrap()
        .1
        .remove(0);
    let media = s.sync_media_snapshot(&[], false).unwrap().verify().unwrap();
    s.sync_begin_media(media).unwrap();
    a.id = uuid::Uuid::new_v4().to_string();
    let first = s.sync_media.as_ref().unwrap().materialize(&a).unwrap();
    assert!(s.sync_media.as_ref().unwrap().materialize(&a).unwrap() == first);
    a.id = uuid::Uuid::new_v4().to_string();
    let second = s.sync_media.as_ref().unwrap().materialize(&a).unwrap();
    assert_ne!(first.relative_path, second.relative_path);
    s.sync_end_media();
    let one = s.attachment_path(&first.relative_path).unwrap();
    let two = s.attachment_path(&second.relative_path).unwrap();
    let blob = s
        .root
        .join(".sync/blobs")
        .join(format!("{}.blob", a.sha256));
    assert!(s.sync_media_cache[&one].current(&one));
    assert!(s.sync_media_cache[&two].current(&two));
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        assert_eq!(
            fs::metadata(&one).unwrap().ino(),
            fs::metadata(&blob).unwrap().ino()
        );
    }
    fs::remove_file(&one).unwrap();
    assert_eq!(fs::read(&two).unwrap(), vec![7; 4096]);
    assert_eq!(fs::read(&blob).unwrap(), vec![7; 4096]);
    assert!(!s.sync_media_cache[&two].current(&two));
    let refreshed = VerifiedFile::read(&two, &s.sync_media_cache).unwrap();
    assert!(refreshed.current(&two));
}

#[test]
fn different_peer_stales_preparation_and_sql_failure_preserves_inbox_for_retry() {
    let (d, mut s, _, _) = setup();
    s.sync_flush().unwrap();
    let workspace = s.sync_identity().unwrap().unwrap().workspace_id;
    let media = s.sync_media_snapshot(&[], false).unwrap().verify().unwrap();
    let mut peer = Store::open(d.path().join("peer")).unwrap();
    peer.sync_enable(Some(&workspace)).unwrap();
    let id = peer.action(json!({"type":"createNote"})).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let a = peer
        .store_attachment(&id, "peer.png", "image/png", vec![8; 1024])
        .unwrap();
    peer.action(json!({"type":"saveNote","id":id,"revision":0,"document":{"type":"doc","content":[{"type":"attachment","attrs":{"id":a.id,"kind":"image","name":"peer.png"}}]}})).unwrap();
    peer.sync_flush().unwrap();
    let v = peer
        .sync_inventory()
        .unwrap()
        .into_iter()
        .find(|v| v.entity_id == id)
        .unwrap();
    let wire = peer.sync_version(&v.digest).unwrap();
    let b = peer.sync_required_blobs(&wire).unwrap().remove(0);
    s.sync_store_blob(
        &b.hash,
        b.size,
        File::open(peer.sync_blob_path(&b.hash).unwrap()).unwrap(),
    )
    .unwrap();
    s.sync_receive(vec![wire]).unwrap();
    assert_eq!(
        s.sync_begin_media(media).unwrap_err().code,
        "sync_plan_stale"
    );
    s.db.execute_batch(&format!("CREATE TRIGGER media_abort BEFORE INSERT ON notes WHEN NEW.id='{id}' BEGIN SELECT RAISE(ABORT,'controlled'); END;")).unwrap();
    let media = s.sync_media_snapshot(&[], false).unwrap().verify().unwrap();
    assert!(s
        .sync_with_media(media, |s| s.sync_apply_pending())
        .is_err());
    assert_eq!(s.sync_pending_count().unwrap(), 1);
    assert!(s.note(&id).is_err());
    s.db.execute_batch("DROP TRIGGER media_abort").unwrap();
    let media = s.sync_media_snapshot(&[], false).unwrap().verify().unwrap();
    s.sync_with_media(media, |s| s.sync_apply_pending())
        .unwrap();
    assert_eq!(s.sync_pending_count().unwrap(), 0);
    assert!(s.note(&id).is_ok());
}
