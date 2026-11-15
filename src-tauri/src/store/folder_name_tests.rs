use super::*;
use std::collections::BTreeMap;

fn files(root: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    fn collect(root: &Path, path: &Path, result: &mut BTreeMap<PathBuf, Vec<u8>>) {
        for entry in fs::read_dir(path).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                collect(root, &path, result);
            } else {
                result.insert(
                    path.strip_prefix(root).unwrap().into(),
                    fs::read(path).unwrap(),
                );
            }
        }
    }
    let mut result = BTreeMap::new();
    collect(root, root, &mut result);
    result
}

#[test]
fn ordinary_folder_name_utf8_boundaries_reject_before_write_and_cold_reopen() {
    for operation in ["createFolder", "renameFolder"] {
        for accepted in ["a".repeat(4096), format!("{}a", "中".repeat(1365))] {
            assert_eq!(accepted.len(), 4096);
            let temp = tempfile::tempdir().unwrap();
            let mut store = Store::open(temp.path()).unwrap();
            let original = store
                .action(json!({"type":"createFolder","name":"original"}))
                .unwrap();
            let note = store
                .action(json!({"type":"createNote","folderId":original["id"]}))
                .unwrap();
            let note_id = note["id"].as_str().unwrap();
            store
                .store_attachment(note_id, "kept.txt", "text/plain", b"kept".to_vec())
                .unwrap();
            store
                .action(json!({"type":"settings","settings":{"theme":"dark"}}))
                .unwrap();
            let response = store
                .action(json!({
                    "type":operation,"id":original["id"],"name":format!(" \t{accepted}\u{3000}\n")
                }))
                .unwrap();
            let folder_id = if operation == "createFolder" {
                response["id"].as_str().unwrap().to_owned()
            } else {
                original["id"].as_str().unwrap().to_owned()
            };
            assert_eq!(store.folder(&folder_id).unwrap().name, accepted);
            let accepted_workspace = store.workspace().unwrap();
            drop(store);
            let mut store = Store::open(temp.path()).unwrap();
            assert_eq!(store.workspace().unwrap(), accepted_workspace);

            for rejected in [
                "a".repeat(4097),
                format!("{}ab", "中".repeat(1365)),
                String::new(),
            ] {
                assert!(rejected.is_empty() || rejected.len() == 4097);
                let before = store.workspace().unwrap();
                let changes = store.db.total_changes();
                let bytes = files(temp.path());
                let error = store
                    .action(json!({
                        "type":operation,"id":folder_id,"name":format!(" \t{rejected}\u{3000}\n")
                    }))
                    .unwrap_err();
                assert_eq!(error.code, "invalid", "{operation}");
                assert_eq!(store.db.total_changes(), changes, "{operation} wrote SQL");
                assert_eq!(
                    files(temp.path()),
                    bytes,
                    "{operation} changed stored bytes"
                );
                assert_eq!(store.workspace().unwrap(), before);
                drop(store);
                store = Store::open(temp.path()).unwrap();
                assert_eq!(store.workspace().unwrap(), before);
                assert_eq!(store.folder(&folder_id).unwrap().name, accepted);
            }
        }
    }
}
