//! Private, no-follow, atomic state with an advisory lock and byte-level CAS.
use super::model::*;
use fs2::FileExt;
use std::{
    ffi::CString,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    os::{
        fd::{AsRawFd, FromRawFd},
        unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt},
    },
    path::{Path, PathBuf},
};
pub struct PrivateFiles {
    path: PathBuf,
    directory: File,
}
fn name(s: &str) -> Result<CString> {
    if s.is_empty()
        || s.len() > 128
        || !s
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b".-".contains(&b))
        || s == "."
        || s == ".."
    {
        return Err(error("state"));
    }
    CString::new(s).map_err(|_| error("state"))
}
impl PrivateFiles {
    /// `root` is an application-private directory selected by native code, never IPC.
    pub fn open(root: &Path) -> Result<Self> {
        if !root.is_absolute() {
            return Err(error("state"));
        }
        let mut path = PathBuf::new();
        for p in root.components() {
            path.push(p);
            let m = fs::symlink_metadata(&path).map_err(|_| error("state"))?;
            if !m.is_dir() || m.file_type().is_symlink() {
                return Err(error("state"));
            }
        }
        let path = root.join(".cloud-sync");
        match fs::create_dir(&path) {
            Ok(()) => fs::set_permissions(&path, fs::Permissions::from_mode(0o700))
                .map_err(|_| error("state"))?,
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(_) => return Err(error("state")),
        };
        let directory = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
            .open(&path)
            .map_err(|_| error("state"))?;
        let m = directory.metadata().map_err(|_| error("state"))?;
        if m.uid() != unsafe { libc::geteuid() } || m.mode() & 0o077 != 0 {
            return Err(error("state"));
        }
        let files = Self { path, directory };
        files.validate()?;
        Ok(files)
    }
    fn validate(&self) -> Result<()> {
        let a = self.directory.metadata().map_err(|_| error("state"))?;
        let b = fs::symlink_metadata(&self.path).map_err(|_| error("state"))?;
        if !b.is_dir()
            || b.file_type().is_symlink()
            || a.ino() != b.ino()
            || a.dev() != b.dev()
            || b.mode() & 0o077 != 0
        {
            return Err(error("state"));
        }
        Ok(())
    }
    fn open_file(&self, s: &str, flags: i32) -> Result<Option<File>> {
        self.validate()?;
        let c = name(s)?;
        let fd = unsafe {
            libc::openat(
                self.directory.as_raw_fd(),
                c.as_ptr(),
                flags | libc::O_NOFOLLOW | libc::O_CLOEXEC,
                0o600,
            )
        };
        if fd < 0 {
            let e = std::io::Error::last_os_error();
            return if e.kind() == std::io::ErrorKind::NotFound {
                Ok(None)
            } else {
                Err(error("state"))
            };
        }
        let f = unsafe { File::from_raw_fd(fd) };
        let m = f.metadata().map_err(|_| error("state"))?;
        if !m.is_file()
            || m.nlink() != 1
            || m.uid() != unsafe { libc::geteuid() }
            || m.mode() & 0o077 != 0
        {
            return Err(error("state"));
        }
        Ok(Some(f))
    }
    pub fn read(&self, s: &str, limit: usize) -> Result<Option<Vec<u8>>> {
        let Some(mut f) = self.open_file(s, libc::O_RDONLY)? else {
            return Ok(None);
        };
        if f.metadata().map_err(|_| error("state"))?.len() > limit as u64 {
            return Err(error("limit"));
        }
        let mut bytes = vec![];
        (&mut f)
            .take(limit as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| error("state"))?;
        if bytes.len() > limit {
            return Err(error("limit"));
        }
        self.validate()?;
        Ok(Some(bytes))
    }
    pub fn replace(&self, s: &str, bytes: &[u8], expected: Option<&[u8]>) -> Result<()> {
        let lock = self
            .open_file("state.lock", libc::O_RDWR | libc::O_CREAT)?
            .ok_or_else(|| error("state"))?;
        lock.lock_exclusive().map_err(|_| error("state"))?;
        let current = self.read(s, MAX_REMOTE)?;
        if current.as_deref() != expected {
            return Err(error("stale"));
        }
        if current.as_deref() == Some(bytes) {
            return Ok(());
        }
        let temp = format!("pending-{}.tmp", uuid::Uuid::new_v4());
        let mut f = self
            .open_file(&temp, libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL)?
            .ok_or_else(|| error("state"))?;
        let result = (|| {
            f.write_all(bytes).map_err(|_| error("state"))?;
            f.sync_all().map_err(|_| error("state"))?;
            self.validate()?;
            if self.read(s, MAX_REMOTE)?.as_deref() != expected {
                return Err(error("stale"));
            }
            let from = name(&temp)?;
            let to = name(s)?;
            if unsafe {
                libc::renameat(
                    self.directory.as_raw_fd(),
                    from.as_ptr(),
                    self.directory.as_raw_fd(),
                    to.as_ptr(),
                )
            } != 0
            {
                return Err(error("state"));
            }
            self.directory.sync_all().map_err(|_| error("state"))?;
            Ok(())
        })();
        if result.is_err() {
            if let Ok(c) = name(&temp) {
                unsafe {
                    libc::unlinkat(self.directory.as_raw_fd(), c.as_ptr(), 0);
                }
            }
        }
        result
    }
    /// Remove only this exact previously validated module-owned recovery, under the state-file lock.
    pub fn remove_recovery(&self, id: &str, expected: &[u8]) -> Result<()> {
        if !crate::sync::model::valid_uuid(id) {
            return Err(error("state"));
        }
        let lock = self
            .open_file("state.lock", libc::O_RDWR | libc::O_CREAT)?
            .ok_or_else(|| error("state"))?;
        lock.lock_exclusive().map_err(|_| error("state"))?;
        let file = format!("recovery-{id}.enc");
        if self.read(&file, MAX_REMOTE)?.as_deref() != Some(expected) {
            return Err(error("stale"));
        }
        let file = name(&file)?;
        if unsafe { libc::unlinkat(self.directory.as_raw_fd(), file.as_ptr(), 0) } != 0 {
            return Err(error("state"));
        }
        self.directory.sync_all().map_err(|_| error("state"))?;
        Ok(())
    }
    pub fn recoveries(&self) -> Result<Vec<String>> {
        self.validate()?;
        let mut ids = vec![];
        for e in fs::read_dir(&self.path).map_err(|_| error("state"))? {
            let e = e.map_err(|_| error("state"))?;
            let n = e.file_name();
            let Some(n) = n.to_str() else { continue };
            if let Some(id) = n
                .strip_prefix("recovery-")
                .and_then(|n| n.strip_suffix(".enc"))
            {
                if uuid::Uuid::parse_str(id).is_ok() {
                    self.read(n, MAX_REMOTE)?;
                    let modified = fs::symlink_metadata(e.path())
                        .map_err(|_| error("state"))?
                        .modified()
                        .map_err(|_| error("state"))?;
                    ids.push((modified, id.to_string()));
                }
            }
        }
        ids.sort();
        Ok(ids.into_iter().map(|(_, id)| id).collect())
    }
}
