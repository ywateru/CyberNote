mod store;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::Value;
use std::{path::PathBuf, sync::Mutex};
use store::{AppError, Result, Store};
use tauri::{Manager, State};
struct AppState(Mutex<Store>);
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
        .lock()
        .map_err(|_| failure("数据锁错误"))?
        .workspace()
}
#[tauri::command]
fn workspace_action(action: Value, state: State<AppState>) -> Result<Value> {
    state
        .0
        .lock()
        .map_err(|_| failure("数据锁错误"))?
        .action(action)
}
#[tauri::command]
fn store_attachment(
    note_id: String,
    name: String,
    mime: String,
    data: String,
    state: State<AppState>,
) -> Result<Value> {
    let bytes = B64.decode(data).map_err(|_| failure("文件编码错误"))?;
    Ok(serde_json::to_value(
        state
            .0
            .lock()
            .map_err(|_| failure("数据锁错误"))?
            .store_attachment(&note_id, &name, &mime, bytes)?,
    )?)
}
#[tauri::command]
fn read_attachment(id: String, state: State<AppState>) -> Result<Value> {
    state
        .0
        .lock()
        .map_err(|_| failure("数据锁错误"))?
        .read_attachment(&id)
}
#[tauri::command]
fn export_archive(path: String, state: State<AppState>) -> Result<()> {
    state
        .0
        .lock()
        .map_err(|_| failure("数据锁错误"))?
        .export_archive(&PathBuf::from(path))
}
#[tauri::command]
fn import_archive(path: String, state: State<AppState>) -> Result<Value> {
    let mut s = state.0.lock().map_err(|_| failure("数据锁错误"))?;
    s.import_archive(&PathBuf::from(path))?;
    s.workspace()
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .on_permission_request(|webview, kind| {
            use tauri::webview::{PermissionKind, PermissionResponse};
            let trusted = webview
                .url()
                .map(|u| matches!(u.host_str(), Some("localhost") | Some("tauri.localhost")))
                .unwrap_or(false);
            if trusted && matches!(kind, PermissionKind::Microphone | PermissionKind::Camera) {
                PermissionResponse::Allow
            } else {
                PermissionResponse::Deny
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            app.manage(AppState(Mutex::new(
                Store::open(root).map_err(|e| std::io::Error::other(e.message))?,
            )));
            #[cfg(desktop)]
            {
                use tauri::menu::{MenuBuilder, PredefinedMenuItem, SubmenuBuilder};
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
                    .text("new_note", "新建备忘录")
                    .text("new_folder", "新建文件夹")
                    .separator()
                    .text("export", "导出本地备份…")
                    .text("import", "导入本地备份…")
                    .build()?;
                let edit = SubmenuBuilder::new(app, "编辑")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .select_all()
                    .build()?;
                let view = SubmenuBuilder::new(app, "显示")
                    .text("sidebar", "显示/隐藏文件夹")
                    .text("gallery", "切换画廊视图")
                    .text("search", "搜索备忘录")
                    .build()?;
                let window = SubmenuBuilder::new(app, "窗口")
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
                    let _ = app.emit("menu-action", event.id().as_ref());
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_workspace,
            workspace_action,
            store_attachment,
            read_attachment,
            export_archive,
            import_archive
        ])
        .run(tauri::generate_context!())
        .expect("Notes failed to start");
}
