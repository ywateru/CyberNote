use super::*;
fn system_folders() -> Vec<Folder> {
    [
        ("default", "备忘录", 0),
        ("quick", "快速备忘录", -1),
        ("trash", "最近删除", 9999),
    ]
    .into_iter()
    .map(|(id, name, order)| Folder {
        id: id.into(),
        name: name.into(),
        kind: id.into(),
        parent_id: None,
        sort_order: order,
        created_at: 0,
        query: None,
        definition_revision: None,
    })
    .collect()
}
pub(super) fn normal_folder(id: &str) -> Folder {
    Folder {
        id: id.into(),
        name: "dependency".into(),
        kind: "normal".into(),
        parent_id: None,
        sort_order: 0,
        created_at: 0,
        query: None,
        definition_revision: None,
    }
}
fn date(value: i64) -> bool {
    (0..=MAX_RECORDED_AT as i64).contains(&value)
}
fn fields(value: &Value, expected: &[&str]) -> Result<()> {
    let map = value
        .as_object()
        .ok_or_else(|| invalid("实体封装必须为对象"))?;
    if map.len() != expected.len() || map.keys().any(|k| !expected.contains(&k.as_str())) {
        return Err(invalid("实体含未知或缺少字段"));
    }
    Ok(())
}
pub(super) fn note_payload(value: &Value) -> Result<(Note, Vec<WireAttachment>)> {
    let payload: NotePayload =
        serde_json::from_value(value.clone()).map_err(|_| invalid("笔记封装无效"))?;
    fields(
        &payload.note,
        &[
            "id",
            "folderId",
            "document",
            "title",
            "plainText",
            "createdAt",
            "updatedAt",
            "pinned",
            "deletedAt",
            "originalFolderId",
            "locked",
            "paperStyle",
            "sealed",
        ],
    )?;
    let mut raw = payload.note;
    raw["revision"] = json!(0);
    let note: Note = serde_json::from_value(raw).map_err(|_| invalid("笔记字段无效"))?;
    if !valid_id(&note.id)
        || !valid_id(&note.folder_id)
        || note.folder_id == "all"
        || note
            .original_folder_id
            .as_ref()
            .is_some_and(|v| !valid_id(v) || v == "all")
        || !date(note.created_at)
        || !date(note.updated_at)
        || note.deleted_at.is_some_and(|v| !date(v))
        || note.title.len() > 4096
    {
        return Err(invalid("笔记身份、名称或日期无效"));
    }
    if let Some(sealed) = &note.sealed {
        fields(sealed, &["salt", "nonce", "ciphertext"])?;
    }
    let mut seen = HashSet::new();
    let mut attachments = Vec::new();
    for a in &payload.attachments {
        if !valid_id(&a.id)
            || a.note_id != note.id
            || !seen.insert(a.id.clone())
            || !valid_hash(&a.sha256)
            || a.size > MAX_BLOB
        {
            return Err(invalid("附件身份、归属、摘要或长度无效"));
        }
        validate_recorded_at(&a.kind, &a.mime, a.recorded_at)?;
        attachments.push(attachment(a));
    }
    let references = references(&note.document);
    if references != seen {
        return Err(invalid("附件元数据必须与正文实际引用精确一致"));
    }
    let mut folders = system_folders();
    for id in std::iter::once(&note.folder_id).chain(note.original_folder_id.iter()) {
        if !folders.iter().any(|f| &f.id == id) {
            folders.push(normal_folder(id));
        }
    }
    archive::validate_live_graph(&folders, std::slice::from_ref(&note), &attachments)
        .map_err(|e| invalid(e.message))?;
    Ok((note, payload.attachments))
}
pub(super) fn attachment(a: &WireAttachment) -> Attachment {
    Attachment {
        id: a.id.clone(),
        note_id: a.note_id.clone(),
        kind: a.kind.clone(),
        relative_path: format!("s84-{}-{}.blob", sha256(a.id.as_bytes()), a.sha256),
        mime: a.mime.clone(),
        display_name: a.display_name.clone(),
        size: a.size,
        recorded_at: a.recorded_at,
    }
}
pub(super) fn references(doc: &Value) -> HashSet<String> {
    fn visit(v: &Value, result: &mut HashSet<String>) {
        if v["type"] == "attachment" {
            if let Some(id) = v["attrs"]["id"].as_str() {
                result.insert(id.into());
            }
        }
        if let Some(children) = v["content"].as_array() {
            for c in children {
                visit(c, result);
            }
        }
    }
    let mut result = HashSet::new();
    visit(doc, &mut result);
    result
}
pub(super) fn folder_payload(value: &Value) -> Result<Folder> {
    let mut raw = value.clone();
    if raw.get("definitionRevision").is_some() {
        return Err(invalid("wire不能指定本地智能目录版本"));
    }
    if raw["kind"] == "smart" {
        raw["definitionRevision"] = json!(1);
    }
    let folder: Folder =
        serde_json::from_value(raw).map_err(|_| invalid("文件夹字段或智能定义无效"))?;
    if ["default", "quick", "trash", "all"].contains(&folder.id.as_str())
        || !valid_id(&folder.id)
        || !date(folder.created_at)
        || folder.name.trim().is_empty()
        || folder.name.len() > 4096
        || folder.parent_id.as_ref().is_some_and(|p| {
            !valid_id(p) || p == &folder.id || ["trash", "quick", "all"].contains(&p.as_str())
        })
    {
        return Err(invalid("文件夹身份、父引用或名称无效"));
    }
    Ok(folder)
}
pub(super) fn validate(wire: &WireVersion, workspace: &str) -> Result<Vec<WireAttachment>> {
    wire.validate_envelope().map_err(invalid)?;
    if wire.workspace_id != workspace {
        return Err(err("sync_workspace_mismatch", "同步空间不匹配"));
    }
    if wire.kind == EntityKind::Folder
        && ["default", "quick", "trash", "all"].contains(&wire.entity_id.as_str())
    {
        return Err(invalid("系统目录不能被同步修改"));
    }
    let Some(payload) = &wire.payload else {
        return Ok(Vec::new());
    };
    match wire.kind {
        EntityKind::Note => {
            let (note, attachments) = note_payload(payload)?;
            if note.id != wire.entity_id {
                return Err(invalid("笔记封装身份不符"));
            }
            Ok(attachments)
        }
        EntityKind::Folder => {
            let folder = folder_payload(payload)?;
            if folder.id != wire.entity_id {
                return Err(invalid("文件夹封装身份不符"));
            }
            Ok(Vec::new())
        }
    }
}
pub(super) fn wire_note(note: &Note, attachments: Vec<WireAttachment>) -> Result<Value> {
    let mut raw = serde_json::to_value(note)?;
    raw.as_object_mut().unwrap().remove("revision");
    Ok(serde_json::to_value(NotePayload {
        note: raw,
        attachments,
    })?)
}
pub(super) fn wire_folder(folder: &Folder) -> Result<Value> {
    let mut raw = serde_json::to_value(folder)?;
    raw.as_object_mut().unwrap().remove("definitionRevision");
    Ok(raw)
}
pub(super) fn register_attachments(db: &Connection, attachments: &[WireAttachment]) -> Result<()> {
    for attachment in attachments {
        let descriptor = serde_json::to_string(attachment)?;
        let existing: Option<String> = db
            .query_row(
                "SELECT descriptor FROM sync_attachments WHERE id=?1",
                [&attachment.id],
                |r| r.get(0),
            )
            .optional()?;
        if existing.is_some_and(|v| v != descriptor) {
            return Err(err(
                "sync_attachment_conflict",
                "同一附件ID含不同元数据或内容",
            ));
        }
        db.execute(
            "INSERT OR IGNORE INTO sync_attachments(id,descriptor)VALUES(?1,?2)",
            params![attachment.id, descriptor],
        )?;
    }
    Ok(())
}

impl Store {
    pub(super) fn register_sync_attachments(
        &self,
        db: &Connection,
        attachments: &[WireAttachment],
    ) -> Result<()> {
        for remote in attachments {
            let local: Option<String> = db
                .query_row(
                    "SELECT body FROM attachments WHERE id=?1",
                    [&remote.id],
                    |r| r.get(0),
                )
                .optional()?;
            if let Some(local) = local {
                let local: Attachment = serde_json::from_str(&local)?;
                if local.note_id != remote.note_id
                    || local.kind != remote.kind
                    || local.mime != remote.mime
                    || local.display_name != remote.display_name
                    || local.size != remote.size
                    || local.recorded_at != remote.recorded_at
                    || self.capture_blob(&local)? != remote.sha256
                {
                    return Err(err(
                        "sync_attachment_conflict",
                        "远端附件ID与本机现有附件不一致",
                    ));
                }
            }
        }
        register_attachments(db, attachments)
    }
}
