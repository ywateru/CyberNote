#[path = "../../../../../../src-tauri/src/store.rs"]
mod store;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::{json, Value};
use std::{collections::BTreeMap, fs, path::Path};

fn read(path: &Path) -> Value {
    serde_json::from_slice(&fs::read(path).unwrap()).unwrap()
}
fn write(path: &Path, value: &Value) {
    fs::write(path, serde_json::to_vec_pretty(value).unwrap()).unwrap();
}
fn snapshot(s: &store::Store, root: &Path) -> Value {
    let files: BTreeMap<String, String> = fs::read_dir(root.join("attachments"))
        .unwrap()
        .map(|entry| {
            let e = entry.unwrap();
            (e.file_name().to_str().unwrap().into(), B64.encode(fs::read(e.path()).unwrap()))
        }).collect();
    json!({"workspace":s.workspace().unwrap(),"files":files})
}
fn seed(root: &Path) {
    fs::create_dir_all(root).unwrap();
    let mut source = store::Store::open(root.join("source")).unwrap();
    let parent = source.action(json!({"type":"createFolder","name":"独立父目录"})).unwrap();
    let child = source.action(json!({"type":"createFolder","name":"独立子目录","parentId":parent["id"]})).unwrap();
    let n = source.action(json!({"type":"createNote","folderId":child["id"]})).unwrap();
    let nid = n["id"].as_str().unwrap();
    let a = source.store_attachment(nid,"first.txt","text/plain",b"FIRST ORIGINAL".to_vec()).unwrap();
    source.store_attachment(nid,"second.txt","text/plain",b"SECOND ORIGINAL".to_vec()).unwrap();
    source.action(json!({"type":"saveNote","id":nid,"revision":0,"document":{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"独立归档正文"}]},{"type":"attachment","attrs":{"id":a.id,"kind":"file","name":"first.txt"}}]}})).unwrap();
    source.action(json!({"type":"settings","settings":{"theme":"dark","view":"gallery","selectedFolder":child["id"],"selectedNote":nid,"custom":{"value":"保留未知设置"}}})).unwrap();
    source.export_archive(&root.join("source.notesbackup")).unwrap();
    write(&root.join("source.json"),&source.workspace().unwrap());
    let mut target = store::Store::open(root.join("target")).unwrap();
    let n = target.action(json!({"type":"createNote"})).unwrap();
    target.action(json!({"type":"saveNote","id":n["id"],"revision":0,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"本地独立旧笔记"}]}]}})).unwrap();
    target.store_attachment(n["id"].as_str().unwrap(),"old.txt","text/plain",b"DO NOT CHANGE OLD BYTES".to_vec()).unwrap();
    target.action(json!({"type":"settings","settings":{"theme":"light","view":"list","selectedFolder":"default","selectedNote":n["id"],"localOnly":true}})).unwrap();
    write(&root.join("before.json"),&snapshot(&target,&root.join("target")));
}
fn suites() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    seed(root);
    let archive = root.join("source.notesbackup");
    let mut s = store::Store::open(root.join("target")).unwrap();
    let before = read(&root.join("before.json"));
    let original_source = fs::read(&archive).unwrap();
    // Reject only when settings would be written, after all imported metadata.
    let db=rusqlite::Connection::open(root.join("target/notes.sqlite3")).unwrap();
    db.execute_batch("CREATE TRIGGER reject_settings BEFORE UPDATE ON settings BEGIN SELECT RAISE(ABORT,'independent late settings failure'); END;").unwrap();
    let late=s.import_archive(&archive).unwrap_err();
    assert_eq!(late.code,"database");
    assert_eq!(snapshot(&s,&root.join("target")),before);
    db.execute_batch("DROP TRIGGER reject_settings").unwrap();
    drop(db);
    drop(s);
    let mut s=store::Store::open(root.join("target")).unwrap();
    assert_eq!(snapshot(&s,&root.join("target")),before);
    assert_eq!(fs::read(&archive).unwrap(),original_source);
    // Fully valid first modified blob and size; only second Base64 is invalid.
    s.import_archive(&archive).unwrap();
    let imported=snapshot(&s,&root.join("target"));
    let mut bad=read(&archive);
    let first=bad["attachments"][0]["id"].as_str().unwrap().to_owned();
    let second=bad["attachments"][1]["id"].as_str().unwrap().to_owned();
    bad["blobs"][&first]=json!(B64.encode(b"VALID REPLACEMENT LONGER THAN ORIGINAL"));
    bad["attachments"][0]["size"]=json!(b"VALID REPLACEMENT LONGER THAN ORIGINAL".len());
    bad["blobs"][&second]=json!("!broken-base64");
    let badpath=root.join("bad.notesbackup");
    write(&badpath,&bad);
    let badbytes=fs::read(&badpath).unwrap();
    let bad_error=s.import_archive(&badpath).unwrap_err();
    assert!(bad_error.message.contains("Base64"));
    assert_eq!(snapshot(&s,&root.join("target")),imported);
    assert_eq!(fs::read(&badpath).unwrap(),badbytes);
    // Valid repeat import: preserve edited old note, remap selection and parents.
    let old=read(&root.join("source.json"));
    let oldid=old["settings"]["selectedNote"].as_str().unwrap();
    s.action(json!({"type":"saveNote","id":oldid,"revision":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"导入后本地新版本"}]}]}})).unwrap();
    let edited=s.workspace().unwrap()["notes"].as_array().unwrap().iter().find(|n|n["id"]==oldid).unwrap().clone();
    s.import_archive(&archive).unwrap();
    let current=s.workspace().unwrap();
    let selected=current["settings"]["selectedNote"].as_str().unwrap();
    assert_ne!(selected,oldid);
    assert_eq!(current["notes"].as_array().unwrap().iter().find(|n|n["id"]==oldid).unwrap(),&edited);
    let copy=current["notes"].as_array().unwrap().iter().find(|n|n["id"]==selected).unwrap();
    assert_eq!(copy["folderId"],current["settings"]["selectedFolder"]);
    let copied_id=copy["document"]["content"][1]["attrs"]["id"].as_str().unwrap();
    assert_ne!(copied_id,first);
    assert_eq!(s.read_attachment(copied_id).unwrap()["data"],B64.encode(b"FIRST ORIGINAL"));
    let child=current["folders"].as_array().unwrap().iter().find(|f|f["id"]==copy["folderId"]).unwrap();
    assert!(current["folders"].as_array().unwrap().iter().any(|f|f["id"]==child["parentId"]&&f["name"]=="独立父目录"));
    let complete=snapshot(&s,&root.join("target"));
    drop(s);
    assert_eq!(snapshot(&store::Store::open(root.join("target")).unwrap(),&root.join("target")),complete);
    println!("{}",serde_json::to_string_pretty(&json!({"sourceCommit":"b5d4fb9e041ffdd51db49a8ca532cafc61bd2c9d","lateSettingsTrigger":{"error":late,"workspaceSettingsAndBytesPreservedAfterReopen":true,"sourcePreserved":true},"validFirstBlobBadSecond":{"error":bad_error,"allOldBytesDatabaseSettingsAndSourcePreserved":true},"repeatImport":{"oldEditedNotePreserved":true,"copiedNoteFolderAttachmentReferencesRemapped":true,"selectedItemsRemapped":true,"reopenEqual":true}})).unwrap());
}
fn main() {
    let args:Vec<_>=std::env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("seed")=>seed(Path::new(&args[2])),
        Some("inspect")=>{
            let root=Path::new(&args[2]).join("target");
            let s=store::Store::open(&root).unwrap();
            println!("{}",snapshot(&s,&root));
        },
        Some("import")=>{
            let mut s=store::Store::open(Path::new(&args[2]).join("target")).unwrap();
            let result=s.import_archive(Path::new(&args[3]));
            println!("{}",match result { Ok(())=>json!({"accepted":true}),Err(e)=>json!({"accepted":false,"error":e}) });
        },
        Some("export")=>{
            let s=store::Store::open(Path::new(&args[2]).join("target")).unwrap();
            s.export_archive(Path::new(&args[3])).unwrap();
        },
        _=>suites(),
    }
}
