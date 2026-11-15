use crate::session::Token;
use crate::store::Result;
use crate::{failure, AppState};
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::Manager;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum FileAction {
    Copy,
    Open,
    Reveal,
    Share,
    ReadClipboard,
}

fn prepare(
    session: &crate::session::Session,
    action: FileAction,
    id: Option<String>,
    note_id: Option<String>,
    expected: &Token,
) -> Result<Value> {
    let input = if matches!(action, FileAction::ReadClipboard) {
        let note = note_id.ok_or_else(|| failure("缺少粘贴目标"))?;
        session.sensitive(&note, expected)?;
        json!({"action":"readClipboard"})
    } else {
        let id = id.ok_or_else(|| failure("缺少附件身份"))?;
        let owner = session.store.attachment_note(&id)?;
        session.sensitive(&owner, expected)?;
        let (info, bytes) = session.store.attachment_export_bytes(&id)?;
        let action = match action {
            FileAction::Copy => "copy",
            FileAction::Open => "open",
            FileAction::Reveal => "reveal",
            FileAction::Share => "share",
            _ => unreachable!(),
        };
        use base64::Engine;
        json!({"action":action,"name":info.name,"mime":info.mime,"data":base64::engine::general_purpose::STANDARD.encode(bytes)})
    };
    Ok(input)
}

#[tauri::command]
pub(crate) async fn attachment_desktop(
    action: FileAction,
    id: Option<String>,
    note_id: Option<String>,
    expected: Token,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<Value> {
    if crate::recording_window::recording_label(window.label()) {
        return Err(failure("当前窗口不支持附件文件操作"));
    }
    #[cfg(target_os = "macos")]
    {
        let (send, receive) = tokio::sync::oneshot::channel();
        let host = app.clone();
        app.run_on_main_thread(move || {
            let result = (|| {
                let state = host.state::<AppState>();
                let session = state.0 .0.lock().map_err(|_| failure("数据锁错误"))?;
                let input = prepare(&session, action, id, note_id, &expected)?;
                // Keep the access guard through clipboard publication/system handoff.
                tauri_plugin_notes_ui::attachment_desktop(&input).map_err(|e| failure(e.message))
            })();
            let _ = send.send(result);
        })
        .map_err(|e| failure(e.to_string()))?;
        receive.await.map_err(|_| failure("附件系统操作中断"))?
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (action, id, note_id, expected, app);
        Err(failure("此系统暂不支持附件目录与系统剪贴板操作"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{session::Session, store::Store};
    fn token(session: &Session, note: &str) -> Token {
        let snapshot = session.snapshot().unwrap();
        Token {
            session_id: snapshot["sessionId"].as_str().unwrap().into(),
            epoch: snapshot["epoch"].as_u64().unwrap(),
            note_epoch: Some(snapshot["notes"][note]["epoch"].as_u64().unwrap()),
        }
    }
    #[test]
    fn desktop_files_preserve_original_and_require_current_owner_authority() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(dir.path()).unwrap();
        let note = store.action(json!({"type":"createNote"})).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_owned();
        let original = b"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'/>";
        let attachment = store
            .store_attachment(&note, "vector.svg", "image/svg+xml", original.to_vec())
            .unwrap();
        assert_eq!(
            std::fs::read(
                dir.path()
                    .join("attachments")
                    .join(&attachment.relative_path)
            )
            .unwrap(),
            original
        );
        drop(store);
        let session = Session::new(Store::open(dir.path()).unwrap());
        let good = token(&session, &note);
        for action in [
            FileAction::Copy,
            FileAction::Open,
            FileAction::Reveal,
            FileAction::Share,
        ] {
            let input =
                prepare(&session, action, Some(attachment.id.clone()), None, &good).unwrap();
            assert_eq!(input["name"], "vector.svg");
            assert_eq!(input["mime"], "image/svg+xml");
            use base64::Engine;
            assert_eq!(
                base64::engine::general_purpose::STANDARD
                    .decode(input["data"].as_str().unwrap())
                    .unwrap(),
                original
            );
        }
        let mut stale = good.clone();
        stale.note_epoch = Some(good.note_epoch.unwrap() + 1);
        assert!(prepare(
            &session,
            FileAction::Copy,
            Some(attachment.id.clone()),
            None,
            &stale
        )
        .is_err());
        assert!(prepare(
            &session,
            FileAction::ReadClipboard,
            None,
            Some(note.clone()),
            &stale
        )
        .is_err());
        assert!(prepare(
            &session,
            FileAction::Open,
            Some("missing".into()),
            None,
            &good
        )
        .is_err());
        assert_eq!(
            prepare(&session, FileAction::ReadClipboard, None, Some(note), &good).unwrap(),
            json!({"action":"readClipboard"})
        );
    }
}
