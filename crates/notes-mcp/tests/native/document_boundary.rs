// Compiled only inside an archived production application harness by
// generate_document_boundary.py. No application/Store implementation is copied.
use super::*;

fn boundary_case(s: &mut Session, c: &TrustedContext, doc: &Value) -> Vec<Value> {
    let args = json!({"folderId":"default", "format":"document", "content":doc,
        "idempotencyKey":Uuid::new_v4().to_string()});
    let created = commit(s, c, "notes_create", args.clone()).unwrap();
    assert!(created.committed);
    let mut cases = vec![json!({"tool":"notes_create", "arguments":args, "result":created})];
    let args = json!({"noteId":created.note_id, "expectedVersion":created.committed_version,
        "format":"document", "content":doc, "idempotencyKey":Uuid::new_v4().to_string()});
    let updated = commit(s, c, "notes_update", args.clone()).unwrap();
    assert!(updated.committed);
    assert_eq!(updated.committed_revision, 2);
    cases.push(json!({"tool":"notes_update", "arguments":args, "result":updated}));
    let args = json!({"noteId":created.note_id, "format":"document"});
    let read = query(s, c, "notes_read", args.clone()).unwrap();
    assert_eq!(read["content"], *doc);
    cases.push(json!({"tool":"notes_read", "arguments":args, "result":read}));
    cases
}

#[test]
fn adapter_document_node_and_depth_boundaries() {
    let (_root, mut session, context, _) = setup();
    let nodes = json!({"type":"doc", "content":
        vec![json!({"type":"heading", "attrs":{"level":1}});19_999]});
    assert_eq!(serde_json::to_vec(&nodes).unwrap().len(), 779_987);
    assert_eq!(
        hash(&nodes).unwrap(),
        "cb8343980dda85ab89f1d76c1fb7d8953d78041ee1e6f0c63277d83cc9117475"
    );
    let mut cases = boundary_case(&mut session, &context, &nodes);

    // Empty strokes array is a legal auxiliary container at JSON depth 64:
    // doc(0), 30 blockquotes(2..60), drawing(62), attrs(63), strokes(64).
    let mut depth = json!({"type":"drawing", "attrs":{"strokes":[]}});
    for _ in 0..30 {
        depth = json!({"type":"blockquote", "content":[depth]});
    }
    let depth = json!({"type":"doc", "content":[depth]});
    assert!(input_document(&Format::Document, &depth).is_ok());
    cases.extend(boundary_case(&mut session, &context, &depth));

    let mut too_many = nodes.clone();
    too_many["content"]
        .as_array_mut()
        .unwrap()
        .push(json!({"type":"heading", "attrs":{"level":1}}));
    // Valid Editor shape, but the scalar `type` is at depth 65.
    let mut too_deep = json!({"type":"paragraph"});
    for _ in 0..31 {
        too_deep = json!({"type":"blockquote", "content":[too_deep]});
    }
    let too_deep = json!({"type":"doc", "content":[too_deep]});
    for rejected in [&too_many, &too_deep] {
        assert_eq!(
            input_document(&Format::Document, rejected)
                .unwrap_err()
                .code,
            "SCHEMA_INVALID"
        );
        let existing = &cases[2]["result"];
        let before = session.store.notes().unwrap().len();
        let args = json!({"folderId":"default", "format":"document", "content":rejected,
            "idempotencyKey":Uuid::new_v4().to_string()});
        assert_eq!(
            commit(&mut session, &context, "notes_create", args)
                .unwrap_err()
                .code,
            "SCHEMA_INVALID"
        );
        let args = json!({"noteId":existing["id"], "expectedVersion":existing["version"],
            "format":"document", "content":rejected, "idempotencyKey":Uuid::new_v4().to_string()});
        assert_eq!(
            commit(&mut session, &context, "notes_update", args)
                .unwrap_err()
                .code,
            "SCHEMA_INVALID"
        );
        assert_eq!(session.store.notes().unwrap().len(), before);
        let read = query(
            &mut session,
            &context,
            "notes_read",
            cases[2]["arguments"].clone(),
        )
        .unwrap();
        assert_eq!(read, *existing);
    }
    // These are resource checks, independent of document-schema rejection.
    // Every JSON value counts for depth, even a null scalar or empty container.
    let mut resources = vec![];
    for leaf in [Value::Null, json!({}), json!([])] {
        let mut value = leaf;
        for _ in 0..64 {
            value = json!({"child":value});
        }
        assert!(input_document(&Format::Document, &value).is_ok());
        resources.push(json!({"content":value, "accepted":true}));
        let value = json!({"child":value});
        assert!(input_document(&Format::Document, &value).is_err());
        resources.push(json!({"content":value, "accepted":false}));
    }
    // Marks contain `type` and count too; attrs without `type` do not.
    for count in [19_999, 20_000] {
        let value = json!({"type":"doc", "marks":vec![json!({"type":"bold", "attrs":{}});count]});
        let accepted = count == 19_999;
        assert_eq!(input_document(&Format::Document, &value).is_ok(), accepted);
        resources.push(json!({"content":value, "accepted":accepted}));
    }
    let fixture = json!({
        "provenance":"Archived production NotesApplicationService + temporary Session/SQLite; window replies are native test inputs, not real WebViews",
        "cases":cases, "resourceCases":resources
    });
    std::fs::write(
        std::env::var_os("ADAPTER_DOCUMENT_FIXTURE").unwrap(),
        serde_json::to_vec(&fixture).unwrap(),
    )
    .unwrap();
}
