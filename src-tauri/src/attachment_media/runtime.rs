//! Production lifecycle/IPC service, independent of Tauri so the real creation,
//! grant/tag/release and event paths run in the native-free integration harness.
//! Only the host adapter may register windows; renderer input never carries one.
use super::*;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
};

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Purpose {
    Original,
    Thumbnail,
}

pub(crate) struct MediaRuntime {
    session: Arc<(Mutex<Session>, Condvar)>,
    authority: Arc<SessionAuthority>,
    pub(crate) core: Arc<MediaCore>,
    windows: Mutex<HashMap<String, WindowIdentity>>,
    boundary: Mutex<()>,
    server: Mutex<Option<MediaServer>>,
    base: String,
    stopped: AtomicBool,
}
impl MediaRuntime {
    pub(crate) async fn start_with_provider(
        session: Arc<(Mutex<Session>, Condvar)>,
        cache_root: PathBuf,
        origins: HashSet<String>,
        provider: Option<Arc<dyn super::provider::ThumbnailProvider>>,
    ) -> Result<Arc<Self>> {
        let authority = Arc::new(SessionAuthority::new(session.clone()));
        let cache = tokio::task::spawn_blocking(move || {
            let cache = ThumbnailCache::new(cache_root, ThumbnailLimits::default())?;
            Ok::<_, crate::store::AppError>(match provider {
                Some(p) => cache.with_provider(p),
                None => cache,
            })
        })
        .await
        .map_err(|_| cancelled())??;
        let core = MediaCore::new(authority.clone(), cache, Duration::from_secs(30 * 60))?;
        let server = MediaServer::start(core.clone(), origins).await?;
        Ok(Arc::new(Self {
            session,
            authority,
            core,
            windows: Mutex::new(HashMap::new()),
            boundary: Mutex::new(()),
            base: server.base.clone(),
            server: Mutex::new(Some(server)),
            stopped: AtomicBool::new(false),
        }))
    }
    fn available(&self) -> Result<()> {
        if self.stopped.load(Ordering::Acquire)
            || !self
                .server
                .lock()
                .map_err(|_| error("media_unavailable", "本地媒体服务不可用"))?
                .as_ref()
                .is_some_and(MediaServer::is_running)
        {
            Err(error("media_unavailable", "本地媒体服务已停止"))
        } else {
            Ok(())
        }
    }
    /// Host-only page/window creation callback; not an IPC parameter.
    pub(crate) fn opened(&self, real_label: &str) -> Result<()> {
        self.available()?;
        let mut windows = self.windows.lock().map_err(|_| cancelled())?;
        let identity = self.authority.open_window(real_label)?;
        windows.insert(real_label.into(), identity);
        Ok(())
    }
    pub(crate) fn window(&self, real_label: &str) -> Result<WindowIdentity> {
        self.available()?;
        self.windows
            .lock()
            .map_err(|_| cancelled())?
            .get(real_label)
            .cloned()
            .ok_or_else(|| error("access_changed", "媒体窗口未注册或已关闭"))
    }
    pub(crate) fn closed(&self, real_label: &str) {
        let _boundary = self.boundary.lock();
        if let Ok(mut windows) = self.windows.lock() {
            if let Some(window) = windows.remove(real_label) {
                self.authority.close_window(&window);
                self.core.revoke_window(&window);
            }
        }
    }
    pub(crate) async fn acquire(
        self: &Arc<Self>,
        window: WindowIdentity,
        id: String,
        token: Token,
        purpose: Purpose,
        pixels: Option<u32>,
    ) -> Result<Value> {
        self.available()?;
        if purpose == Purpose::Original && pixels.is_some()
            || purpose == Purpose::Thumbnail && pixels.is_none()
        {
            return Err(error("invalid", "媒体用途与缩略图尺寸不匹配"));
        }
        let grant = match purpose {
            Purpose::Original => {
                let core = self.core.clone();
                let w = window.clone();
                let t = token.clone();
                let key = id.clone();
                let base = self.base.clone();
                tokio::task::spawn_blocking(move || core.grant_original(&w, &key, &t, &base))
                    .await
                    .map_err(|_| cancelled())??
            }
            Purpose::Thumbnail => {
                self.core
                    .grant_thumbnail(&window, &id, &token, pixels.unwrap(), &self.base)
                    .await?
            }
        };
        // Recheck the real window and original after all worker IO. Tag while
        // holding the same Session used by every other production command.
        let result = (|| {
            let _boundary = self.boundary.lock().map_err(|_| cancelled())?;
            self.available()?;
            self.core.lease(&grant.lease_id)?;
            let current = self.authority.authorize(&window, &id, &token)?;
            let session = self.session.0.lock().map_err(|_| cancelled())?;
            let owner = session.store.attachment_note(&id)?;
            session.sensitive(&owner, &token)?;
            if session.store.media_attachment(&id)?.attachment != current.attachment {
                return Err(error("metadata_stale", "附件登记已改变"));
            }
            let mut value = serde_json::to_value(&grant)?;
            value["attachmentId"] = json!(id);
            value["noteId"] = json!(owner);
            value["purpose"] = json!(purpose);
            session.tagged(value)
        })();
        if result.is_err() {
            let _ = self.core.release(&window, &grant.lease_id);
        }
        result
    }
    pub(crate) fn release(&self, window: &WindowIdentity, lease: &str) -> Result<()> {
        self.core.release(window, lease)
    }
    /// Called AFTER dropping Session mutex and BEFORE emitting to renderers.
    /// Return cleanup errors to the emitter; revocation itself always happens.
    pub(crate) fn event(&self, name: &str, payload: &Value) -> Result<()> {
        let _boundary = self.boundary.lock().map_err(|_| cancelled())?;
        if matches!(name, "notes-access" | "notes-sync") && payload["phase"] == "prepare" {
            let ids = payload["noteIds"]
                .as_array()
                .ok_or_else(|| error("invalid", "媒体撤权事件缺少笔记范围"))?
                .iter()
                .map(|v| {
                    v.as_str()
                        .map(String::from)
                        .ok_or_else(|| error("invalid", "媒体撤权范围无效"))
                })
                .collect::<Result<Vec<_>>>()?;
            let operation = payload["operationId"]
                .as_str()
                .filter(|id| !id.is_empty())
                .ok_or_else(|| error("invalid", "媒体撤权事件缺少操作身份"))?;
            self.authority.suspend(operation, ids.clone())?;
            self.core.revoke_notes(&ids);
            // Capture under the real Store BEFORE a sync/purge can remove its
            // rows. Released leases still have derivatives on disk. Drop the
            // Session guard before cache cleanup to preserve lock order.
            let attachments = {
                let session = self.session.0.lock().map_err(|_| cancelled())?;
                ids.iter()
                    .map(|id| session.store.media_attachment_ids_for_note(id))
                    .collect::<Result<Vec<_>>>()?
                    .into_iter()
                    .flatten()
                    .collect::<Vec<_>>()
            };
            for id in attachments {
                self.core.invalidate_cached_attachment(&id)?;
            }
        }
        if matches!(name, "notes-access" | "notes-sync")
            && matches!(
                payload["phase"].as_str(),
                Some("commit" | "abort" | "release")
            )
        {
            if let Some(operation) = payload["operationId"].as_str() {
                self.authority.resume(operation)?;
            }
        }
        if name == "notes-metadata" {
            if let Some(changes) = payload["changes"].as_array() {
                for change in changes {
                    if change["kind"] == "attachment" {
                        if let Some(id) = change["id"].as_str() {
                            self.core.invalidate_cached_attachment(id)?;
                        }
                    }
                }
            }
            self.core.reconcile()?;
        }
        if name == "notes-access" && payload["phase"] != "prepare" {
            self.core.reconcile()?;
        }
        Ok(())
    }
    /// Optional extension: old workspace totals exclude this independently
    /// rebuildable directory. The global data boundary authenticates both.
    pub(crate) fn data_management(&self, token: &Token) -> Result<Value> {
        self.session
            .0
            .lock()
            .map_err(|_| cancelled())?
            .data_management(token)?;
        let usage = self.core.cache_usage()?;
        let session = self.session.0.lock().map_err(|_| cancelled())?;
        let mut value = session.data_management(token)?;
        value["mediaCache"] = json!({"version":1,"bytes":usage.bytes,
            "files":usage.files,"quota":usage.quota});
        Ok(value)
    }
    pub(crate) fn clear_cache(&self, token: &Token) -> Result<Value> {
        // Never hold Session while taking the cache lock: thumbnail workers
        // hold cache state while rechecking Session before atomic publication.
        self.session
            .0
            .lock()
            .map_err(|_| cancelled())?
            .data_management(token)?;
        self.core.clear_cache()?;
        let session = self.session.0.lock().map_err(|_| cancelled())?;
        session.data_management(token)?;
        session.tagged(json!({"cleared":true}))
    }
    pub(crate) fn stop(&self) {
        let _boundary = self.boundary.lock();
        self.stopped.store(true, Ordering::Release);
        self.core.revoke_all();
        if let Ok(mut server) = self.server.lock() {
            server.take();
        }
        if let Ok(mut windows) = self.windows.lock() {
            for (_, window) in windows.drain() {
                self.authority.close_window(&window);
            }
        }
    }
}
impl Drop for MediaRuntime {
    fn drop(&mut self) {
        self.stop();
    }
}
