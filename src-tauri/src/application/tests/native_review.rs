//! Formal regressions for the independent native review, over production Session/SQLite.
use super::*;

#[test]
fn document_unknown_envelope_fields_reject_create_and_update_without_any_commit() {
    let (d, mut s, c, _) = setup();
    s.store.sync_enable(None).unwrap();
    s.store.sync_flush().unwrap();
    let existing = create(&mut s, &c, "unchanged");
    s.store.sync_flush().unwrap();
    s.take_metadata_event();
    let db = rusqlite::Connection::open(d.path().join("notes.sqlite3")).unwrap();
    let counts = || {
        ["notes", "application_operations", "sync_dirty"].map(|table| {
            db.query_row(&format!("SELECT count(*) FROM {table}"), [], |r| {
                r.get::<_, i64>(0)
            })
            .unwrap()
        })
    };
    let before_counts = counts();
    let before_notes = serde_json::to_value(s.store.notes().unwrap()).unwrap();
    let before_metadata = s.metadata();
    let legal = json!({"type":"doc","content":[{"type":"paragraph","content":[{
        "type":"text","text":"inert content","marks":[{"type":"link","attrs":{"href":"https://example.com"}}]
    }]}]});
    // Root, block, text, mark: arbitrary extra fields as well as both reported paths.
    // A path-name denylist alone must not pass this regression.
    for pointer in [
        "",
        "/content/0",
        "/content/0/content/0",
        "/content/0/content/0/marks/0",
    ] {
        for key in ["path", "relativePath", "unreviewedMetadata"] {
            let mut doc = legal.clone();
            doc.pointer_mut(pointer)
                .unwrap()
                .as_object_mut()
                .unwrap()
                .insert(key.into(), json!({"value":"../../private-root"}));
            for tool in ["notes_create", "notes_update"] {
                let args = if tool == "notes_create" {
                    json!({"folderId":"default","format":"document","content":doc,"idempotencyKey":Uuid::new_v4().to_string()})
                } else {
                    json!({"noteId":existing.note_id,"expectedVersion":existing.committed_version,"format":"document","content":doc,"idempotencyKey":Uuid::new_v4().to_string()})
                };
                let command = Mutation::parse(tool, args.clone()).unwrap();
                let error = commit(&mut s, &c, tool, args).unwrap_err();
                assert_eq!(error.code, "SCHEMA_INVALID", "{pointer} {key} {tool}");
                assert_eq!(error.committed, Some(false));
                assert!(error.operation_id.is_some());
                assert!(!s.external_has_operation());
                assert!(s.take_metadata_event().is_none());
                assert_eq!(s.metadata(), before_metadata);
                // Capture the real Store boundary separately, proving rejection did
                // not produce a receipt hidden by Session's response/error mapping.
                let (attempt, receipt) = s.store.capture_commit(|store| {
                    Ok(store.application_commit(&c, &command, "rejected-review-operation"))
                });
                assert_eq!(attempt.unwrap().unwrap_err().code, "SCHEMA_INVALID");
                assert!(!receipt.committed());
                assert!(receipt.changes.is_empty());
                assert!(receipt.created_id.is_none());
                assert_eq!(counts(), before_counts);
                assert_eq!(
                    serde_json::to_value(s.store.notes().unwrap()).unwrap(),
                    before_notes
                );
            }
        }
    }
}

#[test]
fn strict_document_envelopes_keep_legal_schema_marks_attributes_and_owned_attachments() {
    let (_d, mut s, c, _) = setup();
    let legal = json!({"type":"doc","attrs":{},"content":[
        {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Legal","attrs":{}}]},
        {"type":"paragraph","attrs":{},"content":[{"type":"text","text":"linked","marks":[
            {"type":"link","attrs":{"href":"https://example.com","target":"_blank","rel":"noopener","class":null,"title":"link"}},
            {"type":"bold","attrs":{}}
        ]},{"type":"hardBreak"},{"type":"text","text":"after break"}]},
        {"type":"taskList","content":[{"type":"taskItem","attrs":{"checked":true},"content":[{"type":"paragraph"}]}]},
        {"type":"table","content":[{"type":"tableRow","content":[{"type":"tableCell","attrs":{"colspan":1,"rowspan":1,"colwidth":[120],"align":"left"},"content":[{"type":"paragraph"}]}]}]},
        {"type":"drawing","attrs":{"strokes":[{"tool":"pen","color":"#000000","width":2,"points":[[0,0],[1,1]]}]}}
    ]});
    let r = commit(&mut s, &c, "notes_create", json!({"folderId":"default","format":"document","content":legal,"idempotencyKey":Uuid::new_v4().to_string()})).unwrap();
    let attachment = s
        .store
        .store_attachment(&r.note_id, "kept.txt", "text/plain", b"kept".to_vec())
        .unwrap();
    let read = query(
        &mut s,
        &c,
        "notes_read",
        json!({"noteId":r.note_id,"format":"document"}),
    )
    .unwrap();
    assert_eq!(read["content"], legal);
    let mut updated = legal;
    updated["content"].as_array_mut().unwrap().push(
        json!({"type":"attachment","attrs":{"id":attachment.id,"name":"kept.txt","kind":"file"}}),
    );
    let result = commit(&mut s, &c, "notes_update", json!({"noteId":r.note_id,"expectedVersion":read["version"],"format":"document","content":updated,"idempotencyKey":Uuid::new_v4().to_string()})).unwrap();
    let read = query(
        &mut s,
        &c,
        "notes_read",
        json!({"noteId":r.note_id,"format":"document"}),
    )
    .unwrap();
    assert_eq!(read["content"], updated);
    assert_eq!(read["attachmentCount"], 1);
    assert_eq!(read["revision"], result.committed_revision);
}

#[test]
fn failed_release_warning_keeps_commit_error_terminal_receipt_and_finish_recovery() {
    let (d, mut s, c, _) = setup();
    let args = create_args("durable commit");
    let original = commit(&mut s, &c, "notes_create", args.clone()).unwrap();
    let before = serde_json::to_value(s.store.note(&original.note_id).unwrap()).unwrap();
    s.take_metadata_event();
    let db = rusqlite::Connection::open(d.path().join("notes.sqlite3")).unwrap();
    db.execute_batch("CREATE TRIGGER review_warning_failure BEFORE UPDATE ON application_operations BEGIN SELECT RAISE(ABORT,'injected warning failure'); END").unwrap();
    let t = token(&s, None);
    let negative = WindowReply::Release {
        operation_id: original.operation_id.clone(),
        refreshed: false,
    };
    for _ in 0..2 {
        let error = NotesApplicationService::new(&mut s)
            .external_reply("main", negative.clone(), &t, &live())
            .unwrap_err();
        assert_eq!(error.code, "STORAGE_ERROR");
        assert_eq!(error.committed, Some(true));
        assert_eq!(
            error.operation_id.as_deref(),
            Some(original.operation_id.as_str())
        );
        let wire = serde_json::to_value(&error).unwrap();
        assert_eq!(wire["committed"], true);
        assert_eq!(wire["operationId"], original.operation_id);
        assert!(!wire.to_string().contains("injected warning failure"));
    }
    // Failed warning persistence does not consume or turn the commit receipt
    // into an abort. A later positive ACK cannot erase the earlier refresh failure.
    for window in live() {
        let receipt = NotesApplicationService::new(&mut s)
            .external_reply(
                &window,
                WindowReply::Release {
                    operation_id: original.operation_id.clone(),
                    refreshed: true,
                },
                &t,
                &live(),
            )
            .unwrap();
        assert_eq!(
            receipt,
            json!({"operationId":original.operation_id,"outcome":"commit"})
        );
    }
    let failed = NotesApplicationService::new(&mut s)
        .finish_delivery(&c, &original.operation_id, &live())
        .unwrap()
        .unwrap();
    assert!(failed.committed);
    assert_eq!(failed.operation_id, original.operation_id);
    assert_eq!(failed.committed_version, original.committed_version);
    assert_eq!(
        failed.warnings,
        vec!["WINDOW_REFRESH_REQUIRED", "WARNING_PERSIST_FAILED"]
    );
    assert!(!s.external_has_operation());
    assert!(s.take_metadata_event().is_none());
    db.execute_batch("DROP TRIGGER review_warning_failure")
        .unwrap();
    let recovered = NotesApplicationService::new(&mut s)
        .finish_delivery(&c, &original.operation_id, &live())
        .unwrap()
        .unwrap();
    assert!(recovered.committed);
    assert_eq!(recovered.warnings, vec!["WINDOW_REFRESH_REQUIRED"]);
    let replay = commit(&mut s, &c, "notes_create", args.clone()).unwrap();
    assert_eq!(
        serde_json::to_value(&replay).unwrap(),
        serde_json::to_value(&recovered).unwrap()
    );
    assert_eq!(
        serde_json::to_value(s.store.note(&original.note_id).unwrap()).unwrap(),
        before
    );
    assert_eq!(
        db.query_row("SELECT count(*) FROM application_operations", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        1
    );
    drop(s);
    let mut reopened = Session::new(Store::open(d.path()).unwrap());
    let replay = commit(&mut reopened, &c, "notes_create", args).unwrap();
    assert_eq!(
        serde_json::to_value(&replay).unwrap(),
        serde_json::to_value(&recovered).unwrap()
    );
    assert_eq!(
        serde_json::to_value(reopened.store.note(&original.note_id).unwrap()).unwrap(),
        before
    );
}
