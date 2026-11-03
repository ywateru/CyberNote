use super::*;
fn sample() -> ToolbarState {
    serde_json::from_str(include_str!("../examples/state.json")).unwrap()
}
#[test]
fn contract_rejects_unknown_variants_fields_and_unbounded_state() {
    let state = sample();
    state.validate().unwrap();
    let mut value = serde_json::to_value(&state).unwrap();
    value["body"] = serde_json::json!("must never be accepted");
    assert!(serde_json::from_value::<ToolbarState>(value).is_err());
    let mut value = serde_json::to_value(&state).unwrap();
    value["actions"][0]["action"] = serde_json::json!("executeJavaScript");
    assert!(serde_json::from_value::<ToolbarState>(value).is_err());
    let mut bad = state.clone();
    bad.actions.push(bad.actions[0].clone());
    assert_eq!(bad.validate().unwrap_err().code, "invalid_state");
    let mut bad = state.clone();
    bad.columns.sidebar_width = f64::NAN;
    assert!(bad.validate().is_err());
    let mut bad = state.clone();
    bad.folder_title = "字".repeat(257);
    assert!(bad.validate().is_err());
    let mut bad = state.clone();
    bad.search.as_mut().unwrap().value = "字".repeat(4097);
    assert!(bad.validate().is_err());
    let mut bad = state.clone();
    bad.revision = 0;
    assert!(bad.validate().is_err());
    let mut bad = state;
    bad.revision = 9_007_199_254_740_992;
    assert!(bad.validate().is_err());
}
#[test]
fn menus_require_unique_owned_commands_and_bounded_nesting() {
    let mut state = sample();
    state.menus.push(state.menus[0].clone());
    assert!(state.validate().is_err());
    let mut state = sample();
    state.actions.retain(|a| a.action != Action::Format);
    assert!(state.validate().is_err());
    let mut state = sample();
    let duplicate = state.menus[0].items[0].clone();
    state.menus[1].items.push(duplicate);
    assert!(state.validate().is_err());
    let mut state = sample();
    let mut entries = vec![MenuEntry::Separator];
    for _ in 0..4 {
        entries = vec![MenuEntry::Submenu {
            label: "层".into(),
            items: entries,
        }];
    }
    state.menus[0].items = entries;
    assert!(state.validate().is_err());
}
#[test]
fn gallery_browse_is_explicit_and_rejects_stale_editor_actions() {
    let mut state = sample();
    state.layout = Layout::GalleryBrowse;
    assert!(state.validate().is_err());
    state.actions.retain(|a| {
        matches!(
            a.action,
            Action::NewFolder | Action::ToggleSidebar | Action::ViewOptions | Action::NewNote
        )
    });
    state.menus.retain(|menu| menu.owner == Action::ViewOptions);
    state.validate().unwrap();
    let value = serde_json::to_value(&state).unwrap();
    assert_eq!(value["layout"], "galleryBrowse");
    state.actions.push(ActionState {
        action: Action::BackToGallery,
        enabled: true,
        selected: false,
    });
    assert_eq!(state.validate().unwrap_err().code, "invalid_state");
}
#[test]
fn format_surface_accepts_only_format_commands_and_disabled_colors_cannot_dispatch() {
    let mut state = sample();
    state.validate().unwrap();
    let menu = state
        .menus
        .iter_mut()
        .find(|menu| menu.owner == Action::Format)
        .unwrap();
    menu.items.push(MenuEntry::Item {
        command: MenuCommand::DeleteNote,
        label: "删除".into(),
        enabled: true,
        selected: false,
    });
    assert_eq!(state.validate().unwrap_err().code, "invalid_state");
    let mut state = sample();
    let menu = state
        .menus
        .iter_mut()
        .find(|menu| menu.owner == Action::Format)
        .unwrap();
    for entry in &mut menu.items {
        if let MenuEntry::Submenu { items, .. } = entry {
            for item in items {
                if let MenuEntry::Item { enabled, .. } = item {
                    *enabled = false;
                }
            }
        }
    }
    state.validate().unwrap();
    assert!(!state.permits(&Intent::Menu {
        owner: Action::Format,
        command: MenuCommand::ColorPurple,
    }));
    assert!(state.permits(&Intent::Menu {
        owner: Action::Format,
        command: MenuCommand::Bold,
    }));
}
#[test]
fn events_cannot_cross_windows_bindings_revisions_or_disabled_commands() {
    let state = sample();
    let binding = Binding {
        id: uuid::Uuid::new_v4().to_string(),
        state,
    };
    let mut event = ToolbarEvent {
        window_label: "main".into(),
        binding_id: binding.id.clone(),
        state_revision: 1,
        sequence: 1,
        intent: Intent::Action {
            action: Action::NewNote,
        },
    };
    assert!(binding.permits_event("main", &event));
    event.window_label = "independent-note".into();
    assert!(!binding.permits_event("main", &event));
    event.window_label = "main".into();
    event.binding_id = uuid::Uuid::new_v4().to_string();
    assert!(!binding.permits_event("main", &event));
    event.binding_id = binding.id.clone();
    event.state_revision = 2;
    assert!(!binding.permits_event("main", &event));
    event.state_revision = 1;
    event.intent = Intent::Action {
        action: Action::Share,
    };
    assert!(!binding.permits_event("main", &event));
    event.intent = Intent::Menu {
        owner: Action::Attachment,
        command: MenuCommand::ScanDocument,
    };
    assert!(!binding.permits_event("main", &event));
    event.intent = Intent::Menu {
        owner: Action::More,
        command: MenuCommand::Bold,
    };
    assert!(!binding.permits_event("main", &event));
    event.intent = Intent::Menu {
        owner: Action::Format,
        command: MenuCommand::Bold,
    };
    assert!(binding.permits_event("main", &event));
}
#[test]
fn guest_window_label_must_match_the_invoking_window() {
    let app = tauri::test::mock_app();
    let window = tauri::WebviewWindowBuilder::new(
        &app,
        "own-window",
        tauri::WebviewUrl::App("index.html".into()),
    )
    .build()
    .unwrap();
    own_window(&window.as_ref().window(), "own-window").unwrap();
    assert_eq!(
        own_window(&window.as_ref().window(), "other-window")
            .unwrap_err()
            .code,
        "window_mismatch"
    );
    assert_eq!(
        valid_binding_id("../../other-window").unwrap_err().code,
        "invalid_binding"
    );
}
#[test]
fn tauri_window_target_delivers_only_to_the_bound_window() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tauri::{Emitter, Listener};
    let app = tauri::test::mock_app();
    let first = tauri::WebviewWindowBuilder::new(
        &app,
        "first",
        tauri::WebviewUrl::App("index.html".into()),
    )
    .build()
    .unwrap();
    let second = tauri::WebviewWindowBuilder::new(
        &app,
        "second",
        tauri::WebviewUrl::App("index.html".into()),
    )
    .build()
    .unwrap();
    let own = Arc::new(AtomicUsize::new(0));
    let other = Arc::new(AtomicUsize::new(0));
    // JS getCurrentWindow().listen uses EventTarget::Window, unlike Rust WebviewWindow::listen.
    let n = own.clone();
    first.as_ref().window().listen(EVENT_NAME, move |_| {
        n.fetch_add(1, Ordering::SeqCst);
    });
    let n = other.clone();
    second.as_ref().window().listen(EVENT_NAME, move |_| {
        n.fetch_add(1, Ordering::SeqCst);
    });
    first
        .emit_to(
            tauri::EventTarget::Window {
                label: "first".into(),
            },
            EVENT_NAME,
            serde_json::json!({"test":true}),
        )
        .unwrap();
    assert_eq!(own.load(Ordering::SeqCst), 1);
    assert_eq!(other.load(Ordering::SeqCst), 0);
}

#[test]
fn search_focus_requires_enabled_search_without_mutating_query_or_revision() {
    let mut record = Binding {
        id: uuid::Uuid::new_v4().to_string(),
        state: sample(),
    };
    record.state.search.as_mut().unwrap().value = "已有查询与中文".into();
    let before = serde_json::to_value(&record.state).unwrap();
    record.permits_search_focus().unwrap();
    assert_eq!(serde_json::to_value(&record.state).unwrap(), before);
    record.state.search.as_mut().unwrap().enabled = false;
    assert_eq!(
        record.permits_search_focus().unwrap_err().code,
        "search_disabled"
    );
    record.state.search = None;
    assert_eq!(
        record.permits_search_focus().unwrap_err().code,
        "search_missing"
    );
}

#[test]
fn focus_command_rejects_cross_window_and_invalid_uuid_before_native_dispatch() {
    let app = tauri::test::mock_app();
    app.manage(NotesUi {
        app: app.handle().clone(),
        bindings: Arc::new(Mutex::new(HashMap::new())),
    });
    let webview = tauri::WebviewWindowBuilder::new(
        &app,
        "focus-owner",
        tauri::WebviewUrl::App("index.html".into()),
    )
    .build()
    .unwrap();
    let window = webview.as_ref().window();
    let cross = tauri::async_runtime::block_on(focus_search(
        window.clone(),
        app.state(),
        "other-window".into(),
        uuid::Uuid::new_v4().to_string(),
    ));
    assert_eq!(cross.unwrap_err().code, "window_mismatch");
    let invalid = tauri::async_runtime::block_on(focus_search(
        window.clone(),
        app.state(),
        "focus-owner".into(),
        "../arbitrary-selector".into(),
    ));
    assert_eq!(invalid.unwrap_err().code, "invalid_binding");
}
