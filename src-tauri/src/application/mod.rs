//! Shared application boundary on the process-owned Session. No Store or credentials are opened here.
use crate::{
    agent_access::TrustedContext,
    session::{Session, Token},
    store::{self, Note},
};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeSet, HashMap, HashSet};
use uuid::Uuid;
mod admission;
mod dto;
pub use admission::{RequestLimits, RequestPermit};
pub const WINDOW_EVENT: &str = "notes-agent";
pub const WINDOW_REPLY_COMMAND: &str = "agent_window_reply";
mod document;
mod query;
pub use crate::session::external::{ExternalProgress, ExternalStart, WindowReply};
pub(crate) use document::*;
pub use dto::*;

pub type ToolResult<T> = std::result::Result<T, ToolError>;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ToolError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub operation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub committed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_after_ms: Option<u64>,
}
impl ToolError {
    pub fn new(code: &str, message: &str) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            retryable: matches!(
                code,
                "NOTE_BUSY" | "BARRIER_BUSY" | "RATE_LIMITED" | "TIMEOUT"
            ),
            operation_id: None,
            committed: None,
            current_version: None,
            retry_after_ms: if matches!(code, "NOTE_BUSY" | "BARRIER_BUSY" | "RATE_LIMITED") {
                Some(250)
            } else {
                None
            },
        }
    }
    pub(crate) fn not_found() -> Self {
        Self::new("NOT_FOUND", "Object is not visible")
    }
    pub(crate) fn conflict(version: String) -> Self {
        let mut e = Self::new("REVISION_CONFLICT", "Note version changed");
        e.current_version = Some(version);
        e
    }
    pub(crate) fn storage(_: impl std::fmt::Display) -> Self {
        Self::new("STORAGE_ERROR", "Local storage operation failed")
    }
    pub(crate) fn schema(_: impl std::fmt::Display) -> Self {
        Self::new(
            "SCHEMA_INVALID",
            "Document violates the application schema or attachment ownership",
        )
    }
}
impl std::fmt::Display for ToolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for ToolError {}
impl From<ToolError> for store::AppError {
    fn from(e: ToolError) -> Self {
        Self {
            code: e.code,
            message: e.message,
            commit: None,
        }
    }
}
pub(crate) fn parse<T: DeserializeOwned>(args: Value) -> ToolResult<T> {
    serde_json::from_value(args)
        .map_err(|_| ToolError::new("SCHEMA_INVALID", "Invalid or unknown tool arguments"))
}
pub(crate) fn hash(value: &Value) -> ToolResult<String> {
    use sha2::{Digest, Sha256};
    // serde_json's default map representation is ordered: stable recursively.
    let bytes = serde_json::to_vec(value).map_err(ToolError::storage)?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}
pub(crate) fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
#[derive(Default)]
pub(crate) struct ApplicationState {
    pub(crate) cursors: HashMap<String, query::Cursor>,
}

pub struct NotesApplicationService<'a> {
    pub(crate) session: &'a mut Session,
}
impl<'a> NotesApplicationService<'a> {
    pub fn new(session: &'a mut Session) -> Self {
        Self { session }
    }
    /// Existing UI authority remains a real window save intent / Token. UI never
    /// receives an AgentGrant and agent callers cannot enter this facade via IPC.
    pub(crate) fn ui<T>(
        &mut self,
        operation: impl FnOnce(&mut Session) -> store::Result<T>,
    ) -> store::Result<T> {
        operation(self.session)
    }
    pub(crate) fn ui_save(&mut self, window: &str, action: Value) -> store::Result<Value> {
        self.session.save(window, action)
    }
    pub(crate) fn ui_ordinary(
        &mut self,
        action: Value,
        token: &Token,
    ) -> store::Result<(Value, Option<Value>)> {
        self.session.ordinary(action, token)
    }
    pub(crate) fn ui_begin(
        &mut self,
        action: Value,
        participants: HashSet<String>,
        token: &Token,
    ) -> store::Result<Value> {
        self.session.begin(action, participants, token)
    }
    pub(crate) fn ui_finish(
        &mut self,
        id: &str,
        live: &HashSet<String>,
        timeout: bool,
    ) -> store::Result<(store::Result<Value>, Value)> {
        self.session.finish(id, live, timeout)
    }
    pub(crate) fn authorize(&self, ctx: &TrustedContext, scope: Option<&str>) -> ToolResult<()> {
        let (workspace, incarnation) = self
            .session
            .store
            .application_identity()
            .map_err(ToolError::storage)?;
        ctx.check(&workspace, &incarnation, scope)
    }
    pub fn external_write(
        &mut self,
        context: &TrustedContext,
        tool: &str,
        arguments: Value,
        participants: HashSet<String>,
    ) -> ToolResult<ExternalStart> {
        let command = Mutation::parse(tool, arguments)?;
        self.session.external_begin(context, command, participants)
    }
    pub fn external_tick(&mut self, operation: &str, live: &HashSet<String>) -> ExternalProgress {
        self.session.external_tick(operation, live)
    }
    pub fn external_abort(&mut self, operation: &str) -> ToolResult<Value> {
        self.session.external_abort(operation)
    }
    pub fn external_reply(
        &mut self,
        window: &str,
        reply: WindowReply,
        expected: &Token,
        live: &HashSet<String>,
    ) -> ToolResult<Value> {
        self.session.external_reply(window, reply, expected, live)
    }
    /// Call after dropping Session and attempting metadata/release delivery. A
    /// notification failure cannot turn a committed write into an uncommitted error.
    pub fn notification_failed(&mut self, operation: &str) -> ToolResult<()> {
        self.session
            .store
            .application_warning(operation, "WINDOW_REFRESH_REQUIRED")
            .map_err(|mut error| {
                error.operation_id = Some(operation.into());
                error.committed = Some(true);
                error
            })
    }
    pub fn finish_delivery(
        &mut self,
        context: &TrustedContext,
        operation: &str,
        live: &HashSet<String>,
    ) -> ToolResult<Option<MutationResult>> {
        self.session
            .external_finish_delivery(context, operation, live)
    }
    pub fn check_delivery(
        &self,
        context: &TrustedContext,
        result: &MutationResult,
    ) -> ToolResult<()> {
        self.session.external_check_result(context, result)
    }
}
#[cfg(test)]
pub(crate) mod tests;
