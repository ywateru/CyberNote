//! Process-local media capabilities. Snapshot metadata under Session, perform
//! all whole-file work outside it, then revalidate before the Store transaction.
use super::*;
use sha2::{Digest, Sha256};
use std::{cell::RefCell, fs::File, sync::Arc, time::SystemTime};

fn stale() -> AppError {
    err("sync_plan_stale", "同步媒体快照已变化，请重新准备")
}
#[derive(Clone, PartialEq, Eq)]
struct Stamp {
    size: u64,
    modified: Option<SystemTime>,
    #[cfg(unix)]
    dev: u64,
    #[cfg(unix)]
    ino: u64,
    #[cfg(unix)]
    ctime: (i64, i64),
    #[cfg(unix)]
    links: u64,
}
impl Stamp {
    fn of(meta: &fs::Metadata) -> Result<Self> {
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
    file: Arc<File>,
    stamp: Stamp,
    hash: String,
}
impl VerifiedFile {
    fn current(&self, path: &Path) -> bool {
        let check = || -> Result<bool> {
            Ok(Stamp::of(&fs::symlink_metadata(path)?)? == self.stamp
                && Stamp::of(&self.file.metadata()?)? == self.stamp)
        };
        check().unwrap_or(false)
    }
    fn read(path: &Path, cache: &BTreeMap<PathBuf, Self>) -> Result<Self> {
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
    cache: BTreeMap<PathBuf, VerifiedFile>,
}
pub(crate) struct VerifiedMedia {
    generation: String,
    root: PathBuf,
    files: RefCell<BTreeMap<PathBuf, VerifiedFile>>,
    absent: BTreeSet<PathBuf>,
    locals: BTreeMap<String, (String, u64)>,
    blobs: BTreeMap<String, (u64, bool)>,
}
impl Store {
    fn media_generation(&self) -> Result<String> {
        if enabled(&self.db)? {
            return self.generation(&self.db);
        }
        let mut rows = vec![];
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
        let dirty = if is_enabled {
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
    /// Owns only root/file capabilities and metadata; never owns Session/SQLite.
    pub(crate) fn verify(self) -> Result<VerifiedMedia> {
        let mut verified = VerifiedMedia {
            generation: self.generation,
            root: self.root.clone(),
            files: RefCell::new(BTreeMap::new()),
            absent: BTreeSet::new(),
            locals: BTreeMap::new(),
            blobs: BTreeMap::new(),
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
                }
                Err(e) => return Err(e.into()),
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
        // A new keep-all ID has no previous destination; hard_link refuses any
        // existing path atomically. No whole-file fallback is permitted here.
        fs::hard_link(&source, &destination)
            .map_err(|_| err("sync_media_publish", "无法原子发布独立附件路径"))?;
        let after = Stamp::of(&proof.file.metadata()?)?;
        let destination_stamp = Stamp::of(&fs::symlink_metadata(&destination)?)?;
        // Only this exact link-count increment may refresh our own proofs.
        // Every content identity field remains unchanged; all other changes
        // invalidate the scope instead of blessing arbitrary external writes.
        let mut expected = proof.stamp.clone();
        #[cfg(unix)]
        {
            expected.links = expected.links.checked_add(1).ok_or_else(stale)?;
            expected.ctime = after.ctime;
        }
        if after != expected || destination_stamp != after {
            return Err(stale());
        }
        let mut files = self.files.borrow_mut();
        for old in files.values_mut().filter(|old| old.stamp == proof.stamp) {
            old.stamp = after.clone();
        }
        files.insert(
            destination,
            VerifiedFile {
                stamp: after,
                ..proof
            },
        );
        blob::sync_dir(&self.root.join("attachments"))?;
        Ok(local)
    }
}

#[cfg(test)]
#[path = "media_tests.rs"]
mod tests;
