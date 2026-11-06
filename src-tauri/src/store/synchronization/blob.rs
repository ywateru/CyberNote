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
        if !enabled(&self.db)? {
            return Err(err("sync_disabled", "尚未开启同步"));
        }
        self.sync_directories()?;
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
            || staging_entries.len() >= 4
            || staging_size.saturating_add(size) > 512 * 1024 * 1024u64
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
    pub(super) fn capture_blob(&self, attachment: &Attachment) -> Result<String> {
        let source = self.attachment_path(&attachment.relative_path)?;
        let (hash, size) = hash_file(&source)?;
        if size != attachment.size {
            return Err(err("sync_blob_corrupt", "本地附件实际长度与登记不符"));
        }
        self.sync_store_blob(&hash, size, File::open(source)?)?;
        Ok(hash)
    }
    pub(super) fn has_blob(&self, reference: &BlobRef) -> Result<bool> {
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
