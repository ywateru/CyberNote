//! Portable-setting SQL owned by the existing Store. Caller supplies its current transaction.
//! Never opens a database. Installation/capture/apply must share the Store transaction and lease.
use super::{
    model::*,
    settings_owner::{self, KEYS},
};
use crate::sync::model::{dominates, sha256, valid_uuid, Vector};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use std::collections::BTreeMap;
const SCHEMA:[(&str,&str);7]=[
 ("cloud_setting_control","CREATE TABLE cloud_setting_control(singleton INTEGER PRIMARY KEY CHECK(singleton=1), capture INTEGER NOT NULL CHECK(capture IN (0,1)))"),
 ("cloud_setting_heads","CREATE TABLE cloud_setting_heads(key TEXT NOT NULL, digest TEXT PRIMARY KEY, vector TEXT NOT NULL, value TEXT NOT NULL)"),
 ("cloud_setting_seen","CREATE TABLE cloud_setting_seen(key TEXT NOT NULL, vector TEXT NOT NULL, digest TEXT NOT NULL, PRIMARY KEY(key,vector))"),
 ("cloud_setting_projection","CREATE TABLE cloud_setting_projection(key TEXT PRIMARY KEY, digest TEXT NOT NULL, vector TEXT NOT NULL)"),
 ("cloud_setting_dirty","CREATE TABLE cloud_setting_dirty(key TEXT PRIMARY KEY)"),
 ("cloud_setting_frontiers","CREATE TABLE cloud_setting_frontiers(key TEXT NOT NULL, actor TEXT NOT NULL, counter INTEGER NOT NULL CHECK(counter>0), PRIMARY KEY(key,actor))"),
 ("cloud_setting_branches","CREATE TABLE cloud_setting_branches(key TEXT NOT NULL, digest TEXT NOT NULL, actor TEXT NOT NULL, PRIMARY KEY(key,digest))"),
];
fn sql<T>(r: rusqlite::Result<T>) -> Result<T> {
    r.map_err(|_| error("state"))
}
fn transaction(db: &Connection) -> Result<()> {
    if db.is_autocommit() {
        return Err(error("state"));
    }
    Ok(())
}
fn objects() -> Vec<(String, String)> {
    let mut result = SCHEMA
        .iter()
        .map(|(n, s)| (n.to_string(), s.to_string()))
        .collect::<Vec<_>>();
    for k in KEYS {
        let name = format!("cloud_setting_capture_{k}");
        let nt = settings_owner::expression("NEW", k, "json_type");
        let ot = settings_owner::expression("OLD", k, "json_type");
        let nv = settings_owner::expression("NEW", k, "json_extract");
        let ov = settings_owner::expression("OLD", k, "json_extract");
        result.push((name.clone(),format!("CREATE TRIGGER {name} AFTER UPDATE ON settings WHEN (SELECT capture FROM cloud_setting_control WHERE singleton=1)=1 AND (({nt}) IS NOT ({ot}) OR ({nv}) IS NOT ({ov})) BEGIN INSERT OR IGNORE INTO cloud_setting_dirty(key) VALUES('{k}'); END")));
    }
    result
}
fn legacy_trigger(key: &str) -> String {
    let name = format!("cloud_setting_capture_{key}");
    let path = format!("$.{key}");
    format!("CREATE TRIGGER {name} AFTER UPDATE ON settings WHEN (SELECT capture FROM cloud_setting_control WHERE singleton=1)=1 AND (json_type(NEW.body,'{path}') IS NOT json_type(OLD.body,'{path}') OR json_extract(NEW.body,'{path}') IS NOT json_extract(OLD.body,'{path}')) BEGIN INSERT OR IGNORE INTO cloud_setting_dirty(key) VALUES('{key}'); END")
}
/// Install only after confirmed first sync. A partial or altered schema is unknown state, never reset.
pub fn install(db: &Connection) -> Result<()> {
    transaction(db)?;
    let objects = objects();
    let mut existing = 0;
    let mut legacy = 0;
    for (n, expected) in &objects {
        let actual: Option<String> = sql(db
            .query_row("SELECT sql FROM sqlite_schema WHERE name=?1", [n], |r| {
                r.get(0)
            })
            .optional())?;
        if let Some(actual) = actual {
            existing += 1;
            if actual != *expected {
                if KEYS.iter().any(|key| {
                    n == &format!("cloud_setting_capture_{key}") && actual == legacy_trigger(key)
                }) {
                    legacy += 1;
                } else {
                    return Err(error("state"));
                }
            }
        }
    }
    if existing != 0 && existing != objects.len() {
        return Err(error("state"));
    }
    if legacy != 0 && legacy != KEYS.len() {
        return Err(error("state"));
    }
    if existing != 0 {
        validate_control(db)?;
        settings_owner::values(&body(db)?)?;
    }
    if legacy == KEYS.len() {
        // Only the exact prior complete schema is migratable. Keep every causal
        // row; refresh dirty projections from the actual owners in this same tx.
        for key in KEYS {
            sql(db.execute_batch(&format!("DROP TRIGGER cloud_setting_capture_{key}")))?;
        }
        for (_, statement) in objects.iter().skip(SCHEMA.len()) {
            sql(db.execute_batch(statement))?;
        }
        for key in settings_owner::values(&body(db)?)?.keys() {
            sql(db.execute(
                "INSERT OR IGNORE INTO cloud_setting_dirty VALUES(?1)",
                [key],
            ))?;
        }
    }
    if existing == 0 {
        for (_, statement) in objects {
            sql(db.execute_batch(&statement))?;
        }
        sql(db.execute("INSERT INTO cloud_setting_control VALUES(1,1)", []))?;
        let body = settings_owner::values(&body(db)?)?;
        for k in KEYS {
            if body.get(k).is_some() {
                sql(db.execute("INSERT INTO cloud_setting_dirty VALUES(?1)", [k]))?;
            }
        }
    }
    validate_open(db)?;
    Ok(())
}
/// Existing installed state is never repaired into an empty/default extension.
fn validate_open(db: &Connection) -> Result<()> {
    for (name, expected) in objects() {
        let actual: Option<String> = sql(db
            .query_row(
                "SELECT sql FROM sqlite_schema WHERE name=?1",
                [&name],
                |r| r.get(0),
            )
            .optional())?;
        if actual.as_deref() != Some(expected.as_str()) {
            return Err(error("state"));
        }
    }
    validate_control(db)?;
    settings_owner::values(&body(db)?)?;
    Ok(())
}
fn validate_control(db: &Connection) -> Result<()> {
    let rows: Vec<(i64, i64)> = sql(sql(
        db.prepare("SELECT singleton,capture FROM cloud_setting_control")
    )?
    .query_map([], |r| Ok((r.get(0)?, r.get(1)?))))?
    .collect::<rusqlite::Result<_>>()
    .map_err(|_| error("state"))?;
    if rows != [(1, 1)] {
        return Err(error("state"));
    }
    Ok(())
}
fn exactly_one(result: rusqlite::Result<usize>) -> Result<()> {
    if sql(result)? != 1 {
        return Err(error("state"));
    }
    Ok(())
}
fn body(db: &Connection) -> Result<Value> {
    let raw: String = sql(db.query_row("SELECT body FROM settings WHERE id=1", [], |r| r.get(0)))?;
    let b: Value = serde_json::from_str(&raw).map_err(|_| error("state"))?;
    if !b.is_object() {
        return Err(error("state"));
    }
    Ok(b)
}
pub fn heads(db: &Connection) -> Result<Vec<SettingVersion>> {
    validate_open(db)?;
    read_heads(db)
}
fn read_heads(db: &Connection) -> Result<Vec<SettingVersion>> {
    let mut q =
        sql(db.prepare("SELECT key,vector,value,digest FROM cloud_setting_heads ORDER BY digest"))?;
    let rows = sql(sql(q.query_map([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, String>(3)?,
        ))
    }))?
    .collect::<rusqlite::Result<Vec<_>>>())?;
    rows.into_iter()
        .map(|(key, vector, value, digest)| {
            let s = SettingVersion {
                key,
                vector: serde_json::from_str(&vector).map_err(|_| error("state"))?,
                value: serde_json::from_str(&value).map_err(|_| error("state"))?,
                digest,
            };
            s.validate()?;
            Ok(s)
        })
        .collect()
}
fn merge_one(db: &Connection, v: &SettingVersion) -> Result<()> {
    v.validate()?;
    let vector = serde_json::to_string(&v.vector).map_err(|_| error("invalid"))?;
    let seen: Option<String> = sql(db
        .query_row(
            "SELECT digest FROM cloud_setting_seen WHERE key=?1 AND vector=?2",
            params![v.key, vector],
            |r| r.get(0),
        )
        .optional())?;
    if seen.is_some_and(|d| d != v.digest) {
        return Err(error("invalid"));
    }
    sql(db.execute(
        "INSERT OR IGNORE INTO cloud_setting_seen VALUES(?1,?2,?3)",
        params![v.key, vector, v.digest],
    ))?;
    for (a, c) in &v.vector {
        sql(db.execute("INSERT INTO cloud_setting_frontiers VALUES(?1,?2,?3) ON CONFLICT(key,actor) DO UPDATE SET counter=max(counter,excluded.counter)",params![v.key,a,c]))?;
    }
    let actors: u64 = sql(db.query_row(
        "SELECT count(*) FROM cloud_setting_frontiers WHERE key=?1",
        [&v.key],
        |r| r.get(0),
    ))?;
    if actors > 64 {
        return Err(error("limit"));
    }
    let current = read_heads(db)?
        .into_iter()
        .filter(|x| x.key == v.key)
        .collect::<Vec<_>>();
    if current
        .iter()
        .any(|x| x.digest == v.digest || dominates(&x.vector, &v.vector))
    {
        return Ok(());
    }
    for x in &current {
        if dominates(&v.vector, &x.vector) {
            sql(db.execute(
                "DELETE FROM cloud_setting_heads WHERE digest=?1",
                [&x.digest],
            ))?;
        }
    }
    sql(db.execute(
        "INSERT INTO cloud_setting_heads VALUES(?1,?2,?3,?4)",
        params![
            v.key,
            v.digest,
            vector,
            serde_json::to_string(&v.value).map_err(|_| error("invalid"))?
        ],
    ))?;
    let count: u64 = sql(db.query_row(
        "SELECT count(*) FROM cloud_setting_heads WHERE key=?1",
        [&v.key],
        |r| r.get(0),
    ))?;
    if count > 32 {
        return Err(error("limit"));
    }
    Ok(())
}
/// Called at the same save/capture boundary as sync_flush. Explicit false is a first-class value.
pub fn capture(db: &Connection, device: &str) -> Result<Vec<SettingVersion>> {
    transaction(db)?;
    validate_open(db)?;
    if !valid_uuid(device) {
        return Err(error("invalid"));
    }
    let b = settings_owner::values(&body(db)?)?;
    let mut q = sql(db.prepare("SELECT key FROM cloud_setting_dirty ORDER BY key"))?;
    let dirty = sql(
        sql(q.query_map([], |r| r.get::<_, String>(0)))?.collect::<rusqlite::Result<Vec<_>>>()
    )?;
    drop(q);
    for key in dirty {
        let value = b.get(&key).cloned().ok_or_else(|| error("invalid"))?;
        let projection: Option<(String, String)> = sql(db
            .query_row(
                "SELECT digest,vector FROM cloud_setting_projection WHERE key=?1",
                [&key],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional())?;
        let mut vector: Vector = projection
            .as_ref()
            .map(|(_, v)| serde_json::from_str(v))
            .transpose()
            .map_err(|_| error("state"))?
            .unwrap_or_default();
        let mut actor = if let Some((digest, _)) = &projection {
            sql(db
                .query_row(
                    "SELECT actor FROM cloud_setting_branches WHERE key=?1 AND digest=?2",
                    params![key, digest],
                    |r| r.get::<_, String>(0),
                )
                .optional())?
            .unwrap_or_else(|| device.into())
        } else {
            device.into()
        };
        let frontier: u64 = sql(db
            .query_row(
                "SELECT counter FROM cloud_setting_frontiers WHERE key=?1 AND actor=?2",
                params![key, actor],
                |r| r.get(0),
            )
            .optional())?
        .unwrap_or(0);
        if frontier > vector.get(&actor).copied().unwrap_or(0) {
            actor = uuid::Uuid::new_v4().to_string();
        }
        let next = vector
            .get(&actor)
            .copied()
            .unwrap_or(0)
            .checked_add(1)
            .filter(|n| *n <= i64::MAX as u64)
            .ok_or_else(|| error("limit"))?;
        vector.insert(actor.clone(), next);
        let v = SettingVersion {
            key: key.clone(),
            vector,
            value,
            digest: String::new(),
        }
        .seal();
        merge_one(db, &v)?;
        sql(db.execute("INSERT INTO cloud_setting_projection VALUES(?1,?2,?3) ON CONFLICT(key) DO UPDATE SET digest=excluded.digest,vector=excluded.vector",params![key,v.digest,serde_json::to_string(&v.vector).map_err(|_|error("invalid"))?]))?;
        sql(db.execute(
            "INSERT OR REPLACE INTO cloud_setting_branches VALUES(?1,?2,?3)",
            params![key, v.digest, actor],
        ))?;
        sql(db.execute("DELETE FROM cloud_setting_dirty WHERE key=?1", [&key]))?;
    }
    heads(db)
}
/// Run in the SAME transaction as note projection. On any error caller rolls back the transaction.
/// Return the total setting conflict count; combine with Store report and emit existing settings facts.
pub fn apply(db: &Connection, incoming: &[SettingVersion]) -> Result<usize> {
    transaction(db)?;
    validate_open(db)?;
    if incoming.len() > 128 {
        return Err(error("limit"));
    }
    let dirty: u64 =
        sql(db.query_row("SELECT count(*) FROM cloud_setting_dirty", [], |r| r.get(0)))?;
    if dirty != 0 {
        return Err(error("stale"));
    }
    for v in incoming {
        merge_one(db, v)?;
    }
    let mut grouped: BTreeMap<String, Vec<SettingVersion>> = BTreeMap::new();
    for h in heads(db)? {
        grouped.entry(h.key.clone()).or_default().push(h);
    }
    let conflicts = grouped.values().filter(|v| v.len() > 1).count();
    let mut b = body(db)?;
    let mut selected = BTreeMap::new();
    for (key, versions) in grouped {
        let v = versions.iter().min_by_key(|v| &v.digest).unwrap();
        selected.insert(key.clone(), v.value.clone());
        sql(db.execute("INSERT INTO cloud_setting_projection VALUES(?1,?2,?3) ON CONFLICT(key) DO UPDATE SET digest=excluded.digest,vector=excluded.vector",params![key,v.digest,serde_json::to_string(&v.vector).map_err(|_|error("invalid"))?]))?;
    }
    settings_owner::project(&mut b, &selected)?;
    exactly_one(db.execute(
        "UPDATE cloud_setting_control SET capture=0 WHERE singleton=1 AND capture=1",
        [],
    ))?;
    exactly_one(db.execute(
        "UPDATE settings SET body=?1 WHERE id=1",
        [serde_json::to_string(&b).map_err(|_| error("invalid"))?],
    ))?;
    exactly_one(db.execute(
        "UPDATE cloud_setting_control SET capture=1 WHERE singleton=1 AND capture=0",
        [],
    ))?;
    Ok(conflicts)
}
/// Include this hash in the host generation together with Store::generation/instance and authority.
pub fn generation(db: &Connection) -> Result<String> {
    validate_open(db)?;
    let mut rows = vec![];
    for (name, _) in SCHEMA {
        let mut q = sql(db.prepare(&format!("SELECT * FROM {name}")))?;
        let count = q.column_count();
        let mut values = sql(sql(q.query_map([], |r| {
            let mut row = vec![];
            for i in 0..count {
                row.push(format!("{:?}", r.get_ref(i)?));
            }
            Ok(row)
        }))?
        .collect::<rusqlite::Result<Vec<_>>>())?;
        values.sort();
        rows.push(serde_json::to_value(values).map_err(|_| error("state"))?);
    }
    rows.push(
        serde_json::to_value(settings_owner::values(&body(db)?)?).map_err(|_| error("state"))?,
    );
    Ok(sha256(
        &serde_json::to_vec(&rows).map_err(|_| error("state"))?,
    ))
}
