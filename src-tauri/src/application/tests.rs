use super::*;
use crate::{
    agent_access::{Revocation, TrustedContext},
    store::Store,
};
pub(crate) fn setup() -> (tempfile::TempDir, Session, TrustedContext, Revocation) {
    let root = tempfile::tempdir().unwrap();
    let session = Session::new(Store::open(root.path()).unwrap());
    let (ctx, revoke) = grant(
        &session,
        "client",
        &["notes:read", "notes:create", "notes:update"],
        &["default"],
    );
    (root, session, ctx, revoke)
}
fn grant(
    s: &Session,
    client: &str,
    scopes: &[&str],
    folders: &[&str],
) -> (TrustedContext, Revocation) {
    let (w, i) = s.store.application_identity().unwrap();
    TrustedContext::from_verified_grant(
        client.into(),
        format!("grant-{client}"),
        w,
        i,
        scopes.iter().map(|s| s.to_string()).collect(),
        folders.iter().map(|s| s.to_string()).collect(),
        now() + 600_000,
        1,
    )
    .unwrap()
}
fn live() -> HashSet<String> {
    HashSet::from(["main".into(), "note-test".into()])
}
fn token(s: &Session, note: Option<&str>) -> Token {
    let snapshot = s.snapshot().unwrap();
    Token {
        session_id: snapshot["sessionId"].as_str().unwrap().into(),
        epoch: snapshot["epoch"].as_u64().unwrap(),
        note_epoch: note.map(|id| snapshot["notes"][id]["epoch"].as_u64().unwrap()),
    }
}
fn start(s: &mut Session, ctx: &TrustedContext, tool: &str, args: Value) -> ToolResult<String> {
    match NotesApplicationService::new(s).external_write(ctx, tool, args, live())? {
        ExternalStart::Probe {
            operation_id,
            event,
        } => {
            assert_eq!(event["phase"], "probe");
            Ok(operation_id)
        }
        ExternalStart::Replay(_) => panic!("expected probe"),
    }
}
fn prepare(s: &mut Session, id: &str) {
    let t = token(s, None);
    for window in live() {
        s.external_reply(
            &window,
            WindowReply::Probe {
                operation_id: id.into(),
                protected_note_ids: vec![],
                unsaved_note_ids: vec![],
                blocked: false,
            },
            &t,
            &live(),
        )
        .unwrap();
    }
    match s.external_tick(id, &live()) {
        ExternalProgress::Event(v) => assert_eq!(v["phase"], "prepare"),
        _ => panic!("prepare expected"),
    }
    for window in live() {
        s.external_reply(
            &window,
            WindowReply::Prepare {
                operation_id: id.into(),
                ready: true,
            },
            &t,
            &live(),
        )
        .unwrap();
    }
}
fn commit(
    s: &mut Session,
    ctx: &TrustedContext,
    tool: &str,
    args: Value,
) -> ToolResult<MutationResult> {
    let id = match NotesApplicationService::new(s).external_write(ctx, tool, args, live())? {
        ExternalStart::Replay(r) => return Ok(r),
        ExternalStart::Probe { operation_id, .. } => operation_id,
    };
    prepare(s, &id);
    match s.external_tick(&id, &live()) {
        ExternalProgress::Committed { result, release } => {
            assert_eq!(release["outcome"], "commit");
            Ok(result)
        }
        ExternalProgress::Aborted { error, release } => {
            assert_eq!(release["outcome"], "abort");
            Err(error)
        }
        _ => panic!("commit expected"),
    }
}
fn create_args(text: &str) -> Value {
    json!({"folderId":"default","format":"text","content":text,"idempotencyKey":Uuid::new_v4().to_string()})
}
fn create(s: &mut Session, c: &TrustedContext, text: &str) -> MutationResult {
    commit(s, c, "notes_create", create_args(text)).unwrap()
}
fn query(s: &mut Session, c: &TrustedContext, tool: &str, args: Value) -> ToolResult<Value> {
    NotesApplicationService::new(s).query(c, tool, args)
}
fn append_args(r: &MutationResult, text: &str) -> Value {
    json!({"noteId":r.note_id,"expectedVersion":r.committed_version,"text":text,"idempotencyKey":Uuid::new_v4().to_string()})
}

#[test]
fn atomic_create_schema_validation_metadata_and_sync_dirty() {
    let (d, mut s, c, _) = setup();
    s.store.sync_enable(None).unwrap();
    s.store.sync_flush().unwrap();
    let r = create(&mut s, &c, "你好\n世界");
    let note = s.store.note(&r.note_id).unwrap();
    assert_eq!(note.title, "你好");
    assert_eq!(note.revision, 1);
    assert_eq!(note.plain_text, "你好\n世界");
    let event = s.take_metadata_event().unwrap();
    assert_eq!(event["changes"][0]["id"], r.note_id);
    let db = rusqlite::Connection::open(d.path().join("notes.sqlite3")).unwrap();
    let dirty: i64 = db
        .query_row(
            "SELECT count(*) FROM sync_dirty WHERE entity_id=?1",
            [&r.note_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(dirty, 1);
    let args = json!({"folderId":"default","format":"document","content":{"type":"doc","content":[{"type":"unknown"}]},"idempotencyKey":Uuid::new_v4().to_string()});
    assert_eq!(
        commit(&mut s, &c, "notes_create", args).unwrap_err().code,
        "SCHEMA_INVALID"
    );
    assert_eq!(s.store.notes().unwrap().len(), 1);
    assert!(s.take_metadata_event().is_none());
}
#[test]
fn sqlite_failure_rolls_back_complete_note_operation_dirty_and_receipt() {
    let (d, mut s, c, _) = setup();
    s.store.sync_enable(None).unwrap();
    s.store.sync_flush().unwrap();
    let db = rusqlite::Connection::open(d.path().join("notes.sqlite3")).unwrap();
    db.execute_batch("CREATE TRIGGER fail111 BEFORE INSERT ON application_operations BEGIN SELECT RAISE(ABORT,'injected failure'); END").unwrap();
    let args = create_args("no orphan");
    let error = commit(&mut s, &c, "notes_create", args.clone()).unwrap_err();
    assert_eq!(error.code, "STORAGE_ERROR");
    assert_eq!(error.committed, Some(false));
    assert!(s.store.notes().unwrap().is_empty());
    assert!(s.take_metadata_event().is_none());
    for table in ["application_operations", "sync_dirty"] {
        assert_eq!(
            db.query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
    db.execute_batch("DROP TRIGGER fail111").unwrap();
    assert!(commit(&mut s, &c, "notes_create", args).is_ok());
}
#[test]
fn restart_replay_original_receipt_no_second_write_and_operation_without_read_scope() {
    let (d, mut s, _, _) = setup();
    let (c, _) = grant(&s, "create-only", &["notes:create"], &["default"]);
    let args = create_args("original");
    let r = commit(&mut s, &c, "notes_create", args.clone()).unwrap();
    let t = token(&s, None);
    s.ordinary(json!({"type":"patchNote","id":r.note_id,"pinned":true}), &t)
        .unwrap();
    drop(s);
    let mut s = Session::new(Store::open(d.path()).unwrap());
    let replay = commit(&mut s, &c, "notes_create", args.clone()).unwrap();
    assert_eq!(
        serde_json::to_value(&replay).unwrap(),
        serde_json::to_value(&r).unwrap()
    );
    assert_eq!(s.store.notes().unwrap().len(), 1);
    assert_eq!(
        query(&mut s, &c, "notes_read", json!({"noteId":r.note_id}))
            .unwrap_err()
            .code,
        "FORBIDDEN"
    );
    assert_eq!(
        query(
            &mut s,
            &c,
            "notes_get_operation",
            json!({"operationId":r.operation_id})
        )
        .unwrap()["committedVersion"],
        r.committed_version
    );
    let mut other = args;
    other["content"] = json!("changed");
    assert_eq!(
        commit(&mut s, &c, "notes_create", other).unwrap_err().code,
        "IDEMPOTENCY_CONFLICT"
    );
}
#[test]
fn replay_rechecks_revocation_scope_grant_current_folder_and_locked_note() {
    let (_d, mut s, c, revoke) = setup();
    let args = create_args("private");
    let r = commit(&mut s, &c, "notes_create", args.clone()).unwrap();
    let mut no_scope = c.clone();
    no_scope.scopes.clear();
    assert_eq!(
        commit(&mut s, &no_scope, "notes_create", args.clone())
            .unwrap_err()
            .code,
        "FORBIDDEN"
    );
    let mut other_grant = c.clone();
    other_grant.grant_id = "other".into();
    assert_eq!(
        query(
            &mut s,
            &other_grant,
            "notes_get_operation",
            json!({"operationId":r.operation_id})
        )
        .unwrap_err()
        .code,
        "NOT_FOUND"
    );
    let t = token(&s, None);
    s.ordinary(
        json!({"type":"patchNote","id":r.note_id,"folderId":"quick"}),
        &t,
    )
    .unwrap();
    assert_eq!(
        commit(&mut s, &c, "notes_create", args).unwrap_err().code,
        "NOT_FOUND"
    );
    revoke.revoke();
    assert_eq!(
        query(&mut s, &c, "notes_get_capabilities", json!({}))
            .unwrap_err()
            .code,
        "UNAUTHORIZED"
    );
}
#[test]
fn query_filters_scope_locked_trash_and_literal_nfkc_chinese_tags() {
    let (_d, mut s, c, _) = setup();
    let a = create(&mut s, &c, "ＡＢＣ\n今天中文测试%_");
    let other = s
        .store
        .action(json!({"type":"createNote","folderId":"quick"}))
        .unwrap();
    s.store.action(json!({"type":"saveNote","id":other["id"],"revision":0,"document":text_document("范围外秘密")})).unwrap();
    let locked = create(&mut s, &c, "锁定秘密");
    s.store
        .action(json!({"type":"lockNote","id":locked.note_id,"password":"111-test-password"}))
        .unwrap();
    s.store
        .action(json!({"type":"unlockNote","id":locked.note_id,"password":"111-test-password"}))
        .unwrap();
    let deleted = create(&mut s, &c, "垃圾秘密");
    s.store
        .action(json!({"type":"deleteNote","id":deleted.note_id}))
        .unwrap();
    let list = query(&mut s, &c, "notes_list", json!({})).unwrap();
    assert_eq!(list["items"].as_array().unwrap().len(), 1);
    assert_eq!(list["items"][0]["id"], a.note_id);
    for id in [
        other["id"].as_str().unwrap(),
        &locked.note_id,
        &deleted.note_id,
        "missing",
    ] {
        assert_eq!(
            query(&mut s, &c, "notes_read", json!({"noteId":id}))
                .unwrap_err()
                .code,
            "NOT_FOUND"
        );
    }
    for needle in ["abc", "中文测", "%_"] {
        assert_eq!(
            query(&mut s, &c, "notes_search", json!({"query":needle})).unwrap()["items"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }
    assert!(
        query(&mut s, &c, "notes_search", json!({"query":".*"})).unwrap()["items"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert!(query(
        &mut s,
        &c,
        "notes_search",
        json!({"query":"中文","tags":["missing"]})
    )
    .unwrap()["items"]
        .as_array()
        .unwrap()
        .is_empty());
    let serialized = list.to_string();
    for private in [
        "document",
        "sealed",
        "relativePath",
        "sessionId",
        "plainText",
    ] {
        assert!(!serialized.contains(private));
    }
}
#[test]
fn stable_tied_sort_pagination_expires_on_change_restart_and_query_mismatch() {
    let (d, mut s, c, _) = setup();
    for _ in 0..5 {
        create(&mut s, &c, "same");
    }
    let first = query(&mut s, &c, "notes_list", json!({"sort":"title","limit":2})).unwrap();
    let cursor = first["nextCursor"].clone();
    let second = query(
        &mut s,
        &c,
        "notes_list",
        json!({"sort":"title","limit":2,"cursor":cursor}),
    )
    .unwrap();
    let third = query(
        &mut s,
        &c,
        "notes_list",
        json!({"sort":"title","limit":2,"cursor":second["nextCursor"]}),
    )
    .unwrap();
    let mut ids = vec![];
    for page in [&first, &second, &third] {
        ids.extend(
            page["items"]
                .as_array()
                .unwrap()
                .iter()
                .map(|n| n["id"].as_str().unwrap().to_string()),
        );
    }
    let mut sorted = ids.clone();
    sorted.sort();
    sorted.dedup();
    assert_eq!(sorted.len(), 5);
    assert_eq!(sorted, ids);
    assert_eq!(
        query(
            &mut s,
            &c,
            "notes_list",
            json!({"sort":"updated","limit":2,"cursor":cursor})
        )
        .unwrap_err()
        .code,
        "CURSOR_EXPIRED"
    );
    create(&mut s, &c, "mutation");
    assert_eq!(
        query(
            &mut s,
            &c,
            "notes_list",
            json!({"sort":"title","limit":2,"cursor":cursor})
        )
        .unwrap_err()
        .code,
        "CURSOR_EXPIRED"
    );
    drop(s);
    let mut s = Session::new(Store::open(d.path()).unwrap());
    assert_eq!(
        query(
            &mut s,
            &c,
            "notes_list",
            json!({"sort":"title","limit":2,"cursor":cursor})
        )
        .unwrap_err()
        .code,
        "CURSOR_EXPIRED"
    );
}
#[test]
fn text_pages_are_utf8_bounded_and_bind_version() {
    let (_d, mut s, c, _) = setup();
    let text = "中文🙂".repeat(9000);
    let r = create(&mut s, &c, &text);
    let mut content = String::new();
    let mut cursor = Value::Null;
    let mut first_cursor = None;
    loop {
        let mut args = json!({"noteId":r.note_id});
        if !cursor.is_null() {
            args["contentCursor"] = cursor;
        }
        let page = query(&mut s, &c, "notes_read", args).unwrap();
        let text = page["content"].as_str().unwrap();
        assert!(text.len() <= 32768);
        content.push_str(text);
        cursor = page["nextContentCursor"].clone();
        if first_cursor.is_none() {
            first_cursor = Some(cursor.clone());
        }
        if cursor.is_null() {
            break;
        }
    }
    assert_eq!(content, text);
    commit(&mut s, &c, "notes_append", append_args(&r, "changed")).unwrap();
    assert_eq!(
        query(
            &mut s,
            &c,
            "notes_read",
            json!({"noteId":r.note_id,"contentCursor":first_cursor.unwrap()})
        )
        .unwrap_err()
        .code,
        "CURSOR_EXPIRED"
    );
}
#[test]
fn complex_lossy_replacement_rejected_and_append_preserves_link_and_attachment() {
    let (_d, mut s, c, _) = setup();
    let r = create(&mut s, &c, "title");
    let attachment = s
        .store
        .store_attachment(&r.note_id, "kept.txt", "text/plain", b"kept".to_vec())
        .unwrap();
    let doc = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"linked","marks":[{"type":"link","attrs":{"href":"https://example.com"}}]}]},{"type":"attachment","attrs":{"id":attachment.id,"name":"kept.txt","kind":"file"}}]});
    s.store
        .action(json!({"type":"saveNote","id":r.note_id,"revision":1,"document":doc}))
        .unwrap();
    let read = query(&mut s, &c, "notes_read", json!({"noteId":r.note_id})).unwrap();
    assert_eq!(read["attachmentCount"], 1);
    assert!(read["content"].as_str().unwrap().contains("[link:"));
    assert!(read["content"].as_str().unwrap().contains("[attachment:"));
    let version = read["version"].as_str().unwrap();
    let update = json!({"noteId":r.note_id,"expectedVersion":version,"format":"text","content":"lossy","idempotencyKey":Uuid::new_v4().to_string()});
    assert_eq!(
        commit(&mut s, &c, "notes_update", update).unwrap_err().code,
        "LOSSY_REPLACEMENT"
    );
    let args = json!({"noteId":r.note_id,"expectedVersion":version,"text":"追加","idempotencyKey":Uuid::new_v4().to_string()});
    let appended = commit(&mut s, &c, "notes_append", args).unwrap();
    let new = s.store.note(&r.note_id).unwrap();
    assert_eq!(new.document["content"][0], doc["content"][0]);
    assert_eq!(new.document["content"][1], doc["content"][1]);
    let remove = json!({"noteId":r.note_id,"expectedVersion":appended.committed_version,"format":"document","content":text_document("remove attachment"),"idempotencyKey":Uuid::new_v4().to_string()});
    assert_eq!(
        commit(&mut s, &c, "notes_update", remove).unwrap_err().code,
        "SCHEMA_INVALID"
    );
    assert_eq!(
        s.store.note(&r.note_id).unwrap().revision,
        appended.committed_revision
    );
}
#[test]
fn strict_arguments_bounds_and_virtual_folder_rejection() {
    let (_d, mut s, c, _) = setup();
    for (tool, args) in [
        ("notes_list", json!({"limit":101})),
        ("notes_list", json!({"unknown":true})),
        ("notes_search", json!({"query":""})),
        ("notes_get_capabilities", json!({"token":"fake"})),
        ("notes_read", json!({"noteId":"x","format":"html"})),
    ] {
        assert_eq!(
            query(&mut s, &c, tool, args).unwrap_err().code,
            "SCHEMA_INVALID"
        );
    }
    for args in [
        json!({"folderId":"default","format":"text","content":"body","idempotencyKey":"bad"}),
        json!({"folderId":"default","format":"text","content":"body","idempotencyKey":Uuid::new_v4().to_string(),"title":"fake"}),
    ] {
        assert_eq!(
            Mutation::parse("notes_create", args).unwrap_err().code,
            "SCHEMA_INVALID"
        );
    }
    assert_eq!(
        Mutation::parse("notes_create", create_args(&"a".repeat(MAX_CONTENT + 1)))
            .unwrap_err()
            .code,
        "CONTENT_TOO_LARGE"
    );
    let mut doc = json!({"type":"paragraph"});
    for _ in 0..65 {
        doc = json!({"type":"blockquote","content":[doc]});
    }
    assert_eq!(
        input_document(&Format::Document, &doc).unwrap_err().code,
        "SCHEMA_INVALID"
    );
    let mut trash = c.clone();
    trash.folder_ids.insert("trash".into());
    let mut args = create_args("bad");
    args["folderId"] = json!("trash");
    assert_eq!(
        start(&mut s, &trash, "notes_create", args)
            .unwrap_err()
            .code,
        "SCHEMA_INVALID"
    );
}
#[test]
fn external_probe_rejects_active_unsaved_and_wrong_participant_without_writing() {
    for unsaved in [false, true] {
        let (_d, mut s, c, _) = setup();
        let r = create(&mut s, &c, "old");
        let id = start(&mut s, &c, "notes_append", append_args(&r, "new")).unwrap();
        let t = token(&s, None);
        let reply = WindowReply::Probe {
            operation_id: id.clone(),
            protected_note_ids: if unsaved {
                vec![]
            } else {
                vec![r.note_id.clone()]
            },
            unsaved_note_ids: if unsaved {
                vec![r.note_id.clone()]
            } else {
                vec![]
            },
            blocked: false,
        };
        assert_eq!(
            s.external_reply("fake", reply.clone(), &t, &live())
                .unwrap_err()
                .code,
            "UNAUTHORIZED"
        );
        assert_eq!(
            s.external_reply("main", reply, &t, &live()).unwrap()["outcome"],
            "abort"
        );
        match s.external_tick(&id, &live()) {
            ExternalProgress::Aborted { error, .. } => assert_eq!(error.code, "NOTE_BUSY"),
            _ => panic!(),
        }
        assert_eq!(s.store.note(&r.note_id).unwrap().revision, 1);
    }
}
#[test]
fn final_save_intent_and_prepare_cancel_abort_keep_window_save_authority() {
    let (_d, mut s, c, _) = setup();
    let r = create(&mut s, &c, "old");
    let id = start(&mut s, &c, "notes_append", append_args(&r, "agent")).unwrap();
    prepare(&mut s, &id);
    let t = token(&s, Some(&r.note_id));
    s.register_save("main", &r.note_id, "real-save", t).unwrap();
    match s.external_tick(&id, &live()) {
        ExternalProgress::Aborted { error, .. } => assert_eq!(error.code, "NOTE_BUSY"),
        _ => panic!(),
    }
    let saved=NotesApplicationService::new(&mut s).ui_save("main",json!({"type":"saveNote","id":r.note_id,"saveIntent":"real-save","revision":1,"document":text_document("user wins")})).unwrap();
    assert_eq!(saved["plainText"], "user wins");
    assert!(saved["receipt"]["changes"].as_array().unwrap().len() > 0);
    let v =
        query(&mut s, &c, "notes_read", json!({"noteId":r.note_id})).unwrap()["version"].clone();
    let id=start(&mut s,&c,"notes_append",json!({"noteId":r.note_id,"expectedVersion":v,"text":"agent","idempotencyKey":Uuid::new_v4().to_string()})).unwrap();
    prepare(&mut s, &id);
    let t = token(&s, None);
    assert_eq!(
        s.external_reply(
            "main",
            WindowReply::Prepare {
                operation_id: id.clone(),
                ready: false
            },
            &t,
            &live()
        )
        .unwrap()["outcome"],
        "abort"
    );
    assert!(matches!(
        s.external_tick(&id, &live()),
        ExternalProgress::Aborted { .. }
    ));
}
#[test]
fn barriers_sync_and_external_reservations_are_mutually_exclusive() {
    let (_d, mut s, c, _) = setup();
    let r = create(&mut s, &c, "old");
    let id = start(&mut s, &c, "notes_append", append_args(&r, "agent")).unwrap();
    let t = token(&s, None);
    assert!(s
        .begin(json!({"type":"deleteNote","id":r.note_id}), live(), &t)
        .is_err());
    assert!(s.sync_begin(live(), None).is_err());
    s.external_abort(&id).unwrap();
    let barrier = s
        .begin(json!({"type":"deleteNote","id":r.note_id}), live(), &t)
        .unwrap();
    assert_eq!(
        start(&mut s, &c, "notes_append", append_args(&r, "agent"))
            .unwrap_err()
            .code,
        "BARRIER_BUSY"
    );
    for w in live() {
        s.acknowledge(barrier["operationId"].as_str().unwrap(), &w, false)
            .unwrap();
    }
    let _ = s
        .finish(barrier["operationId"].as_str().unwrap(), &live(), false)
        .unwrap();
    s.sync_begin(live(), None).unwrap();
    assert_eq!(
        start(&mut s, &c, "notes_append", append_args(&r, "agent"))
            .unwrap_err()
            .code,
        "BARRIER_BUSY"
    );
}
#[test]
fn changed_windows_revoked_grant_and_stale_store_abort_without_mutation() {
    for case in 0..3 {
        let (_d, mut s, c, revoke) = setup();
        let r = create(&mut s, &c, "old");
        let id = start(&mut s, &c, "notes_append", append_args(&r, "new")).unwrap();
        prepare(&mut s, &id);
        let mut windows = live();
        match case {
            0 => {
                windows.insert("new-window".into());
            }
            1 => revoke.revoke(),
            _ => {
                let temp = tempfile::tempdir().unwrap();
                s.store = Store::open(temp.path()).unwrap();
            }
        }
        assert!(matches!(
            s.external_tick(&id, &windows),
            ExternalProgress::Aborted { .. }
        ));
        assert!(!s.external_has_operation());
    }
}
#[test]
fn two_clients_same_version_only_one_commit_and_replay_notification_failure() {
    let (_d, mut s, c, _) = setup();
    let r = create(&mut s, &c, "base");
    let (other, _) = grant(&s, "other", &["notes:update", "notes:read"], &["default"]);
    let shared = std::sync::Arc::new(std::sync::Mutex::new(s));
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(3));
    let mut workers = vec![];
    for ctx in [c.clone(), other] {
        let shared = shared.clone();
        let barrier = barrier.clone();
        let args = append_args(&r, "winner");
        workers.push(std::thread::spawn(move || {
            barrier.wait();
            commit(&mut shared.lock().unwrap(), &ctx, "notes_append", args)
        }));
    }
    barrier.wait();
    let outcomes: Vec<_> = workers.into_iter().map(|w| w.join().unwrap()).collect();
    assert_eq!(outcomes.iter().filter(|r| r.is_ok()).count(), 1);
    assert_eq!(
        outcomes.iter().find_map(|r| r.as_ref().err()).unwrap().code,
        "REVISION_CONFLICT"
    );
    let mut s = shared.lock().unwrap();
    assert_eq!(s.store.note(&r.note_id).unwrap().revision, 2);
    let args = create_args("committed before notification failure");
    let result = commit(&mut s, &c, "notes_create", args.clone()).unwrap();
    NotesApplicationService::new(&mut s)
        .notification_failed(&result.operation_id)
        .unwrap();
    let replay = commit(&mut s, &c, "notes_create", args).unwrap();
    assert_eq!(replay.committed_version, result.committed_version);
    assert_eq!(replay.warnings, vec!["WINDOW_REFRESH_REQUIRED"]);
    assert!(replay.committed);
}
#[test]
fn raw_database_clone_rotates_identity_and_rejects_old_context_and_versions() {
    let (d, mut s, c, _) = setup();
    create(&mut s, &c, "clone");
    let before = s.store.application_identity().unwrap();
    drop(s);
    let clone = tempfile::tempdir().unwrap();
    std::fs::copy(
        d.path().join("notes.sqlite3"),
        clone.path().join("notes.sqlite3"),
    )
    .unwrap();
    let mut copied = Session::new(Store::open(clone.path()).unwrap());
    assert_ne!(copied.store.application_identity().unwrap(), before);
    assert_eq!(copied.store.notes().unwrap().len(), 1);
    assert_eq!(
        query(&mut copied, &c, "notes_list", json!({}))
            .unwrap_err()
            .code,
        "WORKSPACE_UNAVAILABLE"
    );
}
#[test]
fn unsupported_extension_is_rejected_before_recovery_or_base_writes() {
    let (d, s, _, _) = setup();
    drop(s);
    let db = rusqlite::Connection::open(d.path().join("notes.sqlite3")).unwrap();
    db.execute_batch("DROP TRIGGER application_notes_update")
        .unwrap();
    let before: Vec<String> = db
        .prepare("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY name")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .collect::<std::result::Result<_, _>>()
        .unwrap();
    assert_eq!(Store::open(d.path()).err().unwrap().code, "schema_invalid");
    let after: Vec<String> = db
        .prepare("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY name")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .collect::<std::result::Result<_, _>>()
        .unwrap();
    assert_eq!(before, after);
}

#[test]
fn release_refresh_ack_is_operation_bound_and_failure_returns_committed_warning() {
    let (_d, mut s, c, _) = setup();
    let r = create(&mut s, &c, "committed");
    let t = token(&s, None);
    assert!(NotesApplicationService::new(&mut s)
        .finish_delivery(&c, &r.operation_id, &live())
        .unwrap()
        .is_none());
    let reply = WindowReply::Release {
        operation_id: r.operation_id.clone(),
        refreshed: true,
    };
    assert_eq!(
        s.external_reply("fake", reply.clone(), &t, &live())
            .unwrap_err()
            .code,
        "UNAUTHORIZED"
    );
    for w in live() {
        assert_eq!(
            s.external_reply(&w, reply.clone(), &t, &live()).unwrap()["outcome"],
            "commit"
        );
    }
    let result = NotesApplicationService::new(&mut s)
        .finish_delivery(&c, &r.operation_id, &live())
        .unwrap()
        .unwrap();
    assert!(result.warnings.is_empty());
    let next = create(&mut s, &c, "still committed");
    let t = token(&s, None);
    s.external_reply(
        "main",
        WindowReply::Release {
            operation_id: next.operation_id.clone(),
            refreshed: false,
        },
        &t,
        &live(),
    )
    .unwrap();
    let result = NotesApplicationService::new(&mut s)
        .finish_delivery(&c, &next.operation_id, &live())
        .unwrap()
        .unwrap();
    assert!(result.committed);
    assert_eq!(result.warnings, vec!["WINDOW_REFRESH_REQUIRED"]);
    assert_eq!(
        s.store.note(&next.note_id).unwrap().revision,
        next.committed_revision
    );
}
#[test]
fn saved_during_probe_changes_cas_and_old_save_intent_receipt_remains_real() {
    let (_d, mut s, c, _) = setup();
    let r = create(&mut s, &c, "old");
    let id = start(&mut s, &c, "notes_append", append_args(&r, "agent")).unwrap();
    let t = token(&s, Some(&r.note_id));
    s.register_save("main", &r.note_id, "drain", t).unwrap();
    let response=s.save("main",json!({"type":"saveNote","id":r.note_id,"saveIntent":"drain","revision":1,"document":text_document("saved draft")})).unwrap();
    assert_eq!(response["receipt"]["changes"][0]["revision"], 2);
    match s.external_tick(&id, &live()) {
        ExternalProgress::Aborted { error, .. } => {
            assert_eq!(error.code, "REVISION_CONFLICT");
            assert!(error.current_version.is_some());
        }
        _ => panic!(),
    }
    assert_eq!(s.store.note(&r.note_id).unwrap().plain_text, "saved draft");
}
#[test]
fn tags_all_match_use_the_same_validated_document_marks_as_smart_folders() {
    let (_d, mut s, c, _) = setup();
    let doc = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"中文 #literal "},{"type":"text","text":"#中文","marks":[{"type":"noteTag","attrs":{"name":"中文"}}]},{"type":"text","text":" "},{"type":"text","text":"#A","marks":[{"type":"noteTag","attrs":{"name":"A"}}]}]}]});
    let args = json!({"folderId":"default","format":"document","content":doc,"idempotencyKey":Uuid::new_v4().to_string()});
    commit(&mut s, &c, "notes_create", args).unwrap();
    for (tags, count) in [
        (json!(["中文", "A"]), 1),
        (json!(["中文", "a"]), 0),
        (json!(["literal"]), 0),
    ] {
        assert_eq!(
            query(
                &mut s,
                &c,
                "notes_search",
                json!({"query":"中文","tags":tags})
            )
            .unwrap()["items"]
                .as_array()
                .unwrap()
                .len(),
            count
        );
    }
}
#[test]
fn foreign_attachment_path_and_oversized_node_documents_are_zero_write_rejections() {
    let (_d, mut s, c, _) = setup();
    let owner = create(&mut s, &c, "owner");
    let attachment = s
        .store
        .store_attachment(
            &owner.note_id,
            "secret.txt",
            "text/plain",
            b"secret".to_vec(),
        )
        .unwrap();
    let foreign = json!({"folderId":"default","format":"document","content":{"type":"doc","content":[{"type":"attachment","attrs":{"id":attachment.id,"name":"secret.txt","kind":"file"}}]},"idempotencyKey":Uuid::new_v4().to_string()});
    assert_eq!(
        commit(&mut s, &c, "notes_create", foreign)
            .unwrap_err()
            .code,
        "SCHEMA_INVALID"
    );
    let path = json!({"folderId":"default","format":"document","content":{"type":"doc","content":[{"type":"attachment","attrs":{"id":"x","name":"x","kind":"file","relativePath":"../../secret"}}]},"idempotencyKey":Uuid::new_v4().to_string()});
    assert_eq!(
        commit(&mut s, &c, "notes_create", path).unwrap_err().code,
        "SCHEMA_INVALID"
    );
    let doc = json!({"type":"doc","content":vec![json!({"type":"paragraph"});20000]});
    assert_eq!(
        input_document(&Format::Document, &doc).unwrap_err().code,
        "SCHEMA_INVALID"
    );
    assert_eq!(s.store.notes().unwrap().len(), 1);
}
#[test]
fn physical_folder_scope_is_not_recursive_and_ancestors_have_labels_without_ids_or_counts() {
    let (_d, mut s, _, _) = setup();
    let parent = s
        .store
        .action(json!({"type":"createFolder","name":"ancestor-private"}))
        .unwrap();
    let child = s
        .store
        .action(json!({"type":"createFolder","name":"allowed","parentId":parent["id"]}))
        .unwrap();
    let grandchild = s
        .store
        .action(json!({"type":"createFolder","name":"new child","parentId":child["id"]}))
        .unwrap();
    let (ctx, _) = grant(
        &s,
        "child-reader",
        &["notes:read", "notes:create"],
        &[child["id"].as_str().unwrap()],
    );
    let list = query(&mut s, &ctx, "notes_list_folders", json!({})).unwrap();
    assert_eq!(list["items"].as_array().unwrap().len(), 1);
    assert_eq!(
        list["items"][0]["ancestorLabels"],
        json!(["ancestor-private"])
    );
    assert!(!list.to_string().contains(parent["id"].as_str().unwrap()));
    assert!(!list.to_string().contains("count"));
    assert_eq!(
        query(
            &mut s,
            &ctx,
            "notes_list",
            json!({"folderId":grandchild["id"]})
        )
        .unwrap_err()
        .code,
        "NOT_FOUND"
    );
}
#[test]
fn logical_archive_restore_rotates_incarnation_and_excludes_agent_state() {
    let (_d, mut s, c, _) = setup();
    create(&mut s, &c, "restored");
    let destination = tempfile::tempdir().unwrap();
    let archive = destination.path().join("logical.notesbackup");
    s.store.export_archive(&archive).unwrap();
    let bytes = std::fs::read(&archive).unwrap();
    let body = String::from_utf8(bytes).unwrap();
    assert!(!body.contains("application_operations"));
    assert!(!body.contains(&c.grant_id));
    let before = s.store.application_identity().unwrap();
    s.store.import_archive(&archive).unwrap();
    let after = s.store.application_identity().unwrap();
    assert_eq!(before.0, after.0);
    assert_ne!(before.1, after.1);
    assert_eq!(
        query(&mut s, &c, "notes_list", json!({})).unwrap_err().code,
        "WORKSPACE_UNAVAILABLE"
    );
}

#[test]
#[ignore = "subprocess worker invoked by durable_idempotency_survives_sigkill_on_both_sides_of_commit"]
fn application_crash_worker() {
    let root = std::env::var_os("EVOLVE111_CRASH_ROOT").unwrap();
    let root = std::path::PathBuf::from(root);
    let mut s = Session::new(Store::open(root.join("store")).unwrap());
    let (c, _) = grant(&s, "crash-client", &["notes:create"], &["default"]);
    let args: Value =
        serde_json::from_str(&std::env::var("EVOLVE111_CRASH_ARGUMENTS").unwrap()).unwrap();
    if std::env::var("EVOLVE111_CRASH_PHASE").unwrap() == "after" {
        commit(&mut s, &c, "notes_create", args).unwrap();
    }
    std::fs::write(root.join("at-boundary"), b"ready").unwrap();
    // Parent kills this stopped native test process; no Rust destructors or Store close run.
    unsafe {
        libc::raise(libc::SIGSTOP);
    }
    unreachable!();
}
#[test]
fn durable_idempotency_survives_sigkill_on_both_sides_of_commit() {
    for phase in ["before", "after"] {
        let root = tempfile::tempdir().unwrap();
        let args = create_args("crash-safe complete body");
        let mut child = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "application::tests::application_crash_worker",
                "--ignored",
                "--nocapture",
            ])
            .env("EVOLVE111_CRASH_ROOT", root.path())
            .env("EVOLVE111_CRASH_ARGUMENTS", args.to_string())
            .env("EVOLVE111_CRASH_PHASE", phase)
            .stdout(std::process::Stdio::null())
            .spawn()
            .unwrap();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        while !root.path().join("at-boundary").exists() {
            assert!(
                std::time::Instant::now() < deadline,
                "child did not reach crash boundary"
            );
            assert!(child.try_wait().unwrap().is_none());
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        child.kill().unwrap();
        let exit = child.wait().unwrap();
        assert!(!exit.success());
        let mut s = Session::new(Store::open(root.path().join("store")).unwrap());
        assert_eq!(
            s.store.notes().unwrap().len(),
            if phase == "before" { 0 } else { 1 }
        );
        let (ctx, _) = grant(&s, "crash-client", &["notes:create"], &["default"]);
        let result = commit(&mut s, &ctx, "notes_create", args.clone()).unwrap();
        let replay = commit(&mut s, &ctx, "notes_create", args).unwrap();
        assert_eq!(result.operation_id, replay.operation_id);
        assert_eq!(s.store.notes().unwrap().len(), 1);
        assert_eq!(
            s.store.note(&result.note_id).unwrap().plain_text,
            "crash-safe complete body"
        );
    }
}

#[test]
fn internal_import_source_is_hidden_from_projection_count_and_preserved_on_document_update() {
    use crate::store::apple_import::{self, SourceFolder, SourceNote};
    let (_d, mut s, _, _) = setup();
    let batch = apple_import::prepare(vec![SourceNote {
        id: "source-private-id".into(),
        folders: vec![SourceFolder {
            id: "source-folder".into(),
            name: "Imported".into(),
        }],
        title: "Visible".into(),
        html: "<h1>Visible</h1><p>public body</p>".into(),
        plain_text: "PRIVATE_RAW_ONLY".into(),
        created_at_ms: 1,
        updated_at_ms: 2,
        status: "ok".into(),
        attachments: vec![],
    }])
    .unwrap();
    let results = s.store.append_apple_notes(batch).unwrap();
    let id = results.iter().find_map(|r| r.note_id.clone()).unwrap();
    let note = s.store.note(&id).unwrap();
    let raw_ids = attachment_ids(&note.document);
    assert_eq!(raw_ids.len(), 1);
    let (c, _) = grant(
        &s,
        "import-reader",
        &["notes:read", "notes:update"],
        &[&note.folder_id],
    );
    let read = query(
        &mut s,
        &c,
        "notes_read",
        json!({"noteId":id,"format":"document"}),
    )
    .unwrap();
    assert_eq!(read["attachmentCount"], 0);
    assert!(attachment_ids(&read["content"]).is_empty());
    assert!(!read.to_string().contains("PRIVATE_RAW_ONLY"));
    let updated=commit(&mut s,&c,"notes_update",json!({"noteId":id,"expectedVersion":read["version"],"format":"document","content":text_document("public change"),"idempotencyKey":Uuid::new_v4().to_string()})).unwrap();
    assert_eq!(
        attachment_ids(&s.store.note(&id).unwrap().document),
        raw_ids
    );
    assert_eq!(updated.committed_revision, note.revision + 1);
}

#[test]
fn actual_service_output_fixture_for_adapter_schema_validation() {
    let (_d, mut s, c, _) = setup();
    let mut fixtures = vec![];
    let capabilities = query(&mut s, &c, "notes_get_capabilities", json!({})).unwrap();
    assert_eq!(capabilities["apiVersion"], 1);
    assert_eq!(capabilities["schemaVersion"], 1);
    assert_eq!(capabilities["limits"]["maxDocumentBytes"], MAX_CONTENT);
    assert_eq!(capabilities["limits"]["maxFrameBytes"], 2097152);
    fixtures.push(json!({"tool":"notes_get_capabilities","arguments":{},"result":capabilities}));
    let folders = query(&mut s, &c, "notes_list_folders", json!({})).unwrap();
    fixtures.push(json!({"tool":"notes_list_folders","arguments":{},"result":folders}));
    let args = create_args("Fixture 标题\n中文正文");
    let created = commit(&mut s, &c, "notes_create", args.clone()).unwrap();
    fixtures.push(json!({"tool":"notes_create","arguments":args,"result":created}));
    let args = append_args(&created, "追加段落");
    let appended = commit(&mut s, &c, "notes_append", args.clone()).unwrap();
    fixtures.push(json!({"tool":"notes_append","arguments":args,"result":appended}));
    let args = json!({"noteId":created.note_id,"expectedVersion":appended.committed_version,"format":"text","content":"Updated 标题\n中文更新正文","idempotencyKey":Uuid::new_v4().to_string()});
    let updated = commit(&mut s, &c, "notes_update", args.clone()).unwrap();
    fixtures.push(json!({"tool":"notes_update","arguments":args,"result":updated}));
    for (tool, args) in [
        ("notes_list", json!({})),
        ("notes_search", json!({"query":"中文"})),
        ("notes_read", json!({"noteId":created.note_id})),
        (
            "notes_read",
            json!({"noteId":created.note_id,"format":"document"}),
        ),
        (
            "notes_get_operation",
            json!({"operationId":created.operation_id}),
        ),
        (
            "notes_get_operation",
            json!({"operationId":Uuid::new_v4().to_string()}),
        ),
    ] {
        let result = query(&mut s, &c, tool, args.clone()).unwrap();
        fixtures.push(json!({"tool":tool,"arguments":args,"result":result}));
    }
    let id = start(&mut s, &c, "notes_create", create_args("pending fixture")).unwrap();
    let args = json!({"operationId":id});
    let pending = query(&mut s, &c, "notes_get_operation", args.clone()).unwrap();
    fixtures.push(json!({"tool":"notes_get_operation","arguments":args,"result":pending}));
    s.external_abort(&id).unwrap();
    if let Some(path) = std::env::var_os("EVOLVE111_OUTPUT_FIXTURE") {
        std::fs::write(path,serde_json::to_string_pretty(&json!({"provenance":"Actual NotesApplicationService over temporary production Session/SQLite; protocol replies are native test inputs, not real WebViews", "cases":fixtures})).unwrap()+"\n").unwrap();
    }
}
#[test]
fn pending_operation_still_requires_original_tool_scope() {
    let (_d, mut s, c, _) = setup();
    let id = start(&mut s, &c, "notes_create", create_args("pending")).unwrap();
    let mut narrowed = c.clone();
    narrowed.scopes.remove("notes:create");
    assert_eq!(
        query(
            &mut s,
            &narrowed,
            "notes_get_operation",
            json!({"operationId":id})
        )
        .unwrap_err()
        .code,
        "FORBIDDEN"
    );
    s.external_abort(&id).unwrap();
}
