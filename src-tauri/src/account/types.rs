use serde::{Deserialize, Serialize};
#[derive(Clone, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub(crate) enum Command {
    Status {},
    SignIn {},
    SignUp {},
    Cancel {},
    SignOut {},
    SyncNow {},
    SetEnabled { enabled: bool },
}
#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Status {
    pub state: Phase,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile: Option<Profile>,
    pub devices: Vec<Device>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_sync_at: Option<u64>,
    pub pending_count: u64,
    pub conflict_count: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<SafeError>,
}
#[derive(Clone, Serialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Phase {
    #[default]
    SignedOut,
    Authorizing,
    Connecting,
    Ready,
    Paused,
    Error,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Profile {
    pub subject: String,
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Device {
    pub id: String,
    pub name: String,
    pub online: bool,
    pub current: bool,
    pub connected: bool,
}
#[derive(Clone, Serialize)]
pub(crate) struct SafeError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stage: Option<NetworkStage>,
}
/// Fixed labels only; never serialize upstream errors, URLs or credentials.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum NetworkStage {
    CallbackListen,
    BrowserOpen,
    CallbackReceive,
    IdentityProvider,
    Coordinator,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Error {
    Configuration,
    Authentication,
    InvalidCallback,
    InvalidIdentity,
    OwnershipMismatch,
    Network,
    NetworkAt(NetworkStage),
    InvalidProof,
    Storage,
    Cancelled,
    Busy,
    Unsupported,
    CleanupRequired,
    Sync,
}
impl Error {
    pub fn code(self) -> &'static str {
        match self {
            Self::Configuration => "account_configuration",
            Self::Authentication => "account_authentication",
            Self::InvalidCallback => "account_auth_callback_invalid",
            Self::InvalidIdentity => "account_auth_identity_invalid",
            Self::OwnershipMismatch => "account_owner_workspace_mismatch",
            Self::Network | Self::NetworkAt(_) => "account_network",
            Self::InvalidProof => "account_enrollment_invalid",
            Self::Storage => "account_storage",
            Self::Cancelled => "account_cancelled",
            Self::Busy => "account_busy",
            Self::Unsupported => "account_platform_unsupported",
            Self::CleanupRequired => "account_cleanup_required",
            Self::Sync => "account_sync_failed",
        }
    }
    pub fn safe(self) -> SafeError {
        SafeError {
            code: self.code().into(),
            message: if self == Self::CleanupRequired {
                "存在待撤销的登录授权，请先退出授权后重新登录。本机备忘录会保留。"
            } else {
                "账户操作未完成，本机备忘录仍会保留。请检查账户状态后重试。"
            }
            .into(),
            stage: match self {
                Self::NetworkAt(stage) => Some(stage),
                _ => None,
            },
        }
    }
}
pub(crate) type Result<T> = std::result::Result<T, Error>;
impl From<std::io::Error> for Error {
    fn from(_: std::io::Error) -> Self {
        Self::Storage
    }
}
impl From<reqwest::Error> for Error {
    fn from(_: reqwest::Error) -> Self {
        Self::Network
    }
}
impl From<account_auth::AuthError> for Error {
    fn from(value: account_auth::AuthError) -> Self {
        use account_auth::AuthError as A;
        match value {
            A::Configuration => Self::Configuration,
            A::Network => Self::NetworkAt(NetworkStage::IdentityProvider),
            A::Cancelled => Self::Cancelled,
            A::OwnershipMismatch => Self::OwnershipMismatch,
            A::Busy => Self::Busy,
            A::Storage => Self::Storage,
            A::InvalidCallback => Self::InvalidCallback,
            A::InvalidIdentity => Self::InvalidIdentity,
            _ => Self::Authentication,
        }
    }
}
impl From<crate::store::AppError> for Error {
    fn from(value: crate::store::AppError) -> Self {
        if value.code.contains("mismatch") {
            Self::OwnershipMismatch
        } else {
            Self::Sync
        }
    }
}
impl From<crate::sync::identity::SyncError> for Error {
    fn from(_: crate::sync::identity::SyncError) -> Self {
        Self::Sync
    }
}
impl From<cybergrid_sdk::Error> for Error {
    fn from(_: cybergrid_sdk::Error) -> Self {
        Self::Network
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn network_diagnostics_keep_safe_code_and_only_fixed_stage_labels() {
        for (stage, label) in [
            (NetworkStage::CallbackListen, "callbackListen"),
            (NetworkStage::BrowserOpen, "browserOpen"),
            (NetworkStage::CallbackReceive, "callbackReceive"),
            (NetworkStage::IdentityProvider, "identityProvider"),
            (NetworkStage::Coordinator, "coordinator"),
        ] {
            let value = serde_json::to_value(Error::NetworkAt(stage).safe()).unwrap();
            assert_eq!(value["code"], "account_network");
            assert_eq!(value["stage"], label);
            assert_eq!(value.as_object().unwrap().len(), 3);
        }
        assert!(serde_json::to_value(Error::Network.safe())
            .unwrap()
            .get("stage")
            .is_none());
        assert_eq!(
            Error::from(account_auth::AuthError::Network),
            Error::NetworkAt(NetworkStage::IdentityProvider)
        );
        assert_eq!(
            Error::from(account_auth::AuthError::InvalidCallback).code(),
            "account_auth_callback_invalid"
        );
        assert_eq!(
            Error::from(account_auth::AuthError::InvalidIdentity).code(),
            "account_auth_identity_invalid"
        );
    }
}
