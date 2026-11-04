//! Identify and validate storage before initialization or journal recovery.
use super::*;

#[cfg(test)]
#[path = "open_tests.rs"]
mod tests;

const TABLES: &[(&str, &str)] = &[
    ("folders", "CREATE TABLE folders(id TEXT PRIMARY KEY, body TEXT NOT NULL)"),
    ("notes", "CREATE TABLE notes(id TEXT PRIMARY KEY, folder_id TEXT NOT NULL, body TEXT NOT NULL, revision INTEGER NOT NULL)"),
    ("attachments", "CREATE TABLE attachments(id TEXT PRIMARY KEY, note_id TEXT NOT NULL, body TEXT NOT NULL)"),
    ("settings", "CREATE TABLE settings(id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL)"),
];
const OPERATIONS: &str = "CREATE TABLE attachment_operations(operation_id TEXT PRIMARY KEY, note_id TEXT NOT NULL, owner TEXT NOT NULL, attachment TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('preparing','stored','committed','aborting','aborted','retired')), reason TEXT)";

fn compact_sql(sql: &str) -> String {
    let mut compact = String::new();
    let mut literal = false;
    for c in sql.chars() {
        if c == '\'' {
            literal = !literal;
        }
        if literal || c == '\'' {
            compact.push(c);
        } else if !c.is_ascii_whitespace() && c != ';' {
            compact.extend(c.to_lowercase());
        }
    }
    compact.replacen("createtableifnotexists", "createtable", 1)
}

fn validate_columns(db: &Connection, name: &str) -> Result<()> {
    let expected: &[(&str, &str, bool, i64)] = match name {
        "folders" => &[("id", "TEXT", false, 1), ("body", "TEXT", true, 0)],
        "notes" => &[
            ("id", "TEXT", false, 1),
            ("folder_id", "TEXT", true, 0),
            ("body", "TEXT", true, 0),
            ("revision", "INTEGER", true, 0),
        ],
        "attachments" => &[
            ("id", "TEXT", false, 1),
            ("note_id", "TEXT", true, 0),
            ("body", "TEXT", true, 0),
        ],
        "settings" => &[("id", "INTEGER", false, 1), ("body", "TEXT", true, 0)],
        "attachment_operations" => &[
            ("operation_id", "TEXT", false, 1),
            ("note_id", "TEXT", true, 0),
            ("owner", "TEXT", true, 0),
            ("attachment", "TEXT", true, 0),
            ("state", "TEXT", true, 0),
            ("reason", "TEXT", false, 0),
        ],
        _ => unreachable!("only fixed table identifiers are used"),
    };
    let mut q = db.prepare(&format!("PRAGMA table_xinfo({name})"))?;
    let columns = q
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, bool>(3)?,
                r.get::<_, Option<String>>(4)?,
                r.get::<_, i64>(5)?,
                r.get::<_, i64>(6)?,
            ))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    if columns.len() != expected.len()
        || !columns.iter().zip(expected).all(|(actual, expected)| {
            actual.0 == expected.0
                && actual.1.eq_ignore_ascii_case(expected.1)
                && actual.2 == expected.2
                && actual.3.is_none()
                && actual.4 == expected.3
                && actual.5 == 0
        })
    {
        return Err(err(
            "schema_invalid",
            format!("数据表 {name} 字段约束不受支持"),
        ));
    }
    Ok(())
}

fn table_sql(db: &Connection, name: &str) -> Result<Option<String>> {
    let object: Option<(String, Option<String>)> = db
        .query_row(
            "SELECT type,sql FROM sqlite_schema WHERE name=?1",
            [name],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    match object {
        None => Ok(None),
        Some((kind, Some(sql))) if kind == "table" => Ok(Some(sql)),
        _ => Err(err("schema_invalid", format!("{name} 不是受支持的数据表"))),
    }
}

fn validate_schema(db: &Connection) -> Result<bool> {
    let objects: i64 = db.query_row(
        "SELECT count(*) FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'",
        [],
        |r| r.get(0),
    )?;
    if objects == 0 {
        return Ok(true);
    }
    // Exact known DDL (case/spacing/IF NOT EXISTS ignored) also checks CHECK,
    // key and nullability clauses, rather than accepting matching column names.
    for &(name, expected) in TABLES {
        let sql = table_sql(db, name)?
            .ok_or_else(|| err("schema_invalid", format!("缺少必需数据表 {name}")))?;
        if compact_sql(&sql) != compact_sql(expected) {
            return Err(err("schema_invalid", format!("数据表 {name} 结构不受支持")));
        }
        validate_columns(db, name)?;
    }
    if let Some(sql) = table_sql(db, "attachment_operations")? {
        if compact_sql(&sql) != compact_sql(OPERATIONS) {
            return Err(err("schema_invalid", "attachment_operations 结构不受支持"));
        }
        validate_columns(db, "attachment_operations")?;
    }
    Ok(false)
}

pub(super) fn decode_folder(row: i64, key: &str, body: &str) -> Result<Folder> {
    let folder: Folder = serde_json::from_str(body).map_err(|_| {
        err(
            "folder_invalid",
            format!("folders rowid={row} 的 JSON、字段或身份无效"),
        )
    })?;
    if folder.id != key {
        return Err(err(
            "folder_invalid",
            format!("folders rowid={row} 的行键与实体ID不符"),
        ));
    }
    Ok(folder)
}

pub(super) fn read_folders(db: &Connection) -> Result<Vec<Folder>> {
    let mut query = db.prepare("SELECT rowid,id,body FROM folders ORDER BY rowid")?;
    let rows = query
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    rows.into_iter()
        .map(|(row, key, body)| decode_folder(row, &key, &body))
        .collect()
}

impl Store {
    pub(super) fn initialize_storage(&self) -> Result<()> {
        // No PRAGMA that writes, schema change or recovery before this check.
        let version: i64 = self
            .db
            .pragma_query_value(None, "user_version", |r| r.get(0))?;
        if !matches!(version, 0 | 1) {
            return Err(err(
                "schema_version",
                format!("不支持数据库版本 {version}，当前版本为1"),
            ));
        }
        let tx = self.db.unchecked_transaction()?;
        // Recheck in the same transaction as all validation and initialization.
        let current: i64 = tx.pragma_query_value(None, "user_version", |r| r.get(0))?;
        if current != version {
            return Err(err("schema_version", "初始化期间数据库版本已改变"));
        }
        let empty = validate_schema(&tx)?;
        if empty {
            if version != 0 {
                return Err(err("schema_invalid", "现行数据库缺少必需数据表"));
            }
            for &(_, sql) in TABLES {
                tx.execute_batch(sql)?;
            }
        }
        let folders = read_folders(&tx)?;
        // The optional private table is initialized within this same transaction.
        self.initialize_attachment_operations()?;
        checkpoint(&tx, "schema")?;
        for (fid, name, order) in [
            ("default", "备忘录", 0),
            ("quick", "快速备忘录", -1),
            ("trash", "最近删除", 9999),
        ] {
            if !folders.iter().any(|f| f.id == fid) {
                let folder = Folder {
                    id: fid.into(),
                    name: name.into(),
                    parent_id: None,
                    kind: fid.into(),
                    sort_order: order,
                    created_at: now(),
                };
                tx.execute(
                    "INSERT INTO folders(id,body)VALUES(?1,?2)",
                    params![fid, serde_json::to_string(&folder)?],
                )?;
            }
            checkpoint(&tx, fid)?;
        }
        let settings_exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM settings WHERE id=1)",
            [],
            |r| r.get(0),
        )?;
        if !settings_exists {
            tx.execute("INSERT INTO settings(id,body)VALUES(1,'{}')", [])?;
        }
        checkpoint(&tx, "settings")?;
        if version == 0 {
            tx.pragma_update(None, "user_version", 1)?;
        }
        checkpoint(&tx, "version")?;
        tx.commit()?;
        Ok(())
    }
}

#[cfg(not(test))]
fn checkpoint(_: &Connection, _: &str) -> Result<()> {
    Ok(())
}
#[cfg(test)]
thread_local! {
    static FAIL_AT: std::cell::Cell<Option<&'static str>> = const { std::cell::Cell::new(None) };
}
#[cfg(test)]
fn checkpoint(db: &Connection, stage: &str) -> Result<()> {
    if FAIL_AT.with(|target| target.get() == Some(stage)) {
        // Actual SQL error, scoped to the test thread; Transaction must rollback.
        db.execute_batch("SELECT FROM")?;
    }
    Ok(())
}
