use super::{
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
    sync::{Arc, Mutex, RwLock, RwLockReadGuard},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio_util::sync::CancellationToken;
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
/// Host retains `enter()` only around its FINAL short authority+Store transaction.
#[derive(Clone)]
pub struct Lease {
    epoch: Arc<RwLock<u64>>,
    expected: u64,
    cancel: CancellationToken,
    workspace: Option<String>,
    fence: Option<CloudFence>,
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
        self.fence.as_ref().ok_or_else(|| error("permission"))
    }
    fn bind(mut self, workspace: String) -> Self {
        self.workspace = Some(workspace);
        self
    }
    pub fn enter(&self) -> Result<RwLockReadGuard<'_, u64>> {
        let guard = self.epoch.read().map_err(|_| error("state"))?;
        if self.cancel.is_cancelled() || *guard != self.expected {
            return Err(error("permission"));
        }
        Ok(guard)
    }
    pub fn check(&self) -> Result<()> {
        drop(self.enter()?);
        Ok(())
    }
}
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum CloudCommand {
    Status,
    Save {
        patch: ConfigPatch,
    },
    Test,
    Preview {
        #[serde(default)]
        recovery: Option<String>,
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
}
struct State {
    config: Config,
    raw: Option<Vec<u8>>,
    ticket: Option<Ticket>,
    last_success: Option<u64>,
    last_error: Option<CloudError>,
    cancel: CancellationToken,
    next_auto: Instant,
}
pub struct CloudRuntime {
    host: Arc<dyn CloudHost>,
    files: PrivateFiles,
    state: Mutex<State>,
    operation: tokio::sync::Mutex<()>,
    epoch: Arc<RwLock<u64>>,
    #[cfg(test)]
    fixture: Option<String>,
}
impl CloudRuntime {
    pub fn new(root: &Path, host: Arc<dyn CloudHost>) -> Result<Arc<Self>> {
        let files = PrivateFiles::open(root)?;
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
            }),
            operation: tokio::sync::Mutex::new(()),
            #[cfg(test)]
            fixture: None,
            epoch: Arc::new(RwLock::new(0)),
        }))
    }
    #[cfg(test)]
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
        })
    }
    fn persist(&self, s: &mut State, c: Config) -> Result<()> {
        let raw = serde_json::to_vec(&c).map_err(|_| error("state"))?;
        self.files.replace("state.json", &raw, s.raw.as_deref())?;
        s.raw = Some(raw);
        s.config = c;
        Ok(())
    }
    fn reply(&self) -> Result<Reply> {
        Ok(Reply {
            status: self.status()?,
            preview: None,
            result: None,
            message: None,
        })
    }
    fn remote(&self, c: &Config) -> Result<Remote> {
        if !c.enabled {
            return Err(error("disabled"));
        }
        let config = c
            .providers
            .get(&c.selected)
            .cloned()
            .ok_or_else(|| error("invalid"))?;
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
        if let CloudCommand::Save { patch } = command {
            let mut s = self.state()?;
            let c = s.config.patch(patch)?;
            if c.enabled {
                self.remote(&c)?;
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
            let mut s = self.state()?;
            if s.config.revision == config.revision {
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
        let remote = self.remote(c)?;
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
            _ => Err(error("invalid")),
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
    /// Host calls from ONE owned foreground timer. Never create a timer from status or UI mount.
    /// `context` must be freshly authorized; no stale window Token may be cached by the scheduler.
    pub async fn automatic(&self, context: Context) -> Result<Option<Reply>> {
        {
            let mut s = self.state()?;
            if !s.config.enabled || s.config.minutes == 0 || Instant::now() < s.next_auto {
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
