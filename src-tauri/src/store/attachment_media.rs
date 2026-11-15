//! The only media file entry point: registration and authorization remain Store
//! owned; filesystem IO happens on this detached descriptor, outside Session locks.
use super::{err, Attachment, OptionalExtension, Result, Store};
use serde::Serialize;
use std::{
    fs::{self, File, Metadata},
    path::{Path, PathBuf},
};

pub(crate) const MAX_ORIGINAL_BYTES: u64 = 100 * 1024 * 1024;
const INTERNAL_MIME: &str = "application/vnd.local-notes.apple-import+json";

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub(crate) struct FileStamp {
    pub bytes: u64,
    #[cfg(unix)]
    device: u64,
    #[cfg(unix)]
    inode: u64,
    #[cfg(unix)]
    modified: (i64, i64),
    #[cfg(unix)]
    changed: (i64, i64),
}
impl FileStamp {
    pub(crate) fn of(metadata: &Metadata) -> Self {
        #[cfg(unix)]
        use std::os::unix::fs::MetadataExt;
        Self {
            bytes: metadata.len(),
            #[cfg(unix)]
            device: metadata.dev(),
            #[cfg(unix)]
            inode: metadata.ino(),
            #[cfg(unix)]
            modified: (metadata.mtime(), metadata.mtime_nsec()),
            #[cfg(unix)]
            changed: (metadata.ctime(), metadata.ctime_nsec()),
        }
    }
}

#[derive(Clone)]
pub(crate) struct ManagedAttachment {
    pub attachment: Attachment,
    root: PathBuf,
}
pub(crate) struct VerifiedFile {
    pub file: File,
    pub stamp: FileStamp,
}

impl Store {
    /// Trusted lifecycle cleanup only, never a renderer lookup or byte source.
    /// Captures IDs before sync deletion removes registration rows.
    pub(crate) fn media_attachment_ids_for_note(&self, note: &str) -> Result<Vec<String>> {
        let mut query = self
            .db
            .prepare("SELECT id FROM attachments WHERE note_id=?1")?;
        let rows = query
            .query_map([note], |row| row.get(0))?
            .collect::<std::result::Result<Vec<String>, _>>()?;
        Ok(rows)
    }

    pub(crate) fn attachment(&self, id: &str) -> Result<Attachment> {
        let body: Option<String> = self
            .db
            .query_row("SELECT body FROM attachments WHERE id=?1", [id], |row| {
                row.get(0)
            })
            .optional()?;
        let a: Attachment =
            serde_json::from_str(&body.ok_or_else(|| err("not_found", "附件不存在"))?)?;
        if a.id != id {
            return Err(err("invalid", "附件登记身份不符"));
        }
        Ok(a)
    }

    /// No byte IO. The reserved import MIME is never an ordinary media source:
    /// conservatively deny it without decoding the internal JSON under a lock.
    pub(crate) fn media_attachment(&self, id: &str) -> Result<ManagedAttachment> {
        let attachment = self.attachment(id)?;
        if !self.authorized(&attachment.note_id)? {
            return Err(err("access_changed", "备忘录已锁定或删除"));
        }
        if attachment.mime == INTERNAL_MIME {
            return Err(err("internal_attachment", "内部导入记录不可作为媒体读取"));
        }
        self.attachment_path(&attachment.relative_path)?;
        if attachment.size > MAX_ORIGINAL_BYTES {
            return Err(err("invalid", "附件大小超出限制"));
        }
        Ok(ManagedAttachment {
            attachment,
            root: self.root.clone(),
        })
    }
}
impl ManagedAttachment {
    pub(crate) fn open(&self) -> Result<VerifiedFile> {
        let root = self
            .root
            .canonicalize()
            .map_err(|_| err("media_io", "附件目录不可用"))?;
        open_regular(
            &root.join("attachments"),
            &self.attachment.relative_path,
            Some(self.attachment.size),
            MAX_ORIGINAL_BYTES,
        )
    }
}

/// Anchor openat to a no-follow directory FD, so replacing the path after
/// validation cannot redirect the open. No absolute paths are supplied by UI.
pub(crate) fn open_regular(
    root: &Path,
    name: &str,
    expected: Option<u64>,
    max: u64,
) -> Result<VerifiedFile> {
    if name.is_empty() || name.contains(['/', '\\', '\0']) || name.contains("..") {
        return Err(err("invalid", "无效受管文件身份"));
    }
    let directory = fs::symlink_metadata(root).map_err(|_| err("media_io", "受管目录不可用"))?;
    if !directory.is_dir()
        || directory.file_type().is_symlink()
        || root
            .canonicalize()
            .map_err(|_| err("media_io", "受管目录不可用"))?
            != root
    {
        return Err(err("invalid", "受管目录无效"));
    }
    #[cfg(unix)]
    let file = {
        use std::os::{
            fd::{AsRawFd, FromRawFd},
            unix::fs::OpenOptionsExt,
        };
        let dir = fs::OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
            .open(root)
            .map_err(|_| err("invalid", "受管目录无效"))?;
        if FileStamp::of(&directory) != FileStamp::of(&dir.metadata()?) {
            return Err(err("invalid", "受管目录已改变"));
        }
        let name = std::ffi::CString::new(name).map_err(|_| err("invalid", "文件身份无效"))?;
        let fd = unsafe {
            libc::openat(
                dir.as_raw_fd(),
                name.as_ptr(),
                libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_CLOEXEC | libc::O_NONBLOCK,
            )
        };
        if fd < 0 {
            return Err(err("media_io", "无法打开受管文件"));
        }
        unsafe { File::from_raw_fd(fd) }
    };
    #[cfg(not(unix))]
    let file: File = return Err(err("unsupported_media", "当前平台缺少受管文件打开适配器"));
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.len() > max || expected.is_some_and(|n| metadata.len() != n)
    {
        return Err(err("invalid", "受管文件类型或登记大小不符"));
    }
    let current =
        fs::symlink_metadata(root.join(name)).map_err(|_| err("media_io", "受管文件已移除"))?;
    if current.file_type().is_symlink() || FileStamp::of(&current) != FileStamp::of(&metadata) {
        return Err(err("invalid", "受管文件已替换"));
    }
    Ok(VerifiedFile {
        stamp: FileStamp::of(&metadata),
        file,
    })
}
