// Compile production plugin source unchanged against the already built locked dependencies.
// Real hidden Wry windows; direct production command call (no mocked runtime).
include!("../../../plugins/tauri-plugin-notes-ui/src/lib.rs");

fn main() {
    let mut context = tauri::test::mock_context::<tauri::Wry, _>(tauri::test::noop_assets());
    // Only empty context/assets are synthetic. Window/runtime/native execution is real.
    context.config_mut().identifier = "com.local.notes.ordinary-keyboard37-probe".into();
    tauri::Builder::<tauri::Wry>::default()
        .plugin(init())
        .setup(|app| {
            app.set_activation_policy(tauri::ActivationPolicy::Prohibited);
            let main = tauri::WebviewWindowBuilder::new(app,"main",tauri::WebviewUrl::App("index.html".into()))
                .visible(false).focused(false).build()?;
            let other = tauri::WebviewWindowBuilder::new(app,"note-probe",tauri::WebviewUrl::App("index.html".into()))
                .visible(false).focused(false).build()?;
            let handle=app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let run = async {
                    assert!(!main.is_visible().unwrap() && !other.is_visible().unwrap());
                    println!("PASS real Wry windows remain hidden");
                    let own=keyboard_navigation(main.as_ref().window().clone(),handle.state(),"main".into()).await?;
                    println!("PASS real main command -> main-thread window validation -> native query enabled={}",own.enabled);
                    let foreign=keyboard_navigation(main.as_ref().window().clone(),handle.state(),"note-probe".into()).await.unwrap_err();
                    assert_eq!(foreign.code,"window_mismatch");
                    println!("PASS real invoking main rejects foreign windowLabel");
                    let independent=keyboard_navigation(other.as_ref().window().clone(),handle.state(),"note-probe".into()).await.unwrap_err();
                    assert_eq!(independent.code,"window_mismatch");
                    println!("PASS real independent native window rejects main-only query");
                    let stale=main.as_ref().window().clone();
                    main.destroy().unwrap();
                    tauri::async_runtime::spawn_blocking(||std::thread::sleep(std::time::Duration::from_millis(40))).await.unwrap();
                    let closed=keyboard_navigation(stale,handle.state(),"main".into()).await.unwrap_err();
                    assert!(matches!(closed.code.as_str(),"window_closed"|"keyboard_target"));
                    println!("PASS real destroyed main command rejects stale Window code={}",closed.code);
                    assert!(!other.is_visible().unwrap());
                    Ok::<(),Error>(())
                }.await;
                match run { Ok(())=>{println!("PASS real Rust/native chain total=5");handle.exit(0)},Err(e)=>{eprintln!("FAIL real Rust/native chain: {e}");handle.exit(1)} }
            });
            Ok(())
        })
        .run(context).expect("hidden native probe failed");
}
