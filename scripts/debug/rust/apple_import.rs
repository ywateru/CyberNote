//! Explicit synthetic OS-source adapter. All task/state/Store logic is the exact
//! production core; no actual Notes access and no alternative append algorithm.
use super::*;
use crate::apple_import_core::{self as core, Host, OwnedStage, Source};
use std::{collections::HashMap, sync::atomic::AtomicBool};
struct TransportHost {
    shared: Arc<(Mutex<Session>, Condvar)>,
    windows: Arc<StdinWindows>,
}
impl Host for TransportHost {
    fn authorize(&self, t: &Token) -> Result<()> {
        self.shared
            .0
            .lock()
            .map_err(|_| error("internal", "fixture session lock"))?
            .apple_import_access(t)
    }
    fn append(&self, b: store::apple_import::PreparedBatch, t: &Token) -> Result<Value> {
        let mut s = self
            .shared
            .0
            .lock()
            .map_err(|_| error("internal", "fixture session lock"))?;
        let result = s.append_apple_notes(b, t);
        let event = s.take_metadata_event();
        drop(s);
        if let Some(event) = event {
            self.windows.emit("notes-metadata", &event)?;
        }
        result
    }
    fn alive(&self, owner: &str) -> bool {
        self.windows.participants().contains(owner)
    }
}
struct FixtureSource {
    scan: Value,
    reads: HashMap<String, Value>,
    files: HashMap<String, String>,
    delay_ms: u64,
}
impl Source for FixtureSource {
    fn execute(&self, r: Value, stage: &OwnedStage, cancel: &AtomicBool) -> Result<Value> {
        use std::io::Write;
        let began = std::time::Instant::now();
        while began.elapsed().as_millis() < self.delay_ms as u128 {
            if cancel.load(Ordering::Acquire) {
                return Err(error("cancelled", "已取消复制。"));
            }
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        if r["mode"] == "scan" {
            return Ok(self.scan.clone());
        }
        let value = self
            .reads
            .get(field(&r, "noteId")?)
            .cloned()
            .ok_or_else(|| error("source_fixture", "No synthetic note"))?;
        if let Some(files) = value["note"]["attachments"].as_array() {
            for a in files {
                if a["status"] != "ok" {
                    continue;
                }
                let data = self
                    .files
                    .get(field(a, "id")?)
                    .ok_or_else(|| error("source_fixture", "No synthetic export bytes"))?;
                let bytes = B64
                    .decode(data)
                    .map_err(|_| error("source_fixture", "Invalid synthetic bytes"))?;
                if bytes.len() > 100 * 1024 * 1024 {
                    return Err(error("source_fixture", "Bounded synthetic file"));
                }
                let path = stage.export_path(
                    a["exportIndex"]
                        .as_u64()
                        .ok_or_else(|| error("source_fixture", "Invalid synthetic export index"))?
                        as usize,
                )?;
                let mut file = std::fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(path)?;
                file.write_all(&bytes)?;
            }
        }
        Ok(value)
    }
}
pub(super) struct Transport {
    imports: core::Imports,
    host: Arc<TransportHost>,
    source: Mutex<Arc<FixtureSource>>,
}
impl Transport {
    pub fn new(shared: Arc<(Mutex<Session>, Condvar)>, windows: Arc<StdinWindows>) -> Self {
        Self {
            imports: core::Imports::default(),
            host: Arc::new(TransportHost { shared, windows }),
            source: Mutex::new(Arc::new(FixtureSource {
                scan: json!({"version":1,"status":"ok","accounts":[],"folders":[],"notes":[],"truncated":false}),
                reads: HashMap::new(),
                files: HashMap::new(),
                delay_ms: 0,
            })),
        }
    }
    pub fn command(&self, row: &Value) -> Result<Value> {
        let a = &row["args"];
        let owner = field(row, "window")?;
        if row["command"] == "debug_apple_source" {
            let reads: HashMap<String, Value> = serde_json::from_value(a["reads"].clone())?;
            let files: HashMap<String, String> = serde_json::from_value(a["files"].clone())?;
            if reads.len() > 5000 || files.len() > 10000 {
                return Err(error("source_fixture", "Bounded synthetic source"));
            }
            let delay_ms = a["delayMs"].as_u64().unwrap_or(0);
            if delay_ms > 2000 {
                return Err(error("source_fixture", "Bounded synthetic delay"));
            }
            *self.source.lock().unwrap() = Arc::new(FixtureSource {
                scan: a["scan"].clone(),
                reads,
                files,
                delay_ms,
            });
            return Ok(Value::Null);
        }
        let token: Token = serde_json::from_value(a["expected"].clone())?;
        let source = self.source.lock().unwrap().clone();
        match field(row, "command")? {
            "apple_notes_scan" => {
                core::scan_job(token, owner, &self.imports, self.host.clone(), source)
            }
            "apple_notes_status" => core::status_job(
                field(a, "id")?,
                &token,
                owner,
                &self.imports,
                self.host.as_ref(),
            ),
            "apple_notes_cancel" => core::cancel_job(field(a, "id")?, &token, owner, &self.imports),
            "apple_notes_start" => core::start_job(
                field(a, "id")?,
                serde_json::from_value(a["keys"].clone())?,
                &token,
                owner,
                &self.imports,
                self.host.clone(),
                source,
            ),
            _ => Err(error("source_fixture", "Unknown source command")),
        }
    }
}
