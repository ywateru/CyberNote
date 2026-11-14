//! Durable heads and dirty capture live in the same SQLite transactions as notes.
//! Transport only stages envelopes; Session chooses when apply_pending may project.
use super::*;
use crate::sync::model::*;
use std::{
    collections::{BTreeMap, BTreeSet, HashSet},
    io::Read,
};
#[path = "synchronization/blob.rs"]
mod blob;
pub(crate) use blob::NetworkStaging;
#[path = "synchronization/media.rs"]
pub(crate) mod media;
#[path = "synchronization/publication.rs"]
mod publication;
#[path = "synchronization/projection.rs"]
mod projection;
#[path = "synchronization/schema.rs"]
mod schema;
#[cfg(test)]
#[path = "synchronization/tests.rs"]
mod tests;
#[path = "synchronization/validation.rs"]
mod validation;

fn invalid(message: impl Into<String>) -> AppError {
    err("sync_invalid", message)
}
fn limit(message: impl Into<String>) -> AppError {
    err("sync_limit", message)
}
#[derive(Clone)]
struct Head {
    wire: WireVersion,
    redacted: bool,
}
fn kind(value: &str) -> Result<EntityKind> {
    match value {
        "note" => Ok(EntityKind::Note),
        "folder" => Ok(EntityKind::Folder),
        _ => Err(invalid("持久同步实体类型无效")),
    }
}
fn identity(db: &Connection) -> Result<SyncIdentity> {
    db.query_row(
        "SELECT workspace_id,device_id FROM sync_identity WHERE singleton=1",
        [],
        |r| {
            Ok(SyncIdentity {
                version: 1,
                workspace_id: r.get(0)?,
                device_id: r.get(1)?,
            })
        },
    )
    .map_err(Into::into)
}
fn enabled(db: &Connection) -> Result<bool> {
    Ok(db.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_schema WHERE name='sync_identity')",
        [],
        |r| r.get(0),
    )?)
}
fn heads(db: &Connection) -> Result<Vec<Head>> {
    let workspace = identity(db)?.workspace_id;
    let mut q=db.prepare("SELECT digest,kind,entity_id,vector,payload,redacted FROM sync_heads ORDER BY kind,entity_id,digest")?;
    let rows = q
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, Option<String>>(4)?,
                r.get::<_, bool>(5)?,
            ))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    rows.into_iter()
        .map(|(digest, k, entity_id, vector, payload, redacted)| {
            Ok(Head {
                wire: WireVersion {
                    version: 1,
                    workspace_id: workspace.clone(),
                    kind: kind(&k)?,
                    entity_id,
                    vector: serde_json::from_str(&vector)?,
                    payload: payload.map(|s| serde_json::from_str(&s)).transpose()?,
                    digest,
                },
                redacted,
            })
        })
        .collect()
}
fn remember(db: &Connection, wire: &WireVersion) -> Result<()> {
    remember_frontier(db, wire.kind.clone(), &wire.entity_id, &wire.vector)?;
    let vector = serde_json::to_string(&wire.vector)?;
    let existing: Option<String> = db
        .query_row(
            "SELECT digest FROM sync_seen WHERE kind=?1 AND entity_id=?2 AND vector=?3",
            params![wire.kind.as_str(), wire.entity_id, vector],
            |r| r.get(0),
        )
        .optional()?;
    if existing.is_some_and(|v| v != wire.digest) {
        return Err(err("sync_equivocation", "同一版本向量包含不同内容"));
    }
    db.execute(
        "INSERT OR IGNORE INTO sync_seen(kind,entity_id,vector,digest)VALUES(?1,?2,?3,?4)",
        params![wire.kind.as_str(), wire.entity_id, vector, wire.digest],
    )?;
    Ok(())
}
fn merge_head(db: &Connection, wire: &WireVersion) -> Result<bool> {
    remember(db, wire)?;
    let related = heads(db)?
        .into_iter()
        .filter(|h| h.wire.kind == wire.kind && h.wire.entity_id == wire.entity_id)
        .collect::<Vec<_>>();
    if related
        .iter()
        .any(|h| h.wire.digest == wire.digest || dominates(&h.wire.vector, &wire.vector))
    {
        return Ok(false);
    }
    for head in &related {
        if dominates(&wire.vector, &head.wire.vector) {
            db.execute(
                "DELETE FROM sync_heads WHERE digest=?1",
                [&head.wire.digest],
            )?;
        }
    }
    let remaining: usize = db.query_row(
        "SELECT count(*) FROM sync_heads WHERE kind=?1 AND entity_id=?2",
        params![wire.kind.as_str(), wire.entity_id],
        |r| r.get(0),
    )?;
    if remaining >= MAX_HEADS {
        return Err(limit("并发版本超过32个"));
    }
    db.execute("INSERT INTO sync_heads(digest,kind,entity_id,vector,payload,tombstone,redacted)VALUES(?1,?2,?3,?4,?5,?6,0)",params![wire.digest,wire.kind.as_str(),wire.entity_id,serde_json::to_string(&wire.vector)?,wire.payload.as_ref().map(serde_json::to_string).transpose()?,wire.payload.is_none()])?;
    Ok(true)
}
fn projected_base(db: &Connection, k: &EntityKind, id: &str) -> Result<Vector> {
    let vector: Option<String> = db
        .query_row(
            "SELECT vector FROM sync_projection WHERE kind=?1 AND entity_id=?2",
            params![k.as_str(), id],
            |r| r.get(0),
        )
        .optional()?;
    vector
        .map(|v| serde_json::from_str(&v).map_err(Into::into))
        .transpose()
        .map(|v| v.unwrap_or_default())
}
// A frontier includes every accepted vector, including dominated/compacted
// versions and durable inbox entries. A local edit of an old selected branch
// must never jump over another branch by reusing its actor component.
fn remember_frontier(db: &Connection, k: EntityKind, entity: &str, vector: &Vector) -> Result<()> {
    for (actor, counter) in vector {
        db.execute("INSERT INTO sync_frontiers(kind,entity_id,actor_id,counter)VALUES(?1,?2,?3,?4) ON CONFLICT(kind,entity_id,actor_id) DO UPDATE SET counter=max(counter,excluded.counter)",params![k.as_str(),entity,actor,counter])?;
    }
    let count: usize = db.query_row(
        "SELECT count(*) FROM sync_frontiers WHERE kind=?1 AND entity_id=?2",
        params![k.as_str(), entity],
        |r| r.get(0),
    )?;
    if count > MAX_DEVICES {
        return Err(limit("实体已见actor超过64个"));
    }
    Ok(())
}
fn bump(
    db: &Connection,
    k: &EntityKind,
    entity: &str,
    vector: &mut Vector,
    selected: Option<&str>,
) -> Result<String> {
    let device = identity(db)?.device_id;
    let mapped=selected.map(|digest|db.query_row("SELECT actor_id FROM sync_branches WHERE kind=?1 AND entity_id=?2 AND head_digest=?3",params![k.as_str(),entity,digest],|r|r.get::<_,String>(0)).optional()).transpose()?.flatten();
    let mut actor = mapped.unwrap_or(device);
    let frontier: u64 = db
        .query_row(
            "SELECT counter FROM sync_frontiers WHERE kind=?1 AND entity_id=?2 AND actor_id=?3",
            params![k.as_str(), entity, actor],
            |r| r.get(0),
        )
        .optional()?
        .unwrap_or(0);
    let base = vector.clone();
    let next = base
        .get(&actor)
        .copied()
        .unwrap_or(0)
        .checked_add(1)
        .filter(|v| *v <= MAX_COUNTER);
    let mut candidate = base.clone();
    if let Some(next) = next {
        candidate.insert(actor.clone(), next);
    }
    let swallows = heads(db)?
        .iter()
        .filter(|h| h.wire.kind == *k && h.wire.entity_id == entity)
        .any(|h| {
            !dominates(&base, &h.wire.vector)
                && base != h.wire.vector
                && (dominates(&candidate, &h.wire.vector) || candidate == h.wire.vector)
        });
    if base.get(&actor).copied().unwrap_or(0) < frontier || next.is_none() || swallows {
        actor = id();
        candidate = base;
        candidate.insert(actor.clone(), 1);
    }
    if candidate.len() > MAX_DEVICES {
        return Err(limit("版本actor超过64个"));
    }
    // The administrative count measures local commits. It is deliberately not
    // a vector component: independent branch actors own independent counters.
    let current: u64 = db.query_row(
        "SELECT counter FROM sync_identity WHERE singleton=1",
        [],
        |r| r.get(0),
    )?;
    let counter = current
        .checked_add(1)
        .filter(|n| *n <= MAX_COUNTER)
        .ok_or_else(|| limit("本机单调计数耗尽"))?;
    remember_frontier(db, k.clone(), entity, &candidate)?;
    db.execute(
        "INSERT OR IGNORE INTO sync_local_actors(kind,entity_id,actor_id)VALUES(?1,?2,?3)",
        params![k.as_str(), entity, actor],
    )?;
    db.execute(
        "UPDATE sync_identity SET counter=?1 WHERE singleton=1",
        [counter],
    )?;
    *vector = candidate;
    Ok(actor)
}
fn remember_branch(db: &Connection, wire: &WireVersion, actor: &str) -> Result<()> {
    db.execute("INSERT OR REPLACE INTO sync_branches(kind,entity_id,head_digest,actor_id)VALUES(?1,?2,?3,?4)",params![wire.kind.as_str(),wire.entity_id,wire.digest,actor])?;
    Ok(())
}
fn set_projection(db: &Connection, wire: &WireVersion) -> Result<()> {
    db.execute(
        "INSERT OR REPLACE INTO sync_projection(kind,entity_id,digest,vector)VALUES(?1,?2,?3,?4)",
        params![
            wire.kind.as_str(),
            wire.entity_id,
            wire.digest,
            serde_json::to_string(&wire.vector)?
        ],
    )?;
    Ok(())
}
fn summaries(db: &Connection) -> Result<Vec<VersionSummary>> {
    Ok(heads(db)?
        .into_iter()
        .filter(|h| !h.redacted)
        .map(|h| VersionSummary {
            kind: h.wire.kind,
            entity_id: h.wire.entity_id,
            digest: h.wire.digest,
        })
        .collect())
}

impl Store {
    pub(crate) fn sync_store_instance(&self) -> Uuid {
        self.instance_id
    }

    fn flush_in(&self, db: &Connection) -> Result<()> {
        let workspace = identity(db)?.workspace_id;
        let mut query =
            db.prepare("SELECT kind,entity_id FROM sync_dirty ORDER BY kind,entity_id")?;
        let dirty = query
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        drop(query);
        for (k, entity_id) in dirty {
            let k = kind(&k)?;
            let payload = match k {
                EntityKind::Folder => match self.folder(&entity_id) {
                    Ok(f) => Some(validation::wire_folder(&f)?),
                    Err(e) if e.code == "not_found" => None,
                    Err(e) => return Err(e),
                },
                EntityKind::Note => match self.note(&entity_id) {
                    Ok(n) => {
                        let references = validation::references(&n.document);
                        let mut attachments = self
                            .attachments()?
                            .into_iter()
                            .filter(|a| a.note_id == entity_id && references.contains(&a.id))
                            .collect::<Vec<_>>();
                        attachments.sort_by(|a, b| a.id.cmp(&b.id));
                        let mut media = Vec::new();
                        for a in attachments {
                            media.push(WireAttachment {
                                id: a.id.clone(),
                                note_id: a.note_id.clone(),
                                kind: a.kind.clone(),
                                mime: a.mime.clone(),
                                display_name: a.display_name.clone(),
                                size: a.size,
                                recorded_at: a.recorded_at,
                                sha256: self.capture_blob(&a)?,
                            });
                        }
                        Some(validation::wire_note(&n, media)?)
                    }
                    Err(e) if e.code == "not_found" => None,
                    Err(e) => return Err(e),
                },
            };
            let mut vector = if payload.is_none() {
                let all = heads(db)?;
                join(
                    all.iter()
                        .filter(|h| h.wire.kind == k && h.wire.entity_id == entity_id)
                        .map(|h| &h.wire.vector),
                )
            } else {
                projected_base(db, &k, &entity_id)?
            };
            let selected: Option<String> = db
                .query_row(
                    "SELECT digest FROM sync_projection WHERE kind=?1 AND entity_id=?2",
                    params![k.as_str(), entity_id],
                    |r| r.get(0),
                )
                .optional()?;
            let actor = bump(db, &k, &entity_id, &mut vector, selected.as_deref())?;
            let wire = WireVersion {
                version: 1,
                workspace_id: workspace.clone(),
                kind: k,
                entity_id,
                vector,
                payload,
                digest: String::new(),
            }
            .seal();
            let attachments = validation::validate(&wire, &workspace)?;
            self.register_sync_attachments(db, &attachments)?;
            merge_head(db, &wire)?;
            remember_branch(db, &wire, &actor)?;
            set_projection(db, &wire)?;
            db.execute(
                "DELETE FROM sync_dirty WHERE kind=?1 AND entity_id=?2",
                params![wire.kind.as_str(), wire.entity_id],
            )?;
        }
        Ok(())
    }
    pub fn sync_flush(&mut self) -> Result<()> {
        if !enabled(&self.db)? {
            return Err(err("sync_disabled", "尚未开启同步"));
        }
        let tx = self.db.unchecked_transaction()?;
        self.flush_in(&tx)?;
        tx.commit()?;
        Ok(())
    }
    pub fn sync_inventory(&self) -> Result<Vec<VersionSummary>> {
        if !enabled(&self.db)? {
            return Err(err("sync_disabled", "尚未开启同步"));
        }
        let dirty: usize = self
            .db
            .query_row("SELECT count(*) FROM sync_dirty", [], |r| r.get(0))?;
        if dirty > 0 {
            return Err(err("sync_pending_flush", "请先固化本地待同步更改"));
        }
        summaries(&self.db)
    }
    pub fn sync_version(&self, digest: &str) -> Result<WireVersion> {
        if !valid_hash(digest) {
            return Err(invalid("版本摘要无效"));
        }
        let head = heads(&self.db)?
            .into_iter()
            .find(|h| h.wire.digest == digest)
            .ok_or_else(|| err("sync_version_missing", "版本已压缩或不存在"))?;
        if head.redacted {
            return Err(err("sync_pending_flush", "版本已锁定或删除，等待固化"));
        }
        Ok(head.wire)
    }
    pub fn sync_required_blobs(&self, wire: &WireVersion) -> Result<Vec<BlobRef>> {
        let identity = identity(&self.db)?;
        Ok(validation::validate(wire, &identity.workspace_id)?
            .into_iter()
            .map(|a| BlobRef {
                hash: a.sha256,
                size: a.size,
            })
            .collect())
    }
    fn inbox(&self) -> Result<Vec<WireVersion>> {
        let mut query = self
            .db
            .prepare("SELECT wire FROM sync_inbox ORDER BY digest")?;
        let rows = query
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        rows.into_iter()
            .map(|s| serde_json::from_str(&s).map_err(Into::into))
            .collect()
    }
    fn report(&self, applied: bool, changes: Vec<VersionSummary>) -> Result<SyncApplyReport> {
        let pending = self.inbox()?;
        let mut missing = BTreeMap::new();
        for wire in &pending {
            for blob in self.sync_required_blobs(wire)? {
                if !self.has_blob(&blob)? {
                    if missing
                        .insert(blob.hash.clone(), blob.size)
                        .is_some_and(|old| old != blob.size)
                    {
                        return Err(invalid("同一blob摘要带不同长度"));
                    }
                }
            }
        }
        let missing_blobs: Vec<BlobRef> = missing
            .into_iter()
            .map(|(hash, size)| BlobRef { hash, size })
            .collect();
        Ok(SyncApplyReport {
            durable: missing_blobs.is_empty(),
            applied: applied && pending.is_empty(),
            pending: pending.len(),
            missing_blobs,
            changes,
            conflicts: self.conflict_count()?,
        })
    }
    fn sync_access_states(&self) -> Result<HashMap<String, (bool, Option<i64>, Option<Value>)>> {
        Ok(self
            .notes()?
            .into_iter()
            .map(|n| (n.id, (n.locked, n.deleted_at, n.sealed)))
            .collect())
    }
    fn sync_revoke_changed_keys(
        &mut self,
        before: &HashMap<String, (bool, Option<i64>, Option<Value>)>,
    ) -> Result<()> {
        let after = self.sync_access_states()?;
        self.keys.retain(|id, _| before.get(id) == after.get(id));
        Ok(())
    }
    pub(crate) fn sync_pending_count(&self) -> Result<usize> {
        Ok(self
            .db
            .query_row("SELECT count(*) FROM sync_inbox", [], |r| r.get(0))?)
    }
    pub(crate) fn sync_conflict_count(&self) -> Result<usize> {
        self.conflict_count()
    }
    fn conflict_count(&self) -> Result<usize> {
        Ok(self.db.query_row("SELECT count(*) FROM (SELECT 1 FROM sync_heads GROUP BY kind,entity_id HAVING count(*)>1)",[],|r|r.get(0))?)
    }
    /// Read-only network allocation gate. Repeated inside receive because local
    /// state can change while a socket transfers the validated media.
    pub(crate) fn sync_validate_receive(&self, versions: &[WireVersion]) -> Result<()> {
        self.sync_validate_receive_inner(versions, true)
    }
    fn sync_validate_receive_inner(&self, versions: &[WireVersion], files: bool) -> Result<()> {
        if !enabled(&self.db)? {
            return Err(err("sync_disabled", "尚未开启同步"));
        }
        if versions.len() > 128 || serde_json::to_vec(versions)?.len() > MAX_MESSAGE {
            return Err(limit("一次收件超过128版本或16MiB"));
        }
        let workspace = identity(&self.db)?.workspace_id;
        let mut inbox = self
            .inbox()?
            .into_iter()
            .map(|w| (w.digest.clone(), w))
            .collect::<BTreeMap<_, _>>();
        let mut descriptors = BTreeMap::<String, String>::new();
        let mut frontiers = BTreeMap::<(EntityKind, String), HashSet<String>>::new();
        for wire in versions {
            let attachments = validation::validate(wire, &workspace)?;
            let vector = serde_json::to_string(&wire.vector)?;
            let seen: Option<String> = self
                .db
                .query_row(
                    "SELECT digest FROM sync_seen WHERE kind=?1 AND entity_id=?2 AND vector=?3",
                    params![wire.kind.as_str(), wire.entity_id, vector],
                    |r| r.get(0),
                )
                .optional()?;
            if seen.as_ref().is_some_and(|digest| digest != &wire.digest) {
                return Err(err("sync_equivocation", "已见版本向量内容不符"));
            }
            if seen.is_none() {
                inbox.insert(wire.digest.clone(), wire.clone());
            }
            let key = (wire.kind.clone(), wire.entity_id.clone());
            if !frontiers.contains_key(&key) {
                let mut q = self.db.prepare(
                    "SELECT actor_id FROM sync_frontiers WHERE kind=?1 AND entity_id=?2",
                )?;
                let actors = q
                    .query_map(params![wire.kind.as_str(), wire.entity_id], |r| {
                        r.get::<_, String>(0)
                    })?
                    .collect::<std::result::Result<HashSet<_>, _>>()?;
                frontiers.insert(key.clone(), actors);
            }
            let actors = frontiers.get_mut(&key).unwrap();
            actors.extend(wire.vector.keys().cloned());
            if actors.len() > MAX_DEVICES {
                return Err(limit("实体已见actor超过64个"));
            }
            for attachment in attachments {
                let descriptor = serde_json::to_string(&attachment)?;
                if descriptors
                    .insert(attachment.id.clone(), descriptor.clone())
                    .is_some_and(|old| old != descriptor)
                {
                    return Err(err(
                        "sync_attachment_conflict",
                        "同一附件ID含不同元数据或内容",
                    ));
                }
                let existing: Option<String> = self
                    .db
                    .query_row(
                        "SELECT descriptor FROM sync_attachments WHERE id=?1",
                        [&attachment.id],
                        |r| r.get(0),
                    )
                    .optional()?;
                if existing.as_ref().is_some_and(|old| old != &descriptor) {
                    return Err(err(
                        "sync_attachment_conflict",
                        "同一附件ID含不同元数据或内容",
                    ));
                }
                let local: Option<String> = self
                    .db
                    .query_row(
                        "SELECT body FROM attachments WHERE id=?1",
                        [&attachment.id],
                        |r| r.get(0),
                    )
                    .optional()?;
                if let Some(local) = local {
                    let local: Attachment = serde_json::from_str(&local)?;
                    if local.note_id != attachment.note_id
                        || local.kind != attachment.kind
                        || local.mime != attachment.mime
                        || local.display_name != attachment.display_name
                        || local.size != attachment.size
                        || local.recorded_at != attachment.recorded_at
                        || (files
                            && self.sync_local_hash(&local)?
                                != (attachment.sha256.clone(), attachment.size))
                    {
                        return Err(err(
                            "sync_attachment_conflict",
                            "远端附件ID与本机现有附件不一致",
                        ));
                    }
                }
            }
        }
        let bytes = inbox.values().try_fold(0usize, |n, w| {
            Ok::<_, AppError>(n.saturating_add(serde_json::to_vec(w)?.len()))
        })?;
        if inbox.len() > 1024 || bytes > 64 * 1024 * 1024 {
            return Err(limit("持久收件箱超过1024版本或64MiB"));
        }

        // Validate a hypothetical union before acknowledging: pending heads obey
        // exactly the same vector/equivocation/concurrency budgets as live heads.
        let mut candidates = heads(&self.db)?
            .into_iter()
            .map(|h| h.wire)
            .chain(self.inbox()?)
            .collect::<Vec<_>>();
        candidates.extend(versions.iter().cloned());
        let mut fingerprints = BTreeMap::new();
        let mut vectors = BTreeMap::<(EntityKind, String), Vec<Vector>>::new();
        for wire in &candidates {
            let key = (
                wire.kind.clone(),
                wire.entity_id.clone(),
                serde_json::to_string(&wire.vector)?,
            );
            if fingerprints
                .insert(key, wire.digest.clone())
                .is_some_and(|old| old != wire.digest)
            {
                return Err(err("sync_equivocation", "同一版本向量包含不同内容"));
            }
            let group = vectors
                .entry((wire.kind.clone(), wire.entity_id.clone()))
                .or_default();
            if group
                .iter()
                .any(|v| v == &wire.vector || dominates(v, &wire.vector))
            {
                continue;
            }
            group.retain(|v| !dominates(&wire.vector, v));
            group.push(wire.vector.clone());
        }
        if vectors.len() > MAX_ENTITIES || vectors.values().any(|v| v.len() > MAX_HEADS) {
            return Err(limit("实体数或并发头超限"));
        }
        Ok(())
    }
    pub fn sync_receive(&mut self, versions: Vec<WireVersion>) -> Result<SyncApplyReport> {
        self.sync_validate_receive(&versions)?;
        let workspace = identity(&self.db)?.workspace_id;
        let tx = self.db.unchecked_transaction()?;
        let mut requested_missing = BTreeMap::new();
        for wire in versions {
            let attachments = validation::validate(&wire, &workspace)?;
            if wire.kind == EntityKind::Note {
                let protected = match self.note(&wire.entity_id) {
                    Ok(note) => note.locked,
                    Err(e) if e.code == "not_found" => true,
                    Err(e) => return Err(e),
                };
                let base = projected_base(&tx, &wire.kind, &wire.entity_id)?;
                if protected && (base == wire.vector || dominates(&base, &wire.vector)) {
                    // A late replay cannot reintroduce the retired plaintext of
                    // a locked/purged linear branch into the durable inbox.
                    remember(&tx, &wire)?;
                    continue;
                }
            }
            for a in &attachments {
                let reference = BlobRef {
                    hash: a.sha256.clone(),
                    size: a.size,
                };
                if !self.has_blob(&reference)? {
                    requested_missing.insert(reference.hash, reference.size);
                }
            }
            let vector = serde_json::to_string(&wire.vector)?;
            let seen: Option<String> = tx
                .query_row(
                    "SELECT digest FROM sync_seen WHERE kind=?1 AND entity_id=?2 AND vector=?3",
                    params![wire.kind.as_str(), wire.entity_id, vector],
                    |r| r.get(0),
                )
                .optional()?;
            if let Some(seen) = seen {
                if seen != wire.digest {
                    return Err(err("sync_equivocation", "已见版本向量内容不符"));
                }
                continue;
            }
            self.register_sync_attachments(&tx, &attachments)?;
            remember_frontier(&tx, wire.kind.clone(), &wire.entity_id, &wire.vector)?;
            tx.execute(
                "INSERT OR IGNORE INTO sync_inbox(digest,wire)VALUES(?1,?2)",
                params![wire.digest, serde_json::to_string(&wire)?],
            )?;
        }
        let count: usize = tx.query_row("SELECT count(*) FROM sync_inbox", [], |r| r.get(0))?;
        let bytes: u64 = tx.query_row(
            "SELECT coalesce(sum(length(CAST(wire AS BLOB))),0) FROM sync_inbox",
            [],
            |r| r.get(0),
        )?;
        if count > 1024 || bytes > 64 * 1024 * 1024 {
            return Err(limit("持久收件箱超过1024版本或64MiB"));
        }
        tx.commit()?;
        let mut report = self.report(false, vec![])?;
        // A duplicate known digest can have lost a local blob. Its metadata
        // stays compacted (especially after lock/purge), but ACK must still ask
        // for the bytes rather than claiming a fully durable receipt.
        let mut missing = report
            .missing_blobs
            .into_iter()
            .map(|b| (b.hash, b.size))
            .collect::<BTreeMap<_, _>>();
        for (hash, size) in requested_missing {
            if !self.has_blob(&BlobRef {
                hash: hash.clone(),
                size,
            })? {
                missing.insert(hash, size);
            }
        }
        report.missing_blobs = missing
            .into_iter()
            .map(|(hash, size)| BlobRef { hash, size })
            .collect();
        report.durable = report.missing_blobs.is_empty();
        Ok(report)
    }
    fn generation(&self, db: &Connection) -> Result<String> {
        // Include process authority, so A -> B -> A cannot revive a prepared plan.
        let mut snapshot = vec![vec![self.instance_id.to_string()]];
        for sql in ["SELECT body FROM notes ORDER BY id","SELECT body FROM folders ORDER BY id","SELECT body FROM attachments ORDER BY id","SELECT printf('%s:%s',kind,entity_id) FROM sync_dirty ORDER BY kind,entity_id","SELECT printf('%s:%s:%d',digest,vector,redacted) FROM sync_heads ORDER BY digest","SELECT printf('%s:%s:%s',kind,entity_id,digest) FROM sync_projection ORDER BY kind,entity_id","SELECT digest FROM sync_inbox ORDER BY digest","SELECT printf('%s:%s:%s:%d',kind,entity_id,actor_id,counter) FROM sync_frontiers ORDER BY kind,entity_id,actor_id","SELECT printf('%s:%s:%s:%s',kind,entity_id,head_digest,actor_id) FROM sync_branches ORDER BY kind,entity_id,head_digest","SELECT printf('%s:%s:%s',kind,entity_id,actor_id) FROM sync_local_actors ORDER BY kind,entity_id,actor_id","SELECT printf('%s:%s:%d',workspace_id,device_id,counter) FROM sync_identity", "SELECT descriptor FROM sync_attachments ORDER BY id", "SELECT printf('%s:%s:%s:%s',kind,entity_id,vector,digest) FROM sync_seen ORDER BY kind,entity_id,vector"] {
            let mut q=db.prepare(sql)?;
            let rows=q.query_map([],|r|r.get::<_,String>(0))?.collect::<std::result::Result<Vec<_>,_>>()?;
            snapshot.push(rows);
        }
        Ok(sha256(&serde_json::to_vec(&snapshot)?))
    }
    fn prepare_plan_in(
        &self,
        db: &Connection,
        excluded: &HashSet<String>,
    ) -> Result<SyncApplyPlan> {
        let generation = self.generation(db)?;
        let mut eligible = Vec::new();
        for wire in self.inbox()? {
            if wire.kind == EntityKind::Note && excluded.contains(&wire.entity_id)
                || wire.kind == EntityKind::Folder && !excluded.is_empty()
            {
                continue;
            }
            let mut ready = true;
            for blob in self.sync_required_blobs(&wire)? {
                if !self.has_blob(&blob)? {
                    ready = false;
                }
            }
            if ready {
                merge_head(db, &wire)?;
                eligible.push(wire.digest);
            }
        }
        let changes = self.project_in(db, excluded, true)?;
        let targets = changes
            .iter()
            .filter(|v| v.kind == EntityKind::Note)
            .map(|v| v.entity_id.clone())
            .collect();
        let mut excluded_note_ids = excluded.iter().cloned().collect::<Vec<_>>();
        excluded_note_ids.sort();
        eligible.sort();
        Ok(SyncApplyPlan {
            generation,
            excluded_note_ids,
            eligible_digests: eligible,
            targets,
            changes,
        })
    }
    pub fn sync_plan_apply(&mut self, excluded_note_ids: &[String]) -> Result<SyncApplyPlan> {
        if excluded_note_ids.len() > MAX_ENTITIES || excluded_note_ids.iter().any(|v| !valid_id(v))
        {
            return Err(invalid("排除笔记身份无效"));
        }
        self.sync_flush()?;
        let tx = self.db.unchecked_transaction()?;
        let plan = self.prepare_plan_in(&tx, &excluded_note_ids.iter().cloned().collect())?;
        tx.rollback()?;
        Ok(plan)
    }
    pub fn sync_apply_plan(&mut self, plan: &SyncApplyPlan) -> Result<SyncApplyReport> {
        let access_before = self.sync_access_states()?;
        if !enabled(&self.db)? {
            return Err(err("sync_disabled", "尚未开启同步"));
        }
        let tx = self.db.unchecked_transaction()?;
        if self.generation(&tx)? != plan.generation {
            return Err(err("sync_plan_stale", "同步计划已过期，请重新建立保存屏障"));
        }
        let excluded = plan
            .excluded_note_ids
            .iter()
            .cloned()
            .collect::<HashSet<_>>();
        self.flush_in(&tx)?;
        let actual = self.prepare_plan_in(&tx, &excluded)?;
        if actual != *plan {
            return Err(err("sync_plan_stale", "同步目标已变化，请重新建立保存屏障"));
        }
        tx.execute("UPDATE sync_identity SET capture=0 WHERE singleton=1", [])?;
        let changes = self.project_in(&tx, &excluded, false)?;
        for digest in &plan.eligible_digests {
            tx.execute("DELETE FROM sync_inbox WHERE digest=?1", [digest])?;
        }
        tx.execute("UPDATE sync_identity SET capture=1 WHERE singleton=1", [])?;
        tx.commit()?;
        self.sync_revoke_changed_keys(&access_before)?;
        for change in &changes {
            let revision = if change.kind == EntityKind::Note {
                match self.note(&change.entity_id) {
                    Ok(note) => Some(note.revision),
                    Err(e) if e.code == "not_found" => None,
                    Err(e) => return Err(e),
                }
            } else {
                None
            };
            self.committed(change.kind.as_str(), &change.entity_id, revision);
        }
        self.report(true, changes)
    }
    pub fn sync_apply_pending(&mut self) -> Result<SyncApplyReport> {
        let plan = self.sync_plan_apply(&[])?;
        self.sync_apply_plan(&plan)
    }
    pub fn sync_conflicts(&self) -> Result<Vec<SyncConflict>> {
        let all = heads(&self.db)?;
        let selected = projection::selected(&all)?;
        let mut groups = BTreeMap::<(EntityKind, String), Vec<ConflictVersion>>::new();
        for head in all {
            let wire = head.wire;
            let (title, updated_at, locked) = match (&wire.kind, &wire.payload) {
                (EntityKind::Note, Some(value)) => {
                    let (n, _) = validation::note_payload(value)?;
                    (Some(n.title), Some(n.updated_at), n.locked)
                }
                (EntityKind::Folder, Some(value)) => {
                    let f = validation::folder_payload(value)?;
                    (Some(f.name), Some(f.created_at), false)
                }
                _ => (None, None, false),
            };
            groups
                .entry((wire.kind, wire.entity_id))
                .or_default()
                .push(ConflictVersion {
                    digest: wire.digest,
                    tombstone: wire.payload.is_none(),
                    title,
                    updated_at,
                    locked,
                });
        }
        Ok(groups
            .into_iter()
            .filter(|(_, v)| v.len() > 1)
            .map(|((kind, entity_id), versions)| SyncConflict {
                projected_digest: selected[&(kind.clone(), entity_id.clone())].digest.clone(),
                kind,
                entity_id,
                versions,
            })
            .collect())
    }
    pub fn sync_resolve(
        &mut self,
        kind: EntityKind,
        entity_id: &str,
        chosen: &str,
        keep_all: bool,
    ) -> Result<SyncApplyReport> {
        if kind == EntityKind::Folder && ["default", "quick", "trash", "all"].contains(&entity_id) {
            return Err(invalid("系统目录不能解决同步冲突"));
        }
        let access_before = self.sync_access_states()?;
        let tx = self.db.unchecked_transaction()?;
        self.flush_in(&tx)?;
        let all = heads(&tx)?
            .into_iter()
            .filter(|h| h.wire.kind == kind && h.wire.entity_id == entity_id)
            .collect::<Vec<_>>();
        let chosen = all
            .iter()
            .find(|h| h.wire.digest == chosen)
            .ok_or_else(|| err("sync_version_missing", "所选冲突版本不存在"))?
            .wire
            .clone();
        if all.len() < 2 {
            return Err(err("sync_no_conflict", "当前没有并发版本"));
        }
        if keep_all {
            for head in &all {
                if head.wire.digest == chosen.digest || head.wire.payload.is_none() {
                    continue;
                }
                let new_id = id();
                let mut payload = head.wire.payload.clone().unwrap();
                match kind {
                    EntityKind::Note => {
                        let (mut note, mut attachments) = validation::note_payload(&payload)?;
                        let mut ids = BTreeMap::new();
                        note.id = new_id.clone();
                        for a in &mut attachments {
                            let new = id();
                            ids.insert(a.id.clone(), new.clone());
                            a.id = new;
                            a.note_id = new_id.clone();
                        }
                        fn remap(value: &mut Value, ids: &BTreeMap<String, String>) {
                            if value["type"] == "attachment" {
                                if let Some(id) = value["attrs"]["id"]
                                    .as_str()
                                    .and_then(|id| ids.get(id))
                                    .cloned()
                                {
                                    value["attrs"]["id"] = json!(id);
                                }
                            }
                            if let Some(children) =
                                value.get_mut("content").and_then(Value::as_array_mut)
                            {
                                for c in children {
                                    remap(c, ids);
                                }
                            }
                        }
                        remap(&mut note.document, &ids);
                        payload = validation::wire_note(&note, attachments)?;
                    }
                    EntityKind::Folder => {
                        payload["id"] = json!(new_id);
                    }
                }
                let mut vector = Vector::new();
                let actor = bump(&tx, &kind, &new_id, &mut vector, None)?;
                let copy = WireVersion {
                    version: 1,
                    workspace_id: chosen.workspace_id.clone(),
                    kind: kind.clone(),
                    entity_id: new_id,
                    vector,
                    payload: Some(payload),
                    digest: String::new(),
                }
                .seal();
                let media = validation::validate(&copy, &copy.workspace_id)?;
                self.register_sync_attachments(&tx, &media)?;
                merge_head(&tx, &copy)?;
                remember_branch(&tx, &copy, &actor)?;
            }
        }
        let mut vector = join(all.iter().map(|h| &h.wire.vector));
        let actor = bump(&tx, &kind, entity_id, &mut vector, None)?;
        let resolved = WireVersion {
            vector,
            digest: String::new(),
            ..chosen
        }
        .seal();
        merge_head(&tx, &resolved)?;
        remember_branch(&tx, &resolved, &actor)?;
        tx.execute("UPDATE sync_identity SET capture=0 WHERE singleton=1", [])?;
        let changes = self.project_in(&tx, &HashSet::new(), false)?;
        tx.execute("UPDATE sync_identity SET capture=1 WHERE singleton=1", [])?;
        tx.commit()?;
        self.sync_revoke_changed_keys(&access_before)?;
        for change in &changes {
            let revision = if change.kind == EntityKind::Note {
                match self.note(&change.entity_id) {
                    Ok(note) => Some(note.revision),
                    Err(e) if e.code == "not_found" => None,
                    Err(e) => return Err(e),
                }
            } else {
                None
            };
            self.committed(change.kind.as_str(), &change.entity_id, revision);
        }
        self.report(true, changes)
    }
}
