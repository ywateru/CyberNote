use super::*;
fn sample() -> ToolbarState {
    serde_json::from_str(include_str!("../examples/state.json")).unwrap()
}
#[test]
fn builtin_theme_ids_are_closed_and_legacy_hosts_default_to_classic() {
    let mut value = serde_json::to_value(sample()).unwrap();
    value.as_object_mut().unwrap().remove("themeId");
    let old: ToolbarState = serde_json::from_value(value.clone()).unwrap();
    assert!(matches!(old.theme_id, ThemeId::Classic));
    for theme in ["classic", "paper", "high-contrast", "ocean", "forest", "rose", "lavender", "graphite"] {
        for scheme in ["system", "light", "dark"] {
            value["themeId"] = serde_json::json!(theme);
            value["appearance"] = serde_json::json!(scheme);
            let state: ToolbarState = serde_json::from_value(value.clone()).unwrap();
            state.validate().unwrap();
            assert_eq!(serde_json::to_value(state).unwrap()["themeId"], theme);
        }
    }
    for invalid in [serde_json::Value::Null, serde_json::json!("unknown"), serde_json::json!({"css":"red"})] {
        value["themeId"] = invalid;
        assert!(serde_json::from_value::<ToolbarState>(value.clone()).is_err());
    }
}
#[test]
fn contract_rejects_unknown_variants_fields_and_unbounded_state() {
    let state = sample();
    state.validate().unwrap();
    assert_eq!(state.icon_scale, 1.0);
    assert_eq!(state.hit_scale, 1.0);
    for (icon, hit) in [(0.8, 1.0), (1.2, 1.3)] {
        let mut scaled = state.clone();
        scaled.icon_scale = icon;
        scaled.hit_scale = hit;
        scaled.validate().unwrap();
    }
    for invalid in [f64::NAN, f64::INFINITY, 0.79, 1.21] {
        let mut bad = state.clone(); bad.icon_scale = invalid;
        assert!(bad.validate().is_err());
    }
    for invalid in [f64::NAN, f64::INFINITY, 0.99, 1.31] {
        let mut bad = state.clone(); bad.hit_scale = invalid;
        assert!(bad.validate().is_err());
    }
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
    for scale in [f64::NAN, f64::INFINITY, 0.0, 2.0] {
        let mut bad = state.clone();
        bad.font_scale = scale;
        assert!(bad.validate().is_err());
    }
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
        folder_id: None,
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
        folder_id: None,
    }));
    assert!(state.permits(&Intent::Menu {
        owner: Action::Format,
        command: MenuCommand::Bold,
        folder_id: None,
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
        folder_id: None,
    };
    assert!(!binding.permits_event("main", &event));
    event.intent = Intent::Menu {
        owner: Action::More,
        command: MenuCommand::Bold,
        folder_id: None,
    };
    assert!(!binding.permits_event("main", &event));
    event.intent = Intent::Menu {
        owner: Action::Format,
        command: MenuCommand::Bold,
        folder_id: None,
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

#[test]
fn content_overlay_is_optional_and_survives_strict_transport_serialization() {
    let normal = sample();
    assert!(!normal.content_overlay);
    let mut value = serde_json::to_value(&normal).unwrap();
    value["contentOverlay"] = serde_json::json!(true);
    let overlay: ToolbarState = serde_json::from_value(value).unwrap();
    overlay.validate().unwrap();
    assert!(overlay.content_overlay);
    assert_eq!(serde_json::to_value(overlay).unwrap()["contentOverlay"], true);
}

#[test]
fn move_submenu_permits_only_the_exact_enabled_folder_from_current_state() {
    let mut state = sample();
    let owner = state.menus.iter_mut().find(|m| m.owner == Action::More).unwrap();
    owner.items.push(MenuEntry::Submenu { label: "移动到".into(), items: vec![
        MenuEntry::Item { command: MenuCommand::MoveNote, folder_id: Some("folder-a".into()), label: "当前目录".into(), enabled: false, selected: true },
        MenuEntry::Item { command: MenuCommand::MoveNote, folder_id: Some("folder-b".into()), label: "目标目录".into(), enabled: true, selected: false },
    ] });
    state.validate().unwrap();
    let intent = |id: &str| Intent::Menu { owner: Action::More, command: MenuCommand::MoveNote, folder_id: Some(id.into()) };
    assert!(!state.permits(&intent("folder-a")));
    assert!(state.permits(&intent("folder-b")));
    assert!(!state.permits(&intent("forged-folder")));
    let menu = state.menus.iter_mut().find(|m| m.owner == Action::More).unwrap();
    menu.items.push(MenuEntry::Item { command: MenuCommand::DeleteNote, folder_id: Some("folder-b".into()), label: "伪造目标".into(), enabled: true, selected: false });
    assert!(state.validate().is_err());
}
