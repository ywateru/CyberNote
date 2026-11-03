mod media_permission;
mod session;
mod store;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::{json, Value};
use session::{Session, Token};
use std::{
    collections::HashSet,
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
        return state
            .0
             .0
            .lock()
            .map_err(|_| failure("数据锁错误"))?
            .save(window, action);
    }
    if !Session::requires_barrier(&action) {
        let (value, event) = state
            .0
             .0
            .lock()
            .map_err(|_| failure("数据锁错误"))?
            .ordinary(action, &expected)?;
        if let Some(event) = event {
            let _ = app.emit("notes-access", event);
        }
        return Ok(value);
    }
    let participants: HashSet<_> = app.webview_windows().into_keys().collect();
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
        let live = app.webview_windows().into_keys().collect();
        let (result, event) = guard.finish(&operation, &live, wait.timed_out())?;
        drop(guard);
        let _ = app.emit("notes-access", event);
        Ok(result)
    })
    .await
    .map_err(|e| failure(e.to_string()))?;
    outcome?
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
) -> Result<Value> {
    let bytes = B64.decode(data).map_err(|_| failure("文件编码错误"))?;
    let mut session = state.0 .0.lock().map_err(|_| failure("数据锁错误"))?;
    session.sensitive(&note_id, &expected)?;
    let value = serde_json::to_value(
        session
            .store
            .store_attachment(&note_id, &name, &mime, bytes)?,
    )?;
    session.tagged(value)
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
    session.check(&expected, None)?;
    if session.pending.is_some() {
        return Err(failure("锁定状态正在同步，请稍后导出"));
    }
    session.store.export_archive(&PathBuf::from(path))
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
        .on_permission_request(media_permission::response)
        .plugin(media_permission::lifecycle())
        .plugin(tauri_plugin_dialog::init())
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
                    .text("sidebar", "显示/隐藏文件夹")
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
        read_attachment,
        export_archive,
        import_archive
    ]);
    #[cfg(feature = "access-boundary-proof")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        load_workspace,
        register_save_intent,
        acknowledge_access,
        read_note_text,
        workspace_action,
        store_attachment,
        read_attachment,
        export_archive,
        import_archive,
        proof_access_record
    ]);
    builder
        .run(tauri::generate_context!())
        .expect("Notes failed to start");
}
