//! Private, durable Noise identities. This file is deliberately outside backup settings.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

pub const NOISE: &str = "Noise_XXpsk3_25519_ChaChaPoly_BLAKE2s";
const INVITE_LIFETIME: u64 = 600;
const MAX_CREDENTIALS: usize = 64;
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SyncError {
    Io,
    InvalidInput,
    CorruptIdentity,
    Authentication,
    Expired,
    Revoked,
    WorkspaceMismatch,
    Protocol,
    Limit,
    Timeout,
    Stopped,
    Backend,
    PlanStale,
    Busy,
    Transport,
}
pub type Result<T> = std::result::Result<T, SyncError>;
impl std::fmt::Display for SyncError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "sync_{:?}", self)
    }
}
impl std::error::Error for SyncError {}
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
pub(crate) fn uuid(value: &str) -> Result<()> {
    Uuid::parse_str(value)
        .map(|_| ())
        .map_err(|_| SyncError::InvalidInput)
}
pub(crate) fn key(value: &str) -> Result<Vec<u8>> {
    let bytes = B64.decode(value).map_err(|_| SyncError::InvalidInput)?;
    if bytes.len() != 32 {
        return Err(SyncError::InvalidInput);
    }
    Ok(bytes)
}
pub(crate) fn encode(bytes: &[u8]) -> String {
    B64.encode(bytes)
}
pub fn endpoint(value: &str) -> Result<url::Url> {
    if value.len() > 2048 {
        return Err(SyncError::Limit);
    }
    let url = url::Url::parse(value).map_err(|_| SyncError::InvalidInput)?;
    if !matches!(url.scheme(), "ws" | "wss")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || url.query().is_some()
    {
        return Err(SyncError::InvalidInput);
    }
    Ok(url)
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PairingInvite {
    pub version: u8,
    pub workspace_id: String,
    pub invitation_id: String,
    pub endpoint: String,
    pub host_key: String,
    pub psk: String,
    pub expires_at: u64,
}
impl PairingInvite {
    pub fn decode(token: &str) -> Result<Self> {
        if token.len() > 8192 {
            return Err(SyncError::Limit);
        }
        let token = token
            .strip_prefix("notes-sync-v1:")
            .ok_or(SyncError::InvalidInput)?;
        let bytes = B64.decode(token).map_err(|_| SyncError::InvalidInput)?;
        let invite: Self = serde_json::from_slice(&bytes).map_err(|_| SyncError::InvalidInput)?;
        invite.validate()?;
        if invite.expires_at <= now() {
            return Err(SyncError::Expired);
        }
        Ok(invite)
    }
    pub fn token(&self) -> Result<String> {
        self.validate()?;
        Ok(format!(
            "notes-sync-v1:{}",
            B64.encode(serde_json::to_vec(self).map_err(|_| SyncError::InvalidInput)?)
        ))
    }
    fn validate(&self) -> Result<()> {
        if self.version != 1 {
            return Err(SyncError::Protocol);
        }
        uuid(&self.workspace_id)?;
        uuid(&self.invitation_id)?;
        endpoint(&self.endpoint)?;
        key(&self.host_key)?;
        key(&self.psk)?;
        Ok(())
    }
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PairingPhase {
    Prepared,
    Ready,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Peer {
    pub phase: PairingPhase,
    pub invitation_id: String,
    pub workspace_id: String,
    pub endpoint: String,
    pub host_key: String,
    pub device_id: String,
    pub(crate) psk: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Grant {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    expected_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    expected_device: Option<String>,
    workspace_id: String,
    psk: String,
    expires_at: u64,
    revoked: bool,
    client_key: Option<String>,
    device_id: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Data {
    version: u8,
    device_id: String,
    private_key: String,
    public_key: String,
    grants: BTreeMap<String, Grant>,
    peers: BTreeMap<String, Peer>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedDevice {
    pub invitation_id: String,
    pub device_id: String,
    pub revoked: bool,
}
pub struct IdentityStore {
    path: PathBuf,
    data: Mutex<Data>,
}
impl IdentityStore {
    /// Read only device selector for a previously prepared identity. Complete
    /// credential validation still happens in open, before any network is built.
    pub fn existing_device_id(sync_directory: &Path) -> Result<Option<String>> {
        match fs::symlink_metadata(sync_directory) {
            Ok(meta) if meta.is_dir() && !meta.file_type().is_symlink() => (),
            Ok(_) => return Err(SyncError::CorruptIdentity),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(SyncError::Io),
        }
        let path = sync_directory.join("identity-v1.json");
        let meta = match fs::symlink_metadata(&path) {
            Ok(meta) => meta,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(SyncError::Io),
        };
        if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > 512 * 1024 {
            return Err(SyncError::CorruptIdentity);
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if meta.permissions().mode() & 0o777 != 0o600 {
                return Err(SyncError::CorruptIdentity);
            }
        }
        let mut bytes = Vec::new();
        File::open(path)
            .and_then(|f| f.take(512 * 1024 + 1).read_to_end(&mut bytes))
            .map_err(|_| SyncError::Io)?;
        let data: Data = serde_json::from_slice(&bytes).map_err(|_| SyncError::CorruptIdentity)?;
        if data.version != 1 {
            return Err(SyncError::CorruptIdentity);
        }
        uuid(&data.device_id)?;
        Ok(Some(data.device_id))
    }
    /// `sync_directory` is a trusted application-owned .sync directory, never a remote path.
    pub fn open(sync_directory: &Path, device_id: &str) -> Result<Self> {
        uuid(device_id)?;
        if let Ok(meta) = fs::symlink_metadata(sync_directory) {
            if !meta.is_dir() || meta.file_type().is_symlink() {
                return Err(SyncError::Io);
            }
        }
        fs::create_dir_all(sync_directory).map_err(|_| SyncError::Io)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(sync_directory, fs::Permissions::from_mode(0o700))
                .map_err(|_| SyncError::Io)?;
        }
        let path = sync_directory.join("identity-v1.json");
        let data = match fs::symlink_metadata(&path) {
            Ok(meta) => {
                if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > 512 * 1024 {
                    return Err(SyncError::CorruptIdentity);
                }
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    if meta.permissions().mode() & 0o777 != 0o600 {
                        return Err(SyncError::CorruptIdentity);
                    }
                }
                let mut bytes = Vec::new();
                File::open(&path)
                    .and_then(|f| f.take(512 * 1024 + 1).read_to_end(&mut bytes))
                    .map_err(|_| SyncError::Io)?;
                let data: Data =
                    serde_json::from_slice(&bytes).map_err(|_| SyncError::CorruptIdentity)?;
                if data.version != 1
                    || data.device_id != device_id
                    || data.grants.len() > MAX_CREDENTIALS
                    || data.peers.len() > MAX_CREDENTIALS
                {
                    return Err(SyncError::CorruptIdentity);
                }
                key(&data.private_key)?;
                key(&data.public_key)?;
                for (id, g) in &data.grants {
                    uuid(id)?;
                    uuid(&g.workspace_id)?;
                    key(&g.psk)?;
                    if g.expected_key.is_some() != g.expected_device.is_some() {
                        return Err(SyncError::CorruptIdentity);
                    }
                    if let Some(k) = &g.expected_key {
                        key(k)?;
                    }
                    if let Some(d) = &g.expected_device {
                        uuid(d)?;
                    }
                    if let Some(k) = &g.client_key {
                        key(k)?;
                    }
                    if let Some(d) = &g.device_id {
                        uuid(d)?;
                    }
                    if g.client_key.is_some() != g.device_id.is_some() {
                        return Err(SyncError::CorruptIdentity);
                    }
                }
                for (id, p) in &data.peers {
                    uuid(id)?;
                    uuid(&p.device_id)?;
                    uuid(&p.workspace_id)?;
                    key(&p.host_key)?;
                    key(&p.psk)?;
                    endpoint(&p.endpoint)?;
                    if *id != p.invitation_id {
                        return Err(SyncError::CorruptIdentity);
                    }
                }
                data
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                let kp = snow::Builder::new(NOISE.parse().map_err(|_| SyncError::Protocol)?)
                    .generate_keypair()
                    .map_err(|_| SyncError::Authentication)?;
                let data = Data {
                    version: 1,
                    device_id: device_id.into(),
                    private_key: encode(&kp.private),
                    public_key: encode(&kp.public),
                    grants: BTreeMap::new(),
                    peers: BTreeMap::new(),
                };
                persist(&path, &data)?;
                data
            }
            Err(_) => return Err(SyncError::Io),
        };
        Ok(Self {
            path,
            data: Mutex::new(data),
        })
    }
    pub fn device_id(&self) -> Result<String> {
        Ok(self
            .data
            .lock()
            .map_err(|_| SyncError::Io)?
            .device_id
            .clone())
    }
    pub fn public_key(&self) -> Result<String> {
        Ok(self
            .data
            .lock()
            .map_err(|_| SyncError::Io)?
            .public_key
            .clone())
    }
    pub(crate) fn private_key(&self) -> Result<Vec<u8>> {
        key(&self.data.lock().map_err(|_| SyncError::Io)?.private_key)
    }
    fn update<T>(&self, action: impl FnOnce(&mut Data) -> Result<T>) -> Result<T> {
        let mut guard = self.data.lock().map_err(|_| SyncError::Io)?;
        let mut next = guard.clone();
        let result = action(&mut next)?;
        persist(&self.path, &next)?;
        *guard = next;
        Ok(result)
    }
    pub fn invite(&self, workspace_id: &str, address: &str) -> Result<PairingInvite> {
        uuid(workspace_id)?;
        endpoint(address)?;
        let mut bytes = [0u8; 32];
        OsRng.fill_bytes(&mut bytes);
        self.update(|d| {
            d.grants
                .retain(|_, g| !g.revoked && (g.client_key.is_some() || g.expires_at > now()));
            if d.grants.len() >= MAX_CREDENTIALS {
                return Err(SyncError::Limit);
            }
            let id = Uuid::new_v4().to_string();
            let psk = encode(&bytes);
            let expires_at = now() + INVITE_LIFETIME;
            d.grants.insert(
                id.clone(),
                Grant {
                    expected_key: None,
                    expected_device: None,
                    workspace_id: workspace_id.into(),
                    psk: psk.clone(),
                    expires_at,
                    revoked: false,
                    client_key: None,
                    device_id: None,
                },
            );
            Ok(PairingInvite {
                version: 1,
                workspace_id: workspace_id.into(),
                invitation_id: id,
                endpoint: address.into(),
                host_key: d.public_key.clone(),
                psk,
                expires_at,
            })
        })
    }
    /// Only the enrolled Noise key/device may consume this grant; an unconsumed
    /// grant still expires. Never emulate consumption by pre-filling client_key.
    pub(crate) fn invite_enrolled(
        &self,
        workspace: &str,
        address: &str,
        device: &str,
        public_key: &str,
    ) -> Result<PairingInvite> {
        uuid(device)?;
        key(public_key)?;
        {
            let d = self.data.lock().map_err(|_| SyncError::Io)?;
            if let Some((id, grant)) = d.grants.iter().find(|(_, g)| {
                !g.revoked
                    && g.workspace_id == workspace
                    && g.expected_key.as_deref() == Some(public_key)
                    && g.expected_device.as_deref() == Some(device)
                    && (g.client_key.is_some() || g.expires_at > now())
            }) {
                return Ok(PairingInvite {
                    version: 1,
                    workspace_id: workspace.into(),
                    invitation_id: id.clone(),
                    endpoint: address.into(),
                    host_key: d.public_key.clone(),
                    psk: grant.psk.clone(),
                    expires_at: now() + INVITE_LIFETIME,
                });
            }
        }
        let invite = self.invite(workspace, address)?;
        self.update(|d| {
            let grant = d
                .grants
                .get_mut(&invite.invitation_id)
                .ok_or(SyncError::Authentication)?;
            grant.expected_key = Some(public_key.into());
            grant.expected_device = Some(device.into());
            Ok(())
        })?;
        Ok(invite)
    }
    pub(crate) fn peer_for_device(&self, device: &str) -> Result<Option<String>> {
        Ok(self
            .data
            .lock()
            .map_err(|_| SyncError::Io)?
            .peers
            .iter()
            .find(|(_, p)| p.device_id == device)
            .map(|(id, _)| id.clone()))
    }
    pub(crate) fn server_psk(&self, id: &str, workspace: &str) -> Result<Vec<u8>> {
        let d = self.data.lock().map_err(|_| SyncError::Io)?;
        let g = d.grants.get(id).ok_or(SyncError::Authentication)?;
        if g.revoked {
            return Err(SyncError::Revoked);
        }
        if g.workspace_id != workspace {
            return Err(SyncError::WorkspaceMismatch);
        }
        if g.client_key.is_none() && g.expires_at <= now() {
            return Err(SyncError::Expired);
        }
        key(&g.psk)
    }
    /// Atomically consume the one-time invite or check its already pinned client identity.
    pub(crate) fn authorize(
        &self,
        id: &str,
        workspace: &str,
        client_key: &str,
        device: &str,
    ) -> Result<()> {
        uuid(device)?;
        key(client_key)?;
        self.update(|d| {
            let g = d.grants.get_mut(id).ok_or(SyncError::Authentication)?;
            if g.revoked {
                return Err(SyncError::Revoked);
            }
            if g.workspace_id != workspace {
                return Err(SyncError::WorkspaceMismatch);
            }
            if g.expected_key.as_deref().is_some_and(|k| k != client_key)
                || g.expected_device.as_deref().is_some_and(|d| d != device)
            {
                return Err(SyncError::Authentication);
            }
            match (&g.client_key, &g.device_id) {
                (Some(k), Some(dev)) if k == client_key && dev == device => Ok(()),
                (None, None) if g.expires_at > now() => {
                    g.client_key = Some(client_key.into());
                    g.device_id = Some(device.into());
                    Ok(())
                }
                (None, None) => Err(SyncError::Expired),
                _ => Err(SyncError::Authentication),
            }
        })
    }
    pub(crate) fn check_authorized(
        &self,
        id: &str,
        workspace: &str,
        client_key: &str,
        device: &str,
    ) -> Result<()> {
        let d = self.data.lock().map_err(|_| SyncError::Io)?;
        let g = d.grants.get(id).ok_or(SyncError::Authentication)?;
        if g.revoked {
            return Err(SyncError::Revoked);
        }
        if g.workspace_id != workspace {
            return Err(SyncError::WorkspaceMismatch);
        }
        if g.client_key.as_deref() != Some(client_key) || g.device_id.as_deref() != Some(device) {
            return Err(SyncError::Authentication);
        }
        Ok(())
    }
    pub(crate) fn remember_peer(&self, invite: &PairingInvite, device: &str) -> Result<Peer> {
        uuid(device)?;
        let p = Peer {
            phase: PairingPhase::Prepared,
            invitation_id: invite.invitation_id.clone(),
            workspace_id: invite.workspace_id.clone(),
            endpoint: invite.endpoint.clone(),
            host_key: invite.host_key.clone(),
            device_id: device.into(),
            psk: invite.psk.clone(),
        };
        self.update(|d| {
            if let Some(old) = d.peers.get(&p.invitation_id) {
                if old.workspace_id != p.workspace_id
                    || old.host_key != p.host_key
                    || old.psk != p.psk
                    || old.device_id != p.device_id
                {
                    return Err(SyncError::Authentication);
                }
                return Ok(old.clone());
            }
            if d.peers.len() >= MAX_CREDENTIALS && !d.peers.contains_key(&p.invitation_id) {
                return Err(SyncError::Limit);
            }
            d.peers.insert(p.invitation_id.clone(), p.clone());
            Ok(p)
        })
    }
    pub(crate) fn credential(&self, id: &str) -> Result<Peer> {
        self.data
            .lock()
            .map_err(|_| SyncError::Io)?
            .peers
            .get(id)
            .cloned()
            .ok_or(SyncError::Authentication)
    }
    pub(crate) fn peer(&self, id: &str) -> Result<Peer> {
        let p = self.credential(id)?;
        if p.phase != PairingPhase::Ready {
            return Err(SyncError::Busy);
        }
        Ok(p)
    }
    pub(crate) fn pending_pairings(&self) -> Result<Vec<Peer>> {
        Ok(self
            .data
            .lock()
            .map_err(|_| SyncError::Io)?
            .peers
            .values()
            .filter(|p| p.phase == PairingPhase::Prepared)
            .cloned()
            .collect())
    }
    pub(crate) fn commit_pairing(&self, id: &str) -> Result<Peer> {
        self.update(|d| {
            let p = d.peers.get_mut(id).ok_or(SyncError::Authentication)?;
            p.phase = PairingPhase::Ready;
            Ok(p.clone())
        })
    }
    pub fn peer_ids(&self) -> Result<Vec<String>> {
        Ok(self
            .data
            .lock()
            .map_err(|_| SyncError::Io)?
            .peers
            .keys()
            .cloned()
            .collect())
    }
    pub fn paired_devices(&self) -> Result<Vec<PairedDevice>> {
        Ok(self
            .data
            .lock()
            .map_err(|_| SyncError::Io)?
            .grants
            .iter()
            .filter_map(|(id, g)| {
                g.device_id.as_ref().map(|dev| PairedDevice {
                    invitation_id: id.clone(),
                    device_id: dev.clone(),
                    revoked: g.revoked,
                })
            })
            .collect())
    }
    pub fn revoke(&self, id: &str) -> Result<()> {
        self.update(|d| {
            let mut found = d.peers.remove(id).is_some();
            if let Some(g) = d.grants.get_mut(id) {
                g.revoked = true;
                found = true;
            }
            if !found {
                return Err(SyncError::InvalidInput);
            }
            Ok(())
        })
    }
}
fn persist(path: &Path, data: &Data) -> Result<()> {
    let dir = path.parent().ok_or(SyncError::Io)?;
    let temp = dir.join(format!(".identity-{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut opts = OpenOptions::new();
        opts.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            opts.mode(0o600);
        }
        let mut file = opts.open(&temp).map_err(|_| SyncError::Io)?;
        let bytes = serde_json::to_vec(data).map_err(|_| SyncError::Io)?;
        file.write_all(&bytes)
            .and_then(|_| file.sync_all())
            .map_err(|_| SyncError::Io)?;
        fs::rename(&temp, path).map_err(|_| SyncError::Io)?;
        File::open(dir)
            .and_then(|d| d.sync_all())
            .map_err(|_| SyncError::Io)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn enrolled_grant_rejects_wrong_device_and_key_before_first_use_across_restart() {
        let dir = tempfile::tempdir().unwrap();
        let device = Uuid::new_v4().to_string();
        let workspace = Uuid::new_v4().to_string();
        let expected = Uuid::new_v4().to_string();
        let public = encode(&[7; 32]);
        let store = IdentityStore::open(dir.path(), &device).unwrap();
        let invite = store
            .invite_enrolled(&workspace, "ws://127.0.0.1:1234/", &expected, &public)
            .unwrap();
        drop(store);
        let store = IdentityStore::open(dir.path(), &device).unwrap();
        assert_eq!(
            store.authorize(
                &invite.invitation_id,
                &workspace,
                &encode(&[8; 32]),
                &expected
            ),
            Err(SyncError::Authentication)
        );
        assert_eq!(
            store.authorize(
                &invite.invitation_id,
                &workspace,
                &public,
                &Uuid::new_v4().to_string()
            ),
            Err(SyncError::Authentication)
        );
        store
            .authorize(&invite.invitation_id, &workspace, &public, &expected)
            .unwrap();
        store
            .update(|d| {
                d.grants.get_mut(&invite.invitation_id).unwrap().expires_at = 0;
                Ok(())
            })
            .unwrap();
        // Consumption still has original durable-pin semantics, not invite expiry.
        store
            .check_authorized(&invite.invitation_id, &workspace, &public, &expected)
            .unwrap();
        assert!(store.server_psk(&invite.invitation_id, &workspace).is_ok());
        drop(store);
        let store = IdentityStore::open(dir.path(), &device).unwrap();
        // Directory/proof renewals and app restarts must reuse the consumed
        // enrolled pin instead of exhausting the invitation cap over time.
        for _ in 0..70 {
            let renewed = store
                .invite_enrolled(&workspace, "ws://127.0.0.1:5678/", &expected, &public)
                .unwrap();
            assert_eq!(renewed.invitation_id, invite.invitation_id);
            assert_eq!(renewed.psk, invite.psk);
            assert!(renewed.expires_at > now());
        }
        assert_eq!(store.data.lock().unwrap().grants.len(), 1);
        assert_eq!(
            store.authorize(
                &invite.invitation_id,
                &workspace,
                &encode(&[8; 32]),
                &expected
            ),
            Err(SyncError::Authentication)
        );
    }
    #[test]
    fn invitation_expiration_and_revocation_are_durable() {
        let dir = tempfile::tempdir().unwrap();
        let device = Uuid::new_v4().to_string();
        let store = IdentityStore::open(dir.path(), &device).unwrap();
        let workspace = Uuid::new_v4().to_string();
        let invite = store.invite(&workspace, "ws://127.0.0.1:1234/").unwrap();
        let id = invite.invitation_id.clone();
        store
            .update(|d| {
                d.grants.get_mut(&id).unwrap().expires_at = 0;
                Ok(())
            })
            .unwrap();
        assert_eq!(
            store.server_psk(&id, &workspace).unwrap_err(),
            SyncError::Expired
        );
        let mut expired = invite;
        expired.expires_at = 0;
        assert!(matches!(
            PairingInvite::decode(&expired.token().unwrap()),
            Err(SyncError::Expired)
        ));
        store.revoke(&id).unwrap();
        drop(store);
        let store = IdentityStore::open(dir.path(), &device).unwrap();
        assert_eq!(
            store.server_psk(&id, &workspace).unwrap_err(),
            SyncError::Revoked
        );
    }
    #[test]
    fn malformed_endpoint_identity_and_symlink_are_rejected() {
        assert!(endpoint("https://example.com/").is_err());
        assert!(endpoint("ws://user:password@127.0.0.1/").is_err());
        assert!(endpoint("wss://example.com/path").is_ok());
        let dir = tempfile::tempdir().unwrap();
        let device = Uuid::new_v4().to_string();
        let store = IdentityStore::open(dir.path(), &device).unwrap();
        drop(store);
        assert!(IdentityStore::open(dir.path(), &Uuid::new_v4().to_string()).is_err());
        #[cfg(unix)]
        {
            std::fs::remove_file(dir.path().join("identity-v1.json")).unwrap();
            std::os::unix::fs::symlink("/etc/passwd", dir.path().join("identity-v1.json")).unwrap();
            assert!(IdentityStore::open(dir.path(), &device).is_err());
        }
    }
}
