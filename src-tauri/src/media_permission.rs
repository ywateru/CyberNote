//! Kind-only media permission callbacks cannot query their WebView synchronously.
//! Trust belongs to a real WebView resource table, never to a reusable label.
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{
    webview::{PageLoadEvent, PermissionKind, PermissionResponse},
    Manager, Resource, Runtime, Url, Webview,
};

#[derive(Clone, Copy)]
enum BundleOrigin {
    CustomProtocol,
    HttpWorkaround,
}

#[derive(Clone, Copy)]
struct EntryBoundary {
    bundle: BundleOrigin,
    development: bool,
}

impl EntryBoundary {
    fn current() -> Self {
        Self {
            bundle: if cfg!(any(target_os = "android", target_os = "windows")) {
                BundleOrigin::HttpWorkaround
            } else {
                BundleOrigin::CustomProtocol
            },
            development: cfg!(dev),
        }
    }

    fn allows(self, url: &Url) -> bool {
        // Only the actual app entry document; query/hash do not select code.
        if !url.username().is_empty() || url.password().is_some() {
            return false;
        }
        let entry_path = matches!(url.path(), "/" | "/index.html");
        let bundle = match self.bundle {
            BundleOrigin::CustomProtocol => {
                // Tauri keeps tauri://localhost (empty path) for index.html.
                // This root spelling is specific to the custom protocol.
                (entry_path || url.path().is_empty())
                    && url.scheme() == "tauri"
                    && url.host_str() == Some("localhost")
                    && url.port().is_none()
            }
            BundleOrigin::HttpWorkaround => {
                entry_path
                    && url.scheme() == "http"
                    && url.host_str() == Some("tauri.localhost")
                    && url.port_or_known_default() == Some(80)
            }
        };
        bundle
            || (self.development
                && entry_path
                && url.scheme() == "http"
                && url.host_str() == Some("localhost")
                && url.port_or_known_default() == Some(1420))
    }
}

#[derive(Default)]
struct PageTrust {
    // No public frame/load id exists. This is a trusted-source boundary,
    // not proof that the newest same-URL load has finished painting.
    started: Option<String>,
    committed: bool,
    blocked: bool,
}

impl PageTrust {
    fn revoke(&mut self) {
        self.committed = false;
        self.blocked = true;
        self.started = None;
    }

    fn navigation(&mut self, url: &Url, boundary: EntryBoundary) -> bool {
        self.committed = false;
        if !boundary.allows(url) {
            // Even a vetoed external navigation cannot be undone by a late
            // Finished from the preceding trusted document.
            self.revoke();
            return false;
        }
        self.started = None;
        true
    }

    fn page_load(&mut self, url: &Url, event: PageLoadEvent, boundary: EntryBoundary) {
        if !boundary.allows(url) {
            self.revoke();
            return;
        }
        if self.blocked {
            return;
        }
        match event {
            PageLoadEvent::Started => {
                self.committed = false;
                // A cancelled load is not guaranteed a Finished event. Track
                // the latest trusted URL rather than counting load pairs.
                self.started = Some(url.as_str().to_owned());
            }
            PageLoadEvent::Finished => {
                if self.started.as_deref() == Some(url.as_str()) {
                    self.committed = true;
                }
                // An unmatched/late Finished never creates trust on its own.
                // An old Finished for this exact same bundle URL is ambiguous
                // without a load id, but cannot change the trusted source.
            }
        }
    }

    fn allows(&self, kind: PermissionKind) -> bool {
        self.committed
            && !self.blocked
            && matches!(kind, PermissionKind::Camera | PermissionKind::Microphone)
    }
}

#[derive(Default)]
struct MediaPageResource {
    policy: Mutex<PageTrust>,
    uncertain: AtomicBool,
}
impl MediaPageResource {
    fn update<T>(&self, apply: impl FnOnce(&mut PageTrust) -> T) -> Option<T> {
        if self.uncertain.load(Ordering::Acquire) {
            return None;
        }
        match self.policy.try_lock() {
            Ok(mut policy) => Some(apply(&mut policy)),
            Err(_) => {
                // A skipped revocation must never leave an old Allow behind.
                self.uncertain.store(true, Ordering::Release);
                None
            }
        }
    }

    fn allows(&self, kind: PermissionKind) -> bool {
        self.policy
            .try_lock()
            .map(|policy| policy.allows(kind) && !self.uncertain.load(Ordering::Acquire))
            .unwrap_or(false)
    }

    fn destroy(&self) {
        self.uncertain.store(true, Ordering::Release);
    }
}
impl Resource for MediaPageResource {
    fn close(self: Arc<Self>) {
        self.destroy();
    }
}

fn table_resource(
    table: &mut tauri::ResourceTable,
    create: bool,
) -> Option<Arc<MediaPageResource>> {
    let existing = table
        .names()
        .find_map(|(id, _)| table.get::<MediaPageResource>(id).ok());
    existing.or_else(|| {
        create.then(|| {
            let value = Arc::new(MediaPageResource::default());
            table.add_arc(value.clone());
            value
        })
    })
}

fn resource<R: Runtime>(webview: &Webview<R>, create: bool) -> Option<Arc<MediaPageResource>> {
    // The table is per actual Webview and shared only by clones of that
    // instance. Tauri's Webview Eq/Hash compare labels, so do not use those.
    table_resource(&mut webview.resources_table(), create)
}

pub fn lifecycle<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("media-page-policy")
        .on_webview_ready(|webview| {
            if let Some(state) = resource(&webview, true) {
                // Capture this instance's resource, not a label lookup. Old
                // destruction callbacks cannot revoke a replacement window.
                webview.window().on_window_event(move |event| {
                    if matches!(event, tauri::WindowEvent::Destroyed) {
                        state.destroy();
                    }
                });
            }
        })
        .on_navigation(|webview, url| {
            resource(webview, true)
                .and_then(|state| {
                    state.update(|policy| policy.navigation(url, EntryBoundary::current()))
                })
                .unwrap_or(false)
        })
        .on_page_load(|webview, payload| {
            if let Some(state) = resource(webview, true) {
                state.update(|policy| {
                    policy.page_load(payload.url(), payload.event(), EntryBoundary::current())
                });
            }
        })
        .build()
}

pub fn response<R: Runtime>(webview: Webview<R>, kind: PermissionKind) -> PermissionResponse {
    // No URL/dispatcher query, UI round trip, background task or OS permission
    // override. Wry retains responsibility for the actual runtime prompt.
    let allowed = resource(&webview, false)
        .map(|state| state.allows(kind))
        .unwrap_or(false);
    if allowed {
        PermissionResponse::Allow
    } else {
        PermissionResponse::Deny
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn android(development: bool) -> EntryBoundary {
        EntryBoundary {
            bundle: BundleOrigin::HttpWorkaround,
            development,
        }
    }
    fn url(value: &str) -> Url {
        Url::parse(value).unwrap()
    }
    fn load(policy: &mut PageTrust, value: &str) {
        policy.page_load(&url(value), PageLoadEvent::Started, android(false));
        policy.page_load(&url(value), PageLoadEvent::Finished, android(false));
    }
    #[test]
    fn exact_product_and_development_origins() {
        for value in [
            "http://tauri.localhost/",
            "http://tauri.localhost/index.html?note=abc#x",
        ] {
            assert!(android(false).allows(&url(value)), "{value}");
        }
        for value in [
            "https://tauri.localhost/",
            "http://tauri.localhost:1420/",
            "http://tauri.localhost.evil/",
            "http://localhost/",
            "http://localhost:1420/",
            "http://127.0.0.1:1420/",
            "http://user@tauri.localhost/",
            "http://tauri.localhost/other.html",
            "tauri://localhost/",
            "file:///index.html",
            "data:text/html,x",
            "about:blank",
            "blob:http://tauri.localhost/x",
        ] {
            assert!(!android(false).allows(&url(value)), "{value}");
        }
        assert!(android(true).allows(&url("http://localhost:1420/index.html")));
        assert!(!android(true).allows(&url("http://localhost:1421/")));
        let mac = EntryBoundary {
            bundle: BundleOrigin::CustomProtocol,
            development: false,
        };
        assert!(mac.allows(&url("tauri://localhost/index.html")));
        assert!(!mac.allows(&url("http://tauri.localhost/")));
        assert!(!mac.allows(&url("tauri://localhost:80/")));
    }
    #[test]
    #[cfg(target_os = "macos")]
    fn compiled_macos_boundary_accepts_the_locked_tauri_root_url() {
        // Tauri 2.12.5 protocol::origin produces this exact base URL. Its
        // manager keeps the base unchanged for WebviewUrl::App(index.html).
        let root = url("tauri://localhost");
        assert_eq!(root.path(), "");
        assert!(EntryBoundary::current().allows(&root));
    }
    #[test]
    fn custom_protocol_root_spellings_keep_the_exact_authority_boundary() {
        let mac = EntryBoundary {
            bundle: BundleOrigin::CustomProtocol,
            development: false,
        };
        for value in [
            "tauri://localhost",
            "tauri://localhost?note=synthetic#x",
            "tauri://localhost/",
            "tauri://localhost/index.html",
        ] {
            assert!(mac.allows(&url(value)), "{value}");
        }
        for value in [
            "tauri://localhost:80",
            "tauri://localhost:1420/",
            "tauri://user@localhost",
            "tauri://user:password@localhost/",
            "tauri://localhost.evil",
            "tauri://127.0.0.1",
            "tauri://LOCALHOST",
            "tauri://localhost//",
            "tauri://localhost/other.html",
            "tauri://localhost/%69ndex.html",
            "https://localhost/",
            "http://tauri.localhost/",
            "file:///index.html",
            "data:text/html,x",
            "about:blank",
            "blob:tauri://localhost/x",
        ] {
            assert!(!mac.allows(&url(value)), "{value}");
        }
        // The fix must not grant the custom scheme to the HTTP runtime.
        assert!(!android(false).allows(&url("tauri://localhost")));
        assert!(!android(true).allows(&url("tauri://localhost")));
    }
    #[test]
    fn custom_protocol_navigation_still_requires_confirmed_instance_load() {
        let mac = EntryBoundary {
            bundle: BundleOrigin::CustomProtocol,
            development: false,
        };
        let root = url("tauri://localhost");
        let mut policy = PageTrust::default();
        assert!(policy.navigation(&root, mac));
        assert!(!policy.allows(PermissionKind::Microphone));
        policy.page_load(&root, PageLoadEvent::Finished, mac);
        assert!(!policy.allows(PermissionKind::Microphone));
        policy.page_load(&root, PageLoadEvent::Started, mac);
        assert!(!policy.allows(PermissionKind::Microphone));
        policy.page_load(&root, PageLoadEvent::Finished, mac);
        assert!(policy.allows(PermissionKind::Microphone));
        assert!(policy.allows(PermissionKind::Camera));
        assert!(!policy.allows(PermissionKind::Geolocation));
        assert!(policy.navigation(&root, mac));
        assert!(!policy.allows(PermissionKind::Microphone));
        policy.page_load(&root, PageLoadEvent::Started, mac);
        policy.page_load(&root, PageLoadEvent::Finished, mac);
        assert!(policy.allows(PermissionKind::Microphone));
        assert!(!policy.navigation(&url("tauri://localhost/other.html"), mac));
        policy.page_load(&root, PageLoadEvent::Started, mac);
        policy.page_load(&root, PageLoadEvent::Finished, mac);
        assert!(!policy.allows(PermissionKind::Microphone));
    }
    #[test]
    fn unconfirmed_and_unknown_kinds_are_denied() {
        let mut policy = PageTrust::default();
        assert!(!policy.allows(PermissionKind::Microphone));
        policy.page_load(
            &url("http://tauri.localhost/"),
            PageLoadEvent::Finished,
            android(false),
        );
        assert!(!policy.allows(PermissionKind::Microphone));
        load(&mut policy, "http://tauri.localhost/");
        assert!(policy.allows(PermissionKind::Microphone));
        assert!(policy.allows(PermissionKind::Camera));
        assert!(!policy.allows(PermissionKind::Geolocation));
    }
    #[test]
    fn trusted_reload_revokes_until_started_and_finished() {
        let mut policy = PageTrust::default();
        load(&mut policy, "http://tauri.localhost/");
        assert!(policy.navigation(&url("http://tauri.localhost/"), android(false)));
        policy.page_load(
            &url("http://tauri.localhost/"),
            PageLoadEvent::Finished,
            android(false),
        );
        assert!(!policy.allows(PermissionKind::Microphone));
        load(&mut policy, "http://tauri.localhost/");
        assert!(policy.allows(PermissionKind::Microphone));
    }
    #[test]
    fn cancelled_local_load_does_not_require_a_missing_finish() {
        for late_old_finish in [false, true] {
            let mut policy = PageTrust::default();
            let a = url("http://tauri.localhost/");
            let b = url("http://tauri.localhost/index.html?note=b");
            policy.page_load(&a, PageLoadEvent::Started, android(false));
            policy.page_load(&b, PageLoadEvent::Started, android(false));
            if late_old_finish {
                policy.page_load(&a, PageLoadEvent::Finished, android(false));
            }
            assert!(!policy.allows(PermissionKind::Microphone));
            policy.page_load(&b, PageLoadEvent::Finished, android(false));
            assert!(policy.allows(PermissionKind::Microphone));
        }
    }
    #[test]
    fn untrusted_navigation_or_load_cannot_be_reopened_by_old_finish() {
        for event in [
            None,
            Some(PageLoadEvent::Started),
            Some(PageLoadEvent::Finished),
        ] {
            let mut policy = PageTrust::default();
            load(&mut policy, "http://tauri.localhost/");
            if let Some(event) = event {
                policy.page_load(&url("https://example.invalid/"), event, android(false));
            } else {
                assert!(!policy.navigation(&url("https://example.invalid/"), android(false)));
            }
            load(&mut policy, "http://tauri.localhost/");
            assert!(!policy.allows(PermissionKind::Microphone));
        }
    }
    #[test]
    fn replacement_instance_and_destroyed_resource_do_not_inherit_trust() {
        let mut old_table = tauri::ResourceTable::default();
        assert!(table_resource(&mut old_table, false).is_none());
        let old = table_resource(&mut old_table, true).unwrap();
        old.update(|policy| load(policy, "http://tauri.localhost/"));
        assert!(old.allows(PermissionKind::Microphone));
        assert!(Arc::ptr_eq(
            &old,
            &table_resource(&mut old_table, true).unwrap()
        ));
        let mut new_table = tauri::ResourceTable::default();
        let new = table_resource(&mut new_table, true).unwrap();
        assert!(!new.allows(PermissionKind::Microphone));
        old.destroy();
        assert!(!old.allows(PermissionKind::Microphone));
        new.update(|policy| load(policy, "http://tauri.localhost/"));
        assert!(new.allows(PermissionKind::Microphone));
        // A delayed old-window close touches only its captured resource.
        old.clone().close();
        assert!(new.allows(PermissionKind::Microphone));
    }
    #[test]
    fn contention_cannot_skip_a_revocation() {
        let state = MediaPageResource::default();
        state.update(|policy| load(policy, "http://tauri.localhost/"));
        let held = state.policy.lock().unwrap();
        assert!(!state.allows(PermissionKind::Microphone));
        assert!(state.update(|policy| policy.revoke()).is_none());
        drop(held);
        assert!(!state.allows(PermissionKind::Microphone));
        state.update(|policy| load(policy, "http://tauri.localhost/"));
        assert!(!state.allows(PermissionKind::Microphone));
    }
    #[test]
    fn same_local_url_reload_remains_a_source_boundary() {
        let mut policy = PageTrust::default();
        let local = url("http://tauri.localhost/");
        policy.page_load(&local, PageLoadEvent::Started, android(false));
        policy.page_load(&local, PageLoadEvent::Started, android(false));
        policy.page_load(&local, PageLoadEvent::Finished, android(false));
        assert!(policy.allows(PermissionKind::Microphone));
        // No public load id distinguishes an older Finished at the same URL.
        // It remains the same trusted bundled code; never call this a check
        // that the newest reload or pixels have completed.
    }
    #[test]
    fn actual_config_blocks_frames_objects_and_form_navigation() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let csp = config["app"]["security"]["csp"].as_str().unwrap();
        let directives: Vec<_> = csp.split(';').map(str::trim).collect();
        for required in [
            "frame-src 'none'",
            "child-src 'none'",
            "object-src 'none'",
            "form-action 'none'",
        ] {
            assert!(directives.contains(&required), "{required}");
        }
        assert_eq!(config["build"]["devUrl"], "http://localhost:1420");
        assert!(config["app"]["security"]["devCsp"].is_null());
        // This verifies production configuration, not WebView enforcement.
    }
}
