//! CLI-only trusted fixture path; public IPC never accepts a path.
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use tauri_plugin_notes_scan::{
    session::{Mode, SessionStore},
    Request,
};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        return Err("usage: macos_probe FIXTURE_IMAGE PRIVATE_SESSION_ROOT".into());
    }
    let mut store = SessionStore::open(args[2].clone().into())?;
    let begin = store.execute(Request::Begin { mode: Mode::Text })?;
    let id = begin["sessionId"].as_str().unwrap().to_string();
    let imported = store.execute(Request::IngestImage {
        session_id: id.clone(),
        data: B64.encode(std::fs::read(&args[1])?),
    })?;
    let token = imported["files"][0]["token"].as_str().unwrap().to_string();
    let result = store.execute(Request::Recognize {
        session_id: id.clone(),
        file_token: token.clone(),
    })?;
    let ready = store.execute(Request::Finish {
        session_id: id.clone(),
    })?;
    drop(store);
    let mut store = SessionStore::open(args[2].clone().into())?;
    let reopened = store.execute(Request::Get {
        session_id: id.clone(),
    })?;
    assert_eq!(ready, reopened);
    let chunk = store.execute(Request::ReadFile {
        session_id: id.clone(),
        file_token: token,
        offset: 0,
        length: 32,
    })?;
    assert!(!B64.decode(chunk["data"].as_str().unwrap())?.is_empty());
    store.execute(Request::Acknowledge {
        session_id: id.clone(),
    })?;
    assert_eq!(
        store
            .execute(Request::Get { session_id: id })
            .unwrap_err()
            .code,
        "session_missing"
    );
    println!(
        "{}",
        serde_json::to_string_pretty(
            &serde_json::json!({"ocr":result["ocr"],"restart":true,"readChunk":true,"ackCleanup":true})
        )?
    );
    Ok(())
}
