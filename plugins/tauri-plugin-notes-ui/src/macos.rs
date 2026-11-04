use crate::*;
use std::{
    ffi::{c_char, c_void, CStr, CString},
    sync::mpsc,
};
use tauri::Emitter;

extern "C" {
    fn notes_ui_bind(
        window: *mut c_void,
        label: *const c_char,
        id: *const c_char,
        state: *const c_char,
        context: *mut c_void,
        event: extern "C" fn(*mut c_void, *const c_char),
        release: extern "C" fn(*mut c_void),
    ) -> *mut c_char;
    fn notes_ui_update(id: *const c_char, state: *const c_char) -> *mut c_char;
    fn notes_ui_inspect(id: *const c_char) -> *mut c_char;
    fn notes_ui_focus_search(id: *const c_char) -> *mut c_char;
    fn notes_ui_destroy(id: *const c_char);
    fn notes_ui_free(value: *mut c_char);
    fn notes_ui_keyboard_attach(
        webview: *mut c_void,
        window: *mut c_void,
        webview_label: *const c_char,
        window_label: *const c_char,
    ) -> i32;
    fn notes_ui_keyboard_destroy(window_label: *const c_char) -> i32;
    fn notes_ui_keyboard_navigation(window: *mut c_void, enabled: *mut i32) -> i32;
}

pub(super) async fn keyboard_navigation<R: Runtime>(
    app: &AppHandle<R>,
    window: Window<R>,
) -> Result<KeyboardNavigation> {
    let current_app = app.clone();
    on_main(app, move || {
        let current = current_app
            .get_webview_window(window.label())
            .ok_or_else(|| Error::new("window_closed", "所属窗口已关闭"))?;
        let native = window
            .ns_window()
            .map_err(|e| Error::new("window_closed", e.to_string()))?;
        let current_native = current
            .ns_window()
            .map_err(|e| Error::new("window_closed", e.to_string()))?;
        if current_native != native {
            return Err(Error::new("window_mismatch", "所属窗口已改变"));
        }
        let mut enabled = -1;
        keyboard_status(unsafe { notes_ui_keyboard_navigation(native, &mut enabled) })?;
        match enabled {
            0 | 1 => Ok(KeyboardNavigation {
                enabled: enabled == 1,
            }),
            _ => Err(Error::new("keyboard_native", "无法读取键盘导航设置")),
        }
    })
    .await
}

fn keyboard_status(status: i32) -> Result<()> {
    match status {
        0 => Ok(()),
        1 => Err(Error::new("thread", "键盘导航策略必须在主线程同步")),
        2 => Err(Error::new(
            "keyboard_target",
            "键盘导航策略没有有效的所属 WKWebView/NSWindow",
        )),
        3 => Err(Error::new(
            "keyboard_identity",
            "键盘导航策略的视图标识已用于其他目标",
        )),
        4 => Err(Error::new(
            "keyboard_monitor",
            "无法创建窗口内的键盘导航监听",
        )),
        _ => Err(Error::new("keyboard_native", "原生键盘导航策略同步失败")),
    }
}

pub(super) fn install_keyboard_policy<R: Runtime>(webview: tauri::Webview<R>) {
    let labels = cstr(webview.label()).and_then(|view_label| {
        cstr(webview.window().label()).map(|window_label| (view_label, window_label))
    });
    let (view_label, window_label) = match labels {
        Ok(labels) => labels,
        Err(error) => {
            eprintln!("notes-ui: keyboard policy identity failed: {error}");
            return;
        }
    };
    // Completion is the native result inside this callback, not successful enqueueing.
    if let Err(error) = webview.with_webview(move |native| {
        let result = keyboard_status(unsafe {
            notes_ui_keyboard_attach(
                native.inner(),
                native.ns_window(),
                view_label.as_ptr(),
                window_label.as_ptr(),
            )
        });
        match result {
            Ok(()) => eprintln!(
                "notes-ui: keyboard policy installation completed for {}",
                view_label.to_string_lossy()
            ),
            Err(error) => eprintln!("notes-ui: keyboard policy installation failed: {error}"),
        }
    }) {
        eprintln!("notes-ui: keyboard policy dispatch failed: {error}");
    }
}

pub(super) fn destroy_keyboard_policy<R: Runtime>(app: &AppHandle<R>, label: Option<&str>) {
    let label = match label.map(cstr).transpose() {
        Ok(label) => label,
        Err(error) => {
            eprintln!("notes-ui: keyboard policy cleanup identity failed: {error}");
            return;
        }
    };
    if let Err(error) = app.run_on_main_thread(move || {
        let result = keyboard_status(unsafe {
            notes_ui_keyboard_destroy(label.as_ref().map_or(std::ptr::null(), |s| s.as_ptr()))
        });
        if let Err(error) = result {
            eprintln!("notes-ui: keyboard policy cleanup failed: {error}");
        }
    }) {
        eprintln!("notes-ui: keyboard policy cleanup dispatch failed: {error}");
    }
}
struct Callback<R: Runtime> {
    window: Window<R>,
    bindings: Bindings,
    label: String,
    id: String,
}
extern "C" fn event<R: Runtime>(context: *mut c_void, json: *const c_char) {
    // No panic may unwind through AppKit's C ABI. No native pointer leaves its main-thread owner.
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| unsafe {
        if context.is_null() || json.is_null() {
            return;
        }
        let ctx = &*(context as *const Callback<R>);
        let Ok(ev) = serde_json::from_slice::<ToolbarEvent>(CStr::from_ptr(json).to_bytes()) else {
            return;
        };
        if ev.binding_id != ctx.id || ev.window_label != ctx.label {
            return;
        }
        let permitted = ctx
            .bindings
            .lock()
            .ok()
            .and_then(|map| map.get(&ctx.label).cloned())
            .is_some_and(|binding| binding.permits_event(&ctx.label, &ev));
        if permitted {
            if ctx
                .window
                .emit_to(
                    tauri::EventTarget::Window {
                        label: ctx.label.clone(),
                    },
                    EVENT_NAME,
                    &ev,
                )
                .is_err()
            {
                eprintln!("notes-ui: event delivery failed");
            }
        }
    }));
}
extern "C" fn release<R: Runtime>(context: *mut c_void) {
    if !context.is_null() {
        unsafe {
            drop(Box::from_raw(context as *mut Callback<R>));
        }
    }
}
fn cstr(value: &str) -> Result<CString> {
    CString::new(value).map_err(|_| Error::new("invalid_state", "文本包含空字符"))
}
fn json(state: &ToolbarState) -> Result<CString> {
    cstr(&serde_json::to_string(state).map_err(|e| Error::new("invalid_state", e.to_string()))?)
}
unsafe fn response(ptr: *mut c_char) -> Result<NativeInfo> {
    if ptr.is_null() {
        return Err(Error::new("native", "原生顶部返回空响应"));
    }
    let parsed = serde_json::from_slice::<serde_json::Value>(CStr::from_ptr(ptr).to_bytes());
    notes_ui_free(ptr);
    let value = parsed.map_err(|e| Error::new("native", e.to_string()))?;
    if value["ok"] == true {
        serde_json::from_value(value["native"].clone())
            .map_err(|e| Error::new("native", e.to_string()))
    } else {
        serde_json::from_value::<Error>(value["error"].clone())
            .map_or_else(|e| Err(Error::new("native", e.to_string())), Err)
    }
}
async fn on_main<R: Runtime, T: Send + 'static, F: FnOnce() -> Result<T> + Send + 'static>(
    app: &AppHandle<R>,
    f: F,
) -> Result<T> {
    let (tx, rx) = mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(f))
            .unwrap_or_else(|_| Err(Error::new("native", "原生顶部主线程任务失败")));
        let _ = tx.send(result);
    })
    .map_err(|e| Error::new("dispatch", e.to_string()))?;
    tauri::async_runtime::spawn_blocking(move || {
        rx.recv()
            .map_err(|_| Error::new("dispatch", "原生顶部任务已终止"))?
    })
    .await
    .map_err(|e| Error::new("dispatch", e.to_string()))?
}
fn binding(map: &Bindings, label: &str, id: &str) -> Result<Binding> {
    map.lock()
        .map_err(|_| Error::new("state", "顶部绑定锁损坏"))?
        .get(label)
        .filter(|b| b.id == id)
        .cloned()
        .ok_or_else(|| Error::new("stale_binding", "窗口没有此顶部绑定"))
}
fn info(label: String, binding: Binding, native: NativeInfo) -> BindingInfo {
    BindingInfo {
        window_label: label,
        binding_id: binding.id,
        state_revision: binding.state.revision,
        native,
    }
}
// The application menu is shared by all Mac windows. Only the main binding owns this title.
// A focus event may arrive before bind or after unbind, when there is no title to project yet.
fn project_sidebar_menu(
    map: &Bindings,
    label: &str,
    apply: impl FnOnce(&str) -> Result<()>,
) -> Result<()> {
    if label != "main" {
        return Ok(());
    }
    let title = map
        .lock()
        .map_err(|_| Error::new("state", "顶部绑定锁损坏"))?
        .get(label)
        .map(|record| {
            if record.state.columns.sidebar_visible {
                "隐藏文件夹"
            } else {
                "显示文件夹"
            }
        });
    if let Some(title) = title {
        apply(title)?;
    }
    Ok(())
}
fn sidebar_menu_item<R: Runtime>(
    items: Vec<tauri::menu::MenuItemKind<R>>,
) -> tauri::Result<Option<tauri::menu::MenuItem<R>>> {
    for item in items {
        if item.id().as_ref() == "sidebar" {
            if let Some(item) = item.as_menuitem() {
                return Ok(Some(item.clone()));
            }
        }
        if let Some(submenu) = item.as_submenu() {
            if let Some(item) = sidebar_menu_item(submenu.items()?)? {
                return Ok(Some(item));
            }
        }
    }
    Ok(None)
}
pub(super) fn refresh_sidebar_menu<R: Runtime>(app: &AppHandle<R>, label: &str) {
    // Called inside bind/update's on_main task or the main event loop's Focused event.
    // Read the current binding here; never capture a title on a worker and queue it later.
    // project_sidebar_menu releases the bindings lock before any Tauri menu dispatch.
    let result = (|| {
        let state = app
            .try_state::<NotesUi<R>>()
            .ok_or_else(|| Error::new("state", "顶部插件尚未初始化"))?;
        project_sidebar_menu(&state.bindings, label, |title| {
            let menu = app
                .menu()
                .ok_or_else(|| Error::new("menu_missing", "应用没有菜单"))?;
            let item = sidebar_menu_item(
                menu.items()
                    .map_err(|e| Error::new("menu", e.to_string()))?,
            )
            .map_err(|e| Error::new("menu", e.to_string()))?
            .ok_or_else(|| Error::new("menu_missing", "应用没有文件夹菜单项"))?;
            if item.text().map_err(|e| Error::new("menu", e.to_string()))? != title {
                item.set_text(title)
                    .map_err(|e| Error::new("menu", e.to_string()))?;
            }
            Ok(())
        })
    })();
    // Menu presentation failure must not undo or fail an already applied toolbar state.
    if let Err(error) = result {
        eprintln!("notes-ui: sidebar menu title failed: {error}");
    }
}
fn require_newer_revision(old: &Binding, state: &ToolbarState) -> Result<()> {
    if state.revision <= old.state.revision {
        return Err(Error::new("stale_state", "顶部状态版本必须递增"));
    }
    Ok(())
}
pub(super) async fn bind<R: Runtime>(
    app: &AppHandle<R>,
    map: Bindings,
    window: Window<R>,
    state: ToolbarState,
) -> Result<BindingInfo> {
    on_main(app, move || {
        let label = window.label().to_owned();
        if map
            .lock()
            .map_err(|_| Error::new("state", "顶部绑定锁损坏"))?
            .contains_key(&label)
        {
            return Err(Error::new(
                "already_bound",
                "窗口已绑定顶部；请更新状态或先解除旧绑定",
            ));
        }
        let native_window = window
            .ns_window()
            .map_err(|e| Error::new("window", e.to_string()))?;
        if native_window.is_null() {
            return Err(Error::new("window", "窗口已经关闭"));
        }
        let id = uuid::Uuid::new_v4().to_string();
        let label_c = cstr(&label)?;
        let id_c = cstr(&id)?;
        let state_c = json(&state)?;
        let record = Binding {
            id: id.clone(),
            state,
        };
        map.lock()
            .map_err(|_| Error::new("state", "顶部绑定锁损坏"))?
            .insert(label.clone(), record.clone());
        let ctx = Box::into_raw(Box::new(Callback {
            window: window.clone(),
            bindings: map.clone(),
            label: label.clone(),
            id,
        })) as *mut c_void;
        // C takes ownership of ctx on EVERY return path, including native creation failure.
        let result = unsafe {
            response(notes_ui_bind(
                native_window,
                label_c.as_ptr(),
                id_c.as_ptr(),
                state_c.as_ptr(),
                ctx,
                event::<R>,
                release::<R>,
            ))
        };
        match result {
            Ok(native) => {
                refresh_sidebar_menu(window.app_handle(), &label);
                Ok(info(label, record, native))
            }
            Err(e) => {
                unsafe {
                    notes_ui_destroy(id_c.as_ptr());
                }
                if let Ok(mut m) = map.lock() {
                    m.remove(&label);
                }
                Err(e)
            }
        }
    })
    .await
}
pub(super) async fn update<R: Runtime>(
    app: &AppHandle<R>,
    map: Bindings,
    window: Window<R>,
    id: String,
    state: ToolbarState,
) -> Result<BindingInfo> {
    on_main(app, move || {
        let label = window.label().to_owned();
        let old = binding(&map, &label, &id)?;
        require_newer_revision(&old, &state)?;
        let id_c = cstr(&id)?;
        let state_c = json(&state)?;
        let native = unsafe { response(notes_ui_update(id_c.as_ptr(), state_c.as_ptr()))? };
        let record = Binding { id, state };
        map.lock()
            .map_err(|_| Error::new("state", "顶部绑定锁损坏"))?
            .insert(label.clone(), record.clone());
        refresh_sidebar_menu(window.app_handle(), &label);
        Ok(info(label, record, native))
    })
    .await
}
pub(super) async fn inspect<R: Runtime>(
    app: &AppHandle<R>,
    map: Bindings,
    window: Window<R>,
    id: String,
) -> Result<BindingInfo> {
    on_main(app, move || {
        let label = window.label().to_owned();
        let record = binding(&map, &label, &id)?;
        let id_c = cstr(&id)?;
        Ok(info(label, record, unsafe {
            response(notes_ui_inspect(id_c.as_ptr()))?
        }))
    })
    .await
}
pub(super) async fn unbind<R: Runtime>(
    app: &AppHandle<R>,
    map: Bindings,
    window: Window<R>,
    id: String,
) -> Result<()> {
    on_main(app, move || {
        let label = window.label();
        binding(&map, label, &id)?;
        let id_c = cstr(&id)?;
        map.lock()
            .map_err(|_| Error::new("state", "顶部绑定锁损坏"))?
            .remove(label);
        unsafe {
            notes_ui_destroy(id_c.as_ptr());
        }
        Ok(())
    })
    .await
}
pub(super) async fn focus_search<R: Runtime>(
    app: &AppHandle<R>,
    map: Bindings,
    window: Window<R>,
    id: String,
) -> Result<BindingInfo> {
    on_main(app, move || focus_search_on_main(&map, &window, &id)).await
}
// Both callers already run on the main thread. The menu path must not queue or wait on on_main.
fn focus_search_on_main<R: Runtime>(
    map: &Bindings,
    window: &Window<R>,
    id: &str,
) -> Result<BindingInfo> {
    let label = window.label().to_owned();
    let record = binding(map, &label, id)?;
    record.permits_search_focus()?;
    let id_c = cstr(id)?;
    let native = unsafe { response(notes_ui_focus_search(id_c.as_ptr()))? };
    Ok(info(label, record, native))
}
pub(super) fn is_search_menu_event(event: &tauri::RunEvent) -> bool {
    matches!(event, tauri::RunEvent::MenuEvent(event) if event.id().as_ref() == "search")
}
fn menu_search_binding(map: &Bindings, focused_label: &str) -> Result<Binding> {
    if focused_label != "main" {
        return Err(Error::new("search_window", "当前聚焦窗口不支持全局搜索"));
    }
    let record = map
        .lock()
        .map_err(|_| Error::new("state", "顶部绑定锁损坏"))?
        .get(focused_label)
        .cloned()
        .ok_or_else(|| Error::new("stale_binding", "窗口没有顶部绑定"))?;
    record.permits_search_focus()?;
    Ok(record)
}
pub(super) fn focus_search_from_menu<R: Runtime>(app: &AppHandle<R>) -> Result<BindingInfo> {
    // Tauri invokes plugin events on its event-loop thread, after its global menu listeners.
    // This removes the renderer roundtrip, not the queue before Tauri's MenuEvent itself.
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut focused = None;
        for window in app.webview_windows().into_values() {
            if window
                .is_focused()
                .map_err(|e| Error::new("window", e.to_string()))?
            {
                if focused.is_some() {
                    return Err(Error::new("search_window", "无法唯一确定聚焦窗口"));
                }
                focused = Some(window);
            }
        }
        let window = focused.ok_or_else(|| Error::new("search_window", "没有聚焦窗口"))?;
        let state = app
            .try_state::<NotesUi<R>>()
            .ok_or_else(|| Error::new("state", "顶部插件尚未初始化"))?;
        let record = menu_search_binding(&state.bindings, window.label())?;
        focus_search_on_main(&state.bindings, &window.as_ref().window(), &record.id)
    }))
    .unwrap_or_else(|_| Err(Error::new("native", "原生顶部主线程任务失败")))
}
pub(super) fn destroy_label<R: Runtime>(app: &AppHandle<R>, label: &str) {
    if let Some(state) = app.try_state::<NotesUi<R>>() {
        let record = state.bindings.lock().ok().and_then(|mut m| m.remove(label));
        if let Some(record) = record {
            if let Ok(id) = cstr(&record.id) {
                let _ = app.run_on_main_thread(move || unsafe {
                    notes_ui_destroy(id.as_ptr());
                });
            }
        }
    }
}
pub(super) fn destroy_all<R: Runtime>(app: &AppHandle<R>) {
    if let Some(state) = app.try_state::<NotesUi<R>>() {
        let ids = state
            .bindings
            .lock()
            .map(|mut m| m.drain().map(|(_, b)| b.id).collect::<Vec<_>>())
            .unwrap_or_default();
        let _ = app.run_on_main_thread(move || {
            for id in ids {
                if let Ok(id) = cstr(&id) {
                    unsafe {
                        notes_ui_destroy(id.as_ptr());
                    }
                }
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sidebar_menu_projects_main_state_in_all_layouts_and_on_focus() {
        for layout in [
            Layout::ThreeColumn,
            Layout::GalleryBrowse,
            Layout::GalleryExpanded,
        ] {
            let mut state: ToolbarState =
                serde_json::from_str(include_str!("../examples/state.json")).unwrap();
            state.layout = layout;
            let map: Bindings = Arc::new(Mutex::new(HashMap::from([(
                "main".into(),
                Binding {
                    id: uuid::Uuid::new_v4().to_string(),
                    state,
                },
            )])));
            let mut titles = Vec::new();
            for visible in [true, false, true] {
                map.lock()
                    .unwrap()
                    .get_mut("main")
                    .unwrap()
                    .state
                    .columns
                    .sidebar_visible = visible;
                let before =
                    serde_json::to_value(&map.lock().unwrap().get("main").unwrap().state).unwrap();
                project_sidebar_menu(&map, "main", |title| {
                    titles.push(title.to_owned());
                    Ok(())
                })
                .unwrap();
                // Refocusing main projects the same current binding, without a new state or revision.
                project_sidebar_menu(&map, "main", |title| {
                    assert_eq!(title, titles.last().unwrap());
                    Ok(())
                })
                .unwrap();
                assert_eq!(
                    serde_json::to_value(&map.lock().unwrap().get("main").unwrap().state).unwrap(),
                    before
                );
            }
            assert_eq!(titles, ["隐藏文件夹", "显示文件夹", "隐藏文件夹"]);
        }
    }
    #[test]
    fn sidebar_menu_ignores_independent_and_not_yet_bound_windows() {
        let mut state: ToolbarState =
            serde_json::from_str(include_str!("../examples/state.json")).unwrap();
        state.layout = Layout::IndependentNote;
        state.columns.sidebar_visible = false;
        let map: Bindings = Arc::new(Mutex::new(HashMap::from([(
            "note-independent".into(),
            Binding {
                id: uuid::Uuid::new_v4().to_string(),
                state,
            },
        )])));
        for label in ["main", "note-independent", "other"] {
            project_sidebar_menu(&map, label, |_| {
                panic!("window without main state wrote application menu")
            })
            .unwrap();
        }
        let mut main = map.lock().unwrap().get("note-independent").unwrap().clone();
        main.state.layout = Layout::ThreeColumn;
        main.state.columns.sidebar_visible = true;
        map.lock().unwrap().insert("main".into(), main);
        project_sidebar_menu(&map, "note-independent", |_| {
            panic!("independent window overwrote main title")
        })
        .unwrap();
        project_sidebar_menu(&map, "main", |title| {
            assert_eq!(title, "隐藏文件夹");
            Ok(())
        })
        .unwrap();
    }
    #[test]
    fn sidebar_menu_keeps_current_state_after_stale_update_and_menu_failure() {
        let mut state: ToolbarState =
            serde_json::from_str(include_str!("../examples/state.json")).unwrap();
        state.revision = 5;
        state.columns.sidebar_visible = false;
        let id = uuid::Uuid::new_v4().to_string();
        let map: Bindings = Arc::new(Mutex::new(HashMap::from([(
            "main".into(),
            Binding {
                id: id.clone(),
                state: state.clone(),
            },
        )])));
        let current = binding(&map, "main", &id).unwrap();
        for revision in [4, 5] {
            let mut stale = state.clone();
            stale.revision = revision;
            stale.columns.sidebar_visible = true;
            assert_eq!(
                require_newer_revision(&current, &stale).unwrap_err().code,
                "stale_state"
            );
        }
        let mut next = state.clone();
        next.revision = 6;
        require_newer_revision(&current, &next).unwrap();
        assert_eq!(
            binding(&map, "main", &uuid::Uuid::new_v4().to_string())
                .err()
                .unwrap()
                .code,
            "stale_binding"
        );
        assert_eq!(
            project_sidebar_menu(&map, "main", |_| Err(Error::new(
                "menu_missing",
                "fixture missing item"
            )))
            .unwrap_err()
            .code,
            "menu_missing"
        );
        project_sidebar_menu(&map, "main", |title| {
            assert_eq!(title, "显示文件夹");
            Ok(())
        })
        .unwrap();
        assert_eq!(
            serde_json::to_value(&map.lock().unwrap().get("main").unwrap().state).unwrap(),
            serde_json::to_value(state).unwrap()
        );
    }
    #[test]
    fn menu_search_matches_only_the_exact_menu_event_id() {
        for id in [
            "search",
            "find",
            "search-more",
            "Search",
            "",
            "notes-ui:search",
        ] {
            let event = tauri::RunEvent::MenuEvent(tauri::menu::MenuEvent { id: id.into() });
            assert_eq!(is_search_menu_event(&event), id == "search");
        }
        assert!(!is_search_menu_event(&tauri::RunEvent::Ready));
    }
    #[test]
    fn menu_search_uses_only_the_focused_main_current_binding() {
        let old_id = uuid::Uuid::new_v4().to_string();
        let mut state: ToolbarState =
            serde_json::from_str(include_str!("../examples/state.json")).unwrap();
        state.search.as_mut().unwrap().value = "保留查询与选区".into();
        let before = serde_json::to_value(&state).unwrap();
        let map: Bindings = Arc::new(Mutex::new(HashMap::from([
            (
                "main".into(),
                Binding {
                    id: old_id.clone(),
                    state: state.clone(),
                },
            ),
            (
                "note-independent".into(),
                Binding {
                    id: uuid::Uuid::new_v4().to_string(),
                    state: state.clone(),
                },
            ),
        ])));
        let record = menu_search_binding(&map, "main").unwrap();
        assert_eq!(record.id, old_id);
        assert_eq!(serde_json::to_value(&record.state).unwrap(), before);
        for label in ["note-independent", "other", ""] {
            assert_eq!(
                menu_search_binding(&map, label).err().unwrap().code,
                "search_window"
            );
        }
        map.lock().unwrap().remove("main");
        assert_eq!(
            menu_search_binding(&map, "main").err().unwrap().code,
            "stale_binding"
        );
        let new_id = uuid::Uuid::new_v4().to_string();
        map.lock().unwrap().insert(
            "main".into(),
            Binding {
                id: new_id.clone(),
                state,
            },
        );
        assert_eq!(menu_search_binding(&map, "main").unwrap().id, new_id);
        assert_eq!(
            binding(&map, "main", &record.id).err().unwrap().code,
            "stale_binding"
        );
        assert_eq!(
            serde_json::to_value(&map.lock().unwrap().get("main").unwrap().state).unwrap(),
            before
        );
    }
    #[test]
    fn menu_search_rejects_disabled_or_missing_search_without_changing_state() {
        let mut state: ToolbarState =
            serde_json::from_str(include_str!("../examples/state.json")).unwrap();
        state.search.as_mut().unwrap().enabled = false;
        let map: Bindings = Arc::new(Mutex::new(HashMap::from([(
            "main".into(),
            Binding {
                id: uuid::Uuid::new_v4().to_string(),
                state,
            },
        )])));
        for code in ["search_disabled", "search_missing"] {
            let before =
                serde_json::to_value(&map.lock().unwrap().get("main").unwrap().state).unwrap();
            assert_eq!(menu_search_binding(&map, "main").err().unwrap().code, code);
            assert_eq!(
                serde_json::to_value(&map.lock().unwrap().get("main").unwrap().state).unwrap(),
                before
            );
            map.lock().unwrap().get_mut("main").unwrap().state.search = None;
        }
    }
    #[test]
    fn focus_lookup_rejects_other_window_and_old_id_after_rebind() {
        let old_id = uuid::Uuid::new_v4().to_string();
        let state: ToolbarState =
            serde_json::from_str(include_str!("../examples/state.json")).unwrap();
        let map: Bindings = Arc::new(Mutex::new(HashMap::from([(
            "main".into(),
            Binding {
                id: old_id.clone(),
                state: state.clone(),
            },
        )])));
        assert_eq!(
            binding(&map, "independent", &old_id).err().unwrap().code,
            "stale_binding"
        );
        binding(&map, "main", &old_id)
            .unwrap()
            .permits_search_focus()
            .unwrap();
        map.lock().unwrap().remove("main");
        assert_eq!(
            binding(&map, "main", &old_id).err().unwrap().code,
            "stale_binding"
        );
        let new_id = uuid::Uuid::new_v4().to_string();
        map.lock().unwrap().insert(
            "main".into(),
            Binding {
                id: new_id.clone(),
                state,
            },
        );
        assert_eq!(
            binding(&map, "main", &old_id).err().unwrap().code,
            "stale_binding"
        );
        binding(&map, "main", &new_id)
            .unwrap()
            .permits_search_focus()
            .unwrap();
    }
}
