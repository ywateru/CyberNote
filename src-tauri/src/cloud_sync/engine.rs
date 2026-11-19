use super::{
    crypto,
    model::*,
    protocol::{Remote, Revision},
};
use crate::sync::model::{join, WireVersion};
use serde::{Deserialize, Serialize};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
/// Opaque host authority. Must bind actual live window, Token, Session and Store instance.
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Context {
    pub window: String,
    pub session: String,
    pub token: serde_json::Value,
    pub store_instance: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalInfo {
    pub store_workspace_id: Option<String>,
    pub store_device_id: Option<String>,
    pub generation: String,
    pub notes: usize,
}
#[derive(Clone)]
pub struct Capture {
    pub bundle: Bundle,
    pub generation: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitReport {
    pub applied: bool,
    pub pending: usize,
    pub conflicts: usize,
}
/// See README.md for exact quiet/media/revalidation obligations. No network work in these calls.
pub trait CloudHost: Send + Sync + 'static {
    fn inspect(&self, context: &Context) -> Result<LocalInfo>;
    fn check(&self, context: &Context) -> Result<()>;
    /// Drain editors through the existing quiet barrier; initialize only after explicit preview confirmation.
    fn capture(
        &self,
        context: &Context,
        workspace: &str,
        initialize: bool,
        lease: super::runtime::Lease,
    ) -> Result<Capture>;
    fn validate(
        &self,
        context: &Context,
        bundle: &Bundle,
        lease: super::runtime::Lease,
    ) -> Result<()>;
    /// Validate the complete batch before publication; recheck authority and capture generation at commit.
    /// Stage blobs outside Session lock; receive+quiet apply through existing Store transactions/events.
    /// Persist setting heads and projected allowlisted values in that same Store, never a second Store.
    fn commit(
        &self,
        context: &Context,
        bundle: Bundle,
        expected_generation: &str,
        lease: super::runtime::Lease,
    ) -> Result<CommitReport>;
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub id: String,
    pub source: String,
    pub remote_exists: bool,
    pub workspace_id: String,
    pub local_notes: usize,
    pub versions: usize,
    pub attachments: usize,
    pub bytes: usize,
    pub conflicts: usize,
}
pub struct Ticket {
    pub preview: Preview,
    pub remote: Option<Bundle>,
    pub revision: Revision,
    pub context: Context,
    pub config_revision: u64,
    pub generation: String,
    pub expires: Instant,
}
impl Ticket {
    pub fn check(&self, context: &Context, config: &Config) -> Result<()> {
        if Instant::now() > self.expires
            || &self.context != context
            || self.config_revision != config.revision
        {
            return Err(error("stale"));
        }
        Ok(())
    }
}
pub async fn read(remote: &Remote, password: &str) -> Result<(Option<Bundle>, Revision, usize)> {
    let o = remote.get().await?;
    let size = o.bytes.len();
    if o.revision == Revision::Missing {
        return Ok((None, o.revision, 0));
    }
    let pass = password.to_string();
    let b = tokio::task::spawn_blocking(move || crypto::decrypt(&o.bytes, &pass))
        .await
        .map_err(|_| error("invalid"))??;
    Ok((Some(b), o.revision, size))
}
pub async fn host_call<T: Send + 'static>(
    host: Arc<dyn CloudHost>,
    f: impl FnOnce(Arc<dyn CloudHost>) -> Result<T> + Send + 'static,
) -> Result<T> {
    tokio::task::spawn_blocking(move || f(host))
        .await
        .map_err(|_| error("invalid"))?
}
pub async fn preview(
    host: Arc<dyn CloudHost>,
    context: Context,
    config: &Config,
    remote: Option<Bundle>,
    revision: Revision,
    bytes: usize,
    source: String,
) -> Result<Ticket> {
    let ctx = context.clone();
    let local = host_call(host, move |h| h.inspect(&ctx)).await?;
    let workspace = remote
        .as_ref()
        .map(|b| b.workspace_id.clone())
        .or_else(|| config.approved_workspace.clone())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    if source == "remote"
        && config
            .approved_workspace
            .as_ref()
            .is_some_and(|w| w != &workspace)
    {
        return Err(error("workspace"));
    }
    let conflicts = remote.as_ref().map(|b| conflicts(b)).unwrap_or(0);
    let p = Preview {
        id: uuid::Uuid::new_v4().to_string(),
        source,
        remote_exists: remote.is_some(),
        workspace_id: workspace,
        local_notes: local.notes,
        versions: remote.as_ref().map_or(0, |b| b.versions.len()),
        attachments: remote.as_ref().map_or(0, |b| b.blobs.len()),
        bytes,
        conflicts,
    };
    Ok(Ticket {
        preview: p,
        remote,
        revision,
        context,
        config_revision: config.revision,
        generation: local.generation,
        expires: Instant::now() + Duration::from_secs(300),
    })
}
pub fn conflicts(b: &Bundle) -> usize {
    let mut keys = std::collections::BTreeMap::new();
    for v in &b.versions {
        *keys
            .entry((v.kind.as_str(), v.entity_id.as_str()))
            .or_insert(0usize) += 1;
    }
    let mut sets = std::collections::BTreeMap::new();
    for s in &b.settings {
        *sets.entry(s.key.as_str()).or_insert(0usize) += 1;
    }
    keys.values()
        .chain(sets.values())
        .filter(|n| **n > 1)
        .count()
}
/// Restore creates causal successors of selected historical heads. Entity and attachment IDs survive;
/// unrelated newer entities remain, and historical conflicts remain concurrent with each other.
pub fn restore(current: &Bundle, old: &Bundle) -> Result<Bundle> {
    current.validate()?;
    old.validate()?;
    if current.workspace_id != old.workspace_id {
        return Err(error("workspace"));
    }
    let mut restored = Bundle::empty(old.workspace_id.clone());
    restored.blobs = old.blobs.clone();
    for v in &old.versions {
        let mut vector = join(
            current
                .versions
                .iter()
                .chain(&old.versions)
                .filter(|x| x.kind == v.kind && x.entity_id == v.entity_id)
                .map(|x| &x.vector),
        );
        vector.insert(uuid::Uuid::new_v4().to_string(), 1);
        restored.versions.push(
            WireVersion {
                vector,
                ..v.clone()
            }
            .seal(),
        );
    }
    for v in &old.settings {
        let mut vector = join(
            current
                .settings
                .iter()
                .chain(&old.settings)
                .filter(|x| x.key == v.key)
                .map(|x| &x.vector),
        );
        vector.insert(uuid::Uuid::new_v4().to_string(), 1);
        restored.settings.push(
            SettingVersion {
                vector,
                ..v.clone()
            }
            .seal(),
        );
    }
    merge(current, &restored)
}
