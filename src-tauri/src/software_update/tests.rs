use super::super::{
    archive::validate_zip,
    feed::{Asset, GithubRelease},
    install::DenyInstall,
};
use super::*;
use std::{
    io::{Read, Write},
    net::TcpListener,
    sync::atomic::{AtomicUsize, Ordering},
    thread,
};
fn version(s: &str) -> Version {
    Version::parse(s).unwrap()
}
fn mac() -> Target {
    Target {
        platform: "macos".into(),
        architecture: "arm64".into(),
    }
}
fn asset(name: &str, size: u64) -> Asset {
    Asset {
        name: name.into(),
        size,
        browser_download_url: format!(
            "https://github.com/ywateru/CyberNote/releases/download/v0.2.0/{name}"
        ),
    }
}
fn release(tag: &str, pre: bool) -> GithubRelease {
    GithubRelease {
        tag_name: tag.into(),
        prerelease: pre,
        draft: false,
        body: Some("# Changes\nfixture".into()),
        assets: vec![
            asset("CyberNote-macos-arm64.zip", 100),
            asset("CyberNote-macos-arm64.sha256", 192),
            asset("CyberNote-macos-arm64.json", 1803),
        ],
    }
}
#[test]
fn semver_order_and_metadata() {
    let ordered = [
        "1.0.0-alpha",
        "1.0.0-alpha.1",
        "1.0.0-alpha.beta",
        "1.0.0-beta",
        "1.0.0-beta.2",
        "1.0.0-beta.11",
        "1.0.0-rc.1",
        "1.0.0",
        "1.10.0",
        "2.0.0",
    ];
    for pair in ordered.windows(2) {
        assert!(version(pair[0]) < version(pair[1]));
    }
    assert_eq!(
        version("v1.0.0+build.1").cmp(&version("1.0.0+other")),
        std::cmp::Ordering::Equal
    );
    assert!(version("1.0.0-99999999999999999999999999999") > version("1.0.0-11"));
    for s in [
        "1",
        "1.0",
        "01.0.0",
        "1.0.0-01",
        "1.0.0-",
        "1.0.0+",
        "1.0.0+x..y",
        "1.0.0/evil",
        "1.0.0\n",
        "1.0.0-汉字",
        "18446744073709551616.0.0",
    ] {
        assert!(Version::parse(s).is_err(), "{s}");
    }
}
#[test]
fn current_stable_never_downgrades_to_same_core_preview() {
    for channel in [Channel::Preview, Channel::Stable] {
        assert!(feed::select(
            vec![
                release("v0.1.0-preview.2", true),
                release("v0.1.0-preview.1", true)
            ],
            "0.1.0",
            channel,
            &mac()
        )
        .unwrap()
        .is_none());
    }
}
#[test]
fn channel_platform_and_newest_missing_asset() {
    assert_eq!(
        feed::select(
            vec![release("v0.3.0-preview.2", true), release("v0.2.0", false)],
            "0.1.0",
            Channel::Stable,
            &mac()
        )
        .unwrap()
        .unwrap()
        .version,
        "0.2.0"
    );
    assert_eq!(
        feed::select(
            vec![release("v0.3.0-preview.2", true), release("v0.2.0", false)],
            "0.1.0",
            Channel::Preview,
            &mac()
        )
        .unwrap()
        .unwrap()
        .version,
        "0.3.0-preview.2"
    );
    let mut r = release("v0.3.0", false);
    r.assets.remove(0);
    assert!(feed::select(
        vec![r, release("v0.2.0", false)],
        "0.1.0",
        Channel::Stable,
        &mac(),
    )
    .unwrap_err()
    .contains("missing_asset"));
    assert!(feed::select(
        vec![release("v0.2.0", false)],
        "0.1.0",
        Channel::Stable,
        &Target {
            platform: "macos".into(),
            architecture: "x86_64".into()
        }
    )
    .unwrap_err()
    .contains("unsupported_platform"));
    let mut r = release("v0.2.0", false);
    r.assets.push(r.assets[0].clone());
    assert!(feed::select(vec![r], "0.1.0", Channel::Stable, &mac())
        .unwrap_err()
        .contains("ambiguous"));
}

#[test]
fn daily_channel_selects_only_newer_daily_prereleases() {
    let releases = vec![
        release("v0.2.0", false),
        release("v0.1.0-preview.9", true),
        release("v0.1.0-preview.3.daily.20261119", true),
        release("v0.1.0-preview.2.daily.20261118", true),
    ];
    assert_eq!(
        feed::select(releases.clone(), "0.1.0-preview.2", Channel::Daily, &mac())
            .unwrap()
            .unwrap()
            .version,
        "0.1.0-preview.3.daily.20261119"
    );
    assert_eq!(
        feed::select(releases, "0.1.0-preview.2", Channel::Preview, &mac())
            .unwrap()
            .unwrap()
            .version,
        "0.2.0"
    );
}
#[test]
fn checksum_names_notices_and_duplicate() {
    let h = "a".repeat(64);
    let n = "b".repeat(64);
    let sums = format!("{h}  CyberNote-macos-arm64.zip\n{n}  CyberNote-macos-arm64-notices.zip\n");
    assert_eq!(
        feed::checksum(&sums, "CyberNote-macos-arm64.zip").unwrap(),
        h
    );
    assert!(feed::checksum(&(sums.clone() + &sums), "CyberNote-macos-arm64.zip").is_err());
    assert!(feed::checksum(
        "bad  CyberNote-macos-arm64.zip",
        "CyberNote-macos-arm64.zip"
    )
    .is_err());
}
#[test]
fn preferences_partial_false_zero_and_corruption() {
    let d = tempfile::tempdir().unwrap();
    let (mut f, p) = PreferenceFile::load(d.path()).unwrap();
    let n = p
        .patch(
            serde_json::from_value(
                serde_json::json!({"automaticChecks":false,"showBadge":false,"quietUntil":0}),
            )
            .unwrap(),
        )
        .unwrap();
    assert!(n.check_on_startup);
    assert_eq!(n.interval_minutes, 360);
    assert!(!n.automatic_checks);
    assert!(!n.show_badge);
    f.save(&n).unwrap();
    let (_, loaded) = PreferenceFile::load(d.path()).unwrap();
    assert!(!loaded.automatic_checks);
    assert!(loaded
        .patch(PreferencePatch {
            interval_minutes: Some(0),
            ..Default::default()
        })
        .is_err());
    fs::write(d.path().join("preferences.json"), b"{corrupt").unwrap();
    assert!(PreferenceFile::load(d.path()).is_err());
    assert!(f.save(&p).unwrap_err().contains("changed_externally"));
    assert_eq!(
        fs::read(d.path().join("preferences.json")).unwrap(),
        b"{corrupt"
    );
}
#[cfg(unix)]
#[test]
fn preferences_symlink_refused() {
    let d = tempfile::tempdir().unwrap();
    let victim = d.path().join("victim");
    fs::write(&victim, b"keep").unwrap();
    std::os::unix::fs::symlink(&victim, d.path().join("preferences.json")).unwrap();
    assert!(PreferenceFile::load(d.path()).is_err());
    assert_eq!(fs::read(victim).unwrap(), b"keep");
}
// Minimal regular-file ZIP with matching local/central names (stored method).
fn zip(name: &str, body: &[u8], mode: u32) -> Vec<u8> {
    let mut crc = !0u32;
    for &b in body {
        crc ^= b as u32;
        for _ in 0..8 {
            crc = (crc >> 1) ^ if crc & 1 != 0 { 0xedb88320 } else { 0 };
        }
    }
    crc = !crc;
    let mut b = vec![];
    let w16 = |b: &mut Vec<u8>, v: u16| b.extend(v.to_le_bytes());
    let w32 = |b: &mut Vec<u8>, v: u32| b.extend(v.to_le_bytes());
    b.extend(b"PK\x03\x04");
    for v in [20, 0, 0, 0, 0] {
        w16(&mut b, v);
    }
    w32(&mut b, crc);
    w32(&mut b, body.len() as u32);
    w32(&mut b, body.len() as u32);
    w16(&mut b, name.len() as u16);
    w16(&mut b, 0);
    b.extend(name.as_bytes());
    b.extend(body);
    let offset = b.len() as u32;
    b.extend(b"PK\x01\x02");
    for v in [0x314, 20, 0, 0, 0, 0] {
        w16(&mut b, v);
    }
    w32(&mut b, crc);
    w32(&mut b, body.len() as u32);
    w32(&mut b, body.len() as u32);
    w16(&mut b, name.len() as u16);
    for _ in 0..4 {
        w16(&mut b, 0);
    }
    w32(&mut b, mode << 16);
    w32(&mut b, 0);
    b.extend(name.as_bytes());
    let size = b.len() as u32 - offset;
    b.extend(b"PK\x05\x06");
    for v in [0, 0, 1, 1] {
        w16(&mut b, v);
    }
    w32(&mut b, size);
    w32(&mut b, offset);
    w16(&mut b, 0);
    b
}
#[test]
fn corrupt_and_unsafe_archives() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("package.zip");
    fs::write(
        &p,
        zip("CyberNote.app/Contents/Info.plist", b"fixture", 0o100644),
    )
    .unwrap();
    validate_zip(&p).unwrap();
    for name in [
        "../escape",
        "CyberNote.app/../../escape",
        "CyberNote.app/./x",
        "CyberNote.app/a\\b",
        "/CyberNote.app/x",
        "CyberNote.app/a//b",
    ] {
        fs::write(&p, zip(name, b"fixture", 0o100644)).unwrap();
        assert!(validate_zip(&p).is_err(), "{name}");
    }
    fs::write(
        &p,
        zip("CyberNote.app/link", b"link target", (0o12 << 12) | 0o777),
    )
    .unwrap();
    assert!(validate_zip(&p).is_err());
    let mut b = zip("CyberNote.app/file", b"x", 0o100644);
    b[30] = b'Z';
    fs::write(&p, b).unwrap();
    assert!(validate_zip(&p).is_err());
    fs::write(&p, b"truncated").unwrap();
    assert!(validate_zip(&p).is_err());
}
struct Fixture {
    url: String,
    shutdown: Arc<AtomicBool>,
    requests: Arc<AtomicUsize>,
    thread: Option<thread::JoinHandle<()>>,
}
impl Fixture {
    fn new(mode: &str) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let shutdown = Arc::new(AtomicBool::new(false));
        let stop = shutdown.clone();
        let requests = Arc::new(AtomicUsize::new(0));
        let count = requests.clone();
        let base = url.clone();
        let mode = mode.to_string();
        let handle = thread::spawn(move || {
            let mut package_requests = 0;
            while !stop.load(Ordering::SeqCst) {
                let (mut stream, _) = match listener.accept() {
                    Ok(s) => s,
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(3));
                        continue;
                    }
                    Err(_) => break,
                };
                // BSD accepted sockets can inherit the listener's nonblocking flag.
                // Keep the real HTTP fixture blocking while reading a complete header.
                stream.set_nonblocking(false).unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                let mut request = Vec::new();
                let mut buf = [0; 2048];
                while request.len() < 8192 && !request.windows(4).any(|w| w == b"\r\n\r\n") {
                    match stream.read(&mut buf) {
                        Ok(0) | Err(_) => break,
                        Ok(n) => request.extend_from_slice(&buf[..n]),
                    }
                }
                if request.is_empty() {
                    continue;
                }
                let req = String::from_utf8_lossy(&request);
                let route = req.split_whitespace().nth(1).unwrap_or("");
                count.fetch_add(1, Ordering::SeqCst);
                let payload = zip("CyberNote.app/Contents/Info.plist", b"fixture", 0o100644);
                let hash = format!("{:x}", Sha256::digest(&payload));
                let package = "CyberNote-macos-arm64.zip";
                let mut r = release(
                    if mode == "previews" {
                        "v0.1.0-preview.2"
                    } else {
                        "v0.2.0"
                    },
                    mode == "previews",
                );
                for a in &mut r.assets {
                    a.browser_download_url = format!("{base}/{}", a.name);
                    if a.name == package {
                        a.size = payload.len() as u64;
                    }
                }
                let (status, body) = if mode == "http_error" {
                    (503, b"unavailable".to_vec())
                } else if mode == "invalid_feed" {
                    (200, b"{broken".to_vec())
                } else if route.starts_with("/releases?") {
                    (200,serde_json::to_vec(&serde_json::json!([{"tag_name":r.tag_name,"prerelease":r.prerelease,"draft":false,"body":r.body,"assets":r.assets.iter().map(|a|serde_json::json!({"name":a.name,"size":a.size,"browser_download_url":a.browser_download_url})).collect::<Vec<_>>()}])).unwrap())
                } else if route.ends_with(".sha256") {
                    (
                        200,
                        format!(
                            "{}  {package}\n{}  CyberNote-macos-arm64-notices.zip\n",
                            if mode == "checksum_bad" {
                                "0".repeat(64)
                            } else {
                                hash.clone()
                            },
                            "a".repeat(64)
                        )
                        .into_bytes(),
                    )
                } else if route.ends_with(".json") {
                    (200,serde_json::to_vec(&serde_json::json!({"schema":1,"platform":if mode=="identity_bad" {"android"}else{"macos"},"architecture":"arm64","package":package,"packageSha256":if mode=="checksum_bad" {"0".repeat(64)}else{hash},"nativeBinarySha256":"b".repeat(64),"buildInfo":{"version":"0.2.0","mode":"production"}})).unwrap())
                } else if route.ends_with(".zip") {
                    package_requests += 1;
                    if mode == "download_error" || (mode == "retry_once" && package_requests == 1) {
                        (500, b"failed".to_vec())
                    } else if mode == "corrupt" {
                        (200, vec![0; payload.len()])
                    } else {
                        (200, payload)
                    }
                } else {
                    (404, vec![])
                };
                let _ = write!(
                    stream,
                    "HTTP/1.1 {status} fixture\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                for chunk in body.chunks(32) {
                    let _ = stream.write_all(chunk);
                    if mode == "slow" {
                        thread::sleep(Duration::from_millis(10));
                    }
                }
            }
        });
        Self {
            url,
            shutdown,
            requests,
            thread: Some(handle),
        }
    }
    fn updater(&self, dir: &Path) -> Arc<SoftwareUpdater> {
        SoftwareUpdater::create(
            dir.into(),
            Arc::new(DenyInstall),
            Network::local(format!("{}/releases", self.url)),
            mac(),
            "0.1.0".into(),
        )
        .unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.shutdown.store(true, Ordering::SeqCst);
        self.thread.take().unwrap().join().unwrap();
    }
}
#[tokio::test]
async fn actual_feed_download_progress_and_retry() {
    let fixture = Fixture::new("slow");
    let d = tempfile::tempdir().unwrap();
    let u = fixture.updater(d.path());
    assert_eq!(u.check().await.unwrap().phase, "available");
    let owner = u.clone();
    let task = tokio::spawn(async move { owner.download().await });
    let mut observed = false;
    while !task.is_finished() {
        let s = u.status();
        if s.phase == "downloading" && s.downloaded > 0 && s.downloaded < s.total {
            observed = true;
        }
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    assert_eq!(task.await.unwrap().unwrap().phase, "ready");
    assert!(observed);
    assert_eq!(u.check().await.unwrap().phase, "ready");
    assert!(fixture.requests.load(Ordering::SeqCst) >= 5);
    let verified = u.inner.lock().unwrap().verified.clone().unwrap();
    assert_eq!(hash_file(&verified.path).unwrap(), verified.hash);
}
#[tokio::test]
async fn no_stable_release_is_not_network_error_or_downgrade() {
    let d = tempfile::tempdir().unwrap();
    let fixture = Fixture::new("previews");
    let u = fixture.updater(d.path());
    assert_eq!(u.check().await.unwrap().phase, "no_release");
    assert!(u.status().error.is_none());
    u.configure(PreferencePatch {
        channel: Some(Channel::Preview),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(u.check().await.unwrap().phase, "up_to_date");
    assert!(u.status().release.is_none());
    let fixture = Fixture::new("http_error");
    let d = tempfile::tempdir().unwrap();
    let u = fixture.updater(d.path());
    assert!(u.check().await.unwrap_err().contains("http_503"));
    assert_eq!(u.status().phase, "error");
    assert_eq!(u.status().retry.as_deref(), Some("check"));
}
#[tokio::test]
async fn checksum_identity_corruption_and_download_failures_never_ready() {
    for mode in ["checksum_bad", "identity_bad", "download_error", "corrupt"] {
        let f = Fixture::new(mode);
        let d = tempfile::tempdir().unwrap();
        let u = f.updater(d.path());
        u.check().await.unwrap();
        assert!(u.download().await.is_err(), "{mode}");
        assert_eq!(u.status().phase, "error");
        assert!(u.inner.lock().unwrap().verified.is_none());
        assert!(!fs::read_dir(d.path()).unwrap().any(|p| p
            .unwrap()
            .path()
            .extension()
            .is_some_and(|e| e == "part")));
        assert!(u.download().await.is_err());
        assert_eq!(u.status().retry.as_deref(), Some("download"));
    }
}
#[tokio::test]
async fn scheduler_honors_explicit_disabled_preferences_and_drop() {
    let f = Fixture::new("previews");
    let d = tempfile::tempdir().unwrap();
    let u = f.updater(d.path());
    u.configure(PreferencePatch {
        check_on_startup: Some(false),
        automatic_checks: Some(false),
        ..Default::default()
    })
    .unwrap();
    let scheduler = UpdateScheduler::start(u.clone());
    tokio::time::sleep(Duration::from_millis(35)).await;
    assert_eq!(f.requests.load(Ordering::SeqCst), 0);
    drop(scheduler);
    assert_eq!(u.check().await.unwrap().phase, "no_release");
}
#[tokio::test]
async fn cancellation_cleans_partial_and_unlocks_operation() {
    let f = Fixture::new("slow");
    let d = tempfile::tempdir().unwrap();
    let u = f.updater(d.path());
    u.check().await.unwrap();
    let owner = u.clone();
    let task = tokio::spawn(async move { owner.download().await });
    loop {
        if u.status().downloaded > 0 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    assert_eq!(u.check().await.unwrap_err(), "update_busy");
    task.abort();
    let _ = task.await;
    assert_eq!(u.status().error.as_deref(), Some("operation_cancelled"));
    assert!(!fs::read_dir(d.path()).unwrap().any(|p| p
        .unwrap()
        .path()
        .extension()
        .is_some_and(|e| e == "part")));
    u.check().await.unwrap();
}

#[tokio::test]
async fn retry_download_reissues_real_request_and_succeeds() {
    let f = Fixture::new("retry_once");
    let d = tempfile::tempdir().unwrap();
    let u = f.updater(d.path());
    u.check().await.unwrap();
    assert!(u.download().await.unwrap_err().contains("http_500"));
    assert_eq!(u.status().retry.as_deref(), Some("download"));
    assert_eq!(u.download().await.unwrap().phase, "ready");
}
#[tokio::test]
async fn unreadable_feed_never_becomes_empty_or_current() {
    let f = Fixture::new("invalid_feed");
    let d = tempfile::tempdir().unwrap();
    let u = f.updater(d.path());
    assert!(u.check().await.unwrap_err().contains("invalid_feed"));
    assert_eq!(u.status().phase, "error");
    assert!(u.status().last_checked.is_none());
}
#[tokio::test]
async fn asset_urls_cannot_change_update_repository_or_origin() {
    let network = Network::production().unwrap();
    let mut a = asset("CyberNote-macos-arm64.zip", 100);
    assert!(network.asset_url(&a, "0.2.0").is_ok());
    for url in [
        "http://github.com/ywateru/CyberNote/releases/download/v0.2.0/CyberNote-macos-arm64.zip",
        "https://github.com/another/project/releases/download/v0.2.0/CyberNote-macos-arm64.zip",
        "https://github.com/ywateru/CyberNote/releases/download/v0.1.0/CyberNote-macos-arm64.zip",
        "https://evil.invalid/package.zip",
        "file:///etc/passwd",
    ] {
        a.browser_download_url = url.into();
        assert!(network.asset_url(&a, "0.2.0").is_err());
    }
}

#[tokio::test]
async fn frequency_change_and_shutdown_use_owned_scheduler_clock() {
    let f = Fixture::new("previews");
    let d = tempfile::tempdir().unwrap();
    let u = f.updater(d.path());
    u.configure(PreferencePatch {
        check_on_startup: Some(false),
        automatic_checks: Some(false),
        interval_minutes: Some(15),
        ..Default::default()
    })
    .unwrap();
    tokio::time::pause();
    let scheduler = UpdateScheduler::start(u.clone());
    tokio::task::yield_now().await;
    tokio::time::advance(Duration::from_secs(900)).await;
    assert_eq!(f.requests.load(Ordering::SeqCst), 0);
    u.configure(PreferencePatch {
        automatic_checks: Some(true),
        ..Default::default()
    })
    .unwrap();
    tokio::time::advance(Duration::from_secs(15)).await;
    tokio::time::resume();
    for _ in 0..200 {
        if u.status().last_checked.is_some() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    assert_eq!(u.status().phase, "no_release", "{:?}", u.status());
    let count = f.requests.load(Ordering::SeqCst);
    scheduler.shutdown().await;
    tokio::time::pause();
    tokio::time::advance(Duration::from_secs(900)).await;
    tokio::time::resume();
    assert_eq!(f.requests.load(Ordering::SeqCst), count);
}

#[test]
fn android_selection_requires_exact_unsigned_payload_and_receipt_identity() {
    let t = Target {
        platform: "android".into(),
        architecture: "arm64".into(),
    };
    let mut r = release("v0.2.0-preview.1", true);
    r.assets = vec![
        asset("CyberNote-android-arm64-unsigned.apk", 100),
        asset("CyberNote-android-arm64.json", 1024),
        asset("CyberNote-android-arm64.sha256", 205),
        asset("CyberNote-android-arm64-notices.zip", 500),
    ];
    let r = feed::select(vec![r], "0.1.0", Channel::Preview, &t)
        .unwrap()
        .unwrap();
    assert_eq!(r.package, "CyberNote-android-arm64-unsigned.apk");
    let hash = "a".repeat(64);
    let receipt = Receipt {
        schema: 1,
        platform: "android".into(),
        architecture: "arm64".into(),
        package: r.package.clone(),
        package_sha256: hash.clone(),
        native_binary_sha256: "b".repeat(64),
        release_version: None,
        build_info: serde_json::json!({"version":"0.2.0","mode":"production"}),
    };
    receipt.validate(&r, &hash).unwrap();
    for (field, value) in [
        ("architecture", "x86_64"),
        ("package", "CyberNote-android-arm64-notices.zip"),
        ("packageSha256", "bad"),
    ] {
        let mut v = serde_json::json!({"schema":1,"platform":"android","architecture":"arm64","package":r.package,"packageSha256":hash,"nativeBinarySha256":"b".repeat(64),"buildInfo":{"version":"0.2.0","mode":"production"}});
        v[field] = serde_json::Value::String(value.into());
        let receipt: Receipt = serde_json::from_value(v).unwrap();
        assert!(receipt.validate(&r, &hash).is_err());
    }
    assert_eq!(install::capability(&t).0, "download_only");
}

#[cfg(target_os = "macos")]
#[test]
fn unreadable_install_transaction_exits_restarting_ui_without_claiming_success() {
    let d = tempfile::tempdir().unwrap();
    let u = SoftwareUpdater::create(
        d.path().into(),
        Arc::new(DenyInstall),
        Network::production().unwrap(),
        mac(),
        "0.1.0".into(),
    )
    .unwrap();
    u.inner.lock().unwrap().status.phase = "restarting".into();
    fs::write(d.path().join("pending.json"), b"{corrupt").unwrap();
    let status = u.status();
    assert_eq!(status.phase, "error");
    assert!(status
        .error
        .unwrap()
        .contains("pending_install_requires_recovery"));
    assert!(status.retry.is_none());
    assert_eq!(
        fs::read(d.path().join("pending.json")).unwrap(),
        b"{corrupt"
    );
}

#[cfg(target_os = "macos")]
#[test]
fn asynchronous_exit_barrier_is_retained_until_helper_cancels() {
    struct Lease(Arc<AtomicBool>);
    impl InstallLease for Lease {
        fn exit(&mut self) -> Result<(), String> {
            Ok(())
        }
    }
    impl Drop for Lease {
        fn drop(&mut self) {
            self.0.store(true, Ordering::SeqCst);
        }
    }
    let d = tempfile::tempdir().unwrap();
    let base = fs::canonicalize(d.path()).unwrap();
    let u = SoftwareUpdater::create(
        base.clone(),
        Arc::new(DenyInstall),
        Network::production().unwrap(),
        mac(),
        "0.1.0".into(),
    )
    .unwrap();
    let work = base.join(format!(".CyberNote-update-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&work).unwrap();
    let p = serde_json::json!({"target":base.join("CyberNote.app"),"backup":base.join("old.app"),"executable":"fixture","native_hash":"a".repeat(64),"ack":work.join("ack"),"work":work});
    fs::write(base.join("pending.json"), serde_json::to_vec(&p).unwrap()).unwrap();
    let released = Arc::new(AtomicBool::new(false));
    *u.install_lease.lock().unwrap() = Some(HeldInstall {
        _lease: Box::new(Lease(released.clone())),
        transaction: install::pending_identity(&u.dir).unwrap(),
    });
    u.inner.lock().unwrap().status.phase = "restarting".into();
    fs::write(work.join("phase"), b"waiting_exit\n").unwrap();
    assert_eq!(u.status().phase, "restarting");
    assert!(!released.load(Ordering::SeqCst));
    fs::write(work.join("phase"), b"cancelled\n").unwrap();
    assert_eq!(u.status().phase, "error");
    assert!(released.load(Ordering::SeqCst));
    assert!(u.install_lease.lock().unwrap().is_none());
}

#[cfg(target_os = "macos")]
fn held_install_fixture() -> (
    tempfile::TempDir,
    Arc<SoftwareUpdater>,
    PathBuf,
    Arc<AtomicUsize>,
) {
    struct Lease(Arc<AtomicUsize>);
    impl InstallLease for Lease {
        fn exit(&mut self) -> Result<(), String> {
            Ok(())
        }
    }
    impl Drop for Lease {
        fn drop(&mut self) {
            self.0.fetch_add(1, Ordering::SeqCst);
        }
    }
    let tmp = tempfile::tempdir().unwrap();
    let base = fs::canonicalize(tmp.path()).unwrap();
    let updater = SoftwareUpdater::create(
        base.clone(),
        Arc::new(DenyInstall),
        Network::production().unwrap(),
        mac(),
        "0.1.0".into(),
    )
    .unwrap();
    let work = base.join(format!(".CyberNote-update-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&work).unwrap();
    let pending = serde_json::json!({"target":base.join("CyberNote.app"),"backup":base.join("old.app"),"executable":"fixture","native_hash":"a".repeat(64),"ack":work.join("ack"),"work":work});
    fs::write(
        base.join("pending.json"),
        serde_json::to_vec(&pending).unwrap(),
    )
    .unwrap();
    let drops = Arc::new(AtomicUsize::new(0));
    *updater.install_lease.lock().unwrap() = Some(HeldInstall {
        _lease: Box::new(Lease(drops.clone())),
        transaction: install::pending_identity(&base).unwrap(),
    });
    fs::write(work.join("phase"), "waiting_exit\n").unwrap();
    (tmp, updater, work, drops)
}
#[cfg(target_os = "macos")]
#[tokio::test]
async fn held_install_blocks_every_native_operation_despite_display_phase_and_releases_once() {
    let (_tmp, u, work, drops) = held_install_fixture();
    // The old negative changed the display phase to idle through configure.
    u.inner.lock().unwrap().status.phase = "idle".into();
    assert_eq!(
        u.configure(PreferencePatch {
            channel: Some(Channel::Preview),
            ..Default::default()
        })
        .unwrap_err(),
        "update_busy"
    );
    assert_eq!(u.check().await.unwrap_err(), "update_busy");
    assert_eq!(u.download().await.unwrap_err(), "update_busy");
    assert_eq!(u.install().await.unwrap_err(), "update_busy");
    assert_eq!(u.status().preferences.channel, Channel::Stable);
    assert_eq!(u.status().phase, "restarting");
    assert_eq!(drops.load(Ordering::SeqCst), 0);
    fs::write(work.join("phase"), "cancelled\n").unwrap();
    let mut readers = vec![];
    for _ in 0..8 {
        let u = u.clone();
        readers.push(thread::spawn(move || u.status()));
    }
    for reader in readers {
        let s = reader.join().unwrap();
        assert_eq!(s.phase, "error");
        assert_eq!(s.error.as_deref(), Some("installation_failed_or_cancelled"));
        assert!(s.install_report.unwrap().contains("取消"));
    }
    assert_eq!(drops.load(Ordering::SeqCst), 1);
    assert!(u.install_lease.lock().unwrap().is_none());
    assert_eq!(u.inner.lock().unwrap().status.phase, "error");
    u.configure(PreferencePatch {
        channel: Some(Channel::Preview),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(u.status().preferences.channel, Channel::Preview);
}
#[cfg(target_os = "macos")]
#[test]
fn mismatched_or_unreadable_transaction_never_releases_someone_elses_lease() {
    let (tmp, u, work, drops) = held_install_fixture();
    let pending = tmp.path().join("pending.json");
    let original = fs::read(&pending).unwrap();
    let mut changed: serde_json::Value = serde_json::from_slice(&original).unwrap();
    changed["native_hash"] = serde_json::json!("b".repeat(64));
    fs::write(&pending, serde_json::to_vec(&changed).unwrap()).unwrap();
    fs::write(work.join("phase"), "cancelled\n").unwrap();
    assert_eq!(u.status().phase, "error");
    assert_eq!(drops.load(Ordering::SeqCst), 0);
    assert_eq!(
        u.configure(PreferencePatch::default()).unwrap_err(),
        "update_busy"
    );
    fs::write(&pending, b"{corrupt").unwrap();
    assert!(u.status().error.unwrap().contains("recovery"));
    assert_eq!(drops.load(Ordering::SeqCst), 0);
    fs::write(pending, original).unwrap();
    assert_eq!(u.status().phase, "error");
    assert_eq!(drops.load(Ordering::SeqCst), 1);
}

#[test]
fn receipt_optional_full_release_identity_binds_both_locations_and_preserves_legacy() {
    let r = feed::select(
        vec![release("v0.2.0-preview.2", true)],
        "0.1.0",
        Channel::Preview,
        &mac(),
    )
    .unwrap()
    .unwrap();
    let hash = "a".repeat(64);
    let base = serde_json::json!({"schema":1,"platform":"macos","architecture":"arm64","package":r.package,"packageSha256":hash,"nativeBinarySha256":"b".repeat(64),"buildInfo":{"version":"0.2.0","mode":"production"}});
    serde_json::from_value::<Receipt>(base.clone())
        .unwrap()
        .validate(&r, &hash)
        .unwrap();
    for nested in [false, true] {
        for (value, valid) in [
            (serde_json::json!("0.2.0-preview.2"), true),
            (serde_json::json!("v0.2.0-preview.2"), true),
            (serde_json::json!("0.2.0-preview.1"), false),
            (serde_json::json!("0.2.0"), false),
            (serde_json::json!(""), false),
            (serde_json::Value::Null, false),
            (serde_json::json!(42), false),
        ] {
            let mut receipt = base.clone();
            if nested {
                receipt["buildInfo"]["releaseVersion"] = value;
            } else {
                receipt["releaseVersion"] = value;
            }
            let checked = serde_json::from_value::<Receipt>(receipt)
                .map_err(|_| "decode".to_string())
                .and_then(|receipt| receipt.validate(&r, &hash));
            assert_eq!(checked.is_ok(), valid);
        }
    }
    let mut inconsistent = base;
    inconsistent["releaseVersion"] = serde_json::json!("0.2.0-preview.2");
    inconsistent["buildInfo"]["releaseVersion"] = serde_json::json!("0.2.0-preview.1");
    assert!(serde_json::from_value::<Receipt>(inconsistent)
        .unwrap()
        .validate(&r, &hash)
        .is_err());
}

#[cfg(target_os = "macos")]
#[test]
fn uncertain_new_host_keeps_lease_and_explicit_recovery_report() {
    let (_tmp, u, work, drops) = held_install_fixture();
    fs::write(work.join("phase"), "recovery_required\n").unwrap();
    let status = u.status();
    assert_eq!(status.phase, "error");
    assert_eq!(
        status.error.as_deref(),
        Some("pending_install_requires_recovery")
    );
    assert!(status.retry.is_none());
    let report = status.install_report.unwrap();
    assert!(report.contains("未自动回滚或再次启动"));
    assert_eq!(drops.load(Ordering::SeqCst), 0);
    assert_eq!(
        u.configure(PreferencePatch::default()).unwrap_err(),
        "update_busy"
    );
}
