mod data;
use data::{PendingData, Receiving, Replay};
mod auth;
mod directory;
mod network;
mod rpc;
use crate::{
    auth_error, error, pb,
    session::{self, Admission, Body, Incoming, Keys, Session},
    ClientConfig, DiagnosticSnapshot, Request,
};
use cyberbus_auth::{
    AuthManager, AuthMode, Clock, CloudLogout, LogoutPolicy, OperationId, Phase, ReauthReason,
};
use cyberbus_protocol::{codec, noise, reassembly};
use cyberbus_transport::{CancellationToken, Transport, TransportConfig};
use prost::Message;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::{sync::mpsc, task::JoinHandle};
use zeroize::Zeroizing;
type PResult<T> = Result<T, pb::ProtocolError>;
type Event = pb::sdk_event::Body;
type ResultBody = pb::sdk_result::Body;
struct DescriptorPull {
    owner: Peer,
    digest: Vec<u8>,
    bytes: Vec<u8>,
    total: Option<u32>,
    deadline: tokio::time::Instant,
}
#[derive(Clone)]
struct Peer {
    send: session::PeerSender,
    session: Session,
    bind: pb::SessionBind,
    ip: std::net::Ipv4Addr,
    used: tokio::time::Instant,
    ping: Option<(Vec<u8>, tokio::time::Instant)>,
    pending_profile: Option<pb::PublicProfile>,
}
struct ProfileQuery {
    peer: Vec<u8>,
    conditional: Option<u64>,
    deadline: tokio::time::Instant,
}
struct CloneChallenge {
    deadline: tokio::time::Instant,
    sessions: [[u8; 32]; 2],
    nonces: [Vec<u8>; 2],
    answered: [bool; 2],
}
pub(crate) struct Runtime {
    connections: BTreeMap<Vec<u8>, network::Connecting>,
    close_result: Arc<Mutex<Option<pb::SdkClosed>>>,
    auth_replies: BTreeMap<[u8; 16], auth::Reply>,
    logout_ready: BTreeMap<[u8; 16], cyberbus_auth::LogoutResult>,
    starting: Option<network::Starting>,
    closing: Vec<JoinHandle<PResult<()>>>,
    stop_replies: Vec<auth::Reply>,
    close_replies: Vec<auth::Reply>,
    close_deadline: Option<tokio::time::Instant>,
    gate_stop: Arc<Mutex<CancellationToken>>,
    auth_seen_revision: u64,
    submitted: tokio::time::Instant,
    cleanup_error: Option<pb::ProtocolError>,
    calls: crate::rpc::Calls,
    // Calls stay on the exact stream that admitted them, including crossed IO.
    rpc_owners: BTreeMap<(Vec<u8>, Vec<u8>), Peer>,
    reassembly_budget: crate::rpc::ReassemblyBudget,
    config: ClientConfig,
    auth: AuthManager,
    events: Option<crate::events::EventSender>,
    sequence: u64,
    id: Vec<u8>,
    revision: u64,
    devices: BTreeMap<Vec<u8>, pb::DeviceSnapshot>,
    watches: BTreeSet<Vec<u8>>,
    subscriptions: BTreeMap<Vec<u8>, Vec<String>>,
    peers: BTreeMap<Vec<u8>, Peer>,
    profile_fetched: BTreeMap<Vec<u8>, tokio::time::Instant>,
    profile_queries: BTreeMap<Vec<u8>, ProfileQuery>,
    published: BTreeMap<Vec<u8>, pb::DeviceSnapshot>,
    probes: BTreeMap<[u8; 32], Peer>,
    evidence: crate::directory::Evidence,
    clones: BTreeMap<Vec<u8>, CloneChallenge>,
    capacity_excluded: bool,
    keys: Option<Arc<Keys>>,
    discovery: Option<mpsc::Sender<crate::discovery::Control>>,
    refreshes: BTreeSet<Vec<u8>>,
    rpc_peers: BTreeMap<Vec<u8>, tokio::time::Instant>,
    transport_generation: Option<u64>,
    network_unready: bool,
    metadata_received: u64,
    metadata_valid: u64,
    noise_verified: u64,
    probe_success: u64,
    probe_failure: u64,
    route_fetch_success: u64,
    route_fetch_failure: u64,
    transport: Option<Arc<Transport>>,
    stop: CancellationToken,
    generation: Option<u64>,
    task: Option<JoinHandle<()>>,
    admission: Arc<Admission>,
    incoming: mpsc::Sender<Incoming>,
    inbox: mpsc::Receiver<Incoming>,
    pending: BTreeMap<(Vec<u8>, Vec<u8>), PendingData>,
    data_sent: BTreeMap<(Vec<u8>, Vec<u8>), tokio::time::Instant>,
    replays: BTreeMap<(Vec<u8>, Vec<u8>), Replay>,
    receiving: BTreeMap<(Vec<u8>, Vec<u8>), Receiving>,
    descriptors: BTreeMap<(Vec<u8>, Vec<u8>), DescriptorPull>,
    handlers: BTreeMap<Vec<u8>, pb::RegisterHandler>,
    pub(crate) application_schema: prost_reflect::DescriptorPool,
    auth_revision: u64,
    closed: bool,
    clock: Arc<cyberbus_auth::SystemClock>,
    lease: Arc<Mutex<Duration>>,
}
fn timestamp(t: u64) -> prost_types::Timestamp {
    prost_types::Timestamp {
        seconds: t as i64,
        nanos: 0,
    }
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn timeout(value: Option<&prost_types::Duration>) -> Duration {
    value
        .map(|d| Duration::new(d.seconds.max(0) as u64, d.nanos.max(0) as u32))
        .unwrap_or(Duration::from_secs(30))
        .min(Duration::from_secs(300))
}
fn id16(id: &[u8]) -> PResult<[u8; 16]> {
    id.try_into().map_err(|_| {
        error(
            pb::ErrorCode::InvalidArgument,
            "operation ID must be 16 bytes",
        )
    })
}
fn id32(id: &[u8]) -> PResult<[u8; 32]> {
    id.try_into()
        .map_err(|_| error(pb::ErrorCode::InvalidArgument, "device ID must be 32 bytes"))
}
impl Runtime {
    pub fn new(
        config: ClientConfig,
        mut auth: AuthManager,
        events: crate::events::EventSender,
        clock: Arc<cyberbus_auth::SystemClock>,
        close_result: Arc<Mutex<Option<pb::SdkClosed>>>,
    ) -> PResult<Self> {
        let i = auth.identity();
        let local = i.device_id().to_vec();
        let mut profile = auth
            .local_profile()
            .map(|(_, p)| codec::decode::<pb::PublicProfile>(&p))
            .transpose()
            .map_err(|e| e.to_protocol_error())?;
        if let Some(p) = &mut profile {
            if !p.capabilities.is_empty() {
                let previous = p.config_revision;
                p.capabilities.clear();
                p.config_revision += 1;
                auth.commit_local_profile(previous, &p.encode_to_vec())
                    .map_err(auth_error)?;
            }
        }
        let i = auth.identity();
        let device = pb::DeviceSnapshot {
            device_id: local.clone(),
            installation_public_key: i.public_key().to_vec(),
            boot_id: i.boot_id().to_vec(),
            is_local: true,
            presence: pb::DevicePresence::Offline as i32,
            profile,
            last_authenticated_at: None,
            virtual_ipv4: vec![],
        };
        let published = BTreeMap::from([(local.clone(), device.clone())]);
        let (incoming, inbox) = mpsc::channel(128);
        let admission = Arc::new(Admission {
            open: AtomicBool::new(false),
            policy: Mutex::new(Default::default()),
            local: local.clone(),
            output_budget: session::OutputBudget::default(),
            metrics: Default::default(),
        });
        let gate_stop = Arc::new(Mutex::new(CancellationToken::new()));
        let gate = admission.clone();
        let gate_cancel = gate_stop.clone();
        let revoke_callbacks = events.business_revoker();
        auth.set_close_gate_observer(Arc::new(move || {
            gate.open.store(false, Ordering::Release);
            revoke_callbacks();
            gate_cancel.lock().unwrap().cancel();
        }));
        let auth_seen_revision = auth.snapshot().state_revision;
        let reassembly_budget = crate::rpc::ReassemblyBudget::default();
        Ok(Self {
            connections: BTreeMap::new(),
            close_result,
            auth_replies: BTreeMap::new(),
            logout_ready: BTreeMap::new(),
            starting: None,
            closing: Vec::new(),
            stop_replies: Vec::new(),
            close_replies: Vec::new(),
            close_deadline: None,
            gate_stop,
            auth_seen_revision,
            submitted: tokio::time::Instant::now(),
            cleanup_error: None,
            calls: crate::rpc::Calls::with_budget(reassembly_budget.clone()),
            rpc_owners: BTreeMap::new(),
            reassembly_budget,
            config,
            auth,
            events: Some(events),
            sequence: 0,
            id: noise::random_bytes::<16>()
                .map_err(|e| e.to_protocol_error())?
                .to_vec(),
            revision: 1,
            devices: BTreeMap::from([(local.clone(), device)]),
            watches: BTreeSet::new(),
            subscriptions: BTreeMap::new(),
            peers: BTreeMap::new(),
            profile_fetched: BTreeMap::new(),
            profile_queries: BTreeMap::new(),
            published,
            probes: BTreeMap::new(),
            evidence: Default::default(),
            clones: BTreeMap::new(),
            capacity_excluded: false,
            keys: None,
            discovery: None,
            refreshes: BTreeSet::new(),
            rpc_peers: BTreeMap::new(),
            transport_generation: None,
            network_unready: false,
            metadata_received: 0,
            metadata_valid: 0,
            noise_verified: 0,
            probe_success: 0,
            probe_failure: 0,
            route_fetch_success: 0,
            route_fetch_failure: 0,
            transport: None,
            stop: CancellationToken::new(),
            generation: None,
            task: None,
            admission,
            incoming,
            inbox,
            pending: BTreeMap::new(),
            data_sent: BTreeMap::new(),
            replays: BTreeMap::new(),
            receiving: BTreeMap::new(),
            descriptors: BTreeMap::new(),
            handlers: BTreeMap::new(),
            application_schema: prost_reflect::DescriptorPool::new(),
            auth_revision: 1,
            closed: false,
            clock,
            lease: Arc::new(Mutex::new(Duration::ZERO)),
        })
    }
    /// Shared command deadline boundary for Data/RPC owners. The API submission time
    /// includes waiting for command capacity and for prior serialized commands.
    fn remaining_budget(&self, value: Option<&prost_types::Duration>) -> PResult<Duration> {
        (self.submitted + timeout(value))
            .checked_duration_since(tokio::time::Instant::now())
            .filter(|d| !d.is_zero())
            .ok_or_else(|| {
                error(
                    pb::ErrorCode::DeadlineExceeded,
                    "command expired while queued",
                )
            })
    }
    fn local(&self) -> &[u8] {
        &self.admission.local
    }
    fn snapshot(&self) -> pb::DevicesSnapshot {
        pb::DevicesSnapshot {
            runtime_id: self.id.clone(),
            revision: self.revision,
            devices: self.devices.values().cloned().collect(),
        }
    }
    fn emit(&mut self, body: Event) {
        self.sequence += 1;
        let event = pb::SdkEvent {
            event_sequence: self.sequence,
            runtime_id: self.id.clone(),
            body: Some(body),
        };
        if let Some(tx) = &self.events {
            let snapshot = matches!(&event.body, Some(Event::Devices(_))).then(|| self.snapshot());
            if tx.send(event, snapshot).is_err() {
                // Losing terminal ACKs would fabricate delivery guarantees. Stop admission on backpressure.
                self.admission.open.store(false, Ordering::Release);
                self.stop.cancel();
                self.closed = true;
                self.events = None;
            }
        }
    }
    #[allow(dead_code)] // Upstream event API retained for runtime extensions.
    fn emit_data(&mut self, data: pb::DataReceived) -> PResult<()> {
        self.sequence += 1;
        self.events
            .as_ref()
            .ok_or_else(|| error(pb::ErrorCode::Cancelled, "event receiver closed"))?
            .send_data(pb::SdkEvent {
                event_sequence: self.sequence,
                runtime_id: self.id.clone(),
                body: Some(Event::DataReceived(data)),
            })
    }
    fn auth_event(&self, operation_id: Vec<u8>) -> pb::AuthEvent {
        let a = self.auth.snapshot();
        pb::AuthEvent {
            operation_id,
            phase: match a.phase {
                Phase::LoggedOut => pb::AuthPhase::LoggedOut,
                Phase::AuthPending => pb::AuthPhase::Authorizing,
                Phase::Authenticated => pb::AuthPhase::Authenticated,
                Phase::Degraded => pb::AuthPhase::Degraded,
                Phase::ReauthRequired => pb::AuthPhase::ReauthRequired,
                Phase::ConfigurationError => pb::AuthPhase::ConfigurationError,
            } as i32,
            reauth_required: a.reauth_required,
            reason: match a.reauth_reason {
                None => 0,
                Some(ReauthReason::CredentialsChanged) => 1,
                Some(ReauthReason::SessionRevoked) => 2,
                Some(ReauthReason::ValidationLeaseExpired) => 3,
            },
            state_revision: self.auth_revision,
            refresh_supported: a.refresh_supported,
            interaction_recommended: a.interaction_recommended,
            refresh_grant_frozen: a.refresh_grant_frozen,
            security_state_persistence_pending: a.security_state_persistence_pending,
            last_online_validation_at: a.last_online_validation_at.map(timestamp),
            validation_request_started_at: a.validation_request_started_at.map(timestamp),
            validation_lease_expires_at: a.validation_lease_expires_at.map(timestamp),
            access_token_expires_at: a.access_token_expires_at.map(timestamp),
            account: a.account.map(|a| pb::AccountSummary {
                issuer: a.issuer,
                subject: a.subject,
                product_id: a.product_id,
            }),
            error: a.last_error.map(auth_error),
        }
    }
    fn auth_changed(&mut self, op: Vec<u8>) {
        let event = self.auth_event(op);
        let revision = self.auth.snapshot().state_revision;
        if revision != self.auth_seen_revision {
            self.auth_seen_revision = revision;
            self.auth_revision += 1;
            let mut event = event;
            event.state_revision = self.auth_revision;
            self.emit(Event::Auth(event));
        }
    }
    fn directory(&mut self, body: pb::devices_event::Body, previous: u64) {
        for watch_id in self.watches.clone() {
            self.emit(Event::Devices(pb::DevicesEvent {
                watch_id,
                runtime_id: self.id.clone(),
                revision: self.revision,
                previous_revision: previous,
                body: Some(body.clone()),
            }));
        }
    }
    fn changed(&mut self, id: &[u8], added: bool) {
        let previous = self.revision;
        self.revision += 1;
        let device = self.devices.get(id).cloned();
        if let Some(device) = device {
            let fields = crate::directory::changed_fields(self.published.get(id), &device);
            self.published.insert(id.to_vec(), device.clone());
            self.directory(
                if added {
                    pb::devices_event::Body::Added(pb::DeviceAdded {
                        device: Some(device),
                    })
                } else {
                    pb::devices_event::Body::Updated(pb::DeviceUpdated {
                        device: Some(device.clone()),
                        changed_fields: Some(prost_types::FieldMask { paths: fields }),
                    })
                },
                previous,
            );
        }
    }
    async fn stop_network(&mut self) {
        self.admission.open.store(false, Ordering::Release);
        if let Some(events) = &self.events {
            events.revoke_business();
        }
        self.cancel_connections();
        self.data_sent.clear();
        self.generation = None;
        self.stop.cancel();
        self.auth.stop_network();
        for peer in self.peers.values() {
            peer.session.cancel.cancel();
        }
        self.peers.clear();
        for p in self.probes.values() {
            p.session.cancel.cancel();
        }
        for (query, q) in std::mem::take(&mut self.profile_queries) {
            self.profile_result(
                query,
                q.peer,
                q.conditional,
                false,
                Some(error(pb::ErrorCode::Cancelled, "network stopped")),
            );
        }
        self.probes.clear();
        self.profile_fetched.clear();
        self.keys = None;
        self.discovery = None;
        self.evidence = Default::default();
        self.clones.clear();
        self.capacity_excluded = false;
        self.rpc_peers.clear();
        self.rpc_owners.clear();
        self.transport_generation = None;
        for query_id in std::mem::take(&mut self.refreshes) {
            self.emit(Event::RefreshDevices(pb::RefreshDevicesResult {
                query_id,
                revision: self.revision,
                partial: true,
                error: Some(error(pb::ErrorCode::Cancelled, "network stopped")),
                ..Default::default()
            }));
        }
        if let Some(t) = self.task.take() {
            t.abort();
        }
        // Discard queued work now; the generation fence also rejects late producers.
        while let Ok(notification) = self.inbox.try_recv() {
            if let Incoming::Up { session, .. } = notification {
                session.cancel.cancel();
            }
        }
        if self.closing.is_empty() {
            self.cleanup_error = None;
        }
        if let Some(t) = self.transport.take() {
            self.close_transport(t);
        }
        if let Some(starting) = &mut self.starting {
            starting.cancel.cancel();
            if let Some(reply) = starting.reply.take() {
                reply.finish(Err(error(
                    pb::ErrorCode::Cancelled,
                    "network start cancelled",
                )));
            }
        }
        let pending = std::mem::take(&mut self.pending);
        for ((peer_device_id, message_id), _) in pending {
            self.emit(Event::DataStatus(pb::DataStatus {
                peer_device_id,
                message_id,
                result: Some(pb::data_status::Result::Error(error(
                    pb::ErrorCode::UnknownOutcome,
                    "network closed before terminal ACK",
                ))),
            }));
        }
        for (peer_device_id, call_id) in self.calls.clear() {
            self.emit(Event::Rpc(pb::RpcEvent {
                handler_id: self.calls.handler_id(&peer_device_id, &call_id),
                peer_device_id,
                body: Some(pb::rpc_event::Body::Cancel(pb::RpcCancel {
                    call_id,
                    error: Some(error(
                        pb::ErrorCode::UnknownOutcome,
                        "network closed during RPC",
                    )),
                })),
            }));
        }
        self.replays.clear();
        self.receiving.clear();
        let descriptors = std::mem::take(&mut self.descriptors);
        for ((_, query_id), p) in descriptors {
            self.emit(Event::Descriptor(pb::DescriptorResult {
                query_id,
                digest: p.digest,
                result: Some(pb::descriptor_result::Result::Error(error(
                    pb::ErrorCode::Cancelled,
                    "network stopped",
                ))),
            }));
        }
        let local = self.local().to_vec();
        self.devices.retain(|id, _| *id == local);
        if let Some(d) = self.devices.get_mut(&local) {
            d.presence = pb::DevicePresence::Offline as i32;
            d.virtual_ipv4.clear();
        }
        let previous = self.revision;
        self.revision += 1;
        self.id = noise::random_bytes::<16>().unwrap_or([1; 16]).to_vec();
        self.published = self.devices.clone();
        self.directory(
            pb::devices_event::Body::Reset(pb::DevicesReset {
                snapshot: Some(self.snapshot()),
                reason: pb::ResetReason::RuntimeChanged as i32,
            }),
            previous,
        );
        self.emit(Event::Network(pb::NetworkState {
            running: false,
            reachable: false,
            error: self.cleanup_error.clone(),
        }));
    }
    fn send_peer(&self, id: &[u8], body: Body) -> PResult<()> {
        if !self.admission.allows(id) {
            return Err(error(
                pb::ErrorCode::PermissionDenied,
                "peer admission is closed",
            ));
        }
        self.peers
            .get(id)
            .ok_or_else(session::unavailable)?
            .send
            .try_send(body)
            .map_err(|_| error(pb::ErrorCode::QueueFull, "peer output queue full"))
    }
    fn owner_current(&self, id: &[u8], owner: &Peer) -> bool {
        self.generation == Some(owner.session.generation)
            && !self.stop.is_cancelled()
            && self.admission.epoch(id) == Some(owner.session.policy_epoch)
            && self.admission.allows(id)
            && !self.capacity_excluded
            && !self.evidence.quarantined.contains(id)
            && self.transport.as_ref().is_none_or(|t| {
                let auth = self.auth.snapshot();
                owner.session.address_current(&t.status())
                    && auth.network_enabled
                    && auth.generation == owner.session.generation
            })
    }
    fn send_owned(&self, id: &[u8], owner: &Peer, body: Body) -> PResult<()> {
        if !self.owner_current(id, owner) || !owner.session.live() {
            return Err(session::unavailable());
        }
        owner
            .send
            .try_send(body)
            .map_err(|_| error(pb::ErrorCode::QueueFull, "peer output queue full"))
    }
    fn send_owned_at(
        &self,
        id: &[u8],
        owner: &Peer,
        body: Body,
        deadline: tokio::time::Instant,
    ) -> PResult<()> {
        if !self.owner_current(id, owner) || !owner.session.live() {
            return Err(session::unavailable());
        }
        owner
            .send
            .try_send_with_deadline(body, deadline)
            .map_err(|_| error(pb::ErrorCode::QueueFull, "peer output queue full"))
    }
    fn send_peer_at(&self, id: &[u8], body: Body, deadline: tokio::time::Instant) -> PResult<()> {
        if !self.admission.allows(id)
            || self.capacity_excluded
            || self.evidence.quarantined.contains(id)
        {
            return Err(error(
                pb::ErrorCode::PermissionDenied,
                "peer admission is closed",
            ));
        }
        self.peers
            .get(id)
            .ok_or_else(session::unavailable)?
            .send
            .try_send_with_deadline(body, deadline)
            .map_err(|_| error(pb::ErrorCode::QueueFull, "peer output queue full"))
    }
    pub async fn run(mut self, mut commands: mpsc::Receiver<Request>) {
        let mut tick = tokio::time::interval(Duration::from_millis(25));
        let mut maintenance = tokio::time::Instant::now();
        loop {
            self.drain_auth_ready();
            self.poll_network().await;
            self.poll_connections().await;
            if (self.transport.is_some() || self.starting.is_some())
                && !self.auth.snapshot().network_enabled
            {
                self.stop_network().await;
            }
            if self.closed {
                break;
            }
            tokio::select! {
                command=commands.recv()=>match command{None=>break,Some(Request::Resume(reply))=>{let result=self.resume().await;let _=reply.send(result);},Some(Request::Diagnostic(reply))=>{let result=self.diagnostic().await;let _=reply.send(result);},Some(Request::Execute(command,submitted,reply))=>self.execute_command(command,submitted,reply).await},
                incoming=self.inbox.recv()=>if let Some(incoming)=incoming{self.receive(incoming).await;},
                _=tick.tick()=>{if tokio::time::Instant::now()>=maintenance {self.maintenance().await;maintenance=tokio::time::Instant::now()+Duration::from_millis(100);}}
            }
        }
        if !self.closed && (self.transport.is_some() || self.starting.is_some()) {
            self.stop_network().await;
        }
        if !self.closed {
            let _ = self.auth.close_owner();
        }
        self.events = None;
        drop(commands);
        // Public close has settled and the producer is closed. Retain the same auth
        // owner until ambiguous HTTP work is conservatively journaled; never transfer
        // a refresh flight to a new owner or abort away a rotated refresh token.
        while self.auth.snapshot().request_in_flight
            || !self.closing.is_empty()
            || self.starting.is_some()
        {
            while self.auth.poll_ready().is_some() {}
            self.poll_network().await;
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
    }
    async fn execute_command(
        &mut self,
        command: pb::SdkCommand,
        submitted: tokio::time::Instant,
        sender: tokio::sync::oneshot::Sender<pb::SdkResult>,
    ) {
        use pb::sdk_command::Body as C;
        let reply = auth::Reply {
            id: command.command_id.clone(),
            sender,
        };
        self.submitted = submitted;
        if self.close_deadline.is_some() {
            if matches!(&command.body, Some(C::SdkClose(_))) {
                self.close_replies.push(reply);
            } else {
                reply.finish(Err(error(pb::ErrorCode::Cancelled, "SDK closed")));
            }
            return;
        }
        if matches!(
            &command.body,
            Some(
                C::AuthStart(_)
                    | C::AuthCallback(_)
                    | C::AuthRestore(_)
                    | C::AuthCancel(_)
                    | C::AuthLogout(_)
            )
        ) {
            self.submit_auth_command(command, reply).await;
            return;
        }
        match &command.body {
            Some(C::NetworkStart(c)) => {
                if c.private_config.is_some() {
                    reply.finish(Err(error(
                        pb::ErrorCode::Unsupported,
                        "private network configuration is not supported",
                    )));
                    return;
                }
                match self.begin_start() {
                    Ok(()) => self.starting.as_mut().unwrap().reply = Some(reply),
                    Err(e) => reply.finish(Err(e)),
                }
            }
            Some(C::NetworkStop(_)) => {
                self.stop_network().await;
                self.stop_replies.push(reply);
            }
            Some(C::SdkClose(_)) => {
                self.close_deadline = Some(tokio::time::Instant::now() + Duration::from_secs(5));
                self.stop_network().await;
                for id in std::mem::take(&mut self.watches) {
                    if let Some(events) = &self.events {
                        events.cancel(&id);
                    }
                }
                self.subscriptions.clear();
                self.handlers.clear();
                if let Err(e) = self.auth.close_owner() {
                    self.cleanup_error.get_or_insert(auth_error(e));
                }
                self.drain_auth_ready();
                self.close_replies.push(reply);
            }
            _ => {
                if let Some(id) = crate::queries::command_id(&command) {
                    let result = self
                        .events
                        .as_ref()
                        .ok_or_else(|| error(pb::ErrorCode::Closed, "event receiver closed"))
                        .and_then(|events| events.reserve_query(id));
                    if let Err(e) = result {
                        reply.finish(Err(e));
                        return;
                    }
                }
                self.queue_connection(command, submitted, reply.sender)
                    .await;
            }
        }
    }
    async fn resume(&mut self) -> PResult<()> {
        let r = self.auth.on_resume().map_err(auth_error);
        if r.as_ref().is_ok_and(|due| *due)
            && self.auth.snapshot().refresh_supported
            && !self.auth.snapshot().refresh_grant_frozen
        {
            let _ = self.auth.submit_refresh();
        }
        if self.transport.is_some() && !self.auth.snapshot().network_enabled {
            self.stop_network().await;
        }
        self.auth_changed(vec![]);
        r.map(|_| ())
    }
    async fn diagnostic(&mut self) -> PResult<DiagnosticSnapshot> {
        let (transport_running, transport_phase, transport_generation, local_ipv4_present) =
            if let Some(transport) = &self.transport {
                let status = transport.status();
                let phase = match status.phase {
                    cyberbus_transport::AddressPhase::Tentative => "tentative",
                    cyberbus_transport::AddressPhase::Ready => "ready",
                    cyberbus_transport::AddressPhase::Changing => "changing",
                    cyberbus_transport::AddressPhase::Conflict => "conflict",
                    cyberbus_transport::AddressPhase::Failed => "failed",
                    cyberbus_transport::AddressPhase::Closed => "closed",
                };
                (
                    true,
                    phase,
                    status.generation,
                    !status.ipv4.is_unspecified(),
                )
            } else {
                (false, "stopped", 0, false)
            };
        let (route_count, remote_route_count, indirect_route_count) =
            if let Some(transport) = &self.transport {
                match tokio::time::timeout(Duration::from_secs(2), transport.routes()).await {
                    Ok(Ok(routes)) => {
                        self.route_fetch_success = self.route_fetch_success.saturating_add(1);
                        let local_ipv4 = transport.status().ipv4;
                        (
                            u32::try_from(routes.len()).unwrap_or(u32::MAX),
                            u32::try_from(routes.iter().filter(|r| r.ipv4 != local_ipv4).count())
                                .unwrap_or(u32::MAX),
                            u32::try_from(routes.iter().filter(|r| r.cost > 1).count())
                                .unwrap_or(u32::MAX),
                        )
                    }
                    _ => {
                        self.route_fetch_failure = self.route_fetch_failure.saturating_add(1);
                        (0, 0, 0)
                    }
                }
            } else {
                (0, 0, 0)
            };
        Ok(DiagnosticSnapshot {
            schema_version: 3,
            transport_running,
            transport_phase,
            transport_generation,
            local_ipv4_present,
            route_count,
            remote_route_count,
            indirect_route_count,
            device_count: self.devices.len(),
            online_device_count: self
                .devices
                .values()
                .filter(|d| d.presence == pb::DevicePresence::Online as i32)
                .count(),
            devices_with_virtual_ipv4: self
                .devices
                .values()
                .filter(|d| d.virtual_ipv4.len() == 4)
                .count(),
            directory_revision: self.revision,
            live_peer_count: self.peers.values().filter(|p| p.session.live()).count(),
            live_probe_count: self.probes.values().filter(|p| p.session.live()).count(),
            active_refresh_count: self.refreshes.len(),
            active_profile_query_count: self.profile_queries.len(),
            metadata_received: self.metadata_received,
            metadata_valid: self.metadata_valid,
            noise_verified: self.noise_verified,
            probe_success: self.probe_success,
            probe_failure: self.probe_failure,
            route_fetch_success: self.route_fetch_success,
            route_fetch_failure: self.route_fetch_failure,
            network_unready: self.network_unready,
            sessions_established: self
                .admission
                .metrics
                .sessions_established
                .load(Ordering::Relaxed),
            sessions_inbound: self
                .admission
                .metrics
                .sessions_inbound
                .load(Ordering::Relaxed),
            sessions_outbound: self
                .admission
                .metrics
                .sessions_outbound
                .load(Ordering::Relaxed),
            probe_sessions_established: self
                .admission
                .metrics
                .probe_sessions_established
                .load(Ordering::Relaxed),
            business_sessions_established: self
                .admission
                .metrics
                .business_sessions_established
                .load(Ordering::Relaxed),
            up_published: self.admission.metrics.up_published.load(Ordering::Relaxed),
            up_installed: self.admission.metrics.up_installed.load(Ordering::Relaxed),
            metadata_queued: self
                .admission
                .metrics
                .metadata_queued
                .load(Ordering::Relaxed),
            metadata_queue_failed: self
                .admission
                .metrics
                .metadata_queue_failed
                .load(Ordering::Relaxed),
            writer_frames_sent: self
                .admission
                .metrics
                .writer_frames_sent
                .load(Ordering::Relaxed),
            writer_metadata_sent: self
                .admission
                .metrics
                .writer_metadata_sent
                .load(Ordering::Relaxed),
            writer_send_failed: self
                .admission
                .metrics
                .writer_send_failed
                .load(Ordering::Relaxed),
            writer_probe_expired: self
                .admission
                .metrics
                .writer_probe_expired
                .load(Ordering::Relaxed),
            frames_received: self
                .admission
                .metrics
                .frames_received
                .load(Ordering::Relaxed),
            metadata_frames_received: self
                .admission
                .metrics
                .metadata_frames_received
                .load(Ordering::Relaxed),
            reader_errors: self.admission.metrics.reader_errors.load(Ordering::Relaxed),
            reader_closed: self.admission.metrics.reader_closed.load(Ordering::Relaxed),
            reader_io: self.admission.metrics.reader_io.load(Ordering::Relaxed),
            reader_protocol: self
                .admission
                .metrics
                .reader_protocol
                .load(Ordering::Relaxed),
            reader_authentication: self
                .admission
                .metrics
                .reader_authentication
                .load(Ordering::Relaxed),
            reader_limit: self.admission.metrics.reader_limit.load(Ordering::Relaxed),
            reader_timeout: self
                .admission
                .metrics
                .reader_timeout
                .load(Ordering::Relaxed),
            reader_aborted: self
                .admission
                .metrics
                .reader_aborted
                .load(Ordering::Relaxed),
            reader_forced_abort: self
                .admission
                .metrics
                .reader_forced_abort
                .load(Ordering::Relaxed),
            reader_prefix_timeout: self
                .admission
                .metrics
                .reader_prefix_timeout
                .load(Ordering::Relaxed),
            reader_no_frame_exits: self
                .admission
                .metrics
                .reader_no_frame_exits
                .load(Ordering::Relaxed),
            reader_close_frames: self
                .admission
                .metrics
                .reader_close_frames
                .load(Ordering::Relaxed),
            reader_admission_closed: self
                .admission
                .metrics
                .reader_admission_closed
                .load(Ordering::Relaxed),
            reader_channel_closed: self
                .admission
                .metrics
                .reader_channel_closed
                .load(Ordering::Relaxed),
            writer_closed: self.admission.metrics.writer_closed.load(Ordering::Relaxed),
            writer_io: self.admission.metrics.writer_io.load(Ordering::Relaxed),
            writer_protocol: self
                .admission
                .metrics
                .writer_protocol
                .load(Ordering::Relaxed),
            writer_authentication: self
                .admission
                .metrics
                .writer_authentication
                .load(Ordering::Relaxed),
            writer_limit: self.admission.metrics.writer_limit.load(Ordering::Relaxed),
            writer_timeout: self
                .admission
                .metrics
                .writer_timeout
                .load(Ordering::Relaxed),
            writer_shutdown_failed: self
                .admission
                .metrics
                .writer_shutdown_failed
                .load(Ordering::Relaxed),
            writer_exit_cancel: self
                .admission
                .metrics
                .writer_exit_cancel
                .load(Ordering::Relaxed),
            writer_exit_stop: self
                .admission
                .metrics
                .writer_exit_stop
                .load(Ordering::Relaxed),
            writer_exit_queue_closed: self
                .admission
                .metrics
                .writer_exit_queue_closed
                .load(Ordering::Relaxed),
            writer_exit_probe_expired: self
                .admission
                .metrics
                .writer_exit_probe_expired
                .load(Ordering::Relaxed),
            writer_exit_prefix_timeout: self
                .admission
                .metrics
                .writer_exit_prefix_timeout
                .load(Ordering::Relaxed),
            writer_exit_admission_closed: self
                .admission
                .metrics
                .writer_exit_admission_closed
                .load(Ordering::Relaxed),
            writer_exit_send_failed: self
                .admission
                .metrics
                .writer_exit_send_failed
                .load(Ordering::Relaxed),
            writer_close_attempted: self
                .admission
                .metrics
                .writer_close_attempted
                .load(Ordering::Relaxed),
            writer_close_sent: self
                .admission
                .metrics
                .writer_close_sent
                .load(Ordering::Relaxed),
            writer_close_failed: self
                .admission
                .metrics
                .writer_close_failed
                .load(Ordering::Relaxed),
            local_prefix_ready: self
                .admission
                .metrics
                .local_prefix_ready
                .load(Ordering::Relaxed),
            local_prefix_sent: self
                .admission
                .metrics
                .local_prefix_sent
                .load(Ordering::Relaxed),
        })
    }
    async fn dispatch(&mut self, command: pb::SdkCommand) -> PResult<ResultBody> {
        let query = crate::queries::command_id(&command).map(<[u8]>::to_vec);
        let result = self.dispatch_inner(command).await;
        if result.is_err() {
            if let (Some(id), Some(events)) = (query, self.events.as_ref()) {
                events.release_query(&id);
            }
        }
        result
    }
    async fn dispatch_inner(&mut self, command: pb::SdkCommand) -> PResult<ResultBody> {
        use pb::sdk_command::Body as C;
        let body = command
            .body
            .ok_or_else(|| error(pb::ErrorCode::InvalidArgument, "missing command"))?;
        // Local observation and durable policy management never refresh or require a
        // remote lease. Only actual remote operations check the suspend-inclusive gate.
        let remote = matches!(
            &body,
            C::Send(_)
                | C::CancelData(_)
                | C::CompleteData(_)
                | C::RpcRequest(_)
                | C::RpcChunk(_)
                | C::RpcEnd(_)
                | C::RpcCancel(_)
                | C::RpcWindow(_)
                | C::PullDescriptor(_)
                | C::RefreshDevices(_)
        ) || matches!(&body,C::GetDeviceDescriptor(c) if c.peer_device_id!=self.local());
        if remote {
            let generation = self
                .generation
                .ok_or_else(|| error(pb::ErrorCode::NetworkNotReady, "network is stopped"))?;
            self.auth.check_gate(generation, None).map_err(auth_error)?;
        }
        match body {
            C::GetAuthState(_) => return Ok(ResultBody::AuthState(self.auth_event(vec![]))),
            C::AuthStart(_)
            | C::AuthCallback(_)
            | C::AuthCancel(_)
            | C::AuthRestore(_)
            | C::AuthLogout(_)
            | C::SdkClose(_)
            | C::NetworkStart(_)
            | C::NetworkStop(_) => {
                return Err(error(
                    pb::ErrorCode::Internal,
                    "owned command requires runtime dispatcher",
                ))
            }
            C::WatchDevices(c) => {
                if self.watches.contains(&c.watch_id) {
                    return Err(error(pb::ErrorCode::Conflict, "watch ID already active"));
                }
                if self.watches.len() >= 4 {
                    return Err(error(pb::ErrorCode::ResourceExhausted, "watch limit"));
                }
                self.watches.insert(c.watch_id.clone());
                self.events.as_ref().unwrap().register(c.watch_id.clone());
                self.emit(Event::Devices(pb::DevicesEvent {
                    watch_id: c.watch_id,
                    runtime_id: self.id.clone(),
                    revision: self.revision,
                    previous_revision: 0,
                    body: Some(pb::devices_event::Body::Snapshot(self.snapshot())),
                }));
            }
            C::StopWatchDevices(c) => {
                self.watches.remove(&c.watch_id);
                self.events.as_ref().unwrap().cancel(&c.watch_id);
            }
            C::GetDevices(c) => self.emit(Event::DevicesQuery(pb::DevicesQueryResult {
                query_id: c.query_id,
                result: Some(pb::devices_query_result::Result::Snapshot(self.snapshot())),
            })),
            C::RefreshDevices(c) => {
                if self.transport.is_none() {
                    return Err(error(pb::ErrorCode::NetworkNotReady, "network is stopped"));
                }
                if self.refreshes.contains(&c.query_id) {
                    return Err(error(pb::ErrorCode::Conflict, "query ID already active"));
                }
                if self.refreshes.len() >= 4 {
                    return Err(error(
                        pb::ErrorCode::ResourceExhausted,
                        "refresh query limit",
                    ));
                }
                let query = crate::discovery::Refresh {
                    id: c.query_id.clone(),
                    deadline: self.submitted
                        + timeout(c.budget.as_ref()).min(Duration::from_secs(30)),
                };
                self.discovery
                    .as_ref()
                    .ok_or_else(session::unavailable)?
                    .try_send(crate::discovery::Control::Refresh(query))
                    .map_err(|_| error(pb::ErrorCode::QueueFull, "discovery command queue full"))?;
                self.refreshes.insert(c.query_id);
            }
            C::GetDeviceDescriptor(c) => {
                if c.peer_device_id == self.local() {
                    self.profile_result(
                        c.query_id,
                        c.peer_device_id,
                        c.conditional_revision,
                        false,
                        None,
                    );
                } else {
                    if self.transport.is_none() {
                        return Err(error(pb::ErrorCode::NetworkNotReady, "network is stopped"));
                    }
                    if !self.admission.allows(&c.peer_device_id) {
                        return Err(error(pb::ErrorCode::PermissionDenied, "peer blocked"));
                    }
                    if self.evidence.quarantined.contains(&c.peer_device_id)
                        || self.capacity_excluded
                    {
                        return Err(error(
                            pb::ErrorCode::Conflict,
                            "directory identity is isolated",
                        ));
                    }
                    let fresh = self
                        .profile_fetched
                        .get(&c.peer_device_id)
                        .is_some_and(|t| {
                            tokio::time::Instant::now().duration_since(*t)
                                <= Duration::from_secs(30)
                        });
                    if fresh
                        && self
                            .devices
                            .get(&c.peer_device_id)
                            .is_some_and(|d| d.presence == pb::DevicePresence::Online as i32)
                    {
                        self.profile_result(
                            c.query_id,
                            c.peer_device_id,
                            c.conditional_revision,
                            true,
                            None,
                        );
                    } else {
                        let ip = self
                            .devices
                            .get(&c.peer_device_id)
                            .and_then(|d| <[u8; 4]>::try_from(d.virtual_ipv4.as_slice()).ok())
                            .map(std::net::Ipv4Addr::from);
                        if let Some(ip) = ip {
                            self.discovery
                                .as_ref()
                                .ok_or_else(session::unavailable)?
                                .try_send(crate::discovery::Control::Probe(ip))
                                .map_err(|_| {
                                    error(pb::ErrorCode::QueueFull, "discovery queue full")
                                })?;
                            self.profile_queries.insert(
                                c.query_id,
                                ProfileQuery {
                                    peer: c.peer_device_id,
                                    conditional: c.conditional_revision,
                                    deadline: tokio::time::Instant::now() + Duration::from_secs(30),
                                },
                            );
                        } else {
                            self.profile_result(
                                c.query_id,
                                c.peer_device_id,
                                c.conditional_revision,
                                false,
                                Some(error(
                                    pb::ErrorCode::NotFound,
                                    "authenticated descriptor unavailable",
                                )),
                            );
                        }
                    }
                }
            }
            C::UpdatePublicProfile(c) => {
                let mut profile = c.profile.ok_or_else(|| {
                    error(pb::ErrorCode::InvalidArgument, "missing public profile")
                })?;
                let current = self.devices[self.local()]
                    .profile
                    .as_ref()
                    .map(|p| p.config_revision)
                    .unwrap_or(0);
                if current != c.expected_revision {
                    return Err(error(
                        pb::ErrorCode::StaleRevision,
                        "public profile revision mismatch",
                    ));
                }
                if !profile.capabilities.is_empty() {
                    return Err(error(
                        pb::ErrorCode::InvalidArgument,
                        "capabilities are managed by registered handlers",
                    ));
                }
                if c.update_mask.as_ref().is_some_and(|m| {
                    m.paths.iter().any(|p| {
                        p != "device_name" && p != "public_config" && p != "config_semantic_version"
                    })
                }) {
                    return Err(error(
                        pb::ErrorCode::InvalidArgument,
                        "unsupported public profile field mask",
                    ));
                }
                if let Some(mask) = c.update_mask.filter(|m| !m.paths.is_empty()) {
                    let mut old = self.devices[self.local()]
                        .profile
                        .clone()
                        .unwrap_or_default();
                    for field in mask.paths {
                        match field.as_str() {
                            "device_name" => old.device_name = profile.device_name.clone(),
                            "public_config" => old.public_config = profile.public_config.clone(),
                            "config_semantic_version" => {
                                old.config_semantic_version =
                                    profile.config_semantic_version.clone()
                            }
                            _ => {}
                        }
                    }
                    profile = old;
                }
                profile.capabilities = self
                    .handlers
                    .values()
                    .filter_map(|h| h.capability.clone())
                    .collect();
                profile.config_revision = current + 1;
                let encoded = codec::encode(&profile).map_err(|e| e.to_protocol_error())?;
                self.auth
                    .commit_local_profile(current, &encoded)
                    .map_err(auth_error)?;
                let local = self.local().to_vec();
                self.devices.get_mut(&local).unwrap().profile = Some(profile.clone());
                self.changed(&local, false);
                self.push_profile(profile.clone());
                return Ok(ResultBody::PublicProfile(profile));
            }
            C::UnsubscribeData(c) => {
                let id = c.subscription_id.clone();
                let result = self.dispatch_data(C::UnsubscribeData(c)).await;
                if result.is_ok() {
                    if let Some(events) = &self.events {
                        events.cancel_subscription(&id);
                    }
                }
                return result;
            }
            c @ (C::SubscribeData(_) | C::Send(_) | C::CancelData(_) | C::CompleteData(_)) => {
                return self.dispatch_data(c).await
            }
            c @ (C::RegisterHandler(_)
            | C::UnregisterHandler(_)
            | C::RpcRequest(_)
            | C::RpcChunk(_)
            | C::RpcEnd(_)
            | C::RpcCancel(_)
            | C::RpcWindow(_)) => return self.dispatch_rpc(c).await,
            C::BlockDevice(c) => {
                return self
                    .block(c.peer_device_id, true)
                    .await
                    .map(ResultBody::DeviceBlock)
            }
            C::UnblockDevice(c) => {
                return self
                    .block(c.peer_device_id, false)
                    .await
                    .map(ResultBody::DeviceBlock)
            }
            C::GetBlockedDevices(c) => {
                let states = if let Some(id) = c.peer_device_id {
                    vec![self.auth.block_state(id32(&id)?).map_err(auth_error)?]
                } else {
                    self.auth.blocked_devices().map_err(auth_error)?
                };
                let probe = states.first().cloned().unwrap_or(
                    self.auth
                        .block_state(if self.local() == [1; 32] {
                            [2; 32]
                        } else {
                            [1; 32]
                        })
                        .map_err(auth_error)?,
                );
                let scope = Some(pb::BlockScope {
                    issuer: probe.account.issuer,
                    subject: probe.account.subject,
                    product_id: probe.account.product_id,
                });
                let revision = probe.revision;
                let state_revision = probe.state_revision;
                self.emit(Event::BlockedDevices(pb::BlockedDevicesQueryResult {
                    query_id: c.query_id,
                    result: Some(pb::blocked_devices_query_result::Result::Snapshot(
                        pb::BlockedDevicesSnapshot {
                            scope,
                            devices: states.into_iter().map(block_state).collect(),
                            revision,
                            state_revision,
                        },
                    )),
                }));
            }
            C::PullDescriptor(c) => {
                self.ensure_peer(&c.peer_device_id).await?;
                if !self.descriptors.is_empty() {
                    return Err(error(
                        pb::ErrorCode::ResourceExhausted,
                        "one descriptor pull is already active",
                    ));
                }
                let key = (c.peer_device_id.clone(), c.query_id.clone());
                if self.descriptors.contains_key(&key) {
                    return Err(error(pb::ErrorCode::Conflict, "duplicate schema query"));
                }
                let deadline = self.submitted + timeout(c.timeout.as_ref());
                self.remaining_budget(c.timeout.as_ref())?;
                self.send_peer_at(
                    &c.peer_device_id,
                    Body::DescriptorQuery(pb::DescriptorQuery {
                        query_id: c.query_id.clone(),
                        digest: c.digest.clone(),
                        timeout: c.timeout,
                    }),
                    deadline,
                )?;
                self.descriptors.insert(
                    key,
                    DescriptorPull {
                        owner: self.peers.get(&c.peer_device_id).unwrap().clone(),
                        digest: c.digest,
                        bytes: vec![],
                        total: None,
                        deadline,
                    },
                );
            }
        }
        Ok(ResultBody::Ok(()))
    }
    fn validate_type(&self, ty: &str) -> PResult<()> {
        let name = ty.rsplit('/').next().unwrap_or("");
        let pool = cyberbus_protocol::validation::descriptor_pool();
        if pool.get_message_by_name(name).is_some()
            || self.application_schema.get_message_by_name(name).is_some()
        {
            return Ok(());
        }
        for h in self.handlers.values() {
            if let Ok(p) = prost_reflect::DescriptorPool::decode(h.descriptor_set.as_slice()) {
                if p.get_message_by_name(name).is_some() {
                    return Ok(());
                }
            }
        }
        Err(error(pb::ErrorCode::TypeMismatch, "type is not registered"))
    }
    fn validate_payload(&self, f: &pb::PayloadFragment) -> PResult<()> {
        let name = f.application_type_url.rsplit('/').next().unwrap_or("");
        let pool = cyberbus_protocol::validation::descriptor_pool();
        let mut desc = pool
            .get_message_by_name(name)
            .or_else(|| self.application_schema.get_message_by_name(name));
        for h in self.handlers.values() {
            if desc.is_none() {
                if let Ok(p) = prost_reflect::DescriptorPool::decode(h.descriptor_set.as_slice()) {
                    desc = p.get_message_by_name(name);
                }
            }
        }
        reassembly::validate_application(
            &f.application_type_url,
            pb::PayloadEncoding::try_from(f.encoding).unwrap_or(pb::PayloadEncoding::Unspecified),
            &f.protobuf_bytes,
            desc.as_ref(),
            false,
        )
        .map_err(|e| e.to_protocol_error())
    }
    async fn block(&mut self, id: Vec<u8>, blocked: bool) -> PResult<pb::DeviceBlockResult> {
        let device = id32(&id)?;
        let initial = self.auth.block_state(device).map_err(auth_error)?;
        if initial.blocked == blocked
            && initial.persisted_blocked == blocked
            && !initial.persistence_pending
        {
            return Ok(block_result(initial));
        }
        // Runtime deny is immediate and remains in place if persistence fails.
        self.admission.policy.lock().unwrap().deny(id.clone());
        if let Some(events) = &self.events {
            events.revoke_peer(&id);
        }
        if let Some(p) = self.peers.remove(&id) {
            p.session.cancel.cancel();
        }
        self.finish_profile_queries(
            &id,
            error(pb::ErrorCode::PermissionDenied, "device blocked"),
        );
        self.probes.retain(|_, p| {
            if p.bind.device_id == id {
                p.session.cancel.cancel();
                false
            } else {
                true
            }
        });
        self.evidence.health.remove(&id);
        self.evidence.candidates.remove(&id);
        self.clones.remove(&id);
        self.receiving.retain(|(peer, _), _| *peer != id);
        self.replays.retain(|(peer, _), _| *peer != id);
        for call_id in self.calls.remove_peer(&id) {
            self.emit(Event::Rpc(pb::RpcEvent {
                handler_id: self.calls.handler_id(&id, &call_id),
                peer_device_id: id.clone(),
                body: Some(pb::rpc_event::Body::Cancel(pb::RpcCancel {
                    call_id,
                    error: Some(error(
                        pb::ErrorCode::UnknownOutcome,
                        "device blocked during RPC",
                    )),
                })),
            }));
        }
        if self.devices.remove(&id).is_some() {
            let previous = self.revision;
            self.revision += 1;
            self.directory(
                pb::devices_event::Body::Removed(pb::DeviceRemoved {
                    device_id: id.clone(),
                    error: Some(error(pb::ErrorCode::PermissionDenied, "device blocked")),
                }),
                previous,
            );
        }
        self.data_drop_peer(
            &id,
            error(
                pb::ErrorCode::UnknownOutcome,
                "device blocked before terminal ACK",
            ),
        );
        let pulls: Vec<_> = self
            .descriptors
            .keys()
            .filter(|(peer, _)| *peer == id)
            .cloned()
            .collect();
        for key in pulls {
            let p = self.descriptors.remove(&key).unwrap();
            self.emit(Event::Descriptor(pb::DescriptorResult {
                query_id: key.1,
                digest: p.digest,
                result: Some(pb::descriptor_result::Result::Error(error(
                    pb::ErrorCode::PermissionDenied,
                    "device blocked",
                ))),
            }));
        }
        let result = if blocked {
            self.auth.block_device(device)
        } else {
            self.auth.unblock_device(device)
        };
        if result.is_ok() && !blocked {
            self.admission.policy.lock().unwrap().blocked.remove(&id);
        }
        let state = self.auth.block_state(device).map_err(auth_error)?;
        let event = block_result(state);
        self.emit(Event::DeviceBlockChanged(event.clone()));
        result.map_err(auth_error)?;
        Ok(event)
    }
    async fn receive(&mut self, incoming: Incoming) {
        match incoming {
            Incoming::OutputExpired { id, session, body } => {
                if self.generation != Some(session.generation)
                    || !self.connection(&id, &session).is_some()
                {
                    return;
                }
                let expired = error(
                    pb::ErrorCode::DeadlineExceeded,
                    "outbound frame expired in local queue",
                );
                match body {
                    Body::Data(m) => {
                        let key = (id.clone(), m.message_id.clone());
                        if self
                            .pending
                            .get(&key)
                            .is_some_and(|p| p.owner.session.same_instance(&session))
                        {
                            let pending = self.pending.remove(&key).unwrap();
                            self.data_sent.insert(
                                (id.clone(), m.message_id.clone()),
                                tokio::time::Instant::now() + Duration::from_secs(600),
                            );
                            let _ = self.send_owned(
                                &id,
                                &pending.owner,
                                Body::DataCancel(pb::DataCancel {
                                    message_id: m.message_id.clone(),
                                }),
                            );
                            self.emit(Event::DataStatus(pb::DataStatus {
                                peer_device_id: id,
                                message_id: m.message_id,
                                result: Some(pb::data_status::Result::Error(expired)),
                            }));
                        }
                    }
                    Body::RpcRequest(r) => self.rpc_failure(&id, r.call_id, expired),
                    Body::RpcChunk(r) => self.rpc_failure(&id, r.call_id, expired),
                    Body::RpcEnd(r) => self.rpc_failure(&id, r.call_id, expired),
                    Body::RpcWindow(r) => self.rpc_failure(&id, r.call_id, expired),
                    Body::DescriptorQuery(q) => {
                        if let Some(p) = self.descriptors.remove(&(id, q.query_id.clone())) {
                            self.emit(Event::Descriptor(pb::DescriptorResult {
                                query_id: q.query_id,
                                digest: p.digest,
                                result: Some(pb::descriptor_result::Result::Error(expired)),
                            }));
                        }
                    }
                    _ => {}
                }
            }
            up @ Incoming::Up { .. } => {
                self.noise_verified = self.noise_verified.saturating_add(1);
                self.receive_up(up);
            }
            Incoming::RefreshFinished {
                generation,
                mut result,
            } => {
                if self.generation == Some(generation) && self.refreshes.remove(&result.query_id) {
                    result.revision = self.revision;
                    self.emit(Event::RefreshDevices(result));
                }
            }
            Incoming::ProbeFinished {
                generation,
                address_generation,
                count_failure,
                ip,
                round,
                verified,
            } => {
                if verified {
                    self.probe_success = self.probe_success.saturating_add(1);
                } else if count_failure {
                    self.probe_failure = self.probe_failure.saturating_add(1);
                }
                if self.generation == Some(generation)
                    && self.transport.as_ref().is_some_and(|t| {
                        t.status().phase == cyberbus_transport::AddressPhase::Ready
                            && t.status().generation == address_generation
                    })
                {
                    let ids: Vec<_> = self
                        .devices
                        .values()
                        .filter(|d| d.virtual_ipv4 == ip.octets())
                        .map(|d| d.device_id.clone())
                        .collect();
                    for id in ids {
                        if !verified && count_failure {
                            if let Some(h) = self.evidence.health.get_mut(&id) {
                                h.fail(round);
                            }
                        }
                    }
                }
            }
            Incoming::Down { id, session } => {
                // Normal IO closure is ordered after its authenticated prefix.
                // Security cancellation remains immediate on the separate token.
                let normal = !session.cancel.is_cancelled();
                session.cancel.cancel();
                if self.generation == Some(session.generation)
                    && self
                        .peers
                        .get(&id)
                        .is_some_and(|p| p.session.same_instance(&session))
                {
                    let boot = self.peers[&id].bind.boot_id.clone();
                    let replacement = normal
                        .then(|| {
                            self.probes
                                .values()
                                .find(|p| {
                                    p.bind.device_id == id
                                        && p.bind.boot_id == boot
                                        && p.session.business.load(Ordering::Acquire)
                                        && p.session.live()
                                        && self.owner_current(&id, p)
                                })
                                .cloned()
                        })
                        .flatten();
                    if let Some(p) = replacement {
                        // Retire only this stream. Existing work never changes owner.
                        self.probes.remove(&p.session.id);
                        self.retire_output(&id, &session);
                        self.peers.insert(id.clone(), p);
                    } else {
                        self.drop_business(
                            &id,
                            error(pb::ErrorCode::UnknownOutcome, "authenticated stream ended"),
                        );
                    }
                }
                self.retire_session_work(&id, &session);
                self.probes.remove(&session.id);
                session.progress.owner_done.cancel();
                // A lost stream alone is not evidence of device offline. Discovery retries it.
            }
            Incoming::Frame { id, session, body } => {
                if self.capacity_excluded {
                    session.cancel.cancel();
                    return;
                }
                if self
                    .transport
                    .as_ref()
                    .is_some_and(|t| !session.address_current(&t.status()))
                {
                    return;
                }
                if self.transport.is_some()
                    && self.auth.check_gate(session.generation, None).is_err()
                {
                    return;
                }
                if self.generation != Some(session.generation)
                    || self.stop.is_cancelled()
                    || session.cancel.is_cancelled()
                    || !self.admission.allows(&id)
                    || !self.connection(&id, &session).is_some_and(|p| {
                        p.session.same_instance(&session) && !p.session.cancel.is_cancelled()
                    })
                {
                    return;
                }
                self.evidence.success(&id, tokio::time::Instant::now());
                if let Some(d) = self.devices.get_mut(&id) {
                    d.last_authenticated_at = Some(timestamp(now()));
                }
                if matches!(
                    &body,
                    Body::Data(_) | Body::RpcRequest(_) | Body::DescriptorQuery(_)
                ) {
                    if self.promote(&id, &session).is_err() {
                        session.cancel.cancel();
                        return;
                    }
                }
                if let Some(p) = self.peers.get_mut(&id) {
                    p.used = tokio::time::Instant::now();
                }
                if let Some(p) = self.probes.get_mut(&session.id) {
                    p.used = tokio::time::Instant::now();
                }
                match body {
                    Body::Metadata(m) => {
                        self.metadata_received = self.metadata_received.saturating_add(1);
                        if codec::encode(&m).is_err() {
                            return;
                        }
                        let Some(profile) = m.profile else {
                            session.cancel.cancel();
                            self.finish_profile_queries(
                                &id,
                                error(
                                    pb::ErrorCode::ProtocolError,
                                    "peer metadata omitted profile",
                                ),
                            );
                            return;
                        };
                        let peer = self.connection(&id, &session).unwrap().clone();
                        if self.clones.contains_key(&id) {
                            return;
                        }
                        if self.devices.get(&id).is_some_and(|d| {
                            d.boot_id == peer.bind.boot_id
                                && d.profile.as_ref().is_some_and(|p| {
                                    p.config_revision == profile.config_revision && p != &profile
                                })
                        }) {
                            session.cancel.cancel();
                            return;
                        }
                        if self.devices.len() >= 256 && !self.devices.contains_key(&id) {
                            if let Some(victim) = self
                                .devices
                                .values()
                                .find(|d| {
                                    !d.is_local && d.presence == pb::DevicePresence::Offline as i32
                                })
                                .map(|d| d.device_id.clone())
                            {
                                self.remove_device(&victim, None);
                            } else {
                                session.cancel.cancel();
                                return;
                            }
                        }
                        let added = !self.devices.contains_key(&id);
                        if self
                            .devices
                            .get(&id)
                            .and_then(|d| d.profile.as_ref())
                            .is_some_and(|p| {
                                p.config_revision > profile.config_revision
                                    && self.devices[&id].boot_id == peer.bind.boot_id
                            })
                        {
                            return;
                        }
                        let d = pb::DeviceSnapshot {
                            device_id: id.clone(),
                            installation_public_key: peer.bind.installation_public_key.clone(),
                            boot_id: peer.bind.boot_id.clone(),
                            is_local: false,
                            presence: pb::DevicePresence::Online as i32,
                            profile: Some(profile),
                            last_authenticated_at: Some(timestamp(now())),
                            virtual_ipv4: peer.ip.octets().to_vec(),
                        };
                        let changed = self
                            .devices
                            .get(&id)
                            .map(|old| {
                                old.profile != d.profile
                                    || old.boot_id != d.boot_id
                                    || old.virtual_ipv4 != d.virtual_ipv4
                                    || old.presence != d.presence
                            })
                            .unwrap_or(true);
                        if self
                            .devices
                            .get(&id)
                            .is_some_and(|old| old.boot_id != d.boot_id)
                        {
                            self.data_sent.retain(|(p, _), _| *p != id);
                            self.receiving.retain(|(p, _), _| *p != id);
                            self.replays.retain(|(p, _), _| *p != id);
                        }
                        if let Some(discovery) = &self.discovery {
                            let _ = discovery
                                .try_send(crate::discovery::Control::Remember(peer.ip, id.clone()));
                        }
                        self.profile_fetched
                            .insert(id.clone(), tokio::time::Instant::now());
                        self.devices.insert(id.clone(), d);
                        self.metadata_valid = self.metadata_valid.saturating_add(1);
                        session.progress.metadata.store(true, Ordering::Release);
                        if changed {
                            self.changed(&id, added);
                        }
                        let queries: Vec<_> = self
                            .profile_queries
                            .iter()
                            .filter(|(_, q)| q.peer == id)
                            .map(|(key, _)| key.clone())
                            .collect();
                        for query in queries {
                            let q = self.profile_queries.remove(&query).unwrap();
                            self.profile_result(query, id.clone(), q.conditional, false, None);
                        }
                        if session.business.load(Ordering::Acquire) {
                            let _ = self.promote(&id, &session);
                        } else if session.outbound {
                            session.progress.io_ended.cancel();
                        }
                    }
                    Body::Ping(p) => {
                        if let Some(peer) = self.connection(&id, &session) {
                            let _ = peer.send.try_send(Body::Pong(pb::Pong { nonce: p.nonce }));
                        }
                    }
                    Body::Pong(p) => {
                        if let Some(peer) = self.peers.get_mut(&id) {
                            if peer
                                .ping
                                .as_ref()
                                .is_some_and(|(nonce, _)| *nonce == p.nonce)
                            {
                                peer.ping = None;
                            }
                        }
                        let proven = if let Some(c) = self.clones.get_mut(&id) {
                            if tokio::time::Instant::now() <= c.deadline {
                                for i in 0..2 {
                                    if c.sessions[i] == session.id && c.nonces[i] == p.nonce {
                                        c.answered[i] = true;
                                    }
                                }
                            }
                            c.answered == [true, true]
                        } else {
                            false
                        };
                        if proven {
                            self.clones.remove(&id);
                            self.evidence.quarantined.insert(id.clone());
                            self.drop_business(
                                &id,
                                error(
                                    pb::ErrorCode::DuplicateDeviceId,
                                    "two boot IDs answered fresh authenticated challenges",
                                ),
                            );
                            self.probes.retain(|_, p| {
                                if p.bind.device_id == id {
                                    p.session.cancel.cancel();
                                    false
                                } else {
                                    true
                                }
                            });
                            self.remove_device(
                                &id,
                                Some(error(
                                    pb::ErrorCode::DuplicateDeviceId,
                                    "installation identity is cloned",
                                )),
                            );
                            self.emit(Event::Network(pb::NetworkState {
                                running: true,
                                reachable: true,
                                error: Some(error(
                                    pb::ErrorCode::DuplicateDeviceId,
                                    "installation identity is cloned",
                                )),
                            }));
                        }
                    }
                    b @ (Body::Data(_)
                    | Body::DataAck(_)
                    | Body::DataError(_)
                    | Body::DataCancel(_)) => {
                        let owner = self.connection(&id, &session).unwrap().clone();
                        self.receive_data_on(id, b, owner);
                    }
                    b @ (Body::RpcRequest(_)
                    | Body::RpcChunk(_)
                    | Body::RpcEnd(_)
                    | Body::RpcCancel(_)
                    | Body::RpcWindow(_)) => {
                        let owner = self.connection(&id, &session).unwrap().clone();
                        self.receive_rpc_on(id, b, owner);
                    }
                    Body::DescriptorQuery(q) => {
                        let owner = self.connection(&id, &session).unwrap();
                        let bytes = self
                            .handlers
                            .values()
                            .find(|h| {
                                h.capability
                                    .as_ref()
                                    .is_some_and(|c| c.descriptor_digest == q.digest)
                            })
                            .map(|h| h.descriptor_set.as_slice())
                            .or_else(|| {
                                if Sha256::digest(cyberbus_protocol::FILE_DESCRIPTOR_SET).as_slice()
                                    == q.digest
                                {
                                    Some(cyberbus_protocol::FILE_DESCRIPTOR_SET)
                                } else {
                                    None
                                }
                            });
                        if let Some(bytes) = bytes {
                            let total_size = bytes.len() as u32;
                            for (offset, chunk) in bytes.chunks(16384).enumerate() {
                                let _ = self.send_owned(
                                    &id,
                                    owner,
                                    Body::DescriptorChunk(pb::DescriptorChunk {
                                        query_id: q.query_id.clone(),
                                        digest: q.digest.clone(),
                                        total_size,
                                        offset: (offset * 16384) as u32,
                                        protobuf_bytes: chunk.to_vec(),
                                    }),
                                );
                            }
                        } else {
                            let _ = self.send_owned(
                                &id,
                                owner,
                                Body::DescriptorError(pb::DescriptorError {
                                    query_id: q.query_id,
                                    error: Some(error(
                                        pb::ErrorCode::NotFound,
                                        "descriptor not registered",
                                    )),
                                }),
                            );
                        }
                    }
                    Body::DescriptorChunk(c) => {
                        let key = (id, c.query_id.clone());
                        let Some(p) = self.descriptors.get_mut(&key) else {
                            return;
                        };
                        if !p.owner.session.same_instance(&session) {
                            return;
                        }
                        if p.digest != c.digest
                            || c.offset as usize != p.bytes.len()
                            || c.total_size > 262144
                            || p.total.is_some_and(|n| n != c.total_size)
                            || c.protobuf_bytes.len() > 16384
                            || c.offset as usize + c.protobuf_bytes.len() > c.total_size as usize
                        {
                            let p = self.descriptors.remove(&key).unwrap();
                            self.emit(Event::Descriptor(pb::DescriptorResult {
                                query_id: c.query_id,
                                digest: p.digest,
                                result: Some(pb::descriptor_result::Result::Error(error(
                                    pb::ErrorCode::ProtocolError,
                                    "invalid descriptor fragments",
                                ))),
                            }));
                            return;
                        }
                        p.total = Some(c.total_size);
                        p.bytes.extend_from_slice(&c.protobuf_bytes);
                        if p.bytes.len() == c.total_size as usize {
                            let p = self.descriptors.remove(&key).unwrap();
                            let digest: [u8; 32] =
                                p.digest.as_slice().try_into().unwrap_or([0; 32]);
                            let result = match reassembly::finish_descriptor(&p.bytes, &digest) {
                                Ok(_) => pb::descriptor_result::Result::DescriptorSet(p.bytes),
                                Err(e) => {
                                    pb::descriptor_result::Result::Error(e.to_protocol_error())
                                }
                            };
                            self.emit(Event::Descriptor(pb::DescriptorResult {
                                query_id: c.query_id,
                                digest: p.digest,
                                result: Some(result),
                            }));
                        }
                    }
                    Body::DescriptorError(e) => {
                        if self
                            .descriptors
                            .get(&(id.clone(), e.query_id.clone()))
                            .is_some_and(|p| !p.owner.session.same_instance(&session))
                        {
                            return;
                        }
                        if let Some(p) = self.descriptors.remove(&(id, e.query_id.clone())) {
                            self.emit(Event::Descriptor(pb::DescriptorResult {
                                query_id: e.query_id,
                                digest: p.digest,
                                result: e.error.map(pb::descriptor_result::Result::Error),
                            }));
                        }
                    }
                    Body::Close(_) | Body::Bind(_) | Body::Ready(_) => {
                        if self
                            .peers
                            .get(&id)
                            .is_some_and(|p| p.session.same_instance(&session))
                        {
                            self.drop_business(&id, session::unavailable());
                        } else if let Some(p) = self.probes.remove(&session.id) {
                            p.session.cancel.cancel();
                        }
                    }
                }
            }
        }
    }
    async fn maintenance(&mut self) {
        self.directory_maintenance().await;
        if self.transport.is_some() {
            let _ = self.auth.on_resume();
            if !self.auth.snapshot().network_enabled || self.stop.is_cancelled() {
                self.stop_network().await;
            }
        }
        self.schedule_auth_validation();
        self.drain_auth_ready();
        self.auth_changed(vec![]);
        let t = tokio::time::Instant::now();
        self.data_maintenance();
        for (peer, call_id) in self.calls.expired() {
            self.rpc_failure(
                &peer,
                call_id,
                error(pb::ErrorCode::DeadlineExceeded, "RPC deadline expired"),
            );
        }
        self.rpc_owners.retain(|(peer, call), owner| {
            self.calls.active(peer, call)
                || (self.calls.finished(peer, call) && !owner.send.is_idle())
        });
        let expired: Vec<_> = self
            .descriptors
            .iter()
            .filter(|(_, p)| p.deadline <= t)
            .map(|(k, _)| k.clone())
            .collect();
        for key in expired {
            let p = self.descriptors.remove(&key).unwrap();
            self.emit(Event::Descriptor(pb::DescriptorResult {
                query_id: key.1,
                digest: p.digest,
                result: Some(pb::descriptor_result::Result::Error(error(
                    pb::ErrorCode::DeadlineExceeded,
                    "schema pull expired",
                ))),
            }));
        }
    }
}
fn block_state(s: cyberbus_auth::BlockState) -> pb::DeviceBlockState {
    pb::DeviceBlockState {
        device_id: s.device_id.to_vec(),
        blocked: s.blocked,
        persisted_blocked: s.persisted_blocked,
        persistence_pending: s.persistence_pending,
    }
}
fn block_result(s: cyberbus_auth::BlockState) -> pb::DeviceBlockResult {
    pb::DeviceBlockResult {
        scope: Some(pb::BlockScope {
            issuer: s.account.issuer.clone(),
            subject: s.account.subject.clone(),
            product_id: s.account.product_id.clone(),
        }),
        revision: s.revision,
        state_revision: s.state_revision,
        state: Some(block_state(s)),
    }
}

#[cfg(test)]
mod lifecycle_tests {
    use super::*;
    include!("runtime/stream_budget_tests.rs");
    include!("runtime/profile_tests.rs");
    include!("runtime/handoff_tests.rs");
    const PEER: [u8; 32] = [42; 32];

    fn runtime() -> (Runtime, crate::EventReceiver) {
        let config = ClientConfig::from_json(r#"{"issuer":"https://auth.example.com/oidc","client_id":"native","resource":"https://cyberbus.example/api","product_id":"cyberbus","native_clients":{"native":"cyberbus"},"redirect_uri":"http://127.0.0.1:18765/callback"}"#).unwrap();
        let clock = Arc::new(cyberbus_auth::SystemClock::new().unwrap());
        let auth = AuthManager::new(
            config.auth(),
            Box::new(cyberbus_auth::MemoryStore::default()),
            crate::StoreMode::CreateNew,
            clock.clone(),
        )
        .unwrap();
        let (events, rx) = crate::events::channel();
        let mut runtime =
            Runtime::new(config, auth, events, clock, Arc::new(Mutex::new(None))).unwrap();
        runtime.subscriptions.insert(vec![1; 16], vec![]);
        reopen(&mut runtime, 1);
        (runtime, rx)
    }
    // Control the notification boundary, without OAuth or EasyTier scheduling. This is the
    // same generation/token/gate transition made by start after transport/auth readiness.
    fn reopen(runtime: &mut Runtime, generation: u64) {
        runtime.generation = Some(generation);
        runtime.stop = CancellationToken::new();
        runtime.admission.open.store(true, Ordering::Release);
    }
    fn session(runtime: &Runtime, instance: u8) -> Session {
        Session {
            generation: runtime.generation.unwrap(),
            address_generation: 0,
            business: Arc::new(AtomicBool::new(true)),
            outbound: true,
            id: [instance; 32],
            policy_epoch: runtime.admission.epoch(&PEER).unwrap(),
            cancel: runtime.stop.child_token(),
            progress: Arc::default(),
        }
    }
    fn up(session: &Session) -> (Incoming, session::PeerOutput) {
        let (send, rx) = session::test_channel();
        (
            Incoming::Up {
                id: PEER.to_vec(),
                bind: pb::SessionBind {
                    device_id: PEER.to_vec(),
                    installation_public_key: vec![7; 32],
                    boot_id: vec![8; 16],
                    ..Default::default()
                },
                ip: std::net::Ipv4Addr::new(10, 0, 0, 2),
                send,
                session: session.clone(),
                ready: None,
            },
            rx,
        )
    }
    fn metadata(name: &str) -> Body {
        Body::Metadata(pb::PeerMetadata {
            profile: Some(pb::PublicProfile {
                device_name: name.into(),
                config_semantic_version: "1.0.0".into(),
                config_revision: 1,
                ..Default::default()
            }),
        })
    }
    fn data() -> Body {
        let bytes = crate::example::EchoRequest {
            text: "hello".into(),
        }
        .encode_to_vec();
        let body = pb::DataMessage {
            message_id: vec![9; 16],
            requested_ack: pb::AckStage::Processed as i32,
            timeout: Some(prost_types::Duration {
                seconds: 30,
                nanos: 0,
            }),
            fragment: Some(pb::PayloadFragment {
                application_type_url: "type.googleapis.com/cyberbus.example.v1.EchoRequest".into(),
                encoding: pb::PayloadEncoding::ProtobufMessage as i32,
                total_size: bytes.len() as u32,
                protobuf_bytes: bytes,
                offset: 0,
            }),
            ..Default::default()
        };
        codec::encode(&body).expect("valid application data fixture");
        Body::Data(body)
    }
    fn queue(runtime: &Runtime, session: &Session, body: Body) {
        runtime
            .incoming
            .try_send(Incoming::Frame {
                id: PEER.to_vec(),
                session: session.clone(),
                body,
            })
            .unwrap();
    }
    async fn drain(runtime: &mut Runtime) {
        while let Ok(notification) = runtime.inbox.try_recv() {
            runtime.receive(notification).await;
        }
    }
    fn received(events: &mut crate::EventReceiver) -> usize {
        let mut count = 0;
        while let Ok(event) = events.try_recv() {
            if matches!(event.body, Some(Event::DataReceived(_))) {
                count += 1;
            }
        }
        count
    }

    #[tokio::test]
    async fn queued_up_metadata_data_cannot_cross_stop_restart() {
        let (mut runtime, mut events) = runtime();
        let old = session(&runtime, 1);
        let (notification, _old_output) = up(&old);
        runtime.incoming.try_send(notification).unwrap();
        queue(&runtime, &old, metadata("stopped"));
        queue(&runtime, &old, data());
        // Commands win the select before any queued notification is received.
        runtime.stop_network().await;
        assert!(old.cancel.is_cancelled());
        assert!(runtime.inbox.is_empty(), "stop must fence the queued inbox");
        reopen(&mut runtime, 2);
        // Also cover producers completing their send after the stop-time drain.
        let (late, _late_output) = up(&old);
        runtime.incoming.try_send(late).unwrap();
        queue(&runtime, &old, metadata("stopped"));
        queue(&runtime, &old, data());
        // An uncancelled old generation must be rejected independently of cancellation.
        let stale = Session {
            cancel: CancellationToken::new(),
            ..old.clone()
        };
        let (late, _stale_output) = up(&stale);
        runtime.incoming.try_send(late).unwrap();
        drain(&mut runtime).await;
        assert!(stale.cancel.is_cancelled());
        assert!(runtime.peers.is_empty());
        assert!(!runtime.devices.contains_key(PEER.as_slice()));
        assert!(runtime.receiving.is_empty());
        assert_eq!(received(&mut events), 0);

        let cancelled = session(&runtime, 3);
        cancelled.cancel.cancel();
        let (notification, _cancelled_output) = up(&cancelled);
        runtime.receive(notification).await;
        assert!(
            runtime.peers.is_empty(),
            "cancelled current-generation Up must be rejected"
        );

        let fresh = session(&runtime, 2);
        let (notification, mut output) = up(&fresh);
        runtime.incoming.try_send(notification).unwrap();
        queue(&runtime, &old, metadata("old after fresh Up"));
        queue(&runtime, &old, data());
        let wrong_generation = Session {
            generation: 1,
            ..fresh.clone()
        };
        queue(
            &runtime,
            &wrong_generation,
            metadata("old generation, same session ID"),
        );
        queue(&runtime, &wrong_generation, data());
        drain(&mut runtime).await;
        assert!(!runtime.devices.contains_key(PEER.as_slice()));
        assert!(runtime.receiving.is_empty());
        assert_eq!(received(&mut events), 0);
        queue(&runtime, &fresh, metadata("fresh"));
        queue(&runtime, &fresh, data());
        drain(&mut runtime).await;
        assert!(!fresh.cancel.is_cancelled());
        assert_eq!(
            runtime.devices[PEER.as_slice()]
                .profile
                .as_ref()
                .unwrap()
                .device_name,
            "fresh"
        );
        assert_eq!(received(&mut events), 1);
        assert!(
            matches!(output.try_recv().unwrap(), Body::DataAck(a) if a.stage == pb::AckStage::Received as i32)
        );
        assert!(
            matches!(output.try_recv().unwrap(), Body::DataAck(a) if a.stage == pb::AckStage::Accepted as i32)
        );
        assert!(matches!(output.try_recv().unwrap(), Body::Metadata(_)));
        assert!(output.try_recv().is_err());
    }

    #[tokio::test]
    async fn old_frames_and_down_cannot_impersonate_replacement_session() {
        let (mut runtime, mut events) = runtime();
        let old = session(&runtime, 1);
        let (notification, _old_output) = up(&old);
        runtime.receive(notification).await;
        runtime
            .receive(Incoming::Down {
                id: PEER.to_vec(),
                session: old.clone(),
            })
            .await;
        let fresh = session(&runtime, 2);
        let (notification, _fresh_output) = up(&fresh);
        runtime.receive(notification).await;
        assert!(
            old.cancel.is_cancelled(),
            "Down now performs ordered owner revocation"
        );
        let old = Session {
            cancel: CancellationToken::new(),
            ..old
        };
        // Leave the old token live so identity, not cancellation, must reject these frames.
        assert!(!old.cancel.is_cancelled());
        queue(&runtime, &old, metadata("old"));
        queue(&runtime, &old, data());
        drain(&mut runtime).await;
        assert!(!runtime.devices.contains_key(PEER.as_slice()));
        assert_eq!(received(&mut events), 0);
        queue(&runtime, &fresh, metadata("replacement"));
        queue(&runtime, &fresh, data());
        drain(&mut runtime).await;
        assert_eq!(received(&mut events), 1);
        // The previous Down test compared only two cancelled tokens; both can be cancelled.
        old.cancel.cancel();
        fresh.cancel.cancel();
        runtime
            .receive(Incoming::Down {
                id: PEER.to_vec(),
                session: old,
            })
            .await;
        assert!(runtime.peers[PEER.as_slice()].session.same_instance(&fresh));
        runtime
            .receive(Incoming::Down {
                id: PEER.to_vec(),
                session: fresh,
            })
            .await;
        assert!(runtime.peers.is_empty());
    }

    #[tokio::test]
    async fn block_unblock_cannot_revive_pending_up_or_cancelled_frames() {
        let (mut runtime, mut events) = runtime();
        let old = session(&runtime, 1);
        let pending = session(&runtime, 2);
        let (notification, _old_output) = up(&old);
        runtime.receive(notification).await;
        let (notification, _pending_output) = up(&pending);
        runtime.incoming.try_send(notification).unwrap();
        queue(&runtime, &old, metadata("blocked"));
        queue(&runtime, &old, data());
        // Exercise the immediate native policy/cancellation boundary used by block, then
        // successful unblock. No account or successful OAuth result is injected here.
        runtime.admission.policy.lock().unwrap().deny(PEER.to_vec());
        runtime
            .peers
            .remove(PEER.as_slice())
            .unwrap()
            .session
            .cancel
            .cancel();
        runtime
            .admission
            .policy
            .lock()
            .unwrap()
            .blocked
            .remove(PEER.as_slice());
        assert!(!pending.cancel.is_cancelled());
        drain(&mut runtime).await;
        assert!(
            pending.cancel.is_cancelled(),
            "queued Up must retain its pre-block policy epoch"
        );
        assert!(runtime.peers.is_empty());
        assert!(!runtime.devices.contains_key(PEER.as_slice()));
        assert_eq!(received(&mut events), 0);
        let fresh = session(&runtime, 3);
        let (notification, _fresh_output) = up(&fresh);
        runtime.receive(notification).await;
        queue(&runtime, &old, data());
        queue(&runtime, &fresh, metadata("unblocked"));
        queue(&runtime, &fresh, data());
        drain(&mut runtime).await;
        assert_eq!(received(&mut events), 1);
        // A cancelled current-session frame also stays fenced after the gate reopens.
        fresh.cancel.cancel();
        queue(&runtime, &fresh, metadata("cancelled"));
        drain(&mut runtime).await;
        assert_eq!(
            runtime.devices[PEER.as_slice()]
                .profile
                .as_ref()
                .unwrap()
                .device_name,
            "unblocked"
        );
    }
    #[tokio::test]
    async fn excluded_local_cancels_old_probes_and_stays_self_only() {
        let (mut runtime, _events) = runtime();
        let old_local = runtime.local().to_vec();
        let mut diagnostic = runtime.devices.remove(&old_local).unwrap();
        diagnostic.device_id = vec![255; 32];
        runtime.admission = Arc::new(Admission {
            open: AtomicBool::new(true),
            policy: Mutex::new(Default::default()),
            local: diagnostic.device_id.clone(),
            output_budget: session::OutputBudget::default(),
            metrics: Default::default(),
        });
        runtime
            .devices
            .insert(diagnostic.device_id.clone(), diagnostic);
        let one = session(&runtime, 1);
        let two = session(&runtime, 2);
        one.business.store(false, Ordering::Release);
        two.business.store(false, Ordering::Release);
        let (notification, _first_output) = up(&one);
        runtime.receive(notification).await;
        let (notification, _second_output) = up(&two);
        runtime.receive(notification).await;
        assert_eq!(runtime.probes.len(), 2);
        for n in 0..256u16 {
            let mut id = vec![0; 32];
            id[30..].copy_from_slice(&n.to_be_bytes());
            runtime
                .evidence
                .candidate(&id, tokio::time::Instant::now())
                .unwrap();
        }
        runtime.capacity();
        assert!(runtime.capacity_excluded);
        assert!(one.cancel.is_cancelled() && two.cancel.is_cancelled());
        assert!(runtime.probes.is_empty());
        runtime
            .receive(Incoming::Frame {
                id: PEER.to_vec(),
                session: one,
                body: metadata("late"),
            })
            .await;
        assert_eq!(runtime.devices.len(), 1);
        let diagnostic = &runtime.devices[runtime.local()];
        assert!(diagnostic.is_local);
        assert_eq!(diagnostic.presence, pb::DevicePresence::Offline as i32);
    }
    #[tokio::test]
    async fn twenty_real_noise_identities_are_independent_of_sixteen_business_sessions() {
        let (mut runtime, _events) = runtime();
        let Body::Metadata(m) = metadata("local") else {
            unreachable!()
        };
        let local = runtime.local().to_vec();
        runtime.devices.get_mut(&local).unwrap().profile = m.profile;
        let keys = Arc::new(Keys {
            private: Zeroizing::new(runtime.auth.identity().with_private_key(|k| *k)),
            psk: Zeroizing::new([9; 32]),
            binding: [8; 32],
            boot: *runtime.auth.identity().boot_id(),
        });
        let mut clients = Vec::new();
        let mut tasks = Vec::new();
        let mut authenticated = Vec::new();
        for n in 1..=20u8 {
            let (a, b) = tokio::io::duplex(128 * 1024);
            tasks.push(tokio::spawn(session::handshake(
                Box::new(a),
                std::net::Ipv4Addr::new(10, 144, 0, n),
                false,
                keys.clone(),
                runtime.admission.clone(),
                runtime.incoming.clone(),
                runtime.stop.clone(),
                1,
                0,
                false,
                None,
            )));
            let mut client = noise::connect(
                b,
                noise::NoiseConfig::new([n; 32], [9; 32], [8; 32], "1", [n; 16]),
                |_| Ok(()),
            )
            .await
            .unwrap();
            let up = runtime.inbox.recv().await.unwrap();
            let Incoming::Up { id, session, .. } = &up else {
                panic!()
            };
            let (id, session) = (id.clone(), session.clone());
            runtime.receive(up).await;
            client.send(metadata(&format!("peer-{n}"))).await.unwrap();
            loop {
                let notification = runtime.inbox.recv().await.unwrap();
                runtime.receive(notification).await;
                if runtime.devices.contains_key(&id) {
                    break;
                }
            }
            assert!(matches!(
                client.recv().await.unwrap().body,
                Some(Body::Metadata(_))
            ));
            authenticated.push((id, session));
            clients.push(client);
        }
        assert_eq!(runtime.devices.len(), 21);
        assert_eq!(runtime.peers.len(), 0);
        assert_eq!(runtime.probes.len(), 20);
        for (id, session) in &authenticated {
            runtime.promote(id, session).unwrap();
            assert!(runtime.business_streams() <= 16);
        }
        assert_eq!(runtime.peers.len(), 16);
        assert_eq!(runtime.devices.len(), 21);
        assert!(authenticated[..4]
            .iter()
            .all(|(_, s)| s.cancel.is_cancelled()));
        runtime.stop.cancel();
        for t in tasks {
            let _ = t.await;
        }
        drop(clients);
    }
    #[tokio::test]
    async fn clone_requires_two_fresh_matching_challenges_not_cached_boot_ids() {
        let (mut runtime, mut events) = runtime();
        let first = session(&runtime, 1);
        let (notification, mut first_output) = up(&first);
        runtime.receive(notification).await;
        let second = session(&runtime, 2);
        let (mut next, mut second_output) = up(&second);
        if let Incoming::Up { bind, session, .. } = &mut next {
            bind.boot_id = vec![9; 16];
            session.business.store(false, Ordering::Release);
        }
        runtime.receive(next).await;
        assert!(!runtime.evidence.quarantined.contains(PEER.as_slice()));
        let mut nonces = Vec::new();
        for output in [&mut first_output, &mut second_output] {
            while let Ok(body) = output.try_recv() {
                if let Body::Ping(p) = body {
                    nonces.push(p.nonce);
                }
            }
        }
        assert_eq!(nonces.len(), 2);
        runtime
            .receive(Incoming::Frame {
                id: PEER.to_vec(),
                session: first.clone(),
                body: Body::Pong(pb::Pong { nonce: vec![0; 16] }),
            })
            .await;
        runtime
            .receive(Incoming::Frame {
                id: PEER.to_vec(),
                session: second.clone(),
                body: Body::Pong(pb::Pong {
                    nonce: nonces[1].clone(),
                }),
            })
            .await;
        assert!(!runtime.evidence.quarantined.contains(PEER.as_slice()));
        runtime
            .receive(Incoming::Frame {
                id: PEER.to_vec(),
                session: first.clone(),
                body: Body::Pong(pb::Pong {
                    nonce: nonces[0].clone(),
                }),
            })
            .await;
        assert!(runtime.evidence.quarantined.contains(PEER.as_slice()));
        assert!(first.cancel.is_cancelled());
        assert!(second.cancel.is_cancelled());
        assert!(std::iter::from_fn(||events.try_recv().ok()).any(|e|matches!(e.body,Some(Event::Network(n)) if n.error.as_ref().is_some_and(|e|e.code==pb::ErrorCode::DuplicateDeviceId as i32))));
    }
    #[tokio::test]
    async fn offline_requires_real_cross_round_failures_and_retains_ten_minutes() {
        let (mut runtime, _) = runtime();
        let first = session(&runtime, 1);
        let (up, _out) = up(&first);
        runtime.receive(up).await;
        runtime
            .receive(Incoming::Frame {
                id: PEER.to_vec(),
                session: first,
                body: metadata("peer"),
            })
            .await;
        let t = tokio::time::Instant::now();
        let h = runtime.evidence.health.get_mut(PEER.as_slice()).unwrap();
        h.last = t - Duration::from_secs(181);
        h.fail(1);
        h.fail(1);
        h.fail(2);
        // No local overlay: the same failure evidence must never turn everybody offline.
        runtime.directory_maintenance().await;
        assert_eq!(
            runtime.devices[PEER.as_slice()].presence,
            pb::DevicePresence::Online as i32
        );
        let h = runtime.evidence.health.get_mut(PEER.as_slice()).unwrap();
        assert!(h.should_offline(t));
        h.offline = Some(t - Duration::from_secs(599));
        runtime.directory_maintenance().await;
        assert!(runtime.devices.contains_key(PEER.as_slice()));
        runtime
            .evidence
            .health
            .get_mut(PEER.as_slice())
            .unwrap()
            .offline = Some(t - Duration::from_secs(601));
        runtime.directory_maintenance().await;
        assert!(!runtime.devices.contains_key(PEER.as_slice()));
    }
    #[tokio::test]
    async fn simultaneous_business_streams_do_not_cancel_first_data_or_pending_acks() {
        let (mut runtime, mut events) = runtime();
        let first = session(&runtime, 1);
        let (notification, mut first_output) = up(&first);
        runtime.receive(notification).await;
        let Body::Data(message) = data() else {
            unreachable!()
        };
        runtime
            .dispatch_data(pb::sdk_command::Body::Send(pb::Send {
                peer_device_id: PEER.to_vec(),
                message: Some(message),
            }))
            .await
            .unwrap();
        let second = session(&runtime, 2);
        let (notification, mut second_output) = up(&second);
        runtime.receive(notification).await;
        assert!(!first.cancel.is_cancelled());
        assert!(
            !second.cancel.is_cancelled(),
            "crossed stream must remain readable"
        );
        queue(&runtime, &second, data());
        drain(&mut runtime).await;
        assert_eq!(received(&mut events), 1);
        assert!(runtime.pending.contains_key(&(PEER.to_vec(), vec![9; 16])));
        assert!(!std::iter::from_fn(|| first_output.try_recv().ok())
            .any(|b| matches!(b, Body::DataAck(_))));
        assert!(std::iter::from_fn(|| second_output.try_recv().ok())
            .any(|b| matches!(b, Body::DataAck(a) if a.stage == 2)));
        // A repeated payload on the other authenticated stream is still deduplicated.
        queue(&runtime, &first, data());
        drain(&mut runtime).await;
        assert_eq!(received(&mut events), 0);
        runtime.drop_business(&PEER, session::unavailable());
        assert!(first.cancel.is_cancelled() && second.cancel.is_cancelled());
    }

    #[tokio::test]
    async fn outbound_noise_up_precedes_frames_and_acknowledges_owner_installation() {
        let (mut runtime, mut events) = runtime();
        let Body::Metadata(profile) = metadata("local") else {
            unreachable!()
        };
        let local = runtime.local().to_vec();
        runtime.devices.get_mut(&local).unwrap().profile = profile.profile;
        let keys = Arc::new(Keys {
            private: Zeroizing::new(runtime.auth.identity().with_private_key(|k| *k)),
            psk: Zeroizing::new([9; 32]),
            binding: [8; 32],
            boot: *runtime.auth.identity().boot_id(),
        });
        let (a, b) = tokio::io::duplex(128 * 1024);
        let (ready, mut installed) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(session::handshake(
            Box::new(a),
            std::net::Ipv4Addr::new(10, 0, 0, 2),
            true,
            keys,
            runtime.admission.clone(),
            runtime.incoming.clone(),
            runtime.stop.clone(),
            1,
            0,
            true,
            Some(session::BusinessReady {
                deadline: tokio::time::Instant::now() + Duration::from_secs(2),
                expected: noise::device_id(&noise::static_public_key(&[42; 32]).unwrap()).to_vec(),
                reply: ready,
            }),
        ));
        let mut remote = noise::accept(
            b,
            noise::NoiseConfig::new([42; 32], [9; 32], [8; 32], "1", [8; 16]),
            |_| Ok(()),
        )
        .await
        .unwrap();
        remote.send(data()).await.unwrap();
        let notification = runtime.inbox.recv().await.unwrap();
        let Incoming::Up { id, .. } = &notification else {
            panic!("Up must arrive first")
        };
        let id = id.clone();
        assert!(matches!(
            installed.try_recv(),
            Err(tokio::sync::oneshot::error::TryRecvError::Empty)
        ));
        runtime.receive(notification).await;
        installed.await.unwrap().unwrap();
        assert!(runtime.peers.contains_key(&id));
        let frame = runtime.inbox.recv().await.unwrap();
        assert!(matches!(
            &frame,
            Incoming::Frame {
                body: Body::Data(_),
                ..
            }
        ));
        runtime.receive(frame).await;
        assert_eq!(received(&mut events), 1);
        runtime.stop.cancel();
        task.await.unwrap();
    }

    #[tokio::test]
    async fn business_acquisition_rejects_wrong_identity_before_installing_up() {
        let (mut runtime, _) = runtime();
        let session = session(&runtime, 1);
        let (mut notification, _output) = up(&session);
        let (reply, installed) = tokio::sync::oneshot::channel();
        if let Incoming::Up { ready, .. } = &mut notification {
            *ready = Some(session::BusinessReady {
                deadline: tokio::time::Instant::now() + Duration::from_secs(2),
                expected: vec![99; 32],
                reply,
            });
        }
        runtime.receive(notification).await;
        assert_eq!(
            installed.await.unwrap().unwrap_err().code,
            pb::ErrorCode::Conflict as i32
        );
        assert!(session.cancel.is_cancelled());
        assert!(runtime.peers.is_empty() && runtime.probes.is_empty());
    }
}
