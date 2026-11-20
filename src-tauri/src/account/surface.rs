//! Presentation belongs to one authorization generation AND one native instance.
//! Its short mutex never waits for the long-lived login/lifecycle owner.
use super::{
    types::{AuthorizationSurface as Surface, Error, NetworkStage, Result},
    Runtime,
};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri_plugin_notes_auth::{Event, NativeAuthExt};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Mode {
    Starting,
    Embedded,
    Switching,
    Browser,
    Completing,
    Retired,
}
struct State {
    requested: Surface,
    mode: Mode,
    url: Option<url::Url>,
    native: bool,
    failure: Option<NetworkStage>,
}
impl State {
    fn new(requested: Surface, url: url::Url) -> Self {
        Self {
            requested,
            mode: Mode::Starting,
            url: Some(url),
            native: false,
            failure: None,
        }
    }
    fn surface(&self) -> Option<Surface> {
        match self.mode {
            Mode::Embedded | Mode::Switching => Some(Surface::Embedded),
            Mode::Browser => Some(Surface::Browser),
            _ => None,
        }
    }
    fn switch(&mut self) -> Result<url::Url> {
        if self.mode != Mode::Embedded {
            return Err(Error::Busy);
        }
        let url = self.url.clone().ok_or(Error::Busy)?;
        self.mode = Mode::Switching;
        Ok(url)
    }
    fn switched(&mut self, opened: bool) -> bool {
        if self.mode != Mode::Switching {
            return false;
        }
        self.mode = if opened {
            Mode::Browser
        } else {
            Mode::Embedded
        };
        if opened {
            self.url = None;
        }
        true
    }
    fn disarm(&mut self, mode: Mode) -> bool {
        self.mode = mode;
        self.url = None;
        std::mem::take(&mut self.native)
    }
    fn ended_by_host(&mut self, failed: bool) -> bool {
        if !self.native || !matches!(self.mode, Mode::Starting | Mode::Embedded | Mode::Switching) {
            return false;
        }
        self.failure = failed.then_some(if self.mode == Mode::Starting {
            NetworkStage::EmbeddedOpen
        } else {
            NetworkStage::IdentityProvider
        });
        self.disarm(Mode::Retired)
    }
}
pub(super) struct Presentation {
    pub generation: u64,
    pub instance: String,
    app: tauri::AppHandle,
    stop: CancellationToken,
    state: Mutex<State>,
    opened: Notify,
}
pub(super) struct Lease(pub Arc<Presentation>);
impl Drop for Lease {
    fn drop(&mut self) {
        self.0.retire();
    }
}
impl Presentation {
    pub fn new(
        runtime: &Arc<Runtime>,
        surface: Surface,
        generation: u64,
        url: url::Url,
        stop: CancellationToken,
    ) -> Result<Arc<Self>> {
        if !hosted(&url) || url.path() != "/oidc/auth" {
            return Err(Error::Configuration);
        }
        Ok(Arc::new(Self {
            generation,
            instance: format!("account-auth-{}", uuid::Uuid::new_v4()),
            app: runtime.app.clone(),
            stop,
            state: Mutex::new(State::new(surface, url)),
            opened: Notify::new(),
        }))
    }
    pub(super) fn native_active(&self) -> bool {
        !self.stop.is_cancelled()
            && self.state.lock().is_ok_and(|s| {
                s.native && matches!(s.mode, Mode::Starting | Mode::Embedded | Mode::Switching)
            })
    }
    pub fn surface(&self) -> Option<Surface> {
        if self.stop.is_cancelled() {
            return None;
        }
        self.state.lock().ok().and_then(|s| s.surface())
    }
    pub async fn open(self: &Arc<Self>, runtime: &Arc<Runtime>) -> Result<()> {
        let (surface, url) = {
            let mut s = self.state.lock().map_err(|_| Error::Storage)?;
            if self.stop.is_cancelled() || s.mode != Mode::Starting {
                return Err(Error::Cancelled);
            }
            s.native = s.requested == Surface::Embedded;
            (s.requested, s.url.clone().ok_or(Error::Cancelled)?)
        };
        match surface {
            Surface::Browser => {
                self.app
                    .opener()
                    .open_url(url.as_str(), None::<&str>)
                    .map_err(|_| Error::NetworkAt(NetworkStage::BrowserOpen))?;
                let mut s = self.state.lock().map_err(|_| Error::Storage)?;
                if self.stop.is_cancelled() || s.mode != Mode::Starting {
                    return Err(Error::Cancelled);
                }
                s.mode = Mode::Browser;
                s.url = None;
            }
            Surface::Embedded => {
                let presentation = self.clone();
                let owner = Arc::downgrade(runtime);
                // A queued platform call is not evidence that a window exists.
                // Budget both the dispatch and the window acknowledgement.
                let opening = async {
                    self.app
                        .native_auth()
                        .open(
                            &self.app,
                            &self.instance,
                            self.generation,
                            url.as_str(),
                            Arc::new(move |event| {
                                let Some(runtime) = owner.upgrade() else {
                                    presentation.retire();
                                    return;
                                };
                                if !runtime.current(presentation.generation)
                                    || !presentation.native_active()
                                {
                                    return;
                                }
                                match event {
                                    Event::Opened => {
                                        if let Ok(mut s) = presentation.state.lock() {
                                            if s.mode == Mode::Starting {
                                                s.mode = Mode::Embedded;
                                                presentation.opened.notify_one();
                                            }
                                        }
                                    }
                                    Event::Closed => presentation.close_embedded(false),
                                    Event::Destroyed | Event::Failed => {
                                        presentation.close_embedded(true)
                                    }
                                    Event::Continue => {
                                        let instance = presentation.instance.clone();
                                        tauri::async_runtime::spawn(async move {
                                            let _ = runtime
                                                .open_login_in_browser(Some(&instance))
                                                .await;
                                        });
                                    }
                                    Event::Callback(raw) => {
                                        // A private native callback, never a renderer-supplied URL.
                                        #[cfg(target_os = "android")]
                                        {
                                            let p = presentation.clone();
                                            tauri::async_runtime::spawn(async move {
                                                if let Ok(url) = raw.parse() {
                                                    runtime.embedded_callback(&p, url).await;
                                                }
                                            });
                                        }
                                        #[cfg(not(target_os = "android"))]
                                        let _ = raw; // Desktop keeps its exact HTTP loopback receiver.
                                    }
                                }
                            }),
                        )
                        .await
                        .map_err(|_| Error::NetworkAt(NetworkStage::EmbeddedOpen))?;
                    self.opened.notified().await;
                    Ok::<(), Error>(())
                };
                tokio::time::timeout(Duration::from_secs(15), opening)
                    .await
                    .map_err(|_| Error::NetworkAt(NetworkStage::EmbeddedOpen))??;
            }
        }
        Ok(())
    }
    pub fn begin_switch(&self) -> Result<url::Url> {
        if self.stop.is_cancelled() {
            return Err(Error::Cancelled);
        }
        self.state.lock().map_err(|_| Error::Storage)?.switch()
    }
    pub fn end_switch(&self, opened: bool) -> bool {
        let close = {
            let Ok(mut s) = self.state.lock() else {
                return false;
            };
            if self.stop.is_cancelled() || !s.switched(opened) {
                return false;
            }
            // Disarm under the same short guard BEFORE native close is queued.
            opened && std::mem::take(&mut s.native)
        };
        if close {
            self.close_native();
        }
        true
    }
    fn close_native(&self) {
        self.app
            .native_auth()
            .close(&self.app, &self.instance, self.generation);
    }
    fn close_embedded(&self, failed: bool) {
        {
            let Ok(mut s) = self.state.lock() else {
                return;
            };
            if !s.ended_by_host(failed) {
                return;
            }
            self.stop.cancel();
        }
        self.close_native();
    }
    pub fn stopped_error(&self) -> Error {
        self.state
            .lock()
            .ok()
            .and_then(|s| s.failure)
            .map_or(Error::Cancelled, Error::NetworkAt)
    }
    pub fn completing(&self) {
        self.disarm(Mode::Completing);
    }
    pub fn retire(&self) {
        self.disarm(Mode::Retired);
    }
    fn disarm(&self, mode: Mode) {
        let close = self
            .state
            .lock()
            .map(|mut s| s.disarm(mode))
            .unwrap_or(false);
        if close {
            self.close_native();
        }
    }
}
/// No endpoint or origin is accepted from IPC. Native containers duplicate this
/// fixed navigation policy and deny popups/downloads/local interfaces. Android
/// request hooks do not provide a complete redirect/WebSocket network firewall.
fn hosted(url: &url::Url) -> bool {
    url.scheme() == "https"
        && url.host_str() == Some("auth.x.aixgg.com")
        && url.port_or_known_default() == Some(443)
        && url.username().is_empty()
        && url.password().is_none()
        && url.fragment().is_none()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn embedded() -> State {
        let mut s = State::new(
            Surface::Embedded,
            "https://auth.x.aixgg.com/oidc/auth?state=fixture&code_challenge=fixture"
                .parse()
                .unwrap(),
        );
        s.mode = Mode::Embedded;
        s.native = true;
        s
    }
    #[test]
    fn switch_reuses_url_preserves_failed_owner_and_rejects_duplicates() {
        let mut s = embedded();
        let original = s.url.clone().unwrap();
        assert_eq!(s.switch().unwrap(), original);
        assert_eq!(s.surface(), Some(Surface::Embedded));
        assert_eq!(s.switch(), Err(Error::Busy));
        assert!(s.switched(false));
        assert_eq!(s.url.as_ref(), Some(&original));
        assert_eq!(s.switch().unwrap(), original);
        assert!(s.switched(true));
        assert_eq!(s.surface(), Some(Surface::Browser));
        assert!(s.url.is_none());
        assert_eq!(s.switch(), Err(Error::Busy));
    }
    #[test]
    fn cancellation_and_callback_win_over_late_transfer_without_rearming() {
        for terminal in [Mode::Retired, Mode::Completing] {
            let mut old = embedded();
            old.switch().unwrap();
            assert!(old.disarm(terminal));
            assert!(!old.switched(true));
            assert!(!old.switched(false));
            assert!(old.url.is_none());
            assert!(old.surface().is_none());
            let replacement = embedded();
            assert_eq!(replacement.surface(), Some(Surface::Embedded));
            assert!(!old.disarm(Mode::Retired));
            assert!(replacement.native);
        }
    }
    #[test]
    fn a_failed_window_is_distinct_from_user_close_and_cannot_cancel_a_transferred_owner() {
        let mut starting = embedded();
        starting.mode = Mode::Starting;
        assert!(starting.ended_by_host(true));
        assert_eq!(starting.failure, Some(NetworkStage::EmbeddedOpen));
        assert!(!starting.ended_by_host(false));
        let mut closed = embedded();
        assert!(closed.ended_by_host(false));
        assert_eq!(closed.failure, None);
        let mut transferred = embedded();
        transferred.switch().unwrap();
        assert!(transferred.switched(true));
        assert!(!transferred.ended_by_host(true));
        assert_eq!(transferred.surface(), Some(Surface::Browser));
    }
    #[test]
    fn native_host_policy_rejects_other_schemes_hosts_ports_and_credentials() {
        assert!(hosted(&"https://auth.x.aixgg.com/sign-in".parse().unwrap()));
        for value in [
            "http://auth.x.aixgg.com/",
            "https://auth.x.aixgg.com.evil/",
            "https://auth.x.aixgg.com:444/",
            "https://user@auth.x.aixgg.com/",
            "file:///tmp/file",
            "tauri://localhost/",
            "https://auth.x.aixgg.com/#fragment",
        ] {
            assert!(!hosted(&value.parse().unwrap()));
        }
    }
}
