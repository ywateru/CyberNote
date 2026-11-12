//! Directory-descriptor anchored Unix storage (macOS/Android); no symlink following.
use crate::{types::owner_filename, AuthError};
use fs2::FileExt;
use std::{
    ffi::{CString, OsStr},
    fs::{DirBuilder, File, OpenOptions},
    io::{Read, Write},
    os::unix::{
        ffi::OsStrExt,
        fs::{DirBuilderExt, MetadataExt, OpenOptionsExt},
        io::{AsRawFd, FromRawFd},
    },
    path::Path,
};
use zeroize::Zeroizing;

pub(crate) struct PrivateStore {
    dir: File,
    name: CString,
    _lock: File,
}
fn name(value: &OsStr) -> Result<CString, AuthError> {
    CString::new(value.as_bytes()).map_err(|_| AuthError::Storage)
}
fn check(file: &File, mode: u32, directory: bool) -> Result<(), AuthError> {
    let m = file.metadata().map_err(|_| AuthError::Storage)?;
    if m.uid() != unsafe { libc::geteuid() }
        || m.mode() & 0o7777 != mode
        || (directory && !m.is_dir())
        || (!directory && (!m.is_file() || m.nlink() != 1))
    {
        return Err(AuthError::Storage);
    }
    Ok(())
}
impl PrivateStore {
    pub fn open(path: &Path) -> Result<Self, AuthError> {
        let filename = name(owner_filename(path)?)?;
        let parent = path
            .parent()
            .filter(|x| !x.as_os_str().is_empty())
            .ok_or(AuthError::Storage)?;
        match DirBuilder::new().mode(0o700).create(parent) {
            Ok(()) => (),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => (),
            Err(_) => return Err(AuthError::Storage),
        }
        let dir = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
            .open(parent)
            .map_err(|_| AuthError::Storage)?;
        check(&dir, 0o700, true)?;
        let lock_name = CString::new(".account-auth.lock").map_err(|_| AuthError::Storage)?;
        let lock = Self::open_at(&dir, &lock_name, libc::O_RDWR | libc::O_CREAT, 0o600)?;
        check(&lock, 0o600, false)?;
        lock.try_lock_exclusive().map_err(|_| AuthError::Busy)?;
        let store = Self {
            dir,
            name: filename,
            _lock: lock,
        };
        store.check_target()?;
        Ok(store)
    }
    fn open_at(dir: &File, name: &CString, flags: i32, mode: u32) -> Result<File, AuthError> {
        let fd = unsafe {
            libc::openat(
                dir.as_raw_fd(),
                name.as_ptr(),
                flags | libc::O_NOFOLLOW | libc::O_CLOEXEC | libc::O_NONBLOCK,
                mode as libc::c_uint,
            )
        };
        if fd < 0 {
            return Err(AuthError::Storage);
        }
        Ok(unsafe { File::from_raw_fd(fd) })
    }
    fn check_target(&self) -> Result<bool, AuthError> {
        let mut st = std::mem::MaybeUninit::<libc::stat>::uninit();
        let rc = unsafe {
            libc::fstatat(
                self.dir.as_raw_fd(),
                self.name.as_ptr(),
                st.as_mut_ptr(),
                libc::AT_SYMLINK_NOFOLLOW,
            )
        };
        if rc < 0 {
            if std::io::Error::last_os_error().kind() == std::io::ErrorKind::NotFound {
                return Ok(false);
            }
            return Err(AuthError::Storage);
        }
        let file = Self::open_at(&self.dir, &self.name, libc::O_RDONLY, 0)?;
        check(&file, 0o600, false)?;
        Ok(true)
    }
    pub fn load(&self) -> Result<Option<Zeroizing<Vec<u8>>>, AuthError> {
        if !self.check_target()? {
            return Ok(None);
        }
        let file = Self::open_at(&self.dir, &self.name, libc::O_RDONLY, 0)?;
        check(&file, 0o600, false)?;
        if file.metadata().map_err(|_| AuthError::Storage)?.len() > 128 * 1024 {
            return Err(AuthError::Storage);
        }
        let mut bytes = Zeroizing::new(Vec::new());
        file.take(128 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| AuthError::Storage)?;
        if bytes.len() > 128 * 1024 {
            return Err(AuthError::Storage);
        }
        Ok(Some(bytes))
    }
    pub fn save(&self, bytes: &[u8]) -> Result<(), AuthError> {
        if bytes.len() > 128 * 1024 {
            return Err(AuthError::Storage);
        }
        self.check_target()?;
        let temp = CString::new(format!(
            ".grant-{}",
            oauth2::CsrfToken::new_random().secret()
        ))
        .map_err(|_| AuthError::Storage)?;
        let result = (|| {
            let mut file = Self::open_at(
                &self.dir,
                &temp,
                libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL,
                0o600,
            )?;
            check(&file, 0o600, false)?;
            file.write_all(bytes)
                .and_then(|_| file.sync_all())
                .map_err(|_| AuthError::Storage)?;
            if unsafe {
                libc::renameat(
                    self.dir.as_raw_fd(),
                    temp.as_ptr(),
                    self.dir.as_raw_fd(),
                    self.name.as_ptr(),
                )
            } < 0
            {
                return Err(AuthError::Storage);
            }
            self.dir.sync_all().map_err(|_| AuthError::Storage)
        })();
        // Once rename succeeded this is ENOENT; otherwise remove the uncommitted temp.
        unsafe {
            libc::unlinkat(self.dir.as_raw_fd(), temp.as_ptr(), 0);
        }
        result
    }
    pub fn remove(&self) -> Result<(), AuthError> {
        if self.check_target()?
            && unsafe { libc::unlinkat(self.dir.as_raw_fd(), self.name.as_ptr(), 0) } < 0
        {
            return Err(AuthError::Storage);
        }
        self.dir.sync_all().map_err(|_| AuthError::Storage)
    }
}
