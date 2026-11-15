//! Real Wry/NSWindow example. Compile now; run only after GUI handoff.
use base64::{engine::general_purpose::STANDARD, Engine};
use tauri::{Listener, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_notes_ui::{
    Action, ActionState, Intent, Layout, MenuCommand, NotesUiExt, ToolbarEvent, ToolbarState,
    EVENT_NAME,
};

fn main() {
    let mut context = tauri::test::mock_context::<tauri::Wry, _>(tauri::test::noop_assets());
    // Only the empty Context/asset helper is used. Builder and windows use the real Wry runtime.
    context.config_mut().identifier = "com.local.notesui.native-toolbar-demo".into();
    tauri::Builder::<tauri::Wry>::default()
        .plugin(tauri_plugin_notes_ui::init())
        .setup(|app| {
            let url = format!(
                "data:text/html;charset=utf-8;base64,{}",
                STANDARD.encode(include_str!("demo.html"))
            );
            let main = WebviewWindowBuilder::new(
                app,
                "native-toolbar-demo",
                WebviewUrl::External(url.parse()?),
            )
            .title("原生顶部控件验证 — 合成内容")
            .inner_size(1088.0, 660.0)
            .min_inner_size(700.0, 440.0)
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true)
            .build()?;
            let state: ToolbarState = serde_json::from_str(include_str!("state.json"))?;
            let mut independent = state.clone();
            independent.layout = Layout::IndependentNote;
            independent.folder_title = String::new();
            independent.folder_count = 0;
            independent.search = None;
            independent.actions.retain(|a| {
                !matches!(
                    a.action,
                    Action::NewFolder
                        | Action::ToggleSidebar
                        | Action::ViewOptions
                        | Action::BackToGallery
                )
            });
            independent
                .menus
                .retain(|m| independent.actions.iter().any(|a| a.action == m.owner));
            let body = format!(
                "{}<style>aside,section{{display:none}}main{{padding:76px 24px 24px}}</style>",
                include_str!("demo.html")
            );
            let url = format!(
                "data:text/html;charset=utf-8;base64,{}",
                STANDARD.encode(body)
            );
            let second = WebviewWindowBuilder::new(
                app,
                "native-toolbar-independent",
                WebviewUrl::External(url.parse()?),
            )
            .title("独立笔记顶部验证 — 合成内容")
            .inner_size(740.0, 520.0)
            .min_inner_size(520.0, 320.0)
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true)
            .build()?;
            let initial = vec![
                (main.as_ref().window(), state.clone()),
                (second.as_ref().window(), independent.clone()),
            ];
            let state =
                std::sync::Arc::new(std::sync::Mutex::new(std::collections::HashMap::from([
                    ("native-toolbar-demo".to_owned(), state),
                    ("native-toolbar-independent".to_owned(), independent),
                ])));
            let handle = app.handle().clone();
            let states = state.clone();
            app.listen_any(EVENT_NAME, move |event| {
                let Ok(event) = serde_json::from_str::<ToolbarEvent>(event.payload()) else {
                    return;
                };
                println!("{}", serde_json::to_string(&event).unwrap());
                let Some(webview) = handle.get_webview_window(&event.window_label) else {
                    return;
                };
                let window = webview.as_ref().window().clone();
                let mut states = states.lock().unwrap();
                let Some(state) = states.get_mut(&event.window_label) else {
                    return;
                };
                match event.intent {
                    Intent::Search { value, .. } => {
                        let s = state.search.as_mut().unwrap();
                        s.value = value;
                        s.acknowledged_event = event.sequence;
                    }
                    Intent::Action {
                        action: Action::ToggleSidebar,
                    } => state.columns.sidebar_visible = !state.columns.sidebar_visible,
                    Intent::Action {
                        action: Action::Table,
                    } => state.table_focused = !state.table_focused,
                    Intent::Menu {
                        command: MenuCommand::ViewGallery,
                        ..
                    } => {
                        state.layout = Layout::GalleryExpanded;
                        if !state
                            .actions
                            .iter()
                            .any(|a| a.action == Action::BackToGallery)
                        {
                            state.actions.push(ActionState {
                                action: Action::BackToGallery,
                                enabled: true,
                                selected: false,
                            });
                        }
                    }
                    Intent::Action {
                        action: Action::BackToGallery,
                    }
                    | Intent::Menu {
                        command: MenuCommand::ViewList,
                        ..
                    } => {
                        state.layout = Layout::ThreeColumn;
                        state.actions.retain(|a| a.action != Action::BackToGallery);
                    }
                    _ => return,
                }
                state.revision += 1;
                let next = state.clone();
                drop(states);
                let handle = handle.clone();
                tauri::async_runtime::spawn(async move {
                    match handle
                        .notes_ui()
                        .update(window, event.binding_id, next)
                        .await
                    {
                        Ok(info) => println!("state {}", serde_json::to_string(&info).unwrap()),
                        Err(e) => eprintln!("update: {e}"),
                    }
                });
            });
            for (window, state) in initial {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    match handle.notes_ui().bind(window, state).await {
                        Ok(info) => println!("binding {}", serde_json::to_string(&info).unwrap()),
                        Err(e) => eprintln!("bind: {e}"),
                    }
                });
            }
            Ok(())
        })
        .run(context)
        .expect("native toolbar demo failed");
}
