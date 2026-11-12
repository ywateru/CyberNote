//! Measurement host adapter only: exact production Session + MediaRuntime.
//! Fixed trusted test window; no renderer-provided identity or media byte proxy.
#[path = "current/attachment_media/mod.rs"]
mod attachment_media;
#[path = "current/session.rs"]
mod session;
#[path = "current/store.rs"]
mod store;
#[path = "current/sync.rs"]
mod sync;
#[cfg(target_os = "macos")]
#[path = "media-macos.rs"]
mod media_macos;
use attachment_media::runtime::{MediaRuntime, Purpose};
use serde_json::{json, Value};
use session::{Session, Token};
use std::{
    collections::HashSet,
    io::{self, BufRead, Write},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Condvar, Mutex, OnceLock,
    },
};
use store::{AppError, Result, Store};
use sync::adapter::{Runtime, SharedSession, WindowHost};
fn error(code: &str, message: &str) -> AppError {
    AppError {
        code: code.into(),
        message: message.into(),
        commit: None,
    }
}
fn field<'a>(v: &'a Value, k: &str) -> Result<&'a str> {
    v[k].as_str()
        .ok_or_else(|| error("invalid", "Missing string argument"))
}
fn token(args: &Value) -> Result<Token> {
    serde_json::from_value(args["expected"].clone()).map_err(Into::into)
}
struct Host {
    live: Mutex<bool>,
    events: Mutex<Vec<Value>>,
    media: OnceLock<Arc<MediaRuntime>>,
}
impl WindowHost for Host {
    fn participants(&self) -> HashSet<String> {
        if *self.live.lock().unwrap() {
            HashSet::from(["main".into()])
        } else {
            HashSet::new()
        }
    }
    fn emit(&self, name: &str, payload: &Value) -> Result<()> {
        let media_result = self.media.get().unwrap().event(name, payload);
        let mut events = self.events.lock().unwrap();
        if events.len() >= 4096 {
            return Err(error("limit", "Event queue full"));
        }
        events.push(json!({"name":name,"payload":payload}));
        media_result
    }
}
fn ordinary(shared: &SharedSession, host: &Host, row: &Value) -> Result<Value> {
    let args = &row["args"];
    let mut s = shared.0.lock().unwrap();
    let mut access = None;
    let result = (|| match field(row, "command")? {
        "load_workspace" => s.workspace(),
        "poll_events" => Ok(Value::Null),
        "register_save_intent" => {
            s.register_save(
                "main",
                field(args, "noteId")?,
                field(args, "intent")?,
                token(args)?,
            )?;
            Ok(Value::Null)
        }
        "acknowledge_access" => {
            s.acknowledge(
                field(args, "operationId")?,
                "main",
                args["success"]
                    .as_bool()
                    .ok_or_else(|| error("invalid", "Missing ACK"))?,
            )?;
            shared.1.notify_all();
            Ok(Value::Null)
        }
        "workspace_action" => {
            let action = args["action"].clone();
            if action["type"] == "saveNote" {
                s.save("main", action)
            } else {
                let (value, event) = s.ordinary(action, &token(args)?)?;
                access = event;
                Ok(value)
            }
        }
        "read_note_text" => {
            let id = field(args, "id")?;
            s.sensitive(id, &token(args)?)?;
            s.tagged(s.store.note_text(id)?)
        }
        // Legacy path is real and observed, never substituted for streaming success.
        "read_attachment" => {
            let id = field(args, "id")?;
            let note = s.store.attachment_note(id)?;
            s.sensitive(&note, &token(args)?)?;
            s.tagged(s.store.read_attachment(id)?)
        }
        _ => Err(error(
            "transport_unsupported",
            "Unsupported measurement command",
        )),
    })();
    let metadata = s.take_metadata_event();
    drop(s);
    if let Some(event) = access {
        host.emit("notes-access", &event)?;
    }
    if let Some(event) = metadata {
        host.emit("notes-metadata", &event)?;
    }
    result
}
fn barrier(shared: &SharedSession, host: &Host, args: &Value) -> Result<Value> {
    let mut s = shared.0.lock().unwrap();
    let event = s.begin(args["action"].clone(), host.participants(), &token(args)?)?;
    let operation = field(&event, "operationId")?.to_owned();
    drop(s);
    host.emit("notes-access", &event)?;
    let s = shared.0.lock().unwrap();
    let (mut s, wait) = shared
        .1
        .wait_timeout_while(s, std::time::Duration::from_secs(10), |s| !s.ready())
        .unwrap();
    let (result, event) = s.finish(&operation, &host.participants(), wait.timed_out())?;
    let metadata = s.take_metadata_event();
    drop(s);
    host.emit("notes-access", &event)?;
    if let Some(event) = metadata {
        host.emit("notes-metadata", &event)?;
    }
    result
}
fn metrics(media: &MediaRuntime) -> Result<Value> {
    let m = &media.core.metrics;
    let cache = media.core.cache_usage()?;
    Ok(json!({"schema":2,
        "bytesRead":m.bytes_read.load(Ordering::Acquire),
        "readOperations":m.read_operations.load(Ordering::Acquire),
        "originalBytesRead":m.original_bytes_read.load(Ordering::Acquire),
        "originalReadOperations":m.original_read_operations.load(Ordering::Acquire),
        "thumbnailBytesRead":m.thumbnail_bytes_read.load(Ordering::Acquire),
        "thumbnailReadOperations":m.thumbnail_read_operations.load(Ordering::Acquire),
        "thumbnailGenerationAttempts":m.thumbnail_generation_attempts.load(Ordering::Acquire),
        "thumbnailSourceLogicalBytes":m.thumbnail_source_logical_bytes.load(Ordering::Acquire),
        "thumbnailOutputBytes":m.thumbnail_output_bytes.load(Ordering::Acquire),
        "peakReadBlock":m.peak_read_block.load(Ordering::Acquire),
        "activeStreams":m.active_streams.load(Ordering::Acquire),
        "thumbnailGenerations":m.thumbnail_generations.load(Ordering::Acquire),
        "thumbnailHits":m.thumbnail_hits.load(Ordering::Acquire),
        "activeLeases":media.core.measurement_active_leases()?,
        "cacheBytes":cache.bytes,"cacheFiles":cache.files,"cacheQuota":cache.quota,
        "scope":"Actual production HTTP source reads by purpose. Registered source bytes per generation attempt are logical input, NOT decoder reads or physical IO. Output is encoded published PNG bytes. Active leases/cache are gauges; atomics are not a transactional snapshot."
    }))
}
fn dispatch(
    shared: &SharedSession,
    host: &Host,
    sync: &Runtime,
    rt: &tokio::runtime::Handle,
    row: &Value,
) -> Result<Value> {
    let args = &row["args"];
    let media = host.media.get().unwrap();
    // Identity comes from this trusted test host, never a renderer parameter.
    if row["window"] != "main" {
        return Err(error("access_changed", "Unregistered test window"));
    }
    match field(row, "command")? {
        "acquire_attachment_source" => {
            let identity = media.window("main")?;
            let purpose: Purpose = serde_json::from_value(args["purpose"].clone())?;
            let pixels: Option<u32> =
                serde_json::from_value(args.get("pixels").cloned().unwrap_or(Value::Null))?;
            rt.block_on(media.acquire(
                identity,
                field(args, "id")?.into(),
                token(args)?,
                purpose,
                pixels,
            ))
        }
        "release_attachment_source" => {
            media.release(&media.window("main")?, field(args, "leaseId")?)?;
            Ok(Value::Null)
        }
        "clear_attachment_media_cache" => media.clear_cache(&token(args)?),
        "get_data_management" => media.data_management(&token(args)?),
        "sync_command" => sync.command(
            serde_json::from_value(args["command"].clone())?,
            "main",
            &token(args)?,
        ),
        "sync_diagnostics" => sync.diagnostics("main", &token(args)?),
        "sync_window_reply" => sync.reply(
            "main",
            serde_json::from_value(args["reply"].clone())?,
            &token(args)?,
        ),
        "perf_metrics" => metrics(media),
        // These commands are host-only: Node's renderer bridge rejects perf_*.
        "perf_window_close" => {
            *host.live.lock().unwrap() = false;
            media.closed("main");
            Ok(Value::Null)
        }
        "perf_window_open" => {
            media.opened("main")?;
            *host.live.lock().unwrap() = true;
            Ok(Value::Null)
        }
        "perf_prepare" => {
            let event = {
                let mut s = shared.0.lock().unwrap();
                s.begin(args["action"].clone(), host.participants(), &token(args)?)?
            };
            host.emit("notes-access", &event)?;
            Ok(event)
        }
        "perf_finish" => {
            let (result, event, metadata) = {
                let mut s = shared.0.lock().unwrap();
                let (r, e) = s.finish(field(args, "operationId")?, &host.participants(), false)?;
                (r, e, s.take_metadata_event())
            };
            host.emit("notes-access", &event)?;
            if let Some(e) = metadata {
                host.emit("notes-metadata", &e)?;
            }
            result
        }
        "workspace_action" if Session::requires_barrier(&args["action"]) => {
            barrier(shared, host, args)
        }
        _ => ordinary(shared, host, row),
    }
}
fn respond(output: &Mutex<()>, host: &Host, row: &Value, result: Result<Value>) {
    let _out = output.lock().unwrap();
    let events = std::mem::take(&mut *host.events.lock().unwrap());
    let response = match result {
        Ok(value) => json!({"requestId":row["requestId"],"ok":true,"value":value,"events":events}),
        Err(e) => json!({"requestId":row["requestId"],"ok":false,"error":e,"events":events}),
    };
    println!("{response}");
    let _ = io::stdout().flush();
}
fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    let root = std::path::PathBuf::from(std::env::args().nth(1).ok_or("Isolated Store required")?);
    let origin = std::env::var("MEDIA_TEST_ORIGIN")?;
    let parsed = url::Url::parse(&origin)?;
    if parsed.scheme() != "http"
        || parsed.host_str() != Some("127.0.0.1")
        || parsed.port().is_none()
        || parsed.origin().ascii_serialization() != origin
    {
        return Err("Exact bound test server Origin required".into());
    }
    let shared = Arc::new((
        Mutex::new(Session::new(Store::open(&root).map_err(|e| e.message)?)),
        Condvar::new(),
    ));
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()?;
    let media = rt
        .block_on(MediaRuntime::start_with_provider(
            shared.clone(),
            root.join("media-cache"),
            HashSet::from([origin]),
            {
                #[cfg(target_os = "macos")]
                { Some(media_macos::provider()) }
                #[cfg(not(target_os = "macos"))]
                { None }
            },
        ))
        .map_err(|e| e.message)?;
    media.opened("main").map_err(|e| e.message)?;
    let host = Arc::new(Host {
        live: Mutex::new(true),
        events: Mutex::new(vec![]),
        media: OnceLock::new(),
    });
    host.media.set(media.clone()).ok().unwrap();
    let sync = Runtime::new(shared.clone(), root, host.clone()).map_err(|e| e.message)?;
    let output = Arc::new(Mutex::new(()));
    let count = Arc::new(AtomicUsize::new(0));
    let mut workers = vec![];
    let mut input = io::stdin().lock();
    loop {
        // Bounded request before allocating a complete line, not after read_line.
        let mut line = Vec::new();
        let mut eof = false;
        loop {
            let bytes = input.fill_buf()?;
            if bytes.is_empty() {
                eof = true;
                break;
            }
            let n = bytes
                .iter()
                .position(|b| *b == b'\n')
                .map(|x| x + 1)
                .unwrap_or(bytes.len());
            if line.len() + n > 4 * 1024 * 1024 {
                return Err("IPC request exceeds 4MiB".into());
            }
            line.extend_from_slice(&bytes[..n]);
            input.consume(n);
            if line.last() == Some(&b'\n') {
                break;
            }
        }
        if eof {
            if !line.is_empty() {
                return Err("Incomplete IPC line".into());
            }
            break;
        }
        let row: Value = serde_json::from_slice(&line)?;
        if !row["requestId"].is_u64() {
            return Err("Invalid request identity".into());
        }
        workers.retain(|w: &std::thread::JoinHandle<()>| !w.is_finished());
        if count.fetch_add(1, Ordering::AcqRel) >= 32 {
            count.fetch_sub(1, Ordering::AcqRel);
            respond(
                &output,
                &host,
                &row,
                Err(error("busy", "Bounded measurement workers exhausted")),
            );
            continue;
        }
        let (shared, host, sync, output, count, handle) = (
            shared.clone(),
            host.clone(),
            sync.clone(),
            output.clone(),
            count.clone(),
            rt.handle().clone(),
        );
        workers.push(std::thread::spawn(move || {
            let result = dispatch(&shared, &host, &sync, &handle, &row);
            respond(&output, &host, &row, result);
            count.fetch_sub(1, Ordering::AcqRel);
        }));
    }
    for w in workers {
        let _ = w.join();
    }
    sync.shutdown().map_err(|e| e.message)?;
    media.stop();
    Ok(())
}
