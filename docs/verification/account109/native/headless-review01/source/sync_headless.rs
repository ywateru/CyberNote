//! Fixed native test participant and stdio host. No WebView, authentication input,
//! generic actions, or alternate Store/Session/coordination implementation.
#![cfg(all(feature = "sync-e2e", debug_assertions, desktop))]

use crate::{
    session::{synchronization::WindowReply, Session, Token},
    store::{AppError, Result},
    sync::{
        adapter::{Command, Runtime, SharedSession, WindowHost},
        model::EntityKind,
    },
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    io::{self, BufRead, Write},
    sync::{Arc, Mutex, OnceLock, Weak},
};
use tauri::Manager;

const PREFIX: &str = "@@ACCOUNT109_HEADLESS@@";
const PARTICIPANT: &str = "account109-native-harness";
const MAX_LINE: usize = 65_536;
const MAX_REPLY: usize = 16_000_000;
const MAX_ID: u64 = 9_007_199_254_740_991;

pub fn enabled() -> bool {
    switches(
        std::env::var("NOTES_SYNC_E2E_HEADLESS").ok().as_deref(),
        std::env::var("NOTES_SYNC_E2E").ok().as_deref(),
    )
}
fn switches(headless: Option<&str>, e2e: Option<&str>) -> bool {
    headless == Some("1") && e2e == Some("1")
}
pub fn configure(config: &mut tauri::utils::config::Config) -> io::Result<()> {
    if std::env::var("NOTES_SYNC_E2E_HEADLESS").as_deref() == Ok("1") && !enabled() {
        return Err(io::Error::other("headless requires both explicit switches"));
    }
    if enabled() {
        config.app.windows.clear();
    }
    Ok(())
}
fn failure(code: &'static str) -> AppError {
    AppError {
        code: code.into(),
        message: "Native harness operation failed".into(),
        commit: None,
    }
}
fn safe_code(error: &AppError) -> &'static str {
    match error.code.as_str() {
        "access_changed" => "access_changed",
        "not_found" => "not_found",
        "sync_deferred" => "sync_deferred",
        "sync_disabled" => "sync_disabled",
        "sync_busy" => "sync_busy",
        "sync_invalid" => "sync_invalid",
        "invalid_request" => "invalid_request",
        "conflict_changed" => "conflict_changed",
        _ => "operation_failed",
    }
}

/// One real document participant: it has no editor draft or background save.
/// All mutations below hold the same Session lock through register_save/save.
/// Its probe token is retained through prepare, never supplied over stdin.
struct Participant {
    shared: SharedSession,
    runtime: OnceLock<Weak<Runtime>>,
    probe: Mutex<Option<(String, Token)>>,
}
impl Participant {
    fn new(shared: SharedSession) -> Self {
        Self {
            shared,
            runtime: OnceLock::new(),
            probe: Mutex::new(None),
        }
    }
    fn respond(&self, event: &Value) -> Result<()> {
        let phase = event["phase"].as_str().unwrap_or("");
        if !matches!(phase, "probe" | "prepare") {
            return Ok(());
        }
        let operation = event["operationId"]
            .as_str()
            .ok_or_else(|| failure("operation_failed"))?;
        let runtime = self
            .runtime
            .get()
            .and_then(Weak::upgrade)
            .ok_or_else(|| failure("operation_failed"))?;
        let mut probe = self.probe.lock().map_err(|_| failure("operation_failed"))?;
        let token = if phase == "probe" {
            let s = self
                .shared
                .0
                .lock()
                .map_err(|_| failure("operation_failed"))?;
            let token = s.sync_media_token();
            if event["sessionId"] != token.session_id {
                return Err(failure("access_changed"));
            }
            *probe = Some((operation.into(), token.clone()));
            token
        } else {
            let (id, token) = probe.as_ref().ok_or_else(|| failure("access_changed"))?;
            if id != operation || event["sessionId"] != token.session_id {
                return Err(failure("access_changed"));
            }
            token.clone()
        };
        let reply = if phase == "probe" {
            WindowReply::Probe {
                operation_id: operation.into(),
                protected_note_ids: vec![],
                blocked: false,
            }
        } else {
            WindowReply::Prepare {
                operation_id: operation.into(),
                ready: true,
            }
        };
        runtime.reply(PARTICIPANT, reply, &token)?;
        Ok(())
    }
}

pub struct Host {
    app: tauri::AppHandle,
    participant: Participant,
}
impl Host {
    pub fn new(app: tauri::AppHandle, shared: SharedSession) -> Arc<Self> {
        Arc::new(Self {
            app,
            participant: Participant::new(shared),
        })
    }
    pub fn bind(&self, runtime: &Arc<Runtime>) -> Result<()> {
        self.participant
            .runtime
            .set(Arc::downgrade(runtime))
            .map_err(|_| failure("operation_failed"))
    }
}
impl WindowHost for Host {
    fn participants(&self) -> HashSet<String> {
        let mut live =
            crate::recording_window::document_participants(self.app.webview_windows().into_keys());
        live.insert(PARTICIPANT.into());
        live
    }
    fn emit(&self, name: &str, event: &Value) -> Result<()> {
        crate::emit_document_event(&self.app, name, event)?;
        if name == "notes-sync" {
            self.participant.respond(event)?;
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    id: u64,
    action: Action,
}
#[derive(Debug, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase", deny_unknown_fields)]
enum Action {
    Ready {},
    Workspace {},
    Conflicts {},
    AccountStatus {},
    SignOut {},
    Shutdown {},
    #[serde(rename_all = "camelCase")]
    KeepAll {
        kind: EntityKind,
        entity_id: String,
        digest: String,
        keep_all: bool,
    },
    ReadAttachment {
        id: String,
    },
    CreatePlainNote {
        title: String,
        text: String,
    },
}
fn synthetic(value: &str, max: usize) -> bool {
    value.starts_with("account109-") && value.len() <= max && !value.contains('\0')
}
fn parse(bytes: &[u8], previous: &mut u64) -> std::result::Result<Request, &'static str> {
    if bytes.len() > MAX_LINE || bytes.last() != Some(&b'\n') {
        return Err("invalid_request");
    }
    let request: Request = serde_json::from_slice(bytes).map_err(|_| "invalid_request")?;
    if request.id == 0 || request.id > MAX_ID || request.id <= *previous {
        return Err("invalid_id");
    }
    let valid = match &request.action {
        Action::KeepAll {
            entity_id,
            digest,
            keep_all,
            ..
        } => {
            *keep_all
                && crate::sync::model::valid_uuid(entity_id)
                && crate::sync::model::valid_hash(digest)
        }
        Action::ReadAttachment { id } => crate::sync::model::valid_uuid(id),
        Action::CreatePlainNote { title, text } => synthetic(title, 256) && synthetic(text, 16_000),
        _ => true,
    };
    if !valid {
        return Err("invalid_request");
    }
    *previous = request.id;
    Ok(request)
}
// Allocation is bounded before accepting a record, including LF. Oversize and
// truncated streams terminate the host; no arbitrary bytes are logged or echoed.
fn line(reader: &mut impl BufRead) -> io::Result<Option<Vec<u8>>> {
    let mut bytes = Vec::new();
    loop {
        let part = reader.fill_buf()?;
        if part.is_empty() {
            return if bytes.is_empty() {
                Ok(None)
            } else {
                Err(io::Error::other("partial record"))
            };
        }
        let end = part.iter().position(|b| *b == b'\n');
        let count = end.map_or(part.len(), |n| n + 1);
        if bytes.len() + count > MAX_LINE {
            return Err(io::Error::other("record limit"));
        }
        bytes.extend_from_slice(&part[..count]);
        reader.consume(count);
        if end.is_some() {
            return Ok(Some(bytes));
        }
    }
}
fn output(value: Value) -> io::Result<()> {
    let bytes = serde_json::to_vec(&value).map_err(io::Error::other)?;
    if bytes.len() > MAX_REPLY {
        return Err(io::Error::other("reply limit"));
    }
    let mut out = io::stdout().lock();
    out.write_all(PREFIX.as_bytes())?;
    out.write_all(&bytes)?;
    out.write_all(b"\n")?;
    out.flush()
}
fn error(id: Value, code: &str) -> Value {
    json!({"type":"response","id":id,"ok":false,"error":{"code":code}})
}
fn token(s: &Session, note: Option<&str>) -> Result<Token> {
    let snapshot = s.snapshot()?;
    Ok(Token {
        session_id: snapshot["sessionId"]
            .as_str()
            .ok_or_else(|| failure("operation_failed"))?
            .into(),
        epoch: snapshot["epoch"]
            .as_u64()
            .ok_or_else(|| failure("operation_failed"))?,
        note_epoch: note
            .map(|id| {
                snapshot["notes"][id]["epoch"]
                    .as_u64()
                    .ok_or_else(|| failure("access_changed"))
            })
            .transpose()?,
    })
}
fn attachment(s: &Session, id: &str) -> Result<Value> {
    let owner = s.store.attachment_note(id)?;
    let expected = token(s, Some(&owner))?;
    s.sensitive(&owner, &expected)?;
    s.tagged(s.store.read_attachment(id)?)
}
fn create(s: &mut Session, title: &str, text: &str) -> Result<Value> {
    if !synthetic(title, 256) || !synthetic(text, 16_000) {
        return Err(failure("invalid_request"));
    }
    let expected = token(s, None)?;
    let (note, _) = s.ordinary(json!({"type":"createNote"}), &expected)?;
    let id = note["id"]
        .as_str()
        .ok_or_else(|| failure("operation_failed"))?;
    let expected = token(s, Some(id))?;
    let intent = uuid::Uuid::new_v4().to_string();
    s.register_save(PARTICIPANT, id, &intent, expected)?;
    s.save(
        PARTICIPANT,
        json!({"type":"saveNote","id":id,"revision":note["revision"],"saveIntent":intent,
        "document":{"type":"doc","content":[
            {"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":title}]},
            {"type":"paragraph","content":[{"type":"text","text":text}]}]}}),
    )
}
fn existing_conflict(rows: &Value, kind: &EntityKind, entity: &str, digest: &str) -> bool {
    rows["conflicts"].as_array().is_some_and(|rows| {
        rows.iter().any(|row| {
            row["kind"] == kind.as_str()
                && row["entityId"] == entity
                && row["variants"]
                    .as_array()
                    .is_some_and(|vs| vs.iter().any(|v| v["digest"] == digest))
        })
    })
}
fn dispatch(app: &tauri::AppHandle, action: Action) -> Result<Value> {
    let state = app.state::<crate::AppState>();
    let sync = app.state::<crate::SyncState>().0.clone();
    match action {
        Action::Ready {} => {
            if !app.webview_windows().is_empty() {
                return Err(failure("operation_failed"));
            }
            Ok(
                json!({"protocol":1,"participant":PARTICIPANT,"transport":"native-session-stdio","windows":0}),
            )
        }
        Action::Workspace {} => state
            .0
             .0
            .lock()
            .map_err(|_| failure("operation_failed"))?
            .workspace(),
        Action::ReadAttachment { id } => attachment(
            &*state.0 .0.lock().map_err(|_| failure("operation_failed"))?,
            &id,
        ),
        Action::CreatePlainNote { title, text } => {
            let (result, metadata) = {
                let mut s = state.0 .0.lock().map_err(|_| failure("operation_failed"))?;
                let result = create(&mut s, &title, &text);
                (result, s.take_metadata_event())
            };
            if let Some(event) = metadata {
                crate::emit_document_event(app, "notes-metadata", &event)?;
            }
            result
        }
        Action::Conflicts {} | Action::KeepAll { .. } => {
            let expected = token(
                &*state.0 .0.lock().map_err(|_| failure("operation_failed"))?,
                None,
            )?;
            let rows = sync.command(Command::Conflicts {}, PARTICIPANT, &expected)?;
            if let Action::KeepAll {
                kind,
                entity_id,
                digest,
                keep_all,
            } = action
            {
                if !keep_all || !existing_conflict(&rows, &kind, &entity_id, &digest) {
                    return Err(failure("conflict_changed"));
                }
                sync.command(
                    Command::Resolve {
                        kind,
                        entity_id,
                        digest,
                        keep_all: true,
                    },
                    PARTICIPANT,
                    &expected,
                )
            } else {
                Ok(rows)
            }
        }
        Action::AccountStatus {} | Action::SignOut {} => {
            let account = app.state::<crate::AccountState>().0.clone();
            let command = if matches!(action, Action::SignOut {}) {
                crate::account::types::Command::SignOut {}
            } else {
                crate::account::types::Command::Status {}
            };
            tauri::async_runtime::block_on(account.command(command))
                .map_err(|_| failure("operation_failed"))
                .and_then(|status| {
                    serde_json::to_value(status).map_err(|_| failure("operation_failed"))
                })
        }
        Action::Shutdown {} => Ok(json!({"requested":true})),
    }
}
fn serve(app: &tauri::AppHandle) -> io::Result<()> {
    output(
        json!({"type":"hello","protocol":1,"pid":std::process::id(),"transport":"native-session-stdio","participant":PARTICIPANT}),
    )?;
    let mut reader = io::stdin().lock();
    let mut previous = 0;
    loop {
        let bytes = match line(&mut reader) {
            Ok(Some(bytes)) => bytes,
            Ok(None) => return Ok(()),
            Err(_) => {
                output(error(Value::Null, "input_error"))?;
                return Ok(());
            }
        };
        let request = match parse(&bytes, &mut previous) {
            Ok(request) => request,
            Err(code) => {
                output(error(Value::Null, code))?;
                return Ok(());
            }
        };
        let shutdown = matches!(request.action, Action::Shutdown {});
        let response = match dispatch(app, request.action) {
            Ok(value) => json!({"type":"response","id":request.id,"ok":true,"value":value}),
            Err(e) => error(json!(request.id), safe_code(&e)),
        };
        output(response)?;
        if shutdown {
            return Ok(());
        }
    }
}
pub fn start(app: &tauri::AppHandle) -> io::Result<()> {
    if !enabled() {
        return Ok(());
    }
    if !app.webview_windows().is_empty() {
        return Err(io::Error::other("headless requires zero windows"));
    }
    let app = app.clone();
    std::thread::Builder::new()
        .name("account109-native-stdin".into())
        .spawn(move || {
            let _ = serve(&app);
            // ExitRequested follows normal recording/account cancellation, then Exit
            // stops Media and Sync. A shutdown reply is never a cleanup receipt.
            app.exit(0);
        })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Store;
    use std::{
        io::Cursor,
        sync::Condvar,
        time::{Duration, Instant},
    };

    fn session(path: &std::path::Path) -> SharedSession {
        Arc::new((
            Mutex::new(Session::new(Store::open(path).unwrap())),
            Condvar::new(),
        ))
    }
    #[test]
    fn both_explicit_switches_are_required() {
        for a in [None, Some(""), Some("0"), Some("true"), Some("1")] {
            for b in [None, Some(""), Some("0"), Some("true"), Some("1")] {
                assert_eq!(switches(a, b), a == Some("1") && b == Some("1"));
            }
        }
    }
    #[test]
    fn strict_protocol_rejects_injection_unknown_duplicate_and_illegal_ids() {
        let mut previous = 0;
        assert!(parse(b"{\"id\":1,\"action\":{\"op\":\"ready\"}}\n", &mut previous).is_ok());
        for input in [
            "{\"id\":1,\"action\":{\"op\":\"workspace\"}}\n",
            "{\"id\":0,\"action\":{\"op\":\"workspace\"}}\n",
            "{\"id\":9007199254740992,\"action\":{\"op\":\"ready\"}}\n",
            "{\"id\":2.5,\"action\":{\"op\":\"ready\"}}\n",
            "{\"id\":2,\"id\":3,\"action\":{\"op\":\"ready\"}}\n",
            "{\"id\":2,\"timeoutMs\":1,\"action\":{\"op\":\"ready\"}}\n",
            "{\"id\":2,\"action\":{\"op\":\"ready\",\"token\":\"private\"}}\n",
            "{\"id\":2,\"action\":{\"op\":\"eval\",\"expression\":\"anything\"}}\n",
            "{\"id\":2,\"action\":{\"op\":\"execute\",\"command\":\"sync_command\"}}\n",
            "{\"id\":2,\"action\":{\"op\":\"readAttachment\",\"id\":\"/private/path\"}}\n",
            "{\"id\":2,\"action\":{\"op\":\"signOut\",\"url\":\"https://example.invalid\"}}\n",
            "{\"id\":2,\"action\":{\"op\":\"createPlainNote\",\"title\":\"ordinary\",\"text\":\"account109-test\"}}\n",
        ] { assert!(parse(input.as_bytes(), &mut previous).is_err(), "{input}"); }
        assert_eq!(previous, 1);
    }
    #[test]
    fn keep_all_requires_explicit_true_canonical_entity_and_digest() {
        let id = uuid::Uuid::new_v4().to_string();
        let digest = "a".repeat(64);
        for (keep, entity, hash) in [
            (true, id.as_str(), digest.as_str()),
            (false, id.as_str(), digest.as_str()),
            (true, "../entity", digest.as_str()),
            (true, id.as_str(), "invalid"),
        ] {
            let bytes = format!(
                "{}\n",
                json!({"id":1,"action":{"op":"keepAll","kind":"note","entityId":entity,"digest":hash,"keepAll":keep}})
            );
            assert_eq!(
                parse(bytes.as_bytes(), &mut 0).is_ok(),
                keep && entity == id && hash == digest
            );
        }
        let rows =
            json!({"conflicts":[{"kind":"note","entityId":id,"variants":[{"digest":digest}]}]});
        assert!(existing_conflict(&rows, &EntityKind::Note, &id, &digest));
        assert!(!existing_conflict(&rows, &EntityKind::Folder, &id, &digest));
        assert!(!existing_conflict(
            &rows,
            &EntityKind::Note,
            &id,
            &"b".repeat(64)
        ));
    }
    #[test]
    fn line_reader_bounds_before_allocation_and_rejects_partial_eof() {
        let mut bytes = vec![b' '; MAX_LINE - 1];
        bytes.push(b'\n');
        assert_eq!(
            line(&mut Cursor::new(&bytes)).unwrap().unwrap().len(),
            MAX_LINE
        );
        bytes.insert(0, b' ');
        assert!(line(&mut Cursor::new(bytes)).is_err());
        assert!(line(&mut Cursor::new(b"partial")).is_err());
        assert!(line(&mut Cursor::new(b"")).unwrap().is_none());
    }
    #[test]
    fn synthetic_note_uses_real_session_save_and_survives_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Session::new(Store::open(dir.path()).unwrap());
        let saved = create(&mut s, "account109-title", "account109-body").unwrap();
        assert_eq!(
            saved["document"],
            json!({"type":"doc","content":[
            {"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"account109-title"}]},
            {"type":"paragraph","content":[{"type":"text","text":"account109-body"}]}]})
        );
        assert_eq!(saved["plainText"], "account109-title\naccount109-body");
        assert!(saved["access"]["sessionId"].is_string());
        assert!(create(&mut s, "ordinary", "account109-body").is_err());
        let id = saved["id"].as_str().unwrap().to_string();
        drop(s);
        let s = Session::new(Store::open(dir.path()).unwrap());
        let workspace = s.workspace().unwrap();
        let reopened = workspace["notes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|n| n["id"] == id)
            .unwrap();
        assert_eq!(reopened["document"], saved["document"]);
        assert_eq!(reopened["plainText"], saved["plainText"]);
    }
    #[test]
    fn attachment_reads_repeat_owner_authorization_and_errors_are_finite() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Session::new(Store::open(dir.path()).unwrap());
        let saved = create(&mut s, "account109-title", "account109-body").unwrap();
        let id = saved["id"].as_str().unwrap();
        let a = s
            .store
            .store_attachment(id, "test.bin", "application/octet-stream", b"abc".to_vec())
            .unwrap();
        let aid = a.id.as_str();
        assert_eq!(attachment(&s, aid).unwrap()["data"], "YWJj");
        s.store
            .action(json!({"type":"deleteNote","id":id}))
            .unwrap();
        assert!(attachment(&s, aid).is_err());
        let encoded = error(
            json!(1),
            safe_code(&AppError {
                code: "private-token-or-url".into(),
                message: "private upstream response".into(),
                commit: None,
            }),
        )
        .to_string();
        assert!(encoded.contains("operation_failed"));
        assert!(!encoded.contains("private"));
    }
    struct TestHost(Participant);
    impl WindowHost for TestHost {
        fn participants(&self) -> HashSet<String> {
            HashSet::from([PARTICIPANT.into()])
        }
        fn emit(&self, name: &str, event: &Value) -> Result<()> {
            if name == "notes-sync" {
                self.0.respond(event)?;
            }
            Ok(())
        }
    }
    #[test]
    fn participant_uses_runtime_reply_and_production_final_gate_for_real_incoming_note() {
        let dir = tempfile::tempdir().unwrap();
        let shared = session(&dir.path().join("local"));
        let identity = shared.0.lock().unwrap().store.sync_enable(None).unwrap();
        let mut remote = Store::open(dir.path().join("remote")).unwrap();
        remote.sync_enable(Some(&identity.workspace_id)).unwrap();
        let created = remote.action(json!({"type":"createNote"})).unwrap();
        remote.sync_flush().unwrap();
        {
            let mut s = shared.0.lock().unwrap();
            for h in remote.sync_inventory().unwrap() {
                s.store
                    .sync_receive(vec![remote.sync_version(&h.digest).unwrap()])
                    .unwrap();
            }
            assert!(s.store.note(created["id"].as_str().unwrap()).is_err());
        }
        let host = Arc::new(TestHost(Participant::new(shared.clone())));
        let runtime = Runtime::new(shared.clone(), dir.path().join("local"), host.clone()).unwrap();
        host.0.runtime.set(Arc::downgrade(&runtime)).unwrap();
        let (event, expected) = {
            let mut s = shared.0.lock().unwrap();
            (
                s.sync_begin(host.participants(), None).unwrap(),
                token(&s, None).unwrap(),
            )
        };
        assert!(runtime
            .reply(
                "intruder",
                WindowReply::Probe {
                    operation_id: event["operationId"].as_str().unwrap().into(),
                    protected_note_ids: vec![],
                    blocked: false
                },
                &expected
            )
            .is_err());
        assert!(host
            .0
            .respond(
                &json!({"phase":"probe","sessionId":"wrong","operationId":event["operationId"]})
            )
            .is_err());
        host.0.respond(&event).unwrap();
        let deadline = Instant::now() + Duration::from_secs(4);
        loop {
            if shared
                .0
                .lock()
                .unwrap()
                .store
                .note(created["id"].as_str().unwrap())
                .is_ok()
            {
                break;
            }
            assert!(
                Instant::now() < deadline,
                "production participant did not commit"
            );
            std::thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(shared.0.lock().unwrap().sync_diagnostics()["commits"], 1);
        runtime.shutdown().unwrap();
    }
}
