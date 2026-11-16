//! Real application driver. The sole process Session is injected, never opened here.
//! WindowHost is implemented by AppHandle in production. Tests explicitly label
//! protocol replies as test inputs; they do not stand in for real WebView evidence.
use crate::{
    agent_access::TrustedContext,
    agent_host::{ApplicationHandler, DeliveryGuard, HandlerFuture, HandlerReply, RequestFuture},
    application::{
        ExternalProgress, ExternalStart, MutationResult, NotesApplicationService, RequestLimits,
        RequestPermit, ToolError, ToolResult,
    },
    session::Session,
};
use serde_json::Value;
use std::{
    collections::HashSet,
    sync::{
        atomic::{AtomicU8 as CancelFlag, Ordering},
        Arc, Condvar, Mutex,
    },
    time::{Duration, Instant},
};

pub type SharedSession = Arc<(Mutex<Session>, Condvar)>;
pub trait WindowHost: Send + Sync + 'static {
    fn participants(&self) -> HashSet<String>;
    fn emit(&self, name: &str, event: &Value) -> ToolResult<()>;
}
#[derive(Clone)]
pub struct Service {
    pub shared: SharedSession,
    pub windows: Arc<dyn WindowHost>,
    limits: RequestLimits,
    active: Arc<std::sync::atomic::AtomicUsize>,
}
impl Service {
    pub fn new(shared: SharedSession, windows: Arc<dyn WindowHost>) -> Self {
        Self {
            shared,
            windows,
            limits: RequestLimits::default(),
            active: Arc::default(),
        }
    }
    pub fn wait_idle(&self) -> ToolResult<()> {
        let deadline = Instant::now() + Duration::from_secs(6);
        while self.active.load(Ordering::SeqCst) != 0 {
            if Instant::now() >= deadline {
                return Err(ToolError::new(
                    "TIMEOUT",
                    "Agent operation cleanup is still pending",
                ));
            }
            self.wait()?;
        }
        Ok(())
    }
}
struct Activity(Service);
impl Drop for Activity {
    fn drop(&mut self) {
        self.0.active.fetch_sub(1, Ordering::SeqCst);
        self.0.shared.1.notify_all();
    }
}
struct Cancellation {
    flag: Arc<CancelFlag>,
    shared: SharedSession,
}
impl Drop for Cancellation {
    fn drop(&mut self) {
        self.flag.store(1, Ordering::SeqCst);
        self.shared.1.notify_all();
    }
}
impl ApplicationHandler for Service {
    fn call(&self, context: TrustedContext, tool: String, args: Value) -> HandlerFuture {
        let request = self.request(
            context,
            tool.clone(),
            args,
            Instant::now() + Duration::from_secs(if is_write(&tool) { 20 } else { 5 }),
        );
        Box::pin(async move { request.await.result })
    }
    fn request(
        &self,
        context: TrustedContext,
        tool: String,
        args: Value,
        deadline: Instant,
    ) -> RequestFuture {
        let driver = self.clone();
        Box::pin(async move {
            let flag = Arc::new(CancelFlag::new(0));
            let _cancel = Cancellation {
                flag: flag.clone(),
                shared: driver.shared.clone(),
            };
            driver.active.fetch_add(1, Ordering::SeqCst);
            let activity = Activity(driver.clone());
            // Driver owns the operation through cancellation of this future. It
            // observes the flag before commit, then emits the real abort/release.
            // After commit it finishes notification/ACK compensation independently.
            tokio::task::spawn_blocking(move || {
                let _activity = activity;
                driver.run(context, tool, args, deadline, flag)
            })
            .await
            .unwrap_or_else(|_| HandlerReply {
                result: Err(ToolError::new(
                    "STORAGE_ERROR",
                    "Application driver failed; recover the original operation",
                )),
                delivery: None,
            })
        })
    }
}
fn is_write(tool: &str) -> bool {
    matches!(tool, "notes_create" | "notes_append" | "notes_update")
}
struct Delivery {
    _permit: RequestPermit,
    shared: SharedSession,
    context: TrustedContext,
    tool: String,
    result: ToolResult<Value>,
    args: Value,
}
impl DeliveryGuard for Delivery {
    fn check(&self) -> ToolResult<()> {
        let mut s = self.shared.0.lock().map_err(ToolError::storage)?;
        let scope = match self.tool.as_str() {
            "notes_create" => Some("notes:create"),
            "notes_update" | "notes_append" => Some("notes:update"),
            "notes_list" | "notes_search" | "notes_list_folders" | "notes_read" => {
                Some("notes:read")
            }
            _ => None,
        };
        NotesApplicationService::new(&mut s).authorize(&self.context, scope)?;
        if let Ok(value) = &self.result {
            if is_write(&self.tool)
                || (self.tool == "notes_get_operation"
                    && value.get("committed") == Some(&Value::Bool(true)))
            {
                let result: MutationResult =
                    serde_json::from_value(value.clone()).map_err(ToolError::storage)?;
                NotesApplicationService::new(&mut s).check_delivery(&self.context, &result)?;
            } else if self.tool == "notes_read" {
                s.store
                    .application_note(&self.context, self.args["noteId"].as_str().unwrap_or(""))?;
            } else if matches!(self.tool.as_str(), "notes_list" | "notes_search") {
                if let Some(items) = value["items"].as_array() {
                    for item in items {
                        s.store
                            .application_note(&self.context, item["id"].as_str().unwrap_or(""))?;
                    }
                }
            }
        }
        Ok(())
    }
}
// Also runs on unwind: only this driver's operation may be aborted.
struct Operation {
    service: Service,
    id: Option<String>,
}
impl Drop for Operation {
    fn drop(&mut self) {
        if let Some(id) = self.id.take() {
            let release = self.service.shared.0.lock().ok().and_then(|mut s| {
                NotesApplicationService::new(&mut s)
                    .external_abort(&id)
                    .ok()
            });
            if let Some(release) = release {
                let _ = self.service.windows.emit("notes-agent", &release);
            }
        }
    }
}
impl Service {
    fn run(
        &self,
        context: TrustedContext,
        tool: String,
        args: Value,
        deadline: Instant,
        cancelled: Arc<CancelFlag>,
    ) -> HandlerReply {
        let admission = if is_write(&tool) {
            self.limits.write_cancellable(
                &context,
                deadline
                    .checked_sub(Duration::from_secs(5))
                    .unwrap_or(deadline),
                || cancelled.load(Ordering::SeqCst) != 0,
            )
        } else {
            self.limits.read(&context)
        };
        let permit = match admission {
            Ok(p) => p,
            Err(e) => {
                return HandlerReply {
                    result: Err(e),
                    delivery: None,
                }
            }
        };
        let result = self.execute(&context, &tool, args.clone(), deadline, &cancelled);
        let delivery = Delivery {
            _permit: permit,
            shared: self.shared.clone(),
            context,
            tool,
            result: result.clone(),
            args,
        };
        HandlerReply {
            result,
            delivery: Some(Box::new(delivery)),
        }
    }
    fn wait(&self) -> ToolResult<()> {
        // Condvar releases Session while waiting. No window IO under this lock.
        let guard = self.shared.0.lock().map_err(ToolError::storage)?;
        drop(
            self.shared
                .1
                .wait_timeout(guard, Duration::from_millis(20))
                .map_err(ToolError::storage)?,
        );
        Ok(())
    }
    fn execute(
        &self,
        context: &TrustedContext,
        tool: &str,
        args: Value,
        deadline: Instant,
        cancelled: &CancelFlag,
    ) -> ToolResult<Value> {
        if (cancelled.load(Ordering::SeqCst) != 0) || Instant::now() >= deadline {
            return Err(ToolError::new(
                "TIMEOUT",
                "Request cancelled before application entry",
            ));
        }
        if !is_write(tool) {
            return NotesApplicationService::new(
                &mut *self.shared.0.lock().map_err(ToolError::storage)?,
            )
            .query(context, tool, args);
        }
        let live = self.windows.participants();
        let start =
            NotesApplicationService::new(&mut *self.shared.0.lock().map_err(ToolError::storage)?)
                .external_write(context, tool, args, live)?;
        let (id, event) = match start {
            ExternalStart::Replay(result) => {
                NotesApplicationService::new(
                    &mut *self.shared.0.lock().map_err(ToolError::storage)?,
                )
                .check_delivery(context, &result)?;
                return serde_json::to_value(result).map_err(ToolError::storage);
            }
            ExternalStart::Probe {
                operation_id,
                event,
            } => (operation_id, event),
        };
        let mut operation = Operation {
            service: self.clone(),
            id: Some(id.clone()),
        };
        self.windows.emit("notes-agent", &event)?;
        let commit_deadline = deadline
            .checked_sub(Duration::from_secs(5))
            .unwrap_or(deadline);
        loop {
            let live = self.windows.participants();
            let (progress, metadata) = {
                let mut s = self.shared.0.lock().map_err(ToolError::storage)?;
                if (cancelled.load(Ordering::SeqCst) != 0) || Instant::now() >= commit_deadline {
                    let release = NotesApplicationService::new(&mut s).external_abort(&id)?;
                    drop(s);
                    operation.id = None;
                    let _ = self.windows.emit("notes-agent", &release);
                    let mut e = ToolError::new("TIMEOUT", "Request cancelled before commit");
                    e.operation_id = Some(id);
                    e.committed = Some(false);
                    return Err(e);
                }
                let progress = NotesApplicationService::new(&mut s).external_tick(&id, &live);
                let metadata = if matches!(progress, ExternalProgress::Committed { .. }) {
                    s.take_metadata_event()
                } else {
                    None
                };
                (progress, metadata)
            };
            match progress {
                ExternalProgress::Waiting => self.wait()?,
                ExternalProgress::Event(event) => self.windows.emit("notes-agent", &event)?,
                ExternalProgress::Aborted { error, release } => {
                    operation.id = None;
                    if !release.is_null() {
                        let _ = self.windows.emit("notes-agent", &release);
                    }
                    return Err(error);
                }
                ExternalProgress::Committed {
                    mut result,
                    release,
                } => {
                    operation.id = None; // Committed facts can never be rolled back by Drop.
                                         // Same gate captured metadata above; all IO occurs after drop.
                    let metadata_ok = metadata
                        .as_ref()
                        .is_none_or(|e| self.windows.emit("notes-metadata", e).is_ok());
                    let release_ok = self.windows.emit("notes-agent", &release).is_ok();
                    if !metadata_ok || !release_ok {
                        result.warnings.push("WINDOW_REFRESH_REQUIRED".into());
                        if NotesApplicationService::new(
                            &mut *self.shared.0.lock().map_err(ToolError::storage)?,
                        )
                        .notification_failed(&id)
                        .is_err()
                        {
                            result.warnings.push("WARNING_PERSIST_FAILED".into());
                        }
                    }
                    let finish_deadline = Instant::now() + Duration::from_secs(5);
                    loop {
                        let live = self.windows.participants();
                        let done = NotesApplicationService::new(
                            &mut *self.shared.0.lock().map_err(ToolError::storage)?,
                        )
                        .finish_delivery(context, &id, &live);
                        match done {
                            Ok(Some(mut receipt)) => {
                                for warning in &result.warnings {
                                    if !receipt.warnings.contains(warning) {
                                        receipt.warnings.push(warning.clone());
                                    }
                                }
                                return serde_json::to_value(receipt).map_err(ToolError::storage);
                            }
                            Err(mut e) => {
                                // Revocation may reject delivery after commit, but
                                // it cannot skip durable refresh compensation.
                                let _ = NotesApplicationService::new(
                                    &mut *self.shared.0.lock().map_err(ToolError::storage)?,
                                )
                                .notification_failed(&id);
                                e.operation_id = Some(id);
                                e.committed = Some(true);
                                return Err(e);
                            }
                            Ok(None) => (),
                        }
                        // Actual native timeout is also five seconds; do not invent ACKs.
                        if Instant::now() >= finish_deadline {
                            // A clock/terminal anomaly must not spin indefinitely.
                            if !result
                                .warnings
                                .iter()
                                .any(|w| w == "WINDOW_REFRESH_REQUIRED")
                            {
                                result.warnings.push("WINDOW_REFRESH_REQUIRED".into());
                            }
                            if NotesApplicationService::new(
                                &mut *self.shared.0.lock().map_err(ToolError::storage)?,
                            )
                            .notification_failed(&id)
                            .is_err()
                            {
                                result.warnings.push("WARNING_PERSIST_FAILED".into());
                            }
                            return serde_json::to_value(result).map_err(ToolError::storage);
                        }
                        self.wait()?;
                    }
                }
            }
        }
    }
}

#[cfg(test)]
#[path = "integration_tests.rs"]
mod tests;
