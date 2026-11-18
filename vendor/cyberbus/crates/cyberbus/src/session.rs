pub(crate) mod acquire;
mod outbox;
#[cfg(test)]
pub(crate) use outbox::PeerOutput;
pub(crate) use outbox::{OutputBudget, PeerSender};
#[cfg(test)]
pub(crate) fn test_channel() -> (PeerSender, PeerOutput) {
    outbox::channel(OutputBudget::default())
}
use crate::{error, pb};
use cyberbus_protocol::{noise, reassembly};
use cyberbus_transport::{BoxStream, CancellationToken, Transport};
use std::{
    collections::{BTreeMap, BTreeSet},
    net::{Ipv4Addr, SocketAddrV4},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tokio::sync::mpsc;
use zeroize::Zeroizing;
pub(crate) type Body = pb::wire_envelope::Body;
pub(crate) type BusinessFlag = Arc<AtomicBool>;
#[derive(Default)]
pub(crate) struct Progress {
    // Ordinary IO completion is not owner revocation: queued authenticated
    // notifications remain ordered before Down. Explicit cancel still fences them.
    pub io_ended: CancellationToken,
    pub noise: AtomicBool,
    pub metadata: AtomicBool,
    pub owner_done: CancellationToken,
    pub revocation: std::sync::OnceLock<CancellationToken>,
}
pub(crate) struct Keys {
    pub private: Zeroizing<[u8; 32]>,
    pub psk: Zeroizing<[u8; 32]>,
    pub binding: [u8; 32],
    pub boot: [u8; 16],
}
pub(crate) struct Admission {
    pub open: AtomicBool,
    pub policy: Mutex<Policy>,
    pub local: Vec<u8>,
    pub output_budget: OutputBudget,
}
#[derive(Default)]
pub(crate) struct Policy {
    pub blocked: BTreeSet<Vec<u8>>,
    epochs: BTreeMap<Vec<u8>, u64>,
}
impl Policy {
    pub fn deny(&mut self, id: Vec<u8>) {
        let epoch = self.epochs.entry(id.clone()).or_default();
        *epoch = epoch.checked_add(1).expect("peer policy epoch exhausted");
        self.blocked.insert(id);
    }
}
impl Admission {
    pub fn epoch(&self, id: &[u8]) -> Option<u64> {
        let policy = self.policy.lock().ok()?;
        (self.open.load(Ordering::Acquire) && id != self.local && !policy.blocked.contains(id))
            .then(|| policy.epochs.get(id).copied().unwrap_or(0))
    }
    pub fn allows(&self, id: &[u8]) -> bool {
        self.epoch(id).is_some()
    }
}
// Created only after the real Noise handshake. The ID is Noise's authenticated session ID;
// the policy epoch also fences handshakes/Up notifications queued across block/unblock.
#[derive(Clone)]
pub(crate) struct Session {
    pub generation: u64,
    pub address_generation: u64,
    pub business: Arc<AtomicBool>,
    pub outbound: bool,
    pub id: [u8; 32],
    pub policy_epoch: u64,
    pub cancel: CancellationToken,
    pub progress: Arc<Progress>,
}
impl Session {
    pub fn address_current(&self, status: &cyberbus_transport::TransportStatus) -> bool {
        status.generation == self.address_generation
            && status.phase == cyberbus_transport::AddressPhase::Ready
    }
    pub fn live(&self) -> bool {
        !self.cancel.is_cancelled() && !self.progress.io_ended.is_cancelled()
    }
    pub fn same_instance(&self, other: &Self) -> bool {
        self.generation == other.generation && self.id == other.id
    }
}
pub(crate) struct BusinessReady {
    pub deadline: tokio::time::Instant,
    pub expected: Vec<u8>,
    pub reply: tokio::sync::oneshot::Sender<Result<(), pb::ProtocolError>>,
}
pub(crate) enum Incoming {
    Up {
        id: Vec<u8>,
        bind: pb::SessionBind,
        ip: Ipv4Addr,
        send: PeerSender,
        session: Session,
        ready: Option<BusinessReady>,
    },
    OutputExpired {
        id: Vec<u8>,
        session: Session,
        body: Body,
    },
    Frame {
        id: Vec<u8>,
        session: Session,
        body: Body,
    },
    RefreshFinished {
        generation: u64,
        result: pb::RefreshDevicesResult,
    },
    ProbeFinished {
        generation: u64,
        address_generation: u64,
        count_failure: bool,
        ip: Ipv4Addr,
        round: u64,
        verified: bool,
    },
    Down {
        id: Vec<u8>,
        session: Session,
    },
}
fn config(keys: &Keys) -> noise::NoiseConfig {
    noise::NoiseConfig::new(*keys.private, *keys.psk, keys.binding, "1", keys.boot)
}
pub(crate) async fn handshake(
    io: BoxStream,
    ip: Ipv4Addr,
    outbound: bool,
    keys: Arc<Keys>,
    admission: Arc<Admission>,
    incoming: mpsc::Sender<Incoming>,
    stop: CancellationToken,
    generation: u64,
    address_generation: u64,
    business: bool,
    ready: Option<BusinessReady>,
) -> bool {
    handshake_tracked(
        io,
        ip,
        outbound,
        keys,
        admission,
        incoming,
        stop,
        generation,
        address_generation,
        Arc::new(AtomicBool::new(business)),
        ready,
        Arc::default(),
    )
    .await
}
// The scheduler observes this same flag; promotion releases only its probe
// admission, while the caller's JoinSet keeps owning the complete session task.
pub(crate) async fn handshake_tracked(
    io: BoxStream,
    ip: Ipv4Addr,
    outbound: bool,
    keys: Arc<Keys>,
    admission: Arc<Admission>,
    incoming: mpsc::Sender<Incoming>,
    stop: CancellationToken,
    generation: u64,
    address_generation: u64,
    business: BusinessFlag,
    ready: Option<BusinessReady>,
    progress: Arc<Progress>,
) -> bool {
    let began = tokio::time::Instant::now();
    let acquiring = ready.is_some();
    let deadline = ready
        .as_ref()
        .map(|r| r.deadline)
        .unwrap_or_else(|| began + Duration::from_secs(if outbound { 2 } else { 10 }));
    let mut policy_epoch = None;
    let admit = |bind: &pb::SessionBind| {
        policy_epoch = admission.epoch(&bind.device_id);
        policy_epoch
            .map(|_| ())
            .ok_or(cyberbus_protocol::Error::Closed)
    };
    let established = tokio::select! {_ = stop.cancelled()=>{
        if acquiring { acquire::report(acquire::Stage::Noise, acquire::Class::Cancelled, began.elapsed(), 1); }
        return false;
    },result=tokio::time::timeout_at(deadline, async{if outbound{noise::connect(io,config(&keys),admit).await}else{noise::accept(io,config(&keys),admit).await}})=>result};
    let stream = match established {
        Ok(Ok(stream)) => stream,
        failed => {
            if acquiring {
                let class = match failed {
                    Err(_) => acquire::Class::Deadline,
                    Ok(Err(e)) => acquire::Class::noise(&e),
                    Ok(Ok(_)) => unreachable!(),
                };
                acquire::report(acquire::Stage::Noise, class, began.elapsed(), 1);
            }
            return false;
        }
    };
    let (mut reader, mut writer, peer) = stream.into_split();
    progress.noise.store(true, Ordering::Release);
    let id = peer.device_id.to_vec();
    let (send, mut outgoing) = outbox::channel(admission.output_budget.clone());
    let cancel = stop.child_token();
    let _ = progress.revocation.set(cancel.clone());
    let session = Session {
        generation,
        address_generation,
        business,
        outbound,
        id: peer.session_id,
        policy_epoch: policy_epoch.expect("Noise admitted the peer"),
        cancel: cancel.clone(),
        progress: progress.clone(),
    };
    let up = Incoming::Up {
        id: id.clone(),
        bind: peer.bind,
        ip,
        send,
        session: session.clone(),
        ready,
    };
    // Up and every subsequent frame share one FIFO. Business acquisition is
    // acknowledged by the owner only after Up is installed, never by this task.
    let published = tokio::select! { biased;
        _=tokio::time::sleep_until(deadline)=>false,
        _=stop.cancelled()=>false,
        _=cancel.cancelled()=>false,
        result=incoming.send(up)=>result.is_ok(),
    };
    if !published {
        if acquiring {
            acquire::report(
                acquire::Stage::UpEnqueue,
                acquire::Class::Closed,
                began.elapsed(),
                1,
            );
        }
        return false;
    }
    // Never cancel a pending Noise read when an outbound frame or keepalive becomes ready.
    let reader_tx = incoming.clone();
    let reader_id = id.clone();
    let reader_cancel = cancel.clone();
    let reader_io = progress.io_ended.clone();
    let reader_session = session.clone();
    let reader_admission = admission.clone();
    let read_task = tokio::spawn(async move {
        loop {
            let frame = tokio::select! {_ = reader_cancel.cancelled()=>break,_ = reader_io.cancelled()=>break,result=reader.recv()=>result};
            let Ok(frame) = frame else { break };
            if !reader_admission.allows(&reader_id) {
                break;
            }
            if let Some(body) = frame.body {
                if reader_tx
                    .send(Incoming::Frame {
                        id: reader_id.clone(),
                        session: reader_session.clone(),
                        body,
                    })
                    .await
                    .is_err()
                {
                    break;
                }
            }
        }
        reader_io.cancel();
    });
    let probe_deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        let mut queued = tokio::select! {
            _ = cancel.cancelled()=>break,
            _ = progress.io_ended.cancelled()=>break,
            _ = tokio::time::sleep_until(probe_deadline), if !session.business.load(Ordering::Acquire)=>{
                // Promotion can happen while this select is waiting without any
                // output on this crossed stream. The guard was checked before
                // promotion, so recheck admission when the armed timer fires.
                if !session.business.load(Ordering::Acquire) { break; }
                continue;
            },
            body=outgoing.recv_queued()=>match body { Some(b)=>b, None=>break }
        };
        if !admission.allows(&id) {
            break;
        }
        if queued.is_revoked() {
            continue;
        }
        let body = match queued.prepare() {
            Ok(body) => body,
            Err(body) => {
                let _ = incoming
                    .send(Incoming::OutputExpired {
                        id: id.clone(),
                        session: session.clone(),
                        body,
                    })
                    .await;
                continue;
            }
        };
        if !matches!(
            tokio::time::timeout(Duration::from_secs(5), writer.send(body)).await,
            Ok(Ok(()))
        ) {
            break;
        }
    }
    progress.io_ended.cancel();
    read_task.abort();
    let _ = read_task.await;
    let _ = writer.shutdown().await;
    tokio::select! {
        _=stop.cancelled()=>{}, _=cancel.cancelled()=>{},
        _=incoming.send(Incoming::Down { id, session })=>{}
    }
    true
}
/// Establish a business stream on a detached acquisition task. The runtime keeps
/// draining its inbox while this task waits for the FIFO Up installation reply.
pub(crate) async fn connect_business(
    transport: Arc<Transport>,
    ip: Ipv4Addr,
    expected: Vec<u8>,
    keys: Arc<Keys>,
    admission: Arc<Admission>,
    incoming: mpsc::Sender<Incoming>,
    stop: CancellationToken,
    generation: u64,
    deadline: tokio::time::Instant,
) -> Result<(), pb::ProtocolError> {
    let began = tokio::time::Instant::now();
    let stop = stop.child_token();
    let guard = stop.clone().drop_guard();
    let address_generation = transport.status().generation;
    let io = transport
        .connect(
            SocketAddrV4::new(ip, 11000),
            deadline.min(tokio::time::Instant::now() + Duration::from_secs(3)),
            &stop,
        )
        .await
        .map_err(|e| {
            acquire::report(
                acquire::Stage::Connect,
                acquire::Class::transport(&e),
                began.elapsed(),
                1,
            );
            unavailable()
        })?;
    let (tx, rx) = tokio::sync::oneshot::channel();
    tokio::spawn(handshake(
        io,
        ip,
        true,
        keys,
        admission,
        incoming,
        stop.clone(),
        generation,
        address_generation,
        true,
        Some(BusinessReady {
            deadline,
            expected,
            reply: tx,
        }),
    ));
    let settled = tokio::select! { biased;
        _=stop.cancelled()=>return Err(unavailable()),
        _=tokio::time::sleep_until(deadline)=>{
            acquire::report(acquire::Stage::UpReady, acquire::Class::Deadline, began.elapsed(), 1);
            return Err(error(pb::ErrorCode::DeadlineExceeded, "connection acquisition deadline elapsed"));
        },
        r=rx=>r,
    };
    match settled {
        Ok(result) => {
            if result.is_err() {
                acquire::report(
                    acquire::Stage::UpReady,
                    acquire::Class::Rejected,
                    began.elapsed(),
                    1,
                );
            }
            if result.is_ok() {
                guard.disarm();
            }
            result
        }
        Err(_) => {
            acquire::report(
                acquire::Stage::UpReady,
                acquire::Class::Closed,
                began.elapsed(),
                1,
            );
            Err(unavailable())
        }
    }
}
pub(crate) fn split_data(m: &pb::DataMessage) -> Result<Vec<pb::DataMessage>, pb::ProtocolError> {
    reassembly::fragment_data(m, 16384).map_err(|e| e.to_protocol_error())
}
pub(crate) fn unavailable() -> pb::ProtocolError {
    error(
        pb::ErrorCode::DeviceUnreachable,
        "no authenticated peer session",
    )
}

pub(crate) fn probe_delay(ip: Ipv4Addr) -> Duration {
    Duration::from_secs(60 + (u32::from(ip) as u64 % 61))
}

pub(crate) fn noise_jitter_millis(max: u64) -> u64 {
    noise::random_bytes::<2>()
        .map(u16::from_be_bytes)
        .unwrap_or(0) as u64
        % (max + 1)
}
