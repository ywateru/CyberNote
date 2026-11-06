
#[cfg(test)]
mod independent_mutex_recheck {
 use super::*;
 use crate::store::Store;
 use std::sync::mpsc;
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

 fn concurrent(s:&SharedSession,other:&str,operation:impl FnOnce()->super::super::identity::Result<()>+Send+'static,name:&str){
  let (tx,rx)=mpsc::channel();let task=thread::spawn(move||{tx.send(()).unwrap();operation()});rx.recv().unwrap();
  let began=Instant::now();let mut latencies=vec![];let mut wrote=false;
  while !task.is_finished(){let at=Instant::now();let mut g=s.0.lock().unwrap();let w=g.workspace().unwrap();assert!(w["notes"].is_array());
   if latencies.len()>=8&&!wrote {let token=g.sync_media_token();g.ordinary(json!({"type":"patchNote","id":other,"pinned":true}),&token).unwrap();wrote=true;}
   drop(g);latencies.push(at.elapsed().as_micros());thread::sleep(Duration::from_millis(3));}
  let result=task.join().unwrap();let max=latencies.iter().max().copied().unwrap_or(0);println!("INDEPENDENT_FOREGROUND {name} wall_ms={} reads={} ordinary_writes={} max_us={max}",began.elapsed().as_millis(),latencies.len(),u8::from(wrote));
  assert!(wrote&&latencies.len()>8);assert!(max<500_000,"actual foreground command exceeded 500ms");assert_eq!(result.unwrap_err(),SyncError::PlanStale);
 }
 #[test]
 fn independent_64mib_existing_preflight_real_foreground_write_stales_and_retries(){
  let (_d,s,_nid,v)=setup();let other=s.0.lock().unwrap().store.action(json!({"type":"createNote"})).unwrap()["id"].as_str().unwrap().to_string();
  let device=s.0.lock().unwrap().store.sync_identity().unwrap().unwrap().device_id;let shared=s.clone();let d2=device.clone();let v2=v.clone();
  concurrent(&s,&other,move||StoreBackend{shared,device:d2}.required_blobs(&v2).map(|_|()),"preflight");
  let b=StoreBackend{shared:s.clone(),device};let refs=b.required_blobs(&v).unwrap();assert_eq!(refs.len(),1);assert_eq!(refs[0].size,64*1024*1024);
  assert!(s.0.lock().unwrap().store.note(&other).unwrap().pinned);
 }
 #[test]
 fn independent_64mib_capture_real_foreground_write_preserves_dirty_and_retries(){
  let (d,s,nid,_v)=setup();let other={let mut g=s.0.lock().unwrap();g.store.action(json!({"type":"patchNote","id":nid,"pinned":true})).unwrap();g.store.action(json!({"type":"createNote"})).unwrap()["id"].as_str().unwrap().to_string()};
  for f in fs::read_dir(d.path().join("local/.sync/blobs")).unwrap(){fs::remove_file(f.unwrap().path()).unwrap();}
  let device=s.0.lock().unwrap().store.sync_identity().unwrap().unwrap().device_id;let shared=s.clone();let d2=device.clone();
  concurrent(&s,&other,move||StoreBackend{shared,device:d2}.flush(),"capture");
  assert!(s.0.lock().unwrap().store.note(&nid).unwrap().pinned);assert_eq!(s.0.lock().unwrap().store.sync_inventory().unwrap_err().code,"sync_pending_flush");
  StoreBackend{shared:s.clone(),device}.flush().unwrap();assert!(s.0.lock().unwrap().store.sync_inventory().is_ok());
  assert_eq!(fs::read_dir(d.path().join("local/.sync/staging")).unwrap().count(),0);
  assert_eq!(fs::read_dir(d.path().join("local/.sync/blobs")).unwrap().count(),1);
 }
}
