//! Host includes this file as `local_backup_commands`; see README.md.
use crate::local_backup::*;
use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::State;

pub struct LocalBackupState(pub Arc<BackupRuntime>);
fn now() -> Result<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .map_err(|_| BackupError {
            code: "backup_clock".into(),
            message: "系统时间无效".into(),
        })
}
fn caller(window: &tauri::WebviewWindow, expected: ExpectedSession) -> BackupCaller {
    BackupCaller::Window {
        label: window.label().into(),
        expected,
    }
}
#[tauri::command]
pub async fn local_backup_status(
    state: State<'_, LocalBackupState>,
    window: tauri::WebviewWindow,
    expected: ExpectedSession,
) -> Result<BackupStatus> {
    state.0.status(caller(&window, expected), now()?).await
}
#[tauri::command]
pub async fn local_backup_configure(
    state: State<'_, LocalBackupState>,
    window: tauri::WebviewWindow,
    expected: ExpectedSession,
    patch: ConfigPatch,
) -> Result<BackupStatus> {
    state
        .0
        .configure(caller(&window, expected), patch, now()?)
        .await
}
#[tauri::command]
pub async fn local_backup_now(
    state: State<'_, LocalBackupState>,
    window: tauri::WebviewWindow,
    expected: ExpectedSession,
) -> Result<BackupVersion> {
    state.0.backup_now(caller(&window, expected), now()?).await
}
#[tauri::command]
pub async fn local_backup_prepare_restore(
    state: State<'_, LocalBackupState>,
    window: tauri::WebviewWindow,
    expected: ExpectedSession,
    name: String,
) -> Result<RestorePreview> {
    state
        .0
        .prepare_restore(caller(&window, expected), name, now()?)
        .await
}
#[tauri::command]
pub async fn local_backup_restore(
    state: State<'_, LocalBackupState>,
    window: tauri::WebviewWindow,
    expected: ExpectedSession,
    confirmation: String,
) -> Result<RestoreResult> {
    state
        .0
        .restore(caller(&window, expected), confirmation, now()?)
        .await
}
