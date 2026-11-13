//! Authenticated bootstrap is separate from replication; it never reads note data.
use super::{
    config,
    enrollment::{Claims, Enrollment, Gate},
    private::Binding,
    types::{Device, Error, Result},
};
use crate::sync::{
    adapter,
    identity::{now, IdentityStore, PairingInvite},
    network::{ReplicationPolicy, SyncService},
};
use cybergrid_sdk::{Client, Mapping, Port};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    task::JoinSet,
};
use tokio_util::sync::CancellationToken;

pub(crate) fn transient_sdk(error: &cybergrid_sdk::Error) -> bool {
    matches!(
        error,
        cybergrid_sdk::Error::Http(_)
            | cybergrid_sdk::Error::Timeout(_)
            | cybergrid_sdk::Error::Api {
                status: 500..=599,
                ..
            }
    )
}

/// Retry coordination on the SAME SDK owner. Never drop an in-flight owned
/// registration or replace an uncertain operation with a fresh Client/device.
pub(crate) async fn retry_sdk<T, F, Fut, R>(
    stop: &CancellationToken,
    mut operation: F,
    retryable: R,
) -> cybergrid_sdk::Result<T>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = cybergrid_sdk::Result<T>>,
    R: Fn(&cybergrid_sdk::Error) -> bool,
{
    for attempt in 0..3 {
        if stop.is_cancelled() {
            return Err(cybergrid_sdk::Error::Cancelled);
        }
        // The SDK owns reconciliation of a request whose result is uncertain.
        // Cancellation fences the next attempt, rather than dropping this one.
        match operation().await {
            Ok(value) if !stop.is_cancelled() => return Ok(value),
            Ok(_) => return Err(cybergrid_sdk::Error::Cancelled),
            Err(error) if attempt == 2 || !retryable(&error) => return Err(error),
            Err(_) => {}
        }
        tokio::select! {
            _ = stop.cancelled() => return Err(cybergrid_sdk::Error::Cancelled),
            _ = tokio::time::sleep(Duration::from_secs(1 << attempt)) => {}
        }
    }
    unreachable!()
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    proof: String,
    nonce: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Response {
    proof: String,
    nonce: String,
    invitation: String,
}
async fn write<T: Serialize>(io: &mut (impl AsyncWriteExt + Unpin), value: &T) -> Result<()> {
    let bytes = serde_json::to_vec(value).map_err(|_| Error::InvalidProof)?;
    if bytes.len() > 16384 {
        return Err(Error::InvalidProof);
    }
    io.write_u32(bytes.len() as u32).await?;
    io.write_all(&bytes).await?;
    Ok(())
}
async fn read<T: serde::de::DeserializeOwned>(io: &mut (impl AsyncReadExt + Unpin)) -> Result<T> {
    let size = io.read_u32().await? as usize;
    if size == 0 || size > 16384 {
        return Err(Error::InvalidProof);
    }
    let mut bytes = vec![0; size];
    io.read_exact(&mut bytes).await?;
    serde_json::from_slice(&bytes).map_err(|_| Error::InvalidProof)
}
struct Bootstrap {
    enrollment: Arc<Enrollment>,
    binding: Binding,
    identity: Arc<IdentityStore>,
    gate: Arc<Gate>,
    proof: Mutex<String>,
}
impl Bootstrap {
    async fn serve(&self, mut stream: TcpStream) -> Result<()> {
        let request: Request = read(&mut stream).await?;
        uuid::Uuid::parse_str(&request.nonce).map_err(|_| Error::InvalidProof)?;
        let claims = self
            .enrollment
            .verify(&request.proof, &self.binding)
            .await?;
        if claims.device_id == self.binding.device_id {
            return Err(Error::InvalidProof);
        }
        self.gate.admit(&claims);
        // Verification awaits network IO. The owner, SDK or signed local lease
        // may have closed meanwhile; fence invitation creation as well as Noise.
        self.gate
            .authorize(&claims.device_id, &claims.noise_public_key)?;
        let proof = self.proof.lock().map_err(|_| Error::Storage)?.clone();
        // A loopback connection is not authentication; only a signed enrollment
        // plus the expected static Noise key/device grants access to the PSK.
        let invitation = self
            .identity
            .invite_enrolled(
                &self.binding.workspace_id,
                "ws://127.0.0.1:1/",
                &claims.device_id,
                &claims.noise_public_key,
            )?
            .token()?;
        write(
            &mut stream,
            &Response {
                proof,
                nonce: request.nonce,
                invitation,
            },
        )
        .await
    }
}
pub(crate) struct Snapshot {
    pub devices: Vec<Device>,
    pub last_sync_at: Option<u64>,
}
pub(crate) async fn run(
    runtime: Arc<adapter::Runtime>,
    identity: Arc<IdentityStore>,
    binding: Binding,
    auth: Arc<account_auth::AuthClient>,
    client: Arc<Client>,
    enrollment: Arc<Enrollment>,
    gate: Arc<Gate>,
    stop: CancellationToken,
    publish: Arc<dyn Fn(std::result::Result<Snapshot, Error>) + Send + Sync>,
) -> Result<()> {
    let session = retry_sdk(
        &stop,
        || client.login_with_auth_provider("CyberNote"),
        |error| {
            transient_sdk(error)
                || (matches!(error, cybergrid_sdk::Error::ExchangeOutcomeUnknown)
                    && client.snapshot().coordination.retryable)
        },
    )
    .await
    .map_err(|error| Error::sdk_at(error, super::types::NetworkStage::CoordinatorRegistration))?;
    if session.user.id != binding.subject
        || session.product_id.as_deref().unwrap_or(&session.app_id) != binding.product_id
    {
        let _ = client.close().await;
        return Err(Error::OwnershipMismatch);
    }
    let access = auth.access_token(Duration::from_secs(60), false).await?;
    let (proof, claims, verified) = enrollment.issue(access.secret(), &binding).await?;
    let service = {
        let runtime = runtime.clone();
        let identity = identity.clone();
        let binding = binding.clone();
        let gate = gate.clone();
        tokio::task::spawn_blocking(move || runtime.activate_account(&verified, identity, gate))
            .await
            .map_err(|_| Error::Sync)??
    };
    let result = run_service(
        &service,
        identity,
        binding,
        auth,
        client.clone(),
        enrollment,
        gate.clone(),
        stop,
        publish,
        proof,
        claims,
    )
    .await;
    gate.close();
    runtime.pause_account();
    let _ = client.close().await;
    // No listener survives owner shutdown; join sync workers before dropping state.
    let shutdown = tokio::task::spawn_blocking(move || {
        let mut service = service;
        service.shutdown()
    })
    .await
    .map_err(|_| Error::Sync)?;
    result.and(shutdown.map_err(Error::from))
}
async fn run_service(
    service: &SyncService,
    identity: Arc<IdentityStore>,
    binding: Binding,
    auth: Arc<account_auth::AuthClient>,
    client: Arc<Client>,
    enrollment: Arc<Enrollment>,
    gate: Arc<Gate>,
    stop: CancellationToken,
    publish: Arc<dyn Fn(std::result::Result<Snapshot, Error>) + Send + Sync>,
    proof: String,
    mut claims: Claims,
) -> Result<()> {
    let sync = service.start_listener("127.0.0.1:0".parse().map_err(|_| Error::Configuration)?)?;
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let bootstrap = Arc::new(Bootstrap {
        enrollment: enrollment.clone(),
        binding: binding.clone(),
        identity: identity.clone(),
        gate: gate.clone(),
        proof: Mutex::new(proof),
    });
    gate.renew_local(claims.exp);
    client
        .expose(Port::tcp(config::SYNC_PORT, sync.port(), "notes-sync/1"))
        .await?;
    client
        .expose(Port::tcp(
            config::ENROLL_PORT,
            listener.local_addr()?.port(),
            "cybernote-enrollment/1",
        ))
        .await?;
    client.enable_remote().await?;
    let child = stop.child_token();
    let server_stop = child.clone();
    let handler = bootstrap.clone();
    let server = tokio::spawn(async move {
        let mut tasks = JoinSet::new();
        loop {
            tokio::select! {
                _=server_stop.cancelled()=>break,
                Some(_)=tasks.join_next(),if !tasks.is_empty()=>{},
                accepted=listener.accept()=>{let Ok((stream,_))=accepted else{break};if tasks.len()>=4{drop(stream);continue}
                    let handler=handler.clone();tasks.spawn(async move{let _=tokio::time::timeout(Duration::from_secs(20),handler.serve(stream)).await;});}
            }
        }
        tasks.abort_all();
        while tasks.join_next().await.is_some() {}
    });
    let mut mappings: HashMap<String, (Mapping, Mapping)> = HashMap::new();
    let mut backoff = Duration::from_secs(2);
    let result = loop {
        let cycle = async {
            if claims.exp <= now() + 90 {
                let access = auth.access_token(Duration::from_secs(60), false).await?;
                let (proof, next, _) = enrollment.issue(access.secret(), &binding).await?;
                *bootstrap.proof.lock().map_err(|_| Error::Storage)? = proof;
                claims = next;
                gate.renew_local(claims.exp);
            }
            let session = client.device_session().await.ok_or(Error::AuthenticationAt(
                super::types::NetworkStage::CoordinatorSession,
            ))?;
            if session.user.id != binding.subject
                || session.product_id.as_deref().unwrap_or(&session.app_id) != binding.product_id
            {
                return Err(Error::OwnershipMismatch);
            }
            let current_device = session.device_id;
            let devices = client.devices().await?;
            let retired = mappings
                .keys()
                .filter(|id| !devices.iter().any(|d| &d.id == *id && d.online))
                .cloned()
                .collect::<Vec<_>>();
            for id in retired {
                if let Some((enroll, sync)) = mappings.remove(&id) {
                    enroll.close().await;
                    sync.close().await;
                }
            }
            let mut snapshot = Vec::new();
            let mut remote_count = 0;
            for device in &devices {
                if !device.online || !device.ports.iter().any(|p| p.id == config::ENROLL_PORT) {
                    continue;
                }
                // Publication includes this device. Never bootstrap ourselves.
                let is_current = device.id == current_device;
                if is_current {
                    snapshot.push(Device {
                        id: device.id.clone(),
                        name: device
                            .name
                            .chars()
                            .take(120)
                            .filter(|c| !c.is_control())
                            .collect(),
                        online: true,
                        current: true,
                        connected: false,
                    });
                    continue;
                }
                if remote_count >= 3 {
                    continue;
                }
                remote_count += 1;
                if !mappings.contains_key(&device.id) {
                    let enroll = client
                        .map(
                            &device.id,
                            config::ENROLL_PORT,
                            "127.0.0.1:0".parse().map_err(|_| Error::Configuration)?,
                        )
                        .await?;
                    let sync = match client
                        .map(
                            &device.id,
                            config::SYNC_PORT,
                            "127.0.0.1:0".parse().map_err(|_| Error::Configuration)?,
                        )
                        .await
                    {
                        Ok(v) => v,
                        Err(e) => {
                            enroll.close().await;
                            return Err(Error::from(e));
                        }
                    };
                    mappings.insert(device.id.clone(), (enroll, sync));
                }
                let (enroll, sync) = mappings.get(&device.id).ok_or(Error::Network)?;
                let mut stream = TcpStream::connect(enroll.addr).await?;
                let nonce = uuid::Uuid::new_v4().to_string();
                let proof = bootstrap.proof.lock().map_err(|_| Error::Storage)?.clone();
                write(
                    &mut stream,
                    &Request {
                        proof,
                        nonce: nonce.clone(),
                    },
                )
                .await?;
                let response: Response =
                    tokio::time::timeout(Duration::from_secs(25), read(&mut stream))
                        .await
                        .map_err(|_| Error::Network)??;
                if response.nonce != nonce {
                    return Err(Error::InvalidProof);
                }
                let remote = enrollment.verify(&response.proof, &binding).await?;
                if remote.device_id == binding.device_id {
                    return Err(Error::InvalidProof);
                }
                let mut invite = PairingInvite::decode(&response.invitation)?;
                if invite.workspace_id != binding.workspace_id
                    || invite.host_key != remote.noise_public_key
                {
                    return Err(Error::InvalidProof);
                }
                gate.admit(&remote);
                gate.route(&remote.device_id, format!("ws://{}/", sync.addr));
                let paired = identity.peer_for_device(&remote.device_id)?;
                if let Some(id) = paired {
                    let pinned = identity.credential(&id)?;
                    if pinned.host_key != remote.noise_public_key {
                        return Err(Error::InvalidProof);
                    }
                    if pinned.phase == crate::sync::identity::PairingPhase::Prepared {
                        service.recover_pairing(&id)?;
                    }
                    match service.connect(&id) {
                        Ok(()) | Err(crate::sync::identity::SyncError::Busy) => (),
                        Err(e) => return Err(e.into()),
                    }
                    service.sync_now()?;
                } else {
                    invite.endpoint = format!("ws://{}/", sync.addr);
                    // SyncService has its own runtime; block only this dedicated
                    // network worker, never the WebView or Session lock.
                    tokio::task::block_in_place(|| service.pair(&invite.token()?))?;
                }
                let live = service.status()?;
                let peer_id = identity.peer_for_device(&remote.device_id)?;
                let connected = live.connections.iter().any(|s| {
                    peer_id.as_ref() == Some(&s.peer_id)
                        && (s.phase == "idle" || s.phase == "transferring")
                });
                snapshot.push(Device {
                    id: device.id.clone(),
                    name: device
                        .name
                        .chars()
                        .take(120)
                        .filter(|c| !c.is_control())
                        .collect(),
                    online: true,
                    current: false,
                    connected,
                });
            }
            let live = service.status()?;
            let last_sync_at = live
                .connections
                .iter()
                .filter_map(|s| s.last_success)
                .max()
                .map(|s| s * 1000);
            Ok(Snapshot {
                devices: snapshot,
                last_sync_at,
            })
        };
        let outcome = tokio::select! {_=stop.cancelled()=>break Ok(()),result=cycle=>result};
        match outcome {
            Ok(snapshot) => {
                backoff = Duration::from_secs(5);
                publish(Ok(snapshot));
            }
            Err(error) => {
                // Old authorization may only continue until the signed lease expires.
                // Authentication/proof errors fence it immediately; never manual fallback.
                if matches!(
                    error,
                    Error::Authentication
                        | Error::AuthenticationAt(_)
                        | Error::ProviderAuthentication(_)
                        | Error::InvalidProof
                        | Error::OwnershipMismatch
                ) {
                    gate.close();
                    publish(Err(error));
                    break Err(error);
                }
                publish(Err(error));
                backoff = (backoff * 2).min(Duration::from_secs(30));
            }
        }
        tokio::select! {_=stop.cancelled()=>break Ok(()),_=tokio::time::sleep(backoff)=>{}}
    };
    gate.close();
    child.cancel();
    let _ = server.await;
    for (_, (enroll, sync)) in mappings {
        enroll.close().await;
        sync.close().await;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
    use p384::{
        elliptic_curve::sec1::ToEncodedPoint,
        pkcs8::{EncodePrivateKey, LineEnding},
        SecretKey,
    };
    use std::sync::atomic::{AtomicBool, Ordering};

    #[tokio::test]
    async fn initial_coordination_retries_are_bounded_and_permanent_rejections_do_not_retry() {
        use std::sync::atomic::AtomicUsize;
        let stop = CancellationToken::new();
        let calls = AtomicUsize::new(0);
        let result = retry_sdk(
            &stop,
            || async {
                if calls.fetch_add(1, Ordering::SeqCst) < 2 {
                    Err(cybergrid_sdk::Error::Timeout("synthetic registration"))
                } else {
                    Ok(7)
                }
            },
            transient_sdk,
        )
        .await
        .unwrap();
        assert_eq!(result, 7);
        assert_eq!(calls.load(Ordering::SeqCst), 3);

        for status in [401, 403, 400, 429] {
            let calls = AtomicUsize::new(0);
            assert!(retry_sdk::<(), _, _, _>(
                &stop,
                || async {
                    calls.fetch_add(1, Ordering::SeqCst);
                    Err(cybergrid_sdk::Error::Api {
                        status,
                        code: "synthetic-private-provider-text".into(),
                    })
                },
                transient_sdk
            )
            .await
            .is_err());
            assert_eq!(calls.load(Ordering::SeqCst), 1);
        }
        assert!(!transient_sdk(
            &cybergrid_sdk::Error::ExchangeOutcomeUnknown
        ));
        assert!(!transient_sdk(&cybergrid_sdk::Error::Protocol(
            "synthetic".into()
        )));
    }

    #[tokio::test]
    async fn cancelling_initial_coordination_drains_dispatched_work_and_fences_retry() {
        use std::sync::atomic::AtomicUsize;
        let stop = CancellationToken::new();
        let entered = tokio::sync::Notify::new();
        let release = tokio::sync::Notify::new();
        let completed = AtomicBool::new(false);
        let calls = AtomicUsize::new(0);
        let operation = retry_sdk::<(), _, _, _>(
            &stop,
            || async {
                calls.fetch_add(1, Ordering::SeqCst);
                entered.notify_one();
                release.notified().await;
                completed.store(true, Ordering::SeqCst);
                Err(cybergrid_sdk::Error::Timeout(
                    "synthetic uncertain response",
                ))
            },
            transient_sdk,
        );
        let cancel = async {
            entered.notified().await;
            stop.cancel();
            assert!(!completed.load(Ordering::SeqCst));
            release.notify_one();
        };
        let (result, _) = tokio::join!(operation, cancel);
        assert!(matches!(result, Err(cybergrid_sdk::Error::Cancelled)));
        assert!(completed.load(Ordering::SeqCst));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        let called_after_cancel = AtomicBool::new(false);
        assert!(matches!(
            retry_sdk(
                &stop,
                || async {
                    called_after_cancel.store(true, Ordering::SeqCst);
                    Ok(())
                },
                transient_sdk
            )
            .await,
            Err(cybergrid_sdk::Error::Cancelled)
        ));
        assert!(!called_after_cancel.load(Ordering::SeqCst));
    }

    async fn bootstrap_during_verification(revoke: &str) {
        let directory = tempfile::tempdir().unwrap();
        let device = uuid::Uuid::new_v4().to_string();
        let identity = Arc::new(IdentityStore::open(directory.path(), &device).unwrap());
        let before = std::fs::read(directory.path().join("identity-v1.json")).unwrap();
        let binding = Binding {
            issuer: config::ISSUER.into(),
            subject: "synthetic-bootstrap-owner".into(),
            product_id: "cybernote".into(),
            workspace_id: uuid::Uuid::new_v4().to_string(),
            device_id: device,
            noise_public_key: identity.public_key().unwrap(),
            enabled: true,
        };
        let secret = SecretKey::random(&mut rand::rngs::OsRng);
        let point = secret.public_key().to_encoded_point(false);
        let jwks = serde_json::json!({"keys":[{"kty":"EC","crv":"P-384","kid":"synthetic-bootstrap","alg":"ES384","use":"sig","x":B64.encode(point.x().unwrap()),"y":B64.encode(point.y().unwrap())}]}).to_string();
        let key = jsonwebtoken::EncodingKey::from_ec_pem(
            secret.to_pkcs8_pem(LineEnding::LF).unwrap().as_bytes(),
        )
        .unwrap();
        let http = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let origin = format!("http://{}", http.local_addr().unwrap());
        let claims = Claims {
            iss: origin.clone(),
            aud: "cybernote-enrollment-v1".into(),
            sub: binding.subject.clone(),
            account_issuer: binding.issuer.clone(),
            product_id: binding.product_id.clone(),
            workspace_id: binding.workspace_id.clone(),
            device_id: uuid::Uuid::new_v4().to_string(),
            noise_public_key: B64.encode([7; 32]),
            purpose: "pair".into(),
            iat: now(),
            exp: now() + 200,
            jti: uuid::Uuid::new_v4().to_string(),
        };
        let mut header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::ES384);
        header.kid = Some("synthetic-bootstrap".into());
        let proof = jsonwebtoken::encode(&header, &claims, &key).unwrap();
        let local_proof = jsonwebtoken::encode(
            &header,
            &Claims {
                device_id: binding.device_id.clone(),
                noise_public_key: binding.noise_public_key.clone(),
                ..claims.clone()
            },
            &key,
        )
        .unwrap();
        let (seen, verification_started) = tokio::sync::oneshot::channel();
        let (release, proceed) = tokio::sync::oneshot::channel();
        let jwks_server = tokio::spawn(async move {
            let (mut stream, _) = http.accept().await.unwrap();
            let mut request = Vec::new();
            while !request.windows(4).any(|w| w == b"\r\n\r\n") {
                let mut chunk = [0; 1024];
                let n = stream.read(&mut chunk).await.unwrap();
                assert!(n > 0 && request.len() + n <= 4096);
                request.extend_from_slice(&chunk[..n]);
            }
            assert!(request.starts_with(b"GET /api/v1/account/jwks HTTP/1.1\r\n"));
            seen.send(()).unwrap();
            proceed.await.unwrap();
            stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",jwks.len(),jwks).as_bytes()).await.unwrap();
        });
        let gate = Arc::new(Gate::default());
        gate.renew_local(now() + 200);
        let active = Arc::new(AtomicBool::new(true));
        let owner = active.clone();
        gate.bind_lifecycle(Arc::new(move || owner.load(Ordering::Acquire)));
        let bootstrap = Bootstrap {
            enrollment: Arc::new(Enrollment::new(origin).unwrap()),
            binding: binding.clone(),
            identity: identity.clone(),
            gate: gate.clone(),
            proof: Mutex::new(local_proof.clone()),
        };
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let mut client = TcpStream::connect(listener.local_addr().unwrap())
            .await
            .unwrap();
        let (stream, _) = listener.accept().await.unwrap();
        let host = tokio::spawn(async move { bootstrap.serve(stream).await });
        let nonce = uuid::Uuid::new_v4().to_string();
        write(
            &mut client,
            &Request {
                proof,
                nonce: nonce.clone(),
            },
        )
        .await
        .unwrap();
        tokio::time::timeout(Duration::from_secs(5), verification_started)
            .await
            .unwrap()
            .unwrap();
        match revoke {
            "close" => gate.close(),
            "cancel-owner" => active.store(false, Ordering::Release),
            "active" => (),
            _ => unreachable!(),
        }
        release.send(()).unwrap();
        let result = tokio::time::timeout(Duration::from_secs(5), host)
            .await
            .unwrap()
            .unwrap();
        jwks_server.await.unwrap();
        if revoke == "active" {
            result.unwrap();
            let response: Response = read(&mut client).await.unwrap();
            assert_eq!(response.nonce, nonce);
            assert_eq!(response.proof, local_proof);
            let invite = PairingInvite::decode(&response.invitation).unwrap();
            assert_eq!(invite.workspace_id, binding.workspace_id);
            assert_eq!(invite.host_key, binding.noise_public_key);
            assert!(identity
                .authorize(
                    &invite.invitation_id,
                    &binding.workspace_id,
                    &B64.encode([8; 32]),
                    &claims.device_id
                )
                .is_err());
            identity
                .authorize(
                    &invite.invitation_id,
                    &binding.workspace_id,
                    &claims.noise_public_key,
                    &claims.device_id,
                )
                .unwrap();
        } else {
            assert!(
                result.is_err(),
                "bootstrap returned an invitation after {revoke}"
            );
            assert_eq!(
                std::fs::read(directory.path().join("identity-v1.json")).unwrap(),
                before,
                "closed bootstrap persisted an invitation"
            );
        }
    }

    #[tokio::test]
    async fn bootstrap_rechecks_closed_gate_after_proof_verification() {
        bootstrap_during_verification("close").await;
    }
    #[tokio::test]
    async fn bootstrap_rechecks_cancelled_owner_after_proof_verification() {
        bootstrap_during_verification("cancel-owner").await;
    }
    #[tokio::test]
    async fn active_bootstrap_returns_nonce_bound_noise_key_pinned_invitation() {
        bootstrap_during_verification("active").await;
    }
}
