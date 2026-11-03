use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::{json, Value};
use std::{fs, path::PathBuf};
use tauri_plugin_notes_scan::{
    session::{Mode, SessionStore},
    Request, Result,
};

fn error(result: Result<Value>, code: &str) {
    assert_eq!(result.unwrap_err().code, code);
}
fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    let root = PathBuf::from(&args[2]);
    assert!(!root.exists(), "independent root must be fresh");
    let mut store = SessionStore::open(root.clone())?;
    error(
        store.execute(Request::Begin {
            mode: Mode::Document,
        }),
        "unsupported",
    );
    let a = store.execute(Request::Begin { mode: Mode::Text })?["sessionId"]
        .as_str()
        .unwrap()
        .to_owned();
    let b = store.execute(Request::Begin { mode: Mode::Text })?["sessionId"]
        .as_str()
        .unwrap()
        .to_owned();
    let m = store.execute(Request::IngestImage {
        session_id: a.clone(),
        data: B64.encode(fs::read(&args[1])?),
    })?;
    let t = m["files"][0]["token"].as_str().unwrap().to_owned();
    let size = m["files"][0]["size"].as_u64().unwrap();
    error(
        store.execute(Request::ReadFile {
            session_id: b.clone(),
            file_token: t.clone(),
            offset: 0,
            length: 32,
        }),
        "file_missing",
    );
    for bad in [
        "../secret",
        "/etc/passwd",
        "00000000-0000-0000-0000-000000000000/../../x",
    ] {
        error(
            store.execute(Request::ReadFile {
                session_id: a.clone(),
                file_token: bad.into(),
                offset: 0,
                length: 32,
            }),
            "invalid_token",
        );
    }
    for n in [0, 262145] {
        error(
            store.execute(Request::ReadFile {
                session_id: a.clone(),
                file_token: t.clone(),
                offset: 0,
                length: n,
            }),
            "read_limit",
        );
    }
    error(
        store.execute(Request::ReadFile {
            session_id: a.clone(),
            file_token: t.clone(),
            offset: size + 1,
            length: 32,
        }),
        "invalid_offset",
    );
    let eof = store.execute(Request::ReadFile {
        session_id: a.clone(),
        file_token: t.clone(),
        offset: size,
        length: 32,
    })?;
    assert_eq!(eof["eof"], true);
    assert_eq!(eof["data"], "");
    let path = root.join(&a).join(&t);
    let bytes = fs::read(&path)?;
    fs::remove_file(&path)?;
    std::os::unix::fs::symlink(&args[1], &path)?;
    error(
        store.execute(Request::ReadFile {
            session_id: a.clone(),
            file_token: t.clone(),
            offset: 0,
            length: 32,
        }),
        "invalid_token",
    );
    fs::remove_file(&path)?;
    fs::write(&path, &bytes)?;
    let mut all = Vec::new();
    let mut offset = 0;
    loop {
        let chunk = store.execute(Request::ReadFile {
            session_id: a.clone(),
            file_token: t.clone(),
            offset,
            length: 137,
        })?;
        all.extend(B64.decode(chunk["data"].as_str().unwrap())?);
        offset = chunk["nextOffset"].as_u64().unwrap();
        if chunk["eof"] == true {
            break;
        }
    }
    assert_eq!(all, bytes);
    store.execute(Request::Recognize {
        session_id: a.clone(),
        file_token: t.clone(),
    })?;
    store.execute(Request::Finish {
        session_id: a.clone(),
    })?;
    error(
        store.execute(Request::IngestImage {
            session_id: a.clone(),
            data: B64.encode(&bytes),
        }),
        "session_state",
    );
    error(
        store.execute(Request::Recognize {
            session_id: a.clone(),
            file_token: t.clone(),
        }),
        "session_state",
    );
    store.execute(Request::Acknowledge {
        session_id: a.clone(),
    })?;
    error(
        store.execute(Request::ReadFile {
            session_id: a,
            file_token: t,
            offset: 0,
            length: 32,
        }),
        "session_missing",
    );
    let p = root.join(&b).join("manifest.json");
    let mut m: Value = serde_json::from_slice(&fs::read(&p)?)?;
    m["updatedAt"] = json!(0);
    fs::write(&p, serde_json::to_vec(&m)?)?;
    error(
        store.execute(Request::Get {
            session_id: b.clone(),
        }),
        "session_expired",
    );
    assert_eq!(store.execute(Request::Cleanup)?["removedSessions"], 1);
    assert!(!root.join(b).exists());
    let mut ids = Vec::new();
    for _ in 0..8 {
        ids.push(
            store.execute(Request::Begin { mode: Mode::Text })?["sessionId"]
                .as_str()
                .unwrap()
                .to_owned(),
        );
    }
    error(
        store.execute(Request::Begin { mode: Mode::Text }),
        "session_limit",
    );
    for id in ids {
        store.execute(Request::Cancel { session_id: id })?;
    }
    let invalid = json!({"operation":"get","sessionId":"00000000-0000-0000-0000-000000000000","path":"/etc/passwd"});
    assert!(serde_json::from_value::<Request>(invalid).is_err());
    println!(
        "{}",
        serde_json::to_string_pretty(
            &json!({"crossSession":true,"pathTokens":true,"symlinkFile":true,"readLimits":true,"fullChunkBytes":true,"readyImmutable":true,"ackInvalidates":true,"expiredRemoved":true,"eightSessionLimit":true,"unknownPathFieldDenied":true})
        )?
    );
    Ok(())
}
