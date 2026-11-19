use super::install::{self, InstallGuard, InstallLease};
use super::{
    feed::{self, GithubRelease, Receipt, Release, Target},
    network::Network,
    storage::{self, Channel, PreferenceFile, PreferencePatch, Preferences},
    version::Version,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub current_version: String,
    pub preferences: Preferences,
    pub phase: String,
    pub release: Option<Release>,
    pub downloaded: u64,
    pub total: u64,
    pub last_checked: Option<u64>,
    pub error: Option<String>,
    pub retry: Option<String>,
    pub install_mode: String,
    pub install_reason: String,
    pub install_report: Option<String>,
}
struct Inner {
    status: Status,
    file: PreferenceFile,
    verified: Option<Verified>,
}
#[derive(Clone)]
pub(crate) struct Verified {
    pub path: PathBuf,
    pub hash: String,
    pub receipt: Receipt,
    pub release: Release,
}
pub struct SoftwareUpdater {
    inner: Mutex<Inner>,
    busy: AtomicBool,
    pub(crate) dir: PathBuf,
    target: Target,
    network: Network,
    pub(crate) guard: Arc<dyn InstallGuard>,
    // A successful exit request is asynchronous. Retain the host barrier until
    // actual process exit or the helper reports it cancelled/left unchanged.
    install_lease: Mutex<Option<Box<dyn InstallLease>>>,
}
struct Operation<'a> {
    owner: &'a SoftwareUpdater,
    done: bool,
}
impl Drop for Operation<'_> {
    fn drop(&mut self) {
        if !self.done {
            self.owner.fail("operation_cancelled".into(), None);
        }
        self.owner.busy.store(false, Ordering::Release);
    }
}
struct Partial(PathBuf);
impl Drop for Partial {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}
impl SoftwareUpdater {
    /// `directory` MUST be app_cache_dir()/software-update, never a note/store root.
    /// Construction only reads/writes this private directory, never an installed app.
    pub fn new(directory: PathBuf, guard: Arc<dyn InstallGuard>) -> Result<Arc<Self>, String> {
        Self::create(
            directory,
            guard,
            Network::production()?,
            Target::current(),
            env!("CARGO_PKG_VERSION").into(),
        )
    }
    fn create(
        directory: PathBuf,
        guard: Arc<dyn InstallGuard>,
        network: Network,
        target: Target,
        current: String,
    ) -> Result<Arc<Self>, String> {
        Version::parse(&current)?;
        let dir = storage::private_dir(&directory)?;
        let (file, preferences) = PreferenceFile::load(&dir)?;
        clean_downloads(&dir)?;
        let (install_mode, install_reason) = install::capability(&target);
        Ok(Arc::new(Self {
            dir,
            target,
            network,
            guard,
            install_lease: Mutex::new(None),
            busy: AtomicBool::new(false),
            inner: Mutex::new(Inner {
                file,
                verified: None,
                status: Status {
                    current_version: current,
                    preferences,
                    phase: "idle".into(),
                    release: None,
                    downloaded: 0,
                    total: 0,
                    last_checked: None,
                    error: None,
                    retry: None,
                    install_mode,
                    install_reason,
                    install_report: None,
                },
            }),
        }))
    }
    fn operation(&self) -> Result<Operation<'_>, String> {
        self.busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| "update_busy")?;
        Ok(Operation {
            owner: self,
            done: false,
        })
    }
    pub fn status(&self) -> Status {
        let mut status = self
            .inner
            .lock()
            .expect("update state poisoned")
            .status
            .clone();
        match install::report(&self.dir) {
            Ok(Some((report, failed))) => {
                status.install_report = Some(report);
                if failed && status.phase == "restarting" {
                    status.phase = "error".into();
                    status.error = Some("installation_failed_or_cancelled".into());
                    status.retry = Some("install".into());
                    let lease = self.install_lease.lock().unwrap().take();
                    drop(lease);
                }
            }
            Err(e) => {
                status.install_report = Some(format!("安装记录无法读取：{e}"));
                if status.phase == "restarting" {
                    status.phase = "error".into();
                    status.error = Some(format!("pending_install_requires_recovery: {e}"));
                    status.retry = None;
                }
            }
            Ok(None) => (),
        }
        status
    }
    pub fn configure(&self, patch: PreferencePatch) -> Result<Status, String> {
        let mut op = self.operation()?;
        let result = (|| {
            let mut inner = self.inner.lock().map_err(storage::err)?;
            let prefs = inner.status.preferences.patch(patch)?;
            inner.file.save(&prefs)?;
            if prefs.channel != inner.status.preferences.channel {
                clear_verified(&mut inner);
                inner.status.release = None;
                inner.status.phase = "idle".into();
                inner.status.downloaded = 0;
                inner.status.total = 0;
                inner.status.error = None;
                inner.status.retry = None;
            }
            inner.status.preferences = prefs;
            Ok(inner.status.clone())
        })();
        op.done = true;
        result
    }
    fn phase(&self, phase: &str) {
        let mut i = self.inner.lock().unwrap();
        i.status.phase = phase.into();
        i.status.error = None;
        i.status.retry = None;
    }
    fn fail(&self, error: String, retry: Option<&str>) {
        let mut i = self.inner.lock().unwrap();
        i.status.phase = "error".into();
        i.status.error = Some(error);
        i.status.retry = retry.map(str::to_string);
    }
    pub async fn check(&self) -> Result<Status, String> {
        let mut op = self.operation()?;
        self.phase("checking");
        let result = self.check_inner().await;
        if let Err(e) = &result {
            self.fail(e.clone(), Some("check"));
        }
        op.done = true;
        result.map(|_| self.status())
    }
    async fn check_inner(&self) -> Result<(), String> {
        let before = self.status();
        let mut all = Vec::new();
        let mut exhausted = false;
        for page in 1..=10 {
            let bytes = self
                .network
                .small(&self.network.page(page), 4 * 1024 * 1024)
                .await?;
            let batch: Vec<GithubRelease> =
                serde_json::from_slice(&bytes).map_err(|e| format!("invalid_feed: {e}"))?;
            let count = batch.len();
            all.extend(batch);
            if count < 100 {
                exhausted = true;
                break;
            }
        }
        if !exhausted {
            return Err("release_feed_limit".into());
        }
        let preview = before.preferences.channel == Channel::Preview;
        let has_channel = all.iter().any(|r| {
            !r.draft
                && Version::parse(&r.tag_name)
                    .is_ok_and(|v| preview || (!r.prerelease && !v.prerelease()))
        });
        let release = feed::select(all, &before.current_version, preview, &self.target)?;
        let mut i = self.inner.lock().unwrap();
        // Retain a completed download only when it still describes the selected asset.
        let same = i.verified.as_ref().is_some_and(|v| {
            release.as_ref().is_some_and(|r| {
                r.version == v.release.version
                    && r.package == v.release.package
                    && r.size == v.release.size
            })
        });
        if !same {
            clear_verified(&mut i);
            i.status.downloaded = 0;
            i.status.total = release.as_ref().map_or(0, |r| r.size);
        }
        i.status.phase = if same {
            "ready"
        } else if release.is_some() {
            "available"
        } else if !has_channel {
            "no_release"
        } else {
            "up_to_date"
        }
        .into();
        i.status.release = release;
        i.status.last_checked = Some(now());
        Ok(())
    }
    pub async fn download(&self) -> Result<Status, String> {
        let mut op = self.operation()?;
        self.phase("downloading");
        let result = self.download_inner().await;
        if let Err(e) = &result {
            self.fail(e.clone(), Some("download"));
        }
        op.done = true;
        result.map(|_| self.status())
    }
    async fn download_inner(&self) -> Result<(), String> {
        let release = self.status().release.ok_or("check_required")?;
        if Version::parse(&release.version)? <= Version::parse(&self.status().current_version)? {
            return Err("downgrade_refused".into());
        }
        let sums = feed::unique(&release.assets, &self.target.sums())?;
        let bytes = self
            .network
            .small(&self.network.asset_url(sums, &release.version)?, 64 * 1024)
            .await?;
        let hash = feed::checksum(
            std::str::from_utf8(&bytes).map_err(|_| "invalid_checksum")?,
            &release.package,
        )?;
        let a = feed::unique(&release.assets, &self.target.receipt())?;
        let bytes = self
            .network
            .small(&self.network.asset_url(a, &release.version)?, 1024 * 1024)
            .await?;
        let receipt: Receipt =
            serde_json::from_slice(&bytes).map_err(|e| format!("invalid_receipt: {e}"))?;
        receipt.validate(&release, &hash)?;
        let asset = feed::unique(&release.assets, &release.package)?;
        let mut response = self
            .network
            .get(&self.network.asset_url(asset, &release.version)?)
            .await?;
        if response.content_length().is_some_and(|n| n != release.size) {
            return Err("download_size_mismatch".into());
        }
        let path = self
            .dir
            .join(format!("package-{}.part", uuid::Uuid::new_v4()));
        let temp = Partial(path.clone());
        let mut options = OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&path).map_err(storage::err)?;
        let mut done = 0;
        let mut digest = Sha256::new();
        {
            let mut i = self.inner.lock().unwrap();
            i.status.downloaded = 0;
            i.status.total = release.size;
            clear_verified(&mut i);
        }
        while let Some(bytes) = response
            .chunk()
            .await
            .map_err(|e| format!("download_failed: {e}"))?
        {
            done += bytes.len() as u64;
            if done > release.size || done > feed::MAX_PACKAGE {
                return Err("download_size_mismatch".into());
            }
            file.write_all(&bytes).map_err(storage::err)?;
            digest.update(&bytes);
            self.inner.lock().unwrap().status.downloaded = done;
        }
        self.phase("verifying");
        file.sync_all().map_err(storage::err)?;
        drop(file);
        if done != release.size {
            return Err("download_size_mismatch".into());
        }
        if format!("{:x}", digest.finalize()) != hash {
            return Err("checksum_mismatch".into());
        }
        // Archive structural checks run for macOS before the file becomes ready.
        if release.platform == "macos" {
            super::archive::validate_zip(&path)?;
        } else {
            let mut h = [0; 4];
            fs::File::open(&path)
                .and_then(|mut f| f.read_exact(&mut h))
                .map_err(storage::err)?;
            if &h != b"PK\x03\x04" {
                return Err("invalid_apk".into());
            }
        }
        let final_path = self.dir.join(format!(
            "verified-{}-{}",
            uuid::Uuid::new_v4(),
            release.package
        ));
        fs::rename(&path, &final_path).map_err(storage::err)?;
        drop(temp);
        let mut i = self.inner.lock().unwrap();
        i.verified = Some(Verified {
            path: final_path,
            hash,
            receipt,
            release,
        });
        i.status.phase = "ready".into();
        Ok(())
    }
    pub async fn install(self: &Arc<Self>) -> Result<Status, String> {
        // Once manually requested, staging/confirmation is owned by the native
        // service, not the IPC awaiter/window. Dropping an invoke cannot release
        // the operation permit while a blocking validator still owns a stage.
        let owner = self.clone();
        tokio::spawn(async move { owner.install_owned().await })
            .await
            .map_err(storage::err)?
    }
    async fn install_owned(&self) -> Result<Status, String> {
        let mut op = self.operation()?;
        let verified = self.inner.lock().unwrap().verified.clone();
        self.phase("staging");
        let result = async {
            let verified = verified.ok_or("download_required")?;
            if self.target.platform != "macos" {
                return Err(self.status().install_reason);
            }
            let plan = install::stage(&self.dir, verified).await?;
            self.phase("awaiting_confirmation");
            // Guard MUST confirm natively and hold an edit/recording barrier until exit.
            let mut lease = self.guard.prepare_install(&plan.release).await?;
            self.phase("restarting");
            install::launch(plan, &mut *lease).await?;
            *self.install_lease.lock().unwrap() = Some(lease);
            Ok(())
        }
        .await;
        if let Err(e) = &result {
            self.fail(e.clone(), Some("install"));
        }
        op.done = true;
        result.map(|_| self.status())
    }
    /// Call only after host UI/store initialization succeeds. It never swaps bundles.
    pub fn acknowledge_launch(&self) -> Result<(), String> {
        if let Some(report) = install::acknowledge(&self.dir)? {
            self.inner.lock().unwrap().status.install_report = Some(report);
        }
        Ok(())
    }
}
fn clear_verified(inner: &mut Inner) {
    if let Some(v) = inner.verified.take() {
        let _ = fs::remove_file(v.path);
    }
}
fn clean_downloads(dir: &Path) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(storage::err)? {
        let entry = entry.map_err(storage::err)?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        let owned = name
            .strip_prefix("package-")
            .and_then(|s| s.strip_suffix(".part"))
            .is_some_and(|s| uuid::Uuid::parse_str(s).is_ok())
            || name.strip_prefix("verified-").is_some_and(|s| {
                s.get(..36)
                    .is_some_and(|id| uuid::Uuid::parse_str(id).is_ok())
                    && s.get(36..)
                        .is_some_and(|tail| tail.starts_with("-CyberNote-"))
            });
        if owned {
            let m = fs::symlink_metadata(entry.path()).map_err(storage::err)?;
            if !m.is_file() || m.file_type().is_symlink() {
                return Err("unsafe_download_cache".into());
            }
            fs::remove_file(entry.path()).map_err(storage::err)?;
        }
    }
    Ok(())
}
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
pub struct UpdateScheduler(Option<tokio::task::JoinHandle<()>>);
impl UpdateScheduler {
    /// Start exactly once, after app state is managed. Drop aborts and joins no UI work.
    pub fn start(updater: Arc<SoftwareUpdater>) -> Self {
        Self(Some(tokio::spawn(async move {
            let startup = updater.status().preferences.check_on_startup;
            if startup {
                let _ = updater.check().await;
            }
            let mut last = tokio::time::Instant::now();
            let mut tick = tokio::time::interval(Duration::from_secs(15));
            tick.tick().await;
            loop {
                tick.tick().await;
                let s = updater.status();
                let elapsed = last.elapsed().as_secs();
                if s.preferences.automatic_checks
                    && elapsed >= u64::from(s.preferences.interval_minutes) * 60
                {
                    if !matches!(
                        s.phase.as_str(),
                        "downloading"
                            | "verifying"
                            | "staging"
                            | "awaiting_confirmation"
                            | "restarting"
                            | "checking"
                    ) {
                        let _ = updater.check().await;
                        last = tokio::time::Instant::now();
                    }
                }
            }
        })))
    }
    pub async fn shutdown(mut self) {
        if let Some(task) = self.0.take() {
            task.abort();
            let _ = task.await;
        }
    }
}
impl Drop for UpdateScheduler {
    fn drop(&mut self) {
        if let Some(task) = &self.0 {
            task.abort();
        }
    }
}
pub(crate) fn hash_file(path: &Path) -> Result<String, String> {
    let m = fs::symlink_metadata(path).map_err(storage::err)?;
    if !m.is_file() || m.file_type().is_symlink() || m.len() > feed::MAX_PACKAGE {
        return Err("unsafe_package_file".into());
    }
    let mut f = fs::File::open(path).map_err(storage::err)?;
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let n = f.read(&mut buffer).map_err(storage::err)?;
        if n == 0 {
            break;
        }
        digest.update(&buffer[..n]);
    }
    Ok(format!("{:x}", digest.finalize()))
}
#[cfg(test)]
#[path = "tests.rs"]
mod tests;
