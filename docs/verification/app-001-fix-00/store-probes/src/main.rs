#[path = "../../../../../src-tauri/src/store.rs"]
mod store;
use serde_json::{json, Value};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
fn main() {
    let tmp = tempfile::tempdir().unwrap();
    let mut a = store::Store::open(tmp.path().join("a")).unwrap();
    a.action(json!({"type":"settings","settings":{"view":"gallery","theme":"dark","selectedFolder":"quick"}})).unwrap();
    let n = a.action(json!({"type":"createNote"})).unwrap();
    let nid = n["id"].as_str().unwrap();
    let at = a.store_attachment(nid,"original.txt","text/plain",b"original-content".to_vec()).unwrap();
    let backup = tmp.path().join("valid.notesbackup");
    a.export_archive(&backup).unwrap();
    let mut b = store::Store::open(tmp.path().join("b")).unwrap();
    b.import_archive(&backup).unwrap();
    let expected = a.workspace().unwrap()["settings"].clone();
    let actual = b.workspace().unwrap()["settings"].clone();
    let mut bad: Value = serde_json::from_slice(&std::fs::read(&backup).unwrap()).unwrap();
    bad["blobs"][&at.id] = json!(B64.encode(b"overwritten-during-failed-import"));
    let mut second = serde_json::to_value(&at).unwrap();
    second["id"] = json!("second-bad");
    second["relativePath"] = json!("second-bad.bin");
    bad["attachments"].as_array_mut().unwrap().push(second);
    bad["blobs"]["second-bad"] = json!("!bad-base64");
    let badpath = tmp.path().join("bad.notesbackup");
    std::fs::write(&badpath, serde_json::to_vec(&bad).unwrap()).unwrap();
    let failure = b.import_archive(&badpath).unwrap_err();
    let read = b.read_attachment(&at.id).unwrap();
    let bytes = B64.decode(read["data"].as_str().unwrap()).unwrap();
    let mut cycle: Value = serde_json::from_slice(&std::fs::read(&backup).unwrap()).unwrap();
    cycle["folders"].as_array_mut().unwrap().push(json!({"id":"self-cycle","name":"循环","parentId":"self-cycle","kind":"normal","sortOrder":1,"createdAt":1}));
    let cyclepath = tmp.path().join("cycle.notesbackup");
    std::fs::write(&cyclepath, serde_json::to_vec(&cycle).unwrap()).unwrap();
    let cycle_accepted = b.import_archive(&cyclepath).is_ok();
    let fixtures = std::path::Path::new("/Users/water/work/2026/Apple-Notes-Clone/docs/verification/app-001-fix-00/store-probes/fixtures");
    std::fs::create_dir_all(fixtures).unwrap();
    for (source, name) in [(&backup, "valid.notesbackup"), (&badpath, "bad-second-attachment.notesbackup"), (&cyclepath, "self-cycle.notesbackup")] { std::fs::copy(source, fixtures.join(name)).unwrap(); }
    println!("{}",serde_json::to_string_pretty(&json!({"sourceCommit":"FIX-00 working tree based on 4133ff6","settings":{"expected":expected,"actual":actual,"equal":expected==actual},"failedImport":{"error":failure,"attachmentAfter":String::from_utf8(bytes).unwrap(),"originalPreserved":read["data"]==B64.encode(b"original-content")},"cycleImportAccepted":cycle_accepted})).unwrap());
}
