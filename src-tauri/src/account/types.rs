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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<crate::sync::network::TransferProgress>,
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
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AuthProviderFailure {
    RefreshFailed,
    SessionUnavailable,
    Storage,
    Network,
}
#[derive(Clone, Serialize)]
pub(crate) struct SafeError {
    #[serde(rename = "cyberbusCode", skip_serializing_if = "Option::is_none")]
    pub cyberbus_code: Option<i32>,
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stage: Option<NetworkStage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<account_auth::IdentityRejection>,
    #[serde(rename = "providerReason", skip_serializing_if = "Option::is_none")]
    pub provider_reason: Option<AuthProviderFailure>,
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
                    && self.provider_reason == Some(AuthProviderFailure::RefreshFailed)))
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
    BusCode(i32),
    UnknownOutcome,
    Deadline,
    Authentication,
    AuthenticationAt(NetworkStage),
    ProviderAuthentication(AuthProviderFailure),
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
            Self::BusCode(_) => "account_sdk_failed",
            Self::UnknownOutcome => "account_unknown_outcome",
            Self::Deadline => "account_deadline_exceeded",
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
            cyberbus_code: match self {Self::BusCode(c)=>Some(c),_=>None},
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
impl From<notes_cyberbus::Error> for Error {
    fn from(error: notes_cyberbus::Error) -> Self {
        use notes_cyberbus::{pb::ErrorCode as C, Error as B};
        match error {
            B::Sdk(code) => match C::try_from(code) {
                Ok(C::Unauthenticated | C::PermissionDenied | C::InvalidClaims) => {
                    Self::Authentication
                }
                Ok(C::LogtoConfiguration) => Self::Configuration,
                Ok(C::Cancelled) => Self::Cancelled,
                Ok(C::DeadlineExceeded) => Self::Deadline,
                Ok(C::UnknownOutcome) => Self::UnknownOutcome,
                Ok(C::Conflict) => Self::Busy,
                Ok(C::NetworkNotReady | C::NoRoute | C::Unavailable | C::DeviceUnreachable) => {
                    Self::Network
                }
                Ok(_) => Self::BusCode(code),
                Err(_) => Self::CoordinationProtocol,
            },
            B::Cancelled | B::Closed => Self::Cancelled,
            B::Timeout => Self::UnknownOutcome,
            B::PeerUnavailable => Self::DeviceOffline,
            B::DirectoryReset => Self::DirectoryUnavailable,
            B::Io(_) => Self::Network,
            B::Capacity => Self::Busy,
            _ => Self::CoordinationProtocol,
        }
    }
}
#[cfg(test)]
mod cyberbus_tests {
    use super::*;
    #[test]
    fn sdk_errors_are_finite_without_upstream_payload() {
        use notes_cyberbus::{pb::ErrorCode as C, Error as B};
        assert_eq!(Error::from(B::Timeout), Error::UnknownOutcome);
        assert_eq!(
            Error::from(B::Sdk(C::UnknownOutcome as i32)),
            Error::UnknownOutcome
        );
        assert_eq!(
            Error::from(B::Sdk(C::DeadlineExceeded as i32)),
            Error::Deadline
        );
        assert_eq!(
            Error::from(B::Sdk(C::Internal as i32)),
            Error::BusCode(C::Internal as i32)
        );
        assert_eq!(Error::from(B::Sdk(999999)), Error::CoordinationProtocol);
        let safe = serde_json::to_value(Error::BusCode(C::Internal as i32).safe()).unwrap();
        assert_eq!(safe["cyberbusCode"], C::Internal as i32);
        assert!(safe["message"].as_str().unwrap().len() < 256);
    }
}
