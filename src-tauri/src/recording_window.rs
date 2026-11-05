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
    child_destroyed: bool,
    docked: bool,
}
struct Quit {
    id: String,
    participants: HashSet<String>,
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
        #[cfg(desktop)]
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
            child_destroyed: false,
            docked: false,
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

// Keep routing and lifecycle transitions together so the actual invoking owner
// is still authenticated before a late terminal ACK can release a tombstone.
fn route_message(
    registry: &mut Registry,
    session_id: &str,
    operation_id: &str,
    message: Value,
    caller: &str,
) -> Result<(String, Value, bool), String> {
    let entry = entry(registry, session_id, operation_id)?;
    if !entry.owner_alive {
        return Err("原笔记窗口已失去连接，音频仍保留，请勿退出应用".into());
    }
    let kind = message["kind"].as_str().ok_or("录音消息无效")?;
    let (from, destination) = if caller == entry.identity.owner {
        if !["owner-status", "action", "presentation-result"].contains(&kind) {
            return Err("录音消息方向无效".into());
        }
        if kind == "owner-status"
            && ["saved", "discarded"].contains(&message["status"].as_str().unwrap_or(""))
        {
            entry.terminal = true;
        }
        ("owner", entry.identity.child.clone())
    } else if caller == entry.identity.child {
        if ![
            "hello",
            "state",
            "submit",
            "cancel",
            "reveal",
            "presentation",
        ]
        .contains(&kind)
        {
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
    let settled = entry.terminal && entry.child_destroyed;
    if settled {
        registry.entries.remove(session_id);
    }
    Ok((destination, value, settled))
}

fn visibility_target(
    registry: &mut Registry,
    session_id: &str,
    operation_id: &str,
    message: &Value,
    caller: &str,
) -> Result<(String, bool, bool), String> {
    let recording = entry(registry, session_id, operation_id)?;
    if caller != recording.identity.owner || !recording.owner_alive || recording.child_destroyed {
        return Err("不是本次录音的原窗口，不能切换显示".into());
    }
    let visible = message["visible"].as_bool().ok_or("录音可见性无效")?;
    let (target, child) = match message["target"].as_str() {
        Some("owner") if visible => (recording.identity.owner.clone(), false),
        Some("child") => (recording.identity.child.clone(), true),
        _ => return Err("录音显示目标无效".into()),
    };
    Ok((target, visible, child))
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
    // Visibility is a dedicated, authenticated operation on the fixed pair.
    // It never broadcasts, adopts another label or changes capture ownership.
    if message["kind"] == "visibility" {
        let (target, visible, child) = visibility_target(
            &mut registry,
            &session_id,
            &operation_id,
            &message,
            window.label(),
        )?;
        drop(registry);
        let target = app.get_webview_window(&target).ok_or("原录音窗口不可用")?;
        if visible {
            target.show().map_err(|_| "无法显示原录音窗口")?;
            #[cfg(desktop)]
            target.unminimize().map_err(|_| "无法恢复原录音窗口")?;
            target.set_focus().map_err(|_| "无法激活原录音窗口")?;
        } else {
            target.hide().map_err(|_| "无法隐藏浮动录音窗口")?;
        }
        if child {
            if let Ok(mut registry) = state.0.lock() {
                if let Ok(recording) = entry(&mut registry, &session_id, &operation_id) {
                    recording.docked = !visible;
                }
            }
        }
        return Ok(());
    }
    let (destination, value, settled_destroyed) = route_message(
        &mut registry,
        &session_id,
        &operation_id,
        message,
        window.label(),
    )?;
    drop(registry);
    if settled_destroyed {
        // The authenticated owner ACK has settled a child that no longer has
        // a renderer. There is no recipient to notify or second Destroyed.
        return Ok(());
    }
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
fn cancel_changed_participants(
    registry: &mut Registry,
    current: &HashSet<String>,
) -> Option<String> {
    if registry
        .quit
        .as_ref()
        .is_some_and(|quit| &quit.participants != current)
    {
        registry.quit.take().map(|quit| quit.id)
    } else {
        None
    }
}
fn document_windows(app: &tauri::AppHandle) -> HashSet<String> {
    app.webview_windows()
        .into_keys()
        .filter(|label| document_window(label))
        .collect()
}
fn notify_quit_cancelled(app: &tauri::AppHandle, id: &str) {
    let _ = app.emit("notes-recording-quit-cancelled", json!({"id":id}));
    let state = app.state::<Recordings>();
    let hidden_children: HashSet<String> = state
        .0
        .lock()
        .map(|registry| {
            registry
                .entries
                .values()
                .filter(|entry| entry.docked && entry.owner_alive)
                .map(|entry| entry.identity.child.clone())
                .collect()
        })
        .unwrap_or_default();
    for window in app.webview_windows().into_values() {
        if !hidden_children.contains(window.label()) {
            let _ = window.show();
        }
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
        notify_quit_cancelled(&app, &id);
        return Ok(());
    }
    if let Some(cancelled) = cancel_changed_participants(&mut registry, &document_windows(&app)) {
        drop(registry);
        notify_quit_cancelled(&app, &cancelled);
        return Err("文档窗口已改变，本次退出已取消".into());
    }
    registry
        .quit
        .as_mut()
        .unwrap()
        .waiting
        .remove(window.label());
    let exit = may_exit(&mut registry);
    drop(registry);
    if exit {
        app.exit(0);
    }
    Ok(())
}

fn mark_child_destroyed(registry: &mut Registry, label: &str) -> Option<(String, Value)> {
    let child = registry
        .entries
        .iter()
        .find(|(_, entry)| entry.identity.child == label)
        .map(|(id, _)| id.clone());
    if let Some(id) = child {
        if let Some(mut entry) = registry.entries.remove(&id) {
            entry.child_destroyed = true;
            let notification = (
                entry.identity.owner.clone(),
                envelope(&entry, "host", json!({"kind":"child-closed"})),
            );
            if !entry.terminal {
                registry.quit = None;
                // A lost child is not evidence of an audio/document ACK. Keep
                // the process guard and original owner until explicitly safe.
                registry.entries.insert(id, entry);
            }
            return Some(notification);
        }
    }
    None
}

pub fn destroyed(app: &tauri::AppHandle, label: &str) {
    let Some(state) = app.try_state::<Recordings>() else {
        return;
    };
    let Ok(mut registry) = state.0.lock() else {
        return;
    };
    let quit_before = registry.quit.as_ref().map(|quit| quit.id.clone());
    let mut notifications = Vec::new();
    if let Some(notification) = mark_child_destroyed(&mut registry, label) {
        notifications.push(notification);
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
    cancel_changed_participants(&mut registry, &document_windows(app));
    let cancelled = quit_before.filter(|_| registry.quit.is_none());
    let exit = may_exit(&mut registry);
    drop(registry);
    if let Some(id) = cancelled {
        notify_quit_cancelled(app, &id);
    }
    for (label, event) in notifications {
        if event["message"]["kind"] == "owner-lost" {
            if let Some(child) = app.get_webview_window(&label) {
                let _ = child.show();
                #[cfg(desktop)]
                let _ = child.unminimize();
            }
        }
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
    if registry.exit_allowed || (registry.entries.is_empty() && registry.quit.is_none()) {
        return;
    }
    api.prevent_exit();
    if registry.quit.is_some() {
        return;
    }
    let id = uuid::Uuid::new_v4().to_string();
    let waiting = document_windows(app);
    registry.quit = Some(Quit {
        id: id.clone(),
        participants: waiting.clone(),
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
            notify_quit_cancelled(&app, &id);
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
            participants: HashSet::from(["main".into()]),
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
                child_destroyed: false,
                docked: false,
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
    fn destroyed_child_requires_authentic_late_terminal_ack_to_release_guard() {
        for terminal in ["saved", "discarded"] {
            let mut registry = Registry::default();
            registry.entries.insert(
                "session".into(),
                Entry {
                    identity: Identity {
                        session_id: "session".into(),
                        operation_id: "operation".into(),
                        owner: "main".into(),
                        child: "recording-child".into(),
                    },
                    owner_alive: true,
                    started: false,
                    terminal: false,
                    child_destroyed: false,
                    docked: false,
                },
            );
            route_message(
                &mut registry,
                "session",
                "operation",
                json!({"kind":"state","state":{"recordedAt":123}}),
                "recording-child",
            )
            .unwrap();
            assert!(registry.entries["session"].started);
            assert!(mark_child_destroyed(&mut registry, "recording-child").is_some());
            assert!(registry.entries["session"].child_destroyed);
            assert!(!registry.entries["session"].terminal);
            for status in ["failed", "saving", "unknown"] {
                route_message(
                    &mut registry,
                    "session",
                    "operation",
                    json!({"kind":"owner-status","status":status}),
                    "main",
                )
                .unwrap();
                assert!(registry.entries.contains_key("session"));
            }
            for caller in ["recording-child", "note-other"] {
                assert!(route_message(
                    &mut registry,
                    "session",
                    "operation",
                    json!({"kind":"owner-status","status":terminal}),
                    caller
                )
                .is_err());
                assert!(registry.entries.contains_key("session"));
            }
            assert!(route_message(
                &mut registry,
                "session",
                "wrong-operation",
                json!({"kind":"owner-status","status":terminal}),
                "main"
            )
            .is_err());
            registry.entries.get_mut("session").unwrap().owner_alive = false;
            assert!(route_message(
                &mut registry,
                "session",
                "operation",
                json!({"kind":"owner-status","status":terminal}),
                "main"
            )
            .is_err());
            assert!(registry.entries.contains_key("session"));
            registry.entries.get_mut("session").unwrap().owner_alive = true;
            registry.quit = Some(Quit {
                id: "quit".into(),
                participants: HashSet::from(["main".into()]),
                waiting: HashSet::from(["main".into()]),
            });
            assert!(!may_exit(&mut registry));
            route_message(
                &mut registry,
                "session",
                "operation",
                json!({"kind":"owner-status","status":terminal}),
                "main",
            )
            .unwrap();
            assert!(
                registry.entries.is_empty(),
                "only original-owner terminal ACK clears destroyed child guard"
            );
            assert!(
                !may_exit(&mut registry),
                "document Quit ACK is still mandatory"
            );
            registry.quit.as_mut().unwrap().waiting.clear();
            assert!(may_exit(&mut registry));
        }
    }
    #[test]
    fn quit_participant_changes_cancel_instead_of_reusing_old_acks() {
        for current in [
            HashSet::from(["main".into(), "note-late".into()]),
            HashSet::new(),
        ] {
            let mut registry = Registry::default();
            registry.quit = Some(Quit {
                id: "quit-original".into(),
                participants: HashSet::from(["main".into()]),
                waiting: HashSet::new(),
            });
            assert_eq!(
                cancel_changed_participants(&mut registry, &current).as_deref(),
                Some("quit-original")
            );
            assert!(registry.quit.is_none());
            assert!(
                !may_exit(&mut registry),
                "earlier successful ACKs cannot authorize changed participants"
            );
        }
        let mut registry = Registry::default();
        registry.quit = Some(Quit {
            id: "quit-stable".into(),
            participants: HashSet::from(["main".into()]),
            waiting: HashSet::new(),
        });
        assert!(
            cancel_changed_participants(&mut registry, &HashSet::from(["main".into()])).is_none()
        );
        assert!(may_exit(&mut registry));
    }
    #[test]
    fn presentation_visibility_only_original_owner_can_address_fixed_pair() {
        let mut registry = Registry::default();
        registry.entries.insert(
            "session".into(),
            Entry {
                identity: Identity {
                    session_id: "session".into(),
                    operation_id: "operation".into(),
                    owner: "main".into(),
                    child: "recording-child".into(),
                },
                owner_alive: true,
                started: true,
                terminal: false,
                child_destroyed: false,
                docked: false,
            },
        );
        for caller in ["recording-child", "note-other"] {
            assert!(visibility_target(
                &mut registry,
                "session",
                "operation",
                &json!({"target":"child","visible":false}),
                caller
            )
            .is_err());
        }
        assert!(visibility_target(
            &mut registry,
            "session",
            "wrong",
            &json!({"target":"child","visible":false}),
            "main"
        )
        .is_err());
        for message in [
            json!({"target":"owner","visible":false}),
            json!({"target":"note-other","visible":true}),
            json!({"target":"child","visible":"yes"}),
        ] {
            assert!(
                visibility_target(&mut registry, "session", "operation", &message, "main").is_err()
            );
        }
        assert_eq!(
            visibility_target(
                &mut registry,
                "session",
                "operation",
                &json!({"target":"child","visible":false}),
                "main"
            )
            .unwrap(),
            ("recording-child".into(), false, true)
        );
        assert_eq!(
            visibility_target(
                &mut registry,
                "session",
                "operation",
                &json!({"target":"owner","visible":true}),
                "main"
            )
            .unwrap(),
            ("main".into(), true, false)
        );
        registry.entries.get_mut("session").unwrap().owner_alive = false;
        assert!(visibility_target(
            &mut registry,
            "session",
            "operation",
            &json!({"target":"child","visible":true}),
            "main"
        )
        .is_err());
        registry.entries.get_mut("session").unwrap().owner_alive = true;
        registry.entries.get_mut("session").unwrap().child_destroyed = true;
        assert!(visibility_target(
            &mut registry,
            "session",
            "operation",
            &json!({"target":"child","visible":true}),
            "main"
        )
        .is_err());
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
