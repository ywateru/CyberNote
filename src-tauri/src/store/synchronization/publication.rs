//! Prepared byte ownership and atomic no-replace publication. Copying and SHA
//! verification happen only in MediaSnapshot::verify, never in materialize.
use super::media::{stale, Stamp, VerifiedFile};
use super::*;
use sha2::{Digest, Sha256};
#[cfg(unix)]
use std::os::{
    fd::{AsRawFd, FromRawFd},
    unix::{
        ffi::OsStrExt,
        fs::{FileExt, MetadataExt, OpenOptionsExt},
    },
};
use std::{ffi::CString, fs::File, io::Write, sync::Arc};

pub(super) struct Directory {
    file: File,
    path: PathBuf,
    #[cfg(unix)]
    identity: (u64, u64),
}
impl Directory {
    pub(super) fn open(path: PathBuf) -> Result<Arc<Self>> {
        #[cfg(unix)]
        {
            let file = fs::OpenOptions::new()
                .read(true)
                .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
                .open(&path)?;
            let meta = file.metadata()?;
            let directory = Arc::new(Self {
                file,
                path,
                identity: (meta.dev(), meta.ino()),
            });
            directory.validate()?;
            Ok(directory)
        }
        #[cfg(not(unix))]
        {
            let _ = path;
            Err(err("sync_media_publish", "平台不支持安全媒体发布"))
        }
    }
    pub(super) fn validate(&self) -> Result<()> {
        #[cfg(unix)]
        {
            for meta in [fs::symlink_metadata(&self.path)?, self.file.metadata()?] {
                if !meta.is_dir()
                    || meta.file_type().is_symlink()
                    || (meta.dev(), meta.ino()) != self.identity
                {
                    return Err(stale());
                }
            }
            Ok(())
        }
        #[cfg(not(unix))]
        {
            Err(stale())
        }
    }
    pub(super) fn stale_allocation(&self) -> Result<(u64, usize)> {
        self.validate()?;
        let mut total = 0u64;
        let mut count = 0usize;
        for entry in fs::read_dir(&self.path)? {
            let entry = entry?;
            let name = entry.file_name();
            let Some(name) = name.to_str() else { continue };
            let Some(id) = name
                .strip_prefix(".sync91-stage-")
                .and_then(|s| s.strip_suffix(".part"))
            else {
                continue;
            };
            if uuid::Uuid::parse_str(id).is_err() {
                continue;
            }
            let meta = fs::symlink_metadata(entry.path())?;
            if !meta.is_file() || meta.file_type().is_symlink() {
                return Err(stale());
            }
            count = count
                .checked_add(1)
                .ok_or_else(|| limit("媒体临时数量溢出"))?;
            total = total
                .checked_add(meta.len())
                .ok_or_else(|| limit("媒体临时预算溢出"))?;
        }
        Ok((total, count))
    }
}
fn name(value: &std::ffi::OsStr) -> Result<CString> {
    #[cfg(unix)]
    {
        CString::new(value.as_bytes()).map_err(|_| stale())
    }
    #[cfg(not(unix))]
    {
        let _ = value;
        Err(stale())
    }
}

pub(super) struct Staged {
    directory: Arc<Directory>,
    name: Option<String>,
    proof: VerifiedFile,
}
impl Staged {
    pub(super) fn copy(
        directory: Arc<Directory>,
        source: &VerifiedFile,
        source_path: &Path,
    ) -> Result<Self> {
        directory.validate()?;
        if !source.current(source_path) {
            return Err(stale());
        }
        let stage_name = format!(".sync91-stage-{}.part", uuid::Uuid::new_v4());
        #[cfg(unix)]
        let file = {
            let c = name(std::ffi::OsStr::new(&stage_name))?;
            // Exclusive creation relative to the retained directory. Never
            // follows an existing name or a replaced parent directory.
            let fd = unsafe {
                libc::openat(
                    directory.file.as_raw_fd(),
                    c.as_ptr(),
                    libc::O_RDWR
                        | libc::O_CREAT
                        | libc::O_EXCL
                        | libc::O_NOFOLLOW
                        | libc::O_CLOEXEC,
                    0o600,
                )
            };
            if fd < 0 {
                return Err(std::io::Error::last_os_error().into());
            }
            unsafe { File::from_raw_fd(fd) }
        };
        #[cfg(not(unix))]
        let file: File = return Err(stale());
        // Install ownership immediately, before any fallible copy operation.
        let mut staged = Self {
            directory,
            name: Some(stage_name),
            proof: VerifiedFile {
                stamp: source.stamp.clone(),
                file: Arc::new(file),
                hash: source.hash.clone(),
            },
        };
        let mut total = 0u64;
        let mut hash = Sha256::new();
        let mut buffer = [0u8; 65536];
        loop {
            #[cfg(unix)]
            let n = source.file.read_at(&mut buffer, total)?;
            #[cfg(not(unix))]
            let n = 0;
            if n == 0 {
                break;
            }
            total = total.checked_add(n as u64).ok_or_else(stale)?;
            if total > source.stamp.size {
                return Err(stale());
            }
            hash.update(&buffer[..n]);
            (&*staged.proof.file).write_all(&buffer[..n])?;
        }
        staged.proof.file.sync_all()?;
        // Refresh only our newly-created file, after verifying complete bytes.
        staged.proof.stamp = Stamp::of(&staged.proof.file.metadata()?)?;
        if total != source.stamp.size
            || format!("{:x}", hash.finalize()) != source.hash
            || !source.current(source_path)
        {
            return Err(stale());
        }
        staged.validate()?;
        Ok(staged)
    }
    pub(super) fn validate(&self) -> Result<()> {
        self.directory.validate()?;
        let path = self
            .directory
            .path
            .join(self.name.as_ref().ok_or_else(stale)?);
        if !self.proof.current(&path) {
            return Err(stale());
        }
        Ok(())
    }
    pub(super) fn publish(mut self, destination: &Path) -> Result<VerifiedFile> {
        self.validate()?;
        if destination.parent() != Some(self.directory.path.as_path()) {
            return Err(stale());
        }
        let from = name(std::ffi::OsStr::new(self.name.as_ref().ok_or_else(stale)?))?;
        let to = name(destination.file_name().ok_or_else(stale)?)?;
        #[cfg(unix)]
        let fd = self.directory.file.as_raw_fd();
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        let result =
            unsafe { libc::renameatx_np(fd, from.as_ptr(), fd, to.as_ptr(), libc::RENAME_EXCL) }
                as i64;
        // syscall is available before API30; linking renameat2 itself would
        // incorrectly raise the Android minimum API requirement from26 to30.
        #[cfg(any(target_os = "android", target_os = "linux"))]
        let result = unsafe {
            libc::syscall(
                libc::SYS_renameat2,
                fd,
                from.as_ptr(),
                fd,
                to.as_ptr(),
                libc::RENAME_NOREPLACE,
            )
        } as i64;
        #[cfg(not(any(
            target_os = "macos",
            target_os = "ios",
            target_os = "android",
            target_os = "linux"
        )))]
        let result = -1i64;
        if result != 0 {
            return Err(err("sync_media_publish", "无法原子发布独立附件路径"));
        }
        self.name = None; // Published complete file may survive a later SQL rollback.
        self.directory.validate()?;
        let after = Stamp::of(&self.proof.file.metadata()?)?;
        let mut expected = self.proof.stamp.clone();
        #[cfg(unix)]
        {
            expected.ctime = after.ctime;
        }
        if after != expected || Stamp::of(&fs::symlink_metadata(destination)?)? != after {
            return Err(stale());
        }
        self.proof.stamp = after;
        self.directory.file.sync_all()?;
        Ok(self.proof.clone())
    }
}
impl Drop for Staged {
    fn drop(&mut self) {
        let Some(stage_name) = self.name.as_ref() else {
            return;
        };
        #[cfg(unix)]
        {
            // Content may have changed on an error; identity, not content stamp,
            // authorizes unlink of only this exact owned temporary directory entry.
            let c = match name(std::ffi::OsStr::new(stage_name)) {
                Ok(c) => c,
                Err(_) => return,
            };
            let mut meta = std::mem::MaybeUninit::<libc::stat>::uninit();
            let fd = self.directory.file.as_raw_fd();
            if unsafe {
                libc::fstatat(fd, c.as_ptr(), meta.as_mut_ptr(), libc::AT_SYMLINK_NOFOLLOW)
            } != 0
            {
                return;
            }
            let meta = unsafe { meta.assume_init() };
            if let Ok(owned) = self.proof.file.metadata() {
                if meta.st_dev as u64 == owned.dev()
                    && meta.st_ino as u64 == owned.ino()
                    && (meta.st_mode & libc::S_IFMT) == libc::S_IFREG
                {
                    unsafe {
                        libc::unlinkat(fd, c.as_ptr(), 0);
                    }
                }
            }
        }
    }
}
