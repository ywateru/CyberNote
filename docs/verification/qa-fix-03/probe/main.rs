//! Finite independent backend probe. Real frozen modules; no Tauri/GUI substitution claim.
#[path = "../../../../src-tauri/src/session.rs"]
mod session;
#[path = "../../../../src-tauri/src/store.rs"]
mod store;
use serde_json::{json, Value};
use session::{Session, Token};
use std::{collections::HashSet, path::PathBuf};
const PASSWORD: &str = "FIX03-synthetic-only-2026";
fn token(s: &Session, note: Option<&str>) -> Token {
    let v = s.snapshot().unwrap();
    Token {
        session_id: v["sessionId"].as_str().unwrap().into(),
        epoch: v["epoch"].as_u64().unwrap(),
        note_epoch: note.map(|id| v["notes"][id]["epoch"].as_u64().unwrap()),
    }
}
fn unlock(s: &mut Session, id: &str, password: &str) -> store::Result<(Value, Option<Value>)> {
    s.ordinary(json!({"type":"unlockNote","id":id,"password":password}), &token(s, None))
}
fn barrier(s: &mut Session, action: Value) -> (store::Result<Value>, Value) {
    // Empty participants are intentional for a backend-only state-machine probe.
    let event = s.begin(action, HashSet::new(), &token(s, None)).unwrap();
    s.finish(event["operationId"].as_str().unwrap(), &HashSet::new(), false).unwrap()
}
fn main() {
    let output = PathBuf::from(std::env::args().nth(1).expect("output directory"));
    let root = PathBuf::from("/private/tmp").join(format!("qa-fix03-backend-{}", uuid::Uuid::new_v4()));
    let fixtures = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../app-001-fix-03/fixtures");
    let mut s = Session::new(store::Store::open(&root).unwrap());
    let mut ids = Vec::new();
    for name in ["valid-rich", "valid-drawing", "invalid-structure", "invalid-drawing-attribute"] {
        let archive: Value = serde_json::from_slice(&std::fs::read(fixtures.join(format!("{name}.notesbackup"))).unwrap()).unwrap();
        let id = archive["notes"][0]["id"].as_str().unwrap().to_owned();
        s.store.import_archive(&fixtures.join(format!("{name}.notesbackup"))).unwrap();
        ids.push((name, id));
    }
    let mut checks = Vec::new();
    let valid = ids[0].1.clone();
    unlock(&mut s, &valid, PASSWORD).unwrap();
    let valid_doc = s.store.note_text(&valid).unwrap();
    for (name, id) in &ids[2..] {
        let before = s.workspace().unwrap();
        let raw = serde_json::to_value(s.store.note(id).unwrap()).unwrap();
        let denied = unlock(&mut s, id, PASSWORD).unwrap_err();
        assert_eq!(denied.code, "archive_invalid");
        assert_eq!(s.workspace().unwrap(), before);
        assert_eq!(serde_json::to_value(s.store.note(id).unwrap()).unwrap(), raw);
        assert!(!s.store.authorized(id).unwrap());
        assert_eq!(s.store.note_text(&valid).unwrap(), valid_doc);
        checks.push(json!({"name":format!("{name}: reject before authorization, preserve raw row and other valid authorization"),"code":denied.code,"pass":true}));
    }
    let before = s.workspace().unwrap();
    assert!(unlock(&mut s, &ids[1].1, "wrong-password").is_err());
    assert_eq!(s.workspace().unwrap(), before);
    checks.push(json!({"name":"wrong password preserves all existing authorization/workspace","pass":true}));
    unlock(&mut s, &ids[1].1, PASSWORD).unwrap();
    let archive_path = output.join("backend-export-unlocked.notesbackup");
    s.store.export_archive(&archive_path).unwrap();
    let bytes = std::fs::read(&archive_path).unwrap();
    assert!(!String::from_utf8_lossy(&bytes).contains("PRIVATE-"));
    let archive: Value = serde_json::from_slice(&bytes).unwrap();
    for n in archive["notes"].as_array().unwrap() {
        assert!(n["sealed"].is_object());
        assert_eq!(n["plainText"], "");
        assert!(!n["document"].to_string().contains("PRIVATE-"));
    }
    checks.push(json!({"name":"archive exports only sealed body even when valid keys loaded","pass":true}));
    let old = token(&s, Some(&valid));
    let (result,event) = barrier(&mut s, json!({"type":"closeLocks"}));
    result.unwrap();assert_eq!(event["phase"], "commit");
    assert!(s.sensitive(&valid, &old).is_err());
    let current = token(&s, Some(&valid));
    assert!(s.sensitive(&valid, &current).is_err());
    assert!(s.store.note_text(&valid).is_err());
    assert!(s.register_save("qa-window", &valid, "no-authorization", current).is_err());
    let (result,event) = barrier(&mut s,json!({"type":"removeLock","id":valid}));
    assert_eq!(result.unwrap_err().code, "locked");assert_eq!(event["phase"], "abort");
    assert!(!s.workspace().unwrap().to_string().contains("PRIVATE-"));
    checks.push(json!({"name":"closeLocks rejects old/current sensitive access, save registration, plaintext read and removeLock","pass":true}));
    drop(s);
    let mut s = Session::new(store::Store::open(&root).unwrap());
    assert!(!s.workspace().unwrap().to_string().contains("PRIVATE-"));
    for (name,id) in &ids[..2] {
        unlock(&mut s,id,PASSWORD).unwrap();
        let expected: Value = serde_json::from_slice(&std::fs::read(fixtures.join(format!("{name}.document.json"))).unwrap()).unwrap();
        let notes = s.workspace().unwrap();
        assert_eq!(notes["notes"].as_array().unwrap().iter().find(|n|n["id"]==*id).unwrap()["document"],expected);
    }
    checks.push(json!({"name":"cold Store starts without keys, valid rich/drawing decrypt exact frozen documents","pass":true}));
    std::fs::write(output.join("independent-backend.json"), serde_json::to_vec_pretty(&json!({"status":"pass","scope":"Real production Session/Store/schema/crypto/archive in isolated synthetic root; no GUI/Tauri invoke or barrier scheduling proof","privateRoot":root,"checks":checks})).unwrap()).unwrap();
    println!("{} independent backend checks passed",checks.len());
}
