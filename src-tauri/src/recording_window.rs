//! Process-local recording lifetimes, never attachment journal ownership.
//! Only the actual original renderer may register/ACK its child. A destroyed
//! owner is marked lost permanently; reusing its label cannot adopt a session.
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    sync::Mutex,
};
use tauri::{Emitter, Manager, State};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Identity {
    session_id: String,
    operation_id: String,
    owner: String,
    child: String,
}
struct Entry {
    identity: Identity,
    owner_alive: bool,
    started: bool,
    terminal: bool,
}
struct Quit {
    id: String,
    waiting: HashSet<String>,
}
#[derive(Default)]
pub struct Recordings(Mutex<Registry>);
#[derive(Default)]
struct Registry {
    entries: HashMap<String, Entry>,
    quit: Option<Quit>,
    exit_allowed: bool,
}

fn canonical_uuid(value: &str) -> bool {
    uuid::Uuid::parse_str(value).is_ok_and(|id| id.hyphenated().to_string() == value)
}
pub fn recording_label(label: &str) -> bool {
    label.strip_prefix("recording-").is_some_and(canonical_uuid)
}
pub fn document_participants(windows: impl IntoIterator<Item = String>) -> HashSet<String> {
    windows
        .into_iter()
        .filter(|label| !recording_label(label))
        .collect()
}
pub fn reveal_owner(app: &tauri::AppHandle, child: &str) {
    let state = app.state::<Recordings>();
    let Ok(registry) = state.0.lock() else {
        return;
    };
    let owner = registry
        .entries
        .values()
        .find(|entry| entry.identity.child == child && entry.owner_alive)
        .map(|entry| entry.identity.owner.clone());
    drop(registry);
    if let Some(window) = owner.and_then(|label| app.get_webview_window(&label)) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
fn document_window(label: &str) -> bool {
    label == "main" || label.starts_with("note-")
}
fn envelope(entry: &Entry, from: &str, message: Value) -> Value {
    let mut value = serde_json::to_value(&entry.identity).unwrap();
    value["from"] = json!(from);
    value["message"] = message;
    value
}
fn entry<'a>(
    registry: &'a mut Registry,
    session: &str,
    operation: &str,
) -> Result<&'a mut Entry, String> {
    let entry = registry
        .entries
        .get_mut(session)
        .ok_or("原录音会话已失效，音频仍保留")?;
    if entry.identity.operation_id != operation {
        return Err("录音操作身份不匹配".into());
    }
    Ok(entry)
}

#[tauri::command]
pub fn register_recording_window(
    session_id: String,
    operation_id: String,
    window: tauri::WebviewWindow,
    state: State<Recordings>,
) -> Result<Identity, String> {
    if !document_window(window.label())
        || !canonical_uuid(&session_id)
        || !canonical_uuid(&operation_id)
    {
        return Err("录音窗口身份无效".into());
    }
    let mut registry = state.0.lock().map_err(|_| "录音会话锁错误")?;
    if registry.quit.is_some() {
        return Err("应用正在完成录音并退出，请稍候".into());
    }
    if registry.entries.contains_key(&session_id)
        || registry
            .entries
            .values()
            .any(|entry| entry.identity.owner == window.label())
    {
        return Err("原窗口已有未完成录音".into());
    }
    let identity = Identity {
        child: format!("recording-{session_id}"),
        session_id: session_id.clone(),
        operation_id,
        owner: window.label().into(),
    };
    registry.entries.insert(
        session_id,
        Entry {
            identity: identity.clone(),
            owner_alive: true,
            started: false,
            terminal: false,
        },
    );
    Ok(identity)
}

#[tauri::command]
pub fn recording_window_context(
    session_id: String,
    operation_id: String,
    window: tauri::WebviewWindow,
    state: State<Recordings>,
) -> Result<Identity, String> {
    let mut registry = state.0.lock().map_err(|_| "录音会话锁错误")?;
    let entry = entry(&mut registry, &session_id, &operation_id)?;
    if entry.identity.child != window.label() || !entry.owner_alive {
        return Err("原录音窗口身份或连接已失效".into());
    }
    Ok(entry.identity.clone())
}

#[tauri::command]
pub fn recording_window_message(
    session_id: String,
    operation_id: String,
    message: Value,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: State<Recordings>,
) -> Result<(), String> {
    let mut registry = state.0.lock().map_err(|_| "录音会话锁错误")?;
    let entry = entry(&mut registry, &session_id, &operation_id)?;
    if !entry.owner_alive {
        return Err("原笔记窗口已失去连接，音频仍保留，请勿退出应用".into());
    }
    let kind = message["kind"].as_str().ok_or("录音消息无效")?;
    let (from, destination) = if window.label() == entry.identity.owner {
        if !["owner-status", "action"].contains(&kind) {
            return Err("录音消息方向无效".into());
        }
        if kind == "owner-status"
            && ["saved", "discarded"].contains(&message["status"].as_str().unwrap_or(""))
        {
            entry.terminal = true;
        }
        ("owner", entry.identity.child.clone())
    } else if window.label() == entry.identity.child {
        if !["hello", "state", "submit", "cancel", "reveal"].contains(&kind) {
            return Err("录音消息方向无效".into());
        }
        if kind == "state" && message["state"]["recordedAt"].is_number() {
            entry.started = true;
        }
        if kind == "submit" {
            if let Some(data) = message["transfer"]["data"].as_str() {
                if data.len() > ((100 * 1024 * 1024 + 2) / 3) * 4 {
                    return Err("录音附件不能超过100 MB".into());
                }
            }
        }
        ("child", entry.identity.owner.clone())
    } else {
        return Err("不是本次录音的原窗口".into());
    };
    let value = envelope(entry, from, message);
    drop(registry);
    app.emit_to(
        tauri::EventTarget::Window { label: destination },
        "notes-recording",
        value,
    )
    .map_err(|_| "无法通知原录音窗口，请保持窗口打开".into())
}

#[tauri::command]
pub fn recording_window_finish(
    session_id: String,
    operation_id: String,
    window: tauri::WebviewWindow,
    state: State<Recordings>,
) -> Result<(), String> {
    let mut registry = state.0.lock().map_err(|_| "录音会话锁错误")?;
    let entry = entry(&mut registry, &session_id, &operation_id)?;
    if window.label() != entry.identity.child || !entry.terminal {
        return Err("原笔记尚未确认录音保存，请保持录音窗口打开".into());
    }
    Ok(())
}

/// Only for an unsuccessful WebviewWindow construction, before any capture.
#[tauri::command]
pub fn recording_window_abandon(
    session_id: String,
    operation_id: String,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: State<Recordings>,
) -> Result<(), String> {
    let mut registry = state.0.lock().map_err(|_| "录音会话锁错误")?;
    let entry = entry(&mut registry, &session_id, &operation_id)?;
    if window.label() != entry.identity.owner
        || entry.started
        || app.get_webview_window(&entry.identity.child).is_some()
    {
        return Err("录音窗口仍在使用，不能丢弃会话".into());
    }
    registry.entries.remove(&session_id);
    Ok(())
}

fn may_exit(registry: &mut Registry) -> bool {
    if registry
        .quit
        .as_ref()
        .is_some_and(|quit| quit.waiting.is_empty())
        && registry.entries.is_empty()
    {
        registry.quit = None;
        registry.exit_allowed = true;
        true
    } else {
        false
    }
}
#[tauri::command]
pub fn recording_quit_ack(
    id: String,
    success: bool,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: State<Recordings>,
) -> Result<(), String> {
    let mut registry = state.0.lock().map_err(|_| "录音会话锁错误")?;
    let quit = registry.quit.as_mut().ok_or("本次退出已取消")?;
    if quit.id != id || !quit.waiting.contains(window.label()) {
        return Err("退出确认身份已失效".into());
    }
    if !success {
        registry.quit = None;
        drop(registry);
        let _ = app.emit("notes-recording-quit-cancelled", ());
        let _ = window.show();
        return Ok(());
    }
    quit.waiting.remove(window.label());
    let exit = may_exit(&mut registry);
    drop(registry);
    if exit {
        app.exit(0);
    }
    Ok(())
}

pub fn destroyed(app: &tauri::AppHandle, label: &str) {
    let Some(state) = app.try_state::<Recordings>() else {
        return;
    };
    let Ok(mut registry) = state.0.lock() else {
        return;
    };
    let mut notifications = Vec::new();
    let child = registry
        .entries
        .iter()
        .find(|(_, entry)| entry.identity.child == label)
        .map(|(id, _)| id.clone());
    if let Some(id) = child {
        if let Some(entry) = registry.entries.remove(&id) {
            notifications.push((
                entry.identity.owner.clone(),
                envelope(&entry, "host", json!({"kind":"child-closed"})),
            ));
            if !entry.terminal {
                registry.quit = None;
                // A lost child is not evidence of an audio/document ACK. Keep
                // the process guard and original owner until explicitly safe.
                registry.entries.insert(id, entry);
            }
        }
    }
    for entry in registry
        .entries
        .values_mut()
        .filter(|entry| entry.identity.owner == label)
    {
        entry.owner_alive = false;
        notifications.push((
            entry.identity.child.clone(),
            envelope(entry, "host", json!({"kind":"owner-lost"})),
        ));
    }
    if registry
        .quit
        .as_ref()
        .is_some_and(|quit| quit.waiting.contains(label))
    {
        registry.quit = None;
    }
    let exit = may_exit(&mut registry);
    drop(registry);
    for (label, event) in notifications {
        let _ = app.emit_to(
            tauri::EventTarget::Window { label },
            "notes-recording",
            event,
        );
    }
    if exit {
        app.exit(0);
    }
}

pub fn exit_requested(app: &tauri::AppHandle, api: &tauri::ExitRequestApi) {
    let state = app.state::<Recordings>();
    let Ok(mut registry) = state.0.lock() else {
        api.prevent_exit();
        return;
    };
    if registry.exit_allowed || registry.entries.is_empty() {
        return;
    }
    api.prevent_exit();
    if registry.quit.is_some() {
        return;
    }
    let id = uuid::Uuid::new_v4().to_string();
    let waiting: HashSet<_> = app
        .webview_windows()
        .into_keys()
        .filter(|label| document_window(label))
        .collect();
    registry.quit = Some(Quit {
        id: id.clone(),
        waiting: waiting.clone(),
    });
    drop(registry);
    for label in waiting {
        let _ = app.emit_to(
            tauri::EventTarget::Window { label },
            "notes-recording-quit",
            json!({"id":id}),
        );
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(45));
        let state = app.state::<Recordings>();
        let Ok(mut registry) = state.0.lock() else {
            return;
        };
        if registry.quit.as_ref().is_some_and(|quit| quit.id == id) {
            registry.quit = None;
            drop(registry);
            let _ = app.emit("notes-recording-quit-cancelled", ());
            for window in app.webview_windows().into_values() {
                let _ = window.show();
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exact_child_labels_and_ack_gate() {
        assert!(recording_label(
            "recording-123e4567-e89b-12d3-a456-426614174000"
        ));
        for label in [
            "recording-x",
            "recording-123E4567-E89B-12D3-A456-426614174000",
            "note-recording",
            "recording-123e4567e89b12d3a456426614174000",
        ] {
            assert!(!recording_label(label));
        }
        let mut registry = Registry::default();
        assert!(!may_exit(&mut registry));
        registry.quit = Some(Quit {
            id: "quit".into(),
            waiting: HashSet::from(["main".into()]),
        });
        assert!(!may_exit(&mut registry));
        registry.quit.as_mut().unwrap().waiting.clear();
        registry.entries.insert(
            "active".into(),
            Entry {
                identity: Identity {
                    session_id: "active".into(),
                    operation_id: "op".into(),
                    owner: "main".into(),
                    child: "recording-child".into(),
                },
                owner_alive: true,
                started: true,
                terminal: true,
            },
        );
        assert!(
            !may_exit(&mut registry),
            "even an ACKed recording must finish closing before Quit"
        );
        registry.entries.clear();
        assert!(may_exit(&mut registry));
        assert!(registry.exit_allowed);
    }
    #[test]
    fn capture_child_is_not_a_document_barrier_but_original_owner_still_must_ack() {
        use crate::{
            session::{Session, Token},
            store::Store,
        };
        let labels = vec![
            "main".into(),
            "note-other".into(),
            "recording-123e4567-e89b-12d3-a456-426614174000".into(),
        ];
        let participants = document_participants(labels.clone());
        assert_eq!(
            participants,
            HashSet::from(["main".into(), "note-other".into()])
        );
        let retained =
            document_participants(vec!["recording-invalid".into(), "unknown-window".into()]);
        assert_eq!(
            retained.len(),
            2,
            "unrecognized windows are never silently removed"
        );
        let dir = tempfile::tempdir().unwrap();
        let mut session = Session::new(Store::open(dir.path()).unwrap());
        let access = session.snapshot().unwrap();
        let token = Token {
            session_id: access["sessionId"].as_str().unwrap().into(),
            epoch: access["epoch"].as_u64().unwrap(),
            note_epoch: None,
        };
        let note = session
            .ordinary(json!({"type":"createNote"}), &token)
            .unwrap()
            .0;
        let event = session
            .begin(
                json!({"type":"deleteNote", "id":note["id"]}),
                participants,
                &token,
            )
            .unwrap();
        let id = event["operationId"].as_str().unwrap();
        session.acknowledge(id, "note-other", true).unwrap();
        assert!(
            !session.ready(),
            "source owner main remains a mandatory document participant"
        );
        session.acknowledge(id, "main", true).unwrap();
        assert!(
            session.ready(),
            "a capture-only child cannot hold the access barrier open"
        );
        let (result, completed) = session
            .finish(id, &document_participants(labels), false)
            .unwrap();
        assert!(result.is_ok());
        assert_eq!(completed["phase"], "commit");
    }
}
