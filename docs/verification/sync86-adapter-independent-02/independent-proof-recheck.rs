#[cfg(test)]
mod independent_proof_recheck {
 use super::*;
 use std::io::Write;
 fn fixture() -> (tempfile::TempDir,Store,String,Attachment) {
  let d=tempfile::tempdir().unwrap();let mut s=Store::open(d.path().join("owned")).unwrap();s.sync_enable(None).unwrap();
  let id=s.action(json!({"type":"createNote"})).unwrap()["id"].as_str().unwrap().to_string();
  let a=s.store_attachment(&id,"independent.png","image/png",vec![23;8192]).unwrap();
  s.action(json!({"type":"saveNote","id":id,"revision":0,"document":{"type":"doc","content":[{"type":"attachment","attrs":{"id":a.id,"kind":"image","name":"independent.png"}}]}})).unwrap();(d,s,id,a)
 }
 #[test]
 fn independent_restored_mtime_replacement_and_external_link_invalidate_proof(){
  for operation in 0..4 {let (_d,mut s,_id,a)=fixture();let proof=s.sync_media_snapshot(&[],false).unwrap().verify().unwrap();let path=s.attachment_path(&a.relative_path).unwrap();let modified=fs::metadata(&path).unwrap().modified().unwrap();
   match operation {
    0=>{let mut f=fs::OpenOptions::new().write(true).open(&path).unwrap();f.write_all(&[99]).unwrap();f.sync_all().unwrap();f.set_modified(modified).unwrap();},
    1=>{fs::rename(&path,path.with_extension("old")).unwrap();fs::write(&path,vec![23;8192]).unwrap();},
    2=>{fs::hard_link(&path,path.with_extension("outside-link")).unwrap();},
    _=>{fs::remove_file(&path).unwrap();#[cfg(unix)] std::os::unix::fs::symlink("/dev/null",&path).unwrap();}
   }
   assert_eq!(s.sync_begin_media(proof).unwrap_err().code,"sync_plan_stale","operation {operation}");
  }
  println!("INDEPENDENT_PROOF restored-mtime=true replaced-inode=true external-nlink=true symlink=true");
 }
 #[test]
 fn independent_peer_receive_stales_scope_and_rollback_keeps_owned_links_for_retry(){
  let (d,mut s,_local,a)=fixture();s.sync_flush().unwrap();let old=s.sync_media_snapshot(&[],false).unwrap().verify().unwrap();
  let workspace=s.sync_identity().unwrap().unwrap().workspace_id;let mut peer=Store::open(d.path().join("peer")).unwrap();peer.sync_enable(Some(&workspace)).unwrap();
  let id=peer.action(json!({"type":"createNote"})).unwrap()["id"].as_str().unwrap().to_string();let pa=peer.store_attachment(&id,"other.png","image/png",vec![31;2048]).unwrap();
  peer.action(json!({"type":"saveNote","id":id,"revision":0,"document":{"type":"doc","content":[{"type":"attachment","attrs":{"id":pa.id,"kind":"image","name":"other.png"}}]}})).unwrap();peer.sync_flush().unwrap();
  let digest=peer.sync_inventory().unwrap().into_iter().find(|v|v.entity_id==id).unwrap().digest;let wire=peer.sync_version(&digest).unwrap();let b=peer.sync_required_blobs(&wire).unwrap().remove(0);s.sync_store_blob(&b.hash,b.size,File::open(peer.sync_blob_path(&b.hash).unwrap()).unwrap()).unwrap();s.sync_receive(vec![wire]).unwrap();
  assert_eq!(s.sync_begin_media(old).unwrap_err().code,"sync_plan_stale");
  s.db.execute_batch(&format!("CREATE TRIGGER independent_fail BEFORE INSERT ON attachments WHEN NEW.note_id='{id}' BEGIN SELECT RAISE(ABORT,'independent rollback'); END;")).unwrap();
  let proof=s.sync_media_snapshot(&[],false).unwrap().verify().unwrap();assert!(s.sync_with_media(proof,|s|s.sync_apply_pending()).is_err());assert_eq!(s.sync_pending_count().unwrap(),1);assert!(s.note(&id).is_err());
  let local_bytes=fs::read(s.attachment_path(&a.relative_path).unwrap()).unwrap();assert_eq!(local_bytes,vec![23;8192]);
  s.db.execute_batch("DROP TRIGGER independent_fail").unwrap();
  // Reopen exactly the owned Store after the rollback, with its complete files.
  let root=s.root.clone();drop(s);let mut reopened=Store::open(&root).unwrap();assert_eq!(reopened.sync_pending_count().unwrap(),1);
  let proof=reopened.sync_media_snapshot(&[],false).unwrap().verify().unwrap();reopened.sync_with_media(proof,|s|s.sync_apply_pending()).unwrap();assert_eq!(reopened.sync_pending_count().unwrap(),0);assert!(reopened.note(&id).is_ok());
  let attached=reopened.attachments().unwrap().into_iter().find(|x|x.id==pa.id).unwrap();assert_ne!(attached.relative_path,a.relative_path);assert_eq!(fs::read(reopened.attachment_path(&attached.relative_path).unwrap()).unwrap(),vec![31;2048]);
  assert_eq!(fs::read_dir(root.join(".sync/staging")).unwrap().count(),0);
  println!("INDEPENDENT_PROOF peer-generation=true trigger-after-link-rollback=true same-root-reopen=true dirty-inbox-preserved=true retry=true independent-paths=true");
 }
}
