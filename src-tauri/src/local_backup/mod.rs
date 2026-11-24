//! Local backups own files and scheduling, never a Store or Session.
//! The host must install checked ports; see README.md before registration.
mod crypto;
pub(crate) mod files;
mod runtime;

pub use crypto::{open_encrypted_archive, seal_archive, MAX_ENCRYPTED_ARCHIVE_BYTES};
pub use files::{
    BackupConfig, BackupIssue, BackupManifest, BackupReason, BackupVersion, ConfigPatch,
};
pub use runtime::*;

use serde::{Deserialize, Serialize};

pub const MAX_ARCHIVE_BYTES: usize = 256 * 1024 * 1024;
pub type Result<T> = std::result::Result<T, BackupError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupError {
    pub code: String,
    pub message: String,
}
impl std::fmt::Display for BackupError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}
impl std::error::Error for BackupError {}
impl From<std::io::Error> for BackupError {
    fn from(e: std::io::Error) -> Self {
        failure("backup_io", format!("本地备份文件操作失败：{e}"))
    }
}
impl From<serde_json::Error> for BackupError {
    fn from(e: serde_json::Error) -> Self {
        failure("backup_corrupt", format!("本地备份数据无效：{e}"))
    }
}
pub(crate) fn failure(code: &str, message: impl Into<String>) -> BackupError {
    BackupError {
        code: code.into(),
        message: message.into(),
    }
}

#[cfg(test)]
mod tests;
