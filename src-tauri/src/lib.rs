mod account;
pub mod agent_access;
#[cfg(target_os = "macos")]
mod agent_adapter;
#[cfg(target_os = "macos")]
#[path = "agent_host/desktop.rs"]
mod agent_desktop;
pub mod agent_host;
#[cfg(target_os = "macos")]
#[path = "agent_host/service.rs"]
mod agent_service;
#[cfg(target_os = "macos")]
mod agent_tester;
mod apple_notes_import;
pub mod application;
mod attachment_desktop;
mod attachment_media;
mod media_permission;
mod recording_window;
mod session;
mod startup;
mod store;
mod sync;
#[cfg(all(feature = "sync-e2e", debug_assertions, desktop))]
mod sync_e2e;
#[cfg(all(feature = "sync-e2e", debug_assertions, desktop))]
mod sync_headless;
mod webview_profile;
use application::NotesApplicationService;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::{json, Value};
use session::{Session, Token};
use std::{
    path::PathBuf,
    sync::{Arc, Condvar, Mutex},
    time::Duration,
};
use store::{AppError, Result, Store};
use tauri::{Emitter, Manager, State};
struct NativeThumbnailProvider(tauri::AppHandle);
impl attachment_media::provider::ThumbnailProvider for NativeThumbnailProvider {
    fn render(
        &self,
        input: &store::attachment_media::VerifiedFile,
        mime: &str,
        pixels: u32,
        input_pixels: u64,
        authorize: &(dyn Fn() -> store::Result<()> + Sync),
    ) -> store::Result<image::RgbaImage> {
        let frame = self
            .0
            .state::<tauri_plugin_notes_media::Provider<tauri::Wry>>()
            .thumbnail(
                &input.file,
                input.stamp.bytes,
                mime,
                pixels,
                input_pixels,
                || authorize().is_err(),
            )
            .map_err(|code| store::AppError {
                code,
                message: "平台无法生成该附件缩略图".into(),
                commit: None,
            })?;
        image::RgbaImage::from_raw(frame.width, frame.height, frame.rgba).ok_or_else(|| {
            store::AppError {
                code: "invalid".into(),
                message: "平台缩略图像素无效".into(),
                commit: None,
            }
        })
    }
}
struct AppState(Arc<(Mutex<Session>, Condvar)>);
struct MediaState(Arc<attachment_media::runtime::MediaRuntime>);
struct SyncState(Arc<sync::adapter::Runtime>);
struct AccountState(Arc<account::Runtime>);
#[cfg(target_os = "macos")]
struct AgentState(Arc<agent_desktop::Desktop>);

#[tauri::command]
async fn agent_settings(
    expected: Token,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> application::ToolResult<agent_host::HostSettings> {
    #[cfg(target_os = "macos")]
    {
        return app
            .state::<AgentState>()
            .0
            .settings(&expected, window.label())
            .await;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (expected, window, app);
        Err(application::ToolError::new(
            "HOST_UNAVAILABLE",
            "Agent host is available on macOS only",
        ))
    }
}
#[tauri::command]
async fn agent_set_enabled(
    enabled: bool,
    expected: Token,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> application::ToolResult<agent_host::HostSettings> {
    #[cfg(target_os = "macos")]
    {
        return app
            .state::<AgentState>()
            .0
            .set_enabled(enabled, &expected, window.label())
            .await;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (enabled, expected, window, app);
        Err(application::ToolError::new(
            "HOST_UNAVAILABLE",
            "Agent host is available on macOS only",
        ))
    }
}
#[tauri::command]
async fn agent_create_grant(
    input: agent_host::CreateGrant,
    expected: Token,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> application::ToolResult<agent_host::CreatedGrant> {
    #[cfg(target_os = "macos")]
    {
        return app
            .state::<AgentState>()
            .0
            .create(input, &expected, window.label())
            .await;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (input, expected, window, app);
        Err(application::ToolError::new(
            "HOST_UNAVAILABLE",
            "Agent host is available on macOS only",
        ))
    }
}
#[tauri::command]
async fn agent_revoke_grant(
    grant_id: String,
    expected: Token,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> application::ToolResult<agent_host::HostSettings> {
    #[cfg(target_os = "macos")]
    {
        return app
            .state::<AgentState>()
            .0
            .revoke(&grant_id, &expected, window.label())
            .await;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (grant_id, expected, window, app);
        Err(application::ToolError::new(
            "HOST_UNAVAILABLE",
            "Agent host is available on macOS only",
        ))
    }
}
#[tauri::command]
async fn agent_bundled_adapter(
    expected: Token,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> std::result::Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        app.state::<AgentState>()
            .0
            .settings(&expected, window.label())
            .await
            .map_err(|_| "Authority")?;
        agent_adapter::bundled()
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (expected, window, app);
        Err("Unavailable".into())
    }
}
#[tauri::command]
async fn agent_tester_start(
    input: serde_json::Value,
    expected: Token,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> std::result::Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        let request: agent_adapter::TesterRequest =
            serde_json::from_value(input).map_err(|_| "Input".to_string())?;
        let input = agent_tester::Start {
            connection_id: request.connection_id,
            binary: agent_adapter::bundled()?,
            workspace_id: request.workspace_id,
            grant_id: request.grant_id,
        };
        let desktop = &app.state::<AgentState>().0;
        return desktop
            .testers
            .start(desktop, input, expected, window.label().into())
            .await
            .and_then(|v| {
                serde_json::to_value(v).map_err(|_| agent_tester::process::Failure::Protocol)
            })
            .map_err(|e| format!("{e:?}"));
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (input, expected, window, app);
        Err("Unavailable".into())
    }
}
#[tauri::command]
async fn agent_tester_call(
    input: serde_json::Value,
    expected: Token,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> std::result::Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        let input = serde_json::from_value(input).map_err(|_| "Input".to_string())?;
        return app
            .state::<AgentState>()
            .0
            .testers
            .call(input, &expected, window.label())
            .await
            .and_then(|v| {
                serde_json::to_value(v).map_err(|_| agent_tester::process::Failure::Protocol)
            })
            .map_err(|e| format!("{e:?}"));
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (input, expected, window, app);
        Err("Unavailable".into())
    }
}
#[tauri::command]
async fn agent_tester_stop(
    connection_id: String,
    expected: Token,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> std::result::Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return app
            .state::<AgentState>()
            .0
            .testers
            .stop(&connection_id, window.label(), &expected)
            .await
            .map_err(|e| format!("{e:?}"));
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (connection_id, expected, window, app);
        Err("Unavailable".into())
    }
}
struct SyncWindows(tauri::AppHandle);
impl sync::adapter::WindowHost for SyncWindows {
    fn participants(&self) -> std::collections::HashSet<String> {
        recording_window::document_participants(self.0.webview_windows().into_keys())
    }
    fn emit(&self, name: &str, payload: &Value) -> Result<()> {
        emit_document_event(&self.0, name, payload)
    }
}
// All document event producers, including synchronization, pass this boundary.
// Call only after dropping Session so media workers can recheck authorization.
fn emit_document_event(app: &tauri::AppHandle, name: &str, payload: &Value) -> Result<()> {
    let media_result = app
        .try_state::<MediaState>()
        .map(|media| media.0.event(name, payload))
        .transpose();
    // Cache IO failure must not suppress the document/access event or its ACK.
    app.emit(name, payload)
        .map_err(|_| failure("无法通知文档参与窗口"))?;
    media_result.map(|_| ())
}
#[tauri::command]
async fn acquire_attachment_source(
    id: String,
    purpose: attachment_media::runtime::Purpose,
    pixels: Option<u32>,
    expected: Token,
    window: tauri::WebviewWindow,
    media: State<'_, MediaState>,
) -> Result<Value> {
    let identity = media.0.window(window.label())?;
    media
        .0
        .acquire(identity, id, expected, purpose, pixels)
        .await
}
#[tauri::command]
fn release_attachment_source(
    lease_id: String,
    window: tauri::WebviewWindow,
    media: State<MediaState>,
) -> Result<()> {
    let identity = media.0.window(window.label())?;
    media.0.release(&identity, &lease_id)
}
#[tauri::command]
async fn clear_attachment_media_cache(
    expected: Token,
    media: State<'_, MediaState>,
) -> Result<Value> {
    let runtime = media.0.clone();
    tauri::async_runtime::spawn_blocking(move || runtime.clear_cache(&expected))
        .await
        .map_err(|_| failure("清理缩略图缓存失败"))?
}
#[tauri::command]
async fn sync_command(
    command: sync::adapter::Command,
    expected: Token,
    window: tauri::WebviewWindow,
    state: State<'_, SyncState>,
) -> Result<Value> {
    let runtime = state.0.clone();
    let label = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move || runtime.command(command, &label, &expected))
        .await
        .map_err(|_| failure("同步命令执行失败"))?
}
#[tauri::command]
fn sync_diagnostics(
    expected: Token,
    window: tauri::WebviewWindow,
    state: State<SyncState>,
) -> Result<Value> {
    state.0.diagnostics(window.label(), &expected)
}
#[tauri::command]
fn sync_window_reply(
    reply: session::synchronization::WindowReply,
    expected: Token,
    window: tauri::WebviewWindow,
    state: State<SyncState>,
) -> Result<Value> {
    state.0.reply(window.label(), reply, &expected)
}

/// Only renderer coordination replies are exposed; no agent grant or external
/// mutation can be constructed through this UI command.
#[tauri::command]
fn agent_window_reply(
    reply: application::WindowReply,
    expected: Token,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: State<AppState>,
) -> application::ToolResult<Value> {
    #[cfg(all(feature = "sync-e2e", debug_assertions, desktop))]
    let observed_reply = sync_e2e::agent_reply_value(&reply);
    let live = recording_window::document_participants(app.webview_windows().into_keys());
    let mut session = state.0 .0.lock().map_err(application::ToolError::storage)?;
    let result = NotesApplicationService::new(&mut session).external_reply(
        window.label(),
        reply,
        &expected,
        &live,
    );
    drop(session);
    #[cfg(all(feature = "sync-e2e", debug_assertions, desktop))]
    sync_e2e::agent_reply(window.label(), observed_reply, result.is_ok());
    state.0 .1.notify_all();
    result
}

#[cfg(feature = "access-boundary-proof")]
#[tauri::command]
fn proof_access_record(event: Value, window: tauri::WebviewWindow) -> Result<()> {
    use std::io::Write;
    static LOG: Mutex<u64> = Mutex::new(0);
    let mut seq = LOG.lock().map_err(|_| failure("proof log lock"))?;
    *seq += 1;
    let allowed = [
        "stage",
        "requestId",
        "command",
        "action",
        "operationId",
        "success",
        "revision",
        "code",
        "noteId",
        "epoch",
        "participantWindows",
        "editorCount",
        "hasPrivate",
        "covered",
        "url",
    ];
    let mut fields = serde_json::Map::new();
    if let Some(input) = event.as_object() {
        for key in allowed {
            if let Some(value) = input.get(key) {
                fields.insert(key.into(), value.clone());
            }
        }
    }
    let row = json!({"seq":*seq,"window":window.label(),"event":fields});
    let mut output = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("/private/tmp/notes-fix03-proof.jsonl")?;
    writeln!(output, "{row}")?;
    Ok(())
}
fn failure(message: impl Into<String>) -> AppError {
    AppError {
        code: "internal".into(),
        message: message.into(),
        commit: None,
    }
}
fn ui_session<T>(state: &AppState, operation: impl FnOnce(&mut Session) -> Result<T>) -> Result<T> {
    let mut session = state.0 .0.lock().map_err(|_| failure("数据锁错误"))?;
    NotesApplicationService::new(&mut session).ui(operation)
}
#[tauri::command]
fn load_workspace(state: State<AppState>) -> Result<Value> {
    ui_session(&state, |session| session.workspace())
}
#[tauri::command]
fn register_save_intent(
    note_id: String,
    intent: String,
    expected: Token,
    window: tauri::WebviewWindow,
    state: State<AppState>,
) -> Result<()> {
    ui_session(&state, |session| {
        session.register_save(window.label(), &note_id, &intent, expected)
    })
}
#[tauri::command]
fn acknowledge_access(
    operation_id: String,
    success: bool,
    window: tauri::WebviewWindow,
    state: State<AppState>,
) -> Result<()> {
    let result = ui_session(&state, |session| {
        session.acknowledge(&operation_id, window.label(), success)
    });
    state.0 .1.notify_all();
    result
}
async fn mutate(
    app: tauri::AppHandle,
    state: &AppState,
    window: &str,
    action: Value,
    expected: Token,
) -> Result<Value> {
    mutate_with_stage(app, state, window, action, expected, None).await
}
async fn mutate_with_stage(
    app: tauri::AppHandle,
    state: &AppState,
    window: &str,
    action: Value,
    expected: Token,
    stage: Option<store::DocumentStage>,
) -> Result<Value> {
    if action["type"] == "saveNote" {
        return session_command(&app, state, |session| {
            NotesApplicationService::new(session).ui_save(window, action)
        });
    }
    if !Session::requires_barrier(&action) {
        let mut session = state.0 .0.lock().map_err(|_| failure("数据锁错误"))?;
        let result = NotesApplicationService::new(&mut session).ui_ordinary(action, &expected);
        let metadata = session.take_metadata_event();
        drop(session);
        if let Ok((_, Some(event))) = &result {
            let _ = emit_document_event(&app, "notes-access", event);
        }
        if let Some(event) = metadata {
            let _ = emit_document_event(&app, "notes-metadata", &event);
        }
        return result.map(|(value, _)| value);
    }
    let participants = recording_window::document_participants(app.webview_windows().into_keys());
    #[cfg(target_os = "macos")]
    let maintenance = if action["type"] == "importArchive" {
        let manager = app.state::<AgentState>().0.clone();
        Some(
            manager
                .pause(&expected, window)
                .await
                .map_err(AppError::from)?,
        )
    } else {
        None
    };
    let begin = ui_session(state, |session| {
        NotesApplicationService::new(session).ui_begin(action, participants, &expected)
    });
    let event = begin?;
    let operation = event["operationId"].as_str().unwrap().to_string();
    if emit_document_event(&app, "notes-access", &event).is_err() {
        if let Some(p) = state
            .0
             .0
            .lock()
            .map_err(|_| failure("数据锁错误"))?
            .pending
            .as_mut()
        {
            p.failure = Some("无法通知所有窗口，锁定未执行".into());
        }
    }
    let shared = state.0.clone();
    // Condvar releases the Store mutex while windows drain registered saves.
    let outcome = tauri::async_runtime::spawn_blocking(move || -> Result<_> {
        #[cfg(target_os = "macos")]
        let _maintenance = maintenance;
        // The worker owns import staging even if the command future is dropped.
        let _stage = stage;
        let guard = shared.0.lock().map_err(|_| failure("数据锁错误"))?;
        let (mut guard, wait) = shared
            .1
            .wait_timeout_while(guard, Duration::from_secs(10), |s| !s.ready())
            .map_err(|_| failure("数据锁错误"))?;
        let live = recording_window::document_participants(app.webview_windows().into_keys());
        let (result, event) = NotesApplicationService::new(&mut guard).ui_finish(
            &operation,
            &live,
            wait.timed_out(),
        )?;
        let metadata = guard.take_metadata_event();
        drop(guard);
        let _ = emit_document_event(&app, "notes-access", &event);
        if let Some(event) = metadata {
            let _ = emit_document_event(&app, "notes-metadata", &event);
        }
        Ok(result)
    })
    .await
    .map_err(|e| failure(e.to_string()))?;
    outcome?
}
fn session_command(
    app: &tauri::AppHandle,
    state: &AppState,
    operation: impl FnOnce(&mut Session) -> Result<Value>,
) -> Result<Value> {
    let mut session = state.0 .0.lock().map_err(|_| failure("数据锁错误"))?;
    let result = NotesApplicationService::new(&mut session).ui(operation);
    let event = session.take_metadata_event();
    drop(session);
    if let Some(event) = event {
        let _ = emit_document_event(&app, "notes-metadata", &event);
    }
    result
}
#[tauri::command]
async fn workspace_action(
    action: Value,
    expected: Token,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Value> {
    mutate(app, &state, window.label(), action, expected).await
}
#[tauri::command]
fn store_attachment(
    note_id: String,
    name: String,
    mime: String,
    data: String,
    expected: Token,
    state: State<AppState>,
    app: tauri::AppHandle,
) -> Result<Value> {
    let bytes = B64.decode(data).map_err(|_| failure("文件编码错误"))?;
    session_command(&app, &state, |session| {
        session.store_attachment(&note_id, &name, &mime, bytes, &expected)
    })
}
// Preserve the real failure category while keeping private journal/database
// details out of renderer errors, including failures before owner comparison.
fn attachment_operation_error(error: AppError) -> AppError {
    let message = match error.code.as_str() {
        "database" => "附件数据库操作失败，请保留未保存内容后重试",
        "filesystem" => "附件文件操作失败，请保留未保存内容后重试",
        "document" => "附件操作记录无法读取，请保留未保存内容后重试",
        _ => return error,
    };
    AppError {
        code: error.code,
        message: message.into(),
        commit: error.commit,
    }
}
#[tauri::command]
fn store_attachment_operation(
    operation_id: String,
    note_id: String,
    name: String,
    mime: String,
    data: String,
    recorded_at: Option<u64>,
    expected: Token,
    window: tauri::WebviewWindow,
    state: State<AppState>,
    app: tauri::AppHandle,
) -> Result<Value> {
    const MAX_ENCODED: usize = ((100 * 1024 * 1024 + 2) / 3) * 4;
    if data.len() > MAX_ENCODED {
        return Err(AppError {
            code: "too_large".into(),
            message: "附件不能超过100 MB".into(),
            commit: None,
        });
    }
    let bytes = B64.decode(data).map_err(|_| AppError {
        code: "invalid".into(),
        message: "文件编码错误".into(),
        commit: None,
    })?;
    session_command(&app, &state, |session| {
        session.store_attachment_operation(
            window.label(),
            &operation_id,
            &note_id,
            &name,
            &mime,
            &bytes,
            &expected,
            recorded_at,
        )
    })
    .map_err(attachment_operation_error)
}
#[tauri::command]
fn query_attachment_operation(
    operation_id: String,
    note_id: String,
    expected: Token,
    window: tauri::WebviewWindow,
    state: State<AppState>,
    app: tauri::AppHandle,
) -> Result<Value> {
    session_command(&app, &state, |session| {
        session.query_attachment_operation(window.label(), &operation_id, &note_id, &expected)
    })
    .map_err(attachment_operation_error)
}
#[tauri::command]
fn cancel_attachment_operation(
    operation_id: String,
    note_id: String,
    expected: Token,
    window: tauri::WebviewWindow,
    state: State<AppState>,
    app: tauri::AppHandle,
) -> Result<Value> {
    session_command(&app, &state, |session| {
        session.cancel_attachment_operation(window.label(), &operation_id, &note_id, &expected)
    })
    .map_err(attachment_operation_error)
}
#[tauri::command]
fn read_attachment(id: String, expected: Token, state: State<AppState>) -> Result<Value> {
    ui_session(&state, |session| {
        let note = session.store.attachment_note(&id)?;
        session.sensitive(&note, &expected)?;
        session.tagged(session.store.read_attachment(&id)?)
    })
}
#[tauri::command]
fn read_note_text(id: String, expected: Token, state: State<AppState>) -> Result<Value> {
    ui_session(&state, |session| {
        session.sensitive(&id, &expected)?;
        session.tagged(session.store.note_text(&id)?)
    })
}
#[tauri::command]
async fn get_data_management(expected: Token, media: State<'_, MediaState>) -> Result<Value> {
    let runtime = media.0.clone();
    tauri::async_runtime::spawn_blocking(move || runtime.data_management(&expected))
        .await
        .map_err(|_| failure("读取数据管理信息失败"))?
}
#[cfg(target_os = "android")]
fn copy_document(
    app: &tauri::AppHandle,
    uri: &str,
    stage: &store::DocumentStage,
    direction: &str,
    max_bytes: u64,
    expected: Option<u64>,
) -> Result<u64> {
    use tauri_plugin_notes_scan::NotesScanExt;
    app.notes_scan()
        .copy_document(uri, stage.path(), direction, max_bytes, expected)
        .map_err(|e| AppError {
            code: e.code,
            message: format!("文档传输失败：{}", e.message),
            commit: None,
        })
}
#[tauri::command]
async fn export_attachment(
    id: String,
    path: String,
    expected: Token,
    app: tauri::AppHandle,
) -> Result<Value> {
    // The blocking worker owns the Session guard through native flush/close.
    // A revocation cannot interleave between authorization and publication.
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        ui_session(&state, |session| {
            #[cfg(target_os = "android")]
            if path.starts_with("content://") {
                let (stage, info) = session.stage_attachment(&id, &expected)?;
                copy_document(
                    &app,
                    &path,
                    &stage,
                    "write",
                    100 * 1024 * 1024,
                    Some(info.bytes),
                )?;
                return serde_json::to_value(info).map_err(Into::into);
            }
            if path.contains("://") {
                return Err(failure("此平台不支持该导出地址"));
            }
            serde_json::to_value(session.export_attachment(&id, &PathBuf::from(path), &expected)?)
                .map_err(Into::into)
        })
    })
    .await
    .map_err(|e| failure(e.to_string()))?
}
#[tauri::command]
async fn export_drawing(
    note_id: String,
    svg: String,
    path: String,
    expected: Token,
    app: tauri::AppHandle,
) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        ui_session(&state, |session| {
            session.sensitive(&note_id, &expected)?;
            if svg.len() > 16 * 1024 * 1024
                || !svg.starts_with("<svg xmlns=\"http://www.w3.org/2000/svg\"")
                || !svg.ends_with("</svg>")
            {
                return Err(failure("速绘导出数据无效"));
            }
            #[cfg(target_os = "android")]
            if path.starts_with("content://") {
                let stage = session.store.document_stage()?;
                std::fs::write(stage.path(), svg.as_bytes())?;
                copy_document(
                    &app,
                    &path,
                    &stage,
                    "write",
                    16 * 1024 * 1024,
                    Some(svg.len() as u64),
                )?;
                return Ok(());
            }
            if path.contains("://") {
                return Err(failure("此平台不支持该导出地址"));
            }
            session
                .store
                .publish_export(&PathBuf::from(path), svg.as_bytes())
        })
    })
    .await
    .map_err(|e| failure(e.to_string()))?
}
#[tauri::command]
async fn export_archive(path: String, expected: Token, app: tauri::AppHandle) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        ui_session(&state, |session| {
            #[cfg(target_os = "android")]
            if path.starts_with("content://") {
                let stage = session.stage_archive(&expected)?;
                let size = std::fs::metadata(stage.path())?.len();
                copy_document(&app, &path, &stage, "write", 256 * 1024 * 1024, Some(size))?;
                return Ok(());
            }
            if path.contains("://") {
                return Err(failure("此平台不支持该导出地址"));
            }
            session.export_archive(&PathBuf::from(path), &expected)
        })
    })
    .await
    .map_err(|e| failure(e.to_string()))?
}
#[tauri::command]
async fn import_archive(
    path: String,
    expected: Token,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Value> {
    #[cfg(target_os = "android")]
    let stage = if path.starts_with("content://") {
        let host = app.clone();
        let token = expected.clone();
        let uri = path.clone();
        Some(
            tauri::async_runtime::spawn_blocking(move || {
                let state = host.state::<AppState>();
                let stage = state
                    .0
                     .0
                    .lock()
                    .map_err(|_| failure("数据锁错误"))?
                    .import_stage(&token)?;
                copy_document(&host, &uri, &stage, "read", 256 * 1024 * 1024, None)?;
                Ok::<_, AppError>(stage)
            })
            .await
            .map_err(|e| failure(e.to_string()))??,
        )
    } else {
        None
    };
    #[cfg(target_os = "android")]
    let path = stage
        .as_ref()
        .map(|s| s.path().to_string_lossy().into_owned())
        .unwrap_or(path);
    if path.contains("://") {
        return Err(failure("此平台不支持该导入地址"));
    }
    #[cfg(not(target_os = "android"))]
    let stage = None;
    // Ownership crosses into the real barrier worker. Cancellation of this
    // command cannot unlink a payload still needed by its pending import.
    mutate_with_stage(
        app,
        &state,
        window.label(),
        json!({"type":"importArchive","path":path}),
        expected,
        stage,
    )
    .await
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(desktop)]
    let mut options =
        startup::Options::parse(std::env::args_os().skip(1)).unwrap_or_else(|error| {
            eprintln!("CyberNote startup rejected: {error}");
            std::process::exit(2);
        });
    #[cfg(mobile)]
    let mut options = startup::Options::default();
    let mut context = tauri::generate_context!();
    #[cfg(all(feature = "sync-e2e", debug_assertions, desktop))]
    sync_headless::configure(context.config_mut()).unwrap_or_else(|_| {
        eprintln!("CyberNote headless startup rejected");
        std::process::exit(2);
    });
    let webview_profile = webview_profile::Profile::configure(&mut options, context.config_mut())
        .unwrap_or_else(|error| {
            eprintln!("CyberNote startup rejected: {error}");
            std::process::exit(2);
        });
    if options.data_dir.is_some() {
        // Do not retain permission to read the default library in custom mode.
        // The canonical selected attachments directory is granted during setup.
        context.config_mut().app.security.asset_protocol.scope =
            tauri::utils::config::FsScope::AllowedPaths(Vec::new());
    }
    // Keep the lease outside App state too: App/Store must finish dropping before
    // another process is permitted to open this directory.
    let workspace = Arc::new(std::sync::OnceLock::<startup::Workspace>::new());
    let startup_workspace = workspace.clone();
    #[cfg(target_os = "macos")]
    let agent_runtime_dir = options.agent_runtime_dir.clone();
    let builder = tauri::Builder::default()
        .manage(webview_profile)
        .manage(recording_window::Recordings::default())
        .manage(apple_notes_import::Imports::default())
        .on_page_load(|webview, _payload| {
            #[cfg(all(feature = "sync-e2e", debug_assertions, desktop))]
            sync_e2e::page_load(webview.label(), _payload);
            if let Some(media) = webview.try_state::<MediaState>() {
                // A trusted host page lifecycle creates identities; acquire IPC
                // only looks up a captured identity and cannot resurrect one.
                let _ = media.0.opened(webview.label());
            }
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                #[cfg(target_os = "macos")]
                if let Some(agent) = window.try_state::<AgentState>() {
                    agent.0.testers.close_window(window.label());
                }
                if let Some(media) = window.try_state::<MediaState>() {
                    media.0.closed(window.label());
                }
                recording_window::destroyed(window.app_handle(), window.label());
                if let Some(imports) = window.try_state::<apple_notes_import::Imports>() {
                    apple_notes_import::destroyed(&imports, window.label());
                }
                if let Some(state) = window.try_state::<AppState>() {
                    if let Ok(mut session) = state.0 .0.lock() {
                        session.forget_attachment_window(window.label());
                    };
                }
            }
        })
        .on_permission_request(media_permission::response)
        .plugin(media_permission::lifecycle())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notes_scan::init())
        .plugin(tauri_plugin_notes_media::init())
        .plugin(tauri_plugin_notes_auth::init())
        .setup(move |app| {
            let selected = startup_workspace
                .get()
                .ok_or_else(|| std::io::Error::other("workspace not initialized"))?;
            let root = selected.root.clone();
            let media_cache = selected.media_cache.clone();
            app.state::<webview_profile::Profile>()
                .create_initial_windows(app.handle())?;
            app.asset_protocol_scope()
                .allow_directory(root.join("attachments"), true)?;
            let shared = Arc::new((
                Mutex::new(Session::new(
                    Store::open(&root).map_err(|e| std::io::Error::other(e.message))?,
                )),
                Condvar::new(),
            ));
            app.manage(AppState(shared.clone()));
            #[cfg(target_os = "macos")]
            {
                let manager = agent_desktop::Desktop::new(
                    app.handle().clone(),
                    shared.clone(),
                    agent_runtime_dir.clone(),
                );
                app.manage(AgentState(manager.clone()));
                // Binding/private-state failure is retryable from Agent settings;
                // it must not prevent the notes application from starting.
                tauri::async_runtime::spawn(async move {
                    let _ = manager.restore().await;
                });
            }
            let mut origins = std::collections::HashSet::from([
                "tauri://localhost".to_string(),
                "http://tauri.localhost".to_string(),
            ]);
            #[cfg(debug_assertions)]
            if let Some(dev) = &app.config().build.dev_url {
                let origin = dev.origin().ascii_serialization();
                if origin != "null" {
                    origins.insert(origin);
                }
            }
            let media = tauri::async_runtime::block_on(
                attachment_media::runtime::MediaRuntime::start_with_provider(
                    shared.clone(),
                    media_cache,
                    origins,
                    Some(Arc::new(NativeThumbnailProvider(app.handle().clone()))),
                ),
            )
            .map_err(|e| std::io::Error::other(e.message))?;
            for label in app.webview_windows().into_keys() {
                media
                    .opened(&label)
                    .map_err(|e| std::io::Error::other(e.message))?;
            }
            app.manage(MediaState(media));
            let sync_host: Arc<dyn sync::adapter::WindowHost> =
                Arc::new(SyncWindows(app.handle().clone()));
            #[cfg(all(feature = "sync-e2e", debug_assertions, desktop))]
            let headless_host = sync_headless::enabled()
                .then(|| sync_headless::Host::new(app.handle().clone(), shared.clone()));
            #[cfg(all(feature = "sync-e2e", debug_assertions, desktop))]
            let sync_host: Arc<dyn sync::adapter::WindowHost> = match &headless_host {
                Some(host) => host.clone(),
                None => sync_host,
            };
            let sync = sync::adapter::Runtime::new(shared, root.clone(), sync_host)
                .map_err(|e| std::io::Error::other(e.message))?;
            #[cfg(all(feature = "sync-e2e", debug_assertions, desktop))]
            if let Some(host) = headless_host {
                host.bind(&sync)
                    .map_err(|_| std::io::Error::other("headless participant invalid"))?;
            }
            app.manage(SyncState(sync.clone()));
            let account =
                account::Runtime::new(app.handle().clone(), sync, &root, &selected.media_cache)
                    .map_err(|_| std::io::Error::other("account private state invalid"))?;
            app.manage(AccountState(account.clone()));
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let weak = Arc::downgrade(&account);
                app.deep_link().on_open_url(move |event| {
                    if let Some(runtime) = weak.upgrade() {
                        for url in event.urls() {
                            let runtime = runtime.clone();
                            tauri::async_runtime::spawn(async move {
                                runtime.deep_link(url).await;
                            });
                        }
                    }
                });
            }
            account.restore();
            #[cfg(desktop)]
            {
                use tauri::menu::{
                    MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
                };
                let app_menu = SubmenuBuilder::new(app, "CyberNote")
                    .about(None)
                    .separator()
                    .hide()
                    .hide_others()
                    .show_all()
                    .separator()
                    .item(
                        &MenuItemBuilder::with_id("quit", "退出 CyberNote")
                            .accelerator("CmdOrCtrl+Q")
                            .build(app)?,
                    )
                    .build()?;
                let file = SubmenuBuilder::new(app, "文件")
                    .item(
                        &MenuItemBuilder::with_id("new_note", "新建备忘录")
                            .accelerator("CmdOrCtrl+N")
                            .build(app)?,
                    )
                    .text("new_folder", "新建文件夹")
                    .separator()
                    .text("export", "导出本地备份…")
                    .text("import", "导入本地备份…")
                    .separator()
                    .close_window_with_text("关闭窗口")
                    .build()?;
                let edit = SubmenuBuilder::new(app, "编辑")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .select_all()
                    .separator()
                    .item(
                        &MenuItemBuilder::with_id("find_in_note", "在备忘录中查找")
                            .accelerator("CmdOrCtrl+F")
                            .build(app)?,
                    )
                    .build()?;
                let view = SubmenuBuilder::new(app, "显示")
                    .text("sidebar", "隐藏文件夹")
                    .text("gallery", "切换画廊视图")
                    .item(
                        &MenuItemBuilder::with_id("search", "搜索备忘录")
                            .accelerator("CmdOrCtrl+Alt+F")
                            .build(app)?,
                    )
                    .build()?;
                let window = SubmenuBuilder::with_id(app, tauri::menu::WINDOW_SUBMENU_ID, "窗口")
                    .item(&PredefinedMenuItem::minimize(app, None)?)
                    .item(&PredefinedMenuItem::maximize(app, None)?)
                    .separator()
                    .text("show_recording_owner", "显示备忘录窗口")
                    .build()?;
                app.set_menu(
                    MenuBuilder::new(app)
                        .items(&[&app_menu, &file, &edit, &view, &window])
                        .build()?,
                )?;
                app.on_menu_event(|app, event| {
                    use tauri::Emitter;
                    // The predefined macOS Quit calls terminate: directly and
                    // bypasses ExitRequested. Route menu/CmdQ through the same
                    // cancellable recording/document save barrier, even when
                    // none of our windows currently has focus.
                    if event.id().as_ref() == "quit" {
                        app.exit(0);
                        return;
                    }
                    if let Some(window) = app
                        .webview_windows()
                        .into_values()
                        .find(|window| window.is_focused().unwrap_or(false))
                    {
                        if event.id().as_ref() == "show_recording_owner" {
                            if recording_window::recording_label(window.label()) {
                                recording_window::reveal_owner(app, window.label());
                            } else if let Some(main) = app.get_webview_window("main") {
                                let _ = main.show();
                                let _ = main.set_focus();
                            }
                            return;
                        }
                        if window.label() == "main" || window.label().starts_with("note-") {
                            let _ = window.emit_to(
                                tauri::EventTarget::Window {
                                    label: window.label().to_owned(),
                                },
                                "menu-action",
                                event.id().as_ref(),
                            );
                        }
                    }
                });
            }
            #[cfg(all(feature = "sync-e2e", debug_assertions, desktop))]
            if sync_headless::enabled() {
                sync_headless::start(app.handle())?;
            } else {
                sync_e2e::start(app.handle())?;
            }
            Ok(())
        });
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_plugin_notes_ui::init());
    #[cfg(not(feature = "access-boundary-proof"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        webview_profile::open_note_window,
        account::account_command,
        account::account_sdk_diagnostic,
        load_workspace,
        sync_command,
        sync_diagnostics,
        sync_window_reply,
        agent_window_reply,
        agent_settings,
        agent_bundled_adapter,
        agent_set_enabled,
        agent_create_grant,
        agent_revoke_grant,
        agent_tester_start,
        agent_tester_call,
        agent_tester_stop,
        register_save_intent,
        acknowledge_access,
        read_note_text,
        workspace_action,
        store_attachment,
        store_attachment_operation,
        query_attachment_operation,
        cancel_attachment_operation,
        read_attachment,
        acquire_attachment_source,
        release_attachment_source,
        clear_attachment_media_cache,
        get_data_management,
        export_attachment,
        export_drawing,
        attachment_desktop::attachment_desktop,
        export_archive,
        import_archive,
        apple_notes_import::apple_notes_scan,
        apple_notes_import::apple_notes_status,
        apple_notes_import::apple_notes_start,
        apple_notes_import::apple_notes_cancel,
        recording_window::register_recording_local,
        recording_window::recording_local_validate,
        recording_window::recording_local_started,
        recording_window::recording_local_revision,
        recording_window::recording_local_release,
        recording_window::recording_quit_sealed,
        recording_window::recording_quit_ack
    ]);
    #[cfg(feature = "access-boundary-proof")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        webview_profile::open_note_window,
        account::account_command,
        account::account_sdk_diagnostic,
        load_workspace,
        sync_command,
        sync_diagnostics,
        sync_window_reply,
        agent_window_reply,
        agent_settings,
        agent_bundled_adapter,
        agent_set_enabled,
        agent_create_grant,
        agent_revoke_grant,
        agent_tester_start,
        agent_tester_call,
        agent_tester_stop,
        register_save_intent,
        acknowledge_access,
        read_note_text,
        workspace_action,
        store_attachment,
        store_attachment_operation,
        query_attachment_operation,
        cancel_attachment_operation,
        read_attachment,
        acquire_attachment_source,
        release_attachment_source,
        clear_attachment_media_cache,
        get_data_management,
        export_attachment,
        export_drawing,
        attachment_desktop::attachment_desktop,
        export_archive,
        import_archive,
        apple_notes_import::apple_notes_scan,
        apple_notes_import::apple_notes_status,
        apple_notes_import::apple_notes_start,
        apple_notes_import::apple_notes_cancel,
        proof_access_record,
        recording_window::register_recording_local,
        recording_window::recording_local_validate,
        recording_window::recording_local_started,
        recording_window::recording_local_revision,
        recording_window::recording_local_release,
        recording_window::recording_quit_sealed,
        recording_window::recording_quit_ack
    ]);
    let app = builder.build(context).unwrap_or_else(|error| {
        eprintln!("CyberNote startup rejected: {error}");
        std::process::exit(1);
    });
    // Tauri runs setup inside its event-loop callback and panics on an error.
    // Resolve and lease the directory before entering it, so invalid paths and
    // duplicate instances fail clearly before windows or SQLite are opened.
    let selected = app
        .path()
        .app_data_dir()
        .and_then(|data| {
            let cache = app.path().app_cache_dir()?;
            startup::Workspace::open(&options, &data, &cache).map_err(tauri::Error::Io)
        })
        .unwrap_or_else(|error| {
            eprintln!("CyberNote startup rejected: {error}");
            std::process::exit(1);
        });
    workspace.set(selected).expect("workspace initialized once");
    app.run(|app, event| match event {
        tauri::RunEvent::Exit => {
            #[cfg(target_os = "macos")]
            if let Some(agent) = app.try_state::<AgentState>() {
                let _ = tauri::async_runtime::block_on(agent.0.quit());
            }
            if let Some(media) = app.try_state::<MediaState>() {
                media.0.stop();
            }
            if let Some(state) = app.try_state::<SyncState>() {
                let _ = state.0.shutdown();
            }
        }
        tauri::RunEvent::Resumed => {
            if let Some(state) = app.try_state::<AccountState>() {
                state.0.foreground();
            }
            if let Some(state) = app.try_state::<SyncState>() {
                let runtime = state.0.clone();
                tauri::async_runtime::spawn_blocking(move || runtime.foreground());
            }
        }
        tauri::RunEvent::ExitRequested { api, .. } => {
            if recording_window::exit_requested(app, &api) {
                if let Some(state) = app.try_state::<AccountState>() {
                    state.0.exit_requested(app, &api);
                }
            }
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { .. } => {
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.show();
                let _ = main.unminimize();
                let _ = main.set_focus();
            }
        }
        _ => {}
    });
    drop(workspace);
}

#[cfg(test)]
mod attachment_command_tests {
    use super::*;
    #[test]
    fn private_storage_errors_keep_category_without_returning_journal_details() {
        for code in ["database", "filesystem", "document"] {
            let result = attachment_operation_error(AppError {
                code: code.into(),
                message: "PRIVATE foreign owner path SQL bytes".into(),
                commit: None,
            });
            assert_eq!(result.code, code);
            assert!(!result.message.contains("PRIVATE"));
            assert!(!result.message.contains("foreign"));
        }
        let result = attachment_operation_error(AppError {
            code: "attachment_operation_conflict".into(),
            message: "附件操作身份或内容不匹配".into(),
            commit: None,
        });
        assert_eq!(result.code, "attachment_operation_conflict");
        assert_eq!(result.message, "附件操作身份或内容不匹配");
    }
}
