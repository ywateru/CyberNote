//! U replaces the temporary D2/O renderer gate with real ordinary Session paths.
//! Old gate assertions and execution evidence remain in prior commits.
use super::*;
fn token(s: &Session, note: Option<&str>) -> Token {
    Token {
        session_id: s.id.clone(),
        epoch: s.epoch,
        note_epoch: note.map(|id| s.note_epoch(id)),
    }
}
fn query() -> Value {
    json!({"version":1,"combine":"all","rules":[{"type":"pinned","value":true}]})
}
fn create(s: &mut Session, name: &str) -> Value {
    s.ordinary(
        json!({"type":"createSmartFolder","input":{"name":name,"query":query()}}),
        &token(s, None),
    )
    .unwrap()
    .0
}

#[test]
fn public_smart_crud_cas_and_physical_ownership_are_one_session() {
    let temp = tempfile::tempdir().unwrap();
    let mut s = Session::new(Store::open(temp.path()).unwrap());
    let n = s
        .ordinary(json!({"type":"createNote"}), &token(&s, None))
        .unwrap()
        .0;
    let id = n["id"].as_str().unwrap();
    let f = create(&mut s, "真实智能");
    let fid = f["id"].as_str().unwrap();
    assert_eq!(f["receipt"]["createdId"], fid);
    assert!(s.workspace().unwrap()["folders"]
        .as_array()
        .unwrap()
        .iter()
        .any(|f| f["id"] == fid));
    let access = token(&s, Some(id));
    s.register_save("main", id, "save-with-smart", access)
        .unwrap();
    s.save("main",json!({"type":"saveNote","id":id,"saveIntent":"save-with-smart","revision":0,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"原物理正文"}]}]}})).unwrap();
    s.ordinary(
        json!({"type":"patchNote","id":id,"pinned":true}),
        &token(&s, None),
    )
    .unwrap();
    assert_eq!(
        s.smart_projection(fid, &token(&s, None)).unwrap()["ids"],
        json!([id])
    );
    for a in [
        json!({"type":"createNote","folderId":fid}),
        json!({"type":"patchNote","id":id,"folderId":fid}),
        json!({"type":"createFolder","name":"child","parentId":fid}),
    ] {
        assert_eq!(
            s.ordinary(a, &token(&s, None)).unwrap_err().code,
            "folder_capability"
        );
    }
    assert!(s
        .ordinary(
            json!({"type":"renameFolder","id":fid,"name":"bypass"}),
            &token(&s, None)
        )
        .is_err());
    let before = s.metadata();
    let updated=s.ordinary(json!({"type":"updateSmartFolder","input":{"id":fid,"name":"CAS winner","query":query(),"expectedDefinitionRevision":1}}),&token(&s,None)).unwrap().0;
    assert_eq!(updated["definitionRevision"], 2);
    assert!(s.metadata()["sequence"].as_u64().unwrap() > before["sequence"].as_u64().unwrap());
    assert_eq!(s.ordinary(json!({"type":"updateSmartFolder","input":{"id":fid,"name":"stale","query":query(),"expectedDefinitionRevision":1}}),&token(&s,None)).unwrap_err().code,"smart_conflict");
    s.ordinary(
        json!({"type":"deleteSmartFolder","input":{"id":fid,"expectedDefinitionRevision":2}}),
        &token(&s, None),
    )
    .unwrap();
    let original = s.store.note(id).unwrap();
    assert_eq!(original.folder_id, "default");
    assert!(original.deleted_at.is_none());
    assert!(original.plain_text.contains("原物理正文"));
    assert!(s.pending.is_none());
}

#[test]
fn smart_archive_public_import_restart_and_replaced_invalid_bytes() {
    let temp = tempfile::tempdir().unwrap();
    let mut source = Session::new(Store::open(temp.path().join("source")).unwrap());
    let f = create(&mut source, "归档智能");
    source
        .ordinary(
            json!({"type":"settings","settings":{"selectedFolder":f["id"]}}),
            &token(&source, None),
        )
        .unwrap();
    let path = temp.path().join("source.notesbackup");
    source.export_archive(&path, &token(&source, None)).unwrap();
    assert_eq!(
        serde_json::from_slice::<Value>(&std::fs::read(&path).unwrap()).unwrap()["version"],
        3
    );
    let root = temp.path().join("target");
    let mut target = Session::new(Store::open(&root).unwrap());
    let prepare = target
        .begin(
            json!({"type":"importArchive","path":path}),
            HashSet::new(),
            &token(&target, None),
        )
        .unwrap();
    let (result, event) = target
        .finish(
            prepare["operationId"].as_str().unwrap(),
            &HashSet::new(),
            false,
        )
        .unwrap();
    let ws = result.unwrap();
    assert_eq!(event["phase"], "commit");
    assert!(ws["folders"]
        .as_array()
        .unwrap()
        .iter()
        .any(|x| x["kind"] == "smart"));
    drop(target);
    let mut target = Session::new(Store::open(&root).unwrap());
    assert_eq!(
        target.workspace().unwrap()["settings"]["selectedFolder"],
        f["id"]
    );
    let before = target.workspace().unwrap();
    let p = target
        .begin(
            json!({"type":"importArchive","path":path}),
            HashSet::new(),
            &token(&target, None),
        )
        .unwrap();
    let mut invalid: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    invalid["folders"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|x| x["kind"] == "smart")
        .unwrap()["query"]["version"] = json!(999);
    std::fs::write(&path, serde_json::to_vec(&invalid).unwrap()).unwrap();
    let (result, event) = target
        .finish(p["operationId"].as_str().unwrap(), &HashSet::new(), false)
        .unwrap();
    assert!(result.is_err());
    assert_eq!(event["phase"], "abort");
    assert_eq!(target.workspace().unwrap(), before);
}
