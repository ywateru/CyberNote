//! One native account lifecycle; CyberBus owns every authentication operation.
mod callback;
mod config;
mod directory;
pub(crate) mod enrollment;
pub(crate) mod private;
mod provider;
pub(crate) mod sdk_diagnostic;
mod surface;
mod transport;
pub(crate) mod types;
mod worker;
use crate::sync::adapter;
use notes_cyberbus::{pb, Bus};
use pb::sdk_command::Body as C;
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
use tokio::sync::{oneshot, Mutex as AsyncMutex};
use tokio_util::sync::CancellationToken;
use types::{Command, Error, Phase, Profile, Result, SdkStage, Status};
struct Attempt {
    stop: CancellationToken,
    mac: Option<Arc<callback::Callback>>,
}
#[cfg(target_os = "android")]
struct AndroidCallback {
    generation: u64,
    instance: String,
    sender: oneshot::Sender<url::Url>,
}
#[cfg(target_os = "android")]
fn take_android_callback(
    slot: &mut Option<AndroidCallback>,
    generation: u64,
    instance: &str,
) -> Option<oneshot::Sender<url::Url>> {
    if !slot
        .as_ref()
        .is_some_and(|s| s.generation == generation && s.instance == instance)
    {
        return None;
    }
    slot.take().map(|s| s.sender)
}
struct Network {
    stop: CancellationToken,
    task: tokio::task::JoinHandle<Result<()>>,
    control: Arc<worker::Control>,
    catalog: Arc<directory::Catalog>,
    requests: tokio::sync::mpsc::Sender<worker::DeviceRequest>,
}
struct Data {
    status: Status,
    binding: Option<private::Binding>,
    device_operation_id: Option<uuid::Uuid>,
}
pub(crate) struct Runtime {
    blocked: Option<Error>,
    app: tauri::AppHandle,
    sync: Arc<adapter::Runtime>,
    root: PathBuf,
    data: Mutex<Data>,
    bus: Mutex<Option<Bus>>,
    lifecycle: AsyncMutex<()>,
    operation: AsyncMutex<()>,
    registry: Mutex<Option<private::Registry>>,
    attempt: AsyncMutex<Option<Attempt>>,
    presentation: Mutex<Option<Arc<surface::Presentation>>>,
    #[cfg(target_os = "android")]
    android: AsyncMutex<Option<AndroidCallback>>,
    network: AsyncMutex<Option<Network>>,
    generation: AtomicU64,
    closing: AtomicBool,
    closed: AtomicBool,
}
impl Runtime {
    pub fn new(
        app: tauri::AppHandle,
        sync: Arc<adapter::Runtime>,
        root: &Path,
        _cache: &Path,
    ) -> Result<Arc<Self>> {
        let root = root.join(".account");
        let mut blocked = None;
        if let Err(e) = private::directory(&root) {
            blocked = Some(e);
        }
        if blocked.is_none() {
            if let Err(e) = provider::migrate_legacy_keychain(&root) {
                blocked = Some(e);
            }
        }
        let binding = if blocked.is_none() {
            match private::read(&root.join("binding.json")) {
                Ok(binding) => binding,
                Err(e) => {
                    blocked = Some(e);
                    None
                }
            }
        } else {
            None
        };
        let registry = if blocked.is_none() {
            match private::registry(&root) {
                Ok(r) => Some(r),
                Err(e) => {
                    blocked = Some(e);
                    None
                }
            }
        } else {
            None
        };
        let mut status = Status::default();
        if let Some(e) = blocked {
            status.state = Phase::Error;
            status.error = Some(e.safe());
        }
        Ok(Arc::new(Self {
            blocked,
            app,
            sync,
            root,
            data: Mutex::new(Data {
                status,
                binding,
                device_operation_id: None,
            }),
            bus: Mutex::new(None),
            lifecycle: AsyncMutex::new(()),
            operation: AsyncMutex::new(()),
            registry: Mutex::new(registry),
            attempt: AsyncMutex::new(None),
            presentation: Mutex::new(None),
            #[cfg(target_os = "android")]
            android: AsyncMutex::new(None),
            network: AsyncMutex::new(None),
            generation: AtomicU64::new(0),
            closing: AtomicBool::new(false),
            closed: AtomicBool::new(false),
        }))
    }
    fn bus_current(&self) -> Result<Option<Bus>> {
        Ok(self.bus.lock().map_err(|_| Error::Storage)?.clone())
    }
    async fn bus(&self) -> Result<Bus> {
        if let Some(e) = self.blocked {
            return Err(e);
        }
        if let Some(bus) = self.bus_current()? {
            return Ok(bus);
        }
        let config = config::pinned()?;
        let opened = async {
            let (store, mode) = provider::store(&self.root)?;
            Bus::new(config, store, mode)
                .await
                .map_err(|error| Error::at_sdk(SdkStage::Init, error))
        }
        .await;
        let candidate = opened?;
        let existing = {
            let mut slot = self.bus.lock().map_err(|_| Error::Storage)?;
            if let Some(existing) = slot.as_ref().cloned() {
                Some(existing)
            } else {
                *slot = Some(candidate.clone());
                None
            }
        };
        if let Some(existing) = existing {
            let _ = candidate.close().await;
            Ok(existing)
        } else {
            Ok(candidate)
        }
    }
    pub(crate) async fn cyberbus_diagnostic(
        &self,
    ) -> std::result::Result<notes_cyberbus::DiagnosticSnapshot, &'static str> {
        let bus = self.bus().await.map_err(|_| "UNAVAILABLE")?;
        bus.diagnostic().await.map_err(|_| "UNAVAILABLE")
    }
    async fn close_bus(&self) -> Result<()> {
        let bus = self.bus.lock().map_err(|_| Error::Storage)?.take();
        if let Some(bus) = bus {
            bus.close()
                .await
                .map_err(|error| Error::at_sdk(SdkStage::Init, error))?;
        }
        Ok(())
    }
    fn mutate(&self, f: impl FnOnce(&mut Data)) {
        if let Ok(mut d) = self.data.lock() {
            f(&mut d)
        }
    }
    fn fail(&self, error: Error) {
        self.mutate(|d| {
            d.status.state = Phase::Error;
            d.status.error = Some(error.safe());
            for device in &mut d.status.devices {
                device.online = false;
                device.connected = false;
                device.sync_available = false;
                device.summary = None;
            }
        })
    }
    fn current(&self, g: u64) -> bool {
        !self.closing.load(Ordering::Acquire) && self.generation.load(Ordering::Acquire) == g
    }
    fn registry(&self) -> Result<private::Registry> {
        self.registry
            .lock()
            .map_err(|_| Error::Storage)?
            .as_ref()
            .cloned()
            .ok_or(Error::Storage)
    }
    pub fn snapshot(&self) -> Result<Status> {
        let mut status = self.data.lock().map_err(|_| Error::Storage)?.status.clone();
        let (pending, conflicts) = self.sync.account_metrics()?;
        status.pending_count = pending;
        status.conflict_count = conflicts;
        if status.state == Phase::Authorizing {
            status.authorization_surface = self
                .presentation
                .lock()
                .ok()
                .and_then(|p| p.as_ref().and_then(|p| p.surface()));
        }
        // UI cannot reuse online/sync observations after lease expiry between ticks.
        let valid = self
            .bus_current()?
            .zip(self.data.lock().ok().and_then(|d| d.binding.clone()))
            .is_some_and(|(bus, b)| worker::available(&bus.snapshot(), &b));
        if !valid {
            for d in &mut status.devices {
                d.online = false;
                d.connected = false;
                d.sync_available = false;
                d.summary = None;
                d.transport = None;
            }
        }
        Ok(status)
    }
    fn set_phase(&self, g: u64, phase: Phase) {
        self.mutate(|d| {
            if self.current(g) {
                d.status.state = phase;
                d.status.error = None;
            }
        });
    }
    fn directory_status(&self, g: u64, catalog: &directory::Catalog) -> Result<()> {
        let devices = catalog.devices(&self.registry()?.registry_device_id)?;
        self.mutate(|d| {
            if self.current(g) {
                d.status.devices = devices;
            }
        });
        Ok(())
    }
    pub fn restore(self: &Arc<Self>) {
        let this = self.clone();
        tauri::async_runtime::spawn(async move {
            let _owner = this.lifecycle.lock().await;
            let g = this.generation.load(Ordering::Acquire);
            let result = async {
                let bus = this.bus().await?;
                bus.cmd(C::AuthRestore(pb::AuthRestore {
                    operation_id: uuid::Uuid::new_v4().as_bytes().to_vec(),
                }))
                .await
                .map_err(|error| Error::at_sdk(SdkStage::AuthRestore, error))?;
                let account = this
                    .wait_account(&bus, g, &CancellationToken::new())
                    .await?;
                this.bind(&account, g, false)?;
                this.start_network().await
            }
            .await;
            if let Err(e) = result {
                if this.current(g) {
                    if e == Error::Authentication
                        && this.data.lock().ok().is_some_and(|d| d.binding.is_none())
                    {
                        this.mutate(|d| d.status = Status::default());
                    } else {
                        this.fail(e);
                    }
                }
            }
        });
    }
    async fn wait_account(
        &self,
        bus: &Bus,
        g: u64,
        stop: &CancellationToken,
    ) -> Result<pb::AccountSummary> {
        let mut watch = bus.watch();
        let result = bus
            .cmd(C::GetAuthState(pb::GetAuthState {}))
            .await
            .map_err(|error| Error::at_sdk(SdkStage::AuthState, error))?;
        if let Some(pb::sdk_result::Body::AuthState(a)) = result.body {
            if let Some(account) = verified_account(&a)? {
                return Ok(account);
            }
        }
        let deadline = tokio::time::Instant::now() + Duration::from_secs(90);
        loop {
            if !self.current(g) || stop.is_cancelled() {
                return Err(Error::Cancelled);
            }
            if let Some(a) = bus.snapshot().auth {
                if let Some(account) = verified_account(&a)? {
                    return Ok(account);
                }
            }
            tokio::select! {_=stop.cancelled()=>return Err(Error::Cancelled),_ = tokio::time::sleep_until(deadline)=>return Err(Error::UnknownOutcome),r=watch.changed()=>r.map_err(|_|Error::Network)?}
        }
    }
    fn bind(&self, account: &pb::AccountSummary, g: u64, fresh: bool) -> Result<()> {
        let pins = config::pinned()?;
        if account.issuer != pins.issuer || account.product_id != pins.product_id {
            return Err(Error::OwnershipMismatch);
        }
        if !self.current(g) {
            return Err(Error::Cancelled);
        }
        let workspace =
            enrollment::workspace(&account.issuer, &account.subject, &account.product_id)?;
        let old = self
            .data
            .lock()
            .map_err(|_| Error::Storage)?
            .binding
            .clone();
        let binding = prepare_session_binding(
            &self.sync,
            &self.root,
            old.as_ref(),
            account,
            &workspace,
            fresh,
        )?;
        if let Some(old) = old {
            private::remember_session(&self.root, &old)?;
        }
        private::remember_session(&self.root, &binding)?;
        private::write(&self.root.join("binding.json"), &binding)?;
        self.mutate(|d| {
            d.binding = Some(binding.clone());
            d.status.profile = Some(Profile {
                subject: account.subject.clone(),
                display_name: "CyberBus 账户".into(),
                username: None,
            });
            d.status.enabled = binding.enabled;
            d.status.state = Phase::Paused;
            d.status.error = None;
        });
        Ok(())
    }
    async fn start_network(self: &Arc<Self>) -> Result<()> {
        let mut slot = self.network.lock().await;
        if slot.as_ref().is_some_and(|n| !n.task.is_finished()) {
            return Ok(());
        }
        if let Some(n) = slot.take() {
            n.stop.cancel();
            n.control.configure(false);
            n.catalog.clear();
            let _ = n.task.await.map_err(|_| Error::Sync)?;
        }
        let bus = self.bus().await?;
        let (binding, enabled) = {
            let d = self.data.lock().map_err(|_| Error::Storage)?;
            (
                d.binding.clone().ok_or(Error::Authentication)?,
                d.status.enabled,
            )
        };
        let catalog = Arc::new(directory::Catalog::open(&self.root, &binding.workspace_id)?);
        let control = Arc::new(worker::Control::default());
        control.configure(enabled);
        let stop = CancellationToken::new();
        let g = self.generation.load(Ordering::Acquire);
        let (requests, rx) = tokio::sync::mpsc::channel(1);
        // CyberBus requires the local profile to exist before it will start
        // transport. Publish while still offline, then hand the same revision
        // baseline to the worker so its first online observation does not race
        // or repeat the write.
        let mut publication = worker::Publication::default();
        worker::publish(self, &bus, &binding, &catalog, false, &mut publication).await?;
        bus.cmd(C::NetworkStart(pb::NetworkStart {
            private_config: None,
        }))
        .await
        .map_err(|error| Error::at_sdk(SdkStage::NetworkStart, error))?;
        let owner = Arc::downgrade(self);
        let c = control.clone();
        let history = catalog.clone();
        let task_stop = stop.clone();
        let task = tokio::spawn(async move {
            let result = worker::run(
                owner.clone(),
                g,
                binding,
                bus,
                c,
                history,
                task_stop,
                rx,
                publication,
            )
            .await;
            if let Err(e) = result {
                if let Some(o) = owner.upgrade() {
                    if o.current(g) {
                        o.fail(e);
                    }
                }
            }
            result
        });
        *slot = Some(Network {
            stop,
            task,
            control,
            catalog,
            requests,
        });
        Ok(())
    }
    async fn stop_network(&self) -> Result<()> {
        let network = self.network.lock().await.take();
        if let Some(n) = network {
            n.control.configure(false);
            n.stop.cancel();
            n.catalog.clear();
            let result = n.task.await.map_err(|_| Error::Sync)?;
            if let Err(e) = result {
                if e != Error::Cancelled {
                    return Err(e);
                }
            }
        }
        self.sync.pause_for_account()?;
        if let Some(bus) = self.bus_current()? {
            bus.cmd(C::NetworkStop(pb::NetworkStop {}))
                .await
                .map_err(|error| Error::at_sdk(SdkStage::NetworkStop, error))?;
        }
        Ok(())
    }
    fn set_enabled(&self, enabled: bool) -> Result<()> {
        let mut d = self.data.lock().map_err(|_| Error::Storage)?;
        if let Some(mut b) = d.binding.clone() {
            b.enabled = enabled;
            private::write(&self.root.join("binding.json"), &b)?;
            d.binding = Some(b);
        }
        d.status.enabled = enabled;
        Ok(())
    }
    async fn cancel_attempt(&self) {
        self.generation.fetch_add(1, Ordering::AcqRel);
        if let Some(a) = self.attempt.lock().await.as_ref() {
            a.stop.cancel();
            if let Some(m) = &a.mac {
                m.cancel();
            }
        }
    }
    pub async fn command(self: &Arc<Self>, command: Command) -> Result<Status> {
        let recovery = matches!(command, Command::SyncNow {});
        let generation = self.generation.load(Ordering::Acquire);
        let result = self.command_inner(command).await;
        if recovery && self.current(generation) {
            if let Err(error) = &result {
                self.fail(*error);
            }
        }
        result
    }
    async fn command_inner(self: &Arc<Self>, command: Command) -> Result<Status> {
        if self.closing.load(Ordering::Acquire) {
            return Err(Error::Cancelled);
        }
        if !matches!(command, Command::Status {}) {
            if let Some(e) = self.blocked {
                return Err(e);
            }
        }
        match command {
            Command::Status {} => {}
            Command::SignIn { surface } | Command::SignUp { surface } => {
                let _owner = self.lifecycle.try_lock().map_err(|_| Error::Busy)?;
                if self.attempt.lock().await.is_some() {
                    return Err(Error::Busy);
                }
                let status = self.snapshot()?;
                if status.profile.is_some() && status.state != Phase::Error {
                    return Err(Error::Busy);
                }
                self.stop_network().await?;
                // An explicit login from a failed authenticated session first
                // closes that session; never run two grant owners.
                if status.profile.is_some() {
                    self.finish_local_logout(self.logout().await?)?;
                }
                let g = self.generation.fetch_add(1, Ordering::AcqRel) + 1;
                let stop = CancellationToken::new();
                *self.attempt.lock().await = Some(Attempt {
                    stop: stop.clone(),
                    mac: None,
                });
                self.mutate(|d| {
                    d.status.state = Phase::Authorizing;
                    d.status.error = None;
                });
                let signup = matches!(command, Command::SignUp { .. });
                let owner = self.clone();
                tauri::async_runtime::spawn(async move {
                    let _owner = owner.lifecycle.lock().await;
                    let result = owner.login(signup, surface, g, stop).await;
                    owner.attempt.lock().await.take();
                    #[cfg(target_os = "android")]
                    owner.android.lock().await.take();
                    if let Ok(mut p) = owner.presentation.lock() {
                        if p.as_ref().is_some_and(|p| p.generation == g) {
                            p.take();
                        }
                    }
                    if owner.current(g) {
                        if let Err(e) = result {
                            owner.fail(e);
                        }
                    }
                });
            }
            Command::OpenLoginInBrowser {} => return self.open_login_in_browser(None).await,
            Command::Cancel {} => {
                // Content cancellation fences admission and waits for its receipt.
                if self.attempt.lock().await.is_some() {
                    self.cancel_attempt().await;
                    let _owner = self.lifecycle.lock().await;
                    self.mutate(|d| {
                        if d.status.profile.is_none() {
                            d.status = Status::default()
                        }
                    });
                } else {
                    let control = self
                        .network
                        .lock()
                        .await
                        .as_ref()
                        .map(|n| n.control.clone());
                    if let Some(control) = control {
                        control.cancel_operation().await?;
                    }
                }
            }
            Command::SignOut {} => {
                self.cancel_attempt().await;
                let _owner = self.lifecycle.lock().await;
                self.stop_network().await?;
                self.finish_local_logout(self.logout().await?)?;
            }
            Command::SetEnabled { enabled } => {
                let _owner = self.lifecycle.try_lock().map_err(|_| Error::Busy)?;
                let b = self
                    .data
                    .lock()
                    .map_err(|_| Error::Storage)?
                    .binding
                    .clone()
                    .ok_or(Error::Authentication)?;
                if let Some(control) = self
                    .network
                    .lock()
                    .await
                    .as_ref()
                    .map(|n| n.control.clone())
                {
                    control.configure(false);
                    control.wait_retired().await?;
                }
                self.sync.pause_for_account()?;
                self.set_enabled(false)?;
                if enabled
                    && self
                        .sync
                        .account_adoption_needed(&b.workspace_id, &b.device_id)?
                {
                    self.sync
                        .account_adoption_preflight(&b.workspace_id, &b.device_id)?;
                    private::begin_adoption(&self.root)?;
                }
                self.set_enabled(enabled)?;
                self.start_network().await?;
                if let Some(n) = self.network.lock().await.as_ref() {
                    n.control.configure(enabled);
                }
                self.mutate(|d| {
                    d.status.state = if enabled {
                        Phase::Connecting
                    } else {
                        Phase::Paused
                    };
                    d.status.error = None;
                });
            }
            Command::SyncNow {} => {
                let _owner = self.lifecycle.try_lock().map_err(|_| Error::Busy)?;
                if self
                    .data
                    .lock()
                    .map_err(|_| Error::Storage)?
                    .binding
                    .is_none()
                {
                    return Err(Error::Authentication);
                }
                let bus = self.bus().await?;
                bus.on_resume().await?;
                // Recovery revalidates the retained SDK grant; it never creates
                // a replacement account or opts into content replication.
                if !self
                    .data
                    .lock()
                    .ok()
                    .and_then(|d| d.binding.clone())
                    .is_some_and(|b| worker::authenticated(&bus.snapshot(), &b))
                {
                    bus.cmd(C::AuthRestore(pb::AuthRestore {
                        operation_id: uuid::Uuid::new_v4().as_bytes().to_vec(),
                    }))
                    .await
                    .map_err(|error| Error::at_sdk(SdkStage::AuthRestore, error))?;
                    let g = self.generation.load(Ordering::Acquire);
                    let account = self
                        .wait_account(&bus, g, &CancellationToken::new())
                        .await?;
                    self.bind(&account, g, false)?;
                }
                self.start_network().await?;
            }
            Command::RenameDevice { name } => {
                let _owner = self.lifecycle.try_lock().map_err(|_| Error::Busy)?;
                if self.snapshot()?.profile.is_none() {
                    return Err(Error::Authentication);
                }
                {
                    let mut slot = self.registry.lock().map_err(|_| Error::Storage)?;
                    let mut next = slot.clone().ok_or(Error::Storage)?;
                    next.name = private::device_name(&name)?;
                    private::write_registry(&self.root, &next)?;
                    *slot = Some(next);
                }
                if let Some(n) = self.network.lock().await.as_ref() {
                    n.control.refresh.notify_one();
                }
            }
            Command::SyncDevice {
                device_id,
                direction,
            } => self.start_device(device_id, direction).await?,
        }
        self.snapshot()
    }
    async fn logout(&self) -> Result<LogoutReceipt> {
        logout_bus(&self.bus().await?).await
    }
    fn finish_local_logout(&self, logout: LogoutReceipt) -> Result<()> {
        self.set_enabled(false)?;
        self.sync.replay_adoption_release()?;
        private::clear_session(&self.root)?;
        self.mutate(|d| {
            d.binding = None;
            d.status = Status::default();
            d.status.error = logout.cloud_error.map(Error::safe);
        });
        logout.cloud_error.map_or(Ok(()), Err)
    }
    async fn start_device(
        self: &Arc<Self>,
        device_id: String,
        direction: types::TransferDirection,
    ) -> Result<()> {
        let _operation = self.operation.try_lock().map_err(|_| Error::Busy)?;
        let _owner = self.lifecycle.try_lock().map_err(|_| Error::Busy)?;
        if !self.snapshot()?.enabled {
            return Err(Error::SyncNotEnabled);
        }
        let network = self.network.lock().await;
        let n = network.as_ref().ok_or(Error::DirectoryUnavailable)?;
        if !n.control.ready() {
            return Err(Error::SyncNotEnabled);
        }
        let g = self.generation.load(Ordering::Acquire);
        let epoch = n.control.epoch()?;
        let cancellation = Arc::new(worker::RequestCancellation::default());
        let id = uuid::Uuid::new_v4();
        let weak = Arc::downgrade(self);
        cancellation.observe_progress(Arc::new(move |p| {
            if let Some(o) = weak.upgrade() {
                o.mutate(|d| {
                    if o.current(g) && d.device_operation_id == Some(id) {
                        if let Some(op) = &mut d.status.device_operation {
                            op.progress = Some(p);
                        }
                    }
                });
            }
        }));
        let target = n
            .catalog
            .target(&device_id, &self.registry()?.registry_device_id)?;
        let permit = n.control.reserve(epoch, &cancellation)?;
        let (done, rx) = oneshot::channel();
        self.mutate(|d| {
            d.device_operation_id = Some(id);
            d.status.error = None;
            d.status.device_operation = Some(types::DeviceOperation {
                device_id,
                direction,
                phase: types::DeviceOperationPhase::Running,
                started_at: unix_ms(),
                finished_at: None,
                progress: Some(Default::default()),
            });
        });
        n.requests
            .try_send(worker::DeviceRequest {
                target,
                direction,
                epoch,
                _permit: permit,
                cancellation: cancellation.clone(),
                owner: Arc::downgrade(self),
                generation: g,
                operation_id: id,
                done,
            })
            .map_err(|_| {
                self.finish_device_operation(g, id, Err(Error::Busy));
                Error::Busy
            })?;
        tauri::async_runtime::spawn(async move {
            let _ = worker::wait_request(rx, cancellation).await;
        });
        Ok(())
    }
    fn finish_device_operation(&self, g: u64, id: uuid::Uuid, outcome: Result<()>) {
        self.mutate(|d| {
            if self.current(g) {
                complete_device_status(d, id, outcome);
            }
        });
    }
    async fn open_login_in_browser(&self, instance: Option<&str>) -> Result<Status> {
        let presentation = self
            .presentation
            .lock()
            .map_err(|_| Error::Storage)?
            .as_ref()
            .cloned()
            .ok_or(Error::Busy)?;
        if !self.current(presentation.generation)
            || instance.is_some_and(|id| id != presentation.instance)
        {
            return Err(Error::Cancelled);
        }
        let url = presentation.begin_switch()?;
        let opened = self
            .app
            .opener()
            .open_url(url.as_str(), None::<&str>)
            .is_ok();
        if !presentation.end_switch(opened) || !self.current(presentation.generation) {
            return self.snapshot();
        }
        self.mutate(|d| {
            if d.status.state == Phase::Authorizing {
                d.status.error = if opened {
                    None
                } else {
                    Some(Error::NetworkAt(types::NetworkStage::BrowserOpen).safe())
                };
            }
        });
        self.snapshot()
    }
    async fn login(
        self: &Arc<Self>,
        signup: bool,
        requested: types::AuthorizationSurface,
        g: u64,
        stop: CancellationToken,
    ) -> Result<()> {
        let bus = self.bus().await?;
        #[cfg(not(target_os = "android"))]
        let mac = callback::Callback::start()
            .await
            .map_err(|_| Error::NetworkAt(types::NetworkStage::CallbackListen))?;
        #[cfg(not(target_os = "android"))]
        let _callback_lease = callback::Lease(mac.clone());
        let result = bus
            .cmd(C::AuthStart(pb::AuthStart {
                intent: if signup {
                    pb::AuthIntent::Register as i32
                } else {
                    pb::AuthIntent::Login as i32
                },
            }))
            .await
            .map_err(|error| Error::at_sdk(SdkStage::AuthStart, error))?;
        let Some(pb::sdk_result::Body::AuthStarted(started)) = result.body else {
            return Err(Error::CoordinationProtocol);
        };
        let op = started.operation_id;
        let mut callback_submitted = false;
        let outcome=async {
            if !self.current(g) || stop.is_cancelled(){return Err(Error::Cancelled);}
            #[cfg(not(target_os="android"))]
            if let Some(a)=self.attempt.lock().await.as_mut(){a.mac=Some(mac.clone());}
            let url=started.authorization_uri.parse().map_err(|_|Error::Configuration)?;
            let p=surface::Presentation::new(self,requested,g,url,stop.clone())?;
            let _lease=surface::Lease(p.clone());*self.presentation.lock().map_err(|_|Error::Storage)?=Some(p.clone());
            #[cfg(target_os="android")]
            let receiver={let(tx,rx)=oneshot::channel();*self.android.lock().await=Some(AndroidCallback{generation:g,instance:p.instance.clone(),sender:tx});rx};
            let deadline=tokio::time::Instant::now()+Duration::from_secs(600);
            #[cfg(all(feature="sync-e2e",debug_assertions,desktop))]
            let handed_off=test_authorization_file(&started.authorization_uri)?;
            #[cfg(not(all(feature="sync-e2e",debug_assertions,desktop)))]
            let handed_off=false;
            if !handed_off {
                tokio::select! {_=stop.cancelled()=>return Err(p.stopped_error()),r=tokio::time::timeout_at(deadline,p.open(self))=>r.map_err(|_|Error::Deadline)??}
            }
            let callback=async {
                #[cfg(not(target_os="android"))]
                {mac.wait().await.map_err(|_|Error::NetworkAt(types::NetworkStage::CallbackReceive))}
                #[cfg(target_os="android")]
                {receiver.await.map(|u|u.to_string()).map_err(|_|Error::Cancelled)}
            };
            let value=tokio::select! {_=stop.cancelled()=>return Err(p.stopped_error()),r=tokio::time::timeout_at(deadline,callback)=>r.map_err(|_|Error::Deadline)??};
            p.completing();
            // Once dispatched, await the SDK owner even if the surface cancels.
            // The owner settles rotated credentials before any local logout.
            callback_submitted=true;
            bus.cmd(C::AuthCallback(pb::AuthCallback{operation_id:op.clone(),callback_uri:value}))
                .await
                .map_err(|error| Error::at_sdk(SdkStage::AuthCallback, error))?;
            let account=self.wait_account(&bus,g,&stop).await?;
            self.bind(&account,g,true)?;
            self.start_network().await
        }.await;
        if outcome.is_err() {
            let cancel = bus
                .cmd(C::AuthCancel(pb::AuthCancel { operation_id: op }))
                .await
                .map_err(|error| Error::at_sdk(SdkStage::AuthCancel, error));
            if callback_submitted {
                // Callback may have committed immediately before cancellation.
                // Seal any grant rather than leaving an unseen logged-in owner.
                self.stop_network().await?;
                self.finish_local_logout(self.logout().await?)?;
            } else if let Err(e) = cancel {
                if !matches!(e, Error::BusAt(
                    SdkStage::AuthCancel,
                    code
                ) if code == pb::ErrorCode::Conflict as i32 || code == pb::ErrorCode::NotFound as i32)
                {
                    return Err(e);
                }
            }
        }
        outcome
    }
    #[cfg(target_os = "android")]
    pub async fn deep_link(&self, url: url::Url) {
        if url.scheme() != "com.local.notesclone.auth"
            || url.host_str() != Some("callback")
            || url.path() != ""
            || url.fragment().is_some()
        {
            return;
        }
        if let Some(sender) = self.android.lock().await.take() {
            let _ = sender.sender.send(url);
        }
    }
    #[cfg(target_os = "android")]
    async fn embedded_callback(&self, p: &surface::Presentation, url: url::Url) {
        let mut slot = self.android.lock().await;
        // Recheck AFTER acquiring the receiver guard, then compare and consume
        // under that same guard. An old queued task cannot take a new sender.
        if !self.current(p.generation) || !p.native_active() {
            return;
        }
        if let Some(sender) = take_android_callback(&mut slot, p.generation, &p.instance) {
            let _ = sender.send(url); // The SDK owner validates state/PKCE and the exact callback.
        }
    }
    pub fn foreground(self: &Arc<Self>) {
        let this = self.clone();
        tauri::async_runtime::spawn(async move {
            if this.closing.load(Ordering::Acquire) {
                return;
            }
            let Ok(_owner) = this.lifecycle.try_lock() else {
                return;
            };
            let enabled = this.data.lock().ok().is_some_and(|d| d.status.enabled);
            if enabled || this.data.lock().ok().is_some_and(|d| d.binding.is_some()) {
                if this
                    .network
                    .lock()
                    .await
                    .as_ref()
                    .is_none_or(|n| n.task.is_finished())
                {
                    if let Err(error) = this.start_network().await {
                        this.fail(error)
                    }
                }
            }
        });
    }
    pub fn exit_requested(self: &Arc<Self>, app: &tauri::AppHandle, api: &tauri::ExitRequestApi) {
        if self.closed.load(Ordering::Acquire) {
            return;
        }
        api.prevent_exit();
        if self.closing.swap(true, Ordering::AcqRel) {
            return;
        }
        let this = self.clone();
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            this.generation.fetch_add(1, Ordering::AcqRel);
            if let Some(a) = this.attempt.lock().await.as_ref() {
                a.stop.cancel();
                if let Some(mac) = &a.mac {
                    mac.cancel();
                }
            }
            let _owner = this.lifecycle.lock().await;
            if let Err(error) = this.stop_network().await {
                this.fail(error);
                return;
            }
            if let Err(error) = this.close_bus().await {
                this.fail(error);
                return;
            }
            this.closed.store(true, Ordering::Release);
            app.exit(0);
        });
    }
}
/// Local closure is authoritative even if the independent cloud revocation
/// failed. Callers must apply local cleanup and still report the cloud failure.
struct LogoutReceipt {
    cloud_error: Option<Error>,
}
impl LogoutReceipt {
    fn from_sdk(result: pb::AuthLogoutResult, revoke: bool) -> Result<Self> {
        if !result.local_closed || result.local_error.is_some() {
            return Err(result
                .local_error
                .map(|e| Error::from(notes_cyberbus::Error::Sdk(e.code)))
                .unwrap_or(Error::CleanupRequired));
        }
        let expected = if revoke {
            pb::CloudLogoutStatus::Succeeded
        } else {
            pb::CloudLogoutStatus::NotRequested
        } as i32;
        Ok(Self {
            cloud_error: result
                .cloud_error
                .map(|e| Error::from(notes_cyberbus::Error::Sdk(e.code)))
                .or_else(|| (result.cloud_status != expected).then_some(Error::UnknownOutcome)),
        })
    }
}
async fn logout_bus(bus: &Bus) -> Result<LogoutReceipt> {
    // Query the SDK owner, including its persisted grant, rather than inferring
    // grant existence from a UI binding or the auth phase. This also makes a
    // cancelled pre-callback login and repeated signout idempotent locally.
    let state = bus
        .cmd(C::GetAuthState(pb::GetAuthState {}))
        .await
        .map_err(|error| Error::at_sdk(SdkStage::AuthState, error))?;
    let Some(pb::sdk_result::Body::AuthState(state)) = state.body else {
        return Err(Error::CoordinationProtocol);
    };
    let revoke = state.refresh_supported;
    let result = bus
        .cmd(C::AuthLogout(pb::AuthLogout {
            cloud_policy: Some(if revoke {
                pb::CloudLogoutPolicy::RevokeGrant
            } else {
                pb::CloudLogoutPolicy::LocalOnly
            } as i32),
            cloud_budget: None,
        }))
        .await
        .map_err(|error| Error::at_sdk(SdkStage::AuthLogout, error))?;
    let Some(pb::sdk_result::Body::AuthLogout(result)) = result.body else {
        return Err(Error::CoordinationProtocol);
    };
    LogoutReceipt::from_sdk(result, revoke)
}
fn prepare_session_binding(
    sync: &adapter::Runtime,
    root: &Path,
    old: Option<&private::Binding>,
    identity: &notes_cyberbus::pb::AccountSummary,
    workspace: &str,
    fresh_login: bool,
) -> Result<private::Binding> {
    if enrollment::workspace(&identity.issuer, &identity.subject, &identity.product_id)?
        != workspace
    {
        return Err(Error::OwnershipMismatch);
    }
    // A login session selects an account, never the ownership of local content.
    // Only a retained, exactly matching session may preserve enable intent.
    let retained = old.filter(|b| {
        !fresh_login
            && b.issuer == identity.issuer
            && b.subject == identity.subject
            && b.product_id == identity.product_id
            && b.workspace_id == workspace
    });
    let store = sync.account_store_identity()?;
    let previous = if let Some(store) = &store {
        if store.workspace_id == workspace {
            let matches = |b: &private::Binding| {
                b.device_id == store.device_id
                    && session_identity_matches(b, identity)
                    && b.product_id == identity.product_id
                    && b.workspace_id == workspace
            };
            match old.filter(|b| matches(b)) {
                Some(binding) => Some(binding.clone()),
                None => private::remembered_session(root, &store.device_id)?.filter(matches),
            }
        } else {
            None
        }
    } else {
        None
    };
    let reusable = if let Some(previous) = &previous {
        sync.existing_account_identity(&previous.device_id)?
            .filter(|noise| noise.public_key().ok().as_deref() == Some(&previous.noise_public_key))
    } else {
        None
    };
    let device = retained
        .map(|b| b.device_id.clone())
        .or_else(|| reusable.as_ref().and_then(|noise| noise.device_id().ok()))
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let noise = sync.account_identity_for(&device)?;
    let binding = private::Binding {
        issuer: identity.issuer.clone(),
        subject: identity.subject.clone(),
        product_id: identity.product_id.clone(),
        workspace_id: workspace.to_string(),
        device_id: noise.device_id()?,
        noise_public_key: noise.public_key()?,
        enabled: retained.is_some_and(|b| b.enabled)
            && !private::adoption_pending(root)?
            && !sync.account_adoption_needed(&workspace, &device)?,
    };
    if retained.is_some_and(|b| b.noise_public_key != binding.noise_public_key) {
        return Err(Error::OwnershipMismatch);
    }
    Ok(binding)
}
fn complete_device_status(d: &mut Data, id: uuid::Uuid, outcome: Result<()>) {
    if d.device_operation_id != Some(id) {
        return;
    }
    if !d
        .status
        .device_operation
        .as_ref()
        .is_some_and(|operation| matches!(operation.phase, types::DeviceOperationPhase::Running))
    {
        return;
    }
    if let Some(operation) = &mut d.status.device_operation {
        operation.phase = if outcome.is_ok() {
            types::DeviceOperationPhase::Succeeded
        } else {
            types::DeviceOperationPhase::Failed
        };
        operation.finished_at = Some(unix_ms());
    }
    if let Err(error) = outcome {
        d.status.error = Some(error.safe());
    } else {
        d.status.last_sync_at = Some(unix_ms());
    }
}

fn unix_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
fn session_identity_matches(b: &private::Binding, a: &pb::AccountSummary) -> bool {
    b.issuer == a.issuer && b.subject == a.subject && b.product_id == a.product_id
}
fn verified_account(a: &pb::AuthEvent) -> Result<Option<pb::AccountSummary>> {
    match pb::AuthPhase::try_from(a.phase) {
        // AuthRestore is acknowledged before the SDK publishes its first
        // Restoring event. The initial owner snapshot can therefore still be
        // LoggedOut even though restoration is already in flight. Treat only
        // explicit terminal phases as failures; the operation event that
        // follows will report Authenticated, ReauthRequired, or Failed.
        Ok(pb::AuthPhase::LoggedOut | pb::AuthPhase::Authorizing | pb::AuthPhase::Restoring) => {
            Ok(None)
        }
        Ok(pb::AuthPhase::Authenticated)
            if !a.reauth_required && !a.security_state_persistence_pending =>
        {
            a.account.clone().map(Some).ok_or(Error::InvalidIdentity)
        }
        Ok(pb::AuthPhase::AuthCancelled) => Err(Error::Authentication),
        Ok(pb::AuthPhase::Degraded) => Err(Error::Network),
        Ok(pb::AuthPhase::ReauthRequired) => Err(Error::Authentication),
        _ => Err(a
            .error
            .as_ref()
            .map(|e| Error::from(notes_cyberbus::Error::Sdk(e.code)))
            .unwrap_or(Error::InvalidIdentity)),
    }
}
pub(crate) fn trusted_application_origin(source: &url::Url) -> bool {
    // Custom tauri URLs have opaque Url::origin(); compare their parsed parts
    // instead of either rejecting production macOS or trusting any opaque URL.
    !source[..url::Position::BeforeHost].contains('@')
        && source.port().is_none()
        && ((source.scheme() == "tauri" && source.host_str() == Some("localhost"))
            || (source.scheme() == "http" && source.host_str() == Some("tauri.localhost")))
}
#[tauri::command]
pub(crate) async fn account_command(
    command: Command,
    window: tauri::WebviewWindow,
    runtime: tauri::State<'_, crate::AccountState>,
) -> std::result::Result<Status, types::SafeError> {
    // Account mutations are restricted to the trusted main application origin.
    let source = window.url().map_err(|_| Error::WindowInvalid.safe())?;
    let mut allowed = trusted_application_origin(&source);
    #[cfg(debug_assertions)]
    {
        if let Some(dev) = &window.app_handle().config().build.dev_url {
            allowed |= dev.origin() == source.origin();
        }
    }
    if window.label() != "main" || !allowed {
        return Err(Error::WindowInvalid.safe());
    }
    runtime.0.command(command).await.map_err(Error::safe)
}

#[tauri::command]
pub(crate) async fn account_sdk_diagnostic(
    window: tauri::WebviewWindow,
    runtime: tauri::State<'_, crate::AccountState>,
) -> std::result::Result<serde_json::Value, String> {
    // Keep the fixed, identifier-free diagnostic behind the same trusted-main
    // window boundary as account mutations. The snapshot itself is debug-only
    // unless its explicit desktop environment switches are enabled.
    let source = window
        .url()
        .map_err(|_| "WINDOW_INVALID".to_string())?;
    let mut allowed = trusted_application_origin(&source);
    #[cfg(debug_assertions)]
    {
        if let Some(dev) = &window.app_handle().config().build.dev_url {
            allowed |= dev.origin() == source.origin();
        }
    }
    if window.label() != "main" || !allowed {
        return Err("WINDOW_INVALID".into());
    }
    sdk_diagnostic::snapshot(&runtime.0)
        .await
        .map_err(str::to_owned)
}

#[cfg(all(feature = "sync-e2e", debug_assertions, desktop))]
fn test_authorization_file(uri: &str) -> Result<bool> {
    if !crate::sync_headless::enabled() {
        return Ok(false);
    }
    let path = std::env::var_os("NOTES_SYNC_E2E_AUTHORIZATION_FILE")
        .map(PathBuf::from)
        .ok_or(Error::Configuration)?;
    write_test_authorization_file(&path, uri)?;
    Ok(true)
}
#[cfg(all(feature = "sync-e2e", debug_assertions, desktop))]
fn write_test_authorization_file(path: &Path, uri: &str) -> Result<()> {
    if !path.is_absolute() {
        return Err(Error::Configuration);
    }
    let parent = path.parent().ok_or(Error::Configuration)?;
    let meta = std::fs::symlink_metadata(parent).map_err(|_| Error::Storage)?;
    if !meta.is_dir() || meta.file_type().is_symlink() {
        return Err(Error::Storage);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if meta.mode() & 0o077 != 0 || meta.uid() != unsafe { libc::geteuid() } {
            return Err(Error::Storage);
        }
    }
    if std::fs::canonicalize(parent).map_err(|_| Error::Storage)? != parent {
        return Err(Error::Storage);
    }
    if std::fs::symlink_metadata(path).is_ok() {
        return Err(Error::Storage);
    }
    private::atomic_create(path, uri.as_bytes())
}

#[cfg(test)]
mod lifecycle_tests {
    use super::*;

    #[test]
    fn auth_restore_does_not_treat_the_preoperation_logged_out_snapshot_as_failure() {
        let event = pb::AuthEvent {
            phase: pb::AuthPhase::LoggedOut as i32,
            ..Default::default()
        };
        assert_eq!(verified_account(&event), Ok(None));
        let cancelled = pb::AuthEvent {
            phase: pb::AuthPhase::AuthCancelled as i32,
            ..Default::default()
        };
        assert_eq!(verified_account(&cancelled), Err(Error::Authentication));
    }

    #[cfg(all(feature = "sync-e2e", debug_assertions, desktop, unix))]
    #[test]
    fn authorization_handoff_requires_private_canonical_directory_and_never_replaces_evidence() {
        use std::os::unix::fs::{symlink, PermissionsExt};
        let temporary = tempfile::tempdir().unwrap();
        let dir = std::fs::canonicalize(temporary.path()).unwrap();
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700)).unwrap();
        let path = dir.join("authorization");
        write_test_authorization_file(&path, "fixture-request").unwrap();
        assert_eq!(
            std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert!(write_test_authorization_file(&path, "replacement").is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"fixture-request");
        let link = dir.join("link");
        symlink(&path, &link).unwrap();
        assert!(write_test_authorization_file(&link, "replacement").is_err());
        assert!(write_test_authorization_file(Path::new("relative-file"), "fixture").is_err());
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert!(write_test_authorization_file(&dir.join("public"), "fixture").is_err());
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700)).unwrap();
        let parent_link = dir.join("linked-parent");
        symlink(&dir, &parent_link).unwrap();
        assert!(write_test_authorization_file(&parent_link.join("request"), "fixture").is_err());
    }

    #[test]
    fn confirmed_local_logout_retains_cloud_failure_and_rejects_uncertain_local_cleanup() {
        let receipt = LogoutReceipt::from_sdk(
            pb::AuthLogoutResult {
                local_closed: true,
                cloud_status: pb::CloudLogoutStatus::UnknownOutcome as i32,
                ..Default::default()
            },
            true,
        )
        .unwrap();
        assert_eq!(receipt.cloud_error, Some(Error::UnknownOutcome));
        let receipt = LogoutReceipt::from_sdk(
            pb::AuthLogoutResult {
                local_closed: true,
                cloud_status: pb::CloudLogoutStatus::Failed as i32,
                cloud_error: Some(pb::ProtocolError {
                    code: pb::ErrorCode::Unavailable as i32,
                    ..Default::default()
                }),
                ..Default::default()
            },
            true,
        )
        .unwrap();
        assert_eq!(
            receipt.cloud_error,
            Some(Error::from(notes_cyberbus::Error::Sdk(
                pb::ErrorCode::Unavailable as i32
            )))
        );
        assert!(LogoutReceipt::from_sdk(
            pb::AuthLogoutResult {
                local_closed: false,
                cloud_status: pb::CloudLogoutStatus::Succeeded as i32,
                ..Default::default()
            },
            true
        )
        .is_err());
        assert!(LogoutReceipt::from_sdk(
            pb::AuthLogoutResult {
                local_closed: true,
                local_error: Some(pb::ProtocolError {
                    code: pb::ErrorCode::Internal as i32,
                    ..Default::default()
                }),
                cloud_status: pb::CloudLogoutStatus::Succeeded as i32,
                ..Default::default()
            },
            true
        )
        .is_err());
        // A cloud operation omitted despite a known grant must not be success.
        assert_eq!(
            LogoutReceipt::from_sdk(
                pb::AuthLogoutResult {
                    local_closed: true,
                    cloud_status: pb::CloudLogoutStatus::NotRequested as i32,
                    ..Default::default()
                },
                true
            )
            .unwrap()
            .cloud_error,
            Some(Error::UnknownOutcome)
        );
    }

    #[tokio::test]
    async fn actual_sdk_without_grant_closes_locally_and_repeated_signout_is_idempotent() {
        let bytes = Arc::new(Mutex::new(None::<Vec<u8>>));
        let load = bytes.clone();
        let save = bytes;
        let store = notes_cyberbus::CallbackStore::new(
            move || {
                Ok(load
                    .lock()
                    .unwrap()
                    .as_ref()
                    .map(|b| notes_cyberbus::SecretBytes::new(b.clone())))
            },
            move |b: &[u8]| {
                *save.lock().unwrap() = Some(b.to_vec());
                Ok(())
            },
        );
        let bus = Bus::new(
            config::pinned().unwrap(),
            Box::new(store),
            notes_cyberbus::StoreMode::CreateNew,
        )
        .await
        .unwrap();
        for _ in 0..2 {
            assert!(logout_bus(&bus).await.unwrap().cloud_error.is_none());
            let result = bus.cmd(C::GetAuthState(pb::GetAuthState {})).await.unwrap();
            let Some(pb::sdk_result::Body::AuthState(state)) = result.body else {
                panic!("SDK auth state required")
            };
            assert_eq!(state.phase, pb::AuthPhase::LoggedOut as i32);
            assert!(!state.refresh_supported);
            assert!(state.account.is_none());
            assert!(!bus.snapshot().network.is_some_and(|n| n.running));
        }
        bus.close().await.unwrap();
    }
}
