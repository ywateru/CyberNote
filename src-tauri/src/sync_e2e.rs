//! Owned native-App test driver. No invoke command, socket, Session shim or DB writes.
//! lib.rs must apply the same cfg to both `mod sync_e2e` and `sync_e2e::start`.
#![cfg(all(feature = "sync-e2e", debug_assertions, desktop))]

use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    io::{self, BufRead, Write},
    sync::mpsc,
    time::Duration,
};
use tauri::{Listener, Manager};

const PREFIX: &str = "@@SYNC108_NATIVE@@";
const MAX_REQUEST: usize = 2_100_000;
const MAX_REPLY: usize = 8_000_000;
const MAX_EXPRESSION: usize = 128_000;
const MAX_ID: u64 = 9_007_199_254_740_991;

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

/// Called late in setup, after the normal Session, sync and main window exist.
/// An unset switch leaves stdin/stdout completely untouched.
pub fn start(app: &tauri::AppHandle) -> io::Result<()> {
    if std::env::var("NOTES_SYNC_E2E").as_deref() != Ok("1") {
        return Ok(());
    }
    if app.get_webview_window("main").is_none() {
        return Err(io::Error::other("sync-e2e requires the main webview"));
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
    let id = json!(request.id);
    let body = match &request.action {
        Action::Ready => format!(
            "while (!window.__NOTES_DEBUG__) {{ if (Date.now() >= deadline) throw {{code:'TIMEOUT'}}; await new Promise(r=>setTimeout(r,25)); }}\n\
             if (window.__NOTES_DEBUG__.version !== 1) throw {{code:'UNAVAILABLE'}};\n\
             await window.__NOTES_DEBUG__.waitForIdle({{timeoutMs:Math.min(30000, Math.max(1,deadline-Date.now()))}});\n\
             while (true) {{\n\
                 const root = document.getElementById('root');\n\
                 if (root && !document.getElementById('startup') && !root.inert && !root.hasAttribute('inert') && !root.hasAttribute('aria-hidden') && !root.hasAttribute('aria-busy')) break;\n\
                 if (Date.now() >= deadline) throw {{code:'TIMEOUT'}};\n\
                 await new Promise(r=>setTimeout(r,25));\n\
             }}\n\
             return {{version:1, native:!!window.__TAURI_INTERNALS__, window:windowLabel, location:location.origin, interactive:true, startupDetached:true}};"
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
            || !value.get("ok").is_some_and(Value::is_boolean)
        {
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
                result = {{ok:false,error:{{code:allowed.includes(error?.code) ? error.code : 'JS_ERROR'}}}};
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
    let result = if window.eval(script).is_err() {
        error(id, "EVAL_FAILED")
    } else {
        receive
            .recv_timeout(Duration::from_millis(request.timeout_ms))
            .unwrap_or_else(|_| error(id, "NATIVE_TIMEOUT"))
    };
    app.unlisten(listener);
    result
}
