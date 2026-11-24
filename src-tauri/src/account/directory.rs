//! Authenticated Notes profile and account-partitioned offline history.
//! Gossip is display-only: targets always come from the current SDK snapshot.
use super::{
    private,
    types::{Device, DeviceSummary, Error, Result},
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use prost::Message;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashSet},
    path::{Path, PathBuf},
    sync::Mutex,
};
pub(super) const PROFILE_TYPE: &str = "type.cybernote.app/notes.public.v1.Profile";
const LIMIT: usize = 64;
const MAX_PROFILE: usize = 7 * 1024;
const MAX_HISTORY: usize = 128 * 1024;
#[derive(Clone, PartialEq, prost::Message)]
struct ProfileEnvelope {
    #[prost(uint32, tag = "1")]
    schema_version: u32,
    #[prost(bytes = "vec", tag = "2")]
    json_payload: Vec<u8>,
}
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct KnownDevice {
    pub registry_id: String,
    pub sdk_id: String,
    pub name: String,
}
impl KnownDevice {
    fn valid(&self) -> bool {
        private::registry_id(&self.registry_id)
            && canonical_peer(&self.sdk_id).is_ok()
            && private::device_name(&self.name).is_ok_and(|n| n == self.name)
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct NotesProfile {
    pub schema_version: u8,
    pub registry_id: String,
    pub protocol_device_id: Option<String>,
    pub noise_public_key: Option<String>,
    pub sync_available: bool,
    pub summary: Option<DeviceSummary>,
    #[serde(default)]
    pub known_devices: Vec<KnownDevice>,
}
fn canonical_key(s: &str) -> bool {
    B64.decode(s)
        .is_ok_and(|b| b.len() == 32 && B64.encode(&b) == s)
}
pub(super) fn canonical_peer(s: &str) -> Result<[u8; 32]> {
    let bytes = B64.decode(s).map_err(|_| Error::DeviceIncompatible)?;
    if B64.encode(&bytes) != s {
        return Err(Error::DeviceIncompatible);
    }
    bytes.try_into().map_err(|_| Error::DeviceIncompatible)
}
impl NotesProfile {
    pub fn decode(bytes: &[u8]) -> Result<Self> {
        if bytes.len() > MAX_PROFILE {
            return Err(Error::DeviceIncompatible);
        }
        let envelope = ProfileEnvelope::decode(bytes).map_err(|_| Error::DeviceIncompatible)?;
        if envelope.schema_version != 1 || envelope.encode_to_vec() != bytes {
            return Err(Error::DeviceIncompatible);
        }
        let profile: Self = serde_json::from_slice(&envelope.json_payload)
            .map_err(|_| Error::DeviceIncompatible)?;
        profile.validate()?;
        Ok(profile)
    }
    fn validate(&self) -> Result<()> {
        let mut registry = HashSet::new();
        let mut sdk = HashSet::new();
        if self.schema_version != 1
            || !private::registry_id(&self.registry_id)
            || self
                .protocol_device_id
                .as_ref()
                .is_some_and(|s| !private::registry_id(s))
            || self
                .noise_public_key
                .as_ref()
                .is_some_and(|s| !canonical_key(s))
            || (self.protocol_device_id.is_some() != self.noise_public_key.is_some())
            || (self.sync_available && self.protocol_device_id.is_none())
            || self.summary.as_ref().is_some_and(|s| !s.valid())
            || self.known_devices.len() > LIMIT
            || self
                .known_devices
                .iter()
                .any(|d| !d.valid() || !registry.insert(&d.registry_id) || !sdk.insert(&d.sdk_id))
        {
            return Err(Error::DeviceIncompatible);
        }
        Ok(())
    }
    #[cfg(test)]
    pub fn encode(&self) -> Result<Vec<u8>> {
        self.validate()?;
        let json_payload = serde_json::to_vec(self).map_err(|_| Error::DeviceIncompatible)?;
        let bytes = ProfileEnvelope {
            schema_version: 1,
            json_payload,
        }
        .encode_to_vec();
        if bytes.len() > MAX_PROFILE {
            return Err(Error::DeviceIncompatible);
        }
        Ok(bytes)
    }
    pub fn encode_with_roster_budget(mut self) -> Result<Vec<u8>> {
        self.validate()?;
        loop {
            let json_payload = serde_json::to_vec(&self).map_err(|_| Error::DeviceIncompatible)?;
            let bytes = ProfileEnvelope {
                schema_version: 1,
                json_payload,
            }
            .encode_to_vec();
            if bytes.len() <= MAX_PROFILE {
                return Ok(bytes);
            }
            if self.known_devices.pop().is_none() {
                return Err(Error::DeviceIncompatible);
            }
        }
    }
}
#[derive(Clone)]
pub(super) struct Row {
    pub id: String,
    pub name: String,
    pub peer: [u8; 32],
    pub online: bool,
    pub protocol_device_id: Option<String>,
    pub noise_public_key: Option<String>,
    pub sync_available: bool,
    pub summary: Option<DeviceSummary>,
}
impl Row {
    pub fn project(&self, current: &str) -> Device {
        Device {
            id: self.id.clone(),
            name: self.name.clone(),
            online: self.online,
            current: self.id == current,
            connected: false,
            sync_available: self.online && self.sync_available,
            summary: if self.online {
                self.summary.clone()
            } else {
                None
            },
            transport: None,
        }
    }
    pub fn target(&self, current: &str) -> Result<([u8; 32], &str, &str)> {
        if self.id == current {
            return Err(Error::DeviceIncompatible);
        }
        if !self.online {
            return Err(Error::DeviceOffline);
        }
        if !self.sync_available {
            return Err(Error::DeviceIncompatible);
        }
        Ok((
            self.peer,
            self.protocol_device_id
                .as_deref()
                .ok_or(Error::DeviceIncompatible)?,
            self.noise_public_key
                .as_deref()
                .ok_or(Error::DeviceIncompatible)?,
        ))
    }
}
struct State {
    history: BTreeMap<String, KnownDevice>,
    live: Vec<Row>,
    available: bool,
}
pub(super) struct Catalog {
    path: PathBuf,
    state: Mutex<State>,
}
impl Catalog {
    pub fn open(root: &Path, workspace: &str) -> Result<Self> {
        // Account workspaces are derived UUID v8 values, whereas device
        // registry IDs are UUID v4. Validate the cache path independently.
        if !uuid::Uuid::parse_str(workspace).is_ok_and(|id| {
            id.to_string() == workspace
                && id.get_variant() == uuid::Variant::RFC4122
                && matches!(id.get_version_num(), 4 | 8)
        }) {
            return Err(Error::Storage);
        }
        let dir = root.join("devices");
        private::directory(&dir)?;
        let path = dir.join(format!("{workspace}.json"));
        let history: Vec<KnownDevice> = match private::read_bytes(&path, MAX_HISTORY)? {
            Some(bytes) => serde_json::from_slice(&bytes).map_err(|_| Error::Storage)?,
            None => Vec::new(),
        };
        let mut ids = HashSet::new();
        if history.len() > LIMIT
            || history
                .iter()
                .any(|r| !r.valid() || !ids.insert(r.sdk_id.clone()))
        {
            return Err(Error::Storage);
        }
        let map: BTreeMap<_, _> = history
            .into_iter()
            .map(|r| (r.registry_id.clone(), r))
            .collect();
        if map.len() != ids.len() {
            return Err(Error::Storage);
        }
        Ok(Self {
            path,
            state: Mutex::new(State {
                history: map,
                live: vec![],
                available: false,
            }),
        })
    }
    /// Entire input must already be SDK-authenticated. A duplicate registry or
    /// SDK identity is an error, never an arbitrary selected-device redirect.
    pub fn replace(&self, rows: Vec<Row>, roster: Vec<KnownDevice>) -> Result<()> {
        if rows.len() > LIMIT || roster.len() > LIMIT * LIMIT {
            return Err(Error::DirectoryUnavailable);
        }
        let mut ids = HashSet::new();
        let mut peers = HashSet::new();
        if rows
            .iter()
            .any(|r| !ids.insert(&r.id) || !peers.insert(r.peer))
        {
            return Err(Error::DirectoryUnavailable);
        }
        let mut s = self.state.lock().map_err(|_| Error::Storage)?;
        let mut history = s.history.clone();
        // Current authenticated rows override gossip, which never overrides an
        // existing association and never enters `live`.
        for r in &rows {
            let known = KnownDevice {
                registry_id: r.id.clone(),
                sdk_id: B64.encode(r.peer),
                name: r.name.clone(),
            };
            if !known.valid() {
                return Err(Error::DirectoryUnavailable);
            }
            history.retain(|id, v| id == &r.id || v.sdk_id != known.sdk_id);
            history.insert(r.id.clone(), known);
        }
        for r in roster {
            if !r.valid() {
                return Err(Error::DeviceIncompatible);
            }
            if history.len() < LIMIT
                && !history.contains_key(&r.registry_id)
                && !history.values().any(|v| v.sdk_id == r.sdk_id)
            {
                history.insert(r.registry_id.clone(), r);
            }
        }
        if history.len() > LIMIT {
            return Err(Error::DirectoryUnavailable);
        }
        let bytes = serde_json::to_vec(&history.values().collect::<Vec<_>>())
            .map_err(|_| Error::Storage)?;
        private::atomic_write(&self.path, &bytes)?;
        s.history = history;
        s.live = rows;
        s.available = true;
        Ok(())
    }
    pub fn clear(&self) {
        if let Ok(mut s) = self.state.lock() {
            s.available = false;
            s.live.clear();
        }
    }
    pub fn target(&self, id: &str, current: &str) -> Result<Row> {
        let s = self.state.lock().map_err(|_| Error::Storage)?;
        if !s.available {
            return Err(Error::DirectoryUnavailable);
        }
        let row = s
            .live
            .iter()
            .find(|r| r.id == id)
            .ok_or(Error::DeviceOffline)?;
        row.target(current)?;
        Ok(row.clone())
    }
    pub fn devices(&self, current: &str) -> Result<Vec<Device>> {
        let s = self.state.lock().map_err(|_| Error::Storage)?;
        Ok(s.history
            .values()
            .map(|h| {
                if s.available {
                    if let Some(r) = s.live.iter().find(|r| r.id == h.registry_id) {
                        return r.project(current);
                    }
                }
                Device {
                    id: h.registry_id.clone(),
                    name: h.name.clone(),
                    online: false,
                    current: h.registry_id == current,
                    connected: false,
                    sync_available: false,
                    summary: None,
                    transport: None,
                }
            })
            .collect())
    }
    pub fn roster(&self) -> Result<Vec<KnownDevice>> {
        Ok(self
            .state
            .lock()
            .map_err(|_| Error::Storage)?
            .history
            .values()
            .cloned()
            .collect())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn known(n: u8) -> KnownDevice {
        let mut bytes = [n; 16];
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        KnownDevice {
            registry_id: uuid::Uuid::from_bytes(bytes).to_string(),
            sdk_id: B64.encode([n; 32]),
            name: format!("Device {n}"),
        }
    }
    fn row(n: u8) -> Row {
        Row {
            id: known(n).registry_id,
            name: known(n).name,
            peer: [n; 32],
            online: true,
            protocol_device_id: Some(uuid::Uuid::new_v4().to_string()),
            noise_public_key: Some(B64.encode([n; 32])),
            sync_available: true,
            summary: None,
        }
    }
    #[test]
    fn derived_account_workspace_cache_survives_restart_and_rejects_paths() {
        let dir = tempfile::tempdir().unwrap();
        let workspace = super::super::enrollment::workspace(
            "https://issuer.invalid/oidc",
            "verified-subject",
            "cybernote",
        )
        .unwrap();
        assert_eq!(
            uuid::Uuid::parse_str(&workspace).unwrap().get_version_num(),
            8
        );
        let c = Catalog::open(dir.path(), &workspace).unwrap();
        c.replace(vec![row(1)], vec![known(2)]).unwrap();
        drop(c);
        let c = Catalog::open(dir.path(), &workspace).unwrap();
        assert_eq!(c.devices("").unwrap().len(), 2);
        assert!(c.devices("").unwrap().iter().all(|d| !d.online));
        for invalid in ["../outside", "", &workspace.to_uppercase()] {
            assert!(matches!(
                Catalog::open(dir.path(), invalid),
                Err(Error::Storage)
            ));
        }
    }
    #[test]
    fn roster_budget_and_canonical_protobuf_are_enforced() {
        let mut profile = NotesProfile {
            schema_version: 1,
            registry_id: known(1).registry_id,
            protocol_device_id: None,
            noise_public_key: None,
            sync_available: false,
            summary: None,
            known_devices: (1..=64)
                .map(|n| {
                    let mut device = known(n);
                    device.name = "机".repeat(40);
                    device
                })
                .collect(),
        };
        assert!(profile.encode().is_err());
        let bytes = profile.clone().encode_with_roster_budget().unwrap();
        assert!(bytes.len() <= MAX_PROFILE);
        let decoded = NotesProfile::decode(&bytes).unwrap();
        assert!(!decoded.known_devices.is_empty());
        assert!(decoded.known_devices.len() < 64);
        assert_eq!(decoded.known_devices[0].sdk_id, known(1).sdk_id);
        // Unknown protobuf fields and duplicate known fields are noncanonical.
        let mut unknown = bytes.clone();
        unknown.extend_from_slice(&[0x18, 0x01]);
        assert!(NotesProfile::decode(&unknown).is_err());
        let mut duplicate = bytes;
        duplicate.extend_from_slice(&[0x08, 0x01]);
        assert!(NotesProfile::decode(&duplicate).is_err());
        profile.known_devices.clear();
        profile.registry_id = uuid::Uuid::nil().to_string();
        assert!(profile.encode().is_err());
    }
    #[test]
    fn authenticated_roster_is_offline_only_and_account_partitioned_across_restart() {
        let dir = tempfile::tempdir().unwrap();
        let account = uuid::Uuid::new_v4().to_string();
        let c = Catalog::open(dir.path(), &account).unwrap();
        c.replace(vec![row(1)], vec![known(2)]).unwrap();
        assert!(c.target(&known(1).registry_id, "").is_ok());
        assert_eq!(
            c.target(&known(2).registry_id, "").err(),
            Some(Error::DeviceOffline)
        );
        assert!(!c.devices("").unwrap()[1].online);
        c.clear();
        assert!(c
            .devices("")
            .unwrap()
            .iter()
            .all(|d| !d.online && !d.sync_available && d.summary.is_none()));
        drop(c);
        let c = Catalog::open(dir.path(), &account).unwrap();
        assert_eq!(c.devices("").unwrap().len(), 2);
        assert!(c.target(&known(1).registry_id, "").is_err());
        assert!(Catalog::open(dir.path(), &uuid::Uuid::new_v4().to_string())
            .unwrap()
            .devices("")
            .unwrap()
            .is_empty());
    }
    #[test]
    fn duplicate_profile_and_gossip_never_redirect_live_target() {
        let dir = tempfile::tempdir().unwrap();
        let c = Catalog::open(dir.path(), &uuid::Uuid::new_v4().to_string()).unwrap();
        let r = row(1);
        assert!(c.replace(vec![r.clone(), r.clone()], vec![]).is_err());
        let mut forged = known(1);
        forged.sdk_id = known(2).sdk_id;
        c.replace(vec![r.clone()], vec![forged]).unwrap();
        assert_eq!(c.target(&r.id, "").unwrap().peer, [1; 32]);
        let mut p = NotesProfile {
            schema_version: 1,
            registry_id: known(1).registry_id,
            protocol_device_id: r.protocol_device_id,
            noise_public_key: r.noise_public_key,
            sync_available: true,
            summary: None,
            known_devices: vec![known(1)],
        };
        assert!(NotesProfile::decode(&p.encode().unwrap()).is_ok());
        p.known_devices = vec![known(1); 65];
        assert!(p.encode().is_err());
        p.known_devices = vec![];
        p.noise_public_key = Some(B64.encode([0; 31]));
        assert!(p.encode().is_err());
    }
}
