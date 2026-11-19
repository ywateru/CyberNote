//! Pure in-memory codec: authentication failure cannot write a staging or Store file.
use super::{failure, Result, MAX_ARCHIVE_BYTES};
use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use argon2::Argon2;
use rand::{rngs::OsRng, RngCore};

// Fixed, bounded Argon2id v19 parameters match Argon2::default used by Store.
// Header is authenticated as AAD. No attacker-controlled KDF cost is accepted.
const MAGIC: &[u8; 8] = b"CYBENC01";
const HEADER: usize = 8 + 16 + 12;
pub const MAX_ENCRYPTED_ARCHIVE_BYTES: usize = MAX_ARCHIVE_BYTES + HEADER + 16;

fn key(password: &str, salt: &[u8]) -> Result<[u8; 32]> {
    if password.is_empty() || password.len() > 4096 {
        return Err(failure("backup_password", "请输入 1–4096 字节的备份密码"));
    }
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|_| failure("backup_crypto", "无法派生备份密钥"))?;
    Ok(key)
}
pub fn seal_archive(archive: &[u8], password: &str) -> Result<Vec<u8>> {
    if archive.is_empty() || archive.len() > MAX_ARCHIVE_BYTES {
        return Err(failure("backup_limit", "归档大小无效"));
    }
    let mut header = [0u8; HEADER];
    header[..8].copy_from_slice(MAGIC);
    OsRng
        .try_fill_bytes(&mut header[8..])
        .map_err(|_| failure("backup_crypto", "无法取得安全随机数"))?;
    let mut key = key(password, &header[8..24])?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|_| failure("backup_crypto", "无法建立备份密钥"))?;
    key.fill(0);
    let encrypted = cipher
        .encrypt(
            Nonce::from_slice(&header[24..]),
            Payload {
                msg: archive,
                aad: &header,
            },
        )
        .map_err(|_| failure("backup_crypto", "加密失败"))?;
    let mut bytes = header.to_vec();
    bytes.extend_from_slice(&encrypted);
    Ok(bytes)
}
pub fn open_encrypted_archive(bytes: &[u8], password: &str) -> Result<Vec<u8>> {
    if bytes.len() <= HEADER + 16
        || bytes.len() > MAX_ENCRYPTED_ARCHIVE_BYTES
        || &bytes[..8] != MAGIC
    {
        return Err(failure("backup_corrupt", "加密归档标识或长度无效"));
    }
    let mut key = key(password, &bytes[8..24])?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|_| failure("backup_crypto", "无法建立备份密钥"))?;
    key.fill(0);
    cipher
        .decrypt(
            Nonce::from_slice(&bytes[24..HEADER]),
            Payload {
                msg: &bytes[HEADER..],
                aad: &bytes[..HEADER],
            },
        )
        .map_err(|_| {
            failure(
                "backup_password",
                "密码错误或加密归档已损坏；未导入任何数据",
            )
        })
}
