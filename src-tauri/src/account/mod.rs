//! One native account owner per leased data root. Renderer commands expose only
//! safe status; grants, enrollment proofs, invitations and Noise keys stay native.
mod callback;
mod config;
mod directory;
pub(crate) mod enrollment;
pub(crate) mod private;
mod provider;
mod recovery;
mod surface;
mod transport;
pub(crate) mod types;
mod worker;
use crate::sync::adapter;
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
use tokio::sync::{oneshot, Mutex as AsyncMutex, OnceCell};
use tokio_util::sync::CancellationToken;
use types::{Command, Error, Phase, Profile, Result, Status};
struct Attempt {
    cancel: Option<account_auth::AuthorizationCancellation>,
    stop: CancellationToken,
    mac: Option<Arc<callback::Callback>>,
}
struct AndroidCallback {
    generation: u64,
    instance: String,
    sender: oneshot::Sender<url::Url>,
}
fn take_android_callback(
    slot: &mut Option<AndroidCallback>,
    generation: u64,
    instance: &str,
) -> Option<oneshot::Sender<url::Url>> {
    if !slot
        .as_ref()
        .is_some_and(|slot| slot.generation == generation && slot.instance == instance)
    {
        return None;
    }
    slot.take().map(|slot| slot.sender)
}
struct Network {
    stop: CancellationToken,
    task: tokio::task::JoinHandle<()>,
    control: Arc<worker::Control>,
    catalog: Arc<directory::Catalog>,
    requests: tokio::sync::mpsc::Sender<worker::DeviceRequest>,
}
struct Data {
    status: Status,
    binding: Option<private::Binding>,
}
pub(crate) struct Runtime {
    blocked: Option<Error>,
    app: tauri::AppHandle,
    sync: Arc<adapter::Runtime>,
    root: PathBuf,
    cache: PathBuf,
    data: Mutex<Data>,
    auth: OnceCell<Arc<account_auth::AuthClient>>,
    lifecycle: AsyncMutex<()>,
    operation: AsyncMutex<()>,
    registry: Mutex<Option<private::Registry>>,
    attempt: AsyncMutex<Option<Attempt>>,
    presentation: Mutex<Option<Arc<surface::Presentation>>>,
    android: AsyncMutex<Option<AndroidCallback>>,
    network: AsyncMutex<Option<Network>>,
    generation: AtomicU64,
    closing: AtomicBool,
    closed: AtomicBool,
    observations: Arc<transport::observation::Cache>,
}
impl Runtime {
    pub fn new(
        app: tauri::AppHandle,
        sync: Arc<adapter::Runtime>,
        root: &Path,
        cache: &Path,
    ) -> Result<Arc<Self>> {
        let directory = root.join(".account");
        let loaded = private::directory(&directory)
            .and_then(|_| private::read(&directory.join("binding.json")));
        let (binding, mut blocked) = match loaded {
            Ok(binding) => (binding, None),
            Err(error) => (None, Some(error)),
        };
        let registry = if blocked.is_none() {
            match private::registry(&directory) {
                Ok(value) => Some(value),
                Err(error) => {
                    blocked = Some(error);
                    None
                }
            }
        } else {
            None
        };
        let mut status = Status::default();
        if let Some(error) = blocked {
            status.state = Phase::Error;
            status.error = Some(error.safe());
        }
        Ok(Arc::new(Self {
            blocked,
            app,
            sync,
            root: directory,
            cache: cache.join("account-provider"),
            data: Mutex::new(Data { status, binding }),
            auth: OnceCell::new(),
            lifecycle: AsyncMutex::new(()),
            operation: AsyncMutex::new(()),
            registry: Mutex::new(registry),
            attempt: AsyncMutex::new(None),
            presentation: Mutex::new(None),
            android: AsyncMutex::new(None),
            network: AsyncMutex::new(None),
            generation: AtomicU64::new(0),
            closing: AtomicBool::new(false),
            closed: AtomicBool::new(false),
            observations: Arc::new(transport::observation::Cache::default()),
        }))
    }
    async fn auth(&self) -> Result<Arc<account_auth::AuthClient>> {
        if let Some(error) = self.blocked {
            return Err(error);
        }
        Ok(self
            .auth
            .get_or_try_init(|| async {
                account_auth::AuthClient::new(config::pinned(), self.root.join("grant.json"))
                    .await
                    .map(Arc::new)
                    .map_err(Error::from)
            })
            .await?
            .clone())
    }
    fn mutate(&self, f: impl FnOnce(&mut Data)) {
        if let Ok(mut data) = self.data.lock() {
            f(&mut data)
        }
    }
    async fn cleanup_status(&self) {
        if let Some(auth) = self.auth.get() {
            if auth.cleanup_required().await {
                self.fail(Error::CleanupRequired);
            }
        }
    }
    fn fail(&self, error: Error) {
        self.observations.suspend();
        self.mutate(|d| {
            d.status.state = Phase::Error;
            d.status.error = Some(error.safe())
        })
    }
    fn fail_current(&self, generation: u64, error: Error) {
        self.mutate(|d| {
            if self.current(generation) {
                self.observations.suspend();
                d.status.state = Phase::Error;
                d.status.error = Some(error.safe());
            }
        });
    }
    pub fn snapshot(&self) -> Result<Status> {
        let mut status = self.data.lock().map_err(|_| Error::Storage)?.status.clone();
        let (pending, conflicts) = self.sync.account_metrics()?;
        status.authorization_surface = if status.state == Phase::Authorizing {
            self.presentation.lock().ok().and_then(|p| {
                p.as_ref()
                    .filter(|p| self.current(p.generation))
                    .and_then(|p| p.surface())
            })
        } else {
            None
        };
        status.pending_count = pending;
        status.conflict_count = conflicts;
        self.observations
            .overlay(&mut status, self.generation.load(Ordering::Acquire));
        Ok(status)
    }
    fn current(&self, generation: u64) -> bool {
        !self.closing.load(Ordering::Acquire)
            && self.generation.load(Ordering::Acquire) == generation
    }
    pub fn restore(self: &Arc<Self>) {
        if self.blocked.is_some() {
            return;
        }
        let this = self.clone();
        tauri::async_runtime::spawn(async move {
            let _owner = this.lifecycle.lock().await;
            let generation = this.generation.load(Ordering::Acquire);
            let result = async {
                let auth = this.auth().await?;
                if let Some(identity) = auth.retained_identity().await {
                    let cached = this
                        .data
                        .lock()
                        .map_err(|_| Error::Storage)?
                        .binding
                        .clone();
                    if this.current(generation) {
                        if let Some(binding) =
                            cached.filter(|b| session_identity_matches(b, &identity))
                        {
                            let enabled = binding.enabled
                                && !private::adoption_pending(&this.root)?
                                && !this.sync.account_adoption_needed(
                                    &binding.workspace_id,
                                    &binding.device_id,
                                )?;
                            this.mutate(|d| {
                                if this.current(generation) {
                                    present_retained_session(
                                        &mut d.status,
                                        &binding,
                                        &identity,
                                        enabled,
                                    )
                                }
                            });
                        }
                    }
                }
                if let Some(identity) = auth.restore().await? {
                    if let Err(error) = this.bind(&identity, generation, false).await {
                        // A crash between grant commit and first binding must
                        // not leave a hidden usable grant blocking SignIn. An
                        // already bound account keeps its grant when offline.
                        let unbound = this
                            .data
                            .lock()
                            .map_err(|_| Error::Storage)?
                            .binding
                            .is_none();
                        if unbound {
                            let _ = auth.logout().await;
                        }
                        return Err(error);
                    }
                    if this.current(generation) {
                        this.start_network().await?;
                    }
                }
                Ok::<_, Error>(())
            }
            .await;
            if let Err(error) = result {
                if this.current(generation) {
                    this.fail(error);
                    this.cleanup_status().await;
                }
            }
        });
    }
    async fn bind(
        &self,
        identity: &account_auth::Identity,
        generation: u64,
        fresh_login: bool,
    ) -> Result<()> {
        if identity.issuer != config::ISSUER {
            return Err(Error::OwnershipMismatch);
        }
        let old = self
            .data
            .lock()
            .map_err(|_| Error::Storage)?
            .binding
            .clone();
        let auth = self.auth().await?;
        let token = auth.access_token(Duration::from_secs(60), false).await?;
        let enrollment = enrollment::Enrollment::new(config::origin()?)?;
        let profile = enrollment.profile(token.secret()).await?;
        if profile.subject != identity.subject || profile.issuer != identity.issuer {
            return Err(Error::OwnershipMismatch);
        }
        if !self.current(generation) {
            return Err(Error::Cancelled);
        }
        let binding = prepare_session_binding(
            &self.sync,
            &self.root,
            old.as_ref(),
            identity,
            profile,
            fresh_login,
        )?;
        if let Some(old) = &old {
            private::remember_session(&self.root, old)?;
        }
        private::remember_session(&self.root, &binding)?;
        private::write(&self.root.join("binding.json"), &binding)?;
        self.mutate(|d| {
            d.binding = Some(binding.clone());
            d.status.profile = Some(Profile {
                subject: identity.subject.clone(),
                display_name: safe_text(&identity.display_name, 120),
                username: identity.username.as_ref().map(|v| safe_text(v, 120)),
            });
            d.status.enabled = binding.enabled;
            d.status.state = Phase::Paused;
            d.status.error = None;
        });
        Ok(())
    }
    fn registry(&self) -> Result<private::Registry> {
        self.registry
            .lock()
            .map_err(|_| Error::Storage)?
            .as_ref()
            .cloned()
            .ok_or(Error::Storage)
    }
    fn next_registration(&self) -> Result<private::Registry> {
        let mut registry = self.registry.lock().map_err(|_| Error::Storage)?;
        private::next_registration(&self.root, registry.as_mut().ok_or(Error::Storage)?)
    }
    async fn start_network(self: &Arc<Self>) -> Result<()> {
        let generation = self.generation.load(Ordering::Acquire);
        if !self.current(generation) {
            return Err(Error::Cancelled);
        }
        let mut slot = self.network.lock().await;
        if let Some(network) = slot.as_ref().filter(|n| !n.task.is_finished()) {
            network.control.refresh.notify_one();
            return Ok(());
        }
        if let Some(old) = slot.take() {
            old.control.configure(false);
            old.stop.cancel();
            let _ = old.task.await;
        }
        let binding = self
            .data
            .lock()
            .map_err(|_| Error::Storage)?
            .binding
            .clone()
            .ok_or(Error::Authentication)?;
        let auth = self.auth().await?;
        std::fs::create_dir_all(&self.cache)?;
        private::directory(&self.cache)?;
        let client = cybergrid_sdk::Client::new(cybergrid_sdk::Config {
            base_url: config::origin()?,
            app_id: config::CLIENT_ID.into(),
            cloudflared: Some(provider::configuration(&self.cache)?),
            ..Default::default()
        })?;
        let stop = CancellationToken::new();
        let control = Arc::new(worker::Control::default());
        control.configure(binding.enabled);
        let catalog = Arc::new(directory::Catalog::default());
        let (requests, receiver) = tokio::sync::mpsc::channel(1);
        let weak = Arc::downgrade(self);
        let task_stop = stop.clone();
        let task_control = control.clone();
        let task_catalog = catalog.clone();
        let task = tokio::spawn(async move {
            let result = worker::run(
                weak.clone(),
                generation,
                binding,
                auth,
                client,
                task_control,
                task_catalog,
                task_stop,
                receiver,
            )
            .await;
            if let (Err(error), Some(this)) = (result, weak.upgrade()) {
                this.fail_current(generation, error);
            }
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
    async fn stop_network(&self) {
        self.observations.close();
        if let Some(network) = self.network.lock().await.take() {
            network.control.configure(false);
            network.stop.cancel();
            let _ = network.task.await;
        }
        self.sync.pause_account();
        self.mutate(|d| {
            d.status.devices.clear();
        });
    }
    pub async fn command(self: &Arc<Self>, command: Command) -> Result<Status> {
        if self.closing.load(Ordering::Acquire) {
            return Err(Error::Cancelled);
        }
        if !matches!(command, Command::Status {}) {
            if let Some(error) = self.blocked {
                return Err(error);
            }
        }
        match command {
            Command::Status {} => {}
            Command::SignIn { surface } | Command::SignUp { surface } => {
                let _owner = self.lifecycle.try_lock().map_err(|_| Error::Busy)?;
                if self.attempt.lock().await.is_some() {
                    return Err(Error::Busy);
                }
                let reauthorize =
                    authorization_mode(&self.data.lock().map_err(|_| Error::Storage)?.status)?;
                // Never turn an offline retained session into a new login or
                // change its enable intent before the sole grant owner agrees.
                if !reauthorize && self.auth().await?.retained_identity().await.is_some() {
                    return Err(Error::Busy);
                }
                self.stop_network().await;
                self.sync.pause_for_account()?;
                self.set_enabled(false)?;
                let generation = self.generation.fetch_add(1, Ordering::AcqRel) + 1;
                let stop = CancellationToken::new();
                *self.attempt.lock().await = Some(Attempt {
                    cancel: None,
                    stop: stop.clone(),
                    mac: None,
                });
                self.mutate(|d| {
                    d.status.state = Phase::Authorizing;
                    d.status.profile = None;
                    d.status.enabled = false;
                    d.status.error = None;
                });
                let signup = matches!(command, Command::SignUp { .. });
                let this = self.clone();
                tauri::async_runtime::spawn(async move {
                    let _owner = this.lifecycle.lock().await;
                    let result = this
                        .login(signup, reauthorize, surface, generation, stop)
                        .await;
                    this.attempt.lock().await.take();
                    this.android.lock().await.take();
                    if let Ok(mut p) = this.presentation.lock() {
                        if p.as_ref().is_some_and(|p| p.generation == generation) {
                            p.take();
                        }
                    }
                    if let Err(error) = result {
                        if this.current(generation) {
                            if error == Error::Cancelled {
                                this.mutate(|d| d.status = Status::default());
                            } else {
                                this.fail(error);
                            }
                            this.cleanup_status().await;
                        }
                    }
                });
            }
            Command::OpenLoginInBrowser {} => {
                return self.open_login_in_browser(None).await;
            }
            Command::Cancel {} => {
                self.generation.fetch_add(1, Ordering::AcqRel);
                if let Some(attempt) = self.attempt.lock().await.as_ref() {
                    if let Some(cancel) = &attempt.cancel {
                        cancel.cancel();
                    }
                    attempt.stop.cancel();
                    if let Some(mac) = &attempt.mac {
                        mac.cancel();
                    }
                }
                let _owner = self.lifecycle.lock().await;
                self.stop_network().await;
                self.mutate(|d| {
                    if d.status.state == Phase::Authorizing {
                        d.status = Status::default();
                    }
                });
            }
            Command::SignOut {} => {
                // Seal network first, before a potentially failing remote revoke.
                self.generation.fetch_add(1, Ordering::AcqRel);
                if let Some(attempt) = self.attempt.lock().await.as_ref() {
                    if let Some(cancel) = &attempt.cancel {
                        cancel.cancel();
                    }
                    attempt.stop.cancel();
                    if let Some(mac) = &attempt.mac {
                        mac.cancel();
                    }
                }
                let _owner = self.lifecycle.lock().await;
                self.stop_network().await;
                if let Err(error) = self.auth().await?.logout().await {
                    self.fail(error.into());
                    self.cleanup_status().await;
                    return self.snapshot();
                }
                self.set_enabled(false)?;
                self.sync.replay_adoption_release()?;
                private::clear_session(&self.root)?;
                self.mutate(|d| {
                    d.binding = None;
                    d.status = Status::default();
                });
            }
            Command::SetEnabled { enabled } => {
                let _owner = self.lifecycle.try_lock().map_err(|_| Error::Busy)?;
                let binding = {
                    let d = self.data.lock().map_err(|_| Error::Storage)?;
                    if d.status.profile.is_none() {
                        return Err(Error::Authentication);
                    }
                    d.binding.clone().ok_or(Error::Authentication)?
                };
                // Seal content immediately. Directory/SDK remain owned and alive.
                if let Some(network) = self.network.lock().await.as_ref() {
                    network.control.configure(false);
                }
                self.sync.pause_for_account()?;
                self.set_enabled(false)?;
                if enabled
                    && self
                        .sync
                        .account_adoption_needed(&binding.workspace_id, &binding.device_id)?
                {
                    if let Err(error) = self
                        .sync
                        .account_adoption_preflight(&binding.workspace_id, &binding.device_id)
                    {
                        self.fail(error.into());
                        return self.snapshot();
                    }
                    private::begin_adoption(&self.root)?;
                }
                self.set_enabled(enabled)?;
                self.start_network().await?;
                if let Some(network) = self.network.lock().await.as_ref() {
                    network.control.configure(enabled);
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
                let restore = {
                    let d = self.data.lock().map_err(|_| Error::Storage)?;
                    network_recovery(&d.status, d.binding.is_some())
                };
                if restore {
                    let generation = self.generation.fetch_add(1, Ordering::AcqRel) + 1;
                    self.stop_network().await;
                    let result = recovery::run(self, generation).await;
                    if self.current(generation) {
                        if let Err(error) = result {
                            self.fail(error);
                        }
                    }
                } else {
                    if self
                        .data
                        .lock()
                        .map_err(|_| Error::Storage)?
                        .status
                        .profile
                        .is_none()
                    {
                        return Err(Error::Authentication);
                    }
                    // Refresh metadata only. Never wake replication or restart a live SDK owner.
                    self.start_network().await?;
                }
            }
            Command::RenameDevice { name } => {
                let _owner = self.lifecycle.try_lock().map_err(|_| Error::Busy)?;
                if self
                    .data
                    .lock()
                    .map_err(|_| Error::Storage)?
                    .status
                    .profile
                    .is_none()
                {
                    return Err(Error::Authentication);
                }
                let renamed = {
                    let mut slot = self.registry.lock().map_err(|_| Error::Storage)?;
                    let value = slot.as_mut().ok_or(Error::Storage)?;
                    let mut next = value.clone();
                    next.name = private::device_name(&name)?;
                    private::write_registry(&self.root, &next)?;
                    *value = next;
                    (value.registry_device_id.clone(), value.name.clone())
                };
                self.mutate(|d| {
                    if let Some(device) = d
                        .status
                        .devices
                        .iter_mut()
                        .find(|device| device.id == renamed.0)
                    {
                        device.name = renamed.1;
                    }
                });
                if let Some(network) = self.network.lock().await.as_ref() {
                    network.control.refresh.notify_one();
                }
            }
            Command::SyncDevice {
                device_id,
                direction,
            } => {
                // Operation ownership is separate from lifecycle: status, disable
                // and signout remain callable throughout bounded network IO.
                let _operation = self.operation.try_lock().map_err(|_| Error::Busy)?;
                let generation = self.generation.load(Ordering::Acquire);
                let (receiver, control, content_epoch) = {
                    let _owner = self.lifecycle.try_lock().map_err(|_| Error::Busy)?;
                    if !self.data.lock().map_err(|_| Error::Storage)?.status.enabled {
                        return Err(Error::SyncNotEnabled);
                    }
                    let network = self.network.lock().await;
                    let network = network.as_ref().ok_or(Error::DirectoryUnavailable)?;
                    if !network.control.ready() {
                        return Err(Error::SyncNotEnabled);
                    }
                    let content_epoch = network.control.epoch()?;
                    let target = network
                        .catalog
                        .target(&device_id, &self.registry()?.registry_device_id)?;
                    let permit = network.control.reserve(content_epoch)?;
                    let (done, receiver) = oneshot::channel();
                    network
                        .requests
                        .try_send(worker::DeviceRequest {
                            target,
                            direction,
                            epoch: content_epoch,
                            _permit: permit,
                            done,
                        })
                        .map_err(|_| Error::Busy)?;
                    self.mutate(|d| {
                        d.status.device_operation = Some(types::DeviceOperation {
                            device_id: device_id.clone(),
                            direction,
                            phase: types::DeviceOperationPhase::Running,
                            started_at: unix_ms(),
                            finished_at: None,
                        });
                        d.status.error = None;
                    });
                    (receiver, network.control.clone(), content_epoch)
                };
                let mut outcome = tokio::time::timeout(Duration::from_secs(185), receiver)
                    .await
                    .map_err(|_| Error::Sync)
                    .and_then(|r| r.map_err(|_| Error::Cancelled))
                    .and_then(|r| r);
                if !self.current(generation) {
                    return Err(Error::Cancelled);
                }
                if !control.current(content_epoch) {
                    outcome = Err(Error::Cancelled);
                }
                self.mutate(|d| {
                    if !self.current(generation) {
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
                });
            }
        }
        self.cleanup_status().await;
        self.snapshot()
    }
    fn set_enabled(&self, enabled: bool) -> Result<()> {
        let mut data = self.data.lock().map_err(|_| Error::Storage)?;
        if let Some(binding) = &mut data.binding {
            let mut next = binding.clone();
            next.enabled = enabled;
            private::write(&self.root.join("binding.json"), &next)?;
            *binding = next;
        } else if enabled {
            return Err(Error::Authentication);
        }
        data.status.enabled = enabled;
        Ok(())
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
        reauthorize: bool,
        requested_surface: types::AuthorizationSurface,
        generation: u64,
        stop: CancellationToken,
    ) -> Result<()> {
        let auth = self.auth().await?;
        // Bind the callback before opening the browser. Android uses a single
        // native deep-link owner and accepts only the registered exact URI.
        #[cfg(not(target_os = "android"))]
        let mac = callback::Callback::start()
            .await
            .map_err(|_| Error::NetworkAt(types::NetworkStage::CallbackListen))?;
        #[cfg(not(target_os = "android"))]
        let _callback_lease = callback::Lease(mac.clone());
        if reauthorize {
            // Only an explicit SignIn/SignUp from an error state can replace
            // an existing grant. The lifecycle owner has already sealed the
            // network, and a failed revoke must never start a new transaction.
            auth.logout().await.map_err(|_| Error::CleanupRequired)?;
        }
        if !self.current(generation) || stop.is_cancelled() {
            return Err(Error::Cancelled);
        }
        let (transaction, url) = auth
            .begin_authorization(config::redirect(), signup)
            .await
            .map_err(|error| match error {
                // A retained grant requires an explicit cleanup action, not
                // a retry loop presenting the same Busy result forever.
                account_auth::AuthError::Busy => Error::CleanupRequired,
                error => error.into(),
            })?;
        let cancel = transaction.cancellation_handle();
        if !self.current(generation) || stop.is_cancelled() {
            cancel.cancel();
            return Err(Error::Cancelled);
        }
        {
            let mut attempt = self.attempt.lock().await;
            if let Some(a) = attempt.as_mut() {
                a.cancel = Some(cancel.clone());
                #[cfg(not(target_os = "android"))]
                {
                    a.mac = Some(mac.clone());
                }
            }
        }
        let presentation = surface::Presentation::new(
            self,
            requested_surface,
            generation,
            url,
            stop.clone(),
            cancel.clone(),
        )?;
        let _presentation_lease = surface::Lease(presentation.clone());
        *self.presentation.lock().map_err(|_| Error::Storage)? = Some(presentation.clone());
        #[cfg(target_os = "android")]
        let receiver = {
            let (tx, rx) = oneshot::channel();
            *self.android.lock().await = Some(AndroidCallback {
                generation,
                instance: presentation.instance.clone(),
                sender: tx,
            });
            rx
        };
        let deadline = tokio::time::Instant::now() + Duration::from_secs(600);
        tokio::select! {
            biased;
            _ = stop.cancelled() => return Err(presentation.stopped_error()),
            result = tokio::time::timeout_at(deadline, presentation.open(self)) => result.map_err(|_| Error::Authentication)??,
        };
        let callback = async {
            #[cfg(not(target_os = "android"))]
            {
                mac.wait()
                    .await
                    .map_err(|_| Error::NetworkAt(types::NetworkStage::CallbackReceive))?
                    .parse()
                    .map_err(|_| Error::Authentication)
            }
            #[cfg(target_os = "android")]
            {
                receiver.await.map_err(|_| Error::Cancelled)
            }
        };
        let value = tokio::select! {_=stop.cancelled()=>{cancel.cancel();#[cfg(not(target_os="android"))]mac.cancel();return Err(presentation.stopped_error())},result=tokio::time::timeout_at(deadline,callback)=>result.map_err(|_|Error::Authentication)??};
        presentation.completing();
        let identity = auth.complete_callback(transaction, value).await?;
        let outcome = async {
            if !self.current(generation) || stop.is_cancelled() {
                return Err(Error::Cancelled);
            }
            if let Err(error) = self.bind(&identity, generation, true).await {
                // Complete_callback committed a grant, but no account was
                // accepted. Settle revocation before returning the bind error;
                // failed revocation is surfaced by cleanup_status below.
                let _ = auth.logout().await;
                return Err(error);
            }
            if !self.current(generation) || stop.is_cancelled() {
                return Err(Error::Cancelled);
            }
            self.start_network().await
        }
        .await;
        if !self.current(generation) || stop.is_cancelled() {
            self.stop_network().await;
            if let Err(error) = auth.logout().await {
                self.mutate(|d| {
                    d.status.profile = Some(Profile {
                        subject: identity.subject,
                        display_name: safe_text(&identity.display_name, 120),
                        username: None,
                    });
                    d.status.state = Phase::Error;
                    d.status.error = Some(Error::from(error).safe());
                });
            } else {
                self.set_enabled(false)?;
                self.mutate(|d| d.status = Status::default());
            }
            return Err(Error::Cancelled);
        }
        outcome?;
        Ok(())
    }
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
            let _ = sender.send(url); // full validate_callback remains in AuthClient.
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
            if enabled {
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
                if let Some(c) = &a.cancel {
                    c.cancel();
                }
                a.stop.cancel();
                if let Some(mac) = &a.mac {
                    mac.cancel();
                }
            }
            let _owner = this.lifecycle.lock().await;
            this.stop_network().await;
            this.closed.store(true, Ordering::Release);
            app.exit(0);
        });
    }
}
impl recovery::Host for Arc<Runtime> {
    fn current(&self, generation: u64) -> bool {
        Runtime::current(self, generation)
    }
    async fn restore(&self) -> Result<account_auth::Identity> {
        self.auth()
            .await?
            .restore()
            .await?
            .ok_or(Error::AuthenticationAt(
                types::NetworkStage::IdentitySession,
            ))
    }
    async fn bind(&self, identity: account_auth::Identity, generation: u64) -> Result<bool> {
        Runtime::bind(self, &identity, generation, false).await?;
        Ok(self
            .data
            .lock()
            .map_err(|_| Error::Storage)?
            .binding
            .as_ref()
            .ok_or(Error::Authentication)?
            .enabled)
    }
    async fn start(&self) -> Result<()> {
        self.start_network().await
    }
}
fn unix_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(types::MAX_SAFE_INTEGER as u128) as u64
}
fn session_identity_matches(binding: &private::Binding, identity: &account_auth::Identity) -> bool {
    identity.issuer == config::ISSUER
        && binding.issuer == identity.issuer
        && binding.subject == identity.subject
}
fn present_retained_session(
    status: &mut Status,
    binding: &private::Binding,
    identity: &account_auth::Identity,
    enabled: bool,
) {
    if !session_identity_matches(binding, identity) {
        return;
    }
    status.profile = Some(Profile {
        subject: identity.subject.clone(),
        display_name: safe_text(&identity.display_name, 120),
        username: identity.username.as_ref().map(|name| safe_text(name, 120)),
    });
    status.enabled = enabled;
    status.state = Phase::Paused;
}
// Shared by real bind and device-free host fixtures; no local workspace check
// belongs in authentication. Preparation may create only private session keys.
fn prepare_session_binding(
    sync: &adapter::Runtime,
    root: &Path,
    old: Option<&private::Binding>,
    identity: &account_auth::Identity,
    profile: enrollment::Profile,
    fresh_login: bool,
) -> Result<private::Binding> {
    if identity.issuer != config::ISSUER
        || profile.issuer != identity.issuer
        || profile.subject != identity.subject
    {
        return Err(Error::OwnershipMismatch);
    }
    // A login session selects an account, never the ownership of local content.
    // Only a retained, exactly matching session may preserve enable intent.
    let retained = old.filter(|b| {
        !fresh_login
            && b.issuer == identity.issuer
            && b.subject == identity.subject
            && b.product_id == profile.product_id
            && b.workspace_id == profile.workspace_id
    });
    let store = sync.account_store_identity()?;
    let previous = if let Some(store) = &store {
        if store.workspace_id == profile.workspace_id {
            let matches = |b: &private::Binding| {
                b.device_id == store.device_id
                    && session_identity_matches(b, identity)
                    && b.product_id == profile.product_id
                    && b.workspace_id == profile.workspace_id
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
        product_id: profile.product_id.clone(),
        workspace_id: profile.workspace_id.clone(),
        device_id: noise.device_id()?,
        noise_public_key: noise.public_key()?,
        enabled: retained.is_some_and(|b| b.enabled)
            && !private::adoption_pending(root)?
            && !sync.account_adoption_needed(&profile.workspace_id, &device)?,
    };
    if retained.is_some_and(|b| b.noise_public_key != binding.noise_public_key) {
        return Err(Error::OwnershipMismatch);
    }
    Ok(binding)
}
fn network_recovery(status: &Status, bound: bool) -> bool {
    bound
        && status.state == Phase::Error
        && status.error.as_ref().is_some_and(|error| {
            error.code == "account_network"
                || (error.code == "account_authentication"
                    && error.stage == Some(types::NetworkStage::AuthorizationProvider)
                    && error.provider_reason == Some(cybergrid_sdk::AuthProviderFailure::Network))
        })
}
fn authorization_mode(status: &Status) -> Result<bool> {
    match status.state {
        Phase::Error
            if status
                .error
                .as_ref()
                .is_some_and(types::SafeError::refresh_rejected) =>
        {
            Ok(true)
        }
        Phase::Error
            if status.profile.is_none()
                && status
                    .error
                    .as_ref()
                    .is_some_and(types::SafeError::initial_authorization_retry) =>
        {
            Ok(false)
        }
        Phase::SignedOut if status.profile.is_none() => Ok(false),
        _ => Err(Error::Busy),
    }
}
fn safe_text(value: &str, max: usize) -> String {
    value
        .chars()
        .filter(|c| !c.is_control())
        .take(max)
        .collect()
}
fn trusted_application_origin(source: &url::Url) -> bool {
    // Custom tauri URLs have opaque Url::origin(); compare their parsed parts
    // instead of either rejecting production macOS or trusting any opaque URL.
    !source[..url::Position::BeforeHost].contains('@')
        && source.port().is_none()
        && ((source.scheme() == "tauri" && source.host_str() == Some("localhost"))
            || (source.scheme() == "http" && source.host_str() == Some("tauri.localhost")))
}
#[cfg(test)]
mod tests {
    use super::*;
    struct SessionWindows;
    impl adapter::WindowHost for SessionWindows {
        fn participants(&self) -> std::collections::HashSet<String> {
            std::collections::HashSet::from(["main".into()])
        }
        fn emit(&self, _: &str, _: &serde_json::Value) -> crate::store::Result<()> {
            Ok(())
        }
    }
    #[test]
    fn login_sessions_a_out_b_out_a_preserve_manual_library_and_never_inherit_enable() {
        use crate::{session::Session, store::Store};
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(dir.path()).unwrap();
        store
            .action(serde_json::json!({"type":"createNote"}))
            .unwrap();
        let shared = Arc::new((Mutex::new(Session::new(store)), std::sync::Condvar::new()));
        let sync =
            adapter::Runtime::new(shared.clone(), dir.path().into(), Arc::new(SessionWindows))
                .unwrap();
        let token = shared.0.lock().unwrap().sync_media_token();
        sync.command(
            adapter::Command::StartHost {
                device_name: "fixture".into(),
                port: 0,
            },
            "main",
            &token,
        )
        .unwrap();
        let old_workspace = shared
            .0
            .lock()
            .unwrap()
            .store
            .sync_identity()
            .unwrap()
            .unwrap();
        let before = shared.0.lock().unwrap().workspace().unwrap();
        sync.pause_for_account().unwrap();
        let root = dir.path().join(".account");
        private::directory(&root).unwrap();
        let mut old = None;
        let mut devices = std::collections::HashSet::new();
        let mut keys = std::collections::HashSet::new();
        let mut workspaces = std::collections::HashMap::new();
        for owner in ["fixture-a", "fixture-b", "fixture-a"] {
            let identity = account_auth::Identity {
                issuer: config::ISSUER.into(),
                subject: owner.into(),
                display_name: owner.into(),
                username: None,
            };
            let workspace = workspaces
                .entry(owner)
                .or_insert_with(|| uuid::Uuid::new_v4().to_string())
                .clone();
            let profile = enrollment::Profile {
                schema_version: 1,
                subject: owner.into(),
                issuer: config::ISSUER.into(),
                product_id: "cybernote".into(),
                workspace_id: workspace,
            };
            let binding =
                prepare_session_binding(&sync, &root, old.as_ref(), &identity, profile, true)
                    .unwrap();
            assert_eq!(binding.subject, owner);
            assert!(!binding.enabled);
            assert!(devices.insert(binding.device_id.clone()));
            assert!(keys.insert(binding.noise_public_key.clone()));
            private::write(&root.join("binding.json"), &binding).unwrap();
            // A successful sign-out archives public metadata, not a current owner.
            private::clear_session(&root).unwrap();
            old = private::read(&root.join("binding.json")).unwrap();
            assert!(old.is_none());
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
                old_workspace.workspace_id
            );
            assert_eq!(
                shared.0.lock().unwrap().workspace().unwrap()["notes"],
                before["notes"]
            );
        }
        sync.shutdown().unwrap();
    }
    #[test]
    fn returning_authenticated_account_reuses_only_exact_saved_store_device_and_key() {
        use crate::{session::Session, store::Store};
        let dir = tempfile::tempdir().unwrap();
        let shared = Arc::new((
            Mutex::new(Session::new(Store::open(dir.path()).unwrap())),
            std::sync::Condvar::new(),
        ));
        let sync =
            adapter::Runtime::new(shared.clone(), dir.path().into(), Arc::new(SessionWindows))
                .unwrap();
        let root = dir.path().join(".account");
        private::directory(&root).unwrap();
        let identity = |owner: &str| account_auth::Identity {
            issuer: config::ISSUER.into(),
            subject: owner.into(),
            display_name: owner.into(),
            username: None,
        };
        let workspace = uuid::Uuid::new_v4().to_string();
        let profile = |owner: &str| enrollment::Profile {
            schema_version: 1,
            issuer: config::ISSUER.into(),
            subject: owner.into(),
            product_id: "cybernote".into(),
            workspace_id: workspace.clone(),
        };
        let mut a = prepare_session_binding(&sync, &root, None, &identity("a"), profile("a"), true)
            .unwrap();
        shared
            .0
            .lock()
            .unwrap()
            .store
            .sync_enable_with_device(Some(&workspace), &a.device_id)
            .unwrap();
        let mut remote = Store::open(dir.path().join("synthetic-remote")).unwrap();
        remote.sync_enable(Some(&workspace)).unwrap();
        remote
            .action(serde_json::json!({"type":"createNote"}))
            .unwrap();
        remote.sync_flush().unwrap();
        let versions = remote
            .sync_inventory()
            .unwrap()
            .iter()
            .map(|v| remote.sync_version(&v.digest).unwrap())
            .collect();
        shared
            .0
            .lock()
            .unwrap()
            .store
            .sync_receive(versions)
            .unwrap();
        assert!(shared.0.lock().unwrap().store.sync_pending_count().unwrap() > 0);
        a.enabled = true;
        private::write(&root.join("binding.json"), &a).unwrap();
        private::clear_session(&root).unwrap();
        // Even a different authenticated subject on the same workspace cannot
        // borrow A's device. Nor does an unrelated current binding shadow A's record.
        let b = prepare_session_binding(&sync, &root, None, &identity("b"), profile("b"), true)
            .unwrap();
        assert_ne!(b.device_id, a.device_id);
        private::write(&root.join("binding.json"), &b).unwrap();
        private::clear_session(&root).unwrap();
        let returned =
            prepare_session_binding(&sync, &root, Some(&b), &identity("a"), profile("a"), true)
                .unwrap();
        assert_eq!(returned.device_id, a.device_id);
        assert_eq!(returned.noise_public_key, a.noise_public_key);
        assert!(!returned.enabled);
        assert!(!sync
            .account_adoption_needed(&workspace, &returned.device_id)
            .unwrap());
        // An ordinary pending inbox forbids changing namespaces, but must not
        // force a returning A through adoption instead of its normal apply path.
        sync.account_adoption_preflight(&workspace, &returned.device_id)
            .unwrap();
        assert!(sync
            .account_adoption_preflight(&workspace, &b.device_id)
            .is_err());
        let mut corrupt = a.clone();
        corrupt.noise_public_key = "not-the-existing-key".into();
        private::remember_session(&root, &corrupt).unwrap();
        let denied =
            prepare_session_binding(&sync, &root, None, &identity("a"), profile("a"), true)
                .unwrap();
        assert_ne!(denied.device_id, a.device_id);
        // A correctly named record must also contain the exact device identity.
        let path = root.join("sessions").join(format!("{}.json", a.device_id));
        private::write(&path, &b).unwrap();
        let denied =
            prepare_session_binding(&sync, &root, None, &identity("a"), profile("a"), true)
                .unwrap();
        assert_ne!(denied.device_id, a.device_id);
        sync.shutdown().unwrap();
    }
    #[test]
    fn offline_presentation_requires_retained_identity_and_preserves_pause_or_enable_intent() {
        let identity = account_auth::Identity {
            issuer: config::ISSUER.into(),
            subject: "a".into(),
            display_name: "A".into(),
            username: None,
        };
        let mut binding = private::Binding {
            issuer: config::ISSUER.into(),
            subject: "a".into(),
            workspace_id: uuid::Uuid::new_v4().to_string(),
            device_id: uuid::Uuid::new_v4().to_string(),
            product_id: "cybernote".into(),
            noise_public_key: "fixture".into(),
            enabled: false,
        };
        for enabled in [false, true] {
            binding.enabled = enabled;
            let mut status = Status::default();
            present_retained_session(&mut status, &binding, &identity, enabled);
            status.state = Phase::Error;
            status.error = Some(Error::NetworkAt(types::NetworkStage::IdentityRefresh).safe());
            assert_eq!(status.profile.as_ref().unwrap().subject, "a");
            assert_eq!(status.enabled, enabled);
            assert!(network_recovery(&status, true));
            assert_eq!(authorization_mode(&status), Err(Error::Busy));
            let mut other = identity.clone();
            other.subject = "b".into();
            let mut empty = Status::default();
            present_retained_session(&mut empty, &binding, &other, enabled);
            assert!(empty.profile.is_none());
            assert!(!empty.enabled);
        }
    }
    #[test]
    fn retained_session_enable_requires_exact_store_identity_and_no_interrupted_adoption() {
        use crate::{session::Session, store::Store};
        let dir = tempfile::tempdir().unwrap();
        let shared = Arc::new((
            Mutex::new(Session::new(Store::open(dir.path()).unwrap())),
            std::sync::Condvar::new(),
        ));
        let sync =
            adapter::Runtime::new(shared.clone(), dir.path().into(), Arc::new(SessionWindows))
                .unwrap();
        let root = dir.path().join(".account");
        private::directory(&root).unwrap();
        let identity = account_auth::Identity {
            issuer: config::ISSUER.into(),
            subject: "fixture-a".into(),
            display_name: "A".into(),
            username: None,
        };
        let workspace = uuid::Uuid::new_v4().to_string();
        let profile = || enrollment::Profile {
            schema_version: 1,
            issuer: config::ISSUER.into(),
            subject: "fixture-a".into(),
            product_id: "cybernote".into(),
            workspace_id: workspace.clone(),
        };
        let mut old =
            prepare_session_binding(&sync, &root, None, &identity, profile(), true).unwrap();
        old.enabled = true;
        // Persisted intent alone cannot automatically adopt a different DB.
        assert!(
            !prepare_session_binding(&sync, &root, Some(&old), &identity, profile(), false)
                .unwrap()
                .enabled
        );
        shared
            .0
            .lock()
            .unwrap()
            .store
            .sync_enable_with_device(Some(&workspace), &old.device_id)
            .unwrap();
        let retained =
            prepare_session_binding(&sync, &root, Some(&old), &identity, profile(), false).unwrap();
        assert_eq!(retained.device_id, old.device_id);
        assert!(retained.enabled);
        private::begin_adoption(&root).unwrap();
        assert!(
            !prepare_session_binding(&sync, &root, Some(&old), &identity, profile(), false)
                .unwrap()
                .enabled
        );
        private::complete_adoption(&root).unwrap();
        let mut bad = profile();
        bad.subject = "other".into();
        assert!(matches!(
            prepare_session_binding(&sync, &root, Some(&old), &identity, bad, true),
            Err(Error::OwnershipMismatch)
        ));
        let mut bad = identity.clone();
        bad.issuer = "https://untrusted.invalid".into();
        assert!(matches!(
            prepare_session_binding(&sync, &root, None, &bad, profile(), true),
            Err(Error::OwnershipMismatch)
        ));
        sync.shutdown().unwrap();
    }
    #[test]
    fn explicit_network_recovery_requires_bound_error_and_does_not_select_enable() {
        for enabled in [false, true] {
            for error in [
                Error::NetworkAt(types::NetworkStage::IdentityProvider),
                Error::ProviderAuthentication(cybergrid_sdk::AuthProviderFailure::Network),
            ] {
                let mut status = Status {
                    state: Phase::Error,
                    enabled,
                    error: Some(error.safe()),
                    ..Status::default()
                };
                assert!(network_recovery(&status, true));
                assert_eq!(status.enabled, enabled);
                assert!(!network_recovery(&status, false));
                for phase in [
                    Phase::Paused,
                    Phase::Ready,
                    Phase::SignedOut,
                    Phase::Authorizing,
                    Phase::Connecting,
                ] {
                    status.state = phase;
                    assert!(!network_recovery(&status, true));
                }
            }
            for error in [
                Error::Configuration,
                Error::Storage,
                Error::OwnershipMismatch,
                Error::CleanupRequired,
                Error::TokenResponseInvalid,
                Error::CoordinationProtocol,
                Error::AuthenticationAt(types::NetworkStage::IdentityRefresh),
            ] {
                let status = Status {
                    state: Phase::Error,
                    enabled,
                    error: Some(error.safe()),
                    ..Status::default()
                };
                assert!(!network_recovery(&status, true));
            }
        }
    }

    #[test]
    fn explicit_error_reauthentication_can_cleanup_but_healthy_owner_is_preserved() {
        assert_eq!(authorization_mode(&Status::default()), Ok(false));
        for with_profile in [false, true] {
            let mut status = Status {
                state: Phase::Error,
                error: Some(Error::AuthenticationAt(types::NetworkStage::IdentityRefresh).safe()),
                ..Status::default()
            };
            if with_profile {
                status.profile = Some(Profile {
                    subject: "synthetic-owner".into(),
                    display_name: "Synthetic".into(),
                    username: None,
                });
            }
            assert_eq!(authorization_mode(&status), Ok(true));
            for phase in [
                Phase::Ready,
                Phase::Paused,
                Phase::Connecting,
                Phase::Authorizing,
            ] {
                status.state = phase;
                assert_eq!(authorization_mode(&status), Err(Error::Busy));
            }
        }
    }
    #[test]
    fn replacement_authorization_rejects_network_unknown_and_local_failures() {
        for with_profile in [false, true] {
            for error in [
                Error::Network,
                Error::Configuration,
                Error::Storage,
                Error::CleanupRequired,
                Error::CoordinationProtocol,
                Error::Authentication,
                Error::AuthenticationAt(types::NetworkStage::Coordinator),
                Error::ProviderAuthentication(cybergrid_sdk::AuthProviderFailure::Network),
                Error::ProviderAuthentication(cybergrid_sdk::AuthProviderFailure::IdentityRejected),
                Error::ProviderAuthentication(
                    cybergrid_sdk::AuthProviderFailure::TokenResponseInvalid,
                ),
            ] {
                let mut status = Status {
                    state: Phase::Error,
                    error: Some(error.safe()),
                    ..Status::default()
                };
                if with_profile {
                    status.profile = Some(Profile {
                        subject: "fixture-owner".into(),
                        display_name: "Fixture".into(),
                        username: None,
                    });
                }
                assert_eq!(authorization_mode(&status), Err(Error::Busy));
            }
        }
        for error in [
            Error::NetworkAt(types::NetworkStage::IdentityProvider),
            Error::InvalidCallback,
            Error::CodeExchangeRejected,
            Error::TokenResponseInvalid,
            Error::InvalidIdentity,
            Error::Cancelled,
            Error::OwnershipMismatch,
        ] {
            let mut status = Status {
                state: Phase::Error,
                error: Some(error.safe()),
                ..Status::default()
            };
            assert_eq!(authorization_mode(&status), Ok(false)); // begin only; no logout
            status.profile = Some(Profile {
                subject: "fixture-owner".into(),
                display_name: "Fixture".into(),
                username: None,
            });
            assert_eq!(authorization_mode(&status), Err(Error::Busy));
        }
        let status = Status {
            state: Phase::Error,
            error: Some(
                Error::ProviderAuthentication(cybergrid_sdk::AuthProviderFailure::RefreshFailed)
                    .safe(),
            ),
            ..Status::default()
        };
        assert_eq!(authorization_mode(&status), Ok(true));
        assert_eq!(
            authorization_mode(&Status {
                state: Phase::Error,
                ..Status::default()
            }),
            Err(Error::Busy)
        );
    }
    #[test]
    fn unbound_profile_request_retry_begins_without_replacement_or_enabling() {
        for enabled in [false, true] {
            for error in [
                Error::NetworkAt(types::NetworkStage::CoordinatorProfile),
                Error::AuthenticationAt(types::NetworkStage::CoordinatorProfile),
                Error::RequestAt(
                    types::NetworkStage::CoordinatorProfile,
                    types::RequestFailure::Timeout,
                ),
                Error::RequestAt(
                    types::NetworkStage::CoordinatorProfile,
                    types::RequestFailure::HttpStatus(reqwest::StatusCode::UNAUTHORIZED),
                ),
            ] {
                let mut status = Status {
                    state: Phase::Error,
                    enabled,
                    error: Some(error.safe()),
                    ..Status::default()
                };
                assert_eq!(authorization_mode(&status), Ok(false)); // ordinary begin, never logout
                assert_eq!(status.enabled, enabled);
                status.profile = Some(Profile {
                    subject: "synthetic-owner".into(),
                    display_name: "Synthetic".into(),
                    username: None,
                });
                assert_eq!(authorization_mode(&status), Err(Error::Busy));
            }
            for stage in [
                types::NetworkStage::CoordinatorEnrollment,
                types::NetworkStage::CoordinatorJwks,
            ] {
                let status = Status {
                    state: Phase::Error,
                    enabled,
                    error: Some(Error::RequestAt(stage, types::RequestFailure::Timeout).safe()),
                    ..Status::default()
                };
                assert_eq!(authorization_mode(&status), Err(Error::Busy));
            }
        }
    }
    #[test]
    fn native_ipc_trusts_exact_app_origins_and_strict_command_types() {
        for error in [Error::WindowInvalid, Error::Busy] {
            let value = serde_json::to_value(error.safe()).unwrap();
            assert_eq!(value["code"], error.code());
            assert_eq!(value.as_object().unwrap().len(), 2); // SafeError, no old AppError.commit
            assert!(value["message"].is_string());
        }
        for raw in ["tauri://localhost/index.html", "http://tauri.localhost/"] {
            assert!(trusted_application_origin(&raw.parse().unwrap()));
        }
        for raw in [
            "about:blank",
            "evil://localhost/",
            "tauri://evil/",
            "http://tauri.localhost.evil/",
            "http://tauri.localhost:8000/",
            "tauri://attacker@localhost/",
        ] {
            assert!(!trusted_application_origin(&raw.parse().unwrap()), "{raw}");
        }
        for value in [
            serde_json::json!({"type":"status","url":"https://evil.test"}),
            serde_json::json!({"type":"setEnabled","enabled":"true"}),
            serde_json::json!({"type":"refreshToken","token":"synthetic"}),
            serde_json::json!({"type":"signIn","surface":null}),
            serde_json::json!({"type":"signUp","surface":"customTabs"}),
            serde_json::json!({"type":"signIn","surface":"embedded","url":"https://evil.test"}),
            serde_json::json!({"type":"openLoginInBrowser","surface":"browser"}),
            serde_json::json!({"type":"openLoginInBrowser","url":null}),
            serde_json::json!({"type":"openLoginInBrowser","generation":1}),
        ] {
            assert!(serde_json::from_value::<Command>(value).is_err());
        }
        assert!(serde_json::from_value::<Command>(serde_json::json!({"type":"status"})).is_ok());
        for kind in ["signIn", "signUp"] {
            let legacy =
                serde_json::from_value::<Command>(serde_json::json!({"type":kind})).unwrap();
            assert!(matches!(
                legacy,
                Command::SignIn {
                    surface: types::AuthorizationSurface::Browser
                } | Command::SignUp {
                    surface: types::AuthorizationSurface::Browser
                }
            ));
            for surface in ["embedded", "browser"] {
                assert!(serde_json::from_value::<Command>(
                    serde_json::json!({"type":kind,"surface":surface})
                )
                .is_ok());
            }
        }
        assert!(serde_json::from_value::<Command>(
            serde_json::json!({"type":"openLoginInBrowser"})
        )
        .is_ok());
    }
    #[tokio::test]
    async fn late_embedded_callback_cannot_consume_replacement_receiver() {
        let (tx, mut receiver) = oneshot::channel();
        let slot = Arc::new(AsyncMutex::new(Some(AndroidCallback {
            generation: 2,
            instance: "new-instance".into(),
            sender: tx,
        })));
        // An old scheduled callback waits on the guard while the next owner
        // has already installed its receiver. Consumption must recheck identity.
        let guard = slot.lock().await;
        let queued = slot.clone();
        let old = tokio::spawn(async move {
            let mut guard = queued.lock().await;
            take_android_callback(&mut guard, 1, "old-instance").is_none()
        });
        drop(guard);
        assert!(old.await.unwrap());
        assert!(matches!(
            receiver.try_recv(),
            Err(oneshot::error::TryRecvError::Empty)
        ));
        let mut guard = slot.lock().await;
        // Generation alone is insufficient: a distinct instance cannot alias it.
        assert!(take_android_callback(&mut guard, 2, "old-instance").is_none());
        assert!(matches!(
            receiver.try_recv(),
            Err(oneshot::error::TryRecvError::Empty)
        ));
        let current = take_android_callback(&mut guard, 2, "new-instance").unwrap();
        let callback: url::Url = "com.local.notesclone.auth://callback?code=fixture&state=fixture"
            .parse()
            .unwrap();
        current.send(callback.clone()).unwrap();
        assert_eq!(receiver.await.unwrap(), callback);
        assert!(guard.is_none());
    }
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
