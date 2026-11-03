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
