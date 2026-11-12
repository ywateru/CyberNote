//! Fixture-only writer. Production Store and sync modules are copied verbatim.
#[path = "current/store.rs"] mod store;
#[path = "current/session.rs"] mod session;
#[path = "current/sync.rs"] mod sync;
use serde_json::{json,Value};
use sha2::{Digest,Sha256};
use std::{fs,path::{Path,PathBuf},os::unix::ffi::OsStrExt};
fn require_space(root:&Path,reserve:u64)->Result<(),Box<dyn std::error::Error>> {
 let path=std::ffi::CString::new(root.as_os_str().as_bytes())?;
 let mut info=std::mem::MaybeUninit::<libc::statvfs>::uninit();
 if unsafe{libc::statvfs(path.as_ptr(),info.as_mut_ptr())}!=0{return Err(std::io::Error::last_os_error().into())}
 let info=unsafe{info.assume_init()};let available=info.f_bavail as u64*info.f_frsize as u64;
 if available.saturating_sub(reserve)<5*1024*1024*1024/2{return Err("STOP: free disk would fall below 2.5GiB; no other artifacts deleted".into())}
 Ok(())
}
fn main()->Result<(),Box<dyn std::error::Error>> {
 let fixture=PathBuf::from(std::env::args().nth(1).ok_or("Explicit fixture directory required")?);
 let manifest:Value=serde_json::from_slice(&fs::read(fixture.join("manifest.json"))?)?;
 let root=fixture.join("store");
 if root.join("notes.sqlite3").exists(){return Err("Refusing to seed a nonempty Store; frozen mapping must be reused".into())}
 let mut store=store::Store::open(&root).map_err(|e|e.message)?;
 let files=manifest["files"].as_array().ok_or("Missing files")?;
 let mut groups:Vec<Vec<&Value>>=files.iter().filter(|f|f["mime"].as_str().unwrap_or("").starts_with("image/")).collect::<Vec<_>>().chunks(5).map(|chunk|chunk.to_vec()).collect();
 // Seed long media first so startup selects the newest image note, not a long
 // media note. Every sample is also reachable independently by its mapped ID.
 for f in files.iter().filter(|f|!f["mime"].as_str().unwrap_or("").starts_with("image/")){groups.insert(0,vec![f]);}
 let mut notes=vec![];let mut attachments=vec![];
 for (group,items) in groups.iter().enumerate(){
  let created=store.action(json!({"type":"createNote"})).map_err(|e|e.message)?;
  let note_id=created["id"].as_str().ok_or("Missing note ID")?;
  let title=if items.len()==1 {format!("MEDIA99 {}",items[0]["name"].as_str().ok_or("Missing name")?)}else{format!("MEDIA99 images {:03}",group-3)};
  let mut content=vec![json!({"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":title}]}),json!({"type":"paragraph","content":[{"type":"text","text":"Frozen large-media performance fixture; no user data."}]})];
  for sample in items {
   let relative=sample["path"].as_str().ok_or("Missing path")?;
   if !relative.starts_with("originals/")||relative.contains("..") {return Err("Invalid fixture path".into())}
   let original=fixture.join(relative);let bytes=fs::read(&original)?;
   require_space(&root,bytes.len() as u64)?;
   if bytes.len() as u64 != sample["bytes"].as_u64().ok_or("Missing size")? || format!("{:x}",Sha256::digest(&bytes))!=sample["sha256"].as_str().ok_or("Missing SHA")?{return Err("Frozen sample integrity mismatch".into())}
   let a=store.store_attachment(note_id,sample["name"].as_str().ok_or("Missing name")?,sample["mime"].as_str().ok_or("Missing MIME")?,bytes).map_err(|e|e.message)?;
   let managed=root.join("attachments").join(&a.relative_path);
   // Exactly the same immutable bytes retain two names, not a second large
   // copy. Both directories are owned by this isolated fixture.
   fs::remove_file(&original)?;fs::hard_link(&managed,&original)?;
   content.push(json!({"type":"attachment","attrs":{"id":a.id,"kind":a.kind,"name":a.display_name}}));
   attachments.push(json!({"sampleIndex":sample["index"],"samplePath":relative,"id":a.id,"noteId":note_id,"managedPath":format!("store/attachments/{}",a.relative_path),"bytes":a.size,"sha256":sample["sha256"],"mime":a.mime}));
  }
  store.action(json!({"type":"saveNote","id":note_id,"revision":0,"document":{"type":"doc","content":content}})).map_err(|e|e.message)?;
  notes.push(json!({"id":note_id,"title":title,"sampleIndices":items.iter().map(|x|x["index"].clone()).collect::<Vec<_>>()}));
  eprintln!("Seeded {}/{} notes",group+1,groups.len());
 }
 store.action(json!({"type":"settings","settings":{"theme":"light","view":"list","groupDates":false,"sort":"updated"}})).map_err(|e|e.message)?;
 let result=json!({"schema":1,"seeder":"production Store::open/action/store_attachment; immutable isolated hardlinks","fixtureManifestSha256":format!("{:x}",Sha256::digest(fs::read(fixture.join("manifest.json"))?)),"notes":notes,"attachments":attachments});
 fs::write(fixture.join("store-map.json"),serde_json::to_string_pretty(&result)?+"\n")?;
 println!("{}",json!({"notes":notes.len(),"attachments":attachments.len(),"store":root}));
 Ok(())
}
