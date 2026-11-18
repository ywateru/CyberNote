use crate::{bridge::Bridge, *};
use pb::{sdk_command::Body as C, sdk_event::Body as E};
use std::{
    sync::{Arc, RwLock},
    time::Duration,
};
use tokio::sync::{broadcast, watch};
use tokio_util::{sync::CancellationToken, task::TaskTracker};

#[derive(Clone, Default)]
pub struct Snapshot {
    pub auth: Option<pb::AuthEvent>,
    pub network: Option<pb::NetworkState>,
    pub devices: pb::DevicesSnapshot,
    pub generation: u64,
    pub closed: bool,
    pub directory_valid: bool,
}
#[derive(Clone)]
pub enum BusEvent {
    Raw(pb::SdkEvent),
    Closed,
    Fault(Error),
}

impl std::fmt::Debug for Snapshot {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Snapshot")
            .field("generation", &self.generation)
            .field("closed", &self.closed)
            .field("directory_valid", &self.directory_valid)
            .finish_non_exhaustive()
    }
}
impl std::fmt::Debug for BusEvent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Raw(_) => f.write_str("Raw([REDACTED])"),
            Self::Closed => f.write_str("Closed"),
            Self::Fault(e) => f.debug_tuple("Fault").field(e).finish(),
        }
    }
}

pub(crate) struct Inner {
    pub client: cyberbus::Client,
    pub snapshot: RwLock<Snapshot>,
    pub updates: watch::Sender<Snapshot>,
    pub events: broadcast::Sender<BusEvent>,
    pub bridge: Bridge,
    pub stop: CancellationToken,
    pub tasks: TaskTracker,
    pub owner_done: CancellationToken,
    pub watch_id: [u8; 16],
    pub subscription_id: [u8; 16],
    #[cfg(test)]
    pub test_wire: std::sync::Mutex<Option<tokio::sync::mpsc::Sender<C>>>,
}
#[derive(Clone)]
pub struct Bus {
    pub(crate) inner: Arc<Inner>,
}
pub(crate) fn random_id() -> [u8; 16] {
    use rand::RngCore;
    let mut id = [0; 16];
    rand::rngs::OsRng.fill_bytes(&mut id);
    id
}

impl Bus {
    pub async fn new(
        config: ClientConfig,
        store: Box<dyn SecureStore>,
        mode: StoreMode,
    ) -> Result<Self> {
        Self::with_limits(config, store, mode, Limits::default()).await
    }
    pub async fn with_limits(
        config: ClientConfig,
        store: Box<dyn SecureStore>,
        mode: StoreMode,
        limits: Limits,
    ) -> Result<Self> {
        limits.validate()?;
        let client = cyberbus::Client::new_with_application_schema(
            config,
            store,
            mode,
            &crate::protocol::descriptor_set(),
        )
        .await
        .map_err(|e| Error::Sdk(e.code))?;
        let mut receiver = client.take_event_receiver().await.ok_or(Error::Closed)?;
        let (updates, _) = watch::channel(Snapshot::default());
        let (events, _) = broadcast::channel(128);
        let (bridge, completions) = Bridge::new(limits);
        let bus = Self {
            inner: Arc::new(Inner {
                client,
                snapshot: RwLock::new(Snapshot::default()),
                updates,
                events,
                bridge,
                stop: CancellationToken::new(),
                tasks: TaskTracker::new(),
                owner_done: CancellationToken::new(),
                watch_id: random_id(),
                subscription_id: random_id(),
                #[cfg(test)]
                test_wire: std::sync::Mutex::new(None),
            }),
        };
        let owner = bus.clone();
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(Duration::from_millis(100));
            loop {
                tokio::select! {
                    event=receiver.recv()=>match event {
                        Some(event)=>{owner.handle_event(&event);let _=owner.inner.events.send(BusEvent::Raw(event));},
                        None=>break,
                    },
                    _=ticker.tick()=>{
                        let state=owner.snapshot();
                        if state.directory_valid && state.auth.as_ref().is_some_and(|a|a.phase==pb::AuthPhase::Authenticated as i32 && !valid_lease(a)) {
                            owner.revoke(false);
                        }
                    }
                }
            }
            owner.revoke(true);
            let _ = owner.inner.events.send(BusEvent::Closed);
            owner.inner.owner_done.cancel();
        });
        let worker = bus.clone();
        bus.inner.tasks.spawn(async move {
            worker.complete_worker(completions).await;
        });
        // Owner is running before the first SDK command. Internal IDs cannot be unregistered by callers.
        let init = async {
            bus.internal(C::SubscribeData(pb::SubscribeData {
                subscription_id: bus.inner.subscription_id.to_vec(),
                type_urls: vec![TYPE_URL.into()],
            }))
            .await?;
            let auth = bus.internal(C::GetAuthState(pb::GetAuthState {})).await?;
            if let Some(pb::sdk_result::Body::AuthState(auth)) = auth.body {
                let mut state = bus.inner.snapshot.write().unwrap();
                state.auth = Some(auth);
                bus.publish(&state);
            }
            bus.internal(C::WatchDevices(pb::WatchDevices {
                watch_id: bus.inner.watch_id.to_vec(),
            }))
            .await?;
            Ok(())
        }
        .await;
        if let Err(e) = init {
            let _ = bus.close().await;
            return Err(e);
        }
        Ok(bus)
    }
    pub fn snapshot(&self) -> Snapshot {
        self.inner.snapshot.read().unwrap().clone()
    }
    pub fn watch(&self) -> watch::Receiver<Snapshot> {
        self.inner.updates.subscribe()
    }
    pub fn subscribe(&self) -> broadcast::Receiver<BusEvent> {
        self.inner.events.subscribe()
    }
    pub async fn cmd(&self, body: C) -> Result<pb::SdkResult> {
        self.execute(pb::SdkCommand {
            command_id: random_id().to_vec(),
            body: Some(body),
        })
        .await
    }
    pub async fn execute(&self, command: pb::SdkCommand) -> Result<pb::SdkResult> {
        let body = command.body.as_ref().ok_or(Error::Protocol)?;
        match body {
            C::SdkClose(_) => return Err(Error::ReservedCommand), // use close() to drain owned tasks
            C::UnsubscribeData(c) if c.subscription_id == self.inner.subscription_id => {
                return Err(Error::ReservedCommand)
            }
            C::StopWatchDevices(c) if c.watch_id == self.inner.watch_id => {
                return Err(Error::ReservedCommand)
            }
            C::SubscribeData(c)
                if c.type_urls.is_empty() || c.type_urls.iter().any(|s| s == TYPE_URL) =>
            {
                return Err(Error::ReservedCommand)
            }
            C::Send(c)
                if c.message
                    .as_ref()
                    .and_then(|m| m.fragment.as_ref())
                    .is_some_and(|f| f.application_type_url == TYPE_URL) =>
            {
                return Err(Error::ReservedCommand)
            }
            C::BlockDevice(c) => self.inner.bridge.cancel_peer(&c.peer_device_id),
            C::AuthLogout(_) | C::NetworkStop(_) | C::AuthStart(_) | C::AuthRestore(_) => {
                self.revoke(false)
            }
            _ => {}
        }
        self.execute_inner(command).await
    }
    pub(crate) async fn internal(&self, body: C) -> Result<pb::SdkResult> {
        self.execute_inner(pb::SdkCommand {
            command_id: random_id().to_vec(),
            body: Some(body),
        })
        .await
    }
    async fn execute_inner(&self, command: pb::SdkCommand) -> Result<pb::SdkResult> {
        if self.snapshot().closed {
            return Err(Error::Closed);
        }
        #[cfg(test)]
        {
            let hook = self.inner.test_wire.lock().unwrap().clone();
            if let Some(hook) = hook {
                if matches!(
                    &command.body,
                    Some(C::Send(_) | C::CompleteData(_) | C::CancelData(_))
                ) {
                    hook.send(command.body.unwrap())
                        .await
                        .map_err(|_| Error::Closed)?;
                    return Ok(pb::SdkResult {
                        command_id: command.command_id,
                        body: Some(pb::sdk_result::Body::Ok(())),
                    });
                }
            }
        }
        let result = tokio::time::timeout(
            self.inner.bridge.limits.command_timeout,
            self.inner.client.execute(command),
        )
        .await
        .map_err(|_| Error::Timeout)?;
        if let Some(pb::sdk_result::Body::Error(e)) = &result.body {
            return Err(Error::Sdk(e.code));
        }
        Ok(result)
    }
    pub async fn on_resume(&self) -> Result<()> {
        tokio::time::timeout(
            self.inner.bridge.limits.command_timeout,
            self.inner.client.on_resume(),
        )
        .await
        .map_err(|_| Error::Timeout)?
        .map_err(|e| Error::Sdk(e.code))
    }
    pub async fn close(&self) -> Result<()> {
        self.revoke(false);
        let command = pb::SdkCommand {
            command_id: random_id().to_vec(),
            body: Some(C::SdkClose(pb::SdkClose {})),
        };
        let result = tokio::time::timeout(
            self.inner.bridge.limits.command_timeout,
            self.inner.client.execute(command),
        )
        .await;
        let drained = tokio::time::timeout(
            self.inner.bridge.limits.command_timeout,
            self.inner.owner_done.cancelled(),
        )
        .await;
        self.inner.stop.cancel();
        self.inner.tasks.close();
        let joined = tokio::time::timeout(
            self.inner.bridge.limits.command_timeout,
            self.inner.tasks.wait(),
        )
        .await;
        if result.is_err() || drained.is_err() || joined.is_err() {
            self.revoke(true);
            return Err(Error::Timeout);
        }
        match result.unwrap().body {
            Some(pb::sdk_result::Body::SdkClosed(c)) if c.cleanup_error.is_none() && c.closed => {
                Ok(())
            }
            Some(pb::sdk_result::Body::SdkClosed(c)) => Err(Error::Sdk(
                c.cleanup_error
                    .map_or(pb::ErrorCode::UnknownOutcome as i32, |e| e.code),
            )),
            Some(pb::sdk_result::Body::Error(e)) => Err(Error::Sdk(e.code)),
            _ => Err(Error::Protocol),
        }
    }
    pub(crate) fn publish(&self, snapshot: &Snapshot) {
        self.inner.updates.send_replace(snapshot.clone());
    }
    pub(crate) fn revoke(&self, closed: bool) {
        let mut state = self.inner.snapshot.write().unwrap();
        state.generation = state.generation.saturating_add(1);
        state.directory_valid = false;
        state.closed |= closed;
        if let Some(n) = &mut state.network {
            n.running = false;
            n.reachable = false;
        }
        for d in &mut state.devices.devices {
            d.presence = pb::DevicePresence::Offline as i32;
        }
        self.inner.bridge.cancel_all();
        self.publish(&state);
    }
    fn handle_event(&self, event: &pb::SdkEvent) {
        match &event.body {
            Some(E::DataStatus(status)) => self.inner.bridge.status(status),
            Some(E::DataReceived(data)) => self.receive_data(data),
            Some(E::PeerDataCancel(c)) => self.inner.bridge.cancel_peer(&c.peer_device_id),
            Some(E::Auth(auth)) => {
                let previous = self.snapshot().auth;
                if auth.phase != pb::AuthPhase::Authenticated as i32
                    || auth.reauth_required
                    || auth.security_state_persistence_pending
                    || previous.as_ref().and_then(|a| a.account.as_ref()) != auth.account.as_ref()
                {
                    self.revoke(false);
                }
                let mut state = self.inner.snapshot.write().unwrap();
                state.auth = Some(auth.clone());
                self.publish(&state);
            }
            Some(E::Network(network)) => {
                if !network.running || !network.reachable || network.error.is_some() {
                    self.revoke(false);
                }
                let mut state = self.inner.snapshot.write().unwrap();
                state.network = Some(network.clone());
                self.publish(&state);
            }
            Some(E::Devices(devices)) if devices.watch_id == self.inner.watch_id => {
                let mut state = self.inner.snapshot.write().unwrap();
                if apply_devices(&mut state, devices).is_err() {
                    drop(state);
                    self.revoke(false);
                    let _ = self
                        .inner
                        .events
                        .send(BusEvent::Fault(Error::DirectoryReset));
                    return;
                }
                for d in &state.devices.devices {
                    if d.presence != pb::DevicePresence::Online as i32 {
                        self.inner.bridge.cancel_peer(&d.device_id);
                    }
                }
                // Removed IDs also lose their leases.
                self.inner.bridge.retain_peers(&state.devices.devices);
                self.publish(&state);
            }
            _ => {}
        }
    }
    pub(crate) fn peer_available(&self, peer: &PeerId) -> bool {
        peer_available_in(&self.inner.snapshot.read().unwrap(), peer)
    }
}
pub(crate) fn peer_available_in(s: &Snapshot, peer: &PeerId) -> bool {
    !s.closed
        && s.directory_valid
        && s.auth.as_ref().is_some_and(|a| {
            a.phase == pb::AuthPhase::Authenticated as i32
                && a.account.is_some()
                && !a.reauth_required
                && !a.security_state_persistence_pending
                && valid_lease(a)
        })
        && s.network
            .as_ref()
            .is_some_and(|n| n.running && n.reachable && n.error.is_none())
        && s.devices.devices.iter().any(|d| {
            !d.is_local && d.device_id == peer && d.presence == pb::DevicePresence::Online as i32
        })
}
fn valid_lease(auth: &pb::AuthEvent) -> bool {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or(Duration::MAX);
    auth.validation_lease_expires_at.as_ref().is_some_and(|t| {
        t.seconds >= 0
            && t.nanos >= 0
            && t.nanos < 1_000_000_000
            && Duration::new(t.seconds as u64, t.nanos as u32) > now
    })
}
fn apply_devices(state: &mut Snapshot, event: &pb::DevicesEvent) -> Result<()> {
    use pb::devices_event::Body as D;
    let replacement = match &event.body {
        Some(D::Snapshot(s)) => Some(s),
        Some(D::Reset(r)) => r.snapshot.as_ref(),
        _ => None,
    };
    if let Some(s) = replacement {
        if s.runtime_id != event.runtime_id
            || s.revision != event.revision
            || s.devices.len() > 1024
            || s.devices.iter().any(|d| d.device_id.len() != 32)
        {
            return Err(Error::DirectoryReset);
        }
        let mut ids = std::collections::HashSet::new();
        if s.devices.iter().any(|d| !ids.insert(&d.device_id)) {
            return Err(Error::DirectoryReset);
        }
        state.devices = s.clone();
        state.directory_valid = true;
        return Ok(());
    }
    if !state.directory_valid
        || event.runtime_id != state.devices.runtime_id
        || event.previous_revision != state.devices.revision
        || event.revision <= event.previous_revision
    {
        return Err(Error::DirectoryReset);
    }
    let changed = match &event.body {
        Some(D::Added(v)) => v.device.as_ref(),
        Some(D::Updated(v)) => v.device.as_ref(),
        Some(D::Offline(v)) => v.device.as_ref(),
        _ => None,
    };
    if let Some(d) = changed {
        if d.device_id.len() != 32 {
            return Err(Error::DirectoryReset);
        }
        if let Some(entry) = state
            .devices
            .devices
            .iter_mut()
            .find(|e| e.device_id == d.device_id)
        {
            *entry = d.clone()
        } else if state.devices.devices.len() < 1024 {
            state.devices.devices.push(d.clone())
        } else {
            return Err(Error::Capacity);
        }
    } else if let Some(D::Removed(r)) = &event.body {
        state.devices.devices.retain(|d| d.device_id != r.device_id)
    } else {
        return Err(Error::DirectoryReset);
    }
    state.devices.revision = event.revision;
    Ok(())
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    pub fn config() -> ClientConfig {
        ClientConfig::from_json(r#"{"issuer":"https://example.invalid/oidc","client_id":"native-test","resource":"https://example.invalid/api","product_id":"notes-test","native_clients":{"native-test":"notes-test"},"redirect_uri":"http://127.0.0.1:18765/callback","persist_grant":false,"bootstrap_peers":[]}"#).unwrap()
    }
    #[tokio::test]
    async fn real_sdk_offline_lifecycle_and_profile_any() {
        let bus = Bus::new(
            config(),
            Box::<cyberbus_auth::MemoryStore>::default(),
            StoreMode::CreateNew,
        )
        .await
        .unwrap();
        let mut updates = bus.watch();
        tokio::time::timeout(Duration::from_secs(2), async {
            while !updates.borrow_and_update().directory_valid {
                updates.changed().await.unwrap()
            }
        })
        .await
        .unwrap();
        let initial = bus.snapshot();
        assert_eq!(initial.auth.unwrap().phase, pb::AuthPhase::LoggedOut as i32);
        assert_eq!(initial.devices.devices.len(), 1);
        assert!(initial.devices.devices[0].is_local);
        assert!(matches!(
            bus.map([4; 32], Service::Sync).await,
            Err(Error::PeerUnavailable)
        ));
        assert!(matches!(
            bus.register_endpoint(Service::Sync, "0.0.0.0:9999".parse().unwrap())
                .await,
            Err(Error::InvalidEndpoint)
        ));
        let result = bus
            .cmd(C::UpdatePublicProfile(pb::UpdatePublicProfile {
                profile: Some(pb::PublicProfile {
                    device_name: "Offline test".into(),
                    public_config: Some(Any {
                        type_url: "type.notes.test/notes.test.Profile".into(),
                        value: vec![8, 1],
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
        assert!(matches!(
            result.body,
            Some(pb::sdk_result::Body::PublicProfile(_))
        ));
        assert!(matches!(
            bus.cmd(C::SubscribeData(pb::SubscribeData {
                subscription_id: vec![9; 16],
                type_urls: vec![TYPE_URL.into()]
            }))
            .await,
            Err(Error::ReservedCommand)
        ));
        bus.close().await.unwrap();
        assert!(bus.snapshot().closed);
        assert!(matches!(
            bus.cmd(C::GetAuthState(pb::GetAuthState {})).await,
            Err(Error::Closed)
        ));
    }
    #[tokio::test]
    async fn real_sdk_encrypted_identity_restart() {
        use crate::store::{AesGcmCipher, EncryptedFileStore};
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("vault");
        let open = |mode| {
            EncryptedFileStore::open(
                &path,
                Box::new(AesGcmCipher::injected_for_tests([8; 32])),
                mode,
            )
            .unwrap()
        };
        let bus = Bus::new(
            config(),
            Box::new(open(StoreMode::CreateNew)),
            StoreMode::CreateNew,
        )
        .await
        .unwrap();
        let mut watch = bus.watch();
        while watch.borrow().devices.devices.is_empty() {
            watch.changed().await.unwrap()
        }
        let id = bus.snapshot().devices.devices[0].device_id.clone();
        bus.close().await.unwrap();
        drop(bus);
        let bus = Bus::new(
            config(),
            Box::new(open(StoreMode::Existing)),
            StoreMode::Existing,
        )
        .await
        .unwrap();
        let mut watch = bus.watch();
        while watch.borrow().devices.devices.is_empty() {
            watch.changed().await.unwrap()
        }
        assert_eq!(bus.snapshot().devices.devices[0].device_id, id);
        bus.close().await.unwrap();
    }
    #[test]
    fn directory_revision_reset_and_gap_rejection() {
        let mut s = Snapshot::default();
        let device = pb::DeviceSnapshot {
            device_id: vec![1; 32],
            presence: pb::DevicePresence::Online as i32,
            ..Default::default()
        };
        let event = pb::DevicesEvent {
            runtime_id: vec![1; 16],
            revision: 3,
            body: Some(pb::devices_event::Body::Snapshot(pb::DevicesSnapshot {
                runtime_id: vec![1; 16],
                revision: 3,
                devices: vec![device.clone()],
            })),
            ..Default::default()
        };
        apply_devices(&mut s, &event).unwrap();
        assert!(s.directory_valid);
        let gap = pb::DevicesEvent {
            runtime_id: vec![1; 16],
            revision: 5,
            previous_revision: 4,
            body: Some(pb::devices_event::Body::Offline(pb::DeviceOffline {
                device: Some(device),
            })),
            ..Default::default()
        };
        assert!(apply_devices(&mut s, &gap).is_err());
        let reset = pb::DevicesEvent {
            runtime_id: vec![2; 16],
            revision: 1,
            body: Some(pb::devices_event::Body::Reset(pb::DevicesReset {
                snapshot: Some(pb::DevicesSnapshot {
                    runtime_id: vec![2; 16],
                    revision: 1,
                    devices: vec![],
                }),
                reason: pb::ResetReason::RuntimeChanged as i32,
            })),
            ..Default::default()
        };
        apply_devices(&mut s, &reset).unwrap();
        assert!(s.devices.devices.is_empty());
    }
}
