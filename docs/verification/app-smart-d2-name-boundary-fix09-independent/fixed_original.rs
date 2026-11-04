//! Corrected expectations for the original independent create/rename counterexample.
use crate::store::Store;
use serde_json::json;
use std::{collections::BTreeMap, fs, path::{Path,PathBuf}};

fn bytes(root: &Path) -> BTreeMap<PathBuf,Vec<u8>> {
    fn collect(root:&Path,p:&Path,result:&mut BTreeMap<PathBuf,Vec<u8>>) {
        for item in fs::read_dir(p).unwrap() {
            let p=item.unwrap().path();
            if p.is_dir() { collect(root,&p,result); }
            else { result.insert(p.strip_prefix(root).unwrap().into(),fs::read(p).unwrap()); }
        }
    }
    let mut result=BTreeMap::new();collect(root,root,&mut result);result
}

#[test]
fn fixed_original_folder_name_4097_create_and_rename_reject_and_remain_openable() {
    for operation in ["createFolder", "renameFolder"] {
        let temp = tempfile::tempdir().unwrap();
        let mut s = Store::open(temp.path()).unwrap();
        let action = if operation == "createFolder" {
            json!({"type":"createFolder","name":"a".repeat(4097)})
        } else {
            let f = s.action(json!({"type":"createFolder","name":"ordinary"})).unwrap();
            json!({"type":"renameFolder","id":f["id"],"name":"a".repeat(4097)})
        };
        let before=s.workspace().unwrap();
        let files=bytes(temp.path());
        let error=s.action(action).unwrap_err();
        assert_eq!(error.code,"invalid");
        assert_eq!(s.workspace().unwrap(),before);
        assert_eq!(bytes(temp.path()),files,"{operation} changed stored bytes");
        drop(s);
        let s=Store::open(temp.path()).unwrap();
        assert_eq!(s.workspace().unwrap(),before);
        println!("{operation}: rejected invalid; workspace/files unchanged; cold reopen unchanged");
    }
}
