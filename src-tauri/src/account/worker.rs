//! Directory owns transport registration, not the lifecycle command lock.
//! Content is an independently cancellable child, absent while paused.
use super::{
    directory, enrollment, private, transport,
    types::{Error, Result, TransferDirection},
    Runtime,
};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, Weak,
    },
    time::Duration,
};
use tokio::sync::{mpsc, oneshot, Notify};
use tokio_util::sync::CancellationToken;

pub(super) struct DeviceRequest {
    pub target: directory::Row,
    pub direction: TransferDirection,
    pub epoch: u64,
    pub _permit: OperationPermit,
    pub cancellation: Arc<RequestCancellation>,
    pub owner: Weak<Runtime>,
    pub generation: u64,
    pub operation_id: uuid::Uuid,
    pub done: oneshot::Sender<Result<()>>,
}
impl DeviceRequest {
    pub fn complete(self, outcome: Result<()>) {
        let mut outcome = self.cancellation.outcome(outcome);
        if self
            ._permit
            .control
            .upgrade()
            .is_some_and(|c| !c.current(self.epoch))
        {
            outcome = Err(Error::Cancelled);
        }
        if let Some(owner) = self.owner.upgrade() {
            owner.finish_device_operation(self.generation, self.operation_id, outcome);
        }
        // Receipt is emitted only after all execution and retirement have ended.
        let _ = self.done.send(outcome);
    }
}
pub(super) struct RequestCancellation {
    pub stop: CancellationToken,
    pub admission_stop: CancellationToken,
    deadline: tokio::time::Instant,
    deadline_expired: AtomicBool,
    progress: Mutex<Option<crate::sync::network::ProgressObserver>>,
}
impl Default for RequestCancellation {
    fn default() -> Self {
        // Includes mapping/pairing, the finite transfer, and confirmed retirement.
        Self::new(Duration::from_secs(23 * 60))
    }
}
impl RequestCancellation {
    pub fn deadline(&self) -> tokio::time::Instant {
        self.deadline
    }
    pub fn new(budget: Duration) -> Self {
        Self {
            stop: CancellationToken::new(),
            admission_stop: CancellationToken::new(),
            deadline: tokio::time::Instant::now() + budget,
            deadline_expired: Default::default(),
            progress: Mutex::new(None),
        }
    }
    pub fn observe_progress(&self, observer: crate::sync::network::ProgressObserver) {
        if let Ok(mut slot) = self.progress.lock() {
            *slot = Some(observer);
        }
    }
    pub fn progress_observer(&self) -> Option<crate::sync::network::ProgressObserver> {
        self.progress.lock().ok().and_then(|slot| slot.clone())
    }
    pub fn report_stage(&self, stage: crate::sync::network::ProgressStage) {
        if let Some(observer) = self.progress_observer() {
            observer(crate::sync::network::TransferProgress {
                stage,
                ..Default::default()
            });
        }
    }
    fn expire(&self) {
        self.deadline_expired.store(true, Ordering::Release);
        self.stop.cancel();
    }
    pub fn outcome(&self, outcome: Result<()>) -> Result<()> {
        if tokio::time::Instant::now() >= self.deadline {
            self.expire();
        }
        if self.deadline_expired.load(Ordering::Acquire) {
            Err(Error::Deadline)
        } else if self.stop.is_cancelled() {
            Err(Error::Cancelled)
        } else {
            outcome
        }
    }
}
struct CancelWaiter(Arc<RequestCancellation>);
impl Drop for CancelWaiter {
    fn drop(&mut self) {
        self.0.stop.cancel();
    }
}
pub(super) async fn wait_request(
    mut receiver: oneshot::Receiver<Result<()>>,
    cancellation: Arc<RequestCancellation>,
) -> Result<()> {
    let _waiter = CancelWaiter(cancellation.clone());
    let result = match tokio::time::timeout_at(cancellation.deadline, &mut receiver).await {
        Ok(result) => result,
        Err(_) => {
            cancellation.expire();
            // Timeout requests cancellation; it is not proof of retirement.
            // Keep waiting for the work-owned receipt before publishing terminal UI.
            receiver.await
        }
    };
    cancellation.outcome(result.unwrap_or(Err(Error::Cancelled)))
}
pub(super) async fn execute_request<Fut>(
    cancellation: &RequestCancellation,
    stop: &CancellationToken,
    work: std::pin::Pin<Box<Fut>>,
) -> Result<()>
where
    Fut: std::future::Future<Output = Result<()>>,
{
    if cancellation.outcome(Ok(())).is_err() || stop.is_cancelled() {
        return Err(Error::Cancelled);
    }
    // Require a heap boundary at the call site: pinning an inline generic
    // future here would still embed it in this async function's state.
    let mut future = work;
    let result = tokio::select! {
        biased;
        _=cancellation.stop.cancelled()=>{
            stop.cancel();
            let _ = future.await;
            Err(Error::Cancelled)
        },
        result=&mut future=>result,
    };
    cancellation.outcome(result)
}
pub(super) struct OperationPermit {
    control: Weak<Control>,
    epoch: u64,
}
impl Drop for OperationPermit {
    fn drop(&mut self) {
        if let Some(control) = self.control.upgrade() {
            if let Ok(mut state) = control.state.lock() {
                if state.epoch == self.epoch {
                    state.operation = false;
                    state.operation_cancellation = None;
                }
                control.changed.notify_waiters();
            };
        }
    }
}
#[derive(Default)]
struct State {
    epoch: u64,
    children: usize,
    enabled: bool,
    ready: bool,
    operation: bool,
    operation_cancellation: Option<Arc<RequestCancellation>>,
    stop: Option<CancellationToken>,
    gate: Option<Arc<enrollment::Gate>>,
}
#[derive(Default)]
pub(super) struct Control {
    state: Mutex<State>,
    changed: Notify,
    pub refresh: Notify,
}
impl Control {
    pub fn configure(&self, enabled: bool) {
        let retired = if let Ok(mut state) = self.state.lock() {
            state.epoch += 1;
            state.enabled = enabled;
            state.ready = false;
            state.operation = false;
            Some((
                state.gate.take(),
                state.stop.take(),
                state.operation_cancellation.take(),
            ))
        } else {
            None
        };
        // Gate authorization calls back into current(); never invert those locks.
        if let Some((gate, stop, operation)) = retired {
            if let Some(operation) = operation {
                operation.stop.cancel();
            }
            if let Some(gate) = gate {
                gate.close();
            }
            if let Some(stop) = stop {
                stop.cancel();
            }
        }
        self.changed.notify_one();
        self.refresh.notify_one();
    }
    fn intent(&self) -> Result<(u64, bool)> {
        let state = self.state.lock().map_err(|_| Error::Storage)?;
        Ok((state.epoch, state.enabled))
    }
    pub fn epoch(&self) -> Result<u64> {
        Ok(self.intent()?.0)
    }
    pub fn reserve(
        self: &Arc<Self>,
        epoch: u64,
        cancellation: &Arc<RequestCancellation>,
    ) -> Result<OperationPermit> {
        let mut state = self.state.lock().map_err(|_| Error::Storage)?;
        if state.epoch != epoch || !state.enabled || !state.ready {
            return Err(Error::SyncNotEnabled);
        }
        if state.operation {
            return Err(Error::Busy);
        }
        state.operation = true;
        state.operation_cancellation = Some(cancellation.clone());
        Ok(OperationPermit {
            control: Arc::downgrade(self),
            epoch,
        })
    }
    pub fn current(&self, epoch: u64) -> bool {
        self.state
            .lock()
            .is_ok_and(|s| s.epoch == epoch && s.enabled)
    }
    pub fn busy(&self) -> bool {
        self.state.lock().is_ok_and(|s| s.operation)
    }
    pub(super) fn authorized(&self, epoch: u64) -> bool {
        self.state.lock().is_ok_and(|s| {
            s.epoch == epoch
                && s.enabled
                && s.operation_cancellation
                    .as_ref()
                    .is_none_or(|cancellation| {
                        !cancellation.admission_stop.is_cancelled()
                            && cancellation.outcome(Ok(())).is_ok()
                    })
        })
    }
    pub fn ready(&self) -> bool {
        let gate = self
            .state
            .lock()
            .ok()
            .and_then(|s| (s.ready && s.enabled).then(|| s.gate.clone()).flatten());
        gate.is_some_and(|gate| gate.is_current())
    }
    pub fn mark_ready(&self, epoch: u64) {
        if let Ok(mut s) = self.state.lock() {
            if s.epoch == epoch && s.enabled {
                s.ready = true;
            }
        }
        self.refresh.notify_one();
    }
    pub(super) fn attach(
        &self,
        epoch: u64,
        stop: CancellationToken,
        gate: Arc<enrollment::Gate>,
    ) -> bool {
        if let Ok(mut s) = self.state.lock() {
            if s.epoch == epoch && s.enabled {
                s.children += 1;
                s.stop = Some(stop);
                s.gate = Some(gate);
                return true;
            }
        }
        false
    }
    fn finished(&self, epoch: u64) {
        let gate = self.state.lock().ok().and_then(|mut s| {
            s.children = s.children.saturating_sub(1);
            if s.epoch == epoch {
                s.ready = false;
                s.gate.take()
            } else {
                None
            }
        });
        if let Some(gate) = gate {
            gate.close();
        }
        self.changed.notify_waiters();
        self.refresh.notify_one();
    }
    pub async fn wait_retired(&self) -> Result<()> {
        loop {
            let changed = self.changed.notified();
            if self.state.lock().map_err(|_| Error::Storage)?.children == 0 {
                return Ok(());
            }
            changed.await;
        }
    }
    pub async fn cancel_operation(&self) -> Result<()> {
        if let Some(cancel) = self
            .state
            .lock()
            .map_err(|_| Error::Storage)?
            .operation_cancellation
            .clone()
        {
            cancel.stop.cancel();
        }
        loop {
            let changed = self.changed.notified();
            if !self.busy() {
                return Ok(());
            }
            changed.await;
        }
    }
}

use notes_cyberbus::{pb, Bus, Snapshot};
use pb::sdk_command::Body as C;

pub(super) fn authenticated(snapshot: &Snapshot, binding: &private::Binding) -> bool {
    if snapshot.closed {
        return false;
    }
    snapshot.auth.as_ref().is_some_and(|a| {
        a.phase == pb::AuthPhase::Authenticated as i32
            && !a.reauth_required
            && !a.security_state_persistence_pending
            && a.account.as_ref().is_some_and(|o| {
                o.issuer == binding.issuer
                    && o.subject == binding.subject
                    && o.product_id == binding.product_id
            })
            && a.validation_lease_expires_at.as_ref().is_some_and(|t| {
                t.seconds >= 0
                    && (0..1_000_000_000).contains(&t.nanos)
                    && std::time::Duration::new(t.seconds as u64, t.nanos as u32)
                        > std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or(Duration::MAX)
            })
    })
}
pub(super) fn available(snapshot: &Snapshot, binding: &private::Binding) -> bool {
    authenticated(snapshot, binding)
        && snapshot.directory_valid
        && snapshot
            .network
            .as_ref()
            .is_some_and(|n| n.running && n.reachable && n.error.is_none())
}
pub(super) fn profile(device: &pb::DeviceSnapshot) -> Result<directory::NotesProfile> {
    let profile = device.profile.as_ref().ok_or(Error::DeviceIncompatible)?;
    let any = profile
        .public_config
        .as_ref()
        .filter(|a| a.type_url == directory::PROFILE_TYPE)
        .ok_or(Error::DeviceIncompatible)?;
    if profile.config_semantic_version != "1.0.0"
        || private::device_name(&profile.device_name).is_ok_and(|n| n != profile.device_name)
        || private::device_name(&profile.device_name).is_err()
    {
        return Err(Error::DeviceIncompatible);
    }
    directory::NotesProfile::decode(&any.value)
}
pub(super) fn peer_bound(
    bus: &Bus,
    binding: &private::Binding,
    generation: u64,
    peer: &[u8; 32],
    device: &str,
    key: &str,
) -> bool {
    let s = bus.snapshot();
    s.generation == generation
        && available(&s, binding)
        && s.devices.devices.iter().any(|d| {
            !d.is_local
                && d.device_id.as_slice() == peer
                && d.presence == pb::DevicePresence::Online as i32
                && d.last_authenticated_at.is_some()
                && profile(d).is_ok_and(|p| {
                    p.sync_available
                        && p.protocol_device_id.as_deref() == Some(device)
                        && p.noise_public_key.as_deref() == Some(key)
                })
        })
}
fn update_catalog(
    snapshot: &Snapshot,
    catalog: &directory::Catalog,
    binding: &private::Binding,
) -> Result<()> {
    if !available(snapshot, binding) {
        catalog.clear();
        return Ok(());
    }
    let mut rows = vec![];
    let mut roster = vec![];
    for d in &snapshot.devices.devices {
        let Ok(p) = profile(d) else { continue };
        let peer: [u8; 32] = d
            .device_id
            .as_slice()
            .try_into()
            .map_err(|_| Error::DeviceIncompatible)?;
        // SDK-authenticated metadata only; an unknown/offline profile is never
        // accepted as a fresh roster publisher.
        if !d.is_local && d.last_authenticated_at.is_none() {
            continue;
        }
        let online = d.presence == pb::DevicePresence::Online as i32;
        if online {
            roster.extend(p.known_devices);
        }
        rows.push(directory::Row {
            id: p.registry_id,
            name: d
                .profile
                .as_ref()
                .ok_or(Error::DeviceIncompatible)?
                .device_name
                .clone(),
            peer,
            online,
            protocol_device_id: p.protocol_device_id,
            noise_public_key: p.noise_public_key,
            sync_available: p.sync_available && online,
            summary: p.summary,
        });
    }
    catalog.replace(rows, roster)
}
async fn publish(
    owner: &Arc<Runtime>,
    bus: &Bus,
    binding: &private::Binding,
    catalog: &directory::Catalog,
    ready: bool,
    last: &mut Option<(String, Vec<u8>)>,
    revision: &mut u64,
) -> Result<()> {
    let registry = owner.registry()?;
    let p = directory::NotesProfile {
        schema_version: 1,
        registry_id: registry.registry_device_id,
        protocol_device_id: Some(binding.device_id.clone()),
        noise_public_key: Some(binding.noise_public_key.clone()),
        sync_available: ready,
        summary: if ready {
            Some(owner.sync.account_summary()?)
        } else {
            None
        },
        known_devices: catalog.roster()?,
    };
    let bytes = p.encode_with_roster_budget()?;
    if last
        .as_ref()
        .is_some_and(|v| v.0 == registry.name && v.1 == bytes)
    {
        return Ok(());
    }
    let local_revision = bus
        .snapshot()
        .devices
        .devices
        .iter()
        .find(|d| d.is_local)
        .and_then(|d| d.profile.as_ref())
        .map_or(0, |p| p.config_revision);
    *revision = (*revision).max(local_revision);
    let result = bus
        .cmd(C::UpdatePublicProfile(pb::UpdatePublicProfile {
            profile: Some(pb::PublicProfile {
                device_name: registry.name.clone(),
                public_config: Some(notes_cyberbus::Any {
                    type_url: directory::PROFILE_TYPE.into(),
                    value: bytes.clone(),
                }),
                config_semantic_version: "1.0.0".into(),
                ..Default::default()
            }),
            expected_revision: *revision,
            update_mask: Some(prost_types::FieldMask {
                paths: vec![
                    "device_name".into(),
                    "public_config".into(),
                    "config_semantic_version".into(),
                ],
            }),
        }))
        .await?;
    let Some(pb::sdk_result::Body::PublicProfile(published)) = result.body else {
        return Err(Error::CoordinationProtocol);
    };
    *revision = published.config_revision;
    *last = Some((registry.name, bytes));
    Ok(())
}
pub(super) async fn run(
    owner: Weak<Runtime>,
    generation: u64,
    binding: private::Binding,
    bus: Bus,
    control: Arc<Control>,
    catalog: Arc<directory::Catalog>,
    stop: CancellationToken,
    requests: mpsc::Receiver<DeviceRequest>,
) -> Result<()> {
    let requests = Arc::new(tokio::sync::Mutex::new(requests));
    let mut watch = bus.watch();
    let mut child: Option<(
        CancellationToken,
        tokio::task::JoinHandle<Result<()>>,
        u64,
        u64,
    )> = None;
    let mut last = None;
    let mut revision = 0;
    let mut tick = tokio::time::interval(Duration::from_secs(1));
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let result = async {
        loop {
            let owner = owner.upgrade().ok_or(Error::Cancelled)?;
            if stop.is_cancelled() || !owner.current(generation) {
                break Ok(());
            }
            let s = bus.snapshot();
            let (epoch, enabled) = control.intent()?;
            let valid = available(&s, &binding);
            if child.as_ref().is_some_and(|(_, task, e, g)| {
                !valid || !enabled || *e != epoch || *g != s.generation || task.is_finished()
            }) {
                let (cancel, task, old_epoch, _) = child.take().ok_or(Error::Sync)?;
                cancel.cancel();
                let outcome = task.await.map_err(|_| Error::Sync)?;
                control.finished(old_epoch);
                if let Err(error) = outcome {
                    if error != Error::Cancelled {
                        return Err(error);
                    }
                }
            }
            if let Err(error) = update_catalog(&s, &catalog, &binding) {
                catalog.clear();
                return Err(error);
            }
            if child.is_none() && enabled && valid {
                let gate = Arc::new(enrollment::Gate::default());
                let content_stop = stop.child_token();
                let active_stop = content_stop.clone();
                let weak = Arc::downgrade(&owner);
                let active_control = control.clone();
                let active_bus = bus.clone();
                let active_binding = binding.clone();
                let bus_generation = s.generation;
                gate.bind_lifecycle(Arc::new(move || {
                    !active_stop.is_cancelled()
                        && weak.upgrade().is_some_and(|r| r.current(generation))
                        && active_control.authorized(epoch)
                        && {
                            let s = active_bus.snapshot();
                            s.generation == bus_generation && available(&s, &active_binding)
                        }
                }));
                let active_bus = bus.clone();
                let active_binding = binding.clone();
                gate.bind_peers(Arc::new(move |peer, device, key| {
                    peer_bound(
                        &active_bus,
                        &active_binding,
                        bus_generation,
                        peer,
                        device,
                        key,
                    )
                }));
                if !control.attach(epoch, content_stop.clone(), gate.clone()) {
                    return Err(Error::Cancelled);
                }
                let runtime = owner.sync.clone();
                let bus = bus.clone();
                let binding = binding.clone();
                let content_control = control.clone();
                let content_requests = requests.clone();
                let child_stop = content_stop.clone();
                let task = tokio::spawn(async move {
                    transport::run_content(
                        runtime,
                        binding,
                        bus,
                        gate,
                        child_stop,
                        content_control,
                        epoch,
                        content_requests,
                    )
                    .await
                });
                child = Some((content_stop, task, epoch, bus_generation));
            }
            if child.is_none() && enabled && !valid {
                owner.set_phase(generation, super::types::Phase::Connecting);
            } else if !enabled {
                owner.set_phase(generation, super::types::Phase::Paused);
            } else if control.ready() {
                owner.set_phase(generation, super::types::Phase::Ready);
            }
            if authenticated(&s, &binding) {
                publish(
                    &owner,
                    &bus,
                    &binding,
                    &catalog,
                    control.ready(),
                    &mut last,
                    &mut revision,
                )
                .await?;
            }
            owner.directory_status(generation, &catalog)?;
            tokio::select! {
                biased;
                _=stop.cancelled()=>break Ok(()),
                changed=watch.changed()=>if changed.is_err(){return Err(Error::Network)},
                _=control.changed.notified()=>{},
                _=control.refresh.notified()=>{},
                _=tick.tick()=>{},
            }
        }
    }
    .await;
    catalog.clear();
    if let Some((cancel, task, epoch, _)) = child {
        cancel.cancel();
        let retired = task.await.map_err(|_| Error::Sync)?;
        control.finished(epoch);
        if result.is_ok() {
            retired?;
        }
    }
    while let Ok(r) = requests.lock().await.try_recv() {
        r.complete(Err(Error::Cancelled));
    }
    result
}

#[cfg(test)]
mod cyberbus_tests {
    use super::*;
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
    #[tokio::test]
    async fn actual_sdk_accepts_notes_profile_and_roster_without_auth_or_network() {
        // This is an offline SDK/profile boundary, never a real Keychain/grant.
        let bytes = Arc::new(Mutex::new(None::<Vec<u8>>));
        let load = bytes.clone();
        let save = bytes.clone();
        let store = notes_cyberbus::CallbackStore::new(
            move || {
                Ok(load
                    .lock()
                    .unwrap()
                    .as_ref()
                    .map(|v| notes_cyberbus::SecretBytes::new(v.clone())))
            },
            move |v: &[u8]| {
                *save.lock().unwrap() = Some(v.to_vec());
                Ok(())
            },
        );
        let bus = Bus::new(
            super::super::config::pinned().unwrap(),
            Box::new(store),
            notes_cyberbus::StoreMode::CreateNew,
        )
        .await
        .unwrap();
        let notes = directory::NotesProfile {
            schema_version: 1,
            registry_id: uuid::Uuid::new_v4().to_string(),
            protocol_device_id: None,
            noise_public_key: None,
            sync_available: false,
            summary: None,
            known_devices: (1..=64)
                .map(|n| directory::KnownDevice {
                    registry_id: uuid::Uuid::new_v4().to_string(),
                    sdk_id: B64.encode([n; 32]),
                    name: "机".repeat(40),
                })
                .collect(),
        };
        let result = bus
            .cmd(C::UpdatePublicProfile(pb::UpdatePublicProfile {
                profile: Some(pb::PublicProfile {
                    device_name: "Fixture Mac".into(),
                    public_config: Some(notes_cyberbus::Any {
                        type_url: directory::PROFILE_TYPE.into(),
                        value: notes.clone().encode_with_roster_budget().unwrap(),
                    }),
                    config_semantic_version: "1.0.0".into(),
                    ..Default::default()
                }),
                expected_revision: 0,
                update_mask: Some(prost_types::FieldMask {
                    paths: vec![
                        "device_name".into(),
                        "public_config".into(),
                        "config_semantic_version".into(),
                    ],
                }),
            }))
            .await
            .unwrap();
        let Some(pb::sdk_result::Body::PublicProfile(p)) = result.body else {
            panic!("SDK must return revisioned profile")
        };
        assert_eq!(p.config_revision, 1);
        let decoded = directory::NotesProfile::decode(&p.public_config.unwrap().value).unwrap();
        assert_eq!(decoded.registry_id, notes.registry_id);
        assert!(!decoded.known_devices.is_empty());
        assert!(decoded.known_devices.len() < 64);
        assert!(!bus.snapshot().network.is_some_and(|n| n.running));
        bus.close().await.unwrap();
    }
    #[test]
    fn auth_lease_requires_verified_owner_and_network_and_expires_without_tick() {
        let b = private::Binding {
            issuer: "https://issuer.test/oidc".into(),
            subject: "subject".into(),
            product_id: "notes".into(),
            workspace_id: uuid::Uuid::new_v4().to_string(),
            device_id: uuid::Uuid::new_v4().to_string(),
            noise_public_key: "fixture".into(),
            enabled: true,
        };
        let mut s = Snapshot::default();
        s.directory_valid = true;
        let expires = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 60;
        s.auth = Some(pb::AuthEvent {
            phase: pb::AuthPhase::Authenticated as i32,
            account: Some(pb::AccountSummary {
                issuer: b.issuer.clone(),
                subject: b.subject.clone(),
                product_id: b.product_id.clone(),
            }),
            validation_lease_expires_at: Some(prost_types::Timestamp {
                seconds: expires as i64,
                nanos: 0,
            }),
            ..Default::default()
        });
        s.network = Some(pb::NetworkState {
            running: true,
            reachable: true,
            error: None,
        });
        assert!(available(&s, &b));
        for phase in [
            pb::AuthPhase::Degraded,
            pb::AuthPhase::ReauthRequired,
            pb::AuthPhase::LoggedOut,
            pb::AuthPhase::AuthCancelled,
        ] {
            let mut invalid = s.clone();
            invalid.auth.as_mut().unwrap().phase = phase as i32;
            assert!(!available(&invalid, &b));
        }
        let mut wrong = s.clone();
        wrong
            .auth
            .as_mut()
            .unwrap()
            .account
            .as_mut()
            .unwrap()
            .subject = "other".into();
        assert!(!available(&wrong, &b));
        let mut expired = s.clone();
        expired
            .auth
            .as_mut()
            .unwrap()
            .validation_lease_expires_at
            .as_mut()
            .unwrap()
            .seconds = 0;
        assert!(!available(&expired, &b));
        s.network.as_mut().unwrap().reachable = false;
        assert!(!available(&s, &b));
    }
    #[tokio::test]
    async fn deadline_receipt_waits_for_work_owned_retirement() {
        let cancel = Arc::new(RequestCancellation::new(Duration::from_millis(10)));
        let (done, rx) = oneshot::channel();
        let waiting = tokio::spawn(wait_request(rx, cancel.clone()));
        cancel.stop.cancelled().await;
        assert!(!waiting.is_finished());
        done.send(Ok(())).unwrap();
        assert_eq!(waiting.await.unwrap(), Err(Error::Deadline));
    }
}
