use super::*;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
};
/// Bounded transport staging survives interrupted connections. Final publication belongs to
/// the backend's hash-checked immutable blob store; no remote-controlled filesystem path exists.
pub(super) struct Staging {
    dir: PathBuf,
    lock: Mutex<()>,
}
impl Staging {
    pub fn open(dir: PathBuf) -> Result<Self> {
        if let Ok(m) = fs::symlink_metadata(&dir) {
            if !m.is_dir() || m.file_type().is_symlink() {
                return Err(SyncError::Io);
            }
        }
        fs::create_dir_all(&dir).map_err(|_| SyncError::Io)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&dir, fs::Permissions::from_mode(0o700))
                .map_err(|_| SyncError::Io)?;
        }
        let s = Self {
            dir,
            lock: Mutex::new(()),
        };
        s.budget(0, 0)?;
        Ok(s)
    }
    fn path(&self, b: &BlobRef) -> PathBuf {
        self.dir.join(format!("{}-{}.part", b.sha256, b.size))
    }
    fn budget(&self, extra: u64, files: usize) -> Result<()> {
        let mut total = extra;
        let mut count = files;
        for e in fs::read_dir(&self.dir).map_err(|_| SyncError::Io)? {
            let e = e.map_err(|_| SyncError::Io)?;
            let m = fs::symlink_metadata(e.path()).map_err(|_| SyncError::Io)?;
            if !m.is_file() || m.file_type().is_symlink() {
                return Err(SyncError::Io);
            }
            count += 1;
            total = total.checked_add(m.len()).ok_or(SyncError::Limit)?;
        }
        if count > 4 || total > 512 * 1024 * 1024 {
            return Err(SyncError::Limit);
        }
        Ok(())
    }
    fn offset_inner(&self, backend: &dyn SyncBackend, b: &BlobRef) -> Result<u64> {
        if backend.has_blob(b)? {
            return Ok(b.size);
        }
        match fs::symlink_metadata(self.path(b)) {
            Ok(m) => {
                if !m.is_file() || m.file_type().is_symlink() || m.len() > b.size {
                    return Err(SyncError::Io);
                }
                Ok(m.len())
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(0),
            Err(_) => Err(SyncError::Io),
        }
    }
    pub fn offset(&self, backend: &dyn SyncBackend, b: &BlobRef) -> Result<u64> {
        let _g = self.lock.lock().map_err(|_| SyncError::Io)?;
        self.offset_inner(backend, b)
    }
    pub fn write(
        &self,
        backend: &dyn SyncBackend,
        b: &BlobRef,
        offset: u64,
        bytes: &[u8],
        finish: bool,
    ) -> Result<u64> {
        let _g = self.lock.lock().map_err(|_| SyncError::Io)?;
        if backend.has_blob(b)? {
            return Ok(b.size);
        }
        if bytes.len() > CHUNK || offset != self.offset_inner(backend, b)? {
            return Err(SyncError::Protocol);
        }
        let end = offset
            .checked_add(bytes.len() as u64)
            .filter(|n| *n <= b.size)
            .ok_or(SyncError::Protocol)?;
        if finish != (end == b.size) || (!finish && bytes.is_empty()) {
            return Err(SyncError::Protocol);
        }
        self.budget(bytes.len() as u64, usize::from(!self.path(b).exists()))?;
        let path = self.path(b);
        let mut opts = OpenOptions::new();
        opts.write(true).append(true);
        if path.exists() {
            opts.create(false);
        } else {
            opts.create_new(true);
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            opts.mode(0o600);
        }
        let mut f = opts.open(&path).map_err(|_| SyncError::Io)?;
        f.write_all(bytes).map_err(|_| SyncError::Io)?;
        if finish {
            f.sync_all().map_err(|_| SyncError::Io)?;
            drop(f);
            let mut f = File::open(&path).map_err(|_| SyncError::Io)?;
            let mut h = Sha256::new();
            let mut buf = [0u8; 64 * 1024];
            loop {
                let n = f.read(&mut buf).map_err(|_| SyncError::Io)?;
                if n == 0 {
                    break;
                }
                h.update(&buf[..n]);
            }
            if format!("{:x}", h.finalize()) != b.sha256 {
                fs::remove_file(&path).map_err(|_| SyncError::Io)?;
                return Err(SyncError::Protocol);
            }
            backend.store_blob(b, &path)?;
            if !backend.has_blob(b)? {
                return Err(SyncError::Backend);
            }
            fs::remove_file(&path).map_err(|_| SyncError::Io)?;
            File::open(&self.dir)
                .and_then(|f| f.sync_all())
                .map_err(|_| SyncError::Io)?;
        }
        Ok(end)
    }
}
