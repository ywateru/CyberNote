//! Explicit synthetic-workspace transport. Store, quiet/access barriers and
//! local recording registry are production code; OS windows/media remain external.
#[path = "current/session.rs"]
mod session;
#[path = "current/store.rs"]
mod store;
#[path = "current/sync.rs"]
mod sync;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::{json, Value};
use session::{Session, Token};
use std::io::{self, BufRead, Write};
use store::{AppError, Result, Store};
fn error(code: &str, message: &str) -> AppError {
    AppError {
        code: code.into(),
        message: message.into(),
        commit: None,
    }
}
fn field<'a>(args: &'a Value, key: &str) -> Result<&'a str> {
    args[key]
        .as_str()
        .ok_or_else(|| error("invalid", "Missing string argument"))
}
fn command(session: &mut Session, row: &Value, host: &StdinWindows) -> Result<Value> {
    let args = &row["args"];
    let window = field(row, "window")?;
    let token =
        || serde_json::from_value::<Token>(args["expected"].clone()).map_err(AppError::from);
    match field(row, "command")? {
        "load_workspace" => session.workspace(),
        "register_save_intent" => {
            session.register_save(
                window,
                field(args, "noteId")?,
                field(args, "intent")?,
                token()?,
            )?;
            Ok(Value::Null)
        }
        "workspace_action" => {
            let action = args["action"].clone();
            if action["type"] == "saveNote" {
                session.save(window, action)
            } else if Session::requires_barrier(&action) {
                Err(error("transport_unsupported", "Access barriers require real window participants; not provided by this attachment runner"))
            } else {
                let result = session.ordinary(action, &token()?);
                if let Ok((_, Some(event))) = &result {
                    host.emit("notes-access", event)?;
                }
                result.map(|(value, _)| value)
            }
        }
        "acknowledge_access" => {
            session.acknowledge(
                field(args, "operationId")?,
                window,
                args["success"]
                    .as_bool()
                    .ok_or_else(|| error("invalid", "Missing access ACK success"))?,
            )?;
            Ok(Value::Null)
        }
        "debug_access_begin" => session.begin(
            args["action"].clone(),
            std::collections::HashSet::from([window.to_string()]),
            &token()?,
        ),
        "debug_access_ack" => {
            session.acknowledge(
                field(args, "operationId")?,
                window,
                args["success"].as_bool().unwrap_or(false),
            )?;
            Ok(Value::Null)
        }
        "debug_access_finish" => {
            let (result, _) = session.finish(
                field(args, "operationId")?,
                &std::collections::HashSet::from([window.to_string()]),
                args["timeout"].as_bool().unwrap_or(false),
            )?;
            result
        }
        "debug_stage_document" => {
            let stage = match field(args, "kind")? {
                "archive" => session.stage_archive(&token()?)?,
                "attachment" => session.stage_attachment(field(args, "id")?, &token()?)?.0,
                "import" => session.import_stage(&token()?)?,
                _ => return Err(error("invalid", "Unknown stage kind")),
            };
            let data = std::fs::read(stage.path())
                .ok()
                .map(|data| B64.encode(data));
            let value = json!({"path":stage.path(), "data":data});
            drop(stage);
            Ok(value)
        }
        "get_data_management" => session.data_management(&token()?),
        "export_attachment" => serde_json::to_value(session.export_attachment(
            field(args, "id")?,
            std::path::Path::new(field(args, "path")?),
            &token()?,
        )?)
        .map_err(Into::into),
        "export_archive" => {
            session.export_archive(std::path::Path::new(field(args, "path")?), &token()?)?;
            Ok(Value::Null)
        }
        // Explicit single synthetic participant. Exercise the real preflight,
        // prepare, ACK and finish methods; this is not a multiwindow OS proof.
        "import_archive" => {
            let participants = std::collections::HashSet::from([window.to_string()]);
            let event = session.begin(
                json!({"type":"importArchive", "path":field(args, "path")?}),
                participants.clone(),
                &token()?,
            )?;
            let operation = event["operationId"]
                .as_str()
                .ok_or_else(|| error("internal", "Missing prepare operation"))?;
            session.acknowledge(operation, window, true)?;
            let (result, _) = session.finish(operation, &participants, false)?;
            result
        }
        "read_note_text" => {
            let id = field(args, "id")?;
            session.sensitive(id, &token()?)?;
            session.tagged(session.store.note_text(id)?)
        }
        "store_attachment_operation" => {
            let bytes = B64
                .decode(field(args, "data")?)
                .map_err(|_| error("invalid", "Invalid base64 bytes"))?;
            let recorded_at = match args.get("recordedAt") {
                None | Some(Value::Null) => None,
                Some(v) => Some(
                    v.as_u64()
                        .ok_or_else(|| error("invalid", "Invalid recordedAt"))?,
                ),
            };
            session.store_attachment_operation(
                window,
                field(args, "operationId")?,
                field(args, "noteId")?,
                field(args, "name")?,
                field(args, "mime")?,
                &bytes,
                &token()?,
                recorded_at,
            )
        }
        "query_attachment_operation" => session.query_attachment_operation(
            window,
            field(args, "operationId")?,
            field(args, "noteId")?,
            &token()?,
        ),
        "cancel_attachment_operation" => session.cancel_attachment_operation(
            window,
            field(args, "operationId")?,
            field(args, "noteId")?,
            &token()?,
        ),
        "read_attachment" => {
            let id = field(args, "id")?;
            let note = session.store.attachment_note(id)?;
            session.sensitive(&note, &token()?)?;
            session.tagged(session.store.read_attachment(id)?)
        }
        _ => Err(error(
            "transport_unsupported",
            "Unsupported attachment transport command",
        )),
    }
}

use std::{
    collections::HashSet,
    sync::atomic::{AtomicUsize, Ordering},
    sync::{Arc, Condvar, Mutex},
};
use sync::adapter::{Runtime, WindowHost};
struct StdinWindows {
    windows: Mutex<HashSet<String>>,
    events: Mutex<Vec<Value>>,
}
impl WindowHost for StdinWindows {
    fn participants(&self) -> HashSet<String> {
        self.windows.lock().unwrap().clone()
    }
    fn emit(&self, name: &str, payload: &Value) -> Result<()> {
        let mut events = self
            .events
            .lock()
            .map_err(|_| error("internal", "Event queue unavailable"))?;
        if events.len() >= 4096 {
            return Err(error("limit", "Event queue full"));
        }
        events.push(json!({"name":name,"payload":payload}));
        Ok(())
    }
}
mod local_recordings {
    include!("current/recording_local_core.rs");
    #[derive(Default)]
    pub(super) struct Transport(Registry);
    impl Transport {
        pub(super) fn command(&mut self, row: &Value) -> crate::store::Result<Value> {
            let args = &row["args"];
            let window = super::field(row, "window")?;
            let session = super::field(args, "sessionId")?;
            let operation = super::field(args, "operationId")?;
            let failed = |message: String| super::error("recording_identity", &message);
            if row["command"] == "register_recording_local" {
                return serde_json::to_value(
                    register_local(&mut self.0, session.into(), operation.into(), window)
                        .map_err(failed)?,
                )
                .map_err(Into::into);
            }
            let incarnation = super::field(args, "incarnation")?;
            match super::field(row, "command")? {
                "recording_local_validate" => {
                    local_entry(&mut self.0, session, operation, incarnation, window)
                        .map_err(failed)?;
                }
                "recording_local_started" => {
                    let entry = local_entry(&mut self.0, session, operation, incarnation, window)
                        .map_err(failed)?;
                    if entry.started || entry.final_ack {
                        return Err(failed("录音会话已经开始".into()));
                    }
                    entry.started = true;
                }
                "recording_local_revision" => {
                    acknowledge_local(
                        &mut self.0,
                        session,
                        operation,
                        incarnation,
                        window,
                        args["revision"]
                            .as_u64()
                            .ok_or_else(|| super::error("invalid", "Missing recording revision"))?,
                        args["finalIntent"].as_bool().ok_or_else(|| {
                            super::error("invalid", "Missing recording finalIntent")
                        })?,
                    )
                    .map_err(failed)?;
                }
                "recording_local_release" => {
                    release_local(
                        &mut self.0,
                        session,
                        operation,
                        incarnation,
                        window,
                        args["saved"]
                            .as_bool()
                            .ok_or_else(|| super::error("invalid", "Missing recording saved"))?,
                        args["revision"]
                            .as_u64()
                            .ok_or_else(|| super::error("invalid", "Missing recording revision"))?,
                    )
                    .map_err(failed)?;
                }
                _ => {
                    return Err(super::error(
                        "transport_unsupported",
                        "Unsupported recording command",
                    ))
                }
            }
            Ok(Value::Null)
        }
    }
}
fn workspace_barrier(
    shared: &sync::adapter::SharedSession,
    host: &StdinWindows,
    row: &Value,
) -> Result<Value> {
    let expected = serde_json::from_value(row["args"]["expected"].clone())?;
    let mut session = shared
        .0
        .lock()
        .map_err(|_| error("internal", "Session unavailable"))?;
    let live = host.participants();
    if !live.contains(field(row, "window")?) {
        return Err(error(
            "access_changed",
            "Access caller is not a live document participant",
        ));
    }
    let event = session.begin(row["args"]["action"].clone(), live, &expected)?;
    let operation = field(&event, "operationId")?.to_string();
    if host.emit("notes-access", &event).is_err() {
        if let Some(p) = session.pending.as_mut() {
            p.failure = Some("无法通知所有窗口，锁定未执行".into());
        }
    }
    let (mut session, wait) = shared
        .1
        .wait_timeout_while(session, std::time::Duration::from_secs(10), |s| !s.ready())
        .map_err(|_| error("internal", "Session unavailable"))?;
    let (result, event) = session.finish(&operation, &host.participants(), wait.timed_out())?;
    let metadata = session.take_metadata_event();
    drop(session);
    host.emit("notes-access", &event)?;
    if let Some(event) = metadata {
        host.emit("notes-metadata", &event)?;
    }
    result
}
fn respond(output: &Mutex<()>, host: &StdinWindows, row: &Value, result: Result<Value>) {
    let _output = output.lock().unwrap();
    let events = std::mem::take(&mut *host.events.lock().unwrap());
    let response = match result {
        Ok(value) => json!({"requestId":row["requestId"],"ok":true,"value":value,"events":events}),
        Err(e) => json!({"requestId":row["requestId"],"ok":false,"error":e,"events":events}),
    };
    println!("{response}");
    let _ = io::stdout().flush();
}
fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    let root = std::path::PathBuf::from(
        std::env::args()
            .nth(1)
            .ok_or("Synthetic directory required")?,
    );
    let shared = Arc::new((
        Mutex::new(Session::new(Store::open(&root).map_err(|e| e.message)?)),
        Condvar::new(),
    ));
    let host = Arc::new(StdinWindows {
        windows: Mutex::new(HashSet::from(["main".into()])),
        events: Mutex::new(vec![]),
    });
    let runtime = Runtime::new(shared.clone(), root, host.clone()).map_err(|e| e.message)?;
    let output = Arc::new(Mutex::new(()));
    let inflight = Arc::new(AtomicUsize::new(0));
    let mut workers = vec![];
    let mut local_recordings = local_recordings::Transport::default();
    for line in io::stdin().lock().lines() {
        let line = line?;
        if line.len() > 20 * 1024 * 1024 {
            return Err("Bounded request exceeded".into());
        }
        let row: Value = serde_json::from_str(&line)?;
        workers.retain(|worker: &std::thread::JoinHandle<()>| !worker.is_finished());
        if row["command"] == "sync_command"
            || (row["command"] == "workspace_action"
                && Session::requires_barrier(&row["args"]["action"]))
        {
            if inflight.fetch_add(1, Ordering::AcqRel) >= 4 {
                inflight.fetch_sub(1, Ordering::AcqRel);
                respond(
                    &output,
                    &host,
                    &row,
                    Err(error("busy", "Too many local commands")),
                );
                continue;
            }
            let runtime = runtime.clone();
            let host = host.clone();
            let output = output.clone();
            let inflight = inflight.clone();
            let shared = shared.clone();
            workers.push(std::thread::spawn(move || {
                let result = (|| {
                    if row["command"] == "workspace_action" {
                        return workspace_barrier(&shared, &host, &row);
                    }
                    let command = serde_json::from_value(row["args"]["command"].clone())?;
                    let expected = serde_json::from_value(row["args"]["expected"].clone())?;
                    runtime.command(command, field(&row, "window")?, &expected)
                })();
                respond(&output, &host, &row, result);
                inflight.fetch_sub(1, Ordering::AcqRel);
            }));
            continue;
        }
        let result = (|| -> Result<Value> {
            match field(&row, "command")? {
                "poll_events" => Ok(Value::Null),
                "register_recording_local"
                | "recording_local_validate"
                | "recording_local_started"
                | "recording_local_revision"
                | "recording_local_release" => {
                    let _session = shared.0.lock().unwrap();
                    if !host.participants().contains(field(&row, "window")?) {
                        return Err(error(
                            "recording_identity",
                            "Recording owner is not a live document participant",
                        ));
                    }
                    local_recordings.command(&row)
                }
                "set_document_participants" => {
                    let windows: Vec<String> =
                        serde_json::from_value(row["args"]["windows"].clone())?;
                    let unique = windows.iter().cloned().collect::<HashSet<_>>();
                    if windows.len() > 64
                        || windows.len() != unique.len()
                        || windows.iter().any(|w| {
                            w != "main"
                                && (!w.starts_with("note-")
                                    || w.len() > 128
                                    || w.chars().any(char::is_control))
                        })
                    {
                        return Err(error("invalid", "Invalid document participants"));
                    }
                    let _session = shared.0.lock().unwrap();
                    *host.windows.lock().unwrap() = unique;
                    Ok(Value::Null)
                }
                "sync_window_reply" => {
                    let reply = serde_json::from_value(row["args"]["reply"].clone())?;
                    let expected = serde_json::from_value(row["args"]["expected"].clone())?;
                    runtime.reply(field(&row, "window")?, reply, &expected)
                }
                "headless_apply" => {
                    let mut s = shared.0.lock().unwrap();
                    if !host.participants().is_empty() {
                        return Err(error(
                            "transport_unsupported",
                            "Headless apply requires no windows",
                        ));
                    }
                    let report = s.store.sync_apply_pending()?;
                    Ok(serde_json::to_value(report)?)
                }
                _ => {
                    let mut s = shared.0.lock().unwrap();
                    let result = command(&mut s, &row, &host);
                    if row["command"] == "acknowledge_access" {
                        shared.1.notify_all();
                    }
                    if let Some(event) = s.take_metadata_event() {
                        host.emit("notes-metadata", &event)?;
                    }
                    result
                }
            }
        })();
        respond(&output, &host, &row, result);
    }
    for worker in workers {
        let _ = worker.join();
    }
    runtime.shutdown().map_err(|e| e.message)?;
    Ok(())
}
