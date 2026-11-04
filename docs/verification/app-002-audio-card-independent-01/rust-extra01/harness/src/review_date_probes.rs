use super::*;
use std::collections::{BTreeMap, HashSet};
const DATE:u64=1_793_721_599_123;
const BYTES:&[u8]=b"independent synthetic recording bytes";
fn setup()->(tempfile::TempDir,Store,String,AttachmentOwner){
    let dir=tempfile::tempdir().unwrap();let mut s=Store::open(dir.path()).unwrap();
    let note=s.action(json!({"type":"createNote"})).unwrap()["id"].as_str().unwrap().to_owned();
    (dir,s,note,AttachmentOwner{session:id(),window:"main".into(),incarnation:id()})
}
fn rows(db:&Connection)->BTreeMap<String,Vec<Vec<String>>>{
    let mut all=BTreeMap::new();
    for table in ["notes","folders","attachments","settings","attachment_operations"] {
        let mut q=db.prepare(&format!("SELECT * FROM {table} ORDER BY rowid")).unwrap();let count=q.column_count();
        all.insert(table.to_string(),q.query_map([],|r|Ok((0..count).map(|i|format!("{:?}",r.get_ref(i).unwrap())).collect())).unwrap().collect::<std::result::Result<Vec<_>,_>>().unwrap());
    }all
}
fn media(root:&Path)->BTreeMap<String,Vec<u8>>{
    fs::read_dir(root.join("attachments")).unwrap().map(|e|{let p=e.unwrap().path();(p.file_name().unwrap().to_string_lossy().into(),fs::read(p).unwrap())}).collect()
}
fn put(s:&mut Store,n:&str,o:&AttachmentOwner,op:&str,date:Option<u64>)->Value{
    s.store_attachment_operation(op,n,o,"independent.webm","audio/webm",BYTES,date).unwrap()["attachment"].clone()
}
fn save(s:&mut Store,n:&str,a:&[Value]){
    let mut content=vec![json!({"type":"paragraph"})];
    content.extend(a.iter().map(|v|json!({"type":"attachment","attrs":{"id":v["id"],"kind":"audio","name":"independent.webm"}})));
    s.action(json!({"type":"saveNote","id":n,"revision":s.note(n).unwrap().revision,"document":{"type":"doc","content":content}})).unwrap();
}

#[test]
fn independent_invalid_public_dates_fail_after_cold_open_without_rewriting_any_rows_or_media(){
    for bad in [json!(true),json!([]),json!({}),json!("0"),json!(-1),json!(1.0),json!(MAX_RECORDED_AT+1),json!(u64::MAX)] {
        let (dir,mut s,n,_)=setup();let a=s.store_attachment(&n,"old.webm","audio/webm",BYTES.to_vec()).unwrap();
        let mut raw=serde_json::to_value(&a).unwrap();raw["recordedAt"]=bad.clone();
        s.db.execute("UPDATE attachments SET body=?1 WHERE id=?2",params![raw.to_string(),a.id]).unwrap();
        let before=rows(&s.db);let bytes=media(dir.path());let path=s.attachment_path(&a.relative_path).unwrap();let modified=fs::metadata(&path).unwrap().modified().unwrap();drop(s);
        let s=Store::open(dir.path()).unwrap();let e=s.read_attachment(&a.id).unwrap_err();assert!(!e.message.is_empty());assert!(s.workspace().is_err());
        assert_eq!(rows(&s.db),before);assert_eq!(media(dir.path()),bytes);assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(),modified);
        println!("independent persisted public {bad}: cold read/workspace explicit error, all rows/bytes/mtime unchanged");
    }
}

#[test]
fn independent_invalid_nonterminal_journal_dates_fail_open_without_cancellation_or_rewrite(){
    for bad in [json!(false),json!([]),json!({}),json!("0"),json!(-1),json!(1.0),json!(MAX_RECORDED_AT+1)]{
        let(dir,mut s,n,o)=setup();let op=id();let mut a=put(&mut s,&n,&o,&op,Some(DATE));a["recordedAt"]=bad.clone();
        s.db.execute("UPDATE attachment_operations SET attachment=?1 WHERE operation_id=?2",params![a.to_string(),op]).unwrap();
        let before=rows(&s.db);let bytes=media(dir.path());drop(s);
        let e=match Store::open(dir.path()){Ok(_)=>panic!("invalid journal accepted"),Err(e)=>e};assert!(!e.message.is_empty());
        let db=Connection::open(dir.path().join("notes.sqlite3")).unwrap();assert_eq!(rows(&db),before);assert_eq!(media(dir.path()),bytes);
        println!("independent persisted journal {bad}: explicit cold-open error, all rows/media unchanged");
    }
}

#[test]
fn independent_v1_absent_and_explicit_null_dates_import_twice_with_disjoint_ids_and_paths(){
    for explicit_null in [false,true]{
        let(dir,mut s,n,o)=setup();let a=put(&mut s,&n,&o,&id(),None);save(&mut s,&n,&[a]);
        let p=dir.path().join("v1.notesbackup");s.export_archive(&p).unwrap();let mut archive:Value=serde_json::from_slice(&fs::read(&p).unwrap()).unwrap();assert_eq!(archive["version"],1);
        if explicit_null{archive["attachments"][0]["recordedAt"]=Value::Null;fs::write(&p,serde_json::to_vec(&archive).unwrap()).unwrap();}
        let source_bytes=fs::read(&p).unwrap();let mut target=Store::open(dir.path().join("target")).unwrap();target.import_archive(&p).unwrap();let first=target.attachments().unwrap().remove(0);target.import_archive(&p).unwrap();let all=target.attachments().unwrap();assert_eq!(all.len(),2);
        assert_eq!(all.iter().map(|a|&a.id).collect::<HashSet<_>>().len(),2);assert_eq!(all.iter().map(|a|&a.note_id).collect::<HashSet<_>>().len(),2);assert_eq!(all.iter().map(|a|&a.relative_path).collect::<HashSet<_>>().len(),2);
        assert_eq!(serde_json::to_value(all.iter().find(|a|a.id==first.id).unwrap()).unwrap(),serde_json::to_value(&first).unwrap());
        for a in &all{assert_eq!(a.recorded_at,None);assert_eq!(target.read_attachment(&a.id).unwrap()["data"],B64.encode(BYTES));assert!(target.note(&a.note_id).unwrap().document.to_string().contains(&a.id));}
        assert_eq!(fs::read(&p).unwrap(),source_bytes);let p2=dir.path().join("again.notesbackup");target.export_archive(&p2).unwrap();let export:Value=serde_json::from_slice(&fs::read(p2).unwrap()).unwrap();assert_eq!(export["version"],1);assert!(export["attachments"].as_array().unwrap().iter().all(|a|a.get("recordedAt").is_none()));
        println!("independent v1 explicit_null={explicit_null}: imported twice, disjoint ids/paths, exact bytes, unknown retained, v1 re-export");
    }
}

#[test]
fn independent_v2_zero_and_max_dates_twice_remap_and_survive_cold_reexport(){
    let(dir,mut s,n,o)=setup();let a=put(&mut s,&n,&o,&id(),Some(0));let b=put(&mut s,&n,&o,&id(),Some(MAX_RECORDED_AT));save(&mut s,&n,&[a,b]);
    let p=dir.path().join("v2.notesbackup");s.export_archive(&p).unwrap();let before=rows(&s.db);let original=media(dir.path());let mut target=Store::open(dir.path().join("target")).unwrap();
    target.import_archive(&p).unwrap();let first:HashSet<_>=target.attachments().unwrap().into_iter().map(|a|a.id).collect();target.import_archive(&p).unwrap();let all=target.attachments().unwrap();assert_eq!(all.len(),4);assert_eq!(all.iter().map(|a|&a.relative_path).collect::<HashSet<_>>().len(),4);assert_eq!(all.iter().filter(|a|first.contains(&a.id)).count(),2);
    assert_eq!(all.iter().filter(|a|a.recorded_at==Some(0)).count(),2);assert_eq!(all.iter().filter(|a|a.recorded_at==Some(MAX_RECORDED_AT)).count(),2);assert_eq!(all.iter().map(|a|&a.note_id).collect::<HashSet<_>>().len(),2);
    for a in &all{assert_eq!(target.read_attachment(&a.id).unwrap()["data"],B64.encode(BYTES));assert!(target.note(&a.note_id).unwrap().document.to_string().contains(&a.id));}
    drop(target);let target=Store::open(dir.path().join("target")).unwrap();let p2=dir.path().join("again.notesbackup");target.export_archive(&p2).unwrap();let export:Value=serde_json::from_slice(&fs::read(p2).unwrap()).unwrap();assert_eq!(export["version"],2);assert_eq!(rows(&s.db),before);assert_eq!(media(dir.path()),original);
    println!("independent v2 date=0/MAX: import twice four distinct paths, two dates each, references/bytes, cold re-export=2, source unchanged");
}

#[test]
fn independent_date_difference_keeps_full_eq_guard_and_cannot_cancel_bytes(){
    for replacement in [Value::Null,json!(DATE+1)]{
        let(dir,mut s,n,o)=setup();let op=id();let mut a=put(&mut s,&n,&o,&op,Some(DATE));a["recordedAt"]=replacement.clone();
        s.db.execute("UPDATE attachments SET body=?1 WHERE id=?2",params![a.to_string(),a["id"].as_str().unwrap()]).unwrap();let before=rows(&s.db);let bytes=media(dir.path());
        for cancel in [false,true]{let q=if cancel{s.cancel_attachment_operation(&op,&n,&o)}else{s.query_attachment_operation(&op,&n,&o)}.unwrap();assert_eq!(q["status"],"deferred");assert_eq!(q["reason"],"managed_identity_changed");assert_eq!(rows(&s.db),before);assert_eq!(media(dir.path()),bytes);}
        println!("independent public date difference {replacement}: query/cancel deferred, complete identity guard retains all rows/bytes");
    }
}
