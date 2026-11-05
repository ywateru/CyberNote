mod media_permission;
mod recording_window;
mod session;
mod store;
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
struct AppState(Arc<(Mutex<Session>, Condvar)>);
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
#[tauri::command]
fn load_workspace(state: State<AppState>) -> Result<Value> {
    state
        .0
         .0
        .lock()
        .map_err(|_| failure("数据锁错误"))?
        .workspace()
}
#[tauri::command]
fn register_save_intent(
    note_id: String,
    intent: String,
    expected: Token,
    window: tauri::WebviewWindow,
    state: State<AppState>,
) -> Result<()> {
    state
        .0
         .0
        .lock()
        .map_err(|_| failure("数据锁错误"))?
        .register_save(window.label(), &note_id, &intent, expected)
}
#[tauri::command]
fn acknowledge_access(
    operation_id: String,
    success: bool,
    window: tauri::WebviewWindow,
    state: State<AppState>,
) -> Result<()> {
    let result = state
        .0
         .0
        .lock()
        .map_err(|_| failure("数据锁错误"))?
        .acknowledge(&operation_id, window.label(), success);
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
    if action["type"] == "saveNote" {
        return session_command(&app, state, |session| session.save(window, action));
    }
    if !Session::requires_barrier(&action) {
        let mut session = state.0 .0.lock().map_err(|_| failure("数据锁错误"))?;
        let result = session.ordinary(action, &expected);
        let metadata = session.take_metadata_event();
        drop(session);
        if let Ok((_, Some(event))) = &result {
            let _ = app.emit("notes-access", event);
        }
        if let Some(event) = metadata {
            let _ = app.emit("notes-metadata", event);
        }
        return result.map(|(value, _)| value);
    }
    let participants = recording_window::document_participants(app.webview_windows().into_keys());
    let event = state
        .0
         .0
        .lock()
        .map_err(|_| failure("数据锁错误"))?
        .begin(action, participants, &expected)?;
    let operation = event["operationId"].as_str().unwrap().to_string();
    if app.emit("notes-access", &event).is_err() {
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
        let guard = shared.0.lock().map_err(|_| failure("数据锁错误"))?;
        let (mut guard, wait) = shared
            .1
            .wait_timeout_while(guard, Duration::from_secs(10), |s| !s.ready())
            .map_err(|_| failure("数据锁错误"))?;
        let live = recording_window::document_participants(app.webview_windows().into_keys());
        let (result, event) = guard.finish(&operation, &live, wait.timed_out())?;
        let metadata = guard.take_metadata_event();
        drop(guard);
        let _ = app.emit("notes-access", event);
        if let Some(event) = metadata {
            let _ = app.emit("notes-metadata", event);
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
    let result = operation(&mut session);
    let event = session.take_metadata_event();
    drop(session);
    if let Some(event) = event {
        let _ = app.emit("notes-metadata", event);
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
    let session = state.0 .0.lock().map_err(|_| failure("数据锁错误"))?;
    let note = session.store.attachment_note(&id)?;
    session.sensitive(&note, &expected)?;
    session.tagged(session.store.read_attachment(&id)?)
}
#[tauri::command]
fn read_note_text(id: String, expected: Token, state: State<AppState>) -> Result<Value> {
    let session = state.0 .0.lock().map_err(|_| failure("数据锁错误"))?;
    session.sensitive(&id, &expected)?;
    session.tagged(session.store.note_text(&id)?)
}
#[tauri::command]
fn export_archive(path: String, expected: Token, state: State<AppState>) -> Result<()> {
    let session = state.0 .0.lock().map_err(|_| failure("数据锁错误"))?;
    session.export_archive(&PathBuf::from(path), &expected)
}
#[tauri::command]
async fn import_archive(
    path: String,
    expected: Token,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Value> {
    mutate(
        app,
        &state,
        window.label(),
        json!({"type":"importArchive","path":path}),
        expected,
    )
    .await
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(recording_window::Recordings::default())
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                recording_window::destroyed(window.app_handle(), window.label());
                if let Some(state) = window.try_state::<AppState>() {
                    if let Ok(mut session) = state.0 .0.lock() {
                        session.forget_attachment_window(window.label());
                    };
                }
            }
        })
        .on_permission_request(media_permission::response)
        .plugin(media_permission::lifecycle())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notes_scan::init())
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            app.manage(AppState(Arc::new((
                Mutex::new(Session::new(
                    Store::open(root).map_err(|e| std::io::Error::other(e.message))?,
                )),
                Condvar::new(),
            ))));
            #[cfg(desktop)]
            {
                use tauri::menu::{
                    MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
                };
                let app_menu = SubmenuBuilder::new(app, "备忘录")
                    .about(None)
                    .separator()
                    .hide()
                    .hide_others()
                    .show_all()
                    .separator()
                    .quit()
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
            Ok(())
        });
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_plugin_notes_ui::init());
    #[cfg(not(feature = "access-boundary-proof"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        load_workspace,
        register_save_intent,
        acknowledge_access,
        read_note_text,
        workspace_action,
        store_attachment,
        store_attachment_operation,
        query_attachment_operation,
        cancel_attachment_operation,
        read_attachment,
        export_archive,
        import_archive,
        recording_window::register_recording_window,
        recording_window::recording_window_context,
        recording_window::recording_window_message,
        recording_window::recording_window_finish,
        recording_window::recording_window_abandon,
        recording_window::recording_quit_ack
    ]);
    #[cfg(feature = "access-boundary-proof")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        load_workspace,
        register_save_intent,
        acknowledge_access,
        read_note_text,
        workspace_action,
        store_attachment,
        store_attachment_operation,
        query_attachment_operation,
        cancel_attachment_operation,
        read_attachment,
        export_archive,
        import_archive,
        proof_access_record,
        recording_window::register_recording_window,
        recording_window::recording_window_context,
        recording_window::recording_window_message,
        recording_window::recording_window_finish,
        recording_window::recording_window_abandon,
        recording_window::recording_quit_ack
    ]);
    builder
        .build(tauri::generate_context!())
        .expect("Notes failed to start")
        .run(|app, event| match event {
            tauri::RunEvent::ExitRequested { api, .. } => {
                recording_window::exit_requested(app, &api)
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
