//! Explicit synthetic-workspace transport. OS lifecycle remains a browser Fake.
#[path = "current/session.rs"]
mod session;
#[path = "current/store.rs"]
mod store;
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
fn command(session: &mut Session, row: &Value) -> Result<Value> {
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
                session.ordinary(action, &token()?).map(|(value, _)| value)
            }
        }
        "acknowledge_access" | "import_archive" | "export_archive" => Err(error(
            "transport_unsupported",
            "No simulated ACK/import/export barrier in attachment transport",
        )),
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
fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    let root = std::env::args()
        .nth(1)
        .ok_or("Fresh synthetic directory required")?;
    let mut session = Session::new(Store::open(root).map_err(|e| e.message)?);
    for line in io::stdin().lock().lines() {
        let line = line?;
        if line.len() > 20 * 1024 * 1024 {
            return Err("Bounded request exceeded".into());
        }
        let row: Value = serde_json::from_str(&line)?;
        let result = command(&mut session, &row);
        let events = session
            .take_metadata_event()
            .map(|event| vec![json!({"name":"notes-metadata","payload":event})])
            .unwrap_or_default();
        let response = match result {
            Ok(value) => {
                json!({"requestId":row["requestId"],"ok":true,"value":value,"events":events})
            }
            Err(error) => {
                json!({"requestId":row["requestId"],"ok":false,"error":error,"events":events})
            }
        };
        println!("{response}");
        io::stdout().flush()?;
    }
    Ok(())
}
