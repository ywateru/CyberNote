//! Embedded EasyTier v2.7.1 native IPv4 TCP, without a system TUN or OS service proxy.
mod address;
mod fallback;
mod stream;
pub use fallback::CloudflareFallback;
#[cfg(feature = "cloudflared")]
mod cloudflare;
pub use address::{AddressPool, conflicts};
#[cfg(feature = "cloudflared")]
pub use cloudflare::{
    CloudflareRelay, CloudflareRelayConfig, CloudflareRelayState, ConnectorProtocol,
};
pub use stream::{AsyncStream, BoxStream};
pub use tokio_util::sync::CancellationToken;

use easytier::instance::factory::{NativeCoreInstance, create_native_dataplane_instance};
use easytier_core::{
    config::toml::{ConfigLoader, NetworkIdentity, PeerConfig, TomlConfig},
    gateway::DataPlaneTcpListener,
};
use std::{
    net::{Ipv4Addr, SocketAddr, SocketAddrV4},
    sync::Arc,
    time::Duration,
};
use tokio::{
    sync::{RwLock, watch},
    time::Instant,
};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("invalid transport configuration: {0}")]
    InvalidConfig(&'static str),
    #[error("transport closed")]
    Closed,
    #[error("operation cancelled")]
    Cancelled,
    #[error("operation deadline elapsed")]
    Deadline,
    #[error("address is not ready or its generation changed")]
    AddressChanged,
    #[error("address conflict retry budget exhausted")]
    Conflict,
    #[error("destination is not a unique remote route in the address pool")]
    NoRoute,
    #[error("EasyTier operation failed: {0}")]
    Backend(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

/// The caller supplies already-derived credentials. Debug deliberately redacts secrets.
#[derive(Clone)]
pub struct TransportConfig {
    pub network_name: String,
    pub network_secret: String,
    pub installation_id: [u8; 32],
    pub peers: Vec<String>,
    pub listeners: Vec<String>,
    pub address_pool: AddressPool,
    pub preferred_ipv4: Option<Ipv4Addr>,
    pub enable_p2p: bool,
    pub cloudflare_fallback: Option<CloudflareFallback>,
}
impl TransportConfig {
    pub fn new(network_name: String, network_secret: String, installation_id: [u8; 32]) -> Self {
        Self {
            network_name,
            network_secret,
            installation_id,
            peers: vec![],
            listeners: vec!["tcp://0.0.0.0:0".into(), "udp://0.0.0.0:0".into()],
            address_pool: AddressPool::default(),
            preferred_ipv4: None,
            enable_p2p: true,
            cloudflare_fallback: None,
        }
    }
    fn native(&self, ip: Ipv4Addr) -> Result<TomlConfig, Error> {
        if let Some(fallback) = &self.cloudflare_fallback {
            if !cfg!(feature = "websocket") {
                return Err(Error::InvalidConfig(
                    "Cloudflare fallback requires websocket feature",
                ));
            }
            fallback.validate()?;
        }
        if self.network_name.is_empty() || self.network_secret.is_empty() {
            return Err(Error::InvalidConfig(
                "network name and secret must be nonempty",
            ));
        }
        if !self.address_pool.contains(ip) {
            return Err(Error::InvalidConfig(
                "preferred IPv4 is outside the usable pool",
            ));
        }
        if self.peers.len() > 64 || self.listeners.len() > 8 {
            return Err(Error::InvalidConfig("too many endpoints"));
        }
        fn endpoint(s: &str) -> Result<url::Url, Error> {
            let u: url::Url = s
                .parse()
                .map_err(|_| Error::InvalidConfig("invalid endpoint URL"))?;
            let supported = matches!(u.scheme(), "tcp" | "udp")
                || (cfg!(feature = "websocket") && matches!(u.scheme(), "ws" | "wss"));
            if !supported
                || u.host_str().is_none()
                || u.port_or_known_default().is_none()
                || !u.username().is_empty()
                || u.as_str().contains('@')
                || u.query().is_some()
            {
                return Err(Error::InvalidConfig(
                    "unsupported transport endpoint or missing host/port",
                ));
            }
            Ok(u)
        }
        let config = TomlConfig::default();
        config.set_network_identity(NetworkIdentity {
            network_name: self.network_name.clone(),
            network_secret: Some(self.network_secret.clone()),
            network_secret_digest: None,
        });
        // Installation ID is only an address preference seed, not an EasyTier peer ID or authentication claim.
        config.set_id(uuid::Uuid::new_v4());
        config.set_hostname(Some("cyberbus".into()));
        config.set_ipv4(Some(
            format!("{ip}/{}", self.address_pool.prefix())
                .parse()
                .map_err(|_| Error::InvalidConfig("invalid pool"))?,
        ));
        config.set_dhcp(false);
        config.set_peers(
            self.peers
                .iter()
                .map(|s| {
                    Ok(PeerConfig {
                        uri: endpoint(s)?,
                        peer_public_key: None,
                    })
                })
                .collect::<Result<_, Error>>()?,
        );
        config.set_listeners(
            self.listeners
                .iter()
                .map(|s| endpoint(s))
                .collect::<Result<_, _>>()?,
        );
        let mut flags = config.get_flags();
        flags.no_tun = true;
        flags.use_smoltcp = true;
        flags.enable_ipv6 = false;
        flags.disable_upnp = true;
        flags.enable_exit_node = false;
        flags.accept_dns = false;
        flags.disable_p2p = !self.enable_p2p;
        flags.disable_udp_hole_punching = !self.enable_p2p;
        flags.disable_tcp_hole_punching = true;
        flags.encryption_algorithm = "aes-gcm".into();
        flags.multi_thread = true;
        flags.multi_thread_count = 2;
        config.set_flags(flags);
        // Deterministic/offline test mode: never contact external STUN services.
        if !self.enable_p2p {
            config.set_stun_servers(Some(vec![]));
            config.set_stun_servers_v6(Some(vec![]));
            config.set_tcp_stun_servers(Some(vec![]));
        }
        Ok(config)
    }
}
impl std::fmt::Debug for TransportConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TransportConfig")
            .field("credentials", &"[REDACTED]")
            .field("address_pool", &self.address_pool)
            .finish_non_exhaustive()
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AddressPhase {
    Tentative,
    Ready,
    Changing,
    Conflict,
    Failed,
    Closed,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TransportStatus {
    pub ipv4: Ipv4Addr,
    pub peer_id: u32,
    pub generation: u64,
    pub phase: AddressPhase,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RouteCandidate {
    pub peer_id: u32,
    pub ipv4: Ipv4Addr,
    pub next_hop_peer_id: u32,
    /// EasyTier path length; greater than one means an indirect route.
    pub cost: i32,
}
struct Generation {
    token: CancellationToken,
}
struct Inner {
    native: Arc<NativeCoreInstance>,
    gate: RwLock<Generation>,
    shutdown: CancellationToken,
    status: watch::Sender<TransportStatus>,
    pool: AddressPool,
}
/// Owns one EasyTier instance. Share with Arc if needed; dropping it requests shutdown.
pub struct Transport {
    inner: Arc<Inner>,
}
impl Drop for Transport {
    fn drop(&mut self) {
        self.inner.shutdown.cancel();
    }
}
impl Transport {
    pub async fn start(config: TransportConfig) -> Result<Self, Error> {
        let ip = config.preferred_ipv4.unwrap_or_else(|| {
            config
                .address_pool
                .candidate(&config.network_name, &config.installation_id, 0)
        });
        let native_config = config.native(ip)?;
        let native = create_native_dataplane_instance(native_config).map_err(backend)?;
        if let Err(e) = native.start().await {
            native.stop().await;
            return Err(backend(e));
        }
        let status = TransportStatus {
            ipv4: ip,
            peer_id: native.peer_id(),
            generation: 1,
            phase: AddressPhase::Tentative,
        };
        let inner = Arc::new(Inner {
            native,
            gate: RwLock::new(Generation {
                token: CancellationToken::new(),
            }),
            shutdown: CancellationToken::new(),
            status: watch::channel(status).0,
            pool: config.address_pool,
        });
        tokio::spawn(maintain(inner.clone(), config));
        Ok(Self { inner })
    }
    pub fn status(&self) -> TransportStatus {
        self.inner.status.borrow().clone()
    }
    pub fn subscribe_status(&self) -> watch::Receiver<TransportStatus> {
        self.inner.status.subscribe()
    }
    pub fn running_listeners(&self) -> Vec<String> {
        self.inner
            .native
            .running_listeners()
            .into_iter()
            .filter(|u| matches!(u.scheme(), "tcp" | "udp" | "ws" | "wss"))
            .map(|u| u.to_string())
            .collect()
    }
    pub async fn wait_ready(
        &self,
        deadline: Instant,
        cancel: &CancellationToken,
    ) -> Result<TransportStatus, Error> {
        let mut rx = self.subscribe_status();
        loop {
            let status = rx.borrow_and_update().clone();
            match status.phase {
                AddressPhase::Ready => return Ok(status),
                AddressPhase::Closed => return Err(Error::Closed),
                AddressPhase::Conflict => return Err(Error::Conflict),
                AddressPhase::Failed => {
                    return Err(Error::Backend("address maintenance failed".into()));
                }
                _ => {}
            }
            tokio::select! { biased;
                _=cancel.cancelled()=>return Err(Error::Cancelled),
                _=tokio::time::sleep_until(deadline)=>return Err(Error::Deadline),
                r=rx.changed()=>r.map_err(|_|Error::Closed)?,
            }
        }
    }
    pub async fn routes(&self) -> Result<Vec<RouteCandidate>, Error> {
        if self.inner.shutdown.is_cancelled() {
            return Err(Error::Closed);
        }
        Ok(route_snapshot(&self.inner).await)
    }
    pub async fn listen(&self, port: u16) -> Result<Listener, Error> {
        if port == 0 {
            return Err(Error::InvalidConfig("virtual port must be nonzero"));
        }
        let gate = self.inner.gate.read().await;
        ensure_ready(&self.inner)?;
        let token = gate.token.child_token();
        let listener = tokio::select! { biased;
            _=self.inner.shutdown.cancelled()=>return Err(Error::Closed),
            _=token.cancelled()=>return Err(Error::AddressChanged),
            r=self.inner.native.data_plane_tcp_bind(port,Duration::from_secs(5))=>r.map_err(data_plane_error)?,
        };
        Ok(Listener {
            native: Some(listener),
            token,
            shutdown: self.inner.shutdown.clone(),
        })
    }
    pub async fn connect(
        &self,
        dst: SocketAddrV4,
        deadline: Instant,
        cancel: &CancellationToken,
    ) -> Result<BoxStream, Error> {
        if cancel.is_cancelled() {
            return Err(Error::Cancelled);
        }
        let gate = self.inner.gate.read().await;
        ensure_ready(&self.inner)?;
        let status = self.status();
        if dst.port() == 0 || !self.inner.pool.contains(*dst.ip()) || *dst.ip() == status.ipv4 {
            return Err(Error::NoRoute);
        }
        let routes = route_snapshot(&self.inner).await;
        if routes.iter().filter(|r| r.ipv4 == *dst.ip()).count() != 1 {
            return Err(Error::NoRoute);
        }
        let token = gate.token.child_token();
        drop(gate);
        let timeout = deadline
            .checked_duration_since(Instant::now())
            .ok_or(Error::Deadline)?;
        let native = tokio::select! { biased;
            _=self.inner.shutdown.cancelled()=>return Err(Error::Closed),
            _=token.cancelled()=>return Err(Error::AddressChanged),
            _=cancel.cancelled()=>return Err(Error::Cancelled),
            _=tokio::time::sleep_until(deadline)=>return Err(Error::Deadline),
            r=self.inner.native.data_plane_tcp_connect(SocketAddr::V4(dst),timeout)=>r.map_err(data_plane_error)?,
        };
        Ok(stream::boxed(native, token, self.inner.shutdown.clone()))
    }
    /// Cancellation-safe and idempotent: the owner task finishes shutdown even if this future is dropped.
    pub async fn close(&self) -> Result<(), Error> {
        let mut rx = self.subscribe_status();
        self.inner.shutdown.cancel();
        loop {
            if rx.borrow_and_update().phase == AddressPhase::Closed {
                return Ok(());
            }
            rx.changed().await.map_err(|_| Error::Closed)?;
        }
    }
}
fn data_plane_error(e: easytier_core::gateway::DataPlaneError) -> Error {
    use easytier_core::gateway::DataPlaneErrorKind as Kind;
    match e.kind() {
        Kind::Cancelled => Error::Cancelled,
        Kind::DeadlineExceeded => Error::Deadline,
        Kind::InstanceStopped | Kind::HandleClosed => Error::Closed,
        Kind::NetworkChanged | Kind::PathNotReady => Error::AddressChanged,
        Kind::NoOverlayRoute => Error::NoRoute,
        Kind::AddressInUse => Error::Io(std::io::Error::new(
            std::io::ErrorKind::AddrInUse,
            "virtual port already bound",
        )),
        Kind::ConnectionRefused => Error::Io(std::io::Error::new(
            std::io::ErrorKind::ConnectionRefused,
            "virtual connection refused",
        )),
        _ => Error::Backend(format!("native data plane: {:?}", e.kind())),
    }
}
fn backend(e: impl std::fmt::Display) -> Error {
    // Upstream errors may include URLs/config; never propagate credential-bearing diagnostics.
    let _ = e;
    Error::Backend("native operation failed (inspect non-secret local diagnostics)".into())
}
fn ensure_ready(inner: &Inner) -> Result<(), Error> {
    if inner.shutdown.is_cancelled() {
        return Err(Error::Closed);
    }
    match inner.status.borrow().phase {
        AddressPhase::Ready => Ok(()),
        AddressPhase::Conflict => Err(Error::Conflict),
        _ => Err(Error::AddressChanged),
    }
}
async fn route_snapshot(inner: &Inner) -> Vec<RouteCandidate> {
    let mut routes: Vec<_> = inner
        .native
        .route_snapshots()
        .await
        .into_iter()
        .filter_map(|r| {
            let ip: Ipv4Addr = r.ipv4_addr?.address?.into();
            inner.pool.contains(ip).then_some(RouteCandidate {
                peer_id: r.peer_id,
                ipv4: ip,
                next_hop_peer_id: r.next_hop_peer_id,
                cost: r.cost,
            })
        })
        .collect();
    routes.sort_by_key(|r| r.peer_id);
    routes
}
async fn maintain(inner: Arc<Inner>, config: TransportConfig) {
    let mut attempts = 0u32;
    let mut stable_since = Instant::now();
    let mut interval = tokio::time::interval(Duration::from_secs(2));
    let mut fallback = fallback::Activation::new(Instant::now());
    loop {
        tokio::select! { biased; _=inner.shutdown.cancelled()=>break, _=interval.tick()=>{} }
        let status = inner.status.borrow().clone();
        let routes = route_snapshot(&inner).await;
        if let Some(policy) = &config.cloudflare_fallback {
            if fallback.due(Instant::now(), status.peer_id, &routes, policy.after) {
                // Adding a connector is local and nonblocking. EasyTier owns its
                // reconnect loop; never replay application bytes or flap links.
                fallback.active = policy.peers.iter().all(|p| {
                    inner
                        .native
                        .add_connector(fallback::anonymous_endpoint(p).expect("validated policy"))
                        .is_ok()
                });
            }
        }
        let duplicate = conflicts(status.ipv4, status.peer_id, &routes);
        if duplicate.iter().any(|id| *id < status.peer_id) {
            let mut gate = inner.gate.write().await;
            gate.token.cancel();
            inner
                .status
                .send_modify(|s| s.phase = AddressPhase::Changing);
            attempts += 1;
            if attempts > 64 {
                inner
                    .status
                    .send_modify(|s| s.phase = AddressPhase::Conflict);
                break;
            }
            let mut next = None;
            for offset in attempts..attempts + 64 {
                let ip = config.address_pool.candidate(
                    &config.network_name,
                    &config.installation_id,
                    offset,
                );
                if ip != status.ipv4 && !routes.iter().any(|r| r.ipv4 == ip) {
                    next = Some(ip);
                    break;
                }
            }
            let Some(ip) = next else {
                inner
                    .status
                    .send_modify(|s| s.phase = AddressPhase::Conflict);
                break;
            };
            // Publish a new address; upstream rebuilds the user-space stack generation.
            let result = async {
                use easytier_core::{
                    config::runtime::CoreInstanceRuntimeConfig,
                    instance::{CoreInstanceConfig, CoreInstanceHostConfig},
                };
                let c = config.native(ip)?;
                c.set_id(inner.native.instance_id());
                let h = CoreInstanceHostConfig {
                    smoltcp_available: true,
                    requires_smoltcp: true,
                    gateway_enabled: false,
                    proxy_enabled: false,
                    ..Default::default()
                };
                let n = CoreInstanceConfig::from_toml_with_host(&c, &h).map_err(backend)?;
                inner
                    .native
                    .update_runtime_config(CoreInstanceRuntimeConfig {
                        services: n.connectivity.runtime,
                        peer: Arc::new(n.peer.snapshot),
                    })
                    .await
                    .map_err(backend)
            }
            .await;
            if result.is_err() {
                inner.status.send_modify(|s| s.phase = AddressPhase::Failed);
                break;
            }
            gate.token = CancellationToken::new();
            inner.status.send_modify(|s| {
                s.ipv4 = ip;
                s.generation += 1;
                s.phase = AddressPhase::Tentative;
            });
            stable_since = Instant::now();
        } else if status.phase == AddressPhase::Tentative
            && stable_since.elapsed() >= Duration::from_secs(2)
        {
            inner.status.send_modify(|s| s.phase = AddressPhase::Ready);
        }
    }
    // Failed/conflict status remains observable until close; the gate stays closed.
    if !inner.shutdown.is_cancelled() {
        inner.shutdown.cancelled().await;
    }
    inner.gate.write().await.token.cancel();
    inner.native.stop().await;
    inner.status.send_modify(|s| s.phase = AddressPhase::Closed);
}

pub struct Listener {
    native: Option<DataPlaneTcpListener>,
    token: CancellationToken,
    shutdown: CancellationToken,
}
impl Listener {
    pub fn local_addr(&self) -> Option<SocketAddr> {
        self.native.as_ref().map(|s| s.local_addr())
    }
    pub async fn accept(
        &mut self,
        cancel: &CancellationToken,
    ) -> Result<(BoxStream, SocketAddr), Error> {
        let native = self.native.as_mut().ok_or(Error::Closed)?;
        let (s, addr) = tokio::select! { biased;
            _=self.shutdown.cancelled()=>return Err(Error::Closed),
            _=self.token.cancelled()=>return Err(Error::AddressChanged),
            _=cancel.cancelled()=>return Err(Error::Cancelled),
            r=native.accept()=>r?,
        };
        Ok((
            stream::boxed(s, self.token.child_token(), self.shutdown.clone()),
            addr,
        ))
    }
    pub fn close(&mut self) {
        self.token.cancel();
        self.native.take();
    }
}

#[cfg(test)]
mod endpoint_tests {
    use super::*;

    #[test]
    fn websocket_endpoints_require_the_opt_in_feature() {
        for endpoint in ["ws://127.0.0.1:8080/", "wss://relay.example/"] {
            let mut config = TransportConfig::new("fixture".into(), "public".into(), [1; 32]);
            config.peers = vec![endpoint.into()];
            assert_eq!(
                config.native("10.144.0.1".parse().unwrap()).is_ok(),
                cfg!(feature = "websocket")
            );
        }
    }

    #[test]
    fn websocket_feature_preserves_endpoint_rejections() {
        for endpoint in [
            "http://relay.example:80",
            "tcp://relay.example",
            "udp://relay.example",
            "wss://user:fixture@relay.example/",
            "wss://relay.example/?secret=value",
        ] {
            let mut config = TransportConfig::new("fixture".into(), "public".into(), [1; 32]);
            config.peers = vec![endpoint.into()];
            assert!(config.native("10.144.0.1".parse().unwrap()).is_err());
        }
    }
}
