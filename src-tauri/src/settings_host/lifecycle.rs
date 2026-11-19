use super::*;
use crate::software_update::{InstallGuard, InstallLease, Release};
use std::{future::Future, pin::Pin};
pub(super) fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
pub(crate) struct SettingsTasks {
    cancel: tokio_util::sync::CancellationToken,
    task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}
impl SettingsTasks {
    pub(crate) fn start(
        host: Arc<Host>,
        backup: Option<Arc<crate::local_backup::BackupRuntime>>,
        cloud: Option<Arc<crate::cloud_sync::CloudRuntime>>,
    ) -> Self {
        let cancel = tokio_util::sync::CancellationToken::new();
        let stop = cancel.clone();
        let task = tauri::async_runtime::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(30));
            loop {
                tokio::select! { _=stop.cancelled()=>break, _=interval.tick()=>{} }
                if host.stopping.load(Ordering::Acquire)
                    || !host
                        .ready
                        .lock()
                        .map(|r| r.contains("main"))
                        .unwrap_or(false)
                    || host.quit.lock().map(|q| q.is_some()).unwrap_or(true)
                {
                    continue;
                }
                if let (Some(cloud), Ok(context)) = (&cloud, host.context()) {
                    let _ = cloud.automatic(context).await;
                }
                if stop.is_cancelled() {
                    break;
                }
                if let Some(backup) = &backup {
                    let _ = backup.tick(now()).await;
                }
            }
        });
        Self {
            cancel,
            task: Mutex::new(Some(task)),
        }
    }
    pub(crate) async fn shutdown(&self) {
        self.cancel.cancel();
        let task = self.task.lock().ok().and_then(|mut t| t.take());
        if let Some(task) = task {
            let _ = task.await;
        }
    }
}
impl Drop for SettingsTasks {
    fn drop(&mut self) {
        self.cancel.cancel();
        if let Ok(task) = self.task.get_mut() {
            if let Some(task) = task.take() {
                task.abort();
            }
        }
    }
}
struct ExitLease {
    host: Arc<Host>,
    id: String,
    token: Token,
    instance: uuid::Uuid,
    recording: Option<crate::recording_window::InstallRecordingLease>,
    #[cfg(target_os = "macos")]
    _maintenance: Option<crate::agent_desktop::Maintenance>,
}
impl Drop for ExitLease {
    fn drop(&mut self) {
        let _ = self.host.with(|s| {
            s.settings_exit = false;
            Ok(())
        });
        if let Ok(mut quit) = self.host.quit.lock() {
            if quit.as_ref().is_some_and(|q| q.id == self.id) {
                *quit = None;
            }
        }
        let _ = self
            .host
            .app
            .emit("notes-settings-quit-cancelled", json!({"id":self.id}));
    }
}
impl InstallLease for ExitLease {
    fn exit(&mut self) -> std::result::Result<(), String> {
        self.host
            .with(|s| {
                s.check(&self.token, None)?;
                if s.store.sync_store_instance() != self.instance {
                    return Err(error("退出资料库已变化"));
                }
                let quit = self.host.quit.lock().map_err(|_| error("退出状态不可读"))?;
                let q = quit.as_ref().ok_or_else(|| error("退出许可已失效"))?;
                if q.id != self.id || !q.ready(&self.host.live()) || !s.settings_exit {
                    return Err(error("退出许可已变化"));
                }
                Ok(())
            })
            .map_err(|e| e.message)?;
        self.host.app.exit(0); // Save/recording lease is already held; existing account orderly exit still owns shutdown.
        Ok(())
    }
}
impl InstallGuard for Arc<Host> {
    fn prepare_install<'a>(
        &'a self,
        release: &'a Release,
    ) -> Pin<Box<dyn Future<Output = std::result::Result<Box<dyn InstallLease>, String>> + Send + 'a>>
    {
        let host = self.clone();
        let version = release.version.clone();
        Box::pin(async move {
            use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
            let (tx, rx) = tokio::sync::oneshot::channel();
            host.app.dialog().message(format!("安装 CyberNote {version} 并重新启动？此 macOS 包为 ad-hoc 签名、未公证。将先保存所有窗口和录音，保留旧包以便失败恢复。"))
                .title("更新 CyberNote").kind(MessageDialogKind::Warning).buttons(MessageDialogButtons::OkCancel).show(move|answer|{let _=tx.send(answer);});
            if !rx.await.map_err(|_| "确认窗口已关闭")? {
                return Err("已取消安装".into());
            }
            let expected = host
                .with(|s| {
                    let t = s.sync_media_token();
                    host.check(s, &t, "main")?;
                    Ok(t)
                })
                .map_err(|e| e.message)?;
            #[cfg(target_os = "macos")]
            let maintenance = host
                .app
                .state::<crate::AgentState>()
                .0
                .pause(&expected, "main")
                .await
                .map_err(|_| "无法停止 Agent 写入")?;
            let instance = host
                .with(|s| Ok(s.store.sync_store_instance()))
                .map_err(|e| e.message)?;
            let id = uuid::Uuid::new_v4().to_string();
            let participants = host.live();
            if participants.is_empty() {
                return Err("没有就绪文档窗口".into());
            }
            {
                let mut quit = host.quit.lock().map_err(|_| "退出状态不可读")?;
                if quit.is_some() {
                    return Err("已有退出操作".into());
                }
                *quit = Some(Quit::new(id.clone(), participants));
            }
            let mut lease = ExitLease {
                host: host.clone(),
                id: id.clone(),
                token: expected.clone(),
                instance,
                recording: None,
                #[cfg(target_os = "macos")]
                _maintenance: Some(maintenance),
            };
            host.app
                .emit("notes-settings-quit", json!({"id":id}))
                .map_err(|_| "无法通知所有窗口")?;
            let until = Instant::now() + Duration::from_secs(45);
            loop {
                let ready = {
                    let quit = host.quit.lock().map_err(|_| "退出状态不可读")?;
                    let q = quit.as_ref().ok_or("退出已取消")?;
                    if q.failed || q.participants != host.live() {
                        return Err("退出保存失败或窗口已变化".into());
                    }
                    q.ready(&host.live())
                };
                if ready {
                    break;
                }
                if Instant::now() >= until {
                    return Err("等待所有窗口保存超时".into());
                }
                tokio::time::sleep(Duration::from_millis(25)).await;
            }
            lease.recording = Some(crate::recording_window::seal_for_install(&host.app)?);
            host.with(|s| {
                s.check(&expected, None)?;
                if s.store.sync_store_instance() != instance {
                    return Err(error("退出资料库已变化"));
                }
                if s.pending.is_some() || s.sync_has_operation() || s.external_has_operation() {
                    return Err(error("仍有数据操作，安装已取消"));
                }
                s.settings_seal_exit(&expected)
            })
            .map_err(|e| e.message)?;
            Ok(Box::new(lease) as Box<dyn InstallLease>)
        })
    }
}
#[tauri::command]
pub(crate) fn settings_quit_ack(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: String,
    sealed: bool,
    success: bool,
) -> Result<()> {
    let host = &app.state::<SettingsHost>().0;
    let mut quit = host.quit.lock().map_err(|_| error("退出状态不可读"))?;
    let q = quit.as_mut().ok_or_else(|| error("退出已取消"))?;
    let all_sealed = q
        .acknowledge(&id, window.label(), &host.live(), sealed, success)
        .map_err(error)?;
    if all_sealed {
        app.emit("notes-settings-quit-ready", json!({"id":id}))
            .map_err(|_| error("无法通知就绪"))?;
    }
    Ok(())
}
