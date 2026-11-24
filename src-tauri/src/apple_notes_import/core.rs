//! Fixed source worker. Apple Events run outside the Session mutex; only the
//! final append owns it. Tokens, real window labels and opaque jobs are host-owned.
use crate::{
    session::Token,
    store::apple_import::{self, SourceAttachment, SourceFolder, SourceNote},
    store::{AppError, Result},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use uuid::Uuid;

pub(crate) trait Host: Send + Sync {
    fn authorize(&self, expected: &Token) -> Result<()>;
    fn append(&self, batch: apple_import::PreparedBatch, expected: &Token) -> Result<Value>;
    fn alive(&self, owner: &str) -> bool;
}
pub(crate) trait Source: Send + Sync {
    fn execute(&self, request: Value, stage: &OwnedStage, cancel: &AtomicBool) -> Result<Value>;
}
pub(crate) struct SystemSource;
impl Source for SystemSource {
    fn execute(&self, request: Value, stage: &OwnedStage, cancel: &AtomicBool) -> Result<Value> {
        run_source(request, stage, cancel)
    }
}
impl OwnedStage {
    // Only the explicit development transport implements a synthetic Source;
    // production always uses SystemSource and cannot accept injected payloads.
    #[allow(dead_code)]
    pub(crate) fn export_path(&self, index: usize) -> Result<&std::path::Path> {
        self.exports
            .get(index)
            .map(|p| p.as_path())
            .ok_or_else(|| error("source_stage", "附件索引无效"))
    }
}
fn error(code: &str, message: &str) -> AppError {
    AppError {
        code: code.into(),
        message: message.into(),
        commit: None,
    }
}
#[derive(Clone, Default)]
pub(crate) struct Imports(Arc<Mutex<Option<Arc<Job>>>>);
struct Job {
    id: String,
    owner: String,
    token: Token,
    cancelled: AtomicBool,
    publish: Mutex<()>,
    data: Mutex<JobData>,
}
struct JobData {
    snapshot: Snapshot,
    scan: Option<ValidatedScan>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Preview {
    key: String,
    title: String,
    folder: String,
    status: String,
    reason: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    id: String,
    phase: String,
    completed: usize,
    total: usize,
    items: Vec<Preview>,
    results: Vec<apple_import::ItemResult>,
    error: String,
    truncated: bool,
    commit: Option<Value>,
}
#[derive(Clone)]
struct ValidatedItem {
    key: String,
    id: String,
    title: String,
    folder_id: String,
    folders: Vec<SourceFolder>,
}
struct ValidatedScan {
    items: HashMap<String, ValidatedItem>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Scan {
    version: u32,
    status: String,
    reason: Option<String>,
    accounts: Vec<Account>,
    folders: Vec<Folder>,
    notes: Vec<Metadata>,
    #[serde(default)]
    truncated: bool,
}
#[derive(Deserialize)]
struct Account {
    id: String,
    name: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Folder {
    id: String,
    name: String,
    parent_id: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Metadata {
    id: Option<String>,
    title: String,
    folder_id: Option<String>,
    status: String,
    reason: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Read {
    version: u32,
    status: String,
    reason: Option<String>,
    note: Option<Body>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Body {
    id: String,
    title: String,
    folder_id: String,
    html: String,
    plain_text: String,
    created_at_ms: i64,
    updated_at_ms: i64,
    attachments: Vec<Media>,
    stable: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Media {
    id: String,
    cid: Option<String>,
    name: Option<String>,
    status: String,
    reason: Option<String>,
    export_index: usize,
}
fn reason(category: &str) -> &'static str {
    match category {
        "automation_denied" => {
            "系统尚未允许访问备忘录。请在系统设置的隐私与安全性→自动化中允许本应用访问备忘录。"
        }
        "timeout" | "event_timeout" => "读取系统备忘录超时，请稍后重试。",
        "locked" => "源备忘录已锁定，已跳过。",
        "export_failed" => "源附件无法导出，未复制这条备忘录。",
        "changed" | "source_changed" => "源备忘录在读取期间发生变化，请重试。",
        "hierarchy_unreadable" => "无法确认源文件夹层次，已跳过。",
        "source_limit" => "源数据超过本轮安全上限，请分批导入。",
        "unsupported_object" => "源备忘录包含暂不支持完整复制的对象。",
        "cancelled" => "已取消复制。",
        _ => "无法完整读取源备忘录，已跳过。",
    }
}
fn validate_text(s: &str, max: usize) -> Result<()> {
    if s.len() > max {
        Err(error("source_limit", reason("source_limit")))
    } else {
        Ok(())
    }
}
fn validate_scan(scan: Scan) -> Result<(ValidatedScan, Vec<Preview>, bool)> {
    if scan.version != 1 || scan.status != "ok" {
        return Err(error(
            "source_read",
            reason(scan.reason.as_deref().unwrap_or(&scan.status)),
        ));
    }
    if scan.accounts.len() > 1000 || scan.folders.len() > 10_000 || scan.notes.len() > 5000 {
        return Err(error("source_limit", reason("source_limit")));
    }
    let mut accounts = HashMap::new();
    for a in scan.accounts {
        validate_text(&a.id, 4096)?;
        validate_text(&a.name, 4096)?;
        if a.id.is_empty() || accounts.insert(a.id, a.name).is_some() {
            return Err(error("source_invalid", "源账户信息无效"));
        }
    }
    let mut folders = HashMap::new();
    for f in scan.folders {
        validate_text(&f.id, 4096)?;
        validate_text(&f.name, 4096)?;
        validate_text(&f.parent_id, 4096)?;
        if f.id.is_empty()
            || accounts.contains_key(&f.id)
            || folders.insert(f.id.clone(), f).is_some()
        {
            return Err(error("source_invalid", "源文件夹信息无效"));
        }
    }
    let mut items = HashMap::new();
    let mut preview = Vec::new();
    let mut ids = HashSet::new();
    for n in scan.notes {
        validate_text(&n.title, 4096)?;
        let key = Uuid::new_v4().to_string();
        let mut path = Vec::new();
        let mut category = n.reason.clone().unwrap_or_else(|| n.status.clone());
        let mut cursor = n.folder_id.clone();
        let mut ancestors = HashSet::new();
        let mut account_found = false;
        while let Some(parent) = cursor {
            if path.len() > 64 || !ancestors.insert(parent.clone()) {
                category = "hierarchy_unreadable".into();
                break;
            }
            if let Some(name) = accounts.get(&parent) {
                path.push(SourceFolder {
                    id: parent,
                    name: name.clone(),
                });
                account_found = true;
                break;
            }
            if let Some(folder) = folders.get(&parent) {
                path.push(SourceFolder {
                    id: folder.id.clone(),
                    name: folder.name.clone(),
                });
                cursor = Some(folder.parent_id.clone());
            } else {
                category = "hierarchy_unreadable".into();
                break;
            }
        }
        path.reverse();
        let valid = n.status == "ok"
            && account_found
            && n.id
                .as_ref()
                .is_some_and(|id| !id.is_empty() && id.len() <= 4096)
            && n.folder_id.is_some();
        let status = if valid {
            "ok"
        } else if n.status == "locked" {
            "locked"
        } else {
            "unreadable"
        };
        if valid {
            let id = n.id.clone().unwrap();
            if !ids.insert(id.clone()) {
                return Err(error("source_invalid", "源备忘录标识重复"));
            }
            items.insert(
                key.clone(),
                ValidatedItem {
                    key: key.clone(),
                    id,
                    title: n.title.clone(),
                    folder_id: n.folder_id.unwrap(),
                    folders: path.clone(),
                },
            );
        }
        preview.push(Preview {
            key,
            title: n.title,
            folder: path
                .iter()
                .map(|f| f.name.as_str())
                .collect::<Vec<_>>()
                .join(" / "),
            status: status.into(),
            reason: if valid {
                String::new()
            } else {
                reason(&category).into()
            },
        });
    }
    Ok((ValidatedScan { items }, preview, scan.truncated))
}
fn current(job: &Job, expected: &Token, owner: &str) -> Result<()> {
    if job.owner != owner
        || job.token.session_id != expected.session_id
        || job.token.epoch != expected.epoch
    {
        return Err(error("source_stale", "导入任务已失效，请重新读取来源"));
    }
    Ok(())
}
fn snapshot(job: &Job) -> Result<Value> {
    let data = job
        .data
        .lock()
        .map_err(|_| error("internal", "导入状态错误"))?;
    Ok(json!(data.snapshot))
}
fn job_for(imports: &Imports, id: &str, expected: &Token, owner: &str) -> Result<Arc<Job>> {
    let job = imports
        .0
        .lock()
        .map_err(|_| error("internal", "导入状态错误"))?
        .as_ref()
        .filter(|j| j.id == id)
        .cloned()
        .ok_or_else(|| error("source_stale", "导入任务已失效"))?;
    current(&job, expected, owner)?;
    Ok(job)
}
fn fail_job(job: &Job, e: AppError) {
    if let Ok(mut data) = job.data.lock() {
        data.snapshot.phase = if job.cancelled.load(Ordering::Acquire) {
            "cancelled"
        } else {
            "error"
        }
        .into();
        data.snapshot.error = if job.cancelled.load(Ordering::Acquire) {
            reason("cancelled").into()
        } else {
            e.message
        };
    }
}
pub(crate) fn scan_job(
    expected: Token,
    owner: &str,
    imports: &Imports,
    host: Arc<dyn Host>,
    source: Arc<dyn Source>,
) -> Result<Value> {
    if owner != "main" {
        return Err(error("source_window", "请在主窗口导入"));
    }
    host.authorize(&expected)?;
    let job = Arc::new(Job {
        id: Uuid::new_v4().to_string(),
        owner: owner.into(),
        token: expected,
        cancelled: AtomicBool::new(false),
        publish: Mutex::new(()),
        data: Mutex::new(JobData {
            snapshot: Snapshot {
                id: String::new(),
                phase: "scanning".into(),
                completed: 0,
                total: 0,
                items: Vec::new(),
                results: Vec::new(),
                error: String::new(),
                truncated: false,
                commit: None,
            },
            scan: None,
        }),
    });
    job.data
        .lock()
        .map_err(|_| error("internal", "导入状态错误"))?
        .snapshot
        .id = job.id.clone();
    {
        let mut current = imports
            .0
            .lock()
            .map_err(|_| error("internal", "导入状态错误"))?;
        if current.as_ref().is_some_and(|j| {
            j.data
                .lock()
                .map(|d| {
                    matches!(
                        d.snapshot.phase.as_str(),
                        "scanning" | "preview" | "importing" | "saving" | "cancelling"
                    )
                })
                .unwrap_or(true)
        }) {
            return Err(error("source_busy", "已有导入任务正在进行"));
        }
        *current = Some(job.clone());
    }
    let worker = job.clone();
    std::thread::spawn(move || {
        let result = (|| {
            let stage = OwnedStage::new()?;
            let value = source.execute(
                json!({"version":1,"mode":"scan","maxNotes":5000}),
                &stage,
                &worker.cancelled,
            )?;
            let scan: Scan = serde_json::from_value(value)
                .map_err(|_| error("source_protocol", "来源返回格式无效"))?;
            let (validated, items, truncated) = validate_scan(scan)?;
            host.authorize(&worker.token)?;
            let _publication = worker
                .publish
                .lock()
                .map_err(|_| error("internal", "导入状态错误"))?;
            if worker.cancelled.load(Ordering::Acquire) {
                return Err(error("cancelled", reason("cancelled")));
            }
            let mut data = worker
                .data
                .lock()
                .map_err(|_| error("internal", "导入状态错误"))?;
            data.snapshot.total = items.len();
            data.snapshot.items = items;
            data.snapshot.truncated = truncated;
            data.snapshot.phase = "preview".into();
            data.scan = Some(validated);
            Ok(())
        })();
        if let Err(e) = result {
            fail_job(&worker, e);
        }
    });
    snapshot(&job)
}
pub(crate) fn status_job(
    id: &str,
    expected: &Token,
    owner: &str,
    imports: &Imports,
    host: &dyn Host,
) -> Result<Value> {
    host.authorize(expected)?;
    let job = job_for(imports, id, expected, owner)?;
    snapshot(&job)
}
pub(crate) fn cancel_job(
    id: &str,
    expected: &Token,
    owner: &str,
    imports: &Imports,
) -> Result<Value> {
    let job = job_for(imports, id, expected, owner)?;
    let _publication = job
        .publish
        .lock()
        .map_err(|_| error("internal", "导入状态错误"))?;
    let mut data = job
        .data
        .lock()
        .map_err(|_| error("internal", "导入状态错误"))?;
    if !matches!(
        data.snapshot.phase.as_str(),
        "complete" | "error" | "cancelled"
    ) {
        job.cancelled.store(true, Ordering::Release);
        data.snapshot.phase = if data.snapshot.phase == "preview" {
            "cancelled"
        } else {
            "cancelling"
        }
        .into();
        data.scan = None;
    }
    drop(data);
    snapshot(&job)
}
pub(crate) fn start_job(
    id: &str,
    keys: Vec<String>,
    expected: &Token,
    owner: &str,
    imports: &Imports,
    host: Arc<dyn Host>,
    source: Arc<dyn Source>,
) -> Result<Value> {
    host.authorize(expected)?;
    let job = job_for(imports, id, expected, owner)?;
    let selected = {
        let mut data = job
            .data
            .lock()
            .map_err(|_| error("internal", "导入状态错误"))?;
        if data.snapshot.phase != "preview" || job.cancelled.load(Ordering::Acquire) {
            return Err(error("source_stale", "来源预览已失效"));
        }
        if keys.is_empty() || keys.len() > 5000 {
            return Err(error("source_selection", "请选择要复制的备忘录"));
        }
        let mut seen = HashSet::new();
        let scan = data
            .scan
            .as_ref()
            .ok_or_else(|| error("source_stale", "来源预览已失效"))?;
        let mut selected = Vec::new();
        for key in keys {
            if !seen.insert(key.clone()) {
                return Err(error("source_selection", "选择条目重复"));
            }
            selected.push(
                scan.items
                    .get(&key)
                    .cloned()
                    .ok_or_else(|| error("source_selection", "所选条目无法复制"))?,
            );
        }
        data.snapshot.phase = "importing".into();
        data.snapshot.total = selected.len();
        data.snapshot.completed = 0;
        selected
    };
    let worker = job.clone();
    std::thread::spawn(move || {
        if let Err(e) = import_selected(host.as_ref(), source.as_ref(), &worker, selected) {
            fail_job(&worker, e);
        }
    });
    snapshot(&job)
}
fn import_selected(
    host: &dyn Host,
    source_executor: &dyn Source,
    job: &Job,
    items: Vec<ValidatedItem>,
) -> Result<()> {
    let mut source = Vec::new();
    let mut failures = Vec::new();
    let mut key_map = HashMap::new();
    let mut buffered_bytes = 0usize;
    for item in items {
        if job.cancelled.load(Ordering::Acquire) {
            return Err(error("cancelled", reason("cancelled")));
        }
        host.authorize(&job.token)?;
        let stage = OwnedStage::new()?;
        let paths = stage
            .exports
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        let result = source_executor
            .execute(
                json!({"version":1,"mode":"read","noteId":item.id,"exportPaths":paths}),
                &stage,
                &job.cancelled,
            )
            .and_then(|v| {
                serde_json::from_value::<Read>(v)
                    .map_err(|_| error("source_protocol", "来源返回格式无效"))
            })
            .and_then(|r| source_note(r, &item, &stage));
        match result {
            Ok(n) => {
                buffered_bytes = buffered_bytes
                    .checked_add(
                        n.html.len()
                            + n.plain_text.len()
                            + n.attachments.iter().map(|a| a.bytes.len()).sum::<usize>(),
                    )
                    .ok_or_else(|| error("source_limit", reason("source_limit")))?;
                if buffered_bytes > 128 * 1024 * 1024 {
                    return Err(error("source_limit", reason("source_limit")));
                }
                use sha2::{Digest, Sha256};
                key_map.insert(
                    format!("{:x}", Sha256::digest(n.id.as_bytes())),
                    item.key.clone(),
                );
                source.push(n)
            }
            Err(e) => {
                if job.cancelled.load(Ordering::Acquire) {
                    return Err(e);
                }
                failures.push(apple_import::ItemResult {
                    key: item.key,
                    status: "skipped".into(),
                    reason: e.message,
                    warnings: Vec::new(),
                    note_id: None,
                });
            }
        }
        job.data
            .lock()
            .map_err(|_| error("internal", "导入状态错误"))?
            .snapshot
            .completed += 1;
    }
    let prepared = apple_import::prepare(source)?;
    let _publication = job
        .publish
        .lock()
        .map_err(|_| error("internal", "导入状态错误"))?;
    if job.cancelled.load(Ordering::Acquire) {
        return Err(error("cancelled", reason("cancelled")));
    }
    job.data
        .lock()
        .map_err(|_| error("internal", "导入状态错误"))?
        .snapshot
        .phase = "saving".into();
    if !host.alive(&job.owner) {
        return Err(error("cancelled", reason("cancelled")));
    }
    let committed = host.append(prepared, &job.token)?;
    let mut results: Vec<apple_import::ItemResult> =
        serde_json::from_value(committed["results"].clone())
            .map_err(|_| error("internal", "导入结果无效"))?;
    for result in &mut results {
        if let Some(key) = key_map.get(&result.key) {
            result.key = key.clone();
        }
    }
    failures.extend(results);
    let mut data = job
        .data
        .lock()
        .map_err(|_| error("internal", "导入状态错误"))?;
    data.snapshot.results = failures;
    data.snapshot.phase = "complete".into();
    data.snapshot.commit = Some(committed);
    data.scan = None;
    Ok(())
}
fn source_note(read: Read, item: &ValidatedItem, stage: &OwnedStage) -> Result<SourceNote> {
    if read.version != 1 || read.status != "ok" {
        return Err(error(
            "source_read",
            reason(read.reason.as_deref().unwrap_or(&read.status)),
        ));
    }
    let body = read
        .note
        .ok_or_else(|| error("source_read", reason("unreadable")))?;
    if !body.stable
        || body.id != item.id
        || body.folder_id != item.folder_id
        || body.title != item.title
    {
        return Err(error("source_changed", reason("source_changed")));
    }
    if body.attachments.len() > 1000 {
        return Err(error("source_limit", reason("source_limit")));
    }
    let mut declared_total = 0u64;
    for a in &body.attachments {
        if a.status != "ok" {
            return Err(error(
                "source_attachment",
                reason(a.reason.as_deref().unwrap_or(&a.status)),
            ));
        }
        declared_total = declared_total
            .checked_add(stage.export_size(a.export_index)?)
            .ok_or_else(|| error("source_limit", reason("source_limit")))?;
        if declared_total > 100 * 1024 * 1024 {
            return Err(error("source_limit", reason("source_limit")));
        }
    }
    let mut media = Vec::new();
    let mut exports = HashSet::new();
    let mut remaining = 100u64 * 1024 * 1024;
    for (index, a) in body.attachments.into_iter().enumerate() {
        if a.status != "ok" {
            return Err(error(
                "source_attachment",
                reason(a.reason.as_deref().unwrap_or(&a.status)),
            ));
        }
        if a.export_index != index || !exports.insert(a.export_index) {
            return Err(error("source_protocol", "源附件顺序无效"));
        }
        let bytes = stage.read_export_bounded(a.export_index, remaining)?;
        remaining -= bytes.len() as u64;
        let name = a
            .name
            .filter(|n| !n.trim().is_empty())
            .unwrap_or_else(|| format!("附件 {}", index + 1));
        let mime = media_mime(&bytes, &name);
        media.push(SourceAttachment {
            id: a.id,
            cid: a.cid.unwrap_or_default(),
            name,
            mime,
            status: "ok".into(),
            bytes,
        });
    }
    Ok(SourceNote {
        id: format!(
            "{}\0{}",
            item.folders
                .first()
                .ok_or_else(|| error("source_invalid", reason("hierarchy_unreadable")))?
                .id,
            item.id
        ),
        folders: item.folders.clone(),
        title: body.title,
        html: body.html,
        plain_text: body.plain_text,
        created_at_ms: body.created_at_ms,
        updated_at_ms: body.updated_at_ms,
        status: "ok".into(),
        attachments: media,
    })
}
fn media_mime(bytes: &[u8], name: &str) -> String {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        "image/png"
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        "image/jpeg"
    } else if bytes.starts_with(b"%PDF-") {
        "application/pdf"
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WAVE") {
        "audio/wav"
    } else if bytes.starts_with(b"ID3") {
        "audio/mpeg"
    } else if name.to_lowercase().ends_with(".txt") {
        "text/plain"
    } else {
        "application/octet-stream"
    }
    .into()
}
pub(crate) struct OwnedStage {
    root: std::path::PathBuf,
    exports: Vec<std::path::PathBuf>,
    #[cfg(unix)]
    identity: (u64, u64),
}
impl OwnedStage {
    fn new() -> Result<Self> {
        let root = std::env::temp_dir().join(format!("notes-apple-import-{}", Uuid::new_v4()));
        std::fs::create_dir(&root).map_err(|_| error("source_stage", "无法创建私有导入暂存"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700))
                .map_err(|_| error("source_stage", "无法保护导入暂存"))?;
        }
        #[cfg(unix)]
        let identity = {
            use std::os::unix::fs::MetadataExt;
            let m = std::fs::symlink_metadata(&root)
                .map_err(|_| error("source_stage", "暂存不可读"))?;
            (m.dev(), m.ino())
        };
        let exports = (0..1000)
            .map(|_| root.join(Uuid::new_v4().to_string()))
            .collect();
        Ok(Self {
            root,
            exports,
            #[cfg(unix)]
            identity,
        })
    }
    fn intact(&self) -> bool {
        let Ok(m) = std::fs::symlink_metadata(&self.root) else {
            return false;
        };
        if !m.is_dir() || m.file_type().is_symlink() {
            return false;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if (m.dev(), m.ino()) != self.identity {
                return false;
            }
        }
        true
    }
    #[cfg(test)]
    pub(crate) fn read_export(&self, index: usize) -> Result<Vec<u8>> {
        self.read_export_bounded(index, 100 * 1024 * 1024)
    }
    fn export_size(&self, index: usize) -> Result<u64> {
        if !self.intact() {
            return Err(error("source_stage", "附件暂存已失效"));
        }
        let path = self
            .exports
            .get(index)
            .ok_or_else(|| error("source_stage", "附件暂存索引无效"))?;
        let m = std::fs::symlink_metadata(path)
            .map_err(|_| error("source_attachment", reason("export_failed")))?;
        if !m.is_file() || m.file_type().is_symlink() {
            return Err(error("source_attachment", reason("unsupported_object")));
        }
        if m.len() > 100 * 1024 * 1024 {
            return Err(error("source_limit", reason("source_limit")));
        }
        Ok(m.len())
    }
    // Admission limits for our fresh stage, not a hard quota on Notes itself.
    // An already-dispatched save may finish inside Notes after its caller exits.
    fn check_budget(&self) -> Result<()> {
        if !self.intact() {
            return Err(error("source_stage", "导入暂存已失效"));
        }
        let mut total = 0u64;
        let mut count = 0usize;
        for entry in
            std::fs::read_dir(&self.root).map_err(|_| error("source_stage", "暂存不可读"))?
        {
            count += 1;
            if count > 1002 {
                return Err(error("source_limit", reason("source_limit")));
            }
            let entry = entry.map_err(|_| error("source_stage", "暂存不可读"))?;
            let path = entry.path();
            if path == self.root.join("stdout") || path == self.root.join("stderr") {
                continue;
            }
            if !self.exports.contains(&path) {
                return Err(error("source_stage", "导出产生了不支持的暂存文件"));
            }
            let m = std::fs::symlink_metadata(&path)
                .map_err(|_| error("source_stage", "暂存不可读"))?;
            if !m.is_file() || m.file_type().is_symlink() {
                return Err(error("source_attachment", reason("unsupported_object")));
            }
            total = total
                .checked_add(m.len())
                .ok_or_else(|| error("source_limit", reason("source_limit")))?;
            if m.len() > 100 * 1024 * 1024 || total > 100 * 1024 * 1024 {
                return Err(error("source_limit", reason("source_limit")));
            }
        }
        #[cfg(unix)]
        {
            use std::os::unix::ffi::OsStrExt;
            let root = std::ffi::CString::new(self.root.as_os_str().as_bytes())
                .map_err(|_| error("source_stage", "暂存路径无效"))?;
            let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
            if unsafe { libc::statvfs(root.as_ptr(), &mut stat) } != 0 {
                return Err(error("source_stage", "无法确认磁盘剩余空间"));
            }
            let unit = if stat.f_frsize == 0 {
                stat.f_bsize
            } else {
                stat.f_frsize
            };
            if (stat.f_bavail as u128) * (unit as u128) < 512 * 1024 * 1024 {
                return Err(error(
                    "source_space",
                    "磁盘剩余空间不足512MiB，已停止本轮复制",
                ));
            }
        }
        Ok(())
    }
    fn read_export_bounded(&self, index: usize, remaining: u64) -> Result<Vec<u8>> {
        use std::io::Read;
        let path = self
            .exports
            .get(index)
            .ok_or_else(|| error("source_stage", "附件暂存索引无效"))?;
        if !self.intact() {
            return Err(error("source_stage", "附件暂存已失效"));
        }
        let m = std::fs::symlink_metadata(path)
            .map_err(|_| error("source_attachment", reason("export_failed")))?;
        if !m.is_file() || m.file_type().is_symlink() {
            return Err(error("source_attachment", reason("unsupported_object")));
        }
        if m.len() > remaining || m.len() > 100 * 1024 * 1024 {
            return Err(error("source_limit", reason("source_limit")));
        }
        let mut options = std::fs::OpenOptions::new();
        options.read(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.custom_flags(libc::O_NOFOLLOW);
        }
        let file = options
            .open(path)
            .map_err(|_| error("source_attachment", reason("export_failed")))?;
        let meta = file
            .metadata()
            .map_err(|_| error("source_attachment", reason("export_failed")))?;
        if !meta.is_file() || meta.len() != m.len() {
            return Err(error("source_stage", "附件文件发生变化"));
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if (meta.dev(), meta.ino()) != (m.dev(), m.ino()) {
                return Err(error("source_stage", "附件文件发生变化"));
            }
        }
        let mut bytes = Vec::new();
        file.take(remaining + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| error("source_attachment", reason("export_failed")))?;
        if bytes.len() as u64 != m.len() {
            return Err(error("source_attachment", reason("export_failed")));
        }
        Ok(bytes)
    }
}
impl Drop for OwnedStage {
    fn drop(&mut self) {
        if !self.intact() {
            return;
        }
        let _ = std::fs::remove_dir_all(&self.root);
    }
}
#[cfg(target_os = "macos")]
fn run_source(request: Value, stage: &OwnedStage, cancel: &AtomicBool) -> Result<Value> {
    use std::os::unix::fs::OpenOptionsExt;
    use std::{
        fs::OpenOptions,
        io::Read,
        process::{Command, Stdio},
        time::Duration,
    };
    if cancel.load(Ordering::Acquire) {
        return Err(error("cancelled", reason("cancelled")));
    }
    stage.check_budget()?;
    let output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(stage.root.join("stdout"))
        .map_err(|_| error("source_stage", "无法创建私有来源输出"))?;
    let errors = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(stage.root.join("stderr"))
        .map_err(|_| error("source_stage", "无法创建私有来源输出"))?;
    let mut child = Command::new("/usr/bin/osascript")
        .args([
            "-l",
            "JavaScript",
            "-e",
            include_str!("../apple_notes_source.js"),
        ])
        .arg(serde_json::to_string(&request)?)
        .stdin(Stdio::null())
        .stdout(Stdio::from(output))
        .stderr(Stdio::from(errors))
        .spawn()
        .map_err(|_| error("source_process", "无法启动系统备忘录读取"))?;
    let status = wait_source(&mut child, stage, cancel, Duration::from_secs(120))?;
    if !status.success() {
        return Err(error("source_process", "系统备忘录读取失败，请稍后重试"));
    }
    stage.check_budget()?;
    let file = std::fs::File::open(stage.root.join("stdout"))
        .map_err(|_| error("source_protocol", "来源返回不可读"))?;
    let mut bytes = Vec::new();
    file.take(24 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| error("source_protocol", "来源返回不可读"))?;
    if bytes.len() > 24 * 1024 * 1024 {
        return Err(error("source_limit", reason("source_limit")));
    }
    serde_json::from_slice(&bytes).map_err(|_| error("source_protocol", "来源返回格式无效"))
}
#[cfg(target_os = "macos")]
fn wait_source(
    child: &mut std::process::Child,
    stage: &OwnedStage,
    cancel: &AtomicBool,
    timeout: std::time::Duration,
) -> Result<std::process::ExitStatus> {
    use std::time::{Duration, Instant};
    let start = Instant::now();
    loop {
        if let Err(error) = stage.check_budget() {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
        if std::fs::metadata(stage.root.join("stdout")).is_ok_and(|m| m.len() > 24 * 1024 * 1024)
            || std::fs::metadata(stage.root.join("stderr")).is_ok_and(|m| m.len() > 64 * 1024)
        {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error("source_limit", reason("source_limit")));
        }
        if cancel.load(Ordering::Acquire) || start.elapsed() > timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error(
                if cancel.load(Ordering::Acquire) {
                    "cancelled"
                } else {
                    "source_timeout"
                },
                reason(if cancel.load(Ordering::Acquire) {
                    "cancelled"
                } else {
                    "timeout"
                }),
            ));
        }
        match child.try_wait() {
            Ok(Some(s)) => return Ok(s),
            Ok(None) => std::thread::sleep(Duration::from_millis(30)),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error("source_process", "系统备忘录读取中断"));
            }
        }
    }
}
#[cfg(not(target_os = "macos"))]
fn run_source(_: Value, _: &OwnedStage, _: &AtomicBool) -> Result<Value> {
    Err(error("unsupported", "此功能仅支持Mac"))
}
pub(crate) fn destroyed(imports: &Imports, owner: &str) {
    if let Ok(current) = imports.0.lock() {
        if let Some(job) = current.as_ref().filter(|j| j.owner == owner) {
            job.cancelled.store(true, Ordering::Release);
        }
    }
}
#[cfg(test)]
#[path = "../apple_notes_import/tests.rs"]
mod tests;
