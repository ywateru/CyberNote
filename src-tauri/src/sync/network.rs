//! Authenticated replication transport. Store/Session integration is supplied by SyncBackend.
//! Network awaits never run inside a backend call; incoming receipts mean durable inbox, not UI apply.
use super::identity::{IdentityStore, PairingInvite, Peer, Result, SyncError};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};
#[path = "network/service.rs"]
mod service;
#[path = "network/staging.rs"]
mod staging;
#[path = "network/transport.rs"]
mod transport;
#[path = "network/wire.rs"]
mod wire;
pub use service::SyncService;
pub const MAX_PLAIN_FRAME: usize = 48 * 1024;
pub const CHUNK: usize = 24 * 1024;
// Keep the existing bounded wire frames, but amortize WAN round trips across
// a small ordered window. At most 192 KiB of blob payload is outstanding.
pub(super) const BLOB_WINDOW: usize = 8;
pub const MAX_HEAD: usize = 16 * 1024 * 1024;
pub const MAX_BLOB: u64 = 256 * 1024 * 1024;
pub const PAGE_SIZE: usize = 128;
pub(crate) const NETWORK_TIMEOUT: Duration = Duration::from_secs(5);
/// One explicit transfer, bounded even while making progress. Short IO deadlines
/// still detect a stalled peer; signed account authority is renewed separately.
pub(crate) const ACCOUNT_TRANSFER_TIMEOUT: Duration = Duration::from_secs(20 * 60);
pub(crate) const ACCOUNT_IO_TIMEOUT: Duration = Duration::from_secs(30);
/// Local-only progress. Counts are acknowledged version records, not applied notes.
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TransferProgress {
    pub stage: ProgressStage,
    pub completed: u64,
    pub total: u64,
    pub bytes_transferred: u64,
}
#[derive(Clone, Copy, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ProgressStage {
    #[default]
    Connecting,
    Pairing,
    Inventory,
    Receiving,
    Sending,
    Finishing,
}
pub(crate) type ProgressObserver = Arc<dyn Fn(TransferProgress) + Send + Sync>;
// Explicit local diagnostic mode; never logs identifiers, content, endpoints or
// upstream strings. Disabled in release builds and normal client launches.
pub(crate) fn diagnostics_enabled() -> bool {
    cfg!(debug_assertions) && std::env::var("CYBERNOTE_SYNC_DIAGNOSTICS").as_deref() == Ok("1")
}
pub(crate) fn diagnostic(stage: &'static str, event: &'static str, elapsed_ms: u64, error: Option<SyncError>) {
    if !diagnostics_enabled() { return; }
    static RECORDS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    if RECORDS.fetch_add(1, std::sync::atomic::Ordering::Relaxed) >= 8192 { return; }
    let at = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
    eprintln!("CYBERNOTE_SYNC_DIAGNOSTIC {}", serde_json::json!({"at":at,"stage":stage,"event":event,"elapsedMs":elapsed_ms,"error":error}));
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TransferDirection {
    Push,
    Pull,
    Both,
}
impl TransferDirection {
    fn sends(self) -> bool {
        matches!(self, Self::Push | Self::Both)
    }
    fn receives(self) -> bool {
        matches!(self, Self::Pull | Self::Both)
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BlobRef {
    pub sha256: String,
    pub size: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InventoryPage {
    pub digests: Vec<String>,
    pub next: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Receipt {
    pub durable: bool,
    pub applied: bool,
}
/// All methods must be short synchronous calls. Clone a local blob path before disk IO,
/// and release Session/Store guards before network/disk transfer. Errors must be safe categories.
/// inventory is ascending digest order, exclusive `after`, with next=last digest iff more exist.
/// receive_head MUST validate production WireVersion + persist inbox transactionally, never
/// invoke an active editor apply. store_blob MUST hash/size/fsync/publish atomically.
pub trait SyncBackend: Send + Sync + 'static {
    fn workspace_id(&self) -> Result<String>;
    fn device_id(&self) -> Result<String>;
    fn prepare_pairing(&self, workspace: &str) -> Result<()>;
    /// Idempotent adoption preserving existing records; rejects an already enabled other workspace.
    fn adopt_workspace(&self, workspace: &str) -> Result<()>;
    fn flush(&self) -> Result<()>;
    fn inventory(&self, after: Option<&str>, limit: usize) -> Result<InventoryPage>;
    fn version(&self, digest: &str) -> Result<Value>;
    /// MUST fully validate the wire schema, workspace, digest, IDs, ownership, time and
    /// all aggregate budgets BEFORE returning refs. Called before any blob allocation/download.
    fn required_blobs(&self, version: &Value) -> Result<Vec<BlobRef>>;
    fn has_blob(&self, blob: &BlobRef) -> Result<bool>;
    fn read_blob_chunk(&self, blob: &BlobRef, offset: u64, max: usize) -> Result<Vec<u8>>;
    /// source is a trusted transport-generated local staging path, never a wire path.
    fn store_blob(&self, blob: &BlobRef, source: &Path) -> Result<()>;
    fn receive_head(&self, version: Value) -> Result<Receipt>;
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStatus {
    pub peer_id: String,
    pub phase: String,
    pub last_success: Option<u64>,
    pub error: Option<SyncError>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceStatus {
    pub listening: Option<String>,
    pub connections: Vec<ConnectionStatus>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingStatus {
    pub peer_id: String,
    pub workspace_id: String,
    pub device_id: String,
    pub ready: bool,
}
impl From<&Peer> for PairingStatus {
    fn from(p: &Peer) -> Self {
        Self {
            peer_id: p.invitation_id.clone(),
            workspace_id: p.workspace_id.clone(),
            device_id: p.device_id.clone(),
            ready: p.phase == super::identity::PairingPhase::Ready,
        }
    }
}
/// Account policy is optional only for legacy manual services. Implementations
/// must be synchronous snapshots; no network or OAuth under Store/Session locks.
pub(crate) trait ReplicationPolicy: Send + Sync {
    fn authorize(&self, device: &str, noise_key: &str) -> Result<()>;
    fn endpoint(&self, device: &str) -> Result<String>;
}
pub(crate) struct Shared {
    blocking: tokio_util::task::TaskTracker,
    policy: Option<Arc<dyn ReplicationPolicy>>,
    account_operation: Arc<Mutex<bool>>,
    backend: Arc<dyn SyncBackend>,
    identity: Arc<IdentityStore>,
    staging: staging::Staging,
    status: Mutex<ServiceStatus>,
}
/// Nonqueueing authority, held through task destruction (including synchronous calls).
struct AccountPermit(Arc<Mutex<bool>>);
impl Drop for AccountPermit {
    fn drop(&mut self) {
        if let Ok(mut busy) = self.0.lock() {
            *busy = false;
        }
    }
}
impl Shared {
    async fn local<T: Send + 'static>(
        self: &Arc<Self>,
        operation: impl FnOnce(&Shared) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        let owner = self.clone();
        self.blocking.spawn_blocking(move || operation(&owner))
            .await.map_err(|_| SyncError::Backend)?
    }
    fn reserve_account_operation(&self) -> Result<Option<AccountPermit>> {
        if self.policy.is_none() {
            return Ok(None);
        }
        let mut busy = self.account_operation.lock().map_err(|_| SyncError::Io)?;
        if *busy {
            return Err(SyncError::Busy);
        }
        *busy = true;
        Ok(Some(AccountPermit(self.account_operation.clone())))
    }
    fn authorize(&self, device: &str, key: &str) -> Result<()> {
        if let Some(policy) = &self.policy {
            policy.authorize(device, key)?;
        }
        Ok(())
    }
    fn status(&self, id: &str, phase: &str, error: Option<SyncError>, success: bool) {
        if let Ok(mut s) = self.status.lock() {
            let index = s.connections.iter().position(|v| v.peer_id == id);
            let v = if let Some(i) = index {
                &mut s.connections[i]
            } else {
                if s.connections.len() >= 64 {
                    return;
                }
                s.connections.push(ConnectionStatus {
                    peer_id: id.into(),
                    phase: phase.into(),
                    last_success: None,
                    error: None,
                });
                s.connections.last_mut().unwrap()
            };
            v.phase = phase.into();
            v.error = error;
            if success {
                v.last_success = Some(super::identity::now());
            }
        }
    }
}
pub(crate) fn digest(s: &str) -> Result<()> {
    if s.len() != 64
        || !s
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(SyncError::Protocol);
    }
    Ok(())
}
pub(crate) fn blob(b: &BlobRef) -> Result<()> {
    digest(&b.sha256)?;
    if b.size > MAX_BLOB {
        return Err(SyncError::Limit);
    }
    Ok(())
}
pub(crate) fn check_json(value: &Value) -> Result<()> {
    let mut stack = vec![(value, 1usize)];
    while let Some((v, d)) = stack.pop() {
        if d > 64 {
            return Err(SyncError::Limit);
        }
        match v {
            Value::Array(a) => stack.extend(a.iter().map(|v| (v, d + 1))),
            Value::Object(o) => stack.extend(o.values().map(|v| (v, d + 1))),
            _ => {}
        }
    }
    Ok(())
}
pub(crate) fn blobs(shared: &Shared, value: &Value) -> Result<Vec<BlobRef>> {
    let blobs = shared.backend.required_blobs(value)?;
    if blobs.len() > 1024 {
        return Err(SyncError::Limit);
    }
    let mut seen = BTreeMap::new();
    for b in &blobs {
        blob(b)?;
        if let Some(size) = seen.insert(&b.sha256, b.size) {
            if size != b.size {
                return Err(SyncError::Protocol);
            }
        }
    }
    Ok(blobs)
}
