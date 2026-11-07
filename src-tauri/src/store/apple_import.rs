//! Copy-only source import. Raw records are internal managed file attachments,
//! so byte accounting, backups, owner remapping, purge and synchronization use
//! the existing attachment lifecycle. There is no independent success ledger.
use super::*;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, HashSet};
#[path = "apple_import/html.rs"]
mod html;
const RAW_MIME: &str = "application/vnd.local-notes.apple-import+json";
fn fail(code: &str, message: &str) -> AppError {
    err(code, message)
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SourceFolder {
    pub id: String,
    pub name: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SourceAttachment {
    pub id: String,
    pub cid: String,
    pub name: String,
    pub mime: String,
    pub status: String,
    #[serde(skip)]
    pub bytes: Vec<u8>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SourceNote {
    pub id: String,
    /// Account first, then each physical folder. Host adapter resolves ancestry.
    pub folders: Vec<SourceFolder>,
    pub title: String,
    pub html: String,
    pub plain_text: String,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    pub status: String,
    pub attachments: Vec<SourceAttachment>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ItemResult {
    pub key: String,
    pub status: String,
    pub reason: String,
    pub warnings: Vec<String>,
    pub note_id: Option<String>,
}
pub(crate) struct PreparedBatch {
    notes: Vec<PreparedNote>,
    pub results: Vec<ItemResult>,
}
struct PreparedNote {
    source: String,
    fingerprint: String,
    folders: Vec<SourceFolder>,
    note: Note,
    attachments: Vec<Attachment>,
    files: HashMap<String, String>,
    warnings: Vec<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RawRecord {
    version: u32,
    source_key: String,
    fingerprint: String,
    snapshot: Value,
}
impl RawRecord {
    fn valid(&self) -> bool {
        if self.version != 1
            || ![&self.source_key, &self.fingerprint]
                .iter()
                .all(|s| s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit()))
        {
            return false;
        }
        let mut content = self.snapshot.clone();
        let Some(object) = content.as_object_mut() else {
            return false;
        };
        object.remove("createdAtMs");
        object.remove("updatedAtMs");
        serde_json::to_vec(&content).is_ok_and(|bytes| hash(&bytes) == self.fingerprint)
    }
}
fn status_reason(status: &str) -> &'static str {
    match status {
        "locked" => "源备忘录已锁定",
        "export_failed" => "源附件无法导出",
        "unsupported_object" => "源对象暂不支持完整复制",
        "unreadable" => "源备忘录无法读取",
        _ => "源数据不完整",
    }
}
fn prepare_one(source: SourceNote) -> Result<PreparedNote> {
    if source.status != "ok" {
        return Err(fail("source_unreadable", status_reason(&source.status)));
    }
    if source.id.is_empty()
        || source.id.len() > 4096
        || source.folders.is_empty()
        || source.folders.len() > 64
        || source.title.len() > 4096
        || source.plain_text.len() > 8 * 1024 * 1024
        || source.created_at_ms < 0
        || source.updated_at_ms < 0
        || source.created_at_ms > MAX_RECORDED_AT as i64
        || source.updated_at_ms > MAX_RECORDED_AT as i64
        || source.attachments.len() > 1000
    {
        return Err(fail("source_invalid", "源元数据无效或超过上限"));
    }
    let mut folder_ids = HashSet::new();
    for f in &source.folders {
        if f.id.is_empty()
            || f.id.len() > 4096
            || f.name.trim().is_empty()
            || f.name.len() > 4096
            || !folder_ids.insert(&f.id)
        {
            return Err(fail("source_invalid", "源文件夹层次无效"));
        }
    }
    let nid = id();
    let mut attachments = Vec::new();
    let mut files = HashMap::new();
    let mut media = BTreeMap::new();
    let mut attachment_metadata = Vec::new();
    let mut seen = HashSet::new();
    let mut total = 0usize;
    for a in &source.attachments {
        if a.status != "ok" {
            return Err(fail("source_attachment", status_reason(&a.status)));
        }
        total = total
            .checked_add(a.bytes.len())
            .ok_or_else(|| fail("source_limit", "源附件过大"))?;
        if a.id.is_empty()
            || a.id.len() > 4096
            || !seen.insert(&a.id)
            || a.name.is_empty()
            || a.name.len() > 4096
            || a.mime.is_empty()
            || a.mime.len() > 256
            || a.bytes.len() > 100 * 1024 * 1024
            || total > 100 * 1024 * 1024
            || a.cid.len() > 8192
        {
            return Err(fail("source_attachment", "源附件无效或超过上限"));
        }
        let aid = id();
        let kind = if a.mime.starts_with("image/") {
            "image"
        } else if a.mime.starts_with("audio/") {
            "audio"
        } else if a.mime.starts_with("video/") {
            "video"
        } else {
            "file"
        };
        let attachment = Attachment {
            id: aid.clone(),
            note_id: nid.clone(),
            kind: kind.into(),
            relative_path: format!("{}.blob", id()),
            mime: a.mime.clone(),
            display_name: a.name.clone(),
            size: a.bytes.len() as u64,
            recorded_at: None,
        };
        // Empty CIDs still retain each attachment at the end, without inventing
        // an inline location. Reject ambiguous nonempty CIDs.
        let key = if a.cid.is_empty() {
            format!("unplaced:{}", hash(a.id.as_bytes()))
        } else {
            a.cid.trim_start_matches("cid:").into()
        };
        if media.insert(key, attachment.clone()).is_some() {
            return Err(fail("source_attachment", "源附件标识重复"));
        }
        attachment_metadata.push(json!({"key":hash(a.id.as_bytes()),"cid":a.cid,"name":a.name,"mime":a.mime,"size":a.bytes.len(),"sha256":hash(&a.bytes)}));
        files.insert(aid, B64.encode(&a.bytes));
        attachments.push(attachment);
    }
    let (document, warnings) = html::convert(&source.html, &media, &attachments)?;
    let source_key = hash(source.id.as_bytes());
    let snapshot = json!({"title":source.title,"html":source.html,"plainText":source.plain_text,"createdAtMs":source.created_at_ms,"updatedAtMs":source.updated_at_ms,"folders":source.folders.iter().map(|f|json!({"key":hash(f.id.as_bytes()),"name":f.name})).collect::<Vec<_>>(),"attachments":attachment_metadata});
    // Dates are retained, but maintenance-only date changes do not duplicate
    // identical content. Ordered media hashes, inline CIDs and hierarchy count.
    let mut content = snapshot.clone();
    content.as_object_mut().unwrap().remove("createdAtMs");
    content.as_object_mut().unwrap().remove("updatedAtMs");
    let fingerprint = hash(&serde_json::to_vec(&content)?);
    let raw = serde_json::to_vec(&RawRecord {
        version: 1,
        source_key: source_key.clone(),
        fingerprint: fingerprint.clone(),
        snapshot,
    })?;
    if raw.len() > 16 * 1024 * 1024 {
        return Err(fail(
            "source_limit",
            "单条原始记录超过16MiB，请分批或缩小源内容",
        ));
    }
    let raw_id = id();
    let raw_attachment = Attachment {
        id: raw_id.clone(),
        note_id: nid.clone(),
        kind: "file".into(),
        relative_path: format!("{}.json", id()),
        mime: RAW_MIME.into(),
        display_name: "Apple 备忘录原始记录.json".into(),
        size: raw.len() as u64,
        recorded_at: None,
    };
    // The serialized reference is an internal ownership edge required by the
    // existing strict backup/sync format. Store::visible projects it out before
    // any editor or user attachment surface receives this note.
    let mut document = document;
    document["content"].as_array_mut().unwrap().push(json!({"type":"attachment","attrs":{"id":raw_id,"kind":"file","name":raw_attachment.display_name}}));
    files.insert(raw_attachment.id.clone(), B64.encode(raw));
    attachments.push(raw_attachment);
    let note = Note {
        id: nid,
        folder_id: String::new(),
        document,
        title: source.title,
        plain_text: source.plain_text,
        created_at: source.created_at_ms,
        updated_at: source.updated_at_ms,
        pinned: false,
        deleted_at: None,
        original_folder_id: None,
        locked: false,
        paper_style: "plain".into(),
        revision: 0,
        sealed: None,
    };
    archive::validate_live_document(&note.document, &note, &attachments)?;
    Ok(PreparedNote {
        source: source_key,
        fingerprint,
        folders: source.folders,
        note,
        attachments,
        files,
        warnings,
    })
}
pub(crate) fn prepare(notes: Vec<SourceNote>) -> Result<PreparedBatch> {
    if notes.len() > 5000 {
        return Err(fail("source_limit", "单次最多复制5000条备忘录"));
    }
    let mut batch = PreparedBatch {
        notes: Vec::new(),
        results: Vec::new(),
    };
    let mut total = 0u64;
    for note in notes {
        let key = hash(note.id.as_bytes());
        match prepare_one(note) {
            Ok(note) => {
                total = total
                    .checked_add(note.attachments.iter().map(|a| a.size).sum::<u64>())
                    .ok_or_else(|| fail("source_limit", "本轮源附件过大"))?;
                if total > 120 * 1024 * 1024 {
                    return Err(fail("source_limit", "本轮源附件超过120MiB，请分批导入"));
                }
                batch.notes.push(note);
            }
            Err(e) => batch.results.push(ItemResult {
                key,
                status: "skipped".into(),
                reason: e.message,
                warnings: Vec::new(),
                note_id: None,
            }),
        }
    }
    Ok(batch)
}
impl Store {
    /// Verify only candidates actually owned by this note. The declared size
    /// bounds IO before opening a file; filename alone never identifies a record.
    pub(super) fn internal_import_ids(
        &self,
        note: &Note,
        attachments: &[Attachment],
    ) -> HashSet<String> {
        attachments
            .iter()
            .filter(|a| {
                a.note_id == note.id
                    && a.kind == "file"
                    && a.mime == RAW_MIME
                    && a.size <= 16 * 1024 * 1024
                    && self
                        .managed_attachment_bytes(a)
                        .ok()
                        .and_then(|b| serde_json::from_slice::<RawRecord>(&b).ok())
                        .is_some_and(|raw| raw.valid())
            })
            .map(|a| a.id.clone())
            .collect()
    }
    pub(super) fn project_import_references(document: &mut Value, ids: &HashSet<String>) {
        if let Some(children) = document.get_mut("content").and_then(Value::as_array_mut) {
            children.retain(|n| {
                !(n["type"] == "attachment"
                    && n["attrs"]["id"].as_str().is_some_and(|id| ids.contains(id)))
            });
            for child in children {
                Self::project_import_references(child, ids);
            }
        }
    }
    /// Restore existing private ownership edges after validating the public
    /// editor document. No new record or user-visible Undo transaction is made.
    pub(super) fn preserve_import_references(
        &self,
        document: &mut Value,
        original: &Note,
    ) -> Result<()> {
        let ids = self.internal_import_ids(original, &self.attachments()?);
        if ids.is_empty() {
            return Ok(());
        }
        fn collect(value: &Value, ids: &HashSet<String>, found: &mut BTreeMap<String, Value>) {
            if value["type"] == "attachment" {
                if let Some(id) = value["attrs"]["id"].as_str().filter(|id| ids.contains(*id)) {
                    found.insert(id.into(), value.clone());
                }
            }
            if let Some(children) = value["content"].as_array() {
                for child in children {
                    collect(child, ids, found);
                }
            }
        }
        let mut references = BTreeMap::new();
        collect(&original.document, &ids, &mut references);
        Self::project_import_references(document, &ids);
        if let Some(children) = document.get_mut("content").and_then(Value::as_array_mut) {
            children.extend(references.into_values());
        }
        Ok(())
    }
    /// Called only after Session authorization. The source worker has already
    /// completed and owns no source capabilities by this publication boundary.
    pub(crate) fn append_apple_notes(
        &mut self,
        mut batch: PreparedBatch,
    ) -> Result<Vec<ItemResult>> {
        let notes = self.notes()?;
        let attachments = self.attachments()?;
        let mut imported = HashSet::new();
        for a in attachments.iter().filter(|a| a.mime == RAW_MIME) {
            if !notes.iter().any(|n| n.id == a.note_id) {
                continue;
            }
            // A stale/missing/corrupt record cannot suppress an import.
            if let Ok(bytes) = self.managed_attachment_bytes(a) {
                if bytes.len() <= 16 * 1024 * 1024 {
                    if let Ok(raw) = serde_json::from_slice::<RawRecord>(&bytes) {
                        if raw.valid() {
                            imported.insert((raw.source_key, raw.fingerprint));
                        }
                    }
                }
            }
        }
        let mut fresh = Vec::new();
        for n in batch.notes {
            if !imported.insert((n.source.clone(), n.fingerprint.clone())) {
                batch.results.push(ItemResult {
                    key: n.source,
                    status: "existing".into(),
                    reason: "相同来源与内容已复制".into(),
                    warnings: Vec::new(),
                    note_id: None,
                });
            } else {
                fresh.push(n);
            }
        }
        if fresh.is_empty() {
            return Ok(batch.results);
        }
        let root_id = id();
        let mut folders = self
            .folders()?
            .into_iter()
            .filter(|f| matches!(f.kind.as_str(), "default" | "quick" | "trash"))
            .collect::<Vec<_>>();
        folders.push(Folder {
            id: root_id.clone(),
            name: "来自 Apple 备忘录".into(),
            parent_id: None,
            kind: "normal".into(),
            sort_order: now(),
            created_at: now(),
            query: None,
            definition_revision: None,
        });
        let mut folder_map: BTreeMap<String, String> = BTreeMap::new();
        let mut incoming_notes = Vec::new();
        let mut incoming_attachments = Vec::new();
        let mut blobs = HashMap::new();
        for mut n in fresh {
            let mut parent = root_id.clone();
            let mut chain = Vec::new();
            for f in n.folders {
                chain.push(hash(f.id.as_bytes()));
                let key = chain.join("/");
                parent = if let Some(existing) = folder_map.get(&key) {
                    existing.clone()
                } else {
                    let fid = id();
                    folders.push(Folder {
                        id: fid.clone(),
                        name: f.name,
                        parent_id: Some(parent),
                        kind: "normal".into(),
                        sort_order: folders.len() as i64,
                        created_at: now(),
                        query: None,
                        definition_revision: None,
                    });
                    folder_map.insert(key, fid.clone());
                    fid
                };
            }
            n.note.folder_id = parent;
            batch.results.push(ItemResult {
                key: n.source,
                status: if n.warnings.is_empty() {
                    "imported"
                } else {
                    "imported_with_warnings"
                }
                .into(),
                reason: String::new(),
                warnings: n.warnings,
                note_id: Some(n.note.id.clone()),
            });
            incoming_notes.push(n.note);
            incoming_attachments.extend(n.attachments);
            blobs.extend(n.files);
        }
        let settings: String =
            self.db
                .query_row("SELECT body FROM settings WHERE id=1", [], |r| r.get(0))?;
        self.append_apple_archive(archive::Archive {
            version: 3,
            folders,
            notes: incoming_notes,
            attachments: incoming_attachments,
            settings: serde_json::from_str(&settings)?,
            blobs,
        })?;
        Ok(batch.results)
    }
}
#[cfg(test)]
#[path = "apple_import/tests.rs"]
mod tests;
