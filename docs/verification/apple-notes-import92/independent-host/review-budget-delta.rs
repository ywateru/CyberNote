use super::*;
#[test]
fn review_host_budget_delta_real_free_space_and_managed_file_types() {
 let stage=OwnedStage::new().unwrap();
 // Real statvfs admission on this filesystem, never fake or fill the disk.
 stage.check_budget().unwrap();
 let f0=std::fs::File::create(stage.export_path(0).unwrap()).unwrap();f0.set_len(50*1024*1024).unwrap();
 let f1=std::fs::File::create(stage.export_path(1).unwrap()).unwrap();f1.set_len(50*1024*1024).unwrap();
 stage.check_budget().unwrap();f1.set_len(50*1024*1024+1).unwrap();assert_eq!(stage.check_budget().unwrap_err().code,"source_limit");
 f0.set_len(3).unwrap();f1.set_len(0).unwrap();assert_eq!(stage.read_export_bounded(0,2).unwrap_err().code,"source_limit");
 let unknown=stage.root.join("unexpected-package");std::fs::create_dir(&unknown).unwrap();assert_eq!(stage.check_budget().unwrap_err().code,"source_stage");std::fs::remove_dir(unknown).unwrap();
 std::fs::remove_file(stage.export_path(1).unwrap()).unwrap();std::fs::create_dir(stage.export_path(1).unwrap()).unwrap();assert_eq!(stage.check_budget().unwrap_err().code,"source_attachment");std::fs::remove_dir(stage.export_path(1).unwrap()).unwrap();
 let outside=tempfile::tempdir().unwrap();std::fs::write(outside.path().join("sentinel"),b"REVIEW_ONLY").unwrap();
 #[cfg(unix)] {
  std::os::unix::fs::symlink(outside.path(),stage.export_path(1).unwrap()).unwrap();assert_eq!(stage.check_budget().unwrap_err().code,"source_attachment");
  // New recursive cleanup must remove its own link/package, not follow it.
  let root=stage.root.clone();drop(stage);assert!(!root.exists());assert_eq!(std::fs::read(outside.path().join("sentinel")).unwrap(),b"REVIEW_ONLY");
 }
}
