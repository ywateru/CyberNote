# cyberbus-transport

Real embedded EasyTier v2.7.1 (`0d9c52b169dc2112687ddefcf571cd01d383193c`), native smoltcp TCP streams. No system TUN, system route/DNS edits, OS application listener, SOCKS bridge, or replacement relay. The upstream's TCP/UDP outer sockets still require ordinary network permission (Android INTERNET).

## Public API

This crate has **no CyberBus auth/proto dependency**. The caller supplies already-derived `network_name`, `network_secret`, local installation ID `[u8;32]`, and `peers: Vec<String>` (`tcp://host:port` or `udp://host:port`). The local ID is an address preference seed, never authenticated remote identity. Noise/device admission belongs above this crate.

```rust,ignore
use cyberbus_transport::{Transport, TransportConfig, CancellationToken};
use tokio::time::{Duration, Instant};
let mut config = TransportConfig::new(network_name, network_secret, installation_id);
config.peers = vec!["tcp://relay.example.invalid:11010".into()];
let network = Transport::start(config).await?;
let cancel = CancellationToken::new();
network.wait_ready(Instant::now() + Duration::from_secs(30), &cancel).await?;
let mut listener = network.listen(11000).await?;
let (stream, virtual_remote_addr) = listener.accept(&cancel).await?;
// stream: Box<dyn AsyncStream>, AsyncStream: AsyncRead + AsyncWrite + Send + Unpin
let candidates = network.routes().await?;
let outgoing = network.connect(remote_socket_addr_v4, Instant::now() + Duration::from_secs(10), &cancel).await?;
listener.close();
network.close().await?;
```

Concrete signatures:

- `Transport::start(TransportConfig) -> async Result<Transport, Error>`
- `Transport::status() -> TransportStatus { ipv4, peer_id: u32, generation: u64, phase: AddressPhase }`
- `Transport::subscribe_status() -> watch::Receiver<TransportStatus>`
- `Transport::wait_ready(tokio::time::Instant, &CancellationToken) -> async Result<TransportStatus, Error>`
- `Transport::routes() -> async Result<Vec<RouteCandidate>, Error>`; `RouteCandidate { peer_id: u32, ipv4: Ipv4Addr, next_hop_peer_id: u32, cost: i32 }`
- `Transport::running_listeners() -> Vec<String>`: bound outer TCP/UDP/WS/WSS endpoints, excluding internal ring listeners
- `Transport::listen(u16) -> async Result<Listener, Error>`
- `Listener::accept(&mut self, &CancellationToken) -> async Result<(BoxStream, SocketAddr), Error>`
- `Listener::local_addr() -> Option<SocketAddr>`; `Listener::close(&mut self)`
- `Transport::connect(SocketAddrV4, tokio::time::Instant, &CancellationToken) -> async Result<BoxStream, Error>`
- `Transport::close(&self) -> async Result<(), Error>`

`Transport` is Send + Sync; share through `Arc`. Keep its Tokio runtime alive. Start on that runtime; `close` is cancellation-safe and idempotent. Dropping Transport requests background cleanup; explicit awaited close is the deterministic shutdown boundary. Cancellation tokens cancel pending operations; they do not cancel a stream returned by a completed connect. Close/drop the stream to end it. Closing a listener also invalidates its accepted streams. Retrying connect never replays application bytes.

Optional `websocket` accepts WS/WSS peers/listeners with public CA and hostname
verification. Optional `cloudflared` adds an owned **official cloudflared process**
and loopback-only EasyTier relay; neither feature is enabled by this crate by
default. `CloudflareFallback { peers, after }` delays joining shared anonymous WSS
endpoints until no remote virtual route has been observed for the configured
interval. Once added, connectors remain until close. The SDK enables WebSocket
support but leaves this policy off unless configured. See
[configuration and lifecycle](../../docs/CLOUDFLARE_FALLBACK.md).

## Address and route contract

Default pool is `10.144.0.0/20`, 4094 usable addresses including middle `/24` `.0/.255`. `AddressPool::new` validates an aligned private pool; `candidate` hashes network name, pool and installation ID. Supply `preferred_ipv4` from a namespace-scoped caller cache if available. DHCP is disabled. No installation identity is persisted here.

Routes come from upstream **whole-network route snapshots**, preserve every peer claiming an IP, and filter to this usable pool. These are untrusted candidates, not authenticated/online devices. `connect` accepts exactly one remote route, rejects self/loopback/external/ambiguous destinations, and uses upstream's overlay-only smoltcp path.

Startup is tentative for two seconds. Polling every two seconds detects duplicate claims; lower numeric EasyTier peer ID retains the address. A loser cancels the current stream/listener generation, chooses an unclaimed candidate, publishes a new native address/stack generation, then settles again. Observe status changes and re-register listeners after Ready in a new generation. A 64-change budget or inability to find a candidate enters Conflict; native maintenance errors enter Failed. The application gate remains closed until the caller closes/restarts. This bounded terminal behavior is explicit; background infinite retry and authenticated capacity admission are not implemented here. Partition convergence is eventually observable, not globally instantaneous.

## Isolation and upstream changes

The public native data-plane API returns unmatched packets to later pipeline stages. The vendored `create_native_dataplane_instance` entry explicitly disables OS packet proxies, gateways, exit-node fallback, VPN portal, magic DNS and UDP broadcast in **host policy**, including when other workspace dependencies enable extra EasyTier features. Compile without tun/socks/KCP/QUIC/UPnP features. Unmatched packets reach the disabled-TUN sink, never an OS service proxy. The sender-side route checks are additional defense; independent child-process canary tests call the upstream factory/Data Plane directly.

The API requires nonempty credentials and never implements Logto, key derivation, device authorization, protobuf, or secure credential storage. `Debug` redacts configuration credentials; avoid enabling upstream config/packet tracing on private live credentials.

## Build and verification

From the repository root:

```sh
scripts/build-transport.sh test -- --nocapture --test-threads=1
scripts/build-transport.sh android
scripts/build-transport.sh build --example relay_smoke
./target/debug/examples/relay_smoke tcp://relay.example.invalid:11010
```

When switching between the root workspace and standalone feature sets, use a separate
`CARGO_TARGET_DIR="$PWD/target/transport-standalone"` to avoid incompatible cached crate artifacts.

Host `protoc` is required. `PROTOC` can point to a host executable; the script also discovers Cargo's installed vendored macOS arm64 protoc. Android: installed Rust target `aarch64-linux-android`, NDK 27.2.12479018 (override `ANDROID_NDK_HOME`), clang API **28**. Override `NDK_HOST_TAG` on Linux. Dev/test debug is disabled; a single target directory is shared for host and Android builds. Script temporarily isolates this crate with `[workspace]` and restores the manifest, without modifying the root workspace.

Tests use real native EasyTier, loopback **outer** TCP sockets, user-space **virtual** streams: 64KiB each direction with SHA-256 comparison; three-node chain with P2P disabled and route cost=2; independent OS-process raw attacker against an active OS canary and closed virtual 11000; cancellation/deadline/duplicate bind and close waking blocked IO. Forced duplicate-address convergence and in-flight cancellation/deadline/outer port release are also covered. Physical Android 9 LTE ↔ macOS transport-only smoke has passed through the public TCP relay; this does not establish Android app lifecycle, login/protobuf or five-platform runtime support.

Public relay deployment is environment-specific and is not shipped as a script.
Run the pinned upstream EasyTier relay on a host you control, expose only the
required TCP/UDP port, and keep host firewall rules outside this repository.
The endpoint is a transport bootstrap only; it has no application credential.

License/source/change inventory: [README.cyberbus.md](../../vendor/easytier/README.cyberbus.md). EasyTier is LGPL v3; embedding or static distribution requires retaining license/source and satisfying relinking obligations. Rust rlibs here are build inputs, not a standalone compliant SDK distribution package.

For a transport-only desktop/phone reproduction, build `--example peer_smoke`
for host and Android, then use `listen` on one endpoint and `connect` on the
other with a fresh public run ID. These fixtures use public test keys, not
account grants. Passing this smoke proves transport bytes only; it does not
prove SDK authentication or business ACK behavior.
