//! Target-specific external write reservation. No sync plan, renderer token or fake save intent.
use super::*;
use crate::{agent_access::TrustedContext, application::*};
use std::{
    collections::VecDeque,
    time::{Duration, Instant},
};

pub enum ExternalStart {
    Replay(MutationResult),
    Probe { operation_id: String, event: Value },
}
pub enum ExternalProgress {
    Waiting,
    Event(Value),
    Committed {
        result: MutationResult,
        release: Value,
    },
    Aborted {
        error: ToolError,
        release: Value,
    },
}
#[derive(Clone, Deserialize)]
#[serde(tag = "phase", rename_all = "camelCase", deny_unknown_fields)]
pub enum WindowReply {
    #[serde(rename_all = "camelCase")]
    Probe {
        operation_id: String,
        protected_note_ids: Vec<String>,
        unsaved_note_ids: Vec<String>,
        blocked: bool,
    },
    #[serde(rename_all = "camelCase")]
    Prepare { operation_id: String, ready: bool },
    #[serde(rename_all = "camelCase")]
    Release {
        operation_id: String,
        refreshed: bool,
    },
}
impl WindowReply {
    fn operation(&self) -> &str {
        match self {
            Self::Probe { operation_id, .. }
            | Self::Prepare { operation_id, .. }
            | Self::Release { operation_id, .. } => operation_id,
        }
    }
}
#[derive(Default)]
pub(super) struct ExternalState {
    current: Option<Operation>,
    completed: VecDeque<Terminal>,
}
struct Operation {
    id: String,
    context: TrustedContext,
    command: Mutation,
    participants: HashSet<String>,
    replies: HashSet<String>,
    phase: &'static str,
    started: Instant,
    phase_started: Instant,
    epoch: u64,
    store: Uuid,
    targets: Vec<String>,
    failure: Option<ToolError>,
}
struct Terminal {
    id: String,
    participants: HashSet<String>,
    outcome: &'static str,
    at: Instant,
    refreshed: HashSet<String>,
    refresh_failed: bool,
}
impl Session {
    pub(crate) fn external_has_operation(&self) -> bool {
        self.external.current.is_some()
    }
    fn external_authorize(&self, ctx: &TrustedContext, scope: Option<&str>) -> ToolResult<()> {
        let (workspace, incarnation) = self
            .store
            .application_identity()
            .map_err(ToolError::storage)?;
        ctx.check(&workspace, &incarnation, scope)
    }
    pub(crate) fn external_check_result(
        &self,
        ctx: &TrustedContext,
        result: &MutationResult,
    ) -> ToolResult<()> {
        let (tool, _, grant, stored) = self
            .store
            .application_operation(ctx, None, Some(&result.operation_id))?
            .ok_or_else(ToolError::not_found)?;
        if stored.note_id != result.note_id || stored.committed_version != result.committed_version
        {
            return Err(ToolError::not_found());
        }
        self.external_authorize_operation(ctx, &tool, &grant, result)
    }
    pub(crate) fn external_authorize_operation(
        &self,
        ctx: &TrustedContext,
        tool: &str,
        grant: &str,
        result: &MutationResult,
    ) -> ToolResult<()> {
        let scope = match tool {
            "notes_create" => "notes:create",
            "notes_append" | "notes_update" => "notes:update",
            _ => return Err(ToolError::not_found()),
        };
        self.external_authorize(ctx, Some(scope))?;
        if ctx.grant_id != grant {
            return Err(ToolError::not_found());
        }
        self.store.application_note(ctx, &result.note_id)?;
        self.external_authorize(ctx, Some(scope))
    }
    pub(crate) fn external_pending_for(&self, ctx: &TrustedContext, id: &str) -> ToolResult<bool> {
        let Some(q) = self.external.current.as_ref().filter(|q| {
            q.id == id && q.context.client_id == ctx.client_id && q.context.grant_id == ctx.grant_id
        }) else {
            return Ok(false);
        };
        self.external_authorize(ctx, Some(q.command.scope()))?;
        if let Some(note) = q.command.note_id() {
            self.store.application_note(ctx, note)?;
        }
        if let Mutation::Create { folder_id, .. } = &q.command {
            if !ctx.folder_ids.contains(folder_id) {
                return Err(ToolError::not_found());
            }
        }
        Ok(true)
    }
    pub(crate) fn external_begin(
        &mut self,
        ctx: &TrustedContext,
        command: Mutation,
        participants: HashSet<String>,
    ) -> ToolResult<ExternalStart> {
        self.external_authorize(ctx, Some(command.scope()))?;
        let digest = hash(&serde_json::to_value(&command).map_err(ToolError::storage)?)?;
        if let Some((tool, parameters, grant, result)) =
            self.store
                .application_operation(ctx, Some(command.key()), None)?
        {
            self.external_authorize_operation(ctx, &tool, &grant, &result)?;
            if parameters != digest {
                return Err(ToolError::new(
                    "IDEMPOTENCY_CONFLICT",
                    "Key was already used for different arguments",
                ));
            }
            return Ok(ExternalStart::Replay(result));
        }
        if self.external_has_operation() || self.sync_has_operation() || self.pending.is_some() {
            return Err(ToolError::new(
                "BARRIER_BUSY",
                "Another document operation holds the reservation",
            ));
        }
        if participants.is_empty() {
            return Err(ToolError::new(
                "HOST_UNAVAILABLE",
                "No document window is available to coordinate the write",
            ));
        }
        let targets = if let Some(id) = command.note_id() {
            let note = self.store.application_note(ctx, id)?;
            let version = self.store.application_version(&note)?;
            if command.expected() != Some(version.as_str()) {
                return Err(ToolError::conflict(version));
            }
            if self.intents.values().any(|i| i.note == id) {
                return Err(ToolError::new(
                    "NOTE_BUSY",
                    "Target has an outstanding save intent",
                ));
            }
            vec![id.into()]
        } else {
            if let Mutation::Create { folder_id, .. } = &command {
                if !ctx.folder_ids.contains(folder_id) {
                    return Err(ToolError::not_found());
                }
                let folder = self
                    .store
                    .application_folders()
                    .map_err(ToolError::storage)?
                    .into_iter()
                    .find(|f| f.id == *folder_id)
                    .ok_or_else(ToolError::not_found)?;
                if !matches!(folder.kind.as_str(), "default" | "quick" | "normal") {
                    return Err(ToolError::new(
                        "SCHEMA_INVALID",
                        "Create requires a live physical folder",
                    ));
                }
            }
            vec![]
        };
        let id = Uuid::new_v4().to_string();
        let time = Instant::now();
        let event = json!({"phase":"probe","operationId":id,"sessionId":self.id,"noteIds":targets});
        self.external.current = Some(Operation {
            id: id.clone(),
            context: ctx.clone(),
            command,
            participants,
            replies: HashSet::new(),
            phase: "probe",
            started: time,
            phase_started: time,
            epoch: self.epoch,
            store: self.store.sync_store_instance(),
            targets,
            failure: None,
        });
        Ok(ExternalStart::Probe {
            operation_id: id,
            event,
        })
    }
    pub(crate) fn external_reply(
        &mut self,
        window: &str,
        reply: WindowReply,
        expected: &Token,
        live: &HashSet<String>,
    ) -> ToolResult<Value> {
        self.check(expected, None)
            .map_err(|_| ToolError::new("UNAUTHORIZED", "Window authority changed"))?;
        if !live.contains(window) {
            return Err(ToolError::new(
                "UNAUTHORIZED",
                "Reply must come from a live document window",
            ));
        }
        let id = reply.operation().to_owned();
        if let Some(t) = self
            .external
            .completed
            .iter_mut()
            .find(|t| t.id == id && t.at.elapsed() < Duration::from_secs(300))
        {
            if !t.participants.contains(window) {
                return Err(ToolError::new("UNAUTHORIZED", "Window did not participate"));
            }
            if let WindowReply::Release { refreshed, .. } = reply {
                if t.outcome == "commit" {
                    t.refreshed.insert(window.into());
                    t.refresh_failed |= !refreshed;
                    if !refreshed {
                        self.store
                            .application_warning(&id, "WINDOW_REFRESH_REQUIRED")?;
                    }
                }
            }
            return Ok(json!({"operationId":id,"outcome":t.outcome}));
        }
        let q = self
            .external
            .current
            .as_mut()
            .filter(|q| q.id == id && q.participants.contains(window))
            .ok_or_else(|| ToolError::new("UNAUTHORIZED", "Unknown operation or participant"))?;
        if q.epoch != expected.epoch
            || q.participants != *live
            || q.started.elapsed() >= Duration::from_secs(15)
            || q.phase_started.elapsed() >= Duration::from_secs(5)
        {
            q.failure = Some(ToolError::new(
                "BARRIER_BUSY",
                "Window set, authority or deadline changed",
            ));
        }
        match reply {
            WindowReply::Probe {
                protected_note_ids,
                unsaved_note_ids,
                blocked,
                ..
            } if q.phase == "probe" => {
                if protected_note_ids.len() > 10_000
                    || unsaved_note_ids.len() > 10_000
                    || protected_note_ids
                        .iter()
                        .chain(&unsaved_note_ids)
                        .any(|id| !crate::sync::model::valid_id(id))
                {
                    q.failure = Some(ToolError::new(
                        "SCHEMA_INVALID",
                        "Invalid protected target set",
                    ));
                } else if blocked
                    || q.targets
                        .iter()
                        .any(|id| protected_note_ids.contains(id) || unsaved_note_ids.contains(id))
                {
                    q.failure = Some(ToolError::new(
                        "NOTE_BUSY",
                        "Target is active, unsaved or protected",
                    ));
                }
                if !q.replies.insert(window.into()) {
                    return Err(ToolError::new("SCHEMA_INVALID", "Duplicate probe reply"));
                }
            }
            WindowReply::Prepare { ready, .. } if q.phase == "prepare" => {
                if !ready {
                    q.failure = Some(ToolError::new("NOTE_BUSY", "Window cancelled preparation"));
                } else if !q.replies.insert(window.into()) {
                    return Err(ToolError::new("SCHEMA_INVALID", "Duplicate prepare reply"));
                }
            }
            _ => return Err(ToolError::new("SCHEMA_INVALID", "Reply phase is invalid")),
        }
        // Cancellation terminalizes under the same short gate as commit. Its
        // caller may unfreeze after this receipt; tick will only emit release.
        Ok(json!({"operationId":q.id,"outcome":if q.failure.is_some() {"abort"} else {"pending"}}))
    }
    fn external_release(&mut self, outcome: &'static str) -> Value {
        let q = self.external.current.take().unwrap();
        let event = json!({"phase":"release","operationId":q.id,"sessionId":self.id,"noteIds":q.targets,"outcome":outcome});
        self.external.completed.push_back(Terminal {
            id: q.id,
            participants: q.participants,
            outcome,
            at: Instant::now(),
            refreshed: HashSet::new(),
            refresh_failed: false,
        });
        while self.external.completed.len() > 64 {
            self.external.completed.pop_front();
        }
        event
    }
    pub(crate) fn external_finish_delivery(
        &mut self,
        ctx: &TrustedContext,
        operation: &str,
        live: &HashSet<String>,
    ) -> ToolResult<Option<MutationResult>> {
        self.external_authorize(ctx, None)?;
        let (tool, _, grant, mut result) = self
            .store
            .application_operation(ctx, None, Some(operation))?
            .ok_or_else(ToolError::not_found)?;
        self.external_authorize_operation(ctx, &tool, &grant, &result)?;
        let t = self
            .external
            .completed
            .iter()
            .find(|t| t.id == operation && t.outcome == "commit")
            .ok_or_else(ToolError::not_found)?;
        let failed =
            t.refresh_failed || t.participants != *live || t.at.elapsed() >= Duration::from_secs(5);
        if !failed && t.refreshed != t.participants {
            return Ok(None);
        }
        if failed {
            if !result
                .warnings
                .iter()
                .any(|w| w == "WINDOW_REFRESH_REQUIRED")
            {
                result.warnings.push("WINDOW_REFRESH_REQUIRED".into());
            }
            if self
                .store
                .application_warning(operation, "WINDOW_REFRESH_REQUIRED")
                .is_err()
            {
                result.warnings.push("WARNING_PERSIST_FAILED".into());
            }
        }
        self.external_authorize_operation(ctx, &tool, &grant, &result)?;
        Ok(Some(result))
    }
    pub(crate) fn external_abort(&mut self, operation: &str) -> ToolResult<Value> {
        if self
            .external
            .current
            .as_ref()
            .is_none_or(|q| q.id != operation)
        {
            return Err(ToolError::not_found());
        }
        Ok(self.external_release("abort"))
    }
    pub(crate) fn external_tick(
        &mut self,
        operation: &str,
        live: &HashSet<String>,
    ) -> ExternalProgress {
        let Some(q) = self.external.current.as_ref().filter(|q| q.id == operation) else {
            return ExternalProgress::Aborted {
                error: ToolError::not_found(),
                release: Value::Null,
            };
        };
        let checked = (|| -> ToolResult<()> {
            self.external_authorize(&q.context, Some(q.command.scope()))?;
            if q.epoch != self.epoch
                || q.store != self.store.sync_store_instance()
                || self.pending.is_some()
                || self.sync_has_operation()
                || q.participants != *live
            {
                return Err(ToolError::new(
                    "BARRIER_BUSY",
                    "Document reservation changed",
                ));
            }
            if let Some(target) = q.command.note_id() {
                let note = self.store.application_note(&q.context, target)?;
                let version = self.store.application_version(&note)?;
                if q.command.expected() != Some(version.as_str()) {
                    return Err(ToolError::conflict(version));
                }
            }
            if let Some(failure) = &q.failure {
                return Err(failure.clone());
            }
            if q.started.elapsed() >= Duration::from_secs(15)
                || q.phase_started.elapsed() >= Duration::from_secs(5)
            {
                return Err(ToolError::new(
                    "TIMEOUT",
                    "Window coordination deadline exceeded",
                ));
            }
            if self.intents.values().any(|i| q.targets.contains(&i.note)) {
                return Err(ToolError::new(
                    "NOTE_BUSY",
                    "Target has an uncommitted save intent",
                ));
            }
            Ok(())
        })();
        if let Err(mut error) = checked {
            error.operation_id = Some(operation.into());
            error.committed = Some(false);
            return ExternalProgress::Aborted {
                error,
                release: self.external_release("abort"),
            };
        }
        let q = self.external.current.as_mut().unwrap();
        if q.replies != q.participants {
            return ExternalProgress::Waiting;
        }
        if q.phase == "probe" {
            q.phase = "prepare";
            q.replies.clear();
            q.phase_started = Instant::now();
            return ExternalProgress::Event(
                json!({"phase":"prepare","operationId":q.id,"sessionId":self.id,"noteIds":q.targets}),
            );
        }
        let ctx = q.context.clone();
        let command = q.command.clone();
        if let Err(e) = self.prepare_metadata(true) {
            return ExternalProgress::Aborted {
                error: ToolError::storage(e),
                release: self.external_release("abort"),
            };
        }
        let (result, receipt) = self
            .store
            .capture_commit(|store| Ok(store.application_commit(&ctx, &command, operation)));
        let result = result.expect("capture closure returns its typed ToolResult");
        if receipt.committed() {
            self.metadata_sequence += 1;
            self.last_commit = Some(json!({"metadata":self.metadata(),"receipt":receipt}));
            self.metadata_event =
                Some(json!({"metadata":self.metadata(),"changes":receipt.changes}));
        }
        match result {
            Ok(result) => ExternalProgress::Committed {
                result,
                release: self.external_release("commit"),
            },
            Err(mut error) => {
                error.operation_id = Some(operation.into());
                error.committed = Some(false);
                ExternalProgress::Aborted {
                    error,
                    release: self.external_release("abort"),
                }
            }
        }
    }
    /// Existing window writes may drain during probe/prepare. Once a window
    /// ACKs prepare, a later save/attachment from it cancels the reservation.
    /// The write keeps its original intent/receipt; external CAS then rejects.
    pub(super) fn external_local_write(&mut self, note: &str) {
        if let Some(q) = self.external.current.as_mut() {
            if q.targets.iter().any(|id| id == note) {
                q.failure = Some(ToolError::new(
                    "NOTE_BUSY",
                    "Target changed during coordination",
                ));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn probe_prepare_deadlines_and_release_ack_timeout_are_bounded_without_sleeping() {
        let (_, mut s, c, _) = crate::application::tests::setup();
        for phase in ["probe", "prepare"] {
            let command=Mutation::parse("notes_create",json!({"folderId":"default","format":"text","content":"timeout","idempotencyKey":Uuid::new_v4().to_string()})).unwrap();
            let participants = HashSet::from(["main".into()]);
            let id = match s.external_begin(&c, command, participants.clone()).unwrap() {
                ExternalStart::Probe { operation_id, .. } => operation_id,
                _ => panic!(),
            };
            let q = s.external.current.as_mut().unwrap();
            q.phase = phase;
            q.phase_started = Instant::now() - Duration::from_secs(6);
            match s.external_tick(&id, &participants) {
                ExternalProgress::Aborted { error, release } => {
                    assert_eq!(error.code, "TIMEOUT");
                    assert_eq!(release["outcome"], "abort");
                }
                _ => panic!(),
            };
            assert!(s.store.notes().unwrap().is_empty());
        }
    }
}
