use crate::{
    local_backup::*,
    session::{Session, Token},
    store::Store,
};
use serde_json::json;
use std::{collections::HashSet, fs};

fn token(session: &Session) -> Token {
    let access = session.snapshot().unwrap();
    Token {
        session_id: access["sessionId"].as_str().unwrap().into(),
        epoch: access["epoch"].as_u64().unwrap(),
        note_epoch: None,
    }
}
#[test]
fn local_backup_store_roundtrip_settings_documents_original_bytes_and_barrier_import() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    let mut source = Store::open(root.join("source")).unwrap();
    let note = source.action(json!({"type":"createNote"})).unwrap();
    let original = vec![0, 255, 1, 0, 128, 254, 3, 9, 10];
    let attachment = source
        .store_attachment(
            note["id"].as_str().unwrap(),
            "原字节.bin",
            "application/octet-stream",
            original.clone(),
        )
        .unwrap();
    source.action(json!({"type":"saveNote","id":note["id"],"revision":0,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"完整中文正文\nsecond line"}]},{"type":"attachment","attrs":{"id":attachment.id,"kind":"file","name":"原字节.bin"}}]}})).unwrap();
    source.action(json!({"type":"settings","settings":{"theme":"dark","view":"gallery","groupDates":false,"customSetting":{"explicitZero":0,"explicitFalse":false}}})).unwrap();
    let expected = source.workspace().unwrap();
    let source = Session::new(source);
    let exported = root.join("export.notesbackup");
    source.export_archive(&exported, &token(&source)).unwrap();
    let bytes = fs::read(&exported).unwrap();
    // Real archive is an allowlisted logical export, not a directory copy.
    let parsed: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    let mut keys = parsed
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect::<Vec<_>>();
    keys.sort();
    assert_eq!(
        keys,
        [
            "attachments",
            "blobs",
            "folders",
            "notes",
            "settings",
            "version"
        ]
    );
    let sealed = seal_archive(&bytes, "isolated-fixture-passphrase").unwrap();
    assert!(open_encrypted_archive(&sealed, "wrong").is_err());
    assert_eq!(
        open_encrypted_archive(&sealed, "isolated-fixture-passphrase").unwrap(),
        bytes
    );
    // Put the actual Store-exported bytes through the production backup codec.
    let directory =
        crate::local_backup::files::Directory::open(&root.join("backups"), true).unwrap();
    let version = crate::local_backup::files::publish(
        &directory,
        &bytes,
        "isolated-library",
        "0.1.0",
        123,
        BackupReason::Manual,
        7,
    )
    .unwrap();
    let (_, decoded) = crate::local_backup::files::read_backup(&directory, &version.name).unwrap();
    assert_eq!(version.manifest.archive_bytes, bytes.len());
    assert_eq!(decoded, bytes);
    let staged = root.join("restored.notesbackup");
    fs::write(&staged, decoded).unwrap();
    let mut target = Session::new(Store::open(root.join("target")).unwrap());
    let live = target
        .ordinary(json!({"type":"createNote"}), &token(&target))
        .unwrap()
        .0;
    let windows: HashSet<String> = ["main".into()].into();
    let begin = target
        .begin(
            json!({"type":"importArchive","path":staged}),
            windows.clone(),
            &token(&target),
        )
        .unwrap();
    let operation = begin["operationId"].as_str().unwrap();
    assert!(!target.ready());
    target.acknowledge(operation, "main", true).unwrap();
    assert!(target.ready());
    target
        .finish(operation, &windows, false)
        .unwrap()
        .0
        .unwrap();
    let workspace = target.workspace().unwrap();
    assert_eq!(workspace["settings"], expected["settings"]);
    assert!(workspace["notes"]
        .as_array()
        .unwrap()
        .iter()
        .any(|n| n["id"] == live["id"]));
    assert_eq!(
        workspace["notes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|n| n["id"] == note["id"])
            .unwrap()["document"],
        expected["notes"][0]["document"]
    );
    let imported = &workspace["attachments"][0];
    assert_eq!(
        fs::read(
            root.join("target/attachments")
                .join(imported["relativePath"].as_str().unwrap())
        )
        .unwrap(),
        original
    );
}
