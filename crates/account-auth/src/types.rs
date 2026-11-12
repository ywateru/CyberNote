use serde::{Deserialize, Serialize};
use std::{
    fmt,
    path::Path,
    sync::{Arc, Mutex},
};
use url::Url;
use zeroize::Zeroizing;

#[derive(Clone, Debug)]
pub struct PinnedConfig {
    pub issuer: Url,
    pub client_id: String,
    pub resource: Url,
    pub redirect_uris: Vec<Url>,
}
impl PinnedConfig {
    pub(crate) fn validate(&self) -> Result<(), AuthError> {
        for url in [&self.issuer, &self.resource] {
            if url.scheme() != "https"
                || url.host_str().is_none()
                || !url.username().is_empty()
                || url
                    .as_str()
                    .split('/')
                    .nth(2)
                    .unwrap_or_default()
                    .contains('@')
                || url.query().is_some()
                || url.fragment().is_some()
            {
                return Err(AuthError::Configuration);
            }
        }
        if !self.issuer.path().ends_with("/oidc")
            || self.client_id.is_empty()
            || self.client_id.len() > 21
            || !self
                .client_id
                .bytes()
                .all(|x| x.is_ascii_alphanumeric() || x == b'_' || x == b'-')
            || self.redirect_uris.is_empty()
            || self.redirect_uris.len() > 4
        {
            return Err(AuthError::Configuration);
        }
        for uri in &self.redirect_uris {
            let mac = uri.scheme() == "http"
                && uri.host_str() == Some("127.0.0.1")
                && uri.port() == Some(17897)
                && uri.path() == "/callback";
            let android = uri.as_str() == "com.local.notesclone.auth://callback";
            if (!mac && !android)
                || !uri.username().is_empty()
                || uri
                    .as_str()
                    .split('/')
                    .nth(2)
                    .unwrap_or_default()
                    .contains('@')
                || uri.query().is_some()
                || uri.fragment().is_some()
            {
                return Err(AuthError::Configuration);
            }
        }
        Ok(())
    }
    pub(crate) fn endpoint(&self, suffix: &str) -> String {
        format!("{}{}", self.issuer.as_str(), suffix)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Identity {
    pub issuer: String,
    pub subject: String,
    pub display_name: String,
    pub username: Option<String>,
}

/// Rust-only token handoff. Never serializable; Debug always redacts the value.
pub struct AccessToken(pub(crate) Zeroizing<String>);
impl AccessToken {
    pub fn secret(&self) -> &str {
        self.0.as_str()
    }
}
impl fmt::Debug for AccessToken {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("AccessToken([REDACTED])")
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AuthError {
    Configuration,
    Network,
    InvalidCallback,
    InvalidIdentity,
    Cancelled,
    NoSession,
    OwnershipMismatch,
    Storage,
    RefreshFailed,
    RevocationFailed,
    Busy,
}
impl fmt::Display for AuthError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Configuration => "账户配置无效",
            Self::Network => "认证服务暂时不可用",
            Self::InvalidCallback => "登录回跳无效，请重新登录",
            Self::InvalidIdentity => "身份验证失败，请重新登录",
            Self::Cancelled => "登录已取消",
            Self::NoSession => "请先登录账户",
            Self::OwnershipMismatch => "保存的账户与当前配置不匹配",
            Self::Storage => "无法安全保存账户授权",
            Self::RefreshFailed => "账户授权刷新失败，请重新登录",
            Self::RevocationFailed => "无法撤销授权，已保留凭据以供重试",
            Self::Busy => "账户授权正在使用",
        })
    }
}
impl std::error::Error for AuthError {}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum TransactionStatus {
    Active,
    Cancelled,
    Committed,
}
/// Cancel is linearized against durable commit. `false` means commit already won.
#[derive(Clone)]
pub struct AuthorizationCancellation(pub(crate) Arc<Mutex<TransactionStatus>>);
impl AuthorizationCancellation {
    pub fn cancel(&self) -> bool {
        let mut state = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if *state == TransactionStatus::Committed {
            return false;
        }
        *state = TransactionStatus::Cancelled;
        true
    }
    pub(crate) fn active(&self) -> bool {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) == TransactionStatus::Active
    }
}

pub(crate) fn owner_filename(path: &Path) -> Result<&std::ffi::OsStr, AuthError> {
    let name = path.file_name().ok_or(AuthError::Storage)?;
    if name == "." || name == ".." || name == ".account-auth.lock" {
        return Err(AuthError::Storage);
    }
    Ok(name)
}
