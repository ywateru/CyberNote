//! Directory owns transport registration, not the lifecycle command lock.
//! Content is an independently cancellable child, absent while paused.
use super::{
    directory, enrollment, private, transport,
    types::{Error, Result, TransferDirection},
    Runtime,
};
use std::sync::{Arc, Mutex, Weak};
use tokio::sync::{mpsc, oneshot, Notify};
use tokio_util::sync::CancellationToken;

pub(super) struct DeviceRequest {
    pub target: directory::Row,
    pub direction: TransferDirection,
    pub epoch: u64,
    pub _permit: OperationPermit,
    pub done: oneshot::Sender<Result<()>>,
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
                }
            };
        }
    }
}
#[derive(Default)]
struct State {
    epoch: u64,
    enabled: bool,
    ready: bool,
    operation: bool,
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
            Some((state.gate.take(), state.stop.take()))
        } else {
            None
        };
        // Gate authorization calls back into current(); never invert those locks.
        if let Some((gate, stop)) = retired {
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
    pub fn reserve(self: &Arc<Self>, epoch: u64) -> Result<OperationPermit> {
        let mut state = self.state.lock().map_err(|_| Error::Storage)?;
        if state.epoch != epoch || !state.enabled || !state.ready {
            return Err(Error::SyncNotEnabled);
        }
        if state.operation {
            return Err(Error::Busy);
        }
        state.operation = true;
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
    fn attach(&self, epoch: u64, stop: CancellationToken, gate: Arc<enrollment::Gate>) -> bool {
        if let Ok(mut s) = self.state.lock() {
            if s.epoch == epoch && s.enabled {
                s.stop = Some(stop);
                s.gate = Some(gate);
                return true;
            }
        }
        false
    }
    fn finished(&self, epoch: u64) {
        let gate = self.state.lock().ok().and_then(|mut s| {
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
        self.refresh.notify_one();
    }
}

pub(super) async fn run(
    owner: Weak<Runtime>,
    generation: u64,
    binding: private::Binding,
    auth: Arc<account_auth::AuthClient>,
    client: Arc<cybergrid_sdk::Client>,
    control: Arc<Control>,
    catalog: Arc<directory::Catalog>,
    stop: CancellationToken,
    requests: mpsc::Receiver<DeviceRequest>,
) -> Result<()> {
    // All HTTP initialization is inside this owned task. No lifecycle guard is held.
    let result = async {
        let advertised =
            transport::retry_sdk(&stop, || client.auth_config(), transport::transient_sdk)
                .await
                .map_err(|e| {
                    Error::sdk_at(e, super::types::NetworkStage::CoordinatorConfiguration)
                })?;
        if advertised.issuer != super::config::ISSUER
            || advertised.client_id != super::config::CLIENT_ID
            || advertised.resource != super::config::RESOURCE
            || !advertised.scope.split_whitespace().any(|s| s == "connect")
            || advertised
                .product_id
                .as_deref()
                .unwrap_or(&advertised.client_id)
                != binding.product_id
        {
            return Err(Error::Configuration);
        }
        client
            .set_auth_provider(Arc::new(super::provider::Provider(auth.clone())))
            .await;
        let registry = owner.upgrade().ok_or(Error::Cancelled)?.registry()?;
        let session = transport::retry_sdk(
            &stop,
            || client.login_with_auth_provider(&registry.name),
            |e| {
                transport::transient_sdk(e)
                    || (matches!(e, cybergrid_sdk::Error::ExchangeOutcomeUnknown)
                        && client.snapshot().coordination.retryable)
            },
        )
        .await
        .map_err(|e| Error::sdk_at(e, super::types::NetworkStage::CoordinatorRegistration))?;
        check_session(&session, &binding)?;
        let contents = content_owner(
            owner.clone(),
            generation,
            binding.clone(),
            auth.clone(),
            client.clone(),
            control.clone(),
            stop.clone(),
            requests,
        );
        let directory = directory_owner(
            owner.clone(),
            generation,
            &binding,
            &auth,
            &client,
            &control,
            &catalog,
            &stop,
        );
        // Join both children even on failure: dropping the content future could
        // strand a listener/adoption verifier instead of sealing and joining it.
        let (content_result, directory_result) = tokio::join!(
            async {
                let result = contents.await;
                if result.is_err() {
                    stop.cancel();
                }
                result
            },
            async {
                let result = directory.await;
                if result.is_err() {
                    stop.cancel();
                }
                result
            },
        );
        content_result.and(directory_result)?;
        Ok(())
    }
    .await;
    control.configure(false);
    catalog.clear();
    let _ = client.close().await;
    result
}
fn check_session(session: &cybergrid_sdk::Session, binding: &private::Binding) -> Result<()> {
    if session.user.id != binding.subject
        || session.product_id.as_deref().unwrap_or(&session.app_id) != binding.product_id
    {
        return Err(Error::OwnershipMismatch);
    }
    Ok(())
}
async fn directory_owner(
    owner: Weak<Runtime>,
    generation: u64,
    binding: &private::Binding,
    auth: &account_auth::AuthClient,
    client: &cybergrid_sdk::Client,
    control: &Control,
    catalog: &directory::Catalog,
    stop: &CancellationToken,
) -> Result<()> {
    let api = directory::Api::new()?;
    loop {
        let cycle = async {
            let this = owner
                .upgrade()
                .filter(|r| r.current(generation))
                .ok_or(Error::Cancelled)?;
            let sync = this.sync.clone();
            let summary = tokio::task::spawn_blocking(move || sync.account_summary())
                .await
                .map_err(|_| Error::Storage)??;
            let session = client.device_session().await.ok_or(Error::Authentication)?;
            check_session(&session, binding)?;
            let access = auth
                .access_token(std::time::Duration::from_secs(60), false)
                .await?;
            let snapshot = client.snapshot();
            let available = control.ready()
                && snapshot.remote_enabled
                && snapshot.coordination.phase == cybergrid_sdk::StatePhase::Ready
                && snapshot.publication.phase == cybergrid_sdk::StatePhase::Ready;
            if !this.current(generation) {
                return Err(Error::Cancelled);
            }
            // Persist before dispatch; crashes and ambiguous responses cannot
            // reuse a prior revision or let late paused/session updates win.
            let registry = this.next_registration()?;
            api.register(
                access.secret(),
                &directory::Registration {
                    device_id: &registry.registry_device_id,
                    name: &registry.name,
                    summary: Some(&summary),
                    registry_key: &registry.registry_key,
                    revision: registry.revision,
                    sync_available: available,
                    // SDK-owned accessor is supplied by the SDK author; never serialized to IPC/disk.
                    transport_session_key: session.transport_session_key(),
                    protocol_device_id: available.then_some(binding.device_id.as_str()),
                    noise_public_key: available.then_some(binding.noise_public_key.as_str()),
                },
            )
            .await?;
            let rows = api.list(access.secret()).await?;
            if !this.current(generation) {
                return Err(Error::Cancelled);
            }
            let latest_registry = this.registry()?;
            let devices = rows
                .iter()
                .map(|row| {
                    let mut device = row.project(&latest_registry.registry_device_id);
                    if device.current {
                        device.name = latest_registry.name.clone();
                    }
                    device
                })
                .collect();
            catalog.replace(rows)?;
            this.mutate(|d| {
                if !this.current(generation) {
                    return;
                }
                d.status.devices = devices;
                if d.status.error.as_ref().is_none_or(|e| {
                    matches!(
                        e.code.as_str(),
                        "account_directory_unavailable" | "account_directory_unsupported"
                    )
                }) {
                    d.status.error = None;
                    d.status.state = if !d.status.enabled {
                        super::types::Phase::Paused
                    } else if control.ready() {
                        super::types::Phase::Ready
                    } else {
                        super::types::Phase::Connecting
                    };
                }
            });
            Ok(())
        };
        let result = tokio::select! { _=stop.cancelled()=>return Ok(()), result=cycle=>result };
        if let Err(error) = result {
            catalog.clear();
            if let Some(this) = owner.upgrade().filter(|r| r.current(generation)) {
                this.mutate(|d| {
                    if !this.current(generation) {
                        return;
                    }
                    for device in &mut d.status.devices {
                        device.online = false;
                        device.sync_available = false;
                        device.connected = false;
                        device.transport = None;
                        device.summary = None;
                    }
                });
                this.fail_current(generation, error);
            }
            if transport::authorization_failure(error) || error == Error::Cancelled {
                control.configure(false);
                return Err(error);
            }
        }
        tokio::select! { _=stop.cancelled()=>return Ok(()), _=control.refresh.notified()=>{}, _=tokio::time::sleep(std::time::Duration::from_secs(20))=>{} }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn paused_real_content_owner_rejects_actions_without_runtime_or_sdk_registration() {
        let root = tempfile::tempdir().unwrap();
        let auth = Arc::new(
            account_auth::AuthClient::new(
                super::super::config::pinned(),
                root.path().join("grant.json"),
            )
            .await
            .unwrap(),
        );
        let client = cybergrid_sdk::Client::new(cybergrid_sdk::Config {
            base_url: super::super::config::origin().unwrap(),
            app_id: super::super::config::CLIENT_ID.into(),
            ..Default::default()
        })
        .unwrap();
        let binding = private::Binding {
            issuer: super::super::config::ISSUER.into(),
            subject: "fixture-owner".into(),
            product_id: "cybernote".into(),
            workspace_id: uuid::Uuid::new_v4().to_string(),
            device_id: uuid::Uuid::new_v4().to_string(),
            noise_public_key: "fixture-key".into(),
            enabled: false,
        };
        let control = Arc::new(Control::default());
        control.configure(false);
        let stop = CancellationToken::new();
        let task_stop = stop.clone();
        let (sender, receiver) = mpsc::channel(1);
        let task_client = client.clone();
        let task = tokio::spawn(async move {
            content_owner(
                Weak::new(),
                0,
                binding,
                auth,
                task_client,
                control,
                task_stop,
                receiver,
            )
            .await
        });
        let (done, result) = oneshot::channel();
        sender
            .send(DeviceRequest {
                target: directory::Row {
                    id: uuid::Uuid::new_v4().to_string(),
                    name: "Other Mac".into(),
                    online: true,
                    sync_available: false,
                    summary: None,
                    transport_device_id: None,
                    protocol_device_id: None,
                    noise_public_key: None,
                },
                direction: TransferDirection::Both,
                epoch: 0,
                _permit: OperationPermit {
                    control: Weak::new(),
                    epoch: 0,
                },
                done,
            })
            .await
            .unwrap();
        assert_eq!(
            tokio::time::timeout(std::time::Duration::from_secs(2), result)
                .await
                .unwrap()
                .unwrap(),
            Err(Error::SyncNotEnabled)
        );
        assert!(client.device_session().await.is_none());
        assert!(!client.snapshot().remote_enabled);
        stop.cancel();
        assert_eq!(task.await.unwrap(), Ok(()));
    }
    #[test]
    fn pause_and_reenable_fence_late_ready_and_old_operations_without_a_store() {
        let control = Arc::new(Control::default());
        assert!(!control.ready());
        control.configure(true);
        let epoch = control.epoch().unwrap();
        let gate = Arc::new(enrollment::Gate::default());
        let weak = Arc::downgrade(&control);
        gate.bind_lifecycle(Arc::new(move || {
            weak.upgrade().is_some_and(|c| c.current(epoch))
        }));
        let stop = CancellationToken::new();
        assert!(control.attach(epoch, stop.clone(), gate.clone()));
        control.mark_ready(epoch);
        assert!(control.ready());
        control.configure(false);
        assert!(stop.is_cancelled());
        assert!(!gate.is_current());
        control.mark_ready(epoch);
        assert!(!control.ready());
        control.configure(true);
        assert!(!control.current(epoch));
        assert!(!control.attach(
            epoch,
            CancellationToken::new(),
            Arc::new(enrollment::Gate::default())
        ));
        control.finished(epoch);
        assert!(!control.ready());
    }
    #[test]
    fn operation_reservation_is_owned_by_work_not_the_dropped_ipc_waiter() {
        let control = Arc::new(Control::default());
        control.configure(true);
        let old = control.epoch().unwrap();
        assert!(control.attach(
            old,
            CancellationToken::new(),
            Arc::new(enrollment::Gate::default())
        ));
        control.mark_ready(old);
        let first = control.reserve(old).unwrap();
        assert!(control.reserve(old).err() == Some(Error::Busy));
        control.configure(false);
        control.configure(true);
        let new = control.epoch().unwrap();
        assert!(control.attach(
            new,
            CancellationToken::new(),
            Arc::new(enrollment::Gate::default())
        ));
        control.mark_ready(new);
        let second = control.reserve(new).unwrap();
        // A retired operation dropping after a new enable cannot release the
        // newer operation's reservation or make a second job admissible.
        drop(first);
        assert!(control.reserve(new).err() == Some(Error::Busy));
        drop(second);
        assert!(control.reserve(new).is_ok());
    }
}
async fn content_owner(
    owner: Weak<Runtime>,
    generation: u64,
    binding: private::Binding,
    auth: Arc<account_auth::AuthClient>,
    client: Arc<cybergrid_sdk::Client>,
    control: Arc<Control>,
    stop: CancellationToken,
    mut requests: mpsc::Receiver<DeviceRequest>,
) -> Result<()> {
    let mut last_epoch = None;
    loop {
        if stop.is_cancelled() {
            return Ok(());
        }
        let (epoch, enabled) = control.intent()?;
        if enabled && last_epoch != Some(epoch) {
            last_epoch = Some(epoch);
            let task_stop = stop.child_token();
            let gate = Arc::new(enrollment::Gate::default());
            gate.attach(&client);
            let weak = owner.clone();
            let fence = Arc::downgrade(&control);
            gate.bind_lifecycle(Arc::new(move || {
                fence.upgrade().is_some_and(|fence| fence.current(epoch))
                    && weak.upgrade().is_some_and(|r| r.current(generation))
            }));
            if !control.attach(epoch, task_stop.clone(), gate.clone()) {
                continue;
            }
            let this = owner.upgrade().ok_or(Error::Cancelled)?;
            let identity = this.sync.account_identity_for(&binding.device_id)?;
            let enrollment = Arc::new(enrollment::Enrollment::new(super::config::origin()?)?);
            let observation = this.observations.begin(generation);
            let result = transport::run_content(
                this.sync.clone(),
                identity,
                binding.clone(),
                auth.clone(),
                client.clone(),
                enrollment,
                gate.clone(),
                task_stop,
                observation,
                control.clone(),
                epoch,
                &mut requests,
            )
            .await;
            gate.close();
            control.finished(epoch);
            let _ = client.unexpose(super::config::SYNC_PORT).await;
            let _ = client.unexpose(super::config::ENROLL_PORT).await;
            if let Err(error) = result {
                if this.current(generation) && control.current(epoch) {
                    if private::adoption_pending(&this.root).unwrap_or(true) {
                        let _ = this.set_enabled(false);
                    }
                    this.fail_current(generation, error);
                }
            }
        }
        tokio::select! {
            _=stop.cancelled()=>return Ok(()),
            _=control.changed.notified()=>{},
            request=requests.recv()=>if let Some(request)=request { let _=request.done.send(Err(Error::SyncNotEnabled)); },
        }
    }
}
