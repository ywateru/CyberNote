use super::{
    feed::{Release, Target},
    service::Verified,
    storage,
};
use std::{
    future::Future,
    path::{Path, PathBuf},
    pin::Pin,
};

/// Native confirmation AND save/recording barrier belong to the existing host.
/// Returning a lease means saves are durably drained, recording has ended,
/// and new edits/recordings are blocked until the lease drops or process exits.
pub trait InstallGuard: Send + Sync {
    fn prepare_install<'a>(
        &'a self,
        release: &'a Release,
    ) -> Pin<Box<dyn Future<Output = Result<Box<dyn InstallLease>, String>> + Send + 'a>>;
}
pub trait InstallLease: Send {
    /// Request orderly host exit. On error, return with the barrier still held;
    /// dropping this lease must release it. Never claim success without exit.
    fn exit(&mut self) -> Result<(), String>;
}
pub struct DenyInstall;
impl InstallGuard for DenyInstall {
    fn prepare_install<'a>(
        &'a self,
        _: &'a Release,
    ) -> Pin<Box<dyn Future<Output = Result<Box<dyn InstallLease>, String>> + Send + 'a>> {
        Box::pin(async { Err("host_install_guard_unavailable".into()) })
    }
}
pub fn capability(t: &Target) -> (String, String) {
    if t.architecture != "arm64" {
        return ("unsupported".into(), "当前发布没有此架构的安装包".into());
    }
    match t.platform.as_str() {
        "macos"=>("replace_restart".into(),"ad-hoc 签名，未公证；校验并确认后替换，保留旧包，启动未确认时保留事务与备份，不自动回滚或重开；请先安全退出再恢复。保存或录音未结束时不能退出。".into()),
        "android"=>("download_only".into(),"应用可下载并校验更新包。如需安装，请从发布页下载签名 APK 并用系统安装器打开。覆盖安装需要签名一致。".into()),
        _=>("unsupported".into(),"当前发布不支持此平台".into()),
    }
}
pub(crate) struct Plan {
    pub release: Release,
    #[cfg(target_os = "macos")]
    mac: mac::MacPlan,
}
pub(crate) async fn stage(dir: &Path, v: Verified) -> Result<Plan, String> {
    #[cfg(target_os = "macos")]
    {
        let dir = dir.to_path_buf();
        tokio::task::spawn_blocking(move || mac::stage(&dir, v))
            .await
            .map_err(storage::err)?
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (dir, v);
        Err("automatic_install_unsupported".into())
    }
}
pub(crate) async fn launch(plan: Plan, lease: &mut dyn InstallLease) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        mac::launch(plan, lease)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (plan, lease);
        Err("automatic_install_unsupported".into())
    }
}
pub fn acknowledge(dir: &Path) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        mac::acknowledge(dir)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = dir;
        Ok(None)
    }
}
pub(crate) struct InstallReport {
    pub message: String,
    pub failed: bool,
    pub release_lease: bool,
    pub identity: String,
}
pub(crate) fn pending_identity(dir: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let bytes =
        storage::read(&dir.join("pending.json"))?.ok_or("pending_install_requires_recovery")?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}
pub(crate) fn report(dir: &Path) -> Result<Option<InstallReport>, String> {
    #[cfg(target_os = "macos")]
    {
        mac::report(dir)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = dir;
        Ok(None)
    }
}
/// The helper only runs after explicit install + native guard. Exported for the
/// isolated fixture harness, which substitutes temp paths and an inert opener.
pub const REPLACE_SCRIPT: &str = include_str!("replace.sh");

#[cfg(target_os = "macos")]
mod mac {
    use super::super::{
        archive::extract_verified, feed::IDENTITY, service::hash_file, version::Version,
    };
    use super::*;
    use serde::{Deserialize, Serialize};
    use std::{
        fs,
        process::{Command, Stdio},
        thread,
        time::{Duration, Instant},
    };
    #[derive(Serialize, Deserialize)]
    struct Pending {
        target: PathBuf,
        backup: PathBuf,
        executable: String,
        native_hash: String,
        ack: PathBuf,
        work: PathBuf,
    }
    pub(super) struct MacPlan {
        work: PathBuf,
        stage: PathBuf,
        target: PathBuf,
        backup: PathBuf,
        live_hash: String,
        executable: String,
        dir: PathBuf,
        handed_off: bool,
    }
    impl Drop for MacPlan {
        fn drop(&mut self) {
            if !self.handed_off {
                let _ = fs::remove_dir_all(&self.work);
                let _ = fs::remove_file(self.dir.join("pending.json"));
            }
        }
    }
    fn run(program: &str, args: &[&std::ffi::OsStr]) -> Result<String, String> {
        // Outputs go to a bounded private temp file, avoiding pipe deadlocks.
        let path =
            std::env::temp_dir().join(format!("cybernote-update-command-{}", uuid::Uuid::new_v4()));
        let file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(storage::err)?;
        let result = (|| {
            let mut child = Command::new(program)
                .args(args)
                .stdin(Stdio::null())
                .stdout(file.try_clone().map_err(storage::err)?)
                .stderr(file)
                .spawn()
                .map_err(storage::err)?;
            let start = Instant::now();
            loop {
                match child.try_wait().map_err(storage::err)? {
                    Some(s) => {
                        if !s.success() {
                            return Err(format!("package_validation_failed: {program}"));
                        }
                        break;
                    }
                    None if start.elapsed() > Duration::from_secs(90) => {
                        let _ = child.kill();
                        let _ = child.wait();
                        return Err("package_validation_timeout".into());
                    }
                    None => thread::sleep(Duration::from_millis(50)),
                }
            }
            let m = fs::metadata(&path).map_err(storage::err)?;
            if m.len() > 65536 {
                return Err("command_output_limit".into());
            }
            fs::read_to_string(&path)
                .map(|s| s.trim().to_string())
                .map_err(storage::err)
        })();
        let _ = fs::remove_file(path);
        result
    }
    fn field(app: &Path, key: &str) -> Result<String, String> {
        run(
            "/usr/libexec/PlistBuddy",
            [
                std::ffi::OsStr::new("-c"),
                std::ffi::OsStr::new(&format!("Print :{key}")),
                app.join("Contents/Info.plist").as_os_str(),
            ]
            .as_slice(),
        )
    }
    fn bundle() -> Result<PathBuf, String> {
        let exe = std::env::current_exe().map_err(storage::err)?;
        let app = exe
            .parent()
            .and_then(Path::parent)
            .and_then(Path::parent)
            .ok_or("not_an_app_bundle")?;
        if app.extension().is_none_or(|e| e != "app")
            || exe
                != app
                    .join("Contents/MacOS")
                    .join(exe.file_name().ok_or("invalid_executable")?)
            || fs::canonicalize(app).map_err(storage::err)? != app
            || app.to_string_lossy().contains(['\n', '\r'])
        {
            return Err("unsafe_app_location".into());
        }
        if app.starts_with("/Volumes") || app.to_string_lossy().contains("AppTranslocation") {
            return Err("move_app_to_writable_applications".into());
        }
        if field(app, "CFBundleIdentifier")? != IDENTITY {
            return Err("running_bundle_identity_mismatch".into());
        }
        Ok(app.to_path_buf())
    }
    fn walk(path: &Path) -> Result<(), String> {
        for entry in fs::read_dir(path).map_err(storage::err)? {
            let p = entry.map_err(storage::err)?.path();
            let m = fs::symlink_metadata(&p).map_err(storage::err)?;
            if m.file_type().is_symlink() || !(m.is_file() || m.is_dir()) {
                return Err("unsafe_extracted_package".into());
            }
            if m.is_dir() {
                walk(&p)?;
            }
        }
        Ok(())
    }
    fn validate_bundle(
        app: &Path,
        r: &Release,
        receipt: &super::super::feed::Receipt,
        expected_executable: Option<&str>,
    ) -> Result<(), String> {
        walk(app)?;
        let executable = field(app, "CFBundleExecutable")?;
        if executable.is_empty()
            || Path::new(&executable)
                .file_name()
                .is_none_or(|p| p != executable.as_str())
            || expected_executable.is_some_and(|e| e != executable)
            || field(app, "CFBundleIdentifier")? != IDENTITY
            || field(app, "CFBundleShortVersionString")?
                != Version::parse(&r.version)?.package_version()
        {
            return Err("bundle_identity_or_version_mismatch".into());
        }
        let native = app.join("Contents/MacOS").join(&executable);
        if run("/usr/bin/lipo", &["-archs".as_ref(), native.as_os_str()])? != "arm64"
            || hash_file(&native)? != receipt.native_binary_sha256
        {
            return Err("bundle_arch_or_native_hash_mismatch".into());
        }
        run(
            "/usr/bin/codesign",
            &[
                "--verify".as_ref(),
                "--deep".as_ref(),
                "--strict".as_ref(),
                app.as_os_str(),
            ],
        )?;
        Ok(())
    }
    pub(super) fn stage(dir: &Path, v: Verified) -> Result<Plan, String> {
        acknowledge(dir)?;
        if storage::read(&dir.join("pending.json"))?.is_some() {
            return Err("pending_install_requires_recovery".into());
        }
        if hash_file(&v.path)? != v.hash {
            return Err("checksum_mismatch".into());
        }
        v.receipt.validate(&v.release, &v.hash)?;
        let target = bundle()?;
        super::super::version::validate_install_version(
            &v.release.version,
            &field(&target, "CFBundleShortVersionString")?,
        )?;
        let executable = field(&target, "CFBundleExecutable")?;
        if executable.is_empty()
            || Path::new(&executable)
                .file_name()
                .is_none_or(|p| p != executable.as_str())
        {
            return Err("invalid_executable".into());
        }
        let parent = target.parent().ok_or("invalid_bundle_parent")?;
        let work = parent.join(format!(".CyberNote-update-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&work).map_err(|e| format!("app_location_not_writable: {e}"))?;
        storage::private_dir(&work)?;
        let stage = work.join("CyberNote.app");
        let backup = parent.join(format!(".CyberNote-rollback-{}.app", uuid::Uuid::new_v4()));
        let mut p = MacPlan {
            work,
            stage,
            target,
            backup,
            live_hash: String::new(),
            executable,
            dir: dir.to_path_buf(),
            handed_off: false,
        };
        extract_verified(&v.path, &v.hash, &p.work)?;
        walk(&p.work)?;
        validate_bundle(&p.stage, &v.release, &v.receipt, Some(&p.executable))?;
        // This checks integrity, never Developer ID/team equivalence/notarization.
        p.live_hash = hash_file(&p.target.join("Contents/MacOS").join(&p.executable))?;
        let pending = Pending {
            target: p.target.clone(),
            backup: p.backup.clone(),
            executable: p.executable.clone(),
            native_hash: v.receipt.native_binary_sha256,
            ack: p.work.join("ack"),
            work: p.work.clone(),
        };
        storage::atomic(
            &dir.join("pending.json"),
            &serde_json::to_vec(&pending).map_err(storage::err)?,
        )?;
        storage::atomic(&p.work.join("replace.sh"), REPLACE_SCRIPT.as_bytes())?;
        Ok(Plan {
            release: v.release,
            mac: p,
        })
    }
    pub(super) fn launch(mut plan: Plan, lease: &mut dyn InstallLease) -> Result<(), String> {
        let p = &mut plan.mac;
        let log = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(p.work.join("helper.log"))
            .map_err(storage::err)?;
        let mut child = Command::new("/bin/sh")
            .arg(p.work.join("replace.sh"))
            .arg(std::process::id().to_string())
            .arg(&p.stage)
            .arg(&p.target)
            .arg(&p.backup)
            .arg(&p.work)
            .arg(&p.executable)
            .arg(&p.live_hash)
            .arg("/usr/bin/open")
            .arg(hash_file(
                &p.stage.join("Contents/MacOS").join(&p.executable),
            )?)
            .stdin(Stdio::null())
            .stdout(log.try_clone().map_err(storage::err)?)
            .stderr(log)
            .spawn()
            .map_err(storage::err)?;
        p.handed_off = true;
        if let Err(e) = lease.exit() {
            let abort = storage::atomic(&p.work.join("abort"), b"abort");
            let _ = child.kill();
            let _ = child.wait();
            p.handed_off = false;
            abort?;
            return Err(e);
        }
        // Returning only means exit was requested; helper waits for PID death.
        Ok(())
    }
    pub(super) fn acknowledge(dir: &Path) -> Result<Option<String>, String> {
        let Some(bytes) = storage::read(&dir.join("pending.json"))? else {
            return Ok(None);
        };
        let p: Pending =
            serde_json::from_slice(&bytes).map_err(|e| format!("invalid_pending_install: {e}"))?;
        let current = bundle()?;
        if p.target != current
            || p.work.parent() != current.parent()
            || p.ack != p.work.join("ack")
            || !p
                .work
                .file_name()
                .is_some_and(|n| n.to_string_lossy().starts_with(".CyberNote-update-"))
            || fs::canonicalize(&p.work).map_err(storage::err)? != p.work
            || p.executable != field(&current, "CFBundleExecutable")?
        {
            return Err("pending_install_identity_mismatch".into());
        }
        let report = report(dir)?;
        let phase = storage::read(&p.work.join("phase"))?.unwrap_or_default();
        if phase == b"complete\n"
            && hash_file(&current.join("Contents/MacOS").join(&p.executable))? != p.native_hash
        {
            return Err("completed_install_identity_mismatch".into());
        }
        if phase == b"awaiting_ack\n"
            && hash_file(&current.join("Contents/MacOS").join(&p.executable))? == p.native_hash
        {
            storage::atomic(&p.ack, b"host_initialized")?;
            // Leave pending until helper records success; otherwise another startup
            // cannot detect a timeout/rollback. Receipt and backup remain evidence.
        } else if phase == b"complete\n"
            || phase == b"rolled_back\n"
            || phase == b"cancelled\n"
            || phase == b"unchanged\n"
        {
            fs::rename(
                dir.join("pending.json"),
                dir.join(format!("install-receipt-{}.json", uuid::Uuid::new_v4())),
            )
            .map_err(storage::err)?;
        } else {
            return Err("pending_install_requires_recovery".into());
        }
        Ok(report.map(|r| r.message))
    }
    pub(super) fn report(dir: &Path) -> Result<Option<InstallReport>, String> {
        let Some(bytes) = storage::read(&dir.join("pending.json"))? else {
            return Ok(None);
        };
        let p: Pending =
            serde_json::from_slice(&bytes).map_err(|e| format!("invalid_pending_install: {e}"))?;
        if p.work.parent() != p.target.parent()
            || p.ack != p.work.join("ack")
            || !p
                .work
                .file_name()
                .and_then(|n| n.to_str())
                .and_then(|n| n.strip_prefix(".CyberNote-update-"))
                .is_some_and(|id| uuid::Uuid::parse_str(id).is_ok())
            || fs::canonicalize(&p.work).map_err(storage::err)? != p.work
        {
            return Err("pending_install_identity_mismatch".into());
        }
        let phase = storage::read(&p.work.join("phase"))?.unwrap_or_default();
        let message = match phase.as_slice() {
            b"waiting_exit\n" => "正在等待原进程退出，尚未替换应用。".to_string(),
            b"replacing\n" => "正在替换应用，旧包已保留。".to_string(),
            b"awaiting_ack\n" => "已请求启动新版本，等待初始化回执；尚未确认安装成功。".to_string(),
            b"complete\n" => {
                "新版本已完成宿主初始化，辅助进程已收到回执；旧安装包已保留。".to_string()
            }
            b"rolled_back\n" => "新版本未能完成启动，已恢复旧版本。".to_string(),
            b"rollback_failed\n" => format!(
                "自动恢复失败，旧包仍保留在 {}，请手动恢复。",
                p.backup.display()
            ),
            b"recovery_required\n" => format!(
                "新版本尚未确认就绪，无法确认其进程已停止；未自动回滚或再次启动。新包及旧包备份 {} 已保留，请先安全退出应用再人工恢复。",
                p.backup.display()
            ),
            b"cancelled\n" => "退出被取消或超时，应用未替换。".to_string(),
            b"unchanged\n" => "安装条件发生变化，应用未替换。".to_string(),
            b"" => "安装事务已暂存，等待用户确认。".to_string(),
            _ => return Err("unknown_install_phase".into()),
        };
        let failed = matches!(
            phase.as_slice(),
            b"rolled_back\n"
                | b"rollback_failed\n"
                | b"recovery_required\n"
                | b"cancelled\n"
                | b"unchanged\n"
        );
        use sha2::{Digest, Sha256};
        let release_lease = matches!(
            phase.as_slice(),
            b"complete\n" | b"rolled_back\n" | b"cancelled\n" | b"unchanged\n"
        );
        Ok(Some(InstallReport {
            message,
            failed,
            release_lease,
            identity: format!("{:x}", Sha256::digest(&bytes)),
        }))
    }
    #[cfg(test)]
    mod tests {
        use super::*;
        #[test]
        fn transaction_report_preserves_unknown_or_corrupt_state() {
            let d = tempfile::tempdir().unwrap();
            let base = fs::canonicalize(d.path()).unwrap();
            let work = base.join(format!(".CyberNote-update-{}", uuid::Uuid::new_v4()));
            fs::create_dir(&work).unwrap();
            let p = Pending {
                target: fs::canonicalize(d.path()).unwrap().join("CyberNote.app"),
                backup: d.path().join("backup.app"),
                executable: "fixture".into(),
                native_hash: "a".repeat(64),
                ack: work.join("ack"),
                work: work.clone(),
            };
            fs::write(
                d.path().join("pending.json"),
                serde_json::to_vec(&p).unwrap(),
            )
            .unwrap();
            for (phase, failed) in [
                ("awaiting_ack\n", false),
                ("complete\n", false),
                ("rolled_back\n", true),
                ("rollback_failed\n", true),
                ("recovery_required\n", true),
                ("cancelled\n", true),
            ] {
                fs::write(work.join("phase"), phase).unwrap();
                assert_eq!(report(d.path()).unwrap().unwrap().failed, failed);
            }
            fs::write(work.join("phase"), "unknown").unwrap();
            assert!(report(d.path()).is_err());
            fs::write(d.path().join("pending.json"), b"{bad").unwrap();
            assert!(report(d.path()).is_err());
            assert_eq!(fs::read(d.path().join("pending.json")).unwrap(), b"{bad");
        }
        #[test]
        fn real_temporary_adhoc_bundle_identity_arch_version_and_corruption() {
            let d = tempfile::tempdir().unwrap();
            let app = d.path().join("CyberNote.app");
            fs::create_dir_all(app.join("Contents/MacOS")).unwrap();
            let source = d.path().join("fixture.c");
            fs::write(&source, b"int main(void) { return 0; }").unwrap();
            let native = app.join("Contents/MacOS/fixture");
            run(
                "/usr/bin/clang",
                &[
                    "-arch".as_ref(),
                    "arm64".as_ref(),
                    source.as_os_str(),
                    "-o".as_ref(),
                    native.as_os_str(),
                ],
            )
            .unwrap();
            let plist = |id: &str, version: &str| {
                format!("<?xml version=\"1.0\"?><plist version=\"1.0\"><dict><key>CFBundleIdentifier</key><string>{id}</string><key>CFBundleExecutable</key><string>fixture</string><key>CFBundleShortVersionString</key><string>{version}</string><key>CFBundleVersion</key><string>{version}</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>")
            };
            fs::write(app.join("Contents/Info.plist"), plist(IDENTITY, "0.2.0")).unwrap();
            run(
                "/usr/bin/codesign",
                &[
                    "--force".as_ref(),
                    "--sign".as_ref(),
                    "-".as_ref(),
                    app.as_os_str(),
                ],
            )
            .unwrap();
            let r = Release {
                version: "0.2.0-preview.1".into(),
                notes: String::new(),
                url: String::new(),
                package: "CyberNote-macos-arm64.zip".into(),
                size: 100,
                platform: "macos".into(),
                architecture: "arm64".into(),
                assets: vec![],
            };
            let receipt = super::super::super::feed::Receipt {
                schema: 1,
                platform: r.platform.clone(),
                architecture: r.architecture.clone(),
                package: r.package.clone(),
                package_sha256: "a".repeat(64),
                native_binary_sha256: hash_file(&native).unwrap(),
                release_version: None,
                build_info: serde_json::json!({"version":"0.2.0","mode":"production"}),
            };
            validate_bundle(&app, &r, &receipt, Some("fixture")).unwrap();
            fs::write(
                app.join("Contents/Info.plist"),
                plist("com.wrong.app", "0.2.0"),
            )
            .unwrap();
            assert!(validate_bundle(&app, &r, &receipt, None)
                .unwrap_err()
                .contains("identity"));
            fs::write(app.join("Contents/Info.plist"), plist(IDENTITY, "0.1.0")).unwrap();
            assert!(validate_bundle(&app, &r, &receipt, None)
                .unwrap_err()
                .contains("version"));
            fs::write(app.join("Contents/Info.plist"), plist(IDENTITY, "0.2.0")).unwrap();
            let mut wrong = receipt.clone();
            wrong.native_binary_sha256 = "0".repeat(64);
            assert!(validate_bundle(&app, &r, &wrong, None)
                .unwrap_err()
                .contains("native_hash"));
            fs::write(&native, b"corrupt executable").unwrap();
            assert!(validate_bundle(&app, &r, &receipt, None).is_err());
        }
    }
}
