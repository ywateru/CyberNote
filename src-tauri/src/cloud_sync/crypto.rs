//! Fixed, bounded Argon2id parameters; unauthenticated headers cannot request work.
use super::model::*;
use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
const AAD: &[u8] = b"CyberNote cloud v1;argon2id-v19;m=19456,t=2,p=1;aes-256-gcm";
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    format: String,
    app: String,
    schema: String,
    workspace_id: String,
    version: u8,
    kdf: String,
    salt: String,
    nonce: String,
    ciphertext: String,
}
fn key(password: &str, salt: &[u8]) -> Result<[u8; 32]> {
    if password.len() < 8 || password.len() > 1024 {
        return Err(error("password"));
    }
    let mut key = [0; 32];
    Argon2::new(
        Algorithm::Argon2id,
        Version::V0x13,
        Params::new(19456, 2, 1, Some(32)).map_err(|_| error("invalid"))?,
    )
    .hash_password_into(password.as_bytes(), salt, &mut key)
    .map_err(|_| error("password"))?;
    Ok(key)
}
pub fn encrypt(bundle: &Bundle, password: &str) -> Result<Vec<u8>> {
    bundle.validate()?;
    let plain = serde_json::to_vec(bundle).map_err(|_| error("invalid"))?;
    let mut salt = [0; 16];
    let mut nonce = [0; 12];
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut nonce);
    let mut key = key(password, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| error("invalid"))?;
    key.fill(0);
    let sealed = cipher
        .encrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: &plain,
                aad: &[AAD, bundle.workspace_id.as_bytes()].concat(),
            },
        )
        .map_err(|_| error("invalid"))?;
    serde_json::to_vec(&Envelope {
        format: "cybernote-cloud".into(),
        app: "CyberNote".into(),
        schema: "wire-snapshot-v1".into(),
        workspace_id: bundle.workspace_id.clone(),
        version: 1,
        kdf: "argon2id-19456-2-1".into(),
        salt: B64.encode(salt),
        nonce: B64.encode(nonce),
        ciphertext: B64.encode(sealed),
    })
    .map_err(|_| error("invalid"))
}
pub fn decrypt(bytes: &[u8], password: &str) -> Result<Bundle> {
    if bytes.len() > MAX_REMOTE {
        return Err(error("limit"));
    }
    let e: Envelope = serde_json::from_slice(bytes).map_err(|_| error("invalid"))?;
    if e.app != "CyberNote"
        || e.schema != "wire-snapshot-v1"
        || !crate::sync::model::valid_uuid(&e.workspace_id)
        || e.format != "cybernote-cloud"
        || e.version != 1
        || e.kdf != "argon2id-19456-2-1"
        || e.salt.len() != 24
        || e.nonce.len() != 16
        || e.ciphertext.len() > (MAX_PLAIN + 16).div_ceil(3) * 4
    {
        return Err(error("invalid"));
    }
    let salt = B64.decode(e.salt).map_err(|_| error("invalid"))?;
    let nonce = B64.decode(e.nonce).map_err(|_| error("invalid"))?;
    if salt.len() != 16 || nonce.len() != 12 {
        return Err(error("invalid"));
    }
    let mut key = key(password, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| error("invalid"))?;
    key.fill(0);
    let encrypted = B64.decode(e.ciphertext).map_err(|_| error("invalid"))?;
    let plain = cipher
        .decrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: &encrypted,
                aad: &[AAD, e.workspace_id.as_bytes()].concat(),
            },
        )
        .map_err(|_| error("password"))?;
    if plain.len() > MAX_PLAIN {
        return Err(error("limit"));
    }
    let bundle: Bundle = serde_json::from_slice(&plain).map_err(|_| error("invalid"))?;
    bundle.validate()?;
    if bundle.workspace_id != e.workspace_id {
        return Err(error("workspace"));
    }
    Ok(bundle)
}
