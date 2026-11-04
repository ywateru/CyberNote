//! Independent probes against production Store, without copying its evaluator.
use crate::store::Store;
use serde_json::{json, Value};
use std::{collections::HashSet, fs};

#[test]
fn independent_exact_tag_case_and_absent_selected_name_survive_reopen() {
    let temp = tempfile::tempdir().unwrap();
    let mut s = Store::open(temp.path()).unwrap();
    let n = s.action(json!({"type":"createNote"})).unwrap()["id"].as_str().unwrap().to_string();
    s.action(json!({"type":"saveNote","id":n,"revision":0,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"#Case #case","marks":[{"type":"noteTag","attrs":{"name":"Case"}}]}]}]}})).unwrap_err();
    s.action(json!({"type":"saveNote","id":n,"revision":0,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"#Case","marks":[{"type":"noteTag","attrs":{"name":"Case"}}]},{"type":"text","text":" plain #case"}]}]}})).unwrap();
    let mut pairs = Vec::new();
    for name in ["Case", "case", "Absent"] {
        let f = s.create_smart_folder(json!({"name":name,"query":{"version":1,"combine":"all","rules":[{"type":"tags","mode":"allSelected","names":[name]}]}})).unwrap();
        pairs.push((f.id, name == "Case"));
    }
    drop(s);
    let s = Store::open(temp.path()).unwrap();
    for (fid, expected) in pairs {
        let result = s.evaluate_smart_folder(&fid, &HashSet::new()).unwrap();
        assert_eq!(result.definition_revision, 1);
        assert_eq!(result.ids, if expected {vec![n.clone()]} else {vec![]});
    }
}

#[test]
fn independent_archive_three_nested_parent_and_deleted_original_collision_mapping() {
    let temp = tempfile::tempdir().unwrap();
    let mut source = Store::open(temp.path().join("source")).unwrap();
    let parent = source.action(json!({"type":"createFolder","name":"parent"})).unwrap()["id"].as_str().unwrap().to_string();
    let child = source.action(json!({"type":"createFolder","name":"child","parentId":parent})).unwrap()["id"].as_str().unwrap().to_string();
    let n = source.action(json!({"type":"createNote","folderId":child})).unwrap()["id"].as_str().unwrap().to_string();
    source.action(json!({"type":"deleteNote","id":n})).unwrap();
    source.create_smart_folder(json!({"name":"smart","query":{"version":1,"combine":"all","rules":[{"type":"pinned","value":false}]}})).unwrap();
    let archive = temp.path().join("nested.notesbackup");
    source.export_archive(&archive).unwrap();
    assert_eq!(serde_json::from_slice::<Value>(&fs::read(&archive).unwrap()).unwrap()["version"], 3);
    let mut target = Store::open(temp.path().join("target")).unwrap();
    let mut prior = HashSet::<String>::new();
    let mut copies = Vec::new();
    for _ in 0..2 {
        target.import_archive(&archive).unwrap();
        let w = target.workspace().unwrap();
        let fresh: Vec<_> = w["folders"].as_array().unwrap().iter().filter(|f| f["kind"] == "normal" && !prior.contains(f["id"].as_str().unwrap())).collect();
        assert_eq!(fresh.len(), 2);
        let p = fresh.iter().find(|f| f["name"] == "parent").unwrap()["id"].as_str().unwrap().to_string();
        let c = fresh.iter().find(|f| f["name"] == "child").unwrap()["id"].as_str().unwrap().to_string();
        assert_eq!(fresh.iter().find(|f| f["name"] == "child").unwrap()["parentId"], p);
        let deleted = w["notes"].as_array().unwrap().iter().find(|x| x["originalFolderId"] == c).unwrap();
        assert_eq!(deleted["folderId"], "trash");
        assert!(deleted["deletedAt"].is_number());
        let nid = deleted["id"].as_str().unwrap().to_string();
        target.action(json!({"type":"restoreNote","id":nid})).unwrap();
        assert_eq!(target.note(&nid).unwrap().folder_id, c);
        prior.insert(p.clone()); prior.insert(c.clone()); copies.push((p,c,nid));
    }
    assert_ne!(copies[0].0, copies[1].0);
    assert_ne!(copies[0].1, copies[1].1);
    assert_ne!(copies[0].2, copies[1].2);
    drop(target);
    assert_eq!(Store::open(temp.path().join("target")).unwrap().workspace().unwrap()["notes"].as_array().unwrap().len(), 2);
}
