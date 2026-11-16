//! Native startup policy. Store itself allows multiple connections (including in
//! tests); the App must retain this directory lease until its event loop exits.
use sha2::{Digest, Sha256};
use std::{
    ffi::OsString,
    fs::{self, File, OpenOptions},
    io,
    path::{Path, PathBuf},
};

#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct Options {
    pub data_dir: Option<PathBuf>,
    pub agent_runtime_dir: Option<PathBuf>,
}

impl Options {
    /// Arguments after argv[0]. Validate the entire input before any filesystem IO.
    pub(crate) fn parse(args: impl IntoIterator<Item = OsString>) -> io::Result<Self> {
        let mut args = args.into_iter();
        let mut options = Self::default();
        while let Some(arg) = args.next() {
            if arg != "--data-dir" && arg != "--agent-runtime-dir" {
                return Err(invalid(
                    "unknown argument; usage: CyberNote [--data-dir /absolute/path] [--agent-runtime-dir /absolute/path]",
                ));
            }
            let slot = if arg == "--data-dir" {
                &mut options.data_dir
            } else {
                &mut options.agent_runtime_dir
            };
            if slot.is_some() {
                return Err(invalid("directory option may only be specified once"));
            }
            let value = args
                .next()
                .ok_or_else(|| invalid("directory option requires an absolute path"))?;
            let path = PathBuf::from(value);
            if path.as_os_str().is_empty() || !path.is_absolute() {
                return Err(invalid(
                    "directory option requires a nonempty absolute path",
                ));
            }
            *slot = Some(path);
        }
        Ok(options)
    }
}

#[derive(Debug)]
pub(crate) struct Workspace {
    pub root: PathBuf,
    pub media_cache: PathBuf,
    // Never unlink this file: a new inode would let another process bypass flock.
    _lock: File,
}

impl Workspace {
    pub(crate) fn open(
        options: &Options,
        default_data: &Path,
        default_cache: &Path,
    ) -> io::Result<Self> {
        let requested = options.data_dir.as_deref().unwrap_or(default_data);
        if !requested.is_absolute() {
            return Err(invalid("data directory must be absolute"));
        }
        create_directory(requested)?;
        // /tmp vs /private/tmp and symlink aliases must resolve to one lease.
        let root = requested.canonicalize()?;
        let mut lock_options = OpenOptions::new();
        lock_options.read(true).write(true).create(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            lock_options
                .mode(0o600)
                .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC);
        }
        let lock = lock_options.open(root.join(".app.lock"))?;
        if !lock.metadata()?.is_file() {
            return Err(invalid("data directory lock is not a regular file"));
        }
        fs2::FileExt::try_lock_exclusive(&lock).map_err(|error| {
            io::Error::new(
                error.kind(),
                format!(
                    "cannot lock data directory {} (already in use or unavailable): {error}",
                    root.display()
                ),
            )
        })?;
        writable(&root)?;
        if options.data_dir.is_some() {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&root, fs::Permissions::from_mode(0o700))?;
            }
        }
        let media_cache = if options.data_dir.is_some() {
            create_directory(default_cache)?;
            let cache = default_cache.canonicalize()?;
            if cache.starts_with(&root) {
                return Err(invalid("media cache must be outside the data directory"));
            }
            let workspaces = cache.join("workspaces");
            private_directory(&workspaces)?;
            let cache = custom_cache_directory(&root, &cache);
            private_directory(&cache)?;
            cache.join("attachment-thumbnails-v1")
        } else {
            default_cache.join("attachment-thumbnails-v1")
        };
        private_directory(&media_cache)?;
        writable(&media_cache)?;
        // Do this before opening SQLite, including rejecting redirected sources.
        private_directory(&root.join("attachments"))?;
        Ok(Self {
            root,
            media_cache,
            _lock: lock,
        })
    }
}

fn custom_cache_directory(canonical_root: &Path, cache: &Path) -> PathBuf {
    // Use native OS bytes, not a lossy display string (distinct non-UTF8 roots
    // must not share a cache). Canonical aliases deliberately share this key.
    let key = Sha256::digest(canonical_root.as_os_str().as_encoded_bytes());
    cache.join("workspaces").join(format!("{key:x}"))
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}

fn create_directory(path: &Path) -> io::Result<()> {
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(path)
}

fn private_directory(path: &Path) -> io::Result<()> {
    create_directory(path)?;
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(invalid("workspace subdirectory must be a real directory"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

fn writable(path: &Path) -> io::Result<()> {
    let probe = path.join(format!(".startup-{}.tmp", uuid::Uuid::new_v4()));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let file = options.open(&probe)?;
    drop(file);
    fs::remove_file(probe)
}

#[cfg(test)]
#[path = "startup_tests.rs"]
mod tests;
