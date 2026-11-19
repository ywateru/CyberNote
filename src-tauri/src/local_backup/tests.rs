use super::files::{self, Directory};
use super::*;
use serde_json::json;
use std::{
    fs,
    os::unix::fs::{symlink, PermissionsExt},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex,
    },
};

// Actual serialized archive shape and binary attachment bytes, not mock filenames.
fn fixture() -> Vec<u8> {
    serde_json::to_vec(&json!({
        "version": 1,
        "folders": [{"id":"default","name":"备忘录","kind":"normal","sortOrder":0}],
        "notes": [{"id":"note-a","folderId":"default","title":"真实正文", "plainText":"你好\nbackup", "document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"你好\nbackup"}]},{"type":"attachment","attrs":{"id":"file-a"}}]},"revision":1}],
        "attachments":[{"id":"file-a","noteId":"note-a","kind":"file","mime":"application/octet-stream","displayName":"原件.bin","relativePath":"blob-a","size":6}],
        "settings":{"theme":"dark","fontSize":18},"blobs":{"file-a":"AP8BAID+"}
    })).unwrap()
}
struct Fixture {
    _temp: tempfile::TempDir,
    root: PathBuf,
    backups: PathBuf,
    ports: Arc<Ports>,
}
impl Fixture {
    fn new() -> Self {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let backups = root.join("backups");
        Self {
            _temp: temp,
            root,
            backups,
            ports: Arc::new(Ports::default()),
        }
    }
    fn runtime(&self) -> BackupRuntime {
        BackupRuntime::new(
            self.root.join("config"),
            self.backups.clone(),
            self.root.join("live-library-display-only"),
            "0.1.0-test".into(),
            self.ports.clone(),
        )
        .unwrap()
    }
    fn directory(&self) -> Directory {
        Directory::open(&self.backups, true).unwrap()
    }
}
fn token() -> ExpectedSession {
    ExpectedSession {
        session_id: "session-a".into(),
        epoch: 3,
        note_epoch: None,
    }
}
fn caller() -> BackupCaller {
    BackupCaller::Window {
        label: "main".into(),
        expected: token(),
    }
}
fn authority() -> CheckedAuthority {
    CheckedAuthority {
        library_id: "library-a".into(),
        session: token(),
    }
}
#[derive(Default)]
struct Ports {
    denied: AtomicBool,
    recording: AtomicBool,
    exports: AtomicUsize,
    authorizations: AtomicUsize,
    imports: AtomicUsize,
    fail_preview: AtomicBool,
    fail_restore: AtomicBool,
    wrong_recovery_identity: AtomicBool,
    export_started: tokio::sync::Notify,
    export_continue: tokio::sync::Notify,
    delay_export: AtomicBool,
    imported: Mutex<Vec<u8>>,
    events: Mutex<Vec<&'static str>>,
}
impl BackupPorts for Ports {
    fn authorize<'a>(
        &'a self,
        caller: &'a BackupCaller,
        intent: BackupIntent,
    ) -> PortFuture<'a, CheckedAuthority> {
        Box::pin(async move {
            self.authorizations.fetch_add(1, Ordering::SeqCst);
            if self.denied.load(Ordering::SeqCst)
                || (self.recording.load(Ordering::SeqCst) && !matches!(intent, BackupIntent::Read))
            {
                return Err(failure("access_denied", "权限失效或正在录音"));
            }
            if let BackupCaller::Window { expected, .. } = caller {
                if expected.session_id != "session-a" || expected.epoch != 3 {
                    return Err(failure("access_stale", "Token 已过期"));
                }
            }
            Ok(authority())
        })
    }
    fn export_checked<'a>(&'a self, _: &'a CheckedAuthority) -> PortFuture<'a, ExportSnapshot> {
        Box::pin(async move {
            self.exports.fetch_add(1, Ordering::SeqCst);
            if self.delay_export.load(Ordering::SeqCst) {
                self.export_started.notify_one();
                self.export_continue.notified().await;
            }
            // A checked port must reject revocation after asynchronous saves.
            if self.denied.load(Ordering::SeqCst) {
                return Err(failure("access_stale", "Token 已过期"));
            }
            Ok(ExportSnapshot {
                library_id: "library-a".into(),
                bytes: fixture(),
            })
        })
    }
    fn preview_checked<'a>(
        &'a self,
        _: &'a CheckedAuthority,
        bytes: &'a [u8],
    ) -> PortFuture<'a, ArchivePreview> {
        Box::pin(async move {
            if self.fail_preview.load(Ordering::SeqCst) {
                return Err(failure("archive_invalid", "附件损坏"));
            }
            let archive: serde_json::Value = serde_json::from_slice(bytes)?;
            Ok(ArchivePreview {
                notes: archive["notes"].as_array().unwrap().len(),
                folders: 1,
                attachments: 1,
                summary: "保留本机内容，ID 冲突创建副本并更新设置".into(),
            })
        })
    }
    fn restore_checked<'a>(
        &'a self,
        request: CheckedRestore,
        protection: RecoveryWriter,
    ) -> PortFuture<'a, serde_json::Value> {
        Box::pin(async move {
            self.events.lock().unwrap().push("barrier-flushed");
            if self.fail_restore.load(Ordering::SeqCst) {
                return Err(failure("barrier_failed", "窗口保存失败"));
            }
            protection.write(ExportSnapshot {
                library_id: if self.wrong_recovery_identity.load(Ordering::SeqCst) {
                    "another-library"
                } else {
                    "library-a"
                }
                .into(),
                bytes: fixture(),
            })?;
            self.events.lock().unwrap().push("recovery-durable");
            self.imports.fetch_add(1, Ordering::SeqCst);
            *self.imported.lock().unwrap() = request.archive;
            self.events.lock().unwrap().push("session-import");
            Ok(json!({"value":{"fixture":"workspace"}}))
        })
    }
}

#[test]
fn config_defaults_partial_updates_modes_and_corruption_are_fail_closed() {
    let f = Fixture::new();
    let dir = Directory::open(&f.root.join("config"), true).unwrap();
    assert_eq!(files::load_config(&dir).unwrap().0, BackupConfig::default());
    files::configure(
        &dir,
        ConfigPatch {
            hours: Some(6),
            keep: Some(14),
            directory: Some(f.backups.to_str().unwrap().into()),
        },
        &f.backups,
    )
    .unwrap();
    let value = files::configure(
        &dir,
        ConfigPatch {
            hours: Some(0),
            ..Default::default()
        },
        &f.backups,
    )
    .unwrap();
    assert_eq!(
        (value.hours, value.keep, value.directory.as_str()),
        (0, 14, f.backups.to_str().unwrap())
    );
    let path = f.root.join("config/local-backup.json");
    assert_eq!(
        fs::metadata(&path).unwrap().permissions().mode() & 0o777,
        0o600
    );
    let old_inode = fs::metadata(&path).unwrap().ino();
    files::configure(&dir, ConfigPatch::default(), &f.backups).unwrap();
    assert_eq!(fs::metadata(&path).unwrap().ino(), old_inode);
    for bytes in [
        b"".as_slice(),
        b"{broken",
        b"{}",
        br#"{"version":1,"hours":2,"keep":7,"directory":""}"#,
        br#"{"version":1,"hours":0,"keep":0,"directory":""}"#,
    ] {
        fs::write(&path, bytes).unwrap();
        assert!(files::configure(
            &dir,
            ConfigPatch {
                hours: Some(1),
                ..Default::default()
            },
            &f.backups
        )
        .is_err());
        assert_eq!(fs::read(&path).unwrap(), bytes);
    }
}
use std::os::unix::fs::MetadataExt;
#[test]
fn writes_real_bytes_manifest_and_checksum_rejects_tamper() {
    let f = Fixture::new();
    let dir = f.directory();
    let v = files::publish(
        &dir,
        &fixture(),
        "library-a",
        "0.1.0",
        1234,
        BackupReason::Manual,
        7,
    )
    .unwrap();
    let (read, bytes) = files::read_backup(&dir, &v.name).unwrap();
    assert_eq!(bytes, fixture());
    assert_eq!(read.manifest.sha256, files::digest(&fixture()));
    assert_eq!(read.manifest.created_at_ms, 1234);
    assert_eq!(read.manifest.app_version, "0.1.0");
    assert_eq!(
        fs::metadata(f.backups.join(&v.name))
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o600
    );
    let path = f.backups.join(&v.name);
    let mut broken = fs::read(&path).unwrap();
    *broken.last_mut().unwrap() ^= 1;
    fs::write(&path, &broken).unwrap();
    assert_eq!(
        files::read_backup(&dir, &v.name).unwrap_err().code,
        "backup_corrupt"
    );
    let (versions, issues) = files::list(&dir, "library-a").unwrap();
    assert!(versions.is_empty());
    assert_eq!(issues.len(), 1);
    assert!(path.exists());
}
#[test]
fn retention_deletes_only_verified_owned_library_after_success_even_when_clock_rolls_back() {
    let f = Fixture::new();
    let dir = f.directory();
    let foreign = files::publish(
        &dir,
        &fixture(),
        "other-library",
        "0.1.0",
        100,
        BackupReason::Manual,
        3,
    )
    .unwrap();
    let corrupt = files::publish(
        &dir,
        &fixture(),
        "library-a",
        "0.1.0",
        100,
        BackupReason::Manual,
        3,
    )
    .unwrap();
    fs::write(f.backups.join(&corrupt.name), b"corrupt evidence").unwrap();
    fs::write(f.backups.join("personal.txt"), b"keep me").unwrap();
    for i in 0..8 {
        files::publish(
            &dir,
            &fixture(),
            "library-a",
            "0.1.0",
            1000 + i,
            BackupReason::Automatic,
            3,
        )
        .unwrap();
    }
    let before = files::list(&dir, "library-a").unwrap().0;
    assert_eq!(before.len(), 3);
    assert!(files::publish(
        &dir,
        b"",
        "library-a",
        "0.1.0",
        1009,
        BackupReason::Manual,
        3
    )
    .is_err());
    assert_eq!(files::list(&dir, "library-a").unwrap().0.len(), 3);
    let newest = files::publish(
        &dir,
        &fixture(),
        "library-a",
        "0.1.0",
        1,
        BackupReason::BeforeRestore,
        3,
    )
    .unwrap();
    let after = files::list(&dir, "library-a").unwrap().0;
    assert_eq!(after.len(), 3);
    assert!(after.iter().any(|v| v.name == newest.name));
    assert!(f.backups.join(foreign.name).exists());
    assert_eq!(
        fs::read(f.backups.join(corrupt.name)).unwrap(),
        b"corrupt evidence"
    );
    assert_eq!(
        fs::read(f.backups.join("personal.txt")).unwrap(),
        b"keep me"
    );
}
#[test]
fn paths_links_hardlinks_and_directory_swaps_cannot_escape() {
    let f = Fixture::new();
    let dir = f.directory();
    let v = files::publish(
        &dir,
        &fixture(),
        "library-a",
        "0.1.0",
        1,
        BackupReason::Manual,
        7,
    )
    .unwrap();
    assert!(files::read_backup(&dir, "../secret").is_err());
    assert!(Directory::open(&f.backups.join("../escape"), true).is_err());
    let outside = f.root.join("outside");
    fs::create_dir(&outside).unwrap();
    symlink(&outside, f.root.join("link")).unwrap();
    assert!(Directory::open(&f.root.join("link"), false).is_err());
    fs::hard_link(f.backups.join(&v.name), outside.join("hardlink")).unwrap();
    assert!(files::read_backup(&dir, &v.name).is_err());
    fs::remove_file(outside.join("hardlink")).unwrap();
    let moved = f.root.join("pinned");
    fs::rename(&f.backups, &moved).unwrap();
    symlink(&outside, &f.backups).unwrap();
    let new = files::publish(
        &dir,
        &fixture(),
        "library-a",
        "0.1.0",
        2,
        BackupReason::Manual,
        7,
    )
    .unwrap();
    assert!(moved.join(new.name).exists());
    assert!(!outside.join(&v.name).exists());
    let path = moved.join(&v.name);
    fs::remove_file(&path).unwrap();
    symlink(outside.join("hardlink"), &path).unwrap();
    assert!(files::read_backup(&dir, &v.name).is_err());
}
#[tokio::test]
async fn schedule_defaults_off_respects_interval_and_latches_denial_without_retry() {
    let f = Fixture::new();
    let runtime = f.runtime();
    assert!(runtime.tick(0).await.unwrap().is_none());
    assert_eq!(f.ports.authorizations.load(Ordering::SeqCst), 0);
    runtime
        .configure(
            caller(),
            ConfigPatch {
                hours: Some(1),
                ..Default::default()
            },
            0,
        )
        .await
        .unwrap();
    assert!(runtime.tick(1).await.unwrap().is_some());
    assert!(runtime.tick(3_600_000).await.unwrap().is_none());
    assert_eq!(f.ports.exports.load(Ordering::SeqCst), 1);
    f.ports.recording.store(true, Ordering::SeqCst);
    assert!(runtime.tick(3_600_001).await.is_err());
    let denied_count = f.ports.authorizations.load(Ordering::SeqCst);
    f.ports.recording.store(false, Ordering::SeqCst);
    assert!(runtime.tick(8_000_000).await.unwrap().is_none());
    assert_eq!(f.ports.authorizations.load(Ordering::SeqCst), denied_count);
    let status = runtime.status(caller(), 8_000_000).await.unwrap();
    assert!(status.automatic_suspended);
    runtime
        .configure(
            caller(),
            ConfigPatch {
                hours: Some(6),
                ..Default::default()
            },
            8_000_000,
        )
        .await
        .unwrap();
    assert!(
        !runtime
            .status(caller(), 8_000_000)
            .await
            .unwrap()
            .automatic_suspended
    );
    assert!(runtime.tick(8_000_000).await.unwrap().is_none());
}
#[tokio::test]
async fn corrupt_config_suspends_scheduler_and_stale_token_is_never_renewed() {
    let f = Fixture::new();
    let runtime = f.runtime();
    fs::write(f.root.join("config/local-backup.json"), b"broken").unwrap();
    assert!(runtime.tick(1).await.is_err());
    assert!(runtime.tick(2).await.unwrap().is_none());
    let mut invalid = token();
    invalid.epoch = 99;
    assert!(runtime
        .backup_now(
            BackupCaller::Window {
                label: "main".into(),
                expected: invalid
            },
            3
        )
        .await
        .is_err());
    assert_eq!(f.ports.exports.load(Ordering::SeqCst), 0);
}
#[tokio::test]
async fn restore_requires_preview_confirmation_and_durable_pre_restore_snapshot() {
    let f = Fixture::new();
    let runtime = f.runtime();
    let version = runtime.backup_now(caller(), 100).await.unwrap();
    assert!(runtime
        .restore(caller(), "unconfirmed".into(), 101)
        .await
        .is_err());
    let preview = runtime
        .prepare_restore(caller(), version.name, 101)
        .await
        .unwrap();
    assert_eq!(preview.archive.notes, 1);
    assert_eq!(f.ports.imports.load(Ordering::SeqCst), 0);
    let restored = runtime
        .restore(caller(), preview.confirmation.clone(), 102)
        .await
        .unwrap();
    assert_eq!(
        restored.recovery.manifest.reason,
        BackupReason::BeforeRestore
    );
    assert_eq!(*f.ports.imported.lock().unwrap(), fixture());
    assert_eq!(
        *f.ports.events.lock().unwrap(),
        ["barrier-flushed", "recovery-durable", "session-import"]
    );
    assert!(runtime
        .restore(caller(), preview.confirmation, 103)
        .await
        .is_err());
}
#[tokio::test]
async fn restore_rejects_expiry_different_window_checksum_and_barrier_failures_without_import() {
    let f = Fixture::new();
    let runtime = f.runtime();
    let v = runtime.backup_now(caller(), 100).await.unwrap();
    let p = runtime
        .prepare_restore(caller(), v.name.clone(), 101)
        .await
        .unwrap();
    assert!(runtime
        .restore(caller(), p.confirmation, p.expires_at_ms)
        .await
        .is_err());
    let p = runtime
        .prepare_restore(caller(), v.name.clone(), 102)
        .await
        .unwrap();
    let other = BackupCaller::Window {
        label: "note-window".into(),
        expected: token(),
    };
    assert!(runtime.restore(other, p.confirmation, 103).await.is_err());
    f.ports.fail_preview.store(true, Ordering::SeqCst);
    assert!(runtime
        .prepare_restore(caller(), v.name.clone(), 104)
        .await
        .is_err());
    f.ports.fail_preview.store(false, Ordering::SeqCst);
    let p = runtime
        .prepare_restore(caller(), v.name.clone(), 105)
        .await
        .unwrap();
    f.ports.fail_restore.store(true, Ordering::SeqCst);
    assert!(runtime
        .restore(caller(), p.confirmation, 106)
        .await
        .is_err());
    let p = runtime
        .prepare_restore(caller(), v.name.clone(), 107)
        .await
        .unwrap();
    fs::write(f.backups.join(v.name), b"broken after preview").unwrap();
    assert!(runtime
        .restore(caller(), p.confirmation, 108)
        .await
        .is_err());
    assert_eq!(f.ports.imports.load(Ordering::SeqCst), 0);
}
#[tokio::test]
async fn serialization_and_revocation_during_delayed_save_do_not_publish_a_backup() {
    let f = Fixture::new();
    let runtime = Arc::new(f.runtime());
    f.ports.delay_export.store(true, Ordering::SeqCst);
    let task = {
        let runtime = runtime.clone();
        tokio::spawn(async move { runtime.backup_now(caller(), 1).await })
    };
    f.ports.export_started.notified().await;
    assert_eq!(
        runtime.status(caller(), 2).await.unwrap_err().code,
        "backup_busy"
    );
    assert!(runtime.tick(3).await.unwrap().is_none());
    f.ports.denied.store(true, Ordering::SeqCst);
    f.ports.export_continue.notify_one();
    assert_eq!(task.await.unwrap().unwrap_err().code, "access_stale");
    assert!(files::list(&f.directory(), "library-a")
        .unwrap()
        .0
        .is_empty());
}
#[test]
fn encrypted_roundtrip_randomness_wrong_password_and_header_tamper_are_zero_write() {
    let f = Fixture::new();
    let one = seal_archive(&fixture(), "中文 passphrase").unwrap();
    let two = seal_archive(&fixture(), "中文 passphrase").unwrap();
    assert_ne!(one, two);
    assert_eq!(
        open_encrypted_archive(&one, "中文 passphrase").unwrap(),
        fixture()
    );
    assert_eq!(
        open_encrypted_archive(&one, "wrong").unwrap_err().code,
        "backup_password"
    );
    let mut tampered = one.clone();
    tampered[10] ^= 1;
    assert!(open_encrypted_archive(&tampered, "中文 passphrase").is_err());
    assert!(open_encrypted_archive(&one[..20], "中文 passphrase").is_err());
    assert!(seal_archive(b"", "x").is_err());
    assert!(seal_archive(&fixture(), "").is_err());
    assert_eq!(fs::read_dir(&f.root).unwrap().count(), 0);
}

#[test]
fn all_retention_choices_and_config_symlink_permissions_are_enforced() {
    for keep in [3, 7, 14, 30] {
        let f = Fixture::new();
        let dir = f.directory();
        for time in 0..u64::from(keep) + 2 {
            files::publish(
                &dir,
                &fixture(),
                "library-a",
                "0.1.0",
                time,
                BackupReason::Manual,
                keep,
            )
            .unwrap();
        }
        assert_eq!(
            files::list(&dir, "library-a").unwrap().0.len(),
            keep as usize
        );
    }
    let f = Fixture::new();
    let dir = Directory::open(&f.root.join("config"), true).unwrap();
    let config = f.root.join("config/local-backup.json");
    let outside = f.root.join("outside.json");
    fs::write(&outside, b"preserve me").unwrap();
    symlink(&outside, &config).unwrap();
    assert!(files::load_config(&dir).is_err());
    assert!(files::configure(
        &dir,
        ConfigPatch {
            hours: Some(1),
            ..Default::default()
        },
        &f.backups
    )
    .is_err());
    assert_eq!(fs::read(&outside).unwrap(), b"preserve me");
    fs::remove_file(&config).unwrap();
    fs::write(
        &config,
        serde_json::to_vec(&BackupConfig::default()).unwrap(),
    )
    .unwrap();
    fs::set_permissions(&config, fs::Permissions::from_mode(0o644)).unwrap();
    assert_eq!(
        files::load_config(&dir).unwrap_err().code,
        "backup_config_permissions"
    );
}
#[tokio::test]
async fn recovery_identity_failure_and_foreign_library_never_import_and_disabled_keeps_files() {
    let f = Fixture::new();
    let runtime = f.runtime();
    let v = runtime.backup_now(caller(), 1).await.unwrap();
    let p = runtime
        .prepare_restore(caller(), v.name.clone(), 2)
        .await
        .unwrap();
    f.ports
        .wrong_recovery_identity
        .store(true, Ordering::SeqCst);
    assert_eq!(
        runtime
            .restore(caller(), p.confirmation, 3)
            .await
            .unwrap_err()
            .code,
        "backup_stale"
    );
    assert_eq!(f.ports.imports.load(Ordering::SeqCst), 0);
    let other = files::publish(
        &f.directory(),
        &fixture(),
        "other-library",
        "0.1.0",
        4,
        BackupReason::Manual,
        3,
    )
    .unwrap();
    assert_eq!(
        runtime
            .prepare_restore(caller(), other.name, 5)
            .await
            .unwrap_err()
            .code,
        "backup_identity"
    );
    runtime
        .configure(
            caller(),
            ConfigPatch {
                hours: Some(0),
                ..Default::default()
            },
            6,
        )
        .await
        .unwrap();
    assert!(runtime.tick(7).await.unwrap().is_none());
    assert!(f.backups.join(v.name).exists());
}
