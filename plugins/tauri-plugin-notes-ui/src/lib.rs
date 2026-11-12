mod model;
pub use model::*;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
mod recording_diagnostics;

use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Manager, Runtime, State, Window,
};

pub const EVENT_NAME: &str = "notes-ui://intent";
/// Host-only file/clipboard integration. The caller holds owner authorization
/// and schedules this on AppKit's main thread; no renderer paths are accepted.
#[cfg(target_os = "macos")]
pub fn attachment_desktop(value: &serde_json::Value) -> Result<serde_json::Value> {
    use std::ffi::{c_char, CStr, CString};
    extern "C" {
        fn notes_ui_attachment_desktop(input: *const c_char) -> *mut c_char;
        fn notes_ui_free(value: *mut c_char);
    }
    let input = CString::new(value.to_string()).map_err(|_| Error::new("attachment", "无效附件参数"))?;
    unsafe {
        let raw = notes_ui_attachment_desktop(input.as_ptr());
        if raw.is_null() { return Err(Error::new("attachment", "附件系统操作失败")); }
        let output = serde_json::from_slice::<serde_json::Value>(CStr::from_ptr(raw).to_bytes());
        notes_ui_free(raw);
        let output = output.map_err(|_| Error::new("attachment", "无效系统附件响应"))?;
        if let Some(message) = output["error"].as_str() { return Err(Error::new("attachment", message)); }
        if output["ok"] == false { return Err(Error::new("attachment", "系统未接受附件操作")); }
        Ok(output)
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyboardNavigation {
    pub enabled: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingAccess {
    pub status: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Error {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stage: Option<String>,
    #[serde(rename = "requestId", skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
}
impl Error {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            stage: None,
            request_id: None,
        }
    }
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for Error {}
pub type Result<T> = std::result::Result<T, Error>;

#[derive(Clone)]
struct Binding {
    id: String,
    state: ToolbarState,
}
impl Binding {
    fn permits_search_focus(&self) -> Result<()> {
        let search = self
            .state
            .search
            .as_ref()
            .ok_or_else(|| Error::new("search_missing", "当前窗口没有搜索控件"))?;
        if !search.enabled {
            return Err(Error::new("search_disabled", "当前窗口搜索已禁用"));
        }
        Ok(())
    }
    fn permits_event(&self, label: &str, event: &ToolbarEvent) -> bool {
        event.window_label == label
            && event.binding_id == self.id
            && event.state_revision == self.state.revision
            && self.state.permits(&event.intent)
    }
}
type Bindings = Arc<Mutex<HashMap<String, Binding>>>;
pub struct NotesUi<R: Runtime> {
    app: AppHandle<R>,
    bindings: Bindings,
}
impl<R: Runtime> NotesUi<R> {
    /// Called only by an explicit recording start; independent of toolbar bindings.
    pub async fn recording_access(&self, window: Window<R>) -> Result<RecordingAccess> {
        recording_window_label(window.label())?;
        #[cfg(target_os = "macos")]
        {
            macos::recording_access(&self.app, window).await
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = window;
            Err(unsupported())
        }
    }
    /// Current main-window system policy. This never requires a toolbar binding.
    pub async fn keyboard_navigation(&self, window: Window<R>) -> Result<KeyboardNavigation> {
        if window.label() != "main" {
            return Err(Error::new("window_mismatch", "此操作仅支持主窗口"));
        }
        #[cfg(target_os = "macos")]
        {
            macos::keyboard_navigation(&self.app, window).await
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = window;
            Err(unsupported())
        }
    }
    pub async fn bind(&self, window: Window<R>, state: ToolbarState) -> Result<BindingInfo> {
        state.validate()?;
        #[cfg(target_os = "macos")]
        {
            macos::bind(&self.app, self.bindings.clone(), window, state).await
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = (window, state);
            Err(unsupported())
        }
    }
    pub async fn update(
        &self,
        window: Window<R>,
        binding_id: String,
        state: ToolbarState,
    ) -> Result<BindingInfo> {
        state.validate()?;
        valid_binding_id(&binding_id)?;
        #[cfg(target_os = "macos")]
        {
            macos::update(&self.app, self.bindings.clone(), window, binding_id, state).await
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = (window, binding_id, state);
            Err(unsupported())
        }
    }
    pub async fn inspect(&self, window: Window<R>, binding_id: String) -> Result<BindingInfo> {
        valid_binding_id(&binding_id)?;
        #[cfg(target_os = "macos")]
        {
            macos::inspect(&self.app, self.bindings.clone(), window, binding_id).await
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = (window, binding_id);
            Err(unsupported())
        }
    }
    pub async fn unbind(&self, window: Window<R>, binding_id: String) -> Result<()> {
        valid_binding_id(&binding_id)?;
        #[cfg(target_os = "macos")]
        {
            macos::unbind(&self.app, self.bindings.clone(), window, binding_id).await
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = (window, binding_id);
            Err(unsupported())
        }
    }
    /// Request this binding's native search first responder without rewriting its query or state.
    pub async fn focus_search(&self, window: Window<R>, binding_id: String) -> Result<BindingInfo> {
        valid_binding_id(&binding_id)?;
        #[cfg(target_os = "macos")]
        {
            macos::focus_search(&self.app, self.bindings.clone(), window, binding_id).await
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = (window, binding_id);
            Err(unsupported())
        }
    }
}
fn valid_binding_id(id: &str) -> Result<()> {
    if id.len() != 36 || uuid::Uuid::parse_str(id).is_err() {
        return Err(Error::new("invalid_binding", "绑定编号无效"));
    }
    Ok(())
}
#[cfg(not(target_os = "macos"))]
fn unsupported() -> Error {
    Error::new("unsupported", "此原生顶部模块仅支持 macOS")
}
pub trait NotesUiExt<R: Runtime> {
    fn notes_ui(&self) -> State<'_, NotesUi<R>>;
}
impl<R: Runtime, T: Manager<R>> NotesUiExt<R> for T {
    fn notes_ui(&self) -> State<'_, NotesUi<R>> {
        self.state()
    }
}

fn own_window<R: Runtime>(window: &Window<R>, window_label: &str) -> Result<()> {
    if window.label() != window_label {
        return Err(Error::new("window_mismatch", "前端只能绑定所属窗口"));
    }
    Ok(())
}
fn recording_window_label(label: &str) -> Result<()> {
    let recording = label.strip_prefix("recording-").is_some_and(|suffix| {
        suffix.len() == 36
            && uuid::Uuid::parse_str(suffix).is_ok_and(|id| id.hyphenated().to_string() == suffix)
    });
    if label == "main" || (label.starts_with("note-") && label.len() > 5) || recording {
        Ok(())
    } else {
        Err(Error::new("window_mismatch", "录音仅支持所属笔记窗口"))
    }
}
#[tauri::command]
async fn recording_access<R: Runtime>(
    window: Window<R>,
    state: State<'_, NotesUi<R>>,
    window_label: String,
) -> Result<RecordingAccess> {
    own_window(&window, &window_label)?;
    state.recording_access(window).await
}
#[tauri::command]
async fn bind<R: Runtime>(
    window: Window<R>,
    state: State<'_, NotesUi<R>>,
    window_label: String,
    toolbar: ToolbarState,
) -> Result<BindingInfo> {
    own_window(&window, &window_label)?;
    state.bind(window, toolbar).await
}
#[tauri::command]
async fn update<R: Runtime>(
    window: Window<R>,
    state: State<'_, NotesUi<R>>,
    window_label: String,
    binding_id: String,
    toolbar: ToolbarState,
) -> Result<BindingInfo> {
    own_window(&window, &window_label)?;
    state.update(window, binding_id, toolbar).await
}
#[tauri::command]
async fn inspect<R: Runtime>(
    window: Window<R>,
    state: State<'_, NotesUi<R>>,
    window_label: String,
    binding_id: String,
) -> Result<BindingInfo> {
    own_window(&window, &window_label)?;
    state.inspect(window, binding_id).await
}
#[tauri::command]
async fn unbind<R: Runtime>(
    window: Window<R>,
    state: State<'_, NotesUi<R>>,
    window_label: String,
    binding_id: String,
) -> Result<()> {
    own_window(&window, &window_label)?;
    state.unbind(window, binding_id).await
}
#[tauri::command]
async fn focus_search<R: Runtime>(
    window: Window<R>,
    state: State<'_, NotesUi<R>>,
    window_label: String,
    binding_id: String,
) -> Result<BindingInfo> {
    own_window(&window, &window_label)?;
    state.focus_search(window, binding_id).await
}
#[tauri::command]
async fn keyboard_navigation<R: Runtime>(
    window: Window<R>,
    state: State<'_, NotesUi<R>>,
    window_label: String,
) -> Result<KeyboardNavigation> {
    own_window(&window, &window_label)?;
    state.keyboard_navigation(window).await
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PopupMenuRequest {
    token: String,
    x: f64,
    y: f64,
    viewport_width: f64,
    items: Vec<PopupMenuItem>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PopupMenuItem {
    kind: String,
    label: String,
    index: u32,
    enabled: bool,
    selected: bool,
    symbol: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    items: Vec<PopupMenuItem>,
}
impl PopupMenuRequest {
    fn validate(&self) -> Result<()> {
        valid_binding_id(&self.token)?;
        if !self.x.is_finite() || !self.y.is_finite() || !self.viewport_width.is_finite()
            || !(1.0..=32768.0).contains(&self.viewport_width) || self.x.abs() > 32768.0 || self.y.abs() > 32768.0
            || self.items.is_empty() || self.items.len() > 100 {
            return Err(Error::new("menu", "无效菜单尺寸或数量"));
        }
        fn entries(items: &[PopupMenuItem], depth: usize, count: &mut usize, indices: &mut std::collections::HashSet<u32>) -> Result<()> {
          if depth > 2 || items.is_empty() { return Err(Error::new("menu", "无效子菜单")); }
          for item in items {
            *count += 1;
            if *count > 512 || !indices.insert(item.index) || !["item", "separator", "submenu"].contains(&item.kind.as_str()) || item.label.chars().count() > 256
                || item.label.contains('\0') || item.symbol.len() > 80 || !item.symbol.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.') {
                return Err(Error::new("menu", "无效菜单条目"));
            }
            if item.kind == "submenu" { entries(&item.items, depth + 1, count, indices)?; }
            else if !item.items.is_empty() { return Err(Error::new("menu", "非子菜单包含子项")); }
          }
          Ok(())
        }
        entries(&self.items, 0, &mut 0, &mut std::collections::HashSet::new())
    }
}
#[tauri::command]
async fn popup_menu<R: Runtime>(window: Window<R>, window_label: String, request: PopupMenuRequest) -> Result<Option<u32>> {
    own_window(&window, &window_label)?;
    request.validate()?;
    #[cfg(target_os = "macos")]
    { let app = window.app_handle().clone(); macos::popup_menu(&app, window, request).await }
    #[cfg(not(target_os = "macos"))]
    { Err(unsupported()) }
}
#[tauri::command]
async fn cancel_popup_menu<R: Runtime>(window: Window<R>, window_label: String, token: String) -> Result<()> {
    own_window(&window, &window_label)?;
    valid_binding_id(&token)?;
    #[cfg(target_os = "macos")]
    { let app = window.app_handle().clone(); macos::cancel_popup_menu(&app, window, token).await }
    #[cfg(not(target_os = "macos"))]
    { Err(unsupported()) }
}
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("notes-ui")
        .invoke_handler(tauri::generate_handler![
            bind,
            update,
            unbind,
            inspect,
            focus_search,
            keyboard_navigation,
            recording_access,
            popup_menu,
            cancel_popup_menu
        ])
        .setup(|app, _| {
            #[cfg(target_os = "macos")]
            macos::install_termination(app)?;
            app.manage(NotesUi {
                app: app.clone(),
                bindings: Arc::new(Mutex::new(HashMap::new())),
            });
            Ok(())
        })
        .on_webview_ready(|webview| {
            #[cfg(target_os = "macos")]
            macos::install_keyboard_policy(webview);
            #[cfg(not(target_os = "macos"))]
            let _ = webview;
        })
        .on_event(|app, event| {
            #[cfg(target_os = "macos")]
            match event {
                tauri::RunEvent::Exit => macos::drop_termination(),
                event if macos::is_search_menu_event(event) => {
                    if let Err(error) = macos::focus_search_from_menu(app) {
                        eprintln!("notes-ui: menu search focus failed: {error}");
                    }
                }
                tauri::RunEvent::WindowEvent {
                    label,
                    event: tauri::WindowEvent::Focused(true),
                    ..
                } => macos::refresh_sidebar_menu(app, label),
                tauri::RunEvent::WindowEvent {
                    label,
                    event: tauri::WindowEvent::Destroyed,
                    ..
                } => {
                    macos::destroy_keyboard_policy(app, Some(label));
                    macos::destroy_label(app, label);
                }
                _ => {}
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        })
        .on_drop(|app| {
            #[cfg(target_os = "macos")]
            {
                if let Err(error) = app.run_on_main_thread(macos::drop_termination) {
                    eprintln!("notes-ui: native quit teardown dispatch failed: {error}");
                }
                macos::destroy_keyboard_policy(&app, None);
                macos::destroy_all(&app);
            }
            #[cfg(not(target_os = "macos"))]
            let _ = app;
        })
        .build()
}
#[cfg(test)]
mod tests;

#[cfg(test)]
mod keyboard_query_tests {
    use super::*;

    #[test]
    fn recording_command_rejects_cross_window_and_untrusted_labels() {
        let app = tauri::test::mock_app();
        app.manage(NotesUi {
            app: app.handle().clone(),
            bindings: Arc::new(Mutex::new(HashMap::new())),
        });
        let view = tauri::WebviewWindowBuilder::new(
            &app,
            "untrusted",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .build()
        .unwrap();
        let window = view.as_ref().window();
        for label in ["main", "untrusted"] {
            let error = tauri::async_runtime::block_on(recording_access(
                window.clone(),
                app.state(),
                label.into(),
            ))
            .unwrap_err();
            assert_eq!(error.code, "window_mismatch");
        }
        assert!(recording_window_label("main").is_ok());
        assert!(recording_window_label("note-test").is_ok());
        assert!(recording_window_label("note-").is_err());
        assert!(recording_window_label("recording-729dcb97-61e1-44ed-bb4a-476cfd078587").is_ok());
        for label in [
            "recording-",
            "recording-test",
            "recording-729DCB97-61E1-44ED-BB4A-476CFD078587",
            "recording-729dcb9761e144edbb4a476cfd078587",
            "recording-729dcb97-61e1-44ed-bb4a-476cfd078587-other",
        ] {
            assert!(recording_window_label(label).is_err(), "{label}");
        }
    }

    #[test]
    fn keyboard_query_rejects_foreign_label_and_independent_window_before_dispatch() {
        let app = tauri::test::mock_app();
        app.manage(NotesUi {
            app: app.handle().clone(),
            bindings: Arc::new(Mutex::new(HashMap::new())),
        });
        let independent = tauri::WebviewWindowBuilder::new(
            &app,
            "note-keyboard-test",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .build()
        .unwrap();
        let window = independent.as_ref().window();
        let foreign = tauri::async_runtime::block_on(keyboard_navigation(
            window.clone(),
            app.state(),
            "main".into(),
        ));
        assert_eq!(foreign.unwrap_err().code, "window_mismatch");
        let own_independent = tauri::async_runtime::block_on(keyboard_navigation(
            window.clone(),
            app.state(),
            window.label().into(),
        ));
        assert_eq!(own_independent.unwrap_err().code, "window_mismatch");
        assert!(app
            .state::<NotesUi<tauri::test::MockRuntime>>()
            .bindings
            .lock()
            .unwrap()
            .is_empty());
    }
}

#[cfg(test)]
mod recording_error_wire_tests {
    use super::*;
    #[test]
    fn ordinary_errors_keep_the_existing_wire_shape() {
        assert_eq!(
            serde_json::to_value(Error::new("microphone_busy", "same message")).unwrap(),
            serde_json::json!({"code": "microphone_busy", "message": "same message"})
        );
    }
    #[test]
    fn optional_diagnostic_metadata_uses_content_free_wire_fields() {
        let mut error = Error::new("microphone_timeout", "same message");
        error.stage = Some("native_result".into());
        error.request_id = Some("42".into());
        assert_eq!(
            serde_json::to_value(error).unwrap(),
            serde_json::json!({
                "code": "microphone_timeout", "message": "same message", "stage": "native_result", "requestId": "42"
            })
        );
    }
}

#[cfg(test)]
mod popup_menu_tests {
    use super::*;
    fn request() -> PopupMenuRequest {
        PopupMenuRequest { token: uuid::Uuid::new_v4().to_string(), x: 22.0, y: 105.0, viewport_width: 1280.0,
            items: vec![PopupMenuItem { kind: "item".into(), label: "拷贝".into(), index: 0, enabled: true, selected: false, symbol: "doc.on.doc".into(), items: vec![] }] }
    }
    #[test]
    fn validates_bounded_own_window_menu_payloads() {
        assert!(request().validate().is_ok());
        for value in [f64::NAN, f64::INFINITY, -f64::INFINITY, 32769.0] {
            let mut r=request();r.x=value;assert!(r.validate().is_err());
        }
        for width in [0.0, -1.0, f64::NAN, 32769.0] { let mut r=request();r.viewport_width=width;assert!(r.validate().is_err()); }
        let mut r=request();r.token="foreign-token".into();assert!(r.validate().is_err());
        let mut r=request();r.items.clear();assert!(r.validate().is_err());
        let mut r=request();r.items=vec![r.items[0].clone();101];assert!(r.validate().is_err());
    }
    #[test]
    fn menu_items_are_ui_only_bounded_text_and_symbols() {
        for label in ["x\0y".to_string(), "字".repeat(257)] { let mut r=request();r.items[0].label=label;assert!(r.validate().is_err()); }
        for symbol in ["../file", "symbol\0name", "http://example.invalid"] { let mut r=request();r.items[0].symbol=symbol.into();assert!(r.validate().is_err()); }
        let mut r=request();r.items[0].kind="execute".into();assert!(r.validate().is_err());
        assert!(serde_json::from_value::<PopupMenuRequest>(serde_json::json!({"token":uuid::Uuid::new_v4().to_string(),"x":0,"y":0,"viewportWidth":800,"items":[],"path":"/tmp/no"})).is_err());
    }
    #[test]
    fn submenu_indices_are_unique_and_nesting_is_bounded() {
        let mut r=request();
        let mut child=r.items[0].clone();child.index=1;
        r.items[0].kind="submenu".into();r.items[0].items=vec![child.clone()];
        assert!(r.validate().is_ok());
        r.items[0].items[0].index=0;
        assert!(r.validate().is_err());
        r.items[0].items.clear();
        assert!(r.validate().is_err());
        r.items[0].items=vec![child];
        for i in 2..5 { let mut parent=r.items[0].clone();parent.index=i;parent.items=std::mem::take(&mut r.items);r.items=vec![parent]; }
        assert!(r.validate().is_err());
    }
}
