//! Versioned local application extension. Excluded from wire and logical archives.
use super::now;
use super::*;
use crate::{
    agent_access::TrustedContext,
    application::{self as app, *},
};
use std::collections::BTreeSet;

const TABLES: &[(&str, &str)] = &[
    ("application_identity", "CREATE TABLE application_identity(id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL CHECK(version=1), workspace_id TEXT NOT NULL, incarnation TEXT NOT NULL, file_identity TEXT NOT NULL, generation INTEGER NOT NULL CHECK(generation>=0))"),
    ("application_operations", "CREATE TABLE application_operations(incarnation TEXT NOT NULL, client_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, grant_id TEXT NOT NULL, operation_id TEXT NOT NULL UNIQUE, tool TEXT NOT NULL, parameter_hash TEXT NOT NULL, note_id TEXT NOT NULL, result TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(incarnation,client_id,idempotency_key))"),
];
fn triggers() -> Vec<(String, String)> {
    let mut result = Vec::new();
    for table in ["notes", "folders", "attachments"] {
        for op in ["INSERT", "UPDATE", "DELETE"] {
            let name = format!("application_{table}_{}", op.to_lowercase());
            result.push((name.clone(), format!("CREATE TRIGGER {name} AFTER {op} ON {table} BEGIN UPDATE application_identity SET generation=generation+1 WHERE id=1; END")));
        }
    }
    result
}
fn compact(sql: &str) -> String {
    sql.chars()
        .filter(|c| !c.is_ascii_whitespace() && *c != ';')
        .flat_map(char::to_lowercase)
        .collect()
}
impl Store {
    /// Run before any initialization or recovery writes, including base schema migration.
    pub(super) fn validate_application_schema(&self) -> Result<()> {
        let mut q = self
            .db
            .prepare("SELECT name,type,sql FROM sqlite_schema WHERE name GLOB 'application_*'")?;
        let rows = q
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        if rows.is_empty() {
            return Ok(());
        }
        let expected: Vec<_> = TABLES
            .iter()
            .map(|(n, s)| (n.to_string(), "table".to_string(), s.to_string()))
            .chain(
                triggers()
                    .into_iter()
                    .map(|(n, s)| (n, "trigger".into(), s)),
            )
            .collect();
        if rows.len() != expected.len()
            || rows.iter().any(|(n, t, s)| {
                !expected
                    .iter()
                    .any(|(en, et, es)| n == en && t == et && compact(s) == compact(es))
            })
        {
            return Err(err(
                "schema_invalid",
                "Application extension schema is unsupported or incomplete",
            ));
        }
        let (count, version): (i64, i64) = self.db.query_row(
            "SELECT count(*),coalesce(min(version),0) FROM application_identity",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        if count != 1 || version != 1 {
            return Err(err(
                "schema_version",
                "Application extension identity version is unsupported",
            ));
        }
        let identity = self.application_identity()?;
        if Uuid::parse_str(&identity.0).is_err() || Uuid::parse_str(&identity.1).is_err() {
            return Err(err(
                "schema_invalid",
                "Application workspace identity is invalid",
            ));
        }
        Ok(())
    }
    pub(super) fn initialize_application_storage(&self) -> Result<()> {
        use std::os::unix::fs::MetadataExt;
        let meta = fs::metadata(self.root.join("notes.sqlite3"))?;
        let file_identity = app::hash(&json!([
            fs::canonicalize(&self.root)?.to_string_lossy(),
            meta.dev(),
            meta.ino()
        ]))?;
        let tx = self.db.unchecked_transaction()?;
        let exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_schema WHERE name='application_identity')",
            [],
            |r| r.get(0),
        )?;
        if !exists {
            for (_, sql) in TABLES {
                tx.execute_batch(sql)?;
            }
            tx.execute(
                "INSERT INTO application_identity VALUES(1,1,?1,?2,?3,0)",
                params![id(), id(), file_identity],
            )?;
            for (_, sql) in triggers() {
                tx.execute_batch(&sql)?;
            }
        } else {
            let previous: String = tx.query_row(
                "SELECT file_identity FROM application_identity WHERE id=1",
                [],
                |r| r.get(0),
            )?;
            if previous != file_identity {
                // Raw cloned/restored file or moved library: invalidate old versions,
                // grants and operations even if all business rows are byte-identical.
                tx.execute("UPDATE application_identity SET workspace_id=?1,incarnation=?2,file_identity=?3,generation=generation+1 WHERE id=1",params![id(),id(),file_identity])?;
                tx.execute("DELETE FROM application_operations", [])?;
            }
        }
        tx.execute(
            "DELETE FROM application_operations WHERE created_at < ?1",
            [now() - 30 * 24 * 60 * 60 * 1000],
        )?;
        tx.commit()?;
        Ok(())
    }
    pub fn application_identity(&self) -> Result<(String, String)> {
        self.db
            .query_row(
                "SELECT workspace_id,incarnation FROM application_identity WHERE id=1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(Into::into)
    }
    pub(crate) fn application_generation(&self) -> Result<i64> {
        self.db
            .query_row(
                "SELECT generation FROM application_identity WHERE id=1",
                [],
                |r| r.get(0),
            )
            .map_err(Into::into)
    }
    pub(crate) fn application_folders(&self) -> Result<Vec<Folder>> {
        self.folders()
    }
    pub(crate) fn application_note(&self, ctx: &TrustedContext, id: &str) -> ToolResult<Note> {
        // Scope filtering happens in SQL before JSON deserialization/projection.
        let owner: Option<String> = self.db.query_row("SELECT folder_id FROM notes WHERE id=?1 AND json_extract(body,'$.locked')=0 AND json_extract(body,'$.deletedAt') IS NULL",[id],|r|r.get(0)).optional().map_err(ToolError::storage)?;
        if owner.as_ref().is_none_or(|f| !ctx.folder_ids.contains(f)) {
            return Err(ToolError::not_found());
        }
        self.note(id).map_err(ToolError::storage)
    }
    pub(crate) fn application_scan(
        &self,
        ctx: &TrustedContext,
        folder: Option<&str>,
        mut visit: impl FnMut(Note) -> ToolResult<()>,
    ) -> ToolResult<()> {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        for fid in &ctx.folder_ids {
            if folder.is_some_and(|f| f != fid) {
                continue;
            }
            let mut q = self.db.prepare("SELECT body FROM notes WHERE folder_id=?1 AND json_extract(body,'$.locked')=0 AND json_extract(body,'$.deletedAt') IS NULL").map_err(ToolError::storage)?;
            let mut rows = q.query([fid]).map_err(ToolError::storage)?;
            while let Some(row) = rows.next().map_err(ToolError::storage)? {
                if std::time::Instant::now() >= deadline {
                    return Err(ToolError::new("TIMEOUT", "Query deadline exceeded"));
                }
                let body: String = row.get(0).map_err(ToolError::storage)?;
                let note: Note = serde_json::from_str(&body).map_err(ToolError::storage)?;
                visit(note)?;
            }
        }
        Ok(())
    }
    pub(crate) fn application_projection(
        &self,
        note: &Note,
    ) -> ToolResult<(Value, usize, BTreeSet<String>)> {
        let mut q = self
            .db
            .prepare("SELECT body FROM attachments WHERE note_id=?1")
            .map_err(ToolError::storage)?;
        let bodies = q
            .query_map([&note.id], |r| r.get::<_, String>(0))
            .map_err(ToolError::storage)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(ToolError::storage)?;
        let attachments: Vec<Attachment> = bodies
            .iter()
            .map(|s| serde_json::from_str(s))
            .collect::<std::result::Result<_, _>>()
            .map_err(ToolError::storage)?;
        let internal = self.internal_import_ids(note, &attachments);
        let mut document = note.document.clone();
        Self::project_import_references(&mut document, &internal);
        let public_ids = attachment_ids(&document);
        let count = attachments
            .iter()
            .filter(|a| public_ids.contains(&a.id) && !internal.contains(&a.id))
            .count();
        let tags = archive::validated_tags(note, &attachments)
            .map_err(ToolError::schema)?
            .into_iter()
            .collect();
        Ok((document, count, tags))
    }
    pub(crate) fn application_version(&self, note: &Note) -> ToolResult<String> {
        let (workspace, incarnation) = self.application_identity().map_err(ToolError::storage)?;
        let body = serde_json::to_value(note).map_err(ToolError::storage)?;
        let mut q = self
            .db
            .prepare("SELECT body FROM attachments WHERE note_id=?1 ORDER BY id")
            .map_err(ToolError::storage)?;
        let attachments = q
            .query_map([&note.id], |r| r.get::<_, String>(0))
            .map_err(ToolError::storage)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(ToolError::storage)?;
        app::hash(&json!([workspace, incarnation, body, attachments]))
    }
    pub(crate) fn application_operation(
        &self,
        ctx: &TrustedContext,
        key: Option<&str>,
        operation: Option<&str>,
    ) -> ToolResult<Option<(String, String, String, MutationResult)>> {
        let row: Option<(String,String,String,String)> = self.db.query_row(
            "SELECT tool,parameter_hash,grant_id,result FROM application_operations WHERE incarnation=?1 AND client_id=?2 AND ((?3 IS NOT NULL AND idempotency_key=?3) OR (?4 IS NOT NULL AND operation_id=?4)) AND created_at>=?5",
            params![ctx.incarnation,ctx.client_id,key,operation,now()-30*24*60*60*1000],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional().map_err(ToolError::storage)?;
        row.map(|(tool, hash, grant, result)| {
            Ok((
                tool,
                hash,
                grant,
                serde_json::from_str(&result).map_err(ToolError::storage)?,
            ))
        })
        .transpose()
    }
    pub(crate) fn application_commit(
        &mut self,
        ctx: &TrustedContext,
        command: &Mutation,
        operation: &str,
    ) -> ToolResult<MutationResult> {
        let tx = rusqlite::Transaction::new_unchecked(
            &self.db,
            rusqlite::TransactionBehavior::Immediate,
        )
        .map_err(ToolError::storage)?;
        let (workspace, incarnation) = self.application_identity().map_err(ToolError::storage)?;
        ctx.check(&workspace, &incarnation, Some(command.scope()))?;
        let created = matches!(command, Mutation::Create { .. });
        let mut note = match command {
            Mutation::Create { folder_id, .. } => {
                if !ctx.folder_ids.contains(folder_id) {
                    return Err(ToolError::not_found());
                }
                let folder = self.folder(folder_id).map_err(|_| ToolError::not_found())?;
                smart::require_live_owner(&folder).map_err(ToolError::schema)?;
                Note {
                    id: id(),
                    folder_id: folder_id.clone(),
                    document: empty_doc(),
                    title: String::new(),
                    plain_text: String::new(),
                    created_at: now(),
                    updated_at: now(),
                    pinned: false,
                    deleted_at: None,
                    original_folder_id: None,
                    locked: false,
                    paper_style: "plain".into(),
                    revision: 0,
                    sealed: None,
                }
            }
            _ => self.application_note(ctx, command.note_id().unwrap())?,
        };
        let old_version = self.application_version(&note)?;
        if command.expected().is_some_and(|v| v != old_version) {
            return Err(ToolError::conflict(old_version));
        }
        let mut document = match command {
            Mutation::Create {
                format, content, ..
            } => input_document(format, content)?,
            Mutation::Update {
                format, content, ..
            } => {
                if *format == Format::Text && !plain_document(&note.document) {
                    return Err(ToolError::new(
                        "LOSSY_REPLACEMENT",
                        "Text replacement would discard complex content",
                    ));
                }
                input_document(format, content)?
            }
            Mutation::Append { text, .. } => {
                let mut doc = note.document.clone();
                let children = doc["content"].as_array_mut().ok_or_else(|| {
                    ToolError::new("SCHEMA_INVALID", "Existing document has no block content")
                })?;
                for line in text.split('\n') {
                    children.push(if line.is_empty() {
                        json!({"type":"paragraph"})
                    } else {
                        json!({"type":"paragraph","content":[{"type":"text","text":line}]})
                    });
                }
                input_document(&Format::Document, &doc)?
            }
        };
        self.validate_document(&document, &note)
            .map_err(ToolError::schema)?;
        if !created {
            self.preserve_import_references(&mut document, &note)
                .map_err(ToolError::schema)?;
            if !attachment_ids(&note.document).is_subset(&attachment_ids(&document)) {
                return Err(ToolError::new(
                    "SCHEMA_INVALID",
                    "Removing existing attachment references is not supported",
                ));
            }
        }
        self.validate_document(&document, &note)
            .map_err(ToolError::schema)?;
        let text = doc_text(&document);
        note.title = text
            .lines()
            .next()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or("新备忘录")
            .chars()
            .take(150)
            .collect();
        note.plain_text = text;
        note.document = document;
        note.updated_at = now();
        note.revision = note
            .revision
            .checked_add(1)
            .ok_or_else(|| ToolError::new("STORAGE_ERROR", "Revision overflow"))?;
        let result = MutationResult {
            operation_id: operation.into(),
            note_id: note.id.clone(),
            committed_revision: note.revision,
            committed_version: self.application_version(&note)?,
            committed: true,
            warnings: vec![],
        };
        let parameter_hash =
            app::hash(&serde_json::to_value(command).map_err(ToolError::storage)?)?;
        ctx.check(&workspace, &incarnation, Some(command.scope()))?;
        // Session is the sole writer. SQL revision predicate also rejects an unexpected
        // external connection racing this transaction; UNIQUE key protects replay.
        if created {
            tx.execute(
                "INSERT INTO notes(id,folder_id,body,revision)VALUES(?1,?2,?3,?4)",
                params![
                    note.id,
                    note.folder_id,
                    serde_json::to_string(&note).map_err(ToolError::storage)?,
                    note.revision
                ],
            )
            .map_err(ToolError::storage)?;
        } else {
            let changed = tx
                .execute(
                    "UPDATE notes SET body=?1,revision=?2 WHERE id=?3 AND revision=?4",
                    params![
                        serde_json::to_string(&note).map_err(ToolError::storage)?,
                        note.revision,
                        note.id,
                        note.revision - 1
                    ],
                )
                .map_err(ToolError::storage)?;
            if changed != 1 {
                return Err(ToolError::new(
                    "REVISION_CONFLICT",
                    "Revision changed before commit",
                ));
            }
        }
        tx.execute(
            "DELETE FROM application_operations WHERE created_at < ?1",
            [now() - 30 * 24 * 60 * 60 * 1000],
        )
        .map_err(ToolError::storage)?;
        tx.execute("INSERT INTO application_operations(incarnation,client_id,idempotency_key,grant_id,operation_id,tool,parameter_hash,note_id,result,created_at)VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",params![incarnation,ctx.client_id,command.key(),ctx.grant_id,operation,command.tool(),parameter_hash,note.id,serde_json::to_string(&result).map_err(ToolError::storage)?,now()]).map_err(ToolError::storage)?;
        tx.commit().map_err(ToolError::storage)?;
        self.committed("note", &note.id, Some(note.revision));
        if created {
            self.created(&note.id);
        }
        Ok(result)
    }
    pub(crate) fn application_warning(&self, operation: &str, warning: &str) -> ToolResult<()> {
        let body: String = self
            .db
            .query_row(
                "SELECT result FROM application_operations WHERE operation_id=?1",
                [operation],
                |r| r.get(0),
            )
            .map_err(ToolError::storage)?;
        let mut result: MutationResult = serde_json::from_str(&body).map_err(ToolError::storage)?;
        if !result.warnings.iter().any(|w| w == warning) {
            result.warnings.push(warning.into());
        }
        self.db
            .execute(
                "UPDATE application_operations SET result=?1 WHERE operation_id=?2",
                params![
                    serde_json::to_string(&result).map_err(ToolError::storage)?,
                    operation
                ],
            )
            .map_err(ToolError::storage)?;
        Ok(())
    }
}
