//! Process-local recording lifetimes, never attachment journal ownership.
//! Only the actual document renderer may register/ACK its local session. A destroyed
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
    #[cfg(test)]
    started: bool,
    terminal: bool,
    #[cfg(test)]
    revision: Option<(u64, bool)>,
    #[cfg(test)]
    checkpoint_revision: u64,
    child_destroyed: bool,
    docked: bool,
}
struct Quit {
    sealing: HashSet<String>,
    id: String,
    participants: HashSet<String>,
    waiting: HashSet<String>,
}
#[derive(Default)]
pub struct Recordings(Mutex<Registry>);
#[derive(Default)]
struct Registry {
    entries: HashMap<String, Entry>,
    local: HashMap<String, LocalEntry>,
    completed_local: HashMap<String, (LocalIdentity, bool, u64)>,
    incarnations: HashMap<String, String>,
    used_local_sessions: HashSet<String>,
    used_local_operations: HashSet<String>,
    quit: Option<Quit>,
    exit_allowed: bool,
}

/// Update installation holds this existing native recording admission boundary
/// after every document owner has finished its final recording acknowledgement.
/// It does not finish, move or reassign any active recording.
pub(crate) struct InstallRecordingLease(tauri::AppHandle);
impl Drop for InstallRecordingLease {
    fn drop(&mut self) {
        if let Ok(mut registry) = self.0.state::<Recordings>().0.lock() {
            registry.exit_allowed = false;
        }
    }
}
pub(crate) fn ensure_snapshot_idle(app: &tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<Recordings>();
    let registry = state.0.lock().map_err(|_| "录音会话锁错误")?;
    if !registry.entries.is_empty()
        || !registry.local.is_empty()
        || registry.quit.is_some()
        || registry.exit_allowed
    {
        return Err("活动录音或退出操作尚未完成，请稍后重试".into());
    }
    Ok(())
}
pub(crate) fn seal_for_install(app: &tauri::AppHandle) -> Result<InstallRecordingLease, String> {
    let state = app.state::<Recordings>();
    let mut registry = state.0.lock().map_err(|_| "录音会话锁错误")?;
    if !registry.entries.is_empty()
        || !registry.local.is_empty()
        || registry.quit.is_some()
        || registry.exit_allowed
    {
        return Err("仍有未确认录音或退出操作，安装已取消".into());
    }
    registry.exit_allowed = true;
    Ok(InstallRecordingLease(app.clone()))
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
#[cfg(test)]
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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalIdentity {
    session_id: String,
    operation_id: String,
    owner: String,
    incarnation: String,
}
struct LocalEntry {
    identity: LocalIdentity,
    owner_alive: bool,
    started: bool,
    acknowledged: u64,
    final_ack: bool,
}
fn register_local(
    registry: &mut Registry,
    session: String,
    operation: String,
    caller: &str,
) -> Result<LocalIdentity, String> {
    if !document_window(caller) || !canonical_uuid(&session) || !canonical_uuid(&operation) {
        return Err("本地录音身份无效".into());
    }
    // A lost registration response must be recoverable only by this original
    // live incarnation, with the same session/operation and before capture.
    // This exact recovery is allowed during Quit so empty cleanup can finish.
    if !registry.exit_allowed {
        if let Some(entry) = registry.local.get(&session) {
            if entry.owner_alive
                && entry.identity.owner == caller
                && entry.identity.operation_id == operation
                && registry.incarnations.get(caller) == Some(&entry.identity.incarnation)
                && !entry.started
                && entry.acknowledged == 0
                && !entry.final_ack
            {
                return Ok(entry.identity.clone());
            }
            return Err("原录音登记身份已失效或采集已开始".into());
        }
    }
    if registry.quit.is_some() || registry.exit_allowed {
        return Err("应用正在退出，请稍候".into());
    }
    if registry.used_local_sessions.contains(&session)
        || registry.used_local_operations.contains(&operation)
        || registry
            .local
            .values()
            .any(|entry| entry.identity.owner == caller)
        || registry
            .entries
            .values()
            .any(|entry| entry.identity.owner == caller)
    {
        return Err("原窗口已有未完成录音或操作身份已使用".into());
    }
    let incarnation = registry
        .incarnations
        .entry(caller.into())
        .or_insert_with(|| uuid::Uuid::new_v4().to_string())
        .clone();
    let identity = LocalIdentity {
        session_id: session.clone(),
        operation_id: operation.clone(),
        owner: caller.into(),
        incarnation,
    };
    registry.used_local_sessions.insert(session.clone());
    registry.used_local_operations.insert(operation);
    registry.local.insert(
        session,
        LocalEntry {
            identity: identity.clone(),
            owner_alive: true,
            started: false,
            acknowledged: 0,
            final_ack: false,
        },
    );
    Ok(identity)
}
fn local_entry<'a>(
    registry: &'a mut Registry,
    session: &str,
    operation: &str,
    incarnation: &str,
    caller: &str,
) -> Result<&'a mut LocalEntry, String> {
    let entry = registry
        .local
        .get_mut(session)
        .ok_or("本地录音会话已失效，音频仍保留")?;
    if !entry.owner_alive
        || entry.identity.owner != caller
        || entry.identity.operation_id != operation
        || entry.identity.incarnation != incarnation
        || registry.incarnations.get(caller).map(String::as_str) != Some(incarnation)
    {
        return Err("原录音窗口或操作身份已失效".into());
    }
    Ok(entry)
}
fn acknowledge_local(
    registry: &mut Registry,
    session: &str,
    operation: &str,
    incarnation: &str,
    caller: &str,
    revision: u64,
    final_intent: bool,
) -> Result<(), String> {
    let entry = local_entry(registry, session, operation, incarnation, caller)?;
    if !entry.started || revision == 0 {
        return Err("录音尚未开始".into());
    }
    if entry.acknowledged == revision && entry.final_ack == final_intent {
        return Ok(());
    }
    if entry.final_ack || revision != entry.acknowledged + 1 {
        return Err("录音确认版本顺序无效".into());
    }
    entry.acknowledged = revision;
    entry.final_ack = final_intent;
    Ok(())
}
fn release_local(
    registry: &mut Registry,
    session: &str,
    operation: &str,
    incarnation: &str,
    caller: &str,
    saved: bool,
    revision: u64,
) -> Result<(), String> {
    if !registry.local.contains_key(session) {
        if let Some((identity, completed_saved, completed_revision)) =
            registry.completed_local.get(session)
        {
            if identity.owner == caller
                && identity.operation_id == operation
                && identity.incarnation == incarnation
                && registry.incarnations.get(caller).map(String::as_str) == Some(incarnation)
                && *completed_saved == saved
                && *completed_revision == revision
                && !registry
                    .local
                    .values()
                    .any(|entry| entry.identity.owner == caller)
            {
                return Ok(()); // Exact cleanup receipt after a lost IPC response.
            }
        }
        return Err("本地录音清理身份已失效".into());
    }
    let entry = local_entry(registry, session, operation, incarnation, caller)?;
    if if saved {
        !entry.final_ack || revision != entry.acknowledged
    } else {
        revision != 0 || entry.acknowledged != 0 || entry.final_ack
    } {
        return Err("录音最终保存尚未确认，不能清理会话".into());
    }
    let completed = registry.local.remove(session).unwrap();
    registry
        .completed_local
        .insert(session.into(), (completed.identity, saved, revision));
    // Removing audio ownership does not acknowledge any document Quit barrier.
    Ok(())
}
#[tauri::command]
pub fn register_recording_local(
    session_id: String,
    operation_id: String,
    window: tauri::WebviewWindow,
    state: State<Recordings>,
) -> Result<LocalIdentity, String> {
    register_local(
        &mut *state.0.lock().map_err(|_| "录音会话锁错误")?,
        session_id,
        operation_id,
        window.label(),
    )
}
#[tauri::command]
pub fn recording_local_validate(
    session_id: String,
    operation_id: String,
    incarnation: String,
    window: tauri::WebviewWindow,
    state: State<Recordings>,
) -> Result<(), String> {
    local_entry(
        &mut *state.0.lock().map_err(|_| "录音会话锁错误")?,
        &session_id,
        &operation_id,
        &incarnation,
        window.label(),
    )?;
    Ok(())
}
#[tauri::command]
pub fn recording_local_started(
    session_id: String,
    operation_id: String,
    incarnation: String,
    window: tauri::WebviewWindow,
    state: State<Recordings>,
) -> Result<(), String> {
    let mut registry = state.0.lock().map_err(|_| "录音会话锁错误")?;
    let entry = local_entry(
        &mut registry,
        &session_id,
        &operation_id,
        &incarnation,
        window.label(),
    )?;
    if entry.started || entry.final_ack {
        return Err("录音会话已经开始".into());
    }
    entry.started = true;
    Ok(())
}
#[tauri::command]
pub fn recording_local_revision(
    session_id: String,
    operation_id: String,
    incarnation: String,
    revision: u64,
    final_intent: bool,
    window: tauri::WebviewWindow,
    state: State<Recordings>,
) -> Result<(), String> {
    acknowledge_local(
        &mut *state.0.lock().map_err(|_| "录音会话锁错误")?,
        &session_id,
        &operation_id,
        &incarnation,
        window.label(),
        revision,
        final_intent,
    )
}
#[tauri::command]
pub fn recording_local_release(
    session_id: String,
    operation_id: String,
    incarnation: String,
    saved: bool,
    revision: u64,
    window: tauri::WebviewWindow,
    state: State<Recordings>,
) -> Result<(), String> {
    release_local(
        &mut *state.0.lock().map_err(|_| "录音会话锁错误")?,
        &session_id,
        &operation_id,
        &incarnation,
        window.label(),
        saved,
        revision,
    )
}
#[tauri::command]
pub fn recording_quit_sealed(
    id: String,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: State<Recordings>,
) -> Result<(), String> {
    let mut registry = state.0.lock().map_err(|_| "录音会话锁错误")?;
    if let Some(cancelled) = cancel_changed_participants(&mut registry, &document_windows(&app)) {
        drop(registry);
        notify_quit_cancelled(&app, &cancelled);
        return Err("文档窗口已改变，退出已取消".into());
    }
    let participants = seal_quit_participant(&mut registry, &id, window.label())?;
    drop(registry);
    if let Some(participants) = participants {
        for label in participants {
            app.emit_to(
                tauri::EventTarget::Window { label },
                "notes-recording-quit-ready",
                json!({"id":id}),
            )
            .map_err(|_| "无法通知正文窗口")?;
        }
    }
    Ok(())
}

// Keep routing and lifecycle transitions together so the actual invoking owner
// is still authenticated before a late terminal ACK can release a tombstone.
#[cfg(test)]
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
        if kind == "owner-status" {
            let status = message["status"].as_str().unwrap_or("");
            if let Some((revision, final_intent)) = entry.revision {
                if ["checkpoint-saved", "saved", "discarded"].contains(&status) {
                    if message["revision"].as_u64() != Some(revision)
                        || (status == "saved") != final_intent
                        || status == "discarded"
                    {
                        return Err("录音版本最终确认不匹配，请保持窗口打开".into());
                    }
                    if final_intent {
                        entry.terminal = true;
                    } else {
                        entry.checkpoint_revision = revision;
                    }
                }
            } else if ["saved", "discarded"].contains(&status) {
                entry.terminal = true;
            }
        }
        ("owner", entry.identity.child.clone())
    } else if caller == entry.identity.child {
        if ![
            "hello",
            "state",
            "submit",
            "revision-submit",
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
        if kind == "revision-submit" {
            let revision = message["revision"]
                .as_u64()
                .filter(|revision| *revision > 0 && *revision <= 9_007_199_254_740_991)
                .ok_or("录音版本无效")?;
            let final_intent = match message["intent"].as_str() {
                Some("final") => true,
                Some("checkpoint") => false,
                _ => return Err("录音保存意图无效".into()),
            };
            let valid = match entry.revision {
                None => revision == 1,
                Some((current, intent)) => {
                    (revision == current && intent == final_intent)
                        || (!intent
                            && entry.checkpoint_revision == current
                            && revision == current + 1)
                }
            };
            if !valid || entry.terminal {
                return Err("录音版本保存顺序无效".into());
            }
            entry.revision = Some((revision, final_intent));
            entry.started = true;
        }
        if kind == "submit" || kind == "revision-submit" {
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

#[cfg(test)]
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

fn seal_quit_participant(
    registry: &mut Registry,
    id: &str,
    caller: &str,
) -> Result<Option<HashSet<String>>, String> {
    let quit = registry.quit.as_mut().ok_or("本次退出已取消")?;
    if quit.id != id || !quit.sealing.remove(caller) {
        return Err("退出封存身份已失效".into());
    }
    Ok(quit.sealing.is_empty().then(|| quit.participants.clone()))
}
fn acknowledge_quit_participant(
    registry: &mut Registry,
    id: &str,
    caller: &str,
) -> Result<(), String> {
    let quit = registry.quit.as_mut().ok_or("本次退出已取消")?;
    if quit.id != id || !quit.sealing.is_empty() || !quit.waiting.remove(caller) {
        return Err("退出确认身份已失效或正文尚未全部封存".into());
    }
    Ok(())
}
fn expire_quit(registry: &mut Registry, id: &str) -> bool {
    if registry.quit.as_ref().is_some_and(|quit| quit.id == id) {
        registry.quit = None;
        true
    } else {
        false
    }
}
fn cancel_destroyed_participant(registry: &mut Registry, label: &str) {
    if registry
        .quit
        .as_ref()
        .is_some_and(|quit| quit.participants.contains(label))
    {
        registry.quit = None;
    }
}

fn may_exit(registry: &mut Registry) -> bool {
    if registry
        .quit
        .as_ref()
        .is_some_and(|quit| quit.waiting.is_empty() && quit.sealing.is_empty())
        && registry.entries.is_empty()
        && registry.local.is_empty()
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
    if success && !quit.sealing.is_empty() {
        return Err("正文窗口尚未全部封存".into());
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
    acknowledge_quit_participant(&mut registry, &id, window.label())?;
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
    registry.incarnations.remove(label);
    for local in registry
        .local
        .values_mut()
        .filter(|entry| entry.identity.owner == label)
    {
        local.owner_alive = false; // A recreated label cannot inherit captured audio.
    }
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
    cancel_destroyed_participant(&mut registry, label);
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

pub fn exit_requested(app: &tauri::AppHandle, api: &tauri::ExitRequestApi) -> bool {
    let state = app.state::<Recordings>();
    let Ok(mut registry) = state.0.lock() else {
        api.prevent_exit();
        return false;
    };
    if registry.exit_allowed
        || (registry.entries.is_empty() && registry.local.is_empty() && registry.quit.is_none())
    {
        return true;
    }
    api.prevent_exit();
    if registry.quit.is_some() {
        return false;
    }
    let id = uuid::Uuid::new_v4().to_string();
    let waiting = document_windows(app);
    registry.quit = Some(Quit {
        id: id.clone(),
        participants: waiting.clone(),
        sealing: waiting.clone(),
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
        if expire_quit(&mut registry, &id) {
            drop(registry);
            notify_quit_cancelled(&app, &id);
        }
    });
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids() -> (String, String) {
        (
            uuid::Uuid::new_v4().to_string(),
            uuid::Uuid::new_v4().to_string(),
        )
    }
    fn start_local(registry: &mut Registry, owner: &str) -> LocalIdentity {
        let (s, o) = ids();
        let identity = register_local(registry, s, o, owner).unwrap();
        local_entry(
            registry,
            &identity.session_id,
            &identity.operation_id,
            &identity.incarnation,
            owner,
        )
        .unwrap()
        .started = true;
        identity
    }
    #[test]
    fn sidebar66_registration_response_loss_recovers_only_exact_live_pre_capture_identity() {
        let mut registry = Registry::default();
        let (session, operation) = ids();
        let identity =
            register_local(&mut registry, session.clone(), operation.clone(), "main").unwrap();
        let recovered =
            register_local(&mut registry, session.clone(), operation.clone(), "main").unwrap();
        assert_eq!(recovered.incarnation, identity.incarnation);
        assert_eq!(registry.local.len(), 1);
        assert!(register_local(
            &mut registry,
            session.clone(),
            operation.clone(),
            "note-other"
        )
        .is_err());
        assert!(register_local(
            &mut registry,
            session.clone(),
            uuid::Uuid::new_v4().to_string(),
            "main"
        )
        .is_err());
        assert!(register_local(
            &mut registry,
            uuid::Uuid::new_v4().to_string(),
            operation.clone(),
            "main"
        )
        .is_err());
        let original_incarnation = registry
            .incarnations
            .insert("main".into(), uuid::Uuid::new_v4().to_string())
            .unwrap();
        assert!(register_local(&mut registry, session.clone(), operation.clone(), "main").is_err());
        registry
            .incarnations
            .insert("main".into(), original_incarnation);
        registry.local.get_mut(&session).unwrap().owner_alive = false;
        assert!(register_local(&mut registry, session.clone(), operation.clone(), "main").is_err());
        registry.local.get_mut(&session).unwrap().owner_alive = true;
        registry.local.get_mut(&session).unwrap().started = true;
        assert!(register_local(&mut registry, session.clone(), operation.clone(), "main").is_err());
        registry.local.get_mut(&session).unwrap().started = false;
        quit(&mut registry, "quit-registration-loss");
        let recovered =
            register_local(&mut registry, session.clone(), operation.clone(), "main").unwrap();
        assert_eq!(recovered.incarnation, identity.incarnation);
        release_local(
            &mut registry,
            &session,
            &operation,
            &identity.incarnation,
            "main",
            false,
            0,
        )
        .unwrap();
        assert!(
            !may_exit(&mut registry),
            "empty cleanup still requires every document Quit seal and ACK"
        );
        assert!(
            register_local(&mut registry, session, operation, "main").is_err(),
            "completed registration cannot be replayed"
        );
    }
    #[test]
    fn sidebar66_local_registration_is_per_actual_owner_and_replay_safe() {
        let mut registry = Registry::default();
        let a = start_local(&mut registry, "main");
        let (s, o) = ids();
        assert!(register_local(&mut registry, s, o, "main").is_err());
        let b = start_local(&mut registry, "note-b");
        assert_ne!(a.incarnation, b.incarnation);
        for (caller, operation, incarnation) in [
            ("note-b", a.operation_id.as_str(), a.incarnation.as_str()),
            ("main", "wrong", a.incarnation.as_str()),
            ("main", a.operation_id.as_str(), "stale"),
        ] {
            assert!(
                local_entry(&mut registry, &a.session_id, operation, incarnation, caller).is_err()
            );
            assert!(release_local(
                &mut registry,
                &a.session_id,
                operation,
                incarnation,
                caller,
                false,
                0
            )
            .is_err());
        }
        release_local(
            &mut registry,
            &a.session_id,
            &a.operation_id,
            &a.incarnation,
            "main",
            false,
            0,
        )
        .unwrap();
        assert!(register_local(
            &mut registry,
            a.session_id.clone(),
            uuid::Uuid::new_v4().to_string(),
            "main"
        )
        .is_err());
        assert!(register_local(
            &mut registry,
            uuid::Uuid::new_v4().to_string(),
            a.operation_id.clone(),
            "main"
        )
        .is_err());
        let next = start_local(&mut registry, "main");
        assert!(release_local(
            &mut registry,
            &a.session_id,
            &a.operation_id,
            &a.incarnation,
            "main",
            false,
            0
        )
        .is_err());
        assert!(registry.local.contains_key(&next.session_id));
    }
    #[test]
    fn sidebar66_checkpoint_cannot_release_and_final_cleanup_requires_exact_ack() {
        let mut registry = Registry::default();
        let a = start_local(&mut registry, "main");
        assert!(release_local(
            &mut registry,
            &a.session_id,
            &a.operation_id,
            &a.incarnation,
            "main",
            true,
            1
        )
        .is_err());
        acknowledge_local(
            &mut registry,
            &a.session_id,
            &a.operation_id,
            &a.incarnation,
            "main",
            1,
            false,
        )
        .unwrap();
        for (saved, revision) in [(false, 0), (true, 1)] {
            assert!(release_local(
                &mut registry,
                &a.session_id,
                &a.operation_id,
                &a.incarnation,
                "main",
                saved,
                revision
            )
            .is_err());
        }
        assert!(acknowledge_local(
            &mut registry,
            &a.session_id,
            &a.operation_id,
            &a.incarnation,
            "main",
            3,
            true
        )
        .is_err());
        acknowledge_local(
            &mut registry,
            &a.session_id,
            &a.operation_id,
            &a.incarnation,
            "main",
            2,
            true,
        )
        .unwrap();
        acknowledge_local(
            &mut registry,
            &a.session_id,
            &a.operation_id,
            &a.incarnation,
            "main",
            2,
            true,
        )
        .unwrap();
        assert!(acknowledge_local(
            &mut registry,
            &a.session_id,
            &a.operation_id,
            &a.incarnation,
            "main",
            3,
            true
        )
        .is_err());
        assert!(release_local(
            &mut registry,
            &a.session_id,
            &a.operation_id,
            &a.incarnation,
            "main",
            true,
            1
        )
        .is_err());
        release_local(
            &mut registry,
            &a.session_id,
            &a.operation_id,
            &a.incarnation,
            "main",
            true,
            2,
        )
        .unwrap();
        assert!(registry.local.is_empty());
        release_local(
            &mut registry,
            &a.session_id,
            &a.operation_id,
            &a.incarnation,
            "main",
            true,
            2,
        )
        .unwrap();
        assert!(release_local(
            &mut registry,
            &a.session_id,
            &a.operation_id,
            &a.incarnation,
            "main",
            true,
            1
        )
        .is_err());
        let next = start_local(&mut registry, "main");
        assert!(release_local(
            &mut registry,
            &a.session_id,
            &a.operation_id,
            &a.incarnation,
            "main",
            true,
            2
        )
        .is_err());
        assert!(registry.local.contains_key(&next.session_id));
    }
    #[test]
    fn sidebar66_owner_destruction_leaves_unsafe_guard_and_new_incarnation_cannot_adopt() {
        let mut registry = Registry::default();
        let a = start_local(&mut registry, "main");
        registry.local.get_mut(&a.session_id).unwrap().owner_alive = false;
        registry.incarnations.remove("main");
        registry
            .incarnations
            .insert("main".into(), uuid::Uuid::new_v4().to_string());
        assert!(local_entry(
            &mut registry,
            &a.session_id,
            &a.operation_id,
            &a.incarnation,
            "main"
        )
        .is_err());
        assert!(release_local(
            &mut registry,
            &a.session_id,
            &a.operation_id,
            &a.incarnation,
            "main",
            false,
            0
        )
        .is_err());
        assert!(!may_exit(&mut registry));
        assert_eq!(registry.local.len(), 1);
    }
    fn quit(registry: &mut Registry, id: &str) {
        let participants = HashSet::from(["main".into(), "note-b".into()]);
        registry.quit = Some(Quit {
            id: id.into(),
            sealing: participants.clone(),
            waiting: participants.clone(),
            participants,
        });
    }
    #[test]
    fn sidebar66_local_cleanup_never_bypasses_every_document_seal_and_exact_quit_ack() {
        let mut registry = Registry::default();
        let a = start_local(&mut registry, "main");
        quit(&mut registry, "quit-a");
        assert!(acknowledge_quit_participant(&mut registry, "quit-a", "main").is_err());
        assert!(seal_quit_participant(&mut registry, "quit-a", "main")
            .unwrap()
            .is_none());
        assert!(seal_quit_participant(&mut registry, "quit-a", "main").is_err());
        assert!(seal_quit_participant(&mut registry, "quit-old", "note-b").is_err());
        assert_eq!(
            seal_quit_participant(&mut registry, "quit-a", "note-b")
                .unwrap()
                .unwrap()
                .len(),
            2
        );
        acknowledge_local(
            &mut registry,
            &a.session_id,
            &a.operation_id,
            &a.incarnation,
            "main",
            1,
            true,
        )
        .unwrap();
        release_local(
            &mut registry,
            &a.session_id,
            &a.operation_id,
            &a.incarnation,
            "main",
            true,
            1,
        )
        .unwrap();
        assert!(!may_exit(&mut registry));
        acknowledge_quit_participant(&mut registry, "quit-a", "main").unwrap();
        assert!(!may_exit(&mut registry));
        assert!(acknowledge_quit_participant(&mut registry, "quit-a", "main").is_err());
        acknowledge_quit_participant(&mut registry, "quit-a", "note-b").unwrap();
        assert!(may_exit(&mut registry));
    }
    #[test]
    fn sidebar66_acknowledged_destroyed_participant_and_expired_ids_cannot_reenter_quit() {
        let mut registry = Registry::default();
        quit(&mut registry, "quit-a");
        seal_quit_participant(&mut registry, "quit-a", "main").unwrap();
        seal_quit_participant(&mut registry, "quit-a", "note-b").unwrap();
        acknowledge_quit_participant(&mut registry, "quit-a", "note-b").unwrap();
        cancel_destroyed_participant(&mut registry, "note-b"); // Even after its ACK; same-label recreation cannot inherit it.
        assert!(registry.quit.is_none());
        assert!(!may_exit(&mut registry));
        assert!(acknowledge_quit_participant(&mut registry, "quit-a", "main").is_err());
        quit(&mut registry, "quit-b");
        assert!(!expire_quit(&mut registry, "quit-a"));
        assert!(registry.quit.is_some());
        assert!(expire_quit(&mut registry, "quit-b"));
        assert!(!may_exit(&mut registry));
        assert!(seal_quit_participant(&mut registry, "quit-b", "main").is_err());
        quit(&mut registry, "quit-c");
        assert!(acknowledge_quit_participant(&mut registry, "quit-b", "main").is_err());
    }
    #[test]
    fn finalized_revisions_require_exact_checkpoint_and_final_ack() {
        let mut registry = Registry::default();
        registry.entries.insert(
            "session".into(),
            Entry {
                identity: Identity {
                    session_id: "session".into(),
                    operation_id: "op".into(),
                    owner: "main".into(),
                    child: "child".into(),
                },
                owner_alive: true,
                started: false,
                terminal: false,
                revision: None,
                checkpoint_revision: 0,
                child_destroyed: false,
                docked: false,
            },
        );
        let send = |registry: &mut Registry, caller: &str, message: Value| {
            route_message(registry, "session", "op", message, caller)
        };
        assert!(send(
            &mut registry,
            "child",
            json!({"kind":"revision-submit","revision":2,"intent":"checkpoint"})
        )
        .is_err());
        assert!(send(
            &mut registry,
            "child",
            json!({"kind":"revision-submit","revision":1,"intent":"checkpoint"})
        )
        .is_ok());
        assert!(!registry.entries["session"].terminal);
        for ack in [
            json!({"kind":"owner-status","revision":1,"status":"saved"}),
            json!({"kind":"owner-status","revision":2,"status":"checkpoint-saved"}),
            json!({"kind":"owner-status","status":"discarded"}),
        ] {
            assert!(send(&mut registry, "main", ack).is_err());
        }
        assert!(send(
            &mut registry,
            "child",
            json!({"kind":"revision-submit","revision":2,"intent":"final"})
        )
        .is_err());
        assert!(send(
            &mut registry,
            "main",
            json!({"kind":"owner-status","revision":1,"status":"checkpoint-saved"})
        )
        .is_ok());
        assert_eq!(registry.entries["session"].checkpoint_revision, 1);
        assert!(!registry.entries["session"].terminal);
        assert!(send(
            &mut registry,
            "child",
            json!({"kind":"revision-submit","revision":2,"intent":"final"})
        )
        .is_ok());
        for ack in [
            json!({"kind":"owner-status","revision":1,"status":"checkpoint-saved"}),
            json!({"kind":"owner-status","revision":1,"status":"saved"}),
            json!({"kind":"owner-status","revision":2,"status":"checkpoint-saved"}),
        ] {
            assert!(send(&mut registry, "main", ack).is_err());
        }
        assert!(send(
            &mut registry,
            "main",
            json!({"kind":"owner-status","revision":2,"status":"saved"})
        )
        .is_ok());
        assert!(registry.entries["session"].terminal);
        assert!(send(
            &mut registry,
            "child",
            json!({"kind":"revision-submit","revision":3,"intent":"final"})
        )
        .is_err());
        assert!(send(
            &mut registry,
            "other",
            json!({"kind":"owner-status","revision":2,"status":"saved"})
        )
        .is_err());
    }
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
            sealing: HashSet::new(),
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
                revision: None,
                checkpoint_revision: 0,
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
                    revision: None,
                    checkpoint_revision: 0,
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
                sealing: HashSet::new(),
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
                sealing: HashSet::new(),
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
            sealing: HashSet::new(),
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
                revision: None,
                checkpoint_revision: 0,
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
