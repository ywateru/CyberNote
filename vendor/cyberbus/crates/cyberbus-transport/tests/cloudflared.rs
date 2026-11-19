#![cfg(all(feature = "cloudflared", unix))]
use cyberbus_transport::{CloudflareRelay, CloudflareRelayConfig, CloudflareRelayState};
use std::{os::unix::fs::PermissionsExt, path::PathBuf, time::Duration};

struct Fixture(PathBuf);
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
impl Fixture {
    fn new(registered: bool) -> Self {
        let path = std::env::temp_dir().join(format!("cyberbus-official-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&path).unwrap();
        let script = format!(
            "#!/bin/sh\nprintf '%s\\n' \"$$\" \"$@\" > '{}/receipt'\nprintf '%s\\n' 'https://fixture.trycloudflare.com' >&2\n{}\nexec /bin/sleep 60\n",
            path.display(),
            if registered {
                "printf '%s\\n' 'Registered tunnel connection' >&2"
            } else {
                ""
            }
        );
        std::fs::write(path.join("cloudflared"), script).unwrap();
        std::fs::set_permissions(
            path.join("cloudflared"),
            std::fs::Permissions::from_mode(0o700),
        )
        .unwrap();
        Self(path)
    }
    fn config(&self) -> CloudflareRelayConfig {
        CloudflareRelayConfig {
            executable: self.0.join("cloudflared"),
            startup_timeout: Duration::from_secs(2),
            ..Default::default()
        }
    }
    async fn receipt(&self) -> String {
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                if let Ok(text) = std::fs::read_to_string(self.0.join("receipt")) {
                    if text.ends_with('\n') {
                        return text;
                    }
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap()
    }
    async fn assert_clean(&self) {
        let text = self.receipt().await;
        let lines: Vec<_> = text.lines().collect();
        assert!(lines.windows(2).any(|w| w == ["--config", "/dev/null"]));
        assert!(lines.windows(2).any(|w| w == ["--protocol", "http2"]));
        let url: url::Url = lines.last().unwrap().parse().unwrap();
        let port = url.port().unwrap();
        tokio::time::timeout(Duration::from_secs(10), async {
            loop {
                let pid_exited = !std::process::Command::new("/bin/kill")
                    .args(["-0", lines[0]])
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .status()
                    .unwrap()
                    .success();
                let port_free = tokio::net::TcpListener::bind(("127.0.0.1", port))
                    .await
                    .is_ok();
                if pid_exited && port_free {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .expect("owned connector reaped and origin port released");
    }
}

#[tokio::test]
async fn registered_connector_close_and_drop_reap_child_and_release_origin() {
    for explicit in [true, false] {
        let fixture = Fixture::new(true);
        let relay = CloudflareRelay::start(fixture.config()).await.unwrap();
        assert_eq!(relay.endpoint(), "wss://fixture.trycloudflare.com/");
        assert_eq!(
            *relay.subscribe_state().borrow(),
            CloudflareRelayState::Ready
        );
        if explicit {
            relay.close().await.unwrap();
            relay.close().await.unwrap();
        }
        drop(relay);
        fixture.assert_clean().await;
    }
}

#[tokio::test]
async fn url_without_registration_times_out_and_cancelled_start_cleans_up() {
    let fixture = Fixture::new(false);
    assert!(CloudflareRelay::start(fixture.config()).await.is_err());
    fixture.assert_clean().await;
    let fixture = Fixture::new(false);
    let task = tokio::spawn(CloudflareRelay::start(fixture.config()));
    fixture.receipt().await;
    task.abort();
    let _ = task.await;
    fixture.assert_clean().await;
}

#[tokio::test]
async fn running_connector_exit_is_observable_and_reaped() {
    let fixture = Fixture::new(true);
    let path = fixture.0.join("cloudflared");
    let script = std::fs::read_to_string(&path)
        .unwrap()
        .replace("exec /bin/sleep 60", "exec /bin/sleep 0.2");
    std::fs::write(path, script).unwrap();
    let relay = CloudflareRelay::start(fixture.config()).await.unwrap();
    let mut state = relay.subscribe_state();
    tokio::time::timeout(Duration::from_secs(5), async {
        while *state.borrow_and_update() != CloudflareRelayState::Failed {
            state.changed().await.unwrap();
        }
    })
    .await
    .unwrap();
    assert!(relay.close().await.is_err());
    fixture.assert_clean().await;
}
