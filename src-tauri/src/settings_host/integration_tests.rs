//! Targeted host-owner contracts using production Session/Store/cloud ports.
//! No Tauri windows, user data, account/network owner or real service access.
#![allow(dead_code, unused_imports)]
#[path = "../agent_access/mod.rs"]
mod agent_access;
#[path = "../application/mod.rs"]
mod application;
#[path = "../cloud_sync/mod.rs"]
mod cloud_sync;
#[path = "../session.rs"]
mod session;
#[path = "../store.rs"]
mod store;
#[path = "integration_sync.rs"]
mod sync;
use serde_json::{json, Value};
#[path = "quit.rs"]
mod quit;
use session::{synchronization::WindowReply, Session, Token};
use std::collections::HashSet;
use store::Store;
fn windows() -> HashSet<String> {
    HashSet::from(["main".into(), "note-fixture".into()])
}
fn new() -> (tempfile::TempDir, Session) {
    let d = tempfile::tempdir().unwrap();
    let s = Session::new(Store::open(d.path()).unwrap());
    (d, s)
}
fn barrier(s: &mut Session) -> (String, Token) {
    let t = s.sync_media_token();
    let event = s.settings_begin(windows()).unwrap();
    let id = event["operationId"].as_str().unwrap().to_owned();
    for window in windows() {
        s.sync_reply(
            &window,
            WindowReply::Probe {
                operation_id: id.clone(),
                protected_note_ids: vec![],
                blocked: false,
            },
            &t,
        )
        .unwrap();
    }
    assert_eq!(
        s.sync_tick(&windows()).unwrap().unwrap().0["phase"],
        "prepare"
    );
    for window in windows() {
        s.sync_reply(
            &window,
            WindowReply::Prepare {
                operation_id: id.clone(),
                ready: true,
            },
            &t,
        )
        .unwrap();
    }
    s.settings_ready(&id, &windows(), &t).unwrap();
    s.settings_hold_media(&id, &windows(), &t).unwrap();
    (id, t)
}
#[test]
fn settings121_two_windows_snapshot_without_initializing_identity_and_protected_delay() {
    let (_d, mut s) = new();
    let token = s.sync_media_token();
    let event = s.settings_begin(windows()).unwrap();
    let id = event["operationId"].as_str().unwrap().to_owned();
    for window in windows() {
        s.sync_reply(
            &window,
            WindowReply::Probe {
                operation_id: id.clone(),
                protected_note_ids: vec!["recording-owner".into()],
                blocked: false,
            },
            &token,
        )
        .unwrap();
    }
    assert_eq!(
        s.sync_tick(&windows()).unwrap().unwrap().0["outcome"],
        "abort"
    );
    assert!(s.store.sync_identity().unwrap().is_none());
    // Clear the ordinary retry window via controlled Session clock, no sleeps.
    s.sync_advance_clock(std::time::Duration::from_secs(3));
    let (id, t) = barrier(&mut s);
    assert!(s.settings_owned());
    let snapshot = s.stage_archive(&t).unwrap();
    assert!(!std::fs::read(snapshot.path()).unwrap().is_empty());
    assert!(s.store.sync_identity().unwrap().is_none());
    assert!(s
        .settings_check_held(&id, &HashSet::from(["main".into()]), &t)
        .is_err());
    s.settings_release(&id, false).unwrap();
    assert!(!s.settings_owned());
}
#[test]
fn settings121_recovery_stage_requires_every_window_ack_and_preserves_additive_import() {
    let (d, mut s) = new();
    let note = s.store.action(json!({"type":"createNote"})).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let token = s.sync_media_token();
    let archive = d
        .path()
        .parent()
        .unwrap()
        .join(format!("settings121-{}.notesbackup", uuid::Uuid::new_v4()));
    s.store.export_archive(&archive).unwrap();
    let event = s
        .begin(
            json!({"type":"importArchive","path":archive}),
            windows(),
            &token,
        )
        .unwrap();
    let id = event["operationId"].as_str().unwrap();
    assert!(s.settings_recovery_stage(id, &windows(), &token).is_err());
    s.acknowledge(id, "main", true).unwrap();
    assert!(s.settings_recovery_stage(id, &windows(), &token).is_err());
    s.acknowledge(id, "note-fixture", true).unwrap();
    let protection = s.settings_recovery_stage(id, &windows(), &token).unwrap();
    let bytes = std::fs::read(protection.path()).unwrap();
    assert_eq!(s.store.settings_preview(&bytes).unwrap().0, 1);
    let (result, _) = s.finish(id, &windows(), false).unwrap();
    result.unwrap();
    assert_eq!(s.store.notes().unwrap().len(), 2);
    assert!(s.store.note(&note).is_ok());
    std::fs::remove_file(archive).unwrap();
}
#[test]
fn settings121_portable_settings_only_commit_and_schema_reopen_rejection() {
    let (d, mut s) = new();
    let local = json!({"appearance":{"version":2,"themeId":"forest","schemePreference":"light"},
        "presentation":{"version":1,"desktop":{"navigation":"focus","lastNonFocusNavigation":"two-pane","collectionView":"list","density":"compact"},"mobile":{"collectionView":"list","density":"comfortable"}},
        "sort":"title","groupDates":true,"selectedNote":"preserved","sidebarWidth":215});
    s.store
        .action(json!({"type":"settings","settings":local}))
        .unwrap();
    s.store.sync_enable(None).unwrap();
    let mut settings = s.store.cloud_capture_settings().unwrap();
    for head in &mut settings {
        head.vector.insert(uuid::Uuid::new_v4().to_string(), 1);
        head.value = match head.key.as_str() {
            "theme" => json!("dark"),
            "view" => json!("gallery"),
            "sort" => json!("updated"),
            "groupDates" => json!(false),
            _ => panic!("unexpected portable key"),
        };
        head.digest = head.computed_digest();
    }
    let before = s.store.cloud_generation().unwrap();
    s.store.cloud_validate_settings(&settings).unwrap();
    assert_eq!(s.store.cloud_generation().unwrap(), before);
    let (id, t) = barrier(&mut s);
    let media = s
        .store
        .sync_media_snapshot(&[], false)
        .unwrap()
        .verify()
        .unwrap();
    s.store.sync_begin_media(media).unwrap();
    let (event, _) = s
        .settings_apply_cloud(&id, &windows(), &t, settings.clone())
        .unwrap();
    s.store.sync_end_media();
    assert_eq!(event["outcome"], "commit");
    let actual = s.workspace().unwrap()["settings"].clone();
    assert_eq!(actual["appearance"]["schemePreference"], "dark");
    assert_eq!(actual["appearance"]["themeId"], "forest");
    assert_eq!(actual["theme"], "dark");
    assert_eq!(
        actual["presentation"]["desktop"]["collectionView"],
        "gallery"
    );
    assert_eq!(actual["presentation"]["desktop"]["navigation"], "focus");
    assert_eq!(
        actual["presentation"]["desktop"]["lastNonFocusNavigation"],
        "two-pane"
    );
    assert_eq!(actual["presentation"]["desktop"]["density"], "compact");
    assert_eq!(
        actual["presentation"]["mobile"],
        local["presentation"]["mobile"]
    );
    assert_eq!(actual["view"], "gallery");
    assert_eq!(actual["sort"], "updated");
    assert_eq!(actual["sidebarWidth"], 215);
    // Applying a remote owner projection must not dirty/re-version that same head.
    let captured = s.store.cloud_capture_settings().unwrap();
    for expected in &settings {
        let actual = captured.iter().find(|v| v.key == expected.key).unwrap();
        assert_eq!(actual.digest, expected.digest);
        assert_eq!(actual.vector, expected.vector);
        assert_eq!(actual.value, expected.value);
    }
    assert_eq!(s.workspace().unwrap()["settings"]["groupDates"], false);
    assert_eq!(
        s.workspace().unwrap()["settings"]["selectedNote"],
        "preserved"
    );
    assert!(s.take_metadata_event().unwrap()["changes"]
        .as_array()
        .unwrap()
        .iter()
        .any(|v| v["kind"] == "settings"));
    drop(s);
    let reopened = Store::open(d.path()).unwrap();
    assert_eq!(
        reopened.workspace().unwrap()["settings"]["groupDates"],
        false
    );
    drop(reopened);
    let db = rusqlite::Connection::open(d.path().join("notes.sqlite3")).unwrap();
    db.execute_batch("DROP TRIGGER cloud_setting_capture_view")
        .unwrap();
    drop(db);
    assert!(Store::open(d.path()).is_err());
}

#[test]
fn settings121_cloud_apply_error_can_release_the_host_fence() {
    let (d, mut s) = new();
    s.store.sync_enable(None).unwrap();
    let settings = s.store.cloud_capture_settings().unwrap();
    let (id, token) = barrier(&mut s);
    let database = rusqlite::Connection::open(d.path().join("notes.sqlite3")).unwrap();
    database
        .execute("UPDATE cloud_setting_control SET capture=0", [])
        .unwrap();
    drop(database);
    let media = s
        .store
        .sync_media_snapshot(&[], false)
        .unwrap()
        .verify()
        .unwrap();
    s.store.sync_begin_media(media).unwrap();
    let error = s
        .settings_apply_cloud(&id, &windows(), &token, settings)
        .unwrap_err();
    s.store.sync_end_media();
    assert_ne!(error.code, "sync_plan_stale");
    let release = s.settings_release(&id, false).unwrap();
    assert_eq!(release["outcome"], "abort");
    assert!(!s.settings_owned());
    let (_next_id, _next_token) = barrier(&mut s);
}

#[test]
fn settings121_inbox_generation_and_exit_lease_admission() {
    let (_d, mut s) = new();
    s.store.sync_enable(None).unwrap();
    let note = s.store.action(json!({"type":"createNote"})).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    s.store.sync_flush().unwrap();
    let mut wire = s
        .store
        .sync_version(&s.store.sync_inventory().unwrap()[0].digest)
        .unwrap();
    wire.vector = [(uuid::Uuid::new_v4().to_string(), 1)]
        .into_iter()
        .collect();
    wire = wire.seal();
    let before = s.store.cloud_generation().unwrap();
    let generation = s.store.application_generation().unwrap();
    s.store.sync_receive(vec![wire]).unwrap();
    assert_eq!(s.store.application_generation().unwrap(), generation);
    assert_ne!(s.store.cloud_generation().unwrap(), before);
    s.settings_exit = true;
    let t = s.sync_media_token();
    assert!(s.ordinary(json!({"type":"createNote"}), &t).is_err());
    assert!(s.register_save("main", &note, "late", t.clone()).is_err());
    s.settings_exit = false;
    assert!(s.ordinary(json!({"type":"createNote"}), &t).is_ok());
}
#[test]
fn settings121_cloud_translation_media_plan_and_identity_remain_local() {
    let (_a, mut a) = new();
    let (_b, mut b) = new();
    let note = a.store.action(json!({"type":"createNote"})).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let media = a
        .store
        .store_attachment(
            &note,
            "fixture.png",
            "image/png",
            b"original-bytes121".to_vec(),
        )
        .unwrap();
    let rev = a.store.note(&note).unwrap().revision;
    a.store.action(json!({"type":"saveNote","id":note,"revision":rev,"document":{"type":"doc","content":[{"type":"paragraph"},{"type":"attachment","attrs":{"id":media.id,"kind":"image","name":"fixture.png"}}]}})).unwrap();
    let ai = a.store.sync_enable(None).unwrap();
    let bi = b.store.sync_enable(None).unwrap();
    assert_ne!(ai.workspace_id, bi.workspace_id);
    let cloud = uuid::Uuid::new_v4().to_string();
    let proof = a
        .store
        .sync_media_snapshot(&[], false)
        .unwrap()
        .verify()
        .unwrap();
    a.store.sync_begin_media(proof).unwrap();
    let settings = a.store.cloud_capture_settings().unwrap();
    let (space, versions, refs) = cloud_sync::store_port::rows(&mut a.store, &cloud).unwrap();
    a.store.sync_end_media();
    let mut blobs = std::collections::BTreeMap::new();
    for r in refs {
        let bytes = std::fs::read(a.store.sync_blob_path(&r.hash).unwrap()).unwrap();
        b.store
            .sync_store_blob(&r.hash, r.size, &bytes[..])
            .unwrap();
        blobs.insert(r.hash, bytes);
    }
    let bundle = cloud_sync::store_port::assemble(
        space,
        versions,
        settings,
        blobs,
        "source-generation".into(),
    )
    .unwrap()
    .bundle;
    b.store.cloud_capture_settings().unwrap();
    let local = cloud_sync::store_port::local_versions(&b.store, &bundle).unwrap();
    assert!(local.iter().all(|v| v.workspace_id == bi.workspace_id));
    let proof = b
        .store
        .sync_media_snapshot(&local, false)
        .unwrap()
        .receipt_only()
        .verify()
        .unwrap();
    b.store
        .sync_with_media(proof, |s| {
            cloud_sync::store_port::validate(s, &bundle).unwrap();
            s.cloud_validate_settings(&bundle.settings)?;
            cloud_sync::store_port::receive(s, &bundle).unwrap();
            Ok(())
        })
        .unwrap();
    assert!(b.store.note(&note).is_err());
    let (id, t) = barrier(&mut b);
    let proof = b
        .store
        .sync_media_snapshot(&[], false)
        .unwrap()
        .verify()
        .unwrap();
    b.store.sync_begin_media(proof).unwrap();
    let (event, _) = b
        .settings_apply_cloud(&id, &windows(), &t, bundle.settings.clone())
        .unwrap();
    b.store.sync_end_media();
    assert_eq!(event["outcome"], "commit");
    assert_eq!(
        b.store.read_attachment(&media.id).unwrap()["data"],
        base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            b"original-bytes121"
        )
    );
    assert_eq!(a.store.sync_identity().unwrap().unwrap(), ai);
    assert_eq!(b.store.sync_identity().unwrap().unwrap(), bi);
    // A new receive invalidates the entire proof even without any UI metadata write.
    let obsolete = b
        .store
        .sync_media_snapshot(&[], false)
        .unwrap()
        .verify()
        .unwrap();
    let mut late = local[0].clone();
    late.vector = [(uuid::Uuid::new_v4().to_string(), 1)]
        .into_iter()
        .collect();
    late = late.seal();
    b.store.sync_receive(vec![late]).unwrap();
    assert_eq!(
        b.store.sync_begin_media(obsolete).unwrap_err().code,
        "sync_plan_stale"
    );
}

#[test]
fn settings121_cloud_control_missing_or_paused_rejects_before_any_recovery() {
    for state in ["missing", "paused"] {
        let (d, mut s) = new();
        s.store
            .action(json!({"type":"settings","settings":{"theme":"light","view":"list"}}))
            .unwrap();
        s.store.sync_enable(None).unwrap();
        s.store.cloud_capture_settings().unwrap();
        let database = d.path().join("notes.sqlite3");
        let db = rusqlite::Connection::open(&database).unwrap();
        if state == "missing" {
            db.execute("DELETE FROM cloud_setting_control", []).unwrap();
        } else {
            db.execute("UPDATE cloud_setting_control SET capture=0", [])
                .unwrap();
        }
        let settings: String = db
            .query_row("SELECT body FROM settings WHERE id=1", [], |r| r.get(0))
            .unwrap();
        let control: Vec<(i64, i64)> = db
            .prepare("SELECT singleton,capture FROM cloud_setting_control")
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert!(s.store.cloud_generation().is_err());
        assert!(s.store.cloud_capture_settings().is_err());
        assert!(s.store.cloud_validate_settings(&[]).is_err());
        drop(s);
        assert!(Store::open(d.path()).is_err());
        let after: String = db
            .query_row("SELECT body FROM settings WHERE id=1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(after, settings);
        let after: Vec<(i64, i64)> = db
            .prepare("SELECT singleton,capture FROM cloud_setting_control")
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(after, control);
    }
}
#[test]
fn settings121_exact_legacy_cloud_schema_migrates_owners_on_store_reopen() {
    let (d, mut s) = new();
    s.store.action(json!({"type":"settings","settings":{"theme":"dark","view":"gallery","groupDates":false}})).unwrap();
    s.store.sync_enable(None).unwrap();
    let before = serde_json::to_value(s.store.cloud_capture_settings().unwrap()).unwrap();
    drop(s);
    let db = rusqlite::Connection::open(d.path().join("notes.sqlite3")).unwrap();
    for key in ["theme", "view", "sort", "groupDates"] {
        let name = format!("cloud_setting_capture_{key}");
        let path = format!("$.{key}");
        db.execute_batch(&format!("DROP TRIGGER {name}; CREATE TRIGGER {name} AFTER UPDATE ON settings WHEN (SELECT capture FROM cloud_setting_control WHERE singleton=1)=1 AND (json_type(NEW.body,'{path}') IS NOT json_type(OLD.body,'{path}') OR json_extract(NEW.body,'{path}') IS NOT json_extract(OLD.body,'{path}')) BEGIN INSERT OR IGNORE INTO cloud_setting_dirty(key) VALUES('{key}'); END")).unwrap();
    }
    drop(db);
    let mut reopened = Store::open(d.path()).unwrap();
    assert!(reopened.cloud_generation().is_ok());
    let after = reopened.cloud_capture_settings().unwrap();
    for old in before.as_array().unwrap() {
        let new = after
            .iter()
            .find(|v| v.key == old["key"].as_str().unwrap())
            .unwrap();
        assert_eq!(new.value, old["value"]);
    }
    let captured = serde_json::to_value(reopened.cloud_capture_settings().unwrap()).unwrap();
    drop(reopened);
    let mut reopened = Store::open(d.path()).unwrap();
    assert_eq!(
        serde_json::to_value(reopened.cloud_capture_settings().unwrap()).unwrap(),
        captured
    );
}

#[test]
fn settings121_access_snapshot_distinguishes_store_replacement_without_new_session_epoch() {
    let (_d, mut s) = new();
    let before = s.snapshot().unwrap();
    let other = tempfile::tempdir().unwrap();
    s.store = Store::open(other.path()).unwrap();
    let after = s.snapshot().unwrap();
    assert_eq!(before["sessionId"], after["sessionId"]);
    assert_eq!(before["epoch"], after["epoch"]);
    assert_ne!(before["storeInstance"], after["storeInstance"]);
}
