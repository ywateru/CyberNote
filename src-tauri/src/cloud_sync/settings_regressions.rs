use crate::{
    cloud_sync::{model::*, settings_port as p},
    store::Store,
};
use rusqlite::Connection;
use serde_json::{json, Value};

fn body(db: &Connection) -> Value {
    serde_json::from_str(
        &db.query_row::<String, _, _>("SELECT body FROM settings WHERE id=1", [], |r| r.get(0))
            .unwrap(),
    )
    .unwrap()
}
fn successor(v: &SettingVersion, value: Value) -> SettingVersion {
    let mut vector = v.vector.clone();
    let actor = vector.keys().next().unwrap().clone();
    *vector.get_mut(&actor).unwrap() += 1;
    SettingVersion {
        key: v.key.clone(),
        vector,
        value,
        digest: String::new(),
    }
    .seal()
}
#[test]
fn cloud_settings_actual_owners_survive_unrelated_store_save_and_preserve_local_siblings() {
    let tmp = tempfile::tempdir().unwrap();
    let mut store = Store::open(tmp.path()).unwrap();
    store.action(json!({"type":"settings","settings":{
        "appearance":{"version":2,"themeId":"ocean","schemePreference":"light"},
        "presentation":{"version":1,"desktop":{"navigation":"focus","lastNonFocusNavigation":"two-pane","collectionView":"list","density":"compact"},"mobile":{"collectionView":"gallery","density":"comfortable"}},
        "groupDates":true,"sort":"updated","selectedNote":"local-selected","sidebarWidth":240,"localBackup":{"enabled":false,"directory":"/local-only"}
    }})).unwrap();
    let mut db = Connection::open(tmp.path().join("notes.sqlite3")).unwrap();
    let before = body(&db);
    let actor = uuid::Uuid::new_v4().to_string();
    let tx = db.transaction().unwrap();
    p::install(&tx).unwrap();
    let versions = p::capture(&tx, &actor).unwrap();
    let incoming: Vec<_> = versions
        .iter()
        .map(|v| {
            successor(
                v,
                match v.key.as_str() {
                    "theme" => json!("dark"),
                    "view" => json!("gallery"),
                    _ => v.value.clone(),
                },
            )
        })
        .collect();
    p::apply(&tx, &incoming).unwrap();
    let after = body(&tx);
    assert_eq!(after["appearance"]["schemePreference"], "dark");
    assert_eq!(
        after["presentation"]["desktop"]["collectionView"],
        "gallery"
    );
    for path in [
        "/appearance/themeId",
        "/presentation/desktop/navigation",
        "/presentation/desktop/lastNonFocusNavigation",
        "/presentation/desktop/density",
        "/presentation/mobile",
        "/selectedNote",
        "/sidebarWidth",
        "/localBackup",
    ] {
        assert_eq!(
            after.pointer(path),
            before.pointer(path),
            "local owner sibling {path}"
        );
    }
    assert_eq!(
        p::capture(&tx, &actor)
            .unwrap()
            .iter()
            .map(|v| v.digest.clone())
            .collect::<Vec<_>>(),
        p::heads(&tx)
            .unwrap()
            .iter()
            .map(|v| v.digest.clone())
            .collect::<Vec<_>>()
    );
    tx.commit().unwrap();
    store
        .action(json!({"type":"settings","settings":{"groupDates":false}}))
        .unwrap();
    let current = store.workspace().unwrap();
    assert_eq!(
        current["settings"]["appearance"]["schemePreference"],
        "dark"
    );
    assert_eq!(
        current["settings"]["presentation"]["desktop"]["collectionView"],
        "gallery"
    );
    let tx = db.transaction().unwrap();
    let captured = p::capture(&tx, &actor).unwrap();
    for key in ["theme", "view"] {
        assert_eq!(
            captured.iter().find(|v| v.key == key).unwrap().digest,
            incoming.iter().find(|v| v.key == key).unwrap().digest,
            "unrelated save cannot invent a reverse-sync successor"
        );
    }
    tx.commit().unwrap();
    // A real owner edit, even with a stale valid legacy projection, is captured.
    let tx = db.transaction().unwrap();
    tx.execute("UPDATE settings SET body=json_set(body,'$.appearance.schemePreference','light','$.presentation.desktop.collectionView','list')",[]).unwrap();
    let captured = p::capture(&tx, &actor).unwrap();
    assert_eq!(
        captured.iter().find(|v| v.key == "theme").unwrap().value,
        "light"
    );
    assert_eq!(
        captured.iter().find(|v| v.key == "view").unwrap().value,
        "list"
    );
    tx.commit().unwrap();
}
#[test]
fn cloud_settings_missing_or_disabled_control_is_unknown_at_every_entry_and_never_repaired() {
    for broken in [
        "DELETE FROM cloud_setting_control",
        "UPDATE cloud_setting_control SET capture=0",
    ] {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE settings(id INTEGER PRIMARY KEY,body TEXT);INSERT INTO settings VALUES(1,'{\"groupDates\":false}')").unwrap();
        let actor = uuid::Uuid::new_v4().to_string();
        let tx = db.transaction().unwrap();
        p::install(&tx).unwrap();
        let old = p::capture(&tx, &actor).unwrap();
        tx.commit().unwrap();
        db.execute_batch(broken).unwrap();
        let before = body(&db);
        assert_eq!(p::heads(&db).err().unwrap().code, "state");
        assert_eq!(p::generation(&db).unwrap_err().code, "state");
        let tx = db.transaction().unwrap();
        assert_eq!(p::install(&tx).unwrap_err().code, "state");
        assert_eq!(p::capture(&tx, &actor).err().unwrap().code, "state");
        assert_eq!(p::apply(&tx, &old).unwrap_err().code, "state");
        assert_eq!(body(&tx), before);
        tx.rollback().unwrap();
        let count: i64 = db
            .query_row(
                "SELECT count(*) FROM cloud_setting_control WHERE singleton=1 AND capture=1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0, "do not resurrect damaged control state");
    }
}
#[test]
fn cloud_settings_invalid_owner_versions_and_unknown_wire_keys_roll_back() {
    for invalid in [
        json!({"appearance":{"version":99,"themeId":"ocean","schemePreference":"dark"}}),
        json!({"presentation":{"version":1,"desktop":{},"mobile":{}}}),
        json!({"appearance":null}),
    ] {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE settings(id INTEGER PRIMARY KEY,body TEXT)")
            .unwrap();
        db.execute("INSERT INTO settings VALUES(1,?1)", [invalid.to_string()])
            .unwrap();
        let tx = db.transaction().unwrap();
        assert_eq!(p::install(&tx).unwrap_err().code, "state");
        tx.rollback().unwrap();
        assert_eq!(body(&db), invalid);
        assert_eq!(
            db.query_row::<i64, _, _>(
                "SELECT count(*) FROM sqlite_schema WHERE name LIKE 'cloud_setting_%'",
                [],
                |r| r.get(0)
            )
            .unwrap(),
            0
        );
    }
}

#[test]
fn cloud_settings_legacy_trigger_migration_is_transactional_and_never_repairs_control() {
    for damaged in [false, true] {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE settings(id INTEGER PRIMARY KEY,body TEXT);INSERT INTO settings VALUES(1,'{\"groupDates\":false,\"theme\":\"light\",\"appearance\":{\"version\":2,\"themeId\":\"ocean\",\"schemePreference\":\"light\"}}')").unwrap();
        let actor = uuid::Uuid::new_v4().to_string();
        let tx = db.transaction().unwrap();
        p::install(&tx).unwrap();
        let heads = p::capture(&tx, &actor).unwrap();
        tx.commit().unwrap();
        for key in ["theme", "view", "sort", "groupDates"] {
            let name = format!("cloud_setting_capture_{key}");
            let path = format!("$.{key}");
            db.execute_batch(&format!("DROP TRIGGER {name};CREATE TRIGGER {name} AFTER UPDATE ON settings WHEN (SELECT capture FROM cloud_setting_control WHERE singleton=1)=1 AND (json_type(NEW.body,'{path}') IS NOT json_type(OLD.body,'{path}') OR json_extract(NEW.body,'{path}') IS NOT json_extract(OLD.body,'{path}')) BEGIN INSERT OR IGNORE INTO cloud_setting_dirty(key) VALUES('{key}'); END")).unwrap();
        }
        let legacy: String = db
            .query_row(
                "SELECT sql FROM sqlite_schema WHERE name='cloud_setting_capture_theme'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        if damaged {
            db.execute("DELETE FROM cloud_setting_control", []).unwrap();
        }
        let tx = db.transaction().unwrap();
        if damaged {
            assert_eq!(p::install(&tx).unwrap_err().code, "state");
            assert_eq!(
                tx.query_row::<String, _, _>(
                    "SELECT sql FROM sqlite_schema WHERE name='cloud_setting_capture_theme'",
                    [],
                    |r| r.get(0)
                )
                .unwrap(),
                legacy
            );
            tx.rollback().unwrap();
            continue;
        }
        p::install(&tx).unwrap();
        assert_eq!(
            p::heads(&tx)
                .unwrap()
                .iter()
                .map(|v| v.digest.clone())
                .collect::<Vec<_>>(),
            heads.iter().map(|v| v.digest.clone()).collect::<Vec<_>>()
        );
        assert!(!p::capture(&tx, &actor).unwrap().is_empty());
        tx.rollback().unwrap();
        assert_eq!(
            db.query_row::<String, _, _>(
                "SELECT sql FROM sqlite_schema WHERE name='cloud_setting_capture_theme'",
                [],
                |r| r.get(0)
            )
            .unwrap(),
            legacy,
            "rollback restores exact old triggers and heads"
        );
        let tx = db.transaction().unwrap();
        p::install(&tx).unwrap();
        p::capture(&tx, &actor).unwrap();
        tx.commit().unwrap();
        let tx = db.transaction().unwrap();
        p::install(&tx).unwrap();
        assert_eq!(
            tx.query_row::<i64, _, _>("SELECT count(*) FROM cloud_setting_dirty", [], |r| r.get(0))
                .unwrap(),
            0,
            "reopen is not a new migration/write"
        );
        tx.rollback().unwrap();
    }
}

#[test]
fn cloud_settings_control_update_must_hit_one_row_and_failure_rolls_back() {
    let mut db = Connection::open_in_memory().unwrap();
    db.execute_batch("CREATE TABLE settings(id INTEGER PRIMARY KEY,body TEXT);INSERT INTO settings VALUES(1,'{\"groupDates\":false}')").unwrap();
    let actor = uuid::Uuid::new_v4().to_string();
    let tx = db.transaction().unwrap();
    p::install(&tx).unwrap();
    let old = p::capture(&tx, &actor).unwrap();
    tx.commit().unwrap();
    // Controlled sabotage after capture=0: reset must notice zero rows rather
    // than committing settings with broken capture state.
    db.execute_batch("CREATE TRIGGER fixture_control_loss AFTER UPDATE ON settings BEGIN DELETE FROM cloud_setting_control;END").unwrap();
    let tx = db.transaction().unwrap();
    assert_eq!(
        p::apply(&tx, &[successor(&old[0], json!(true))])
            .unwrap_err()
            .code,
        "state"
    );
    tx.rollback().unwrap();
    assert_eq!(body(&db)["groupDates"], false);
    assert_eq!(
        db.query_row::<i64, _, _>("SELECT capture FROM cloud_setting_control", [], |r| r
            .get(0))
            .unwrap(),
        1
    );
    assert_eq!(p::heads(&db).unwrap()[0].digest, old[0].digest);
}

#[test]
fn cloud_settings_owner_projection_retains_concurrent_heads_and_unknown_key_failure_is_atomic() {
    let tmp = tempfile::tempdir().unwrap();
    let mut store = Store::open(tmp.path()).unwrap();
    store.action(json!({"type":"settings","settings":{"theme":"light","view":"list","groupDates":false}})).unwrap();
    let mut db = Connection::open(tmp.path().join("notes.sqlite3")).unwrap();
    let tx = db.transaction().unwrap();
    p::install(&tx).unwrap();
    let initial = p::capture(&tx, &uuid::Uuid::new_v4().to_string()).unwrap();
    tx.commit().unwrap();
    let incoming = SettingVersion {
        key: "theme".into(),
        vector: crate::sync::model::Vector::from([(uuid::Uuid::new_v4().to_string(), 1)]),
        value: json!("dark"),
        digest: String::new(),
    }
    .seal();
    let tx = db.transaction().unwrap();
    let conflicts = p::apply(&tx, &[incoming.clone()]).unwrap();
    assert_eq!(conflicts, 1);
    let selected = p::heads(&tx)
        .unwrap()
        .into_iter()
        .filter(|v| v.key == "theme")
        .min_by_key(|v| v.digest.clone())
        .unwrap();
    assert_eq!(body(&tx)["appearance"]["schemePreference"], selected.value);
    assert_eq!(p::heads(&tx).unwrap().len(), initial.len() + 1);
    tx.commit().unwrap();
    let before = body(&db);
    let tx = db.transaction().unwrap();
    let bad = SettingVersion {
        key: "backupPath".into(),
        value: json!("/not-portable"),
        ..incoming
    }
    .seal();
    assert_eq!(p::apply(&tx, &[bad]).unwrap_err().code, "invalid");
    tx.rollback().unwrap();
    assert_eq!(body(&db), before);
}
