//! Local quiet barrier. This state is deliberately separate from access Pending:
//! probe/prepare never suspend authorization or block the final registered save.
use super::*;
use crate::sync::model::{EntityKind, SyncApplyPlan};
use std::{
    collections::VecDeque,
    time::{Duration, Instant},
};
#[derive(Clone, Deserialize)]
#[serde(tag = "phase", rename_all = "camelCase", deny_unknown_fields)]
pub(crate) enum WindowReply {
    #[serde(rename_all = "camelCase")]
    Probe {
        operation_id: String,
        protected_note_ids: Vec<String>,
        blocked: bool,
    },
    #[serde(rename_all = "camelCase")]
    Prepare { operation_id: String, ready: bool },
}
impl WindowReply {
    fn operation(&self) -> &str {
        match self {
            Self::Probe { operation_id, .. } | Self::Prepare { operation_id, .. } => operation_id,
        }
    }
}
#[derive(Clone)]
pub(crate) struct Resolution {
    pub kind: EntityKind,
    pub entity_id: String,
    pub digest: String,
    pub keep_all: bool,
}
/// Process-local diagnostics only: never persisted or used by the sync gate.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AbortReason {
    AuthorityChanged,
    ParticipantChanged,
    PendingBarrier,
    Timeout,
    ProbeBlocked,
    PrepareNotReady,
    ProtectedTarget,
    NoEligiblePlan,
    LocalIntent,
    PlanChanged,
    PlanStale,
    PrepareMetadataError,
    ApplyError,
    EvaluationError,
    MediaPrepareError,
    MediaAuthorityChanged,
    MediaInstallError,
    EmitError,
    ExternalAbort,
}
impl AbortReason {
    const ALL: [Self; 19] = [
        Self::AuthorityChanged,
        Self::ParticipantChanged,
        Self::PendingBarrier,
        Self::Timeout,
        Self::ProbeBlocked,
        Self::PrepareNotReady,
        Self::ProtectedTarget,
        Self::NoEligiblePlan,
        Self::LocalIntent,
        Self::PlanChanged,
        Self::PlanStale,
        Self::PrepareMetadataError,
        Self::ApplyError,
        Self::EvaluationError,
        Self::MediaPrepareError,
        Self::MediaAuthorityChanged,
        Self::MediaInstallError,
        Self::EmitError,
        Self::ExternalAbort,
    ];
}
/// Fixed, non-sensitive categories; the original AppError is never modified.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd, Serialize)]
#[serde(rename_all = "camelCase")]
enum ApplyError {
    DatabaseForeignKey,
    DatabaseUnique,
    DatabaseNotNull,
    DatabaseCheck,
    DatabaseTrigger,
    DatabaseReadonly,
    DatabaseBusy,
    DatabaseLocked,
    DatabaseNoSuchTable,
    DatabaseNoSuchColumn,
    DatabaseNoSuchFunction,
    DatabaseSyntax,
    DatabaseFull,
    DatabaseIo,
    DatabaseOther,
    Filesystem,
    Document,
    SyncInvalid,
    SyncLimit,
    SyncPendingFlush,
    SyncMissingBlob,
    SyncBlobCorrupt,
    SyncMediaPublish,
    SyncEquivocation,
    SyncDisabled,
    SyncWorkspaceMismatch,
    SyncAttachmentConflict,
    NotFound,
    Other,
}
impl ApplyError {
    const ALL: [Self; 29] = [
        Self::DatabaseForeignKey,
        Self::DatabaseUnique,
        Self::DatabaseNotNull,
        Self::DatabaseCheck,
        Self::DatabaseTrigger,
        Self::DatabaseReadonly,
        Self::DatabaseBusy,
        Self::DatabaseLocked,
        Self::DatabaseNoSuchTable,
        Self::DatabaseNoSuchColumn,
        Self::DatabaseNoSuchFunction,
        Self::DatabaseSyntax,
        Self::DatabaseFull,
        Self::DatabaseIo,
        Self::DatabaseOther,
        Self::Filesystem,
        Self::Document,
        Self::SyncInvalid,
        Self::SyncLimit,
        Self::SyncPendingFlush,
        Self::SyncMissingBlob,
        Self::SyncBlobCorrupt,
        Self::SyncMediaPublish,
        Self::SyncEquivocation,
        Self::SyncDisabled,
        Self::SyncWorkspaceMismatch,
        Self::SyncAttachmentConflict,
        Self::NotFound,
        Self::Other,
    ];
    fn classify(error: &crate::store::AppError) -> Self {
        match error.code.as_str() {
            "database" => Self::sqlite(&error.message),
            "filesystem" => Self::Filesystem,
            "document" => Self::Document,
            "sync_invalid" => Self::SyncInvalid,
            "sync_limit" => Self::SyncLimit,
            "sync_pending_flush" => Self::SyncPendingFlush,
            "sync_missing_blob" => Self::SyncMissingBlob,
            "sync_blob_corrupt" => Self::SyncBlobCorrupt,
            "sync_media_publish" => Self::SyncMediaPublish,
            "sync_equivocation" => Self::SyncEquivocation,
            "sync_disabled" => Self::SyncDisabled,
            "sync_workspace_mismatch" => Self::SyncWorkspaceMismatch,
            "sync_attachment_conflict" => Self::SyncAttachmentConflict,
            "not_found" => Self::NotFound,
            _ => Self::Other,
        }
    }
    fn sqlite(message: &str) -> Self {
        // SQLite detail strings can contain names/content. Inspect at most 4096
        // bytes with fixed recognizers, retain no string or captured segment.
        if message.len() > 4096 {
            return Self::DatabaseOther;
        }
        match message {
            "FOREIGN KEY constraint failed" => Self::DatabaseForeignKey,
            "too many levels of trigger recursion" => Self::DatabaseTrigger,
            "attempt to write a readonly database" => Self::DatabaseReadonly,
            "database is locked" => Self::DatabaseBusy,
            "database table is locked" | "database schema is locked" => Self::DatabaseLocked,
            "database or disk is full" => Self::DatabaseFull,
            "disk I/O error" => Self::DatabaseIo,
            _ if message.starts_with("UNIQUE constraint failed: ") => Self::DatabaseUnique,
            _ if message.starts_with("NOT NULL constraint failed: ") => Self::DatabaseNotNull,
            _ if message.starts_with("CHECK constraint failed: ") => Self::DatabaseCheck,
            _ if message.starts_with("database table is locked: ")
                || message.starts_with("database schema is locked: ") =>
            {
                Self::DatabaseLocked
            }
            _ if message.starts_with("no such table: ") => Self::DatabaseNoSuchTable,
            _ if message.starts_with("no such column: ") => Self::DatabaseNoSuchColumn,
            _ if message.starts_with("no such function: ") => Self::DatabaseNoSuchFunction,
            _ if message.starts_with("near ") && message.ends_with(": syntax error") => {
                Self::DatabaseSyntax
            }
            _ => Self::DatabaseOther,
        }
    }
}
#[derive(Default)]
struct DiagnosticCounts {
    commits: u64,
    aborts: u64,
    latest_abort_reason: Option<AbortReason>,
    reasons: [u64; 19],
    latest_apply_error: Option<ApplyError>,
    apply_errors: [u64; ApplyError::ALL.len()],
}
#[derive(Default)]
pub(super) struct QuietState {
    current: Option<Quiet>,
    completed: VecDeque<Terminal>,
    retry_after: Option<Instant>,
    diagnostics: DiagnosticCounts,
    #[cfg(test)]
    clock: Option<Instant>,
}
struct Terminal {
    id: String,
    participants: HashSet<String>,
    outcome: &'static str,
    authority: Token,
    store_instance: Uuid,
    adoption_timeout: Option<AdoptionStage>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AdoptionStage {
    Probe,
    Prepare,
    Media,
}
impl AdoptionStage {
    fn timeout(self) -> AppError {
        let code = match self {
            Self::Probe => "sync_adoption_probe_timeout",
            Self::Prepare => "sync_adoption_prepare_timeout",
            Self::Media => "sync_adoption_media_timeout",
        };
        AppError {
            code: code.into(),
            ..adoption_blocked()
        }
    }
}
struct Quiet {
    store_instance: Uuid,
    id: String,
    epoch: u64,
    participants: HashSet<String>,
    replies: HashSet<String>,
    protected: HashSet<String>,
    phase: &'static str,
    aborted: bool,
    abort_reason: Option<AbortReason>,
    apply_error: Option<ApplyError>,
    started: Instant,
    plan: Option<SyncApplyPlan>,
    resolution: Option<Resolution>,
    adoption: Option<WorkspaceAdoption>,
    local_recovery: bool,
}
struct WorkspaceAdoption {
    workspace: String,
    device: String,
    targets: HashSet<String>,
}
impl Quiet {
    fn adoption_stage(&self) -> Option<AdoptionStage> {
        self.adoption.as_ref()?;
        match self.phase {
            "probe" => Some(AdoptionStage::Probe),
            "prepare" => Some(AdoptionStage::Prepare),
            "adoptionMedia" => Some(AdoptionStage::Media),
            _ => None,
        }
    }
    fn expired(&self, now: Instant) -> bool {
        let seconds = if self.adoption_stage() == Some(AdoptionStage::Media) {
            60
        } else {
            5
        };
        now.saturating_duration_since(self.started) >= Duration::from_secs(seconds)
    }
}
fn adoption_blocked() -> AppError {
    AppError {
        code: "sync_adoption_blocked".into(),
        message: "同步空间切换的保存屏障未完成或已失效，请完成本地操作后重试".into(),
        commit: None,
    }
}
impl Session {
    fn sync_now(&self) -> Instant {
        #[cfg(test)]
        if let Some(now) = self.quiet.clock {
            return now;
        }
        Instant::now()
    }
    #[cfg(test)]
    pub(crate) fn sync_advance_clock(&mut self, elapsed: Duration) {
        self.quiet.clock = Some(self.sync_now() + elapsed);
    }
    pub(crate) fn sync_has_workspace_adoption(&self) -> bool {
        self.quiet
            .current
            .as_ref()
            .is_some_and(|q| q.adoption.is_some())
    }
    /// The adopting caller can advance its own barrier while an older ordinary
    /// coordinator snapshot is still verifying outside Session. No old apply
    /// plan/media is needed, and a replacement operation is never advanced.
    pub(crate) fn sync_tick_workspace_adoption(
        &mut self,
        operation: &str,
        live: &HashSet<String>,
    ) -> Result<Option<Value>> {
        if !self
            .quiet
            .current
            .as_ref()
            .is_some_and(|q| q.id == operation && q.adoption.is_some())
        {
            return Ok(None);
        }
        Ok(self.sync_tick(live)?.map(|(event, access)| {
            debug_assert!(access.is_none());
            event
        }))
    }
    /// Retain a finite timeout even if the coordinator has already released
    /// this operation. Never borrow a newer operation's failure or deadline.
    pub(crate) fn sync_workspace_adoption_error(&self, operation: &str) -> AppError {
        self.sync_workspace_adoption_timeout_error(operation)
            .unwrap_or_else(adoption_blocked)
    }
    pub(crate) fn sync_workspace_adoption_timeout_error(
        &self,
        operation: &str,
    ) -> Option<AppError> {
        let stage = self
            .quiet
            .completed
            .iter()
            .find(|t| t.id == operation)
            .and_then(|t| t.adoption_timeout)
            .or_else(|| {
                self.quiet
                    .current
                    .as_ref()
                    .filter(|q| q.id == operation)
                    .filter(|q| {
                        q.abort_reason == Some(AbortReason::Timeout)
                            || (!q.aborted && q.expired(self.sync_now()))
                    })
                    .and_then(Quiet::adoption_stage)
            });
        stage.map(AdoptionStage::timeout)
    }
    /// Explicit recovery of this Store's existing workspace, through the same
    /// renderer and final-plan gates. Never adopts or imports another workspace.
    pub(crate) fn sync_begin_local_recovery(&mut self, live: HashSet<String>) -> Result<Value> {
        let event = self.sync_begin(live, None)?;
        self.quiet.current.as_mut().unwrap().local_recovery = true;
        Ok(event)
    }
    /// Use the existing renderer freeze/flush/ACK protocol without projecting
    /// any old remote version. The coordinator only advances this purpose to
    /// prepare; the adopting caller alone may commit and release it.
    pub(crate) fn sync_begin_workspace_adoption(
        &mut self,
        workspace: &str,
        device: &str,
        live: HashSet<String>,
    ) -> Result<Value> {
        self.sync_adoption_preflight(workspace, device)?;
        let event = self
            .sync_begin(live, None)
            .map_err(|_| adoption_blocked())?;
        self.quiet.current.as_mut().unwrap().adoption = Some(WorkspaceAdoption {
            workspace: workspace.into(),
            device: device.into(),
            targets: HashSet::new(),
        });
        Ok(event)
    }

    /// Read-only and repeatable both before media preparation and under the
    /// final Session lock immediately before Store adoption. ACKs alone never
    /// authorize a new participant, note, Store instance or expired operation.
    pub(crate) fn sync_workspace_adoption_ready(
        &self,
        operation: &str,
        workspace: &str,
        device: &str,
        live: &HashSet<String>,
    ) -> Result<bool> {
        self.sync_adoption_ready_for(operation, workspace, device, live, "prepare")
    }

    /// Enter exactly once, after all prepare ACKs have linearized. The media
    /// event may reach a renderer before its final ACK's IPC response.
    pub(crate) fn sync_begin_workspace_adoption_media(
        &mut self,
        operation: &str,
        workspace: &str,
        device: &str,
        live: &HashSet<String>,
    ) -> Result<Value> {
        if !self.sync_workspace_adoption_ready(operation, workspace, device, live)? {
            return Err(self.sync_workspace_adoption_error(operation));
        }
        let now = self.sync_now();
        let q = self.quiet.current.as_mut().unwrap();
        q.phase = "adoptionMedia";
        q.started = now;
        Ok(json!({"phase":"adoptionMedia", "operationId":operation, "sessionId":self.id}))
    }

    pub(crate) fn sync_workspace_adoption_commit_ready(
        &self,
        operation: &str,
        workspace: &str,
        device: &str,
        live: &HashSet<String>,
    ) -> Result<bool> {
        self.sync_adoption_ready_for(operation, workspace, device, live, "adoptionMedia")
    }

    fn sync_adoption_ready_for(
        &self,
        operation: &str,
        workspace: &str,
        device: &str,
        live: &HashSet<String>,
        phase: &str,
    ) -> Result<bool> {
        let failure = || self.sync_workspace_adoption_error(operation);
        let q = self
            .quiet
            .current
            .as_ref()
            .filter(|q| q.id == operation)
            .ok_or_else(failure)?;
        let adoption = q.adoption.as_ref().ok_or_else(failure)?;
        if adoption.workspace != workspace
            || adoption.device != device
            || q.store_instance != self.store.sync_store_instance()
            || q.epoch != self.epoch
            || q.participants != *live
            || q.aborted
            || self.pending.is_some()
            || q.expired(self.sync_now())
        {
            return Err(failure());
        }
        if q.phase != phase || q.replies != q.participants {
            return Ok(false);
        }
        let notes: HashSet<_> = self.store.notes()?.into_iter().map(|n| n.id).collect();
        if !self.intents.is_empty() || !q.protected.is_empty() || notes != adoption.targets {
            return Err(adoption_blocked());
        }
        self.store.sync_adoption_preflight(workspace, device)?;
        // Store inspection is read-only but can itself consume the remaining
        // budget. Never admit a transaction on a lease that expired in it.
        if q.expired(self.sync_now()) {
            return Err(failure());
        }
        Ok(true)
    }

    /// Preserve the local editor Session; only release the protocol freeze. A coordinator
    /// abort may already have released this exact operation; cleanup is then a
    /// no-op and cannot retire a replacement operation.
    pub(crate) fn sync_release_workspace_adoption(
        &mut self,
        operation: &str,
        committed: bool,
    ) -> Result<Option<Value>> {
        let Some(q) = self.quiet.current.as_ref() else {
            return Ok(None);
        };
        if q.id != operation {
            if self.quiet.completed.iter().any(|t| t.id == operation) {
                return Ok(None);
            }
            return Err(adoption_blocked());
        }
        if q.adoption.is_none()
            || (committed
                && (q.phase != "adoptionMedia"
                    || q.replies != q.participants
                    || q.aborted
                    || q.store_instance == self.store.sync_store_instance()))
        {
            return Err(adoption_blocked());
        }
        if !committed {
            let reason = if !q.aborted && q.expired(self.sync_now()) {
                AbortReason::Timeout
            } else {
                AbortReason::ExternalAbort
            };
            self.sync_note_abort_reason(reason);
        }
        self.sync_release(if committed { "commit" } else { "abort" }, None)
            .map(|(event, _)| Some(event))
    }

    /// Caller must keep this Session lock across the final preflight, Store
    /// adoption and finish call. Local unsaved/quiet work cannot cross accounts.
    pub(crate) fn sync_adoption_preflight(&self, workspace: &str, device_id: &str) -> Result<()> {
        let same = self.store.sync_identity()?.is_some_and(|identity| {
            identity.workspace_id == workspace && identity.device_id == device_id
        });
        if !same
            && (self.pending.is_some()
                || !self.intents.is_empty()
                || self.quiet.current.is_some()
                || self.external_has_operation())
        {
            return Err(crate::store::AppError {
                code: "sync_adoption_blocked".into(),
                message: "本机仍有未完成的保存或同步屏障，请先完成后再开启新账户同步".into(),
                commit: None,
            });
        }
        self.store.sync_adoption_preflight(workspace, device_id)
    }

    pub(crate) fn sync_media_token(&self) -> Token {
        Token {
            session_id: self.id.clone(),
            epoch: self.epoch,
            note_epoch: None,
        }
    }
    pub(crate) fn sync_media_keep_all(&self) -> Option<&str> {
        self.quiet
            .current
            .as_ref()
            .and_then(|q| q.resolution.as_ref())
            .filter(|r| r.keep_all && r.kind == EntityKind::Note)
            .map(|r| r.entity_id.as_str())
    }
    pub(crate) fn sync_has_operation(&self) -> bool {
        self.quiet.current.is_some()
    }
    pub(crate) fn sync_session_id(&self) -> &str {
        &self.id
    }
    pub(crate) fn sync_check_window(
        &self,
        window: &str,
        live: &HashSet<String>,
        expected: &Token,
    ) -> Result<()> {
        if !live.contains(window) {
            return Err(denied("同步请求不属于文档窗口"));
        }
        self.check(expected, None)
    }
    pub(crate) fn sync_begin(
        &mut self,
        participants: HashSet<String>,
        resolution: Option<Resolution>,
    ) -> Result<Value> {
        if self.quiet.current.is_some()
            || self.external_has_operation()
            || self.pending.is_some()
            || participants.is_empty()
            || (resolution.is_none() && self.quiet.retry_after.is_some_and(|t| t > self.sync_now()))
        {
            return Err(denied("同步正在等待安全应用时机"));
        }
        let id = Uuid::new_v4().to_string();
        self.quiet.current = Some(Quiet {
            store_instance: self.store.sync_store_instance(),
            id: id.clone(),
            epoch: self.epoch,
            participants,
            replies: HashSet::new(),
            protected: HashSet::new(),
            phase: "probe",
            aborted: false,
            abort_reason: None,
            apply_error: None,
            started: self.sync_now(),
            plan: None,
            resolution,
            adoption: None,
            local_recovery: false,
        });
        Ok(json!({"phase":"probe","operationId":id,"sessionId":self.id}))
    }
    pub(crate) fn sync_reply(
        &mut self,
        window: &str,
        reply: WindowReply,
        expected: &Token,
    ) -> Result<Value> {
        self.check(expected, None)?;
        let id = reply.operation();
        if let Some(t) = self.quiet.completed.iter().find(|t| t.id == id) {
            if !t.participants.contains(window) {
                return Err(denied("同步参与窗口无效"));
            }
            return Ok(json!({"operationId":id,"outcome":t.outcome}));
        }
        let q = self
            .quiet
            .current
            .as_mut()
            .ok_or_else(|| denied("同步操作已结束"))?;
        if q.id != id || !q.participants.contains(window) {
            return Err(denied("同步操作或参与窗口无效"));
        }
        if q.epoch != expected.epoch {
            q.aborted = true;
            q.abort_reason.get_or_insert(AbortReason::AuthorityChanged);
            return Err(denied("同步授权已变化"));
        }
        match reply {
            WindowReply::Probe {
                protected_note_ids,
                blocked,
                ..
            } if q.phase == "probe" => {
                if protected_note_ids.len() > 10_000
                    || protected_note_ids
                        .iter()
                        .any(|id| !crate::sync::model::valid_id(id))
                {
                    q.aborted = true;
                    q.abort_reason.get_or_insert(AbortReason::EvaluationError);
                    return Err(denied("同步保护集合无效"));
                }
                if !q.replies.insert(window.into()) {
                    return Err(denied("重复的同步探测回复"));
                }
                q.protected.extend(protected_note_ids);
                q.aborted |= blocked;
                if blocked {
                    q.abort_reason.get_or_insert(AbortReason::ProbeBlocked);
                }
            }
            WindowReply::Prepare { ready, .. }
                if q.phase == "prepare" || (q.phase == "adoptionMedia" && !ready) =>
            {
                // A participant may cancel after its ready ACK. The same Session
                // gate linearizes this cancellation against the Store commit.
                if ready && !q.replies.insert(window.into()) {
                    return Err(denied("重复的同步准备回复"));
                }
                if !ready {
                    q.aborted = true;
                    q.abort_reason.get_or_insert(AbortReason::PrepareNotReady);
                }
            }
            _ => return Err(denied("同步回复阶段无效")),
        }
        Ok(json!({"operationId":q.id,"outcome":if q.aborted {"abort"} else {"pending"}}))
    }
    pub(crate) fn sync_terminal_outcome(&self, id: &str) -> Option<&'static str> {
        self.quiet
            .completed
            .iter()
            .find(|t| t.id == id)
            .map(|t| t.outcome)
    }
    pub(crate) fn sync_check_committed_resolution(
        &self,
        operation: &str,
        original_session: &str,
        window: &str,
        live: &HashSet<String>,
    ) -> Result<()> {
        let terminal = self
            .quiet
            .completed
            .iter()
            .find(|t| t.id == operation)
            .ok_or_else(|| denied("同步操作已结束"))?;
        if self.id != original_session
            || terminal.outcome != "commit"
            || terminal.store_instance != self.store.sync_store_instance()
            || !terminal.participants.contains(window)
        {
            return Err(denied("同步操作所属会话已改变"));
        }
        // Only this operation's committed epoch is accepted. A later access
        // change, Store replacement or closed caller still rejects the read.
        self.sync_check_window(window, live, &terminal.authority)
    }
    pub(crate) fn sync_abort(&mut self) {
        self.sync_abort_reason(AbortReason::ExternalAbort);
    }
    pub(crate) fn sync_abort_reason(&mut self, reason: AbortReason) {
        if let Some(q) = &mut self.quiet.current {
            q.aborted = true;
            q.abort_reason.get_or_insert(reason);
        }
    }
    fn sync_note_apply_error(&mut self, error: &crate::store::AppError) {
        if let Some(q) = &mut self.quiet.current {
            q.apply_error
                .get_or_insert_with(|| ApplyError::classify(error));
        }
    }
    fn sync_note_abort_reason(&mut self, reason: AbortReason) {
        if let Some(q) = &mut self.quiet.current {
            q.abort_reason.get_or_insert(reason);
        }
    }
    fn sync_release_abort(&mut self, reason: AbortReason) -> Result<(Value, Option<Value>)> {
        self.sync_note_abort_reason(reason);
        self.sync_release("abort", None)
    }
    pub(crate) fn sync_diagnostics(&self) -> Value {
        let d = &self.quiet.diagnostics;
        let reasons: BTreeMap<_, _> = AbortReason::ALL
            .into_iter()
            .map(|reason| (reason, d.reasons[reason as usize]))
            .collect();
        let apply_errors: BTreeMap<_, _> = ApplyError::ALL
            .into_iter()
            .map(|category| (category, d.apply_errors[category as usize]))
            .collect();
        json!({"version":2,"commits":d.commits,"aborts":d.aborts,
            "latestAbortReason":d.latest_abort_reason,"abortReasons":reasons,
            "activePhase":self.quiet.current.as_ref().map(|q|q.phase),
            "latestApplyError":d.latest_apply_error,"applyErrors":apply_errors})
    }
    pub(crate) fn sync_tick(
        &mut self,
        live: &HashSet<String>,
    ) -> Result<Option<(Value, Option<Value>)>> {
        let Some(q) = self.quiet.current.as_ref() else {
            return Ok(None);
        };
        let store_changed = q.store_instance != self.store.sync_store_instance();
        if store_changed
            || q.aborted
            || q.epoch != self.epoch
            || q.participants != *live
            || self.pending.is_some()
            || q.expired(self.sync_now())
        {
            let reason = if store_changed {
                AbortReason::AuthorityChanged
            } else if q.aborted {
                q.abort_reason.unwrap_or(AbortReason::ExternalAbort)
            } else if q.epoch != self.epoch {
                AbortReason::AuthorityChanged
            } else if q.participants != *live {
                AbortReason::ParticipantChanged
            } else if self.pending.is_some() {
                AbortReason::PendingBarrier
            } else {
                AbortReason::Timeout
            };
            return self.sync_release_abort(reason).map(Some);
        }
        if q.replies != q.participants {
            return Ok(None);
        }
        if q.adoption.is_some() {
            if q.phase == "probe" {
                // Every note is a target. Protected editors/recordings cannot
                // be excluded during a workspace-wide authority change.
                if !q.protected.is_empty() {
                    return self
                        .sync_release_abort(AbortReason::ProtectedTarget)
                        .map(Some);
                }
                let mut targets: Vec<_> = self.store.notes()?.into_iter().map(|n| n.id).collect();
                targets.sort();
                let now = self.sync_now();
                let q = self.quiet.current.as_mut().unwrap();
                q.adoption.as_mut().unwrap().targets = targets.iter().cloned().collect();
                q.phase = "prepare";
                q.replies.clear();
                q.started = now;
                return Ok(Some((
                    json!({"phase":"prepare","operationId":q.id,
                    "sessionId":self.id,"noteIds":targets}),
                    None,
                )));
            }
            // Store adoption, never old inbox application, is the sole commit
            // path for this purpose. Keep the renderer frozen until release.
            return Ok(None);
        }
        if q.phase == "probe" {
            let protected: Vec<_> = q.protected.iter().cloned().collect();
            let plan = match self.store.sync_plan_apply(&protected) {
                Ok(plan) => plan,
                Err(e) => {
                    self.sync_note_abort_reason(AbortReason::EvaluationError);
                    return Err(e);
                }
            };
            let mut targets = plan.targets.clone();
            if let Some(r) = &q.resolution {
                // Folder resolution can reparent descendants and restore orphan
                // projections; freeze the complete dependent note closure.
                targets.extend(match r.kind {
                    EntityKind::Note => vec![r.entity_id.clone()],
                    EntityKind::Folder => self.store.notes()?.into_iter().map(|n| n.id).collect(),
                });
                if targets.iter().any(|id| q.protected.contains(id)) {
                    return self
                        .sync_release_abort(AbortReason::ProtectedTarget)
                        .map(Some);
                }
            } else if plan.eligible_digests.is_empty()
                && !(q.local_recovery && !plan.changes.is_empty())
            {
                return self
                    .sync_release_abort(AbortReason::NoEligiblePlan)
                    .map(Some);
            }
            targets.sort();
            targets.dedup();
            let now = self.sync_now();
            let q = self.quiet.current.as_mut().unwrap();
            q.plan = Some(plan);
            q.phase = "prepare";
            q.replies.clear();
            q.started = now;
            return Ok(Some((
                json!({"phase":"prepare","operationId":q.id,"sessionId":self.id,"noteIds":targets}),
                None,
            )));
        }
        let q = self.quiet.current.as_ref().unwrap();
        let mut targets = q.plan.as_ref().unwrap().targets.clone();
        if let Some(r) = &q.resolution {
            targets.extend(match r.kind {
                EntityKind::Note => vec![r.entity_id.clone()],
                EntityKind::Folder => self.store.notes()?.into_iter().map(|n| n.id).collect(),
            });
        }
        if self.intents.values().any(|i| targets.contains(&i.note)) {
            return self.sync_release_abort(AbortReason::LocalIntent).map(Some);
        }
        let plan = q.plan.clone().unwrap();
        let resolution = q.resolution.clone();
        // Flush/recompute under the same final gate as intents and participant
        // validation. A registered save during prepare makes generation stale.
        if self
            .store
            .sync_plan_apply(&plan.excluded_note_ids)
            .map_err(|e| {
                self.sync_note_abort_reason(AbortReason::EvaluationError);
                e
            })?
            != plan
        {
            return self.sync_release_abort(AbortReason::PlanChanged).map(Some);
        }
        let before = self
            .store
            .notes()?
            .into_iter()
            .map(|n| (n.id.clone(), (n.locked, n.deleted_at, n.sealed)))
            .collect::<HashMap<_, _>>();
        self.prepare_metadata(true).map_err(|e| {
            self.sync_note_abort_reason(AbortReason::PrepareMetadataError);
            e
        })?;
        let result = self.apply_store(|store| {
            let report = if let Some(r) = resolution {
                store.sync_resolve(r.kind, &r.entity_id, &r.digest, r.keep_all)?
            } else {
                store.sync_apply_plan(&plan)?
            };
            Ok(serde_json::to_value(report)?)
        });
        if let Err(e) = result {
            if self.last_commit.is_none() {
                if e.code != "sync_plan_stale" {
                    self.sync_note_apply_error(&e);
                }
                self.sync_abort_reason(if e.code == "sync_plan_stale" {
                    AbortReason::PlanStale
                } else {
                    AbortReason::ApplyError
                });
                if e.code == "sync_plan_stale" {
                    return self.sync_release("abort", None).map(Some);
                };
                return Err(e);
            }
        }
        let after = self
            .store
            .notes()?
            .into_iter()
            .map(|n| (n.id.clone(), (n.locked, n.deleted_at, n.sealed)))
            .collect::<HashMap<_, _>>();
        let mut revoke = before
            .keys()
            .chain(after.keys())
            .filter(|id| match (before.get(*id), after.get(*id)) {
                (Some(a), Some(b)) => a != b,
                (Some(_), None) => true,
                (None, Some((locked, deleted, sealed))) => {
                    *locked || deleted.is_some() || sealed.is_some()
                }
                _ => false,
            })
            .cloned()
            .collect::<Vec<_>>();
        revoke.sort();
        revoke.dedup();
        let access = if revoke.is_empty() {
            None
        } else {
            self.store.revoke_keys(&revoke);
            self.intents.retain(|_, i| !revoke.contains(&i.note));
            self.bump(&revoke);
            Some(self.event("commit", "sync", &revoke)?)
        };
        self.sync_release("commit", access).map(Some)
    }
    fn sync_release(
        &mut self,
        outcome: &'static str,
        access: Option<Value>,
    ) -> Result<(Value, Option<Value>)> {
        let q = self
            .quiet
            .current
            .take()
            .ok_or_else(|| denied("同步操作已结束"))?;
        let d = &mut self.quiet.diagnostics;
        if outcome == "abort" {
            let reason = q.abort_reason.unwrap_or(AbortReason::ExternalAbort);
            d.aborts = d.aborts.saturating_add(1);
            d.reasons[reason as usize] = d.reasons[reason as usize].saturating_add(1);
            d.latest_abort_reason = Some(reason);
            if let Some(category) = q.apply_error {
                d.apply_errors[category as usize] =
                    d.apply_errors[category as usize].saturating_add(1);
                d.latest_apply_error = Some(category);
            }
        } else if outcome == "commit" {
            d.commits = d.commits.saturating_add(1);
        }
        let event =
            json!({"phase":"release","operationId":q.id,"sessionId":self.id,"outcome":outcome});
        self.quiet.retry_after = if outcome == "abort" {
            Some(self.sync_now() + Duration::from_secs(2))
        } else {
            None
        };
        let adoption_timeout = (q.abort_reason == Some(AbortReason::Timeout))
            .then(|| q.adoption_stage())
            .flatten();
        self.quiet.completed.push_back(Terminal {
            id: q.id,
            participants: q.participants,
            outcome,
            authority: self.sync_media_token(),
            store_instance: q.store_instance,
            adoption_timeout,
        });
        while self.quiet.completed.len() > 64 {
            self.quiet.completed.pop_front();
        }
        Ok((event, access))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn token(s: &Session) -> Token {
        Token {
            session_id: s.id.clone(),
            epoch: s.epoch,
            note_epoch: None,
        }
    }
    fn session() -> (tempfile::TempDir, Session) {
        let d = tempfile::tempdir().unwrap();
        let mut s = Session::new(Store::open(d.path()).unwrap());
        s.store.sync_enable(None).unwrap();
        (d, s)
    }
    fn begin(s: &mut Session) -> String {
        s.sync_begin(HashSet::from(["main".into()]), None).unwrap()["operationId"]
            .as_str()
            .unwrap()
            .into()
    }
    #[test]
    fn explicit_local_recovery_projects_head_only_with_real_renderer_and_final_gates() {
        for scenario in [
            "commit",
            "ordinary",
            "blocked",
            "participant",
            "intent",
            "empty",
        ] {
            let (root, mut s) = session();
            let note = s.store.action(json!({"type":"createNote"})).unwrap()["id"]
                .as_str()
                .unwrap()
                .to_string();
            s.store.sync_flush().unwrap();
            if scenario != "empty" {
                // Synthetic interrupted projection: durable head already exists,
                // no inbox remains, and the business row differs from that head.
                let db = rusqlite::Connection::open(root.path().join("notes.sqlite3")).unwrap();
                db.execute("UPDATE sync_identity SET capture=0", [])
                    .unwrap();
                db.execute(
                    "UPDATE notes SET body=json_set(body,'$.pinned',json('true')) WHERE id=?1",
                    [&note],
                )
                .unwrap();
                db.execute(
                    "DELETE FROM sync_projection WHERE kind='note' AND entity_id=?1",
                    [&note],
                )
                .unwrap();
                db.execute("UPDATE sync_identity SET capture=1", [])
                    .unwrap();
                assert!(s.store.note(&note).unwrap().pinned);
            }
            assert_eq!(s.store.sync_pending_count().unwrap(), 0);
            let plan = s.store.sync_plan_apply(&[]).unwrap();
            assert!(plan.eligible_digests.is_empty());
            assert_eq!(plan.changes.is_empty(), scenario == "empty");
            let live = HashSet::from(["main".into()]);
            let event = if scenario == "ordinary" {
                s.sync_begin(live.clone(), None)
            } else {
                s.sync_begin_local_recovery(live.clone())
            }
            .unwrap();
            let operation = event["operationId"].as_str().unwrap().to_string();
            let t = token(&s);
            s.sync_reply(
                "main",
                WindowReply::Probe {
                    operation_id: operation.clone(),
                    protected_note_ids: vec![],
                    blocked: scenario == "blocked",
                },
                &t,
            )
            .unwrap();
            let event = s.sync_tick(&live).unwrap().unwrap().0;
            if matches!(scenario, "ordinary" | "empty" | "blocked") {
                assert_eq!(event["outcome"], "abort", "{scenario}");
            } else {
                assert_eq!(event["phase"], "prepare");
                assert_eq!(event["noteIds"], json!([note]));
                s.sync_reply(
                    "main",
                    WindowReply::Prepare {
                        operation_id: operation,
                        ready: true,
                    },
                    &t,
                )
                .unwrap();
                if scenario == "intent" {
                    let t = Token {
                        note_epoch: Some(s.note_epoch(&note)),
                        ..t
                    };
                    s.register_save("main", &note, "pending-save", t).unwrap();
                }
                let participants = if scenario == "participant" {
                    HashSet::from(["other".into()])
                } else {
                    live
                };
                let event = s.sync_tick(&participants).unwrap().unwrap().0;
                assert_eq!(
                    event["outcome"],
                    if scenario == "commit" {
                        "commit"
                    } else {
                        "abort"
                    }
                );
            }
            assert_eq!(
                s.store.sync_plan_apply(&[]).unwrap().changes.is_empty(),
                matches!(scenario, "commit" | "empty")
            );
            assert_eq!(
                s.store.note(&note).unwrap().pinned,
                !matches!(scenario, "commit" | "empty")
            );
        }
    }
    #[test]
    fn workspace_adoption_session_blocks_save_barrier_and_quiet_work_without_mutation() {
        for scenario in ["intent", "barrier", "quiet"] {
            let (_root, mut s) = session();
            let note = s.store.action(json!({"type":"createNote"})).unwrap()["id"]
                .as_str()
                .unwrap()
                .to_string();
            s.store.sync_flush().unwrap();
            let t = token(&s);
            match scenario {
                "intent" => {
                    let note_token = Token {
                        note_epoch: Some(s.note_epoch(&note)),
                        ..t.clone()
                    };
                    s.register_save("main", &note, "pending-local-save", note_token)
                        .unwrap();
                }
                "barrier" => {
                    s.begin(
                        json!({"type":"deleteNote","id":note}),
                        HashSet::from(["main".into()]),
                        &t,
                    )
                    .unwrap();
                }
                "quiet" => {
                    begin(&mut s);
                }
                _ => unreachable!(),
            }
            let before = s.snapshot().unwrap();
            let instance = s.store.sync_store_instance();
            let identity = s.store.sync_identity().unwrap().unwrap();
            assert_eq!(
                s.sync_adoption_preflight(&Uuid::new_v4().to_string(), &Uuid::new_v4().to_string())
                    .unwrap_err()
                    .code,
                "sync_adoption_blocked",
                "{scenario}"
            );
            assert_eq!(s.snapshot().unwrap(), before);
            assert_eq!(s.store.sync_store_instance(), instance);
            assert_eq!(s.store.sync_identity().unwrap().unwrap(), identity);
            // The exact existing pair needs no migration and no token rotation.
            s.sync_adoption_preflight(&identity.workspace_id, &identity.device_id)
                .unwrap();
        }
    }
    #[test]
    fn workspace_adoption_preserves_local_authority_but_rejects_old_protocol_plans_and_media() {
        let (_root, mut s) = session();
        let note = s.store.action(json!({"type":"createNote"})).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        let global = token(&s);
        let note_token = Token {
            note_epoch: Some(s.note_epoch(&note)),
            ..global.clone()
        };
        let media_token = s.sync_media_token();
        let owner = s.attachment_owner("main").unwrap();
        let original = s.store.note(&note).unwrap();
        s.metadata_event = Some(json!({"fixture":"retained-metadata"}));
        s.last_commit = Some(json!({"fixture":"retained-commit"}));
        let workspace = s.store.sync_identity().unwrap().unwrap().workspace_id;
        let mut instances = HashSet::new();
        for next in [Uuid::new_v4().to_string(), workspace] {
            let plan = s.store.sync_plan_apply(&[]).unwrap();
            let media = s
                .store
                .sync_media_snapshot(&[], true)
                .unwrap()
                .verify()
                .unwrap();
            let instance = s.store.sync_store_instance();
            assert!(instances.insert(instance));
            let device = Uuid::new_v4().to_string();
            s.sync_adoption_preflight(&next, &device).unwrap();
            s.store.sync_adopt_workspace(&next, &device).unwrap();
            assert_ne!(s.store.sync_store_instance(), instance);
            assert!(!instances.contains(&s.store.sync_store_instance()));
            assert_eq!(
                s.store.sync_apply_plan(&plan).unwrap_err().code,
                "sync_plan_stale"
            );
            assert_eq!(
                s.store.sync_begin_media(media).unwrap_err().code,
                "sync_plan_stale"
            );
            s.check(&global, None).unwrap();
            s.check(&note_token, Some(&note)).unwrap();
            s.check(&media_token, None).unwrap();
            let current = s.attachment_owner("main").unwrap();
            assert_eq!(current.session, owner.session);
            assert_eq!(current.window, owner.window);
            assert_eq!(current.incarnation, owner.incarnation);
            assert_eq!(
                s.metadata_event,
                Some(json!({"fixture":"retained-metadata"}))
            );
            assert_eq!(s.last_commit, Some(json!({"fixture":"retained-commit"})));
            assert_eq!(
                serde_json::to_value(s.store.note(&note).unwrap()).unwrap(),
                serde_json::to_value(&original).unwrap()
            );
            let instance = s.store.sync_store_instance();
            s.store.sync_adopt_workspace(&next, &device).unwrap();
            assert_eq!(s.store.sync_store_instance(), instance);
        }
    }
    fn adoption_prepared(s: &mut Session) -> (String, String, String, HashSet<String>) {
        let workspace = Uuid::new_v4().to_string();
        let device = Uuid::new_v4().to_string();
        let live = HashSet::from(["main".into(), "note-test".into()]);
        let event = s
            .sync_begin_workspace_adoption(&workspace, &device, live.clone())
            .unwrap();
        let operation = event["operationId"].as_str().unwrap().to_string();
        let t = token(s);
        for window in &live {
            s.sync_reply(
                window,
                WindowReply::Probe {
                    operation_id: operation.clone(),
                    protected_note_ids: vec![],
                    blocked: false,
                },
                &t,
            )
            .unwrap();
        }
        let prepare = s.sync_tick(&live).unwrap().unwrap().0;
        assert_eq!(prepare["phase"], "prepare");
        let expected: HashSet<_> = s.store.notes().unwrap().into_iter().map(|n| n.id).collect();
        let actual: HashSet<_> = prepare["noteIds"]
            .as_array()
            .unwrap()
            .iter()
            .map(|id| id.as_str().unwrap().to_string())
            .collect();
        assert_eq!(actual, expected);
        assert!(!s
            .sync_workspace_adoption_ready(&operation, &workspace, &device, &live)
            .unwrap());
        (operation, workspace, device, live)
    }
    fn adoption_ack(s: &mut Session, operation: &str, live: &HashSet<String>) {
        let t = token(s);
        for window in live {
            s.sync_reply(
                window,
                WindowReply::Prepare {
                    operation_id: operation.into(),
                    ready: true,
                },
                &t,
            )
            .unwrap();
        }
    }
    #[test]
    fn workspace_adoption_barrier_freezes_all_notes_without_a_remote_apply_plan() {
        let (_root, mut s) = session();
        for _ in 0..2 {
            s.store.action(json!({"type":"createNote"})).unwrap();
        }
        let instance = s.store.sync_store_instance();
        let (operation, workspace, device, live) = adoption_prepared(&mut s);
        adoption_ack(&mut s, &operation, &live);
        assert!(s.sync_tick(&live).unwrap().is_none()); // NoEligiblePlan must not abort this purpose.
        assert!(s
            .sync_workspace_adoption_ready(&operation, &workspace, &device, &live)
            .unwrap());
        let media = s
            .sync_begin_workspace_adoption_media(&operation, &workspace, &device, &live)
            .unwrap();
        assert_eq!(
            media,
            json!({"phase":"adoptionMedia", "operationId":operation, "sessionId":s.id})
        );
        assert!(s
            .sync_workspace_adoption_commit_ready(&operation, &workspace, &device, &live)
            .unwrap());
        s.store.sync_adopt_workspace(&workspace, &device).unwrap();
        // Once the same-lock transaction commits, a timer cannot turn its real
        // result into an abort, even if commit work crossed the lease deadline.
        s.sync_advance_clock(Duration::from_secs(61));
        let release = s
            .sync_release_workspace_adoption(&operation, true)
            .unwrap()
            .unwrap();
        assert_eq!(release["phase"], "release");
        assert_eq!(release["outcome"], "commit");
        assert_eq!(release["sessionId"], s.id);
        assert_ne!(s.store.sync_store_instance(), instance);
        let t = token(&s);
        assert_eq!(
            s.sync_reply(
                "main",
                WindowReply::Prepare {
                    operation_id: operation.clone(),
                    ready: true
                },
                &t
            )
            .unwrap()["outcome"],
            "commit"
        );
        // Retaining the local Session does not authorize an old resolution read
        // across the Store instance boundary.
        assert!(s
            .sync_check_committed_resolution(&operation, &t.session_id, "main", &live)
            .is_err());
        assert!(s
            .sync_release_workspace_adoption(&operation, false)
            .unwrap()
            .is_none());
    }
    #[test]
    fn workspace_adoption_barrier_rechecks_every_final_authority_and_save_fence() {
        for scenario in [
            "ackMissing",
            "cancel",
            "participant",
            "timeout",
            "store",
            "epoch",
            "newNote",
            "intent",
            "pending",
            "workspace",
            "device",
        ] {
            let (_root, mut s) = session();
            let replacement_root = tempfile::tempdir().unwrap();
            let note = s.store.action(json!({"type":"createNote"})).unwrap()["id"]
                .as_str()
                .unwrap()
                .to_string();
            let (operation, mut workspace, mut device, mut live) = adoption_prepared(&mut s);
            if scenario != "ackMissing" {
                adoption_ack(&mut s, &operation, &live);
            }
            let t = token(&s);
            match scenario {
                "ackMissing" => {}
                "cancel" => {
                    s.sync_reply(
                        "main",
                        WindowReply::Prepare {
                            operation_id: operation.clone(),
                            ready: false,
                        },
                        &t,
                    )
                    .unwrap();
                }
                "participant" => {
                    live.remove("note-test");
                }
                "timeout" => {
                    s.quiet.current.as_mut().unwrap().started =
                        Instant::now() - Duration::from_secs(6);
                }
                "store" => {
                    s.store = Store::open(replacement_root.path()).unwrap();
                }
                "epoch" => {
                    s.epoch += 1;
                }
                "newNote" => {
                    s.store.action(json!({"type":"createNote"})).unwrap();
                }
                "intent" => {
                    s.register_save(
                        "main",
                        &note,
                        "late-save",
                        Token {
                            note_epoch: Some(s.note_epoch(&note)),
                            ..t
                        },
                    )
                    .unwrap();
                }
                "pending" => {
                    s.begin(json!({"type":"deleteNote","id":note}), live.clone(), &t)
                        .unwrap();
                }
                "workspace" => {
                    workspace = Uuid::new_v4().to_string();
                }
                "device" => {
                    device = Uuid::new_v4().to_string();
                }
                _ => unreachable!(),
            }
            let ready = s.sync_workspace_adoption_ready(&operation, &workspace, &device, &live);
            if scenario == "ackMissing" {
                assert!(!ready.unwrap());
            } else {
                assert_eq!(
                    ready.unwrap_err().code,
                    if scenario == "timeout" {
                        "sync_adoption_prepare_timeout"
                    } else {
                        "sync_adoption_blocked"
                    },
                    "{scenario}"
                );
            }
            let release = s
                .sync_release_workspace_adoption(&operation, false)
                .unwrap()
                .unwrap();
            assert_eq!(release["outcome"], "abort");
        }
    }
    #[test]
    fn workspace_adoption_media_lease_is_once_bounded_and_retains_timeout_after_release() {
        let (_root, mut s) = session();
        s.sync_advance_clock(Duration::ZERO);
        let (operation, workspace, device, live) = adoption_prepared(&mut s);
        // An incomplete prepare cannot start or extend the media lease.
        assert!(s
            .sync_begin_workspace_adoption_media(&operation, &workspace, &device, &live)
            .is_err());
        adoption_ack(&mut s, &operation, &live);
        s.sync_begin_workspace_adoption_media(&operation, &workspace, &device, &live)
            .unwrap();
        s.sync_advance_clock(Duration::from_millis(25_766));
        assert!(s.sync_tick(&live).unwrap().is_none());
        assert!(s
            .sync_workspace_adoption_commit_ready(&operation, &workspace, &device, &live)
            .unwrap());
        assert!(s
            .sync_begin_workspace_adoption_media(&operation, &workspace, &device, &live)
            .is_err());
        // A duplicate transition did not restart the 60-second media clock.
        s.sync_advance_clock(Duration::from_millis(34_234));
        assert_eq!(
            s.sync_workspace_adoption_commit_ready(&operation, &workspace, &device, &live)
                .unwrap_err()
                .code,
            "sync_adoption_media_timeout"
        );
        assert_eq!(s.sync_tick(&live).unwrap().unwrap().0["outcome"], "abort");
        assert_eq!(
            s.sync_workspace_adoption_error(&operation).code,
            "sync_adoption_media_timeout"
        );
        assert!(s
            .sync_release_workspace_adoption(&operation, false)
            .unwrap()
            .is_none());
        assert_eq!(
            s.sync_workspace_adoption_error(&operation).code,
            "sync_adoption_media_timeout"
        );
        // A late verifier cannot authorize this released operation or a replacement.
        s.sync_advance_clock(Duration::from_secs(3));
        let next = s
            .sync_begin_workspace_adoption(&workspace, &device, live.clone())
            .unwrap();
        assert_eq!(
            s.sync_workspace_adoption_commit_ready(&operation, &workspace, &device, &live)
                .unwrap_err()
                .code,
            "sync_adoption_media_timeout"
        );
        assert_ne!(next["operationId"], operation);
        assert_eq!(s.quiet.current.as_ref().unwrap().phase, "probe");
        assert_eq!(
            s.sync_workspace_adoption_error("unrelated").code,
            "sync_adoption_blocked"
        );
        let next = next["operationId"].as_str().unwrap();
        s.sync_release_workspace_adoption(next, false).unwrap();
        s.sync_advance_clock(Duration::from_secs(3));
        s.sync_begin(live.clone(), None).unwrap();
        assert_eq!(
            s.sync_workspace_adoption_commit_ready(&operation, &workspace, &device, &live)
                .unwrap_err()
                .code,
            "sync_adoption_media_timeout"
        );
    }
    #[test]
    fn workspace_adoption_probe_prepare_timeouts_remain_five_seconds_and_are_typed() {
        for phase in ["probe", "prepare"] {
            let (_root, mut s) = session();
            s.sync_advance_clock(Duration::ZERO);
            let (operation, live) = if phase == "prepare" {
                let (id, _, _, live) = adoption_prepared(&mut s);
                (id, live)
            } else {
                let live = HashSet::from(["main".into()]);
                let event = s
                    .sync_begin_workspace_adoption(
                        &Uuid::new_v4().to_string(),
                        &Uuid::new_v4().to_string(),
                        live.clone(),
                    )
                    .unwrap();
                (event["operationId"].as_str().unwrap().to_string(), live)
            };
            s.sync_advance_clock(Duration::from_secs(5));
            let expected = format!("sync_adoption_{phase}_timeout");
            assert_eq!(s.sync_workspace_adoption_error(&operation).code, expected);
            assert_eq!(s.sync_tick(&live).unwrap().unwrap().0["outcome"], "abort");
            assert_eq!(s.sync_workspace_adoption_error(&operation).code, expected);
        }
        let (_root, mut s) = session();
        s.sync_advance_clock(Duration::ZERO);
        let operation = begin(&mut s);
        s.sync_advance_clock(Duration::from_secs(5));
        assert_eq!(
            s.sync_tick(&HashSet::from(["main".into()]))
                .unwrap()
                .unwrap()
                .0["outcome"],
            "abort"
        );
        assert_eq!(
            s.sync_workspace_adoption_error(&operation).code,
            "sync_adoption_blocked"
        );
        assert_eq!(s.sync_diagnostics()["latestAbortReason"], "timeout");
    }
    #[test]
    fn workspace_adoption_media_rechecks_fences_and_accepts_renderer_cancellation() {
        for scenario in [
            "participant",
            "epoch",
            "intent",
            "pending",
            "cancel",
            "note",
            "store",
        ] {
            let (_root, mut s) = session();
            let replacement = tempfile::tempdir().unwrap();
            let note = s.store.action(json!({"type":"createNote"})).unwrap()["id"]
                .as_str()
                .unwrap()
                .to_string();
            let (operation, workspace, device, mut live) = adoption_prepared(&mut s);
            adoption_ack(&mut s, &operation, &live);
            s.sync_begin_workspace_adoption_media(&operation, &workspace, &device, &live)
                .unwrap();
            let t = token(&s);
            match scenario {
                "participant" => {
                    live.remove("note-test");
                }
                "epoch" => {
                    s.epoch += 1;
                }
                "intent" => {
                    s.register_save(
                        "main",
                        &note,
                        "media-save",
                        Token {
                            note_epoch: Some(s.note_epoch(&note)),
                            ..t
                        },
                    )
                    .unwrap();
                }
                "pending" => {
                    s.begin(json!({"type":"deleteNote", "id":note}), live.clone(), &t)
                        .unwrap();
                }
                "cancel" => {
                    s.sync_reply(
                        "main",
                        WindowReply::Prepare {
                            operation_id: operation.clone(),
                            ready: false,
                        },
                        &t,
                    )
                    .unwrap();
                }
                "note" => {
                    s.store.action(json!({"type":"createNote"})).unwrap();
                }
                "store" => {
                    s.store = Store::open(replacement.path()).unwrap();
                }
                _ => unreachable!(),
            }
            assert_eq!(
                s.sync_workspace_adoption_commit_ready(&operation, &workspace, &device, &live)
                    .unwrap_err()
                    .code,
                "sync_adoption_blocked",
                "{scenario}"
            );
            s.sync_release_workspace_adoption(&operation, false)
                .unwrap();
            assert_eq!(
                s.sync_workspace_adoption_error(&operation).code,
                "sync_adoption_blocked",
                "{scenario}"
            );
        }
    }
    #[test]
    fn workspace_adoption_barrier_rejects_protected_notes_and_never_applies_late_inbox() {
        let (_root, mut s) = session();
        let note = s.store.action(json!({"type":"createNote"})).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        let workspace = Uuid::new_v4().to_string();
        let device = Uuid::new_v4().to_string();
        let live = HashSet::from(["main".into()]);
        let operation = s
            .sync_begin_workspace_adoption(&workspace, &device, live.clone())
            .unwrap()["operationId"]
            .as_str()
            .unwrap()
            .to_string();
        s.sync_reply(
            "main",
            WindowReply::Probe {
                operation_id: operation.clone(),
                protected_note_ids: vec![note.clone()],
                blocked: false,
            },
            &token(&s),
        )
        .unwrap();
        assert_eq!(s.sync_tick(&live).unwrap().unwrap().0["outcome"], "abort");
        assert!(s
            .sync_release_workspace_adoption(&operation, false)
            .unwrap()
            .is_none());
        s.quiet.retry_after = None;
        let (operation, workspace, device, live) = adoption_prepared(&mut s);
        let incoming = incoming(&mut s);
        adoption_ack(&mut s, &operation, &live);
        assert!(s.sync_tick(&live).unwrap().is_none());
        assert!(s.store.note(&incoming).is_err());
        assert_eq!(s.store.sync_pending_count().unwrap(), 1);
        assert_eq!(
            s.sync_workspace_adoption_ready(&operation, &workspace, &device, &live)
                .unwrap_err()
                .code,
            "sync_adoption_blocked"
        );
        s.sync_release_workspace_adoption(&operation, false)
            .unwrap();
        assert!(s.store.note(&incoming).is_err());
    }
    #[test]
    fn workspace_adoption_barrier_empty_participants_and_late_cleanup_cannot_bypass_ownership() {
        let (_root, mut s) = session();
        let workspace = Uuid::new_v4().to_string();
        let device = Uuid::new_v4().to_string();
        assert_eq!(
            s.sync_begin_workspace_adoption(&workspace, &device, HashSet::new())
                .unwrap_err()
                .code,
            "sync_adoption_blocked"
        );
        assert!(!s.sync_has_operation());
        let (old, _, _, live) = adoption_prepared(&mut s);
        s.quiet.current.as_mut().unwrap().started = Instant::now() - Duration::from_secs(6);
        assert_eq!(s.sync_tick(&live).unwrap().unwrap().0["outcome"], "abort");
        s.quiet.retry_after = None;
        let replacement = s
            .sync_begin_workspace_adoption(&workspace, &device, live)
            .unwrap()["operationId"]
            .as_str()
            .unwrap()
            .to_string();
        assert!(s
            .sync_release_workspace_adoption(&old, false)
            .unwrap()
            .is_none());
        assert_eq!(s.quiet.current.as_ref().unwrap().id, replacement);
        assert!(s
            .sync_release_workspace_adoption(&Uuid::new_v4().to_string(), false)
            .is_err());
        assert_eq!(s.quiet.current.as_ref().unwrap().id, replacement);
        s.sync_release_workspace_adoption(&replacement, false)
            .unwrap();
    }
    #[test]
    fn strict_replies_real_window_phase_token_and_cancellation_receipt() {
        let (_d, mut s) = session();
        let id = begin(&mut s);
        let t = token(&s);
        assert!(s.pending.is_none());
        assert!(serde_json::from_value::<WindowReply>(json!({"phase":"probe","operationId":id,"protectedNoteIds":[],"blocked":false,"private":"extra"})).is_err());
        let reply = || WindowReply::Probe {
            operation_id: id.clone(),
            protected_note_ids: vec![],
            blocked: false,
        };
        assert!(s.sync_reply("forged", reply(), &t).is_err());
        assert!(s
            .sync_reply(
                "main",
                WindowReply::Prepare {
                    operation_id: id.clone(),
                    ready: true
                },
                &t
            )
            .is_err());
        let mut stale = t.clone();
        stale.epoch += 1;
        assert!(s.sync_reply("main", reply(), &stale).is_err());
        s.sync_reply("main", reply(), &t).unwrap();
        assert_eq!(
            s.sync_tick(&HashSet::from(["main".into()]))
                .unwrap()
                .unwrap()
                .0["outcome"],
            "abort"
        );
        assert_eq!(
            s.sync_reply("main", reply(), &t).unwrap()["outcome"],
            "abort"
        );
        assert!(s.sync_reply("forged", reply(), &t).is_err());
    }
    fn incoming(s: &mut Session) -> String {
        let identity = s.store.sync_identity().unwrap().unwrap();
        // New independent real Store with the same workspace.
        let d = tempfile::tempdir().unwrap();
        let mut remote = Store::open(d.path()).unwrap();
        remote.sync_enable(Some(&identity.workspace_id)).unwrap();
        let id = remote.action(json!({"type":"createNote"})).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        remote.sync_flush().unwrap();
        let wire = remote
            .sync_inventory()
            .unwrap()
            .into_iter()
            .find(|v| v.entity_id == id)
            .map(|v| remote.sync_version(&v.digest).unwrap())
            .unwrap();
        s.store.sync_receive(vec![wire]).unwrap();
        id
    }
    fn prepare(s: &mut Session, id: &str) {
        let t = token(s);
        s.sync_reply(
            "main",
            WindowReply::Probe {
                operation_id: id.into(),
                protected_note_ids: vec![],
                blocked: false,
            },
            &t,
        )
        .unwrap();
        assert_eq!(
            s.sync_tick(&HashSet::from(["main".into()]))
                .unwrap()
                .unwrap()
                .0["phase"],
            "prepare"
        );
        assert!(s.pending.is_none());
    }
    #[test]
    fn ready_then_cancel_is_terminal_before_commit_and_inbox_survives() {
        let (_d, mut s) = session();
        let nid = incoming(&mut s);
        let id = begin(&mut s);
        prepare(&mut s, &id);
        let t = token(&s);
        s.sync_reply(
            "main",
            WindowReply::Prepare {
                operation_id: id.clone(),
                ready: true,
            },
            &t,
        )
        .unwrap();
        assert_eq!(
            s.sync_reply(
                "main",
                WindowReply::Prepare {
                    operation_id: id.clone(),
                    ready: false
                },
                &t
            )
            .unwrap()["outcome"],
            "abort"
        );
        assert_eq!(
            s.sync_tick(&HashSet::from(["main".into()]))
                .unwrap()
                .unwrap()
                .0["outcome"],
            "abort"
        );
        assert!(s.store.note(&nid).is_err());
        assert_eq!(s.store.sync_pending_count().unwrap(), 1);
        assert_eq!(s.sync_diagnostics()["latestAbortReason"], "prepareNotReady");
    }
    #[test]
    fn participant_added_or_dirty_save_after_prepare_aborts_without_apply() {
        let (_d, mut s) = session();
        let nid = incoming(&mut s);
        let id = begin(&mut s);
        prepare(&mut s, &id);
        let t = token(&s);
        s.sync_reply(
            "main",
            WindowReply::Prepare {
                operation_id: id.clone(),
                ready: true,
            },
            &t,
        )
        .unwrap();
        assert_eq!(
            s.sync_tick(&HashSet::from(["main".into(), "note-new".into()]))
                .unwrap()
                .unwrap()
                .0["outcome"],
            "abort"
        );
        assert!(s.store.note(&nid).is_err());
        assert_eq!(
            s.sync_diagnostics()["latestAbortReason"],
            "participantChanged"
        );
        s.quiet.retry_after = None;
        let id = begin(&mut s);
        prepare(&mut s, &id);
        s.sync_reply(
            "main",
            WindowReply::Prepare {
                operation_id: id,
                ready: true,
            },
            &t,
        )
        .unwrap();
        s.store.action(json!({"type":"createNote"})).unwrap();
        assert_eq!(
            s.sync_tick(&HashSet::from(["main".into()]))
                .unwrap()
                .unwrap()
                .0["outcome"],
            "abort"
        );
        assert!(s.store.note(&nid).is_err());
        assert_eq!(s.sync_diagnostics()["latestAbortReason"], "planChanged");
        assert_eq!(s.sync_diagnostics()["aborts"], 2);
    }
    #[test]
    fn diagnostics_preserve_first_abort_cause_read_only_and_saturate() {
        let (_d, mut s) = session();
        let nid = incoming(&mut s);
        let id = begin(&mut s);
        let t = token(&s);
        s.sync_reply(
            "main",
            WindowReply::Probe {
                operation_id: id,
                protected_note_ids: vec![],
                blocked: true,
            },
            &t,
        )
        .unwrap();
        s.sync_abort(); // Adapter's later generic catch must not overwrite probeBlocked.
        let before = s.workspace().unwrap();
        let observed = s.sync_diagnostics();
        assert_eq!(observed["activePhase"], "probe");
        assert_eq!(observed["aborts"], 0); // Count only original release, not flagging/read.
        assert_eq!(s.workspace().unwrap(), before);
        s.quiet.diagnostics.aborts = u64::MAX;
        s.quiet.diagnostics.reasons[AbortReason::ProbeBlocked as usize] = u64::MAX;
        assert_eq!(
            s.sync_tick(&HashSet::from(["main".into()]))
                .unwrap()
                .unwrap()
                .0["outcome"],
            "abort"
        );
        let observed = s.sync_diagnostics();
        assert_eq!(observed["aborts"], u64::MAX);
        assert_eq!(observed["abortReasons"]["probeBlocked"], u64::MAX);
        assert_eq!(observed["latestAbortReason"], "probeBlocked");
        assert!(s.store.note(&nid).is_err());
        assert_eq!(s.store.sync_pending_count().unwrap(), 1);
        assert!(observed["activePhase"].is_null());
        assert!(observed["latestApplyError"].is_null());
        assert!(observed["applyErrors"]
            .as_object()
            .unwrap()
            .values()
            .all(|v| v == 0));
        let object = observed.as_object().unwrap();
        assert_eq!(object.len(), 8);
        assert_eq!(
            object["abortReasons"].as_object().unwrap().len(),
            AbortReason::ALL.len()
        );
        let serialized = observed.to_string();
        assert!(!serialized.contains(&s.id));
        assert!(!serialized.contains(&nid));
        assert!(!serialized.contains("operationId"));
        assert!(!serialized.contains("epoch"));
    }
    #[test]
    fn fixed_apply_error_classifier_never_retains_original_detail() {
        let error = |code: &str, message: &str| crate::store::AppError {
            code: code.into(),
            message: message.into(),
            commit: None,
        };
        let sql = [
            (
                "FOREIGN KEY constraint failed",
                ApplyError::DatabaseForeignKey,
            ),
            (
                "UNIQUE constraint failed: SECRET.column",
                ApplyError::DatabaseUnique,
            ),
            (
                "NOT NULL constraint failed: SECRET.column",
                ApplyError::DatabaseNotNull,
            ),
            ("CHECK constraint failed: SECRET", ApplyError::DatabaseCheck),
            (
                "too many levels of trigger recursion",
                ApplyError::DatabaseTrigger,
            ),
            (
                "attempt to write a readonly database",
                ApplyError::DatabaseReadonly,
            ),
            ("database is locked", ApplyError::DatabaseBusy),
            (
                "database table is locked: SECRET",
                ApplyError::DatabaseLocked,
            ),
            ("database schema is locked", ApplyError::DatabaseLocked),
            ("no such table: SECRET", ApplyError::DatabaseNoSuchTable),
            ("no such column: SECRET", ApplyError::DatabaseNoSuchColumn),
            (
                "no such function: SECRET",
                ApplyError::DatabaseNoSuchFunction,
            ),
            ("near SECRET: syntax error", ApplyError::DatabaseSyntax),
            ("database or disk is full", ApplyError::DatabaseFull),
            ("disk I/O error", ApplyError::DatabaseIo),
            (
                "SECRET /private/path arbitrary trigger message",
                ApplyError::DatabaseOther,
            ),
            ("constraint failed", ApplyError::DatabaseOther),
            (
                "prefix UNIQUE constraint failed: SECRET",
                ApplyError::DatabaseOther,
            ),
        ];
        for (message, category) in sql {
            let original = error("database", message);
            assert_eq!(ApplyError::classify(&original), category);
            assert_eq!(original.message, message);
            assert!(!serde_json::to_string(&category).unwrap().contains("SECRET"));
        }
        assert_eq!(
            ApplyError::classify(&error("database", &"X".repeat(4097))),
            ApplyError::DatabaseOther
        );
        for (code, category) in [
            ("filesystem", ApplyError::Filesystem),
            ("document", ApplyError::Document),
            ("sync_invalid", ApplyError::SyncInvalid),
            ("sync_limit", ApplyError::SyncLimit),
            ("sync_pending_flush", ApplyError::SyncPendingFlush),
            ("sync_missing_blob", ApplyError::SyncMissingBlob),
            ("sync_blob_corrupt", ApplyError::SyncBlobCorrupt),
            ("sync_media_publish", ApplyError::SyncMediaPublish),
            ("sync_equivocation", ApplyError::SyncEquivocation),
            ("sync_disabled", ApplyError::SyncDisabled),
            ("sync_workspace_mismatch", ApplyError::SyncWorkspaceMismatch),
            (
                "sync_attachment_conflict",
                ApplyError::SyncAttachmentConflict,
            ),
            ("not_found", ApplyError::NotFound),
            ("SECRET-code", ApplyError::Other),
        ] {
            assert_eq!(ApplyError::classify(&error(code, "SECRET")), category);
        }
        // SQL-looking detail on a non-database error cannot select a DB category.
        assert_eq!(
            ApplyError::classify(&error("SECRET", "FOREIGN KEY constraint failed")),
            ApplyError::Other
        );
    }
    #[test]
    fn real_apply_database_failure_preserves_error_rollback_first_category_and_release_counts() {
        let (d, mut s) = session();
        let nid = incoming(&mut s);
        let id = begin(&mut s);
        prepare(&mut s, &id);
        let t = token(&s);
        s.sync_reply(
            "main",
            WindowReply::Prepare {
                operation_id: id,
                ready: true,
            },
            &t,
        )
        .unwrap();
        let db = rusqlite::Connection::open(d.path().join("notes.sqlite3")).unwrap();
        db.execute_batch("CREATE TRIGGER fail90 BEFORE UPDATE ON sync_identity WHEN OLD.capture=0 AND NEW.capture=1 BEGIN SELECT RAISE(ABORT,'NOT NULL constraint failed: SECRET'); END").unwrap();
        let original = s.sync_tick(&HashSet::from(["main".into()])).unwrap_err();
        assert_eq!(original.code, "database");
        assert_eq!(original.message, "NOT NULL constraint failed: SECRET");
        assert!(original.commit.is_none());
        assert!(s.last_commit.is_none());
        assert_eq!(s.sync_diagnostics()["applyErrors"]["databaseNotNull"], 0);
        assert!(s.sync_diagnostics()["latestApplyError"].is_null());
        s.sync_note_apply_error(&crate::store::AppError {
            code: "filesystem".into(),
            message: "SECRET".into(),
            commit: None,
        });
        s.sync_abort_reason(AbortReason::EvaluationError);
        s.quiet.diagnostics.apply_errors[ApplyError::DatabaseNotNull as usize] = u64::MAX;
        assert_eq!(
            s.sync_tick(&HashSet::from(["main".into()]))
                .unwrap()
                .unwrap()
                .0["outcome"],
            "abort"
        );
        let observed = s.sync_diagnostics();
        assert_eq!(observed["version"], 2);
        assert_eq!(observed["latestAbortReason"], "applyError");
        assert_eq!(observed["abortReasons"]["applyError"], 1);
        assert_eq!(observed["latestApplyError"], "databaseNotNull");
        assert_eq!(observed["applyErrors"]["databaseNotNull"], u64::MAX);
        assert_eq!(observed["applyErrors"]["filesystem"], 0);
        assert_eq!(
            observed["applyErrors"].as_object().unwrap().len(),
            ApplyError::ALL.len()
        );
        assert!(!observed.to_string().contains("SECRET"));
        assert_eq!(observed, s.sync_diagnostics());
        assert!(s.store.note(&nid).is_err());
        assert_eq!(s.store.sync_pending_count().unwrap(), 1);
        assert_eq!(
            db.query_row("SELECT capture FROM sync_identity", [], |r| r
                .get::<_, u64>(0))
                .unwrap(),
            1
        );
        db.execute_batch("DROP TRIGGER fail90").unwrap();
    }
    #[test]
    fn metadata_failure_propagates_unchanged_and_retains_reason_through_adapter_abort() {
        let (_d, mut s) = session();
        let nid = incoming(&mut s);
        let id = begin(&mut s);
        prepare(&mut s, &id);
        let t = token(&s);
        s.sync_reply(
            "main",
            WindowReply::Prepare {
                operation_id: id,
                ready: true,
            },
            &t,
        )
        .unwrap();
        s.metadata_sequence = 9_007_199_254_740_991;
        let error = s.sync_tick(&HashSet::from(["main".into()])).unwrap_err();
        assert_eq!(error.code, "metadata_overflow");
        assert!(error.commit.is_none());
        assert_eq!(s.sync_diagnostics()["aborts"], 0);
        s.sync_abort_reason(AbortReason::EvaluationError); // Exact generic adapter catch.
        assert_eq!(
            s.sync_tick(&HashSet::from(["main".into()]))
                .unwrap()
                .unwrap()
                .0["outcome"],
            "abort"
        );
        assert_eq!(
            s.sync_diagnostics()["latestAbortReason"],
            "prepareMetadataError"
        );
        assert_eq!(s.sync_diagnostics()["abortReasons"]["evaluationError"], 0);
        assert!(s.sync_diagnostics()["latestApplyError"].is_null());
        assert!(s.sync_diagnostics()["applyErrors"]
            .as_object()
            .unwrap()
            .values()
            .all(|v| v == 0));
        assert_eq!(s.store.sync_pending_count().unwrap(), 1);
        assert!(s.store.note(&nid).is_err());
    }
    #[test]
    fn normal_note_apply_has_actual_metadata_without_global_access_bump() {
        let (_d, mut s) = session();
        let nid = incoming(&mut s);
        let id = begin(&mut s);
        prepare(&mut s, &id);
        let t = token(&s);
        let epoch = s.epoch;
        s.sync_reply(
            "main",
            WindowReply::Prepare {
                operation_id: id.clone(),
                ready: true,
            },
            &t,
        )
        .unwrap();
        let (event, access) = s
            .sync_tick(&HashSet::from(["main".into()]))
            .unwrap()
            .unwrap();
        assert_eq!(event["outcome"], "commit");
        assert_eq!(s.sync_diagnostics()["commits"], 1);
        assert_eq!(s.sync_diagnostics()["aborts"], 0);
        assert!(access.is_none());
        assert_eq!(s.epoch, epoch);
        assert!(s.store.note(&nid).is_ok());
        let metadata = s.take_metadata_event().unwrap();
        assert!(metadata["changes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|c| c["id"] == nid));
        assert_eq!(
            s.sync_reply(
                "main",
                WindowReply::Prepare {
                    operation_id: id,
                    ready: false
                },
                &t
            )
            .unwrap()["outcome"],
            "commit"
        );
    }
}

#[cfg(test)]
mod final_gate_tests {
    use super::*;
    fn token(s: &Session, note: Option<&str>) -> Token {
        Token {
            session_id: s.id.clone(),
            epoch: s.epoch,
            note_epoch: note.map(|id| s.note_epoch(id)),
        }
    }
    fn setup() -> (tempfile::TempDir, Session, Store, String) {
        let root = tempfile::tempdir().unwrap();
        let mut s = Session::new(Store::open(root.path().join("local")).unwrap());
        let id = s.store.action(json!({"type":"createNote"})).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        let identity = s.store.sync_enable(None).unwrap();
        let mut remote = Store::open(root.path().join("remote")).unwrap();
        remote.sync_enable(Some(&identity.workspace_id)).unwrap();
        for h in s.store.sync_inventory().unwrap() {
            remote
                .sync_receive(vec![s.store.sync_version(&h.digest).unwrap()])
                .unwrap();
        }
        remote.sync_apply_pending().unwrap();
        remote
            .action(json!({"type":"patchNote","id":id,"pinned":true}))
            .unwrap();
        remote.sync_flush().unwrap();
        for h in remote.sync_inventory().unwrap() {
            s.store
                .sync_receive(vec![remote.sync_version(&h.digest).unwrap()])
                .unwrap();
        }
        (root, s, remote, id)
    }
    fn prepared(s: &mut Session) -> String {
        let id = s.sync_begin(HashSet::from(["main".into()]), None).unwrap()["operationId"]
            .as_str()
            .unwrap()
            .to_string();
        let t = token(s, None);
        s.sync_reply(
            "main",
            WindowReply::Probe {
                operation_id: id.clone(),
                protected_note_ids: vec![],
                blocked: false,
            },
            &t,
        )
        .unwrap();
        assert_eq!(
            s.sync_tick(&HashSet::from(["main".into()]))
                .unwrap()
                .unwrap()
                .0["phase"],
            "prepare"
        );
        s.sync_reply(
            "main",
            WindowReply::Prepare {
                operation_id: id.clone(),
                ready: true,
            },
            &t,
        )
        .unwrap();
        id
    }
    #[test]
    fn final_gate_rechecks_registered_save_intents_and_preserves_authority_for_drain() {
        let (_root, mut s, _remote, id) = setup();
        prepared(&mut s);
        let t = token(&s, Some(&id));
        s.register_save("main", &id, "final-save", t.clone())
            .unwrap();
        assert!(s.pending.is_none());
        assert!(s.sensitive(&id, &t).is_ok());
        assert_eq!(
            s.sync_tick(&HashSet::from(["main".into()]))
                .unwrap()
                .unwrap()
                .0["outcome"],
            "abort"
        );
        assert!(!s.store.note(&id).unwrap().pinned);
        assert_eq!(s.store.sync_pending_count().unwrap(), 1);
        assert_eq!(s.sync_diagnostics()["latestAbortReason"], "localIntent");
    }
    #[test]
    fn access_barrier_and_timeout_abort_quiet_without_touching_business_rows() {
        let (_root, mut s, _remote, id) = setup();
        prepared(&mut s);
        let t = token(&s, None);
        let event = s
            .begin(
                json!({"type":"deleteNote","id":id}),
                HashSet::from(["main".into()]),
                &t,
            )
            .unwrap();
        assert_eq!(
            s.sync_tick(&HashSet::from(["main".into()]))
                .unwrap()
                .unwrap()
                .0["outcome"],
            "abort"
        );
        assert!(s.store.note(&id).unwrap().deleted_at.is_none());
        assert_eq!(s.sync_diagnostics()["latestAbortReason"], "pendingBarrier");
        s.acknowledge(event["operationId"].as_str().unwrap(), "main", false)
            .unwrap();
        let _ = s
            .finish(
                event["operationId"].as_str().unwrap(),
                &HashSet::from(["main".into()]),
                false,
            )
            .unwrap();
        s.quiet.retry_after = None;
        prepared(&mut s);
        s.quiet.current.as_mut().unwrap().started = Instant::now() - Duration::from_secs(6);
        assert_eq!(
            s.sync_tick(&HashSet::from(["main".into()]))
                .unwrap()
                .unwrap()
                .0["outcome"],
            "abort"
        );
        assert!(!s.store.note(&id).unwrap().pinned);
        assert_eq!(s.sync_diagnostics()["latestAbortReason"], "timeout");
        assert_eq!(s.sync_diagnostics()["aborts"], 2);
    }
    #[test]
    fn changed_sealed_lock_delete_revoke_only_the_actual_target_note_epoch() {
        let (_root, mut s, mut remote, id) = setup();
        let other = s.store.action(json!({"type":"createNote"})).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        let before = token(&s, Some(&other));
        remote
            .action(json!({"type":"lockNote","id":id,"password":"synthetic"}))
            .unwrap();
        remote.sync_flush().unwrap();
        for h in remote.sync_inventory().unwrap() {
            s.store
                .sync_receive(vec![remote.sync_version(&h.digest).unwrap()])
                .unwrap();
        }
        prepared(&mut s);
        let (release, access) = s
            .sync_tick(&HashSet::from(["main".into()]))
            .unwrap()
            .unwrap();
        assert_eq!(release["outcome"], "commit");
        let access = access.unwrap();
        assert_eq!(access["noteIds"], json!([id]));
        assert!(s.check(&before, Some(&other)).is_ok());
        assert_eq!(s.note_epoch(&other), 0);
        assert!(s.note_epoch(&id) > 0);
        assert!(!s.store.authorized(&id).unwrap());
    }
}

#[cfg(test)]
mod unlocked_key_tests {
    use super::*;
    #[test]
    fn ordinary_remote_metadata_retains_unlocked_key_and_note_epoch() {
        let root = tempfile::tempdir().unwrap();
        let mut local = Store::open(root.path().join("local")).unwrap();
        let id = local.action(json!({"type":"createNote"})).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        local.action(json!({"type":"saveNote","id":id,"revision":0,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"sealed body"}]}]}})).unwrap();
        local
            .action(json!({"type":"lockNote","id":id,"password":"synthetic"}))
            .unwrap();
        let identity = local.sync_enable(None).unwrap();
        local
            .action(json!({"type":"unlockNote","id":id,"password":"synthetic"}))
            .unwrap();
        let mut remote = Store::open(root.path().join("remote")).unwrap();
        remote.sync_enable(Some(&identity.workspace_id)).unwrap();
        for h in local.sync_inventory().unwrap() {
            remote
                .sync_receive(vec![local.sync_version(&h.digest).unwrap()])
                .unwrap();
        }
        remote.sync_apply_pending().unwrap();
        remote
            .action(json!({"type":"patchNote","id":id,"pinned":true}))
            .unwrap();
        remote.sync_flush().unwrap();
        let mut s = Session::new(local);
        for h in remote.sync_inventory().unwrap() {
            s.store
                .sync_receive(vec![remote.sync_version(&h.digest).unwrap()])
                .unwrap();
        }
        let token = Token {
            session_id: s.id.clone(),
            epoch: s.epoch,
            note_epoch: None,
        };
        let participants = HashSet::from(["main".into()]);
        let operation = s.sync_begin(participants.clone(), None).unwrap()["operationId"]
            .as_str()
            .unwrap()
            .to_string();
        s.sync_reply(
            "main",
            WindowReply::Probe {
                operation_id: operation.clone(),
                protected_note_ids: vec![],
                blocked: false,
            },
            &token,
        )
        .unwrap();
        s.sync_tick(&participants).unwrap();
        s.sync_reply(
            "main",
            WindowReply::Prepare {
                operation_id: operation,
                ready: true,
            },
            &token,
        )
        .unwrap();
        let (release, access) = s.sync_tick(&participants).unwrap().unwrap();
        assert_eq!(release["outcome"], "commit");
        assert!(access.is_none());
        assert!(s.store.authorized(&id).unwrap());
        assert_eq!(s.note_epoch(&id), 0);
        assert_eq!(s.epoch, 1);
        assert_eq!(
            s.workspace().unwrap()["notes"][0]["plainText"],
            "sealed body"
        );
    }
}
