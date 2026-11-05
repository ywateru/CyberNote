// Standalone harness of the production Rust sink: no Tauri/app/audio runtime.
#[derive(Debug)]
pub struct Error {
    pub stage: Option<String>,
    pub request_id: Option<String>,
}
#[path = "../plugins/tauri-plugin-notes-ui/src/recording_diagnostics.rs"]
mod recording_diagnostics;
use recording_diagnostics::{Delivery, Request, Stage, EVENT_LIMIT};
#[no_mangle]
pub extern "C" fn diagnostics63_initialize() {
    let _ = Request::new();
}
#[no_mangle]
pub extern "C" fn diagnostics63_event(
    request: u64,
    stage: u32,
    code: i32,
    status: std::ffi::c_long,
) {
    if let Some(callback) = Request(request).callback() {
        callback(request, stage, code, status);
    }
}

#[test]
fn sink_contract63() {
    let enabled = std::env::var("NOTES_RECORDING_DIAGNOSTICS").as_deref() == Ok("1");
    let request = Request::new();
    assert_eq!(request.0 != 0, enabled);
    assert_eq!(request.callback().is_some(), enabled);
    let error = request.error(
        Error {
            stage: None,
            request_id: None,
        },
        Stage::NativeResult,
    );
    assert_eq!(error.stage.as_deref(), enabled.then_some("native_result"));
    assert_eq!(error.request_id.as_deref(), enabled.then_some("1"));
    let preserved = request.error(
        Error {
            stage: Some("native_result".into()),
            request_id: Some("1".into()),
        },
        Stage::RustDelivery,
    );
    assert_eq!(preserved.stage.as_deref(), Some("native_result"));
    assert_eq!(Request::new().0, if enabled { 2 } else { 0 });
    if std::env::var_os("DIAGNOSTICS63_SYNTHETIC_FLOOD").is_some() {
        // Hold the actual stderr lock while producers run. A synchronous
        // diagnostic writer would stall here; our producers must all finish.
        let stderr_lock = std::io::stderr().lock();
        let started = std::time::Instant::now();
        let mut threads = vec![];
        for _ in 0..4 {
            threads.push(std::thread::spawn(move || {
                for _ in 0..100 {
                    request.emit(Stage::RustDispatch, 0, -1);
                }
            }));
        }
        for thread in threads {
            thread.join().unwrap();
        }
        assert!(started.elapsed() < std::time::Duration::from_secs(1));
        drop(stderr_lock);
    } else {
        request.emit(Stage::RustDispatch, 0, -1);
        if let Some(callback) = request.callback() {
            std::thread::spawn(move || callback(request.0, 11, 0, 1))
                .join()
                .unwrap();
            callback(request.0, 999, u32::MAX as i32, 0); // unknown stage is silent
        }
        drop(Delivery(request, false));
        drop(Delivery(request, true));
    }
    if enabled {
        let flood = std::env::var_os("DIAGNOSTICS63_SYNTHETIC_FLOOD").is_some();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
        loop {
            let (written, truncated) = recording_diagnostics::test_output();
            if (flood && truncated) || (!flood && written == 3) {
                break;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "writer did not drain synthetic output"
            );
            std::thread::sleep(std::time::Duration::from_millis(1));
        }
    }
    println!(
        "PASS enabled={enabled}; event_limit={EVENT_LIMIT}; metadata policy and unique request IDs"
    );
}
