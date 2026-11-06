use super::*;
use std::{
    fs::{File, OpenOptions},
    io::Write,
};
fn priority(wire: &WireVersion) -> u8 {
    if wire.payload.is_none() {
        0
    } else if wire.kind == EntityKind::Note
        && !wire.payload.as_ref().unwrap()["note"]["deletedAt"].is_null()
    {
        1
    } else {
        2
    }
}
pub(super) fn selected(all: &[Head]) -> Result<BTreeMap<(EntityKind, String), WireVersion>> {
    let mut result = BTreeMap::new();
    for head in all {
        if head.redacted {
            return Err(err("sync_pending_flush", "锁定或删除版本需要先固化dirty"));
        }
        let key = (head.wire.kind.clone(), head.wire.entity_id.clone());
        let replace = result.get(&key).is_none_or(|old: &WireVersion| {
            (priority(&head.wire), &head.wire.digest) < (priority(old), &old.digest)
        });
        if replace {
            result.insert(key, head.wire.clone());
        }
    }
    Ok(result)
}
fn detach_cycles(folders: &mut BTreeMap<String, Folder>) {
    loop {
        let mut cut = None;
        for start in folders.keys() {
            let mut order = Vec::new();
            let mut positions = BTreeMap::new();
            let mut cursor = Some(start.clone());
            while let Some(id) = cursor {
                if let Some(index) = positions.get(&id).copied() {
                    cut = order[index..].iter().min().cloned();
                    break;
                }
                positions.insert(id.clone(), order.len());
                order.push(id.clone());
                cursor = folders.get(&id).and_then(|f| f.parent_id.clone());
            }
            if cut.is_some() {
                break;
            }
        }
        match cut {
            Some(id) => folders.get_mut(&id).unwrap().parent_id = None,
            None => break,
        }
    }
}
impl Store {
    fn materialize(&self, attachment: &WireAttachment) -> Result<Attachment> {
        let local = validation::attachment(attachment);
        let reference = BlobRef {
            hash: attachment.sha256.clone(),
            size: attachment.size,
        };
        if !self.has_blob(&reference)? {
            return Err(err("sync_missing_blob", "附件blob尚未完整接收"));
        }
        let source = self.sync_blob_path(&reference.hash)?;
        let destination = self.attachment_path(&local.relative_path)?;
        if fs::symlink_metadata(&destination).is_ok() {
            let (hash, size) = blob::hash_file(&destination)?;
            if hash != reference.hash || size != reference.size {
                return Err(err("sync_blob_corrupt", "已发布附件路径内容不符"));
            }
            return Ok(local);
        }
        let staging = self
            .root
            .join("attachments")
            .join(format!("s84-{}.part", id()));
        let result: Result<()> = (|| {
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let mut output = options.open(&staging)?;
            std::io::copy(&mut File::open(source)?, &mut output)?;
            output.flush()?;
            output.sync_all()?;
            fs::rename(&staging, &destination)?;
            blob::sync_dir(&self.root.join("attachments"))?;
            Ok(())
        })();
        if result.is_err() {
            let _ = fs::remove_file(staging);
        }
        result?;
        Ok(local)
    }
    pub(super) fn project_in(
        &self,
        db: &Connection,
        excluded: &HashSet<String>,
        dry: bool,
    ) -> Result<Vec<VersionSummary>> {
        let chosen = selected(&heads(db)?)?;
        let previous_folders = self
            .folders()?
            .into_iter()
            .map(|f| (f.id.clone(), f))
            .collect::<BTreeMap<_, _>>();
        let previous_notes = self
            .notes()?
            .into_iter()
            .map(|n| (n.id.clone(), n))
            .collect::<BTreeMap<_, _>>();
        let previous_attachments = self.attachments()?;
        let mut folders = previous_folders
            .iter()
            .filter(|(id, _)| ["default", "quick", "trash"].contains(&id.as_str()))
            .map(|(id, f)| (id.clone(), f.clone()))
            .collect::<BTreeMap<_, _>>();
        for ((k, id), wire) in &chosen {
            if *k == EntityKind::Folder {
                if let Some(payload) = &wire.payload {
                    folders.insert(id.clone(), validation::folder_payload(payload)?);
                }
            }
        }
        if !excluded.is_empty() {
            folders = previous_folders.clone();
        }
        let kinds = folders
            .iter()
            .map(|(id, f)| (id.clone(), f.kind.clone()))
            .collect::<BTreeMap<_, _>>();
        for f in folders.values_mut() {
            if f.parent_id.as_ref().is_some_and(|p| {
                !kinds
                    .get(p)
                    .is_some_and(|k| k == "normal" || k == "default")
            }) {
                f.parent_id = None;
            }
        }
        detach_cycles(&mut folders);
        let mut notes = BTreeMap::new();
        let mut attachments = BTreeMap::new();
        for ((k, id), wire) in &chosen {
            if *k != EntityKind::Note || excluded.contains(id) {
                continue;
            }
            let Some(payload) = &wire.payload else {
                continue;
            };
            let (mut note, media) = validation::note_payload(payload)?;
            if note.deleted_at.is_some() {
                note.folder_id = "trash".into();
            } else if !folders
                .get(&note.folder_id)
                .is_some_and(|f| smart::require_live_owner(f).is_ok())
            {
                note.folder_id = "default".into();
            }
            if note
                .original_folder_id
                .as_ref()
                .and_then(|id| folders.get(id))
                .is_some_and(|f| smart::require_live_owner(f).is_err())
            {
                note.original_folder_id = Some("default".into());
            }
            for a in media {
                let local = if dry {
                    validation::attachment(&a)
                } else {
                    self.materialize(&a)?
                };
                attachments.insert(local.id.clone(), local);
            }
            notes.insert(id.clone(), note);
        }
        for id in excluded {
            if let Some(note) = previous_notes.get(id) {
                notes.insert(id.clone(), note.clone());
            }
        }
        // Store intentionally retains unreferenced local attachments for recovery.
        // Remote projection does not turn that into implicit media cleanup.
        for old in &previous_attachments {
            if notes.get(&old.note_id).is_some_and(|n: &Note| !n.locked)
                && !attachments.contains_key(&old.id)
            {
                attachments.insert(old.id.clone(), old.clone());
            }
        }
        let mut changes = BTreeSet::new();
        for (id, folder) in &mut folders {
            if ["default", "quick", "trash"].contains(&id.as_str()) {
                continue;
            }
            let equal = previous_folders
                .get(id)
                .map(validation::wire_folder)
                .transpose()?
                .is_some_and(|old| old == validation::wire_folder(folder).unwrap());
            if equal {
                folder.definition_revision = previous_folders[id].definition_revision;
            } else {
                if folder.kind == "smart" {
                    folder.definition_revision = Some(
                        previous_folders
                            .get(id)
                            .and_then(|f| f.definition_revision)
                            .unwrap_or(0)
                            .checked_add(1)
                            .filter(|n| *n <= 9_007_199_254_740_991)
                            .ok_or_else(|| limit("智能目录本地版本耗尽"))?,
                    );
                }
                changes.insert((EntityKind::Folder, id.clone()));
            }
        }
        for id in previous_folders.keys() {
            if !folders.contains_key(id) {
                changes.insert((EntityKind::Folder, id.clone()));
            }
        }
        for (id, note) in &mut notes {
            let same = previous_notes
                .get(id)
                .map(|old| validation::wire_note(old, vec![]))
                .transpose()?
                .is_some_and(|old| old == validation::wire_note(note, vec![]).unwrap());
            note.revision = if same {
                previous_notes[id].revision
            } else {
                changes.insert((EntityKind::Note, id.clone()));
                previous_notes
                    .get(id)
                    .map(|n| n.revision)
                    .unwrap_or(-1)
                    .checked_add(1)
                    .ok_or_else(|| limit("本地笔记版本耗尽"))?
            };
        }
        for id in previous_notes.keys() {
            if !notes.contains_key(id) {
                changes.insert((EntityKind::Note, id.clone()));
            }
        }
        for a in attachments.values() {
            if !previous_attachments.iter().any(|old| old == a) {
                changes.insert((EntityKind::Note, a.note_id.clone()));
            }
        }
        let folder_values = folders.values().cloned().collect::<Vec<_>>();
        let note_values = notes.values().cloned().collect::<Vec<_>>();
        let attachment_values = attachments.values().cloned().collect::<Vec<_>>();
        archive::validate_live_graph(&folder_values, &note_values, &attachment_values)?;
        if !dry {
            for (k, id) in &changes {
                match k {
                    EntityKind::Folder => match folders.get(id) {
                        Some(f) => {
                            db.execute(
                                "INSERT OR REPLACE INTO folders(id,body)VALUES(?1,?2)",
                                params![id, serde_json::to_string(f)?],
                            )?;
                        }
                        None => {
                            db.execute("DELETE FROM folders WHERE id=?1", [id])?;
                        }
                    },
                    EntityKind::Note => match notes.get(id) {
                        Some(n) => {
                            db.execute("INSERT OR REPLACE INTO notes(id,folder_id,body,revision)VALUES(?1,?2,?3,?4)",params![id,n.folder_id,serde_json::to_string(n)?,n.revision])?;
                        }
                        None => {
                            db.execute("UPDATE attachment_operations SET state='retired',reason='sync_purged' WHERE note_id=?1",[id])?;
                            db.execute("DELETE FROM attachments WHERE note_id=?1", [id])?;
                            db.execute("DELETE FROM notes WHERE id=?1", [id])?;
                        }
                    },
                }
            }
            for old in &previous_attachments {
                if !attachments.contains_key(&old.id) {
                    db.execute("UPDATE attachment_operations SET state='retired',reason='sync_projection' WHERE json_extract(attachment,'$.id')=?1",[&old.id])?;
                    db.execute("DELETE FROM attachments WHERE id=?1", [&old.id])?;
                }
            }
            for a in attachments.values() {
                if !previous_attachments.iter().any(|old| old == a) {
                    db.execute(
                        "INSERT OR REPLACE INTO attachments(id,note_id,body)VALUES(?1,?2,?3)",
                        params![a.id, a.note_id, serde_json::to_string(a)?],
                    )?;
                }
            }
            for wire in chosen.values() {
                if (wire.kind == EntityKind::Note && !excluded.contains(&wire.entity_id))
                    || (wire.kind == EntityKind::Folder && excluded.is_empty())
                {
                    set_projection(db, wire)?;
                }
            }
        }
        Ok(changes
            .into_iter()
            .map(|(kind, entity_id)| VersionSummary {
                digest: chosen[&(kind.clone(), entity_id.clone())].digest.clone(),
                kind,
                entity_id,
            })
            .collect())
    }
}
