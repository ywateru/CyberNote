//! Owned native-App test driver. No invoke command, socket, Session shim or DB writes.
//! lib.rs must apply the same cfg to both `mod sync_e2e` and `sync_e2e::start`.
#![cfg(all(feature = "sync-e2e", debug_assertions, desktop))]

use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    io::{self, BufRead, Write},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Condvar, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{Listener, Manager};

const PREFIX: &str = "@@SYNC108_NATIVE@@";
const MAX_REQUEST: usize = 2_100_000;
const MAX_REPLY: usize = 8_000_000;
const MAX_EXPRESSION: usize = 128_000;
const MAX_ID: u64 = 9_007_199_254_740_991;
// Fixed read-only body: no caller expression, commands, content, account or URL.
const STARTUP_DIAGNOSTIC: &str = r#"
return await (async () => {
    const began = performance.now();
    let raf = 0, timer = 0, cancelled = false;
    await new Promise(done => {
        let finished = false, frame, clock, end;
        const finish = () => {
            if (finished) return;
            finished = true;
            cancelAnimationFrame(frame); clearInterval(clock); clearTimeout(end);
            window.removeEventListener('pagehide', cancel);
            done();
        };
        const cancel = () => { cancelled = true; finish(); };
        const tick = () => { if (!finished) { raf = Math.min(10000, raf + 1); frame = requestAnimationFrame(tick); } };
        window.addEventListener('pagehide', cancel, {once:true});
        frame = requestAnimationFrame(tick);
        clock = setInterval(() => { if (!finished) timer = Math.min(10000, timer + 1); }, 25);
        end = setTimeout(finish, Math.min(350, Math.max(0, deadline - Date.now() - 25)));
    });
    const root = document.getElementById('root'), startup = document.getElementById('startup');
    let startupSnapshot = null;
    try {
        const snapshot = window.__CYBERNOTE_STARTUP_DIAGNOSTIC__;
        const keys = ['loading','workspaceLoaded','syncCover','synchronizing','editorSatisfied','nativeRequired','nativeInfoPresent','errorPresent','startupReady'];
        const object = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === fields.length && Object.keys(value).every(key => fields.includes(key));
        if (!cancelled && object(snapshot, ['schema','gates','phase']) && snapshot.schema === 1 &&
            object(snapshot.gates, keys) && keys.every(key => typeof snapshot.gates[key] === 'boolean') &&
            ['notScheduled','frame1','frame2','fallback','ready','cancelled'].includes(snapshot.phase)) {
            startupSnapshot = {schema:1,gates:Object.fromEntries(keys.map(key => [key,snapshot.gates[key]])),phase:snapshot.phase};
        }
    } catch (_) {}
    return {version:1, cancelled,
        readyState:['loading','interactive','complete'].includes(document.readyState) ? document.readyState : 'unknown',
        visibility:['visible','hidden'].includes(document.visibilityState) ? document.visibilityState : 'unknown',
        debug:!!window.__NOTES_DEBUG__,
        startup:!startup ? 'detached' : ['loading','ready','error'].includes(startup.dataset.state) ? startup.dataset.state : 'present',
        root:root ? {inert:!!root.inert,inertAttribute:root.hasAttribute('inert'),ariaHidden:root.hasAttribute('aria-hidden'),ariaBusy:root.hasAttribute('aria-busy')} : null,
        renderClock:{raf,timer,elapsedMs:Math.min(60000,Math.max(0,Math.round(performance.now()-began)))}, startupSnapshot};
})();
"#;
struct PageState {
    ready: bool,
    starts: u64,
    finishes: u64,
    url: String,
}
static PAGE: Mutex<PageState> = Mutex::new(PageState {
    ready: false,
    starts: 0,
    finishes: 0,
    url: String::new(),
});
static PAGE_CHANGED: Condvar = Condvar::new();
static READY_ACCEPTED: AtomicBool = AtomicBool::new(false);

/// Wire from the existing main on_page_load callback under the module cfg.
/// The native lifecycle is observed before any JS eval is permitted.
pub fn page_load(label: &str, payload: &tauri::webview::PageLoadPayload<'_>) {
    if label != "main" || std::env::var("NOTES_SYNC_E2E").as_deref() != Ok("1") {
        return;
    }
    let Ok(mut state) = PAGE.lock() else { return };
    match payload.event() {
        tauri::webview::PageLoadEvent::Started => {
            state.ready = false;
            state.starts += 1;
            READY_ACCEPTED.store(false, Ordering::SeqCst);
        }
        tauri::webview::PageLoadEvent::Finished => {
            state.ready = true;
            state.finishes += 1;
        }
    }
    // Never record URL queries, fragments, document text or event arguments.
    let url = payload.url();
    state.url = format!(
        "{}://{}{}",
        url.scheme(),
        url.host_str().unwrap_or(""),
        url.path()
    )
    .chars()
    .take(200)
    .collect();
    PAGE_CHANGED.notify_all();
}
fn page_snapshot(state: &PageState) -> Value {
    json!({"finished":state.ready,"starts":state.starts,"finishes":state.finishes,"url":state.url})
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Request {
    id: u64,
    #[serde(default = "default_timeout")]
    timeout_ms: u64,
    action: Action,
}
fn default_timeout() -> u64 {
    30_000
}
#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "camelCase", deny_unknown_fields)]
enum Action {
    Ready,
    StartupDiagnostic,
    Execute {
        command: String,
        #[serde(default = "empty_object")]
        args: Value,
    },
    State,
    Snapshot {
        #[serde(default = "empty_object")]
        options: Value,
    },
    Idle,
    Eval {
        expression: String,
        #[serde(default)]
        arg: Value,
    },
    Shutdown,
}
fn empty_object() -> Value {
    json!({})
}
fn allowed_before_ready(action: &Action) -> bool {
    matches!(
        action,
        Action::Ready | Action::StartupDiagnostic | Action::Shutdown
    )
}
// Called only in the validated, explicit left/right slot branch below. Each
// closure captures the same owned main window; failure stops the sequence.
fn present_owned_slot_window(
    show: impl FnOnce() -> io::Result<()>,
    unminimize: impl FnOnce() -> io::Result<()>,
    focus: impl FnOnce() -> io::Result<()>,
) -> io::Result<()> {
    show()?;
    unminimize()?;
    focus()
}

/// Called late in setup, after the normal Session, sync and main window exist.
/// An unset switch leaves stdin/stdout completely untouched.
pub fn start(app: &tauri::AppHandle) -> io::Result<()> {
    if std::env::var("NOTES_SYNC_E2E").as_deref() != Ok("1") {
        return Ok(());
    }
    if app.get_webview_window("main").is_none() {
        return Err(io::Error::other("sync-e2e requires the main webview"));
    }
    // Test-only placement keeps BOTH owned windows partially visible without
    // changing editor/save/quiet behavior or depending on a fixed startup delay.
    if let Ok(slot) = std::env::var("NOTES_SYNC_E2E_SLOT") {
        if slot != "left" && slot != "right" {
            return Err(io::Error::other("invalid sync-e2e window slot"));
        }
        let window = app.get_webview_window("main").unwrap();
        window
            .set_size(tauri::LogicalSize::new(1000.0, 700.0))
            .map_err(io::Error::other)?;
        if let Some(monitor) = window.current_monitor().map_err(io::Error::other)? {
            let area = monitor.work_area();
            let width = window.outer_size().map_err(io::Error::other)?.width;
            let offset = if slot == "right" {
                area.size.width.saturating_sub(width)
            } else {
                0
            };
            window
                .set_position(tauri::PhysicalPosition::new(
                    area.position.x + offset as i32,
                    area.position.y,
                ))
                .map_err(io::Error::other)?;
        }
        present_owned_slot_window(
            || window.show().map_err(io::Error::other),
            || window.unminimize().map_err(io::Error::other),
            || window.set_focus().map_err(io::Error::other),
        )?;
    }
    let app = app.clone();
    std::thread::Builder::new()
        .name("sync108-stdin".into())
        .spawn(move || {
            if serve(&app).is_err() {
                // No raw request, JS exception, invitation or stderr dump.
                app.exit(70);
            }
        })?;
    Ok(())
}

fn output(value: Value) -> io::Result<()> {
    let stdout = io::stdout();
    let mut stdout = stdout.lock();
    writeln!(stdout, "{PREFIX}{value}")?;
    stdout.flush()
}
fn error(id: Value, code: &str) -> Value {
    json!({"type":"response", "id":id, "ok":false, "error":{"code":code}})
}

// read_until/read_line can allocate an unbounded hostile line before checking it.
// Keep at most MAX_REQUEST bytes and drain an oversized record before continuing.
fn line(reader: &mut impl BufRead) -> io::Result<Option<Vec<u8>>> {
    let mut bytes = Vec::new();
    let mut oversized = false;
    loop {
        let part = reader.fill_buf()?;
        if part.is_empty() {
            return if oversized {
                Err(io::Error::new(io::ErrorKind::InvalidData, "oversized"))
            } else if bytes.is_empty() {
                Ok(None)
            } else {
                // NDJSON requires a complete newline-terminated record.
                Err(io::Error::new(io::ErrorKind::UnexpectedEof, "partial"))
            };
        }
        let end = part.iter().position(|b| *b == b'\n');
        let count = end.map_or(part.len(), |n| n + 1);
        if bytes.len() + count > MAX_REQUEST {
            oversized = true;
        }
        if !oversized {
            bytes.extend_from_slice(&part[..count]);
        }
        reader.consume(count);
        if end.is_some() {
            return if oversized {
                Err(io::Error::new(io::ErrorKind::InvalidData, "oversized"))
            } else {
                Ok(Some(bytes))
            };
        }
    }
}

fn serve(app: &tauri::AppHandle) -> io::Result<()> {
    output(
        json!({"type":"hello", "protocol":1, "pid":std::process::id(),
        "window":"main", "transport":"native-webview-eval-event"}),
    )?;
    let stdin = io::stdin();
    let mut reader = stdin.lock();
    loop {
        let bytes = match line(&mut reader) {
            Ok(Some(bytes)) => bytes,
            Ok(None) => {
                // EOF is an owned graceful close, including real save/idle ACKs.
                let request = Request {
                    id: MAX_ID,
                    timeout_ms: default_timeout(),
                    action: Action::Shutdown,
                };
                let reply = dispatch(app, &request);
                app.exit(if reply.get("ok") == Some(&json!(true)) {
                    0
                } else {
                    70
                });
                return Ok(());
            }
            Err(err) => {
                output(error(
                    Value::Null,
                    if err.kind() == io::ErrorKind::UnexpectedEof {
                        "PARTIAL_RECORD"
                    } else {
                        "INPUT_ERROR"
                    },
                ))?;
                // A truncated/oversized stream cannot establish a clean close.
                app.exit(70);
                return Ok(());
            }
        };
        let request: Request = match serde_json::from_slice(&bytes) {
            Ok(request) => request,
            Err(_) => {
                output(error(Value::Null, "INVALID_REQUEST"))?;
                continue;
            }
        };
        if request.id == 0 || request.id > MAX_ID || !(1..=60_000).contains(&request.timeout_ms) {
            output(error(json!(request.id), "INVALID_REQUEST"))?;
            continue;
        }
        let reply = dispatch(app, &request);
        let timed_out =
            reply.pointer("/error/code").and_then(Value::as_str) == Some("NATIVE_TIMEOUT");
        let shutdown = matches!(request.action, Action::Shutdown);
        let ok = reply.get("ok") == Some(&json!(true));
        output(reply)?;
        if timed_out || shutdown {
            // No cancellation claim: timed-out JS may still be active. Never
            // dequeue another request into that webview. Node enforces exit.
            app.exit(if shutdown && ok { 0 } else { 70 });
            return Ok(());
        }
    }
}

fn dispatch(app: &tauri::AppHandle, request: &Request) -> Value {
    if matches!(request.action, Action::Ready) {
        let deadline = Instant::now() + Duration::from_millis(request.timeout_ms);
        {
            let Ok(mut page) = PAGE.lock() else {
                return error(json!(request.id), "PAGE_STATE_ERROR");
            };
            while !page.ready {
                let remaining = deadline.saturating_duration_since(Instant::now());
                if remaining.is_zero() {
                    let mut result = error(json!(request.id), "TIMEOUT");
                    result["error"]["phase"] = json!("nativePageFinished");
                    result["error"]["diagnostic"] = page_snapshot(&page);
                    return result;
                }
                let Ok((next, _)) = PAGE_CHANGED.wait_timeout(page, remaining) else {
                    return error(json!(request.id), "PAGE_STATE_ERROR");
                };
                page = next;
            }
        }
        let mut probes = 0;
        let mut last = Value::Null;
        while Instant::now() < deadline {
            let remaining = deadline
                .saturating_duration_since(Instant::now())
                .as_millis() as u64;
            if remaining == 0 {
                break;
            }
            let probe = Request {
                id: request.id,
                timeout_ms: remaining.min(1000),
                action: Action::Ready,
            };
            // A synchronous, read-only probe can safely be retried if an early
            // about:blank/navigation context disappears. Never retry mutations.
            let result = dispatch_once(
                app,
                &probe,
                Some("await report('documentProbe'); return domState();".into()),
            );
            probes += 1;
            last = result.get("value").cloned().unwrap_or(Value::Null);
            if last.get("interactive") == Some(&json!(true)) {
                let remaining = deadline
                    .saturating_duration_since(Instant::now())
                    .as_millis() as u64;
                if remaining == 0 {
                    break;
                }
                let ready = Request {
                    id: request.id,
                    timeout_ms: remaining,
                    action: Action::Ready,
                };
                let mut result = dispatch_once(app, &ready, None);
                if result.get("ok") == Some(&json!(true)) {
                    READY_ACCEPTED.store(true, Ordering::SeqCst);
                    result["value"]["documentProbes"] = json!(probes);
                    result["value"]["nativePage"] = PAGE
                        .lock()
                        .map(|p| page_snapshot(&p))
                        .unwrap_or(Value::Null);
                    if let Some(window) = app.get_webview_window("main") {
                        result["value"]["nativeWindow"] = json!({
                            "visible":window.is_visible().ok(), "minimized":window.is_minimized().ok(),
                            "focused":window.is_focused().ok(), "position":window.outer_position().ok(),
                            "size":window.outer_size().ok()
                        });
                    }
                }
                return result;
            }
            // Poll interval only: every release still requires actual DOM state.
            std::thread::sleep(
                Duration::from_millis(25).min(deadline.saturating_duration_since(Instant::now())),
            );
        }
        let mut result = error(json!(request.id), "TIMEOUT");
        result["error"]["phase"] = json!("documentProbe");
        result["error"]["diagnostic"] = json!({"documentProbes":probes,"lastDocument":last});
        return result;
    }
    if !allowed_before_ready(&request.action) && !READY_ACCEPTED.load(Ordering::SeqCst) {
        return error(json!(request.id), "NOT_READY");
    }
    dispatch_once(app, request, None)
}

fn dispatch_once(
    app: &tauri::AppHandle,
    request: &Request,
    override_body: Option<String>,
) -> Value {
    let id = json!(request.id);
    let body = match &request.action {
        Action::StartupDiagnostic => STARTUP_DIAGNOSTIC.into(),
        Action::Ready => format!(
            "await report('debugRegistration');\n\
             while (!window.__NOTES_DEBUG__) {{ if (Date.now() >= deadline) throw {{code:'TIMEOUT'}}; await new Promise(r=>setTimeout(r,25)); }}\n\
             if (window.__NOTES_DEBUG__.version !== 1) throw {{code:'UNAVAILABLE'}};\n\
             await report('appIdle');\n\
             await window.__NOTES_DEBUG__.waitForIdle({{timeoutMs:Math.min(30000, Math.max(1,deadline-Date.now()))}});\n\
             await report('startupHandoff');\n\
             while (true) {{\n\
                 const root = document.getElementById('root');\n\
                 if (root && !document.getElementById('startup') && !root.inert && !root.hasAttribute('inert') && !root.hasAttribute('aria-hidden') && !root.hasAttribute('aria-busy')) break;\n\
                 if (Date.now() >= deadline) throw {{code:'TIMEOUT'}};\n\
                 await new Promise(r=>setTimeout(r,25));\n\
             }}\n\
             return {{version:1, native:!!window.__TAURI_INTERNALS__, window:windowLabel, location:location.origin, interactive:true, startupDetached:true, document:domState()}};"
        ),
        Action::Execute { command, args } if command.len() <= 200 && args.is_object() => {
            format!("return (await debug.execute({}, {})).result;", json!(command), args)
        }
        Action::State => "return (await debug.execute('app.state')).result;".into(),
        Action::Snapshot { options } if options.is_object() => {
            // Invitation DOM is explicitly sensitive. Do not export it in a snapshot.
            format!("if(document.querySelector('[data-sensitive=invitation]')) throw {{code:'SENSITIVE_DOM'}}; return debug.snapshot({options});")
        }
        Action::Idle => "return debug.waitForIdle({timeoutMs:Math.min(30000, Math.max(1,deadline-Date.now()))});".into(),
        Action::Eval { expression, arg } if !expression.is_empty() && expression.len() <= MAX_EXPRESSION => {
            // Insert an expression directly in eval's script; do not require CSP
            // unsafe-eval / new Function or alter the production CSP.
            format!("const arg = {arg}; return await (\n{expression}\n); ")
        }
        Action::Shutdown => "await debug.execute('app.flush'); await debug.waitForIdle({timeoutMs:Math.min(30000, Math.max(1,deadline-Date.now()))}); return {flushed:true};".into(),
        _ => return error(id, "INVALID_REQUEST"),
    };
    let body = override_body.unwrap_or(body);
    let Some(window) = app.get_webview_window("main") else {
        return error(id, "WINDOW_UNAVAILABLE");
    };
    // App events do not carry a trustworthy caller label. The unpredictable
    // per-request event + nonce is captured only in THIS webview's eval closure,
    // never broadcast to other windows; check its Tauri metadata before running.
    let event = format!("sync108-{}", uuid::Uuid::new_v4().simple());
    let nonce = uuid::Uuid::new_v4().to_string();
    let expected_nonce = nonce.clone();
    let expected_id = request.id;
    let (send, receive) = mpsc::sync_channel(1);
    let progress = Arc::new(Mutex::new(Value::Null));
    let observed = progress.clone();
    let listener = app.listen(event.clone(), move |event| {
        if event.payload().len() > MAX_REPLY + 4096 {
            return;
        }
        let Ok(mut value) = serde_json::from_str::<Value>(event.payload()) else {
            return;
        };
        if value.get("nonce").and_then(Value::as_str) != Some(expected_nonce.as_str())
            || value.get("window").and_then(Value::as_str) != Some("main")
            || value.get("id").and_then(Value::as_u64) != Some(expected_id)
        {
            return;
        }
        if let Some(phase) = value.get("progress").and_then(Value::as_str) {
            if [
                "documentProbe",
                "debugRegistration",
                "appIdle",
                "startupHandoff",
            ]
            .contains(&phase)
            {
                if let Ok(mut current) = observed.lock() {
                    *current = json!({"phase":phase,"document":value.get("document")});
                }
            }
            return;
        }
        if !value.get("ok").is_some_and(Value::is_boolean) {
            return;
        }
        value.as_object_mut().unwrap().remove("nonce");
        value.as_object_mut().unwrap().remove("window");
        value["type"] = json!("response");
        let _ = send.try_send(value);
    });
    let script = format!(
        r#"(() => {{
        const event = {event}, nonce = {nonce}, id = {id};
        const windowLabel = window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label;
        const deadline = Date.now() + {timeout};
        let phase = 'evalEntered';
        const domState = () => {{
            const root=document.getElementById('root'), startup=document.getElementById('startup');
            const interactive=document.readyState==='complete' && !!window.__NOTES_DEBUG__ && !!root && !startup && !root.inert && !root.hasAttribute('inert') && !root.hasAttribute('aria-hidden') && !root.hasAttribute('aria-busy');
            return {{readyState:document.readyState,visibility:document.visibilityState,timeOrigin:performance.timeOrigin,
                debug:!!window.__NOTES_DEBUG__,startup:startup?.dataset.state || (startup ? 'present' : 'detached'),
                rootInert:root?.inert ?? null,rootHidden:root?.getAttribute('aria-hidden') ?? null,interactive}};
        }};
        const report = async (next) => {{
            phase=next;
            await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', {{event,payload:{{id,nonce,window:windowLabel,progress:phase,document:domState()}}}});
        }};
        const run = async () => {{
            if(windowLabel !== 'main') throw {{code:'WRONG_WINDOW'}};
            const debug = window.__NOTES_DEBUG__;
            {body}
        }};
        void (async () => {{
            let result;
            try {{
                const value = await run();
                result = {{ok:true,value:value === undefined ? null : value}};
                if(new TextEncoder().encode(JSON.stringify(result)).length > {max_reply})
                    throw {{code:'OUTPUT_TOO_LARGE'}};
            }} catch (error) {{
                const allowed = ['INVALID_ARGUMENT','UNKNOWN_COMMAND','UNAVAILABLE','UNSUPPORTED','TIMEOUT','APP_ERROR','WRONG_WINDOW','OUTPUT_TOO_LARGE','SENSITIVE_DOM'];
                result = {{ok:false,error:{{code:allowed.includes(error?.code) ? error.code : 'JS_ERROR',phase,diagnostic:domState()}}}};
            }}
            try {{ await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', {{
                event, payload:{{id,nonce,window:windowLabel,...result}}
            }}); }} catch (_) {{ /* Rust's bounded timeout is authoritative. */ }}
        }})();
    }})();"#,
        event = json!(event),
        nonce = json!(nonce),
        id = request.id,
        timeout = request.timeout_ms,
        max_reply = MAX_REPLY,
    );
    let mut result = if window.eval(script).is_err() {
        error(id, "EVAL_FAILED")
    } else {
        receive
            .recv_timeout(Duration::from_millis(request.timeout_ms))
            .unwrap_or_else(|_| {
                let mut result = error(id, "NATIVE_TIMEOUT");
                let last = progress.lock().map(|p| p.clone()).unwrap_or(Value::Null);
                result["error"]["phase"] = last
                    .get("phase")
                    .cloned()
                    .unwrap_or(json!("evalNotObserved"));
                result["error"]["diagnostic"] = last;
                result
            })
    };
    app.unlisten(listener);
    if matches!(request.action, Action::StartupDiagnostic) && result.get("ok") == Some(&json!(true)) {
        result["value"]["nativeWindow"] = json!({
            "visible":window.is_visible().ok(), "minimized":window.is_minimized().ok(),
            "focused":window.is_focused().ok()
        });
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn owned_slot_focus_follows_presentation_once_and_never_hides_failure() {
        use std::cell::RefCell;
        for failure in [None, Some("show"), Some("unminimize"), Some("focus")] {
            let calls = RefCell::new(Vec::new());
            let operation = |name| {
                calls.borrow_mut().push(("owned-main", name));
                if failure == Some(name) {
                    Err(io::Error::other("fixture"))
                } else {
                    Ok(())
                }
            };
            let result = present_owned_slot_window(
                || operation("show"),
                || operation("unminimize"),
                || operation("focus"),
            );
            assert_eq!(result.is_err(), failure.is_some());
            let expected = match failure {
                Some("show") => vec![("owned-main", "show")],
                Some("unminimize") => vec![("owned-main", "show"), ("owned-main", "unminimize")],
                _ => vec![
                    ("owned-main", "show"),
                    ("owned-main", "unminimize"),
                    ("owned-main", "focus"),
                ],
            };
            assert_eq!(*calls.borrow(), expected);
        }
    }

    #[test]
    fn fixed_startup_diagnostic_is_parameterless_and_preserves_ready_gate() {
        let request: Request = serde_json::from_value(json!({
            "id":1,"action":{"op":"startupDiagnostic"}
        }))
        .unwrap();
        assert!(allowed_before_ready(&request.action));
        for extra in [
            json!({"expression":"arbitrary"}),
            json!({"args":{}}),
            json!({"command":"app.state"}),
            json!({"options":{}}),
        ] {
            let mut value = json!({"id":1,"action":{"op":"startupDiagnostic"}});
            value["action"]
                .as_object_mut()
                .unwrap()
                .extend(extra.as_object().unwrap().clone());
            assert!(serde_json::from_value::<Request>(value).is_err());
        }
        for action in [
            Action::Eval {
                expression: "true".into(),
                arg: Value::Null,
            },
            Action::Execute {
                command: "app.state".into(),
                args: empty_object(),
            },
            Action::State,
            Action::Idle,
            Action::Snapshot {
                options: empty_object(),
            },
        ] {
            assert!(!allowed_before_ready(&action));
        }
        assert!(allowed_before_ready(&Action::Ready));
        assert!(allowed_before_ready(&Action::Shutdown));
    }
}
