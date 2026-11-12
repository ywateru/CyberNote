//! One native account owner per leased data root. Renderer commands expose only
//! safe status; grants, enrollment proofs, invitations and Noise keys stay native.
mod callback;
mod config;
pub(crate) mod enrollment;
mod private;
mod provider;
mod transport;
pub(crate) mod types;
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
struct Network {
    stop: CancellationToken,
    task: tokio::task::JoinHandle<()>,
    gate: Arc<enrollment::Gate>,
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
    attempt: AsyncMutex<Option<Attempt>>,
    android: AsyncMutex<Option<oneshot::Sender<url::Url>>>,
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
        cache: &Path,
    ) -> Result<Arc<Self>> {
        let directory = root.join(".account");
        let loaded = private::directory(&directory)
            .and_then(|_| private::read(&directory.join("binding.json")));
        let (binding, blocked) = match loaded {
            Ok(binding) => (binding, None),
            Err(error) => (None, Some(error)),
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
            attempt: AsyncMutex::new(None),
            android: AsyncMutex::new(None),
            network: AsyncMutex::new(None),
            generation: AtomicU64::new(0),
            closing: AtomicBool::new(false),
            closed: AtomicBool::new(false),
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
        self.mutate(|d| {
            d.status.state = Phase::Error;
            if d.status.profile.is_none() {
                if let Some(binding) = &d.binding {
                    d.status.profile = Some(Profile {
                        subject: binding.subject.clone(),
                        display_name: "CyberNote 账户".into(),
                        username: None,
                    });
                }
            }
            d.status.error = Some(error.safe())
        })
    }
    pub fn snapshot(&self) -> Result<Status> {
        let mut status = self.data.lock().map_err(|_| Error::Storage)?.status.clone();
        let (pending, conflicts) = self.sync.account_metrics()?;
        status.pending_count = pending;
        status.conflict_count = conflicts;
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
                if let Some(identity) = auth.restore().await? {
                    if let Err(error) = this.bind(&identity).await {
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
    async fn bind(&self, identity: &account_auth::Identity) -> Result<()> {
        if identity.issuer != config::ISSUER {
            return Err(Error::OwnershipMismatch);
        }
        let old = self
            .data
            .lock()
            .map_err(|_| Error::Storage)?
            .binding
            .clone();
        if old
            .as_ref()
            .is_some_and(|b| b.issuer != identity.issuer || b.subject != identity.subject)
        {
            return Err(Error::OwnershipMismatch);
        }
        let auth = self.auth().await?;
        let token = auth.access_token(Duration::from_secs(60), false).await?;
        let enrollment = enrollment::Enrollment::new(config::origin()?)?;
        let profile = enrollment.profile(token.secret()).await?;
        if profile.subject != identity.subject || profile.issuer != identity.issuer {
            return Err(Error::OwnershipMismatch);
        }
        self.sync
            .check_account_workspace(&profile.workspace_id, old.is_some())?;
        let noise = self.sync.account_identity()?;
        let binding = private::Binding {
            issuer: identity.issuer.clone(),
            subject: identity.subject.clone(),
            product_id: profile.product_id,
            workspace_id: profile.workspace_id,
            device_id: noise.device_id()?,
            noise_public_key: noise.public_key()?,
            enabled: old.as_ref().is_some_and(|b| b.enabled),
        };
        if let Some(old) = old {
            if old != binding {
                return Err(Error::OwnershipMismatch);
            }
        }
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
    async fn start_network(self: &Arc<Self>) -> Result<()> {
        let generation = self.generation.load(Ordering::Acquire);
        if !self.current(generation) {
            return Err(Error::Cancelled);
        }
        self.stop_network().await;
        let binding = self
            .data
            .lock()
            .map_err(|_| Error::Storage)?
            .binding
            .clone()
            .ok_or(Error::Authentication)?;
        if !binding.enabled {
            self.mutate(|d| {
                d.status.state = Phase::Paused;
                d.status.enabled = false;
            });
            return Ok(());
        }
        let auth = self.auth().await?;
        let origin = config::origin()?;
        std::fs::create_dir_all(&self.cache)?;
        private::directory(&self.cache)?;
        let provider = provider::configuration(&self.cache)?;
        let client = cybergrid_sdk::Client::new(cybergrid_sdk::Config {
            base_url: origin.clone(),
            app_id: config::CLIENT_ID.into(),
            cloudflared: Some(provider),
            ..Default::default()
        })?;
        let advertised = client.auth_config().await?;
        if advertised.issuer != config::ISSUER
            || advertised.client_id != config::CLIENT_ID
            || advertised.resource != config::RESOURCE
            || !advertised.scope.split_whitespace().any(|s| s == "connect")
            || advertised
                .product_id
                .as_deref()
                .unwrap_or(&advertised.client_id)
                != binding.product_id
        {
            return Err(Error::Configuration);
        }
        if !self.current(generation) {
            let _ = client.close().await;
            return Err(Error::Cancelled);
        }
        client
            .set_auth_provider(Arc::new(provider::Provider(auth.clone())))
            .await;
        let enrollment = Arc::new(enrollment::Enrollment::new(origin)?);
        let gate = Arc::new(enrollment::Gate::default());
        gate.attach(&client);
        let owner = Arc::downgrade(self);
        gate.bind_lifecycle(Arc::new(move || {
            owner
                .upgrade()
                .is_some_and(|runtime| runtime.current(generation))
        }));
        let stop = CancellationToken::new();
        let identity = self.sync.account_identity()?;
        let runtime = self.sync.clone();
        let weak = Arc::downgrade(self);
        let generation = self.generation.load(Ordering::Acquire);
        let publish = Arc::new(
            move |result: std::result::Result<transport::Snapshot, Error>| {
                if let Some(this) = weak.upgrade() {
                    if !this.current(generation) {
                        return;
                    }
                    match result {
                        Ok(snapshot) => this.mutate(|d| {
                            d.status.state = Phase::Ready;
                            d.status.error = None;
                            d.status.devices = snapshot.devices;
                            d.status.last_sync_at = snapshot.last_sync_at;
                        }),
                        Err(error) => this.fail(error),
                    }
                }
            },
        );
        self.mutate(|d| {
            d.status.state = Phase::Connecting;
            d.status.enabled = true;
            d.status.error = None;
        });
        let task_stop = stop.clone();
        let task_gate = gate.clone();
        let weak = Arc::downgrade(self);
        let task = tokio::spawn(async move {
            let result = transport::run(
                runtime,
                identity,
                binding,
                auth,
                client.clone(),
                enrollment,
                task_gate.clone(),
                task_stop,
                publish,
            )
            .await;
            task_gate.close();
            let _ = client.close().await;
            if let Err(error) = result {
                if let Some(this) = weak.upgrade() {
                    if this.current(generation) {
                        this.fail(error)
                    }
                }
            }
        });
        *self.network.lock().await = Some(Network { stop, task, gate });
        Ok(())
    }
    async fn stop_network(&self) {
        if let Some(network) = self.network.lock().await.take() {
            network.gate.close();
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
            Command::SignIn {} | Command::SignUp {} => {
                let _owner = self.lifecycle.try_lock().map_err(|_| Error::Busy)?;
                if self.attempt.lock().await.is_some() {
                    return Err(Error::Busy);
                }
                let reauthorize =
                    authorization_mode(&self.data.lock().map_err(|_| Error::Storage)?.status)?;
                self.stop_network().await;
                let generation = self.generation.fetch_add(1, Ordering::AcqRel) + 1;
                let stop = CancellationToken::new();
                *self.attempt.lock().await = Some(Attempt {
                    cancel: None,
                    stop: stop.clone(),
                    mac: None,
                });
                self.mutate(|d| {
                    d.status.state = Phase::Authorizing;
                    d.status.error = None;
                });
                let signup = matches!(command, Command::SignUp {});
                let this = self.clone();
                tauri::async_runtime::spawn(async move {
                    let _owner = this.lifecycle.lock().await;
                    let result = this.login(signup, reauthorize, generation, stop).await;
                    this.attempt.lock().await.take();
                    this.android.lock().await.take();
                    if let Err(error) = result {
                        if this.current(generation) {
                            this.fail(error);
                            this.cleanup_status().await;
                        }
                    }
                });
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
                self.mutate(|d| d.status = Status::default());
            }
            Command::SetEnabled { enabled } => {
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
                self.generation.fetch_add(1, Ordering::AcqRel);
                self.set_enabled(enabled)?;
                if enabled {
                    if let Err(error) = self.start_network().await {
                        self.fail(error)
                    }
                } else {
                    self.stop_network().await;
                    self.mutate(|d| {
                        d.status.state = Phase::Paused;
                        d.status.error = None;
                    });
                }
            }
            Command::SyncNow {} => {
                let _owner = self.lifecycle.try_lock().map_err(|_| Error::Busy)?;
                if !self.data.lock().map_err(|_| Error::Storage)?.status.enabled {
                    return Err(Error::Authentication);
                }
                self.start_network().await?;
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
    async fn login(
        self: &Arc<Self>,
        signup: bool,
        reauthorize: bool,
        generation: u64,
        stop: CancellationToken,
    ) -> Result<()> {
        let auth = self.auth().await?;
        // Bind the callback before opening the browser. Android uses a single
        // native deep-link owner and accepts only the registered exact URI.
        #[cfg(not(target_os = "android"))]
        let mac = callback::Callback::start()
            .await
            .map_err(|_| Error::Network)?;
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
        #[cfg(target_os = "android")]
        let receiver = {
            let (tx, rx) = oneshot::channel();
            *self.android.lock().await = Some(tx);
            rx
        };
        self.app
            .opener()
            .open_url(url.as_str(), None::<&str>)
            .map_err(|_| Error::Network)?;
        let callback = async {
            #[cfg(not(target_os = "android"))]
            {
                mac.wait()
                    .await
                    .map_err(|_| Error::Network)?
                    .parse()
                    .map_err(|_| Error::Authentication)
            }
            #[cfg(target_os = "android")]
            {
                receiver.await.map_err(|_| Error::Cancelled)
            }
        };
        let value = tokio::select! {_=stop.cancelled()=>{cancel.cancel();#[cfg(not(target_os="android"))]mac.cancel();return Err(Error::Cancelled)},result=tokio::time::timeout(Duration::from_secs(600),callback)=>result.map_err(|_|Error::Authentication)??};
        let identity = auth.complete_callback(transaction, value).await?;
        let outcome = async {
            if !self.current(generation) || stop.is_cancelled() {
                return Err(Error::Cancelled);
            }
            if let Err(error) = self.bind(&identity).await {
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
            let _ = sender.send(url);
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
fn authorization_mode(status: &Status) -> Result<bool> {
    match status.state {
        Phase::Error => Ok(true),
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
    #[test]
    fn explicit_error_reauthentication_can_cleanup_but_healthy_owner_is_preserved() {
        assert_eq!(authorization_mode(&Status::default()), Ok(false));
        for with_profile in [false, true] {
            let mut status = Status {
                state: Phase::Error,
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
    fn native_ipc_trusts_exact_app_origins_and_strict_command_types() {
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
        ] {
            assert!(serde_json::from_value::<Command>(value).is_err());
        }
        assert!(serde_json::from_value::<Command>(serde_json::json!({"type":"status"})).is_ok());
    }
}
#[tauri::command]
pub(crate) async fn account_command(
    command: Command,
    window: tauri::WebviewWindow,
    runtime: tauri::State<'_, crate::AccountState>,
) -> crate::store::Result<Status> {
    // Account mutations are restricted to the trusted main application origin.
    let source = window.url().map_err(|_| crate::failure("账户窗口无效"))?;
    let mut allowed = trusted_application_origin(&source);
    #[cfg(debug_assertions)]
    {
        if let Some(dev) = &window.app_handle().config().build.dev_url {
            allowed |= dev.origin() == source.origin();
        }
    }
    if window.label() != "main" || !allowed {
        return Err(crate::failure("此窗口不可管理账户"));
    }
    runtime
        .0
        .command(command)
        .await
        .map_err(|e| crate::store::AppError {
            code: e.code().into(),
            message: e.safe().message,
            commit: None,
        })
}
