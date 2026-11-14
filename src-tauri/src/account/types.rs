use crate::session::synchronization::AdoptionStage;
use serde::{Deserialize, Serialize};
#[derive(Clone, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub(crate) enum Command {
    Status {},
    SignIn {
        #[serde(default)]
        surface: AuthorizationSurface,
    },
    SignUp {
        #[serde(default)]
        surface: AuthorizationSurface,
    },
    OpenLoginInBrowser {},
    Cancel {},
    SignOut {},
    SyncNow {},
    SetEnabled {
        enabled: bool,
    },
    RenameDevice {
        name: String,
    },
    SyncDevice {
        #[serde(deserialize_with = "device_id")]
        device_id: String,
        direction: TransferDirection,
    },
}
#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Status {
    pub state: Phase,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub authorization_surface: Option<AuthorizationSurface>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport_generation: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_operation: Option<DeviceOperation>,
}
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AuthorizationSurface {
    Embedded,
    #[default]
    Browser,
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
    pub sync_available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<DeviceSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport: Option<MappingObservation>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum TransferDirection {
    Push,
    Pull,
    Both,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DeviceSummary {
    pub note_count: u64,
    #[serde(deserialize_with = "nullable_timestamp")]
    pub last_note_updated_at: Option<u64>,
    pub captured_at: u64,
}
fn device_id<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<String, D::Error> {
    let value = String::deserialize(deserializer)?;
    if !super::private::registry_id(&value) {
        return Err(serde::de::Error::custom("invalid device id"));
    }
    Ok(value)
}
fn nullable_timestamp<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<Option<u64>, D::Error> {
    Option::<u64>::deserialize(deserializer)
}
pub(super) const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
impl DeviceSummary {
    pub(crate) fn valid(&self) -> bool {
        self.note_count <= MAX_SAFE_INTEGER
            && self.captured_at <= MAX_SAFE_INTEGER
            && self
                .last_note_updated_at
                .is_none_or(|n| n <= MAX_SAFE_INTEGER)
            && (self.note_count == 0) == self.last_note_updated_at.is_none()
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeviceOperation {
    pub device_id: String,
    pub direction: TransferDirection,
    pub phase: DeviceOperationPhase,
    pub started_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<u64>,
}
#[derive(Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum DeviceOperationPhase {
    Running,
    Succeeded,
    Failed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub(crate) enum TransportKind {
    #[serde(rename = "webrtc-direct")]
    WebrtcDirect,
    #[serde(rename = "iroh-direct")]
    IrohDirect,
    #[serde(rename = "cloudflare-tunnel")]
    CloudflareTunnel,
    #[serde(rename = "unavailable")]
    Unavailable,
    #[serde(rename = "unknown")]
    Unknown,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MappingObservation {
    pub generation: u64,
    pub sample: u64,
    pub age_ms: u64,
    pub enrollment: TransportKind,
    pub sync: TransportKind,
}
#[derive(Clone, Serialize)]
pub(crate) struct SafeError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stage: Option<NetworkStage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<account_auth::IdentityRejection>,
    #[serde(rename = "providerReason", skip_serializing_if = "Option::is_none")]
    pub provider_reason: Option<cybergrid_sdk::AuthProviderFailure>,
    #[serde(rename = "tokenOperation", skip_serializing_if = "Option::is_none")]
    pub token_operation: Option<account_auth::TokenOperation>,
    #[serde(rename = "tokenField", skip_serializing_if = "Option::is_none")]
    pub token_field: Option<account_auth::TokenResponseField>,
    #[serde(rename = "requestReason", skip_serializing_if = "Option::is_none")]
    pub request_reason: Option<RequestReason>,
    #[serde(rename = "httpStatus", skip_serializing_if = "Option::is_none")]
    pub http_status: Option<u16>,
    #[serde(rename = "adoptionStage", skip_serializing_if = "Option::is_none")]
    pub adoption_stage: Option<AdoptionStage>,
    #[serde(rename = "adoptionReason", skip_serializing_if = "Option::is_none")]
    pub adoption_reason: Option<AdoptionReason>,
    #[serde(rename = "syncStage", skip_serializing_if = "Option::is_none")]
    pub sync_stage: Option<SyncStage>,
    #[serde(rename = "syncReason", skip_serializing_if = "Option::is_none")]
    pub sync_reason: Option<crate::sync::identity::SyncError>,
}
/// Selected-device operation boundaries only. Reasons reuse the existing finite,
/// payload-free SyncError enum; neither field accepts provider text or identity.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum SyncStage {
    Pair,
    RecoverPairing,
    Transfer,
    Retirement,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AdoptionReason {
    Timeout,
}
impl SafeError {
    pub(super) fn refresh_rejected(&self) -> bool {
        self.code == "account_authentication"
            && ((self.stage == Some(NetworkStage::IdentityRefresh)
                && self.provider_reason.is_none())
                || (self.stage == Some(NetworkStage::AuthorizationProvider)
                    && self.provider_reason
                        == Some(cybergrid_sdk::AuthProviderFailure::RefreshFailed)))
    }
    pub(super) fn initial_authorization_retry(&self) -> bool {
        // This permits begin_authorization only, never replacement logout. A retained
        // grant will still be rejected as Busy by the sole auth owner.
        self.provider_reason.is_none()
            && match self.code.as_str() {
                "account_auth_callback_invalid"
                | "account_auth_code_rejected"
                | "account_auth_token_response_invalid"
                | "account_auth_identity_invalid"
                | "account_cancelled"
                | "account_owner_workspace_mismatch" => true,
                "account_network" | "account_authentication"
                    if self.stage == Some(NetworkStage::CoordinatorProfile) =>
                {
                    true
                }
                "account_network" => matches!(
                    self.stage,
                    Some(
                        NetworkStage::CallbackListen
                            | NetworkStage::BrowserOpen
                            | NetworkStage::CallbackReceive
                            | NetworkStage::IdentityProvider
                    )
                ),
                "account_authentication" => self.stage == Some(NetworkStage::IdentitySession),
                _ => false,
            }
    }
}
/// Fixed operation labels for network and authentication failures only;
/// never serialize upstream errors, URLs or credentials.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum NetworkStage {
    CallbackListen,
    BrowserOpen,
    CallbackReceive,
    IdentityProvider,
    Coordinator,
    CoordinatorConfiguration,
    CoordinatorRegistration,
    CoordinatorProfile,
    CoordinatorEnrollment,
    CoordinatorJwks,
    AuthorizationProvider,
    IdentitySession,
    IdentityRefresh,
    IdentityRevocation,
    CoordinatorSession,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum RequestReason {
    Timeout,
    Connect,
    Request,
    ResponseBody,
    HttpStatus,
    InvalidResponse,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum RequestFailure {
    Timeout,
    Connect,
    Request,
    ResponseBody,
    HttpStatus(reqwest::StatusCode),
    InvalidResponse,
}
impl RequestFailure {
    fn details(self) -> (RequestReason, Option<u16>) {
        match self {
            Self::Timeout => (RequestReason::Timeout, None),
            Self::Connect => (RequestReason::Connect, None),
            Self::Request => (RequestReason::Request, None),
            Self::ResponseBody => (RequestReason::ResponseBody, None),
            Self::HttpStatus(status) if !status.is_success() && status.as_u16() <= 599 => {
                (RequestReason::HttpStatus, Some(status.as_u16()))
            }
            Self::HttpStatus(_) | Self::InvalidResponse => (RequestReason::InvalidResponse, None),
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Error {
    Configuration,
    Authentication,
    AuthenticationAt(NetworkStage),
    ProviderAuthentication(cybergrid_sdk::AuthProviderFailure),
    InvalidCallback,
    InvalidIdentity,
    IdentityRejected(account_auth::IdentityRejection),
    ResponseMetadata(
        account_auth::TokenOperation,
        account_auth::TokenResponseField,
    ),
    CodeExchangeRejected,
    TokenResponseInvalid,
    MissingRefreshToken,
    OwnershipMismatch,
    Network,
    NetworkAt(NetworkStage),
    RequestAt(NetworkStage, RequestFailure),
    InvalidProof,
    Storage,
    Cancelled,
    Busy,
    Unsupported,
    CleanupRequired,
    Sync,
    SyncAt(SyncStage, crate::sync::identity::SyncError),
    CoordinationProtocol,
    AdoptionBlocked,
    AdoptionTimeout(AdoptionStage),
    WindowInvalid,
    DeviceOffline,
    DeviceIncompatible,
    SyncNotEnabled,
    DirectoryUnavailable,
    DirectoryUnsupported,
}
impl Error {
    pub fn code(self) -> &'static str {
        match self {
            Self::Configuration => "account_configuration",
            Self::Authentication | Self::AuthenticationAt(_) | Self::ProviderAuthentication(_) => {
                "account_authentication"
            }
            Self::InvalidCallback => "account_auth_callback_invalid",
            Self::InvalidIdentity | Self::IdentityRejected(_) | Self::ResponseMetadata(_, _) => {
                "account_auth_identity_invalid"
            }
            Self::CodeExchangeRejected => "account_auth_code_rejected",
            Self::TokenResponseInvalid => "account_auth_token_response_invalid",
            Self::MissingRefreshToken => "account_auth_refresh_missing",
            Self::OwnershipMismatch => "account_owner_workspace_mismatch",
            Self::Network | Self::NetworkAt(_) => "account_network",
            Self::RequestAt(_, RequestFailure::HttpStatus(status))
                if matches!(status.as_u16(), 401 | 403) =>
            {
                "account_authentication"
            }
            Self::RequestAt(_, _) => "account_network",
            Self::InvalidProof => "account_enrollment_invalid",
            Self::Storage => "account_storage",
            Self::Cancelled => "account_cancelled",
            Self::Busy => "account_busy",
            Self::Unsupported => "account_platform_unsupported",
            Self::CleanupRequired => "account_cleanup_required",
            Self::Sync | Self::SyncAt(_, _) => "account_sync_failed",
            Self::CoordinationProtocol => "account_sync_protocol",
            Self::AdoptionBlocked | Self::AdoptionTimeout(_) => "account_sync_adoption_blocked",
            Self::WindowInvalid => "account_window_invalid",
            Self::DeviceOffline => "account_device_offline",
            Self::DeviceIncompatible => "account_device_incompatible",
            Self::SyncNotEnabled => "account_sync_not_enabled",
            Self::DirectoryUnavailable => "account_directory_unavailable",
            Self::DirectoryUnsupported => "account_directory_unsupported",
        }
    }
    pub fn safe(self) -> SafeError {
        let request_details = match self {
            Self::RequestAt(
                NetworkStage::CoordinatorProfile
                | NetworkStage::CoordinatorEnrollment
                | NetworkStage::CoordinatorJwks,
                failure,
            ) => Some(failure.details()),
            _ => None,
        };
        SafeError {
            code: self.code().into(),
            message: if self == Self::CleanupRequired {
                "存在待撤销的登录授权，请先退出授权后重新登录。本机备忘录会保留。"
            } else if self == Self::AdoptionBlocked {
                "旧同步仍有未解决冲突、待应用内容或正在保存的操作。请先处理后再开启合并；当前账户已登录且同步暂停，本机内容会保留。"
            } else if matches!(self, Self::AdoptionTimeout(_)) {
                "同步空间准备超时，尚未完成切换。当前账户已登录，本机内容会保留，请稍后重试。"
            } else {
                "账户操作未完成，本机备忘录仍会保留。请检查账户状态后重试。"
            }
            .into(),
            stage: match self {
                Self::NetworkAt(stage)
                | Self::AuthenticationAt(stage)
                | Self::RequestAt(stage, _) => Some(stage),
                Self::ProviderAuthentication(_) => Some(NetworkStage::AuthorizationProvider),
                _ => None,
            },
            reason: match self {
                Self::IdentityRejected(reason) => Some(reason),
                Self::ResponseMetadata(_, _) => {
                    Some(account_auth::IdentityRejection::ResponseMetadata)
                }
                _ => None,
            },
            provider_reason: match self {
                Self::ProviderAuthentication(reason) => Some(reason),
                _ => None,
            },
            token_operation: match self {
                Self::ResponseMetadata(operation, _) => Some(operation),
                _ => None,
            },
            token_field: match self {
                Self::ResponseMetadata(_, field) => Some(field),
                _ => None,
            },
            request_reason: request_details.map(|(reason, _)| reason),
            http_status: request_details.and_then(|(_, status)| status),
            adoption_stage: match self { Self::AdoptionTimeout(stage) => Some(stage), _ => None },
            adoption_reason: match self { Self::AdoptionTimeout(_) => Some(AdoptionReason::Timeout), _ => None },
            sync_stage: match self { Self::SyncAt(stage, _) => Some(stage), _ => None },
            sync_reason: match self { Self::SyncAt(_, reason) => Some(reason), _ => None },
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
            A::IdentityRejected(reason) => Self::IdentityRejected(reason),
            A::ResponseMetadata(operation, field) => Self::ResponseMetadata(operation, field),
            A::CodeExchangeRejected => Self::CodeExchangeRejected,
            A::TokenResponseInvalid => Self::TokenResponseInvalid,
            A::MissingRefreshToken => Self::MissingRefreshToken,
            A::NoSession => Self::AuthenticationAt(NetworkStage::IdentitySession),
            A::RefreshFailed => Self::AuthenticationAt(NetworkStage::IdentityRefresh),
            A::RevocationFailed => Self::AuthenticationAt(NetworkStage::IdentityRevocation),
        }
    }
}
impl From<crate::store::AppError> for Error {
    fn from(value: crate::store::AppError) -> Self {
        match value.code.as_str() {
            "sync_adoption_blocked" => Self::AdoptionBlocked,
            "sync_adoption_probe_timeout" => Self::AdoptionTimeout(AdoptionStage::Probe),
            "sync_adoption_prepare_timeout" => Self::AdoptionTimeout(AdoptionStage::Prepare),
            "sync_adoption_media_timeout" => Self::AdoptionTimeout(AdoptionStage::Media),
            code if code.contains("mismatch") => Self::OwnershipMismatch,
            _ => Self::Sync,
        }
    }
}
impl From<crate::sync::identity::SyncError> for Error {
    fn from(_: crate::sync::identity::SyncError) -> Self {
        Self::Sync
    }
}
impl From<cybergrid_sdk::Error> for Error {
    fn from(error: cybergrid_sdk::Error) -> Self {
        Self::sdk_at(error, NetworkStage::Coordinator)
    }
}
impl Error {
    pub fn sdk_at(error: cybergrid_sdk::Error, stage: NetworkStage) -> Self {
        use cybergrid_sdk::Error as S;
        match error {
            S::Config(_) => Self::Configuration,
            S::Protocol(_) => Self::CoordinationProtocol,
            S::Credentials(_) => Self::Storage,
            S::Cancelled => Self::Cancelled,
            S::IdentityChanged => Self::OwnershipMismatch,
            S::AuthorizationProvider(reason) => Self::ProviderAuthentication(reason),
            // Unclassified adapters still report the fixed provider boundary.
            S::AuthorizationUnavailable => {
                Self::AuthenticationAt(NetworkStage::AuthorizationProvider)
            }
            S::NotLoggedIn => Self::AuthenticationAt(NetworkStage::CoordinatorSession),
            S::OAuth { .. } => Self::AuthenticationAt(NetworkStage::IdentityProvider),
            S::Api {
                status: 401 | 403, ..
            } => Self::AuthenticationAt(stage),
            S::RevocationPending => Self::CleanupRequired,
            _ => Self::NetworkAt(stage),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn selected_device_sync_diagnostics_are_an_exact_pair_of_finite_fields() {
        use crate::sync::identity::SyncError as S;
        let reasons = [
            (S::Io, "io"), (S::InvalidInput, "invalid_input"),
            (S::CorruptIdentity, "corrupt_identity"), (S::Authentication, "authentication"),
            (S::Expired, "expired"), (S::Revoked, "revoked"),
            (S::WorkspaceMismatch, "workspace_mismatch"), (S::Protocol, "protocol"),
            (S::Limit, "limit"), (S::Timeout, "timeout"), (S::Stopped, "stopped"),
            (S::Backend, "backend"), (S::PlanStale, "plan_stale"),
            (S::Busy, "busy"), (S::Transport, "transport"),
        ];
        for (stage, label) in [
            (SyncStage::Pair, "pair"), (SyncStage::RecoverPairing, "recoverPairing"),
            (SyncStage::Transfer, "transfer"), (SyncStage::Retirement, "retirement"),
        ] {
            for (reason, reason_label) in reasons {
                let value = serde_json::to_value(Error::SyncAt(stage, reason).safe()).unwrap();
                assert_eq!(value, serde_json::json!({
                    "code":"account_sync_failed",
                    "message":"账户操作未完成，本机备忘录仍会保留。请检查账户状态后重试。",
                    "syncStage":label, "syncReason":reason_label,
                }));
            }
        }
        // Other call sites retain their old generic conversion. A task join
        // failure or native timeout must not invent a network SyncError reason.
        for (reason, _) in reasons {
            assert_eq!(Error::from(reason), Error::Sync);
        }
        for error in [Error::Sync, Error::Cancelled, Error::Busy, Error::InvalidProof,
            Error::Network, Error::Storage, Error::OwnershipMismatch,
            Error::NetworkAt(NetworkStage::Coordinator)] {
            let value = serde_json::to_value(error.safe()).unwrap();
            assert!(value.get("syncStage").is_none());
            assert!(value.get("syncReason").is_none());
        }
    }
    #[test]
    fn device_commands_reject_unknown_shapes_and_directions() {
        let id = uuid::Uuid::new_v4().to_string();
        let valid = serde_json::json!({"type":"syncDevice","deviceId":id,"direction":"push"});
        assert!(matches!(
            serde_json::from_value::<Command>(valid.clone()),
            Ok(Command::SyncDevice {
                direction: TransferDirection::Push,
                ..
            })
        ));
        for field in ["direction", "deviceId"] {
            for bad in [serde_json::Value::Null, serde_json::json!(7)] {
                let mut value = valid.clone();
                value[field] = bad;
                assert!(serde_json::from_value::<Command>(value).is_err());
            }
        }
        for direction in ["Push", "all", "broadcast", ""] {
            let mut value = valid.clone();
            value["direction"] = serde_json::json!(direction);
            assert!(serde_json::from_value::<Command>(value).is_err());
        }
        let mut value = valid;
        value["url"] = serde_json::json!("https://untrusted.invalid");
        assert!(serde_json::from_value::<Command>(value).is_err());
        for error in [
            Error::DeviceOffline,
            Error::DeviceIncompatible,
            Error::SyncNotEnabled,
            Error::DirectoryUnavailable,
            Error::DirectoryUnsupported,
        ] {
            let value = serde_json::to_value(error.safe()).unwrap();
            assert_eq!(value.as_object().unwrap().len(), 2);
        }
    }

    #[test]
    fn adoption_block_is_a_finite_local_error_without_provider_details() {
        let error = Error::from(crate::store::AppError {
            code: "sync_adoption_blocked".into(),
            message: "untrusted detail".into(),
            commit: None,
        });
        assert_eq!(error, Error::AdoptionBlocked);
        let value = serde_json::to_value(error.safe()).unwrap();
        assert_eq!(value["code"], "account_sync_adoption_blocked");
        assert_eq!(value.as_object().unwrap().len(), 2);
        assert!(!value.to_string().contains("untrusted detail"));
    }
    #[test]
    fn adoption_timeout_is_an_exact_finite_pair_without_raw_details() {
        for (code, stage) in [
            ("sync_adoption_probe_timeout", "probe"),
            ("sync_adoption_prepare_timeout", "prepare"),
            ("sync_adoption_media_timeout", "media"),
        ] {
            let error = Error::from(crate::store::AppError {
                code: code.into(),
                message: "untrusted /path and upstream text".into(),
                commit: None,
            });
            let value = serde_json::to_value(error.safe()).unwrap();
            assert_eq!(value["code"], "account_sync_adoption_blocked");
            assert_eq!(value["adoptionStage"], stage);
            assert_eq!(value["adoptionReason"], "timeout");
            assert_eq!(value.as_object().unwrap().len(), 4);
            assert!(!value.to_string().contains("untrusted"));
        }
        for code in [
            "sync_adoption_unknown_timeout",
            "sync_adoption_media_timeout_extra",
            "filesystem",
        ] {
            let value = serde_json::to_value(
                Error::from(crate::store::AppError {
                    code: code.into(),
                    message: "sync_adoption_media_timeout".into(),
                    commit: None,
                })
                .safe(),
            )
            .unwrap();
            assert_eq!(value["code"], "account_sync_failed");
            assert!(value.get("adoptionStage").is_none());
            assert!(value.get("adoptionReason").is_none());
        }
    }
    #[test]
    fn request_details_are_finite_stage_scoped_and_http_status_is_paired() {
        for stage in [
            NetworkStage::CoordinatorProfile,
            NetworkStage::CoordinatorEnrollment,
            NetworkStage::CoordinatorJwks,
        ] {
            for (failure, label) in [
                (RequestFailure::Timeout, "timeout"),
                (RequestFailure::Connect, "connect"),
                (RequestFailure::Request, "request"),
                (RequestFailure::ResponseBody, "responseBody"),
                (RequestFailure::InvalidResponse, "invalidResponse"),
            ] {
                let value = serde_json::to_value(Error::RequestAt(stage, failure).safe()).unwrap();
                assert_eq!(value["code"], "account_network");
                assert_eq!(value["requestReason"], label);
                assert!(value.get("httpStatus").is_none());
                for key in ["reason", "providerReason", "tokenOperation", "tokenField"] {
                    assert!(value.get(key).is_none());
                }
            }
            for status in [100, 302, 401, 403, 429, 503, 599] {
                let value = serde_json::to_value(
                    Error::RequestAt(
                        stage,
                        RequestFailure::HttpStatus(reqwest::StatusCode::from_u16(status).unwrap()),
                    )
                    .safe(),
                )
                .unwrap();
                assert_eq!(value["requestReason"], "httpStatus");
                assert_eq!(value["httpStatus"], status);
                assert_eq!(
                    value["code"],
                    if matches!(status, 401 | 403) {
                        "account_authentication"
                    } else {
                        "account_network"
                    }
                );
            }
            for status in [200, 204, 299, 600, 999] {
                let value = serde_json::to_value(
                    Error::RequestAt(
                        stage,
                        RequestFailure::HttpStatus(reqwest::StatusCode::from_u16(status).unwrap()),
                    )
                    .safe(),
                )
                .unwrap();
                assert_eq!(value["requestReason"], "invalidResponse");
                assert!(value.get("httpStatus").is_none());
            }
        }
        for error in [
            Error::Network,
            Error::Busy,
            Error::WindowInvalid,
            Error::RequestAt(NetworkStage::IdentityProvider, RequestFailure::Timeout),
        ] {
            let value = serde_json::to_value(error.safe()).unwrap();
            assert!(value.get("requestReason").is_none());
            assert!(value.get("httpStatus").is_none());
        }
        assert_eq!(Error::WindowInvalid.safe().code, "account_window_invalid");
    }

    #[test]
    fn mapping_observation_serializes_finite_paths_and_legacy_status_omits_extension() {
        let legacy = serde_json::to_value(Status::default()).unwrap();
        assert!(legacy.get("transportGeneration").is_none());
        for (kind, label) in [
            (TransportKind::WebrtcDirect, "webrtc-direct"),
            (TransportKind::IrohDirect, "iroh-direct"),
            (TransportKind::CloudflareTunnel, "cloudflare-tunnel"),
            (TransportKind::Unavailable, "unavailable"),
            (TransportKind::Unknown, "unknown"),
        ] {
            let sample = MappingObservation {
                generation: 2,
                sample: 9,
                age_ms: 10,
                enrollment: kind,
                sync: kind,
            };
            assert_eq!(
                serde_json::to_value(sample).unwrap(),
                serde_json::json!({
                    "generation": 2, "sample": 9, "ageMs": 10,
                    "enrollment": label, "sync": label,
                })
            );
        }
    }

    #[test]
    fn token_response_diagnostics_preserve_generic_reason_and_exact_finite_details() {
        use account_auth::{AuthError, TokenOperation as O, TokenResponseField as F};
        for (operation, label) in [(O::CodeExchange, "codeExchange"), (O::Refresh, "refresh")] {
            for (field, field_label) in [
                (F::TokenType, "tokenType"),
                (F::AccessToken, "accessToken"),
                (F::ExpiresIn, "expiresIn"),
                (F::Scope, "scope"),
            ] {
                let error = Error::from(AuthError::ResponseMetadata(operation, field));
                let value = serde_json::to_value(error.safe()).unwrap();
                assert_eq!(
                    value,
                    serde_json::json!({
                        "code":"account_auth_identity_invalid", "message":error.safe().message,
                        "reason":"responseMetadata", "tokenOperation":label, "tokenField":field_label
                    })
                );
                assert!(!error.safe().refresh_rejected());
            }
        }
        for error in [
            Error::InvalidIdentity,
            Error::IdentityRejected(account_auth::IdentityRejection::ResponseMetadata),
            Error::IdentityRejected(account_auth::IdentityRejection::Signature),
            Error::CleanupRequired,
            Error::Network,
            Error::TokenResponseInvalid,
        ] {
            let value = serde_json::to_value(error.safe()).unwrap();
            assert!(value.get("tokenOperation").is_none());
            assert!(value.get("tokenField").is_none());
        }
    }

    #[test]
    fn authentication_diagnostics_preserve_boundaries_without_upstream_details() {
        use cybergrid_sdk::Error as S;
        for stage in [
            NetworkStage::Coordinator,
            NetworkStage::CoordinatorConfiguration,
            NetworkStage::CoordinatorRegistration,
        ] {
            for status in [401, 403] {
                let error = Error::sdk_at(
                    S::Api {
                        status,
                        code: "private-response-sentinel https://private.invalid/token".into(),
                    },
                    stage,
                );
                assert_eq!(error, Error::AuthenticationAt(stage));
                let value = serde_json::to_value(error.safe()).unwrap();
                assert_eq!(value["code"], "account_authentication");
                assert_eq!(value["stage"], serde_json::to_value(stage).unwrap());
                assert_eq!(value.as_object().unwrap().len(), 3);
                assert!(!value.to_string().contains("private"));
            }
        }
        for (sdk, stage) in [
            (
                S::AuthorizationUnavailable,
                NetworkStage::AuthorizationProvider,
            ),
            (S::NotLoggedIn, NetworkStage::CoordinatorSession),
            (
                S::OAuth {
                    status: 400,
                    code: "private-response-sentinel".into(),
                },
                NetworkStage::IdentityProvider,
            ),
        ] {
            assert_eq!(
                Error::sdk_at(sdk, NetworkStage::CoordinatorRegistration),
                Error::AuthenticationAt(stage)
            );
        }
        for (auth, stage) in [
            (
                account_auth::AuthError::NoSession,
                NetworkStage::IdentitySession,
            ),
            (
                account_auth::AuthError::RefreshFailed,
                NetworkStage::IdentityRefresh,
            ),
            (
                account_auth::AuthError::RevocationFailed,
                NetworkStage::IdentityRevocation,
            ),
        ] {
            assert_eq!(Error::from(auth), Error::AuthenticationAt(stage));
        }
        assert!(serde_json::to_value(Error::Authentication.safe())
            .unwrap()
            .get("stage")
            .is_none());
        // Classification outside authentication remains unchanged.
        assert_eq!(Error::from(S::Cancelled), Error::Cancelled);
        assert_eq!(Error::from(S::IdentityChanged), Error::OwnershipMismatch);
        assert_eq!(Error::from(S::RevocationPending), Error::CleanupRequired);
        assert_eq!(
            Error::from(S::Credentials("private-response-sentinel".into())),
            Error::Storage
        );
        assert_eq!(
            Error::from(S::Protocol("private-response-sentinel".into())),
            Error::CoordinationProtocol
        );
        assert_eq!(
            Error::sdk_at(
                S::Api {
                    status: 503,
                    code: "private-response-sentinel".into()
                },
                NetworkStage::CoordinatorRegistration
            ),
            Error::NetworkAt(NetworkStage::CoordinatorRegistration)
        );
    }

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
