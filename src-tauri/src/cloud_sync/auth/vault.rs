//! Encrypted, app-private OAuth credential records. Tokens never enter the
//! cloud configuration, renderer DTOs, logs, backups or cloud snapshots.
use super::super::{
    model::*,
    persistence::PrivateFiles,
};
use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    path::Path,
    sync::Mutex,
};

const KEY_FILE: &str = "credentials.key";
const DATA_FILE: &str = "credentials.enc";
const AAD: &[u8] = b"CyberNote cloud credentials v1;device-key;aes-256-gcm";
const MAX_DATA: usize = 256 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Credential {
    pub version: u8,
    pub connection_id: String,
    pub provider: Provider,
    pub issuer: String,
    pub driver: String,
    pub refresh_token: String,
    #[serde(default)]
    pub access_token: Option<String>,
    #[serde(default)]
    pub expires_at: Option<i64>,
    pub scope: String,
    pub account_id: String,
    pub display_name: String,
}

impl Credential {
    fn validate(&self) -> Result<()> {
        if self.version != 1
            || !crate::sync::model::valid_uuid(&self.connection_id)
            || !self.provider.is_oauth()
            || self.issuer != super::ISSUER
            || self.driver.is_empty()
            || self.driver.len() > 64
            || self.refresh_token.is_empty()
            || self.refresh_token.len() > 16_384
            || self
                .refresh_token
                .chars()
                .any(|c| c.is_control() || c.is_whitespace())
            || self
                .access_token
                .as_ref()
                .is_some_and(|t| t.len() > 16_384 || t.chars().any(char::is_control))
            || self.scope.len() > 1024
            || self.account_id.len() > 512
            || self.display_name.len() > 512
        {
            return Err(error("invalid"));
        }
        Ok(())
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Envelope {
    format: String,
    version: u8,
    nonce: String,
    ciphertext: String,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Records {
    version: u8,
    credentials: BTreeMap<String, Credential>,
}

pub struct Vault {
    files: PrivateFiles,
    lock: Mutex<()>,
}

impl Vault {
    pub fn open(root: &Path) -> Result<Self> {
        Ok(Self {
            files: PrivateFiles::open(root)?,
            lock: Mutex::new(()),
        })
    }
    fn key(&self) -> Result<[u8; 32]> {
        if let Some(bytes) = self.files.read(KEY_FILE, 64)? {
            if bytes.len() != 32 {
                return Err(error("state"));
            }
            let mut key = [0; 32];
            key.copy_from_slice(&bytes);
            return Ok(key);
        }
        let mut key = [0; 32];
        OsRng.fill_bytes(&mut key);
        self.files.replace(KEY_FILE, &key, None)?;
        // A concurrent creator may have won; always read back the durable key.
        let bytes = self.files.read(KEY_FILE, 64)?.ok_or_else(|| error("state"))?;
        if bytes.len() != 32 {
            return Err(error("state"));
        }
        let mut out = [0; 32];
        out.copy_from_slice(&bytes);
        Ok(out)
    }
    fn decode(&self, raw: Option<&[u8]>) -> Result<Records> {
        let Some(raw) = raw else {
            return Ok(Records {
                version: 1,
                credentials: BTreeMap::new(),
            });
        };
        if self.files.read(KEY_FILE, 64)?.is_none() {
            return Err(error("state"));
        }
        let e: Envelope = serde_json::from_slice(raw).map_err(|_| error("state"))?;
        if e.format != "cybernote-cloud-credentials"
            || e.version != 1
            || e.nonce.len() != 16
            || e.ciphertext.len() > MAX_DATA.div_ceil(3) * 4
        {
            return Err(error("state"));
        }
        let nonce = B64.decode(e.nonce).map_err(|_| error("state"))?;
        let ciphertext = B64.decode(e.ciphertext).map_err(|_| error("state"))?;
        if nonce.len() != 12 || ciphertext.len() > MAX_DATA {
            return Err(error("state"));
        }
        let mut key = self.key()?;
        let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| error("state"))?;
        key.fill(0);
        let plain = cipher
            .decrypt(
                Nonce::from_slice(&nonce),
                Payload {
                    msg: &ciphertext,
                    aad: AAD,
                },
            )
            .map_err(|_| error("state"))?;
        if plain.len() > MAX_DATA {
            return Err(error("state"));
        }
        let records: Records = serde_json::from_slice(&plain).map_err(|_| error("state"))?;
        if records.version != 1 {
            return Err(error("state"));
        }
        for c in records.credentials.values() {
            c.validate()?;
        }
        Ok(records)
    }
    fn encode(&self, records: &Records) -> Result<Vec<u8>> {
        let plain = serde_json::to_vec(records).map_err(|_| error("state"))?;
        if plain.len() > MAX_DATA {
            return Err(error("limit"));
        }
        let mut nonce = [0; 12];
        OsRng.fill_bytes(&mut nonce);
        let mut key = self.key()?;
        let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| error("state"))?;
        key.fill(0);
        let ciphertext = cipher
            .encrypt(
                Nonce::from_slice(&nonce),
                Payload {
                    msg: &plain,
                    aad: AAD,
                },
            )
            .map_err(|_| error("state"))?;
        serde_json::to_vec(&Envelope {
            format: "cybernote-cloud-credentials".into(),
            version: 1,
            nonce: B64.encode(nonce),
            ciphertext: B64.encode(ciphertext),
        })
        .map_err(|_| error("state"))
    }
    fn modify<T>(&self, f: impl FnOnce(&mut Records) -> Result<T>) -> Result<T> {
        let _guard = self.lock.lock().map_err(|_| error("state"))?;
        let raw = self.files.read(DATA_FILE, MAX_DATA)?;
        let mut records = self.decode(raw.as_deref())?;
        let out = f(&mut records)?;
        let bytes = self.encode(&records)?;
        self.files.replace(DATA_FILE, &bytes, raw.as_deref())?;
        Ok(out)
    }
    pub fn get(&self, id: &str) -> Result<Credential> {
        if !crate::sync::model::valid_uuid(id) {
            return Err(error("invalid"));
        }
        let _guard = self.lock.lock().map_err(|_| error("state"))?;
        let raw = self.files.read(DATA_FILE, MAX_DATA)?;
        self.decode(raw.as_deref())?
            .credentials
            .remove(id)
            .ok_or_else(|| error("missing"))
    }
    pub fn put(&self, credential: Credential) -> Result<()> {
        credential.validate()?;
        let id = credential.connection_id.clone();
        self.modify(|records| {
            if records
                .credentials
                .insert(id.clone(), credential)
                .is_some()
            {
                return Err(error("invalid"));
            }
            Ok(())
        })
    }
    pub fn update_tokens(
        &self,
        id: &str,
        access_token: Option<String>,
        refresh_token: Option<String>,
        expires_at: Option<i64>,
    ) -> Result<Credential> {
        if !crate::sync::model::valid_uuid(id) {
            return Err(error("invalid"));
        }
        self.modify(|records| {
            let c = records
                .credentials
                .get_mut(id)
                .ok_or_else(|| error("missing"))?;
            if let Some(t) = access_token {
                c.access_token = Some(t);
            }
            if let Some(t) = refresh_token.filter(|t| !t.is_empty()) {
                c.refresh_token = t;
            }
            c.expires_at = expires_at;
            c.validate()?;
            Ok(c.clone())
        })
    }
    pub fn remove(&self, id: &str) -> Result<()> {
        if !crate::sync::model::valid_uuid(id) {
            return Err(error("invalid"));
        }
        self.modify(|records| {
            records
                .credentials
                .remove(id)
                .map(|_| ())
                .ok_or_else(|| error("missing"))
        })
    }
    #[cfg(test)]
    pub fn raw_for_test(&self) -> Result<Option<Vec<u8>>> {
        self.files.read(DATA_FILE, MAX_DATA)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn credential(id: &str) -> Credential {
        Credential {
            version: 1,
            connection_id: id.into(),
            provider: Provider::Onedrive,
            issuer: super::super::ISSUER.into(),
            driver: "onedrive_pr".into(),
            refresh_token: "refresh-test-token".into(),
            access_token: None,
            expires_at: None,
            scope: "offline_access Files.ReadWrite.All".into(),
            account_id: "account".into(),
            display_name: "Test".into(),
        }
    }

    #[test]
    fn roundtrip_is_encrypted_and_atomic() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let vault = Vault::open(&root).unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        vault.put(credential(&id)).unwrap();
        let raw = vault.raw_for_test().unwrap().unwrap();
        assert!(!raw.windows(7).any(|w| w == b"refresh"));
        assert_eq!(vault.get(&id).unwrap().refresh_token, "refresh-test-token");
        vault
            .update_tokens(&id, Some("access".into()), None, Some(123))
            .unwrap();
        let c = vault.get(&id).unwrap();
        assert_eq!(c.access_token.as_deref(), Some("access"));
        assert_eq!(c.refresh_token, "refresh-test-token");
        vault.remove(&id).unwrap();
        assert_eq!(vault.get(&id).unwrap_err().code, "missing");
    }

    #[test]
    fn corruption_is_not_an_empty_vault() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let vault = Vault::open(&root).unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        vault.put(credential(&id)).unwrap();
        fs::write(root.join(".cloud-sync").join(DATA_FILE), b"{}").unwrap();
        assert_eq!(vault.get(&id).unwrap_err().code, "state");
        assert_eq!(
            vault.put(credential(&uuid::Uuid::new_v4().to_string())).unwrap_err().code,
            "state"
        );
    }
}
