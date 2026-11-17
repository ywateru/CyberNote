#![allow(dead_code)]
// Test doubles only for desktop authority; all Registry/Process code is production.
#[path = "../../src-tauri/src/agent_tester/mod.rs"]
mod agent_tester;
#[cfg(test)]
use agent_tester::process;
#[path = "../../src-tauri/src/agent_host/types.rs"]
mod agent_host;
mod session {
    #[derive(Clone)]
    pub struct Token {
        pub session_id: String,
        pub epoch: u64,
        pub note_epoch: Option<u64>,
    }
}
mod agent_desktop {
    use super::*;
    pub struct Desktop {
        pub testers: std::sync::Arc<agent_tester::Registry>,
        pub settings: std::sync::Mutex<agent_host::HostSettings>,
        pub active: std::sync::atomic::AtomicBool,
        pub epoch: std::sync::atomic::AtomicU64,
    }
    impl Desktop {
        pub async fn settings(
            &self,
            token: &session::Token,
            label: &str,
        ) -> Result<agent_host::HostSettings, ()> {
            if token.session_id != "window-token"
                || token.epoch != self.epoch.load(std::sync::atomic::Ordering::SeqCst)
                || label != "main"
                || !self.active.load(std::sync::atomic::Ordering::SeqCst)
            {
                return Err(());
            }
            Ok(self.settings.lock().unwrap().clone())
        }
    }
}
#[cfg(test)]
mod tests {
    use super::process::*;
    use serde_json::json;
    use std::{path::Path, time::Duration};
    fn fixture(mode: &str) -> Process {
        Process::spawn(
            Path::new("/usr/bin/python3"),
            &[
                format!("{}/fixture.py", env!("CARGO_MANIFEST_DIR")),
                mode.into(),
            ],
        )
        .unwrap()
    }
    #[tokio::test]
    async fn handshake_catalog_call_and_reap() {
        let mut p = fixture("ok");
        assert_eq!(p.initialize().await.unwrap().len(), 9);
        let result = p
            .request(
                "tools/call",
                json!({"name":"notes_get_capabilities", "arguments":{}}),
                Duration::from_secs(2),
            )
            .await
            .unwrap();
        assert_eq!(result["structuredContent"]["fixture"], true);
        p.close().await;
    }
    #[tokio::test]
    async fn rejects_bad_id_oversize_malformed_exit_and_flood() {
        for mode in ["id", "oversize", "malformed", "exit", "flood"] {
            let mut p = fixture(mode);
            assert!(p.initialize().await.is_err(), "{mode}");
            p.close().await;
        }
    }
    #[tokio::test]
    async fn timeout_and_cancellation_destroy_group() {
        let mut p = fixture("hang");
        assert_eq!(
            p.request("initialize", json!({}), Duration::from_millis(80))
                .await,
            Err(Failure::Timeout)
        );
        p.close().await;
        let mut p = fixture("hang");
        tokio::select! { _ = p.initialize() => panic!(), _ = tokio::time::sleep(Duration::from_millis(50)) => {} }
        p.close().await;
    }
    #[tokio::test]
    async fn rejects_relative_command_and_large_input() {
        assert!(Process::spawn(Path::new("python3"), &[]).is_err());
        let mut p = fixture("ok");
        assert_eq!(
            p.request(
                "tools/call",
                json!({"value":"x".repeat(MAX_FRAME)}),
                Duration::from_secs(1)
            )
            .await,
            Err(Failure::Input)
        );
        p.close().await;
    }
}

#[cfg(test)]
mod lifecycle {
    use super::*;
    use serde_json::json;
    use std::{
        sync::{
            atomic::{AtomicBool, Ordering},
            Arc,
        },
        time::Duration,
    };
    fn desktop(workspace: &str) -> Arc<agent_desktop::Desktop> {
        Arc::new(agent_desktop::Desktop {
            testers: Arc::new(agent_tester::Registry::default()),
            active: AtomicBool::new(true),
            epoch: std::sync::atomic::AtomicU64::new(1),
            settings: std::sync::Mutex::new(agent_host::HostSettings {
                enabled: true,
                host_session_id: "host".into(),
                workspace_id: workspace.into(),
                incarnation: "incarnation".into(),
                runtime_dir: "/private/tmp".into(),
                recent_operations: vec![],
                grants: vec![agent_host::GrantInfo {
                    grant_id: "grant".into(),
                    client_id: "client".into(),
                    workspace_id: workspace.into(),
                    incarnation: "incarnation".into(),
                    scopes: ["notes:read".into()].into(),
                    folder_ids: ["folder".into()].into(),
                    expires_at: i64::MAX,
                    revocation: 0,
                    revoked: false,
                    credential_ref: uuid::Uuid::new_v4().to_string(),
                }],
            }),
        })
    }
    fn token() -> session::Token {
        session::Token {
            session_id: "window-token".into(),
            epoch: 1,
            note_epoch: None,
        }
    }
    fn input(workspace: &str) -> agent_tester::Start {
        agent_tester::Start {
            connection_id: uuid::Uuid::new_v4().to_string(),
            binary: format!("{}/fixture.py", env!("CARGO_MANIFEST_DIR")),
            workspace_id: workspace.into(),
            grant_id: "grant".into(),
        }
    }
    async fn call(
        d: &agent_desktop::Desktop,
        id: &str,
        label: &str,
        token: &session::Token,
    ) -> process::Result<agent_tester::Called> {
        d.testers
            .call(
                agent_tester::Call {
                    connection_id: id.into(),
                    tool: "notes_get_capabilities".into(),
                    arguments: serde_json::Map::new(),
                },
                token,
                label,
            )
            .await
    }
    #[tokio::test]
    async fn rejects_window_token_workspace_revoked_and_expired_grants() {
        let d = desktop("workspace");
        assert!(d
            .testers
            .start(&d, input("other"), token(), "main".into())
            .await
            .is_err());
        assert!(d
            .testers
            .start(&d, input("workspace"), token(), "other".into())
            .await
            .is_err());
        let mut bad = token();
        bad.epoch = 2;
        assert!(d
            .testers
            .start(&d, input("workspace"), bad, "main".into())
            .await
            .is_err());
        d.settings.lock().unwrap().grants[0].revoked = true;
        assert!(d
            .testers
            .start(&d, input("workspace"), token(), "main".into())
            .await
            .is_err());
        d.settings.lock().unwrap().grants[0].revoked = false;
        d.settings.lock().unwrap().grants[0].expires_at = 1;
        assert!(d
            .testers
            .start(&d, input("workspace"), token(), "main".into())
            .await
            .is_err());
    }
    #[tokio::test]
    async fn ownership_capacity_cancel_before_start_and_close_during_initialize() {
        let d = desktop("workspace");
        let first = input("workspace");
        let id = first.connection_id.clone();
        d.testers
            .start(&d, first, token(), "main".into())
            .await
            .unwrap();
        assert!(d
            .testers
            .start(&d, input("workspace"), token(), "main".into())
            .await
            .is_err());
        assert!(call(&d, &id, "other", &token()).await.is_err());
        assert!(d.testers.stop(&id, "other", &token()).await.is_err());
        assert!(call(&d, &id, "main", &token()).await.is_ok());
        d.testers.stop(&id, "main", &token()).await.unwrap();
        assert!(call(&d, &id, "main", &token()).await.is_err());
        let next = input("workspace");
        d.testers
            .stop(&next.connection_id, "main", &token())
            .await
            .unwrap();
        assert!(d
            .testers
            .start(&d, next, token(), "main".into())
            .await
            .is_err());
        let d = desktop("hang");
        let start = input("hang");
        let id = start.connection_id.clone();
        let other = d.clone();
        let task = tokio::spawn(async move {
            other
                .testers
                .start(&other, start, token(), "main".into())
                .await
        });
        tokio::time::sleep(Duration::from_millis(80)).await;
        d.testers.stop(&id, "main", &token()).await.unwrap();
        assert!(task.await.unwrap().is_err());
    }
    async fn event(path: &std::path::Path) {
        tokio::time::timeout(Duration::from_secs(2), async {
            while !path.exists() {
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        })
        .await
        .expect("fixture event deadline");
    }
    async fn exited(pids: &[i32]) {
        tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                let mut running = false;
                for pid in pids {
                    // Own child must be reaped, descendants must no longer run.
                    if unsafe { libc::kill(*pid, 0) } == 0 {
                        let status = tokio::process::Command::new("/bin/ps")
                            .args(["-o", "stat=", "-p", &pid.to_string()])
                            .output()
                            .await
                            .unwrap();
                        let state = String::from_utf8_lossy(&status.stdout);
                        if !state.trim().is_empty() && !state.trim().starts_with('Z') {
                            running = true;
                        }
                    }
                }
                if !running {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        })
        .await
        .expect("fixture process/descendant exit deadline");
        assert_eq!(
            unsafe { libc::kill(pids[0], 0) },
            -1,
            "direct child must be reaped before stop returns"
        );
    }
    #[tokio::test]
    async fn monitor_retires_revocation_host_workspace_expiry_and_window_loss() {
        for change in 0..6 {
            let d = desktop("workspace");
            let start = input("workspace");
            let id = start.connection_id.clone();
            d.testers
                .start(&d, start, token(), "main".into())
                .await
                .unwrap();
            match change {
                0 => d.settings.lock().unwrap().grants[0].revoked = true,
                1 => d.settings.lock().unwrap().host_session_id = "new-host".into(),
                2 => d.settings.lock().unwrap().workspace_id = "new-workspace".into(),
                3 => d.settings.lock().unwrap().grants[0].expires_at = 1,
                4 => d.active.store(false, Ordering::SeqCst),
                _ => d.testers.close_window("main"),
            }
            tokio::time::sleep(Duration::from_millis(330)).await;
            assert!(call(&d, &id, "main", &token()).await.is_err());
            d.testers.close_all().await;
        }
        // Gate a real child inside tools/call. Poll the second production call
        // once to deterministically enqueue it before invalidating the session.
        for change in 0..8 {
            let root = tempfile::tempdir_in("/private/tmp").unwrap();
            let d = desktop("gate");
            d.settings.lock().unwrap().runtime_dir = root.path().to_str().unwrap().into();
            let initial = d.settings.lock().unwrap().clone();
            let start = input("gate");
            let id = start.connection_id.clone();
            d.testers
                .start(&d, start, token(), "main".into())
                .await
                .unwrap();
            let other = d.clone();
            let first_id = id.clone();
            let first =
                tokio::spawn(async move { call(&other, &first_id, "main", &token()).await });
            event(&root.path().join("entered")).await;
            let pids: Vec<i32> =
                serde_json::from_slice(&std::fs::read(root.path().join("pids.json")).unwrap())
                    .unwrap();
            let owner = token();
            let mut queued = Box::pin(call(&d, &id, "main", &owner));
            std::future::poll_fn(|cx| {
                assert!(std::future::Future::poll(queued.as_mut(), cx).is_pending());
                std::task::Poll::Ready(())
            })
            .await;
            assert!(matches!(
                call(&d, &id, "main", &token()).await,
                Err(process::Failure::Busy)
            ));
            match change {
                0 => d.testers.stop(&id, "main", &token()).await.unwrap(),
                1 => d.settings.lock().unwrap().grants[0].revoked = true,
                2 => d.settings.lock().unwrap().incarnation = "changed".into(),
                3 => d.settings.lock().unwrap().grants[0]
                    .folder_ids
                    .insert("new-folder".into())
                    .then_some(())
                    .unwrap(),
                4 => d.epoch.store(2, Ordering::SeqCst),
                5 => d.testers.close_window("main"),
                6 => d.testers.close_all().await,
                _ => d.settings.lock().unwrap().enabled = false,
            }
            assert!(tokio::time::timeout(Duration::from_secs(2), first)
                .await
                .unwrap()
                .unwrap()
                .is_err());
            assert!(tokio::time::timeout(Duration::from_secs(2), queued)
                .await
                .unwrap()
                .is_err());
            d.testers.close_all().await;
            exited(&pids).await;
            assert_eq!(
                std::fs::read_to_string(root.path().join("requests.log"))
                    .unwrap()
                    .lines()
                    .count(),
                1,
                "queued request must never reach the child"
            );
            *d.settings.lock().unwrap() = initial;
            d.epoch.store(1, Ordering::SeqCst);
            // Returning done really releases the slot: a fresh UUID can initialize
            // and call through a fresh process, without accepting either old result.
            let next = input("gate");
            let next_id = next.connection_id.clone();
            d.testers
                .start(&d, next, token(), "main".into())
                .await
                .unwrap();
            let next_pids: Vec<i32> =
                serde_json::from_slice(&std::fs::read(root.path().join("pids.json")).unwrap())
                    .unwrap();
            std::fs::write(root.path().join("release"), b"go").unwrap();
            assert!(call(&d, &next_id, "main", &token()).await.is_ok());
            d.testers.stop(&next_id, "main", &token()).await.unwrap();
            exited(&next_pids).await;
        }
    }
    #[tokio::test]
    async fn actual_adapter_stdio_to_isolated_private_ipc() {
        use std::{fs, os::unix::fs::PermissionsExt};
        use tokio::{
            io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
            net::UnixListener,
        };
        let binary = std::env::var("MCP_TEST_ADAPTER")
            .expect("set MCP_TEST_ADAPTER to an installed cybernote-mcp");
        let temp = tempfile::tempdir_in("/private/tmp").unwrap();
        let root = temp.path().canonicalize().unwrap();
        fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).unwrap();
        fs::create_dir(root.join("credentials")).unwrap();
        fs::set_permissions(root.join("credentials"), fs::Permissions::from_mode(0o700)).unwrap();
        let socket = root.join("h.sock");
        let listener = UnixListener::bind(&socket).unwrap();
        fs::set_permissions(&socket, fs::Permissions::from_mode(0o600)).unwrap();
        let key = uuid::Uuid::new_v4().to_string();
        let file = root.join(format!("credentials/{key}.json"));
        fs::write(&file, json!({"version":1,"workspaceId":"isolated-fixture","clientId":"fixture-client","credential":"fixture-only-secret","socketPath":socket}).to_string()).unwrap();
        fs::set_permissions(file, fs::Permissions::from_mode(0o600)).unwrap();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut reader = BufReader::new(stream);
            let mut frame = String::new();
            reader.read_line(&mut frame).await.unwrap();
            let req: serde_json::Value = serde_json::from_str(&frame).unwrap();
            assert_eq!(req["workspaceId"], "isolated-fixture");
            assert_eq!(req["credential"], "fixture-only-secret");
            assert_eq!(req["tool"], "notes_list_folders");
            let reply = json!({"version":1,"requestId":req["requestId"],"isError":false,"result":{"items":[{"id":"fixture-folder","name":"Fixture","ancestorLabels":[]}],"nextCursor":null}});
            reader
                .get_mut()
                .write_all(format!("{reply}\n").as_bytes())
                .await
                .unwrap();
        });
        let args = vec![
            "--workspace-id".into(),
            "isolated-fixture".into(),
            "--credential-ref".into(),
            key,
            "--runtime-dir".into(),
            root.to_str().unwrap().into(),
        ];
        let mut p = process::Process::spawn(std::path::Path::new(&binary), &args).unwrap();
        assert_eq!(p.initialize().await.unwrap().len(), 9);
        let result = p
            .request(
                "tools/call",
                json!({"name":"notes_list_folders","arguments":{"limit":1}}),
                Duration::from_secs(5),
            )
            .await
            .unwrap();
        assert_eq!(
            result["structuredContent"]["items"][0]["id"],
            "fixture-folder"
        );
        assert_ne!(result["isError"], true);
        assert!(!result.to_string().contains("fixture-only-secret"));
        p.close().await;
        server.await.unwrap();
    }
}
