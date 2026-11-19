use super::{PreferencePatch, SoftwareUpdater, Status};
use std::sync::Arc;
use tauri::{Runtime, State, WebviewWindow};
// Only the production main webview may change global application software.
// Attachment/recording/MCP surfaces cannot call the updater through a new path.
fn authorize<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    if window.label() != "main" {
        return Err("software_update_window_denied".into());
    }
    Ok(())
}
#[tauri::command]
pub fn software_update_status<R: Runtime>(
    window: WebviewWindow<R>,
    updater: State<'_, Arc<SoftwareUpdater>>,
) -> Result<Status, String> {
    authorize(&window)?;
    Ok(updater.status())
}
#[tauri::command]
pub fn software_update_configure<R: Runtime>(
    window: WebviewWindow<R>,
    updater: State<'_, Arc<SoftwareUpdater>>,
    patch: PreferencePatch,
) -> Result<Status, String> {
    authorize(&window)?;
    updater.configure(patch)
}
#[tauri::command]
pub async fn software_update_check<R: Runtime>(
    window: WebviewWindow<R>,
    updater: State<'_, Arc<SoftwareUpdater>>,
) -> Result<Status, String> {
    authorize(&window)?;
    updater.check().await
}
#[tauri::command]
pub async fn software_update_download<R: Runtime>(
    window: WebviewWindow<R>,
    updater: State<'_, Arc<SoftwareUpdater>>,
) -> Result<Status, String> {
    authorize(&window)?;
    updater.download().await
}
#[tauri::command]
pub async fn software_update_install<R: Runtime>(
    window: WebviewWindow<R>,
    updater: State<'_, Arc<SoftwareUpdater>>,
) -> Result<Status, String> {
    authorize(&window)?;
    updater.install().await
}
