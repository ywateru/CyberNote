//! Independent storage-boundary probe. Product Store/Session are copied byte-for-byte.
//! This does not exercise task 64 frontend code or a real microphone.
mod store;
mod session;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rusqlite::{Connection, OpenFlags};
use serde_json::{json, Value};
use std::{fs, io::{BufRead, BufReader, Write}, path::{Path, PathBuf}, process::{Command, Stdio}};
use session::{Session, Token};
use store::Store;
use uuid::Uuid;

const WHEN: u64 = 1_793_858_400_123;
fn uuid() -> String { Uuid::new_v4().to_string() }
fn token(s: &Session, note: Option<&str>) -> Token {
    let a = s.snapshot().unwrap();
    Token { session_id: a["sessionId"].as_str().unwrap().into(), epoch: a["epoch"].as_u64().unwrap(), note_epoch: note.map(|n| a["notes"][n]["epoch"].as_u64().unwrap()) }
}
fn create(s: &mut Session) -> String {
    let t = token(s, None);
    s.ordinary(json!({"type":"createNote"}), &t).unwrap().0["id"].as_str().unwrap().into()
}
fn wav(salt: i16) -> Vec<u8> {
    let samples: Vec<i16> = (0..32).map(|n| (n * 101) as i16 + salt).collect();
    let bytes = (samples.len() * 2) as u32;
    let mut w = Vec::new();
    w.extend_from_slice(b"RIFF"); w.extend_from_slice(&(36 + bytes).to_le_bytes());
    w.extend_from_slice(b"WAVEfmt "); w.extend_from_slice(&16u32.to_le_bytes());
    w.extend_from_slice(&1u16.to_le_bytes()); w.extend_from_slice(&1u16.to_le_bytes());
    w.extend_from_slice(&8000u32.to_le_bytes()); w.extend_from_slice(&16000u32.to_le_bytes());
    w.extend_from_slice(&2u16.to_le_bytes()); w.extend_from_slice(&16u16.to_le_bytes());
    w.extend_from_slice(b"data"); w.extend_from_slice(&bytes.to_le_bytes());
    for sample in samples { w.extend_from_slice(&sample.to_le_bytes()); }
    assert_eq!(w.len(), 108); w
}
fn doc(text: &str, attachment: Option<&Value>) -> Value {
    let mut content = vec![json!({"type":"paragraph","content":[{"type":"text","text":text}]})];
    if let Some(a) = attachment { content.push(json!({"type":"attachment","attrs":{"id":a["id"],"kind":"audio","name":a["displayName"]}})); }
    json!({"type":"doc","content":content})
}
fn save(s: &mut Session, note: &str, document: Value) {
    let revision = s.store.note(note).unwrap().revision;
    let intent = uuid(); let t = token(s, Some(note));
    s.register_save("main", note, &intent, t).unwrap();
    let result = s.save("main", json!({"type":"saveNote","id":note,"revision":revision,"saveIntent":intent,"document":document})).unwrap();
    assert_eq!(result["revision"], revision + 1);
}
fn put(s: &mut Session, note: &str, op: &str, bytes: &[u8]) -> Value {
    let t = token(s, Some(note));
    let r = s.store_attachment_operation("main", op, note, "累计录音.wav", "audio/wav", bytes, &t, Some(WHEN)).unwrap();
    assert!(matches!(r["status"].as_str(), Some("stored" | "committed")));
    r["attachment"].clone()
}
fn query(s: &mut Session, note: &str, op: &str) -> Value {
    let t = token(s, Some(note)); s.query_attachment_operation("main", op, note, &t).unwrap()
}
fn state(root: &Path, op: &str) -> String {
    Connection::open_with_flags(root.join("notes.sqlite3"), OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap()
        .query_row("SELECT state FROM attachment_operations WHERE operation_id=?1", [op], |row| row.get(0)).unwrap()
}
fn file(root: &Path, a: &Value) -> PathBuf { root.join("attachments").join(a["relativePath"].as_str().unwrap()) }
fn assert_media(s: &Session, root: &Path, a: &Value, expected: &[u8]) {
    assert_eq!(fs::read(file(root, a)).unwrap(), expected);
    let r = s.store.read_attachment(a["id"].as_str().unwrap()).unwrap();
    assert_eq!(B64.decode(r["data"].as_str().unwrap()).unwrap(), expected);
    assert_eq!(r["recordedAt"], WHEN); assert_eq!(r["mime"], "audio/wav");
}
fn assert_one(s: &Session, note: &str, a: &Value, text: &str) {
    let body = s.store.note(note).unwrap().document;
    assert_eq!(body, doc(text, Some(a)));
    assert_eq!(body["content"].as_array().unwrap().iter().filter(|n| n["type"] == "attachment").count(), 1);
}
fn receipt(root: &Path, value: &Value) {
    let mut f = fs::File::create(root.join("worker-receipt.json")).unwrap();
    f.write_all(serde_json::to_string_pretty(value).unwrap().as_bytes()).unwrap(); f.sync_all().unwrap();
}
fn crash_worker(root: &Path, mode: &str) {
    let mut s = Session::new(Store::open(root).unwrap());
    let a = create(&mut s); let b = create(&mut s);
    save(&mut s, &b, doc("B untouched", None));
    let op1 = uuid(); let op2 = uuid();
    let v1 = put(&mut s, &a, &op1, &wav(1));
    save(&mut s, &a, doc("A checkpoint one", Some(&v1)));
    assert_eq!(state(root, &op1), "stored");
    if mode != "previous_not_queried" { assert_eq!(query(&mut s, &a, &op1)["status"], "committed"); }
    let v2 = put(&mut s, &a, &op2, &wav(2));
    if mode != "candidate_stored" {
        save(&mut s, &a, doc("A edited after checkpoint", Some(&v2)));
        assert_eq!(state(root, &op2), "stored");
        if mode != "latest_document_ack" { assert_eq!(query(&mut s, &a, &op2)["status"], "committed"); }
    }
    receipt(root, &json!({"mode":mode,"a":a,"b":b,"op1":op1,"op2":op2,"v1":v1,"v2":v2,"state1":state(root,&op1),"state2":state(root,&op2)}));
    println!("READY"); std::io::stdout().flush().unwrap();
    // Parent SIGKILLs this live process while Session/SQLite are still owned.
    std::thread::sleep(std::time::Duration::from_secs(30));
    panic!("parent did not kill bounded worker");
}
fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("--worker") { crash_worker(Path::new(&args[2]), &args[3]); return; }
    let output = PathBuf::from(args.get(1).expect("fresh artifact root required"));
    fs::create_dir_all(&output).unwrap();
    let mut checks = Vec::new();
    let root = output.join("live-session");
    let mut s = Session::new(Store::open(&root).unwrap());
    let a = create(&mut s); let b = create(&mut s);
    save(&mut s, &b, doc("B untouched", None));
    let op1 = uuid(); let op2 = uuid();
    let v1 = put(&mut s, &a, &op1, &wav(1));
    assert_eq!(query(&mut s, &a, &op1)["status"], "stored");
    save(&mut s, &a, doc("A first", Some(&v1)));
    assert_eq!(state(&root, &op1), "stored");
    checks.push(json!({"name":"saveNote real ACK does not automatically commit attachment journal","state":"stored"}));
    let before = s.snapshot().unwrap();
    assert_eq!(query(&mut s, &a, &op1)["status"], "committed");
    assert_eq!(state(&root, &op1), "committed"); assert_eq!(s.snapshot().unwrap(), before);
    checks.push(json!({"name":"explicit query sees real document and durably marks committed under same Session owner"}));
    let exact_retry = put(&mut s, &a, &op1, &wav(1)); assert_eq!(exact_retry, v1);
    let t = token(&s, Some(&a));
    let changed = s.store_attachment_operation("main", &op1, &a, "累计录音.wav", "audio/wav", &wav(2), &t, Some(WHEN)).unwrap_err();
    assert_eq!(changed.code, "attachment_operation_conflict");
    assert_media(&s, &root, &v1, &wav(1));
    checks.push(json!({"name":"same operation exact retry is idempotent and equal-sized changed WAV bytes are rejected","code":changed.code}));
    let v2 = put(&mut s, &a, &op2, &wav(2));
    assert_ne!(v1["id"], v2["id"]); assert_ne!(v1["relativePath"], v2["relativePath"]);
    save(&mut s, &a, doc("A latest user text", Some(&v2)));
    assert_eq!(query(&mut s, &a, &op2)["status"], "committed");
    assert_one(&s, &a, &v2, "A latest user text"); assert_eq!(s.store.note(&b).unwrap().document, doc("B untouched", None));
    assert_media(&s, &root, &v1, &wav(1)); assert_media(&s, &root, &v2, &wav(2));
    checks.push(json!({"name":"independent immutable versions replace one visible card while preserving supplied latest A and B bodies"}));
    let t = token(&s, Some(&a));
    assert_eq!(s.cancel_attachment_operation("main", &op1, &a, &t).unwrap()["status"], "committed");
    assert_media(&s, &root, &v1, &wav(1));
    save(&mut s, &a, doc("A undo reference", Some(&v1)));
    assert_one(&s, &a, &v1, "A undo reference"); assert_media(&s, &root, &v1, &wav(1));
    save(&mut s, &a, doc("A redo reference", Some(&v2)));
    assert_one(&s, &a, &v2, "A redo reference");
    checks.push(json!({"name":"committed previous file survives cancel and document reference Undo/Redo simulation"}));
    // This is deliberately a DB-level reference simulation, not a PM Undo claim.
    drop(s);
    let reopened = Session::new(Store::open(&root).unwrap());
    assert_one(&reopened, &a, &v2, "A redo reference");
    assert_media(&reopened, &root, &v1, &wav(1)); assert_media(&reopened, &root, &v2, &wav(2));
    let mut reopened = reopened;
    let e = reopened.query_attachment_operation("main", &op2, &a, &token(&reopened, Some(&a))).unwrap_err();
    assert_eq!(e.code, "attachment_operation_conflict");
    checks.push(json!({"name":"reopen retains both committed files but new Session cannot adopt old process operation ownership","code":e.code}));
    drop(reopened);
    for mode in ["candidate_stored", "latest_document_ack", "latest_query_committed", "previous_not_queried"] {
        let case_root = output.join(mode);
        let mut child = Command::new(std::env::current_exe().unwrap()).args(["--worker", case_root.to_str().unwrap(), mode]).stdout(Stdio::piped()).stderr(Stdio::inherit()).spawn().unwrap();
        let mut ready = String::new(); BufReader::new(child.stdout.take().unwrap()).read_line(&mut ready).unwrap();
        assert_eq!(ready.trim(), "READY"); child.kill().unwrap(); let killed = child.wait().unwrap();
        #[cfg(unix)] { use std::os::unix::process::ExitStatusExt; assert_eq!(killed.signal(), Some(9)); }
        let r: Value = serde_json::from_slice(&fs::read(case_root.join("worker-receipt.json")).unwrap()).unwrap();
        let mut session = Session::new(Store::open(&case_root).unwrap());
        let aid = r["a"].as_str().unwrap(); let bid = r["b"].as_str().unwrap();
        let v1 = &r["v1"]; let v2 = &r["v2"];
        assert_eq!(session.store.note(bid).unwrap().document, doc("B untouched", None));
        if mode == "candidate_stored" {
            assert_one(&session, aid, v1, "A checkpoint one"); assert_media(&session, &case_root, v1, &wav(1));
            assert!(!file(&case_root, v2).exists()); assert_eq!(state(&case_root, r["op2"].as_str().unwrap()), "aborted");
            assert!(session.store.read_attachment(v2["id"].as_str().unwrap()).is_err());
        } else {
            assert_one(&session, aid, v2, "A edited after checkpoint"); assert_media(&session, &case_root, v2, &wav(2));
            assert_eq!(state(&case_root, r["op2"].as_str().unwrap()), "committed");
            if mode == "previous_not_queried" {
                assert!(!file(&case_root, v1).exists()); assert_eq!(state(&case_root, r["op1"].as_str().unwrap()), "aborted");
            } else { assert_media(&session, &case_root, v1, &wav(1)); assert_eq!(state(&case_root, r["op1"].as_str().unwrap()), "committed"); }
        }
        let workspace = session.workspace().unwrap();
        let fresh = uuid(); let bytes = wav(3); let t = token(&session, Some(aid));
        // New operations still work after recovery; old process authority is never reused.
        let new = session.store_attachment_operation("main", &fresh, aid, "累计录音.wav", "audio/wav", &bytes, &t, Some(WHEN)).unwrap();
        assert_eq!(new["status"], "stored");
        let t = token(&session, Some(aid));
        assert_eq!(session.cancel_attachment_operation("main", &fresh, aid, &t).unwrap()["status"], "aborted");
        assert_eq!(session.workspace().unwrap()["notes"], workspace["notes"]);
        checks.push(json!({"name":"SIGKILL live SQLite worker then reopen actual Store/Session","mode":mode,"worker":r,"signal":9,"notes":workspace["notes"],"attachments":workspace["attachments"]}));
        drop(session);
        // A second open must be stable and must not remove confirmed versions.
        let second = Session::new(Store::open(&case_root).unwrap());
        assert_eq!(second.workspace().unwrap()["notes"], workspace["notes"]);
        if mode != "previous_not_queried" { assert_media(&second, &case_root, v1, &wav(1)); }
        checks.push(json!({"name":"second open recovery is idempotent","mode":mode}));
    }
    println!("{}", serde_json::to_string_pretty(&json!({"status":"pass","checks":checks,"checkCount":checks.len(),"limits":["Exact base backend only; no task 64 frontend acceptance claim.","Synthetic complete PCM WAV bytes validate storage integrity, not live recording, decoding or audibility.","Document Undo/Redo is a reference-save simulation; PM/UI behavior is not tested here.","Crash workers are SIGKILLed only after declared Store/Session boundaries; no internal file-write fault injection.","No device, GUI, microphone, permission or signing actions."]})).unwrap());
}
