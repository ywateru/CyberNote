//! Independent review: two-note quiet-sync isolation through production runtime.
use crate::{
    attachment_media::runtime::{MediaRuntime, Purpose},
    session::{Session, Token},
    store::Store,
};
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    sync::{Arc, Condvar, Mutex},
};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
fn token(s: &Session, note: &str) -> Token {
    let v = s.snapshot().unwrap();
    Token {
        session_id: v["sessionId"].as_str().unwrap().into(),
        epoch: v["epoch"].as_u64().unwrap(),
        note_epoch: Some(v["notes"][note]["epoch"].as_u64().unwrap()),
    }
}
async fn get(grant: &Value) -> Vec<u8> {
    let url = url::Url::parse(grant["url"].as_str().unwrap()).unwrap();
    let host = format!("127.0.0.1:{}", url.port().unwrap());
    let mut s = tokio::net::TcpStream::connect(&host).await.unwrap();
    s.write_all(
        format!(
            "GET {} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n",
            url.path()
        )
        .as_bytes(),
    )
    .await
    .unwrap();
    let mut wire = Vec::new();
    s.read_to_end(&mut wire).await.unwrap();
    wire
}
pub async fn independent_two_note_quiet_prepare_and_window_isolation() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(&dir.path().join("store")).unwrap();
    let svg = br##"<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="#fea"/></svg>"##;
    let mut notes = Vec::new();
    let mut ids = Vec::new();
    for index in 0..2 {
        let note = store.action(json!({"type":"createNote"})).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_owned();
        let a = store
            .store_attachment(
                &note,
                &format!("{index}.svg"),
                "image/svg+xml",
                svg.to_vec(),
            )
            .unwrap();
        notes.push(note);
        ids.push(a.id);
    }
    let session = Session::new(store);
    let tokens: Vec<_> = notes.iter().map(|n| token(&session, n)).collect();
    let shared = Arc::new((Mutex::new(session), Condvar::new()));
    let runtime = MediaRuntime::start_with_provider(
        shared.clone(),
        dir.path().join("cache"),
        HashSet::from(["tauri://localhost".into()]),
        None,
    )
    .await
    .unwrap();
    runtime.opened("main").unwrap();
    runtime.opened("second").unwrap();
    let main = runtime.window("main").unwrap();
    let second = runtime.window("second").unwrap();
    // No active thumbnail leases: reclamation must use Store ownership, not lease inventory.
    for i in 0..2 {
        let g = runtime
            .acquire(
                main.clone(),
                ids[i].clone(),
                tokens[i].clone(),
                Purpose::Thumbnail,
                Some(160),
            )
            .await
            .unwrap();
        runtime
            .release(&main, g["leaseId"].as_str().unwrap())
            .unwrap();
    }
    assert_eq!(runtime.core.cache_usage().unwrap().files, 2);
    let untouched = runtime
        .acquire(
            second.clone(),
            ids[1].clone(),
            tokens[1].clone(),
            Purpose::Original,
            None,
        )
        .await
        .unwrap();
    runtime
        .event(
            "notes-sync",
            &json!({"phase":"prepare","operationId":"quiet-A","noteIds":[notes[0]]}),
        )
        .unwrap();
    assert_eq!(runtime.core.cache_usage().unwrap().files, 1);
    assert!(
        get(&untouched).await.ends_with(svg),
        "A prepare must not revoke B's original"
    );
    assert!(runtime
        .acquire(
            main.clone(),
            ids[0].clone(),
            tokens[0].clone(),
            Purpose::Original,
            None
        )
        .await
        .is_err());
    runtime
        .event(
            "notes-sync",
            &json!({"phase":"prepare","operationId":"quiet-B","noteIds":[notes[1]]}),
        )
        .unwrap();
    assert_eq!(runtime.core.cache_usage().unwrap().files, 0);
    assert!(get(&untouched).await.starts_with(b"HTTP/1.1 404"));
    runtime
        .event(
            "notes-sync",
            &json!({"phase":"release","operationId":"quiet-A","outcome":"abort"}),
        )
        .unwrap();
    let a = runtime
        .acquire(
            main.clone(),
            ids[0].clone(),
            tokens[0].clone(),
            Purpose::Original,
            None,
        )
        .await
        .unwrap();
    assert!(get(&a).await.ends_with(svg));
    assert!(
        runtime
            .acquire(
                second.clone(),
                ids[1].clone(),
                tokens[1].clone(),
                Purpose::Original,
                None
            )
            .await
            .is_err(),
        "A's terminal must not resume B"
    );
    runtime
        .event(
            "notes-access",
            &json!({"phase":"abort","operationId":"unrelated"}),
        )
        .unwrap();
    assert!(runtime
        .acquire(
            second.clone(),
            ids[1].clone(),
            tokens[1].clone(),
            Purpose::Original,
            None
        )
        .await
        .is_err());
    runtime
        .event(
            "notes-sync",
            &json!({"phase":"release","operationId":"quiet-B","outcome":"abort"}),
        )
        .unwrap();
    let b = runtime
        .acquire(
            second.clone(),
            ids[1].clone(),
            tokens[1].clone(),
            Purpose::Original,
            None,
        )
        .await
        .unwrap();
    runtime.closed("main");
    assert!(get(&a).await.starts_with(b"HTTP/1.1 404"));
    assert!(
        get(&b).await.ends_with(svg),
        "closing main must not revoke second window"
    );
    runtime.opened("main").unwrap();
    assert!(
        runtime
            .acquire(
                main,
                ids[0].clone(),
                tokens[0].clone(),
                Purpose::Original,
                None
            )
            .await
            .is_err(),
        "reopening must reject old incarnation"
    );
    runtime.stop();
}
