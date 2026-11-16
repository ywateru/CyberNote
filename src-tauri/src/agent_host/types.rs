use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeSet;

pub const MAX_FRAME: usize = 2 * 1024 * 1024;
pub const MAX_GRANTS: usize = 256;
pub const MAX_AUDIT: usize = 200;
pub const TOOLS: [&str; 9] = [
    "notes_get_capabilities",
    "notes_list_folders",
    "notes_list",
    "notes_search",
    "notes_read",
    "notes_create",
    "notes_append",
    "notes_update",
    "notes_get_operation",
];
pub(crate) fn scope(tool: &str) -> Option<&'static str> {
    match tool {
        "notes_list_folders" | "notes_list" | "notes_search" | "notes_read" => Some("notes:read"),
        "notes_create" => Some("notes:create"),
        "notes_append" | "notes_update" => Some("notes:update"),
        // Operation lookup must check the original tool and target in the application.
        _ => None,
    }
}
pub(crate) fn is_write(tool: &str) -> bool {
    matches!(tool, "notes_create" | "notes_append" | "notes_update")
}

// Deliberately no Debug/Serialize: credentials are not UI results or log values.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct HostRequest {
    pub version: u32,
    pub request_id: String,
    pub workspace_id: String,
    pub client_id: String,
    pub credential: String,
    pub tool: String,
    pub arguments: Map<String, Value>,
}
#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HostResponse {
    pub version: u32,
    pub request_id: String,
    pub result: Value,
    pub is_error: bool,
}

/// Application/UI passes physical directory IDs explicitly; no recursive expansion here.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateGrant {
    pub client_id: String,
    pub scopes: BTreeSet<String>,
    pub folder_ids: BTreeSet<String>,
    pub expires_at: i64,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GrantInfo {
    pub grant_id: String,
    pub client_id: String,
    pub workspace_id: String,
    pub incarnation: String,
    pub scopes: BTreeSet<String>,
    pub folder_ids: BTreeSet<String>,
    pub expires_at: i64,
    pub revocation: u64,
    pub revoked: bool,
    pub credential_ref: String,
}
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreatedGrant {
    pub grant: GrantInfo,
    /// Reference configuration only: no credential or command-line secret.
    pub connection: ConnectionConfig,
}
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    pub workspace_id: String,
    pub credential_ref: String,
    pub runtime_dir: String,
}
#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HostSettings {
    pub enabled: bool,
    pub host_session_id: String,
    pub workspace_id: String,
    pub incarnation: String,
    /// Actual private runtime used by this host, including for existing grants.
    pub runtime_dir: String,
    pub grants: Vec<GrantInfo>,
    pub recent_operations: Vec<AuditEntry>,
}
/// Metadata only, in memory, bounded; no parameters, title, body, token or error text.
#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub client_id: String,
    pub tool: String,
    pub note_id: Option<String>,
    pub at: i64,
    pub outcome: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct CredentialRecord {
    pub version: u32,
    pub workspace_id: String,
    pub client_id: String,
    pub credential: String,
    pub socket_path: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct StoredGrant {
    pub info: GrantInfo,
    pub credential_hash: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Registry {
    pub version: u32,
    pub workspace_id: String,
    pub incarnation: String,
    pub grants: Vec<StoredGrant>,
}
