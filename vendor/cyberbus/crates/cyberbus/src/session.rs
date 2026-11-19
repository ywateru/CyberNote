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
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tokio::sync::mpsc;
use zeroize::Zeroizing;
pub(crate) type Body = pb::wire_envelope::Body;
pub(crate) type BusinessFlag = Arc<AtomicBool>;
#[derive(Default)]
pub(crate) struct SessionMetrics {
    pub sessions_established: AtomicU64,
    pub sessions_inbound: AtomicU64,
    pub sessions_outbound: AtomicU64,
    pub probe_sessions_established: AtomicU64,
    pub business_sessions_established: AtomicU64,
    pub up_published: AtomicU64,
    pub up_installed: AtomicU64,
    pub metadata_queued: AtomicU64,
    pub metadata_queue_failed: AtomicU64,
    pub writer_frames_sent: AtomicU64,
    pub writer_metadata_sent: AtomicU64,
    pub writer_send_failed: AtomicU64,
    pub writer_probe_expired: AtomicU64,
    pub frames_received: AtomicU64,
    pub metadata_frames_received: AtomicU64,
    pub reader_errors: AtomicU64,
    pub reader_closed: AtomicU64,
    pub reader_io: AtomicU64,
    pub reader_protocol: AtomicU64,
    pub reader_authentication: AtomicU64,
    pub reader_limit: AtomicU64,
    pub reader_timeout: AtomicU64,
    pub reader_aborted: AtomicU64,
    pub reader_forced_abort: AtomicU64,
    pub reader_prefix_timeout: AtomicU64,
    pub reader_no_frame_exits: AtomicU64,
    pub reader_close_frames: AtomicU64,
    pub reader_admission_closed: AtomicU64,
    pub reader_channel_closed: AtomicU64,
    pub writer_closed: AtomicU64,
    pub writer_io: AtomicU64,
    pub writer_protocol: AtomicU64,
    pub writer_authentication: AtomicU64,
    pub writer_limit: AtomicU64,
    pub writer_timeout: AtomicU64,
    pub writer_shutdown_failed: AtomicU64,
    pub writer_exit_cancel: AtomicU64,
    pub writer_exit_stop: AtomicU64,
    pub writer_exit_queue_closed: AtomicU64,
    pub writer_exit_probe_expired: AtomicU64,
    pub writer_exit_prefix_timeout: AtomicU64,
    pub writer_exit_admission_closed: AtomicU64,
    pub writer_exit_send_failed: AtomicU64,
    pub writer_close_attempted: AtomicU64,
    pub writer_close_sent: AtomicU64,
    pub writer_close_failed: AtomicU64,
    pub local_prefix_ready: AtomicU64,
    pub local_prefix_sent: AtomicU64,
}
impl SessionMetrics {
    fn record_reader_error(&self, error: &cyberbus_protocol::Error) {
        self.reader_errors.fetch_add(1, Ordering::Relaxed);
        let counter = match error {
            cyberbus_protocol::Error::Closed => &self.reader_closed,
            cyberbus_protocol::Error::Io(_) => &self.reader_io,
            cyberbus_protocol::Error::Decode(_) | cyberbus_protocol::Error::Invalid(_) => {
                &self.reader_protocol
            }
            cyberbus_protocol::Error::Noise(_) => &self.reader_authentication,
            cyberbus_protocol::Error::Limit(_) => &self.reader_limit,
            cyberbus_protocol::Error::Timeout => &self.reader_timeout,
        };
        counter.fetch_add(1, Ordering::Relaxed);
    }
    fn record_writer_error(&self, error: &cyberbus_protocol::Error) {
        self.writer_send_failed.fetch_add(1, Ordering::Relaxed);
        let counter = match error {
            cyberbus_protocol::Error::Closed => &self.writer_closed,
            cyberbus_protocol::Error::Io(_) => &self.writer_io,
            cyberbus_protocol::Error::Decode(_) | cyberbus_protocol::Error::Invalid(_) => {
                &self.writer_protocol
            }
            cyberbus_protocol::Error::Noise(_) => &self.writer_authentication,
            cyberbus_protocol::Error::Limit(_) => &self.writer_limit,
            cyberbus_protocol::Error::Timeout => &self.writer_timeout,
        };
        counter.fetch_add(1, Ordering::Relaxed);
    }
    fn record_writer_timeout(&self) {
        self.writer_send_failed.fetch_add(1, Ordering::Relaxed);
        self.writer_timeout.fetch_add(1, Ordering::Relaxed);
    }
}
#[derive(Clone, Copy)]
enum WriterExit {
    Cancel,
    Stop,
    QueueClosed,
    ProbeExpired,
    PrefixTimeout,
    AdmissionClosed,
    SendFailed,
}
fn record_writer_exit(metrics: &SessionMetrics, reason: WriterExit) {
    let counter = match reason {
        WriterExit::Cancel => &metrics.writer_exit_cancel,
        WriterExit::Stop => &metrics.writer_exit_stop,
        WriterExit::QueueClosed => &metrics.writer_exit_queue_closed,
        WriterExit::ProbeExpired => &metrics.writer_exit_probe_expired,
        WriterExit::PrefixTimeout => &metrics.writer_exit_prefix_timeout,
        WriterExit::AdmissionClosed => &metrics.writer_exit_admission_closed,
        WriterExit::SendFailed => &metrics.writer_exit_send_failed,
    };
    counter.fetch_add(1, Ordering::Relaxed);
}
#[derive(Default)]
pub(crate) struct Progress {
    // Ordinary IO completion is not owner revocation: queued authenticated
    // notifications remain ordered before Down. Explicit cancel still fences them.
    pub io_ended: CancellationToken,
    // The owner has finished deciding whether to admit this authenticated Up and
    // has queued its local Metadata prefix (or made the corresponding decision).
    pub local_prefix_ready: CancellationToken,
    // The writer has sent the queued local prefix, so the reader may now observe
    // completion without preventing that already-admitted prefix from leaving.
    pub local_prefix_sent: CancellationToken,
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
    pub metrics: SessionMetrics,
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
    admission
        .metrics
        .sessions_established
        .fetch_add(1, Ordering::Relaxed);
    if outbound {
        admission
            .metrics
            .sessions_outbound
            .fetch_add(1, Ordering::Relaxed);
    } else {
        admission
            .metrics
            .sessions_inbound
            .fetch_add(1, Ordering::Relaxed);
    }
    if business.load(Ordering::Acquire) {
        admission
            .metrics
            .business_sessions_established
            .fetch_add(1, Ordering::Relaxed);
    } else {
        admission
            .metrics
            .probe_sessions_established
            .fetch_add(1, Ordering::Relaxed);
    }
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
    admission
        .metrics
        .up_published
        .fetch_add(1, Ordering::Relaxed);
    // Never cancel a pending Noise read when an outbound frame or keepalive becomes ready.
    let reader_tx = incoming.clone();
    let reader_id = id.clone();
    let reader_cancel = cancel.clone();
    let reader_io = progress.io_ended.clone();
    let reader_prefix = progress.local_prefix_sent.clone();
    let reader_session = session.clone();
    let reader_admission = admission.clone();
    let reader_prefix_deadline = tokio::time::Instant::now() + Duration::from_secs(2);
    let mut read_task = tokio::spawn(async move {
        tokio::select! { biased;
            _ = reader_cancel.cancelled() => {
                reader_admission.metrics.reader_aborted.fetch_add(1, Ordering::Relaxed);
                reader_admission
                    .metrics
                    .reader_no_frame_exits
                    .fetch_add(1, Ordering::Relaxed);
                reader_io.cancel();
                return;
            },
            _ = reader_prefix.cancelled() => {}
            _ = tokio::time::sleep_until(reader_prefix_deadline) => {
                reader_admission
                    .metrics
                    .reader_prefix_timeout
                    .fetch_add(1, Ordering::Relaxed);
            }
        }
        let mut first_frame = true;
        loop {
            // Noise closes both halves when an in-flight recv future is dropped.
            // io_ended only tells the writer to finish its admitted prefix; the
            // reader must remain pending until peer EOF or explicit revocation.
            let frame = tokio::select! {
                _ = reader_cancel.cancelled() => {
                    reader_admission.metrics.reader_aborted.fetch_add(1, Ordering::Relaxed);
                    if first_frame {
                        reader_admission
                            .metrics
                            .reader_no_frame_exits
                            .fetch_add(1, Ordering::Relaxed);
                    }
                    break;
                },
                result = reader.recv() => result
            };
            let frame = match frame {
                Ok(frame) => frame,
                Err(error) => {
                    reader_admission.metrics.record_reader_error(&error);
                    if first_frame {
                        reader_admission
                            .metrics
                            .reader_no_frame_exits
                            .fetch_add(1, Ordering::Relaxed);
                    }
                    break;
                }
            };
            if !reader_admission.allows(&reader_id) {
                reader_admission
                    .metrics
                    .reader_admission_closed
                    .fetch_add(1, Ordering::Relaxed);
                if first_frame {
                    reader_admission
                        .metrics
                        .reader_no_frame_exits
                        .fetch_add(1, Ordering::Relaxed);
                }
                break;
            }
            if let Some(body) = frame.body {
                first_frame = false;
                let terminal_close = matches!(&body, Body::Close(_));
                reader_admission
                    .metrics
                    .frames_received
                    .fetch_add(1, Ordering::Relaxed);
                if matches!(&body, Body::Metadata(_)) {
                    reader_admission
                        .metrics
                        .metadata_frames_received
                        .fetch_add(1, Ordering::Relaxed);
                }
                if terminal_close {
                    reader_admission
                        .metrics
                        .reader_close_frames
                        .fetch_add(1, Ordering::Relaxed);
                }
                if reader_tx
                    .send(Incoming::Frame {
                        id: reader_id.clone(),
                        session: reader_session.clone(),
                        body,
                    })
                    .await
                    .is_err()
                {
                    reader_admission
                        .metrics
                        .reader_channel_closed
                        .fetch_add(1, Ordering::Relaxed);
                    if first_frame {
                        reader_admission
                            .metrics
                            .reader_no_frame_exits
                            .fetch_add(1, Ordering::Relaxed);
                    }
                    break;
                }
                if terminal_close {
                    break;
                }
            }
        }
        reader_io.cancel();
    });
    let probe_deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    let local_prefix_deadline = tokio::time::Instant::now() + Duration::from_secs(2);
    let mut io_ended = false;
    let mut writer_failed = false;
    let writer_exit = 'writer: loop {
        if progress.local_prefix_ready.is_cancelled() && outgoing.is_empty() {
            if !progress.local_prefix_sent.is_cancelled() {
                admission
                    .metrics
                    .local_prefix_sent
                    .fetch_add(1, Ordering::Relaxed);
                progress.local_prefix_sent.cancel();
            }
        }
        let mut queued = if io_ended {
            tokio::select! { biased;
                _=cancel.cancelled()=>break 'writer WriterExit::Cancel,
                _=stop.cancelled()=>break 'writer WriterExit::Stop,
                _=progress.local_prefix_ready.cancelled()=>{
                    admission
                        .metrics
                        .local_prefix_ready
                        .fetch_add(1, Ordering::Relaxed);
                },
                _=tokio::time::sleep_until(local_prefix_deadline)=>{
                    break 'writer WriterExit::PrefixTimeout;
                }
            }
            if !progress.local_prefix_ready.is_cancelled() {
                break 'writer WriterExit::PrefixTimeout;
            }
            match outgoing.try_recv_queued() {
                Ok(queued) => queued,
                Err(mpsc::error::TryRecvError::Empty | mpsc::error::TryRecvError::Disconnected) => {
                    break 'writer WriterExit::QueueClosed;
                }
            }
        } else {
            tokio::select! {
                _ = cancel.cancelled()=>break 'writer WriterExit::Cancel,
                _ = stop.cancelled()=>break 'writer WriterExit::Stop,
                _ = progress.io_ended.cancelled()=>{
                    io_ended = true;
                    continue;
                },
                _ = progress.local_prefix_ready.cancelled(), if !progress.local_prefix_ready.is_cancelled()=>{
                    admission
                        .metrics
                        .local_prefix_ready
                        .fetch_add(1, Ordering::Relaxed);
                    continue;
                },
                _ = tokio::time::sleep_until(probe_deadline), if !session.business.load(Ordering::Acquire)=>{
                    // Promotion can happen while this select is waiting without any
                    // output on this crossed stream. The guard was checked before
                    // promotion, so recheck admission when the armed timer fires.
                    if !session.business.load(Ordering::Acquire) {
                        admission
                            .metrics
                            .writer_probe_expired
                            .fetch_add(1, Ordering::Relaxed);
                        break 'writer WriterExit::ProbeExpired;
                    }
                    continue;
                },
                body=outgoing.recv_queued()=>match body {
                    Some(b)=>b,
                    None=>break 'writer WriterExit::QueueClosed,
                }
            }
        };
        if !admission.allows(&id) {
            writer_failed = true;
            break 'writer WriterExit::AdmissionClosed;
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
        let metadata = matches!(&body, Body::Metadata(_));
        match tokio::time::timeout(Duration::from_secs(5), writer.send(body)).await {
            Ok(Ok(())) => {}
            Ok(Err(error)) => {
                admission.metrics.record_writer_error(&error);
                writer_failed = true;
                break 'writer WriterExit::SendFailed;
            }
            Err(_) => {
                admission.metrics.record_writer_timeout();
                writer_failed = true;
                break 'writer WriterExit::SendFailed;
            }
        }
        admission
            .metrics
            .writer_frames_sent
            .fetch_add(1, Ordering::Relaxed);
        if metadata {
            admission
                .metrics
                .writer_metadata_sent
                .fetch_add(1, Ordering::Relaxed);
            if !progress.local_prefix_sent.is_cancelled() {
                admission
                    .metrics
                    .local_prefix_sent
                    .fetch_add(1, Ordering::Relaxed);
                progress.local_prefix_sent.cancel();
            }
        }
    };
    record_writer_exit(&admission.metrics, writer_exit);
    progress.io_ended.cancel();
    let revoked = cancel.is_cancelled() || stop.is_cancelled();
    if !writer_failed && !revoked && !read_task.is_finished() {
        // A normal session ends with an authenticated close record while both
        // halves still exist. Closing the shared transport first makes smoltcp
        // turn the peer's in-flight Metadata into Closed before it can be read.
        admission
            .metrics
            .writer_close_attempted
            .fetch_add(1, Ordering::Relaxed);
        match tokio::time::timeout(
            Duration::from_secs(1),
            writer.send(Body::Close(Default::default())),
        )
        .await
        {
            Ok(Ok(())) => {
                admission
                    .metrics
                    .writer_frames_sent
                    .fetch_add(1, Ordering::Relaxed);
                admission
                    .metrics
                    .writer_close_sent
                    .fetch_add(1, Ordering::Relaxed);
            }
            Ok(Err(_)) | Err(_) => {
                admission
                    .metrics
                    .writer_close_failed
                    .fetch_add(1, Ordering::Relaxed);
            }
        }
    }
    if writer_failed || revoked {
        if !read_task.is_finished() {
            admission
                .metrics
                .reader_forced_abort
                .fetch_add(1, Ordering::Relaxed);
        }
        read_task.abort();
        let _ = read_task.await;
        if writer.shutdown().await.is_err() {
            admission
                .metrics
                .writer_shutdown_failed
                .fetch_add(1, Ordering::Relaxed);
        }
    } else if tokio::time::timeout(Duration::from_secs(2), &mut read_task)
        .await
        .is_err()
    {
        // A peer that never answers the close record must not retain the
        // session forever. We are already tearing down, so aborting the read
        // cannot truncate another local send.
        admission
            .metrics
            .reader_forced_abort
            .fetch_add(1, Ordering::Relaxed);
        read_task.abort();
        let _ = read_task.await;
    }
    drop(writer);
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
