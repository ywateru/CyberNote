//! Process-local media capabilities. Snapshot metadata under Session, perform
//! all whole-file work outside it, then revalidate before the Store transaction.
use super::*;
use sha2::{Digest, Sha256};
use std::{cell::RefCell, fs::File, sync::Arc, time::SystemTime};

#[track_caller]
pub(super) fn stale() -> AppError {
    err("sync_plan_stale", "同步媒体快照已变化，请重新准备")
}
#[derive(Clone, PartialEq, Eq)]
pub(super) struct Stamp {
    pub(super) size: u64,
    pub(super) modified: Option<SystemTime>,
    #[cfg(unix)]
    pub(super) dev: u64,
    #[cfg(unix)]
    pub(super) ino: u64,
    #[cfg(unix)]
    pub(super) ctime: (i64, i64),
    #[cfg(unix)]
    pub(super) links: u64,
}
impl Stamp {
    pub(super) fn of(meta: &fs::Metadata) -> Result<Self> {
        if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > MAX_BLOB {
            return Err(invalid("媒体凭据不是有界本地普通文件"));
        }
        #[cfg(unix)]
        use std::os::unix::fs::MetadataExt;
        Ok(Self {
            size: meta.len(),
            modified: meta.modified().ok(),
            #[cfg(unix)]
            dev: meta.dev(),
            #[cfg(unix)]
            ino: meta.ino(),
            #[cfg(unix)]
            ctime: (meta.ctime(), meta.ctime_nsec()),
            #[cfg(unix)]
            links: meta.nlink(),
        })
    }
}
#[derive(Clone)]
pub(crate) struct VerifiedFile {
    pub(super) file: Arc<File>,
    pub(super) stamp: Stamp,
    pub(super) hash: String,
}
impl VerifiedFile {
    pub(super) fn current(&self, path: &Path) -> bool {
        let check = || -> Result<bool> {
            Ok(Stamp::of(&fs::symlink_metadata(path)?)? == self.stamp
                && Stamp::of(&self.file.metadata()?)? == self.stamp)
        };
        check().unwrap_or(false)
    }
    pub(super) fn read(path: &Path, cache: &BTreeMap<PathBuf, Self>) -> Result<Self> {
        if let Some(old) = cache.get(path).filter(|old| old.current(path)) {
            return Ok(old.clone());
        }
        let stamp = Stamp::of(&fs::symlink_metadata(path)?)?;
        let mut file = File::open(path)?;
        if Stamp::of(&file.metadata()?)? != stamp {
            return Err(stale());
        }
        let mut sha = Sha256::new();
        let mut total = 0;
        let mut bytes = [0; 65536];
        loop {
            let n = file.read(&mut bytes)?;
            if n == 0 {
                break;
            }
            total += n as u64;
            if total > MAX_BLOB {
                return Err(limit("媒体长度超限"));
            }
            sha.update(&bytes[..n]);
        }
        let proof = Self {
            file: Arc::new(file),
            stamp,
            hash: format!("{:x}", sha.finalize()),
        };
        if total != proof.stamp.size || !proof.current(path) {
            return Err(stale());
        }
        Ok(proof)
    }
}
struct Local {
    attachment: Attachment,
    expected: Option<String>,
}
pub(crate) struct MediaSnapshot {
    generation: String,
    root: PathBuf,
    locals: BTreeMap<String, Local>,
    references: BTreeMap<String, u64>,
    targets: BTreeMap<PathBuf, (String, u64)>,
    candidates: BTreeMap<String, BTreeMap<String, usize>>,
    keep_all: Option<String>,
    prepare_publication: bool,
    cache: BTreeMap<PathBuf, VerifiedFile>,
}
pub(crate) struct VerifiedMedia {
    generation: String,
    root: PathBuf,
    files: RefCell<BTreeMap<PathBuf, VerifiedFile>>,
    absent: BTreeSet<PathBuf>,
    locals: BTreeMap<String, (String, u64)>,
    blobs: BTreeMap<String, (u64, bool)>,
    directory: Arc<super::publication::Directory>,
    staged: RefCell<BTreeMap<String, Vec<super::publication::Staged>>>,
}
impl Store {
    pub(super) fn media_generation(&self) -> Result<String> {
        if enabled(&self.db)? {
            return self.generation(&self.db);
        }
        let mut rows = vec![vec![self.instance_id.to_string()]];
        for sql in [
            "SELECT body FROM notes ORDER BY id",
            "SELECT body FROM folders ORDER BY id",
            "SELECT body FROM attachments ORDER BY id",
        ] {
            let mut q = self.db.prepare(sql)?;
            rows.push(
                q.query_map([], |r| r.get::<_, String>(0))?
                    .collect::<std::result::Result<Vec<_>, _>>()?,
            );
        }
        Ok(sha256(&serde_json::to_vec(&rows)?))
    }
    /// Contains no filesystem read, hashing, write transaction or identity opt-in.
    pub(crate) fn sync_media_snapshot(
        &self,
        incoming: &[WireVersion],
        bootstrap: bool,
    ) -> Result<MediaSnapshot> {
        let is_enabled = enabled(&self.db)?;
        if !is_enabled && !bootstrap {
            return Err(err("sync_disabled", "尚未开启同步"));
        }
        if !incoming.is_empty() {
            self.sync_validate_receive_inner(incoming, false)?;
        }
        let mut wires = if is_enabled {
            heads(&self.db)?
                .into_iter()
                .map(|h| h.wire)
                .chain(self.inbox()?)
                .collect::<Vec<_>>()
        } else {
            vec![]
        };
        wires.extend_from_slice(incoming);
        let attachments = self.attachments()?;
        let mut locals = BTreeMap::new();
        let dirty = if is_enabled && !bootstrap {
            let mut q = self
                .db
                .prepare("SELECT entity_id FROM sync_dirty WHERE kind='note'")?;
            let ids = q
                .query_map([], |r| r.get::<_, String>(0))?
                .collect::<std::result::Result<HashSet<_>, _>>()?;
            ids
        } else {
            self.notes()?.into_iter().map(|n| n.id).collect()
        };
        for note in self.notes()?.into_iter().filter(|n| dirty.contains(&n.id)) {
            let refs = validation::references(&note.document);
            for a in attachments
                .iter()
                .filter(|a| a.note_id == note.id && refs.contains(&a.id))
            {
                self.attachment_path(&a.relative_path)?;
                locals.insert(
                    a.relative_path.clone(),
                    Local {
                        attachment: a.clone(),
                        expected: None,
                    },
                );
            }
        }
        let mut references = BTreeMap::new();
        let mut targets = BTreeMap::new();
        let mut candidates: BTreeMap<String, BTreeMap<String, usize>> = BTreeMap::new();
        for wire in wires {
            // Redacted heads have no payload. Their replacement dirty rows are
            // captured above; incoming wire already passed the complete schema gate.
            let media = if let Some(payload) = &wire.payload {
                if wire.kind == EntityKind::Note {
                    validation::note_payload(payload)?.1
                } else {
                    vec![]
                }
            } else {
                vec![]
            };
            for a in media {
                let count = candidates
                    .entry(wire.entity_id.clone())
                    .or_default()
                    .entry(a.sha256.clone())
                    .or_default();
                *count = count
                    .checked_add(1)
                    .ok_or_else(|| limit("媒体候选数量溢出"))?;
                if references
                    .insert(a.sha256.clone(), a.size)
                    .is_some_and(|s| s != a.size)
                {
                    return Err(invalid("同一blob带不同长度"));
                }
                let local = validation::attachment(&a);
                targets.insert(
                    self.attachment_path(&local.relative_path)?,
                    (a.sha256.clone(), a.size),
                );
                if let Some(existing) = attachments.iter().find(|local| local.id == a.id) {
                    let expected = Some(a.sha256.clone());
                    if locals
                        .get(&existing.relative_path)
                        .is_some_and(|old: &Local| {
                            old.expected.as_ref().is_some_and(|h| h != &a.sha256)
                        })
                    {
                        return Err(err("sync_attachment_conflict", "本机附件对应多个摘要"));
                    }
                    locals.insert(
                        existing.relative_path.clone(),
                        Local {
                            attachment: existing.clone(),
                            expected,
                        },
                    );
                }
            }
        }
        Ok(MediaSnapshot {
            generation: self.media_generation()?,
            root: self.root.clone(),
            locals,
            references,
            targets,
            candidates,
            keep_all: None,
            prepare_publication: true,
            cache: self.sync_media_cache.clone(),
        })
    }
    pub(crate) fn sync_with_media<T>(
        &mut self,
        media: VerifiedMedia,
        operation: impl FnOnce(&mut Self) -> Result<T>,
    ) -> Result<T> {
        self.sync_begin_media(media)?;
        let result = operation(self);
        self.sync_end_media();
        result
    }
    pub(crate) fn sync_begin_media(&mut self, media: VerifiedMedia) -> Result<()> {
        if self.sync_media.is_some() {
            return Err(invalid("同步媒体scope不可嵌套"));
        }
        if media.root != self.root || self.media_generation()? != media.generation {
            return Err(stale());
        }
        media.validate()?;
        self.sync_media = Some(media);
        Ok(())
    }
    pub(crate) fn sync_end_media(&mut self) {
        let media = self.sync_media.take().expect("media scope");
        // A bounded local SHA cache retains the original File identity. It
        // contains no database generation, authorization or window decision.
        self.sync_media_cache = media
            .files
            .into_inner()
            .into_iter()
            .filter(|(path, proof)| proof.current(path))
            .take(256)
            .collect();
    }
    pub(super) fn sync_local_hash(&self, a: &Attachment) -> Result<(String, u64)> {
        if let Some(media) = &self.sync_media {
            return media
                .locals
                .get(&a.relative_path)
                .cloned()
                .ok_or_else(stale);
        }
        blob::hash_file(&self.attachment_path(&a.relative_path)?)
    }
}
impl MediaSnapshot {
    /// Network receipts persist immutable versions/blobs only. They never
    /// publish live attachment paths; the quiet apply barrier prepares those
    /// independently. Keep all hash, collision, generation and file checks.
    pub(crate) fn receipt_only(mut self) -> Self {
        self.prepare_publication = false;
        self
    }
    /// Reserve independent byte capabilities for IDs created by keep-all inside
    /// the eventual transaction. No extra copies for ordinary quiet ticks.
    pub(crate) fn reserve_keep_all(mut self, note: Option<&str>) -> Self {
        self.keep_all = note.map(str::to_string);
        self
    }
    /// Owns only root/file capabilities and metadata; never owns Session/SQLite.
    pub(crate) fn verify(self) -> Result<VerifiedMedia> {
        let directory = super::publication::Directory::open(self.root.join("attachments"))?;
        let mut verified = VerifiedMedia {
            generation: self.generation,
            root: self.root.clone(),
            files: RefCell::new(BTreeMap::new()),
            absent: BTreeSet::new(),
            locals: BTreeMap::new(),
            blobs: BTreeMap::new(),
            directory,
            staged: RefCell::new(BTreeMap::new()),
        };
        for (relative, job) in &self.locals {
            let path = self.root.join("attachments").join(relative);
            let proof = verified.read_file(&path, &self.cache)?;
            if proof.stamp.size != job.attachment.size
                || job
                    .expected
                    .as_ref()
                    .is_some_and(|hash| hash != &proof.hash)
            {
                return Err(err(
                    "sync_attachment_conflict",
                    "本机附件长度或内容与版本不一致",
                ));
            }
            verified
                .locals
                .insert(relative.clone(), (proof.hash.clone(), proof.stamp.size));
            verified.files.borrow_mut().insert(path, proof);
        }
        let storage = blob::BlobStorage {
            root: self.root.clone(),
        };
        storage.sync_directories()?;
        let mut references = self.references;
        for (hash, size) in verified.locals.values() {
            if references
                .insert(hash.clone(), *size)
                .is_some_and(|old| old != *size)
            {
                return Err(invalid("同一blob带不同长度"));
            }
        }
        for (hash, size) in &references {
            let path = self.root.join(".sync/blobs").join(format!("{hash}.blob"));
            let present = match fs::symlink_metadata(&path) {
                Ok(_) => {
                    let proof = verified.read_file(&path, &self.cache)?;
                    if proof.hash != *hash || proof.stamp.size != *size {
                        return Err(err("sync_blob_corrupt", "blob长度或摘要不符"));
                    }
                    verified.files.borrow_mut().insert(path.clone(), proof);
                    true
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    verified.absent.insert(path);
                    false
                }
                Err(e) => return Err(e.into()),
            };
            verified.blobs.insert(hash.clone(), (*size, present));
        }
        storage.validate_media_allocation(
            &references
                .iter()
                .map(|(hash, size)| BlobRef {
                    hash: hash.clone(),
                    size: *size,
                })
                .collect::<Vec<_>>(),
            |r| verified.has_blob(r),
        )?;
        for (relative, (hash, size)) in &verified.locals.clone() {
            if verified.has_blob(&BlobRef {
                hash: hash.clone(),
                size: *size,
            })? {
                continue;
            }
            // All whole-file duplicate checking/capture/publication is outside
            // Session and outside every SQLite transaction.
            storage.sync_store_blob(
                hash,
                *size,
                File::open(self.root.join("attachments").join(relative))?,
            )?;
            let path = self.root.join(".sync/blobs").join(format!("{hash}.blob"));
            let proof = verified.read_file(&path, &self.cache)?;
            if proof.hash != *hash || proof.stamp.size != *size {
                return Err(err("sync_blob_corrupt", "capture后blob长度或摘要不符"));
            }
            verified.absent.remove(&path);
            verified.files.borrow_mut().insert(path, proof);
            verified.blobs.insert(hash.clone(), (*size, true));
        }
        let mut demand: BTreeMap<String, usize> = BTreeMap::new();
        if let Some(note) = self.keep_all.as_ref().filter(|_| self.prepare_publication) {
            demand = self.candidates.get(note).cloned().unwrap_or_default();
            // A dirty local head can be captured by flush inside the transaction.
            // Reserve its actual local media as well, never just old wire heads.
            for (relative, job) in &self.locals {
                if &job.attachment.note_id == note {
                    let hash = &verified.locals[relative].0;
                    *demand.entry(hash.clone()).or_default() += 1;
                }
            }
        }
        for (path, (hash, size)) in self.targets {
            match fs::symlink_metadata(&path) {
                Ok(_) => {
                    let proof = verified.read_file(&path, &self.cache)?;
                    if proof.hash != hash || proof.stamp.size != size {
                        return Err(err("sync_blob_corrupt", "附件目的文件摘要不符"));
                    }
                    verified.files.borrow_mut().insert(path, proof);
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    verified.absent.insert(path);
                    if self.prepare_publication {
                        *demand.entry(hash).or_default() += 1;
                    }
                }
                Err(e) => return Err(e.into()),
            }
        }
        let (existing_bytes, mut count) = verified.directory.stale_allocation()?;
        let mut bytes = 0u64;
        for (hash, copies) in &demand {
            let Some((size, true)) = verified.blobs.get(hash) else {
                continue;
            };
            count = count
                .checked_add(*copies)
                .ok_or_else(|| limit("媒体临时数量溢出"))?;
            bytes = bytes
                .checked_add(
                    size.checked_mul(*copies as u64)
                        .ok_or_else(|| limit("媒体临时预算溢出"))?,
                )
                .ok_or_else(|| limit("媒体临时预算溢出"))?;
        }
        if count > 65536
            || bytes.saturating_add(existing_bytes) > 4 * 1024 * 1024 * 1024u64
            || fs2::available_space(&self.root)?.saturating_sub(bytes) < 256 * 1024 * 1024
        {
            return Err(limit("同步媒体临时空间超限"));
        }
        for (hash, copies) in demand {
            if !verified
                .blobs
                .get(&hash)
                .is_some_and(|(_, present)| *present)
            {
                continue;
            }
            let path = verified.blob_path(&hash)?;
            let source = verified.files.borrow()[&path].clone();
            for _ in 0..copies {
                let staged =
                    super::publication::Staged::copy(verified.directory.clone(), &source, &path)?;
                verified
                    .staged
                    .borrow_mut()
                    .entry(hash.clone())
                    .or_default()
                    .push(staged);
            }
        }
        verified.validate()?;
        Ok(verified)
    }
}
impl VerifiedMedia {
    fn read_file(
        &self,
        path: &Path,
        cache: &BTreeMap<PathBuf, VerifiedFile>,
    ) -> Result<VerifiedFile> {
        if let Some(proof) = self
            .files
            .borrow()
            .get(path)
            .filter(|proof| proof.current(path))
        {
            return Ok(proof.clone());
        }
        VerifiedFile::read(path, cache)
    }
    fn validate(&self) -> Result<()> {
        self.directory.validate()?;
        for stage in self.staged.borrow().values().flatten() {
            stage.validate()?;
        }
        for path in [
            self.root.join("attachments"),
            self.root.join(".sync"),
            self.root.join(".sync/blobs"),
        ] {
            let meta = fs::symlink_metadata(path).map_err(|_| stale())?;
            if !meta.is_dir() || meta.file_type().is_symlink() {
                return Err(stale());
            }
        }
        if self
            .files
            .borrow()
            .iter()
            .any(|(path, proof)| !proof.current(path))
            || self
                .absent
                .iter()
                .any(|path| match fs::symlink_metadata(path) {
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => false,
                    _ => true,
                })
        {
            return Err(stale());
        }
        Ok(())
    }
    pub(super) fn has_blob(&self, b: &BlobRef) -> Result<bool> {
        match self.blobs.get(&b.hash) {
            Some((size, present)) if *size == b.size => Ok(*present),
            _ => Err(stale()),
        }
    }
    pub(super) fn blob_path(&self, hash: &str) -> Result<PathBuf> {
        let path = self.root.join(".sync/blobs").join(format!("{hash}.blob"));
        if self.files.borrow().contains_key(&path) {
            Ok(path)
        } else if self.blobs.contains_key(hash) {
            Err(err("sync_missing_blob", "附件blob尚未完整接收"))
        } else {
            Err(stale())
        }
    }
    pub(super) fn materialize(&self, a: &WireAttachment) -> Result<Attachment> {
        self.directory.validate()?;
        let local = validation::attachment(a);
        let destination = self.root.join("attachments").join(&local.relative_path);
        if let Some(proof) = self.files.borrow().get(&destination) {
            if proof.hash != a.sha256 || proof.stamp.size != a.size || !proof.current(&destination)
            {
                return Err(stale());
            }
            return Ok(local);
        }
        let source = self.blob_path(&a.sha256)?;
        let proof = self
            .files
            .borrow()
            .get(&source)
            .cloned()
            .ok_or_else(stale)?;
        if !proof.current(&source) || proof.hash != a.sha256 || proof.stamp.size != a.size {
            return Err(stale());
        }
        // Every byte was copied and verified outside the Session gate. The
        // reserved capability also covers new keep-all IDs not known in advance.
        self.directory.validate()?;
        let stage = self
            .staged
            .borrow_mut()
            .get_mut(&a.sha256)
            .and_then(Vec::pop)
            .ok_or_else(stale)?;
        let published = stage.publish(&destination)?;
        self.files
            .borrow_mut()
            .insert(destination.clone(), published);
        Ok(local)
    }
}

#[cfg(test)]
#[path = "media_tests.rs"]
mod tests;
