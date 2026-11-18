// Included into the snapshot's tests; private tempdir and synthetic key only.
#[test]
fn review_replaced_lock_file_does_not_allow_two_live_owners() {
    let temp=tempfile::tempdir().unwrap(); let path=root(&temp);
    let mut first=EncryptedFileStore::open(&path,cipher(7),StoreMode::CreateNew).unwrap();
    first.replace(b"fixture identity").unwrap();
    fs::remove_file(path.join("exclusive.lock")).unwrap();
    let second=EncryptedFileStore::open(&path,cipher(7),StoreMode::Existing);
    let first_still_reads=first.load().is_ok();
    let two_live=second.is_ok() && first_still_reads;
    drop(second); drop(first);
    assert!(!two_live,"replacing lock path allows a second owner while original owner remains usable");
}
