use super::*;
use crate::session::{Session, Token};
use rusqlite::hooks::{AuthAction, AuthContext, Authorization};

fn token(session: &Session, note: Option<&str>) -> Token {
    let access = session.snapshot().unwrap();
    Token {
        session_id: access["sessionId"].as_str().unwrap().into(),
        epoch: access["epoch"].as_u64().unwrap(),
        note_epoch: note.map(|id| access["notes"][id]["epoch"].as_u64().unwrap()),
    }
}
fn barrier(session: &mut Session, action: Value) -> (Result<Value>, Value) {
    let t = token(session, None);
    let event = session.begin(action, Default::default(), &t).unwrap();
    session
        .finish(
            event["operationId"].as_str().unwrap(),
            &Default::default(),
            false,
        )
        .unwrap()
}
#[test]
fn purge_and_cancel_cleanup_errors_keep_real_commit_receipts_and_access_commit() {
    let temp = tempfile::tempdir().unwrap();
    let mut store = Store::open(temp.path()).unwrap();
    let id = store.action(json!({"type":"createNote"})).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let a = store
        .store_attachment(&id, "kept.txt", "text/plain", b"kept".to_vec())
        .unwrap();
    store.action(json!({"type":"deleteNote","id":id})).unwrap();
    let path = store.attachment_path(&a.relative_path).unwrap();
    fs::remove_file(&path).unwrap();
    fs::create_dir(&path).unwrap();
    let mut session = Session::new(store);
    let (result, event) = barrier(&mut session, json!({"type":"purgeNote","id":id}));
    let error = result.unwrap_err();
    assert_eq!(error.code, "filesystem");
    assert_eq!(error.commit.as_ref().unwrap()["metadata"]["sequence"], 1);
    assert_eq!(event["phase"], "commit");
    assert!(session.store.note(&id).is_err());
    assert_eq!(
        session.take_metadata_event().unwrap()["metadata"]["sequence"],
        1
    );
    assert!(session.take_metadata_event().is_none());
    let t = token(&session, None);
    session
        .ordinary(json!({"type":"settings","settings":{}}), &t)
        .unwrap();
    assert!(session.take_metadata_event().is_none());

    let id = session
        .ordinary(json!({"type":"createNote"}), &t)
        .unwrap()
        .0["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let t = token(&session, Some(&id));
    let op = Uuid::new_v4().to_string();
    let stored = session
        .store_attachment_operation(
            "main",
            &op,
            &id,
            "kept.txt",
            "text/plain",
            b"kept",
            &t,
            None,
        )
        .unwrap();
    let path = session
        .store
        .attachment_path(stored["attachment"]["relativePath"].as_str().unwrap())
        .unwrap();
    fs::remove_file(&path).unwrap();
    fs::create_dir(&path).unwrap();
    let before = session.metadata()["sequence"].as_u64().unwrap();
    let error = session
        .cancel_attachment_operation("main", &op, &id, &t)
        .unwrap_err();
    assert_eq!(error.code, "filesystem");
    assert_eq!(error.commit.unwrap()["metadata"]["sequence"], before + 1);
    assert_eq!(session.store.attachments().unwrap().len(), 0);
    assert_eq!(
        session.take_metadata_event().unwrap()["metadata"]["sequence"],
        before + 1
    );
    let retry = session
        .cancel_attachment_operation("main", &op, &id, &t)
        .unwrap_err();
    assert!(retry.commit.is_none());
    assert_eq!(session.metadata()["sequence"], before + 1);
    assert!(session.take_metadata_event().is_none());
}
#[test]
fn actual_sql_rollback_is_not_a_commit_even_after_prior_success() {
    let temp = tempfile::tempdir().unwrap();
    let mut store = Store::open(temp.path()).unwrap();
    let folder = store
        .action(json!({"type":"createFolder","name":"kept"}))
        .unwrap();
    let id = store
        .action(json!({"type":"createNote","folderId":folder["id"]}))
        .unwrap()["id"]
        .clone();
    store.db.execute_batch("CREATE TRIGGER deny_folder_delete BEFORE DELETE ON folders BEGIN SELECT RAISE(ABORT,'real rollback'); END;").unwrap();
    let mut session = Session::new(store);
    let before = session.workspace().unwrap();
    let (result, event) = barrier(
        &mut session,
        json!({"type":"deleteFolder","id":folder["id"]}),
    );
    let error = result.unwrap_err();
    assert_eq!(error.code, "database");
    assert!(error.commit.is_none());
    assert_eq!(event["phase"], "abort");
    assert_eq!(session.metadata()["sequence"], 0);
    assert_eq!(session.workspace().unwrap(), before);
    assert_eq!(
        session.store.note(id.as_str().unwrap()).unwrap().folder_id,
        folder["id"].as_str().unwrap()
    );
    assert!(session.take_metadata_event().is_none());
}
#[test]
fn response_read_failures_after_commit_preserve_created_id_revision_and_sequence() {
    let temp = tempfile::tempdir().unwrap();
    let store = Store::open(temp.path()).unwrap();
    let mut session = Session::new(store);
    let t = token(&session, None);
    session
        .store
        .db
        .authorizer(Some(|ctx: AuthContext<'_>| match ctx.action {
            AuthAction::Read {
                table_name: "notes",
                ..
            } => Authorization::Deny,
            _ => Authorization::Allow,
        }));
    let error = session
        .ordinary(json!({"type":"createNote"}), &t)
        .unwrap_err();
    assert_eq!(error.code, "database");
    let commit = error.commit.unwrap();
    let created = commit["receipt"]["createdId"].as_str().unwrap();
    assert_eq!(commit["metadata"]["sequence"], 1);
    assert_eq!(commit["receipt"]["changes"][0]["revision"], 0);
    session
        .store
        .db
        .authorizer(None::<fn(AuthContext<'_>) -> Authorization>);
    assert!(session.store.note(created).is_ok());
    assert_eq!(
        session.take_metadata_event().unwrap()["metadata"]["sequence"],
        1
    );
    let folder = session
        .ordinary(json!({"type":"createFolder","name":"old"}), &t)
        .unwrap()
        .0;
    session
        .store
        .db
        .authorizer(Some(|ctx: AuthContext<'_>| match ctx.action {
            AuthAction::Read {
                table_name: "settings",
                ..
            } => Authorization::Deny,
            _ => Authorization::Allow,
        }));
    let error = session
        .ordinary(
            json!({"type":"renameFolder","id":folder["id"],"name":"new"}),
            &t,
        )
        .unwrap_err();
    assert_eq!(error.commit.unwrap()["metadata"]["sequence"], 3);
    assert_eq!(
        session
            .store
            .folder(folder["id"].as_str().unwrap())
            .unwrap()
            .name,
        "new"
    );
    assert_eq!(
        session.take_metadata_event().unwrap()["metadata"]["sequence"],
        3
    );
}
#[test]
fn lock_checkpoint_failure_preserves_access_commit_and_metadata_receipt() {
    let temp = tempfile::tempdir().unwrap();
    let mut store = Store::open(temp.path()).unwrap();
    let id = store.action(json!({"type":"createNote"})).unwrap()["id"].clone();
    store
        .db
        .authorizer(Some(|ctx: AuthContext<'_>| match ctx.action {
            AuthAction::Pragma {
                pragma_name: "wal_checkpoint",
                ..
            } => Authorization::Deny,
            _ => Authorization::Allow,
        }));
    let mut session = Session::new(store);
    let (result, event) = barrier(
        &mut session,
        json!({"type":"lockNote","id":id,"password":"abcdef"}),
    );
    let error = result.unwrap_err();
    assert_eq!(error.code, "lock_committed");
    assert_eq!(event["phase"], "commit");
    assert_eq!(error.commit.unwrap()["metadata"]["sequence"], 1);
    assert_eq!(
        session.take_metadata_event().unwrap()["metadata"]["sequence"],
        1
    );
    assert!(session.store.note(id.as_str().unwrap()).unwrap().locked);
}
