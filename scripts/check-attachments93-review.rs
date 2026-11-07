//! Independent APP93 counterexamples. Include only in an isolated copied
//! apple_import module; never modify production code or touch a user Store.
use super::*;

fn review_source() -> SourceNote {
    SourceNote {
        id: "independent93-source".into(),
        folders: vec![SourceFolder { id: "independent93-account".into(), name: "Synthetic account".into() }],
        title: "Independent synthetic note".into(),
        html: "<p>Independent synthetic note</p>".into(),
        plain_text: "Independent synthetic note".into(),
        created_at_ms: 1000, updated_at_ms: 2000, status: "ok".into(), attachments: vec![],
    }
}
fn imported(store: &mut Store) -> (String, Attachment) {
    let rows = store.append_apple_notes(prepare(vec![review_source()]).unwrap()).unwrap();
    let nid = rows[0].note_id.clone().unwrap();
    let raw = store.attachments().unwrap().into_iter().find(|a| a.note_id == nid && a.mime == RAW_MIME).unwrap();
    (nid, raw)
}
fn raw_node(raw: &Attachment) -> Value {
    json!({"type":"attachment","attrs":{"id":raw.id,"kind":"file","name":raw.display_name}})
}
fn references(value: &Value) -> BTreeSet<String> {
    fn visit(value: &Value, result: &mut BTreeSet<String>) {
        if value["type"] == "attachment" {
            if let Some(id) = value["attrs"]["id"].as_str() { result.insert(id.into()); }
        }
        if let Some(children) = value["content"].as_array() { for child in children { visit(child, result); } }
    }
    let mut result = BTreeSet::new(); visit(value, &mut result); result
}

#[test]
fn independent93_legacy_raw_only_and_nested_projection_stays_valid() {
    let root = tempfile::tempdir().unwrap();
    let mut store = Store::open(root.path()).unwrap();
    let (nid, raw) = imported(&mut store);
    let cases = [
        json!({"type":"doc","content":[raw_node(&raw)]}),
        json!({"type":"doc","content":[{"type":"blockquote","content":[raw_node(&raw)]}]}),
        json!({"type":"doc","content":[{"type":"table","content":[{"type":"tableRow","content":[{"type":"tableCell","content":[raw_node(&raw)]}]}]}]}),
    ];
    for (index, document) in cases.into_iter().enumerate() {
        let mut original = store.note(&nid).unwrap(); original.document = document;
        store.validate_document(&original.document, &original).unwrap();
        store.put_note(&original).unwrap();
        let before = serde_json::to_value(store.note(&nid).unwrap()).unwrap();
        let public = store.visible(original).unwrap();
        assert!(!references(&public.document).contains(&raw.id), "case {index}");
        store.validate_document(&public.document, &public).unwrap_or_else(|error| panic!("case {index}: {}", error.message));
        assert_eq!(serde_json::to_value(store.note(&nid).unwrap()).unwrap(), before, "read-only projection case {index}");
    }
}

#[test]
fn independent93_invalid_public_document_is_rejected_before_restoring_refs() {
    let root = tempfile::tempdir().unwrap();
    let mut store = Store::open(root.path()).unwrap();
    let (nid, _) = imported(&mut store);
    let before = serde_json::to_value(store.note(&nid).unwrap()).unwrap();
    for document in [json!({"type":"doc","content":[]}), json!({"type":"doc","content":[{"type":"unknown"}]})] {
        assert!(store.action(json!({"type":"saveNote","id":nid,"revision":before["revision"],"document":document})).is_err());
        assert_eq!(serde_json::to_value(store.note(&nid).unwrap()).unwrap(), before);
    }
}

#[test]
fn independent93_same_name_spoof_and_replaced_bytes_remain_public() {
    let root = tempfile::tempdir().unwrap();
    let mut store = Store::open(root.path()).unwrap();
    let (nid, raw) = imported(&mut store);
    let same = store.store_attachment(&nid, "Apple 备忘录原始记录.json", "application/json", b"{}".to_vec()).unwrap();
    let spoof = store.store_attachment(&nid, "spoof.json", RAW_MIME, b"{}".to_vec()).unwrap();
    let original = store.note(&nid).unwrap();
    let document = json!({"type":"doc","content":[raw_node(&same),raw_node(&spoof)]});
    let saved = store.action(json!({"type":"saveNote","id":nid,"revision":original.revision,"document":document})).unwrap();
    assert_eq!(references(&saved["document"]), BTreeSet::from([same.id.clone(), spoof.id.clone()]));
    let original_bytes = store.managed_attachment_bytes(&raw).unwrap();
    let mut corrupt = original_bytes.clone(); corrupt[0] = b'!';
    fs::write(store.attachment_path(&raw.relative_path).unwrap(), &corrupt).unwrap();
    let workspace = store.workspace().unwrap();
    let public = workspace["notes"].as_array().unwrap().iter().find(|n| n["id"] == nid).unwrap();
    assert!(references(&public["document"]).contains(&raw.id));
    assert!(workspace["attachments"].as_array().unwrap().iter().filter(|a| [raw.id.as_str(), same.id.as_str(), spoof.id.as_str()].contains(&a["id"].as_str().unwrap())).all(|a| a["internal"] != true));
    fs::write(store.attachment_path(&raw.relative_path).unwrap(), &original_bytes).unwrap();
    fs::write(store.attachment_path(&spoof.relative_path).unwrap(), b"longer than metadata").unwrap();
    assert!(references(&store.visible(store.note(&nid).unwrap()).unwrap().document).contains(&spoof.id));
}

#[test]
fn independent93_last_user_node_save_strict_wire_receive_and_dedup() {
    let root_a = tempfile::tempdir().unwrap(); let root_b = tempfile::tempdir().unwrap();
    let mut a = Store::open(root_a.path()).unwrap(); let mut b = Store::open(root_b.path()).unwrap();
    let (nid, raw) = imported(&mut a);
    let identity = a.sync_enable(None).unwrap(); b.sync_enable(Some(&identity.workspace_id)).unwrap();
    let revision = a.note(&nid).unwrap().revision;
    let public_document = json!({"type":"doc","content":[{"type":"paragraph"}]});
    let saved = a.action(json!({"type":"saveNote","id":nid,"revision":revision,"document":public_document})).unwrap();
    assert_eq!(saved["document"], public_document);
    assert_eq!(references(&a.note(&nid).unwrap().document), BTreeSet::from([raw.id.clone()]));
    a.sync_flush().unwrap();
    let versions = a.sync_inventory().unwrap().iter().map(|v| a.sync_version(&v.digest).unwrap()).collect::<Vec<_>>();
    for version in &versions {
        if version.entity_id == nid {
            let payload = version.payload.as_ref().unwrap();
            let media = payload["attachments"].as_array().unwrap().iter().map(|a| a["id"].as_str().unwrap().to_owned()).collect::<BTreeSet<_>>();
            assert_eq!(references(&payload["note"]["document"]), media, "unchanged strict wire contract");
            assert_eq!(media, BTreeSet::from([raw.id.clone()]));
            assert!(!payload.to_string().contains("\"internal\""));
        }
        for blob in a.sync_required_blobs(version).unwrap() {
            b.sync_store_blob(&blob.hash, blob.size, fs::File::open(a.sync_blob_path(&blob.hash).unwrap()).unwrap()).unwrap();
        }
    }
    b.sync_receive(versions).unwrap(); b.sync_apply_pending().unwrap();
    assert_eq!(b.managed_attachment_bytes(&b.attachments().unwrap().into_iter().find(|a| a.id == raw.id).unwrap()).unwrap(), a.managed_attachment_bytes(&raw).unwrap());
    assert_eq!(b.append_apple_notes(prepare(vec![review_source()]).unwrap()).unwrap()[0].status, "existing");
    drop(b); let b = Store::open(root_b.path()).unwrap();
    assert_eq!(b.visible(b.note(&nid).unwrap()).unwrap().document, public_document);
    assert_eq!(references(&b.note(&nid).unwrap().document), BTreeSet::from([raw.id]));
}
