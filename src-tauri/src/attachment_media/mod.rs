//! Managed media core. Integration must supply an authorizer and forward real
//! window destruction / access-prepare events. No IPC or default-allow policy.
//! HTTP URLs are bearer capabilities, not per-request WebView authentication.
mod http;
pub(crate) mod provider;
pub(crate) mod runtime;
mod svg_text;
mod thumbnail;

use crate::store::attachment_media::{FileStamp, ManagedAttachment, VerifiedFile};
use crate::{
    session::{Session, Token},
    store::{AppError, Result},
};
pub(crate) use http::MediaServer;
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, AtomicUsize},
        Arc, Condvar, Mutex,
    },
    time::{Duration, Instant},
};
pub(crate) use thumbnail::{CacheUsage, ThumbnailCache, ThumbnailLimits};
use tokio::sync::watch;
use uuid::Uuid;

fn error(code: &str, message: &str) -> AppError {
    AppError {
        code: code.into(),
        message: message.into(),
        commit: None,
    }
}
fn cancelled() -> AppError {
    error("cancelled", "媒体读取已结束")
}

/// Trusted host creates this from its real window lifecycle, never deserialize
/// a renderer-provided label/incarnation into a valid WindowIdentity.
#[derive(Clone, PartialEq, Eq)]
pub(crate) struct WindowIdentity {
    label: String,
    incarnation: String,
}

pub(crate) trait Authorizer: Send + Sync {
    /// Must perform real Session.sensitive + current managed registration checks.
    /// Descriptor is detached before filesystem IO; no Session lock survives.
    fn authorize(
        &self,
        window: &WindowIdentity,
        id: &str,
        token: &Token,
    ) -> Result<ManagedAttachment>;
}

/// Production authorization adapter, also used unchanged by the native-free
/// tests. Structurally identical to the existing AppState shared session.
pub(crate) struct SessionAuthority {
    session: Arc<(Mutex<Session>, Condvar)>,
    windows: Mutex<HashMap<String, String>>,
    suspensions: Mutex<HashMap<String, Vec<String>>>,
}
impl SessionAuthority {
    pub(crate) fn new(session: Arc<(Mutex<Session>, Condvar)>) -> Self {
        Self {
            session,
            windows: Mutex::new(HashMap::new()),
            suspensions: Mutex::new(HashMap::new()),
        }
    }
    pub(crate) fn open_window(&self, real_label: &str) -> Result<WindowIdentity> {
        if real_label.is_empty()
            || real_label.len() > 128
            || real_label.chars().any(char::is_control)
        {
            return Err(error("invalid", "真实窗口身份无效"));
        }
        let mut windows = self
            .windows
            .lock()
            .map_err(|_| error("media_io", "窗口注册表不可用"))?;
        let incarnation = windows
            .entry(real_label.into())
            .or_insert_with(|| Uuid::new_v4().to_string())
            .clone();
        Ok(WindowIdentity {
            label: real_label.into(),
            incarnation,
        })
    }
    /// Sync quiet-prepare is not Session.pending. The host forwards its exact
    /// operation range before renderer ACKs; no new HTTP grant can refill it.
    pub(crate) fn suspend(&self, operation: &str, ids: Vec<String>) -> Result<()> {
        let mut suspensions = self.suspensions.lock().map_err(|_| cancelled())?;
        let current = suspensions.entry(operation.into()).or_default();
        for id in ids {
            if !current.contains(&id) {
                current.push(id);
            }
        }
        Ok(())
    }
    pub(crate) fn resume(&self, operation: &str) -> Result<()> {
        self.suspensions
            .lock()
            .map_err(|_| cancelled())?
            .remove(operation);
        Ok(())
    }
    /// Call alongside MediaCore.revoke_window: registry denial is immediate even
    /// before streams observe cancellation; reopening creates a new incarnation.
    pub(crate) fn close_window(&self, window: &WindowIdentity) {
        if let Ok(mut windows) = self.windows.lock() {
            if windows.get(&window.label) == Some(&window.incarnation) {
                windows.remove(&window.label);
            }
        }
    }
}
impl Authorizer for SessionAuthority {
    fn authorize(
        &self,
        window: &WindowIdentity,
        id: &str,
        token: &Token,
    ) -> Result<ManagedAttachment> {
        let windows = self
            .windows
            .lock()
            .map_err(|_| error("access_changed", "窗口身份不可用"))?;
        if windows.get(&window.label) != Some(&window.incarnation) {
            return Err(error("access_changed", "媒体所属窗口已关闭"));
        }
        let session = self
            .session
            .0
            .lock()
            .map_err(|_| error("access_changed", "授权状态不可用"))?;
        let owner = session.store.attachment_note(id)?;
        session.sensitive(&owner, token)?;
        if self
            .suspensions
            .lock()
            .map_err(|_| cancelled())?
            .values()
            .any(|ids| ids.contains(&owner))
        {
            return Err(error("access_changed", "附件正在同步提交，请稍候"));
        }
        session.store.media_attachment(id)
    }
}

#[derive(Default)]
pub(crate) struct MediaMetrics {
    pub bytes_read: AtomicU64,
    pub read_operations: AtomicU64,
    pub original_bytes_read: AtomicU64,
    pub original_read_operations: AtomicU64,
    pub thumbnail_bytes_read: AtomicU64,
    pub thumbnail_read_operations: AtomicU64,
    /// Registered source size per generation attempt, NOT decoder/physical IO.
    pub thumbnail_source_logical_bytes: AtomicU64,
    pub thumbnail_generation_attempts: AtomicU64,
    /// Encoded bytes of successfully published derivatives, not HTTP traffic.
    pub thumbnail_output_bytes: AtomicU64,
    pub peak_read_block: AtomicUsize,
    pub active_streams: AtomicUsize,
    pub thumbnail_generations: AtomicU64,
    pub thumbnail_hits: AtomicU64,
}

struct Identity {
    window: WindowIdentity,
    token: Token,
    original: ManagedAttachment,
    stamp: FileStamp,
    cache_epoch: Option<u64>,
}
struct Lease {
    identity: Identity,
    source: Source,
    mime: String,
    bytes: u64,
    last_used: Mutex<Instant>,
    cancel: watch::Sender<bool>,
}
enum Source {
    Original,
    Thumbnail(thumbnail::CachedThumbnail),
}
impl Lease {
    fn cancel(&self) {
        self.cancel.send_replace(true);
    }
}
impl Drop for Lease {
    fn drop(&mut self) {
        self.cancel();
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MediaGrant {
    pub lease_id: String,
    /// URL is created only after the loopback service has successfully bound.
    pub url: String,
    pub mime: String,
    pub bytes: u64,
    pub name: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

pub(crate) struct MediaCore {
    authorizer: Arc<dyn Authorizer>,
    leases: Mutex<HashMap<String, Arc<Lease>>>,
    cache: Arc<ThumbnailCache>,
    idle_ttl: Duration,
    cache_epoch: AtomicU64,
    pub metrics: Arc<MediaMetrics>,
}
impl MediaCore {
    pub(crate) fn new(
        authorizer: Arc<dyn Authorizer>,
        cache: ThumbnailCache,
        idle_ttl: Duration,
    ) -> Result<Arc<Self>> {
        if idle_ttl.is_zero() {
            return Err(error("invalid", "租约有效期无效"));
        }
        Ok(Arc::new(Self {
            authorizer,
            leases: Mutex::new(HashMap::new()),
            cache: Arc::new(cache),
            idle_ttl,
            cache_epoch: AtomicU64::new(0),
            metrics: Arc::new(MediaMetrics::default()),
        }))
    }
    fn identity(&self, window: &WindowIdentity, id: &str, token: &Token) -> Result<Identity> {
        let original = self.authorizer.authorize(window, id, token)?;
        // Actual filesystem work runs after authorize() drops its Session guard.
        let opened = original.open()?;
        let identity = Identity {
            window: window.clone(),
            token: token.clone(),
            original,
            stamp: opened.stamp,
            cache_epoch: None,
        };
        self.check_identity(&identity)?;
        Ok(identity)
    }
    fn check_identity(&self, identity: &Identity) -> Result<()> {
        if identity
            .cache_epoch
            .is_some_and(|e| self.cache_epoch.load(std::sync::atomic::Ordering::Acquire) != e)
        {
            return Err(cancelled());
        }
        let current = self.authorizer.authorize(
            &identity.window,
            &identity.original.attachment.id,
            &identity.token,
        )?;
        if current.attachment != identity.original.attachment
            || current.open()?.stamp != identity.stamp
        {
            return Err(error("metadata_stale", "附件原件已改变，请重新加载"));
        }
        Ok(())
    }
    fn check_lease(&self, lease: &Lease) -> Result<()> {
        if *lease.cancel.borrow() {
            return Err(cancelled());
        }
        let expired = lease.last_used.lock().map_err(|_| cancelled())?.elapsed() > self.idle_ttl;
        if expired {
            lease.cancel();
            return Err(cancelled());
        }
        if let Err(e) = self.check_identity(&lease.identity) {
            lease.cancel();
            return Err(e);
        }
        if *lease.cancel.borrow() {
            return Err(cancelled());
        }
        *lease.last_used.lock().map_err(|_| cancelled())? = Instant::now();
        Ok(())
    }
    fn insert(
        &self,
        identity: Identity,
        source: Source,
        mime: String,
        bytes: u64,
        base: &str,
    ) -> Result<MediaGrant> {
        self.check_identity(&identity)?;
        let id = Uuid::new_v4().simple().to_string();
        let (width, height) = match &source {
            Source::Thumbnail(c) => (Some(c.width), Some(c.height)),
            _ => (None, None),
        };
        let grant = MediaGrant {
            lease_id: id.clone(),
            url: format!("{base}/media/{id}"),
            mime: mime.clone(),
            bytes,
            name: identity.original.attachment.display_name.clone(),
            width,
            height,
        };
        let (cancel, _) = watch::channel(false);
        let lease = Arc::new(Lease {
            identity,
            source,
            mime,
            bytes,
            last_used: Mutex::new(Instant::now()),
            cancel,
        });
        let mut leases = self.leases.lock().map_err(|_| cancelled())?;
        if lease
            .identity
            .cache_epoch
            .is_some_and(|e| self.cache_epoch.load(std::sync::atomic::Ordering::Acquire) != e)
        {
            return Err(cancelled());
        }
        // Bound abandoned grants as well as active response buffers. Expired
        // entries are reclaimed on acquisition and by the server sweeper.
        leases.retain(|_, l| {
            let live = !*l.cancel.borrow()
                && l.last_used
                    .lock()
                    .is_ok_and(|t| t.elapsed() <= self.idle_ttl);
            if !live {
                l.cancel();
            }
            live
        });
        if leases.len() >= 2048 {
            return Err(error("media_busy", "媒体资源过多，请稍后重试"));
        }
        leases.insert(id, lease);
        Ok(grant)
    }
    /// Call from a blocking worker, not the UI thread. HEAD sniff is bounded.
    pub(crate) fn grant_original(
        &self,
        window: &WindowIdentity,
        id: &str,
        token: &Token,
        base: &str,
    ) -> Result<MediaGrant> {
        let identity = self.identity(window, id, token)?;
        let opened = identity.original.open()?;
        let mime = thumbnail::sniff_mime(&opened.file, &identity.original.attachment.mime)?;
        let bytes = identity.stamp.bytes;
        self.insert(identity, Source::Original, mime, bytes, base)
    }
    pub(crate) async fn grant_thumbnail(
        self: &Arc<Self>,
        window: &WindowIdentity,
        id: &str,
        token: &Token,
        pixels: u32,
        base: &str,
    ) -> Result<MediaGrant> {
        let cache_epoch = self.cache_epoch.load(std::sync::atomic::Ordering::Acquire);
        let core = self.clone();
        let window = window.clone();
        let token = token.clone();
        let id = id.to_string();
        let mut identity = tokio::task::spawn_blocking(move || core.identity(&window, &id, &token))
            .await
            .map_err(|_| cancelled())??;
        identity.cache_epoch = Some(cache_epoch);
        let permit = self
            .cache
            .queue
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| cancelled())?;
        let core = self.clone();
        let base = base.to_string();
        tokio::task::spawn_blocking(move || {
            let _permit = permit;
            core.check_identity(&identity)?;
            let cached = core.cache.get(
                &identity.original,
                &identity.stamp,
                pixels,
                &core.metrics,
                || {
                    if core.cache_epoch.load(std::sync::atomic::Ordering::Acquire) != cache_epoch {
                        return Err(cancelled());
                    }
                    core.check_identity(&identity)
                },
            )?;
            if core.cache_epoch.load(std::sync::atomic::Ordering::Acquire) != cache_epoch {
                return Err(cancelled());
            }
            let bytes = cached.stamp.bytes;
            core.insert(
                identity,
                Source::Thumbnail(cached),
                "image/png".into(),
                bytes,
                &base,
            )
        })
        .await
        .map_err(|_| cancelled())?
    }
    /// Release cannot affect a different window's capability, even if its ID is known.
    pub(crate) fn release(&self, window: &WindowIdentity, id: &str) -> Result<()> {
        let mut leases = self.leases.lock().map_err(|_| cancelled())?;
        if let Some(lease) = leases.get(id) {
            if &lease.identity.window != window {
                return Err(error("access_changed", "媒体租约不属于当前窗口"));
            }
            lease.cancel();
            leases.remove(id);
        }
        Ok(())
    }
    pub(crate) fn revoke_window(&self, window: &WindowIdentity) {
        self.revoke(|l| &l.identity.window == window);
    }
    /// Forward access prepare, committed deletion/replacement, and workspace reset.
    /// Revoke before asking renderers to ACK clearing their decoded resources.
    pub(crate) fn revoke_notes(&self, notes: &[String]) {
        self.revoke(|l| notes.contains(&l.identity.original.attachment.note_id));
    }
    pub(crate) fn revoke_all(&self) {
        self.revoke(|_| true);
    }
    fn revoke(&self, predicate: impl Fn(&Lease) -> bool) {
        if let Ok(mut leases) = self.leases.lock() {
            leases.retain(|_, l| {
                if predicate(l) {
                    l.cancel();
                    false
                } else {
                    true
                }
            });
        }
    }
    /// Metadata receipts are broader than media changes (typing, pinning, etc.).
    /// Keep unaffected leases; cancel only identities whose registration/access
    /// or managed-file version is no longer valid. No Session lock is held here.
    pub(crate) fn reconcile(&self) -> Result<()> {
        let candidates: Vec<_> = self
            .leases
            .lock()
            .map_err(|_| cancelled())?
            .values()
            .cloned()
            .collect();
        for lease in candidates {
            if let Err(error) = self.check_identity(&lease.identity) {
                // A cache-only clear can race this snapshot. Its thumbnail
                // epoch cancellation does not invalidate the source or an
                // independent original playback lease for the same attachment.
                if error.code != "cancelled" {
                    self.invalidate_cached_attachment(&lease.identity.original.attachment.id)?;
                }
            }
        }
        Ok(())
    }
    pub(crate) fn expire(&self) {
        self.revoke(|l| {
            l.last_used
                .lock()
                .map_or(true, |t| t.elapsed() > self.idle_ttl)
        });
    }
    /// Filesystem cache cleanup follows the same explicit deletion/reset hooks.
    pub(crate) fn invalidate_cached_attachment(&self, id: &str) -> Result<()> {
        self.revoke(|l| l.identity.original.attachment.id == id);
        self.cache.invalidate(id)
    }
    /// The App's global data-management authorization still guards this call.
    pub(crate) fn cache_usage(&self) -> Result<CacheUsage> {
        self.cache.usage()
    }
    pub(crate) fn clear_cache(&self) -> Result<()> {
        self.cache_epoch
            .fetch_add(1, std::sync::atomic::Ordering::AcqRel);
        self.revoke(|l| matches!(l.source, Source::Thumbnail(_)));
        self.cache.clear()
    }
    fn lease(&self, id: &str) -> Result<Arc<Lease>> {
        let lease = self
            .leases
            .lock()
            .map_err(|_| cancelled())?
            .get(id)
            .cloned()
            .ok_or_else(cancelled)?;
        self.check_lease(&lease)?;
        Ok(lease)
    }
    fn open_source(&self, lease: &Lease) -> Result<VerifiedFile> {
        self.check_lease(lease)?;
        let opened = match &lease.source {
            Source::Original => lease.identity.original.open()?,
            Source::Thumbnail(c) => c.open()?,
        };
        let expected = match &lease.source {
            Source::Original => &lease.identity.stamp,
            Source::Thumbnail(c) => &c.stamp,
        };
        if &opened.stamp != expected {
            return Err(error("metadata_stale", "媒体文件已改变"));
        }
        self.check_lease(lease)?;
        Ok(opened)
    }
}
impl Drop for MediaCore {
    fn drop(&mut self) {
        self.revoke_all();
    }
}
