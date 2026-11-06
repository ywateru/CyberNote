use super::*;
fn source() -> SourceNote {
    SourceNote{id:"synthetic-note-stable".into(),folders:vec![SourceFolder{id:"synthetic-account".into(),name:"测试账户".into()},SourceFolder{id:"synthetic-folder".into(),name:"测试目录".into()}],title:"合成富文本".into(),html:"<h1>合成标题</h1><p><b>粗体</b> <i>斜体</i> <a href='https://example.test'>链接</a></p><ul data-type='taskList'><li data-checked='true'>已完成</li></ul><table><tr><td>A</td><td>B</td></tr></table><img src='cid:synthetic-cid'>".into(),plain_text:"合成标题 粗体 斜体 链接 已完成 A B".into(),created_at_ms:1000,updated_at_ms:2000,status:"ok".into(),attachments:vec![SourceAttachment{id:"synthetic-image".into(),cid:"synthetic-cid".into(),name:"合成图片.png".into(),mime:"image/png".into(),status:"ok".into(),bytes:vec![1,2,3,4]}]}
}
#[test]
fn rich_append_reopen_dedup_changed_copy_and_settings() {
    let temp = tempfile::tempdir().unwrap();
    let mut store = Store::open(temp.path()).unwrap();
    store.action(json!({"type":"settings","settings":{"theme":"dark","view":"gallery","custom":{"keep":true}}})).unwrap();
    let settings = store.workspace().unwrap()["settings"].clone();
    store.keys.insert("synthetic-key".into(), [9; 32]);
    let result = store
        .append_apple_notes(prepare(vec![source()]).unwrap())
        .unwrap();
    assert_eq!(result[0].status, "imported");
    let nid = result[0].note_id.as_ref().unwrap();
    let note = store.note(nid).unwrap();
    assert_eq!(note.created_at, 1000);
    assert_eq!(note.updated_at, 2000);
    assert_eq!(store.attachments().unwrap().len(), 2);
    let document = note.document.to_string();
    assert!(
        document.contains("taskList")
            && document.contains("table")
            && document.contains("bold")
            && document.contains("attachment")
    );
    assert_eq!(store.workspace().unwrap()["settings"], settings);
    assert_eq!(store.keys["synthetic-key"], [9; 32]);
    let mut edited = note.clone();
    edited.title = "用户修改".into();
    edited.revision = 1;
    store.put_note(&edited).unwrap();
    let repeat = store
        .append_apple_notes(prepare(vec![source()]).unwrap())
        .unwrap();
    assert_eq!(repeat[0].status, "existing");
    assert_eq!(store.notes().unwrap().len(), 1);
    assert_eq!(
        store
            .folders()
            .unwrap()
            .iter()
            .filter(|f| f.name == "来自 Apple 备忘录")
            .count(),
        1
    );
    let mut updated = source();
    updated.html.push_str("<p>源新增</p>");
    let new = store
        .append_apple_notes(prepare(vec![updated]).unwrap())
        .unwrap();
    assert_eq!(new[0].status, "imported");
    assert_eq!(store.note(nid).unwrap().title, "用户修改");
    assert_eq!(store.notes().unwrap().len(), 2);
    drop(store);
    let store = Store::open(temp.path()).unwrap();
    assert_eq!(store.attachments().unwrap().len(), 4);
}
#[test]
fn complete_backup_restores_raw_and_dedup_after_owner_remapping() {
    let temp = tempfile::tempdir().unwrap();
    let mut first = Store::open(temp.path().join("first")).unwrap();
    first
        .append_apple_notes(prepare(vec![source()]).unwrap())
        .unwrap();
    let backup = temp.path().join("backup.json");
    first.export_archive(&backup).unwrap();
    let mut target = Store::open(temp.path().join("second")).unwrap();
    target.import_archive(&backup).unwrap();
    target.import_archive(&backup).unwrap();
    assert_eq!(target.notes().unwrap().len(), 2);
    assert_eq!(target.attachments().unwrap().len(), 4);
    let original = target
        .attachments()
        .unwrap()
        .into_iter()
        .find(|a| a.mime == RAW_MIME)
        .unwrap();
    let raw: RawRecord =
        serde_json::from_slice(&target.managed_attachment_bytes(&original).unwrap()).unwrap();
    assert_eq!(raw.source_key, hash(b"synthetic-note-stable"));
    assert_eq!(
        target
            .append_apple_notes(prepare(vec![source()]).unwrap())
            .unwrap()[0]
            .status,
        "existing"
    );
}
#[test]
fn failed_or_locked_source_never_creates_empty_note_or_success_record() {
    let temp = tempfile::tempdir().unwrap();
    let mut store = Store::open(temp.path()).unwrap();
    let mut locked = source();
    locked.status = "locked".into();
    let mut failed = source();
    failed.attachments[0].status = "export_failed".into();
    let results = store
        .append_apple_notes(prepare(vec![locked, failed]).unwrap())
        .unwrap();
    assert_eq!(results.len(), 2);
    assert!(results.iter().all(|r| r.status == "skipped"));
    assert!(store.notes().unwrap().is_empty());
    assert!(store.attachments().unwrap().is_empty());
    assert!(!store
        .folders()
        .unwrap()
        .iter()
        .any(|f| f.name == "来自 Apple 备忘录"));
}
#[test]
fn fingerprints_ignore_dates_and_random_ids_but_include_media_bytes_and_order() {
    let a = prepare_one(source()).unwrap();
    let mut shifted = source();
    shifted.updated_at_ms += 999;
    assert_eq!(a.fingerprint, prepare_one(shifted).unwrap().fingerprint);
    let mut changed = source();
    changed.attachments[0].bytes[0] = 9;
    assert_ne!(a.fingerprint, prepare_one(changed).unwrap().fingerprint);
    let mut two = source();
    let mut second = two.attachments[0].clone();
    second.id = "second".into();
    second.cid = "second-cid".into();
    two.attachments.push(second);
    let before = prepare_one(two.clone()).unwrap().fingerprint;
    two.attachments.reverse();
    assert_ne!(before, prepare_one(two).unwrap().fingerprint);
}
#[test]
fn moved_prior_copy_is_not_reused_as_future_source_folder() {
    let temp = tempfile::tempdir().unwrap();
    let mut store = Store::open(temp.path()).unwrap();
    let result = store
        .append_apple_notes(prepare(vec![source()]).unwrap())
        .unwrap();
    let old = result[0].note_id.as_ref().unwrap();
    let mut moved = store.note(old).unwrap();
    moved.folder_id = "default".into();
    store.put_note(&moved).unwrap();
    let mut changed = source();
    changed.html.push_str("<p>新版本</p>");
    let result = store
        .append_apple_notes(prepare(vec![changed]).unwrap())
        .unwrap();
    let new = store.note(result[0].note_id.as_ref().unwrap()).unwrap();
    assert_ne!(new.folder_id, "default");
    assert_eq!(store.folder(&new.folder_id).unwrap().name, "测试目录");
    assert_eq!(store.note(old).unwrap().folder_id, "default");
}
#[test]
fn inert_html_never_executes_or_keeps_remote_images() {
    let mut s = source();
    s.html="<script>throw bad()</script><img src='https://example.test/x'><p onclick='bad()'><a href='javascript:bad()'>safe text</a></p>".into();
    let prepared = prepare_one(s).unwrap();
    let doc = prepared.note.document.to_string();
    assert!(
        !doc.contains("javascript:")
            && !doc.contains("bad()")
            && !doc.contains("https://example.test/x")
    );
    assert!(prepared.warnings.len() >= 2);
}
#[test]
fn transaction_failure_does_not_publish_success_or_leave_orphans() {
    let temp = tempfile::tempdir().unwrap();
    let mut store = Store::open(temp.path()).unwrap();
    store.db.execute_batch("CREATE TRIGGER reject_apple BEFORE INSERT ON notes BEGIN SELECT RAISE(ABORT,'synthetic reject'); END;").unwrap();
    assert!(store
        .append_apple_notes(prepare(vec![source()]).unwrap())
        .is_err());
    assert!(store.notes().unwrap().is_empty());
    assert!(store.attachments().unwrap().is_empty());
    assert_eq!(
        fs::read_dir(temp.path().join("attachments"))
            .unwrap()
            .count(),
        0
    );
    store.db.execute_batch("DROP TRIGGER reject_apple").unwrap();
    assert_eq!(
        store
            .append_apple_notes(prepare(vec![source()]).unwrap())
            .unwrap()[0]
            .status,
        "imported"
    );
}
#[test]
fn raw_records_count_in_inventory_and_no_raw_source_ids_are_persisted() {
    let temp = tempfile::tempdir().unwrap();
    let mut store = Store::open(temp.path()).unwrap();
    store
        .append_apple_notes(prepare(vec![source()]).unwrap())
        .unwrap();
    let attachments = store.attachments().unwrap();
    let raw = attachments.iter().find(|a| a.mime == RAW_MIME).unwrap();
    let bytes = store.managed_attachment_bytes(raw).unwrap();
    let text = String::from_utf8(bytes).unwrap();
    assert!(
        !text.contains("synthetic-note-stable")
            && !text.contains("synthetic-account")
            && !text.contains("synthetic-image")
    );
    let inventory = serde_json::to_value(store.data_management().unwrap()).unwrap();
    assert_eq!(inventory["counts"]["attachments"], 2);
    assert_eq!(
        inventory["totals"]["attachmentBytes"],
        attachments.iter().map(|a| a.size).sum::<u64>()
    );
    let row = inventory["files"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["attachment"]["id"] == raw.id)
        .unwrap();
    assert_eq!(row["attachment"]["referenced"], true);
    assert_eq!(row["attachment"]["exportable"], true);
}
#[test]
fn corrupt_or_missing_raw_record_cannot_suppress_a_copy() {
    let temp = tempfile::tempdir().unwrap();
    let mut store = Store::open(temp.path()).unwrap();
    store
        .append_apple_notes(prepare(vec![source()]).unwrap())
        .unwrap();
    let raw = store
        .attachments()
        .unwrap()
        .into_iter()
        .find(|a| a.mime == RAW_MIME)
        .unwrap();
    let path = store.attachment_path(&raw.relative_path).unwrap();
    fs::remove_file(path).unwrap();
    assert_eq!(
        store
            .append_apple_notes(prepare(vec![source()]).unwrap())
            .unwrap()[0]
            .status,
        "imported"
    );
}
#[test]
fn unplaced_attachments_keep_source_order_and_warn() {
    let mut input = source();
    input.html = "<p>无CID定位</p>".into();
    input.attachments[0].cid = "z-last-lexically".into();
    let mut next = input.attachments[0].clone();
    next.id = "second".into();
    next.cid = "a-first-lexically".into();
    next.name = "第二个.png".into();
    input.attachments.push(next);
    let p = prepare_one(input).unwrap();
    let ids = p.note.document["content"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|n| n["type"] == "attachment")
        .map(|n| n["attrs"]["id"].as_str().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(ids[0], p.attachments[0].id);
    assert_eq!(ids[1], p.attachments[1].id);
    assert!(!p.warnings.is_empty());
}
#[test]
fn independent_svg_counterexample_reports_loss_and_underline_uses_real_schema() {
    let mut svg = source();
    svg.attachments.clear();
    svg.html =
        "<p>普通正文</p><svg xmlns='http://www.w3.org/2000/svg'><path d='M0 0L1 1'/></svg>".into();
    let parsed = prepare_one(svg).unwrap();
    assert!(!parsed.warnings.is_empty());
    let mut underline = source();
    underline.attachments.clear();
    underline.html = "<p><u>应保留下划线</u></p>".into();
    let parsed = prepare_one(underline).unwrap();
    assert!(parsed.note.document.to_string().contains("underline"));
    let mut styled = source();
    styled.attachments.clear();
    styled.html = "<p style='font-size:72px;font-family:fantasy'>样式</p>".into();
    assert!(!prepare_one(styled).unwrap().warnings.is_empty());
}
