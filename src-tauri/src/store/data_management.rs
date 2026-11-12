//! Read-only filesystem inventory and protected, original-byte document export.
use super::*;
use std::{
    collections::BTreeMap,
    fs::{File, OpenOptions},
    io::{Read, Write},
    time::UNIX_EPOCH,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataManagementSnapshot {
    version: u8,
    captured_at: i64,
    root_path: String,
    files: Vec<DataFile>,
    totals: Totals,
    counts: Counts,
    warnings: Vec<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DataFile {
    relative_path: String,
    category: String,
    size: Option<u64>,
    modified_at: Option<u64>,
    exists: bool,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    attachment: Option<AttachmentInfo>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AttachmentInfo {
    id: String,
    note_id: String,
    kind: String,
    mime: String,
    display_name: Option<String>,
    declared_size: u64,
    referenced: Option<bool>,
    exportable: bool,
}
#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct Totals {
    database_bytes: u64,
    auxiliary_bytes: u64,
    attachment_bytes: u64,
    other_bytes: u64,
    total_bytes: u64,
    declared_attachment_bytes: u64,
}
#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct Counts {
    notes: usize,
    folders: usize,
    attachments: usize,
    physical_files: usize,
    missing_attachments: usize,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AttachmentExport {
    pub name: String,
    pub bytes: u64,
    pub mime: String,
}

/// A single host-owned operation. Drop only removes our known payload and empty
/// operation directory; it never recursively removes a possibly foreign tree.
pub(crate) struct DocumentStage {
    directory: PathBuf,
    path: PathBuf,
}
impl DocumentStage {
    pub fn path(&self) -> &Path {
        &self.path
    }
}
impl Drop for DocumentStage {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
        let _ = fs::remove_dir(&self.directory);
    }
}
fn category(path: &str) -> &'static str {
    match path {
        "notes.sqlite3" => "database",
        "notes.sqlite3-wal" => "wal",
        "notes.sqlite3-shm" => "shm",
        _ if path.starts_with("attachments/") => "attachment",
        _ if path == ".imports" || path.starts_with(".imports/") => "import",
        _ => "other",
    }
}
fn file_row(root: &Path, relative_path: &Path, warnings: &mut Vec<String>) -> DataFile {
    let path = root.join(relative_path);
    let relative = relative_path.to_string_lossy();
    let mut row = DataFile {
        relative_path: relative.to_string(),
        category: category(&relative).into(),
        size: None,
        modified_at: None,
        exists: false,
        status: "missing".into(),
        attachment: None,
    };
    match fs::symlink_metadata(&path) {
        Ok(meta) => {
            row.exists = true;
            row.modified_at = meta
                .modified()
                .ok()
                .and_then(|mtime| mtime.duration_since(UNIX_EPOCH).ok())
                .and_then(|d| u64::try_from(d.as_millis()).ok());
            if row.modified_at.is_none() {
                warnings.push(format!("无法读取修改时间：{relative}"));
            }
            row.status = if meta.file_type().is_symlink() {
                "symlink"
            } else if meta.is_dir() {
                "directory"
            } else if meta.is_file() {
                row.size = Some(meta.len());
                if File::open(&path).is_ok() {
                    "file"
                } else {
                    warnings.push(format!("文件不可读：{relative}"));
                    "unreadable"
                }
            } else {
                "other"
            }
            .into();
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => {
            row.status = "unreadable".into();
            warnings.push(format!("无法读取文件信息：{relative}（{e}）"));
        }
    }
    row
}
fn referenced(document: &Value, id: &str) -> bool {
    let mut stack = vec![document];
    while let Some(node) = stack.pop() {
        if node["type"] == "attachment" && node["attrs"]["id"] == id {
            return true;
        }
        if let Some(children) = node["content"].as_array() {
            stack.extend(children);
        }
    }
    false
}
impl Store {
    pub(crate) fn data_management(&self) -> Result<DataManagementSnapshot> {
        let root = self.root.canonicalize()?;
        let notes = self.notes()?;
        let attachments = self.attachments()?;
        let internal = notes
            .iter()
            .flat_map(|n| self.internal_import_ids(n, &attachments))
            .collect::<std::collections::HashSet<_>>();
        let mut warnings = vec![];
        let mut rows = BTreeMap::new();
        // Missing DB sidecars remain visible, even with no physical directory entry.
        for name in ["notes.sqlite3", "notes.sqlite3-wal", "notes.sqlite3-shm"] {
            rows.insert(name.into(), file_row(&root, Path::new(name), &mut warnings));
        }
        let mut directories = vec![PathBuf::new()];
        while let Some(relative) = directories.pop() {
            match fs::read_dir(root.join(&relative)) {
                Ok(entries) => {
                    for entry in entries {
                        match entry {
                            Ok(entry) => {
                                let child = relative.join(entry.file_name());
                                let key = child.to_string_lossy().into_owned();
                                if child.to_str().is_none() {
                                    warnings.push(format!(
                                        "文件名不是有效 UTF-8，显示为替代字符：{key}"
                                    ));
                                }
                                let row = file_row(&root, &child, &mut warnings);
                                if row.status == "directory" {
                                    directories.push(child);
                                }
                                if rows.insert(key.clone(), row).is_some()
                                    && !["notes.sqlite3", "notes.sqlite3-wal", "notes.sqlite3-shm"]
                                        .contains(&key.as_str())
                                {
                                    warnings
                                        .push(format!("文件路径显示冲突，统计可能不完整：{key}"));
                                }
                            }
                            Err(e) => warnings
                                .push(format!("无法完整读取目录 {}：{e}", relative.display())),
                        }
                    }
                }
                Err(e) => warnings.push(format!("无法扫描目录 {}：{e}", relative.display())),
            }
        }
        let mut counts = Counts {
            notes: notes.len(),
            folders: self.folders()?.len(),
            attachments: attachments.len(),
            ..Counts::default()
        };
        let mut totals = Totals::default();
        let mut duplicate_rows = vec![];
        for attachment in attachments {
            totals.declared_attachment_bytes = totals
                .declared_attachment_bytes
                .checked_add(attachment.size)
                .ok_or_else(|| err("limit", "附件登记总大小超限"))?;
            let key = format!("attachments/{}", attachment.relative_path);
            let valid = self.attachment_path(&attachment.relative_path).is_ok();
            let mut row = rows.remove(&key).unwrap_or_else(|| DataFile {
                relative_path: key.clone(),
                category: "attachment".into(),
                size: None,
                modified_at: None,
                exists: false,
                status: "missing".into(),
                attachment: None,
            });
            if !valid {
                row.status = "unreadable".into();
                warnings.push(format!("已登记附件路径无效：{}", attachment.id));
            }
            if row.attachment.is_some() {
                warnings.push(format!("多个附件共用路径：{key}"));
                duplicate_rows.push(row.clone());
            }
            if !row.exists {
                counts.missing_attachments += 1;
            }
            if row.size.is_some_and(|size| size != attachment.size) {
                warnings.push(format!("附件实际大小与登记大小不符：{key}"));
            }
            let owner = notes.iter().find(|note| note.id == attachment.note_id);
            let authorized = self.authorized(&attachment.note_id).unwrap_or(false);
            let visible = if authorized {
                owner.cloned().map(|note| self.visible(note)).transpose()?
            } else {
                None
            };
            let is_internal = internal.contains(&attachment.id);
            if is_internal {
                row.category = "import".into();
            }
            row.attachment = (!is_internal).then_some(AttachmentInfo {
                id: attachment.id.clone(),
                note_id: attachment.note_id,
                kind: attachment.kind,
                mime: attachment.mime,
                display_name: authorized.then_some(attachment.display_name),
                declared_size: attachment.size,
                referenced: visible
                    .as_ref()
                    .map(|note| referenced(&note.document, &attachment.id)),
                exportable: valid
                    && authorized
                    && row.status == "file"
                    && row.size == Some(attachment.size),
            });
            rows.insert(key, row);
        }
        for row in rows.values() {
            if let Some(size) = row.size {
                counts.physical_files += 1;
                let bucket = match row.category.as_str() {
                    "database" => &mut totals.database_bytes,
                    "wal" | "shm" => &mut totals.auxiliary_bytes,
                    "attachment" => &mut totals.attachment_bytes,
                    _ => &mut totals.other_bytes,
                };
                *bucket = bucket
                    .checked_add(size)
                    .ok_or_else(|| err("limit", "文件总大小超限"))?;
                totals.total_bytes = totals
                    .total_bytes
                    .checked_add(size)
                    .ok_or_else(|| err("limit", "文件总大小超限"))?;
            }
        }
        for row in rows.values().filter(|row| row.exists) {
            if let Ok(meta) = fs::symlink_metadata(root.join(&row.relative_path)) {
                let modified = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .and_then(|d| u64::try_from(d.as_millis()).ok());
                if (meta.is_file() && row.size != Some(meta.len())) || modified != row.modified_at {
                    warnings.push(format!(
                        "采样期间文件发生变化，请刷新：{}",
                        row.relative_path
                    ));
                }
            } else {
                warnings.push(format!(
                    "采样期间文件信息失效，请刷新：{}",
                    row.relative_path
                ));
            }
        }
        // WAL and runtime files may change during stat. No checkpoint or payload
        // reads are performed; each row is its actual filesystem observation.
        Ok(DataManagementSnapshot {
            version: 1,
            captured_at: now(),
            root_path: root.to_string_lossy().into_owned(),
            files: rows.into_values().chain(duplicate_rows).collect(),
            totals,
            counts,
            warnings,
        })
    }
    pub(crate) fn document_stage(&self) -> Result<DocumentStage> {
        let root = self.root.canonicalize()?;
        let parent = root.join(".document-io");
        match fs::create_dir(&parent) {
            Ok(()) => (),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => (),
            Err(e) => return Err(e.into()),
        }
        if fs::symlink_metadata(&parent)?.file_type().is_symlink()
            || !parent.is_dir()
            || parent.canonicalize()? != parent
        {
            return Err(err("invalid", "文档暂存目录无效"));
        }
        let directory = parent.join(id());
        fs::create_dir(&directory)?;
        Ok(DocumentStage {
            path: directory.join("payload"),
            directory,
        })
    }
    /// User-selected outputs can never overwrite any part of this app's data.
    pub(crate) fn validate_export_target(&self, path: &Path) -> Result<PathBuf> {
        let name = path
            .file_name()
            .filter(|name| !name.is_empty())
            .ok_or_else(|| err("invalid", "导出目标缺少文件名"))?;
        let parent = path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."));
        let canonical_parent = parent.canonicalize()?;
        let live_root = self.root.canonicalize()?;
        if canonical_parent.starts_with(&live_root) {
            return Err(err("invalid", "导出目标不能替换应用数据目录中的文件"));
        }
        let destination = canonical_parent.join(name);
        match fs::symlink_metadata(&destination) {
            Ok(meta) if !meta.is_file() || meta.file_type().is_symlink() => {
                return Err(err(
                    "invalid",
                    "导出目标必须是普通文件，不能是符号链接或目录",
                ))
            }
            Ok(_) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(e) => return Err(e.into()),
        }
        Ok(destination)
    }
    pub(crate) fn publish_export(&self, path: &Path, bytes: &[u8]) -> Result<()> {
        let destination = self.validate_export_target(path)?;
        let parent = destination
            .parent()
            .ok_or_else(|| err("invalid", "导出目录不存在"))?;
        let temporary = parent.join(format!(".notes-export-{}.tmp", id()));
        let result = (|| {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)?;
            file.write_all(bytes)?;
            file.sync_all()?;
            drop(file);
            // Revalidate after writing, before the only visible publication.
            if self.validate_export_target(path)? != destination {
                return Err(err("invalid", "导出目标已改变"));
            }
            fs::rename(&temporary, &destination)?;
            #[cfg(unix)]
            File::open(parent)?.sync_all()?;
            Ok(())
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result
    }
    pub(crate) fn attachment_export_bytes(&self, attachment_id: &str) -> Result<(AttachmentExport, Vec<u8>)> {
        let attachment = self
            .attachments()?
            .into_iter()
            .find(|a| a.id == attachment_id)
            .ok_or_else(|| err("not_found", "附件不存在"))?;
        if !self.authorized(&attachment.note_id)? {
            return Err(err("access_changed", "备忘录已锁定或删除，请重新解锁"));
        }
        if self
            .internal_import_ids(
                &self.note(&attachment.note_id)?,
                std::slice::from_ref(&attachment),
            )
            .contains(attachment_id)
        {
            return Err(err("internal_attachment", "内部导入记录请通过完整备份导出"));
        }
        let bytes = self.managed_attachment_bytes(&attachment)?;
        Ok((
            AttachmentExport {
                name: attachment.display_name,
                bytes: attachment.size,
                mime: attachment.mime,
            },
            bytes,
        ))
    }
    pub(super) fn managed_attachment_bytes(&self, attachment: &Attachment) -> Result<Vec<u8>> {
        let source = self.attachment_path(&attachment.relative_path)?;
        let attachment_root = self.root.canonicalize()?.join("attachments");
        if fs::symlink_metadata(&attachment_root)?
            .file_type()
            .is_symlink()
            || attachment_root.canonicalize()? != attachment_root
            || !attachment_root.is_dir()
        {
            return Err(err("invalid", "附件目录无效"));
        }
        let metadata = fs::symlink_metadata(&source)?;
        if !metadata.is_file()
            || metadata.file_type().is_symlink()
            || metadata.len() != attachment.size
            || attachment.size > 100 * 1024 * 1024
        {
            return Err(err("invalid", "附件文件或实际大小与登记信息不符"));
        }
        let file = File::open(&source)?;
        let mut bytes = Vec::new();
        file.take(attachment.size + 1).read_to_end(&mut bytes)?;
        if bytes.len() as u64 != attachment.size {
            return Err(err("invalid", "附件读取不完整或大小已改变"));
        }
        Ok(bytes)
    }
    pub(crate) fn export_attachment(&self, id: &str, path: &Path) -> Result<AttachmentExport> {
        self.validate_export_target(path)?;
        let (info, bytes) = self.attachment_export_bytes(id)?;
        self.publish_export(path, &bytes)?;
        Ok(info)
    }
    pub(crate) fn stage_attachment(&self, id: &str) -> Result<(DocumentStage, AttachmentExport)> {
        let (info, bytes) = self.attachment_export_bytes(id)?;
        let stage = self.document_stage()?;
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(stage.path())?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        Ok((stage, info))
    }
}
