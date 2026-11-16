//! Select storage before creating any WKWebView. Never fall back to the default
//! store for a custom library on systems without named persistent datastores.
use crate::{startup, store};
use sha2::{Digest, Sha256};
use std::{io, path::Path};
use tauri::State;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct Profile {
    pub(crate) identifier: Option<[u8; 16]>,
    initial_windows: Vec<String>,
}

impl Profile {
    pub(crate) fn configure(
        options: &mut startup::Options,
        config: &mut tauri::Config,
    ) -> io::Result<Self> {
        #[cfg(target_os = "macos")]
        if let Some(root) = &options.data_dir {
            // Wry otherwise silently uses defaultDataStore on macOS < 14.
            require_named_store(mac_os_major()?)?;
            use std::os::unix::fs::DirBuilderExt;
            std::fs::DirBuilder::new()
                .recursive(true)
                .mode(0o700)
                .create(root)?;
            let root = root.canonicalize()?;
            let identifier = identifier(&root);
            options.data_dir = Some(root);
            let mut initial_windows = Vec::new();
            for window in &mut config.app.windows {
                window.incognito = false;
                window.data_store_identifier = Some(identifier);
                // tauri-runtime 2.12.2 From<WindowConfig> omits this field.
                // Suppress automatic creation and explicitly apply the official
                // builder API below, before a WKWebView can access storage.
                if window.create {
                    initial_windows.push(window.label.clone());
                    window.create = false;
                }
            }
            return Ok(Self {
                identifier: Some(identifier),
                initial_windows,
            });
        }
        let _ = (options, config);
        Ok(Self::default())
    }

    pub(crate) fn create_initial_windows(&self, app: &tauri::AppHandle) -> tauri::Result<()> {
        #[cfg(target_os = "macos")]
        if let Some(identifier) = self.identifier {
            for label in &self.initial_windows {
                let config = app
                    .config()
                    .app
                    .windows
                    .iter()
                    .find(|window| &window.label == label)
                    .ok_or_else(|| {
                        tauri::Error::Io(io::Error::other(
                            "isolated initial window configuration missing",
                        ))
                    })?;
                tauri::WebviewWindowBuilder::from_config(app, config)?
                    .data_store_identifier(identifier)
                    .build()?;
            }
        }
        let _ = app;
        Ok(())
    }

    fn window<'a>(
        &self,
        app: &'a tauri::AppHandle,
        label: String,
        url: tauri::WebviewUrl,
    ) -> tauri::WebviewWindowBuilder<'a, tauri::Wry, tauri::AppHandle> {
        let builder = tauri::WebviewWindowBuilder::new(app, label, url);
        #[cfg(target_os = "macos")]
        if let Some(identifier) = self.identifier {
            return builder.data_store_identifier(identifier);
        }
        builder
    }
}

fn identifier(canonical_root: &Path) -> [u8; 16] {
    let mut hash = Sha256::new();
    hash.update(b"cybernote.workspace.wk-datastore.v1\0");
    hash.update(canonical_root.as_os_str().as_encoded_bytes());
    let mut id: [u8; 16] = hash.finalize()[..16].try_into().expect("SHA256 prefix");
    id[6] = (id[6] & 0x0f) | 0x50;
    id[8] = (id[8] & 0x3f) | 0x80;
    id
}

fn require_named_store(darwin_major: u32) -> io::Result<()> {
    if darwin_major < 23 {
        return Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "--data-dir WebView isolation requires macOS 14 or newer",
        ));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn mac_os_major() -> io::Result<u32> {
    let mut name = [0u8; 256];
    let mut length = name.len();
    // Read only kernel version; no preferences, profile or process environment.
    let rc = unsafe {
        libc::sysctlbyname(
            c"kern.osrelease".as_ptr(),
            name.as_mut_ptr().cast(),
            &mut length,
            std::ptr::null_mut(),
            0,
        )
    };
    if rc != 0 {
        return Err(io::Error::last_os_error());
    }
    std::str::from_utf8(&name[..length.min(name.len())])
        .ok()
        .and_then(|s| s.split('.').next()?.parse().ok())
        .ok_or_else(|| io::Error::other("cannot verify named WebView datastore availability"))
}

/// Explicit debug driver only. Inspect this candidate's already-selected store;
/// never enumerate stores or obtain defaultDataStore or standardUserDefaults.
#[cfg(all(target_os = "macos", feature = "sync-e2e", debug_assertions))]
pub(crate) fn diagnostic(app: &tauri::AppHandle) -> io::Result<serde_json::Value> {
    use std::{
        ffi::{c_char, c_void, CStr},
        sync::mpsc,
        time::Duration,
    };
    use tauri::Manager;
    #[link(name = "objc")]
    extern "C" {
        fn sel_registerName(name: *const c_char) -> *const c_void;
        fn objc_msgSend();
    }
    unsafe fn object(receiver: *mut c_void, name: &CStr) -> *mut c_void {
        let call: unsafe extern "C" fn(*mut c_void, *const c_void) -> *mut c_void =
            std::mem::transmute(objc_msgSend as unsafe extern "C" fn());
        call(receiver, sel_registerName(name.as_ptr()))
    }
    let expected = app
        .state::<Profile>()
        .identifier
        .ok_or_else(|| io::Error::other("not an isolated profile"))?;
    let mut stores = Vec::new();
    for (label, window) in app.webview_windows() {
        let (send, recv) = mpsc::sync_channel(1);
        window
            .with_webview(move |view| {
                // WKWebView -> WKWebViewConfiguration -> this view's WKWebsiteDataStore.
                let observed = unsafe {
                    let config = object(view.inner(), c"configuration");
                    let store = object(config, c"websiteDataStore");
                    let identifier = object(store, c"identifier");
                    let string = object(identifier, c"UUIDString");
                    let bytes = object(string, c"UTF8String");
                    if bytes.is_null() {
                        None
                    } else {
                        Some(CStr::from_ptr(bytes.cast()).to_string_lossy().into_owned())
                    }
                };
                let _ = send.send(observed);
            })
            .map_err(|_| io::Error::other("native store inspection dispatch failed"))?;
        let observed = recv
            .recv_timeout(Duration::from_secs(2))
            .map_err(|_| io::Error::other("native store inspection timed out"))?
            .ok_or_else(|| io::Error::other("native WebView has no named datastore"))?;
        if uuid::Uuid::parse_str(&observed)
            .ok()
            .map(|id| *id.as_bytes())
            != Some(expected)
        {
            return Err(io::Error::other("native WebView datastore mismatch"));
        }
        stores.push(serde_json::json!({"label":label,"observedIdentifier":observed}));
    }
    Ok(
        serde_json::json!({"bundleIdentifier":app.config().identifier,"configuredIdentifier":uuid::Uuid::from_bytes(expected).to_string(),"stores":stores}),
    )
}

/// The sole production dynamic document-window constructor. The renderer cannot
/// choose a different datastore (core create-webview-window is not granted).
#[tauri::command]
pub(crate) async fn open_note_window(
    note_id: String,
    title: String,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    profile: State<'_, Profile>,
) -> store::Result<String> {
    if !(window.label() == "main" || window.label().starts_with("note-"))
        || uuid::Uuid::parse_str(&note_id).is_err()
    {
        return Err(store::AppError {
            code: "invalid".into(),
            message: "文档窗口参数无效".into(),
            commit: None,
        });
    }
    let label = format!("note-{}", uuid::Uuid::new_v4());
    let builder = profile
        .window(
            &app,
            label.clone(),
            tauri::WebviewUrl::App(format!("index.html?note={note_id}").into()),
        )
        .title(title)
        .inner_size(640.0, 600.0);
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);
    builder.build().map_err(|_| store::AppError {
        code: "unavailable".into(),
        message: "无法创建文档窗口".into(),
        commit: None,
    })?;
    Ok(label)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn named_store_is_stable_distinct_and_requires_supported_macos() {
        assert_eq!(identifier(Path::new("/a")), identifier(Path::new("/a")));
        assert_ne!(identifier(Path::new("/a")), identifier(Path::new("/b")));
        assert!(require_named_store(22).is_err());
        require_named_store(23).unwrap();
    }
    #[test]
    fn default_configuration_is_unchanged() {
        let mut config = tauri::Config::default();
        let before = serde_json::to_value(&config).unwrap();
        assert_eq!(
            Profile::configure(&mut startup::Options::default(), &mut config).unwrap(),
            Profile::default()
        );
        assert_eq!(serde_json::to_value(config).unwrap(), before);
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn all_configured_windows_and_canonical_aliases_share_selected_store() {
        let root = tempfile::tempdir().unwrap();
        let alias = root.path().join("alias");
        let data = root.path().join("data");
        std::fs::create_dir(&data).unwrap();
        std::os::unix::fs::symlink(&data, &alias).unwrap();
        let configure = |path| {
            let mut options = startup::Options {
                data_dir: Some(path),
                ..Default::default()
            };
            let mut config = tauri::Config::default();
            config.app.windows = vec![Default::default(), Default::default()];
            let profile = Profile::configure(&mut options, &mut config).unwrap();
            for window in config.app.windows {
                assert_eq!(window.data_store_identifier, profile.identifier);
                assert!(!window.incognito);
            }
            profile
        };
        assert_eq!(configure(data), configure(alias));
        assert_ne!(
            configure(root.path().join("b")),
            configure(root.path().join("c"))
        );
    }
}
