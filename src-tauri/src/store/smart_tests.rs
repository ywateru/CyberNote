use super::*;
use std::collections::BTreeMap;

fn query(combine: &str, rules: Value) -> Value {
    json!({"version":1,"combine":combine,"rules":rules})
}
fn tags(mode: &str, names: Option<Value>) -> Value {
    let mut value = json!({"type":"tags","mode":mode});
    if let Some(names) = names {
        value["names"] = names;
    }
    value
}
fn doc(names: &[&str], plain: &str) -> Value {
    let mut content = vec![json!({"type":"text","text":plain})];
    for name in names {
        content.push(json!({"type":"text","text":format!("#{name}"),"marks":[{"type":"noteTag","attrs":{"name":name}}]}));
        content.push(json!({"type":"text","text":" "}));
    }
    json!({"type":"doc","content":[{"type":"paragraph","content":content}]})
}
fn note(store: &mut Store, names: &[&str], pinned: bool) -> String {
    let id = store.action(json!({"type":"createNote"})).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    store
        .action(json!({"type":"saveNote","id":id,"revision":0,"document":doc(names,"plain #a ")}))
        .unwrap();
    store
        .action(json!({"type":"patchNote","id":id,"pinned":pinned}))
        .unwrap();
    id
}
fn create(store: &mut Store, query: Value) -> Folder {
    store
        .create_smart_folder(json!({"name":"智能","query":query}))
        .unwrap()
}
fn code<T>(result: Result<T>) -> String {
    match result {
        Err(e) => e.code,
        Ok(_) => panic!("expected failure"),
    }
}
fn files(store: &Store) -> BTreeMap<String, Vec<u8>> {
    fs::read_dir(store.root.join("attachments"))
        .unwrap()
        .map(|e| {
            let p = e.unwrap().path();
            (
                p.file_name().unwrap().to_string_lossy().into_owned(),
                fs::read(p).unwrap(),
            )
        })
        .collect()
}
fn ids(store: &Store, folder: &str, suspended: &HashSet<String>) -> HashSet<String> {
    store
        .evaluate_smart_folder(folder, suspended)
        .unwrap()
        .ids
        .into_iter()
        .collect()
}

#[test]
fn real_tag_modes_boolean_unavailable_and_reopen_use_validated_spans() {
    let temp = tempfile::tempdir().unwrap();
    let mut store = Store::open(temp.path()).unwrap();
    let a = note(&mut store, &["a", "b", "中文"], true);
    let b = note(&mut store, &["a"], false);
    let c = note(&mut store, &[], false);
    let d = note(&mut store, &[], true);
    let empty = store.action(json!({"type":"createNote"})).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let locked = note(&mut store, &[], true);
    store
        .action(json!({"type":"lockNote","id":locked,"password":"synthetic-password"}))
        .unwrap();
    store.action(json!({"type":"closeLocks"})).unwrap();
    let deleted = note(&mut store, &["a", "b"], true);
    store
        .action(json!({"type":"deleteNote","id":deleted}))
        .unwrap();
    let suspended = note(&mut store, &["a", "b"], true);
    let excluded = HashSet::from([suspended]);
    let cases = vec![
        (
            query("all", json!([tags("allSelected", Some(json!(["a", "b"])))])),
            vec![a.clone()],
        ),
        (
            query(
                "all",
                json!([tags("anySelected", Some(json!(["b", "unused"])))]),
            ),
            vec![a.clone()],
        ),
        (
            query("all", json!([tags("anyTag", None)])),
            vec![a.clone(), b.clone()],
        ),
        (
            query("all", json!([tags("noTags", None)])),
            vec![c.clone(), d.clone(), empty.clone()],
        ),
        (
            query("all", json!([tags("allSelected", Some(json!(["A"])))])),
            vec![],
        ),
        (
            query(
                "all",
                json!([tags("anyTag",None),{"type":"pinned","value":true}]),
            ),
            vec![a.clone()],
        ),
        (
            query(
                "any",
                json!([tags("noTags",None),{"type":"pinned","value":true}]),
            ),
            vec![
                a.clone(),
                c.clone(),
                d.clone(),
                locked.clone(),
                empty.clone(),
            ],
        ),
        (
            query(
                "all",
                json!([tags("noTags",None),{"type":"pinned","value":false}]),
            ),
            vec![c.clone(), empty.clone()],
        ),
        (
            query(
                "any",
                json!([tags("anyTag",None),{"type":"pinned","value":false}]),
            ),
            vec![a.clone(), b.clone(), c.clone(), empty.clone()],
        ),
        (
            query("all", json!([{"type":"pinned","value":false}])),
            vec![b.clone(), c.clone(), empty.clone()],
        ),
    ];
    let mut definitions = Vec::new();
    for (query, expected) in cases {
        let folder = create(&mut store, query);
        assert_eq!(folder.definition_revision, Some(1));
        assert_eq!(
            ids(&store, &folder.id, &excluded),
            expected.iter().cloned().collect()
        );
        definitions.push((folder.id, expected));
    }
    let before = store.workspace().unwrap();
    drop(store);
    let mut store = Store::open(temp.path()).unwrap();
    assert_eq!(store.workspace().unwrap(), before);
    for (id, expected) in &definitions {
        let result = store.evaluate_smart_folder(id, &excluded).unwrap();
        assert_eq!(result.definition_revision, 1);
        assert_eq!(
            result.ids.into_iter().collect::<HashSet<_>>(),
            expected.iter().cloned().collect()
        );
    }
    store
        .action(json!({"type":"unlockNote","id":locked,"password":"synthetic-password"}))
        .unwrap();
    // Stored locked status governs availability even while a key is in memory.
    assert!(!ids(&store, &definitions[3].0, &excluded).contains(&locked));
    assert!(ids(&store, &definitions[6].0, &excluded).contains(&locked));
    // A malformed marked span is an error, never a plaintext/regex fallback.
    let mut n = store.note(&a).unwrap();
    n.document = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"#wrong","marks":[{"type":"noteTag","attrs":{"name":"a"}}]}]}]});
    store.put_note(&n).unwrap();
    assert!(store
        .evaluate_smart_folder(&definitions[2].0, &excluded)
        .is_err());
}

#[test]
fn membership_keeps_definition_and_note_rows_in_one_real_sqlite_snapshot() {
    use rusqlite::hooks::{AuthAction, AuthContext, Authorization};
    use std::{sync::mpsc, time::Duration};
    let temp = tempfile::tempdir().unwrap();
    let mut store = Store::open(temp.path()).unwrap();
    let nid = note(&mut store, &[], false);
    let f = create(
        &mut store,
        query("all", json!([{"type":"pinned","value":true}])),
    );
    let mut writer = Store::open(temp.path()).unwrap();
    let folder = f.id.clone();
    let note = nid.clone();
    let (begin, ready) = mpsc::channel();
    let (complete, done) = mpsc::channel();
    let worker = std::thread::spawn(move || {
        ready.recv_timeout(Duration::from_secs(10)).unwrap();
        writer.update_smart_folder(json!({"id":folder,"name":"new snapshot","query":query("all",json!([{"type":"pinned","value":false}])) ,"expectedDefinitionRevision":1})).unwrap();
        writer
            .action(json!({"type":"patchNote","id":note,"pinned":true}))
            .unwrap();
        complete.send(()).unwrap();
    });
    let mut held = false;
    store.db.authorizer(Some(move |context: AuthContext<'_>| {
        if !held
            && matches!(
                context.action,
                AuthAction::Read {
                    table_name: "notes",
                    ..
                }
            )
        {
            held = true;
            if begin.send(()).is_err() || done.recv_timeout(Duration::from_secs(10)).is_err() {
                return Authorization::Deny;
            }
        }
        Authorization::Allow
    }));
    let snapshot = store.evaluate_smart_folder(&f.id, &HashSet::new()).unwrap();
    store
        .db
        .authorizer(None::<fn(AuthContext<'_>) -> Authorization>);
    worker.join().unwrap();
    assert_eq!(snapshot.definition_revision, 1);
    assert!(snapshot.ids.is_empty());
    assert!(store.note(&nid).unwrap().pinned);
    assert_eq!(
        store
            .evaluate_smart_folder(&f.id, &HashSet::new())
            .unwrap()
            .definition_revision,
        2
    );
}

#[test]
fn strict_query_folder_and_action_shapes_reject_incomplete_or_future_data() {
    let temp = tempfile::tempdir().unwrap();
    let mut store = Store::open(temp.path()).unwrap();
    let good = query(
        "all",
        json!([tags("allSelected", Some(json!(["Future", "中文"])))]),
    );
    let mut bad = vec![
        query("all", json!([])),
        query("future", json!([{"type":"pinned","value":true}])),
        query("all", json!([tags("allSelected", Some(json!([])))])),
        query("all", json!([tags("anySelected", None)])),
        query("all", json!([tags("anyTag", Some(Value::Null))])),
        query("all", json!([tags("noTags", Some(json!([])))])),
        query("all", json!([tags("future", None)])),
        query("all", json!([{"type":"future"}])),
        query("all", json!([{"type":"pinned","value":true,"extra":null}])),
        query(
            "all",
            json!([{"type":"pinned","value":true},{"type":"pinned","value":false}]),
        ),
        query("all", json!([tags("anyTag", None), tags("noTags", None)])),
    ];
    for names in [
        json!(["a", "a"]),
        json!(["#a"]),
        json!([""]),
        json!(["123"]),
        json!(["a "]),
        json!(["é"]),
        json!(["a".repeat(65)]),
        json!((0..129).map(|i| format!("tag{i}")).collect::<Vec<_>>()),
    ] {
        bad.push(query("all", json!([tags("allSelected", Some(names))])));
    }
    let mut v = good.clone();
    v["version"] = json!(2);
    bad.push(v);
    let mut v = good.clone();
    v["extra"] = Value::Null;
    bad.push(v);
    let before = store.workspace().unwrap();
    for query in bad {
        assert_eq!(
            code(store.create_smart_folder(json!({"name":"smart","query":query}))),
            "smart_invalid"
        );
        assert_eq!(store.workspace().unwrap(), before);
    }
    for input in [
        json!({"name":"","query":good}),
        json!({"name":"smart","query":good,"extra":null}),
        json!({"name":"smart","query":good,"kind":"normal"}),
    ] {
        assert_eq!(code(store.create_smart_folder(input)), "smart_invalid");
    }
    let f = create(&mut store, good.clone());
    let base = serde_json::to_value(&f).unwrap();
    for field in ["query", "definitionRevision", "parentId"] {
        let mut v = base.clone();
        v.as_object_mut().unwrap().remove(field);
        assert!(
            serde_json::from_value::<Folder>(v).is_err(),
            "missing {field}"
        );
    }
    for (field, value) in [
        ("parentId", json!("default")),
        ("definitionRevision", json!(0)),
        ("definitionRevision", json!(MAX_REVISION + 1)),
        ("id", json!("all")),
        ("id", json!("default")),
        ("kind", json!("normal")),
        ("query", Value::Null),
    ] {
        let mut v = base.clone();
        v[field] = value;
        assert!(serde_json::from_value::<Folder>(v).is_err());
    }
    let physical = serde_json::to_value(store.folder("default").unwrap()).unwrap();
    for field in ["query", "definitionRevision"] {
        let mut v = physical.clone();
        v[field] = Value::Null;
        assert!(serde_json::from_value::<Folder>(v).is_err());
    }
    let mut old = physical;
    old.as_object_mut().unwrap().remove("parentId");
    assert!(serde_json::from_value::<Folder>(old).is_ok());
}

#[test]
fn real_cas_rejects_stale_edits_delete_and_overflow_without_member_side_effects() {
    let temp = tempfile::tempdir().unwrap();
    let mut store = Store::open(temp.path()).unwrap();
    let nid = note(&mut store, &[], true);
    store
        .store_attachment(&nid, "keep.txt", "text/plain", b"keep".to_vec())
        .unwrap();
    let locked = note(&mut store, &[], false);
    store
        .action(json!({"type":"lockNote","id":locked,"password":"synthetic-password"}))
        .unwrap();
    store
        .action(json!({"type":"unlockNote","id":locked,"password":"synthetic-password"}))
        .unwrap();
    assert!(!store.keys.is_empty());
    // Real query/rename replacement shares one persisted revision.
    let f = create(
        &mut store,
        query("all", json!([{"type":"pinned","value":true}])),
    );
    let next=store.update_smart_folder(json!({"id":f.id,"name":"renamed","query":query("all",json!([tags("noTags",None)])),"expectedDefinitionRevision":1})).unwrap();
    assert_eq!(next.definition_revision, Some(2));
    let before = store.workspace().unwrap();
    for input in [
        json!({"id":f.id,"name":"stale","query":f.query,"expectedDefinitionRevision":1}),
        json!({"id":f.id,"name":"stale","query":f.query,"expectedDefinitionRevision":2,"kind":"normal"}),
    ] {
        assert!(store.update_smart_folder(input).is_err());
        assert_eq!(store.workspace().unwrap(), before);
    }
    assert_eq!(
        code(store.delete_smart_folder(json!({"id":f.id,"expectedDefinitionRevision":1}))),
        "smart_conflict"
    );
    for kind in ["renameFolder", "deleteFolder", "moveFolder"] {
        assert!(store
            .action(json!({"type":kind,"id":f.id,"name":"bypass"}))
            .is_err());
    }
    assert_eq!(code(store.folder_note_ids(&f.id)), "folder_capability");
    let notes = serde_json::to_value(store.notes().unwrap()).unwrap();
    let attachments = serde_json::to_value(store.attachments().unwrap()).unwrap();
    let bytes = files(&store);
    let keys = store.keys.clone();
    store
        .delete_smart_folder(json!({"id":f.id,"expectedDefinitionRevision":2}))
        .unwrap();
    assert_eq!(serde_json::to_value(store.notes().unwrap()).unwrap(), notes);
    assert_eq!(
        serde_json::to_value(store.attachments().unwrap()).unwrap(),
        attachments
    );
    assert_eq!(store.keys, keys);
    assert_eq!(files(&store), bytes);
    assert_eq!(
        code(store.update_smart_folder(
            json!({"id":f.id,"name":"revive","query":f.query,"expectedDefinitionRevision":2})
        )),
        "not_found"
    );
    assert_eq!(
        code(store.delete_smart_folder(json!({"id":f.id,"expectedDefinitionRevision":2}))),
        "not_found"
    );
    let mut f = create(
        &mut store,
        query("all", json!([{"type":"pinned","value":true}])),
    );
    f.definition_revision = Some(MAX_REVISION);
    store.put_folder(&f).unwrap();
    let before = store.workspace().unwrap();
    assert_eq!(code(store.update_smart_folder(json!({"id":f.id,"name":"overflow","query":f.query,"expectedDefinitionRevision":MAX_REVISION}))),"smart_revision_overflow");
    assert_eq!(store.workspace().unwrap(), before);
    assert_eq!(
        code(store.update_smart_folder(
            json!({"id":"default","name":"convert","query":f.query,"expectedDefinitionRevision":1})
        )),
        "folder_capability"
    );
    assert!(store
        .action(json!({"type":"createSmartFolder","name":"unexposed","query":f.query}))
        .is_err());
}

#[test]
fn owner_parent_restore_and_conflict_copy_share_physical_capabilities() {
    let temp = tempfile::tempdir().unwrap();
    let mut store = Store::open(temp.path()).unwrap();
    let smart = create(
        &mut store,
        query("all", json!([{"type":"pinned","value":true}])),
    );
    let normal = store
        .action(json!({"type":"createFolder","name":"physical"}))
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let nid = note(&mut store, &[], false);
    for target in [smart.id.as_str(), "trash", "all"] {
        for action in [
            json!({"type":"createNote","folderId":target}),
            json!({"type":"patchNote","id":nid,"folderId":target}),
            json!({"type":"createFolder","name":"bad","parentId":target}),
            json!({"type":"moveFolder","id":normal,"parentId":target}),
        ] {
            let before = store.workspace().unwrap();
            assert!(store.action(action).is_err());
            assert_eq!(store.workspace().unwrap(), before);
        }
    }
    for target in ["default", "quick", normal.as_str()] {
        store
            .action(json!({"type":"patchNote","id":nid,"folderId":target}))
            .unwrap();
        store
            .action(json!({"type":"createFolder","name":"good","parentId":target}))
            .unwrap();
    }
    store.action(json!({"type":"deleteNote","id":nid})).unwrap();
    let before_move = store.workspace().unwrap();
    assert_eq!(
        code(store.action(json!({"type":"patchNote","id":nid,"folderId":"default"}))),
        "deleted"
    );
    assert_eq!(store.workspace().unwrap(), before_move);
    let mut n = store.note(&nid).unwrap();
    n.original_folder_id = Some(smart.id.clone());
    store.put_note(&n).unwrap();
    let before = store.workspace().unwrap();
    assert_eq!(
        code(store.action(json!({"type":"restoreNote","id":nid}))),
        "folder_capability"
    );
    assert_eq!(store.workspace().unwrap(), before);
    n.original_folder_id = Some("missing-old-location".into());
    store.put_note(&n).unwrap();
    store
        .action(json!({"type":"restoreNote","id":nid}))
        .unwrap();
    assert_eq!(store.note(&nid).unwrap().folder_id, "default");
    let mut n = store.note(&nid).unwrap();
    n.folder_id = smart.id;
    n.revision = 10;
    store.put_note(&n).unwrap();
    let before = store.workspace().unwrap();
    assert_eq!(
        code(store.action(
            json!({"type":"recoverConflictCopy","id":nid,"revision":1,"document":doc(&[],"copy")})
        )),
        "folder_capability"
    );
    assert_eq!(store.workspace().unwrap(), before);
}

#[test]
fn version_one_migration_preserves_json_and_bad_graphs_rollback_before_recovery() {
    for old_version in [0, 1] {
        let temp = tempfile::tempdir().unwrap();
        let mut store = Store::open(temp.path()).unwrap();
        let nid = note(&mut store, &["a"], true);
        store
            .action(json!({"type":"settings","settings":{"custom":{"keep":true}}}))
            .unwrap();
        store
            .db
            .pragma_update(None, "user_version", old_version)
            .unwrap();
        let before = store.workspace().unwrap();
        let raw:Vec<String>=store.db.prepare("SELECT body FROM folders UNION ALL SELECT body FROM notes UNION ALL SELECT body FROM settings").unwrap().query_map([],|r|r.get(0)).unwrap().collect::<std::result::Result<_,_>>().unwrap();
        drop(store);
        let store = Store::open(temp.path()).unwrap();
        assert_eq!(
            store
                .db
                .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
                .unwrap(),
            2
        );
        assert_eq!(store.workspace().unwrap(), before);
        assert_eq!(store.note(&nid).unwrap().revision, 2);
        let after:Vec<String>=store.db.prepare("SELECT body FROM folders UNION ALL SELECT body FROM notes UNION ALL SELECT body FROM settings").unwrap().query_map([],|r|r.get(0)).unwrap().collect::<std::result::Result<_,_>>().unwrap();
        assert_eq!(after, raw);
    }
    for version in [0, 1, 2] {
        for bad in ["parent", "owner", "original"] {
            let temp = tempfile::tempdir().unwrap();
            let mut store = Store::open(temp.path()).unwrap();
            let nid = note(&mut store, &[], false);
            match bad {
                "parent" => {
                    let f = store
                        .action(json!({"type":"createFolder","name":"bad"}))
                        .unwrap();
                    let mut f = store.folder(f["id"].as_str().unwrap()).unwrap();
                    f.parent_id = Some("trash".into());
                    store.put_folder(&f).unwrap();
                }
                "owner" => {
                    let mut n = store.note(&nid).unwrap();
                    n.folder_id = "trash".into();
                    store.put_note(&n).unwrap();
                }
                _ => {
                    let mut n = store.note(&nid).unwrap();
                    n.original_folder_id = Some("trash".into());
                    store.put_note(&n).unwrap();
                }
            }
            store
                .db
                .pragma_update(None, "user_version", version)
                .unwrap();
            drop(store);
            let before = fs::read(temp.path().join("notes.sqlite3")).unwrap();
            assert_eq!(code(Store::open(temp.path())), "graph_invalid");
            let db = Connection::open(temp.path().join("notes.sqlite3")).unwrap();
            assert_eq!(
                db.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
                    .unwrap(),
                version
            );
            drop(db);
            assert_eq!(fs::read(temp.path().join("notes.sqlite3")).unwrap(), before);
        }
    }
}

#[test]
fn old_physical_versions_reject_fully_valid_smart_rows_before_writes_or_recovery() {
    for version in [0, 1] {
        let temp = tempfile::tempdir().unwrap();
        let mut store = Store::open(temp.path()).unwrap();
        let folder = create(
            &mut store,
            query("all", json!([{"type":"pinned","value":true}])),
        );
        // This is a complete valid eight-field definition, not an incomplete
        // smart row that the common decoder would already reject by shape.
        let value = serde_json::to_value(&folder).unwrap();
        assert_eq!(value.as_object().unwrap().len(), 8);
        assert!(serde_json::from_value::<Folder>(value).is_ok());
        store
            .db
            .pragma_update(None, "user_version", version)
            .unwrap();
        let transaction = id();
        let blob = format!("{transaction}-{}.blob", id());
        fs::write(store.root.join("attachments").join(&blob), b"must survive").unwrap();
        let imports = store.root.join(".imports").join(&transaction);
        fs::create_dir_all(&imports).unwrap();
        let journal = json!({"version":1,"id":transaction,"paths":[blob]}).to_string();
        fs::write(imports.join("journal.json"), &journal).unwrap();
        let attachments = files(&store);
        drop(store);
        let database = fs::read(temp.path().join("notes.sqlite3")).unwrap();
        assert_eq!(code(Store::open(temp.path())), "folder_invalid");
        assert_eq!(
            fs::read(temp.path().join("notes.sqlite3")).unwrap(),
            database
        );
        assert_eq!(
            fs::read_to_string(imports.join("journal.json")).unwrap(),
            journal
        );
        for (name, bytes) in attachments {
            assert_eq!(
                fs::read(temp.path().join("attachments").join(name)).unwrap(),
                bytes
            );
        }
    }
}

#[test]
fn archive_three_double_import_remaps_real_entities_dates_and_selection() {
    let temp = tempfile::tempdir().unwrap();
    let mut source = Store::open(temp.path().join("source")).unwrap();
    let physical = source
        .action(json!({"type":"createFolder","name":"owner"}))
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let nid = note(&mut source, &["中文"], true);
    source
        .action(json!({"type":"patchNote","id":nid,"folderId":physical}))
        .unwrap();
    let owner = AttachmentOwner {
        session: id(),
        window: "main".into(),
        incarnation: id(),
    };
    let attachment = source
        .store_attachment_operation(
            &id(),
            &nid,
            &owner,
            "audio.webm",
            "audio/webm",
            b"audio",
            Some(1_793_743_199_123),
        )
        .unwrap()["attachment"]
        .clone();
    let mut document = doc(&["中文"], "recorded");
    document["content"].as_array_mut().unwrap().push(json!({"type":"attachment","attrs":{"id":attachment["id"],"kind":"audio","name":"audio.webm"}}));
    source.action(json!({"type":"saveNote","id":nid,"revision":source.note(&nid).unwrap().revision,"document":document})).unwrap();
    let f = create(
        &mut source,
        query("all", json!([tags("allSelected", Some(json!(["中文"])))])),
    );
    let f = source
        .update_smart_folder(
            json!({"id":f.id,"name":"revision two","query":f.query,"expectedDefinitionRevision":1}),
        )
        .unwrap();
    source.action(json!({"type":"settings","settings":{"selectedFolder":f.id,"selectedNote":nid,"custom":"keep"}})).unwrap();
    let path = temp.path().join("smart.notesbackup");
    source.export_archive(&path).unwrap();
    let archive: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    assert_eq!(archive["version"], 3);
    let mut target = Store::open(temp.path().join("target")).unwrap();
    let mut pairs = Vec::new();
    for _ in 0..2 {
        let before: HashSet<_> = target
            .folders()
            .unwrap()
            .into_iter()
            .map(|f| f.id)
            .collect();
        target.import_archive(&path).unwrap();
        let fresh: Vec<_> = target
            .folders()
            .unwrap()
            .into_iter()
            .filter(|f| !before.contains(&f.id))
            .collect();
        assert_eq!(fresh.len(), 2);
        let smart = fresh.iter().find(|f| f.kind == "smart").unwrap();
        let physical = fresh.iter().find(|f| f.kind == "normal").unwrap();
        let membership = target
            .evaluate_smart_folder(&smart.id, &HashSet::new())
            .unwrap();
        assert_eq!(membership.definition_revision, 2);
        let own: Vec<_> = target
            .notes()
            .unwrap()
            .into_iter()
            .filter(|n| n.folder_id == physical.id)
            .collect();
        assert_eq!(own.len(), 1);
        assert!(membership.ids.contains(&own[0].id));
        let settings = target.workspace().unwrap()["settings"].clone();
        assert_eq!(settings["selectedFolder"], smart.id);
        assert_eq!(settings["selectedNote"], own[0].id);
        assert_eq!(settings["custom"], "keep");
        let a = target
            .attachments()
            .unwrap()
            .into_iter()
            .find(|a| a.note_id == own[0].id)
            .unwrap();
        assert_eq!(a.recorded_at, Some(1_793_743_199_123));
        assert_eq!(
            target.read_attachment(&a.id).unwrap()["data"],
            B64.encode(b"audio")
        );
        assert_eq!(own[0].document["content"][1]["attrs"]["id"], a.id);
        pairs.push((smart.id.clone(), physical.id.clone(), own[0].id.clone()));
    }
    assert_ne!(pairs[0].0, pairs[1].0);
    assert_ne!(pairs[0].1, pairs[1].1);
    assert_ne!(pairs[0].2, pairs[1].2);
    let before = target.workspace().unwrap();
    let bytes = files(&target);
    for version in [1, 2, 4] {
        let mut bad = archive.clone();
        bad["version"] = json!(version);
        fs::write(&path, serde_json::to_vec(&bad).unwrap()).unwrap();
        assert!(target.import_archive(&path).is_err());
        assert_eq!(target.workspace().unwrap(), before);
        assert_eq!(files(&target), bytes);
    }
    let mut bad = archive.clone();
    let f = bad["folders"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|f| f["kind"] == "smart")
        .unwrap();
    f["query"]["version"] = json!(2);
    fs::write(&path, serde_json::to_vec(&bad).unwrap()).unwrap();
    assert!(target.import_archive(&path).is_err());
    assert_eq!(target.workspace().unwrap(), before);
    // Existing file journal and SQLite rollback path also protects smart rows.
    fs::write(&path, serde_json::to_vec(&archive).unwrap()).unwrap();
    target.db.execute_batch("CREATE TRIGGER reject_smart_import BEFORE INSERT ON notes BEGIN SELECT RAISE(ABORT,'reject'); END;").unwrap();
    assert_eq!(code(target.import_archive(&path)), "database");
    assert_eq!(target.workspace().unwrap(), before);
    assert_eq!(files(&target), bytes);
    assert!(fs::read_dir(target.root.join(".imports"))
        .unwrap()
        .next()
        .is_none());
    drop(target);
    assert_eq!(
        Store::open(temp.path().join("target"))
            .unwrap()
            .workspace()
            .unwrap(),
        before
    );
}

#[test]
fn shared_ui_corpus_runs_actual_persisted_rules_and_legal_tag_facts() {
    let corpus: Value = serde_json::from_str(include_str!(
        "../../../docs/fixtures/smart-projection09.json"
    ))
    .unwrap();
    let temp = tempfile::tempdir().unwrap();
    let mut store = Store::open(temp.path()).unwrap();
    let mut ids = BTreeMap::new();
    let mut suspended = HashSet::new();
    for fact in corpus["notes"].as_array().unwrap() {
        let names: Vec<&str> = fact["tags"]
            .as_array()
            .map(|a| a.iter().map(|v| v.as_str().unwrap()).collect())
            .unwrap_or_default();
        let id = note(&mut store, &names, fact["pinned"].as_bool().unwrap());
        if fact["tags"].is_null() {
            store
                .action(json!({"type":"lockNote","id":id,"password":"password"}))
                .unwrap();
        }
        if fact["deleted"] == true {
            store.action(json!({"type":"deleteNote","id":id})).unwrap();
        }
        if fact["suspended"] == true {
            suspended.insert(id.clone());
        }
        ids.insert(fact["id"].as_str().unwrap().to_string(), id);
    }
    for case in corpus["cases"].as_array().unwrap() {
        let f = create(&mut store, case["query"].clone());
        let actual = store.evaluate_smart_folder(&f.id, &suspended).unwrap();
        let actual: HashSet<_> = actual.ids.iter().cloned().collect();
        let expected: HashSet<_> = case["expected"]
            .as_array()
            .unwrap()
            .iter()
            .map(|n| ids[n.as_str().unwrap()].clone())
            .collect();
        assert_eq!(actual, expected, "{}", case["name"]);
    }
    for invalid in corpus["invalid"].as_array().unwrap() {
        assert_eq!(
            store
                .create_smart_folder(json!({"name":"reject","query":invalid}))
                .err()
                .unwrap()
                .code,
            "smart_invalid"
        );
    }
}
