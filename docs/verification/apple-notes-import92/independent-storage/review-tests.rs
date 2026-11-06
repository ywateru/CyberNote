use super::*;
fn fixture() -> SourceNote {
 SourceNote { id:"review-account\0review-note".into(), folders:vec![SourceFolder{id:"review-account".into(),name:"审查账户".into()},SourceFolder{id:"review-folder".into(),name:"审查目录".into()}], title:"合成审查".into(),html:"<p>原文<b>加粗</b></p>".into(),plain_text:"原文加粗".into(),created_at_ms:100,updated_at_ms:200,status:"ok".into(),attachments:vec![] }
}
#[test]
fn review_append_abort_retains_existing_data_settings_keys_and_files() {
 let dir=tempfile::tempdir().unwrap();let mut s=Store::open(dir.path()).unwrap();
 let old=s.action(json!({"type":"createNote"})).unwrap();
 s.action(json!({"type":"settings","settings":{"theme":"dark","view":"gallery","custom":{"sentinel":17}}})).unwrap();
 s.keys.insert("review-open-key".into(),[27;32]);
 let before=s.workspace().unwrap();
 s.db.execute_batch("CREATE TRIGGER review_abort BEFORE INSERT ON notes BEGIN SELECT RAISE(ABORT,'review rejection'); END;").unwrap();
 assert!(s.append_apple_notes(prepare(vec![fixture()]).unwrap()).is_err());
 assert_eq!(s.workspace().unwrap(),before);assert_eq!(s.keys["review-open-key"],[27;32]);
 assert_eq!(fs::read_dir(dir.path().join("attachments")).unwrap().count(),0);
 s.db.execute_batch("DROP TRIGGER review_abort").unwrap();
 let r=s.append_apple_notes(prepare(vec![fixture()]).unwrap()).unwrap();assert_eq!(r[0].status,"imported");
 assert_eq!(s.workspace().unwrap()["settings"],before["settings"]);assert_eq!(s.keys["review-open-key"],[27;32]);
 assert!(s.notes().unwrap().iter().any(|n|n.id==old["id"].as_str().unwrap_or("")));
}
#[test]
fn review_source_names_cannot_choose_managed_paths() {
 let dir=tempfile::tempdir().unwrap();let mut s=Store::open(dir.path()).unwrap();let mut n=fixture();
 n.attachments.push(SourceAttachment{id:"../source-id".into(),cid:"".into(),name:"../../outside.txt".into(),mime:"text/plain".into(),status:"ok".into(),bytes:b"REVIEW_SYNTHETIC".to_vec()});
 let r=s.append_apple_notes(prepare(vec![n]).unwrap()).unwrap();assert_eq!(r[0].status,"imported_with_warnings");
 for a in s.attachments().unwrap(){assert!(!a.relative_path.contains('/'));assert_eq!(s.managed_attachment_bytes(&a).unwrap().len() as u64,a.size);}
 assert!(!dir.path().join("outside.txt").exists());
}
#[test]
fn review_unsupported_svg_never_claims_complete_import() {
 let dir=tempfile::tempdir().unwrap();let mut s=Store::open(dir.path()).unwrap();let mut n=fixture();
 n.html="<p>普通正文</p><svg xmlns='http://www.w3.org/2000/svg'><path d='M0 0L1 1'/></svg>".into();
 let r=s.append_apple_notes(prepare(vec![n]).unwrap()).unwrap();
 assert_eq!(r[0].status,"imported_with_warnings","unconverted SVG must be reported; raw retention alone is not a warning");
 assert!(!r[0].warnings.is_empty());
}
#[test]
fn review_unsupported_underline_is_preserved_or_reported() {
 let mut n=fixture();n.html="<p><u>应保留下划线</u></p>".into();
 let p=prepare_one(n).unwrap();
 assert!(p.note.document.to_string().contains("underline")||!p.warnings.is_empty(),"unsupported style silently disappears");
}
#[test]
fn review_append_actual_process_death_before_and_after_commit() {
 for (stage,committed) in [("before_commit",false),("after_commit",true)] {
  let dir=tempfile::tempdir().unwrap();let mut s=Store::open(dir.path()).unwrap();
  s.action(json!({"type":"settings","settings":{"theme":"dark","custom":{"keep":19}}})).unwrap();let settings=s.workspace().unwrap()["settings"].clone();drop(s);
  let output=std::process::Command::new(std::env::current_exe().unwrap()).args(["--exact","store::apple_import::independent_review::review_append_crash_worker","--ignored","--nocapture"]).env("NOTES_TEST_ARCHIVE_CRASH",stage).env("REVIEW_APPEND_ROOT",dir.path()).output().unwrap();
  assert_eq!(output.status.code(),Some(77),"worker must really exit at checkpoint");
  let mut s=Store::open(dir.path()).unwrap();assert_eq!(s.workspace().unwrap()["settings"],settings);
  assert_eq!(s.notes().unwrap().len(),usize::from(committed));assert_eq!(s.attachments().unwrap().len(),usize::from(committed));
  assert_eq!(fs::read_dir(dir.path().join("attachments")).unwrap().count(),usize::from(committed));
  let r=s.append_apple_notes(prepare(vec![fixture()]).unwrap()).unwrap();assert_eq!(r[0].status,if committed{"existing"}else{"imported"});
  assert_eq!(s.notes().unwrap().len(),1);assert_eq!(s.attachments().unwrap().len(),1);
 }
}
#[test]
#[ignore]
fn review_append_crash_worker() {
 let root=std::env::var("REVIEW_APPEND_ROOT").unwrap();let mut s=Store::open(Path::new(&root)).unwrap();
 s.append_apple_notes(prepare(vec![fixture()]).unwrap()).unwrap();panic!("crash checkpoint did not terminate worker");
}
