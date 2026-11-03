//! Version-1 workspace archives. Publish immutable files before atomically
//! publishing their database references; a durable journal reclaims only files
//! that are not referenced after SQLite crash recovery.
use super::*;
#[path = "archive/document.rs"]
mod document;
pub(super) fn validate_live_document(
    doc: &Value,
    note: &Note,
    attachments: &[Attachment],
) -> Result<()> {
    let by_id = attachments.iter().map(|a| (a.id.as_str(), a)).collect();
    document::validate_document(doc, note, &by_id)
}
use document::validate_document;
use serde::de::{DeserializeSeed, MapAccess, SeqAccess, Visitor};
use std::{
    collections::{HashMap, HashSet},
    fs::{File, OpenOptions},
    io::{Read, Write},
};

const MAX_ARCHIVE: u64 = 256 * 1024 * 1024;
const MAX_ATTACHMENT: u64 = 100 * 1024 * 1024;
const MAX_DECODED: u64 = 128 * 1024 * 1024;
const MAX_ENTITIES: usize = 10_000;
const MAX_JOURNAL: u64 = 2 * 1024 * 1024;
const MAX_JSON_VALUES: usize = 500_000;

// A bounded, streaming value walk precedes typed deserialization. A small
// JSON file containing millions of tiny values must not expand into unbounded
// serde_json::Value allocations before the entity limits can be checked.
struct JsonBudget<'a> {
    values: &'a mut usize,
    depth: usize,
}
impl<'de> DeserializeSeed<'de> for JsonBudget<'_> {
    type Value = ();
    fn deserialize<D: serde::Deserializer<'de>>(self, de: D) -> std::result::Result<(), D::Error> {
        *self.values += 1;
        if *self.values > MAX_JSON_VALUES || self.depth > 120 {
            return Err(serde::de::Error::custom(
                "archive_limit: JSON 值数量或层级超限",
            ));
        }
        de.deserialize_any(self)
    }
}
impl<'de> Visitor<'de> for JsonBudget<'_> {
    type Value = ();
    fn expecting(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("bounded archive JSON")
    }
    fn visit_bool<E: serde::de::Error>(self, _: bool) -> std::result::Result<(), E> {
        Ok(())
    }
    fn visit_i64<E: serde::de::Error>(self, _: i64) -> std::result::Result<(), E> {
        Ok(())
    }
    fn visit_u64<E: serde::de::Error>(self, _: u64) -> std::result::Result<(), E> {
        Ok(())
    }
    fn visit_f64<E: serde::de::Error>(self, _: f64) -> std::result::Result<(), E> {
        Ok(())
    }
    fn visit_str<E: serde::de::Error>(self, _: &str) -> std::result::Result<(), E> {
        Ok(())
    }
    fn visit_unit<E: serde::de::Error>(self) -> std::result::Result<(), E> {
        Ok(())
    }
    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> std::result::Result<(), A::Error> {
        while seq
            .next_element_seed(JsonBudget {
                values: &mut *self.values,
                depth: self.depth + 1,
            })?
            .is_some()
        {}
        Ok(())
    }
    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> std::result::Result<(), A::Error> {
        while let Some(key) = map.next_key::<std::borrow::Cow<'de, str>>()? {
            if key.len() > 4096 {
                return Err(serde::de::Error::custom("archive_limit: JSON 字段名称超限"));
            }
            map.next_value_seed(JsonBudget {
                values: &mut *self.values,
                depth: self.depth + 1,
            })?;
        }
        Ok(())
    }
}
fn validate_json_budget(bytes: &[u8]) -> Result<()> {
    let mut values = 0;
    let mut de = serde_json::Deserializer::from_slice(bytes);
    JsonBudget {
        values: &mut values,
        depth: 0,
    }
    .deserialize(&mut de)
    .map_err(|e| {
        if e.to_string().starts_with("archive_limit:") {
            limit(e.to_string())
        } else {
            invalid(format!("归档 JSON 无效: {e}"))
        }
    })?;
    de.end()
        .map_err(|e| invalid(format!("归档 JSON 无效: {e}")))
}

#[derive(Serialize, Deserialize)]
struct Archive {
    version: u32,
    folders: Vec<Folder>,
    notes: Vec<Note>,
    attachments: Vec<Attachment>,
    settings: Value,
    blobs: HashMap<String, String>,
}
#[derive(Serialize, Deserialize)]
struct ImportJournal {
    version: u32,
    id: String,
    paths: Vec<String>,
}
struct ImportPlan {
    archive: Archive,
    files: Vec<Vec<u8>>,
}
fn invalid(message: impl Into<String>) -> AppError {
    err("archive_invalid", message)
}
fn limit(message: impl Into<String>) -> AppError {
    err("archive_limit", message)
}
fn read_limited(path: &Path, max: u64) -> Result<Vec<u8>> {
    let file = File::open(path)?;
    if file.metadata()?.len() > max {
        return Err(limit(format!(
            "归档文件超过 {} MiB 上限",
            max / 1024 / 1024
        )));
    }
    let mut bytes = Vec::new();
    file.take(max + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > max {
        return Err(limit("文件在读取过程中超出大小上限"));
    }
    Ok(bytes)
}
fn sync_dir(path: &Path) -> Result<()> {
    #[cfg(unix)]
    File::open(path)?.sync_all()?;
    Ok(())
}
fn write_new(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}
fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value.trim() == value
        && !value.chars().any(char::is_control)
}
fn unique_ids<'a>(values: impl Iterator<Item = &'a str>, label: &str) -> Result<()> {
    let mut seen = HashSet::new();
    for value in values {
        if !valid_id(value) || !seen.insert(value) {
            return Err(invalid(format!("{label} ID 无效或重复")));
        }
    }
    Ok(())
}
fn validate_folders(folders: &[Folder]) -> Result<()> {
    unique_ids(folders.iter().map(|f| f.id.as_str()), "文件夹")?;
    let by_id: HashMap<_, _> = folders.iter().map(|f| (f.id.as_str(), f)).collect();
    for (id, kind) in [
        ("default", "default"),
        ("quick", "quick"),
        ("trash", "trash"),
    ] {
        let f = by_id.get(id).ok_or_else(|| invalid("缺少系统文件夹"))?;
        if f.kind != kind || f.parent_id.is_some() {
            return Err(invalid("系统文件夹身份或层级无效"));
        }
    }
    for f in folders {
        if f.name.trim().is_empty() || f.name.len() > 4096 {
            return Err(invalid("文件夹名称无效"));
        }
        if !["default", "quick", "trash"].contains(&f.id.as_str()) && f.kind != "normal" {
            return Err(invalid("未知文件夹类型"));
        }
        let mut cursor = f.parent_id.as_deref();
        let mut ancestors = HashSet::from([f.id.as_str()]);
        while let Some(id) = cursor {
            if !ancestors.insert(id) {
                return Err(invalid("文件夹树包含循环"));
            }
            cursor = by_id
                .get(id)
                .ok_or_else(|| invalid("文件夹父引用不存在"))?
                .parent_id
                .as_deref();
        }
    }
    Ok(())
}
fn validate_settings(settings: &Value) -> Result<()> {
    let object = settings
        .as_object()
        .ok_or_else(|| invalid("归档设置必须是对象"))?;
    for (key, choices) in [
        ("theme", &["system", "light", "dark"][..]),
        ("view", &["list", "gallery"][..]),
        ("sort", &["updated", "created", "title"][..]),
    ] {
        if let Some(value) = object.get(key) {
            if !choices.contains(&value.as_str().unwrap_or("")) {
                return Err(invalid(format!("设置 {key} 无效")));
            }
        }
    }
    for key in ["sidebarWidth", "listWidth"] {
        if let Some(value) = object.get(key) {
            if !value.as_f64().is_some_and(|n| (32.0..=4096.0).contains(&n)) {
                return Err(invalid(format!("设置 {key} 无效")));
            }
        }
    }
    if object.get("groupDates").is_some_and(|v| !v.is_boolean()) {
        return Err(invalid("日期分组设置无效"));
    }
    for key in ["selectedFolder", "selectedNote"] {
        if object
            .get(key)
            .is_some_and(|v| v.as_str().is_none_or(|s| s.len() > 128))
        {
            return Err(invalid(format!("设置 {key} 无效")));
        }
    }
    Ok(())
}
fn validate_graph(folders: &[Folder], notes: &[Note], attachments: &[Attachment]) -> Result<()> {
    validate_folders(folders)?;
    unique_ids(notes.iter().map(|n| n.id.as_str()), "笔记")?;
    unique_ids(attachments.iter().map(|a| a.id.as_str()), "附件")?;
    let fids: HashSet<_> = folders.iter().map(|f| f.id.as_str()).collect();
    let nids: HashMap<_, _> = notes.iter().map(|n| (n.id.as_str(), n)).collect();
    let aids: HashMap<_, _> = attachments.iter().map(|a| (a.id.as_str(), a)).collect();
    let mut paths = HashSet::new();
    for a in attachments {
        if !paths.insert(a.relative_path.as_str()) {
            return Err(invalid("附件路径重复"));
        }
        let n = nids
            .get(a.note_id.as_str())
            .ok_or_else(|| invalid("附件所属笔记不存在"))?;
        if n.locked {
            return Err(invalid("此版本不支持含附件的锁定笔记"));
        }
        let kind = if a.mime.starts_with("image/") {
            "image"
        } else if a.mime.starts_with("audio/") {
            "audio"
        } else if a.mime.starts_with("video/") {
            "video"
        } else {
            "file"
        };
        if a.kind != kind
            || a.mime.is_empty()
            || a.mime.len() > 256
            || a.display_name.is_empty()
            || a.display_name.len() > 4096
        {
            return Err(invalid("附件类型或名称无效"));
        }
    }
    for n in notes {
        if !fids.contains(n.folder_id.as_str()) {
            return Err(invalid("笔记所属文件夹不存在"));
        }
        if n.revision < 0 || n.deleted_at.is_some() != (n.folder_id == "trash") {
            return Err(invalid("笔记版本或删除状态无效"));
        }
        if ![
            "plain",
            "lines-small",
            "lines-medium",
            "lines-large",
            "grid-small",
            "grid-medium",
            "grid-large",
        ]
        .contains(&n.paper_style.as_str())
        {
            return Err(invalid("未知纸张样式"));
        }
        if n.locked {
            let sealed = n
                .sealed
                .as_ref()
                .ok_or_else(|| invalid("锁定笔记缺少密文"))?;
            for (key, size) in [
                ("salt", Some(16)),
                ("nonce", Some(12)),
                ("ciphertext", None),
            ] {
                let bytes = B64
                    .decode(
                        sealed[key]
                            .as_str()
                            .ok_or_else(|| invalid("锁定笔记密文无效"))?,
                    )
                    .map_err(|_| invalid("锁定笔记密文编码无效"))?;
                if size.is_some_and(|s| bytes.len() != s)
                    || (key == "ciphertext" && bytes.len() < 16)
                {
                    return Err(invalid("锁定笔记密文长度无效"));
                }
            }
            if !n.plain_text.is_empty() || !doc_text(&n.document).is_empty() {
                return Err(invalid("锁定笔记含未保护的正文"));
            }
        } else if n.sealed.is_some() {
            return Err(invalid("未锁定笔记带有无效密文"));
        }
        validate_document(&n.document, n, &aids)?;
    }
    Ok(())
}
fn remap_document(doc: &mut Value, ids: &HashMap<String, String>) {
    if doc["type"] == "attachment" {
        if let Some(id) = doc["attrs"]["id"].as_str().and_then(|id| ids.get(id)) {
            doc["attrs"]["id"] = json!(id);
        }
    }
    if let Some(children) = doc.get_mut("content").and_then(Value::as_array_mut) {
        for child in children {
            remap_document(child, ids);
        }
    }
}
fn copy_ids<'a>(
    source: impl Iterator<Item = &'a str>,
    existing: impl Iterator<Item = &'a str>,
) -> HashMap<String, String> {
    let mut used: HashSet<String> = existing.map(str::to_string).collect();
    source
        .map(|old| {
            let mut next = old.to_string();
            while !used.insert(next.clone()) {
                next = id();
            }
            (old.to_string(), next)
        })
        .collect()
}

impl Store {
    fn prepare_archive(&self, mut archive: Archive, transaction_id: &str) -> Result<ImportPlan> {
        if archive.version != 1 {
            return Err(invalid("不支持此备份版本"));
        }
        if archive.folders.len() + archive.notes.len() + archive.attachments.len() > MAX_ENTITIES {
            return Err(limit("归档实体超过 10,000 项上限"));
        }
        validate_graph(&archive.folders, &archive.notes, &archive.attachments)?;
        validate_settings(&archive.settings)?;
        if archive.blobs.len() != archive.attachments.len() {
            return Err(invalid("归档附件内容与元数据数量不符"));
        }
        let mut total = 0u64;
        for a in &archive.attachments {
            self.attachment_path(&a.relative_path)?;
            if a.size > MAX_ATTACHMENT {
                return Err(limit("单附件超过 100 MiB 上限"));
            }
            total = total
                .checked_add(a.size)
                .ok_or_else(|| limit("附件总量超限"))?;
            if total > MAX_DECODED {
                return Err(limit("解码附件总量超过 128 MiB 上限"));
            }
        }
        let mut files = Vec::with_capacity(archive.attachments.len());
        for a in &archive.attachments {
            let encoded = archive
                .blobs
                .get(&a.id)
                .ok_or_else(|| invalid("附件内容缺失"))?;
            if encoded.len() as u64 > MAX_ATTACHMENT.div_ceil(3) * 4 {
                return Err(limit("附件编码内容超限"));
            }
            let bytes = B64
                .decode(encoded)
                .map_err(|_| invalid("附件 Base64 内容无效"))?;
            if bytes.len() as u64 != a.size {
                return Err(invalid("附件声明大小与内容不符"));
            }
            files.push(bytes);
        }
        // Build an independent imported copy on collision, rather than replacing
        // an unrelated local revision or the files it references.
        let existing_folders = self.folders()?;
        let existing_notes = self.notes()?;
        let existing_attachments = self.attachments()?;
        let folder_ids = copy_ids(
            archive
                .folders
                .iter()
                .filter(|f| f.kind == "normal")
                .map(|f| f.id.as_str()),
            existing_folders.iter().map(|f| f.id.as_str()),
        );
        let note_ids = copy_ids(
            archive.notes.iter().map(|n| n.id.as_str()),
            existing_notes.iter().map(|n| n.id.as_str()),
        );
        let attachment_ids = copy_ids(
            archive.attachments.iter().map(|a| a.id.as_str()),
            existing_attachments.iter().map(|a| a.id.as_str()),
        );
        let map_folder = |old: &str| {
            folder_ids
                .get(old)
                .cloned()
                .unwrap_or_else(|| old.to_string())
        };
        for f in &mut archive.folders {
            f.id = map_folder(&f.id);
            f.parent_id = f.parent_id.as_deref().map(map_folder);
        }
        for n in &mut archive.notes {
            n.id = note_ids[&n.id].clone();
            n.folder_id = map_folder(&n.folder_id);
            n.original_folder_id = n.original_folder_id.as_deref().map(map_folder);
            remap_document(&mut n.document, &attachment_ids);
        }
        for a in &mut archive.attachments {
            a.id = attachment_ids[&a.id].clone();
            a.note_id = note_ids[&a.note_id].clone();
            a.relative_path = format!("{transaction_id}-{}.blob", id());
        }
        if let Some(selected) = archive
            .settings
            .get("selectedFolder")
            .and_then(Value::as_str)
        {
            let next = map_folder(selected);
            archive.settings["selectedFolder"] = json!(if next == "all"
                || archive.folders.iter().any(|f| f.id == next)
                || existing_folders.iter().any(|f| f.id == next)
            {
                next
            } else {
                "default".into()
            });
        }
        if let Some(selected) = archive.settings.get("selectedNote").and_then(Value::as_str) {
            let next = note_ids
                .get(selected)
                .cloned()
                .unwrap_or_else(|| selected.to_string());
            archive.settings["selectedNote"] = json!(if archive.notes.iter().any(|n| n.id == next)
                || existing_notes.iter().any(|n| n.id == next)
            {
                next
            } else {
                String::new()
            });
        }
        let mut effective_folders = existing_folders;
        effective_folders.extend(
            archive
                .folders
                .iter()
                .filter(|f| f.kind == "normal")
                .cloned(),
        );
        let mut effective_notes = existing_notes;
        effective_notes.extend(archive.notes.iter().cloned());
        let mut effective_attachments = existing_attachments;
        effective_attachments.extend(archive.attachments.iter().cloned());
        validate_graph(&effective_folders, &effective_notes, &effective_attachments)?;
        // Base64 data is no longer needed once all bytes were validated.
        archive.blobs.clear();
        Ok(ImportPlan { archive, files })
    }

    pub fn export_archive(&self, path: &Path) -> Result<()> {
        let folders = self.folders()?;
        let notes = self.notes()?;
        let attachments = self.attachments()?;
        if folders.len() + notes.len() + attachments.len() > MAX_ENTITIES {
            return Err(limit("归档实体超过 10,000 项上限"));
        }
        validate_graph(&folders, &notes, &attachments)?;
        let mut total = 0u64;
        let mut blobs = HashMap::new();
        for a in &attachments {
            total = total
                .checked_add(a.size)
                .ok_or_else(|| limit("附件总量超限"))?;
            if a.size > MAX_ATTACHMENT || total > MAX_DECODED {
                return Err(limit("附件超过归档大小上限"));
            }
            let bytes = read_limited(&self.attachment_path(&a.relative_path)?, MAX_ATTACHMENT)?;
            if bytes.len() as u64 != a.size {
                return Err(invalid("本地附件大小与元数据不符"));
            }
            blobs.insert(a.id.clone(), B64.encode(bytes));
        }
        let settings: String =
            self.db
                .query_row("SELECT body FROM settings WHERE id=1", [], |r| r.get(0))?;
        let archive = Archive {
            version: 1,
            folders,
            notes,
            attachments,
            settings: serde_json::from_str(&settings)?,
            blobs,
        };
        validate_settings(&archive.settings)?;
        let bytes = serde_json::to_vec(&archive)?;
        if bytes.len() as u64 > MAX_ARCHIVE {
            return Err(limit("归档超过 256 MiB 上限"));
        }
        validate_json_budget(&bytes)?;
        let parent = path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."));
        // Never allow the file picker to replace this application's live store.
        let canonical_parent = parent.canonicalize()?;
        let live_root = self.root.canonicalize()?;
        let reserved_database = canonical_parent == live_root
            && path.file_name().is_some_and(|n| {
                ["notes.sqlite3", "notes.sqlite3-wal", "notes.sqlite3-shm"]
                    .iter()
                    .any(|reserved| n.to_string_lossy().eq_ignore_ascii_case(reserved))
            });
        if reserved_database
            || canonical_parent.starts_with(live_root.join("attachments"))
            || canonical_parent.starts_with(live_root.join(".imports"))
        {
            return Err(invalid("备份目标不能替换应用数据库或受管附件"));
        }
        let temporary = parent.join(format!(".notes-export-{}.tmp", id()));
        let result: Result<()> = (|| {
            write_new(&temporary, &bytes)?;
            fs::rename(&temporary, path)?;
            Ok(())
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result
    }

    pub fn import_archive(&mut self, path: &Path) -> Result<()> {
        let bytes = read_limited(path, MAX_ARCHIVE)?;
        validate_json_budget(&bytes)?;
        let archive: Archive =
            serde_json::from_slice(&bytes).map_err(|e| invalid(format!("归档格式无效: {e}")))?;
        drop(bytes);
        let transaction_id = id();
        let plan = self.prepare_archive(archive, &transaction_id)?;
        self.recover_imports()?;
        let imports = self.root.join(".imports");
        fs::create_dir_all(&imports)?;
        sync_dir(&self.root)?;
        let staging = imports.join(&transaction_id);
        fs::create_dir(&staging)?;
        let journal = ImportJournal {
            version: 1,
            id: transaction_id,
            paths: plan
                .archive
                .attachments
                .iter()
                .map(|a| a.relative_path.clone())
                .collect(),
        };
        let result: Result<()> = (|| {
            for (a, data) in plan.archive.attachments.iter().zip(&plan.files) {
                write_new(&staging.join(&a.relative_path), data)?;
            }
            import_checkpoint("staging");
            write_new(&staging.join("journal.tmp"), &serde_json::to_vec(&journal)?)?;
            fs::rename(staging.join("journal.tmp"), staging.join("journal.json"))?;
            sync_dir(&staging)?;
            sync_dir(&imports)?;
            import_checkpoint("journal");
            for (index, a) in plan.archive.attachments.iter().enumerate() {
                // hard_link atomically refuses existing destinations, unlike a
                // replacing rename. The staged inode has already been fsynced.
                fs::hard_link(
                    staging.join(&a.relative_path),
                    self.attachment_path(&a.relative_path)?,
                )?;
                if index == 0 {
                    import_checkpoint("first_file");
                }
            }
            sync_dir(&self.root.join("attachments"))?;
            import_checkpoint("files");
            let tx = self.db.transaction()?;
            for f in &plan.archive.folders {
                tx.execute(
                    "INSERT OR IGNORE INTO folders(id,body)VALUES(?1,?2)",
                    params![f.id, serde_json::to_string(f)?],
                )?;
            }
            for n in &plan.archive.notes {
                tx.execute(
                    "INSERT INTO notes(id,folder_id,body,revision)VALUES(?1,?2,?3,?4)",
                    params![n.id, n.folder_id, serde_json::to_string(n)?, n.revision],
                )?;
            }
            for a in &plan.archive.attachments {
                tx.execute(
                    "INSERT INTO attachments(id,note_id,body)VALUES(?1,?2,?3)",
                    params![a.id, a.note_id, serde_json::to_string(a)?],
                )?;
            }
            tx.execute(
                "UPDATE settings SET body=?1 WHERE id=1",
                [serde_json::to_string(&plan.archive.settings)?],
            )?;
            import_checkpoint("before_commit");
            tx.commit()?;
            import_checkpoint("after_commit");
            Ok(())
        })();
        if result.is_ok() {
            self.keys.clear();
        }
        // Recovery consults committed DB references. It is safe on both sides
        // of commit, including after a process died without dropping its tx.
        if let Err(cleanup) = self.recover_imports() {
            if let Err(original) = result {
                return Err(err(
                    "archive_recovery",
                    format!("{}；暂存清理待恢复：{}", original.message, cleanup.message),
                ));
            }
            eprintln!("Archive committed; cleanup deferred ({})", cleanup.code);
            return Ok(());
        }
        result
    }

    pub(super) fn recover_imports(&self) -> Result<()> {
        let imports = self.root.join(".imports");
        if !imports.try_exists()? {
            return Ok(());
        }
        let referenced: HashSet<_> = self
            .attachments()?
            .into_iter()
            .map(|a| a.relative_path)
            .collect();
        for entry in fs::read_dir(&imports)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if !entry.file_type()?.is_dir() || Uuid::parse_str(&name).is_err() {
                return Err(err(
                    "archive_recovery",
                    "导入暂存目录无效，未清理任何未知文件",
                ));
            }
            let directory = entry.path();
            let journal_path = directory.join("journal.json");
            if journal_path.try_exists()? {
                let journal: ImportJournal =
                    serde_json::from_slice(&read_limited(&journal_path, MAX_JOURNAL)?)
                        .map_err(|_| err("archive_recovery", "导入恢复日志损坏"))?;
                if journal.version != 1 || journal.id != name || journal.paths.len() > MAX_ENTITIES
                {
                    return Err(err("archive_recovery", "导入恢复日志身份无效"));
                }
                // Validate every entry before touching any production file.
                for path in &journal.paths {
                    let suffix = path
                        .strip_prefix(&format!("{name}-"))
                        .and_then(|p| p.strip_suffix(".blob"));
                    if suffix.is_none_or(|s| Uuid::parse_str(s).is_err()) {
                        return Err(err("archive_recovery", "导入恢复日志包含非本次事务路径"));
                    }
                    self.attachment_path(path)?;
                }
                for path in &journal.paths {
                    if !referenced.contains(path) {
                        match fs::remove_file(self.attachment_path(path)?) {
                            Ok(()) => {}
                            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                            Err(e) => return Err(e.into()),
                        }
                    }
                }
                sync_dir(&self.root.join("attachments"))?;
            }
            // No journal means publication never started, so only staging can
            // exist. A valid journal's referenced live files are never removed.
            fs::remove_dir_all(&directory)?;
            sync_dir(&imports)?;
        }
        Ok(())
    }
}

#[cfg(not(test))]
fn import_checkpoint(_: &str) {}
#[cfg(test)]
fn import_checkpoint(stage: &str) {
    if std::env::var("NOTES_TEST_ARCHIVE_CRASH").as_deref() == Ok(stage) {
        // exit bypasses Rust destructors. SQLite must recover the transaction
        // when the real subprocess test reopens the store.
        std::process::exit(77);
    }
}

#[cfg(test)]
#[path = "archive/tests.rs"]
mod tests;
