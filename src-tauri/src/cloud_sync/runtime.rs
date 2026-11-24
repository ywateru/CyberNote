use super::{
    auth::{
        openlist::{AuthCookie, TokenPayload},
        oauth::{OAuth, SharedOAuth},
        vault::Credential,
        ISSUER,
    },
    crypto,
    engine::{self, CloudHost, CommitReport, Context, Preview, Ticket},
    model::*,
    persistence::PrivateFiles,
    protocol::{Remote, Revision},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    path::Path,
    sync::{Arc, Mutex, RwLock, RwLockReadGuard, TryLockError},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio_util::sync::CancellationToken;
fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}
/// Immutable, native-only operation binding. Never accepted from renderer or deserialized.
#[derive(Clone)]
pub struct CloudFence {
    pub context: Context,
    pub config_revision: u64,
    pub cloud_workspace: String,
    pub store_workspace_id: Option<String>,
    pub store_device_id: Option<String>,
    pub remote_revision: Revision,
    pub confirmed_remote_payload_hash: Option<String>,
    pub incoming_payload_hash: Option<String>,
}
impl CloudFence {
    fn validate(&self) -> Result<()> {
        let revision = match &self.remote_revision {
            Revision::Missing => true,
            Revision::Etag(v) | Revision::Sha(v) | Revision::Head(v) => !v.is_empty(),
            Revision::Heads(v) => !v.is_empty() && v.iter().all(|s| !s.is_empty()),
        };
        let hash = |value: &Option<String>| {
            value.as_ref().is_none_or(|v| {
                v.len() == 64 && v.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
            })
        };
        if self.context.window.is_empty()
            || self.context.session.is_empty()
            || self.context.store_instance.is_empty()
            || self.config_revision > 9_007_199_254_740_991
            || self.cloud_workspace.is_empty()
            || !revision
            || !hash(&self.confirmed_remote_payload_hash)
            || !hash(&self.incoming_payload_hash)
        {
            return Err(error("state"));
        }
        Ok(())
    }
}
/// Host retains `enter()` only around its FINAL short authority+Store transaction.
#[derive(Clone)]
pub struct Lease {
    epoch: Arc<RwLock<u64>>,
    expected: u64,
    cancel: CancellationToken,
    workspace: Option<String>,
    fence: Option<CloudFence>,
}
/// One entered final gate. Accessors inspect this held guard, never reacquire
/// epoch (a queued Save writer must wait for this complete transaction).
pub struct CheckedLease<'a> {
    lease: &'a Lease,
    epoch: RwLockReadGuard<'a, u64>,
}
impl CheckedLease<'_> {
    pub fn check(&self) -> Result<()> {
        if self.lease.cancel.is_cancelled() || *self.epoch != self.lease.expected {
            return Err(error("permission"));
        }
        Ok(())
    }
    pub fn binding(&self) -> Result<&CloudFence> {
        self.check()?;
        let fence = self.lease.fence.as_ref().ok_or_else(|| error("permission"))?;
        fence.validate()?;
        Ok(fence)
    }
    pub fn check_workspace(&self, workspace: &str) -> Result<()> {
        self.check()?;
        if self.lease.workspace.as_deref() != Some(workspace) {
            return Err(error("workspace"));
        }
        Ok(())
    }
}
impl Lease {
    pub fn check_workspace(&self, workspace: &str) -> Result<()> {
        self.check()?;
        if self.workspace.as_deref() != Some(workspace) {
            return Err(error("workspace"));
        }
        Ok(())
    }
    pub fn binding(&self) -> Result<&CloudFence> {
        self.check()?;
        let fence = self.fence.as_ref().ok_or_else(|| error("permission"))?;
        fence.validate()?;
        Ok(fence)
    }
    fn bind(mut self, workspace: String) -> Self {
        self.workspace = Some(workspace);
        self
    }
    pub fn enter(&self) -> Result<CheckedLease<'_>> {
        let guard = self.epoch.read().map_err(|_| error("state"))?;
        if self.cancel.is_cancelled() || *guard != self.expected {
            return Err(error("permission"));
        }
        Ok(CheckedLease {
            lease: self,
            epoch: guard,
        })
    }
    pub fn check(&self) -> Result<()> {
        // This also makes accidental legacy access under an entered gate fail
        // promptly if a Save writer is queued, rather than recursively deadlock.
        let guard = self.epoch.try_read().map_err(|e| match e {
            TryLockError::WouldBlock => error("busy"),
            TryLockError::Poisoned(_) => error("state"),
        })?;
        if self.cancel.is_cancelled() || *guard != self.expected {
            return Err(error("permission"));
        }
        Ok(())
    }
}
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum CloudCommand {
    Status,
    ConnectStatus,
    BeginConnect {
        provider: Provider,
        #[serde(default)]
        driver: Option<String>,
        #[serde(default)]
        mode: Option<DriveMode>,
    },
    ConnectionInfo {
        #[serde(default)]
        provider: Option<Provider>,
    },
    Disconnect {
        provider: Provider,
    },
    CancelConnect,
    Save {
        patch: ConfigPatch,
    },
    Test,
    Preview {
        #[serde(default)]
        recovery: Option<String>,
    },
    PreviewSetup {
        patch: ConfigPatch,
    },
    Sync {
        #[serde(rename = "previewId")]
        preview_id: String,
    },
    Restore {
        #[serde(rename = "previewId")]
        preview_id: String,
    },
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicProvider {
    pub fields: BTreeMap<String, String>,
    pub credentials_set: BTreeMap<String, bool>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub read: bool,
    pub restore: bool,
    pub write: bool,
    pub conditional_create: bool,
    pub conditional_update: bool,
    pub immutable_heads: bool,
    pub automatic: bool,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicConnection {
    pub provider: Provider,
    pub driver: String,
    pub account_id: String,
    pub display_name: String,
    pub sync_root: String,
    pub mode: DriveMode,
    pub drive_type: Option<String>,
    pub quota_total: Option<u64>,
    pub quota_used: Option<u64>,
    pub created_at: i64,
    pub last_verified_at: Option<i64>,
    pub reauth_required: bool,
    pub capabilities: Capabilities,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectPublic {
    pub state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<Provider>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attempt_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<CloudError>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub revision: u64,
    pub enabled: bool,
    pub selected: Provider,
    pub minutes: u16,
    pub providers: BTreeMap<Provider, PublicProvider>,
    pub passphrase_set: bool,
    pub last_success: Option<u64>,
    pub last_error: Option<CloudError>,
    pub recoveries: Vec<String>,
    pub connection: Option<PublicConnection>,
    pub connections: BTreeMap<Provider, PublicConnection>,
    pub connect: ConnectPublic,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reply {
    pub status: Status,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview: Option<Preview>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<CommitReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connection: Option<PublicConnection>,
}
#[derive(Clone)]
struct Attempt {
    id: String,
    instance: String,
    generation: u64,
    provider: Provider,
    driver: String,
    context: Context,
    cookies: Vec<AuthCookie>,
    mode: DriveMode,
    writer_id: Option<String>,
    payload: Option<TokenPayload>,
    completing: bool,
    error: Option<CloudError>,
    started: Instant,
}
pub struct ConnectStart {
    pub instance: String,
    pub generation: u64,
    pub url: String,
    pub title: String,
    pub allowed_hosts: Vec<String>,
    pub callback_prefix: String,
    pub cookies: Vec<AuthCookie>,
}
struct State {
    config: Config,
    raw: Option<Vec<u8>>,
    ticket: Option<Ticket>,
    last_success: Option<u64>,
    last_error: Option<CloudError>,
    cancel: CancellationToken,
    next_auto: Instant,
    attempt: Option<Attempt>,
    auth_generation: u64,
    last_connect: Option<(Provider, CloudError)>,
}
pub struct CloudRuntime {
    host: Arc<dyn CloudHost>,
    files: PrivateFiles,
    state: Mutex<State>,
    operation: tokio::sync::Mutex<()>,
    epoch: Arc<RwLock<u64>>,
    oauth: SharedOAuth,
    #[cfg(test)]
    fixture: Option<String>,
}
fn capabilities(provider: Provider, meta: &ConnectionMeta) -> Capabilities {
    match provider {
        Provider::Onedrive => {
            let personal = meta.mode == DriveMode::TwoWay
                && meta
                    .drive_type
                    .as_deref()
                    .is_some_and(|kind| kind.eq_ignore_ascii_case("personal"));
            Capabilities {
                read: true,
                restore: true,
                write: personal,
                conditional_create: personal,
                conditional_update: personal,
                immutable_heads: false,
                automatic: personal,
            }
        }
        Provider::Baidu => {
            let writable = meta.mode != DriveMode::ReadOnly && meta.writer_id.is_some();
            Capabilities {
                read: true,
                restore: true,
                write: writable,
                conditional_create: false,
                conditional_update: false,
                immutable_heads: true,
                automatic: writable,
            }
        }
        _ => Capabilities {
            read: true,
            restore: true,
            write: true,
            conditional_create: true,
            conditional_update: true,
            immutable_heads: false,
            automatic: true,
        },
    }
}
fn writer_identity(
    provider: Provider,
    driver: &str,
    mode: DriveMode,
    previous: Option<&ConnectionMeta>,
) -> Option<String> {
    if provider != Provider::Baidu || !matches!(mode, DriveMode::SingleWriter | DriveMode::TwoWay) {
        return None;
    }
    // Reconnecting must keep the writer identity that already owns this
    // device's immutable heads. A new id would look like another writer.
    previous
        .filter(|meta| {
            meta.driver == driver
                && matches!(meta.mode, DriveMode::SingleWriter | DriveMode::TwoWay)
        })
        .and_then(|meta| meta.writer_id.clone())
        .or_else(|| Some(uuid::Uuid::new_v4().to_string()))
}
fn public_connection(provider: Provider, meta: &ConnectionMeta) -> PublicConnection {
    PublicConnection {
        provider,
        driver: meta.driver.clone(),
        account_id: meta.account_id.clone(),
        display_name: meta.display_name.clone(),
        sync_root: meta.sync_root.clone(),
        mode: meta.mode,
        drive_type: meta.drive_type.clone(),
        quota_total: meta.quota_total,
        quota_used: meta.quota_used,
        created_at: meta.created_at,
        last_verified_at: meta.last_verified_at,
        reauth_required: meta.reauth_required,
        capabilities: capabilities(provider, meta),
    }
}
impl CloudRuntime {
    pub fn new(root: &Path, host: Arc<dyn CloudHost>) -> Result<Arc<Self>> {
        let files = PrivateFiles::open(root)?;
        let oauth = Arc::new(OAuth::new(root)?);
        let raw = files.read("state.json", 64 * 1024)?;
        let config: Config = match &raw {
            Some(b) => serde_json::from_slice(b).map_err(|_| error("state"))?,
            None => Config::default(),
        };
        config.validate().map_err(|_| error("state"))?;
        let delay = Duration::from_secs(u64::from(config.minutes.max(3)) * 60);
        Ok(Arc::new(Self {
            host,
            files,
            state: Mutex::new(State {
                config,
                raw,
                ticket: None,
                last_success: None,
                last_error: None,
                cancel: CancellationToken::new(),
                next_auto: Instant::now() + delay,
                attempt: None,
                auth_generation: 0,
                last_connect: None,
            }),
            operation: tokio::sync::Mutex::new(()),
            oauth,
            #[cfg(test)]
            fixture: None,
            epoch: Arc::new(RwLock::new(0)),
        }))
    }
    #[cfg(test)]
    #[allow(dead_code)]
    pub(crate) fn fixture(root: &Path, host: Arc<dyn CloudHost>, api: &str) -> Result<Arc<Self>> {
        let mut r = Self::new(root, host)?;
        Arc::get_mut(&mut r).unwrap().fixture = Some(api.into());
        Ok(r)
    }
    fn state(&self) -> Result<std::sync::MutexGuard<'_, State>> {
        self.state.lock().map_err(|_| error("state"))
    }
    pub fn status(&self) -> Result<Status> {
        let s = self.state()?;
        let connection = s.config.selected.is_oauth().then(|| {
            s.config
                .connections
                .get(&s.config.selected)
                .map(|meta| public_connection(s.config.selected, meta))
        }).flatten();
        let connect = match &s.attempt {
            None => match &s.last_connect {
                Some((provider, error)) => ConnectPublic {
                    state: "failed".into(),
                    provider: Some(*provider),
                    attempt_id: None,
                    error: Some(error.clone()),
                },
                None => ConnectPublic {
                    state: "idle".into(),
                    provider: None,
                    attempt_id: None,
                    error: None,
                },
            },
            Some(a) => ConnectPublic {
                state: if a.error.is_some() {
                    "failed".into()
                } else if a.payload.is_some() {
                    "verifying".into()
                } else {
                    "authorizing".into()
                },
                provider: Some(a.provider),
                attempt_id: Some(a.id.clone()),
                error: a.error.clone(),
            },
        };
        Ok(Status {
            revision: s.config.revision,
            enabled: s.config.enabled,
            selected: s.config.selected,
            minutes: s.config.minutes,
            providers: s
                .config
                .providers
                .iter()
                .map(|(k, p)| {
                    (
                        *k,
                        PublicProvider {
                            fields: p.fields.clone(),
                            credentials_set: p
                                .secrets
                                .iter()
                                .map(|(k, v)| (k.clone(), !v.is_empty()))
                                .collect(),
                        },
                    )
                })
                .collect(),
            passphrase_set: !s.config.passphrase.is_empty(),
            last_success: s.last_success,
            last_error: s.last_error.clone(),
            recoveries: self.files.recoveries()?,
            connection,
            connections: s
                .config
                .connections
                .iter()
                .map(|(p, m)| (*p, public_connection(*p, m)))
                .collect(),
            connect,
        })
    }
    fn persist(&self, s: &mut State, c: Config) -> Result<()> {
        let raw = serde_json::to_vec(&c).map_err(|_| error("state"))?;
        self.files.replace("state.json", &raw, s.raw.as_deref())?;
        s.raw = Some(raw);
        s.config = c;
        Ok(())
    }
    pub fn reply(&self) -> Result<Reply> {
        Ok(Reply {
            status: self.status()?,
            preview: None,
            result: None,
            message: None,
            connection: None,
        })
    }
    fn validate_remote_config(&self, c: &Config) -> Result<()> {
        if !c.enabled {
            return Err(error("disabled"));
        }
        if c.selected.is_oauth() {
            let meta = c
                .connections
                .get(&c.selected)
                .ok_or_else(|| error("authentication"))?;
            if meta.reauth_required {
                return Err(error("authentication"));
            }
        } else if !c.providers.contains_key(&c.selected) {
            return Err(error("invalid"));
        }
        Ok(())
    }
    async fn remote(&self, c: &Config) -> Result<Remote> {
        if !c.enabled {
            return Err(error("disabled"));
        }
        let config = c
            .providers
            .get(&c.selected)
            .cloned()
            .unwrap_or_default();
        if c.selected.is_oauth() {
            let meta = c
                .connections
                .get(&c.selected)
                .ok_or_else(|| error("authentication"))?;
            if meta.reauth_required {
                return Err(error("authentication"));
            }
            #[cfg(test)]
            if let Some(api) = &self.fixture {
                return Remote::oauth_fixture(
                    c.selected,
                    config,
                    api,
                    self.oauth.clone(),
                    meta.credential_id.clone(),
                    meta.driver.clone(),
                    meta.mode,
                    meta.writer_id.clone(),
                );
            }
            return Remote::oauth(
                c.selected,
                config,
                self.oauth.clone(),
                meta.credential_id.clone(),
                meta.driver.clone(),
                meta.mode,
                meta.writer_id.clone(),
                meta.drive_type.clone(),
            );
        }
        if !c.providers.contains_key(&c.selected) {
            return Err(error("invalid"));
        }
        #[cfg(test)]
        if let Some(api) = &self.fixture {
            return Remote::fixture(c.selected, config, api);
        }
        Remote::new(c.selected, config)
    }
    pub async fn command(&self, context: Context, command: CloudCommand) -> Result<Reply> {
        let ctx = context.clone();
        engine::host_call(self.host.clone(), move |h| h.check(&ctx)).await?;
        if matches!(command, CloudCommand::Status) {
            return self.reply();
        }
        if matches!(command, CloudCommand::ConnectStatus) {
            return self.reply();
        }
        if let CloudCommand::ConnectionInfo { provider } = command {
            return self.connection_info(context, provider).await;
        }
        if let CloudCommand::Disconnect { provider } = command {
            return self.disconnect(provider).await;
        }
        if let CloudCommand::CancelConnect = command {
            self.cancel_connect(None);
            self.dismiss_connect();
            return self.reply();
        }
        if let CloudCommand::BeginConnect { .. } = command {
            return Err(error("invalid"));
        }
        if let CloudCommand::Save { patch } = command {
            let mut s = self.state()?;
            let c = s.config.patch(patch)?;
            if c.enabled {
                self.validate_remote_config(&c)?;
            }
            let mut epoch = self.epoch.write().map_err(|_| error("state"))?;
            self.persist(&mut s, c)?;
            *epoch = epoch.checked_add(1).ok_or_else(|| error("limit"))?;
            s.cancel.cancel();
            s.cancel = CancellationToken::new();
            s.ticket = None;
            s.last_error = None;
            s.next_auto =
                Instant::now() + Duration::from_secs(u64::from(s.config.minutes.max(3)) * 60);
            drop(epoch);
            drop(s);
            return self.reply();
        }
        let _operation = self.operation.try_lock().map_err(|_| error("busy"))?;
        let setup_preview = matches!(command, CloudCommand::PreviewSetup { .. });
        let (config, cancel, lease) = {
            let s = self.state()?;
            if self.files.read("state.json", 64 * 1024)?.as_deref() != s.raw.as_deref() {
                return Err(error("state"));
            }
            {
                let cancel = s.cancel.child_token();
                (
                    s.config.clone(),
                    cancel.clone(),
                    Lease {
                        epoch: self.epoch.clone(),
                        cancel,
                        workspace: None,
                        fence: None,
                        expected: *self.epoch.read().map_err(|_| error("state"))?,
                    },
                )
            }
        };
        let result = tokio::select! {biased;_=cancel.cancelled()=>Err(error("permission")),result=tokio::time::timeout(Duration::from_secs(120),self.execute(context,command,&config,lease))=>result.map_err(|_|error("timeout")).and_then(|r|r)};
        if let Err(e) = &result {
            cancel.cancel();
            if e.code == "authentication" && config.selected.is_oauth() {
                self.mark_reauth(config.selected);
            }
            let mut s = self.state()?;
            if !setup_preview && s.config.revision == config.revision {
                s.last_error = Some(e.clone());
            }
        }
        result
    }
    async fn execute(
        &self,
        context: Context,
        command: CloudCommand,
        c: &Config,
        lease: Lease,
    ) -> Result<Reply> {
        let command = match command {
            CloudCommand::PreviewSetup { mut patch } => {
                patch.enabled = Some(true);
                let draft = c.patch(patch)?;
                let remote = self.remote(&draft).await?;
                let (bundle, revision, bytes) = engine::read(&remote, &draft.passphrase).await?;
                lease.check()?;
                let preview = engine::preview(
                    self.host.clone(),
                    context,
                    &draft,
                    bundle,
                    revision,
                    bytes,
                    "setup".into(),
                )
                .await?;
                lease.check()?;
                let mut reply = self.reply()?;
                reply.preview = Some(preview.preview);
                return Ok(reply);
            }
            command => command,
        };
        let remote = self.remote(c).await?;
        match command {
            CloudCommand::Test => {
                let _ = engine::read(&remote, &c.passphrase).await?;
                let mut r = self.reply()?;
                r.message = Some("连接与读取成功；未写入远端或笔记".into());
                Ok(r)
            }
            CloudCommand::Preview { recovery } => {
                let (bundle, revision, size, source) = if let Some(id) = recovery {
                    let b = self.recovery(&id, &c.passphrase).await?;
                    let size = serde_json::to_vec(&b).map_err(|_| error("invalid"))?.len();
                    (Some(b), Revision::Missing, size, format!("recovery:{id}"))
                } else {
                    let (b, r, s) = engine::read(&remote, &c.passphrase).await?;
                    (b, r, s, "remote".into())
                };
                lease.check()?;
                let ticket = engine::preview(
                    self.host.clone(),
                    context,
                    c,
                    bundle,
                    revision,
                    size,
                    source,
                )
                .await?;
                let p = ticket.preview.clone();
                self.state()?.ticket = Some(ticket);
                let mut r = self.reply()?;
                r.preview = Some(p);
                Ok(r)
            }
            CloudCommand::Sync { preview_id } => {
                self.transfer(context, c, remote, preview_id, false, lease)
                    .await
            }
            CloudCommand::Restore { preview_id } => {
                self.transfer(context, c, remote, preview_id, true, lease)
                    .await
            }
            CloudCommand::Status
            | CloudCommand::ConnectStatus
            | CloudCommand::BeginConnect { .. }
            | CloudCommand::ConnectionInfo { .. }
            | CloudCommand::Disconnect { .. }
            | CloudCommand::CancelConnect
            | CloudCommand::Save { .. }
            | CloudCommand::PreviewSetup { .. } => Err(error("invalid")),
        }
    }
    async fn recovery(&self, id: &str, password: &str) -> Result<Bundle> {
        if !crate::sync::model::valid_uuid(id) {
            return Err(error("invalid"));
        }
        let bytes = self
            .files
            .read(&format!("recovery-{id}.enc"), MAX_REMOTE)?
            .ok_or_else(|| error("missing"))?;
        let pass = password.to_string();
        tokio::task::spawn_blocking(move || crypto::decrypt(&bytes, &pass))
            .await
            .map_err(|_| error("invalid"))?
    }
    async fn protect(&self, bundle: &Bundle, password: &str) -> Result<()> {
        let ids = self.files.recoveries()?;
        if ids.len() > 30 {
            return Err(error("limit"));
        }
        let oldest = if ids.len() == 30 {
            let id = &ids[0];
            let bytes = self
                .files
                .read(&format!("recovery-{id}.enc"), MAX_REMOTE)?
                .ok_or_else(|| error("state"))?;
            let old = self.recovery(id, password).await?;
            if old.workspace_id != bundle.workspace_id {
                return Err(error("limit"));
            }
            Some((id.clone(), bytes))
        } else {
            None
        };
        let bundle = bundle.clone();
        let pass = password.to_string();
        let bytes = tokio::task::spawn_blocking(move || crypto::encrypt(&bundle, &pass))
            .await
            .map_err(|_| error("invalid"))??;
        self.files.replace(
            &format!("recovery-{}.enc", uuid::Uuid::new_v4()),
            &bytes,
            None,
        )?;
        if let Some((id, bytes)) = oldest {
            self.files.remove_recovery(&id, &bytes)?;
        }
        Ok(())
    }
    async fn transfer(
        &self,
        context: Context,
        c: &Config,
        remote: Remote,
        id: String,
        restore: bool,
        lease: Lease,
    ) -> Result<Reply> {
        let ticket = self
            .state()?
            .ticket
            .take()
            .ok_or_else(|| error("confirmation"))?;
        ticket.check(&context, c)?;
        let mut lease = lease.bind(ticket.preview.workspace_id.clone());
        if ticket.preview.id != id {
            return Err(error("confirmation"));
        }
        if !restore && ticket.preview.source != "remote" {
            return Err(error("confirmation"));
        }
        if !restore && c.selected.is_oauth() {
            let meta = c
                .connections
                .get(&c.selected)
                .ok_or_else(|| error("permission"))?;
            if !capabilities(c.selected, meta).write {
                return Err(error("permission"));
            }
        }
        // Re-read before any local initialization: wrong passwords and changes have zero local writes.
        if ticket.preview.source == "remote" {
            let (b, r, _) = engine::read(&remote, &c.passphrase).await?;
            if r != ticket.revision
                || b.as_ref().map(Bundle::digest) != ticket.remote.as_ref().map(Bundle::digest)
            {
                return Err(error("conflict"));
            }
        }
        let ctx = context.clone();
        let expected = ticket.generation.clone();
        let info = engine::host_call(self.host.clone(), move |h| h.inspect(&ctx)).await?;
        if info.generation != expected {
            return Err(error("stale"));
        }
        lease.check()?;
        lease.fence = Some(CloudFence {
            context: context.clone(),
            config_revision: c.revision,
            cloud_workspace: ticket.preview.workspace_id.clone(),
            store_workspace_id: info.store_workspace_id.clone(),
            store_device_id: info.store_device_id.clone(),
            remote_revision: ticket.revision.clone(),
            confirmed_remote_payload_hash: ticket.remote.as_ref().map(Bundle::digest),
            incoming_payload_hash: None,
        });
        let workspace = ticket.preview.workspace_id.clone();
        let ctx = context.clone();
        let l = lease.clone();
        let initialize = info.store_workspace_id.is_none();
        let capture = engine::host_call(self.host.clone(), move |h| {
            l.check()?;
            h.capture(&ctx, &workspace, initialize, l)
        })
        .await?;
        capture.bundle.validate()?;
        if capture.bundle.workspace_id != ticket.preview.workspace_id {
            return Err(error("workspace"));
        }
        let incoming = if restore {
            engine::restore(
                &capture.bundle,
                ticket.remote.as_ref().ok_or_else(|| error("missing"))?,
            )?
        } else {
            merge(
                &capture.bundle,
                &ticket
                    .remote
                    .clone()
                    .unwrap_or_else(|| Bundle::empty(capture.bundle.workspace_id.clone())),
            )?
        };
        let ctx = context.clone();
        let post = engine::host_call(self.host.clone(), move |h| h.inspect(&ctx)).await?;
        if post.generation != capture.generation
            || (!initialize
                && (post.store_workspace_id != info.store_workspace_id
                    || post.store_device_id != info.store_device_id))
        {
            return Err(error("stale"));
        }
        let binding = lease.fence.as_mut().ok_or_else(|| error("permission"))?;
        binding.store_workspace_id = post.store_workspace_id;
        binding.store_device_id = post.store_device_id;
        binding.incoming_payload_hash = Some(incoming.digest());
        // Full business validation before network publication belongs to the shared Store port.
        let ctx = context.clone();
        let validation = incoming.clone();
        let l = lease.clone();
        engine::host_call(self.host.clone(), move |h| h.validate(&ctx, &validation, l)).await?;
        let changed = incoming.digest() != capture.bundle.digest();
        if changed || initialize {
            self.protect(&capture.bundle, &c.passphrase).await?;
        }
        let upload = !restore
            && ticket
                .remote
                .as_ref()
                .is_none_or(|b| b.digest() != incoming.digest());
        if upload {
            let b = incoming.clone();
            let pass = c.passphrase.clone();
            let bytes = tokio::task::spawn_blocking(move || crypto::encrypt(&b, &pass))
                .await
                .map_err(|_| error("invalid"))??;
            lease.check()?;
            let ctx = context.clone();
            engine::host_call(self.host.clone(), move |h| h.check(&ctx)).await?;
            remote.put(bytes, &ticket.revision).await?;
        }
        lease.check()?;
        if !changed {
            let ctx = context.clone();
            let info = engine::host_call(self.host.clone(), move |h| h.inspect(&ctx)).await?;
            if info.generation != capture.generation {
                return Err(error("stale"));
            }
        }
        let report = if changed {
            let ctx = context.clone();
            let generation = capture.generation;
            let l = lease.clone();
            engine::host_call(self.host.clone(), move |h| {
                h.commit(&ctx, incoming, &generation, l)
            })
            .await?
        } else {
            CommitReport {
                applied: true,
                pending: 0,
                conflicts: engine::conflicts(&incoming),
            }
        };
        lease.check()?;
        {
            let mut s = self.state()?;
            if s.config.revision != c.revision {
                return Err(error("stale"));
            }
            let mut next = s.config.clone();
            if !restore || ticket.preview.source == "remote" {
                next.approved_workspace = Some(ticket.preview.workspace_id);
            }
            self.persist(&mut s, next)?;
            if report.applied && report.pending == 0 {
                s.last_success = Some(
                    SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .map_err(|_| error("invalid"))?
                        .as_secs(),
                );
            }
            s.last_error = None;
        }
        let mut r = self.reply()?;
        let applied = report.applied;
        let pending = report.pending;
        let conflicts = report.conflicts;
        r.result = Some(report);
        r.message = Some(
            if !applied || pending > 0 {
                "远端版本已接收，仍在等待本机安全保存与应用"
            } else if restore {
                "已恢复所选版本；当前本机版本已加密保留"
            } else {
                "同步操作已完成；并发版本已保留"
            }
            .into(),
        );
        if applied && conflicts > 0 {
            r.message = Some(format!(
                "已保留 {conflicts} 组并发版本；各资料库当前显示的分支可能不同，请显式解决冲突"
            ));
        }
        Ok(r)
    }
    pub async fn begin_connect(
        &self,
        context: Context,
        provider: Provider,
        driver: Option<String>,
        mode: Option<DriveMode>,
    ) -> Result<ConnectStart> {
        if !provider.is_oauth() {
            return Err(error("invalid"));
        }
        let ctx = context.clone();
        engine::host_call(self.host.clone(), move |h| h.check(&ctx)).await?;
        if self.operation.try_lock().is_err() {
            return Err(error("busy"));
        }
        if self.state()?.attempt.is_some() {
            return Err(error("busy"));
        }
        let driver = driver.unwrap_or_else(|| match provider {
            Provider::Onedrive => "onedrive_pr".into(),
            Provider::Baidu => "baiduyun_go".into(),
            _ => String::new(),
        });
        let valid_driver = match provider {
            Provider::Onedrive => matches!(driver.as_str(), "onedrive_pr" | "onedrive_go"),
            Provider::Baidu => driver == "baiduyun_go",
            _ => false,
        };
        if !valid_driver {
            return Err(error("invalid"));
        }
        let mode = match provider {
            Provider::Onedrive => {
                if driver == "onedrive_pr" {
                    DriveMode::TwoWay
                } else {
                    DriveMode::ReadOnly
                }
            }
            Provider::Baidu => match mode.unwrap_or(DriveMode::TwoWay) {
                DriveMode::ReadOnly => DriveMode::ReadOnly,
                DriveMode::SingleWriter => DriveMode::SingleWriter,
                DriveMode::TwoWay => DriveMode::TwoWay,
            },
            _ => return Err(error("invalid")),
        };
        let writer_id = {
            let state = self.state()?;
            writer_identity(
                provider,
                &driver,
                mode,
                state.config.connections.get(&provider),
            )
        };
        let id = uuid::Uuid::new_v4().to_string();
        let instance = format!("cloud-auth-{id}");
        let generation = {
            let mut s = self.state()?;
            if s.attempt.is_some() {
                return Err(error("busy"));
            }
            s.last_connect = None;
            s.auth_generation = s
                .auth_generation
                .checked_add(1)
                .ok_or_else(|| error("limit"))?;
            let generation = s.auth_generation;
            s.attempt = Some(Attempt {
                id,
                instance: instance.clone(),
                generation,
                provider,
                driver: driver.clone(),
                context,
                cookies: vec![],
                mode,
                writer_id,
                payload: None,
                completing: false,
                error: None,
                started: Instant::now(),
            });
            generation
        };
        // Reserve the attempt above, then release the state lock before network
        // I/O. A concurrent begin sees `attempt` and fails busy; cancel/close
        // can still retire this attempt while `/requests` is in flight.
        let request = match self.oauth.requests(&driver).await {
            Ok(request) => request,
            Err(e) => {
                self.fail_attempt(&instance, e.clone());
                return Err(e);
            }
        };
        {
            let mut s = self.state()?;
            let active = s
                .attempt
                .as_ref()
                .is_some_and(|a| a.instance == instance && a.generation == generation);
            if !active {
                return Err(error("stale"));
            }
            if let Some(a) = s.attempt.as_mut() {
                a.cookies = request.cookies.clone();
            }
        }
        Ok(ConnectStart {
            instance,
            generation,
            url: request.authorization_url,
            title: match provider {
                Provider::Onedrive => "登录 OneDrive",
                Provider::Baidu => "登录百度网盘",
                _ => "登录网盘",
            }
            .into(),
            allowed_hosts: super::auth::openlist::authorization_hosts(&driver),
            callback_prefix: super::auth::openlist::callback_prefix().into(),
            cookies: request.cookies,
        })
    }
    /// Retire a failed attempt and retain only its safe provider/error pair for
    /// the status surface. A retry must be able to begin immediately.
    fn fail_attempt(&self, instance: &str, e: CloudError) -> Option<(String, u64)> {
        let mut s = self.state().ok()?;
        let a = s.attempt.as_ref()?;
        if a.instance != instance {
            return None;
        }
        let out = (a.instance.clone(), a.generation);
        let provider = a.provider;
        s.attempt = None;
        s.last_connect = Some((provider, e));
        Some(out)
    }
    pub async fn complete_connect(
        &self,
        context: &Context,
        instance: &str,
        raw: &str,
    ) -> Result<Reply> {
        let ctx = context.clone();
        engine::host_call(self.host.clone(), move |h| h.check(&ctx)).await?;
        let attempt = {
            let mut s = self.state()?;
            let a = s.attempt.as_mut().ok_or_else(|| error("stale"))?;
            if a.instance != instance
                || &a.context != context
                || a.started.elapsed() > Duration::from_secs(600)
                || a.completing
            {
                return Err(error("stale"));
            }
            // Claim the callback exactly once. Android may report the same
            // final URL from onPageStarted and onPageFinished, and a duplicate
            // completion must not create a second credential/connection.
            a.completing = true;
            a.clone()
        };
        let payload = match self.oauth.parse_callback(raw, &attempt.driver) {
            Ok(p) => p,
            Err(e) => {
                self.fail_attempt(instance, e.clone());
                return Err(e);
            }
        };
        if let Ok(mut s) = self.state() {
            if let Some(a) = s.attempt.as_mut().filter(|a| a.instance == instance) {
                a.payload = Some(payload.clone());
            }
        }
        let mut refresh_for_save = payload.refresh_token.clone();
        let token = match payload.access_token.clone() {
            Some(token) => token,
            None => {
                match self
                    .oauth
                    .renew(attempt.provider, &attempt.driver, &payload.refresh_token)
                    .await
                {
                    Ok(r) => {
                        if let Some(refresh) = r.refresh_token {
                            refresh_for_save = refresh;
                        }
                        r.access_token
                    }
                    Err(e) => {
                        self.fail_attempt(instance, e.clone());
                        return Err(e);
                    }
                }
            }
        };
        let account = match self.oauth.account(attempt.provider, &token).await {
            Ok(a) => a,
            Err(e) if e.code == "authentication" => {
                match self
                    .oauth
                    .renew(attempt.provider, &attempt.driver, &payload.refresh_token)
                    .await
                {
                    Ok(r) => {
                        if let Some(refresh) = r.refresh_token {
                            refresh_for_save = refresh;
                        }
                        match self.oauth.account(attempt.provider, &r.access_token).await {
                            Ok(a) => a,
                            Err(e) => {
                                self.fail_attempt(instance, e.clone());
                                return Err(e);
                            }
                        }
                    }
                    Err(e) => {
                        self.fail_attempt(instance, e.clone());
                        return Err(e);
                    }
                }
            }
            Err(e) => {
                self.fail_attempt(instance, e.clone());
                return Err(e);
            }
        };
        {
            let s = self.state()?;
            let active = s
                .attempt
                .as_ref()
                .is_some_and(|a| a.instance == instance && &a.context == context);
            if !active {
                return Err(error("stale"));
            }
        }
        // Account verification is network-bound, but persisting a new
        // connection must not race a sync that is already using the old
        // config. Do not hold this lock across the network calls above.
        let _operation = match self.operation.try_lock() {
            Ok(operation) => operation,
            Err(_) => {
                self.fail_attempt(instance, error("busy"));
                return Err(error("busy"));
            }
        };
        let credential_id = uuid::Uuid::new_v4().to_string();
        let now = unix_now();
        let scope = match attempt.provider {
            Provider::Onedrive => "offline_access Files.ReadWrite.All",
            Provider::Baidu => "basic,netdisk",
            _ => "",
        };
        if let Err(e) = self.oauth.save(Credential {
            version: 1,
            connection_id: credential_id.clone(),
            provider: attempt.provider,
            issuer: ISSUER.into(),
            driver: attempt.driver.clone(),
            refresh_token: refresh_for_save,
            access_token: Some(token),
            // OpenList may return `expires_in`; otherwise keep the callback
            // token short-lived so the next operation refreshes it.
            expires_at: payload.expires_at.or(Some(now + 3000)),
            scope: scope.into(),
            account_id: account.account_id.clone(),
            display_name: account.display_name.clone(),
        }) {
            self.fail_attempt(instance, e.clone());
            return Err(e);
        }
        let mut s = self.state()?;
        let active = s
            .attempt
            .as_ref()
            .is_some_and(|a| a.instance == instance && &a.context == context);
        if !active {
            drop(s);
            let _ = self.oauth.remove(&credential_id);
            return Err(error("stale"));
        }
        let mut config = s.config.clone();
        let old_credential = config
            .connections
            .get(&attempt.provider)
            .map(|m| m.credential_id.clone());
        config
            .providers
            .entry(attempt.provider)
            .or_default();
        config.connections.insert(
            attempt.provider,
            ConnectionMeta {
                credential_id: credential_id.clone(),
                driver: attempt.driver.clone(),
                account_id: account.account_id,
                display_name: account.display_name,
                sync_root: match attempt.provider {
                    Provider::Onedrive => "/CyberNote/notes.bundle",
                    Provider::Baidu => "/CyberNote/heads",
                    _ => "/CyberNote",
                }
                .into(),
                mode: attempt.mode,
                drive_type: account.drive_type,
                writer_id: attempt.writer_id,
                created_at: now,
                last_verified_at: Some(now),
                reauth_required: false,
                quota_total: account.quota_total,
                quota_used: account.quota_used,
            },
        );
        config.selected = attempt.provider;
        // Connecting or reconnecting never starts content transfer. The user
        // must enter the passphrase, preview and explicitly enable sync.
        config.enabled = false;
        config.revision = config.revision.checked_add(1).ok_or_else(|| error("limit"))?;
        config.approved_workspace = None;
        if let Err(e) = config.validate() {
            drop(s);
            let _ = self.oauth.remove(&credential_id);
            self.fail_attempt(instance, e.clone());
            return Err(e);
        }
        if let Err(e) = self.persist(&mut s, config) {
            let _ = self.oauth.remove(&credential_id);
            drop(s);
            self.fail_attempt(instance, e.clone());
            return Err(e);
        }
        s.attempt = None;
        s.last_connect = None;
        drop(s);
        if let Some(old) = old_credential.filter(|old| old != &credential_id) {
            let _ = self.oauth.remove(&old);
        }
        let mut r = self.reply()?;
        r.message = Some("已连接；输入加密口令并预览后才会开始同步".into());
        Ok(r)
    }
    pub fn cancel_connect(&self, instance: Option<&str>) -> Option<(String, u64)> {
        let mut s = self.state().ok()?;
        let a = s.attempt.as_ref()?;
        if instance.is_some_and(|i| i != a.instance) {
            return None;
        }
        let out = (a.instance.clone(), a.generation);
        let failed = a.error.is_some();
        s.attempt = None;
        if !failed {
            s.last_connect = None;
        }
        Some(out)
    }
    /// Record a native window failure before retiring the attempt. Keeping the
    /// fixed error in `last_connect` lets the UI show a retryable failure while
    /// allowing the next `beginConnect` to replace this attempt.
    pub fn abort_connect(&self, instance: &str, e: CloudError) -> Option<(String, u64)> {
        self.fail_attempt(instance, e)
    }
    pub fn cancel_connect_for(&self, provider: Provider) -> Option<(String, u64)> {
        let mut s = self.state().ok()?;
        let a = s.attempt.as_ref()?;
        if a.provider != provider {
            return None;
        }
        let out = (a.instance.clone(), a.generation);
        s.attempt = None;
        s.last_connect = None;
        Some(out)
    }
    pub fn dismiss_connect(&self) {
        if let Ok(mut s) = self.state() {
            s.attempt = None;
            s.last_connect = None;
        }
    }
    fn mark_reauth(&self, provider: Provider) {
        let Ok(mut s) = self.state() else { return };
        let mut config = s.config.clone();
        let Some(meta) = config.connections.get_mut(&provider) else {
            return;
        };
        if meta.reauth_required {
            return;
        }
        meta.reauth_required = true;
        config.revision = match config.revision.checked_add(1) {
            Some(v) => v,
            None => return,
        };
        if config.validate().is_ok() {
            let _ = self.persist(&mut s, config);
        }
    }
    pub async fn connection_info(
        &self,
        context: Context,
        requested: Option<Provider>,
    ) -> Result<Reply> {
        let ctx = context.clone();
        engine::host_call(self.host.clone(), move |h| h.check(&ctx)).await?;
        let (provider, id) = {
            let s = self.state()?;
            let provider = requested.unwrap_or(s.config.selected);
            if !provider.is_oauth() {
                return Err(error(if requested.is_some() { "invalid" } else { "missing" }));
            }
            let meta = s
                .config
                .connections
                .get(&provider)
                .ok_or_else(|| error("missing"))?;
            (provider, meta.credential_id.clone())
        };
        let (_, account) = match self.oauth.verified_account(&id).await {
            Ok(v) => v,
            Err(e) if e.code == "authentication" => {
                self.mark_reauth(provider);
                return Err(e);
            }
            Err(e) => return Err(e),
        };
        let mut s = self.state()?;
        let mut config = s.config.clone();
        let meta = config
            .connections
            .get_mut(&provider)
            .ok_or_else(|| error("missing"))?;
        meta.account_id = account.account_id;
        meta.display_name = account.display_name;
        // Drive type is a write capability gate: an unavailable value must
        // remain unknown and keep OneDrive read-only. Quota is informational,
        // so retain the last known numbers when that endpoint alone fails.
        meta.drive_type = account.drive_type;
        if account.quota_total.is_some() {
            meta.quota_total = account.quota_total;
        }
        if account.quota_used.is_some() {
            meta.quota_used = account.quota_used;
        }
        meta.last_verified_at = Some(unix_now());
        meta.reauth_required = false;
        let public = public_connection(provider, meta);
        config.revision = config.revision.checked_add(1).ok_or_else(|| error("limit"))?;
        config.validate()?;
        self.persist(&mut s, config)?;
        drop(s);
        let mut r = self.reply()?;
        r.connection = Some(public);
        Ok(r)
    }
    pub async fn disconnect(&self, provider: Provider) -> Result<Reply> {
        if !provider.is_oauth() {
            return Err(error("invalid"));
        }
        let mut s = self.state()?;
        let mut config = s.config.clone();
        let meta = config.connections.remove(&provider);
        config.providers.remove(&provider);
        if config.selected == provider {
            config.enabled = false;
        }
        config.revision = config.revision.checked_add(1).ok_or_else(|| error("limit"))?;
        config.approved_workspace = None;
        config.validate()?;
        let mut epoch = self.epoch.write().map_err(|_| error("state"))?;
        self.persist(&mut s, config)?;
        *epoch = epoch.checked_add(1).ok_or_else(|| error("limit"))?;
        s.cancel.cancel();
        s.cancel = CancellationToken::new();
        s.ticket = None;
        if s.attempt.as_ref().is_some_and(|a| a.provider == provider) {
            s.attempt = None;
        }
        if s.last_connect.as_ref().is_some_and(|(p, _)| *p == provider) {
            s.last_connect = None;
        }
        drop(epoch);
        drop(s);
        if let Some(meta) = meta {
            let _ = self.oauth.remove(&meta.credential_id);
        }
        let mut r = self.reply()?;
        r.message = Some("已断开连接；本机笔记和远端密文均保留".into());
        Ok(r)
    }
    /// Host calls from ONE owned foreground timer. Never create a timer from status or UI mount.
    /// `context` must be freshly authorized; no stale window Token may be cached by the scheduler.
    pub async fn automatic(&self, context: Context) -> Result<Option<Reply>> {
        {
            let mut s = self.state()?;
            let automatic = !s.config.selected.is_oauth()
                || s.config.connections.get(&s.config.selected).is_some_and(|m| {
                    !m.reauth_required && capabilities(s.config.selected, m).automatic
                });
            if !s.config.enabled
                || s.config.minutes == 0
                || Instant::now() < s.next_auto
                || !automatic
            {
                return Ok(None);
            }
            s.next_auto = Instant::now() + Duration::from_secs(u64::from(s.config.minutes) * 60);
            if s.config.approved_workspace.is_none() {
                return Err(error("confirmation"));
            }
        }
        let r = self
            .command(context.clone(), CloudCommand::Preview { recovery: None })
            .await?;
        let p = r.preview.ok_or_else(|| error("invalid"))?;
        if !p.remote_exists
            || self.state()?.config.approved_workspace.as_ref() != Some(&p.workspace_id)
        {
            return Err(error("confirmation"));
        }
        self.command(context, CloudCommand::Sync { preview_id: p.id })
            .await
            .map(Some)
    }
    pub fn shutdown(&self) -> Result<()> {
        let s = self.state()?;
        let mut e = self.epoch.write().map_err(|_| error("state"))?;
        *e = e.checked_add(1).ok_or_else(|| error("limit"))?;
        s.cancel.cancel();
        Ok(())
    }
}

#[cfg(test)]
#[path = "lease_tests.rs"]
mod lease_tests;

#[cfg(test)]
mod command_tests {
    use super::*;

    fn connection(
        driver: &str,
        mode: DriveMode,
        drive_type: Option<&str>,
        writer_id: Option<String>,
    ) -> ConnectionMeta {
        ConnectionMeta {
            credential_id: uuid::Uuid::new_v4().to_string(),
            driver: driver.into(),
            account_id: "account".into(),
            display_name: "Test".into(),
            sync_root: "/CyberNote".into(),
            mode,
            drive_type: drive_type.map(str::to_string),
            writer_id,
            created_at: 1,
            last_verified_at: None,
            reauth_required: false,
            quota_total: None,
            quota_used: None,
        }
    }

    #[test]
    fn connection_info_binds_the_requested_provider() {
        let command: CloudCommand = serde_json::from_str(
            r#"{"type":"connectionInfo","provider":"onedrive"}"#,
        )
        .unwrap();
        assert!(matches!(
            command,
            CloudCommand::ConnectionInfo {
                provider: Some(Provider::Onedrive)
            }
        ));
        let legacy: CloudCommand = serde_json::from_str(r#"{"type":"connectionInfo"}"#).unwrap();
        assert!(matches!(
            legacy,
            CloudCommand::ConnectionInfo { provider: None }
        ));
    }

    #[test]
    fn write_capabilities_are_conservative_for_oauth_connections() {
        let personal = capabilities(
            Provider::Onedrive,
            &connection("onedrive_pr", DriveMode::TwoWay, Some("personal"), None),
        );
        assert!(personal.write);
        assert!(personal.automatic);

        let unknown = capabilities(
            Provider::Onedrive,
            &connection("onedrive_pr", DriveMode::TwoWay, None, None),
        );
        assert!(!unknown.write);
        assert!(!unknown.automatic);

        let business = capabilities(
            Provider::Onedrive,
            &connection("onedrive_pr", DriveMode::TwoWay, Some("business"), None),
        );
        assert!(!business.write);

        let baidu_read = capabilities(
            Provider::Baidu,
            &connection("baiduyun_go", DriveMode::ReadOnly, Some("baidu"), None),
        );
        assert!(!baidu_read.write);

        let baidu_write = capabilities(
            Provider::Baidu,
            &connection(
                "baiduyun_go",
                DriveMode::SingleWriter,
                Some("baidu"),
                Some(uuid::Uuid::new_v4().to_string()),
            ),
        );
        assert!(baidu_write.write);
        assert!(baidu_write.automatic);

        let baidu_two_way = capabilities(
            Provider::Baidu,
            &connection(
                "baiduyun_go",
                DriveMode::TwoWay,
                Some("baidu"),
                Some(uuid::Uuid::new_v4().to_string()),
            ),
        );
        assert!(baidu_two_way.write);
        assert!(baidu_two_way.automatic);
        assert!(baidu_two_way.immutable_heads);
    }

    #[test]
    fn config_rejects_unpaired_modes_and_writer_ids() {
        let mut config = Config::default();
        config.connections.insert(
            Provider::Onedrive,
            connection("onedrive_go", DriveMode::TwoWay, Some("business"), None),
        );
        assert_eq!(config.validate().unwrap_err().code, "invalid");

        config.connections.insert(
            Provider::Onedrive,
            connection("onedrive_pr", DriveMode::TwoWay, Some("personal"), None),
        );
        assert!(config.validate().is_ok());

        config.connections.insert(
            Provider::Baidu,
            connection("baiduyun_go", DriveMode::SingleWriter, Some("baidu"), None),
        );
        assert_eq!(config.validate().unwrap_err().code, "invalid");

        config.connections.insert(
            Provider::Baidu,
            connection(
                "baiduyun_go",
                DriveMode::TwoWay,
                Some("baidu"),
                Some(uuid::Uuid::new_v4().to_string()),
            ),
        );
        assert!(config.validate().is_ok());

        config.connections.insert(
            Provider::Baidu,
            connection("baiduyun_go", DriveMode::TwoWay, Some("baidu"), None),
        );
        assert_eq!(config.validate().unwrap_err().code, "invalid");
    }

    #[test]
    fn baidu_reconnect_keeps_the_writer_identity() {
        let writer = uuid::Uuid::new_v4().to_string();
        let previous = connection(
            "baiduyun_go",
            DriveMode::SingleWriter,
            Some("baidu"),
            Some(writer.clone()),
        );
        assert_eq!(
            writer_identity(
                Provider::Baidu,
                "baiduyun_go",
                DriveMode::SingleWriter,
                Some(&previous),
            )
            .as_deref(),
            Some(writer.as_str())
        );
        assert_eq!(
            writer_identity(
                Provider::Baidu,
                "baiduyun_go",
                DriveMode::TwoWay,
                Some(&previous),
            )
            .as_deref(),
            Some(writer.as_str())
        );
        assert!(writer_identity(
            Provider::Baidu,
            "baiduyun_go",
            DriveMode::ReadOnly,
            Some(&previous),
        )
        .is_none());
        assert!(
            writer_identity(Provider::Onedrive, "onedrive_pr", DriveMode::TwoWay, None).is_none()
        );
        let fresh =
            writer_identity(Provider::Baidu, "baiduyun_go", DriveMode::TwoWay, None).unwrap();
        assert_ne!(fresh, writer);
        assert!(crate::sync::model::valid_uuid(&fresh));
    }

    struct CheckOnly;
    impl engine::CloudHost for CheckOnly {
        fn check(&self, _: &Context) -> Result<()> {
            Ok(())
        }
        fn inspect(&self, _: &Context) -> Result<engine::LocalInfo> {
            panic!("not used")
        }
        fn capture(
            &self,
            _: &Context,
            _: &str,
            _: bool,
            _: Lease,
        ) -> Result<engine::Capture> {
            panic!("not used")
        }
        fn validate(&self, _: &Context, _: &Bundle, _: Lease) -> Result<()> {
            panic!("not used")
        }
        fn commit(
            &self,
            _: &Context,
            _: Bundle,
            _: &str,
            _: Lease,
        ) -> Result<engine::CommitReport> {
            panic!("not used")
        }
    }

    #[test]
    fn failed_attempt_is_retired_with_a_safe_status() {
        let dir = tempfile::tempdir().unwrap();
        let runtime = CloudRuntime::new(
            &dir.path().canonicalize().unwrap(),
            Arc::new(CheckOnly),
        )
        .unwrap();
        let instance = "cloud-auth-test".to_string();
        runtime.state.lock().unwrap().attempt = Some(Attempt {
            id: uuid::Uuid::new_v4().to_string(),
            instance: instance.clone(),
            generation: 7,
            provider: Provider::Onedrive,
            driver: "onedrive_pr".into(),
            context: Context {
                window: "main".into(),
                session: "session".into(),
                token: serde_json::json!({"epoch": 1}),
                store_instance: "store".into(),
            },
            cookies: vec![],
            mode: DriveMode::TwoWay,
            writer_id: None,
            payload: None,
            completing: false,
            error: None,
            started: Instant::now(),
        });
        assert_eq!(
            runtime.fail_attempt(&instance, error("network")),
            Some((instance.clone(), 7))
        );
        let status = runtime.status().unwrap();
        assert!(status.connections.is_empty());
        assert_eq!(status.connect.state, "failed");
        assert_eq!(status.connect.provider, Some(Provider::Onedrive));
        assert_eq!(status.connect.error.unwrap().code, "network");
        assert!(runtime.state.lock().unwrap().attempt.is_none());
    }
}
