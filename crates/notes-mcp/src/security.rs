//! No-follow directory-handle traversal; never logs file contents or paths.
use serde::Deserialize;
use std::{
    ffi::CString,
    fs::File,
    io::Read,
    os::{
        fd::{AsRawFd, FromRawFd},
        unix::fs::MetadataExt,
    },
    path::{Component, Path, PathBuf},
};
use uuid::Uuid;
use zeroize::Zeroizing;

#[derive(Clone)]
pub struct Config {
    pub workspace_id: String,
    pub credential_ref: Uuid,
    pub runtime_dir: PathBuf,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    version: u32,
    workspace_id: String,
    client_id: String,
    credential: String,
    socket_path: PathBuf,
}
impl Drop for Record {
    fn drop(&mut self) {
        use zeroize::Zeroize;
        self.credential.zeroize();
    }
}
pub struct Access {
    record: Record,
    runtime: File,
    parent: File,
    socket_name: CString,
    socket_identity: (u64, u64),
}
pub type Check<T> = Result<T, &'static str>;
/// sockaddr_un::sun_path must include a trailing NUL; count filesystem bytes, not chars.
pub fn socket_path_fits(path: &Path) -> bool {
    use std::os::unix::ffi::OsStrExt;
    // SAFETY: sockaddr_un is a C struct of integers/byte arrays, all zero is valid.
    let address: libc::sockaddr_un = unsafe { std::mem::zeroed() };
    !path.as_os_str().as_bytes().contains(&0)
        && path.as_os_str().as_bytes().len() < address.sun_path.len()
}

fn cstr(s: &std::ffi::OsStr) -> Check<CString> {
    use std::os::unix::ffi::OsStrExt;
    CString::new(s.as_bytes()).map_err(|_| "invalid local path")
}
fn open_at(dir: &File, name: &CString, flags: i32) -> Check<File> {
    // SAFETY: borrowed fd and NUL-terminated path; success transfers a fresh fd.
    let fd = unsafe {
        libc::openat(
            dir.as_raw_fd(),
            name.as_ptr(),
            flags | libc::O_NOFOLLOW | libc::O_CLOEXEC | libc::O_NONBLOCK,
        )
    };
    if fd < 0 {
        return Err("private endpoint unavailable");
    }
    Ok(unsafe { File::from_raw_fd(fd) })
}
fn private(file: &File, dir: bool) -> Check<()> {
    let m = file
        .metadata()
        .map_err(|_| "private metadata unavailable")?;
    if m.uid() != unsafe { libc::geteuid() }
        || m.mode() & 0o7777 != if dir { 0o700 } else { 0o600 }
        || if dir {
            !m.is_dir()
        } else {
            !m.is_file() || m.nlink() != 1
        }
    {
        return Err("unsafe private permissions or type");
    }
    Ok(())
}
fn directory(path: &Path) -> Check<File> {
    if !path.is_absolute() {
        return Err("absolute runtime directory required");
    }
    let mut dir = File::open("/").map_err(|_| "root unavailable")?;
    for part in path.components() {
        match part {
            Component::RootDir => {}
            Component::Normal(s) => {
                dir = open_at(&dir, &cstr(s)?, libc::O_RDONLY | libc::O_DIRECTORY)?
            }
            _ => return Err("noncanonical local path"),
        }
    }
    private(&dir, true)?;
    Ok(dir)
}
fn identity(f: &File) -> Check<(u64, u64)> {
    let m = f.metadata().map_err(|_| "private metadata unavailable")?;
    Ok((m.dev(), m.ino()))
}
#[allow(clippy::unnecessary_cast)] // dev_t/ino_t widths differ between Unix targets.
fn socket_stat(parent: &File, name: &CString) -> Check<(u64, u64)> {
    let mut s = std::mem::MaybeUninit::<libc::stat>::uninit();
    // SAFETY: fstatat initializes stat on success; no symlink following.
    if unsafe {
        libc::fstatat(
            parent.as_raw_fd(),
            name.as_ptr(),
            s.as_mut_ptr(),
            libc::AT_SYMLINK_NOFOLLOW,
        )
    } != 0
    {
        return Err("host socket unavailable");
    }
    let s = unsafe { s.assume_init() };
    if s.st_uid != unsafe { libc::geteuid() }
        || s.st_mode & libc::S_IFMT != libc::S_IFSOCK
        || s.st_mode & 0o7777 != 0o600
    {
        return Err("unsafe host socket");
    }
    Ok((s.st_dev as u64, s.st_ino as u64))
}
impl Access {
    pub fn load(c: &Config) -> Check<Self> {
        let runtime = directory(&c.runtime_dir)?;
        let credentials = open_at(
            &runtime,
            &CString::new("credentials").unwrap(),
            libc::O_RDONLY | libc::O_DIRECTORY,
        )?;
        private(&credentials, true)?;
        let name = CString::new(format!("{}.json", c.credential_ref)).unwrap();
        let mut f = open_at(&credentials, &name, libc::O_RDONLY)?;
        private(&f, false)?;
        let mut bytes = Zeroizing::new(Vec::new());
        (&mut f)
            .take(64 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "credential read failed")?;
        if bytes.len() > 64 * 1024 {
            return Err("credential too large");
        }
        let record: Record =
            serde_json::from_slice(&bytes).map_err(|_| "invalid private credential record")?;
        if record.version != 1 {
            return Err("unsupported credential record version");
        }
        if record.workspace_id != c.workspace_id {
            return Err("workspace credential mismatch");
        }
        if record.client_id.is_empty()
            || record.client_id.len() > 1024
            || record.credential.is_empty()
            || record.credential.len() > 8192
        {
            return Err("invalid private credential identity");
        }
        if !socket_path_fits(&record.socket_path) {
            return Err("host socket path too long");
        }
        let relative = record
            .socket_path
            .strip_prefix(&c.runtime_dir)
            .map_err(|_| "socket outside private runtime")?;
        let parts = relative.components().collect::<Vec<_>>();
        if parts.is_empty() || parts.iter().any(|p| !matches!(p, Component::Normal(_))) {
            return Err("invalid host socket path");
        }
        let mut parent = runtime
            .try_clone()
            .map_err(|_| "private directory unavailable")?;
        for p in &parts[..parts.len() - 1] {
            parent = open_at(
                &parent,
                &cstr(p.as_os_str())?,
                libc::O_RDONLY | libc::O_DIRECTORY,
            )?;
            private(&parent, true)?;
        }
        let socket_name = cstr(parts.last().unwrap().as_os_str())?;
        let socket_identity = socket_stat(&parent, &socket_name)?;
        Ok(Self {
            record,
            runtime,
            parent,
            socket_name,
            socket_identity,
        })
    }
    pub fn socket_path(&self) -> &Path {
        &self.record.socket_path
    }
    pub fn client_id(&self) -> &str {
        &self.record.client_id
    }
    pub fn credential(&self) -> &str {
        &self.record.credential
    }
    pub fn recheck(&self, c: &Config) -> Check<()> {
        let current = Self::load(c)?;
        if identity(&current.runtime)? != identity(&self.runtime)?
            || identity(&current.parent)? != identity(&self.parent)?
            || current.socket_identity != self.socket_identity
            || socket_stat(&self.parent, &self.socket_name)? != self.socket_identity
            || current.record.client_id != self.record.client_id
            || current.record.credential != self.record.credential
        {
            return Err("private endpoint identity changed");
        }
        Ok(())
    }
}
impl Config {
    pub fn parse(args: impl IntoIterator<Item = String>) -> Check<Self> {
        let mut args = args.into_iter();
        let mut workspace = None;
        let mut reference = None;
        let mut runtime = None;
        while let Some(arg) = args.next() {
            let slot = match arg.as_str() {
                "--workspace-id" => &mut workspace,
                "--credential-ref" => &mut reference,
                "--runtime-dir" => &mut runtime,
                _ => return Err("unknown CLI option"),
            };
            if slot.is_some() {
                return Err("duplicate CLI option");
            }
            *slot = Some(
                args.next()
                    .filter(|v| !v.is_empty() && !v.starts_with("--"))
                    .ok_or("missing CLI value")?,
            );
        }
        let workspace_id = workspace
            .filter(|s| s.len() <= 1024)
            .ok_or("--workspace-id is required")?;
        let credential_ref = reference
            .and_then(|s| Uuid::parse_str(&s).ok())
            .ok_or("--credential-ref UUID is required")?;
        let runtime_dir = match runtime {
            Some(p) => PathBuf::from(p),
            None => default_runtime()?,
        };
        if !runtime_dir.is_absolute()
            || runtime_dir
                .components()
                .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
        {
            return Err("absolute runtime directory required");
        }
        Ok(Self {
            workspace_id,
            credential_ref,
            runtime_dir,
        })
    }
}
fn default_runtime() -> Check<PathBuf> {
    // Resolve the effective user's home through the OS account database, not a caller-supplied HOME.
    let mut storage = vec![0u8; 16 * 1024];
    let mut pw = std::mem::MaybeUninit::<libc::passwd>::uninit();
    let mut result = std::ptr::null_mut();
    let rc = unsafe {
        libc::getpwuid_r(
            libc::geteuid(),
            pw.as_mut_ptr(),
            storage.as_mut_ptr().cast(),
            storage.len(),
            &mut result,
        )
    };
    if rc != 0 || result.is_null() {
        return Err("user home unavailable");
    }
    let pw = unsafe { pw.assume_init() };
    let home = unsafe { std::ffi::CStr::from_ptr(pw.pw_dir) }
        .to_str()
        .map_err(|_| "invalid user home")?;
    #[cfg(target_os = "macos")]
    let base = PathBuf::from(home).join("Library/Application Support");
    #[cfg(not(target_os = "macos"))]
    let base = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .unwrap_or_else(|| PathBuf::from(home).join(".local/share"));
    Ok(base.join("com.local.notesclone/agent-runtime"))
}
