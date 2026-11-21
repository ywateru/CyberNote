//! Integration: declare this file as `mod cloud_sync_commands` at crate root.
use crate::cloud_sync::{
    model::error,
    runtime::{CloudCommand, Reply},
    CloudRuntime, Context, Result,
};
use std::sync::Arc;
use std::time::Duration;
use tauri_plugin_notes_auth::{CloudCookie, CloudLogin, Event, Handler, NativeAuthExt};

#[tauri::command]
pub async fn cloud_sync_command(
    app: tauri::AppHandle,
    runtime: tauri::State<'_, Arc<CloudRuntime>>,
    window: tauri::Window,
    context: Context,
    command: CloudCommand,
) -> Result<Reply> {
    if context.window != window.label() {
        return Err(error("permission"));
    }
    match command {
        CloudCommand::BeginConnect {
            provider,
            driver,
            mode,
        } => {
            let start = runtime
                .begin_connect(context.clone(), provider, driver, mode)
                .await?;
            let rt = runtime.inner().clone();
            let app_handle = app.clone();
            let ctx = context.clone();
            let instance = start.instance.clone();
            let open_instance = instance.clone();
            let generation = start.generation;
            let handler: Handler = Arc::new(move |event| match event {
                Event::Callback(raw) => {
                    let rt = rt.clone();
                    let app_handle = app_handle.clone();
                    let ctx = ctx.clone();
                    let instance = instance.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = rt.complete_connect(&ctx, &instance, &raw).await;
                        app_handle
                            .native_auth()
                            .close_cloud(&app_handle, &instance, generation);
                    });
                }
                Event::Failed => {
                    rt.abort_connect(&instance, error("network"));
                    app_handle
                        .native_auth()
                        .close_cloud(&app_handle, &instance, generation);
                }
                Event::Closed | Event::Destroyed => {
                    rt.cancel_connect(Some(&instance));
                    app_handle
                        .native_auth()
                        .close_cloud(&app_handle, &instance, generation);
                }
                Event::Opened | Event::Continue => {}
            });
            let login = CloudLogin {
                instance: start.instance,
                generation: start.generation,
                url: start.url,
                title: start.title,
                allowed_hosts: start.allowed_hosts,
                callback_prefix: start.callback_prefix,
                cookies: start
                    .cookies
                    .into_iter()
                    .map(|c| CloudCookie {
                        name: c.name,
                        value: c.value,
                        domain: c.domain,
                        path: c.path,
                        secure: c.secure,
                        http_only: c.http_only,
                        same_site: c.same_site,
                    })
                    .collect(),
            };
            let opened = tokio::time::timeout(
                Duration::from_secs(15),
                app.native_auth().open_cloud(&app, login, handler),
            )
            .await;
            if !matches!(opened, Ok(Ok(()))) {
                runtime.cancel_connect(Some(&open_instance));
                runtime.dismiss_connect();
                app.native_auth()
                    .close_cloud(&app, &open_instance, generation);
                return Err(error("network"));
            }
            runtime.reply()
        }
        CloudCommand::CancelConnect => {
            if let Some((instance, generation)) = runtime.cancel_connect(None) {
                app.native_auth()
                    .close_cloud(&app, &instance, generation);
            }
            runtime.dismiss_connect();
            runtime.reply()
        }
        command @ CloudCommand::Disconnect { provider } => {
            if let Some((instance, generation)) = runtime.cancel_connect_for(provider) {
                app.native_auth()
                    .close_cloud(&app, &instance, generation);
            }
            runtime.command(context, command).await
        }
        command @ CloudCommand::Save { .. } => {
            if let Some((instance, generation)) = runtime.cancel_connect(None) {
                app.native_auth()
                    .close_cloud(&app, &instance, generation);
            }
            runtime.command(context, command).await
        }
        command => runtime.command(context, command).await,
    }
}
