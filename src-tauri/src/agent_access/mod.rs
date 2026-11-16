//! Host-authenticated, process-local authority. Never deserialized from tool arguments.
//! Credential verification and persistent grants belong to agent_host (not this module).
use crate::application::{ToolError, ToolResult};
use std::{
    collections::BTreeSet,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};

#[derive(Clone)]
pub struct TrustedContext {
    pub(crate) client_id: String,
    pub(crate) grant_id: String,
    pub(crate) workspace_id: String,
    pub(crate) incarnation: String,
    pub(crate) scopes: BTreeSet<String>,
    pub(crate) folder_ids: BTreeSet<String>,
    pub(crate) expires_at: i64,
    pub(crate) revocation: u64,
    generation: Arc<AtomicU64>,
}
#[derive(Clone)]
pub struct Revocation(Arc<AtomicU64>);
impl Revocation {
    pub fn revoke(&self) {
        self.0.fetch_add(1, Ordering::SeqCst);
    }
}
impl TrustedContext {
    /// Called only after the host authenticates a credential and loads its grant.
    /// One revocation handle must be retained by the host for all requests of that grant.
    pub fn from_verified_grant(
        client_id: String,
        grant_id: String,
        workspace_id: String,
        incarnation: String,
        scopes: BTreeSet<String>,
        folder_ids: BTreeSet<String>,
        expires_at: i64,
        revocation: u64,
    ) -> ToolResult<(Self, Revocation)> {
        if [&client_id, &grant_id, &workspace_id, &incarnation]
            .iter()
            .any(|v| v.is_empty() || v.len() > 128 || v.chars().any(char::is_control))
            || folder_ids.len() > 10_000
            || folder_ids.iter().any(|v| !crate::sync::model::valid_id(v))
            || scopes
                .iter()
                .any(|s| !matches!(s.as_str(), "notes:read" | "notes:create" | "notes:update"))
            || expires_at <= crate::application::now()
        {
            return Err(ToolError::new(
                "UNAUTHORIZED",
                "Invalid or expired host grant",
            ));
        }
        let generation = Arc::new(AtomicU64::new(revocation));
        let revoke = Revocation(generation.clone());
        Ok((
            Self {
                client_id,
                grant_id,
                workspace_id,
                incarnation,
                scopes,
                folder_ids,
                expires_at,
                revocation,
                generation,
            },
            revoke,
        ))
    }
    pub(crate) fn check(
        &self,
        workspace: &str,
        incarnation: &str,
        scope: Option<&str>,
    ) -> ToolResult<()> {
        if self.generation.load(Ordering::SeqCst) != self.revocation
            || self.expires_at <= crate::application::now()
        {
            return Err(ToolError::new("UNAUTHORIZED", "Grant expired or revoked"));
        }
        if self.workspace_id != workspace || self.incarnation != incarnation {
            return Err(ToolError::new(
                "WORKSPACE_UNAVAILABLE",
                "Workspace identity changed",
            ));
        }
        if scope.is_some_and(|s| !self.scopes.contains(s)) {
            return Err(ToolError::new("FORBIDDEN", "Tool scope is not granted"));
        }
        Ok(())
    }
}
