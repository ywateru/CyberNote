#[cfg(test)]
mod independent_mutex_review {
 use super::*;
 use crate::store::Store;
 use std::sync::mpsc;
 fn measure(name:&str, operation:impl FnOnce() + Send + 'static, shared:&SharedSession) {
  let (tx,rx)=mpsc::channel();
  let t=std::thread::spawn(move|| {tx.send(()).unwrap();operation();});
  rx.recv().unwrap();
  let start=Instant::now();let mut blocked=0u64;let mut available=0u64;
  while !t.is_finished(){match shared.0.try_lock(){Ok(_)=>available+=1,Err(std::sync::TryLockError::WouldBlock)=>blocked+=1,Err(_)=>panic!("poison")};std::thread::sleep(Duration::from_millis(1));}
  t.join().unwrap();println!("INDEPENDENT_MUTEX {name} wall_ms={} blocked_samples={blocked} available_samples={available}",start.elapsed().as_millis());
  assert_eq!(blocked,0,"{name}: hashing/capture held Session mutex");
 }
 fn setup() -> (tempfile::TempDir,SharedSession,String,Value) {
  let d=tempfile::tempdir().unwrap();let mut local=Store::open(d.path().join("local")).unwrap();let id=local.sync_enable(None).unwrap();
  let mut remote=Store::open(d.path().join("remote")).unwrap();remote.sync_enable(Some(&id.workspace_id)).unwrap();
  let nid=remote.action(json!({"type":"createNote"})).unwrap()["id"].as_str().unwrap().to_string();
  let bytes=vec![7u8;64*1024*1024];let a=remote.store_attachment(&nid,"synthetic.png","image/png",bytes).unwrap();
  remote.action(json!({"type":"saveNote","id":nid,"revision":0,"document":{"type":"doc","content":[{"type":"attachment","attrs":{"id":a.id,"kind":"image","name":"synthetic.png"}}]}})).unwrap();
  remote.sync_flush().unwrap();let v=remote.sync_inventory().unwrap().into_iter().find(|x|x.entity_id==nid).unwrap();let wire=remote.sync_version(&v.digest).unwrap();
  let reference=remote.sync_required_blobs(&wire).unwrap().remove(0);local.sync_store_blob(&reference.hash,reference.size,File::open(remote.sync_blob_path(&reference.hash).unwrap()).unwrap()).unwrap();
  local.sync_receive(vec![wire.clone()]).unwrap();local.sync_apply_pending().unwrap();
  let shared=Arc::new((Mutex::new(Session::new(local)),Condvar::new()));(d,shared,nid,serde_json::to_value(wire).unwrap())
 }
 #[test]
 fn independent_preflight_must_not_hash_64mib_under_session_mutex(){let (_d,s,_nid,v)=setup();let shared=s.clone();let device=shared.0.lock().unwrap().store.sync_identity().unwrap().unwrap().device_id;measure("preflight",move||{let backend=StoreBackend{shared,device};backend.required_blobs(&v).unwrap();},&s);}
 #[test]
 fn independent_flush_must_not_capture_64mib_under_session_mutex(){let (_d,s,nid,_v)=setup();s.0.lock().unwrap().store.action(json!({"type":"patchNote","id":nid,"pinned":true})).unwrap();let shared=s.clone();let device=shared.0.lock().unwrap().store.sync_identity().unwrap().unwrap().device_id;measure("flush",move||{let backend=StoreBackend{shared,device};backend.flush().unwrap();},&s);}
}
