use super::*;
use sha2::{Digest, Sha256};
use std::{
    fs::{File, OpenOptions},
    io::Write,
};
fn safe_directory(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.is_dir() && !meta.file_type().is_symlink() => Ok(()),
        Ok(_) => Err(invalid("同步目录不是安全的本地目录")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir(path)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
            }
            Ok(())
        }
        Err(e) => Err(e.into()),
    }
}
/// A local capability, never deserialized or supplied by IPC/the peer. Both the
/// transport and publisher derive their directory from this same value.
#[derive(Clone)]
pub(crate) struct NetworkStaging {
    root: PathBuf,
    namespace: StagingNamespace,
}
#[derive(Clone)]
enum StagingNamespace {
    Manual,
    Account(uuid::Uuid),
}
impl NetworkStaging {
    pub(crate) fn manual(root: &Path) -> Self {
        Self {
            root: root.into(),
            namespace: StagingNamespace::Manual,
        }
    }
    pub(crate) fn account(root: &Path, device: &str) -> Result<Self> {
        let id = uuid::Uuid::parse_str(device)
            .ok()
            .filter(|id| id.to_string() == device)
            .ok_or_else(|| invalid("账户暂存设备无效"))?;
        Ok(Self {
            root: root.into(),
            namespace: StagingNamespace::Account(id),
        })
    }
    pub(crate) fn matches_device(&self, device: &str) -> bool {
        match self.namespace {
            StagingNamespace::Manual => true,
            StagingNamespace::Account(id) => id.to_string() == device,
        }
    }
    fn directories(&self) -> Vec<PathBuf> {
        match self.namespace {
            StagingNamespace::Manual => vec![
                self.root.join(".sync"),
                self.root.join(".sync/network-staging"),
            ],
            StagingNamespace::Account(id) => vec![
                self.root.join(".account"),
                self.root.join(".account/staging"),
                self.root.join(".account/staging").join(id.to_string()),
            ],
        }
    }
    fn check_directory(path: &Path) -> Result<()> {
        let meta = fs::symlink_metadata(path)?;
        if !meta.is_dir() || meta.file_type().is_symlink() {
            return Err(invalid("同步暂存目录无效"));
        }
        Ok(())
    }
    pub(crate) fn prepare(&self) -> Result<PathBuf> {
        Self::check_directory(&self.root)?;
        let directories = self.directories();
        for directory in &directories {
            safe_directory(directory)?;
        }
        Ok(directories.last().expect("fixed staging directory").clone())
    }
    fn checked_directory(&self, root: &Path) -> Result<PathBuf> {
        if self.root != root {
            return Err(invalid("同步暂存根目录不匹配"));
        }
        Self::check_directory(root)?;
        let directories = self.directories();
        for directory in &directories {
            Self::check_directory(directory)?;
        }
        Ok(directories.last().expect("fixed staging directory").clone())
    }
}
pub(super) fn sync_dir(path: &Path) -> Result<()> {
    #[cfg(unix)]
    File::open(path)?.sync_all()?;
    Ok(())
}
pub(super) fn hash_file(path: &Path) -> Result<(String, u64)> {
    let meta = fs::symlink_metadata(path)?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > MAX_BLOB {
        return Err(invalid("blob不是有界普通文件"));
    }
    let mut f = File::open(path)?;
    let mut hash = Sha256::new();
    let mut length = 0u64;
    let mut buffer = [0u8; 65536];
    loop {
        let n = f.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        length += n as u64;
        if length > MAX_BLOB {
            return Err(limit("blob超限"));
        }
        hash.update(&buffer[..n]);
    }
    Ok((format!("{:x}", hash.finalize()), length))
}
impl Store {
    pub(super) fn sync_directories(&self) -> Result<()> {
        safe_directory(&self.root.join(".sync"))?;
        safe_directory(&self.root.join(".sync/blobs"))?;
        safe_directory(&self.root.join(".sync/staging"))?;
        // Stable infrastructure belongs to opt-in/recovery, so a failed blob
        // validation cannot introduce an otherwise absent publication lock.
        BlobStorage {
            root: self.root.clone(),
        }
        .publication_file()?;
        Ok(())
    }
    pub(in crate::store) fn sync_recover_staging(&self) -> Result<()> {
        if !enabled(&self.db)? {
            return Ok(());
        }
        self.sync_directories()?;
        for entry in fs::read_dir(self.root.join(".sync/staging"))? {
            let entry = entry?;
            let meta = fs::symlink_metadata(entry.path())?;
            if !meta.is_file() || meta.file_type().is_symlink() {
                return Err(invalid("同步暂存目录含未知对象"));
            }
            fs::remove_file(entry.path())?;
        }
        sync_dir(&self.root.join(".sync/staging"))
    }
    pub(crate) fn sync_blob_storage(&self) -> Result<BlobStorage> {
        if !enabled(&self.db)? {
            return Err(err("sync_disabled", "尚未开启同步"));
        }
        Ok(BlobStorage {
            root: self.root.clone(),
        })
    }
    pub fn sync_blob_path(&self, hash: &str) -> Result<PathBuf> {
        if let Some(media) = &self.sync_media {
            return media.blob_path(hash);
        }
        self.sync_blob_storage()?.sync_blob_path(hash)
    }
    pub fn sync_store_blob(&self, hash: &str, size: u64, reader: impl Read) -> Result<()> {
        self.sync_blob_storage()?
            .sync_store_blob(hash, size, reader)
    }
    pub(super) fn capture_blob(&self, attachment: &Attachment) -> Result<String> {
        if let Some(media) = &self.sync_media {
            let (hash, size) = self.sync_local_hash(attachment)?;
            if !media.has_blob(&BlobRef {
                hash: hash.clone(),
                size,
            })? {
                return Err(err("sync_missing_blob", "本地媒体尚未在锁外完成capture"));
            }
            return Ok(hash);
        }
        let source = self.attachment_path(&attachment.relative_path)?;
        let (hash, size) = hash_file(&source)?;
        if size != attachment.size {
            return Err(err("sync_blob_corrupt", "本地附件实际长度与登记不符"));
        }
        self.sync_store_blob(&hash, size, File::open(source)?)?;
        Ok(hash)
    }
    pub(super) fn has_blob(&self, reference: &BlobRef) -> Result<bool> {
        if let Some(media) = &self.sync_media {
            return media.has_blob(reference);
        }
        let path = self
            .root
            .join(".sync/blobs")
            .join(format!("{}.blob", reference.hash));
        match fs::symlink_metadata(&path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(e) => Err(e.into()),
            Ok(_) => {
                let (hash, size) = hash_file(&path)?;
                if hash != reference.hash || size != reference.size {
                    return Err(err("sync_blob_corrupt", "持久blob已损坏"));
                }
                Ok(true)
            }
        }
    }
}

/// An application-owned filesystem capability. Contains no SQLite or Session
/// reference, so hashing/copying a large local file never holds their mutex.
#[derive(Clone)]
pub(crate) struct BlobStorage {
    pub(super) root: PathBuf,
}
impl BlobStorage {
    fn publication_file(&self) -> Result<File> {
        self.sync_directories()?;
        let path = self.root.join(".sync/blob-publish.lock");
        match fs::symlink_metadata(&path) {
            Ok(meta) if !meta.is_file() || meta.file_type().is_symlink() || meta.len() != 0 => {
                return Err(invalid("同步发布锁不是安全的本地文件"));
            }
            Ok(_) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(e) => return Err(e.into()),
        }
        let mut options = OpenOptions::new();
        options.create(true).truncate(false).read(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let file = options.open(&path)?;
        let current = fs::symlink_metadata(path)?;
        if !current.is_file() || current.file_type().is_symlink() || current.len() != 0 {
            return Err(invalid("同步发布锁不是安全的本地文件"));
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            let opened = file.metadata()?;
            if opened.dev() != current.dev() || opened.ino() != current.ino() {
                return Err(invalid("同步发布锁身份已变化"));
            }
        }
        Ok(file)
    }
    fn publication_guard(&self) -> Result<File> {
        let file = self.publication_file()?;
        fs2::FileExt::lock_exclusive(&file)?;
        Ok(file)
    }
    /// Only the transport-owned, bounded stage capability may be moved. The
    /// caller holds the transport's stage mutex throughout this operation.
    pub(crate) fn publish_staged(
        &self,
        staging: &NetworkStaging,
        hash: &str,
        size: u64,
        source: &Path,
    ) -> Result<()> {
        if !valid_hash(hash) || size > MAX_BLOB {
            return Err(invalid("blob引用无效"));
        }
        let directory = staging.checked_directory(&self.root)?;
        if source.parent() != Some(directory.as_path())
            || source.file_name() != Some(std::ffi::OsStr::new(&format!("{hash}-{size}.part")))
        {
            return Err(invalid("同步发布不是受控暂存文件"));
        }
        let meta = fs::symlink_metadata(&directory)?;
        if !meta.is_dir() || meta.file_type().is_symlink() {
            return Err(invalid("同步暂存目录无效"));
        }
        let before = fs::symlink_metadata(source)?;
        if !before.is_file() || before.file_type().is_symlink() || before.len() != size {
            return Err(invalid("同步暂存文件无效"));
        }
        let mut file = File::open(source)?;
        fn same(a: &fs::Metadata, b: &fs::Metadata) -> bool {
            #[cfg(unix)]
            {
                use std::os::unix::fs::MetadataExt;
                a.dev() == b.dev() && a.ino() == b.ino() && a.len() == b.len()
            }
            #[cfg(not(unix))]
            {
                a.len() == b.len() && a.modified().ok() == b.modified().ok()
            }
        }
        fn stable(a: &fs::Metadata, b: &fs::Metadata) -> bool {
            if !same(a, b) || a.modified().ok() != b.modified().ok() {
                return false;
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::MetadataExt;
                a.ctime() == b.ctime() && a.ctime_nsec() == b.ctime_nsec()
            }
            #[cfg(not(unix))]
            {
                true
            }
        }
        let opened = file.metadata()?;
        if !stable(&before, &opened) {
            return Err(invalid("同步暂存文件已变化"));
        }
        let mut digest = Sha256::new();
        let mut total = 0u64;
        let mut bytes = [0; 65536];
        loop {
            let n = file.read(&mut bytes)?;
            if n == 0 {
                break;
            }
            total += n as u64;
            if total > size {
                return Err(invalid("同步暂存长度已变化"));
            }
            digest.update(&bytes[..n]);
        }
        if total != size || format!("{:x}", digest.finalize()) != hash {
            return Err(err("sync_blob_corrupt", "同步暂存长度或摘要不符"));
        }
        file.sync_all()?;
        let _publication = self.publication_guard()?;
        let current = fs::symlink_metadata(source)?;
        if current.file_type().is_symlink()
            || !stable(&opened, &current)
            || !stable(&opened, &file.metadata()?)
        {
            return Err(invalid("同步暂存文件已变化"));
        }
        let destination = self.root.join(".sync/blobs").join(format!("{hash}.blob"));
        match fs::symlink_metadata(&destination) {
            Ok(_) => {
                self.contains(hash, size)?;
                return Ok(());
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(e) => return Err(e.into()),
        }
        let mut cached = 0u64;
        for entry in fs::read_dir(self.root.join(".sync/blobs"))? {
            cached = cached.saturating_add(entry?.metadata()?.len());
        }
        if cached.saturating_add(size) > 4 * 1024 * 1024 * 1024u64
            || fs2::available_space(&self.root)? < 256 * 1024 * 1024
        {
            return Err(limit("同步blob缓存或磁盘余量超限"));
        }
        fs::rename(source, &destination)?;
        if !same(&opened, &fs::symlink_metadata(&destination)?) {
            return Err(err("sync_blob_corrupt", "同步发布文件身份不符"));
        }
        sync_dir(&self.root.join(".sync/blobs"))?;
        sync_dir(&directory)?;
        Ok(())
    }
    pub(crate) fn validate_allocation(&self, references: &[BlobRef]) -> Result<()> {
        if references.len() > 1024 {
            return Err(limit("单版本附件数量超过1024"));
        }
        self.validate_media_allocation(references, |r| self.contains(&r.hash, r.size))
    }
    pub(super) fn validate_media_allocation(
        &self,
        references: &[BlobRef],
        has: impl Fn(&BlobRef) -> Result<bool>,
    ) -> Result<()> {
        let mut unique = BTreeMap::new();
        let mut missing = 0u64;
        let mut largest = 0u64;
        for reference in references {
            if let Some(size) = unique.insert(reference.hash.clone(), reference.size) {
                if size != reference.size {
                    return Err(invalid("同一blob摘要带不同长度"));
                }
                continue;
            }
            if !has(reference)? {
                missing = missing
                    .checked_add(reference.size)
                    .ok_or_else(|| limit("blob预算溢出"))?;
                largest = largest.max(reference.size);
            }
        }
        let mut cached = 0u64;
        for entry in fs::read_dir(self.root.join(".sync/blobs"))? {
            let meta = fs::symlink_metadata(entry?.path())?;
            if !meta.is_file() || meta.file_type().is_symlink() {
                return Err(invalid("blob缓存含未知对象"));
            }
            cached = cached.saturating_add(meta.len());
        }
        if cached.saturating_add(missing) > 4 * 1024 * 1024 * 1024u64
            || fs2::available_space(&self.root)?
                .saturating_sub(missing)
                .saturating_sub(largest)
                < 256 * 1024 * 1024
        {
            return Err(limit("同步blob缓存或磁盘余量超限"));
        }
        Ok(())
    }

    pub(crate) fn contains(&self, hash: &str, size: u64) -> Result<bool> {
        if !valid_hash(hash) || size > MAX_BLOB {
            return Err(invalid("blob引用无效"));
        }
        let path = self.root.join(".sync/blobs").join(format!("{hash}.blob"));
        match fs::symlink_metadata(&path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false),
            Err(e) => return Err(e.into()),
            Ok(_) => (),
        }
        let (actual, length) = hash_file(&path)?;
        if actual != hash || length != size {
            return Err(err("sync_blob_corrupt", "blob长度或摘要不符"));
        }
        Ok(true)
    }

    pub(super) fn sync_directories(&self) -> Result<()> {
        safe_directory(&self.root.join(".sync"))?;
        safe_directory(&self.root.join(".sync/blobs"))?;
        safe_directory(&self.root.join(".sync/staging"))
    }
    pub fn sync_blob_path(&self, hash: &str) -> Result<PathBuf> {
        if !valid_hash(hash) {
            return Err(invalid("blob摘要无效"));
        }
        self.sync_directories()?;
        let path = self.root.join(".sync/blobs").join(format!("{hash}.blob"));
        if hash_file(&path)?.0 != hash {
            return Err(err("sync_blob_corrupt", "blob内容摘要不符"));
        }
        Ok(path)
    }
    pub fn sync_store_blob(&self, hash: &str, size: u64, mut reader: impl Read) -> Result<()> {
        if !valid_hash(hash) || size > MAX_BLOB {
            return Err(limit("blob摘要或长度无效"));
        }
        self.sync_directories()?;
        let _publication = self.publication_guard()?;
        let destination = self.root.join(".sync/blobs").join(format!("{hash}.blob"));
        let duplicate = fs::symlink_metadata(&destination).is_ok();
        if duplicate {
            let (digest, length) = hash_file(&destination)?;
            if digest != hash || length != size {
                return Err(err("sync_blob_corrupt", "已存在blob摘要或长度不符"));
            }
            // Duplicates consume no additional disk space, but validate input.
            let mut hasher = Sha256::new();
            let mut total = 0u64;
            let mut buffer = [0u8; 65536];
            loop {
                let n = reader.read(&mut buffer)?;
                if n == 0 {
                    break;
                }
                total += n as u64;
                if total > size {
                    return Err(limit("blob长度超限"));
                }
                hasher.update(&buffer[..n]);
            }
            if total != size || format!("{:x}", hasher.finalize()) != hash {
                return Err(err("sync_blob_corrupt", "重复blob输入损坏"));
            }
            return Ok(());
        }
        let mut cached = 0u64;
        for entry in fs::read_dir(self.root.join(".sync/blobs"))? {
            let meta = entry?.metadata()?;
            cached = cached
                .checked_add(meta.len())
                .ok_or_else(|| limit("blob缓存大小溢出"))?;
        }
        let staging_entries =
            fs::read_dir(self.root.join(".sync/staging"))?.collect::<std::io::Result<Vec<_>>>()?;
        let staging_size = staging_entries.iter().try_fold(0u64, |total, entry| {
            Ok::<_, std::io::Error>(total.saturating_add(entry.metadata()?.len()))
        })?;
        if cached.saturating_add(size) > 4 * 1024 * 1024 * 1024u64
            || !staging_entries.is_empty()
            || staging_size.saturating_add(size) > 256 * 1024 * 1024u64
            || fs2::available_space(&self.root)?.saturating_sub(size) < 256 * 1024 * 1024u64
        {
            return Err(limit("同步blob缓存、暂存或磁盘余量超限"));
        }
        let staging = self
            .root
            .join(".sync/staging")
            .join(format!("{}.part", id()));
        let result = (|| {
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let mut file = options.open(&staging)?;
            let mut hasher = Sha256::new();
            let mut total = 0u64;
            let mut buffer = [0u8; 65536];
            loop {
                let n = reader.read(&mut buffer)?;
                if n == 0 {
                    break;
                }
                total = total
                    .checked_add(n as u64)
                    .ok_or_else(|| limit("blob长度溢出"))?;
                if total > size || total > MAX_BLOB {
                    return Err(limit("blob实际长度超出声明"));
                }
                hasher.update(&buffer[..n]);
                file.write_all(&buffer[..n])?;
            }
            if total != size || format!("{:x}", hasher.finalize()) != hash {
                return Err(err("sync_blob_corrupt", "blob长度或SHA256不符"));
            }
            file.sync_all()?;
            fs::rename(&staging, &destination)?;
            sync_dir(&self.root.join(".sync/blobs"))?;
            sync_dir(&self.root.join(".sync/staging"))?;
            Ok(())
        })();
        if result.is_err() {
            let _ = fs::remove_file(staging);
        }
        result
    }
}
