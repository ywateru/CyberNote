use super::{failure, Result, MAX_ARCHIVE_BYTES};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    ffi::{CStr, CString},
    fs::File,
    io::{Read, Write},
    os::fd::{AsRawFd, FromRawFd},
    os::unix::fs::MetadataExt,
    path::{Component, Path, PathBuf},
};
use uuid::Uuid;

const MAGIC: &[u8; 8] = b"CYBNBK01";
const MAX_MANIFEST: usize = 16 * 1024;
const CONFIG: &str = "local-backup.json";
const MAX_CONFIG: usize = 16 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BackupConfig {
    pub version: u8,
    pub hours: u16,
    pub keep: u8,
    /// Empty means the host-supplied default backup directory.
    pub directory: String,
}
impl Default for BackupConfig {
    fn default() -> Self {
        Self {
            version: 1,
            hours: 0,
            keep: 7,
            directory: String::new(),
        }
    }
}
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConfigPatch {
    pub hours: Option<u16>,
    pub keep: Option<u8>,
    pub directory: Option<String>,
}
impl BackupConfig {
    fn validate(&self) -> Result<()> {
        if self.version != 1
            || ![0, 1, 6, 24, 168].contains(&self.hours)
            || ![3, 7, 14, 30].contains(&self.keep)
        {
            return Err(failure(
                "backup_config",
                "备份配置损坏或版本不受支持；未覆盖原文件",
            ));
        }
        if !self.directory.is_empty() {
            validate_absolute(Path::new(&self.directory))?;
        }
        Ok(())
    }
    pub(crate) fn directory(&self, default: &Path) -> PathBuf {
        if self.directory.is_empty() {
            default.into()
        } else {
            (&self.directory).into()
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BackupReason {
    Manual,
    Automatic,
    BeforeRestore,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BackupManifest {
    pub format: String,
    pub version: u8,
    pub id: String,
    pub app_version: String,
    pub library_id: String,
    pub created_at_ms: u64,
    pub reason: BackupReason,
    pub archive_bytes: usize,
    pub sha256: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupVersion {
    pub name: String,
    pub manifest: BackupManifest,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupIssue {
    pub name: String,
    pub message: String,
}

/// Every traversal uses directory descriptors. A path replacement cannot redirect
/// reads, renames or cleanup into another directory; links are never followed.
pub(crate) struct Directory(File);
fn validate_absolute(path: &Path) -> Result<()> {
    if !path.is_absolute()
        || path
            .components()
            .any(|c| !matches!(c, Component::RootDir | Component::Normal(_)))
    {
        return Err(failure("backup_path", "备份目录必须是无上级跳转的绝对路径"));
    }
    Ok(())
}
fn cstr(name: &str) -> Result<CString> {
    CString::new(name).map_err(|_| failure("backup_path", "文件名含无效字符"))
}
fn checked_file(fd: libc::c_int) -> Result<File> {
    if fd < 0 {
        Err(std::io::Error::last_os_error().into())
    } else {
        Ok(unsafe { File::from_raw_fd(fd) })
    }
}
impl Directory {
    pub(crate) fn open(path: &Path, create: bool) -> Result<Self> {
        validate_absolute(path)?;
        let mut file = File::open("/")?;
        for component in path.components() {
            let Component::Normal(name) = component else {
                continue;
            };
            use std::os::unix::ffi::OsStrExt;
            let name = CString::new(name.as_bytes())
                .map_err(|_| failure("backup_path", "目录含无效字符"))?;
            let flags = libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW;
            let mut fd = unsafe { libc::openat(file.as_raw_fd(), name.as_ptr(), flags) };
            if fd < 0
                && create
                && std::io::Error::last_os_error().kind() == std::io::ErrorKind::NotFound
            {
                let made = unsafe { libc::mkdirat(file.as_raw_fd(), name.as_ptr(), 0o700) };
                if made < 0
                    && std::io::Error::last_os_error().kind() != std::io::ErrorKind::AlreadyExists
                {
                    return Err(std::io::Error::last_os_error().into());
                }
                file.sync_all()?;
                fd = unsafe { libc::openat(file.as_raw_fd(), name.as_ptr(), flags) };
            }
            file = checked_file(fd)?;
        }
        Ok(Self(file))
    }
    fn open_file(&self, name: &str, flags: i32) -> Result<File> {
        let name = cstr(name)?;
        let file = checked_file(unsafe {
            libc::openat(
                self.0.as_raw_fd(),
                name.as_ptr(),
                flags | libc::O_CLOEXEC | libc::O_NOFOLLOW | libc::O_NONBLOCK,
                0o600,
            )
        })?;
        let metadata = file.metadata()?;
        if !metadata.is_file()
            || metadata.nlink() != 1
            || metadata.uid() != unsafe { libc::geteuid() }
        {
            return Err(failure(
                "backup_path",
                "备份路径必须是本用户拥有的普通文件，不能是链接",
            ));
        }
        Ok(file)
    }
    pub(crate) fn read(&self, name: &str, limit: usize) -> Result<Vec<u8>> {
        let file = self.open_file(name, libc::O_RDONLY)?;
        if file.metadata()?.len() > limit as u64 {
            return Err(failure("backup_limit", "备份文件超过大小上限"));
        }
        let mut bytes = Vec::new();
        file.take(limit as u64 + 1).read_to_end(&mut bytes)?;
        if bytes.len() > limit {
            return Err(failure("backup_limit", "备份文件超过大小上限"));
        }
        Ok(bytes)
    }
    fn missing(&self, name: &str) -> Result<bool> {
        let name = cstr(name)?;
        let mut stat = std::mem::MaybeUninit::<libc::stat>::uninit();
        if unsafe {
            libc::fstatat(
                self.0.as_raw_fd(),
                name.as_ptr(),
                stat.as_mut_ptr(),
                libc::AT_SYMLINK_NOFOLLOW,
            )
        } == 0
        {
            return Ok(false);
        }
        let e = std::io::Error::last_os_error();
        if e.kind() == std::io::ErrorKind::NotFound {
            Ok(true)
        } else {
            Err(e.into())
        }
    }
    fn unlink(&self, name: &str) -> Result<()> {
        let name = cstr(name)?;
        if unsafe { libc::unlinkat(self.0.as_raw_fd(), name.as_ptr(), 0) } < 0 {
            return Err(std::io::Error::last_os_error().into());
        }
        self.0.sync_all()?;
        Ok(())
    }
    fn write_atomic(&self, name: &str, bytes: &[u8], replace: bool) -> Result<()> {
        let temp = format!(".cybernote-{}.tmp", Uuid::new_v4());
        let result = (|| {
            let mut file = self.open_file(&temp, libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL)?;
            file.write_all(bytes)?;
            file.sync_all()?;
            let from = cstr(&temp)?;
            let to = cstr(name)?;
            let status = if replace {
                unsafe {
                    libc::renameat(
                        self.0.as_raw_fd(),
                        from.as_ptr(),
                        self.0.as_raw_fd(),
                        to.as_ptr(),
                    )
                }
            } else {
                // linkat refuses an existing destination; remove only our temp.
                unsafe {
                    libc::linkat(
                        self.0.as_raw_fd(),
                        from.as_ptr(),
                        self.0.as_raw_fd(),
                        to.as_ptr(),
                        0,
                    )
                }
            };
            if status < 0 {
                return Err(std::io::Error::last_os_error().into());
            }
            if !replace {
                self.unlink(&temp)?;
            }
            self.0.sync_all()?;
            Ok(())
        })();
        if !self.missing(&temp)? {
            let _ = self.unlink(&temp);
        }
        result
    }
    fn names(&self) -> Result<Vec<String>> {
        // openat(".") creates an independent directory offset (dup would share).
        let dot = cstr(".")?;
        let fd = unsafe {
            libc::openat(
                self.0.as_raw_fd(),
                dot.as_ptr(),
                libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC,
            )
        };
        let file = checked_file(fd)?;
        use std::os::fd::IntoRawFd;
        let fd = file.into_raw_fd();
        let dir = unsafe { libc::fdopendir(fd) };
        if dir.is_null() {
            unsafe {
                libc::close(fd);
            }
            return Err(std::io::Error::last_os_error().into());
        }
        let mut names = Vec::new();
        // Reset errno to distinguish end-of-directory from an I/O error.
        let result = loop {
            #[cfg(target_os = "macos")]
            unsafe {
                *libc::__error() = 0;
            }
            #[cfg(target_os = "linux")]
            unsafe {
                *libc::__errno_location() = 0;
            }
            #[cfg(target_os = "android")]
            unsafe {
                *libc::__errno() = 0;
            }
            let entry = unsafe { libc::readdir(dir) };
            if entry.is_null() {
                let e = std::io::Error::last_os_error();
                break if e.raw_os_error() == Some(0) {
                    Ok(names)
                } else {
                    Err(e.into())
                };
            }
            let name = unsafe { CStr::from_ptr((*entry).d_name.as_ptr()) };
            if let Ok(name) = name.to_str() {
                names.push(name.to_owned());
            }
            if names.len() > 10_000 {
                break Err(failure("backup_limit", "备份目录条目超过 10,000 项上限"));
            }
        };
        unsafe {
            libc::closedir(dir);
        }
        result
    }
    fn lock(&self) -> Result<File> {
        let file = self.open_file(".cybernote-backup.lock", libc::O_RDWR | libc::O_CREAT)?;
        file.try_lock_exclusive()
            .map_err(|_| failure("backup_busy", "另一个备份操作正在使用此目录"))?;
        Ok(file)
    }
}

pub(crate) fn load_config(root: &Directory) -> Result<(BackupConfig, Option<Vec<u8>>)> {
    if root.missing(CONFIG)? {
        return Ok((BackupConfig::default(), None));
    }
    if root.open_file(CONFIG, libc::O_RDONLY)?.metadata()?.mode() & 0o777 != 0o600 {
        return Err(failure(
            "backup_config_permissions",
            "备份配置权限必须为 0600；未读取或覆盖原文件",
        ));
    }
    let bytes = root.read(CONFIG, MAX_CONFIG)?;
    let config: BackupConfig = serde_json::from_slice(&bytes)?;
    config.validate()?;
    Ok((config, Some(bytes)))
}
pub(crate) fn configure(
    root: &Directory,
    patch: ConfigPatch,
    default: &Path,
) -> Result<BackupConfig> {
    let _lock = root.lock()?;
    let (mut config, before) = load_config(root)?;
    if let Some(value) = patch.hours {
        config.hours = value;
    }
    if let Some(value) = patch.keep {
        config.keep = value;
    }
    if let Some(value) = patch.directory {
        config.directory = value;
    }
    config.validate()?;
    // Validate/create the destination before committing the setting.
    Directory::open(&config.directory(default), true)?;
    let bytes = serde_json::to_vec(&config)?;
    if before.as_deref() == Some(bytes.as_slice()) {
        return Ok(config);
    }
    // Catch a concurrent editor, even one that does not cooperate with our lock.
    let (_, current) = load_config(root)?;
    if current != before {
        return Err(failure(
            "backup_config_changed",
            "备份配置已被其他操作修改，请重新读取",
        ));
    }
    root.write_atomic(CONFIG, &bytes, true)?;
    Ok(config)
}
fn valid_name(name: &str) -> bool {
    name.strip_prefix("cybernote-")
        .and_then(|n| n.strip_suffix(".cyberbackup"))
        .is_some_and(|id| Uuid::parse_str(id).is_ok_and(|u| u.to_string() == id))
}
pub(crate) fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub(crate) fn read_backup(dir: &Directory, name: &str) -> Result<(BackupVersion, Vec<u8>)> {
    if !valid_name(name) {
        return Err(failure("backup_path", "备份名称无效"));
    }
    let data = dir.read(name, MAX_ARCHIVE_BYTES + MAX_MANIFEST + 12)?;
    decode_backup(name, &data)
}
fn decode_backup(name: &str, data: &[u8]) -> Result<(BackupVersion, Vec<u8>)> {
    if data.len() < 12 || &data[..8] != MAGIC {
        return Err(failure("backup_corrupt", "备份标识损坏"));
    }
    let size = u32::from_le_bytes(data[8..12].try_into().unwrap()) as usize;
    if size > MAX_MANIFEST || data.len() < 12 + size {
        return Err(failure("backup_corrupt", "备份清单长度无效"));
    }
    let manifest: BackupManifest = serde_json::from_slice(&data[12..12 + size])?;
    let bytes = &data[12 + size..];
    verify_manifest(name, &manifest, bytes.len(), &digest(bytes))?;
    Ok((
        BackupVersion {
            name: name.into(),
            manifest,
        },
        bytes.to_vec(),
    ))
}
fn verify_manifest(
    name: &str,
    manifest: &BackupManifest,
    length: usize,
    sha256: &str,
) -> Result<()> {
    if manifest.format != "cybernote-local-backup"
        || manifest.version != 1
        || name != format!("cybernote-{}.cyberbackup", manifest.id)
        || manifest.library_id.is_empty()
        || manifest.library_id.len() > 256
        || manifest.app_version.is_empty()
        || manifest.app_version.len() > 128
        || manifest.created_at_ms > 8_640_000_000_000_000
        || length == 0
        || length > MAX_ARCHIVE_BYTES
        || length != manifest.archive_bytes
        || sha256 != manifest.sha256
    {
        return Err(failure(
            "backup_corrupt",
            "备份清单或 SHA-256 校验失败；未修改任何数据",
        ));
    }
    Ok(())
}
fn read_version(dir: &Directory, name: &str) -> Result<BackupVersion> {
    // Listings still hash every byte; they never trust size/mtime cache hits.
    // Stream the body so a settings refresh does not allocate each whole archive.
    let mut file = dir.open_file(name, libc::O_RDONLY)?;
    if file.metadata()?.len() > (MAX_ARCHIVE_BYTES + MAX_MANIFEST + 12) as u64 {
        return Err(failure("backup_limit", "备份文件超过大小上限"));
    }
    let mut prefix = [0u8; 12];
    file.read_exact(&mut prefix)?;
    if &prefix[..8] != MAGIC {
        return Err(failure("backup_corrupt", "备份标识损坏"));
    }
    let size = u32::from_le_bytes(prefix[8..].try_into().unwrap()) as usize;
    if size > MAX_MANIFEST {
        return Err(failure("backup_corrupt", "备份清单长度无效"));
    }
    let mut header = vec![0u8; size];
    file.read_exact(&mut header)?;
    let manifest = serde_json::from_slice(&header)?;
    let mut hash = Sha256::new();
    let mut length = 0;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        length += count;
        if length > MAX_ARCHIVE_BYTES {
            return Err(failure("backup_limit", "备份文件超过大小上限"));
        }
        hash.update(&buffer[..count]);
    }
    verify_manifest(name, &manifest, length, &format!("{:x}", hash.finalize()))?;
    Ok(BackupVersion {
        name: name.into(),
        manifest,
    })
}
pub(crate) fn list(
    dir: &Directory,
    library: &str,
) -> Result<(Vec<BackupVersion>, Vec<BackupIssue>)> {
    let mut versions = Vec::new();
    let mut issues = Vec::new();
    for name in dir.names()? {
        if name.starts_with(".cybernote-prune-") {
            issues.push(BackupIssue {
                name,
                message: "清理时文件发生变化，已隔离保留，请检查原文件".into(),
            });
            continue;
        }
        if !valid_name(&name) {
            continue;
        }
        match read_version(dir, &name) {
            Ok(version) if version.manifest.library_id == library => versions.push(version),
            Ok(_) => {} // Another library's backups remain untouched.
            Err(error) => issues.push(BackupIssue {
                name,
                message: error.message,
            }),
        }
    }
    versions.sort_by(|a, b| {
        b.manifest
            .created_at_ms
            .cmp(&a.manifest.created_at_ms)
            .then_with(|| b.name.cmp(&a.name))
    });
    Ok((versions, issues))
}
pub(crate) fn publish(
    dir: &Directory,
    bytes: &[u8],
    library: &str,
    app_version: &str,
    now: u64,
    reason: BackupReason,
    keep: u8,
) -> Result<BackupVersion> {
    if bytes.is_empty()
        || bytes.len() > MAX_ARCHIVE_BYTES
        || library.is_empty()
        || library.len() > 256
        || app_version.is_empty()
        || app_version.len() > 128
        || ![3, 7, 14, 30].contains(&keep)
    {
        return Err(failure("backup_limit", "归档内容或库身份无效"));
    }
    let _lock = dir.lock()?;
    let id = Uuid::new_v4().to_string();
    let name = format!("cybernote-{id}.cyberbackup");
    let manifest = BackupManifest {
        format: "cybernote-local-backup".into(),
        version: 1,
        id,
        app_version: app_version.into(),
        library_id: library.into(),
        created_at_ms: now,
        reason,
        archive_bytes: bytes.len(),
        sha256: digest(bytes),
    };
    let header = serde_json::to_vec(&manifest)?;
    let mut data = Vec::with_capacity(12 + header.len() + bytes.len());
    data.extend_from_slice(MAGIC);
    data.extend_from_slice(&(header.len() as u32).to_le_bytes());
    data.extend_from_slice(&header);
    data.extend_from_slice(bytes);
    dir.write_atomic(&name, &data, false)?;
    // Re-read and verify successful publication before considering retention.
    let (version, _) = read_backup(dir, &name)?;
    let (versions, _) = list(dir, library)?;
    // Always retain the just-published version, including under clock rollback.
    let mut retained = 1usize;
    for old in versions.into_iter().filter(|v| v.name != name) {
        if retained < keep as usize {
            retained += 1;
            continue;
        }
        prune_verified(dir, &old)?;
    }
    Ok(version)
}

fn prune_verified(dir: &Directory, old: &BackupVersion) -> Result<()> {
    // Pin the entry with an atomic move BEFORE revalidation. If an external
    // process replaced it since listing, preserve its bytes/links as evidence;
    // never unlink an unverified entry at the old name after a TOCTOU gap.
    let quarantine = format!(".cybernote-prune-{}", Uuid::new_v4());
    let from = cstr(&old.name)?;
    let to = cstr(&quarantine)?;
    if unsafe {
        libc::renameat(
            dir.0.as_raw_fd(),
            from.as_ptr(),
            dir.0.as_raw_fd(),
            to.as_ptr(),
        )
    } < 0
    {
        return Err(std::io::Error::last_os_error().into());
    }
    dir.0.sync_all()?;
    let verified = dir
        .read(&quarantine, MAX_ARCHIVE_BYTES + MAX_MANIFEST + 12)
        .and_then(|data| decode_backup(&old.name, &data));
    match verified {
        Ok((verified, _)) if verified.manifest == old.manifest => dir.unlink(&quarantine),
        _ => {
            // Restore the original name without replacing an intervening file.
            // linkat with flags=0 links a symlink itself, never its target.
            if unsafe {
                libc::linkat(
                    dir.0.as_raw_fd(),
                    to.as_ptr(),
                    dir.0.as_raw_fd(),
                    from.as_ptr(),
                    0,
                )
            } == 0
            {
                dir.unlink(&quarantine)?;
            }
            Ok(())
        }
    }
}
