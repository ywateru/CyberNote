//! Real plugin setup and host extension on Tauri's no-window MockRuntime.
//! Trusted CLI fixture paths are not IPC arguments. No replacement copy implementation is used.
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::json;
use std::{fs, io::Write, path::PathBuf};
use tauri::{
    test::{mock_builder, mock_context, noop_assets},
    utils::config::AppDirectoriesOverride,
};
use tauri_plugin_notes_scan::{
    session::{Mode, MAX_READ_BYTES},
    NotesScanExt, Request,
};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        return Err("usage: host_copy_probe FIXTURE_IMAGE NEW_PRIVATE_ROOT".into());
    }
    let root = PathBuf::from(&args[2]);
    // Refuse reused roots: fixture corruption and cleanup must never affect unrelated data.
    fs::create_dir(&root)?;
    let root = root.canonicalize()?;
    let mut context = mock_context(noop_assets());
    context.config_mut().identifier = "com.local.notesscan.host-copy-probe".into();
    context.config_mut().app.app_directories_override =
        Some(AppDirectoriesOverride::Root(root.join("app")));
    let app = mock_builder()
        .plugin(tauri_plugin_notes_scan::init())
        .build(context)?;
    tauri::async_runtime::block_on(async {
        // These are the actual extension and managed plugin state used by a Rust host.
        let scan = app.notes_scan();
        let begin = scan.execute(Request::Begin { mode: Mode::Text }).await?;
        let id = begin["sessionId"].as_str().unwrap().to_owned();
        let imported = scan
            .execute(Request::IngestImage {
                session_id: id.clone(),
                data: B64.encode(fs::read(&args[1])?),
            })
            .await?;
        let token = imported["files"][0]["token"].as_str().unwrap().to_owned();
        let staging = root.join("host-staging");
        fs::create_dir(&staging)?;
        let draft_target = staging.join("draft.bin");
        let draft_error = scan
            .copy_file_to(&id, &token, &draft_target)
            .await
            .unwrap_err();
        assert_eq!(draft_error.code, "session_state");
        assert!(!draft_target.exists());
        let recognized = scan
            .execute(Request::Recognize {
                session_id: id.clone(),
                file_token: token.clone(),
            })
            .await?;
        assert_eq!(recognized["ocr"]["status"], "recognized");
        assert_eq!(
            recognized["ocr"]["text"],
            "离线文字识别\n备忘录扫描测试\n本地保存 2026"
        );
        let ready = scan
            .execute(Request::Finish {
                session_id: id.clone(),
            })
            .await?;
        let source = root.join("app/scan-sessions").join(&id).join(&token);
        let expected = fs::read(&source)?;
        assert_eq!(
            expected.len() as u64,
            ready["files"][0]["size"].as_u64().unwrap()
        );
        assert!(
            expected.len() > MAX_READ_BYTES as usize,
            "use --noise-border fixture to exercise multiple chunks"
        );

        let occupied = staging.join("occupied.bin");
        let sentinel = b"existing host attachment must survive";
        fs::write(&occupied, sentinel)?;
        let existing_error = scan.copy_file_to(&id, &token, &occupied).await.unwrap_err();
        assert_eq!(existing_error.code, "io");
        assert_eq!(fs::read(&occupied)?, sentinel);

        // Corrupt only this private fixture's backing resource AFTER ready. The real copier creates
        // its target, then detects the inconsistent EOF; no production injection hook is involved.
        let failed_target = staging.join("failed.bin");
        fs::OpenOptions::new()
            .write(true)
            .open(&source)?
            .set_len(expected.len() as u64 - 17)?;
        let failure = scan
            .copy_file_to(&id, &token, &failed_target)
            .await
            .unwrap_err();
        assert_eq!(failure.code, "native");
        assert!(!failed_target.exists());
        let after_failure = scan
            .execute(Request::Get {
                session_id: id.clone(),
            })
            .await?;
        assert_eq!(after_failure["state"], "ready");
        let mut restored = fs::OpenOptions::new()
            .write(true)
            .truncate(true)
            .open(&source)?;
        restored.write_all(&expected)?;
        restored.sync_all()?;
        drop(restored);

        let destination = staging.join("committed-image.png");
        let copied = scan.copy_file_to(&id, &token, &destination).await?;
        assert_eq!(copied, expected.len() as u64);
        assert_eq!(fs::read(&destination)?, expected);
        // Copy completion must retain the ready session until the host explicitly acknowledges.
        assert_eq!(
            scan.execute(Request::Get {
                session_id: id.clone()
            })
            .await?["state"],
            "ready"
        );
        assert_eq!(
            B64.decode(
                scan.execute(Request::ReadFile {
                    session_id: id.clone(),
                    file_token: token.clone(),
                    offset: 0,
                    length: 32
                })
                .await?["data"]
                    .as_str()
                    .unwrap()
            )?,
            expected[..32]
        );
        scan.execute(Request::Acknowledge {
            session_id: id.clone(),
        })
        .await?;
        let after_ack = scan
            .execute(Request::ReadFile {
                session_id: id.clone(),
                file_token: token,
                offset: 0,
                length: 32,
            })
            .await
            .unwrap_err();
        assert_eq!(after_ack.code, "session_missing");
        assert!(!source.parent().unwrap().exists());
        assert_eq!(fs::read(&destination)?, expected);
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({
                "runtime":"tauri::test::MockRuntime; real plugin init + NotesScanExt + copy_file_to",
                "fixture":args[1],"privateRoot":root,"ocr":recognized["ocr"],"copiedBytes":copied,
                "readChunkLimit":MAX_READ_BYTES,"minimumReadChunks":copied.div_ceil(MAX_READ_BYTES as u64),
                "draftRefusal":draft_error,"existingTargetRefusal":existing_error,
                "existingTargetPreserved":true,"truncatedResourceError":failure,"failedTargetRemoved":true,
                "sessionRetainedAfterFailure":true,"fullBytesEqual":true,"readyRetainedUntilAcknowledge":true,
                "sourceRemovedAfterAcknowledge":true,"hostCopySurvivesAcknowledge":true,"afterAcknowledgeError":after_ack,
                "destination":destination,
                "limits":"No WebView invoke, real GUI runtime, main Store transaction, process crash, Android, or forced network-off tested."
            }))?
        );
        Ok::<_, Box<dyn std::error::Error>>(())
    })
}
