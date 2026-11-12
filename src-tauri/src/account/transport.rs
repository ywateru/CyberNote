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
    network::SyncService,
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
    let session = client.login_with_auth_provider("CyberNote").await?;
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
            let session = client.device_session().await.ok_or(Error::Authentication)?;
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
                    Error::Authentication | Error::InvalidProof | Error::OwnershipMismatch
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
