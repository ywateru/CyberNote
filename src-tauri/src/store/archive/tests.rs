use super::*;
use std::{collections::BTreeMap, process::Command};

struct Fixture {
    _temp: tempfile::TempDir,
    archive: PathBuf,
    root: PathBuf,
    source: Value,
    original_id: String,
}
fn fixture() -> Fixture {
    let temp = tempfile::tempdir().unwrap();
    let archive = temp.path().join("source.notesbackup");
    let mut source = Store::open(temp.path().join("source")).unwrap();
    let parent = source
        .action(json!({"type":"createFolder","name":"归档父目录"}))
        .unwrap();
    let child = source
        .action(json!({"type":"createFolder","name":"归档子目录","parentId":parent["id"]}))
        .unwrap();
    let note = source
        .action(json!({"type":"createNote","folderId":child["id"]}))
        .unwrap();
    let aid = source
        .store_attachment(
            note["id"].as_str().unwrap(),
            "original.txt",
            "text/plain",
            b"original-content".to_vec(),
        )
        .unwrap();
    source
        .store_attachment(
            note["id"].as_str().unwrap(),
            "second.txt",
            "text/plain",
            b"second-content".to_vec(),
        )
        .unwrap();
    source.action(json!({"type":"saveNote","id":note["id"],"revision":0,"document":{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"归档中文笔记"}]},{"type":"attachment","attrs":{"id":aid.id,"kind":"file","name":"original.txt"}}]}})).unwrap();
    source.action(json!({"type":"settings","settings":{"theme":"dark","view":"gallery","selectedFolder":child["id"],"selectedNote":note["id"],"groupDates":false,"sidebarWidth":244,"customSetting":{"keep":true}}})).unwrap();
    source.export_archive(&archive).unwrap();
    let source = source.workspace().unwrap();
    Fixture {
        root: temp.path().join("target"),
        archive,
        source,
        original_id: aid.id,
        _temp: temp,
    }
}
fn read_json(path: &Path) -> Value {
    serde_json::from_slice(&fs::read(path).unwrap()).unwrap()
}
fn write_json(path: &Path, value: &Value) {
    fs::write(path, serde_json::to_vec(value).unwrap()).unwrap();
}
fn files(root: &Path) -> BTreeMap<String, Vec<u8>> {
    fs::read_dir(root.join("attachments"))
        .unwrap()
        .map(|entry| {
            let entry = entry.unwrap();
            (
                entry.file_name().to_str().unwrap().to_string(),
                fs::read(entry.path()).unwrap(),
            )
        })
        .collect()
}
fn snapshot(store: &Store) -> (Value, BTreeMap<String, Vec<u8>>) {
    (store.workspace().unwrap(), files(&store.root))
}
fn assert_clean(root: &Path) {
    let path = root.join(".imports");
    assert!(
        !path.exists() || fs::read_dir(path).unwrap().next().is_none(),
        "pending import was not reclaimed"
    );
}
fn populate_local(root: &Path) -> Store {
    let mut store = Store::open(root).unwrap();
    let n = store.action(json!({"type":"createNote"})).unwrap();
    store.action(json!({"type":"saveNote","id":n["id"],"revision":0,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"不可覆盖的本地数据"}]}]}})).unwrap();
    store
        .store_attachment(
            n["id"].as_str().unwrap(),
            "keep.txt",
            "text/plain",
            b"LOCAL MUST SURVIVE".to_vec(),
        )
        .unwrap();
    store.action(json!({"type":"settings","settings":{"theme":"light","view":"list","selectedFolder":"default"}})).unwrap();
    store
}

#[test]
fn valid_import_restores_settings_hierarchy_bytes_and_preserves_colliding_entities() {
    let f = fixture();
    let mut store = populate_local(&f.root);
    let local = snapshot(&store);
    store.import_archive(&f.archive).unwrap();
    assert_eq!(store.workspace().unwrap()["settings"], f.source["settings"]);
    assert_eq!(
        store.read_attachment(&f.original_id).unwrap()["data"],
        B64.encode(b"original-content")
    );
    for (name, data) in &local.1 {
        assert_eq!(&files(&f.root)[name], data);
    }
    let first = snapshot(&store);
    // Importing the same backup must create a separately referenced copy,
    // rather than rolling the already imported entity back to an old revision.
    let original_note = f.source["notes"][0]["id"].as_str().unwrap();
    let old_revision = store.note(original_note).unwrap().revision;
    store.action(json!({"type":"saveNote","id":original_note,"revision":old_revision,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"已在本机继续编辑"}]}]}})).unwrap();
    let edited = store.note(original_note).unwrap().document;
    store.import_archive(&f.archive).unwrap();
    assert_eq!(store.note(original_note).unwrap().document, edited);
    let current = store.workspace().unwrap();
    assert_eq!(
        current["notes"].as_array().unwrap().len(),
        first.0["notes"].as_array().unwrap().len() + 1
    );
    let selected_id = current["settings"]["selectedNote"].as_str().unwrap();
    assert_ne!(selected_id, original_note);
    let selected = store.note(selected_id).unwrap();
    assert_eq!(selected.title, "归档中文笔记");
    assert_ne!(
        selected.folder_id,
        f.source["settings"]["selectedFolder"].as_str().unwrap()
    );
    assert_eq!(
        selected.folder_id,
        current["settings"]["selectedFolder"].as_str().unwrap()
    );
    let copied_attachment = selected.document["content"][1]["attrs"]["id"]
        .as_str()
        .unwrap();
    assert_ne!(copied_attachment, f.original_id);
    assert_eq!(
        store.read_attachment(copied_attachment).unwrap()["data"],
        B64.encode(b"original-content")
    );
    let complete = snapshot(&store);
    drop(store);
    let reopened = Store::open(&f.root).unwrap();
    assert_eq!(snapshot(&reopened), complete);
    assert_clean(&f.root);
}

#[test]
fn qa_bad_second_blob_preserves_existing_attachment_database_settings_and_source() {
    let f = fixture();
    let mut store = Store::open(&f.root).unwrap();
    store.import_archive(&f.archive).unwrap();
    let before = snapshot(&store);
    let mut bad = read_json(&f.archive);
    let first_id = bad["attachments"][0]["id"].as_str().unwrap().to_string();
    let second_id = bad["attachments"][1]["id"].as_str().unwrap().to_string();
    bad["blobs"][&first_id] = json!(B64.encode(b"valid replacement bytes"));
    bad["attachments"][0]["size"] = json!(b"valid replacement bytes".len());
    bad["blobs"][&second_id] = json!("!bad-base64");
    bad["settings"]["theme"] = json!("light");
    let bad_path = f._temp.path().join("bad-second.notesbackup");
    write_json(&bad_path, &bad);
    let source_bytes = fs::read(&bad_path).unwrap();
    let error = store.import_archive(&bad_path).unwrap_err();
    assert_eq!(error.code, "archive_invalid");
    assert!(error.message.contains("Base64"));
    assert_eq!(snapshot(&store), before);
    assert_eq!(fs::read(&bad_path).unwrap(), source_bytes);
    drop(store);
    assert_eq!(snapshot(&Store::open(&f.root).unwrap()), before);
    assert_clean(&f.root);
}

#[test]
fn invalid_archive_graphs_and_metadata_never_mutate_existing_workspace() {
    let f = fixture();
    let mut store = populate_local(&f.root);
    let baseline = snapshot(&store);
    let valid = read_json(&f.archive);
    type Mutation = (&'static str, Box<dyn Fn(&mut Value)>);
    let cases: Vec<Mutation> = vec![
        ("unsupported version", Box::new(|v| v["version"] = json!(2))),
        (
            "duplicate folder",
            Box::new(|v| {
                let x = v["folders"][3].clone();
                v["folders"].as_array_mut().unwrap().push(x);
            }),
        ),
        (
            "duplicate note",
            Box::new(|v| {
                let x = v["notes"][0].clone();
                v["notes"].as_array_mut().unwrap().push(x);
            }),
        ),
        (
            "duplicate attachment",
            Box::new(|v| {
                let x = v["attachments"][0].clone();
                v["attachments"].as_array_mut().unwrap().push(x);
            }),
        ),
        (
            "duplicate path",
            Box::new(|v| {
                v["attachments"][1]["relativePath"] = v["attachments"][0]["relativePath"].clone()
            }),
        ),
        (
            "path traversal",
            Box::new(|v| v["attachments"][0]["relativePath"] = json!("../notes.sqlite3")),
        ),
        (
            "self-cycle",
            Box::new(|v| v["folders"][3]["parentId"] = v["folders"][3]["id"].clone()),
        ),
        (
            "multi-cycle",
            Box::new(|v| v["folders"][3]["parentId"] = v["folders"][4]["id"].clone()),
        ),
        (
            "missing parent",
            Box::new(|v| v["folders"][3]["parentId"] = json!("missing")),
        ),
        (
            "invalid system kind",
            Box::new(|v| v["folders"][0]["kind"] = json!("normal")),
        ),
        (
            "non-root system",
            Box::new(|v| v["folders"][0]["parentId"] = v["folders"][3]["id"].clone()),
        ),
        (
            "missing system",
            Box::new(|v| {
                v["folders"].as_array_mut().unwrap().remove(0);
            }),
        ),
        (
            "missing note folder",
            Box::new(|v| v["notes"][0]["folderId"] = json!("missing")),
        ),
        (
            "orphan attachment",
            Box::new(|v| v["attachments"][0]["noteId"] = json!("missing")),
        ),
        (
            "dangling document attachment",
            Box::new(|v| v["notes"][0]["document"]["content"][1]["attrs"]["id"] = json!("missing")),
        ),
        (
            "wrong attachment kind",
            Box::new(|v| v["attachments"][0]["kind"] = json!("image")),
        ),
        (
            "wrong declared size",
            Box::new(|v| v["attachments"][0]["size"] = json!(1)),
        ),
        (
            "unknown document type",
            Box::new(|v| v["notes"][0]["document"]["content"][0]["type"] = json!("unknown")),
        ),
        (
            "malformed settings",
            Box::new(|v| v["settings"] = json!([])),
        ),
        (
            "invalid typed setting",
            Box::new(|v| v["settings"]["sidebarWidth"] = json!("wide")),
        ),
        (
            "missing blob",
            Box::new(|v| {
                let aid = v["attachments"][0]["id"].as_str().unwrap().to_string();
                v["blobs"].as_object_mut().unwrap().remove(&aid);
            }),
        ),
    ];
    let bad_path = f._temp.path().join("invalid.notesbackup");
    for (name, mutation) in cases {
        let mut bad = valid.clone();
        mutation(&mut bad);
        write_json(&bad_path, &bad);
        assert!(store.import_archive(&bad_path).is_err(), "accepted {name}");
        assert_eq!(snapshot(&store), baseline, "mutated workspace for {name}");
        assert_clean(&f.root);
    }
    fs::write(&bad_path, b"{incomplete-json").unwrap();
    assert!(store.import_archive(&bad_path).is_err());
    drop(store);
    assert_eq!(snapshot(&Store::open(&f.root).unwrap()), baseline);
}

#[test]
fn stale_selection_defaults_without_losing_other_settings() {
    let f = fixture();
    let mut archive = read_json(&f.archive);
    archive["settings"]["selectedFolder"] = json!("already-deleted-folder");
    archive["settings"]["selectedNote"] = json!("already-purged-note");
    archive["notes"][0]["originalFolderId"] = json!("previously-deleted-folder");
    let path = f._temp.path().join("stale-selection.notesbackup");
    write_json(&path, &archive);
    let mut store = Store::open(&f.root).unwrap();
    store.import_archive(&path).unwrap();
    let settings = store.workspace().unwrap()["settings"].clone();
    assert_eq!(settings["selectedFolder"], "default");
    assert_eq!(settings["selectedNote"], "");
    assert_eq!(settings["theme"], "dark");
    assert_eq!(settings["view"], "gallery");
    assert_eq!(settings["customSetting"], json!({"keep":true}));
}

#[test]
fn database_failure_after_files_publish_rolls_back_all_entities_and_settings() {
    let f = fixture();
    let mut store = populate_local(&f.root);
    store.db.execute_batch("CREATE TRIGGER reject_import BEFORE INSERT ON notes BEGIN SELECT RAISE(ABORT,'simulated disk/database rejection'); END;").unwrap();
    let before = snapshot(&store);
    let error = store.import_archive(&f.archive).unwrap_err();
    assert_eq!(error.code, "database");
    assert_eq!(snapshot(&store), before);
    assert_clean(&f.root);
    drop(store);
    assert_eq!(snapshot(&Store::open(&f.root).unwrap()), before);
}

#[test]
fn file_publish_failure_preserves_old_bytes_and_recovery_cleans_only_new_paths() {
    let f = fixture();
    let mut store = populate_local(&f.root);
    let before = snapshot(&store);
    let attachments = f.root.join("attachments");
    let held = f.root.join("held-attachments");
    fs::rename(&attachments, &held).unwrap();
    fs::write(&attachments, b"blocks directory publication").unwrap();
    assert!(store.import_archive(&f.archive).is_err());
    assert_eq!(store.workspace().unwrap(), before.0);
    fs::remove_file(&attachments).unwrap();
    fs::rename(&held, &attachments).unwrap();
    drop(store);
    assert_eq!(snapshot(&Store::open(&f.root).unwrap()), before);
    assert_clean(&f.root);
}

#[test]
fn input_limits_are_explicit_and_leave_workspace_unchanged() {
    let f = fixture();
    let mut store = populate_local(&f.root);
    let before = snapshot(&store);
    let path = f._temp.path().join("oversize.notesbackup");
    File::create(&path)
        .unwrap()
        .set_len(MAX_ARCHIVE + 1)
        .unwrap();
    assert_eq!(
        store.import_archive(&path).unwrap_err().code,
        "archive_limit"
    );
    let mut value = read_json(&f.archive);
    value["attachments"][0]["size"] = json!(MAX_ATTACHMENT + 1);
    write_json(&path, &value);
    assert_eq!(
        store.import_archive(&path).unwrap_err().code,
        "archive_limit"
    );
    let mut value = read_json(&f.archive);
    value["attachments"][0]["size"] = json!(80 * 1024 * 1024);
    value["attachments"][1]["size"] = json!(80 * 1024 * 1024);
    write_json(&path, &value);
    assert_eq!(
        store.import_archive(&path).unwrap_err().code,
        "archive_limit"
    );
    let mut value = read_json(&f.archive);
    value["settings"]["manyValues"] = Value::Array(vec![Value::Null; MAX_JSON_VALUES + 1]);
    write_json(&path, &value);
    assert_eq!(
        store.import_archive(&path).unwrap_err().code,
        "archive_limit"
    );
    assert_eq!(snapshot(&store), before);
    assert_clean(&f.root);
}

#[test]
fn export_failure_preserves_previous_archive_and_cannot_replace_live_store() {
    let f = fixture();
    let store = Store::open(&f.root).unwrap();
    let output = f._temp.path().join("keep.notesbackup");
    fs::write(&output, b"previous valid backup bytes").unwrap();
    // A missing source file fails before the destination is touched.
    drop(store);
    let store = populate_local(&f.root);
    let a = store.attachments().unwrap().remove(0);
    fs::remove_file(store.attachment_path(&a.relative_path).unwrap()).unwrap();
    assert!(store.export_archive(&output).is_err());
    assert_eq!(fs::read(&output).unwrap(), b"previous valid backup bytes");
    // Even a complete store may not target SQLite or its WAL/attachment files.
    store.db.execute("DELETE FROM attachments", []).unwrap();
    assert!(store.export_archive(&f.root.join("notes.sqlite3")).is_err());
    let directory = f._temp.path().join("destination-directory");
    fs::create_dir(&directory).unwrap();
    fs::write(directory.join("keep"), b"keep").unwrap();
    assert!(store.export_archive(&directory).is_err());
    assert_eq!(fs::read(directory.join("keep")).unwrap(), b"keep");
    assert!(!fs::read_dir(f._temp.path()).unwrap().any(|e| e
        .unwrap()
        .file_name()
        .to_string_lossy()
        .starts_with(".notes-export-")));
}

#[test]
fn real_subprocess_interruption_recovers_before_and_after_sqlite_commit() {
    for stage in [
        "staging",
        "journal",
        "first_file",
        "files",
        "before_commit",
        "after_commit",
    ] {
        let f = fixture();
        let store = populate_local(&f.root);
        let before = snapshot(&store);
        drop(store);
        let status = Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "store::archive::tests::crash_worker",
                "--ignored",
            ])
            .env("NOTES_TEST_ARCHIVE_CRASH", stage)
            .env("NOTES_TEST_ARCHIVE_ROOT", &f.root)
            .env("NOTES_TEST_ARCHIVE_FILE", &f.archive)
            .status()
            .unwrap();
        assert_eq!(status.code(), Some(77), "crash point not reached: {stage}");
        let store = Store::open(&f.root).unwrap();
        if stage == "after_commit" {
            assert_eq!(store.workspace().unwrap()["settings"], f.source["settings"]);
            assert_eq!(
                store.read_attachment(&f.original_id).unwrap()["data"],
                B64.encode(b"original-content")
            );
            for (name, bytes) in &before.1 {
                assert_eq!(&files(&f.root)[name], bytes);
            }
            assert_eq!(
                store.notes().unwrap().len(),
                before.0["notes"].as_array().unwrap().len() + 1
            );
        } else {
            assert_eq!(
                snapshot(&store),
                before,
                "changed state after crash at {stage}"
            );
        }
        assert_clean(&f.root);
    }
}

#[test]
fn recovery_refuses_journal_path_that_could_delete_an_old_file() {
    let f = fixture();
    let store = populate_local(&f.root);
    let before = snapshot(&store);
    drop(store);
    let txn = id();
    let staging = f.root.join(".imports").join(&txn);
    fs::create_dir_all(&staging).unwrap();
    write_json(
        &staging.join("journal.json"),
        &json!({"version":1,"id":txn,"paths":[before.1.keys().next().unwrap()]}),
    );
    let error = match Store::open(&f.root) {
        Ok(_) => panic!("unsafe journal accepted"),
        Err(e) => e,
    };
    assert_eq!(error.code, "archive_recovery");
    assert_eq!(files(&f.root), before.1);
}

fn replace_attachment_placeholder(value: &mut Value, attachment: &str) {
    match value {
        Value::String(text) if text == "$attachment" => *text = attachment.to_string(),
        Value::Array(values) => {
            for value in values {
                replace_attachment_placeholder(value, attachment);
            }
        }
        Value::Object(values) => {
            for value in values.values_mut() {
                replace_attachment_placeholder(value, attachment);
            }
        }
        _ => {}
    }
}
fn semantic_workspace(mut workspace: Value) -> Value {
    // Copy-on-write intentionally assigns new physical filenames on every
    // import. Entity data/IDs and independently read bytes must still match.
    for attachment in workspace["attachments"].as_array_mut().unwrap() {
        attachment["relativePath"] = json!("managed-file");
    }
    // System folders are reused in the destination, including their local
    // creation timestamps; the archive never overwrites those identities.
    for folder in workspace["folders"].as_array_mut().unwrap() {
        if ["default", "quick", "trash"].contains(&folder["id"].as_str().unwrap()) {
            folder["createdAt"] = json!(0);
        }
    }
    for key in ["folders", "notes", "attachments"] {
        workspace[key]
            .as_array_mut()
            .unwrap()
            .sort_by(|a, b| a["id"].as_str().cmp(&b["id"].as_str()));
    }
    workspace
}

#[test]
fn shared_editor_schema_corpus_uses_public_import_and_preserves_state_on_rejection() {
    let cases: Vec<Value> = serde_json::from_str(include_str!("document-cases.json")).unwrap();
    for case in cases {
        let f = fixture();
        let name = case["name"].as_str().unwrap();
        let mut store = populate_local(&f.root);
        let before = snapshot(&store);
        let mut archive = read_json(&f.archive);
        let mut document = case["document"].clone();
        replace_attachment_placeholder(&mut document, &f.original_id);
        archive["notes"][0]["document"] = document.clone();
        let text = doc_text(&document);
        archive["notes"][0]["plainText"] = json!(text);
        archive["notes"][0]["title"] = json!(text.lines().next().unwrap_or("新备忘录"));
        let path = f._temp.path().join("corpus.notesbackup");
        write_json(&path, &archive);
        let source_bytes = fs::read(&path).unwrap();
        let result = store.import_archive(&path);
        if !case["importAccepted"].as_bool().unwrap() {
            let error = result
                .err()
                .unwrap_or_else(|| panic!("accepted invalid case {name}"));
            assert!(
                ["archive_invalid", "archive_limit"].contains(&error.code.as_str()),
                "unexpected error for {name}: {}",
                error.message
            );
            assert_eq!(snapshot(&store), before, "changed workspace for {name}");
            drop(store);
            assert_eq!(
                snapshot(&Store::open(&f.root).unwrap()),
                before,
                "changed reopened workspace for {name}"
            );
            eprintln!("public archive corpus: {name}: rejected; workspace/files/settings/reopen unchanged");
        } else {
            result.unwrap_or_else(|e| panic!("rejected valid case {name}: {}", e.message));
            let imported_id = archive["notes"][0]["id"].as_str().unwrap();
            assert_eq!(
                store.note(imported_id).unwrap().document,
                document,
                "rewrote {name}"
            );
            for old in before.0["notes"].as_array().unwrap() {
                assert_eq!(
                    serde_json::to_value(store.note(old["id"].as_str().unwrap()).unwrap()).unwrap(),
                    *old
                );
            }
            for (file, bytes) in &before.1 {
                assert_eq!(&files(&f.root)[file], bytes, "changed old bytes for {name}");
            }
            let after = snapshot(&store);
            let backup = f._temp.path().join("roundtrip.notesbackup");
            store.export_archive(&backup).unwrap();
            let mut fresh = Store::open(f._temp.path().join("roundtrip")).unwrap();
            fresh.import_archive(&backup).unwrap();
            assert_eq!(
                semantic_workspace(fresh.workspace().unwrap()),
                semantic_workspace(after.0.clone()),
                "roundtrip changed entities for {name}"
            );
            for attachment in store.attachments().unwrap() {
                assert_eq!(
                    fresh.read_attachment(&attachment.id).unwrap(),
                    store.read_attachment(&attachment.id).unwrap()
                );
            }
            drop(store);
            assert_eq!(snapshot(&Store::open(&f.root).unwrap()), after);
            eprintln!("public archive corpus: {name}: accepted; document unchanged; export/import/bytes/reopen preserved");
        }
        assert_eq!(
            fs::read(&path).unwrap(),
            source_bytes,
            "source changed for {name}"
        );
        assert_clean(&f.root);
    }
}

#[test]
fn seven_papers_and_dash_lists_preserve_drawings_through_save_reopen_and_archive() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("source");
    let mut store = Store::open(&root).unwrap();
    let doc = json!({"type":"doc","content":[{"type":"bulletList","attrs":{"listStyle":"dash"},"content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"短划线"}]}]}]},{"type":"drawing","attrs":{"strokes":[{"tool":"pen","color":"#123456","width":3,"points":[[1,2],[3,4]]}]}}]});
    let papers = [
        "plain",
        "lines-small",
        "lines-medium",
        "lines-large",
        "grid-small",
        "grid-medium",
        "grid-large",
    ];
    let mut ids = Vec::new();
    for paper in papers {
        let note = store.action(json!({"type":"createNote"})).unwrap();
        store
            .action(json!({"type":"saveNote","id":note["id"],"revision":0,"document":doc}))
            .unwrap();
        store
            .action(json!({"type":"patchNote","id":note["id"],"paperStyle":paper}))
            .unwrap();
        ids.push((note["id"].as_str().unwrap().to_owned(), paper));
    }
    drop(store);
    let store = Store::open(&root).unwrap();
    let archive = temp.path().join("papers.notesbackup");
    store.export_archive(&archive).unwrap();
    let mut fresh = Store::open(temp.path().join("target")).unwrap();
    fresh.import_archive(&archive).unwrap();
    drop(fresh);
    let fresh = Store::open(temp.path().join("target")).unwrap();
    for (id, paper) in ids {
        assert_eq!(store.note(&id).unwrap().paper_style, paper);
        let imported = fresh.note(&id).unwrap();
        assert_eq!(imported.paper_style, paper);
        assert_eq!(imported.document, doc);
    }
}

#[test]
fn independent_schema_fixtures_are_rejected_and_legacy_archive_still_loads() {
    let invalid = [
        ("inline-at-doc-root", include_str!("../../../../docs/verification/qa-fix-00/schema-fixtures/inline-at-doc-root.notesbackup")),
        ("block-inside-paragraph", include_str!("../../../../docs/verification/qa-fix-00/schema-fixtures/block-inside-paragraph.notesbackup")),
        ("paragraph-inside-table", include_str!("../../../../docs/verification/qa-fix-00/schema-fixtures/paragraph-inside-table.notesbackup")),
    ];
    let f = fixture();
    let mut store = populate_local(&f.root);
    let before = snapshot(&store);
    for (name, fixture) in invalid {
        let path = f._temp.path().join(format!("{name}.notesbackup"));
        fs::write(&path, fixture).unwrap();
        assert_eq!(
            store.import_archive(&path).unwrap_err().code,
            "archive_invalid"
        );
        assert_eq!(snapshot(&store), before);
        assert_eq!(fs::read_to_string(&path).unwrap(), fixture);
        assert_clean(&f.root);
    }
    drop(store);
    assert_eq!(snapshot(&Store::open(&f.root).unwrap()), before);
    let legacy = include_str!(
        "../../../../docs/verification/qa-001/store-probes/fixtures/valid.notesbackup"
    );
    let path = f._temp.path().join("legacy.notesbackup");
    fs::write(&path, legacy).unwrap();
    let mut store = Store::open(f._temp.path().join("legacy")).unwrap();
    store.import_archive(&path).unwrap();
    let expected: Value = serde_json::from_str(legacy).unwrap();
    let workspace = store.workspace().unwrap();
    assert_eq!(workspace["notes"], expected["notes"]);
    assert_eq!(workspace["settings"], expected["settings"]);
    let roundtrip = f._temp.path().join("legacy-roundtrip.notesbackup");
    store.export_archive(&roundtrip).unwrap();
    let mut fresh = Store::open(f._temp.path().join("legacy-roundtrip")).unwrap();
    fresh.import_archive(&roundtrip).unwrap();
    assert_eq!(
        semantic_workspace(fresh.workspace().unwrap()),
        semantic_workspace(workspace)
    );
    for attachment in store.attachments().unwrap() {
        assert_eq!(
            fresh.read_attachment(&attachment.id).unwrap(),
            store.read_attachment(&attachment.id).unwrap()
        );
    }
}

#[test]
#[ignore = "subprocess worker; invoked by real_subprocess_interruption_recovers_before_and_after_sqlite_commit"]
fn crash_worker() {
    let root = std::env::var_os("NOTES_TEST_ARCHIVE_ROOT").unwrap();
    let file = std::env::var_os("NOTES_TEST_ARCHIVE_FILE").unwrap();
    let mut store = Store::open(PathBuf::from(root)).unwrap();
    store.import_archive(&PathBuf::from(file)).unwrap();
    panic!("requested crash checkpoint was not reached");
}
