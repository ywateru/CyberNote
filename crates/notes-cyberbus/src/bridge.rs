use crate::{bus::random_id, *};
use pb::sdk_command::Body as C;
use prost::Message;
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::{mpsc, oneshot, Semaphore},
};
use tokio_util::sync::CancellationToken;

pub type PeerId = [u8; 32];
/// Aligns the core absolute stream bound with the host's existing device-operation budget.
/// The host deadline includes setup and must still cancel the mapping at its earlier deadline.
pub const MAX_STREAM_LIFETIME: Duration = Duration::from_secs(23 * 60);
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, prost::Enumeration)]
#[repr(i32)]
pub enum Service {
    Bootstrap = 1,
    Sync = 2,
}
/// Hard upper bounds are validated even for caller supplied limits.
#[derive(Clone, Debug)]
pub struct Limits {
    pub max_streams: usize,
    pub max_streams_per_peer: usize,
    pub queue_chunks: usize,
    pub max_inflight: usize,
    pub command_timeout: Duration,
    pub open_timeout: Duration,
    pub ack_timeout: Duration,
    pub stream_timeout: Duration,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            max_streams: 16,
            max_streams_per_peer: 4,
            queue_chunks: 4,
            max_inflight: 32,
            command_timeout: Duration::from_secs(10),
            open_timeout: Duration::from_secs(10),
            ack_timeout: Duration::from_secs(15),
            stream_timeout: MAX_STREAM_LIFETIME,
        }
    }
}
impl Limits {
    pub(crate) fn validate(&self) -> Result<()> {
        if self.max_streams == 0
            || self.max_streams > 64
            || self.max_streams_per_peer == 0
            || self.max_streams_per_peer > 4
            || self.queue_chunks == 0
            || self.queue_chunks > 16
            || self.max_inflight == 0
            || self.max_inflight > 64
            || [self.command_timeout, self.open_timeout, self.ack_timeout]
                .iter()
                .any(|d| d.is_zero() || *d > Duration::from_secs(600))
            || self.stream_timeout.is_zero()
            || self.stream_timeout > MAX_STREAM_LIFETIME
        {
            return Err(Error::Capacity);
        }
        Ok(())
    }
}
type StreamKey = (PeerId, [u8; 16]);
type MessageKey = (Vec<u8>, Vec<u8>);
struct Entry {
    generation: Vec<u8>,
    service: Service,
    next: u64,
    ack_pending: bool,
    remote_closed: bool,
    sent: u64,
    bootstrap_claimed: bool,
    account_generation: u64,
    tx: mpsc::Sender<Envelope>,
    cancel: CancellationToken,
}
pub(crate) struct Bridge {
    pub limits: Limits,
    entries: Mutex<HashMap<StreamKey, Entry>>,
    endpoints: Mutex<HashMap<Service, SocketAddr>>,
    retired: Mutex<HashMap<StreamKey, tokio::time::Instant>>,
    pending: Mutex<HashMap<MessageKey, oneshot::Sender<Result<()>>>>,
    inflight: Arc<Semaphore>,
    completions: mpsc::Sender<C>,
}
impl Bridge {
    pub(crate) fn new(limits: Limits) -> (Self, mpsc::Receiver<C>) {
        let (completions, rx) = mpsc::channel(128);
        (
            Self {
                inflight: Arc::new(Semaphore::new(limits.max_inflight)),
                limits,
                entries: Mutex::new(HashMap::new()),
                endpoints: Mutex::new(HashMap::new()),
                retired: Mutex::new(HashMap::new()),
                pending: Mutex::new(HashMap::new()),
                completions,
            },
            rx,
        )
    }
    fn allocate(
        &self,
        key: StreamKey,
        generation: Vec<u8>,
        service: Service,
        outgoing: bool,
        account_generation: u64,
    ) -> Result<(mpsc::Receiver<Envelope>, CancellationToken)> {
        let mut entries = self.entries.lock().unwrap();
        let mut retired = self.retired.lock().unwrap();
        retired.retain(|_, expires| *expires > tokio::time::Instant::now());
        if retired.contains_key(&key) {
            return Err(Error::Protocol);
        }
        // Never evict a live tombstone to admit more Opens: fail closed at a finite cap.
        if retired.len() + entries.len() >= 1024 {
            return Err(Error::Capacity);
        }
        // Cancelled entries still count until their tasks have joined; never amplify cancellation into unbounded tasks.
        if entries.contains_key(&key) {
            return Err(Error::Protocol);
        }
        if entries.len() >= self.limits.max_streams
            || entries.keys().filter(|(peer, _)| peer == &key.0).count()
                >= self.limits.max_streams_per_peer
        {
            return Err(Error::Capacity);
        }
        let (tx, rx) = mpsc::channel(self.limits.queue_chunks);
        let cancel = CancellationToken::new();
        entries.insert(
            key,
            Entry {
                generation,
                service,
                next: if outgoing { 0 } else { 1 },
                ack_pending: outgoing,
                remote_closed: false,
                sent: 0,
                bootstrap_claimed: false,
                account_generation,
                tx,
                cancel: cancel.clone(),
            },
        );
        Ok((rx, cancel))
    }
    fn route(&self, key: StreamKey, frame: Envelope) -> Result<()> {
        let mut entries = self.entries.lock().unwrap();
        let entry = entries.get_mut(&key).ok_or(Error::Protocol)?;
        if entry.cancel.is_cancelled()
            || entry.remote_closed
            || frame.generation != entry.generation
            || frame.service != entry.service as i32
            || frame.sequence != entry.next
            || (entry.ack_pending && frame.kind != FrameKind::OpenAck as i32)
            || (!entry.ack_pending
                && !matches!(
                    FrameKind::try_from(frame.kind),
                    Ok(FrameKind::Chunk | FrameKind::Close)
                ))
        {
            entry.cancel.cancel();
            return Err(Error::Protocol);
        }
        let closing = frame.kind == FrameKind::Close as i32;
        if entry.tx.try_send(frame).is_err() {
            entry.cancel.cancel();
            return Err(Error::Capacity);
        }
        entry.next = entry.next.checked_add(1).ok_or(Error::Protocol)?;
        entry.ack_pending = false;
        entry.remote_closed = closing;
        Ok(())
    }
    fn retire(&self, key: StreamKey) {
        let mut entries = self.entries.lock().unwrap();
        if entries.remove(&key).is_some() {
            self.retired
                .lock()
                .unwrap()
                .insert(key, tokio::time::Instant::now() + Duration::from_secs(600));
        }
    }
    pub(crate) fn cancel_all(&self) {
        for e in self.entries.lock().unwrap().values() {
            e.cancel.cancel()
        }
        for (_, tx) in self.pending.lock().unwrap().drain() {
            let _ = tx.send(Err(Error::Cancelled));
        }
    }
    pub(crate) fn cancel_peer(&self, peer: &[u8]) {
        for ((p, _), e) in self.entries.lock().unwrap().iter() {
            if p == peer {
                e.cancel.cancel()
            }
        }
        self.pending.lock().unwrap().retain(|(p, _), _| p != peer);
    }
    pub(crate) fn retain_peers(&self, devices: &[pb::DeviceSnapshot]) {
        for ((peer, _), e) in self.entries.lock().unwrap().iter() {
            if !devices
                .iter()
                .any(|d| d.device_id == peer && d.presence == pb::DevicePresence::Online as i32)
            {
                e.cancel.cancel()
            }
        }
    }
    pub(crate) fn status(&self, status: &pb::DataStatus) {
        let result = match &status.result {
            Some(pb::data_status::Result::Stage(stage))
                if *stage == pb::AckStage::Processed as i32 =>
            {
                Ok(())
            }
            Some(pb::data_status::Result::Error(e)) => Err(Error::Sdk(e.code)),
            Some(pb::data_status::Result::Stage(stage))
                if [pb::AckStage::Received as i32, pb::AckStage::Accepted as i32]
                    .contains(stage) =>
            {
                return
            }
            _ => Err(Error::Protocol),
        };
        if let Some(tx) = self
            .pending
            .lock()
            .unwrap()
            .remove(&(status.peer_device_id.clone(), status.message_id.clone()))
        {
            let _ = tx.send(result);
        }
    }
}

// Guards against cancellation by any caller timeout, including cleanup deadlines.
struct PendingGuard<'a> {
    bridge: &'a Bridge,
    key: MessageKey,
}
impl Drop for PendingGuard<'_> {
    fn drop(&mut self) {
        if self
            .bridge
            .pending
            .lock()
            .unwrap()
            .remove(&self.key)
            .is_some()
        {
            let _ = self
                .bridge
                .completions
                .try_send(C::CancelData(pb::CancelData {
                    peer_device_id: self.key.0.clone(),
                    message_id: self.key.1.clone(),
                }));
        }
    }
}

/// Single-use loopback listener. A lease is tied to a peer, service and account generation.
/// Keep it alive for the complete WebSocket lifetime. Drop cancels; close additionally joins.
pub struct MappingLease {
    address: SocketAddr,
    peer: PeerId,
    service: Service,
    cancel: CancellationToken,
    done: CancellationToken,
    result: Arc<Mutex<Option<Result<()>>>>,
}
impl MappingLease {
    pub fn local_addr(&self) -> SocketAddr {
        self.address
    }
    pub fn peer(&self) -> PeerId {
        self.peer
    }
    pub fn service(&self) -> Service {
        self.service
    }
    pub fn cancel(&self) {
        self.cancel.cancel()
    }
    pub async fn close(self) -> Result<()> {
        self.cancel.cancel();
        self.done.cancelled().await;
        self.result
            .lock()
            .unwrap()
            .clone()
            .unwrap_or(Err(Error::Closed))
    }
    pub fn result(&self) -> Option<Result<()>> {
        self.result.lock().unwrap().clone()
    }
}
impl Drop for MappingLease {
    fn drop(&mut self) {
        self.cancel.cancel()
    }
}

impl Bus {
    /// One-time native-context claim. Rejects forged loopback connections, replay and stale accounts.
    /// The account owner must also pin this peer's protocol UUID/Noise key from the current profile.
    pub fn claim_bootstrap_context(&self, context: &BootstrapContext) -> Result<()> {
        let state = self.inner.snapshot.read().unwrap();
        if state.generation != context.account_generation
            || !crate::bus::peer_available_in(&state, &context.peer)
        {
            return Err(Error::PeerUnavailable);
        }
        let mut entries = self.inner.bridge.entries.lock().unwrap();
        let entry = entries
            .get_mut(&(context.peer, context.stream_id))
            .ok_or(Error::Protocol)?;
        if entry.service != Service::Bootstrap
            || entry.generation != context.generation
            || entry.account_generation != context.account_generation
            || entry.cancel.is_cancelled()
            || entry.bootstrap_claimed
        {
            return Err(Error::Protocol);
        }
        entry.bootstrap_claimed = true;
        Ok(())
    }
    pub async fn register_endpoint(&self, service: Service, address: SocketAddr) -> Result<()> {
        if !address.ip().is_loopback() || address.port() == 0 {
            return Err(Error::InvalidEndpoint);
        }
        if self.snapshot().closed {
            return Err(Error::Closed);
        }
        let mut endpoints = self.inner.bridge.endpoints.lock().unwrap();
        if endpoints.get(&service) != Some(&address) {
            for entry in self.inner.bridge.entries.lock().unwrap().values() {
                if entry.service == service {
                    entry.cancel.cancel()
                }
            }
        }
        endpoints.insert(service, address);
        Ok(())
    }
    pub async fn unregister_endpoint(&self, service: Service) -> Result<()> {
        self.inner.bridge.endpoints.lock().unwrap().remove(&service);
        for entry in self.inner.bridge.entries.lock().unwrap().values() {
            if entry.service == service {
                entry.cancel.cancel()
            }
        }
        Ok(())
    }
    pub async fn map(&self, peer: PeerId, service: Service) -> Result<MappingLease> {
        if !self.peer_available(&peer) {
            return Err(Error::PeerUnavailable);
        }
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).await?;
        let address = listener.local_addr()?;
        let key = (peer, random_id());
        let generation = random_id().to_vec();
        // Recheck under the directory read lock to serialize allocation with revocation.
        let state = self.inner.snapshot.read().unwrap();
        if !crate::bus::peer_available_in(&state, &peer) {
            return Err(Error::PeerUnavailable);
        }
        let (rx, cancel) =
            self.inner
                .bridge
                .allocate(key, generation.clone(), service, true, state.generation)?;
        drop(state);
        let result = Arc::new(Mutex::new(None));
        let done = CancellationToken::new();
        let lease = MappingLease {
            address,
            peer,
            service,
            cancel: cancel.clone(),
            done: done.clone(),
            result: result.clone(),
        };
        let task = self.clone();
        self.inner.tasks.spawn(async move {
            let start=async {
                let (socket,_)=listener.accept().await?;
                drop(listener);
                task.send_frame(peer,make_frame(key.1,&generation,service,0,FrameKind::Open,vec![],CloseCode::Unspecified),&cancel).await?;
                Ok(socket)
            };
            let outcome=tokio::select! {
                _=cancel.cancelled()=>Err(Error::Cancelled),
                _=task.inner.stop.cancelled()=>Err(Error::Closed),
                r=tokio::time::timeout(task.inner.bridge.limits.open_timeout,start)=>match r {Ok(Ok(socket))=>task.run_stream(key,generation.clone(),service,socket,rx,true,&cancel).await,Ok(Err(e))=>Err(e),Err(_)=>Err(Error::Timeout)},
            };
            task.finish_stream(key,&generation,service,&outcome).await;
            *result.lock().unwrap()=Some(outcome);done.cancel();
        });
        Ok(lease)
    }
    pub(crate) fn receive_data(&self, data: &pb::DataReceived) {
        if data.subscription_id != self.inner.subscription_id {
            return;
        }
        let result = (|| {
            let peer: PeerId = data
                .peer_device_id
                .as_slice()
                .try_into()
                .map_err(|_| Error::Protocol)?;
            let message = data.message.as_ref().ok_or(Error::Protocol)?;
            if message.message_id.len() != 16 {
                return Err(Error::Protocol);
            }
            let frame = Envelope::decode_frame(message.fragment.as_ref().ok_or(Error::Protocol)?)?;
            if !self.peer_available(&peer) {
                return Err(Error::PeerUnavailable);
            }
            let id: [u8; 16] = frame
                .stream_id
                .as_slice()
                .try_into()
                .map_err(|_| Error::Protocol)?;
            let key = (peer, id);
            if frame.kind == FrameKind::Open as i32 {
                let service = Service::try_from(frame.service).map_err(|_| Error::Protocol)?;
                let endpoints = self.inner.bridge.endpoints.lock().unwrap();
                let address = *endpoints.get(&service).ok_or(Error::NoEndpoint)?;
                let state = self.inner.snapshot.read().unwrap();
                if !crate::bus::peer_available_in(&state, &peer) {
                    return Err(Error::PeerUnavailable);
                }
                let account_generation = state.generation;
                let (rx, cancel) = self.inner.bridge.allocate(
                    key,
                    frame.generation.clone(),
                    service,
                    false,
                    account_generation,
                )?;
                drop(state);
                drop(endpoints);
                let task = self.clone();
                self.inner.tasks.spawn(async move {
                    let open=async {
                        let mut socket=TcpStream::connect(address).await?;
                        if service==Service::Bootstrap {
                            let context=BootstrapContext{peer,stream_id:id,generation:frame.generation.as_slice().try_into().map_err(|_|Error::Protocol)?,account_generation};
                            socket.write_all(&context.encode()).await?;
                        }
                        task.send_frame(peer,make_frame(id,&frame.generation,service,0,FrameKind::OpenAck,vec![],CloseCode::Unspecified),&cancel).await?;
                        Ok(socket)
                    };
                    let result=tokio::select! {
                        _=cancel.cancelled()=>Err(Error::Cancelled),
                        _=task.inner.stop.cancelled()=>Err(Error::Closed),
                        r=tokio::time::timeout(task.inner.bridge.limits.open_timeout,open)=>match r {Ok(Ok(socket))=>task.run_stream(key,frame.generation.clone(),service,socket,rx,false,&cancel).await,Ok(Err(e))=>Err(e),Err(_)=>Err(Error::Timeout)},
                    };
                    task.finish_stream(key,&frame.generation,service,&result).await;
                    if let Err(e)=result {let _=task.inner.events.send(BusEvent::Fault(e));}
                });
                Ok(())
            } else {
                self.inner.bridge.route(key, frame)
            }
        })();
        if let Some(message) = &data.message {
            let completion = C::CompleteData(pb::CompleteData {
                peer_device_id: data.peer_device_id.clone(),
                message_id: message.message_id.clone(),
                result: Some(match result {
                    Ok(()) => pb::complete_data::Result::Stage(pb::AckStage::Processed as i32),
                    Err(e) => pb::complete_data::Result::Error(pb::ProtocolError {
                        code: match e {
                            Error::Capacity => pb::ErrorCode::ResourceExhausted as i32,
                            Error::PeerUnavailable => pb::ErrorCode::Unauthenticated as i32,
                            _ => pb::ErrorCode::ProtocolError as i32,
                        },
                        message: "Notes bridge rejected frame".into(),
                        retryable: false,
                        retry_after: None,
                    }),
                }),
            });
            if self.inner.bridge.completions.try_send(completion).is_err() {
                self.revoke(false);
                let _ = self.inner.events.send(BusEvent::Fault(Error::Capacity));
            }
        }
    }
    pub(crate) async fn complete_worker(&self, mut rx: mpsc::Receiver<C>) {
        loop {
            tokio::select! {
                biased;
                _=self.inner.stop.cancelled()=>break,
                _=self.inner.resync.notified()=>{
                    tokio::select! {
                        biased;
                        _=self.inner.stop.cancelled()=>break,
                        _=self.resync_directory()=>{},
                    }
                },
                value=rx.recv()=>match value {
                    None=>break,
                    Some(command)=>{
                        let result=tokio::select! {
                            biased;
                            _=self.inner.stop.cancelled()=>break,
                            result=self.internal(command)=>result,
                        };
                        if let Err(e)=result {let _=self.inner.events.send(BusEvent::Fault(e));}
                    }
                }
            }
        }
    }
    async fn send_frame(
        &self,
        peer: PeerId,
        frame: Envelope,
        cancel: &CancellationToken,
    ) -> Result<()> {
        frame.validate()?;
        let _permit = tokio::select! {_=cancel.cancelled()=>return Err(Error::Cancelled),_ = self.inner.stop.cancelled()=>return Err(Error::Closed),
        p=tokio::time::timeout(self.inner.bridge.limits.ack_timeout,self.inner.bridge.inflight.acquire())=>p.map_err(|_|Error::Timeout)?.map_err(|_|Error::Closed)?};
        if !self.peer_available(&peer) {
            return Err(Error::PeerUnavailable);
        }
        if let Ok(id) = <[u8; 16]>::try_from(frame.stream_id.as_slice()) {
            if let Some(entry) = self
                .inner
                .bridge
                .entries
                .lock()
                .unwrap()
                .get_mut(&(peer, id))
            {
                entry.sent = frame.sequence;
            }
        }
        let id = random_id().to_vec();
        let key = (peer.to_vec(), id.clone());
        let (tx, rx) = oneshot::channel();
        self.inner
            .bridge
            .pending
            .lock()
            .unwrap()
            .insert(key.clone(), tx);
        let _pending = PendingGuard {
            bridge: &self.inner.bridge,
            key: key.clone(),
        };
        let bytes = frame.encode_to_vec();
        let command = C::Send(pb::Send {
            peer_device_id: peer.to_vec(),
            message: Some(pb::DataMessage {
                message_id: id.clone(),
                in_reply_to: vec![],
                requested_ack: pb::AckStage::Processed as i32,
                timeout: Some(
                    prost_types::Duration::try_from(self.inner.bridge.limits.ack_timeout)
                        .map_err(|_| Error::Protocol)?,
                ),
                fragment: Some(pb::PayloadFragment {
                    application_type_url: TYPE_URL.into(),
                    encoding: pb::PayloadEncoding::ProtobufMessage as i32,
                    total_size: bytes.len() as u32,
                    offset: 0,
                    protobuf_bytes: bytes,
                }),
            }),
        });
        let wait = async {
            self.internal(command).await?;
            rx.await.map_err(|_| Error::Cancelled)?
        };
        let result = tokio::select! {_=cancel.cancelled()=>Err(Error::Cancelled),_=self.inner.stop.cancelled()=>Err(Error::Closed),r=tokio::time::timeout(self.inner.bridge.limits.ack_timeout,wait)=>r.unwrap_or(Err(Error::Timeout))};
        self.inner.bridge.pending.lock().unwrap().remove(&key);
        if result.is_err() {
            // The event owner never waits on this send or its terminal status.
            let _ = self
                .inner
                .bridge
                .completions
                .try_send(C::CancelData(pb::CancelData {
                    peer_device_id: peer.to_vec(),
                    message_id: id,
                }));
        }
        result
    }
    async fn finish_stream(
        &self,
        key: StreamKey,
        generation: &[u8],
        service: Service,
        result: &Result<()>,
    ) {
        let next = self
            .inner
            .bridge
            .entries
            .lock()
            .unwrap()
            .get(&key)
            .and_then(|entry| entry.sent.checked_add(1));
        if result.is_err() {
            if let Some(next) = next {
                let token = CancellationToken::new();
                let close = make_frame(
                    key.1,
                    generation,
                    service,
                    next,
                    FrameKind::Close,
                    vec![],
                    CloseCode::Cancelled,
                );
                // One bounded attempt; no content replay after an unknown outcome.
                let _ = tokio::time::timeout(
                    Duration::from_secs(1),
                    self.send_frame(key.0, close, &token),
                )
                .await;
            }
        }
        self.inner.bridge.retire(key);
    }
    async fn run_stream(
        &self,
        key: StreamKey,
        generation: Vec<u8>,
        service: Service,
        socket: TcpStream,
        mut rx: mpsc::Receiver<Envelope>,
        outgoing: bool,
        cancel: &CancellationToken,
    ) -> Result<()> {
        let transfer = async {
            if outgoing {
                let frame = tokio::time::timeout(self.inner.bridge.limits.open_timeout, rx.recv())
                    .await
                    .map_err(|_| Error::Timeout)?
                    .ok_or(Error::Closed)?;
                if frame.kind != FrameKind::OpenAck as i32 {
                    return Err(Error::Protocol);
                }
            }
            let (mut reader, mut writer) = socket.into_split();
            let upload = async {
                let mut seq = 1u64;
                let mut buffer = vec![0; MAX_CHUNK];
                loop {
                    let n = reader.read(&mut buffer).await?;
                    let kind = if n == 0 {
                        FrameKind::Close
                    } else {
                        FrameKind::Chunk
                    };
                    self.send_frame(
                        key.0,
                        make_frame(
                            key.1,
                            &generation,
                            service,
                            seq,
                            kind,
                            buffer[..n].to_vec(),
                            if n == 0 {
                                CloseCode::Eof
                            } else {
                                CloseCode::Unspecified
                            },
                        ),
                        cancel,
                    )
                    .await?;
                    seq = seq.checked_add(1).ok_or(Error::Protocol)?;
                    if n == 0 {
                        return Ok(());
                    }
                }
            };
            let download = async {
                loop {
                    let frame = rx.recv().await.ok_or(Error::Closed)?;
                    match FrameKind::try_from(frame.kind) {
                        Ok(FrameKind::Chunk) => writer.write_all(&frame.payload).await?,
                        Ok(FrameKind::Close) if frame.close_code == CloseCode::Eof as i32 => {
                            writer.shutdown().await?;
                            return Ok(());
                        }
                        Ok(FrameKind::Close) => return Err(Error::Cancelled),
                        _ => return Err(Error::Protocol),
                    }
                }
            };
            tokio::try_join!(upload, download)?;
            Ok(())
        };
        tokio::select! {
            _=cancel.cancelled()=>Err(Error::Cancelled),
            _=self.inner.stop.cancelled()=>Err(Error::Closed),
            r=tokio::time::timeout(self.inner.bridge.limits.stream_timeout,transfer)=>r.unwrap_or(Err(Error::Timeout)),
            _=self.lease_expired(key.0)=>Err(Error::PeerUnavailable),
        }
    }
    async fn lease_expired(&self, peer: PeerId) {
        loop {
            if !self.peer_available(&peer) {
                return;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    }
}
fn make_frame(
    id: [u8; 16],
    generation: &[u8],
    service: Service,
    sequence: u64,
    kind: FrameKind,
    payload: Vec<u8>,
    close: CloseCode,
) -> Envelope {
    Envelope {
        version: 1,
        stream_id: id.to_vec(),
        generation: generation.to_vec(),
        sequence,
        kind: kind as i32,
        service: service as i32,
        payload,
        close_code: close as i32,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bus::tests::config;
    fn frame(id: [u8; 16], seq: u64, kind: FrameKind) -> Envelope {
        make_frame(
            id,
            &[2; 16],
            Service::Sync,
            seq,
            kind,
            if kind == FrameKind::Chunk {
                vec![3]
            } else {
                vec![]
            },
            if kind == FrameKind::Close {
                CloseCode::Eof
            } else {
                CloseCode::Unspecified
            },
        )
    }
    #[test]
    fn chunk_binding_sequence_queue_and_limits() {
        let mut limits = Limits::default();
        limits.queue_chunks = 1;
        limits.max_streams = 2;
        limits.max_streams_per_peer = 1;
        let (bridge, _) = Bridge::new(limits);
        let key = ([1; 32], [1; 16]);
        let (mut rx, cancel) = bridge
            .allocate(key, vec![2; 16], Service::Sync, false, 1)
            .unwrap();
        assert!(matches!(
            bridge.allocate(([1; 32], [2; 16]), vec![2; 16], Service::Sync, false, 1),
            Err(Error::Capacity)
        ));
        bridge
            .route(key, frame(key.1, 1, FrameKind::Chunk))
            .unwrap();
        assert!(rx.try_recv().is_ok());
        assert!(bridge
            .route(([4; 32], key.1), frame(key.1, 2, FrameKind::Chunk))
            .is_err());
        let mut wrong = frame(key.1, 2, FrameKind::Chunk);
        wrong.generation[0] ^= 1;
        assert!(bridge.route(key, wrong).is_err());
        assert!(cancel.is_cancelled());
        let key2 = ([2; 32], [2; 16]);
        let (_rx, cancel) = bridge
            .allocate(key2, vec![2; 16], Service::Sync, false, 1)
            .unwrap();
        bridge
            .route(key2, frame(key2.1, 1, FrameKind::Chunk))
            .unwrap();
        assert!(matches!(
            bridge.route(key2, frame(key2.1, 2, FrameKind::Chunk)),
            Err(Error::Capacity)
        ));
        assert!(cancel.is_cancelled());
        assert!(matches!(
            bridge.allocate(([3; 32], [3; 16]), vec![2; 16], Service::Sync, false, 1),
            Err(Error::Capacity)
        ));
        let mut oversized = frame([1; 16], 1, FrameKind::Chunk);
        oversized.payload = vec![1; MAX_CHUNK + 1];
        assert!(oversized.validate().is_err());
    }
    #[test]
    fn ack_terminal_peer_binding_and_cancel_guard() {
        let (bridge, _) = Bridge::new(Limits::default());
        let key = (vec![1; 32], vec![2; 16]);
        let (tx, mut rx) = oneshot::channel();
        bridge.pending.lock().unwrap().insert(key.clone(), tx);
        bridge.status(&pb::DataStatus {
            peer_device_id: vec![3; 32],
            message_id: key.1.clone(),
            result: Some(pb::data_status::Result::Stage(
                pb::AckStage::Processed as i32,
            )),
        });
        assert!(rx.try_recv().is_err());
        bridge.status(&pb::DataStatus {
            peer_device_id: key.0.clone(),
            message_id: key.1.clone(),
            result: Some(pb::data_status::Result::Stage(
                pb::AckStage::Accepted as i32,
            )),
        });
        assert!(rx.try_recv().is_err());
        bridge.status(&pb::DataStatus {
            peer_device_id: key.0.clone(),
            message_id: key.1.clone(),
            result: Some(pb::data_status::Result::Stage(
                pb::AckStage::Processed as i32,
            )),
        });
        assert!(rx.try_recv().unwrap().is_ok());
        let (tx, _) = oneshot::channel();
        bridge.pending.lock().unwrap().insert(key.clone(), tx);
        drop(PendingGuard {
            bridge: &bridge,
            key,
        });
        assert!(bridge.pending.lock().unwrap().is_empty());
    }
    fn online(bus: &Bus, peer: PeerId) {
        let mut state = bus.inner.snapshot.write().unwrap();
        state.directory_valid = true;
        state.auth = Some(pb::AuthEvent {
            phase: pb::AuthPhase::Authenticated as i32,
            account: Some(pb::AccountSummary {
                issuer: "https://fixture.invalid/oidc".into(),
                subject: "fixture".into(),
                product_id: "notes-test".into(),
            }),
            validation_lease_expires_at: Some(prost_types::Timestamp {
                seconds: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as i64
                    + 600,
                nanos: 0,
            }),
            ..Default::default()
        });
        state.network = Some(pb::NetworkState {
            running: true,
            reachable: true,
            error: None,
        });
        state.devices.devices = vec![pb::DeviceSnapshot {
            device_id: peer.to_vec(),
            presence: pb::DevicePresence::Online as i32,
            ..Default::default()
        }];
        bus.publish(&state);
    }
    // Test-only message switching: exercises production framing/ACK/stream code and real TCP
    // sockets. It does NOT claim CyberBus authentication, Noise or real network interoperability.
    async fn wire(from: Bus, to: Bus, from_peer: PeerId, mut commands: mpsc::Receiver<C>) {
        loop {
            tokio::select! {
                _=from.inner.stop.cancelled()=>break,
                command=commands.recv()=>match command {
                    Some(C::Send(s))=>to.receive_data(&pb::DataReceived{subscription_id:to.inner.subscription_id.to_vec(),peer_device_id:from_peer.to_vec(),message:s.message}),
                    Some(C::CompleteData(c))=>to.inner.bridge.status(&pb::DataStatus{peer_device_id:from_peer.to_vec(),message_id:c.message_id,result:c.result.map(|r|match r {pb::complete_data::Result::Stage(s)=>pb::data_status::Result::Stage(s),pb::complete_data::Result::Error(e)=>pb::data_status::Result::Error(e)})}),
                    Some(C::CancelData(c))=>to.inner.bridge.cancel_peer(&c.peer_device_id),
                    None=>break,_=>{}
                }
            }
        }
    }
    async fn pair() -> (Bus, Bus) {
        pair_with_stream_timeout(MAX_STREAM_LIFETIME).await
    }
    async fn pair_with_stream_timeout(stream_timeout: Duration) -> (Bus, Bus) {
        let mut limits = Limits::default();
        limits.stream_timeout = stream_timeout;
        let a = Bus::with_limits(
            config(),
            Box::<cyberbus_auth::MemoryStore>::default(),
            StoreMode::CreateNew,
            limits,
        )
        .await
        .unwrap();
        let b = Bus::new(
            config(),
            Box::<cyberbus_auth::MemoryStore>::default(),
            StoreMode::CreateNew,
        )
        .await
        .unwrap();
        // Drain the SDK's initial watch snapshot before installing fixture directory/auth state.
        for bus in [&a, &b] {
            let mut watch = bus.watch();
            while !watch.borrow().directory_valid {
                watch.changed().await.unwrap()
            }
        }
        online(&a, [2; 32]);
        online(&b, [1; 32]);
        let (atx, arx) = mpsc::channel(64);
        let (btx, brx) = mpsc::channel(64);
        *a.inner.test_wire.lock().unwrap() = Some(atx);
        *b.inner.test_wire.lock().unwrap() = Some(btx);
        a.inner
            .tasks
            .spawn(wire(a.clone(), b.clone(), [1; 32], arx));
        b.inner
            .tasks
            .spawn(wire(b.clone(), a.clone(), [2; 32], brx));
        (a, b)
    }
    #[tokio::test]
    async fn mapped_tcp_multichunk_bidirectional_and_half_close() {
        tokio::time::timeout(Duration::from_secs(8), async {
            let (a, b) = pair().await;
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            b.register_endpoint(Service::Sync, listener.local_addr().unwrap())
                .await
                .unwrap();
            let bytes = vec![42; MAX_CHUNK * 5 + 17];
            let expected = bytes.clone();
            let host = tokio::spawn(async move {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut got = vec![];
                socket.read_to_end(&mut got).await.unwrap();
                assert_eq!(got, expected);
                socket.write_all(b"server reply after EOF").await.unwrap();
                socket.shutdown().await.unwrap();
            });
            let lease = a.map([2; 32], Service::Sync).await.unwrap();
            let mut socket = TcpStream::connect(lease.local_addr()).await.unwrap();
            socket.write_all(&bytes).await.unwrap();
            socket.shutdown().await.unwrap();
            let mut reply = vec![];
            socket.read_to_end(&mut reply).await.unwrap();
            assert_eq!(reply, b"server reply after EOF");
            host.await.unwrap();
            lease.done.cancelled().await;
            assert!(lease.result().unwrap().is_ok());
            a.close().await.unwrap();
            b.close().await.unwrap();
        })
        .await
        .unwrap();
    }
    #[tokio::test]
    async fn bootstrap_context_claim_and_local_forgery_rejected() {
        tokio::time::timeout(Duration::from_secs(8), async {
            let (a, b) = pair().await;
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            b.register_endpoint(Service::Bootstrap, listener.local_addr().unwrap())
                .await
                .unwrap();
            let lease = a.map([2; 32], Service::Bootstrap).await.unwrap();
            let mut client = TcpStream::connect(lease.local_addr()).await.unwrap();
            let (mut host, _) = listener.accept().await.unwrap();
            let context = read_bootstrap_context(&mut host, Duration::from_secs(1))
                .await
                .unwrap();
            assert_eq!(context.peer, [1; 32]);
            let mut forged = context.clone();
            forged.peer = [3; 32];
            assert!(b.claim_bootstrap_context(&forged).is_err());
            b.claim_bootstrap_context(&context).unwrap();
            assert!(b.claim_bootstrap_context(&context).is_err());
            client
                .write_all(b"protocol invitation bytes")
                .await
                .unwrap();
            let mut received = [0u8; 25];
            host.read_exact(&mut received).await.unwrap();
            assert_eq!(&received, b"protocol invitation bytes");
            lease.cancel();
            assert!(lease.close().await.is_err());
            b.revoke(false);
            assert!(b.claim_bootstrap_context(&context).is_err());
            a.close().await.unwrap();
            b.close().await.unwrap();
        })
        .await
        .unwrap();
    }
    #[tokio::test]
    async fn mapping_cancel_peer_offline_and_debug_redaction() {
        let (a, b) = pair().await;
        let lease = a.map([2; 32], Service::Sync).await.unwrap();
        let address = lease.local_addr();
        lease.cancel();
        assert!(lease.close().await.is_err());
        assert!(TcpStream::connect(address).await.is_err());
        let lease = a.map([2; 32], Service::Sync).await.unwrap();
        a.inner.bridge.cancel_peer(&[2; 32]);
        assert!(tokio::time::timeout(Duration::from_secs(2), lease.close())
            .await
            .unwrap()
            .is_err());
        assert!(a.inner.bridge.entries.lock().unwrap().is_empty());
        let mut event = pb::AuthEvent {
            phase: pb::AuthPhase::LoggedOut as i32,
            ..Default::default()
        };
        event.error = Some(pb::ProtocolError {
            message: "SECRET_ERROR".into(),
            ..Default::default()
        });
        let raw = BusEvent::Raw(pb::SdkEvent {
            body: Some(pb::sdk_event::Body::Auth(event.clone())),
            ..Default::default()
        });
        assert!(!format!("{raw:?}").contains("SECRET_ERROR"));
        let snapshot = Snapshot {
            auth: Some(event),
            ..Default::default()
        };
        assert!(!format!("{snapshot:?}").contains("SECRET_ERROR"));
        a.close().await.unwrap();
        b.close().await.unwrap();
    }
    #[test]
    fn stream_deadline_aligns_with_host_operation_budget_and_keeps_small_ack_budget() {
        let mut limits = Limits::default();
        assert_eq!(limits.stream_timeout, Duration::from_secs(23 * 60));
        assert_eq!(limits.command_timeout, Duration::from_secs(10));
        assert_eq!(limits.open_timeout, Duration::from_secs(10));
        assert_eq!(limits.ack_timeout, Duration::from_secs(15));
        assert!(limits.validate().is_ok());
        limits.stream_timeout = MAX_STREAM_LIFETIME + Duration::from_millis(1);
        assert!(limits.validate().is_err());
        limits.stream_timeout = Duration::ZERO;
        assert!(limits.validate().is_err());
        limits.stream_timeout = MAX_STREAM_LIFETIME;
        limits.ack_timeout = Duration::from_secs(601);
        assert!(limits.validate().is_err());
    }
    #[tokio::test]
    async fn stream_deadline_still_closes_idle_tcp_at_expiry() {
        tokio::time::timeout(Duration::from_secs(3), async {
            let (a, b) = pair_with_stream_timeout(Duration::from_millis(80)).await;
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            b.register_endpoint(Service::Sync, listener.local_addr().unwrap())
                .await
                .unwrap();
            let lease = a.map([2; 32], Service::Sync).await.unwrap();
            let mut client = TcpStream::connect(lease.local_addr()).await.unwrap();
            let (mut host, _) = listener.accept().await.unwrap();
            let mut byte = [0u8; 1];
            assert_eq!(client.read(&mut byte).await.unwrap(), 0);
            lease.done.cancelled().await;
            assert!(matches!(lease.result(), Some(Err(Error::Timeout))));
            assert_eq!(host.read(&mut byte).await.unwrap(), 0);
            a.close().await.unwrap();
            b.close().await.unwrap();
        })
        .await
        .unwrap();
    }
    #[tokio::test]
    async fn processed_ack_deadline_inflight_wait_and_cancel_remove_pending() {
        tokio::time::timeout(Duration::from_secs(3), async {
            let mut limits = Limits::default();
            limits.ack_timeout = Duration::from_millis(50);
            limits.max_inflight = 1;
            let bus = Bus::with_limits(
                config(),
                Box::<cyberbus_auth::MemoryStore>::default(),
                StoreMode::CreateNew,
                limits,
            )
            .await
            .unwrap();
            let mut updates = bus.watch();
            while !updates.borrow().directory_valid {
                updates.changed().await.unwrap()
            }
            online(&bus, [2; 32]);
            let (tx, mut rx) = mpsc::channel(8);
            *bus.inner.test_wire.lock().unwrap() = Some(tx);
            let first = bus.clone();
            let second = bus.clone();
            let token = CancellationToken::new();
            let t2 = token.clone();
            let a = tokio::spawn(async move {
                first
                    .send_frame([2; 32], frame([1; 16], 1, FrameKind::Chunk), &token)
                    .await
            });
            if let Some(C::Send(sent)) = rx.recv().await {
                // ACCEPTED is deliberately not a processed terminal.
                bus.inner.bridge.status(&pb::DataStatus {
                    peer_device_id: [2; 32].to_vec(),
                    message_id: sent.message.unwrap().message_id,
                    result: Some(pb::data_status::Result::Stage(
                        pb::AckStage::Accepted as i32,
                    )),
                });
            } else {
                panic!("missing test Send")
            }
            let b = tokio::spawn(async move {
                second
                    .send_frame([2; 32], frame([2; 16], 1, FrameKind::Chunk), &t2)
                    .await
            });
            assert!(matches!(a.await.unwrap(), Err(Error::Timeout)));
            assert!(matches!(b.await.unwrap(), Err(Error::Timeout)));
            assert!(bus.inner.bridge.pending.lock().unwrap().is_empty());
            assert_eq!(bus.inner.bridge.inflight.available_permits(), 1);
            let cancel = CancellationToken::new();
            cancel.cancel();
            assert!(matches!(
                bus.send_frame([2; 32], frame([3; 16], 1, FrameKind::Chunk), &cancel)
                    .await,
                Err(Error::Cancelled)
            ));
            assert!(bus.inner.bridge.pending.lock().unwrap().is_empty());
            bus.close().await.unwrap();
        })
        .await
        .unwrap();
    }
    #[tokio::test]
    async fn unused_mapping_listener_has_absolute_open_deadline() {
        tokio::time::timeout(Duration::from_secs(3), async {
            let mut limits = Limits::default();
            limits.open_timeout = Duration::from_millis(50);
            let bus = Bus::with_limits(
                config(),
                Box::<cyberbus_auth::MemoryStore>::default(),
                StoreMode::CreateNew,
                limits,
            )
            .await
            .unwrap();
            let mut updates = bus.watch();
            while !updates.borrow().directory_valid {
                updates.changed().await.unwrap()
            }
            online(&bus, [2; 32]);
            let lease = bus.map([2; 32], Service::Sync).await.unwrap();
            let address = lease.local_addr();
            lease.done.cancelled().await;
            assert!(matches!(lease.result(), Some(Err(Error::Timeout))));
            assert!(bus.inner.bridge.entries.lock().unwrap().is_empty());
            assert!(TcpStream::connect(address).await.is_err());
            bus.close().await.unwrap();
        })
        .await
        .unwrap();
    }
    #[tokio::test]
    async fn sdk_eof_cancels_active_tcp_and_pending_ack_without_host_close() {
        tokio::time::timeout(Duration::from_secs(3), async {
            let (a, b) = pair().await;
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            b.register_endpoint(Service::Sync, listener.local_addr().unwrap())
                .await
                .unwrap();
            let lease = a.map([2; 32], Service::Sync).await.unwrap();
            let mut client = TcpStream::connect(lease.local_addr()).await.unwrap();
            let (mut host, _) = listener.accept().await.unwrap();
            let mut ready = a.inner.updates.subscribe();
            // Wait until the open handshake is completed before withholding the next ACK.
            loop {
                let pending = a
                    .inner
                    .bridge
                    .entries
                    .lock()
                    .unwrap()
                    .values()
                    .any(|entry| entry.ack_pending);
                if !pending {
                    break;
                }
                tokio::task::yield_now().await;
            }
            let (blackhole, mut commands) = mpsc::channel(8);
            *a.inner.test_wire.lock().unwrap() = Some(blackhole);
            client
                .write_all(b"waiting for processed ACK")
                .await
                .unwrap();
            assert!(matches!(commands.recv().await, Some(C::Send(_))));
            assert_eq!(a.inner.bridge.pending.lock().unwrap().len(), 1);
            let result = a
                .inner
                .client
                .execute(pb::SdkCommand {
                    command_id: random_id().to_vec(),
                    body: Some(C::SdkClose(pb::SdkClose {})),
                })
                .await;
            assert!(matches!(
                result.body,
                Some(pb::sdk_result::Body::SdkClosed(_))
            ));
            a.inner.owner_done.cancelled().await;
            assert!(a.snapshot().closed);
            assert!(a.inner.stop.is_cancelled());
            assert!(a.inner.tasks.is_closed());
            assert!(a.inner.tasks.is_empty());
            assert!(a.inner.bridge.entries.lock().unwrap().is_empty());
            assert!(a.inner.bridge.pending.lock().unwrap().is_empty());
            assert!(lease.result().unwrap().is_err());
            let mut byte = [0; 1];
            assert!(matches!(client.read(&mut byte).await, Ok(0) | Err(_)));
            assert!(ready.borrow_and_update().closed);
            // The remote stream is revoked by SDK peer-offline in production. Our offline
            // switch has no SDK network; explicitly deliver that boundary to the remote side.
            b.inner.bridge.cancel_peer(&[1; 32]);
            assert!(matches!(host.read(&mut byte).await, Ok(0) | Err(_)));
            b.close().await.unwrap();
            // close is idempotent after spontaneous SDK EOF and is not needed for the assertions.
            a.close().await.unwrap();
        })
        .await
        .unwrap();
    }
    #[test]
    fn retired_stream_replay_and_tombstone_saturation_fail_closed() {
        let (bridge, _) = Bridge::new(Limits::default());
        let first = ([1; 32], [1; 16]);
        bridge
            .allocate(first, vec![2; 16], Service::Sync, false, 1)
            .unwrap();
        bridge.retire(first);
        assert!(matches!(
            bridge.allocate(first, vec![3; 16], Service::Sync, false, 1),
            Err(Error::Protocol)
        ));
        for number in 1..1024u64 {
            let mut id = [0; 16];
            id[..8].copy_from_slice(&number.to_be_bytes());
            let key = ([1; 32], id);
            bridge
                .allocate(key, vec![2; 16], Service::Sync, false, 1)
                .unwrap();
            bridge.retire(key);
        }
        assert_eq!(bridge.retired.lock().unwrap().len(), 1024);
        assert!(matches!(
            bridge.allocate(([2; 32], [9; 16]), vec![2; 16], Service::Sync, false, 1),
            Err(Error::Capacity)
        ));
    }
}
