//! Minimal regression reproduction: successful public writes must remain openable.
use crate::store::Store;
use serde_json::json;

#[test]
fn independent_successful_ordinary_folder_writes_must_not_make_database_unopenable() {
    let mut failures = Vec::new();
    for operation in ["createFolder", "renameFolder"] {
        let temp = tempfile::tempdir().unwrap();
        let mut s = Store::open(temp.path()).unwrap();
        let action = if operation == "createFolder" {
            json!({"type":"createFolder","name":"a".repeat(4097)})
        } else {
            let f = s.action(json!({"type":"createFolder","name":"ordinary"})).unwrap();
            json!({"type":"renameFolder","id":f["id"],"name":"a".repeat(4097)})
        };
        let write = s.action(action);
        let write_accepted = write.is_ok();
        drop(s);
        let reopen = Store::open(temp.path());
        let reopen_error = reopen.err().map(|e| e.code);
        println!("{operation}: successfulWrite={write_accepted}, reopenError={reopen_error:?}");
        if write_accepted && reopen_error.is_some() { failures.push(operation); }
    }
    assert!(failures.is_empty(), "successful ordinary writes made local database unopenable: {failures:?}");
}
