//! Production Store/Session adapter. Network calls only take short Session locks.
use super::{
    identity::{IdentityStore, SyncError},
    model::{EntityKind, WireVersion},
    network::{self, SyncBackend, SyncService},
};
use crate::{
    session::{
        synchronization::{AbortReason, Resolution, WindowReply},
        Session, Token,
    },
    store::{AppError, Result, Store},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Condvar, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
pub(crate) type SharedSession = Arc<(Mutex<Session>, Condvar)>;
fn prepared_store<T>(
    shared: &SharedSession,
    incoming: &[WireVersion],
    bootstrap: bool,
    operation: impl FnOnce(&mut Store) -> Result<T>,
) -> Result<T> {
    prepared_store_checked(shared, incoming, bootstrap, |_| Ok(()), operation)
}
fn prepared_store_checked<T>(
    shared: &SharedSession,
    incoming: &[WireVersion],
    bootstrap: bool,
    validate: impl Fn(&Session) -> Result<()>,
    operation: impl FnOnce(&mut Store) -> Result<T>,
) -> Result<T> {
    let (snapshot, authority) = {
        let s = shared.0.lock().map_err(|_| error("sync_internal"))?;
        validate(&s)?;
        (
            s.store.sync_media_snapshot(incoming, bootstrap)?,
            s.sync_media_token(),
        )
    };
    let media = snapshot.verify()?;
    let mut s = shared.0.lock().map_err(|_| error("sync_internal"))?;
    s.check(&authority, None)
        .map_err(|_| error("sync_plan_stale"))?;
    validate(&s)?;
    s.store.sync_with_media(media, operation)
}

pub(crate) trait WindowHost: Send + Sync + 'static {
    fn participants(&self) -> HashSet<String>;
    fn emit(&self, event: &str, payload: &Value) -> Result<()>;
}
fn error(code: &str) -> AppError {
    AppError {
        code: code.into(),
        message: match code {
            "sync_disabled" => "尚未开启设备同步",
            "sync_workspace_mismatch" => "本机已属于另一个同步空间",
            "sync_busy" => "设备同步操作正在进行",
            _ => "设备同步未完成，请检查连接后重试",
        }
        .into(),
        commit: None,
    }
}
fn network_error(e: SyncError) -> AppError {
    error(&format!(
        "sync_{}",
        serde_json::to_value(e)
            .ok()
            .and_then(|v| v.as_str().map(str::to_string))
            .unwrap_or_else(|| "error".into())
    ))
}
fn backend_error(e: AppError) -> SyncError {
    match e.code.as_str() {
        "sync_workspace_mismatch" => SyncError::WorkspaceMismatch,
        "sync_device_mismatch" => SyncError::Authentication,
        "sync_limit" => SyncError::Limit,
        "sync_plan_stale" => SyncError::PlanStale,
        "sync_invalid" | "sync_blob_corrupt" => SyncError::Protocol,
        _ => SyncError::Backend,
    }
}
pub(crate) struct StoreBackend {
    shared: SharedSession,
    device: String,
}
impl StoreBackend {
    fn with<T>(&self, f: impl FnOnce(&mut Session) -> Result<T>) -> super::identity::Result<T> {
        let mut s = self.shared.0.lock().map_err(|_| SyncError::Backend)?;
        f(&mut s).map_err(backend_error)
    }
}
impl SyncBackend for StoreBackend {
    fn device_id(&self) -> super::identity::Result<String> {
        self.with(|s| {
            if let Some(i) = s.store.sync_identity()? {
                if i.device_id != self.device {
                    return Err(error("sync_device_mismatch"));
                }
            }
            Ok(self.device.clone())
        })
    }
    fn workspace_id(&self) -> super::identity::Result<String> {
        self.with(|s| {
            s.store
                .sync_identity()?
                .map(|i| i.workspace_id)
                .ok_or_else(|| error("sync_disabled"))
        })
    }
    fn prepare_pairing(&self, workspace: &str) -> super::identity::Result<()> {
        self.with(|s| {
            if let Some(i) = s.store.sync_identity()? {
                if i.workspace_id != workspace {
                    return Err(error("sync_workspace_mismatch"));
                }
                if i.device_id != self.device {
                    return Err(error("sync_device_mismatch"));
                }
            }
            Ok(())
        })
    }
    fn adopt_workspace(&self, workspace: &str) -> super::identity::Result<()> {
        prepared_store(&self.shared, &[], true, |store| {
            store
                .sync_enable_with_device(Some(workspace), &self.device)
                .map(|_| ())
        })
        .map_err(backend_error)
    }
    fn flush(&self) -> super::identity::Result<()> {
        prepared_store(&self.shared, &[], false, |store| store.sync_flush()).map_err(backend_error)
    }
    fn inventory(
        &self,
        after: Option<&str>,
        limit: usize,
    ) -> super::identity::Result<network::InventoryPage> {
        self.with(|s| {
            if limit == 0 || limit > network::PAGE_SIZE {
                return Err(error("sync_invalid"));
            }
            let mut ids = s
                .store
                .sync_inventory()?
                .into_iter()
                .map(|v| v.digest)
                .filter(|id| after.is_none_or(|a| id.as_str() > a))
                .collect::<Vec<_>>();
            ids.sort();
            ids.dedup();
            let more = ids.len() > limit;
            ids.truncate(limit);
            let next = if more { ids.last().cloned() } else { None };
            Ok(network::InventoryPage { digests: ids, next })
        })
    }
    fn version(&self, digest: &str) -> super::identity::Result<Value> {
        self.with(|s| Ok(serde_json::to_value(s.store.sync_version(digest)?)?))
    }
    fn required_blobs(&self, version: &Value) -> super::identity::Result<Vec<network::BlobRef>> {
        let wire: WireVersion =
            serde_json::from_value(version.clone()).map_err(|_| SyncError::Protocol)?;
        let (references, storage) =
            prepared_store(&self.shared, std::slice::from_ref(&wire), false, |store| {
                store.sync_validate_receive(std::slice::from_ref(&wire))?;
                Ok((
                    store.sync_required_blobs(&wire)?,
                    store.sync_blob_storage()?,
                ))
            })
            .map_err(backend_error)?;
        // Actual cache/disk checks do not keep the Session locked. Receive and
        // immutable publication repeat their own checks after the socket wait.
        storage
            .validate_allocation(&references)
            .map_err(backend_error)?;
        Ok(references
            .into_iter()
            .map(|b| network::BlobRef {
                sha256: b.hash,
                size: b.size,
            })
            .collect())
    }
    fn has_blob(&self, b: &network::BlobRef) -> super::identity::Result<bool> {
        let storage = self.with(|s| s.store.sync_blob_storage())?;
        storage.contains(&b.sha256, b.size).map_err(backend_error)
    }
    fn read_blob_chunk(
        &self,
        b: &network::BlobRef,
        offset: u64,
        max: usize,
    ) -> super::identity::Result<Vec<u8>> {
        if offset > b.size || max > network::CHUNK {
            return Err(SyncError::Protocol);
        }
        let storage = self.with(|s| s.store.sync_blob_storage())?;
        let path = storage.sync_blob_path(&b.sha256).map_err(backend_error)?;
        let mut f = File::open(path).map_err(|_| SyncError::Io)?;
        if f.metadata().map_err(|_| SyncError::Io)?.len() != b.size {
            return Err(SyncError::Protocol);
        }
        f.seek(SeekFrom::Start(offset)).map_err(|_| SyncError::Io)?;
        let mut bytes = vec![0; (b.size - offset).min(max as u64) as usize];
        f.read_exact(&mut bytes).map_err(|_| SyncError::Io)?;
        Ok(bytes)
    }
    fn store_blob(&self, b: &network::BlobRef, source: &Path) -> super::identity::Result<()> {
        let storage = self.with(|s| s.store.sync_blob_storage())?;
        storage
            .publish_staged(&b.sha256, b.size, source)
            .map_err(backend_error)
    }
    fn receive_head(&self, v: Value) -> super::identity::Result<network::Receipt> {
        let wire: WireVersion = serde_json::from_value(v).map_err(|_| SyncError::Protocol)?;
        prepared_store(&self.shared, std::slice::from_ref(&wire), false, |store| {
            let r = store.sync_receive(vec![wire.clone()])?;
            Ok(network::Receipt {
                durable: r.durable,
                applied: false,
            })
        })
        .map_err(backend_error)
    }
}
#[derive(Clone, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub(crate) enum Command {
    Status {},
    #[serde(rename_all = "camelCase")]
    StartHost {
        device_name: String,
        port: u16,
    },
    CreateInvite {
        endpoint: String,
    },
    #[serde(rename_all = "camelCase")]
    Pair {
        invitation: String,
        device_name: String,
    },
    SyncNow {},
    Stop {},
    Resume {},
    Revoke {
        #[serde(rename = "peerId")]
        peer_id: String,
    },
    Conflicts {},
    #[serde(rename_all = "camelCase")]
    Resolve {
        kind: EntityKind,
        entity_id: String,
        digest: String,
        keep_all: bool,
    },
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Config {
    version: u8,
    device_name: String,
    paused: bool,
    host_port: Option<u16>,
}
struct Inner {
    config: Option<Config>,
    service: Option<SyncService>,
    identity: Option<Arc<IdentityStore>>,
    error: Option<String>,
}
pub(crate) struct Runtime {
    shared: SharedSession,
    root: PathBuf,
    host: Arc<dyn WindowHost>,
    inner: Mutex<Inner>,
    stopped: Arc<AtomicBool>,
    active: AtomicBool,
    worker: Mutex<Option<thread::JoinHandle<()>>>,
}
impl Runtime {
    pub(crate) fn new(
        shared: SharedSession,
        root: PathBuf,
        host: Arc<dyn WindowHost>,
    ) -> Result<Arc<Self>> {
        let path = root.join(".sync/runtime-v1.json");
        let config = match fs::read(&path) {
            Ok(bytes) => {
                if bytes.len() > 8192 {
                    return Err(error("sync_config_invalid"));
                }
                let c: Config = serde_json::from_slice(&bytes)?;
                if c.version != 1 {
                    return Err(error("sync_config_invalid"));
                }
                Self::name(&c.device_name)?;
                Some(c)
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(e) => return Err(e.into()),
        };
        let active = config.as_ref().is_some_and(|c| !c.paused);
        let stopped = Arc::new(AtomicBool::new(false));
        let runtime = Arc::new(Self {
            shared,
            root,
            host,
            inner: Mutex::new(Inner {
                config,
                service: None,
                identity: None,
                error: None,
            }),
            stopped: stopped.clone(),
            active: AtomicBool::new(active),
            worker: Mutex::new(None),
        });
        let weak = Arc::downgrade(&runtime);
        let worker = thread::Builder::new()
            .name("notes-sync-apply".into())
            .spawn(move || {
                while !stopped.load(Ordering::Acquire) {
                    if let Some(runtime) = weak.upgrade() {
                        runtime.coordinate();
                    } else {
                        break;
                    }
                    thread::sleep(Duration::from_millis(400));
                }
            })?;
        *runtime.worker.lock().map_err(|_| error("sync_internal"))? = Some(worker);
        // Restore only a persisted explicit opt-in. status alone never creates identity.
        {
            let mut inner = runtime.inner.lock().map_err(|_| error("sync_internal"))?;
            if inner.config.as_ref().is_some_and(|c| !c.paused) {
                if let Err(e) = runtime.activate(&mut inner) {
                    inner.error = Some(e.code);
                }
            }
        }
        Ok(runtime)
    }
    fn name(name: &str) -> Result<()> {
        if name.trim().is_empty()
            || name.chars().count() > 120
            || name.chars().any(char::is_control)
        {
            Err(error("sync_invalid_input"))
        } else {
            Ok(())
        }
    }
    fn persist(&self, c: &Config) -> Result<()> {
        let dir = self.root.join(".sync");
        fs::create_dir_all(&dir)?;
        let path = dir.join(format!("runtime-{}.tmp", uuid::Uuid::new_v4()));
        let mut options = OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut f = options.open(&path)?;
        f.write_all(&serde_json::to_vec(c)?)?;
        f.sync_all()?;
        fs::rename(&path, dir.join("runtime-v1.json"))?;
        #[cfg(unix)]
        File::open(dir)?.sync_all()?;
        Ok(())
    }
    fn service(&self, inner: &mut Inner) -> Result<()> {
        if inner.service.is_some() {
            return Ok(());
        }
        let store_identity = self
            .shared
            .0
            .lock()
            .map_err(|_| error("sync_internal"))?
            .store
            .sync_identity()?;
        let sync_dir = self.root.join(".sync");
        let existing = IdentityStore::existing_device_id(&sync_dir).map_err(network_error)?;
        let device = match (store_identity, existing) {
            (Some(i), Some(d)) if i.device_id != d => return Err(error("sync_device_mismatch")),
            (Some(i), _) => i.device_id,
            (None, Some(d)) => d,
            (None, None) => uuid::Uuid::new_v4().to_string(),
        };
        let identity = Arc::new(IdentityStore::open(&sync_dir, &device).map_err(network_error)?);
        let backend = Arc::new(StoreBackend {
            shared: self.shared.clone(),
            device,
        });
        let service = SyncService::new(backend, identity.clone(), sync_dir.join("network-staging"))
            .map_err(network_error)?;
        inner.identity = Some(identity);
        inner.service = Some(service);
        Ok(())
    }
    fn activate(&self, inner: &mut Inner) -> Result<()> {
        self.service(inner)?;
        let service = inner.service.as_ref().unwrap();
        for pending in service.pending_pairings().map_err(network_error)? {
            service
                .recover_pairing(&pending.peer_id)
                .map_err(network_error)?;
        }
        let status = service.status().map_err(network_error)?;
        if let Some(port) = inner.config.as_ref().and_then(|c| c.host_port) {
            if status.listening.is_none() {
                let address = service
                    .start_listener(([0, 0, 0, 0], port).into())
                    .map_err(network_error)?;
                if port == 0 {
                    let mut config = inner.config.clone().unwrap();
                    config.host_port = Some(address.port());
                    self.persist(&config)?;
                    inner.config = Some(config);
                }
            }
        }
        for id in inner
            .identity
            .as_ref()
            .unwrap()
            .peer_ids()
            .map_err(network_error)?
        {
            match service.connect(&id) {
                Ok(()) | Err(SyncError::Busy) => {}
                Err(e) => return Err(network_error(e)),
            }
        }
        Ok(())
    }
    /// Account runtime owns a separate Noise credential namespace and listener.
    /// This only enables the existing Store/Session apply coordinator. It never
    /// adopts an arbitrary renderer-supplied workspace or starts manual peers.
    pub(crate) fn account_identity(&self) -> Result<Arc<IdentityStore>> {
        let inner = self.inner.lock().map_err(|_| error("sync_internal"))?;
        if inner.config.is_some() {
            return Err(error("sync_workspace_mismatch"));
        }
        let device = self
            .shared
            .0
            .lock()
            .map_err(|_| error("sync_internal"))?
            .store
            .sync_identity()?
            .map(|i| i.device_id);
        let dir = self.root.join(".account/noise");
        let existing = IdentityStore::existing_device_id(&dir).map_err(network_error)?;
        let device = match (device, existing) {
            (Some(a), Some(b)) if a != b => return Err(error("sync_device_mismatch")),
            (Some(a), _) | (_, Some(a)) => a,
            _ => uuid::Uuid::new_v4().to_string(),
        };
        Ok(Arc::new(
            IdentityStore::open(&dir, &device).map_err(network_error)?,
        ))
    }
    pub(crate) fn check_account_workspace(
        &self,
        workspace: &str,
        previously_bound: bool,
    ) -> Result<()> {
        let inner = self.inner.lock().map_err(|_| error("sync_internal"))?;
        if inner.config.is_some() {
            return Err(error("sync_workspace_mismatch"));
        }
        let s = self.shared.0.lock().map_err(|_| error("sync_internal"))?;
        if let Some(identity) = s.store.sync_identity()? {
            if !previously_bound || identity.workspace_id != workspace {
                return Err(error("sync_workspace_mismatch"));
            }
        }
        Ok(())
    }
    pub(crate) fn activate_account(
        &self,
        verified: &crate::account::enrollment::VerifiedWorkspace,
        identity: Arc<IdentityStore>,
        policy: Arc<dyn network::ReplicationPolicy>,
    ) -> Result<SyncService> {
        let inner = self.inner.lock().map_err(|_| error("sync_internal"))?;
        if inner.config.is_some() {
            return Err(error("sync_workspace_mismatch"));
        }
        if !verified.matches(&identity) {
            return Err(error("sync_device_mismatch"));
        }
        let workspace = verified.workspace();
        let device = identity.device_id().map_err(network_error)?;
        prepared_store(&self.shared, &[], true, |store| {
            store
                .sync_enable_with_device(Some(workspace), &device)
                .map(|_| ())
        })?;
        let backend = Arc::new(StoreBackend {
            shared: self.shared.clone(),
            device,
        });
        let service = SyncService::with_policy(
            backend,
            identity,
            self.root.join(".account/staging"),
            Some(policy),
        )
        .map_err(network_error)?;
        self.active.store(true, Ordering::Release);
        Ok(service)
    }
    pub(crate) fn pause_account(&self) {
        // Account setup/cancellation can run before the legacy-workspace check.
        // Never pause the apply coordinator owned by an existing manual config.
        let Ok(inner) = self.inner.lock() else { return };
        if inner.config.is_some() {
            return;
        }
        self.active.store(false, Ordering::Release);
        if let Ok(mut s) = self.shared.0.lock() {
            s.sync_abort();
        }
    }
    pub(crate) fn account_metrics(&self) -> Result<(u64, u64)> {
        let s = self.shared.0.lock().map_err(|_| error("sync_internal"))?;
        // A fresh local library has no sync schema until explicit activation.
        // Reading signed-out account status must neither require nor create it.
        if s.store.sync_identity()?.is_none() {
            return Ok((0, 0));
        }
        Ok((
            s.store.sync_pending_count()? as u64,
            s.store.sync_conflict_count()? as u64,
        ))
    }
    pub(crate) fn command(
        &self,
        command: Command,
        window: &str,
        expected: &Token,
    ) -> Result<Value> {
        let is_status = matches!(command, Command::Status {});
        if self.root.join(".account/binding.json").exists()
            && matches!(
                command,
                Command::StartHost { .. }
                    | Command::Pair { .. }
                    | Command::Resume {}
                    | Command::CreateInvite { .. }
            )
        {
            return Err(error("sync_workspace_mismatch"));
        }
        let live = self.host.participants();
        self.shared
            .0
            .lock()
            .map_err(|_| error("sync_internal"))?
            .sync_check_window(window, &live, expected)?;
        let mut inner = self.inner.lock().map_err(|_| error("sync_internal"))?;
        let mut invitation = None;
        let mut conflicts = None;
        let result: Result<()> = (|| {
            match command {
                Command::Status {} => {}
                Command::StartHost { device_name, port } => {
                    Self::name(&device_name)?;
                    self.service(&mut inner)?;
                    let device = inner
                        .identity
                        .as_ref()
                        .unwrap()
                        .device_id()
                        .map_err(network_error)?;
                    prepared_store_checked(
                        &self.shared,
                        &[],
                        true,
                        |s| s.sync_check_window(window, &self.host.participants(), expected),
                        |store| store.sync_enable_with_device(None, &device),
                    )?;
                    let c = Config {
                        version: 1,
                        device_name,
                        paused: false,
                        host_port: Some(port),
                    };
                    self.persist(&c)?;
                    inner.config = Some(c);
                    self.active.store(true, Ordering::Release);
                    self.activate(&mut inner)?;
                }
                Command::Pair {
                    invitation: token,
                    device_name,
                } => {
                    Self::name(&device_name)?;
                    self.service(&mut inner)?;
                    let c = Config {
                        version: 1,
                        device_name,
                        paused: false,
                        host_port: inner.config.as_ref().and_then(|c| c.host_port),
                    };
                    self.persist(&c)?;
                    inner.config = Some(c);
                    self.active.store(true, Ordering::Release);
                    inner
                        .service
                        .as_ref()
                        .unwrap()
                        .pair(&token)
                        .map_err(network_error)?;
                }
                Command::CreateInvite { endpoint } => {
                    invitation = Some(
                        inner
                            .service
                            .as_ref()
                            .ok_or_else(|| error("sync_disabled"))?
                            .invitation(&endpoint)
                            .map_err(network_error)?,
                    );
                }
                Command::SyncNow {} => {
                    inner
                        .service
                        .as_ref()
                        .ok_or_else(|| error("sync_disabled"))?
                        .sync_now()
                        .map_err(network_error)?;
                }
                Command::Stop {} => {
                    let mut c = inner.config.clone().ok_or_else(|| error("sync_disabled"))?;
                    c.paused = true;
                    self.persist(&c)?;
                    inner.config = Some(c);
                    self.active.store(false, Ordering::Release);
                    if let Some(mut s) = inner.service.take() {
                        s.shutdown().map_err(network_error)?;
                    }
                    self.shared
                        .0
                        .lock()
                        .map_err(|_| error("sync_internal"))?
                        .sync_abort();
                }
                Command::Resume {} => {
                    let mut c = inner.config.clone().ok_or_else(|| error("sync_disabled"))?;
                    c.paused = false;
                    self.persist(&c)?;
                    inner.config = Some(c);
                    self.active.store(true, Ordering::Release);
                    self.activate(&mut inner)?;
                }
                Command::Revoke { peer_id } => {
                    inner
                        .service
                        .as_ref()
                        .ok_or_else(|| error("sync_disabled"))?
                        .revoke(&peer_id)
                        .map_err(network_error)?;
                }
                Command::Conflicts {} => {
                    conflicts = Some(self.conflicts(window, expected)?);
                }
                Command::Resolve {
                    kind,
                    entity_id,
                    digest,
                    keep_all,
                } => {
                    let (event, store_instance) = {
                        let mut s = self.shared.0.lock().map_err(|_| error("sync_internal"))?;
                        let live = self.host.participants();
                        s.sync_check_window(window, &live, expected)?;
                        let store_instance = s.store.sync_store_instance();
                        let event = s.sync_begin(
                            live,
                            Some(Resolution {
                                kind,
                                entity_id,
                                digest,
                                keep_all,
                            }),
                        )?;
                        (event, store_instance)
                    };
                    let operation = event["operationId"]
                        .as_str()
                        .ok_or_else(|| error("sync_internal"))?
                        .to_string();
                    if let Err(e) = self.host.emit("notes-sync", &event) {
                        self.shared
                            .0
                            .lock()
                            .map_err(|_| error("sync_internal"))?
                            .sync_abort_reason(AbortReason::EmitError);
                        return Err(e);
                    }
                    let deadline = Instant::now() + Duration::from_secs(11);
                    loop {
                        let s = self.shared.0.lock().map_err(|_| error("sync_internal"))?;
                        if s.sync_session_id() != expected.session_id
                            || s.store.sync_store_instance() != store_instance
                        {
                            return Err(error("access_changed"));
                        }
                        match s.sync_terminal_outcome(&operation) {
                            Some("commit") => {
                                s.sync_check_committed_resolution(
                                    &operation,
                                    &expected.session_id,
                                    window,
                                    &self.host.participants(),
                                )?;
                                conflicts = Some(Self::conflict_rows(&s.store)?);
                                break;
                            }
                            Some(_) => return Err(error("sync_deferred")),
                            None if Instant::now() < deadline => {
                                drop(s);
                                thread::sleep(Duration::from_millis(25))
                            }
                            None => {
                                drop(s);
                                self.shared
                                    .0
                                    .lock()
                                    .map_err(|_| error("sync_internal"))?
                                    .sync_abort();
                                return Err(error("sync_deferred"));
                            }
                        }
                    }
                }
            }
            Ok(())
        })();
        match result {
            Ok(()) => {
                if !is_status {
                    inner.error = None;
                }
            }
            Err(e) => {
                inner.error = Some(e.code.clone());
                return Err(e);
            }
        }
        let status = self.status(&inner)?;
        Ok(omit_absent(
            json!({"status":status,"invitation":invitation,"conflicts":conflicts}),
        ))
    }
    fn conflicts(&self, window: &str, expected: &Token) -> Result<Value> {
        if self
            .shared
            .0
            .lock()
            .map_err(|_| error("sync_internal"))?
            .store
            .sync_identity()?
            .is_some()
        {
            prepared_store_checked(
                &self.shared,
                &[],
                false,
                |s| s.sync_check_window(window, &self.host.participants(), expected),
                |store| store.sync_flush(),
            )?;
        }
        let s = self.shared.0.lock().map_err(|_| error("sync_internal"))?;
        if s.store.sync_identity()?.is_none() {
            return Ok(json!([]));
        }
        s.sync_check_window(window, &self.host.participants(), expected)?;
        Self::conflict_rows(&s.store)
    }
    fn conflict_rows(store: &Store) -> Result<Value> {
        let mut result = vec![];
        for c in store.sync_conflicts()? {
            let mut variants = vec![];
            for v in c.versions {
                let wire = store.sync_version(&v.digest)?;
                let note = wire.payload.as_ref().and_then(|p| p.get("note"));
                variants.push(json!({"digest":v.digest,"title":v.title.unwrap_or_else(||"已永久删除".into()),"updatedAt":v.updated_at,"deleted":note.is_some_and(|n|!n["deletedAt"].is_null()),"purged":v.tombstone,"locked":v.locked,"attachmentCount":wire.payload.as_ref().and_then(|p|p["attachments"].as_array()).map_or(0,Vec::len)}));
            }
            result.push(json!({"kind":c.kind,"entityId":c.entity_id,"variants":variants}));
        }
        Ok(json!(result))
    }
    fn status(&self, inner: &Inner) -> Result<Value> {
        let s = self.shared.0.lock().map_err(|_| error("sync_internal"))?;
        let identity = s.store.sync_identity()?;
        let (pending, conflicts) = if identity.is_some() {
            (
                s.store.sync_pending_count()?,
                s.store.sync_conflict_count()?,
            )
        } else {
            (0, 0)
        };
        drop(s);
        let service = inner
            .service
            .as_ref()
            .map(|s| s.status().map_err(network_error))
            .transpose()?;
        let connections = service
            .as_ref()
            .map(|s| s.connections.as_slice())
            .unwrap_or(&[]);
        let mut peers = vec![];
        if let Some(id) = &inner.identity {
            let mut devices = id
                .paired_devices()
                .map_err(network_error)?
                .into_iter()
                .filter(|p| !p.revoked)
                .map(|p| (p.invitation_id.clone(), p))
                .collect::<std::collections::BTreeMap<_, _>>();
            for peer_id in id.peer_ids().map_err(network_error)? {
                let peer = id.credential(&peer_id).map_err(network_error)?;
                if peer.phase != super::identity::PairingPhase::Ready {
                    continue;
                }
                devices.insert(
                    peer_id.clone(),
                    super::identity::PairedDevice {
                        invitation_id: peer_id,
                        device_id: peer.device_id,
                        revoked: false,
                    },
                );
            }
            for p in devices.into_values() {
                let connection = connections.iter().find(|c| c.peer_id == p.invitation_id);
                let endpoint = id.peer(&p.invitation_id).ok().map(|p| p.endpoint);
                peers.push(json!({"id":p.invitation_id,"name":p.device_id,"endpoint":endpoint,"connected":connection.is_some_and(|c|c.phase=="idle"||c.phase=="transferring"),"lastSyncAt":connection.and_then(|c|c.last_success)}));
            }
        }
        let last = connections.iter().filter_map(|c| c.last_success).max();
        let err = inner
            .error
            .clone()
            .or_else(|| {
                connections
                    .iter()
                    .find_map(|c| c.error.map(|_| "sync_connection_error".to_string()))
            })
            .or_else(|| {
                (identity.is_none() && inner.config.as_ref().is_some_and(|c| !c.paused))
                    .then(|| "sync_pairing_incomplete".to_string())
            });
        let state = if inner.config.is_none() {
            "disabled"
        } else if inner.config.as_ref().unwrap().paused {
            "paused"
        } else if err.is_some() {
            "error"
        } else if connections.iter().any(|c| c.phase == "transferring") {
            "syncing"
        } else if connections.iter().any(|c| c.phase == "connecting") {
            "connecting"
        } else if service.as_ref().is_some_and(|s| s.listening.is_some()) && last.is_none() {
            "listening"
        } else {
            "idle"
        };
        Ok(
            json!({"state":state,"deviceName":inner.config.as_ref().map(|c|c.device_name.as_str()).unwrap_or(""),"workspaceId":identity.as_ref().map(|i|&i.workspace_id),"deviceId":identity.as_ref().map(|i|&i.device_id),"listenAddress":service.and_then(|s|s.listening).map(|a|format!("ws://{a}")),"peers":peers,"lastSyncAt":last,"pendingCount":pending,"conflictCount":conflicts,"error":err}),
        )
    }
    pub(crate) fn reply(
        &self,
        window: &str,
        reply: WindowReply,
        expected: &Token,
    ) -> Result<Value> {
        let mut s = self.shared.0.lock().map_err(|_| error("sync_internal"))?;
        let live = self.host.participants();
        s.sync_check_window(window, &live, expected)?;
        s.sync_reply(window, reply, expected)
    }
    pub(crate) fn diagnostics(&self, window: &str, expected: &Token) -> Result<Value> {
        let s = self.shared.0.lock().map_err(|_| error("sync_internal"))?;
        s.sync_check_window(window, &self.host.participants(), expected)?;
        Ok(s.sync_diagnostics())
    }
    fn coordinate(&self) {
        // No runtime lock is required while waiting for renderers. A network
        // pair command can remain in flight while stdin/IPC processes replies.
        let preparation = (|| -> Result<_> {
            let s = self.shared.0.lock().map_err(|_| error("sync_internal"))?;
            if s.store.sync_identity()?.is_some()
                && (s.sync_has_operation()
                    || (self.active.load(Ordering::Acquire) && s.store.sync_pending_count()? > 0))
            {
                Ok(Some((
                    s.store
                        .sync_media_snapshot(&[], false)?
                        .reserve_keep_all(s.sync_media_keep_all()),
                    s.sync_media_token(),
                )))
            } else {
                Ok(None)
            }
        })()
        .and_then(|value| {
            value
                .map(|(snapshot, id)| snapshot.verify().map(|media| (media, id)))
                .transpose()
        });
        let result = (|| -> Result<_> {
            let mut s = self.shared.0.lock().map_err(|_| error("sync_internal"))?;
            let live = self.host.participants();
            let installed = match preparation {
                Ok(Some((media, authority))) if s.check(&authority, None).is_ok() => {
                    match s.store.sync_begin_media(media) {
                        Ok(()) => true,
                        Err(_) => {
                            s.sync_abort_reason(AbortReason::MediaInstallError);
                            false
                        }
                    }
                }
                Err(_) => {
                    s.sync_abort_reason(AbortReason::MediaPrepareError);
                    false
                }
                Ok(Some(_)) => {
                    s.sync_abort_reason(AbortReason::MediaAuthorityChanged);
                    false
                }
                Ok(None) => false,
            };
            let outcome = (|| -> Result<_> {
                let tick = s.sync_tick(&live);
                if tick.is_err() {
                    s.sync_abort_reason(AbortReason::EvaluationError);
                }
                let mut events = vec![];
                match tick {
                    Ok(Some((event, access))) => {
                        if let Some(metadata) = s.take_metadata_event() {
                            events.push(("notes-metadata", metadata));
                        }
                        if let Some(access) = access {
                            events.push(("notes-access", access));
                        }
                        events.push(("notes-sync", event));
                    }
                    Err(_) => {
                        if let Some((event, access)) = s.sync_tick(&live)? {
                            if let Some(metadata) = s.take_metadata_event() {
                                events.push(("notes-metadata", metadata));
                            }
                            if let Some(access) = access {
                                events.push(("notes-access", access));
                            }
                            events.push(("notes-sync", event));
                        }
                    }
                    _ => {}
                }
                if events.is_empty()
                    && installed
                    && self.active.load(Ordering::Acquire)
                    && !live.is_empty()
                    && s.store.sync_identity()?.is_some()
                    && s.store.sync_pending_count()? > 0
                {
                    if let Ok(event) = s.sync_begin(live, None) {
                        events.push(("notes-sync", event));
                    }
                }
                Ok(events)
            })();
            if installed {
                s.store.sync_end_media();
            }
            outcome
        })();
        if let Ok(events) = result {
            for (name, event) in events {
                if self.host.emit(name, &event).is_err() {
                    if let Ok(mut s) = self.shared.0.lock() {
                        s.sync_abort_reason(AbortReason::EmitError);
                    }
                }
            }
        }
    }
    pub(crate) fn foreground(&self) {
        if !self.active.load(Ordering::Acquire) {
            return;
        }
        // Account mode shares the apply coordinator, but its Runtime alone
        // owns its policy-gated service. Never construct the manual service
        // here (including after an account logout with a retained binding).
        if self.root.join(".account/binding.json").exists() {
            return;
        }
        if let Ok(mut inner) = self.inner.lock() {
            if let Err(e) = self.activate(&mut inner) {
                inner.error = Some(e.code);
            }
            if let Some(service) = &inner.service {
                let _ = service.sync_now();
            }
        }
    }
    pub(crate) fn shutdown(&self) -> Result<()> {
        self.stopped.store(true, Ordering::Release);
        if let Some(worker) = self
            .worker
            .lock()
            .map_err(|_| error("sync_internal"))?
            .take()
        {
            if worker.thread().id() != thread::current().id() {
                worker.join().map_err(|_| error("sync_internal"))?;
            }
        }
        let mut inner = self.inner.lock().map_err(|_| error("sync_internal"))?;
        if let Some(mut s) = inner.service.take() {
            s.shutdown().map_err(network_error)?;
        }
        Ok(())
    }
}
impl Drop for Runtime {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
}

fn omit_absent(mut value: Value) -> Value {
    match &mut value {
        Value::Object(map) => {
            map.retain(|_, v| !v.is_null());
            for v in map.values_mut() {
                *v = omit_absent(v.take());
            }
        }
        Value::Array(a) => {
            for v in a {
                *v = omit_absent(v.take());
            }
        }
        _ => (),
    }
    value
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Store;
    struct Windows;
    impl WindowHost for Windows {
        fn participants(&self) -> HashSet<String> {
            HashSet::from(["main".into()])
        }
        fn emit(&self, _: &str, _: &Value) -> Result<()> {
            Ok(())
        }
    }
    fn shared(root: &Path) -> SharedSession {
        Arc::new((
            Mutex::new(Session::new(Store::open(root).unwrap())),
            Condvar::new(),
        ))
    }
    fn token(s: &SharedSession) -> Token {
        serde_json::from_value(json!({"sessionId":s.0.lock().unwrap().sync_session_id(),"epoch":1}))
            .unwrap()
    }
    #[test]
    fn rejected_account_setup_does_not_pause_existing_manual_sync() {
        let d = tempfile::tempdir().unwrap();
        let shared = shared(d.path());
        let runtime = Runtime::new(shared.clone(), d.path().into(), Arc::new(Windows)).unwrap();
        runtime
            .command(
                Command::StartHost {
                    device_name: "Synthetic manual".into(),
                    port: 0,
                },
                "main",
                &token(&shared),
            )
            .unwrap();
        let identity = shared
            .0
            .lock()
            .unwrap()
            .store
            .sync_identity()
            .unwrap()
            .unwrap();
        let config = fs::read(d.path().join(".sync/runtime-v1.json")).unwrap();
        assert!(runtime
            .check_account_workspace(&uuid::Uuid::new_v4().to_string(), false)
            .is_err());
        runtime.pause_account();
        assert!(runtime.active.load(Ordering::Acquire));
        let inner = runtime.inner.lock().unwrap();
        assert!(!inner.config.as_ref().unwrap().paused);
        assert!(inner
            .service
            .as_ref()
            .unwrap()
            .status()
            .unwrap()
            .listening
            .is_some());
        drop(inner);
        assert_eq!(
            fs::read(d.path().join(".sync/runtime-v1.json")).unwrap(),
            config
        );
        assert_eq!(
            shared
                .0
                .lock()
                .unwrap()
                .store
                .sync_identity()
                .unwrap()
                .unwrap()
                .workspace_id,
            identity.workspace_id
        );
        runtime.shutdown().unwrap();
    }
    #[test]
    fn trusted_diagnostics_read_requires_window_token_and_has_no_opt_in_or_mutation() {
        let d = tempfile::tempdir().unwrap();
        let shared = shared(d.path());
        let runtime =
            Runtime::new(shared.clone(), d.path().to_path_buf(), Arc::new(Windows)).unwrap();
        let expected = token(&shared);
        let before = shared.0.lock().unwrap().workspace().unwrap();
        let first = runtime.diagnostics("main", &expected).unwrap();
        assert_eq!(first["version"], 2);
        assert_eq!(first["commits"], 0);
        assert_eq!(first["aborts"], 0);
        assert_eq!(first, runtime.diagnostics("main", &expected).unwrap());
        assert!(!d.path().join(".sync").exists());
        assert!(runtime.diagnostics("foreign-window", &expected).is_err());
        let mut stale = expected.clone();
        stale.epoch += 1;
        assert!(runtime.diagnostics("main", &stale).is_err());
        let mut foreign = expected.clone();
        foreign.session_id = "foreign".into();
        assert!(runtime.diagnostics("main", &foreign).is_err());
        assert_eq!(shared.0.lock().unwrap().workspace().unwrap(), before);
        assert_eq!(first, runtime.diagnostics("main", &expected).unwrap());
        assert!(runtime.inner.lock().unwrap().identity.is_none());
        assert!(runtime.inner.lock().unwrap().service.is_none());
        runtime.shutdown().unwrap();
    }
    #[test]
    fn identity_read_only_selector_and_disabled_status_have_no_filesystem_opt_in() {
        let d = tempfile::tempdir().unwrap();
        let sync = d.path().join(".sync");
        assert_eq!(IdentityStore::existing_device_id(&sync).unwrap(), None);
        assert!(!sync.exists());
        let s = shared(d.path());
        let r = Runtime::new(s.clone(), d.path().into(), Arc::new(Windows)).unwrap();
        let status = r.command(Command::Status {}, "main", &token(&s)).unwrap();
        assert_eq!(status["status"]["state"], "disabled");
        assert!(status["status"].get("deviceId").is_none());
        assert!(status.get("conflicts").is_none());
        assert!(!sync.exists());
        r.shutdown().unwrap();
    }
    #[test]
    fn cold_failed_pair_device_is_reused_and_enabled_identity_drift_is_rejected() {
        let d = tempfile::tempdir().unwrap();
        let device = uuid::Uuid::new_v4().to_string();
        let id = IdentityStore::open(&d.path().join(".sync"), &device).unwrap();
        assert_eq!(
            IdentityStore::existing_device_id(&d.path().join(".sync")).unwrap(),
            Some(device.clone())
        );
        drop(id);
        let s = shared(d.path());
        let runtime = Runtime::new(s.clone(), d.path().into(), Arc::new(Windows)).unwrap();
        {
            let mut inner = runtime.inner.lock().unwrap();
            runtime.service(&mut inner).unwrap();
            assert_eq!(
                inner.identity.as_ref().unwrap().device_id().unwrap(),
                device
            );
            assert!(s.0.lock().unwrap().store.sync_identity().unwrap().is_none());
        }
        runtime.shutdown().unwrap();
        s.0.lock()
            .unwrap()
            .store
            .sync_enable_with_device(None, &uuid::Uuid::new_v4().to_string())
            .unwrap();
        let runtime = Runtime::new(s, d.path().into(), Arc::new(Windows)).unwrap();
        let mut inner = runtime.inner.lock().unwrap();
        assert!(runtime.service(&mut inner).is_err());
        drop(inner);
        runtime.shutdown().unwrap();
    }
    #[test]
    fn strict_command_allowlist_and_token_reject_unknown_or_remote_fields() {
        for command in [
            json!({"type":"status","path":"/secret"}),
            json!({"type":"execute","command":"rm"}),
            json!({"type":"startHost","deviceName":"A","port":1234,"window":"forged"}),
            json!({"type":"pair","invitation":"x"}),
        ] {
            assert!(serde_json::from_value::<Command>(command).is_err());
        }
        assert!(serde_json::from_value::<Token>(
            json!({"sessionId":"x","epoch":1,"window":"fake"})
        )
        .is_err());
    }
    #[test]
    fn required_blobs_fully_validates_before_allocating_and_adapts_hash_to_sha256() {
        let d = tempfile::tempdir().unwrap();
        let s = shared(d.path());
        let identity = s.0.lock().unwrap().store.sync_enable(None).unwrap();
        let backend = StoreBackend {
            shared: s.clone(),
            device: identity.device_id,
        };
        let remote_dir = tempfile::tempdir().unwrap();
        let mut remote = Store::open(remote_dir.path()).unwrap();
        remote.sync_enable(Some(&identity.workspace_id)).unwrap();
        let id = remote.action(json!({"type":"createNote"})).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        let media = remote
            .store_attachment(&id, "test.png", "image/png", vec![1, 2, 3, 4])
            .unwrap();
        remote.action(json!({"type":"saveNote","id":id,"revision":0,"document":{"type":"doc","content":[{"type":"attachment","attrs":{"id":media.id,"kind":"image","name":"test.png"}}]}})).unwrap();
        remote.sync_flush().unwrap();
        let digest = remote
            .sync_inventory()
            .unwrap()
            .into_iter()
            .find(|v| v.entity_id == id)
            .unwrap()
            .digest;
        let wire = remote.sync_version(&digest).unwrap();
        let value = serde_json::to_value(&wire).unwrap();
        let refs = backend.required_blobs(&value).unwrap();
        assert_eq!(refs[0].sha256, super::super::model::sha256(&[1, 2, 3, 4]));
        assert_eq!(refs[0].size, 4);
        assert!(!backend.has_blob(&refs[0]).unwrap());
        for mutate in 0..5 {
            let mut bad = wire.clone();
            match mutate {
                0 => bad.digest = "f".repeat(64),
                1 => {
                    bad.payload.as_mut().unwrap()["attachments"][0]["noteId"] =
                        json!("wrong-owner");
                    bad = bad.seal();
                }
                2 => {
                    bad.payload.as_mut().unwrap()["attachments"][0]["size"] = json!(u64::MAX);
                    bad = bad.seal();
                }
                3 => {
                    bad.payload.as_mut().unwrap()["note"]["relativePath"] = json!("/forbidden");
                    bad = bad.seal();
                }
                _ => {
                    bad.workspace_id = uuid::Uuid::new_v4().to_string();
                    bad = bad.seal();
                }
            }
            assert!(backend
                .required_blobs(&serde_json::to_value(bad).unwrap())
                .is_err());
        }
        let mut unknown = value;
        unknown["arbitraryPath"] = json!("/secret");
        assert!(backend.required_blobs(&unknown).is_err());
        assert_eq!(
            fs::read_dir(d.path().join(".sync/blobs")).unwrap().count(),
            0
        );
        assert_eq!(
            fs::read_dir(d.path().join(".sync/staging"))
                .unwrap()
                .count(),
            0
        );
    }
    #[test]
    fn blob_file_operations_do_not_require_session_guard_and_receive_is_only_durable() {
        let d = tempfile::tempdir().unwrap();
        let s = shared(d.path());
        let identity = s.0.lock().unwrap().store.sync_enable(None).unwrap();
        let backend = StoreBackend {
            shared: s.clone(),
            device: identity.device_id.clone(),
        };
        let bytes = vec![9; 65537];
        let hash = super::super::model::sha256(&bytes);
        let b = network::BlobRef {
            sha256: hash,
            size: bytes.len() as u64,
        };
        let stage = d.path().join(".sync/network-staging");
        fs::create_dir(&stage).unwrap();
        let source = stage.join(format!("{}-{}.part", b.sha256, b.size));
        fs::write(&source, &bytes).unwrap();
        backend.store_blob(&b, &source).unwrap();
        assert!(backend.has_blob(&b).unwrap());
        assert_eq!(
            backend.read_blob_chunk(&b, 0, network::CHUNK).unwrap(),
            bytes[..network::CHUNK]
        );
        assert!(backend.read_blob_chunk(&b, b.size + 1, 1).is_err());
        let mut remote = Store::open(d.path().join("remote")).unwrap();
        remote.sync_enable(Some(&identity.workspace_id)).unwrap();
        let nid = remote.action(json!({"type":"createNote"})).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        remote.sync_flush().unwrap();
        let wire = remote
            .sync_version(&remote.sync_inventory().unwrap()[0].digest)
            .unwrap();
        let r = backend
            .receive_head(serde_json::to_value(wire).unwrap())
            .unwrap();
        assert!(r.durable && !r.applied);
        assert!(s.0.lock().unwrap().store.note(&nid).is_err());
        assert_eq!(s.0.lock().unwrap().store.sync_pending_count().unwrap(), 1);
    }
}

#[cfg(test)]
mod allocation_tests {
    use super::*;
    use crate::store::Store;
    fn backend() -> (tempfile::TempDir, StoreBackend, Store, String) {
        let d = tempfile::tempdir().unwrap();
        let shared = Arc::new((
            Mutex::new(Session::new(Store::open(d.path().join("local")).unwrap())),
            Condvar::new(),
        ));
        let identity = shared.0.lock().unwrap().store.sync_enable(None).unwrap();
        let mut remote = Store::open(d.path().join("remote")).unwrap();
        remote.sync_enable(Some(&identity.workspace_id)).unwrap();
        let nid = remote.action(json!({"type":"createNote"})).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        (
            d,
            StoreBackend {
                shared,
                device: identity.device_id,
            },
            remote,
            nid,
        )
    }
    fn wire(store: &mut Store, id: &str) -> WireVersion {
        store.sync_flush().unwrap();
        let digest = store
            .sync_inventory()
            .unwrap()
            .into_iter()
            .find(|v| v.entity_id == id)
            .unwrap()
            .digest;
        store.sync_version(&digest).unwrap()
    }
    #[test]
    fn locked_media_is_rejected_at_existing_business_and_wire_boundaries() {
        let (_d, backend, mut remote, nid) = backend();
        let image = remote
            .store_attachment(&nid, "test.png", "image/png", vec![1, 2, 3])
            .unwrap();
        assert_eq!(
            remote
                .action(json!({"type":"lockNote","id":nid,"password":"synthetic"}))
                .unwrap_err()
                .code,
            "unsupported"
        );
        let audio_id = remote.action(json!({"type":"createNote"})).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        remote
            .store_attachment(&audio_id, "test.wav", "audio/wav", vec![0; 44])
            .unwrap();
        assert_eq!(
            remote
                .action(json!({"type":"lockNote","id":audio_id,"password":"synthetic"}))
                .unwrap_err()
                .code,
            "unsupported"
        );
        let locked_id = remote.action(json!({"type":"createNote"})).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        remote
            .action(json!({"type":"lockNote","id":locked_id,"password":"synthetic"}))
            .unwrap();
        let mut encrypted = wire(&mut remote, &locked_id);
        encrypted.payload.as_mut().unwrap()["attachments"] = json!([{"id":image.id,"noteId":locked_id,"kind":"image","mime":"image/png","displayName":"test.png","size":3,"recordedAt":null,"sha256":super::super::model::sha256(&[1,2,3])}]);
        encrypted = encrypted.seal();
        assert!(backend
            .required_blobs(&serde_json::to_value(encrypted).unwrap())
            .is_err());
        assert_eq!(
            backend
                .shared
                .0
                .lock()
                .unwrap()
                .store
                .sync_pending_count()
                .unwrap(),
            0
        );
    }
    #[test]
    fn all_media_cache_budget_and_same_vector_equivocation_fail_before_allocation() {
        let (d, backend, mut remote, nid) = backend();
        let original = wire(&mut remote, &nid);
        backend
            .receive_head(serde_json::to_value(&original).unwrap())
            .unwrap();
        let mut equivocation = original.clone();
        equivocation.payload.as_mut().unwrap()["note"]["title"] = json!("other");
        equivocation = equivocation.seal();
        assert!(backend
            .required_blobs(&serde_json::to_value(equivocation).unwrap())
            .is_err());
        let mut huge = original;
        huge.vector.insert(uuid::Uuid::new_v4().to_string(), 1);
        let mut attachments = vec![];
        let mut nodes = vec![];
        for n in 0..17 {
            let id = uuid::Uuid::new_v4().to_string();
            nodes.push(
                json!({"type":"attachment","attrs":{"id":id,"kind":"image","name":"budget.png"}}),
            );
            attachments.push(json!({"id":id,"noteId":nid,"kind":"image","mime":"image/png","displayName":"budget.png","size":network::MAX_BLOB,"recordedAt":null,"sha256":format!("{n:064x}")}));
        }
        huge.payload.as_mut().unwrap()["note"]["document"] = json!({"type":"doc","content":nodes});
        huge.payload.as_mut().unwrap()["attachments"] = json!(attachments);
        huge = huge.seal();
        assert_eq!(
            backend
                .required_blobs(&serde_json::to_value(huge).unwrap())
                .unwrap_err(),
            SyncError::Limit
        );
        assert_eq!(
            fs::read_dir(d.path().join("local/.sync/blobs"))
                .unwrap()
                .count(),
            0
        );
        assert_eq!(
            fs::read_dir(d.path().join("local/.sync/staging"))
                .unwrap()
                .count(),
            0
        );
    }
}

#[cfg(test)]
mod publication_tests {
    use super::*;
    use crate::store::Store;
    #[test]
    fn controlled_stage_rename_reuses_inode_duplicate_cleanup_and_bad_cache_are_safe() {
        let d = tempfile::tempdir().unwrap();
        let mut store = Store::open(d.path()).unwrap();
        store.sync_enable(None).unwrap();
        let storage = store.sync_blob_storage().unwrap();
        let bytes = vec![7; 32769];
        let hash = super::super::model::sha256(&bytes);
        let size = bytes.len() as u64;
        let stage = d.path().join(".sync/network-staging");
        fs::create_dir(&stage).unwrap();
        let source = stage.join(format!("{hash}-{size}.part"));
        fs::write(&source, &bytes).unwrap();
        let meta = fs::metadata(&source).unwrap();
        storage.publish_staged(&hash, size, &source).unwrap();
        assert!(!source.exists());
        let destination = storage.sync_blob_path(&hash).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            assert_eq!(meta.ino(), fs::metadata(&destination).unwrap().ino());
        }
        fs::write(&source, &bytes).unwrap();
        storage.publish_staged(&hash, size, &source).unwrap();
        assert!(source.exists());
        assert_eq!(fs::read(&destination).unwrap(), bytes);
        fs::write(&destination, b"corrupt").unwrap();
        assert!(storage.publish_staged(&hash, size, &source).is_err());
        assert_eq!(fs::read(&destination).unwrap(), b"corrupt");
        let wrong = d.path().join("arbitrary-file");
        fs::write(&wrong, &bytes).unwrap();
        assert!(storage.publish_staged(&hash, size, &wrong).is_err());
        #[cfg(unix)]
        {
            fs::remove_file(&source).unwrap();
            std::os::unix::fs::symlink(&wrong, &source).unwrap();
            assert!(storage.publish_staged(&hash, size, &source).is_err());
            assert_eq!(fs::read(&wrong).unwrap(), bytes);
        }
    }
}

#[cfg(test)]
mod local_stage_budget_tests {
    use super::*;
    #[test]
    fn local_capture_stage_allows_only_one_serial_file() {
        let d = tempfile::tempdir().unwrap();
        let mut store = crate::store::Store::open(d.path()).unwrap();
        store.sync_enable(None).unwrap();
        fs::write(d.path().join(".sync/staging/existing.part"), [0]).unwrap();
        let hash = super::super::model::sha256(&[1, 2, 3]);
        assert_eq!(
            store
                .sync_store_blob(&hash, 3, &[1, 2, 3][..])
                .unwrap_err()
                .code,
            "sync_limit"
        );
    }
}

#[cfg(test)]
#[path = "adapter_media_tests.rs"]
mod media_tests;

#[cfg(test)]
#[path = "adapter_retry_tests.rs"]
mod retry_tests;

#[cfg(test)]
#[path = "adapter_resolve_tests.rs"]
mod resolve_tests;
