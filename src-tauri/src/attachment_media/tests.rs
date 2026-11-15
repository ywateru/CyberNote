//! Integration bodies live inside the native-free harness crate so they can
//! exercise crate-private production contracts without compiling Tauri/tests.
use crate::attachment_media::*;
use crate::{
    session::{Session, Token},
    store::{Attachment, Store},
};
use serde_json::json;
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Cursor,
    path::PathBuf,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Condvar, Mutex,
    },
    time::Duration,
};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    net::TcpStream,
};

struct Fixture {
    _dir: tempfile::TempDir,
    root: PathBuf,
    cache_root: PathBuf,
    session: Arc<(Mutex<Session>, Condvar)>,
    authority: Arc<SessionAuthority>,
    core: Arc<MediaCore>,
    window: WindowIdentity,
    note: String,
    attachment: Attachment,
    token: Token,
}
fn token(s: &Session, note: Option<&str>) -> Token {
    let state = s.snapshot().unwrap();
    Token {
        session_id: state["sessionId"].as_str().unwrap().into(),
        epoch: state["epoch"].as_u64().unwrap(),
        note_epoch: note.map(|id| state["notes"][id]["epoch"].as_u64().unwrap()),
    }
}
impl Fixture {
    fn new(bytes: Vec<u8>, mime: &str) -> Self {
        Self::configured(
            bytes,
            mime,
            ThumbnailLimits::default(),
            Duration::from_secs(900),
        )
    }
    fn configured(bytes: Vec<u8>, mime: &str, limits: ThumbnailLimits, ttl: Duration) -> Self {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("store");
        let cache_root = dir.path().join("media-cache");
        let mut store = Store::open(&root).unwrap();
        let note = store.action(json!({"type":"createNote"})).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_owned();
        let attachment = store
            .store_attachment(&note, "example", mime, bytes)
            .unwrap();
        let session = Session::new(store);
        let expected = token(&session, Some(&note));
        let session = Arc::new((Mutex::new(session), Condvar::new()));
        let authority = Arc::new(SessionAuthority::new(session.clone()));
        let window = authority.open_window("main").unwrap();
        let core = MediaCore::new(
            authority.clone(),
            ThumbnailCache::new(cache_root.clone(), limits).unwrap(),
            ttl,
        )
        .unwrap();
        Self {
            _dir: dir,
            root,
            cache_root,
            session,
            authority,
            core,
            window,
            note,
            attachment,
            token: expected,
        }
    }
    async fn server(&self) -> MediaServer {
        MediaServer::start(
            self.core.clone(),
            HashSet::from(["http://tauri.localhost".into()]),
        )
        .await
        .unwrap()
    }
    fn grant(&self, server: &MediaServer) -> MediaGrant {
        self.core
            .grant_original(&self.window, &self.attachment.id, &self.token, &server.base)
            .unwrap()
    }
    fn file(&self) -> PathBuf {
        self.root
            .join("attachments")
            .join(&self.attachment.relative_path)
    }
    fn prepare_delete(&self) -> String {
        let mut s = self.session.0.lock().unwrap();
        let expected = token(&s, None);
        s.begin(
            json!({"type":"deleteNote", "id":self.note}),
            HashSet::from(["main".into()]),
            &expected,
        )
        .unwrap()["operationId"]
            .as_str()
            .unwrap()
            .into()
    }
    fn commit_delete(&self) {
        let operation = self.prepare_delete();
        let mut s = self.session.0.lock().unwrap();
        s.acknowledge(&operation, "main", true).unwrap();
        s.finish(&operation, &HashSet::from(["main".into()]), false)
            .unwrap()
            .0
            .unwrap();
    }
}
struct Http {
    status: u16,
    headers: HashMap<String, String>,
    reader: BufReader<TcpStream>,
}
async fn request(base: &str, path: &str, method: &str, extras: &str) -> Http {
    let host = base.strip_prefix("http://").unwrap();
    let mut stream = TcpStream::connect(host).await.unwrap();
    let request =
        format!("{method} {path} HTTP/1.1\r\nHost: {host}\r\n{extras}Connection: close\r\n\r\n");
    stream.write_all(request.as_bytes()).await.unwrap();
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader.read_line(&mut line).await.unwrap();
    let status = line.split_whitespace().nth(1).unwrap().parse().unwrap();
    let mut headers = HashMap::new();
    loop {
        line.clear();
        reader.read_line(&mut line).await.unwrap();
        if line == "\r\n" {
            break;
        }
        assert!(!line.is_empty());
        let (k, v) = line.split_once(':').unwrap();
        headers.insert(k.to_lowercase(), v.trim().to_string());
    }
    Http {
        status,
        headers,
        reader,
    }
}
fn path(grant: &MediaGrant) -> String {
    format!("/media/{}", grant.lease_id)
}
async fn body(mut response: Http) -> Vec<u8> {
    let mut bytes = Vec::new();
    response.reader.read_to_end(&mut bytes).await.unwrap();
    bytes
}
async fn wait_streams(core: &MediaCore, expected: usize) {
    tokio::time::timeout(Duration::from_secs(3), async {
        while core.metrics.active_streams.load(Ordering::Relaxed) != expected {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
}
fn pattern(size: usize) -> Vec<u8> {
    (0..size).map(|i| (i % 251) as u8).collect()
}
fn png(seed: u8) -> Vec<u8> {
    let image = image::RgbImage::from_fn(2048, 1024, |x, y| {
        image::Rgb([((x + u32::from(seed)) % 256) as u8, (y % 256) as u8, seed])
    });
    let mut cursor = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgb8(image)
        .write_to(&mut cursor, image::ImageFormat::Png)
        .unwrap();
    cursor.into_inner()
}
fn files(root: &std::path::Path) -> Vec<PathBuf> {
    fs::read_dir(root)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| p.extension().is_some_and(|s| s == "png"))
        .collect()
}

pub async fn media_http_ranges_head_and_exact_no_range() {
    let bytes = pattern(4 * 1024 * 1024 + 17);
    let f = Fixture::new(bytes.clone(), "video/mp4");
    let server = f.server().await;
    let grant = f.grant(&server);
    let before = f.core.metrics.bytes_read.load(Ordering::Relaxed);
    let head = request(&server.base, &path(&grant), "HEAD", "").await;
    assert_eq!(head.status, 200);
    assert_eq!(head.headers["content-length"], bytes.len().to_string());
    assert!(body(head).await.is_empty());
    assert_eq!(f.core.metrics.bytes_read.load(Ordering::Relaxed), before);
    let head = request(&server.base, &path(&grant), "HEAD", "Range: bytes=-7\r\n").await;
    assert_eq!(head.status, 206);
    assert_eq!(head.headers["content-length"], "7");
    assert!(body(head).await.is_empty());
    assert_eq!(f.core.metrics.bytes_read.load(Ordering::Relaxed), before);
    for (range, expected) in [
        ("bytes=1-7", &bytes[1..8]),
        ("bytes=-19", &bytes[bytes.len() - 19..]),
        ("bytes=4194304-", &bytes[4194304..]),
        ("bytes=0-999999999", &bytes[..]),
    ] {
        let response = request(
            &server.base,
            &path(&grant),
            "GET",
            &format!("Range: {range}\r\nOrigin: http://tauri.localhost\r\n"),
        )
        .await;
        assert_eq!(response.status, 206);
        assert_eq!(
            response.headers["content-length"],
            expected.len().to_string()
        );
        assert_eq!(
            response.headers["access-control-allow-origin"],
            "http://tauri.localhost"
        );
        assert_eq!(body(response).await, expected);
    }
    for range in [
        "bytes=99999999-",
        "bytes=3-1",
        "bytes=-0",
        "bytes=0-1,3-4",
        "bytes=x-",
        "bytes=18446744073709551616-",
        "garbage",
    ] {
        let response = request(
            &server.base,
            &path(&grant),
            "GET",
            &format!("Range: {range}\r\n"),
        )
        .await;
        assert_eq!(response.status, 416);
        assert_eq!(
            response.headers["content-range"],
            format!("bytes */{}", bytes.len())
        );
        assert!(body(response).await.is_empty());
    }
    let response = request(&server.base, &path(&grant), "GET", "").await;
    assert_eq!(response.status, 200);
    assert_eq!(response.headers["cache-control"], "no-store");
    assert_eq!(response.headers["x-content-type-options"], "nosniff");
    assert_eq!(body(response).await, bytes);
    assert_eq!(
        f.core.metrics.peak_read_block.load(Ordering::Relaxed),
        65536
    );
    assert!(f.core.metrics.read_operations.load(Ordering::Relaxed) > 64);
    wait_streams(&f.core, 0).await;
    server.shutdown().await;
}

pub async fn media_http_rejects_host_origin_method_and_unknown_capability() {
    let f = Fixture::new(pattern(100), "audio/wav");
    let server = f.server().await;
    let grant = f.grant(&server);
    for (method, extras, status) in [
        ("POST", "", 405),
        ("GET", "Origin: https://evil.example\r\n", 403),
        ("GET", "Origin: null\r\n", 403),
        ("GET", "Host: evil.example\r\n", 403),
    ] {
        let response = request(&server.base, &path(&grant), method, extras).await;
        assert_eq!(response.status, status);
        assert!(!response.headers.contains_key("content-type"));
        assert!(body(response).await.is_empty());
    }
    let unknown = request(
        &server.base,
        "/media/00000000000000000000000000000000",
        "GET",
        "",
    )
    .await;
    assert_eq!(unknown.status, 404);
    let response = request(
        &server.base,
        &format!("{}?file=/etc/passwd", path(&grant)),
        "GET",
        "",
    )
    .await;
    assert_eq!(response.status, 400);
    assert_eq!(f.core.metrics.bytes_read.load(Ordering::Relaxed), 0);
    assert!(
        MediaServer::start(f.core.clone(), HashSet::from(["*".into()]))
            .await
            .is_err()
    );
    server.shutdown().await;
}

pub async fn media_http_slow_consumers_backpressure_release_and_disconnect() {
    let f = Fixture::new(pattern(16 * 1024 * 1024), "video/mp4");
    let server = f.server().await;
    let grant = f.grant(&server);
    let mut response = request(&server.base, &path(&grant), "GET", "").await;
    let mut first = [0; 1];
    response.reader.read_exact(&mut first).await.unwrap();
    wait_streams(&f.core, 1).await;
    tokio::time::sleep(Duration::from_millis(100)).await;
    let produced = f.core.metrics.bytes_read.load(Ordering::Relaxed);
    assert!(
        produced < 2 * 1024 * 1024,
        "slow consumer read-ahead was {produced}"
    );
    f.core.release(&f.window, &grant.lease_id).unwrap();
    wait_streams(&f.core, 0).await; // Must close even while the consumer remains stalled.
    let denied = request(&server.base, &path(&grant), "HEAD", "").await;
    assert_eq!(denied.status, 404);
    drop(response);
    let grant = f.grant(&server);
    let response = request(&server.base, &path(&grant), "GET", "").await;
    drop(response);
    wait_streams(&f.core, 0).await;
    server.shutdown().await;
}

pub async fn media_http_parallel_ranges_do_not_share_seek_offsets() {
    let bytes = pattern(2 * 1024 * 1024);
    let f = Fixture::new(bytes.clone(), "audio/wav");
    let server = f.server().await;
    let grant = f.grant(&server);
    let mut tasks = Vec::new();
    for i in 0..12 {
        let base = server.base.clone();
        let path = path(&grant);
        let expected = bytes[i * 7001..i * 7001 + 100003].to_vec();
        tasks.push(tokio::spawn(async move {
            let r = request(
                &base,
                &path,
                "GET",
                &format!("Range: bytes={}-{}\r\n", i * 7001, i * 7001 + 100002),
            )
            .await;
            assert_eq!(r.status, 206);
            assert_eq!(body(r).await, expected);
        }));
    }
    for task in tasks {
        task.await.unwrap();
    }
    wait_streams(&f.core, 0).await;
    server.shutdown().await;
}

pub async fn media_session_tokens_windows_prepare_delete_and_replacement() {
    let f = Fixture::new(pattern(1_000_000), "audio/wav");
    let server = f.server().await;
    let grant = f.grant(&server);
    let other = f.authority.open_window("other").unwrap();
    assert_eq!(
        f.core.release(&other, &grant.lease_id).err().unwrap().code,
        "access_changed"
    );
    let mut stale = f.token.clone();
    stale.note_epoch = Some(stale.note_epoch.unwrap() + 1);
    assert_eq!(
        f.core
            .grant_original(&f.window, &f.attachment.id, &stale, &server.base)
            .err()
            .unwrap()
            .code,
        "access_changed"
    );
    f.authority.close_window(&f.window);
    f.core.revoke_window(&f.window);
    assert_eq!(
        request(&server.base, &path(&grant), "HEAD", "")
            .await
            .status,
        404
    );
    let recreated = f.authority.open_window("main").unwrap();
    assert!(f
        .core
        .grant_original(&f.window, &f.attachment.id, &f.token, &server.base)
        .is_err());
    let grant = f
        .core
        .grant_original(&recreated, &f.attachment.id, &f.token, &server.base)
        .unwrap();
    let replacement = f.root.join("replacement");
    fs::write(&replacement, pattern(1_000_000)).unwrap();
    fs::rename(replacement, f.file()).unwrap();
    assert_eq!(
        request(&server.base, &path(&grant), "HEAD", "")
            .await
            .status,
        404
    );
    let grant = f
        .core
        .grant_original(&recreated, &f.attachment.id, &f.token, &server.base)
        .unwrap();
    let operation = f.prepare_delete();
    assert_eq!(
        request(&server.base, &path(&grant), "HEAD", "")
            .await
            .status,
        404
    );
    assert!(f
        .core
        .grant_original(&recreated, &f.attachment.id, &f.token, &server.base)
        .is_err());
    {
        let mut s = f.session.0.lock().unwrap();
        s.acknowledge(&operation, "main", true).unwrap();
        s.finish(&operation, &HashSet::from(["main".into()]), false)
            .unwrap()
            .0
            .unwrap();
    }
    assert!(f
        .core
        .grant_original(&recreated, &f.attachment.id, &f.token, &server.base)
        .is_err());
    server.shutdown().await;
}

pub async fn media_prepare_hook_interrupts_a_stalled_real_stream() {
    let f = Fixture::new(pattern(16 * 1024 * 1024), "video/mp4");
    let server = f.server().await;
    let grant = f.grant(&server);
    let response = request(&server.base, &path(&grant), "GET", "").await;
    wait_streams(&f.core, 1).await;
    f.prepare_delete();
    f.core.revoke_notes(&[f.note.clone()]);
    wait_streams(&f.core, 0).await;
    drop(response);
    assert_eq!(
        request(&server.base, &path(&grant), "GET", "").await.status,
        404
    );
    server.shutdown().await;
}

pub async fn media_lease_idle_expiry_and_shutdown() {
    let f = Fixture::configured(
        pattern(100),
        "audio/wav",
        ThumbnailLimits::default(),
        Duration::from_millis(20),
    );
    let server = f.server().await;
    let grant = f.grant(&server);
    tokio::time::sleep(Duration::from_millis(30)).await;
    assert_eq!(
        request(&server.base, &path(&grant), "GET", "").await.status,
        404
    );
    let host = server.base.strip_prefix("http://").unwrap().to_string();
    server.shutdown().await;
    assert!(TcpStream::connect(host).await.is_err());
}

pub fn media_store_rejects_symlinks_sizes_reserved_records_and_locked_owner() {
    let f = Fixture::new(pattern(100), "audio/wav");
    let original = f
        .session
        .0
        .lock()
        .unwrap()
        .store
        .media_attachment(&f.attachment.id)
        .unwrap();
    assert_eq!(original.open().unwrap().stamp.bytes, 100);
    fs::write(f.file(), pattern(101)).unwrap();
    assert!(original.open().is_err());
    fs::remove_file(f.file()).unwrap();
    let external = f.root.join("external");
    fs::write(&external, pattern(100)).unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(&external, f.file()).unwrap();
    assert!(original.open().is_err());
    fs::remove_file(f.file()).unwrap();
    fs::write(f.file(), pattern(100)).unwrap();
    let attachments = f.root.join("attachments");
    let moved = f.root.join("moved");
    fs::rename(&attachments, &moved).unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(&moved, &attachments).unwrap();
    assert!(original.open().is_err());
    fs::remove_file(&attachments).unwrap();
    fs::rename(moved, &attachments).unwrap();
    let mut locked = f.session.0.lock().unwrap().store.note(&f.note).unwrap();
    locked.locked = true;
    let db = rusqlite::Connection::open(f.root.join("notes.sqlite3")).unwrap();
    db.execute(
        "UPDATE notes SET body=?1 WHERE id=?2",
        rusqlite::params![serde_json::to_string(&locked).unwrap(), f.note],
    )
    .unwrap();
    assert_eq!(
        f.authority
            .authorize(&f.window, &f.attachment.id, &f.token)
            .err()
            .unwrap()
            .code,
        "access_changed"
    );
    let raw = Fixture::new(
        b"{}".to_vec(),
        "application/vnd.local-notes.apple-import+json",
    );
    assert_eq!(
        raw.session
            .0
            .lock()
            .unwrap()
            .store
            .media_attachment(&raw.attachment.id)
            .err()
            .unwrap()
            .code,
        "internal_attachment"
    );
}

pub async fn media_thumbnails_are_small_persistent_and_deduplicated() {
    let original = png(4);
    let original_bytes = original.len();
    let f = Fixture::new(original, "application/octet-stream");
    let server = f.server().await;
    let mut tasks = Vec::new();
    for _ in 0..8 {
        let core = f.core.clone();
        let window = f.window.clone();
        let token = f.token.clone();
        let id = f.attachment.id.clone();
        let base = server.base.clone();
        tasks.push(tokio::spawn(async move {
            core.grant_thumbnail(&window, &id, &token, 160, &base)
                .await
                .unwrap()
        }));
    }
    let mut grants = Vec::new();
    for task in tasks {
        grants.push(task.await.unwrap());
    }
    assert_eq!(
        f.core.metrics.thumbnail_generations.load(Ordering::Relaxed),
        1
    );
    assert_eq!(f.core.metrics.thumbnail_hits.load(Ordering::Relaxed), 7);
    assert_eq!(files(&f.cache_root).len(), 1);
    let grant = &grants[0];
    assert_eq!((grant.width, grant.height), (Some(160), Some(80)));
    assert!((grant.bytes as usize) < original_bytes);
    let r = request(&server.base, &path(grant), "GET", "").await;
    assert_eq!(r.status, 200);
    let bytes = body(r).await;
    let thumb = image::load_from_memory(&bytes).unwrap();
    assert_eq!((thumb.width(), thumb.height()), (160, 80));
    // Fresh cache object simulates restart; it reconstructs disk metadata and hits.
    let cache = ThumbnailCache::new(f.cache_root.clone(), ThumbnailLimits::default()).unwrap();
    let second = MediaCore::new(f.authority.clone(), cache, Duration::from_secs(30)).unwrap();
    second
        .grant_thumbnail(&f.window, &f.attachment.id, &f.token, 160, &server.base)
        .await
        .unwrap();
    assert_eq!(
        second.metrics.thumbnail_generations.load(Ordering::Relaxed),
        0
    );
    assert_eq!(second.metrics.thumbnail_hits.load(Ordering::Relaxed), 1);
    f.core
        .invalidate_cached_attachment(&f.attachment.id)
        .unwrap();
    assert!(files(&f.cache_root).is_empty());
    assert_eq!(
        request(&server.base, &path(grant), "HEAD", "").await.status,
        404
    );
    server.shutdown().await;
}

pub async fn media_raster_formats_and_restricted_svg_have_explicit_results() {
    for format in [
        image::ImageFormat::Png,
        image::ImageFormat::Jpeg,
        image::ImageFormat::Gif,
        image::ImageFormat::WebP,
        image::ImageFormat::Bmp,
    ] {
        let image = image::DynamicImage::ImageRgb8(image::RgbImage::from_pixel(
            512,
            256,
            image::Rgb([12, 80, 230]),
        ));
        let mut out = Cursor::new(Vec::new());
        image.write_to(&mut out, format).unwrap();
        let f = Fixture::new(out.into_inner(), "application/octet-stream");
        let grant = f
            .core
            .grant_thumbnail(
                &f.window,
                &f.attachment.id,
                &f.token,
                64,
                "http://127.0.0.1:1",
            )
            .await
            .unwrap();
        assert_eq!((grant.width, grant.height), (Some(64), Some(32)));
        assert_eq!(grant.mime, "image/png");
    }
    let svg = b"<svg xmlns='http://www.w3.org/2000/svg' width='400' height='200'><rect width='400' height='200' fill='red' fill-opacity='.5'/></svg>";
    let f = Fixture::new(svg.to_vec(), "image/svg+xml");
    let grant = f
        .core
        .grant_thumbnail(
            &f.window,
            &f.attachment.id,
            &f.token,
            80,
            "http://127.0.0.1:1",
        )
        .await
        .unwrap();
    assert_eq!(grant.width, Some(80));
    let decoded = image::open(&files(&f.cache_root)[0]).unwrap().into_rgba8();
    let pixel = decoded.get_pixel(10, 10);
    assert_eq!(pixel[0], 255);
    assert!(pixel[3] >= 127 && pixel[3] <= 129);
    for source in [
        "<svg xmlns='http://www.w3.org/2000/svg'><image href='file:///etc/passwd'/></svg>",
        "<svg xmlns='http://www.w3.org/2000/svg'><textPath>hello</textPath></svg>",
        "<svg xmlns='http://www.w3.org/2000/svg' width='13000' height='1'/>",
    ] {
        let f = Fixture::new(source.as_bytes().to_vec(), "image/svg+xml");
        assert!(f
            .core
            .grant_thumbnail(
                &f.window,
                &f.attachment.id,
                &f.token,
                80,
                "http://127.0.0.1:1"
            )
            .await
            .is_err());
        assert!(files(&f.cache_root).is_empty());
    }
    let f = Fixture::new(b"not an image".to_vec(), "image/heic");
    assert_eq!(
        f.core
            .grant_thumbnail(
                &f.window,
                &f.attachment.id,
                &f.token,
                80,
                "http://127.0.0.1:1"
            )
            .await
            .err()
            .unwrap()
            .code,
        "unsupported_media"
    );
}

pub async fn media_cache_quota_source_invalidation_and_cleanup() {
    let mut limits = ThumbnailLimits::default();
    limits.quota = 2500;
    let f = Fixture::configured(png(1), "image/png", limits.clone(), Duration::from_secs(60));
    let mut ids = vec![f.attachment.id.clone()];
    for i in 2..7 {
        let a = f
            .session
            .0
            .lock()
            .unwrap()
            .store
            .store_attachment(&f.note, "another.png", "image/png", png(i))
            .unwrap();
        ids.push(a.id);
    }
    for id in &ids {
        f.core
            .grant_thumbnail(&f.window, id, &f.token, 160, "http://127.0.0.1:1")
            .await
            .unwrap();
    }
    let current = files(&f.cache_root);
    let total: u64 = current.iter().map(|p| fs::metadata(p).unwrap().len()).sum();
    assert!(total <= limits.quota);
    let usage = f.core.cache_usage().unwrap();
    assert_eq!(usage.bytes, total);
    assert_eq!(usage.files, current.len());
    assert_eq!(usage.quota, limits.quota);
    assert!(current.len() < ids.len());
    let before = f.core.metrics.thumbnail_generations.load(Ordering::Relaxed);
    f.core
        .grant_thumbnail(&f.window, &ids[0], &f.token, 160, "http://127.0.0.1:1")
        .await
        .unwrap();
    assert_eq!(
        f.core.metrics.thumbnail_generations.load(Ordering::Relaxed),
        before + 1
    );
    // Same registration + same byte length, new inode is a different cache version.
    let replacement = f.root.join("new.png");
    fs::write(&replacement, fs::read(f.file()).unwrap()).unwrap();
    fs::rename(replacement, f.file()).unwrap();
    f.core
        .grant_thumbnail(&f.window, &ids[0], &f.token, 160, "http://127.0.0.1:1")
        .await
        .unwrap();
    assert_eq!(
        f.core.metrics.thumbnail_generations.load(Ordering::Relaxed),
        before + 2
    );
    assert!(!fs::read_dir(&f.cache_root).unwrap().any(|e| e
        .unwrap()
        .file_name()
        .to_string_lossy()
        .starts_with(".media-tmp-")));
    f.core.clear_cache().unwrap();
    assert!(files(&f.cache_root).is_empty());
    assert!(f.file().exists()); // Cache reset never removes the managed original.
}

pub async fn media_thumbnail_revocation_during_generation_never_publishes() {
    struct Preparing {
        real: Arc<SessionAuthority>,
        session: Arc<(Mutex<Session>, Condvar)>,
        note: String,
        calls: AtomicUsize,
    }
    impl Authorizer for Preparing {
        fn authorize(
            &self,
            window: &WindowIdentity,
            id: &str,
            expected: &Token,
        ) -> crate::store::Result<crate::store::attachment_media::ManagedAttachment> {
            if self.calls.fetch_add(1, Ordering::SeqCst) == 4 {
                let mut s = self.session.0.lock().unwrap();
                let global = token(&s, None);
                s.begin(
                    json!({"type":"deleteNote", "id":self.note}),
                    HashSet::from(["main".into()]),
                    &global,
                )
                .unwrap();
            }
            self.real.authorize(window, id, expected)
        }
    }
    let f = Fixture::new(png(3), "image/png");
    let authorizer = Arc::new(Preparing {
        real: f.authority.clone(),
        session: f.session.clone(),
        note: f.note.clone(),
        calls: AtomicUsize::new(0),
    });
    let core = MediaCore::new(
        authorizer,
        ThumbnailCache::new(f.cache_root.clone(), ThumbnailLimits::default()).unwrap(),
        Duration::from_secs(60),
    )
    .unwrap();
    assert_eq!(
        core.grant_thumbnail(
            &f.window,
            &f.attachment.id,
            &f.token,
            480,
            "http://127.0.0.1:1"
        )
        .await
        .err()
        .unwrap()
        .code,
        "access_changed"
    );
    assert!(files(&f.cache_root).is_empty());
    assert_eq!(fs::read_dir(&f.cache_root).unwrap().count(), 0);
    assert!(f.session.0.lock().unwrap().pending.is_some());
}

pub async fn media_actual_file_read_is_discarded_when_session_revokes_before_publish() {
    struct PrepareAfterRead {
        real: Arc<SessionAuthority>,
        session: Arc<(Mutex<Session>, Condvar)>,
        note: String,
        metrics: Mutex<Option<std::sync::Weak<MediaMetrics>>>,
    }
    impl Authorizer for PrepareAfterRead {
        fn authorize(
            &self,
            window: &WindowIdentity,
            id: &str,
            expected: &Token,
        ) -> crate::store::Result<crate::store::attachment_media::ManagedAttachment> {
            let has_read = self
                .metrics
                .lock()
                .unwrap()
                .as_ref()
                .and_then(|w| w.upgrade())
                .is_some_and(|m| m.bytes_read.load(Ordering::SeqCst) > 0);
            if has_read {
                let mut s = self.session.0.lock().unwrap();
                if s.pending.is_none() {
                    let global = token(&s, None);
                    s.begin(
                        json!({"type":"deleteNote", "id":self.note}),
                        HashSet::from(["main".into()]),
                        &global,
                    )
                    .unwrap();
                }
            }
            self.real.authorize(window, id, expected)
        }
    }
    let f = Fixture::new(vec![0xa7; 1024 * 1024], "audio/wav");
    let authority = Arc::new(PrepareAfterRead {
        real: f.authority.clone(),
        session: f.session.clone(),
        note: f.note.clone(),
        metrics: Mutex::new(None),
    });
    let core = MediaCore::new(
        authority.clone(),
        ThumbnailCache::new(f.cache_root.clone(), ThumbnailLimits::default()).unwrap(),
        Duration::from_secs(60),
    )
    .unwrap();
    *authority.metrics.lock().unwrap() = Some(Arc::downgrade(&core.metrics));
    let server = MediaServer::start(
        core.clone(),
        HashSet::from(["tauri://localhost".into(), "http://tauri.localhost".into()]),
    )
    .await
    .unwrap();
    let grant = core
        .grant_original(&f.window, &f.attachment.id, &f.token, &server.base)
        .unwrap();
    let host = server.base.strip_prefix("http://").unwrap();
    let mut stream = TcpStream::connect(host).await.unwrap();
    stream
        .write_all(
            format!(
                "GET {} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n",
                path(&grant)
            )
            .as_bytes(),
        )
        .await
        .unwrap();
    let mut wire = Vec::new();
    let _ = stream.read_to_end(&mut wire).await;
    assert_eq!(core.metrics.bytes_read.load(Ordering::SeqCst), 65536);
    assert!(
        !wire.contains(&0xa7),
        "unauthorized file bytes reached TCP response"
    );
    assert!(f.session.0.lock().unwrap().pending.is_some());
    wait_streams(&core, 0).await;
    server.shutdown().await;
}

pub async fn media_cache_rejects_late_symlink_swap_and_bounded_output_leaves_no_temp() {
    let f = Fixture::new(png(8), "image/png");
    let moved = f.cache_root.with_file_name("old-cache");
    let outside = f.cache_root.with_file_name("unrelated");
    fs::create_dir(&outside).unwrap();
    fs::rename(&f.cache_root, &moved).unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(&outside, &f.cache_root).unwrap();
    assert!(f
        .core
        .grant_thumbnail(
            &f.window,
            &f.attachment.id,
            &f.token,
            160,
            "http://127.0.0.1:1"
        )
        .await
        .is_err());
    assert_eq!(fs::read_dir(outside).unwrap().count(), 0);
    let mut limits = ThumbnailLimits::default();
    limits.output_bytes = 10;
    let f = Fixture::configured(png(4), "image/png", limits, Duration::from_secs(60));
    assert!(f
        .core
        .grant_thumbnail(
            &f.window,
            &f.attachment.id,
            &f.token,
            160,
            "http://127.0.0.1:1"
        )
        .await
        .is_err());
    assert_eq!(fs::read_dir(&f.cache_root).unwrap().count(), 0);
}

pub async fn media_head_rejects_missing_cached_source_without_reading_payload() {
    let f = Fixture::new(png(2), "image/png");
    let server = f.server().await;
    let grant = f
        .core
        .grant_thumbnail(&f.window, &f.attachment.id, &f.token, 160, &server.base)
        .await
        .unwrap();
    fs::remove_file(&files(&f.cache_root)[0]).unwrap();
    assert_eq!(
        request(&server.base, &path(&grant), "HEAD", "")
            .await
            .status,
        404
    );
    assert_eq!(f.core.metrics.bytes_read.load(Ordering::Relaxed), 0);
    server.shutdown().await;
}

pub async fn media_cached_png_truncation_recovers_without_bypassing_source_authority() {
    let f = Fixture::new(png(5), "image/png");
    let grant = f
        .core
        .grant_thumbnail(
            &f.window,
            &f.attachment.id,
            &f.token,
            160,
            "http://127.0.0.1:1",
        )
        .await
        .unwrap();
    f.core.release(&f.window, &grant.lease_id).unwrap();
    let file = files(&f.cache_root).pop().unwrap();
    let complete = fs::read(&file).unwrap();
    // Keep the entire IDAT/frame, but remove IEND's final CRC. A successful
    // pixel decode alone is insufficient: cache integrity must reach the end.
    fs::write(&file, &complete[..complete.len() - 4]).unwrap();
    let recovered = f
        .core
        .grant_thumbnail(
            &f.window,
            &f.attachment.id,
            &f.token,
            160,
            "http://127.0.0.1:1",
        )
        .await
        .unwrap();
    f.core.release(&f.window, &recovered.lease_id).unwrap();
    assert_eq!(
        f.core.metrics.thumbnail_generations.load(Ordering::Relaxed),
        2
    );
    assert_eq!(f.core.metrics.thumbnail_hits.load(Ordering::Relaxed), 0);
    assert_eq!(fs::read(&file).unwrap(), complete);
    fs::write(&file, &complete[..complete.len() - 4]).unwrap();
    let broken = fs::read(&file).unwrap();
    f.prepare_delete();
    assert_eq!(
        f.core
            .grant_thumbnail(
                &f.window,
                &f.attachment.id,
                &f.token,
                160,
                "http://127.0.0.1:1"
            )
            .await
            .err()
            .unwrap()
            .code,
        "access_changed"
    );
    assert_eq!(
        f.core.metrics.thumbnail_generations.load(Ordering::Relaxed),
        2
    );
    assert_eq!(
        fs::read(&file).unwrap(),
        broken,
        "source denial must precede cache regeneration"
    );
    let mut oversized = ThumbnailLimits::default();
    oversized.output_bytes = 8 * 1024 * 1024 + 1;
    assert!(
        ThumbnailCache::new(f.cache_root.with_file_name("oversized-cache"), oversized).is_err()
    );
}

pub async fn media_metrics_separate_real_original_and_thumbnail_tcp_bytes() {
    let original = png(9);
    let source_bytes = original.len() as u64;
    let f = Fixture::new(original, "image/png");
    let server = f.server().await;
    let grant = f.grant(&server);
    let first = body(
        request(
            &server.base,
            &path(&grant),
            "GET",
            "Range: bytes=13-112\r\n",
        )
        .await,
    )
    .await;
    assert_eq!(first.len(), 100);
    let thumb = f
        .core
        .grant_thumbnail(&f.window, &f.attachment.id, &f.token, 160, &server.base)
        .await
        .unwrap();
    let bytes = body(request(&server.base, &path(&thumb), "GET", "").await).await;
    assert_eq!(bytes.len() as u64, thumb.bytes);
    let m = &f.core.metrics;
    assert_eq!(m.original_bytes_read.load(Ordering::Relaxed), 100);
    assert_eq!(m.thumbnail_bytes_read.load(Ordering::Relaxed), thumb.bytes);
    assert_eq!(m.bytes_read.load(Ordering::Relaxed), 100 + thumb.bytes);
    assert_eq!(m.original_read_operations.load(Ordering::Relaxed), 1);
    assert_eq!(m.thumbnail_read_operations.load(Ordering::Relaxed), 1);
    assert_eq!(m.thumbnail_generation_attempts.load(Ordering::Relaxed), 1);
    assert_eq!(
        m.thumbnail_source_logical_bytes.load(Ordering::Relaxed),
        source_bytes
    );
    assert_eq!(
        m.thumbnail_output_bytes.load(Ordering::Relaxed),
        thumb.bytes
    );
    f.core
        .grant_thumbnail(&f.window, &f.attachment.id, &f.token, 160, &server.base)
        .await
        .unwrap();
    assert_eq!(m.thumbnail_generation_attempts.load(Ordering::Relaxed), 1);
    assert_eq!(
        m.thumbnail_source_logical_bytes.load(Ordering::Relaxed),
        source_bytes
    );
    assert_eq!(m.thumbnail_hits.load(Ordering::Relaxed), 1);
    server.shutdown().await;
}

struct ProbeProvider {
    calls: AtomicUsize,
    oversized: bool,
    revoke: Option<Arc<(Mutex<Session>, Condvar)>>,
    note: String,
}
impl provider::ThumbnailProvider for ProbeProvider {
    fn render(
        &self,
        input: &crate::store::attachment_media::VerifiedFile,
        _mime: &str,
        pixels: u32,
        _budget: u64,
        authorize: &(dyn Fn() -> crate::store::Result<()> + Sync),
    ) -> crate::store::Result<image::RgbaImage> {
        self.calls.fetch_add(1, Ordering::Relaxed);
        assert!(input.file.metadata().unwrap().is_file());
        authorize()?;
        if let Some(session) = &self.revoke {
            let mut s = session.0.lock().unwrap();
            let expected = token(&s, None);
            s.begin(
                json!({"type":"deleteNote","id":self.note}),
                HashSet::from(["main".into()]),
                &expected,
            )
            .unwrap();
        }
        Ok(image::RgbaImage::from_pixel(
            pixels + u32::from(self.oversized),
            pixels,
            image::Rgba([90, 120, 200, 255]),
        ))
    }
}
pub async fn media_provider_handoff_validates_bounds_cache_and_late_revocation() {
    for (oversized, revoke) in [(false, false), (true, false), (false, true)] {
        let mut f = Fixture::new(vec![7; 1024], "video/mp4");
        let provider = Arc::new(ProbeProvider {
            calls: AtomicUsize::new(0),
            oversized,
            revoke: revoke.then(|| f.session.clone()),
            note: f.note.clone(),
        });
        f.core = MediaCore::new(
            f.authority.clone(),
            ThumbnailCache::new(f.cache_root.clone(), ThumbnailLimits::default())
                .unwrap()
                .with_provider(provider.clone()),
            Duration::from_secs(30),
        )
        .unwrap();
        let server = f.server().await;
        let grant = f
            .core
            .grant_thumbnail(&f.window, &f.attachment.id, &f.token, 160, &server.base)
            .await;
        if oversized || revoke {
            assert!(grant.is_err());
            assert!(files(&f.cache_root).is_empty());
        } else {
            let grant = grant.unwrap();
            let bytes = body(request(&server.base, &path(&grant), "GET", "").await).await;
            assert_eq!(image::load_from_memory(&bytes).unwrap().width(), 160);
            f.core
                .grant_thumbnail(&f.window, &f.attachment.id, &f.token, 160, &server.base)
                .await
                .unwrap();
            assert_eq!(provider.calls.load(Ordering::Relaxed), 1);
            assert_eq!(f.core.metrics.thumbnail_hits.load(Ordering::Relaxed), 1);
        }
        server.shutdown().await;
    }
}

#[cfg(all(target_os = "macos", feature = "native-provider-probe"))]
struct MacProbeProvider;
#[cfg(all(target_os = "macos", feature = "native-provider-probe"))]
impl provider::ThumbnailProvider for MacProbeProvider {
    fn render(
        &self,
        input: &crate::store::attachment_media::VerifiedFile,
        mime: &str,
        pixels: u32,
        budget: u64,
        authorize: &(dyn Fn() -> crate::store::Result<()> + Sync),
    ) -> crate::store::Result<image::RgbaImage> {
        use std::os::fd::AsRawFd;
        unsafe extern "C" {
            fn notes_media_thumbnail(
                fd: i32,
                bytes: u64,
                video: i32,
                pixels: u32,
                input_pixels: u64,
                out: *mut u8,
                capacity: usize,
                width: *mut u32,
                height: *mut u32,
            ) -> i32;
        }
        authorize()?;
        let mut bytes = vec![0; pixels as usize * pixels as usize * 4];
        let (mut w, mut h) = (0, 0);
        let status = unsafe {
            notes_media_thumbnail(
                input.file.as_raw_fd(),
                input.stamp.bytes,
                mime.starts_with("video/") as i32,
                pixels,
                budget,
                bytes.as_mut_ptr(),
                bytes.len(),
                &mut w,
                &mut h,
            )
        };
        assert_eq!(status, 0);
        bytes.truncate(w as usize * h as usize * 4);
        authorize()?;
        Ok(image::RgbaImage::from_raw(w, h, bytes).unwrap())
    }
}
#[cfg(all(target_os = "macos", feature = "native-provider-probe"))]
pub async fn media_real_mac_fd_video_provider_cache_and_tcp() {
    let root = std::env::var("MEDIA99C_FIXTURE")
        .expect("Set MEDIA99C_FIXTURE to frozen fixture originals directory");
    for file in ["video-faststart.mp4", "video-tail-metadata.mp4"] {
        let original = fs::read(std::path::Path::new(&root).join(file)).unwrap();
        let mut f = Fixture::new(original, "video/mp4");
        f.core = MediaCore::new(
            f.authority.clone(),
            ThumbnailCache::new(f.cache_root.clone(), ThumbnailLimits::default())
                .unwrap()
                .with_provider(Arc::new(MacProbeProvider)),
            Duration::from_secs(30),
        )
        .unwrap();
        let server = f.server().await;
        let grant = f
            .core
            .grant_thumbnail(&f.window, &f.attachment.id, &f.token, 480, &server.base)
            .await
            .unwrap();
        assert_eq!((grant.width, grant.height), (Some(480), Some(270)));
        let png = body(request(&server.base, &path(&grant), "GET", "").await).await;
        assert!(png.len() < 1024 * 1024);
        let image = image::load_from_memory(&png).unwrap().into_rgba8();
        assert!(image.pixels().any(|p| p[0] > 20 && p[1] > 20));
        assert_eq!(
            f.core.metrics.thumbnail_generations.load(Ordering::Relaxed),
            1
        );
        let cache = ThumbnailCache::new(f.cache_root.clone(), ThumbnailLimits::default())
            .unwrap()
            .with_provider(Arc::new(MacProbeProvider));
        let restarted =
            MediaCore::new(f.authority.clone(), cache, Duration::from_secs(30)).unwrap();
        restarted
            .grant_thumbnail(&f.window, &f.attachment.id, &f.token, 480, &server.base)
            .await
            .unwrap();
        assert_eq!(
            restarted
                .metrics
                .thumbnail_generation_attempts
                .load(Ordering::Relaxed),
            0
        );
        f.prepare_delete();
        assert!(f
            .core
            .grant_thumbnail(&f.window, &f.attachment.id, &f.token, 480, &server.base)
            .await
            .is_err());
        server.shutdown().await;
    }
}

#[path = "svg104_tests.rs"]
mod svg104_tests;
pub use svg104_tests::*;
