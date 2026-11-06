use super::*;
fn item() -> ValidatedItem { ValidatedItem{key:"opaque-review".into(),id:"review-note".into(),title:"合成标题".into(),folder_id:"review-folder".into(),folders:vec![SourceFolder{id:"review-account".into(),name:"合成账户".into()},SourceFolder{id:"review-folder".into(),name:"合成目录".into()}]} }
fn note_read(attachments:Vec<Media>)->Read { Read{version:1,status:"ok".into(),reason:None,note:Some(Body{id:"review-note".into(),title:"合成标题".into(),folder_id:"review-folder".into(),html:"<p>合成正文</p>".into(),plain_text:"合成正文".into(),created_at_ms:100,updated_at_ms:200,attachments,stable:true})} }
#[test]
fn review_host_aggregate_media_is_refused_before_unbounded_buffering() {
 let stage=OwnedStage::new().unwrap();let mut media=Vec::new();
 for i in 0..2 {std::fs::File::create(stage.export_path(i).unwrap()).unwrap().set_len(65*1024*1024).unwrap();media.push(Media{id:format!("review-media-{i}"),cid:None,name:Some(format!("review-{i}.bin")),status:"ok".into(),reason:None,export_index:i});}
 let result=source_note(note_read(media),&item(),&stage);
 assert!(result.is_err(),"source_note returned a >128MiB media Vec before the worker's 128MiB guard");
}
#[cfg(target_os="macos")]
#[test]
fn review_host_live_export_size_guard_reaps_owned_child() {
 let stage=OwnedStage::new().unwrap();std::fs::File::create(stage.export_path(0).unwrap()).unwrap().set_len(100*1024*1024+1).unwrap();
 let mut child=std::process::Command::new("/bin/sleep").arg("20").spawn().unwrap();
 let result=wait_source(&mut child,&stage,&AtomicBool::new(false),std::time::Duration::from_millis(60));
 assert!(child.try_wait().unwrap().is_some(),"must reap own child on failure");
 assert_eq!(result.unwrap_err().code,"source_limit","oversized managed export went undetected until generic timeout");
}
#[test]
fn review_host_replaced_stage_is_never_cleaned_as_owned() {
 let stage=OwnedStage::new().unwrap();let root=stage.root.clone();let moved=root.with_extension("review-moved");
 std::fs::rename(&root,&moved).unwrap();std::fs::create_dir(&root).unwrap();std::fs::write(root.join("sentinel"),b"REVIEW_SYNTHETIC").unwrap();
 assert!(!stage.intact());assert!(stage.read_export(0).is_err());drop(stage);
 assert_eq!(std::fs::read(root.join("sentinel")).unwrap(),b"REVIEW_SYNTHETIC");std::fs::remove_dir_all(root).unwrap();std::fs::remove_dir_all(moved).unwrap();
}
fn prepared()->apple_import::PreparedBatch { apple_import::prepare(vec![SourceNote{id:"review-account\0review-note".into(),folders:vec![SourceFolder{id:"review-account".into(),name:"合成账户".into()}],title:"合成标题".into(),html:"<p>合成正文</p>".into(),plain_text:"合成正文".into(),created_at_ms:100,updated_at_ms:200,status:"ok".into(),attachments:vec![]}]).unwrap() }
#[test]
fn review_host_real_session_rechecks_token_and_emits_single_quiet_metadata_commit() {
 let temp=tempfile::tempdir().unwrap();let mut session=crate::session::Session::new(crate::store::Store::open(temp.path()).unwrap());
 let w=session.workspace().unwrap();let token:Token=serde_json::from_value(json!({"sessionId":w["access"]["sessionId"],"epoch":w["access"]["epoch"],"noteEpoch":null})).unwrap();
 let mut stale=token.clone();stale.epoch+=1;assert!(session.append_apple_notes(prepared(),&stale).is_err());assert!(session.store.notes().unwrap().is_empty());assert_eq!(session.workspace().unwrap()["metadata"]["sequence"],0);assert!(session.take_metadata_event().is_none());
 let committed=session.append_apple_notes(prepared(),&token).unwrap();assert_eq!(committed["metadata"]["sequence"],1);assert!(session.take_metadata_event().is_some());let repeat=session.append_apple_notes(prepared(),&token).unwrap();assert_eq!(repeat["results"][0]["status"],"existing");assert_eq!(repeat["metadata"]["sequence"],1);assert!(session.take_metadata_event().is_none());
}
