use super::{
    failure,
    files::{self, Directory},
    BackupConfig, BackupError, BackupIssue, BackupManifest, BackupReason, BackupVersion,
    ConfigPatch, Result,
};
use serde::{Deserialize, Serialize};
use std::{
    future::Future,
    path::PathBuf,
    pin::Pin,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

pub type PortFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T>> + Send + 'a>>;

/// Same wire contract as Session::Token. Conversion belongs to the host.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExpectedSession {
    pub session_id: String,
    pub epoch: u64,
    pub note_epoch: Option<u64>,
}
#[derive(Debug, Clone)]
pub enum BackupCaller {
    Window {
        label: String,
        expected: ExpectedSession,
    },
    /// This variant is never accepted from invoke arguments.
    Scheduler,
}
#[derive(Debug, Clone, Copy)]
pub enum BackupIntent {
    Read,
    Configure,
    Export,
    Preview,
    Restore,
    Automatic,
}

/// An authorization receipt, NOT an authority the module can renew itself.
#[derive(Debug, Clone)]
pub struct CheckedAuthority {
    pub library_id: String,
    pub session: ExpectedSession,
}
#[derive(Debug)]
pub struct ExportSnapshot {
    pub library_id: String,
    pub bytes: Vec<u8>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchivePreview {
    pub notes: usize,
    pub folders: usize,
    pub attachments: usize,
    /// Must describe existing importArchive's ID collision and settings behavior.
    pub summary: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePreview {
    pub version: BackupVersion,
    pub archive: ArchivePreview,
    pub confirmation: String,
    pub expires_at_ms: u64,
}
pub struct CheckedRestore {
    pub authority: CheckedAuthority,
    pub archive: Vec<u8>,
    pub preview: ArchivePreview,
}

/// Implement with the existing application Session and archive pipeline. All
/// methods must check the supplied authority again at the actual operation.
/// Never hold a Session lock while waiting for window acknowledgements.
pub trait BackupPorts: Send + Sync + 'static {
    /// Check Token, library, live app, and (for writes) every recording owner.
    /// Scheduler authorization must fail closed; never mint a new Token on error.
    fn authorize<'a>(
        &'a self,
        caller: &'a BackupCaller,
        intent: BackupIntent,
    ) -> PortFuture<'a, CheckedAuthority>;
    /// Flush editor saves using the host's existing quiet/save protocol; export
    /// through Session, excluding account files, grants and local credentials.
    fn export_checked<'a>(
        &'a self,
        authority: &'a CheckedAuthority,
    ) -> PortFuture<'a, ExportSnapshot>;
    /// Full existing archive validation, including attachment bytes, without any
    /// writes to the live library. Preview is not permission to bypass commit checks.
    fn preview_checked<'a>(
        &'a self,
        authority: &'a CheckedAuthority,
        archive: &'a [u8],
    ) -> PortFuture<'a, ArchivePreview>;
    /// Within ONE existing importArchive save barrier: validate authority/library,
    /// quiesce all windows, export current bytes, call protection.write(snapshot),
    /// then commit via Session (not Store). Abort if protection.write fails.
    /// Return the existing mutation delivery for the host frontend to hydrate.
    fn restore_checked<'a>(
        &'a self,
        request: CheckedRestore,
        protection: RecoveryWriter,
    ) -> PortFuture<'a, serde_json::Value>;
}

/// A one-shot protection sink, scoped to the configured directory and library.
/// Only the checked host restore port can supply the snapshot after its barrier.
pub struct RecoveryWriter {
    directory: Directory,
    library: String,
    app_version: String,
    now: u64,
    keep: u8,
    receipt: Arc<Mutex<Option<BackupVersion>>>,
}
impl RecoveryWriter {
    pub fn write(self, snapshot: ExportSnapshot) -> Result<BackupVersion> {
        if snapshot.library_id != self.library {
            return Err(failure("backup_stale", "资料库已变化，恢复已取消"));
        }
        let version = files::publish(
            &self.directory,
            &snapshot.bytes,
            &self.library,
            &self.app_version,
            self.now,
            BackupReason::BeforeRestore,
            self.keep,
        )?;
        *self
            .receipt
            .lock()
            .map_err(|_| failure("backup_internal", "保护备份状态不可读"))? = Some(version.clone());
        Ok(version)
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    pub recovery: BackupVersion,
    pub delivery: serde_json::Value,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupStatus {
    pub config: BackupConfig,
    pub directory: String,
    pub data_directory: String,
    pub library_id: String,
    pub versions: Vec<BackupVersion>,
    pub issues: Vec<BackupIssue>,
    pub automatic_suspended: bool,
    pub last_error: Option<BackupError>,
    pub next_due_at_ms: Option<u64>,
}

struct Prepared {
    caller: String,
    session_id: String,
    epoch: u64,
    library: String,
    directory: PathBuf,
    name: String,
    manifest: BackupManifest,
    confirmation: String,
    expires: u64,
    preview: ArchivePreview,
}
#[derive(Default)]
struct RuntimeState {
    suspended: bool,
    error: Option<BackupError>,
    prepared: Option<Prepared>,
}
pub struct BackupRuntime {
    config_root: PathBuf,
    default_directory: PathBuf,
    data_directory: PathBuf,
    app_version: String,
    ports: Arc<dyn BackupPorts>,
    state: Mutex<RuntimeState>,
    busy: AtomicBool,
}
struct Operation<'a>(&'a AtomicBool);
impl Drop for Operation<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
impl BackupRuntime {
    /// Paths must be absolute and contain no symlink components. On macOS use
    /// canonical host app-data paths (e.g. /private/var rather than /var).
    /// Construction does no export, scheduling or live-library access.
    pub fn new(
        config_root: PathBuf,
        default_directory: PathBuf,
        data_directory: PathBuf,
        app_version: String,
        ports: Arc<dyn BackupPorts>,
    ) -> Result<Self> {
        Directory::open(&config_root, true)?;
        if app_version.is_empty() || app_version.len() > 128 {
            return Err(failure("backup_config", "应用版本无效"));
        }
        Ok(Self {
            config_root,
            default_directory,
            data_directory,
            app_version,
            ports,
            state: Mutex::new(RuntimeState::default()),
            busy: AtomicBool::new(false),
        })
    }
    fn state(&self) -> Result<std::sync::MutexGuard<'_, RuntimeState>> {
        self.state
            .lock()
            .map_err(|_| failure("backup_internal", "本地备份状态不可读"))
    }
    fn begin(&self) -> Result<Operation<'_>> {
        self.busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| failure("backup_busy", "另一个备份操作正在进行中"))?;
        Ok(Operation(&self.busy))
    }
    fn config(&self) -> Result<BackupConfig> {
        files::load_config(&Directory::open(&self.config_root, false)?).map(|(config, _)| config)
    }
    fn directory(&self, config: &BackupConfig) -> Result<Directory> {
        Directory::open(&config.directory(&self.default_directory), true)
    }
    fn status_for(&self, authority: &CheckedAuthority, now: u64) -> Result<BackupStatus> {
        let config = self.config()?;
        let (versions, issues) = files::list(&self.directory(&config)?, &authority.library_id)?;
        let state = self.state()?;
        let last = versions
            .iter()
            .filter(|v| v.manifest.reason != BackupReason::BeforeRestore)
            .map(|v| v.manifest.created_at_ms)
            .max();
        let next = if config.hours == 0 || state.suspended {
            None
        } else {
            Some(last.map_or(now, |time| {
                time.saturating_add(config.hours as u64 * 3_600_000)
            }))
        };
        Ok(BackupStatus {
            directory: config
                .directory(&self.default_directory)
                .to_string_lossy()
                .into_owned(),
            data_directory: self.data_directory.to_string_lossy().into_owned(),
            config,
            library_id: authority.library_id.clone(),
            versions,
            issues,
            automatic_suspended: state.suspended,
            last_error: state.error.clone(),
            next_due_at_ms: next,
        })
    }
    pub async fn status(&self, caller: BackupCaller, now: u64) -> Result<BackupStatus> {
        let _operation = self.begin()?;
        let authority = self.ports.authorize(&caller, BackupIntent::Read).await?;
        self.status_for(&authority, now)
    }
    pub async fn configure(
        &self,
        caller: BackupCaller,
        patch: ConfigPatch,
        now: u64,
    ) -> Result<BackupStatus> {
        let _operation = self.begin()?;
        let authority = self
            .ports
            .authorize(&caller, BackupIntent::Configure)
            .await?;
        let explicit = patch.hours.is_some() || patch.keep.is_some() || patch.directory.is_some();
        files::configure(
            &Directory::open(&self.config_root, false)?,
            patch,
            &self.default_directory,
        )?;
        if explicit {
            let mut state = self.state()?;
            state.suspended = false;
            state.error = None;
            state.prepared = None;
        }
        self.status_for(&authority, now)
    }
    async fn create(
        &self,
        authority: &CheckedAuthority,
        reason: BackupReason,
        now: u64,
    ) -> Result<BackupVersion> {
        let config = self.config()?;
        // Pin the directory before handing work to another subsystem.
        let directory = self.directory(&config)?;
        let snapshot = self.ports.export_checked(authority).await?;
        if snapshot.library_id != authority.library_id {
            return Err(failure("backup_stale", "资料库已变化，未创建备份"));
        }
        files::publish(
            &directory,
            &snapshot.bytes,
            &snapshot.library_id,
            &self.app_version,
            now,
            reason,
            config.keep,
        )
    }
    pub async fn backup_now(&self, caller: BackupCaller, now: u64) -> Result<BackupVersion> {
        let _operation = self.begin()?;
        let authority = self.ports.authorize(&caller, BackupIntent::Export).await?;
        self.create(&authority, BackupReason::Manual, now).await
    }
    /// Called only by the app-owned native timer, never by a webview command.
    /// Any error latches scheduling off until an explicit authorized config action.
    pub async fn tick(&self, now: u64) -> Result<Option<BackupVersion>> {
        if self.busy.load(Ordering::Acquire) || self.state()?.suspended {
            return Ok(None);
        }
        let _operation = self.begin()?;
        let result = async {
            let config = self.config()?;
            if config.hours == 0 {
                return Ok(None);
            }
            let authority = self
                .ports
                .authorize(&BackupCaller::Scheduler, BackupIntent::Automatic)
                .await?;
            if self
                .status_for(&authority, now)?
                .next_due_at_ms
                .is_some_and(|due| due > now)
            {
                return Ok(None);
            }
            self.create(&authority, BackupReason::Automatic, now)
                .await
                .map(Some)
        }
        .await;
        if let Err(error) = &result {
            let mut state = self.state()?;
            state.suspended = true;
            state.error = Some(error.clone());
        }
        result
    }
    pub async fn prepare_restore(
        &self,
        caller: BackupCaller,
        name: String,
        now: u64,
    ) -> Result<RestorePreview> {
        let _operation = self.begin()?;
        self.state()?.prepared = None;
        let BackupCaller::Window { label, .. } = &caller else {
            return Err(failure("backup_denied", "恢复需要用户确认"));
        };
        let authority = self.ports.authorize(&caller, BackupIntent::Preview).await?;
        let config = self.config()?;
        let (version, bytes) = files::read_backup(&self.directory(&config)?, &name)?;
        if version.manifest.library_id != authority.library_id {
            return Err(failure("backup_identity", "此备份属于另一个资料库"));
        }
        let archive = self.ports.preview_checked(&authority, &bytes).await?;
        let confirmation = uuid::Uuid::new_v4().to_string();
        let expires = now.saturating_add(5 * 60_000);
        self.state()?.prepared = Some(Prepared {
            caller: label.clone(),
            session_id: authority.session.session_id,
            epoch: authority.session.epoch,
            library: authority.library_id,
            directory: config.directory(&self.default_directory),
            name,
            manifest: version.manifest.clone(),
            confirmation: confirmation.clone(),
            expires,
            preview: archive.clone(),
        });
        Ok(RestorePreview {
            version,
            archive,
            confirmation,
            expires_at_ms: expires,
        })
    }
    pub async fn restore(
        &self,
        caller: BackupCaller,
        confirmation: String,
        now: u64,
    ) -> Result<RestoreResult> {
        let _operation = self.begin()?;
        // Every attempted commit consumes its confirmation, even a denied one.
        let prepared = self
            .state()?
            .prepared
            .take()
            .ok_or_else(|| failure("backup_confirmation", "请重新预览并确认恢复"))?;
        let BackupCaller::Window { label, .. } = &caller else {
            return Err(failure("backup_denied", "恢复需要用户确认"));
        };
        let authority = self.ports.authorize(&caller, BackupIntent::Restore).await?;
        let config = self.config()?;
        if confirmation != prepared.confirmation
            || now >= prepared.expires
            || *label != prepared.caller
            || authority.library_id != prepared.library
            || authority.session.session_id != prepared.session_id
            || authority.session.epoch != prepared.epoch
            || config.directory(&self.default_directory) != prepared.directory
        {
            return Err(failure(
                "backup_stale",
                "恢复确认已过期或资料库状态已变化，请重新预览",
            ));
        }
        let directory = self.directory(&config)?;
        let (version, archive) = files::read_backup(&directory, &prepared.name)?;
        if version.manifest != prepared.manifest {
            return Err(failure("backup_stale", "备份文件已变化，请重新预览"));
        }
        let receipt = Arc::new(Mutex::new(None));
        let protection = RecoveryWriter {
            directory,
            library: prepared.library,
            app_version: self.app_version.clone(),
            now,
            keep: config.keep,
            receipt: receipt.clone(),
        };
        let delivery = self
            .ports
            .restore_checked(
                CheckedRestore {
                    authority,
                    archive,
                    preview: prepared.preview,
                },
                protection,
            )
            .await?;
        let recovery = receipt
            .lock()
            .map_err(|_| failure("backup_internal", "保护备份状态不可读"))?
            .clone()
            .ok_or_else(|| failure("backup_host_contract", "宿主未写入恢复保护备份"))?;
        Ok(RestoreResult { recovery, delivery })
    }
}
