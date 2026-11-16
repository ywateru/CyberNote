//! All grant/credential file operations are anchored to verified directory descriptors.
use crate::application::{ToolError, ToolResult};
use std::{
    ffi::CString,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    os::{
        fd::{AsRawFd, FromRawFd},
        unix::{
            ffi::OsStrExt,
            fs::{DirBuilderExt, MetadataExt, OpenOptionsExt, PermissionsExt},
        },
    },
    path::{Component, Path, PathBuf},
};
use uuid::Uuid;

pub(crate) fn storage() -> ToolError {
    ToolError::new("STORAGE_ERROR", "Private agent state operation failed")
}
pub(crate) fn invalid() -> ToolError {
    ToolError::new(
        "HOST_UNAVAILABLE",
        "Unsafe or unavailable private agent runtime",
    )
}
fn name(value: &str) -> ToolResult<CString> {
    if value.is_empty() || value.contains('/') || value == "." || value == ".." {
        return Err(invalid());
    }
    CString::new(value).map_err(|_| invalid())
}
pub(crate) fn safe_path(path: &Path) -> ToolResult<()> {
    if !path.is_absolute() || path.to_str().is_none() {
        return Err(invalid());
    }
    let mut part = PathBuf::new();
    for c in path.components() {
        match c {
            Component::RootDir | Component::Normal(_) => part.push(c),
            _ => return Err(invalid()),
        }
        let m = fs::symlink_metadata(&part).map_err(|_| invalid())?;
        if m.file_type().is_symlink() || !m.is_dir() {
            return Err(invalid());
        }
    }
    Ok(())
}
#[derive(Clone, Copy)]
pub(crate) struct Identity {
    dev: u64,
    ino: u64,
}
impl Identity {
    pub fn of(m: &fs::Metadata) -> Self {
        Self {
            dev: m.dev(),
            ino: m.ino(),
        }
    }
    pub fn matches(&self, m: &fs::Metadata) -> bool {
        self.dev == m.dev() && self.ino == m.ino()
    }
}
pub(crate) struct PrivateDir {
    pub path: PathBuf,
    file: File,
    id: Identity,
}
impl PrivateDir {
    pub fn open(path: PathBuf) -> ToolResult<Self> {
        if !path.is_absolute() {
            return Err(invalid());
        }
        let parent = path.parent().ok_or_else(invalid)?;
        safe_path(parent)?;
        match fs::DirBuilder::new().mode(0o700).create(&path) {
            Ok(()) => (),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => (),
            Err(_) => return Err(invalid()),
        }
        safe_path(&path)?;
        let file = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NOFOLLOW | libc::O_DIRECTORY | libc::O_CLOEXEC)
            .open(&path)
            .map_err(|_| invalid())?;
        let m = file.metadata().map_err(|_| invalid())?;
        if m.uid() != unsafe { libc::geteuid() } || m.mode() & 0o7777 != 0o700 {
            return Err(invalid());
        }
        let dir = Self {
            path,
            file,
            id: Identity::of(&m),
        };
        dir.verify()?;
        Ok(dir)
    }
    pub fn verify(&self) -> ToolResult<()> {
        safe_path(&self.path)?;
        let m = fs::symlink_metadata(&self.path).map_err(|_| invalid())?;
        if !self.id.matches(&m)
            || m.uid() != unsafe { libc::geteuid() }
            || m.mode() & 0o7777 != 0o700
        {
            return Err(invalid());
        }
        Ok(())
    }
    fn open_file(&self, leaf: &str, flags: i32) -> ToolResult<File> {
        self.verify()?;
        let leaf = name(leaf)?;
        let fd = unsafe {
            libc::openat(
                self.file.as_raw_fd(),
                leaf.as_ptr(),
                flags | libc::O_NOFOLLOW | libc::O_CLOEXEC | libc::O_NONBLOCK,
                0o600,
            )
        };
        if fd < 0 {
            return Err(storage());
        }
        let file = unsafe { File::from_raw_fd(fd) };
        let m = file.metadata().map_err(|_| storage())?;
        if !m.is_file()
            || m.uid() != unsafe { libc::geteuid() }
            || m.mode() & 0o7777 != 0o600
            || m.nlink() != 1
        {
            return Err(invalid());
        }
        Ok(file)
    }
    pub fn read(&self, leaf: &str, max: usize) -> ToolResult<Option<Vec<u8>>> {
        self.verify()?;
        let leaf_c = name(leaf)?;
        let mut stat: libc::stat = unsafe { std::mem::zeroed() };
        if unsafe {
            libc::fstatat(
                self.file.as_raw_fd(),
                leaf_c.as_ptr(),
                &mut stat,
                libc::AT_SYMLINK_NOFOLLOW,
            )
        } != 0
        {
            return if std::io::Error::last_os_error().kind() == std::io::ErrorKind::NotFound {
                Ok(None)
            } else {
                Err(storage())
            };
        }
        let file = self.open_file(leaf, libc::O_RDONLY)?;
        if file.metadata().map_err(|_| storage())?.len() > max as u64 {
            return Err(invalid());
        }
        let mut bytes = Vec::new();
        file.take(max as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| storage())?;
        if bytes.len() > max {
            return Err(invalid());
        }
        Ok(Some(bytes))
    }
    pub fn write(&self, leaf: &str, bytes: &[u8]) -> ToolResult<()> {
        // Reject pre-existing symlink, wrong owner/mode, hardlink or non-regular destination.
        self.read(leaf, 4 * 1024 * 1024)?;
        let temp = format!(".{}.tmp", Uuid::new_v4());
        let result = (|| {
            let mut file = self.open_file(&temp, libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL)?;
            file.write_all(bytes).map_err(|_| storage())?;
            file.sync_all().map_err(|_| storage())?;
            self.verify()?;
            let from = name(&temp)?;
            let to = name(leaf)?;
            if unsafe {
                libc::renameat(
                    self.file.as_raw_fd(),
                    from.as_ptr(),
                    self.file.as_raw_fd(),
                    to.as_ptr(),
                )
            } != 0
            {
                return Err(storage());
            }
            self.file.sync_all().map_err(|_| storage())
        })();
        if result.is_err() {
            let _ = self.remove(&temp);
        }
        result
    }
    pub fn remove(&self, leaf: &str) -> ToolResult<()> {
        if self.read(leaf, 4 * 1024 * 1024)?.is_none() {
            return Ok(());
        }
        let leaf = name(leaf)?;
        if unsafe { libc::unlinkat(self.file.as_raw_fd(), leaf.as_ptr(), 0) } != 0 {
            return Err(storage());
        }
        self.file.sync_all().map_err(|_| storage())
    }
    /// Lifetime lock protects the registry and prevents a second host using this runtime.
    pub fn lock(&self, leaf: &str) -> ToolResult<File> {
        let file = self.open_file(leaf, libc::O_RDWR | libc::O_CREAT)?;
        if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 {
            return Err(invalid());
        }
        Ok(file)
    }
    pub fn socket_path(&self, basename: &str) -> ToolResult<PathBuf> {
        name(basename)?;
        self.verify()?;
        let path = self.path.join(basename);
        // Darwin sun_path is 104 bytes; use the portable, stricter boundary, including NUL.
        if path.as_os_str().as_bytes().len() >= 104 {
            return Err(ToolError::new(
                "HOST_UNAVAILABLE",
                "Socket path is too long; choose a shorter private runtime directory",
            ));
        }
        if fs::symlink_metadata(&path).is_ok() {
            return Err(invalid());
        }
        Ok(path)
    }
}

pub(crate) struct SocketGuard {
    path: PathBuf,
    id: Identity,
    parent_id: Identity,
}
impl SocketGuard {
    pub fn install(path: PathBuf) -> ToolResult<Self> {
        use std::os::unix::fs::FileTypeExt;
        let m = fs::symlink_metadata(&path).map_err(|_| invalid())?;
        if !m.file_type().is_socket() || m.uid() != unsafe { libc::geteuid() } {
            return Err(invalid());
        }
        let parent = path.parent().ok_or_else(invalid)?;
        safe_path(parent)?;
        let parent_id = Identity::of(&fs::symlink_metadata(parent).map_err(|_| invalid())?);
        let guard = Self {
            path,
            id: Identity::of(&m),
            parent_id,
        };
        fs::set_permissions(&guard.path, fs::Permissions::from_mode(0o600))
            .map_err(|_| invalid())?;
        guard.verify()?;
        Ok(guard)
    }
    pub fn verify(&self) -> ToolResult<()> {
        use std::os::unix::fs::FileTypeExt;
        let parent = self.path.parent().ok_or_else(invalid)?;
        safe_path(parent)?;
        let parent_meta = fs::symlink_metadata(parent).map_err(|_| invalid())?;
        if !self.parent_id.matches(&parent_meta)
            || parent_meta.uid() != unsafe { libc::geteuid() }
            || parent_meta.mode() & 0o7777 != 0o700
        {
            return Err(invalid());
        }
        let m = fs::symlink_metadata(&self.path).map_err(|_| invalid())?;
        if !self.id.matches(&m)
            || !m.file_type().is_socket()
            || m.uid() != unsafe { libc::geteuid() }
            || m.mode() & 0o7777 != 0o600
        {
            return Err(invalid());
        }
        Ok(())
    }
}
impl Drop for SocketGuard {
    fn drop(&mut self) {
        // Never unlink a replacement, another host's socket, or a substituted symlink.
        if self.verify().is_ok() {
            let _ = fs::remove_file(&self.path);
        }
    }
}
