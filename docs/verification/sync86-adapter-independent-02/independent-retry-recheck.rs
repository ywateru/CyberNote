#[cfg(test)]
mod independent_retry_recheck {
 use super::*;
 use std::sync::atomic::AtomicUsize;
 struct Receiver {inner:StoreBackend,attempts:AtomicUsize,foreground:String}
 macro_rules! delegate {($n:ident($($x:ident:$t:ty),*)->$r:ty)=>{fn $n(&self,$($x:$t),*)->super::super::identity::Result<$r>{self.inner.$n($($x),*)}};}
 impl SyncBackend for Receiver {
  delegate!(device_id()->String);delegate!(workspace_id()->String);delegate!(prepare_pairing(workspace:&str)->());delegate!(adopt_workspace(workspace:&str)->());delegate!(flush()->());
  delegate!(inventory(after:Option<&str>,limit:usize)->network::InventoryPage);delegate!(version(digest:&str)->Value);delegate!(required_blobs(version:&Value)->Vec<network::BlobRef>);delegate!(has_blob(blob:&network::BlobRef)->bool);delegate!(read_blob_chunk(blob:&network::BlobRef,offset:u64,max:usize)->Vec<u8>);delegate!(store_blob(blob:&network::BlobRef,source:&Path)->());
  fn receive_head(&self,v:Value)->super::super::identity::Result<network::Receipt>{
   if self.attempts.fetch_add(1,Ordering::SeqCst)==0 {
    let wire:WireVersion=serde_json::from_value(v).unwrap();let snapshot=self.inner.shared.0.lock().unwrap().store.sync_media_snapshot(std::slice::from_ref(&wire),false).unwrap();let proof=snapshot.verify().unwrap();
    let mut s=self.inner.shared.0.lock().unwrap();let token=s.sync_media_token();s.ordinary(json!({"type":"patchNote","id":self.foreground,"pinned":true}),&token).unwrap();
    let e=s.store.sync_with_media(proof,|store|store.sync_receive(vec![wire])).unwrap_err();assert_eq!(e.code,"sync_plan_stale");return Err(backend_error(e));
   }
   self.inner.receive_head(v)
  }
 }
 #[derive(Default)] struct Windows(Mutex<Vec<Value>>);
 impl WindowHost for Windows {fn participants(&self)->HashSet<String>{HashSet::from(["main".into()])}fn emit(&self,name:&str,v:&Value)->Result<()>{if name=="notes-sync"{self.0.lock().unwrap().push(v.clone())}Ok(())}}
 fn ack(runtime:&Runtime,shared:&SharedSession,host:&Windows){for p in std::mem::take(&mut *host.0.lock().unwrap()){let token=shared.0.lock().unwrap().sync_media_token();let id=p["operationId"].as_str().unwrap().to_owned();let reply=match p["phase"].as_str().unwrap(){"probe"=>Some(WindowReply::Probe{operation_id:id,protected_note_ids:vec![],blocked:false}),"prepare"=>Some(WindowReply::Prepare{operation_id:id,ready:true}),_=>None};if let Some(reply)=reply{runtime.reply("main",reply,&token).unwrap();}}}
 #[test] fn independent_receiver_actual_generation_stale_reconnects_without_manual_wake(){
  let d=tempfile::tempdir().unwrap();let ar=d.path().join("A");let br=d.path().join("B");let mut sa=Store::open(&ar).unwrap();let identity=sa.sync_enable(None).unwrap();let foreground=sa.action(json!({"type":"createNote"})).unwrap()["id"].as_str().unwrap().to_string();
  let mut sb=Store::open(&br).unwrap();let incoming=sb.action(json!({"type":"createNote"})).unwrap()["id"].as_str().unwrap().to_string();
  let a=Arc::new((Mutex::new(Session::new(sa)),Condvar::new()));let b=Arc::new((Mutex::new(Session::new(sb)),Condvar::new()));let bid=uuid::Uuid::new_v4().to_string();
  let ab=Arc::new(Receiver{inner:StoreBackend{shared:a.clone(),device:identity.device_id.clone()},attempts:AtomicUsize::new(0),foreground:foreground.clone()});let bb=Arc::new(StoreBackend{shared:b.clone(),device:bid.clone()});
  let mut server=SyncService::new(ab.clone(),Arc::new(IdentityStore::open(&ar.join(".sync"),&identity.device_id).unwrap()),ar.join(".sync/network-staging")).unwrap();
  let address=server.start_listener("127.0.0.1:0".parse().unwrap()).unwrap();let mut client=SyncService::new(bb,Arc::new(IdentityStore::open(&br.join(".sync"),&bid).unwrap()),br.join(".sync/network-staging")).unwrap();
  let ah=Arc::new(Windows::default());let bh=Arc::new(Windows::default());let ra=Runtime::new(a.clone(),ar.clone(),ah.clone()).unwrap();let rb=Runtime::new(b.clone(),br.clone(),bh.clone()).unwrap();ra.active.store(true,Ordering::Release);rb.active.store(true,Ordering::Release);
  client.pair(&server.invitation(&format!("ws://{address}")).unwrap()).unwrap();let start=Instant::now();
  loop {ack(&ra,&a,&ah);ack(&rb,&b,&bh);
   let host_applied={let s=a.0.lock().unwrap();s.store.note(&incoming).is_ok()&&s.store.sync_pending_count().unwrap()==0};let client_applied={let s=b.0.lock().unwrap();s.store.note(&foreground).is_ok_and(|n|n.pinned)&&s.store.sync_pending_count().unwrap()==0};
   if host_applied&&client_applied&&ab.attempts.load(Ordering::SeqCst)>=2&&client.status().unwrap().connections.iter().any(|c|c.last_success.is_some()){break}
   assert!(start.elapsed()<Duration::from_secs(12),"automatic receive retry failed after {} attempts",ab.attempts.load(Ordering::SeqCst));thread::sleep(Duration::from_millis(20));
  }
  for root in [&ar,&br]{let db=rusqlite::Connection::open_with_flags(root.join("notes.sqlite3"),rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();for table in ["sync_dirty","sync_inbox"]{assert_eq!(db.query_row::<u64,_,_>(&format!("SELECT count(*) FROM {table}"),[],|r|r.get(0)).unwrap(),0);}}
  println!("INDEPENDENT_RETRY boundary=receive_head real-generation-stale=true attempts={} automatic=true two-quiet-commits=true dirty-inbox=0 wall_ms={}",ab.attempts.load(Ordering::SeqCst),start.elapsed().as_millis());
  client.shutdown().unwrap();server.shutdown().unwrap();ra.shutdown().unwrap();rb.shutdown().unwrap();
 }
}
