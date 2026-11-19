//! Process-owned settings integration. Reuses the one Session and real window
//! save/recording owners; no service here opens a second Store or save queue.
mod backup;
mod cloud;
pub(crate) mod files;
pub(crate) mod lifecycle;
use crate::{
    session::{Session, Token},
    store::{AppError, Result},
    AppState,
};
pub(crate) use lifecycle::SettingsTasks;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};
pub(crate) struct Host {
    app: tauri::AppHandle,
    root: std::path::PathBuf,
    stopping: AtomicBool,
    ready: Mutex<HashSet<String>>,
    quit: Mutex<Option<Quit>>,
    prepared: Mutex<HashMap<String, files::Prepared>>,
    previews: Mutex<HashMap<String, String>>,
}
mod quit;
use quit::Quit;
pub(crate) fn error(message: &str) -> AppError {
    AppError {
        code: "settings_host".into(),
        message: message.into(),
        commit: None,
    }
}
impl Host {
    pub(crate) fn new(app: tauri::AppHandle, root: std::path::PathBuf) -> Arc<Self> {
        Arc::new(Self {
            app,
            root,
            stopping: AtomicBool::new(false),
            ready: Mutex::new(HashSet::new()),
            quit: Mutex::new(None),
            prepared: Mutex::new(HashMap::new()),
            previews: Mutex::new(HashMap::new()),
        })
    }
    pub(crate) fn window_loading(&self, label: &str) {
        if let Ok(mut ready) = self.ready.lock() {
            ready.remove(label);
        }
        if let Ok(mut quit) = self.quit.lock() {
            if let Some(q) = quit.as_mut() {
                if q.participants.contains(label) {
                    q.failed = true;
                }
            }
        }
    }
    pub(crate) fn stop(&self) {
        self.stopping.store(true, Ordering::Release);
    }
    fn live(&self) -> HashSet<String> {
        crate::recording_window::document_participants(self.app.webview_windows().into_keys())
    }
    fn with<T>(&self, f: impl FnOnce(&mut Session) -> Result<T>) -> Result<T> {
        let state = self.app.state::<AppState>();
        let mut session = state.0 .0.lock().map_err(|_| error("资料库锁不可用"))?;
        f(&mut session)
    }
    fn check(&self, session: &Session, token: &Token, label: &str) -> Result<()> {
        if self.stopping.load(Ordering::Acquire)
            || self
                .quit
                .lock()
                .map_err(|_| error("退出状态不可读"))?
                .is_some()
        {
            return Err(error("应用正在准备退出"));
        }
        session.sync_check_window(label, &self.live(), token)
    }
    fn emit(&self, event: &Value) -> Result<()> {
        crate::emit_document_event(&self.app, "notes-sync", event)
    }
    fn events(&self, session: &mut Session, event: Value, access: Option<Value>) -> Result<()> {
        if let Some(metadata) = session.take_metadata_event() {
            crate::emit_document_event(&self.app, "notes-metadata", &metadata)?;
        }
        if let Some(access) = access {
            crate::emit_document_event(&self.app, "notes-access", &access)?;
        }
        self.emit(&event)
    }
    fn barrier(&self, token: &Token, label: &str) -> Result<Barrier<'_>> {
        crate::recording_window::ensure_snapshot_idle(&self.app)
            .map_err(|message| error(&message))?;
        let event = self.with(|s| {
            self.check(s, token, label)?;
            s.settings_begin(self.live())
        })?;
        let id = event["operationId"].as_str().unwrap().to_owned();
        let held = Barrier {
            host: self,
            id,
            token: token.clone(),
            finished: false,
        };
        self.emit(&event)?;
        let until = Instant::now() + Duration::from_secs(8);
        loop {
            let ready = self.with(|s| {
                self.check(s, token, label)?;
                if s.sync_terminal_outcome(&held.id).is_some() {
                    return Err(error("活动录音、输入法或附件操作尚未完成，请稍后重试"));
                }
                if let Some((event, access)) = s.sync_tick(&self.live())? {
                    self.events(s, event, access)?;
                }
                Ok(s.settings_ready(&held.id, &self.live(), token).is_ok())
            })?;
            if ready {
                let media = self.with(|s| s.settings_hold_media(&held.id, &self.live(), token))?;
                self.emit(&media)?;
                return Ok(held);
            }
            if Instant::now() >= until {
                return Err(error("等待所有窗口保存超时"));
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    }
    fn context(&self) -> Result<crate::cloud_sync::Context> {
        self.with(|s| {
            let token = s.sync_media_token();
            self.check(s, &token, "main")?;
            Ok(crate::cloud_sync::Context {
                window: "main".into(),
                session: token.session_id.clone(),
                token: serde_json::to_value(token)?,
                store_instance: s.store.sync_store_instance().to_string(),
            })
        })
    }
}
struct Barrier<'a> {
    host: &'a Host,
    id: String,
    token: Token,
    finished: bool,
}
impl Barrier<'_> {
    fn check(&self, s: &Session) -> Result<()> {
        s.settings_check_held(&self.id, &self.host.live(), &self.token)
    }
}
impl Drop for Barrier<'_> {
    fn drop(&mut self) {
        if !self.finished {
            let _ = self.host.with(|s| {
                if let Ok(event) = s.settings_release(&self.id, false) {
                    self.host.emit(&event)?;
                }
                Ok(())
            });
        }
    }
}
pub(crate) struct SettingsHost(pub Arc<Host>);
#[tauri::command]
pub(crate) fn settings_host_context(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<crate::cloud_sync::Context> {
    let host = &app.state::<SettingsHost>().0;
    host.with(|s| {
        let token = s.sync_media_token();
        host.check(s, &token, window.label())?;
        Ok(crate::cloud_sync::Context {
            window: window.label().into(),
            session: token.session_id.clone(),
            token: serde_json::to_value(token)?,
            store_instance: s.store.sync_store_instance().to_string(),
        })
    })
}
#[tauri::command]
pub(crate) fn settings_host_ready(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    expected: Token,
) -> Result<()> {
    let host = &app.state::<SettingsHost>().0;
    host.with(|s| {
        host.check(s, &expected, window.label())?;
        Ok(())
    })?;
    host.ready
        .lock()
        .map_err(|_| error("窗口就绪状态不可读"))?
        .insert(window.label().into());
    let ready = {
        let ready = host.ready.lock().map_err(|_| error("窗口就绪状态不可读"))?;
        host.live().is_subset(&ready)
    };
    if ready {
        if let Some(updater) = app.try_state::<Arc<crate::software_update::SoftwareUpdater>>() {
            updater
                .acknowledge_launch()
                .map_err(|_| error("更新启动确认失败，保留恢复记录"))?;
        }
    }
    Ok(())
}
