//! Tauri commands provide real window identity; the exact core worker is also
//! exercised by the explicit synthetic-source development transport.
mod core;
use crate::{session::Token, store::apple_import::PreparedBatch, AppState, Result};
pub(crate) use core::Imports;
use serde_json::Value;
use std::sync::Arc;
use tauri::{Manager, State};
struct NativeHost(tauri::AppHandle);
impl core::Host for NativeHost {
    fn authorize(&self, expected: &Token) -> Result<()> {
        self.0
            .state::<AppState>()
            .0
             .0
            .lock()
            .map_err(|_| crate::failure("数据锁错误"))?
            .apple_import_access(expected)
    }
    fn append(&self, batch: PreparedBatch, expected: &Token) -> Result<Value> {
        crate::session_command(&self.0, &self.0.state::<AppState>(), |session| {
            session.append_apple_notes(batch, expected)
        })
    }
    fn alive(&self, owner: &str) -> bool {
        self.0.get_webview_window(owner).is_some()
    }
}
#[tauri::command]
pub(crate) fn apple_notes_scan(
    expected: Token,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    imports: State<Imports>,
) -> Result<Value> {
    if !cfg!(target_os = "macos") {
        return Err(crate::failure("此功能仅支持Mac"));
    }
    core::scan_job(
        expected,
        window.label(),
        &imports,
        Arc::new(NativeHost(app)),
        Arc::new(core::SystemSource),
    )
}
#[tauri::command]
pub(crate) fn apple_notes_status(
    id: String,
    expected: Token,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    imports: State<Imports>,
) -> Result<Value> {
    core::status_job(&id, &expected, window.label(), &imports, &NativeHost(app))
}
#[tauri::command]
pub(crate) fn apple_notes_start(
    id: String,
    keys: Vec<String>,
    expected: Token,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    imports: State<Imports>,
) -> Result<Value> {
    core::start_job(
        &id,
        keys,
        &expected,
        window.label(),
        &imports,
        Arc::new(NativeHost(app)),
        Arc::new(core::SystemSource),
    )
}
#[tauri::command]
pub(crate) fn apple_notes_cancel(
    id: String,
    expected: Token,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    imports: State<Imports>,
) -> Result<Value> {
    let mut result = core::cancel_job(&id, &expected, window.label(), &imports)?;
    // Revocation still permits terminating this owner's old task, without
    // disclosing old preview titles or target identities after access changed.
    if core::Host::authorize(&NativeHost(app), &expected).is_err() {
        result["items"] = serde_json::json!([]);
        result["results"] = serde_json::json!([]);
        result["commit"] = Value::Null;
    }
    Ok(result)
}
pub(crate) fn destroyed(imports: &Imports, owner: &str) {
    core::destroyed(imports, owner)
}
