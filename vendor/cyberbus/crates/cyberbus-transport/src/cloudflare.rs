//! Official cloudflared process plus a loopback-only, no-IP EasyTier relay.
use crate::{CancellationToken, Error};
use easytier::instance::factory::{NativeCoreInstance, create_native_dataplane_instance};
use easytier_core::config::toml::{ConfigLoader, NetworkIdentity, TomlConfig};
use std::{path::PathBuf, process::Stdio, sync::Arc, time::Duration};
use tokio::{
    io::AsyncReadExt,
    process::Command,
    sync::{oneshot, watch},
    time::Instant,
};

#[derive(Clone, Copy, Debug, Default)]
pub enum ConnectorProtocol {
    #[default]
    Http2,
    Quic,
}
#[derive(Clone, Debug)]
pub struct CloudflareRelayConfig {
    /// Host-installed official executable. No download, account login or shell.
    pub executable: PathBuf,
    pub protocol: ConnectorProtocol,
    pub startup_timeout: Duration,
}
impl Default for CloudflareRelayConfig {
    fn default() -> Self {
        Self {
            executable: "cloudflared".into(),
            protocol: ConnectorProtocol::Http2,
            startup_timeout: Duration::from_secs(60),
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CloudflareRelayState {
    Starting,
    Ready,
    Failed,
    Closed,
}

/// Independent relay host. Share endpoint() with every SDK participant before
/// NetworkStart. It is not tied to an account and does not discover other URLs.
pub struct CloudflareRelay {
    endpoint: String,
    stop: CancellationToken,
    state: watch::Receiver<CloudflareRelayState>,
    closed: watch::Receiver<bool>,
}
impl Drop for CloudflareRelay {
    fn drop(&mut self) {
        self.stop.cancel();
    }
}
impl CloudflareRelay {
    /// Cancellation-safe: dropping this future requests cleanup by its owner task.
    pub async fn start(config: CloudflareRelayConfig) -> Result<Self, Error> {
        if config.executable.as_os_str().is_empty()
            || config.startup_timeout.is_zero()
            || config.startup_timeout > Duration::from_secs(120)
        {
            return Err(Error::InvalidConfig(
                "invalid official connector configuration",
            ));
        }
        let (ready, rx) = oneshot::channel();
        let (state, status) = watch::channel(CloudflareRelayState::Starting);
        let (closed, done) = watch::channel(false);
        let mut relay = Self {
            endpoint: String::new(),
            stop: CancellationToken::new(),
            state: status,
            closed: done,
        };
        let stop = relay.stop.clone();
        tokio::spawn(async move {
            let result = own(config, stop.clone(), ready, &state).await;
            state.send_replace(if result.is_err() {
                CloudflareRelayState::Failed
            } else {
                CloudflareRelayState::Closed
            });
            closed.send_replace(true);
        });
        match rx.await {
            Ok(endpoint) => {
                relay.endpoint = endpoint;
                relay.state.borrow_and_update();
                Ok(relay)
            }
            Err(_) => {
                relay.close().await?;
                Err(Error::Backend(
                    "official Cloudflare connector startup failed".into(),
                ))
            }
        }
    }
    pub fn endpoint(&self) -> &str {
        &self.endpoint
    }
    pub fn subscribe_state(&self) -> watch::Receiver<CloudflareRelayState> {
        self.state.clone()
    }
    /// Idempotent. A separate owner kills/reaps the child and stops the relay,
    /// even when the close future is cancelled. Keep the Tokio runtime alive.
    pub async fn close(&self) -> Result<(), Error> {
        self.stop.cancel();
        let mut done = self.closed.clone();
        while !*done.borrow_and_update() {
            done.changed().await.map_err(|_| Error::Closed)?;
        }
        if *self.state.borrow() == CloudflareRelayState::Failed {
            return Err(Error::Backend("official Cloudflare relay failed".into()));
        }
        Ok(())
    }
}

fn native_relay() -> Result<Arc<NativeCoreInstance>, Error> {
    let c = TomlConfig::default();
    c.set_network_identity(NetworkIdentity {
        network_name: "cyberbus-cloudflare-relay".into(),
        network_secret: Some(uuid::Uuid::new_v4().to_string()),
        network_secret_digest: None,
    });
    c.set_listeners(vec!["ws://127.0.0.1:0".parse().expect("static URL")]);
    c.set_dhcp(false);
    let mut f = c.get_flags();
    f.no_tun = true;
    f.use_smoltcp = true;
    f.enable_ipv6 = false;
    f.disable_upnp = true;
    f.disable_p2p = true;
    f.disable_udp_hole_punching = true;
    f.disable_tcp_hole_punching = true;
    f.relay_network_whitelist = "*".into();
    f.encryption_algorithm = "aes-gcm".into();
    f.multi_thread = true;
    f.multi_thread_count = 2;
    c.set_flags(f);
    c.set_stun_servers(Some(vec![]));
    c.set_stun_servers_v6(Some(vec![]));
    c.set_tcp_stun_servers(Some(vec![]));
    create_native_dataplane_instance(c).map_err(crate::backend)
}

// Bounded byte scanner: connector log lines are not trusted framing and can be
// arbitrarily long. Drain stderr for the complete lifetime without logging it.
#[derive(Default)]
struct Registration {
    tail: String,
    endpoint: Option<String>,
    registered: bool,
}
impl Registration {
    fn feed(&mut self, bytes: &[u8]) {
        self.tail.push_str(&String::from_utf8_lossy(bytes));
        if self.tail.contains("Registered tunnel connection") {
            self.registered = true;
        }
        for word in self.tail.split_whitespace() {
            if let Some(host) = word.strip_prefix("https://") {
                let endpoint = format!("wss://{}/", host.trim_end_matches('/'));
                if crate::fallback::anonymous_endpoint(&endpoint).is_some() {
                    self.endpoint = Some(endpoint);
                }
            }
        }
        if self.tail.len() > 16384 {
            let start = self
                .tail
                .char_indices()
                .find(|(i, _)| *i >= self.tail.len() - 8192)
                .map(|(i, _)| i)
                .unwrap_or(0);
            self.tail.drain(..start);
        }
    }
}

async fn own(
    config: CloudflareRelayConfig,
    stop: CancellationToken,
    ready: oneshot::Sender<String>,
    state: &watch::Sender<CloudflareRelayState>,
) -> Result<(), Error> {
    let native = native_relay()?;
    let deadline = Instant::now() + config.startup_timeout;
    let result = async {
        tokio::select! { biased;
            _=stop.cancelled()=>return Ok(()),
            _=tokio::time::sleep_until(deadline)=>return Err(Error::Deadline),
            r=native.start()=>r.map_err(crate::backend)?,
        }
        let port = native.running_listeners().into_iter().find(|u| u.scheme() == "ws").and_then(|u| u.port()).ok_or_else(|| Error::Backend("loopback WS relay missing".into()))?;
        let mut command = Command::new(&config.executable);
        // An inherited named-tunnel token must not change this anonymous host.
        for (key, _) in std::env::vars_os() {
            if key.to_string_lossy().starts_with("TUNNEL_") || key.to_string_lossy().starts_with("CLOUDFLARED_") { command.env_remove(key); }
        }
        let mut child = command.args(["tunnel", "--config", if cfg!(windows) { "NUL" } else { "/dev/null" }, "--no-autoupdate", "--protocol", match config.protocol { ConnectorProtocol::Http2 => "http2", ConnectorProtocol::Quic => "quic" }, "--url", &format!("http://127.0.0.1:{port}")])
            .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped())
            .kill_on_drop(true).spawn().map_err(|_| Error::Backend("cannot start official cloudflared executable".into()))?;
        let mut stderr = child.stderr.take().expect("piped stderr");
        let mut scanner = Registration::default();
        let mut ready = Some(ready);
        let mut buffer = [0u8; 4096];
        let result = loop {
            tokio::select! { biased;
                _=stop.cancelled()=>break Ok(()),
                _=tokio::time::sleep_until(deadline), if ready.is_some()=>break Err(Error::Deadline),
                _=child.wait()=>break Err(Error::Backend("official connector exited".into())),
                r=stderr.read(&mut buffer)=>match r {
                    Ok(0) | Err(_)=>break Err(Error::Backend("official connector log closed".into())),
                    Ok(n)=>{
                        scanner.feed(&buffer[..n]);
                        if scanner.registered {
                            if let Some(endpoint) = scanner.endpoint.as_ref() {
                                if let Some(sender) = ready.take() {
                                    state.send_replace(CloudflareRelayState::Ready);
                                    if sender.send(endpoint.clone()).is_err() { break Ok(()); }
                                }
                            }
                        }
                    }
                }
            }
        };
        // kill is async and reaps the child. Do not rely on kill_on_drop alone.
        let cleanup = async {
            if child.try_wait()?.is_none() { child.kill().await?; }
            child.wait().await?;
            Ok::<_, std::io::Error>(())
        }.await;
        if cleanup.is_err() { return Err(Error::Backend("official connector cleanup failed".into())); }
        result
    }.await;
    native.stop().await;
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fragmented_registration_is_bounded_and_requires_verified_url() {
        let mut r = Registration::default();
        r.feed(b"https://example.org\nhttps://test.trycloud");
        assert!(r.endpoint.is_none());
        r.feed(b"flare.com\nRegistered tunnel connec");
        assert_eq!(r.endpoint.as_deref(), Some("wss://test.trycloudflare.com/"));
        assert!(!r.registered);
        r.feed(b"tion\n");
        assert!(r.registered);
        for _ in 0..100 {
            r.feed(&[b'x'; 4096]);
        }
        assert!(r.tail.len() <= 16384);
    }
    #[tokio::test]
    async fn missing_official_executable_fails_and_cleans_up() {
        let result = tokio::time::timeout(
            Duration::from_secs(10),
            CloudflareRelay::start(CloudflareRelayConfig {
                executable: "/nonexistent/cyberbus-cloudflared".into(),
                ..Default::default()
            }),
        )
        .await;
        assert!(matches!(result, Ok(Err(_))));
    }
}
