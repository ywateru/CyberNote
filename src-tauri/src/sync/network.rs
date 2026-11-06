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
pub const MAX_HEAD: usize = 16 * 1024 * 1024;
pub const MAX_BLOB: u64 = 256 * 1024 * 1024;
pub const PAGE_SIZE: usize = 128;
pub(crate) const NETWORK_TIMEOUT: Duration = Duration::from_secs(5);
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
pub(crate) struct Shared {
    backend: Arc<dyn SyncBackend>,
    identity: Arc<IdentityStore>,
    staging: staging::Staging,
    status: Mutex<ServiceStatus>,
}
impl Shared {
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
