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
}
impl Default for RequestCancellation {
    fn default() -> Self {
        Self::new(Duration::from_secs(185))
    }
}
impl RequestCancellation {
    pub fn new(budget: Duration) -> Self {
        Self {
            stop: CancellationToken::new(),
            admission_stop: CancellationToken::new(),
            deadline: tokio::time::Instant::now() + budget,
            deadline_expired: Default::default(),
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
            Err(Error::Sync)
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
    work: Fut,
) -> Result<()>
where
    Fut: std::future::Future<Output = Result<()>>,
{
    if cancellation.outcome(Ok(())).is_err() || stop.is_cancelled() {
        return Err(Error::Cancelled);
    }
    let future = work;
    tokio::pin!(future);
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
        // Heap-pin before composing the children. The paused content owner's
        // concrete future still contains the full enabled transfer state machine;
        // embedding it in join's MaybeDone inflated the debug worker poll stack.
        let contents = Box::pin(content_owner(
            owner.clone(),
            generation,
            binding.clone(),
            auth.clone(),
            client.clone(),
            control.clone(),
            stop.clone(),
            requests,
        ));
        let directory = Box::pin(directory_owner(
            owner.clone(),
            generation,
            &binding,
            &auth,
            &client,
            &control,
            &catalog,
            &stop,
        ));
        join_owners(contents, directory, &stop).await?;
        Ok(())
    }
    .await;
    control.configure(false);
    catalog.clear();
    let _ = client.close().await;
    result
}
async fn join_owners(
    contents: std::pin::Pin<Box<impl std::future::Future<Output = Result<()>>>>,
    directory: std::pin::Pin<Box<impl std::future::Future<Output = Result<()>>>>,
    stop: &CancellationToken,
) -> Result<()> {
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
    content_result.and(directory_result)
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
    async fn real_owner_futures_have_bounded_composition_and_poll_on_small_stack() {
        use std::{
            future::Future,
            task::{Context, Poll, Waker},
        };
        fn future_size<F: Future>(_: impl FnOnce() -> F) -> usize {
            // Type-only measurement: never starts registration or touches HTTP.
            std::mem::size_of::<F>()
        }
        let root = tempfile::tempdir().unwrap();
        private::directory(root.path()).unwrap();
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
        let catalog = Arc::new(directory::Catalog::default());
        let stop = CancellationToken::new();
        let (_sender, receiver) = mpsc::channel(1);
        let contents = Box::pin(content_owner(
            Weak::new(),
            0,
            binding.clone(),
            auth.clone(),
            client.clone(),
            control.clone(),
            stop.clone(),
            receiver,
        ));
        let directory = Box::pin(directory_owner(
            Weak::new(),
            0,
            &binding,
            &auth,
            &client,
            &control,
            &catalog,
            &stop,
        ));
        let content_bytes = std::mem::size_of_val(contents.as_ref().get_ref());
        let directory_bytes = std::mem::size_of_val(directory.as_ref().get_ref());
        let mut joined = Box::pin(join_owners(contents, directory, &stop));
        let joined_bytes = std::mem::size_of_val(joined.as_ref().get_ref());
        let (_, inline_receiver) = mpsc::channel(1);
        let inline_bytes = future_size(|| async {
            // Former concrete-child composition, measured but NEVER polled:
            // a failing baseline must not abort the test process with overflow.
            let contents = content_owner(
                Weak::new(),
                0,
                binding.clone(),
                auth.clone(),
                client.clone(),
                control.clone(),
                stop.clone(),
                inline_receiver,
            );
            let directory = directory_owner(
                Weak::new(),
                0,
                &binding,
                &auth,
                &client,
                &control,
                &catalog,
                &stop,
            );
            let (content, directory) = tokio::join!(
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
            content.and(directory)
        });
        let (_, receiver) = mpsc::channel(1);
        let worker_bytes = future_size(|| {
            run(
                Weak::new(),
                0,
                binding.clone(),
                auth.clone(),
                client.clone(),
                control.clone(),
                catalog.clone(),
                stop.clone(),
                receiver,
            )
        });
        eprintln!("owner future bytes: content={content_bytes} directory={directory_bytes} inline={inline_bytes} joined={joined_bytes} worker={worker_bytes}");
        assert!(
            inline_bytes > joined_bytes * 8,
            "measure the real child layout reduction"
        );
        assert!(
            joined_bytes <= 4096,
            "join must hold pinned handles, not child layouts"
        );
        assert!(
            worker_bytes <= 128 * 1024,
            "worker must not re-embed child layouts"
        );
        let (_, receiver) = mpsc::channel(1);
        let mut worker = Box::pin(run(
            Weak::new(),
            0,
            binding.clone(),
            auth.clone(),
            client.clone(),
            control.clone(),
            catalog.clone(),
            stop.clone(),
            receiver,
        ));
        // Poll the REAL owners, not dummy pending futures, below Tokio's normal
        // worker stack budget. Directory reaches the absent-owner fence before
        // summary/access-token/HTTP; content is genuinely paused and then drains.
        let handle = tokio::runtime::Handle::current();
        std::thread::scope(|scope| {
            std::thread::Builder::new()
                .name("account-owner-small-stack".into())
                .stack_size(512 * 1024)
                .spawn_scoped(scope, move || {
                    let _entered = handle.enter();
                    let mut cx = Context::from_waker(Waker::noop());
                    let mut drained = false;
                    for _ in 0..8 {
                        if let Poll::Ready(result) = joined.as_mut().poll(&mut cx) {
                            assert_eq!(result, Err(Error::Cancelled));
                            drained = true;
                            break;
                        }
                    }
                    assert!(drained, "cancelled directory must drain paused content");
                    // Also enter the REAL worker poll frame on this stack. The
                    // shared stop is now cancelled, so retry_sdk fences before
                    // HTTP and run performs its normal control/catalog/SDK close.
                    for _ in 0..8 {
                        if let Poll::Ready(result) = worker.as_mut().poll(&mut cx) {
                            assert!(result.is_err());
                            return;
                        }
                    }
                    panic!("cancelled worker must finish cleanup without HTTP");
                })
                .unwrap()
                .join()
                .unwrap();
        });
        assert!(stop.is_cancelled());
        assert!(client.device_session().await.is_none());
        assert!(!client.snapshot().remote_enabled);
    }
    #[tokio::test]
    async fn heap_pinned_owners_cancel_in_both_directions_but_wait_for_retirement() {
        for content_fails in [false, true] {
            let stop = CancellationToken::new();
            let (release, released) = oneshot::channel();
            let slow_stop = stop.clone();
            let slow = Box::pin(async move {
                slow_stop.cancelled().await;
                let _ = released.await;
                Ok(())
            });
            let fail = Box::pin(async { Err(Error::DirectoryUnavailable) });
            let mut joined: std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>>>> =
                if content_fails {
                    Box::pin(join_owners(fail, slow, &stop))
                } else {
                    Box::pin(join_owners(slow, fail, &stop))
                };
            std::future::poll_fn(|cx| {
                assert!(joined.as_mut().poll(cx).is_pending());
                std::task::Poll::Ready(())
            })
            .await;
            assert!(stop.is_cancelled());
            // Cancellation is not retirement: joined still owns the slow child.
            release.send(()).unwrap();
            assert_eq!(joined.await, Err(Error::DirectoryUnavailable));
        }
    }
    fn queued(
        cancellation: Arc<RequestCancellation>,
    ) -> (
        DeviceRequest,
        oneshot::Receiver<Result<()>>,
        Arc<Control>,
        Arc<enrollment::Gate>,
    ) {
        let control = Arc::new(Control::default());
        control.configure(true);
        let epoch = control.epoch().unwrap();
        let gate = Arc::new(enrollment::Gate::default());
        let weak = Arc::downgrade(&control);
        gate.bind_lifecycle(Arc::new(move || {
            weak.upgrade().is_some_and(|c| c.authorized(epoch))
        }));
        assert!(control.attach(epoch, CancellationToken::new(), gate.clone()));
        control.mark_ready(epoch);
        let permit = control.reserve(epoch, &cancellation).unwrap();
        let (done, receiver) = oneshot::channel();
        (
            DeviceRequest {
                target: directory::Row {
                    id: uuid::Uuid::new_v4().to_string(),
                    name: "Selected".into(),
                    online: true,
                    sync_available: false,
                    summary: None,
                    transport_device_id: None,
                    protocol_device_id: None,
                    noise_public_key: None,
                },
                direction: TransferDirection::Push,
                epoch,
                _permit: permit,
                cancellation,
                owner: Weak::new(),
                generation: 1,
                operation_id: uuid::Uuid::new_v4(),
                done,
            },
            receiver,
            control,
            gate,
        )
    }
    #[tokio::test]
    async fn request_deadline_before_dequeue_never_starts_and_remains_busy_until_receipt() {
        tokio::time::timeout(Duration::from_secs(3), async {
            let cancellation = Arc::new(RequestCancellation::new(Duration::from_millis(5)));
            let (request, receiver, control, gate) = queued(cancellation.clone());
            let waiter = tokio::spawn(wait_request(receiver, cancellation.clone()));
            cancellation.stop.cancelled().await;
            assert!(
                !waiter.is_finished(),
                "deadline is cancellation, not retirement"
            );
            assert!(!gate.is_current(), "late admission must already be fenced");
            assert!(
                control
                    .reserve(request.epoch, &Arc::new(RequestCancellation::default()))
                    .err()
                    == Some(Error::Busy)
            );
            let mut started = false;
            let result = execute_request(&cancellation, &CancellationToken::new(), async {
                started = true;
                Ok(())
            })
            .await;
            assert!(!started);
            request.complete(result);
            assert_eq!(waiter.await.unwrap(), Err(Error::Sync));
            assert!(!control.busy());
            assert!(gate.is_current());
        })
        .await
        .unwrap();
    }
    #[tokio::test]
    async fn dropped_ipc_waiter_cancels_before_dequeue_without_releasing_work_permit() {
        tokio::time::timeout(Duration::from_secs(3), async {
            let cancellation = Arc::new(RequestCancellation::default());
            let (request, receiver, control, gate) = queued(cancellation.clone());
            let mut waiter = Box::pin(wait_request(receiver, cancellation.clone()));
            std::future::poll_fn(|cx| {
                assert!(std::future::Future::poll(waiter.as_mut(), cx).is_pending());
                std::task::Poll::Ready(())
            })
            .await;
            drop(waiter);
            assert!(cancellation.stop.is_cancelled());
            assert!(control.busy());
            assert!(!gate.is_current());
            request.complete(Ok(()));
            assert!(!control.busy());
        })
        .await
        .unwrap();
    }
    #[tokio::test]
    async fn in_flight_deadline_waits_for_cleanup_and_late_success_is_not_success() {
        tokio::time::timeout(Duration::from_secs(3), async {
            let cancellation = Arc::new(RequestCancellation::new(Duration::from_millis(20)));
            let (request, receiver, control, gate) = queued(cancellation.clone());
            let (cleanup, released) = oneshot::channel();
            let entered = Arc::new(Notify::new());
            let task_entered = entered.clone();
            let task_cancellation = cancellation.clone();
            let work = tokio::spawn(async move {
                let stop = CancellationToken::new();
                let outcome = execute_request(&task_cancellation, &stop, async {
                    task_entered.notify_one();
                    stop.cancelled().await;
                    let _ = released.await; // deterministic delayed retirement
                    Ok(()) // late durable receipt cannot turn deadline into success
                })
                .await;
                request.complete(outcome);
            });
            entered.notified().await;
            let waiter = tokio::spawn(wait_request(receiver, cancellation.clone()));
            cancellation.stop.cancelled().await;
            assert!(!waiter.is_finished());
            assert!(!work.is_finished());
            assert!(control.busy());
            assert!(!gate.is_current());
            assert!(
                control
                    .reserve(
                        control.epoch().unwrap(),
                        &Arc::new(RequestCancellation::default())
                    )
                    .err()
                    == Some(Error::Busy)
            );
            cleanup.send(()).unwrap();
            work.await.unwrap();
            assert_eq!(waiter.await.unwrap(), Err(Error::Sync));
            assert!(!control.busy());
        })
        .await
        .unwrap();
    }
    #[tokio::test]
    async fn dropping_in_flight_waiter_cancels_execution_but_retains_permit_until_cleanup() {
        tokio::time::timeout(Duration::from_secs(3), async {
            let cancellation = Arc::new(RequestCancellation::default());
            let (request, receiver, control, gate) = queued(cancellation.clone());
            let (release, released) = oneshot::channel();
            let entered = Arc::new(Notify::new());
            let task_entered = entered.clone();
            let task_cancellation = cancellation.clone();
            let work = tokio::spawn(async move {
                let stop = CancellationToken::new();
                let outcome = execute_request(&task_cancellation, &stop, async {
                    task_entered.notify_one();
                    stop.cancelled().await;
                    let _ = released.await;
                    Ok(())
                })
                .await;
                assert_eq!(outcome, Err(Error::Cancelled));
                request.complete(outcome);
            });
            entered.notified().await;
            let mut waiter = Box::pin(wait_request(receiver, cancellation.clone()));
            std::future::poll_fn(|cx| {
                assert!(std::future::Future::poll(waiter.as_mut(), cx).is_pending());
                std::task::Poll::Ready(())
            })
            .await;
            drop(waiter);
            assert!(cancellation.stop.is_cancelled());
            assert!(!gate.is_current());
            assert!(control.busy());
            assert!(!work.is_finished());
            release.send(()).unwrap();
            work.await.unwrap();
            assert!(!control.busy());
        })
        .await
        .unwrap();
    }
    #[tokio::test]
    async fn paused_real_content_owner_rejects_actions_without_runtime_or_sdk_registration() {
        let root = tempfile::tempdir().unwrap();
        private::directory(root.path()).unwrap();
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
                cancellation: Arc::new(RequestCancellation::default()),
                owner: Weak::new(),
                generation: 0,
                operation_id: uuid::Uuid::new_v4(),
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
        let cancellation = Arc::new(RequestCancellation::default());
        let first = control.reserve(old, &cancellation).unwrap();
        assert!(control.reserve(old, &cancellation).err() == Some(Error::Busy));
        control.configure(false);
        control.configure(true);
        let new = control.epoch().unwrap();
        assert!(control.attach(
            new,
            CancellationToken::new(),
            Arc::new(enrollment::Gate::default())
        ));
        control.mark_ready(new);
        let second = control.reserve(new, &cancellation).unwrap();
        // A retired operation dropping after a new enable cannot release the
        // newer operation's reservation or make a second job admissible.
        drop(first);
        assert!(control.reserve(new, &cancellation).err() == Some(Error::Busy));
        drop(second);
        assert!(control.reserve(new, &cancellation).is_ok());
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
                fence.upgrade().is_some_and(|fence| fence.authorized(epoch))
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
            request=requests.recv()=>if let Some(request)=request { request.complete(Err(Error::SyncNotEnabled)); },
        }
    }
}
