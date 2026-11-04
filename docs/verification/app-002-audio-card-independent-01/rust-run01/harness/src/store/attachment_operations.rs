//! Narrow, process/window-owned attachment submissions. The journal is private
//! to this store and is deliberately absent from public attachments/archives.
use super::*;
use std::{fs::OpenOptions, io::Write};

const MAX_BYTES: usize = 100 * 1024 * 1024;
const MAX_OPERATIONS: i64 = 10_000;
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct AttachmentOwner {
    pub session: String,
    pub window: String,
    pub incarnation: String,
}
struct Operation {
    id: String,
    note: String,
    owner: AttachmentOwner,
    attachment: Attachment,
    state: String,
    reason: Option<String>,
}
enum Reference {
    Present,
    Absent,
    Uncertain(&'static str),
}
fn valid_operation(value: &str) -> Result<()> {
    if !Uuid::parse_str(value).is_ok_and(|id| id.get_version_num() == 4 && id.to_string() == value)
    {
        return Err(err("invalid", "附件操作ID必须为标准UUID v4"));
    }
    Ok(())
}
fn conflict() -> AppError {
    err("attachment_operation_conflict", "附件操作身份或内容不匹配")
}
fn sync_directory(path: &Path) -> Result<()> {
    #[cfg(unix)]
    fs::File::open(path)?.sync_all()?;
    Ok(())
}
fn response(op: &Operation, state: &str, reason: Option<&str>) -> Result<Value> {
    let mut value = json!({"operationId":op.id,"noteId":op.note,"status":state});
    if matches!(state, "stored" | "committed") {
        value["attachment"] = serde_json::to_value(&op.attachment)?;
    }
    if let Some(reason) = reason {
        value["reason"] = json!(reason);
    }
    Ok(value)
}
impl Store {
    pub(super) fn initialize_attachment_operations(&self) -> Result<()> {
        self.db.execute_batch("CREATE TABLE IF NOT EXISTS attachment_operations(operation_id TEXT PRIMARY KEY, note_id TEXT NOT NULL, owner TEXT NOT NULL, attachment TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('preparing','stored','committed','aborting','aborted','retired')), reason TEXT);")?;
        Ok(())
    }
    fn attachment_operation(&self, operation: &str) -> Result<Option<Operation>> {
        let row = self.db.query_row(
            "SELECT note_id,owner,attachment,state,reason FROM attachment_operations WHERE operation_id=?1",
            [operation], |row| Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?,row.get::<_,String>(2)?,row.get::<_,String>(3)?,row.get::<_,Option<String>>(4)?)),
        ).optional()?;
        row.map(|(note, owner, attachment, state, reason)| {
            Ok(Operation {
                id: operation.into(),
                note,
                owner: serde_json::from_str(&owner)?,
                attachment: serde_json::from_str(&attachment)?,
                state,
                reason,
            })
        })
        .transpose()
    }
    fn owned_operation(
        &self,
        operation: &str,
        note: &str,
        owner: &AttachmentOwner,
    ) -> Result<Option<Operation>> {
        valid_operation(operation)?;
        let op = self.attachment_operation(operation)?;
        if op
            .as_ref()
            .is_some_and(|op| op.note != note || &op.owner != owner)
        {
            return Err(conflict());
        }
        Ok(op)
    }
    fn set_operation_state(&self, op: &Operation, state: &str, reason: Option<&str>) -> Result<()> {
        if self.db.execute(
            "UPDATE attachment_operations SET state=?1,reason=?2 WHERE operation_id=?3",
            params![state, reason, op.id],
        )? != 1
        {
            return Err(err("attachment_operation_missing", "附件操作记录已消失"));
        }
        Ok(())
    }
    // Check both real metadata identity and authoritative document nodes. A
    // missing/changed identity or encrypted owner is not proof of no reference.
    fn operation_reference(&self, op: &Operation) -> Result<Reference> {
        let a = &op.attachment;
        let prefix = format!("op-{}-", op.id);
        let expected = format!("{prefix}{}.blob", a.id);
        if a.note_id != op.note || a.relative_path != expected || Uuid::parse_str(&a.id).is_err() {
            return Ok(Reference::Uncertain("managed_identity_changed"));
        }
        self.attachment_path(&a.relative_path)?;
        let attachments = self.attachments()?;
        let same = attachments.iter().find(|candidate| candidate.id == a.id);
        if same.is_some_and(|candidate| candidate != a)
            || attachments
                .iter()
                .any(|candidate| candidate.relative_path == a.relative_path && candidate.id != a.id)
        {
            return Ok(Reference::Uncertain("managed_identity_changed"));
        }
        if same.is_none() && matches!(op.state.as_str(), "stored" | "committed") {
            return Ok(Reference::Uncertain("attachment_metadata_missing"));
        }
        let mut referenced = false;
        for note in self.notes()? {
            if note.id == op.note && note.locked {
                return Ok(Reference::Uncertain("owner_document_locked"));
            }
            let mut nodes = vec![&note.document];
            while let Some(node) = nodes.pop() {
                if node["type"] == "attachment" && node["attrs"]["id"] == a.id {
                    if note.id != a.note_id || node["attrs"]["kind"] != a.kind || same.is_none() {
                        return Ok(Reference::Uncertain("document_attachment_identity_changed"));
                    }
                    referenced = true;
                }
                if let Some(children) = node["content"].as_array() {
                    nodes.extend(children);
                }
            }
        }
        Ok(if referenced {
            Reference::Present
        } else {
            Reference::Absent
        })
    }
    fn check_operation_file(&self, op: &Operation) -> Result<()> {
        let metadata = fs::metadata(self.attachment_path(&op.attachment.relative_path)?)?;
        if !metadata.is_file() || metadata.len() != op.attachment.size {
            return Err(err("attachment_file_changed", "本次附件文件不完整或已改变"));
        }
        Ok(())
    }
    pub(crate) fn store_attachment_operation(
        &mut self,
        operation: &str,
        note: &str,
        owner: &AttachmentOwner,
        name: &str,
        mime: &str,
        bytes: &[u8],
        recorded_at: Option<u64>,
    ) -> Result<Value> {
        valid_operation(operation)?;
        validate_recorded_at(
            if mime.starts_with("audio/") {
                "audio"
            } else {
                "file"
            },
            mime,
            recorded_at,
        )?;
        if bytes.len() > MAX_BYTES {
            return Err(err("too_large", "附件不能超过100 MB"));
        }
        if name.is_empty()
            || name.len() > 1024
            || mime.is_empty()
            || mime.len() > 255
            || name.chars().chain(mime.chars()).any(char::is_control)
        {
            return Err(err("invalid", "附件名称或类型无效"));
        }
        let display = Path::new(name)
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| err("invalid", "附件名称无效"))?;
        let n = self.note(note)?;
        if n.locked || n.deleted_at.is_some() {
            return Err(err("locked", "锁定或已删除备忘录不能添加附件"));
        }
        if let Some(op) = self.owned_operation(operation, note, owner)? {
            if op.attachment.display_name != display
                || op.attachment.mime != mime
                || op.attachment.size != bytes.len() as u64
                || op.attachment.recorded_at != recorded_at
            {
                return Err(conflict());
            }
            if !matches!(op.state.as_str(), "stored" | "committed") {
                return Err(err(
                    "attachment_operation_incomplete",
                    "本次附件操作未完成或已取消，请查询状态后处理",
                ));
            }
            if fs::read(self.attachment_path(&op.attachment.relative_path)?)? != bytes {
                return Err(conflict());
            }
            return self.query_attachment_operation(operation, note, owner);
        }
        let count: i64 =
            self.db
                .query_row("SELECT count(*) FROM attachment_operations", [], |row| {
                    row.get(0)
                })?;
        if count >= MAX_OPERATIONS {
            return Err(err("attachment_operation_limit", "附件操作记录已达上限"));
        }
        let aid = id();
        let op = Operation {
            id: operation.into(),
            note: note.into(),
            owner: owner.clone(),
            state: "preparing".into(),
            reason: None,
            attachment: Attachment {
                id: aid.clone(),
                note_id: note.into(),
                kind: if mime.starts_with("image/") {
                    "image"
                } else if mime.starts_with("audio/") {
                    "audio"
                } else if mime.starts_with("video/") {
                    "video"
                } else {
                    "file"
                }
                .into(),
                relative_path: format!("op-{operation}-{aid}.blob"),
                mime: mime.into(),
                display_name: display.into(),
                size: bytes.len() as u64,
                recorded_at,
            },
        };
        // SQLite identity is durable before the first possible file write.
        self.db.execute("INSERT INTO attachment_operations(operation_id,note_id,owner,attachment,state)VALUES(?1,?2,?3,?4,'preparing')",params![op.id,op.note,serde_json::to_string(owner)?,serde_json::to_string(&op.attachment)?])?;
        checkpoint("after_prepare");
        let path = self.attachment_path(&op.attachment.relative_path)?;
        let mut file = match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                // The exclusive create did not establish ownership of that
                // existing object. Retire the journal so recovery cannot delete it.
                self.set_operation_state(&op, "retired", Some("path_collision"))?;
                return Err(error.into());
            }
            Err(error) => return Err(error.into()),
        };
        file.write_all(bytes)?;
        file.sync_all()?;
        sync_directory(&self.root.join("attachments"))?;
        checkpoint("after_file");
        let tx = self.db.transaction()?;
        tx.execute(
            "INSERT INTO attachments(id,note_id,body)VALUES(?1,?2,?3)",
            params![
                op.attachment.id,
                op.note,
                serde_json::to_string(&op.attachment)?
            ],
        )?;
        tx.execute(
            "UPDATE attachment_operations SET state='stored',reason=NULL WHERE operation_id=?1",
            [&op.id],
        )?;
        checkpoint("before_store_commit");
        tx.commit()?;
        checkpoint("after_store_commit");
        response(&op, "stored", None)
    }
    pub(crate) fn query_attachment_operation(
        &self,
        operation: &str,
        note: &str,
        owner: &AttachmentOwner,
    ) -> Result<Value> {
        let Some(op) = self.owned_operation(operation, note, owner)? else {
            return Ok(json!({"operationId":operation,"noteId":note,"status":"notPersisted"}));
        };
        if matches!(op.state.as_str(), "aborted" | "retired") {
            return response(&op, "aborted", op.reason.as_deref());
        }
        match self.operation_reference(&op)? {
            Reference::Present => {
                self.check_operation_file(&op)?;
                self.set_operation_state(&op, "committed", None)?;
                response(&op, "committed", None)
            }
            Reference::Uncertain(reason) => response(&op, "deferred", Some(reason)),
            Reference::Absent if op.state == "stored" || op.state == "committed" => {
                self.check_operation_file(&op)?;
                response(&op, &op.state, None)
            }
            Reference::Absent => response(
                &op,
                "deferred",
                Some(if op.state == "aborting" {
                    "cleanup_pending"
                } else {
                    "storage_incomplete"
                }),
            ),
        }
    }
    pub(crate) fn defer_attachment_operation(
        &self,
        operation: &str,
        note: &str,
        owner: &AttachmentOwner,
        reason: &str,
    ) -> Result<Value> {
        let value = self.query_attachment_operation(operation, note, owner)?;
        if value["status"] == "committed"
            || value["status"] == "aborted"
            || value["status"] == "notPersisted"
        {
            return Ok(value);
        }
        Ok(json!({"operationId":operation,"noteId":note,"status":"deferred","reason":reason}))
    }
    pub(crate) fn cancel_attachment_operation(
        &mut self,
        operation: &str,
        note: &str,
        owner: &AttachmentOwner,
    ) -> Result<Value> {
        let Some(op) = self.owned_operation(operation, note, owner)? else {
            return Ok(json!({"operationId":operation,"noteId":note,"status":"notPersisted"}));
        };
        if matches!(op.state.as_str(), "aborted" | "retired") {
            return response(&op, "aborted", op.reason.as_deref());
        }
        self.cancel_owned_attachment_operation(&op)
    }
    fn cancel_owned_attachment_operation(&mut self, op: &Operation) -> Result<Value> {
        match self.operation_reference(op)? {
            Reference::Present => {
                self.check_operation_file(op)?;
                self.set_operation_state(op, "committed", None)?;
                return response(op, "committed", None);
            }
            Reference::Uncertain(reason) => return response(op, "deferred", Some(reason)),
            Reference::Absent => {}
        }
        if op.state == "committed" {
            return response(op, "committed", None);
        }
        // Withdraw metadata first: a later newly registered save cannot refer
        // to an attachment whose cancellation has already begun.
        let tx = self.db.transaction()?;
        tx.execute(
            "DELETE FROM attachments WHERE id=?1 AND note_id=?2",
            params![op.attachment.id, op.note],
        )?;
        tx.execute("UPDATE attachment_operations SET state='aborting',reason='cleanup_pending' WHERE operation_id=?1",[&op.id])?;
        tx.commit()?;
        checkpoint("after_cancel_metadata");
        match fs::remove_file(self.attachment_path(&op.attachment.relative_path)?) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
        sync_directory(&self.root.join("attachments"))?;
        checkpoint("after_cancel_file");
        self.set_operation_state(op, "aborted", None)?;
        response(op, "aborted", None)
    }
    pub(super) fn operation_files_for_purge(&self, note: &str) -> Result<Vec<Attachment>> {
        let ids = {
            let mut query = self.db.prepare("SELECT operation_id FROM attachment_operations WHERE note_id=?1 AND state NOT IN ('aborted','retired')")?;
            let ids = query
                .query_map([note], |row| row.get::<_, String>(0))?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            ids
        };
        let live = self.attachments()?;
        let mut files = Vec::new();
        for id in ids {
            let op = self
                .attachment_operation(&id)?
                .ok_or_else(|| err("attachment_operation_missing", "附件操作记录消失"))?;
            let attachment = op.attachment;
            if attachment.note_id != note
                || attachment.relative_path != format!("op-{}-{}.blob", op.id, attachment.id)
                || live.iter().any(|other| {
                    (other.id == attachment.id || other.relative_path == attachment.relative_path)
                        && other != &attachment
                })
            {
                return Err(conflict());
            }
            self.attachment_path(&attachment.relative_path)?;
            files.push(attachment);
        }
        Ok(files)
    }
    pub(super) fn recover_attachment_operations(&mut self) -> Result<()> {
        let ids = {
            let mut query=self.db.prepare("SELECT operation_id FROM attachment_operations WHERE state IN ('preparing','stored','aborting')")?;
            let ids = query
                .query_map([], |row| row.get::<_, String>(0))?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            ids
        };
        for operation in ids {
            let op = self
                .attachment_operation(&operation)?
                .ok_or_else(|| err("attachment_operation_missing", "恢复时附件操作消失"))?;
            // Only this private journal's nonterminal creations are eligible.
            // Old attachments/orphans and terminal histories are never swept.
            self.cancel_owned_attachment_operation(&op)?;
        }
        Ok(())
    }
}
#[cfg(not(test))]
fn checkpoint(_: &str) {}
#[cfg(test)]
fn checkpoint(stage: &str) {
    if std::env::var("NOTES_TEST_ATTACHMENT_CRASH").as_deref() == Ok(stage) {
        std::process::exit(78);
    }
}
#[cfg(test)]
#[path = "attachment_operations/tests.rs"]
mod tests;
