use super::*;
use std::collections::BTreeMap;

fn database(root: &Path, version: i64, schema: bool) -> Connection {
    fs::create_dir_all(root).unwrap();
    let db = Connection::open(root.join("notes.sqlite3")).unwrap();
    if schema {
        for &(_, sql) in TABLES {
            db.execute_batch(sql).unwrap();
        }
    }
    db.pragma_update(None, "user_version", version).unwrap();
    db
}
fn folder(id: &str, kind: &str) -> Value {
    json!({"id":id,"name":"合成目录","parentId":null,"kind":kind,"sortOrder":7,"createdAt":17})
}
fn insert(db: &Connection, key: &str, value: &Value) {
    db.execute(
        "INSERT INTO folders(id,body)VALUES(?1,?2)",
        params![key, value.to_string()],
    )
    .unwrap();
}
fn files(root: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    fn walk(base: &Path, path: &Path, result: &mut BTreeMap<PathBuf, Vec<u8>>) {
        if !path.exists() {
            return;
        }
        for entry in fs::read_dir(path).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                walk(base, &path, result);
            } else {
                result.insert(
                    path.strip_prefix(base).unwrap().to_path_buf(),
                    fs::read(&path).unwrap(),
                );
            }
        }
    }
    let mut result = BTreeMap::new();
    walk(root, root, &mut result);
    result
}
fn recovery_fixture(root: &Path) {
    let transaction = Uuid::new_v4().to_string();
    let path = format!("{transaction}-{}.blob", Uuid::new_v4());
    fs::create_dir_all(root.join("attachments")).unwrap();
    fs::write(
        root.join("attachments").join(&path),
        b"must survive rejected open",
    )
    .unwrap();
    let dir = root.join(".imports").join(&transaction);
    fs::create_dir_all(&dir).unwrap();
    fs::write(
        dir.join("journal.json"),
        json!({"version":1,"id":transaction,"paths":[path]}).to_string(),
    )
    .unwrap();
}
fn rejected_unchanged(root: &Path, code: &str) {
    let before = files(root);
    let error = match Store::open(root) {
        Ok(_) => panic!("invalid database accepted"),
        Err(e) => e,
    };
    assert_eq!(error.code, code, "{}", error.message);
    assert!(!error.message.is_empty());
    assert_eq!(
        files(root),
        before,
        "rejected open modified database or recovery files"
    );
}
fn rows(db: &Connection, table: &str) -> Vec<Vec<rusqlite::types::Value>> {
    let mut query = db
        .prepare(&format!("SELECT * FROM {table} ORDER BY rowid"))
        .unwrap();
    let n = query.column_count();
    query
        .query_map([], |r| (0..n).map(|i| r.get(i)).collect())
        .unwrap()
        .collect::<std::result::Result<Vec<_>, _>>()
        .unwrap()
}

#[test]
fn new_database_initializes_current_schema_and_reopens_without_rewriting_rows() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("fresh");
    let mut store = Store::open(&root).unwrap();
    assert_eq!(
        store
            .db
            .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
    assert_eq!(store.folders().unwrap().len(), 3);
    let note = store.action(json!({"type":"createNote"})).unwrap();
    let nid = note["id"].as_str().unwrap();
    store.action(json!({"type":"saveNote","id":nid,"revision":0,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"保全原正文"}]}]}})).unwrap();
    let a = Attachment {
        id: id(),
        note_id: nid.into(),
        kind: "audio".into(),
        relative_path: "kept.blob".into(),
        mime: "audio/wav".into(),
        display_name: "kept.wav".into(),
        size: 4,
        recorded_at: Some(1_777_777_777_777),
    };
    store
        .db
        .execute(
            "INSERT INTO attachments(id,note_id,body)VALUES(?1,?2,?3)",
            params![a.id, a.note_id, serde_json::to_string(&a).unwrap()],
        )
        .unwrap();
    fs::write(root.join("attachments/kept.blob"), b"kept").unwrap();
    store
        .db
        .execute(
            "UPDATE settings SET body=?1",
            [" { \"theme\" : \"dark\", \"unknownExtension\" : 5 } "],
        )
        .unwrap();
    store.db.execute_batch("CREATE TABLE user_extension(key TEXT, value BLOB); INSERT INTO user_extension VALUES('keep',X'0102');").unwrap();
    let tables = [
        "folders",
        "notes",
        "attachments",
        "settings",
        "user_extension",
    ];
    let before: Vec<_> = tables.iter().map(|t| rows(&store.db, t)).collect();
    let modified = fs::metadata(root.join("attachments/kept.blob"))
        .unwrap()
        .modified()
        .unwrap();
    drop(store);
    let store = Store::open(&root).unwrap();
    assert_eq!(
        tables
            .iter()
            .map(|t| rows(&store.db, t))
            .collect::<Vec<_>>(),
        before
    );
    assert_eq!(store.attachments().unwrap()[0].recorded_at, a.recorded_at);
    assert_eq!(
        fs::metadata(root.join("attachments/kept.blob"))
            .unwrap()
            .modified()
            .unwrap(),
        modified
    );
}

#[test]
fn complete_legacy_zero_preserves_rows_and_only_fills_real_missing_system_rows() {
    let temp = tempfile::tempdir().unwrap();
    let db = database(temp.path(), 0, true);
    let mut normal = folder("custom", "normal");
    normal.as_object_mut().unwrap().remove("parentId");
    insert(&db, "custom", &normal);
    insert(&db, "default", &folder("default", "default"));
    db.execute("INSERT INTO settings VALUES(1,?1)", [" {\"legacy\":true} "])
        .unwrap();
    let before = rows(&db, "folders");
    let settings = rows(&db, "settings");
    drop(db);
    let store = Store::open(temp.path()).unwrap();
    assert_eq!(store.folders().unwrap().len(), 4);
    assert_eq!(&rows(&store.db, "folders")[..2], &before);
    assert_eq!(rows(&store.db, "settings"), settings);
    assert!(store.folder("custom").unwrap().parent_id.is_none());
    assert_eq!(
        store
            .db
            .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
}

#[test]
fn current_missing_system_rows_and_settings_are_filled_without_rewriting_custom() {
    let temp = tempfile::tempdir().unwrap();
    let db = database(temp.path(), 1, true);
    insert(&db, "custom", &folder("custom", "normal"));
    let before = rows(&db, "folders");
    drop(db);
    let store = Store::open(temp.path()).unwrap();
    assert_eq!(store.folders().unwrap().len(), 4);
    assert_eq!(&rows(&store.db, "folders")[..1], &before);
    assert_eq!(rows(&store.db, "settings").len(), 1);
}

#[test]
fn existing_system_and_settings_rows_are_not_even_inserted_again() {
    let temp = tempfile::tempdir().unwrap();
    let store = Store::open(temp.path()).unwrap();
    store.db.execute_batch("CREATE TRIGGER no_repeat_folder BEFORE INSERT ON folders BEGIN SELECT RAISE(ABORT,'existing folders must not be inserted'); END; CREATE TRIGGER no_repeat_settings BEFORE INSERT ON settings BEGIN SELECT RAISE(ABORT,'existing settings must not be inserted'); END;").unwrap();
    let before = store.workspace().unwrap();
    drop(store);
    assert_eq!(
        Store::open(temp.path()).unwrap().workspace().unwrap(),
        before
    );
}

#[test]
fn unsupported_versions_do_not_initialize_or_recover() {
    for version in [-1, 2, 3, 99] {
        for schema in [false, true] {
            let temp = tempfile::tempdir().unwrap();
            let db = database(temp.path(), version, schema);
            if schema {
                insert(&db, "default", &folder("default", "default"));
            }
            drop(db);
            recovery_fixture(temp.path());
            rejected_unchanged(temp.path(), "schema_version");
        }
    }
}

#[test]
fn partial_unknown_and_mismatched_schemas_are_preserved() {
    for version in [0, 1] {
        for sql in [
            "CREATE TABLE unrelated(a TEXT)",
            "CREATE TABLE sqliteX_extension(a TEXT)",
            "CREATE TABLE folders(id TEXT PRIMARY KEY,body TEXT NOT NULL)",
            "CREATE VIEW folders AS SELECT 1 AS id, '{}' AS body",
        ] {
            let temp = tempfile::tempdir().unwrap();
            let db = database(temp.path(), version, false);
            db.execute_batch(sql).unwrap();
            drop(db);
            recovery_fixture(temp.path());
            rejected_unchanged(temp.path(), "schema_invalid");
        }
        for table in [
            "folders",
            "notes",
            "attachments",
            "settings",
            "attachment_operations",
        ] {
            let temp = tempfile::tempdir().unwrap();
            let db = database(temp.path(), version, true);
            if table != "attachment_operations" {
                db.execute_batch(&format!("DROP TABLE {table}")).unwrap();
            }
            db.execute_batch(&format!("CREATE TABLE {table}(id TEXT,body TEXT)"))
                .unwrap();
            drop(db);
            recovery_fixture(temp.path());
            rejected_unchanged(temp.path(), "schema_invalid");
        }
        // Whitespace folding must not confuse a type name with NOT NULL.
        let temp = tempfile::tempdir().unwrap();
        let db = database(temp.path(), version, true);
        db.execute_batch(
            "DROP TABLE folders; CREATE TABLE folders(id TEXT PRIMARY KEY,body TEXTNOTNULL)",
        )
        .unwrap();
        drop(db);
        rejected_unchanged(temp.path(), "schema_invalid");
    }
    let temp = tempfile::tempdir().unwrap();
    drop(database(temp.path(), 1, false));
    rejected_unchanged(temp.path(), "schema_invalid");
}

#[test]
fn every_folder_row_is_strict_before_any_missing_row_is_created() {
    let mutations: Vec<(&str, Value)> = vec![
        ("default", json!("broken-json")),
        ("default", {
            let mut v = folder("default", "normal");
            v["name"] = json!("must not be replaced");
            v
        }),
        ("default", folder("quick", "quick")),
        ("default", {
            let mut v = folder("default", "default");
            v["parentId"] = json!("p");
            v
        }),
        ("custom", folder("custom", "smart")),
        ("custom", folder("custom", "quick")),
        ("all", folder("all", "normal")),
        ("custom", {
            let mut v = folder("custom", "normal");
            v["query"] = Value::Null;
            v
        }),
        ("custom", {
            let mut v = folder("custom", "normal");
            v["definitionRevision"] = json!(1);
            v
        }),
        ("custom", {
            let mut v = folder("custom", "normal");
            v["future"] = json!(true);
            v
        }),
        ("custom", {
            let mut v = folder("custom", "normal");
            v["sortOrder"] = json!(1.5);
            v
        }),
    ];
    for version in [0, 1] {
        for (key, value) in &mutations {
            let temp = tempfile::tempdir().unwrap();
            let db = database(temp.path(), version, true);
            if value.is_string() {
                db.execute("INSERT INTO folders VALUES(?1,'{bad')", [key])
                    .unwrap();
            } else {
                insert(&db, key, value);
            }
            drop(db);
            recovery_fixture(temp.path());
            rejected_unchanged(temp.path(), "folder_invalid");
        }
    }
}

#[test]
fn runtime_single_and_all_folder_reads_reject_key_mismatch_and_unknown_fields() {
    let temp = tempfile::tempdir().unwrap();
    let store = Store::open(temp.path()).unwrap();
    for value in [folder("other", "normal"), {
        let mut v = folder("custom", "normal");
        v["query"] = Value::Null;
        v
    }] {
        store
            .db
            .execute(
                "INSERT OR REPLACE INTO folders VALUES('custom',?1)",
                [value.to_string()],
            )
            .unwrap();
        assert!(store.folder("custom").is_err());
        assert!(store.folders().is_err());
    }
    assert_eq!(store.folder("absent").err().unwrap().code, "not_found");
}

struct ResetFailure;
impl Drop for ResetFailure {
    fn drop(&mut self) {
        FAIL_AT.with(|p| p.set(None));
    }
}

#[test]
fn sql_failure_rolls_back_schema_system_settings_and_version_then_retry_works() {
    for existing in [false, true] {
        for version in [0, 1] {
            if !existing && version == 1 {
                continue;
            }
            for stage in ["schema", "default", "quick", "trash", "settings", "version"] {
                let temp = tempfile::tempdir().unwrap();
                let db = database(temp.path(), version, existing);
                if existing {
                    insert(&db, "custom", &folder("custom", "normal"));
                }
                let old_schema: Vec<String> = db
                    .prepare("SELECT sql FROM sqlite_schema WHERE type='table' ORDER BY name")
                    .unwrap()
                    .query_map([], |r| r.get(0))
                    .unwrap()
                    .collect::<std::result::Result<_, _>>()
                    .unwrap();
                let old_folders = if existing {
                    rows(&db, "folders")
                } else {
                    vec![]
                };
                drop(db);
                FAIL_AT.with(|p| p.set(Some(stage)));
                let reset = ResetFailure;
                let error = Store::open(temp.path())
                    .err()
                    .expect("injected SQL must fail");
                assert_eq!(error.code, "database");
                drop(reset);
                let db = Connection::open(temp.path().join("notes.sqlite3")).unwrap();
                assert_eq!(
                    db.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
                        .unwrap(),
                    version
                );
                let schema: Vec<String> = db
                    .prepare("SELECT sql FROM sqlite_schema WHERE type='table' ORDER BY name")
                    .unwrap()
                    .query_map([], |r| r.get(0))
                    .unwrap()
                    .collect::<std::result::Result<_, _>>()
                    .unwrap();
                assert_eq!(schema, old_schema);
                if existing {
                    assert_eq!(rows(&db, "folders"), old_folders);
                    assert!(rows(&db, "settings").is_empty());
                }
                drop(db);
                let store = Store::open(temp.path()).unwrap();
                assert_eq!(store.folders().unwrap().len(), if existing { 4 } else { 3 });
            }
        }
    }
}

#[test]
fn valid_recovery_still_runs_after_successful_initialization() {
    let temp = tempfile::tempdir().unwrap();
    drop(database(temp.path(), 0, true));
    recovery_fixture(temp.path());
    let store = Store::open(temp.path()).unwrap();
    assert!(fs::read_dir(temp.path().join("attachments"))
        .unwrap()
        .next()
        .is_none());
    assert!(fs::read_dir(temp.path().join(".imports"))
        .unwrap()
        .next()
        .is_none());
    assert_eq!(store.folders().unwrap().len(), 3);
}

#[test]
fn archive_one_and_two_reject_hidden_folder_fields_without_changing_target() {
    let temp = tempfile::tempdir().unwrap();
    let store = Store::open(temp.path().join("source")).unwrap();
    let valid = temp.path().join("valid.notesbackup");
    store.export_archive(&valid).unwrap();
    let original: Value = serde_json::from_slice(&fs::read(&valid).unwrap()).unwrap();
    let mut target = Store::open(temp.path().join("target")).unwrap();
    for version in [1, 2] {
        for field in ["query", "definitionRevision", "future"] {
            let before = target.workspace().unwrap();
            let mut bad = original.clone();
            bad["version"] = json!(version);
            bad["folders"][0][field] = Value::Null;
            let path = temp.path().join("bad.notesbackup");
            fs::write(&path, serde_json::to_vec(&bad).unwrap()).unwrap();
            assert!(target.import_archive(&path).is_err());
            assert_eq!(target.workspace().unwrap(), before);
            assert!(fs::read_dir(target.root.join("attachments"))
                .unwrap()
                .next()
                .is_none());
        }
        let mut good = original.clone();
        good["version"] = json!(version);
        fs::write(&valid, serde_json::to_vec(&good).unwrap()).unwrap();
        target.import_archive(&valid).unwrap();
    }
}
