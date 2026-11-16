use super::super::identity::{encode, key, uuid, NOISE};
use super::*;
use futures_util::{SinkExt, StreamExt};
use serde::de::DeserializeOwned;
use snow::{HandshakeState, TransportState};
use tokio::{
    net::TcpStream,
    sync::watch,
    time::{timeout, Instant},
};
use tokio_tungstenite::{
    tungstenite::{protocol::WebSocketConfig, Message},
    MaybeTlsStream, WebSocketStream,
};
pub(super) type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Hello {
    version: u8,
    workspace: String,
    invitation: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Device {
    device: String,
}
pub(super) fn config() -> WebSocketConfig {
    WebSocketConfig::default()
        .read_buffer_size(4096)
        .write_buffer_size(0)
        .max_write_buffer_size(2 * (MAX_PLAIN_FRAME + 16))
        .max_message_size(Some(MAX_PLAIN_FRAME + 16))
        .max_frame_size(Some(MAX_PLAIN_FRAME + 16))
}
pub(super) struct SecureSocket {
    ws: Socket,
    noise: TransportState,
    frames: u64,
    transferred: u64,
    started: Instant,
    io_budget: Duration,
}
async fn read_binary_with_budget(ws: &mut Socket, budget: Duration) -> Result<Vec<u8>> {
    // A peer cannot extend the deadline indefinitely with Ping/Pong frames.
    let deadline = Instant::now() + budget;
    loop {
        let item = tokio::time::timeout_at(deadline, ws.next())
            .await
            .map_err(|_| SyncError::Timeout)?
            .ok_or(SyncError::Transport)?
            .map_err(|_| SyncError::Transport)?;
        match item {
            Message::Binary(b) if b.len() <= MAX_PLAIN_FRAME + 16 => return Ok(b.to_vec()),
            Message::Ping(_) | Message::Pong(_) => {}
            Message::Close(_) => return Err(SyncError::Transport),
            _ => return Err(SyncError::Protocol),
        }
    }
}
#[cfg(test)]
async fn send_binary(ws: &mut Socket, bytes: Vec<u8>) -> Result<()> {
    send_binary_with_budget(ws, bytes, NETWORK_TIMEOUT).await
}
async fn send_binary_with_budget(ws: &mut Socket, bytes: Vec<u8>, budget: Duration) -> Result<()> {
    if bytes.len() > MAX_PLAIN_FRAME + 16 {
        return Err(SyncError::Limit);
    }
    timeout(budget, ws.send(Message::Binary(bytes.into())))
        .await
        .map_err(|_| SyncError::Timeout)?
        .map_err(|_| SyncError::Transport)
}
fn handshake(
    identity: &IdentityStore,
    workspace: &str,
    id: &str,
    psk: &[u8],
    initiator: bool,
) -> Result<HandshakeState> {
    let private = identity.private_key()?;
    let prologue = format!("notes-sync/1/{workspace}/{id}");
    let builder = snow::Builder::new(NOISE.parse().map_err(|_| SyncError::Protocol)?)
        .local_private_key(&private)
        .psk(3, psk)
        .prologue(prologue.as_bytes());
    if initiator {
        builder.build_initiator()
    } else {
        builder.build_responder()
    }
    .map_err(|_| SyncError::Authentication)
}
fn noise_write(h: &mut HandshakeState, payload: &[u8]) -> Result<Vec<u8>> {
    let mut out = vec![0u8; 65535];
    let n = h
        .write_message(payload, &mut out)
        .map_err(|_| SyncError::Authentication)?;
    out.truncate(n);
    Ok(out)
}
fn noise_read(h: &mut HandshakeState, bytes: &[u8]) -> Result<Vec<u8>> {
    if bytes.len() > 4096 {
        return Err(SyncError::Limit);
    }
    let mut out = vec![0u8; 4096];
    let n = h
        .read_message(bytes, &mut out)
        .map_err(|_| SyncError::Authentication)?;
    out.truncate(n);
    Ok(out)
}
fn tls_connector() -> Result<tokio_tungstenite::Connector> {
    // Bind this client to one explicit provider; do not depend on process-wide
    // auto-detection, which panics when transitive feature sets are ambiguous.
    let roots = rustls::RootCertStore::from_iter(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let config = rustls::ClientConfig::builder_with_provider(Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_safe_default_protocol_versions()
    .map_err(|_| SyncError::Transport)?
    .with_root_certificates(roots)
    .with_no_client_auth();
    Ok(tokio_tungstenite::Connector::Rustls(Arc::new(config)))
}
pub(super) async fn client(s: &Shared, invite: &PairingInvite) -> Result<(SecureSocket, String)> {
    let io_budget = if s.policy.is_some() { ACCOUNT_IO_TIMEOUT } else { NETWORK_TIMEOUT };
    super::super::identity::endpoint(&invite.endpoint)?;
    let (mut ws, _) = timeout(
        io_budget,
        tokio_tungstenite::connect_async_tls_with_config(
            &invite.endpoint,
            Some(config()),
            true,
            Some(tls_connector()?),
        ),
    )
    .await
    .map_err(|_| SyncError::Timeout)?
    .map_err(|_| SyncError::Transport)?;
    let hello = Hello {
        version: 1,
        workspace: invite.workspace_id.clone(),
        invitation: invite.invitation_id.clone(),
    };
    send_binary_with_budget(
        &mut ws,
        serde_json::to_vec(&hello).map_err(|_| SyncError::Protocol)?,
        io_budget,
    )
    .await?;
    let psk = key(&invite.psk)?;
    let mut h = handshake(
        &s.identity,
        &invite.workspace_id,
        &invite.invitation_id,
        &psk,
        true,
    )?;
    send_binary_with_budget(&mut ws, noise_write(&mut h, &[])?, io_budget).await?;
    let bytes = read_binary_with_budget(&mut ws, io_budget).await?;
    let host: Device = serde_json::from_slice(&noise_read(&mut h, &bytes)?)
        .map_err(|_| SyncError::Authentication)?;
    uuid(&host.device)?;
    let remote = h.get_remote_static().ok_or(SyncError::Authentication)?;
    if encode(remote) != invite.host_key {
        return Err(SyncError::Authentication);
    }
    s.authorize(&host.device, &invite.host_key)?;
    let device = Device {
        device: s.backend.device_id()?,
    };
    send_binary_with_budget(
        &mut ws,
        noise_write(
            &mut h,
            &serde_json::to_vec(&device).map_err(|_| SyncError::Protocol)?,
        )?,
        io_budget,
    )
    .await?;
    let mut socket = SecureSocket {
        ws,
        frames: 0,
        transferred: 0,
        started: Instant::now(),
        io_budget,
        noise: h
            .into_transport_mode()
            .map_err(|_| SyncError::Authentication)?,
    };
    // The server's encrypted response proves it authenticated PSK3 and consumed/pinned this invite.
    match socket.recv::<wire::Response>().await? {
        wire::Response::Status { version: 1 } => Ok((socket, host.device)),
        _ => Err(SyncError::Authentication),
    }
}
pub(super) async fn server(
    s: &Shared,
    tcp: TcpStream,
) -> Result<(SecureSocket, String, String, String)> {
    let io_budget = if s.policy.is_some() { ACCOUNT_IO_TIMEOUT } else { NETWORK_TIMEOUT };
    let mut ws = timeout(
        io_budget,
        tokio_tungstenite::accept_async_with_config(MaybeTlsStream::Plain(tcp), Some(config())),
    )
    .await
    .map_err(|_| SyncError::Timeout)?
    .map_err(|_| SyncError::Transport)?;
    let bytes = read_binary_with_budget(&mut ws, io_budget).await?;
    if bytes.len() > 1024 {
        return Err(SyncError::Limit);
    }
    let hello: Hello = serde_json::from_slice(&bytes).map_err(|_| SyncError::Protocol)?;
    if hello.version != 1 {
        return Err(SyncError::Protocol);
    }
    uuid(&hello.workspace)?;
    uuid(&hello.invitation)?;
    if s.backend.workspace_id()? != hello.workspace {
        return Err(SyncError::WorkspaceMismatch);
    }
    let psk = s.identity.server_psk(&hello.invitation, &hello.workspace)?;
    let mut h = handshake(
        &s.identity,
        &hello.workspace,
        &hello.invitation,
        &psk,
        false,
    )?;
    let bytes = read_binary_with_budget(&mut ws, io_budget).await?;
    if !noise_read(&mut h, &bytes)?.is_empty() {
        return Err(SyncError::Protocol);
    }
    let host = Device {
        device: s.backend.device_id()?,
    };
    send_binary_with_budget(
        &mut ws,
        noise_write(
            &mut h,
            &serde_json::to_vec(&host).map_err(|_| SyncError::Protocol)?,
        )?,
        io_budget,
    )
    .await?;
    let bytes = read_binary_with_budget(&mut ws, io_budget).await?;
    let device: Device = serde_json::from_slice(&noise_read(&mut h, &bytes)?)
        .map_err(|_| SyncError::Authentication)?;
    let client_key = encode(h.get_remote_static().ok_or(SyncError::Authentication)?);
    s.authorize(&device.device, &client_key)?;
    s.identity.authorize(
        &hello.invitation,
        &hello.workspace,
        &client_key,
        &device.device,
    )?;
    let mut socket = SecureSocket {
        ws,
        frames: 0,
        transferred: 0,
        started: Instant::now(),
        io_budget,
        noise: h
            .into_transport_mode()
            .map_err(|_| SyncError::Authentication)?,
    };
    socket.send(&wire::Response::Status { version: 1 }).await?;
    Ok((socket, hello.invitation, client_key, device.device))
}
impl SecureSocket {
    fn budget(&mut self, bytes: usize) -> Result<()> {
        self.frames += 1;
        self.transferred = self.transferred.saturating_add(bytes as u64);
        if self.frames > 65536
            || self.transferred > 1024 * 1024 * 1024
            || self.started.elapsed() > if self.io_budget == ACCOUNT_IO_TIMEOUT {
                ACCOUNT_TRANSFER_TIMEOUT
            } else { Duration::from_secs(600) }
        {
            return Err(SyncError::Transport);
        }
        Ok(())
    }
    pub async fn send<T: Serialize>(&mut self, value: &T) -> Result<()> {
        let plain = serde_json::to_vec(value).map_err(|_| SyncError::Protocol)?;
        if plain.len() > MAX_PLAIN_FRAME {
            return Err(SyncError::Limit);
        }
        let mut out = vec![0u8; plain.len() + 16];
        let n = self
            .noise
            .write_message(&plain, &mut out)
            .map_err(|_| SyncError::Authentication)?;
        out.truncate(n);
        self.budget(out.len())?;
        send_binary_with_budget(&mut self.ws, out, self.io_budget).await
    }
    pub async fn recv<T: DeserializeOwned>(&mut self) -> Result<T> {
        let bytes = read_binary_with_budget(&mut self.ws, self.io_budget).await?;
        self.budget(bytes.len())?;
        let mut out = vec![0u8; MAX_PLAIN_FRAME];
        let n = self
            .noise
            .read_message(&bytes, &mut out)
            .map_err(|_| SyncError::Authentication)?;
        serde_json::from_slice(&out[..n]).map_err(|_| SyncError::Protocol)
    }
    pub async fn rpc(&mut self, req: &wire::Request) -> Result<wire::Response> {
        self.send(req).await?;
        self.response().await
    }
    pub async fn response(&mut self) -> Result<wire::Response> {
        match self.recv().await? {
            wire::Response::Error { code } => Err(match code {
                wire::SyncErrorWire::Busy => SyncError::Busy,
                wire::SyncErrorWire::Limit => SyncError::Limit,
                wire::SyncErrorWire::Workspace => SyncError::WorkspaceMismatch,
                wire::SyncErrorWire::Revoked => SyncError::Revoked,
                wire::SyncErrorWire::Backend => SyncError::Backend,
                _ => SyncError::Protocol,
            }),
            response => Ok(response),
        }
    }
}
pub(super) async fn serve(
    s: Arc<Shared>,
    tcp: TcpStream,
    stop: watch::Receiver<bool>,
) -> Result<()> {
    let began = Instant::now();
    diagnostic("server", "accepted", 0, None);
    let result = serve_with_limits(
        s,
        tcp,
        stop,
        ACCOUNT_TRANSFER_TIMEOUT,
        Duration::from_secs(30),
        Duration::from_millis(200),
    )
    .await;
    diagnostic("server", "closed", began.elapsed().as_millis() as u64, result.as_ref().err().copied());
    result
}
pub(super) async fn serve_with_limits(
    s: Arc<Shared>,
    tcp: TcpStream,
    mut stop: watch::Receiver<bool>,
    elapsed_budget: Duration,
    idle_budget: Duration,
    poll: Duration,
) -> Result<()> {
    let (mut socket, id, key, device) =
        tokio::select! {r=server(&s,tcp)=>r?,_=stop.changed()=>return Err(SyncError::Stopped)};
    diagnostic("server", "authenticated", 0, None);
    let workspace = s.backend.workspace_id()?;
    s.status(&id, "connected", None, false);
    let mut handler = wire::Handler::new();
    let mut last = Instant::now();
    let started = Instant::now();
    loop {
        if s.policy.is_some() && started.elapsed() >= elapsed_budget {
            diagnostic("server", "sessionDeadline", started.elapsed().as_millis() as u64, Some(SyncError::Timeout));
            return Err(SyncError::Timeout);
        }
        s.authorize(&device, &key)?;
        s.identity
            .check_authorized(&id, &workspace, &key, &device)?;
        if s.backend.workspace_id()? != workspace {
            return Err(SyncError::WorkspaceMismatch);
        }
        let request = tokio::select! {r=socket.recv::<wire::Request>()=>Some(r?),_=stop.changed()=>return Err(SyncError::Stopped),_=tokio::time::sleep(poll)=>None};
        let Some(request) = request else {
            if last.elapsed() > idle_budget {
                diagnostic("server", "idleDeadline", last.elapsed().as_millis() as u64, Some(SyncError::Timeout));
                return Err(SyncError::Timeout);
            }
            continue;
        };
        last = Instant::now();
        let kind = match &request {
            wire::Request::BeginTransfer {..} => "beginTransfer", wire::Request::FinishTransfer => "finishTransfer",
            wire::Request::Inventory {..} => "inventory", wire::Request::Head {..} => "head",
            wire::Request::Blob {..} => "blob", wire::Request::PutHead {..} => "putHead",
            wire::Request::PutBlob {..} => "putBlob", wire::Request::BlobOffset {..} => "blobOffset",
            wire::Request::CommitHead {..} => "commitHead", wire::Request::Status => "status",
        };
        diagnostic(kind, "received", 0, None);
        s.authorize(&device, &key)?;
        s.identity
            .check_authorized(&id, &workspace, &key, &device)?;
        // Disk verification / SQLite must not block the networking runtime.
        // Move Handler with its admission permit into the tracked job, so a
        // cancellation never releases Busy while a write is still running.
        let (next_handler, result) = s.local(move |shared| {
            let response = handler.handle(shared, request);
            Ok((handler, response))
        }).await?;
        handler = next_handler;
        let response = match result {
            Ok(r) => r,
            // A local metadata race says nothing about the peer protocol. End
            // this authenticated exchange so the client uses transport backoff
            // and prepares again; never encode it as remote Invalid data.
            Err(SyncError::PlanStale) => return Err(SyncError::PlanStale),
            Err(e) => wire::Response::Error { code: e.into() },
        };
        diagnostic(kind, "handled", last.elapsed().as_millis() as u64, None);
        s.authorize(&device, &key)?;
        s.identity
            .check_authorized(&id, &workspace, &key, &device)?;
        if matches!(&response, wire::Response::Stored { .. }) {
            s.status(&id, "idle", None, true);
        }
        let complete = matches!(&response, wire::Response::TransferComplete);
        let busy = matches!(
            &response,
            wire::Response::Error {
                code: wire::SyncErrorWire::Busy
            }
        );
        let sent = tokio::select! {r=socket.send(&response)=>r,_=stop.changed()=>return Err(SyncError::Stopped)};
        diagnostic(kind, "sent", last.elapsed().as_millis() as u64, sent.as_ref().err().copied());
        sent?;
        if busy {
            return Err(SyncError::Busy);
        }
        if complete {
            return Ok(());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};
    use std::collections::BTreeMap;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    struct Backend {
        workspace: String,
        device: String,
        reads: AtomicUsize,
        publications: AtomicUsize,
        stale_flush: AtomicBool,
        blobs: Mutex<BTreeMap<String, Vec<u8>>>,
    }
    impl SyncBackend for Backend {
        fn workspace_id(&self) -> Result<String> {
            Ok(self.workspace.clone())
        }
        fn device_id(&self) -> Result<String> {
            Ok(self.device.clone())
        }
        fn prepare_pairing(&self, _: &str) -> Result<()> {
            Ok(())
        }
        fn adopt_workspace(&self, w: &str) -> Result<()> {
            if w != self.workspace {
                return Err(SyncError::WorkspaceMismatch);
            }
            Ok(())
        }
        fn flush(&self) -> Result<()> {
            if self.stale_flush.swap(false, Ordering::SeqCst) {
                return Err(SyncError::PlanStale);
            }
            Ok(())
        }
        fn inventory(&self, _: Option<&str>, _: usize) -> Result<InventoryPage> {
            self.reads.fetch_add(1, Ordering::SeqCst);
            Ok(InventoryPage {
                digests: vec![],
                next: None,
            })
        }
        fn version(&self, _: &str) -> Result<Value> {
            Err(SyncError::Backend)
        }
        fn required_blobs(&self, v: &Value) -> Result<Vec<BlobRef>> {
            if v.get("valid").and_then(Value::as_bool) != Some(true) {
                return Err(SyncError::Protocol);
            }
            Ok(vec![])
        }
        fn has_blob(&self, b: &BlobRef) -> Result<bool> {
            Ok(self.blobs.lock().unwrap().contains_key(&b.sha256))
        }
        fn read_blob_chunk(&self, b: &BlobRef, offset: u64, max: usize) -> Result<Vec<u8>> {
            let blobs = self.blobs.lock().unwrap();
            let bytes = blobs.get(&b.sha256).ok_or(SyncError::Backend)?;
            let offset = usize::try_from(offset).map_err(|_| SyncError::Protocol)?;
            let remaining = bytes.get(offset..).ok_or(SyncError::Protocol)?;
            Ok(remaining[..remaining.len().min(max)].to_vec())
        }
        fn store_blob(&self, b: &BlobRef, p: &Path) -> Result<()> {
            let bytes = std::fs::read(p).map_err(|_| SyncError::Io)?;
            if bytes.len() as u64 != b.size || format!("{:x}", Sha256::digest(&bytes)) != b.sha256 {
                return Err(SyncError::Protocol);
            }
            self.blobs.lock().unwrap().insert(b.sha256.clone(), bytes);
            self.publications.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }
        fn receive_head(&self, _: Value) -> Result<Receipt> {
            Ok(Receipt {
                durable: true,
                applied: false,
            })
        }
    }
    fn shared(dir: &Path, workspace: &str) -> (Arc<Shared>, Arc<Backend>) {
        let backend = Arc::new(Backend {
            workspace: workspace.into(),
            device: uuid::Uuid::new_v4().to_string(),
            reads: AtomicUsize::new(0),
            publications: AtomicUsize::new(0),
            stale_flush: AtomicBool::new(false),
            blobs: Mutex::new(BTreeMap::new()),
        });
        let identity =
            Arc::new(IdentityStore::open(&dir.join("identity"), &backend.device).unwrap());
        let s = Arc::new(Shared {
            blocking: tokio_util::task::TaskTracker::new(),
            policy: None,
            account_operation: Arc::new(Mutex::new(false)),
            backend: backend.clone(),
            identity,
            staging: staging::Staging::open(dir.join("stage")).unwrap(),
            status: Mutex::new(ServiceStatus {
                listening: None,
                connections: vec![],
            }),
        });
        (s, backend)
    }
    fn host() -> (tempfile::TempDir, SyncService, PairingInvite, Arc<Backend>) {
        let dir = tempfile::tempdir().unwrap();
        let ws = uuid::Uuid::new_v4().to_string();
        let (s, b) = shared(dir.path(), &ws);
        let service = SyncService::new(
            b.clone(),
            s.identity.clone(),
            dir.path().join("server-stage"),
        )
        .unwrap();
        let addr = service
            .start_listener("127.0.0.1:0".parse().unwrap())
            .unwrap();
        let invite =
            PairingInvite::decode(&service.invitation(&format!("ws://{addr}/")).unwrap()).unwrap();
        (dir, service, invite, b)
    }
    async fn ciphertext(socket: &mut SecureSocket, req: &wire::Request) -> Vec<u8> {
        let plain = serde_json::to_vec(req).unwrap();
        let mut out = vec![0; plain.len() + 16];
        let n = socket.noise.write_message(&plain, &mut out).unwrap();
        out.truncate(n);
        out
    }
    struct Gate(AtomicBool);
    impl ReplicationPolicy for Gate {
        fn authorize(&self, _: &str, _: &str) -> Result<()> {
            if self.0.load(Ordering::Acquire) {
                Ok(())
            } else {
                Err(SyncError::Revoked)
            }
        }
        fn endpoint(&self, _: &str) -> Result<String> {
            Err(SyncError::Transport)
        }
    }
    fn account_host() -> (tempfile::TempDir, SyncService, PairingInvite, Arc<Backend>) {
        let dir = tempfile::tempdir().unwrap();
        let workspace = uuid::Uuid::new_v4().to_string();
        let (shared, backend) = shared(dir.path(), &workspace);
        let service = SyncService::with_policy(
            backend.clone(),
            shared.identity.clone(),
            dir.path().join("stage"),
            Some(Arc::new(Gate(AtomicBool::new(true)))),
        )
        .unwrap();
        let address = service
            .start_listener("127.0.0.1:0".parse().unwrap())
            .unwrap();
        let invite =
            PairingInvite::decode(&service.invitation(&format!("ws://{address}/")).unwrap())
                .unwrap();
        (dir, service, invite, backend)
    }
    async fn test_socket(
        host: &Arc<Shared>,
        elapsed: Duration,
        idle: Duration,
    ) -> (
        tempfile::TempDir,
        SecureSocket,
        tokio::task::JoinHandle<Result<()>>,
        watch::Sender<bool>,
    ) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        // Distinct invitations and client identities, not two handlers over one session.
        let invite = host
            .identity
            .invite(
                &host.backend.workspace_id().unwrap(),
                &format!("ws://{}/", listener.local_addr().unwrap()),
            )
            .unwrap();
        let (stop_tx, stop) = watch::channel(false);
        let server_host = host.clone();
        let task = tokio::spawn(async move {
            let (tcp, _) = listener.accept().await.unwrap();
            serve_with_limits(
                server_host,
                tcp,
                stop,
                elapsed,
                idle,
                Duration::from_millis(5),
            )
            .await
        });
        let dir = tempfile::tempdir().unwrap();
        let (client_shared, _) = shared(dir.path(), &invite.workspace_id);
        let (socket, _) = client(&client_shared, &invite).await.unwrap();
        (dir, socket, task, stop_tx)
    }
    async fn begin(socket: &mut SecureSocket) -> Result<wire::Response> {
        socket
            .rpc(&wire::Request::BeginTransfer {
                version: 1,
                direction: TransferDirection::Both,
            })
            .await
    }
    fn ready(response: Result<wire::Response>) {
        assert!(matches!(
            response,
            Ok(wire::Response::TransferReady {
                version: 1,
                direction: TransferDirection::Both
            })
        ));
    }
    #[tokio::test(flavor = "current_thread")]
    async fn two_passive_sockets_reject_busy_without_business_and_release_on_finish() {
        let dir = tempfile::tempdir().unwrap();
        let (mut host, backend) = shared(dir.path(), &uuid::Uuid::new_v4().to_string());
        Arc::get_mut(&mut host).unwrap().policy = Some(Arc::new(Gate(true.into())));
        let (_a, mut a, a_task, _a_stop) =
            test_socket(&host, Duration::from_secs(2), Duration::from_secs(1)).await;
        let (_b, mut b, b_task, _b_stop) =
            test_socket(&host, Duration::from_secs(2), Duration::from_secs(1)).await;
        ready(begin(&mut a).await);
        assert!(matches!(begin(&mut b).await, Err(SyncError::Busy)));
        assert_eq!(b_task.await.unwrap(), Err(SyncError::Busy));
        assert!(b
            .rpc(&wire::Request::Inventory {
                after: None,
                limit: 1
            })
            .await
            .is_err());
        assert_eq!(backend.reads.load(Ordering::SeqCst), 0);
        assert_eq!(backend.publications.load(Ordering::SeqCst), 0);
        assert!(matches!(
            a.rpc(&wire::Request::FinishTransfer).await,
            Ok(wire::Response::TransferComplete)
        ));
        assert_eq!(a_task.await.unwrap(), Ok(()));
        let (_c, mut c, c_task, _c_stop) =
            test_socket(&host, Duration::from_secs(2), Duration::from_secs(1)).await;
        ready(begin(&mut c).await);
        c.rpc(&wire::Request::FinishTransfer).await.unwrap();
        assert_eq!(c_task.await.unwrap(), Ok(()));
    }
    #[tokio::test(flavor = "current_thread")]
    async fn passive_permit_released_only_on_confirmed_disconnect_timeout_stop_or_revocation() {
        for end in ["disconnect", "idle", "elapsed", "stop", "revoke"] {
            let dir = tempfile::tempdir().unwrap();
            let (mut host, backend) = shared(dir.path(), &uuid::Uuid::new_v4().to_string());
            let gate = Arc::new(Gate(true.into()));
            Arc::get_mut(&mut host).unwrap().policy = Some(gate.clone());
            let elapsed = if end == "elapsed" {
                Duration::from_millis(60)
            } else {
                Duration::from_secs(2)
            };
            let idle = if end == "idle" {
                Duration::from_millis(40)
            } else {
                Duration::from_secs(1)
            };
            let (_client, mut socket, task, stop) = test_socket(&host, elapsed, idle).await;
            ready(begin(&mut socket).await);
            assert!(matches!(
                host.reserve_account_operation(),
                Err(SyncError::Busy)
            ));
            match end {
                "disconnect" => drop(socket),
                "stop" => {
                    stop.send(true).unwrap();
                }
                "revoke" => {
                    gate.0.store(false, Ordering::Release);
                }
                _ => {}
            }
            let result = tokio::time::timeout(Duration::from_secs(1), task)
                .await
                .unwrap()
                .unwrap();
            assert_eq!(
                result,
                Err(match end {
                    "disconnect" => SyncError::Transport,
                    "stop" => SyncError::Stopped,
                    "revoke" => SyncError::Revoked,
                    _ => SyncError::Timeout,
                })
            );
            gate.0.store(true, Ordering::Release);
            // Join, not the cancellation request, establishes release.
            assert!(host.reserve_account_operation().unwrap().is_some());
            assert_eq!(backend.reads.load(Ordering::SeqCst), 0);
            assert_eq!(backend.publications.load(Ordering::SeqCst), 0);
        }
    }
    #[tokio::test(flavor = "current_thread")]
    async fn legacy_passive_sockets_keep_concurrent_inventory_without_account_permit() {
        let dir = tempfile::tempdir().unwrap();
        let (host, backend) = shared(dir.path(), &uuid::Uuid::new_v4().to_string());
        // Even a reserved account flag must have no effect on a None-policy service.
        *host.account_operation.lock().unwrap() = true;
        assert!(host.reserve_account_operation().unwrap().is_none());
        let (_a, mut a, a_task, a_stop) =
            test_socket(&host, Duration::from_secs(2), Duration::from_secs(1)).await;
        let (_b, mut b, b_task, b_stop) =
            test_socket(&host, Duration::from_secs(2), Duration::from_secs(1)).await;
        for socket in [&mut a, &mut b] {
            assert!(matches!(
                socket
                    .rpc(&wire::Request::Inventory {
                        after: None,
                        limit: 1
                    })
                    .await,
                Ok(wire::Response::Inventory { .. })
            ));
        }
        assert_eq!(backend.reads.load(Ordering::SeqCst), 2);
        a_stop.send(true).unwrap();
        b_stop.send(true).unwrap();
        assert_eq!(a_task.await.unwrap(), Err(SyncError::Stopped));
        assert_eq!(b_task.await.unwrap(), Err(SyncError::Stopped));
    }
    #[tokio::test(flavor = "current_thread")]
    async fn account_requires_capability_and_push_cannot_read_or_renegotiate() {
        let (_dir, _service, invite, backend) = account_host();
        let client_dir = tempfile::tempdir().unwrap();
        let (client_shared, _) = shared(client_dir.path(), &invite.workspace_id);
        let (mut socket, _) = client(&client_shared, &invite).await.unwrap();
        // Simulates an old account client: Noise authentication alone is insufficient.
        assert!(matches!(
            socket
                .rpc(&wire::Request::Inventory {
                    after: None,
                    limit: 1
                })
                .await,
            Err(SyncError::Protocol)
        ));
        assert!(matches!(
            socket
                .rpc(&wire::Request::BeginTransfer {
                    version: 2,
                    direction: TransferDirection::Both
                })
                .await,
            Err(SyncError::Protocol)
        ));
        assert!(matches!(
            socket
                .rpc(&wire::Request::BeginTransfer {
                    version: 1,
                    direction: TransferDirection::Push
                })
                .await,
            Ok(wire::Response::TransferReady {
                version: 1,
                direction: TransferDirection::Push
            })
        ));
        assert!(matches!(
            socket
                .rpc(&wire::Request::BeginTransfer {
                    version: 1,
                    direction: TransferDirection::Both
                })
                .await,
            Err(SyncError::Protocol)
        ));
        let digest = "a".repeat(64);
        assert!(matches!(
            socket
                .rpc(&wire::Request::Head {
                    digest: digest.clone(),
                    offset: 0
                })
                .await,
            Err(SyncError::Protocol)
        ));
        assert!(matches!(
            socket
                .rpc(&wire::Request::Blob {
                    blob: BlobRef {
                        sha256: digest,
                        size: 0
                    },
                    offset: 0
                })
                .await,
            Err(SyncError::Protocol)
        ));
        assert_eq!(backend.reads.load(Ordering::SeqCst), 0);
        assert!(matches!(
            socket
                .rpc(&wire::Request::Inventory {
                    after: None,
                    limit: 1
                })
                .await,
            Ok(wire::Response::Inventory { .. })
        ));
        assert_eq!(backend.reads.load(Ordering::SeqCst), 1);
        assert!(matches!(
            socket.rpc(&wire::Request::FinishTransfer).await,
            Ok(wire::Response::TransferComplete)
        ));
        assert!(socket.rpc(&wire::Request::Status).await.is_err());
        assert_eq!(backend.publications.load(Ordering::SeqCst), 0);
    }
    #[tokio::test(flavor = "current_thread")]
    async fn account_pull_cannot_prepare_write_or_publish_blob() {
        let (_dir, _service, invite, backend) = account_host();
        let client_dir = tempfile::tempdir().unwrap();
        let (client_shared, _) = shared(client_dir.path(), &invite.workspace_id);
        let (mut socket, _) = client(&client_shared, &invite).await.unwrap();
        assert!(matches!(
            socket
                .rpc(&wire::Request::BeginTransfer {
                    version: 1,
                    direction: TransferDirection::Pull
                })
                .await,
            Ok(wire::Response::TransferReady {
                direction: TransferDirection::Pull,
                ..
            })
        ));
        let digest = "a".repeat(64);
        let value = serde_json::json!({"digest":digest,"valid":true});
        let bytes = serde_json::to_vec(&value).unwrap();
        for request in [
            wire::Request::PutHead {
                digest: digest.clone(),
                total: bytes.len(),
                offset: 0,
                data: wire::encoded(&bytes),
            },
            wire::Request::BlobOffset {
                blob: BlobRef {
                    sha256: digest.clone(),
                    size: 1,
                },
            },
            wire::Request::PutBlob {
                blob: BlobRef {
                    sha256: digest.clone(),
                    size: 1,
                },
                offset: 0,
                data: wire::encoded(&[1]),
                finish: true,
            },
            wire::Request::CommitHead { digest },
        ] {
            assert!(matches!(
                socket.rpc(&request).await,
                Err(SyncError::Protocol)
            ));
        }
        assert_eq!(backend.publications.load(Ordering::SeqCst), 0);
        assert_eq!(backend.reads.load(Ordering::SeqCst), 0);
        assert!(matches!(
            socket.rpc(&wire::Request::FinishTransfer).await,
            Ok(wire::Response::TransferComplete)
        ));
    }
    #[test]
    fn account_capability_schema_is_finite_and_strict() {
        for json in [
            r#"{"type":"beginTransfer","version":1,"direction":"send"}"#,
            r#"{"type":"beginTransfer","version":1,"direction":"push","extra":true}"#,
            r#"{"type":"beginTransfer","direction":"push"}"#,
            r#"{"type":"transferReady","version":1,"direction":"push","extra":true}"#,
        ] {
            assert!(serde_json::from_str::<wire::Request>(json).is_err());
            assert!(serde_json::from_str::<wire::Response>(json).is_err());
        }
        assert!(serde_json::from_str::<wire::Request>(
            r#"{"type":"beginTransfer","version":1,"direction":"both"}"#
        )
        .is_ok());
    }
    #[tokio::test(flavor = "current_thread")]
    async fn account_gate_closes_already_authenticated_stream_without_business_reads() {
        let dir = tempfile::tempdir().unwrap();
        let workspace = uuid::Uuid::new_v4().to_string();
        let (mut host, backend) = shared(dir.path(), &workspace);
        let gate = Arc::new(Gate(AtomicBool::new(true)));
        Arc::get_mut(&mut host).unwrap().policy = Some(gate.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let invite = host
            .identity
            .invite(
                &workspace,
                &format!("ws://{}/", listener.local_addr().unwrap()),
            )
            .unwrap();
        let (_tx, stop) = watch::channel(false);
        let server = tokio::spawn(async move {
            let (tcp, _) = listener.accept().await.unwrap();
            serve(host, tcp, stop).await
        });
        let client_dir = tempfile::tempdir().unwrap();
        let (client_shared, _) = shared(client_dir.path(), &workspace);
        let (mut socket, _) = client(&client_shared, &invite).await.unwrap();
        gate.0.store(false, Ordering::Release);
        assert!(socket
            .rpc(&wire::Request::Inventory {
                after: None,
                limit: 1
            })
            .await
            .is_err());
        assert_eq!(server.await.unwrap(), Err(SyncError::Revoked));
        assert_eq!(backend.reads.load(Ordering::SeqCst), 0);
    }
    #[tokio::test(flavor = "current_thread")]
    async fn local_stale_closes_socket_for_backoff_instead_of_poisoning_peer_protocol() {
        let (_dir, _service, invite, backend) = host();
        let clientdir = tempfile::tempdir().unwrap();
        let (s, _) = shared(clientdir.path(), &invite.workspace_id);
        let (mut socket, _) = client(&s, &invite).await.unwrap();
        backend.stale_flush.store(true, Ordering::SeqCst);
        let request = wire::Request::Inventory {
            after: None,
            limit: 1,
        };
        assert!(matches!(
            socket.rpc(&request).await,
            Err(SyncError::Transport)
        ));
        assert_eq!(backend.reads.load(Ordering::SeqCst), 0);
        let (mut socket, _) = client(&s, &invite).await.unwrap();
        assert!(matches!(
            socket.rpc(&request).await.unwrap(),
            wire::Response::Inventory { .. }
        ));
        assert_eq!(backend.reads.load(Ordering::SeqCst), 1);
    }
    #[tokio::test(flavor = "current_thread")]
    async fn encrypted_replay_and_tampering_close_connection_without_second_request() {
        let (_dir, _service, invite, backend) = host();
        let clientdir = tempfile::tempdir().unwrap();
        let (s, _) = shared(clientdir.path(), &invite.workspace_id);
        let (mut socket, _) = client(&s, &invite).await.unwrap();
        let frame = ciphertext(
            &mut socket,
            &wire::Request::Inventory {
                after: None,
                limit: 1,
            },
        )
        .await;
        send_binary(&mut socket.ws, frame.clone()).await.unwrap();
        assert!(matches!(
            socket.recv::<wire::Response>().await.unwrap(),
            wire::Response::Inventory { .. }
        ));
        assert_eq!(backend.reads.load(Ordering::SeqCst), 1);
        send_binary(&mut socket.ws, frame).await.unwrap();
        assert!(socket.recv::<wire::Response>().await.is_err());
        assert_eq!(backend.reads.load(Ordering::SeqCst), 1);
        let (mut socket, _) = client(&s, &invite).await.unwrap();
        let mut frame = ciphertext(
            &mut socket,
            &wire::Request::Inventory {
                after: None,
                limit: 1,
            },
        )
        .await;
        let last = frame.len() - 1;
        frame[last] ^= 1;
        send_binary(&mut socket.ws, frame).await.unwrap();
        assert!(socket.recv::<wire::Response>().await.is_err());
        assert_eq!(backend.reads.load(Ordering::SeqCst), 1);
    }
    #[tokio::test(flavor = "current_thread")]
    async fn unauthenticated_unknown_protocol_and_oversized_frame_never_reach_backend() {
        let (_dir, _service, invite, backend) = host();
        let clientdir = tempfile::tempdir().unwrap();
        let (s, _) = shared(clientdir.path(), &invite.workspace_id);
        let (mut raw, _) = tokio_tungstenite::connect_async(&invite.endpoint)
            .await
            .unwrap();
        raw.send(Message::Binary(
            serde_json::to_vec(&wire::Request::Inventory {
                after: None,
                limit: 1,
            })
            .unwrap()
            .into(),
        ))
        .await
        .unwrap();
        assert!(!matches!(
            timeout(NETWORK_TIMEOUT, raw.next()).await,
            Ok(Some(Ok(Message::Binary(_))))
        ));
        let (mut socket, _) = client(&s, &invite).await.unwrap();
        socket
            .send(&serde_json::json!({"type":"readFile","path":"/etc/passwd"}))
            .await
            .unwrap();
        assert!(socket.recv::<wire::Response>().await.is_err());
        let (mut socket, _) = client(&s, &invite).await.unwrap();
        socket
            .ws
            .send(Message::Binary(vec![0; MAX_PLAIN_FRAME + 17].into()))
            .await
            .unwrap();
        assert!(socket.recv::<wire::Response>().await.is_err());
        assert_eq!(backend.reads.load(Ordering::SeqCst), 0);
    }
    #[tokio::test(flavor = "current_thread")]
    async fn head_depth_length_and_unoffered_blob_rejected_before_staging() {
        let (_dir, _service, invite, _) = host();
        let clientdir = tempfile::tempdir().unwrap();
        let (s, _) = shared(clientdir.path(), &invite.workspace_id);
        let (mut socket, _) = client(&s, &invite).await.unwrap();
        let id = "a".repeat(64);
        let r = socket
            .rpc(&wire::Request::PutHead {
                digest: id.clone(),
                total: MAX_HEAD + 1,
                offset: 0,
                data: String::new(),
            })
            .await;
        assert!(matches!(r, Err(SyncError::Limit)));
        let b = BlobRef {
            sha256: id.clone(),
            size: MAX_BLOB,
        };
        assert!(socket
            .rpc(&wire::Request::PutBlob {
                blob: b,
                offset: 0,
                data: wire::encoded(b"bad"),
                finish: false
            })
            .await
            .is_err());
        let mut nested = serde_json::json!(0);
        for _ in 0..65 {
            nested = serde_json::json!([nested]);
        }
        let v = serde_json::json!({"digest":id,"valid":true,"payload":nested});
        let bytes = serde_json::to_vec(&v).unwrap();
        assert!(socket
            .rpc(&wire::Request::PutHead {
                digest: id,
                total: bytes.len(),
                offset: 0,
                data: wire::encoded(&bytes)
            })
            .await
            .is_err());
        assert_eq!(
            std::fs::read_dir(clientdir.path().join("stage"))
                .unwrap()
                .count(),
            0
        );
    }
    #[test]
    fn interrupted_blob_resumes_and_hash_failure_cannot_publish() {
        let dir = tempfile::tempdir().unwrap();
        let (s, b) = shared(dir.path(), &uuid::Uuid::new_v4().to_string());
        let data = vec![42u8; CHUNK + 17];
        let reference = BlobRef {
            sha256: format!("{:x}", Sha256::digest(&data)),
            size: data.len() as u64,
        };
        s.staging
            .write(b.as_ref(), &reference, 0, &data[..CHUNK], false)
            .unwrap();
        assert_eq!(
            s.staging.offset(b.as_ref(), &reference).unwrap(),
            CHUNK as u64
        );
        let stage = staging::Staging::open(dir.path().join("stage")).unwrap();
        assert_eq!(stage.offset(b.as_ref(), &reference).unwrap(), CHUNK as u64);
        stage
            .write(b.as_ref(), &reference, CHUNK as u64, &data[CHUNK..], true)
            .unwrap();
        assert!(b.has_blob(&reference).unwrap());
        let invalid = BlobRef {
            sha256: "b".repeat(64),
            size: 3,
        };
        assert!(stage.write(b.as_ref(), &invalid, 0, b"bad", true).is_err());
        assert!(!b.has_blob(&invalid).unwrap());
        assert_eq!(stage.offset(b.as_ref(), &invalid).unwrap(), 0);
    }
    #[test]
    fn partial_staging_budget_cannot_be_bypassed_with_new_hashes() {
        let dir = tempfile::tempdir().unwrap();
        let (s, b) = shared(dir.path(), &uuid::Uuid::new_v4().to_string());
        for i in 0..3 {
            let reference = BlobRef {
                sha256: format!("{i:064x}"),
                size: 10,
            };
            s.staging
                .write(b.as_ref(), &reference, 0, b"x", false)
                .unwrap();
        }
        let fourth = BlobRef {
            sha256: "f".repeat(64),
            size: 10,
        };
        assert_eq!(
            s.staging
                .write(b.as_ref(), &fourth, 0, b"x", false)
                .unwrap_err(),
            SyncError::Limit
        );
        assert_eq!(
            std::fs::read_dir(dir.path().join("stage")).unwrap().count(),
            3
        );
    }
    #[test]
    fn overlapping_chunks_validate_existing_bytes_and_publish_only_once() {
        let dir = tempfile::tempdir().unwrap();
        let (s, b) = shared(dir.path(), &uuid::Uuid::new_v4().to_string());
        let data: Vec<u8> = (0..(CHUNK * 2 + 137)).map(|i| (i % 251) as u8).collect();
        let reference = BlobRef {
            sha256: format!("{:x}", Sha256::digest(&data)),
            size: data.len() as u64,
        };
        assert_eq!(
            s.staging
                .write(b.as_ref(), &reference, 0, &data[..CHUNK], false)
                .unwrap(),
            CHUNK as u64
        );
        // A peer still using offset zero can repeat a prefix without allocating or rewinding.
        assert_eq!(
            s.staging
                .write(b.as_ref(), &reference, 0, &data[..CHUNK], false)
                .unwrap(),
            CHUNK as u64
        );
        let start = CHUNK - 7;
        let end = start + CHUNK;
        assert_eq!(
            s.staging
                .write(
                    b.as_ref(),
                    &reference,
                    start as u64,
                    &data[start..end],
                    false
                )
                .unwrap(),
            end as u64
        );
        let before = std::fs::read(
            dir.path()
                .join("stage")
                .join(format!("{}-{}.part", reference.sha256, reference.size)),
        )
        .unwrap();
        let mut wrong = data[..CHUNK].to_vec();
        wrong[3] ^= 1;
        assert_eq!(
            s.staging
                .write(b.as_ref(), &reference, 0, &wrong, false)
                .unwrap_err(),
            SyncError::Protocol
        );
        assert_eq!(
            s.staging.offset(b.as_ref(), &reference).unwrap(),
            end as u64
        );
        assert_eq!(
            std::fs::read(
                dir.path()
                    .join("stage")
                    .join(format!("{}-{}.part", reference.sha256, reference.size))
            )
            .unwrap(),
            before
        );
        assert_eq!(
            s.staging
                .write(b.as_ref(), &reference, (end + 1) as u64, b"gap", false)
                .unwrap_err(),
            SyncError::Protocol
        );
        assert_eq!(
            s.staging
                .write(b.as_ref(), &reference, end as u64, &data[end..], true)
                .unwrap(),
            reference.size
        );
        // Another download/upload can complete after publication, including its stale first chunk.
        assert_eq!(
            s.staging
                .write(b.as_ref(), &reference, 0, &data[..CHUNK], false)
                .unwrap(),
            reference.size
        );
        assert_eq!(
            s.staging
                .write(b.as_ref(), &reference, reference.size, &[], true)
                .unwrap(),
            reference.size
        );
        assert_eq!(
            s.staging
                .write(b.as_ref(), &reference, 0, &wrong, false)
                .unwrap_err(),
            SyncError::Protocol
        );
        assert_eq!(
            s.staging
                .write(b.as_ref(), &reference, reference.size, &[1], true)
                .unwrap_err(),
            SyncError::Protocol
        );
        assert_eq!(b.publications.load(Ordering::SeqCst), 1);
        assert_eq!(b.blobs.lock().unwrap().get(&reference.sha256), Some(&data));
        assert_eq!(
            std::fs::read_dir(dir.path().join("stage")).unwrap().count(),
            0
        );
    }
}

#[cfg(test)]
mod tls_provider_tests {
    use super::*;
    #[test]
    fn production_connector_has_explicit_ring_provider_and_public_roots() {
        let tokio_tungstenite::Connector::Rustls(config) = tls_connector().unwrap() else {
            panic!("rustls connector required")
        };
        assert!(!config.crypto_provider().cipher_suites.is_empty());
        assert!(config.enable_sni);
    }
}
