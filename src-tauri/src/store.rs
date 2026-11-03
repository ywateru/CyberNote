use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::Argon2;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::{rngs::OsRng, RngCore};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
}
pub type Result<T> = std::result::Result<T, AppError>;
impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        err("database", e.to_string())
    }
}
impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        err("filesystem", e.to_string())
    }
}
impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        err("document", e.to_string())
    }
}
fn err(code: &str, message: impl Into<String>) -> AppError {
    AppError {
        code: code.into(),
        message: message.into(),
    }
}
fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
fn id() -> String {
    Uuid::new_v4().to_string()
}
fn empty_doc() -> Value {
    json!({"type":"doc","content":[{"type":"heading","attrs":{"level":1}}]})
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub kind: String,
    pub sort_order: i64,
    pub created_at: i64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub folder_id: String,
    pub document: Value,
    pub title: String,
    pub plain_text: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub pinned: bool,
    pub deleted_at: Option<i64>,
    pub original_folder_id: Option<String>,
    pub locked: bool,
    pub paper_style: String,
    pub revision: i64,
    #[serde(default)]
    pub sealed: Option<Value>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: String,
    pub note_id: String,
    pub kind: String,
    pub relative_path: String,
    pub mime: String,
    pub display_name: String,
    pub size: u64,
}
pub struct Store {
    db: Connection,
    root: PathBuf,
    keys: HashMap<String, [u8; 32]>,
}
impl Store {
    pub fn open(root: impl AsRef<Path>) -> Result<Self> {
        fs::create_dir_all(root.as_ref().join("attachments"))?;
        let db = Connection::open(root.as_ref().join("notes.sqlite3"))?;
        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS folders(id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY, folder_id TEXT NOT NULL, body TEXT NOT NULL, revision INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS attachments(id TEXT PRIMARY KEY, note_id TEXT NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL); PRAGMA user_version=1;")?;
        let mut s = Self {
            db,
            root: root.as_ref().into(),
            keys: HashMap::new(),
        };
        for (fid, name, kind, order) in [
            ("default", "备忘录", "default", 0),
            ("quick", "快速备忘录", "quick", -1),
            ("trash", "最近删除", "trash", 9999),
        ] {
            if s.folder(fid).is_err() {
                s.put_folder(&Folder {
                    id: fid.into(),
                    name: name.into(),
                    parent_id: None,
                    kind: kind.into(),
                    sort_order: order,
                    created_at: now(),
                })?;
            }
        }
        s.db.execute("INSERT OR IGNORE INTO settings(id,body)VALUES(1,'{}')", [])?;
        Ok(s)
    }
    fn put_folder(&mut self, f: &Folder) -> Result<()> {
        self.db.execute(
            "INSERT OR REPLACE INTO folders(id,body)VALUES(?1,?2)",
            params![f.id, serde_json::to_string(f)?],
        )?;
        Ok(())
    }
    fn folder(&self, fid: &str) -> Result<Folder> {
        let x: Option<String> = self
            .db
            .query_row("SELECT body FROM folders WHERE id=?1", [fid], |r| r.get(0))
            .optional()?;
        serde_json::from_str(&x.ok_or_else(|| err("not_found", "文件夹不存在"))?)
            .map_err(Into::into)
    }
    fn note(&self, nid: &str) -> Result<Note> {
        let x: Option<String> = self
            .db
            .query_row("SELECT body FROM notes WHERE id=?1", [nid], |r| r.get(0))
            .optional()?;
        serde_json::from_str(&x.ok_or_else(|| err("not_found", "备忘录不存在"))?)
            .map_err(Into::into)
    }
    fn folders(&self) -> Result<Vec<Folder>> {
        let mut q = self.db.prepare("SELECT body FROM folders ORDER BY rowid")?;
        let rows = q
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        rows.into_iter()
            .map(|s| serde_json::from_str(&s).map_err(Into::into))
            .collect()
    }
    fn notes(&self) -> Result<Vec<Note>> {
        let mut q = self
            .db
            .prepare("SELECT body FROM notes ORDER BY rowid DESC")?;
        let rows = q
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        rows.into_iter()
            .map(|s| serde_json::from_str(&s).map_err(Into::into))
            .collect()
    }
    fn attachments(&self) -> Result<Vec<Attachment>> {
        let mut q = self.db.prepare("SELECT body FROM attachments")?;
        let rows = q
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        rows.into_iter()
            .map(|s| serde_json::from_str(&s).map_err(Into::into))
            .collect()
    }
    fn put_note(&mut self, n: &Note) -> Result<()> {
        self.db.execute(
            "INSERT OR REPLACE INTO notes(id,folder_id,body,revision)VALUES(?1,?2,?3,?4)",
            params![n.id, n.folder_id, serde_json::to_string(n)?, n.revision],
        )?;
        Ok(())
    }
    fn visible(&self, mut n: Note) -> Result<Note> {
        if n.locked {
            if let Some(k) = self.keys.get(&n.id) {
                n.document = decrypt(
                    n.sealed
                        .as_ref()
                        .ok_or_else(|| err("encryption", "加密数据缺失"))?,
                    k,
                )?;
                n.plain_text = doc_text(&n.document);
            }
        }
        Ok(n)
    }
    pub fn workspace(&self) -> Result<Value> {
        let ns = self
            .notes()?
            .into_iter()
            .map(|n| self.visible(n))
            .collect::<Result<Vec<_>>>()?;
        let settings: String =
            self.db
                .query_row("SELECT body FROM settings WHERE id=1", [], |r| r.get(0))?;
        Ok(
            json!({"folders":self.folders()?,"notes":ns,"attachments":self.attachments()?,"settings":serde_json::from_str::<Value>(&settings)?}),
        )
    }
    pub fn action(&mut self, a: Value) -> Result<Value> {
        let op = a["type"]
            .as_str()
            .ok_or_else(|| err("invalid", "缺少操作类型"))?;
        match op {
            "createNote" => {
                let folder_id = a["folderId"].as_str().unwrap_or("default");
                let f = self.folder(folder_id)?;
                if f.kind == "trash" {
                    return Err(err("invalid", "不能在最近删除中新建备忘录"));
                }
                let n = Note {
                    id: id(),
                    folder_id: folder_id.into(),
                    document: empty_doc(),
                    title: "新备忘录".into(),
                    plain_text: "".into(),
                    created_at: now(),
                    updated_at: now(),
                    pinned: false,
                    deleted_at: None,
                    original_folder_id: None,
                    locked: false,
                    paper_style: "plain".into(),
                    revision: 0,
                    sealed: None,
                };
                self.put_note(&n)?;
                return Ok(json!(n));
            }
            "saveNote" => {
                let nid = str_field(&a, "id")?;
                let mut n = self.note(nid)?;
                if n.deleted_at.is_some() {
                    return Err(err("deleted", "此备忘录已移到最近删除"));
                }
                let rev = a["revision"]
                    .as_i64()
                    .ok_or_else(|| err("invalid", "缺少保存版本"))?;
                if n.revision != rev {
                    return Err(err("conflict", "备忘录已更改，请重新打开后重试"));
                }
                let document = a
                    .get("document")
                    .ok_or_else(|| err("invalid", "缺少文档"))?
                    .clone();
                if document["type"] != "doc" {
                    return Err(err("invalid", "无效文档"));
                }
                let text = doc_text(&document);
                n.title = text
                    .lines()
                    .next()
                    .filter(|x| !x.trim().is_empty())
                    .unwrap_or("新备忘录")
                    .chars()
                    .take(150)
                    .collect();
                n.updated_at = now();
                n.revision += 1;
                if n.locked {
                    let key = self
                        .keys
                        .get(nid)
                        .ok_or_else(|| err("locked", "请先解锁备忘录"))?;
                    let salt = n
                        .sealed
                        .as_ref()
                        .and_then(|x| x["salt"].as_str())
                        .unwrap_or_default()
                        .to_string();
                    n.sealed = Some(encrypt(&document, key, &salt)?);
                    n.document = empty_doc();
                    n.plain_text.clear();
                } else {
                    n.document = document;
                    n.plain_text = text;
                }
                self.put_note(&n)?;
                return Ok(json!(self.visible(n)?));
            }
            "patchNote" => {
                let mut n = self.note(str_field(&a, "id")?)?;
                if let Some(p) = a["pinned"].as_bool() {
                    n.pinned = p;
                }
                if let Some(p) = a["paperStyle"].as_str() {
                    if ![
                        "plain",
                        "lines-small",
                        "lines-medium",
                        "lines-large",
                        "grid-small",
                        "grid-large",
                    ]
                    .contains(&p)
                    {
                        return Err(err("invalid", "未知纸张样式"));
                    }
                    n.paper_style = p.into();
                }
                if let Some(f) = a["folderId"].as_str() {
                    if self.folder(f)?.kind == "trash" {
                        return Err(err("invalid", "使用删除操作移入最近删除"));
                    }
                    n.folder_id = f.into();
                }
                n.revision += 1;
                self.put_note(&n)?;
                return Ok(json!(self.visible(n)?));
            }
            "deleteNote" => {
                let mut n = self.note(str_field(&a, "id")?)?;
                if n.deleted_at.is_none() {
                    n.original_folder_id = Some(n.folder_id.clone());
                    n.folder_id = "trash".into();
                    n.deleted_at = Some(now());
                    n.revision += 1;
                    self.put_note(&n)?;
                }
            }
            "restoreNote" => {
                let mut n = self.note(str_field(&a, "id")?)?;
                let f = n
                    .original_folder_id
                    .take()
                    .filter(|f| self.folder(f).is_ok())
                    .unwrap_or("default".into());
                n.folder_id = f;
                n.deleted_at = None;
                n.revision += 1;
                self.put_note(&n)?;
            }
            "purgeNote" => {
                let nid = str_field(&a, "id")?;
                if self.note(nid)?.deleted_at.is_none() {
                    return Err(err("invalid", "先移到最近删除"));
                }
                let files = self
                    .attachments()?
                    .into_iter()
                    .filter(|x| x.note_id == nid)
                    .collect::<Vec<_>>();
                let tx = self.db.transaction()?;
                tx.execute("DELETE FROM attachments WHERE note_id=?1", [nid])?;
                tx.execute("DELETE FROM notes WHERE id=?1", [nid])?;
                tx.commit()?;
                for f in files {
                    let path = self.attachment_path(&f.relative_path)?;
                    if path.exists() {
                        fs::remove_file(path)?;
                    }
                }
                self.keys.remove(nid);
            }
            "createFolder" => {
                let name = str_field(&a, "name")?.trim();
                if name.is_empty() {
                    return Err(err("invalid", "请输入文件夹名称"));
                }
                let parent = a["parentId"].as_str().map(String::from);
                if let Some(p) = &parent {
                    self.folder(p)?;
                }
                let f = Folder {
                    id: id(),
                    name: name.into(),
                    parent_id: parent,
                    kind: "normal".into(),
                    sort_order: now(),
                    created_at: now(),
                };
                self.put_folder(&f)?;
                return Ok(json!(f));
            }
            "renameFolder" => {
                let mut f = self.folder(str_field(&a, "id")?)?;
                if f.kind != "normal" {
                    return Err(err("invalid", "不能重命名默认文件夹"));
                }
                let name = str_field(&a, "name")?.trim();
                if name.is_empty() {
                    return Err(err("invalid", "请输入文件夹名称"));
                }
                f.name = name.into();
                self.put_folder(&f)?;
            }
            "moveFolder" => {
                let mut f = self.folder(str_field(&a, "id")?)?;
                if f.kind != "normal" {
                    return Err(err("invalid", "默认文件夹不能移动"));
                }
                let parent = a["parentId"].as_str().map(String::from);
                let mut cursor = parent.clone();
                while let Some(p) = cursor {
                    if p == f.id {
                        return Err(err("invalid", "不能将文件夹移入自身或子文件夹"));
                    }
                    cursor = self.folder(&p)?.parent_id;
                }
                f.parent_id = parent;
                self.put_folder(&f)?;
            }
            "deleteFolder" => {
                let fid = str_field(&a, "id")?;
                if self.folder(fid)?.kind != "normal" {
                    return Err(err("invalid", "不能删除默认文件夹"));
                }
                let folders = self.folders()?;
                let mut ids = vec![fid.to_string()];
                let mut i = 0;
                while i < ids.len() {
                    let parent = ids[i].clone();
                    for f in &folders {
                        if f.parent_id.as_deref() == Some(&parent) {
                            ids.push(f.id.clone())
                        }
                    }
                    i += 1;
                }
                let mut notes = self.notes()?;
                let tx = self.db.transaction()?;
                for n in &mut notes {
                    if ids.contains(&n.folder_id) {
                        n.original_folder_id = Some("default".into());
                        n.folder_id = "trash".into();
                        n.deleted_at = Some(now());
                        n.revision += 1;
                        tx.execute(
                            "UPDATE notes SET folder_id=?1,body=?2,revision=?3 WHERE id=?4",
                            params![n.folder_id, serde_json::to_string(n)?, n.revision, n.id],
                        )?;
                    }
                }
                for f in ids {
                    tx.execute("DELETE FROM folders WHERE id=?1", [f])?;
                }
                tx.commit()?;
            }
            "settings" => {
                let old: String =
                    self.db
                        .query_row("SELECT body FROM settings WHERE id=1", [], |r| r.get(0))?;
                let mut settings: Value = serde_json::from_str(&old)?;
                for (k, v) in a["settings"]
                    .as_object()
                    .ok_or_else(|| err("invalid", "无效设置"))?
                {
                    settings[k] = v.clone();
                }
                self.db.execute(
                    "UPDATE settings SET body=?1 WHERE id=1",
                    [settings.to_string()],
                )?;
            }
            "lockNote" => {
                let nid = str_field(&a, "id")?;
                let password = str_field(&a, "password")?;
                if password.chars().count() < 6 {
                    return Err(err("invalid", "密码至少需要6个字符"));
                }
                let mut n = self.note(nid)?;
                if n.locked {
                    return Err(err("invalid", "备忘录已锁定"));
                }
                if self.attachments()?.iter().any(|x| x.note_id == nid) {
                    return Err(err("unsupported", "此版本暂不支持锁定含附件的备忘录"));
                }
                let mut salt = [0u8; 16];
                OsRng.fill_bytes(&mut salt);
                let key = derive(password, &salt)?;
                n.sealed = Some(encrypt(&n.document, &key, &B64.encode(salt))?);
                n.document = empty_doc();
                n.plain_text.clear();
                n.locked = true;
                n.revision += 1;
                self.put_note(&n)?;
                self.db.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
                self.keys.remove(nid);
            }
            "unlockNote" => {
                let nid = str_field(&a, "id")?;
                let n = self.note(nid)?;
                let sealed = n.sealed.ok_or_else(|| err("invalid", "备忘录未锁定"))?;
                let salt = B64
                    .decode(sealed["salt"].as_str().unwrap_or_default())
                    .map_err(|_| err("encryption", "加密信息损坏"))?;
                let key = derive(str_field(&a, "password")?, &salt)?;
                decrypt(&sealed, &key)?;
                self.keys.insert(nid.into(), key);
            }
            "closeLocks" => {
                self.keys.clear();
            }
            "removeLock" => {
                let nid = str_field(&a, "id")?;
                let mut n = self.visible(self.note(nid)?)?;
                if !self.keys.contains_key(nid) {
                    return Err(err("locked", "请先解锁备忘录"));
                }
                n.locked = false;
                n.sealed = None;
                n.revision += 1;
                self.put_note(&n)?;
                self.keys.remove(nid);
            }
            _ => return Err(err("invalid", format!("未知操作: {op}"))),
        }
        self.workspace()
    }
    fn attachment_path(&self, relative: &str) -> Result<PathBuf> {
        if relative.contains('/')
            || relative.contains('\\')
            || relative.contains("..")
            || relative.is_empty()
        {
            return Err(err("invalid", "无效附件路径"));
        }
        Ok(self.root.join("attachments").join(relative))
    }
    pub fn store_attachment(
        &mut self,
        note_id: &str,
        name: &str,
        mime: &str,
        bytes: Vec<u8>,
    ) -> Result<Attachment> {
        let n = self.note(note_id)?;
        if n.locked {
            return Err(err("locked", "锁定备忘录不能添加附件"));
        }
        if bytes.len() > 100 * 1024 * 1024 {
            return Err(err("too_large", "附件不能超过100 MB"));
        }
        let aid = id();
        let ext = Path::new(name)
            .extension()
            .and_then(|s| s.to_str())
            .filter(|s| s.chars().all(|c| c.is_ascii_alphanumeric()))
            .unwrap_or("bin");
        let path = format!("{aid}.{ext}");
        let kind = if mime.starts_with("image/") {
            "image"
        } else if mime.starts_with("audio/") {
            "audio"
        } else if mime.starts_with("video/") {
            "video"
        } else {
            "file"
        };
        let a = Attachment {
            id: aid,
            note_id: note_id.into(),
            kind: kind.into(),
            relative_path: path.clone(),
            mime: mime.into(),
            display_name: Path::new(name)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("附件")
                .into(),
            size: bytes.len() as u64,
        };
        fs::write(self.attachment_path(&path)?, bytes)?;
        if let Err(e) = self.db.execute(
            "INSERT INTO attachments(id,note_id,body)VALUES(?1,?2,?3)",
            params![a.id, a.note_id, serde_json::to_string(&a)?],
        ) {
            let _ = fs::remove_file(self.attachment_path(&path)?);
            return Err(e.into());
        }
        Ok(a)
    }
    pub fn read_attachment(&self, aid: &str) -> Result<Value> {
        let body: Option<String> = self
            .db
            .query_row("SELECT body FROM attachments WHERE id=?1", [aid], |r| {
                r.get(0)
            })
            .optional()?;
        let a: Attachment =
            serde_json::from_str(&body.ok_or_else(|| err("not_found", "附件不存在"))?)?;
        let n = self.note(&a.note_id)?;
        if n.locked && !self.keys.contains_key(&n.id) {
            return Err(err("locked", "请先解锁"));
        }
        let bytes = fs::read(self.attachment_path(&a.relative_path)?)?;
        Ok(json!({"data":B64.encode(bytes),"mime":a.mime,"name":a.display_name}))
    }
    pub fn export_archive(&self, path: &Path) -> Result<()> {
        let mut blobs = serde_json::Map::new();
        for a in self.attachments()? {
            blobs.insert(
                a.id.clone(),
                json!(B64.encode(fs::read(self.attachment_path(&a.relative_path)?)?)),
            );
        }
        let settings: String =
            self.db
                .query_row("SELECT body FROM settings WHERE id=1", [], |r| r.get(0))?;
        let value = json!({"version":1,"folders":self.folders()?,"notes":self.notes()?,"attachments":self.attachments()?,"settings":serde_json::from_str::<Value>(&settings)?,"blobs":blobs});
        fs::write(path, serde_json::to_vec(&value)?)?;
        Ok(())
    }
    pub fn import_archive(&mut self, path: &Path) -> Result<()> {
        let v: Value = serde_json::from_slice(&fs::read(path)?)?;
        if v["version"] != 1 {
            return Err(err("invalid", "不支持此备份版本"));
        }
        let folders: Vec<Folder> = serde_json::from_value(v["folders"].clone())?;
        let notes: Vec<Note> = serde_json::from_value(v["notes"].clone())?;
        let attachments: Vec<Attachment> = serde_json::from_value(v["attachments"].clone())?;
        for a in &attachments {
            let p = self.attachment_path(&a.relative_path)?;
            let bytes = B64
                .decode(
                    v["blobs"][&a.id]
                        .as_str()
                        .ok_or_else(|| err("invalid", "附件内容缺失"))?,
                )
                .map_err(|_| err("invalid", "附件内容无效"))?;
            fs::write(p, bytes)?;
        }
        let tx = self.db.transaction()?;
        for f in folders {
            tx.execute(
                "INSERT OR REPLACE INTO folders(id,body)VALUES(?1,?2)",
                params![f.id, serde_json::to_string(&f)?],
            )?;
        }
        for n in notes {
            tx.execute(
                "INSERT OR REPLACE INTO notes(id,folder_id,body,revision)VALUES(?1,?2,?3,?4)",
                params![n.id, n.folder_id, serde_json::to_string(&n)?, n.revision],
            )?;
        }
        for a in attachments {
            tx.execute(
                "INSERT OR REPLACE INTO attachments(id,note_id,body)VALUES(?1,?2,?3)",
                params![a.id, a.note_id, serde_json::to_string(&a)?],
            )?;
        }
        tx.commit()?;
        self.keys.clear();
        Ok(())
    }
}
fn str_field<'a>(a: &'a Value, k: &str) -> Result<&'a str> {
    a[k].as_str()
        .ok_or_else(|| err("invalid", format!("缺少字段 {k}")))
}
pub fn doc_text(doc: &Value) -> String {
    fn walk(v: &Value, out: &mut String) {
        if let Some(t) = v["text"].as_str() {
            out.push_str(t)
        }
        if let Some(items) = v["content"].as_array() {
            for c in items {
                walk(c, out)
            }
        }
        if ["paragraph", "heading", "listItem", "taskItem", "tableRow"]
            .contains(&v["type"].as_str().unwrap_or(""))
        {
            out.push('\n')
        }
    }
    let mut out = String::new();
    walk(doc, &mut out);
    out.trim_end().into()
}
fn derive(password: &str, salt: &[u8]) -> Result<[u8; 32]> {
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|_| err("encryption", "密钥生成失败"))?;
    Ok(key)
}
fn encrypt(doc: &Value, key: &[u8; 32], salt: &str) -> Result<Value> {
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| err("encryption", "密钥错误"))?;
    let bytes = cipher
        .encrypt(Nonce::from_slice(&nonce), serde_json::to_vec(doc)?.as_ref())
        .map_err(|_| err("encryption", "加密失败"))?;
    Ok(json!({"salt":salt,"nonce":B64.encode(nonce),"ciphertext":B64.encode(bytes)}))
}
fn decrypt(v: &Value, key: &[u8; 32]) -> Result<Value> {
    let nonce = B64
        .decode(v["nonce"].as_str().unwrap_or_default())
        .map_err(|_| err("encryption", "数据损坏"))?;
    if nonce.len() != 12 {
        return Err(err("encryption", "数据损坏"));
    }
    let bytes = B64
        .decode(v["ciphertext"].as_str().unwrap_or_default())
        .map_err(|_| err("encryption", "数据损坏"))?;
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| err("encryption", "密钥错误"))?;
    let doc = cipher
        .decrypt(Nonce::from_slice(&nonce), bytes.as_ref())
        .map_err(|_| err("password", "密码不正确"))?;
    serde_json::from_slice(&doc).map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sample() -> Value {
        json!({"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"测试笔记"}]},{"type":"paragraph","content":[{"type":"text","text":"中文内容 across restarts"}]}]})
    }
    #[test]
    fn persistence_conflicts_delete_restore() {
        let t = tempfile::tempdir().unwrap();
        let nid;
        {
            let mut s = Store::open(t.path()).unwrap();
            let n = s.action(json!({"type":"createNote"})).unwrap();
            nid = n["id"].as_str().unwrap().to_string();
            s.action(json!({"type":"saveNote","id":nid,"revision":0,"document":sample()}))
                .unwrap();
            assert_eq!(
                s.action(json!({"type":"saveNote","id":nid,"revision":0,"document":sample()}))
                    .unwrap_err()
                    .code,
                "conflict"
            );
            s.action(json!({"type":"deleteNote","id":nid})).unwrap();
            assert_eq!(s.note(&nid).unwrap().folder_id, "trash");
            s.action(json!({"type":"restoreNote","id":nid})).unwrap();
        }
        let s = Store::open(t.path()).unwrap();
        assert_eq!(s.note(&nid).unwrap().document, sample());
        assert_eq!(s.note(&nid).unwrap().folder_id, "default");
        assert_eq!(s.folders().unwrap().len(), 3);
    }
    #[test]
    fn encrypted_data_and_unlock() {
        let t = tempfile::tempdir().unwrap();
        let mut s = Store::open(t.path()).unwrap();
        let n = s.action(json!({"type":"createNote"})).unwrap();
        let nid = n["id"].as_str().unwrap();
        s.action(json!({"type":"saveNote","id":nid,"revision":0,"document":sample()}))
            .unwrap();
        s.action(json!({"type":"lockNote","id":nid,"password":"abcdef"}))
            .unwrap();
        assert!(!s.note(nid).unwrap().plain_text.contains("中文"));
        assert!(!s.note(nid).unwrap().document.to_string().contains("中文"));
        let secret = "中文内容 across restarts".as_bytes();
        for path in ["notes.sqlite3", "notes.sqlite3-wal"] {
            if let Ok(bytes) = fs::read(t.path().join(path)) {
                assert!(!bytes.windows(secret.len()).any(|w| w == secret));
            }
        }
        assert!(s
            .action(json!({"type":"unlockNote","id":nid,"password":"incorrect"}))
            .is_err());
        s.action(json!({"type":"unlockNote","id":nid,"password":"abcdef"}))
            .unwrap();
        assert_eq!(s.visible(s.note(nid).unwrap()).unwrap().document, sample());
    }
    #[test]
    fn archive_attachments_and_cycle_guards() {
        let t = tempfile::tempdir().unwrap();
        let mut s = Store::open(t.path()).unwrap();
        let f = s
            .action(json!({"type":"createFolder","name":"工作"}))
            .unwrap();
        let f = f["id"].as_str().unwrap();
        assert!(s
            .action(json!({"type":"moveFolder","id":f,"parentId":f}))
            .is_err());
        let n = s.action(json!({"type":"createNote","folderId":f})).unwrap();
        let nid = n["id"].as_str().unwrap();
        let a = s
            .store_attachment(nid, "hello.txt", "text/plain", b"hello".to_vec())
            .unwrap();
        assert_eq!(s.read_attachment(&a.id).unwrap()["data"], "aGVsbG8=");
        assert!(s.attachment_path("../secrets").is_err());
        let backup = t.path().join("archive.notesbackup");
        s.export_archive(&backup).unwrap();
        let t2 = tempfile::tempdir().unwrap();
        let mut s2 = Store::open(t2.path()).unwrap();
        s2.import_archive(&backup).unwrap();
        assert_eq!(s2.read_attachment(&a.id).unwrap()["data"], "aGVsbG8=");
        s2.action(json!({"type":"deleteFolder","id":f})).unwrap();
        assert_eq!(s2.note(nid).unwrap().folder_id, "trash");
        s2.action(json!({"type":"restoreNote","id":nid})).unwrap();
        assert_eq!(s2.note(nid).unwrap().folder_id, "default");
    }
}
