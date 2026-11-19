//! Integration: declare this file as `mod cloud_sync_commands` at crate root.
use crate::cloud_sync::{
    model::error, runtime::Reply, CloudCommand, CloudRuntime, Context, Result,
};
use std::sync::Arc;
#[tauri::command]
pub async fn cloud_sync_command(
    runtime: tauri::State<'_, Arc<CloudRuntime>>,
    window: tauri::Window,
    context: Context,
    command: CloudCommand,
) -> Result<Reply> {
    if context.window != window.label() {
        return Err(error("permission"));
    }
    runtime.command(context, command).await
}
