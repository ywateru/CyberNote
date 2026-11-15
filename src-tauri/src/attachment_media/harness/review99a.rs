use crate::attachment_media::*;
use crate::{session, store};
use serde_json::json;
use std::{
    collections::HashSet,
    io::Cursor,
    sync::{Arc, Condvar, Mutex},
    time::Duration,
};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub async fn corrupt_idat_cache_must_regenerate() {
    probe_cache_corruption(false).await;
}
pub async fn restarted_corrupt_idat_cache_must_regenerate() {
    probe_cache_corruption(true).await;
}
async fn probe_cache_corruption(restart: bool) {
    let dir = tempfile::tempdir().unwrap();
    let cache = dir.path().join("cache");
    let mut store = store::Store::open(&dir.path().join("store")).unwrap();
    let note = store.action(json!({"type":"createNote"})).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let mut encoded = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgb8(image::RgbImage::from_fn(320, 160, |x, y| {
        image::Rgb([(x % 251) as u8, (y % 241) as u8, 67])
    }))
    .write_to(&mut encoded, image::ImageFormat::Png)
    .unwrap();
    let a = store
        .store_attachment(&note, "fixture.png", "image/png", encoded.into_inner())
        .unwrap();
    let session = session::Session::new(store);
    let snapshot = session.snapshot().unwrap();
    let token = session::Token {
        session_id: snapshot["sessionId"].as_str().unwrap().into(),
        epoch: snapshot["epoch"].as_u64().unwrap(),
        note_epoch: Some(snapshot["notes"][&note]["epoch"].as_u64().unwrap()),
    };
    let session = Arc::new((Mutex::new(session), Condvar::new()));
    let authority = Arc::new(SessionAuthority::new(session));
    let window = authority.open_window("main").unwrap();
    let mut core = MediaCore::new(
        authority.clone(),
        ThumbnailCache::new(cache.clone(), ThumbnailLimits::default()).unwrap(),
        Duration::from_secs(60),
    )
    .unwrap();
    let mut server = MediaServer::start(core.clone(), HashSet::from(["tauri://localhost".into()]))
        .await
        .unwrap();
    let first = core
        .grant_thumbnail(&window, &a.id, &token, 160, &server.base)
        .await
        .unwrap();
    core.release(&window, &first.lease_id).unwrap();
    let file = std::fs::read_dir(&cache)
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    let mut png = std::fs::read(&file).unwrap();
    assert!(image::load_from_memory(&png).is_ok());
    let mut pos = 8;
    loop {
        let len = u32::from_be_bytes(png[pos..pos + 4].try_into().unwrap()) as usize;
        if &png[pos + 4..pos + 8] == b"IDAT" {
            assert!(len > 8);
            png[pos + 8 + 4] ^= 0xff;
            break;
        }
        pos += len + 12;
    }
    assert!(
        image::load_from_memory(&png).is_err(),
        "probe must really corrupt the image body"
    );
    std::fs::write(&file, &png).unwrap();
    if restart {
        server.shutdown().await;
        core = MediaCore::new(
            authority,
            ThumbnailCache::new(cache.clone(), ThumbnailLimits::default()).unwrap(),
            Duration::from_secs(60),
        )
        .unwrap();
        server = MediaServer::start(core.clone(), HashSet::from(["tauri://localhost".into()]))
            .await
            .unwrap();
    }
    let second = core
        .grant_thumbnail(&window, &a.id, &token, 160, &server.base)
        .await
        .unwrap();
    let host = server.base.strip_prefix("http://").unwrap();
    let mut tcp = tokio::net::TcpStream::connect(host).await.unwrap();
    tcp.write_all(
        format!(
            "GET /media/{} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n",
            second.lease_id
        )
        .as_bytes(),
    )
    .await
    .unwrap();
    let mut wire = Vec::new();
    tcp.read_to_end(&mut wire).await.unwrap();
    let split = wire.windows(4).position(|w| w == b"\r\n\r\n").unwrap() + 4;
    let generation = core
        .metrics
        .thumbnail_generations
        .load(std::sync::atomic::Ordering::Relaxed);
    let hit = core
        .metrics
        .thumbnail_hits
        .load(std::sync::atomic::Ordering::Relaxed);
    println!(
        "INDEPENDENT_CACHE_RESULT {}",
        json!({"restarted":restart,"generations":generation,"hits":hit,"status":String::from_utf8_lossy(&wire[..split]).lines().next().unwrap(),"bodyDecodes":image::load_from_memory(&wire[split..]).is_ok()})
    );
    server.shutdown().await;
    assert!(image::load_from_memory(&wire[split..]).is_ok(),"corrupt cached IDAT was accepted as a hit and returned as HTTP 200 instead of regeneration");
    assert_eq!(
        generation,
        if restart { 1 } else { 2 },
        "corrupt cache must regenerate once"
    );
}
