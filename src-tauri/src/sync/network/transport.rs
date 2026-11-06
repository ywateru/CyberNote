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
}
async fn read_binary(ws: &mut Socket) -> Result<Vec<u8>> {
    // A peer cannot extend the deadline indefinitely with Ping/Pong frames.
    let deadline = Instant::now() + NETWORK_TIMEOUT;
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
async fn send_binary(ws: &mut Socket, bytes: Vec<u8>) -> Result<()> {
    if bytes.len() > MAX_PLAIN_FRAME + 16 {
        return Err(SyncError::Limit);
    }
    timeout(NETWORK_TIMEOUT, ws.send(Message::Binary(bytes.into())))
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
    super::super::identity::endpoint(&invite.endpoint)?;
    let (mut ws, _) = timeout(
        NETWORK_TIMEOUT,
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
    send_binary(
        &mut ws,
        serde_json::to_vec(&hello).map_err(|_| SyncError::Protocol)?,
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
    send_binary(&mut ws, noise_write(&mut h, &[])?).await?;
    let bytes = read_binary(&mut ws).await?;
    let host: Device = serde_json::from_slice(&noise_read(&mut h, &bytes)?)
        .map_err(|_| SyncError::Authentication)?;
    uuid(&host.device)?;
    let remote = h.get_remote_static().ok_or(SyncError::Authentication)?;
    if encode(remote) != invite.host_key {
        return Err(SyncError::Authentication);
    }
    let device = Device {
        device: s.backend.device_id()?,
    };
    send_binary(
        &mut ws,
        noise_write(
            &mut h,
            &serde_json::to_vec(&device).map_err(|_| SyncError::Protocol)?,
        )?,
    )
    .await?;
    let mut socket = SecureSocket {
        ws,
        frames: 0,
        transferred: 0,
        started: Instant::now(),
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
    let mut ws = timeout(
        NETWORK_TIMEOUT,
        tokio_tungstenite::accept_async_with_config(MaybeTlsStream::Plain(tcp), Some(config())),
    )
    .await
    .map_err(|_| SyncError::Timeout)?
    .map_err(|_| SyncError::Transport)?;
    let bytes = read_binary(&mut ws).await?;
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
    let bytes = read_binary(&mut ws).await?;
    if !noise_read(&mut h, &bytes)?.is_empty() {
        return Err(SyncError::Protocol);
    }
    let host = Device {
        device: s.backend.device_id()?,
    };
    send_binary(
        &mut ws,
        noise_write(
            &mut h,
            &serde_json::to_vec(&host).map_err(|_| SyncError::Protocol)?,
        )?,
    )
    .await?;
    let bytes = read_binary(&mut ws).await?;
    let device: Device = serde_json::from_slice(&noise_read(&mut h, &bytes)?)
        .map_err(|_| SyncError::Authentication)?;
    let client_key = encode(h.get_remote_static().ok_or(SyncError::Authentication)?);
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
            || self.started.elapsed() > Duration::from_secs(600)
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
        send_binary(&mut self.ws, out).await
    }
    pub async fn recv<T: DeserializeOwned>(&mut self) -> Result<T> {
        let bytes = read_binary(&mut self.ws).await?;
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
        match self.recv().await? {
            wire::Response::Error { code } => Err(match code {
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
    mut stop: watch::Receiver<bool>,
) -> Result<()> {
    let (mut socket, id, key, device) =
        tokio::select! {r=server(&s,tcp)=>r?,_=stop.changed()=>return Err(SyncError::Stopped)};
    let workspace = s.backend.workspace_id()?;
    s.status(&id, "connected", None, false);
    let mut handler = wire::Handler::new();
    let mut last = Instant::now();
    loop {
        s.identity
            .check_authorized(&id, &workspace, &key, &device)?;
        if s.backend.workspace_id()? != workspace {
            return Err(SyncError::WorkspaceMismatch);
        }
        let request = tokio::select! {r=socket.recv::<wire::Request>()=>Some(r?),_=stop.changed()=>return Err(SyncError::Stopped),_=tokio::time::sleep(Duration::from_millis(200))=>None};
        let Some(request) = request else {
            if last.elapsed() > Duration::from_secs(30) {
                return Err(SyncError::Timeout);
            }
            continue;
        };
        last = Instant::now();
        s.identity
            .check_authorized(&id, &workspace, &key, &device)?;
        let response = match handler.handle(&s, request) {
            Ok(r) => r,
            Err(e) => wire::Response::Error { code: e.into() },
        };
        s.identity
            .check_authorized(&id, &workspace, &key, &device)?;
        if matches!(&response, wire::Response::Stored { .. }) {
            s.status(&id, "idle", None, true);
        }
        tokio::select! {r=socket.send(&response)=>r?,_=stop.changed()=>return Err(SyncError::Stopped)};
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};
    use std::collections::BTreeMap;
    use std::sync::atomic::{AtomicUsize, Ordering};
    struct Backend {
        workspace: String,
        device: String,
        reads: AtomicUsize,
        publications: AtomicUsize,
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
            blobs: Mutex::new(BTreeMap::new()),
        });
        let identity =
            Arc::new(IdentityStore::open(&dir.join("identity"), &backend.device).unwrap());
        let s = Arc::new(Shared {
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
