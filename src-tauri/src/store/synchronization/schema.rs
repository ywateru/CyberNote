use super::*;
fn objects() -> Vec<(String, String)> {
    let tables=[
        ("sync_identity","CREATE TABLE sync_identity(singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL CHECK(version=1), workspace_id TEXT NOT NULL, device_id TEXT NOT NULL, counter INTEGER NOT NULL CHECK(counter>=0), capture INTEGER NOT NULL CHECK(capture IN (0,1)))"),
        ("sync_dirty","CREATE TABLE sync_dirty(kind TEXT NOT NULL CHECK(kind IN ('note','folder')), entity_id TEXT NOT NULL, PRIMARY KEY(kind,entity_id))"),
        ("sync_heads","CREATE TABLE sync_heads(digest TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('note','folder')), entity_id TEXT NOT NULL, vector TEXT NOT NULL, payload TEXT, tombstone INTEGER NOT NULL CHECK(tombstone IN (0,1)), redacted INTEGER NOT NULL CHECK(redacted IN (0,1)), CHECK((payload IS NULL)=(tombstone=1 OR redacted=1)))"),
        ("sync_seen","CREATE TABLE sync_seen(kind TEXT NOT NULL CHECK(kind IN ('note','folder')), entity_id TEXT NOT NULL, vector TEXT NOT NULL, digest TEXT NOT NULL UNIQUE, PRIMARY KEY(kind,entity_id,vector))"),
        ("sync_projection","CREATE TABLE sync_projection(kind TEXT NOT NULL CHECK(kind IN ('note','folder')), entity_id TEXT NOT NULL, digest TEXT NOT NULL, vector TEXT NOT NULL, PRIMARY KEY(kind,entity_id))"),
        ("sync_local_actors","CREATE TABLE sync_local_actors(kind TEXT NOT NULL CHECK(kind IN ('note','folder')), entity_id TEXT NOT NULL, actor_id TEXT NOT NULL, PRIMARY KEY(kind,entity_id,actor_id))"),
        ("sync_branches","CREATE TABLE sync_branches(kind TEXT NOT NULL CHECK(kind IN ('note','folder')), entity_id TEXT NOT NULL, head_digest TEXT NOT NULL, actor_id TEXT NOT NULL, PRIMARY KEY(kind,entity_id,head_digest))"),
        ("sync_frontiers","CREATE TABLE sync_frontiers(kind TEXT NOT NULL CHECK(kind IN ('note','folder')), entity_id TEXT NOT NULL, actor_id TEXT NOT NULL, counter INTEGER NOT NULL CHECK(counter>0), PRIMARY KEY(kind,entity_id,actor_id))"),
        ("sync_attachments","CREATE TABLE sync_attachments(id TEXT PRIMARY KEY, descriptor TEXT NOT NULL)"),
        ("sync_inbox","CREATE TABLE sync_inbox(digest TEXT PRIMARY KEY, wire TEXT NOT NULL)"),
    ];
    let mut result = tables
        .into_iter()
        .map(|(n, s)| (n.to_string(), s.to_string()))
        .collect::<Vec<_>>();
    for (table, k) in [
        ("notes", "note"),
        ("folders", "folder"),
        ("attachments", "note"),
    ] {
        for (event, row) in [("INSERT", "NEW"), ("UPDATE", "NEW"), ("DELETE", "OLD")] {
            let name = format!("sync_capture_{table}_{}", event.to_lowercase());
            let entity = if table == "attachments" {
                format!("{row}.note_id")
            } else {
                format!("{row}.id")
            };
            let condition = if table == "folders" {
                format!(" AND {row}.id NOT IN ('default','quick','trash')")
            } else {
                String::new()
            };
            let mut body =
                format!("INSERT OR IGNORE INTO sync_dirty(kind,entity_id)VALUES('{k}',{entity});");
            if table == "attachments" && event == "UPDATE" {
                body.push_str(
                    "INSERT OR IGNORE INTO sync_dirty(kind,entity_id)VALUES('note',OLD.note_id);",
                );
            }
            if table == "notes" {
                let selection = if event == "DELETE" {
                    "SELECT digest FROM sync_heads WHERE kind='note' AND entity_id=OLD.id"
                } else {
                    "SELECT digest FROM sync_projection WHERE kind='note' AND entity_id=NEW.id AND json_extract(NEW.body,'$.locked')=1"
                };
                // Only digest/vector context remains. This is inside the business SQL
                // boundary, including a lock commit before any background flush.
                let context = if event == "DELETE" {
                    "SELECT vector FROM sync_heads WHERE kind='note' AND entity_id=OLD.id"
                } else {
                    "SELECT vector FROM sync_projection WHERE kind='note' AND entity_id=NEW.id AND json_extract(NEW.body,'$.locked')=1"
                };
                // An out-of-order ancestor may be staged without ever becoming
                // a head. Remove all causal ancestors of the locked projection
                // (or purged known heads), while retaining concurrent payloads.
                let ancestors=format!("json_extract(wire,'$.kind')='note' AND json_extract(wire,'$.entityId')={row}.id AND EXISTS(SELECT 1 FROM ({context}) AS context WHERE NOT EXISTS(SELECT 1 FROM json_each(json_extract(sync_inbox.wire,'$.vector')) AS dot WHERE CAST(dot.value AS INTEGER)>coalesce((SELECT value FROM json_each(context.vector) WHERE key=dot.key),0)))");
                body.push_str(&format!("DELETE FROM sync_inbox WHERE digest IN ({selection}) OR ({ancestors});UPDATE sync_heads SET payload=NULL,redacted=1 WHERE digest IN ({selection});"));
            }
            result.push((name.clone(),format!("CREATE TRIGGER {name} AFTER {event} ON {table} WHEN (SELECT capture FROM sync_identity WHERE singleton=1)=1{condition} BEGIN {body} END")));
        }
    }
    result
}
fn compact(sql: &str) -> String {
    let mut quoted = false;
    sql.chars()
        .filter_map(|c| {
            if c == '\'' {
                quoted = !quoted;
            }
            if quoted || c == '\'' {
                Some(c)
            } else if c.is_ascii_whitespace() || c == ';' {
                None
            } else {
                Some(c.to_ascii_lowercase())
            }
        })
        .collect()
}
impl Store {
    /// Read-only early rejection. The adopter repeats this under its transaction;
    /// dirty local edits may be flushed there, never by this inspection.
    pub fn sync_adoption_preflight(&self, workspace: &str, device_id: &str) -> Result<()> {
        if !valid_uuid(workspace) || !valid_uuid(device_id) {
            return Err(invalid("workspace和device必须为规范UUID"));
        }
        self.validate_sync_schema()?;
        if let Some(current) = self.sync_identity()? {
            if current.workspace_id == workspace && current.device_id == device_id {
                return Ok(());
            }
            self.adoption_projection_check(&self.db, true)?;
        }
        Ok(())
    }

    fn adoption_projection_check(&self, db: &Connection, allow_dirty: bool) -> Result<()> {
        let blocked = |message: &str| err("sync_adoption_blocked", message);
        let inbox: bool = db.query_row("SELECT EXISTS(SELECT 1 FROM sync_inbox)", [], |r| r.get(0))?;
        if inbox {
            return Err(blocked("旧同步空间仍有未应用的收件版本，请先处理后再开启新账户同步"));
        }
        let mut dirty_query = db.prepare("SELECT kind,entity_id FROM sync_dirty")?;
        let dirty = dirty_query.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
            .collect::<std::result::Result<HashSet<_>, _>>()?;
        if !allow_dirty && !dirty.is_empty() {
            return Err(blocked("旧同步空间的本地更改尚未完整固化"));
        }
        let mut projection_query = db.prepare("SELECT kind,entity_id,digest,vector FROM sync_projection")?;
        let projections = projection_query.query_map([], |r| Ok(((r.get::<_, String>(0)?, r.get::<_, String>(1)?), (r.get::<_, String>(2)?, r.get::<_, String>(3)?))))?
            .collect::<std::result::Result<BTreeMap<_, _>, _>>()?;
        let mut covered = HashSet::new();
        let local_attachments = self.attachments()?;
        for head in heads(db)? {
            let wire = &head.wire;
            let key = (wire.kind.as_str().to_string(), wire.entity_id.clone());
            if !covered.insert(key.clone()) {
                return Err(blocked("旧同步空间仍有未解决的并发版本，请先处理冲突"));
            }
            let Some((digest, vector)) = projections.get(&key) else {
                return Err(blocked("旧同步空间存在尚未投影的版本，不能丢弃后切换"));
            };
            let vector: Vector = serde_json::from_str(vector)?;
            if digest != &wire.digest || vector != wire.vector {
                return Err(blocked("旧同步空间的版本与本地投影不一致，请先完成应用"));
            }
            if allow_dirty && dirty.contains(&key) {
                // A local save/lock/purge is retained in the business rows and
                // must be captured before judging the final projection.
                continue;
            }
            if head.redacted {
                return Err(blocked("旧同步空间仍有未固化的锁定或删除版本"));
            }
            validation::validate(wire, &identity(db)?.workspace_id)
                .map_err(|_| blocked("旧同步空间的持久版本校验失败，不能切换"))?;
            let current = match wire.kind {
                EntityKind::Folder => match self.folder(&wire.entity_id) {
                    Ok(folder) => Some(validation::wire_folder(&folder)?),
                    Err(error) if error.code == "not_found" => None,
                    Err(error) => return Err(error),
                },
                EntityKind::Note => match self.note(&wire.entity_id) {
                    Ok(note) => {
                        let media = wire.payload.as_ref().map(validation::note_payload).transpose()?
                            .map(|(_, media)| media).unwrap_or_default();
                        for expected in &media {
                            let local = local_attachments.iter().find(|a| a.id == expected.id)
                                .ok_or_else(|| blocked("旧同步投影缺少本机附件，不能切换"))?;
                            if local.note_id != expected.note_id || local.kind != expected.kind
                                || local.mime != expected.mime || local.display_name != expected.display_name
                                || local.size != expected.size || local.recorded_at != expected.recorded_at
                            {
                                return Err(blocked("旧同步投影与本机附件元数据不一致"));
                            }
                            // The read-only preflight checks metadata only. The
                            // transactional final check also checks prepared bytes.
                            if !allow_dirty && self.sync_local_hash(local)? != (expected.sha256.clone(), expected.size) {
                                return Err(blocked("旧同步投影与本机附件原字节不一致"));
                            }
                        }
                        Some(validation::wire_note(&note, media)?)
                    }
                    Err(error) if error.code == "not_found" => None,
                    Err(error) => return Err(error),
                },
            };
            if current != wire.payload {
                return Err(blocked("旧同步投影与本机完整内容不一致，不能丢弃版本"));
            }
        }
        if projections.keys().any(|key| !covered.contains(key)) {
            return Err(blocked("旧同步空间存在失配的投影记录"));
        }
        for key in self.notes()?.into_iter().map(|note| ("note".to_string(), note.id))
            .chain(self.folders()?.into_iter().filter(|folder| !["default", "quick", "trash"].contains(&folder.id.as_str()))
                .map(|folder| ("folder".to_string(), folder.id)))
        {
            if !covered.contains(&key) && !(allow_dirty && dirty.contains(&key)) {
                return Err(blocked("本机内容尚未纳入旧同步投影，请先固化更改"));
            }
        }
        Ok(())
    }

    /// Called only after the adapter seals and joins old transports and verifies
    /// the new workspace. Business rows and managed attachment files are untouched.
    pub fn sync_adopt_workspace(&mut self, workspace: &str, device_id: &str) -> Result<SyncIdentity> {
        self.sync_adoption_preflight(workspace, device_id)?;
        let current = self.sync_identity()?;
        if let Some(current) = &current {
            if current.workspace_id == workspace && current.device_id == device_id {
                return Ok(current.clone());
            }
        }
        if current.is_none() {
            let identity = self.sync_enable_with_device(Some(workspace), device_id)?;
            self.instance_id = Uuid::new_v4();
            return Ok(identity);
        }
        let adopted = SyncIdentity { version: 1, workspace_id: workspace.into(), device_id: device_id.into() };
        let tx = self.db.unchecked_transaction()?;
        // Do not let flush conceal an unapplied remote head beneath a dirty save.
        self.adoption_projection_check(&tx, true)?;
        self.flush_in(&tx)?;
        self.adoption_projection_check(&tx, false)?;
        let objects = objects();
        for (name, sql) in &objects {
            if sql.starts_with("CREATE TRIGGER") {
                tx.execute_batch(&format!("DROP TRIGGER {name}"))?;
            }
        }
        for (name, sql) in &objects {
            if sql.starts_with("CREATE TABLE") {
                tx.execute_batch(&format!("DROP TABLE {name}"))?;
            }
        }
        for (_, sql) in objects { tx.execute_batch(&sql)?; }
        tx.execute("INSERT INTO sync_identity(singleton,version,workspace_id,device_id,counter,capture)VALUES(1,1,?1,?2,0,1)", params![workspace,device_id])?;
        tx.execute("INSERT INTO sync_dirty(kind,entity_id)SELECT 'note',id FROM notes", [])?;
        tx.execute("INSERT INTO sync_dirty(kind,entity_id)SELECT 'folder',id FROM folders WHERE id NOT IN ('default','quick','trash')", [])?;
        self.flush_in(&tx)?;
        tx.commit()?;
        // Process capabilities rotate only after commit. A failed migration keeps
        // the old instance and every old SQL protocol row usable for recovery.
        self.instance_id = Uuid::new_v4();
        Ok(adopted)
    }

    pub(in crate::store) fn validate_sync_schema(&self) -> Result<()> {
        let mut query = self.db.prepare(
            "SELECT name,type,sql FROM sqlite_schema WHERE name GLOB 'sync_*' ORDER BY name",
        )?;
        let actual = query
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<String>>(2)?,
                ))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        if actual.is_empty() {
            return Ok(());
        }
        let expected = objects().into_iter().collect::<BTreeMap<_, _>>();
        if actual.len() != expected.len()
            || actual.iter().any(|(name, kind, sql)| {
                !matches!(kind.as_str(), "table" | "trigger")
                    || !expected
                        .get(name)
                        .zip(sql.as_ref())
                        .is_some_and(|(a, b)| compact(a) == compact(b))
            })
        {
            return Err(err("sync_schema_invalid", "同步扩展结构或触发器不受支持"));
        }
        let row:(u32,String,String,u64,bool)=self.db.query_row("SELECT version,workspace_id,device_id,counter,capture FROM sync_identity WHERE singleton=1",[],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))).map_err(|_|err("sync_schema_invalid","同步身份缺失或损坏"))?;
        if row.0 != 1 || !valid_uuid(&row.1) || !valid_uuid(&row.2) || row.3 > MAX_COUNTER || !row.4
        {
            return Err(err("sync_schema_invalid", "同步身份或捕获状态无效"));
        }
        Ok(())
    }
    pub fn sync_identity(&self) -> Result<Option<SyncIdentity>> {
        if enabled(&self.db)? {
            Ok(Some(identity(&self.db)?))
        } else {
            Ok(None)
        }
    }
    pub fn sync_enable(&mut self, workspace: Option<&str>) -> Result<SyncIdentity> {
        let device = if enabled(&self.db)? {
            identity(&self.db)?.device_id
        } else {
            id()
        };
        self.sync_enable_with_device(workspace, &device)
    }
    // Identity preparation is file-only and belongs to the transport adapter.
    // Adopt is called only after authentication; extension bootstrap and local
    // data capture commit atomically with this exact prepared device identity.
    pub fn sync_enable_with_device(
        &mut self,
        workspace: Option<&str>,
        device_id: &str,
    ) -> Result<SyncIdentity> {
        if !valid_uuid(device_id) {
            return Err(invalid("device必须为规范UUID"));
        }
        if workspace.is_some_and(|v| !valid_uuid(v)) {
            return Err(invalid("workspace必须为规范UUID"));
        }
        self.validate_sync_schema()?;
        if enabled(&self.db)? {
            let current = identity(&self.db)?;
            if workspace.is_some_and(|v| v != current.workspace_id) {
                return Err(err("sync_workspace_mismatch", "本机已经属于其他同步空间"));
            }
            if device_id != current.device_id {
                return Err(err("sync_device_mismatch", "持久同步设备身份不可替换"));
            }
            return Ok(current);
        }
        self.sync_directories()?;
        let identity = SyncIdentity {
            version: 1,
            workspace_id: workspace.map(str::to_string).unwrap_or_else(id),
            device_id: device_id.to_string(),
        };
        let tx = self.db.unchecked_transaction()?;
        for (_, sql) in objects() {
            tx.execute_batch(&sql)?;
        }
        tx.execute("INSERT INTO sync_identity(singleton,version,workspace_id,device_id,counter,capture)VALUES(1,1,?1,?2,0,1)",params![identity.workspace_id,identity.device_id])?;
        tx.execute(
            "INSERT INTO sync_dirty(kind,entity_id)SELECT 'note',id FROM notes",
            [],
        )?;
        tx.execute("INSERT INTO sync_dirty(kind,entity_id)SELECT 'folder',id FROM folders WHERE id NOT IN ('default','quick','trash')",[])?;
        // Bootstrap is atomic: a missing or invalid local attachment leaves no
        // enabled identity/schema or partial initial outbox.
        self.flush_in(&tx)?;
        tx.commit()?;
        Ok(identity)
    }
}
