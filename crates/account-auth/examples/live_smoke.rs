//! Explicit macOS Rust-owner smoke check. Never invoked by ordinary library tests.
//! Uses the product's loopback implementation without operating the product runtime.
#[cfg(target_os = "macos")]
#[path = "../../../src-tauri/src/account/callback.rs"]
mod callback;

#[cfg(target_os = "macos")]
mod macos {
    use super::callback;
    use account_auth::{AccessToken, AuthClient, AuthError, Identity, PinnedConfig};
    use std::{
        fs::{self, DirBuilder},
        future::Future,
        io::{self, Write},
        os::unix::fs::{DirBuilderExt, MetadataExt},
        path::{Path, PathBuf},
        process::{ExitCode, Stdio},
        time::Duration,
    };
    use tokio::{
        process::Command,
        signal::unix::{signal, SignalKind},
    };
    use tokio_util::sync::CancellationToken;
    use url::Url;
    const PROFILE_URL: &str = "https://cybernote-sync.vercel.app/api/v1/account/profile";
    const MAX_PROFILE_BYTES: usize = 16 * 1024;

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Profile {
        schema_version: u32,
        issuer: String,
        subject: String,
        product_id: String,
        workspace_id: String,
    }

    struct Failure {
        stage: &'static str,
        code: &'static str,
    }

    fn failure(stage: &'static str, code: &'static str) -> Failure {
        Failure { stage, code }
    }

    // Only static labels and booleans can reach output. No underlying errors/URLs.
    fn event(stage: &'static str, ok: bool, code: &'static str, retained: bool) {
        let mut value = serde_json::json!({"stage": stage, "ok": ok, "code": code,
            "owner_retained": retained});
        if stage == "restore" && ok {
            value["same_subject"] = true.into();
        }
        if stage == "restore_empty" && ok {
            value["restored_none"] = true.into();
            value["cleanup_required"] = false.into();
        }
        if ok
            && matches!(
                stage,
                "profile_initial" | "profile_refresh" | "profile_reopen"
            )
        {
            value["verified"] = true.into();
            value["sameOwner"] = true.into();
            if stage != "profile_initial" {
                value["workspaceStable"] = true.into();
            }
        }
        let mut output = io::stdout().lock();
        // A closed output pipe must not panic and discard an in-memory owner.
        let _ = writeln!(output, "{value}");
    }

    fn auth_code(error: AuthError) -> &'static str {
        match error {
            AuthError::Configuration => "auth_configuration",
            AuthError::Network => "auth_network",
            AuthError::InvalidCallback => "auth_invalid_callback",
            AuthError::InvalidIdentity => "auth_invalid_identity",
            AuthError::CodeExchangeRejected => "auth_code_rejected",
            AuthError::TokenResponseInvalid => "auth_token_response_invalid",
            AuthError::MissingRefreshToken => "auth_refresh_missing",
            AuthError::Cancelled => "cancelled",
            AuthError::NoSession => "auth_no_session",
            AuthError::OwnershipMismatch => "auth_owner_mismatch",
            AuthError::Storage => "auth_storage",
            AuthError::RefreshFailed => "auth_refresh_failed",
            AuthError::RevocationFailed => "auth_revocation_failed",
            AuthError::Busy => "auth_busy",
        }
    }

    fn config() -> Result<PinnedConfig, Failure> {
        let parse = |value: &str| Url::parse(value).map_err(|_| failure("config", "invalid_pin"));
        Ok(PinnedConfig {
            issuer: parse("https://auth.x.aixgg.com/oidc")?,
            client_id: "il4abzwbu1ohjwv5mb667".into(),
            resource: parse("https://cybernote.app/api")?,
            redirect_uris: vec![
                parse(callback::REDIRECT)?,
                parse("com.local.notesclone.auth://callback")?,
            ],
        })
    }

    fn new_owner_directory() -> Result<PathBuf, Failure> {
        let mut args = std::env::args_os().skip(1);
        let directory = args
            .next()
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
            .ok_or_else(|| failure("arguments", "expected_new_absolute_owner_directory"))?;
        if args.next().is_some() {
            return Err(failure("arguments", "expected_one_argument"));
        }
        let parent = directory
            .parent()
            .ok_or_else(|| failure("owner", "invalid_directory"))?;
        // Require the exact canonical parent (use /private/tmp, not the /tmp alias).
        if fs::canonicalize(parent).map_err(|_| failure("owner", "invalid_parent"))? != parent {
            return Err(failure("owner", "noncanonical_parent"));
        }
        DirBuilder::new()
            .mode(0o700)
            .create(&directory)
            .map_err(|_| failure("owner", "directory_must_be_new"))?;
        let meta = fs::symlink_metadata(&directory)
            .map_err(|_| failure("owner", "directory_check_failed"))?;
        if !meta.is_dir()
            || meta.uid() != unsafe { libc::geteuid() }
            || meta.mode() & 0o7777 != 0o700
        {
            return Err(failure("owner", "unsafe_directory"));
        }
        Ok(directory)
    }

    // Cancellation drains the future: refresh/logout have owned tasks that must settle.
    async fn await_auth<T>(
        stage: &'static str,
        operation: impl Future<Output = Result<T, AuthError>>,
        stop: &CancellationToken,
    ) -> Result<T, Failure> {
        if stop.is_cancelled() {
            return Err(failure(stage, "cancelled"));
        }
        tokio::pin!(operation);
        tokio::select! {
            biased;
            _ = stop.cancelled() => {
                let _ = operation.await;
                Err(failure(stage, "cancelled"))
            }
            result = &mut operation => result.map_err(|e| failure(stage, auth_code(e))),
        }
    }

    async fn open_browser(url: &Url, stop: &CancellationToken) -> Result<(), Failure> {
        if stop.is_cancelled() {
            return Err(failure("browser", "cancelled"));
        }
        let mut child = Command::new("/usr/bin/open")
            .arg(url.as_str())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .map_err(|_| failure("browser", "open_failed"))?;
        let result = tokio::select! {
            biased;
            _ = stop.cancelled() => Err(failure("browser", "cancelled")),
            status = tokio::time::timeout(Duration::from_secs(15), child.wait()) => {
                match status {
                    Ok(Ok(status)) if status.success() => Ok(()),
                    _ => Err(failure("browser", "open_failed")),
                }
            }
        };
        if result.is_err() {
            let _ = child.kill().await;
            let _ = child.wait().await;
        }
        result
    }

    fn decode_profile(
        stage: &'static str,
        bytes: &[u8],
        identity: &Identity,
        previous: Option<&Profile>,
    ) -> Result<Profile, Failure> {
        if bytes.len() > MAX_PROFILE_BYTES {
            return Err(failure(stage, "profile_too_large"));
        }
        let profile: Profile =
            serde_json::from_slice(bytes).map_err(|_| failure(stage, "profile_invalid_schema"))?;
        if profile.schema_version != 1
            || profile.issuer != identity.issuer
            || profile.subject != identity.subject
            || profile.product_id.trim().is_empty()
            || profile.workspace_id.trim().is_empty()
        {
            return Err(failure(stage, "profile_invalid_owner_or_schema"));
        }
        if let Some(previous) = previous {
            if profile.issuer != previous.issuer
                || profile.subject != previous.subject
                || profile.product_id != previous.product_id
            {
                return Err(failure(stage, "profile_owner_changed"));
            }
            if profile.workspace_id != previous.workspace_id {
                return Err(failure(stage, "profile_workspace_changed"));
            }
        }
        Ok(profile)
    }

    async fn profile(
        stage: &'static str,
        client: &reqwest::Client,
        access: &AccessToken,
        identity: &Identity,
        previous: Option<&Profile>,
        stop: &CancellationToken,
    ) -> Result<Profile, Failure> {
        if stop.is_cancelled() {
            return Err(failure(stage, "cancelled"));
        }
        let request = async {
            let mut response = client
                .get(PROFILE_URL)
                .bearer_auth(access.secret())
                .send()
                .await
                .map_err(|_| failure(stage, "profile_network"))?;
            if response.status() != reqwest::StatusCode::OK {
                return Err(failure(stage, "profile_http_status"));
            }
            if response
                .content_length()
                .is_some_and(|n| n > MAX_PROFILE_BYTES as u64)
            {
                return Err(failure(stage, "profile_too_large"));
            }
            let mut bytes = zeroize::Zeroizing::new(Vec::new());
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|_| failure(stage, "profile_network"))?
            {
                if chunk.len() > MAX_PROFILE_BYTES - bytes.len() {
                    return Err(failure(stage, "profile_too_large"));
                }
                bytes.extend_from_slice(&chunk);
            }
            decode_profile(stage, &bytes, identity, previous)
        };
        // A read-only GET can be cancelled; no refresh/rotation owner is abandoned.
        tokio::select! {
            biased;
            _ = stop.cancelled() => Err(failure(stage, "cancelled")),
            result = request => {
                let profile = result?;
                event(stage, true, "profile_verified", true);
                Ok(profile)
            }
        }
    }

    async fn exercise(
        owner: &mut Option<AuthClient>,
        path: &Path,
        cfg: &PinnedConfig,
        listener: &callback::Callback,
        stop: &CancellationToken,
    ) -> Result<(), Failure> {
        let auth = owner
            .as_ref()
            .ok_or_else(|| failure("owner", "owner_unavailable"))?;
        let redirect =
            Url::parse(callback::REDIRECT).map_err(|_| failure("config", "invalid_pin"))?;
        let (transaction, authorization) = await_auth(
            "authorization",
            auth.begin_authorization(redirect, false),
            stop,
        )
        .await?;
        event("authorization", true, "ready", true);
        open_browser(&authorization, stop).await?;
        drop(authorization);
        event("browser", true, "opened", true);
        let value = tokio::select! {
            biased;
            _ = stop.cancelled() => return Err(failure("callback", "cancelled")),
            value = listener.wait() => value.map_err(|_| failure("callback", "callback_failed_or_timed_out"))?,
        };
        let callback = Url::parse(&value).map_err(|_| failure("callback", "invalid_callback"))?;
        drop(value);
        let cancellation = transaction.cancellation_handle();
        let identity = {
            let completion = auth.complete_callback(transaction, callback);
            tokio::pin!(completion);
            tokio::select! {
                biased;
                _ = stop.cancelled() => {
                    cancellation.cancel();
                    let _ = completion.await;
                    return Err(failure("callback", "cancelled"));
                }
                value = &mut completion => value.map_err(|e| failure("callback", auth_code(e)))?,
            }
        };
        event("callback", true, "verified", true);
        let client = reqwest::Client::builder()
            .https_only(true)
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|_| failure("profile_initial", "profile_client_failed"))?;
        let initial_access = await_auth(
            "profile_initial",
            auth.access_token(Duration::ZERO, false),
            stop,
        )
        .await?;
        let initial_profile = profile(
            "profile_initial",
            &client,
            &initial_access,
            &identity,
            None,
            stop,
        )
        .await?;
        drop(initial_access);
        let access = await_auth(
            "refresh",
            auth.access_token(Duration::from_secs(30), true),
            stop,
        )
        .await?;
        event("refresh", true, "forced_refresh_succeeded", true);
        profile(
            "profile_refresh",
            &client,
            &access,
            &identity,
            Some(&initial_profile),
            stop,
        )
        .await?;
        drop(access);
        drop(owner.take());
        event("restart", true, "owner_closed", true);
        *owner = Some(
            AuthClient::new(cfg.clone(), path)
                .await
                .map_err(|e| failure("restart", auth_code(e)))?,
        );
        let reopened = owner
            .as_ref()
            .ok_or_else(|| failure("restart", "owner_unavailable"))?;
        let restored = await_auth("restore", reopened.restore(), stop).await?;
        if !restored.is_some_and(|restored| {
            restored.subject == identity.subject && restored.issuer == identity.issuer
        }) {
            return Err(failure("restore", "subject_mismatch"));
        }
        event("restore", true, "same_subject", true);
        let access = await_auth(
            "profile_reopen",
            reopened.access_token(Duration::ZERO, false),
            stop,
        )
        .await?;
        profile(
            "profile_reopen",
            &client,
            &access,
            &identity,
            Some(&initial_profile),
            stop,
        )
        .await?;
        drop(access);
        Ok(())
    }

    // Do not exit on cleanup failure: a failed rotation checkpoint may exist only
    // in this owner's memory. SIGINT/SIGTERM request cleanup, never discard it.
    async fn cleanup(owner: &mut Option<AuthClient>, path: &Path, cfg: &PinnedConfig) -> bool {
        let mut had_failure = false;
        loop {
            if owner.is_none() {
                match AuthClient::new(cfg.clone(), path).await {
                    Ok(client) => *owner = Some(client),
                    Err(_) => {
                        had_failure = true;
                        event("cleanup", false, "owner_reopen_failed_retrying", true);
                        tokio::time::sleep(Duration::from_secs(5)).await;
                        continue;
                    }
                }
            }
            if let Some(auth) = owner.as_ref() {
                match auth.logout().await {
                    Ok(()) => {
                        event("logout", true, "logout_succeeded", false);
                        if matches!(auth.restore().await, Ok(None))
                            && !auth.cleanup_required().await
                        {
                            event("restore_empty", true, "none_and_cleanup_false", false);
                            return had_failure;
                        }
                        event("cleanup", false, "unexpected_owner_state_retrying", true);
                    }
                    Err(error) => event("cleanup", false, auth_code(error), true),
                }
            }
            had_failure = true;
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    }

    pub async fn run() -> ExitCode {
        let directory = match new_owner_directory() {
            Ok(path) => path,
            Err(error) => {
                event(error.stage, false, error.code, false);
                return ExitCode::FAILURE;
            }
        };
        let cfg = match config() {
            Ok(cfg) => cfg,
            Err(error) => {
                event(error.stage, false, error.code, false);
                return ExitCode::FAILURE;
            }
        };
        let (mut interrupt, mut terminate) = match (
            signal(SignalKind::interrupt()),
            signal(SignalKind::terminate()),
        ) {
            (Ok(a), Ok(b)) => (a, b),
            _ => {
                event("signals", false, "signal_setup_failed", false);
                return ExitCode::FAILURE;
            }
        };
        let stop = CancellationToken::new();
        let signal_stop = stop.clone();
        tokio::spawn(async move {
            tokio::select! { _ = interrupt.recv() => {}, _ = terminate.recv() => {} }
            signal_stop.cancel();
        });
        let path = directory.join("grant.json");
        let mut owner = match AuthClient::new(cfg.clone(), &path).await {
            Ok(client) => Some(client),
            Err(error) => {
                // No discovery, browser, code exchange or grant request has happened.
                event("owner", false, auth_code(error), false);
                return ExitCode::FAILURE;
            }
        };
        event("owner", true, "new_private_owner_ready", true);
        let result = match callback::Callback::start().await {
            Ok(listener) => {
                let lease = callback::Lease(listener.clone());
                event("listener", true, "bound_before_authorization", true);
                let result = exercise(&mut owner, &path, &cfg, &listener, &stop).await;
                listener.cancel();
                let _ = listener.wait().await;
                drop(lease);
                result
            }
            Err(_) => Err(failure("listener", "callback_port_unavailable")),
        };
        if let Err(error) = &result {
            event(error.stage, false, error.code, true);
        }
        let cleanup_failed = cleanup(&mut owner, &path, &cfg).await;
        let success = result.is_ok() && !cleanup_failed;
        event(
            "complete",
            success,
            if success {
                "rust_owner_smoke_passed"
            } else {
                "rust_owner_smoke_failed"
            },
            false,
        );
        if success {
            ExitCode::SUCCESS
        } else {
            ExitCode::FAILURE
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::sync::{
            atomic::{AtomicBool, Ordering},
            Arc,
        };

        fn profile_fixture() -> (Identity, serde_json::Value) {
            let identity = Identity {
                issuer: "https://fixture.example/oidc".into(),
                subject: "fixture-subject".into(),
                display_name: "Fixture".into(),
                username: None,
            };
            let value = serde_json::json!({"schemaVersion": 1, "issuer": identity.issuer,
                "subject": identity.subject, "productId": "fixture-product", "workspaceId": "fixture-workspace"});
            (identity, value)
        }

        #[test]
        fn profile_rejects_wrong_schema_owner_empty_workspace_and_oversized_body() {
            let (identity, value) = profile_fixture();
            let bytes = serde_json::to_vec(&value).unwrap();
            assert!(decode_profile("profile_initial", &bytes, &identity, None).is_ok());
            for (field, replacement) in [
                ("schemaVersion", serde_json::json!(2)),
                ("issuer", serde_json::json!("https://other.example/oidc")),
                ("subject", serde_json::json!("other-subject")),
                ("workspaceId", serde_json::json!("")),
                ("workspaceId", serde_json::json!(" \n\t")),
                ("productId", serde_json::json!("")),
            ] {
                let mut bad = value.clone();
                bad[field] = replacement;
                assert!(decode_profile(
                    "profile_initial",
                    &serde_json::to_vec(&bad).unwrap(),
                    &identity,
                    None
                )
                .is_err());
            }
            let mut missing = value;
            missing.as_object_mut().unwrap().remove("workspaceId");
            assert!(decode_profile(
                "profile_initial",
                &serde_json::to_vec(&missing).unwrap(),
                &identity,
                None
            )
            .is_err());
            let mut oversized = bytes;
            oversized.resize(MAX_PROFILE_BYTES + 1, b' ');
            assert_eq!(
                decode_profile("profile_initial", &oversized, &identity, None)
                    .err()
                    .map(|e| e.code),
                Some("profile_too_large")
            );
        }

        #[test]
        fn profile_continuity_requires_same_product_and_workspace() {
            let (identity, value) = profile_fixture();
            let bytes = serde_json::to_vec(&value).unwrap();
            let initial = decode_profile("profile_initial", &bytes, &identity, None)
                .ok()
                .unwrap();
            for stage in ["profile_refresh", "profile_reopen"] {
                assert!(decode_profile(stage, &bytes, &identity, Some(&initial)).is_ok());
                for (field, replacement, code) in [
                    (
                        "workspaceId",
                        "other-workspace",
                        "profile_workspace_changed",
                    ),
                    ("productId", "other-product", "profile_owner_changed"),
                ] {
                    let mut changed = value.clone();
                    changed[field] = replacement.into();
                    assert_eq!(
                        decode_profile(
                            stage,
                            &serde_json::to_vec(&changed).unwrap(),
                            &identity,
                            Some(&initial)
                        )
                        .err()
                        .map(|e| e.code),
                        Some(code)
                    );
                }
            }
        }

        #[tokio::test]
        async fn cancellation_drains_operation_before_cleanup_can_run() {
            let stop = CancellationToken::new();
            let settled = Arc::new(AtomicBool::new(false));
            let completed = settled.clone();
            let entered = Arc::new(tokio::sync::Notify::new());
            let release = Arc::new(tokio::sync::Notify::new());
            let (started, finish, signal) = (entered.clone(), release.clone(), stop.clone());
            let waiter = tokio::spawn(async move {
                await_auth(
                    "refresh",
                    async move {
                        started.notify_one();
                        finish.notified().await;
                        completed.store(true, Ordering::SeqCst);
                        Ok::<_, AuthError>(())
                    },
                    &signal,
                )
                .await
            });
            entered.notified().await;
            stop.cancel();
            tokio::task::yield_now().await;
            assert!(!waiter.is_finished());
            release.notify_one();
            let result = waiter.await.unwrap();
            assert!(matches!(
                result,
                Err(Failure {
                    code: "cancelled",
                    ..
                })
            ));
            assert!(settled.load(Ordering::SeqCst));
        }

        #[tokio::test]
        async fn already_cancelled_does_not_start_another_auth_operation() {
            let stop = CancellationToken::new();
            stop.cancel();
            let mut started = false;
            let result = await_auth(
                "authorization",
                async {
                    started = true;
                    Ok::<_, AuthError>(())
                },
                &stop,
            )
            .await;
            assert!(result.is_err());
            assert!(!started);
        }
    }
}

#[cfg(target_os = "macos")]
#[tokio::main]
async fn main() -> std::process::ExitCode {
    std::panic::set_hook(Box::new(|_| {
        use std::io::Write;
        let _ = writeln!(
            std::io::stderr(),
            "{{\"stage\":\"process\",\"ok\":false,\"code\":\"unexpected_panic\"}}"
        );
    }));
    macos::run().await
}

#[cfg(not(target_os = "macos"))]
fn main() -> std::process::ExitCode {
    println!("{{\"stage\":\"platform\",\"ok\":false,\"code\":\"macos_required\"}}");
    std::process::ExitCode::FAILURE
}
