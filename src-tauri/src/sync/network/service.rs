use super::*;
use std::{
    collections::{BTreeMap, BTreeSet},
    net::{SocketAddr, TcpListener},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Condvar,
    },
    thread,
};
use tokio::{
    runtime::Handle,
    sync::{watch, Notify},
    task::JoinSet,
    time::{sleep, timeout},
};
fn channel_error(error: mpsc::RecvTimeoutError) -> SyncError {
    match error {
        mpsc::RecvTimeoutError::Timeout => SyncError::Timeout,
        mpsc::RecvTimeoutError::Disconnected => SyncError::Transport,
    }
}
struct Worker {
    stop: watch::Sender<bool>,
    done: mpsc::Receiver<()>,
    abort: tokio::task::AbortHandle,
}
impl Worker {
    fn stop(self) -> Result<()> {
        let _ = self.stop.send(true);
        match self.done.recv_timeout(Duration::from_secs(7)) {
            Ok(()) => Ok(()),
            Err(error) => {
                self.abort.abort();
                Err(channel_error(error))
            }
        }
    }
}
#[derive(Clone)]
struct AccountWorker {
    stop: watch::Sender<bool>,
    abort: tokio::task::AbortHandle,
    retired: Arc<(Mutex<bool>, Condvar)>,
}
impl AccountWorker {
    fn stop(&self, budget: Duration) -> Result<()> {
        let _ = self.stop.send(true);
        let (lock, changed) = &*self.retired;
        let retired = lock.lock().map_err(|_| SyncError::Io)?;
        let (retired, _) = changed
            .wait_timeout_while(retired, budget, |retired| !*retired)
            .map_err(|_| SyncError::Io)?;
        if *retired {
            Ok(())
        } else {
            // Abort is only a request. The join observer alone clears the slot.
            self.abort.abort();
            Err(SyncError::Timeout)
        }
    }
}
struct AccountTask {
    peer_id: String,
    token: Arc<()>,
    worker: AccountWorker,
}
/// Owns a bounded Rust networking runtime. No installed application, microphone or UI timer is used.
pub struct SyncService {
    shared: Arc<Shared>,
    handle: Handle,
    shutdown: watch::Sender<bool>,
    thread: Option<thread::JoinHandle<()>>,
    listener: Mutex<Option<Worker>>,
    clients: Mutex<BTreeMap<String, Worker>>,
    account_task: Arc<Mutex<Option<AccountTask>>>,
    wake: Arc<Notify>,
    stopped: AtomicBool,
}
impl SyncService {
    pub fn new(
        backend: Arc<dyn SyncBackend>,
        identity: Arc<IdentityStore>,
        staging_directory: PathBuf,
    ) -> Result<Self> {
        Self::with_policy(backend, identity, staging_directory, None)
    }
    pub(crate) fn with_policy(
        backend: Arc<dyn SyncBackend>,
        identity: Arc<IdentityStore>,
        staging_directory: PathBuf,
        policy: Option<Arc<dyn ReplicationPolicy>>,
    ) -> Result<Self> {
        if backend.device_id()? != identity.device_id()? {
            return Err(SyncError::Authentication);
        }
        let shared = Arc::new(Shared {
            policy,
            account_operation: Arc::new(Mutex::new(false)),
            backend,
            identity,
            staging: staging::Staging::open(staging_directory)?,
            status: Mutex::new(ServiceStatus {
                listening: None,
                connections: vec![],
            }),
        });
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|_| SyncError::Io)?;
        let handle = runtime.handle().clone();
        let (shutdown, mut rx) = watch::channel(false);
        let thread = thread::Builder::new()
            .name("notes-sync".into())
            .spawn(move || {
                runtime.block_on(async {
                    let _ = rx.changed().await;
                });
                runtime.shutdown_timeout(Duration::from_secs(1));
            })
            .map_err(|_| SyncError::Io)?;
        Ok(Self {
            shared,
            handle,
            shutdown,
            thread: Some(thread),
            listener: Mutex::new(None),
            clients: Mutex::new(BTreeMap::new()),
            account_task: Arc::new(Mutex::new(None)),
            wake: Arc::new(Notify::new()),
            stopped: AtomicBool::new(false),
        })
    }
    fn active(&self) -> Result<()> {
        if self.stopped.load(Ordering::Acquire) {
            Err(SyncError::Stopped)
        } else {
            Ok(())
        }
    }
    pub fn status(&self) -> Result<ServiceStatus> {
        Ok(self
            .shared
            .status
            .lock()
            .map_err(|_| SyncError::Io)?
            .clone())
    }
    /// Explicit opt-in. Address is a local bind SocketAddr; an endpoint is never auto-published.
    pub fn start_listener(&self, address: SocketAddr) -> Result<SocketAddr> {
        self.active()?;
        let mut guard = self.listener.lock().map_err(|_| SyncError::Io)?;
        if guard.is_some() {
            return Err(SyncError::Busy);
        }
        let listener = TcpListener::bind(address).map_err(|_| SyncError::Transport)?;
        listener.set_nonblocking(true).map_err(|_| SyncError::Io)?;
        let address = listener.local_addr().map_err(|_| SyncError::Io)?;
        let (stop, rx) = watch::channel(false);
        let (done_tx, done) = mpsc::channel();
        let shared = self.shared.clone();
        let task = self.handle.spawn(async move {
            let result = listen_loop(shared.clone(), listener, rx).await;
            if let Ok(mut status) = shared.status.lock() {
                status.listening = None;
            }
            if let Err(error) = result {
                shared.status("listener", "error", Some(error), false);
            }
            let _ = done_tx.send(());
        });
        self.shared
            .status
            .lock()
            .map_err(|_| SyncError::Io)?
            .listening = Some(address.to_string());
        *guard = Some(Worker {
            stop,
            done,
            abort: task.abort_handle(),
        });
        Ok(address)
    }
    pub fn stop_listener(&self) -> Result<()> {
        if let Some(worker) = self.listener.lock().map_err(|_| SyncError::Io)?.take() {
            worker.stop()?;
        }
        Ok(())
    }
    pub fn invitation(&self, address: &str) -> Result<String> {
        self.active()?;
        if self.listener.lock().map_err(|_| SyncError::Io)?.is_none() {
            return Err(SyncError::Stopped);
        }
        self.shared
            .identity
            .invite(&self.shared.backend.workspace_id()?, address)?
            .token()
    }
    /// Persist authenticated provisional credentials BEFORE adopting SQLite workspace.
    /// If adoption/ready commit fails, pending_pairings + recover_pairing retain a retryable credential.
    pub fn pair(&self, token: &str) -> Result<PairingStatus> {
        self.active()?;
        let invite = PairingInvite::decode(token)?;
        if self.shared.policy.is_some() {
            let id = invite.invitation_id.clone();
            return self.account_action(&id, Duration::from_secs(27), move |s| async move {
                s.backend.prepare_pairing(&invite.workspace_id)?;
                let (peer, _socket) = pair_socket(&s, &invite).await?;
                s.status(&peer.invitation_id, "paired", None, false);
                Ok(PairingStatus::from(&peer))
            });
        }
        self.shared.backend.prepare_pairing(&invite.workspace_id)?;
        let id = invite.invitation_id.clone();
        let mut clients = self.clients.lock().map_err(|_| SyncError::Io)?;
        if clients.contains_key(&id) {
            return Err(SyncError::Busy);
        }
        if clients.len() >= 4 {
            return Err(SyncError::Limit);
        }
        let (stop, rx) = watch::channel(false);
        let (done_tx, done) = mpsc::channel();
        let (ready_tx, ready) = mpsc::channel();
        let s = self.shared.clone();
        let wake = self.wake.clone();
        let task = self.handle.spawn(async move {
            pair_loop(s, invite, rx, wake, ready_tx).await;
            let _ = done_tx.send(());
        });
        // Holding clients map avoids duplicate connection tasks for one credential. No Store lock.
        let result = ready
            .recv_timeout(Duration::from_secs(27))
            .unwrap_or_else(|error| Err(channel_error(error)));
        match result {
            Ok(info) => {
                clients.insert(
                    id,
                    Worker {
                        stop,
                        done,
                        abort: task.abort_handle(),
                    },
                );
                Ok(info)
            }
            Err(e) => {
                let _ = stop.send(true);
                let _ = done.recv_timeout(Duration::from_secs(1));
                Err(e)
            }
        }
    }
    pub fn pending_pairings(&self) -> Result<Vec<PairingStatus>> {
        Ok(self
            .shared
            .identity
            .pending_pairings()?
            .iter()
            .map(PairingStatus::from)
            .collect())
    }
    pub fn recover_pairing(&self, id: &str) -> Result<PairingStatus> {
        self.active()?;
        let p = self.shared.identity.credential(id)?;
        self.shared.backend.prepare_pairing(&p.workspace_id)?;
        self.shared.backend.adopt_workspace(&p.workspace_id)?;
        let p = self.shared.identity.commit_pairing(id)?;
        Ok(PairingStatus::from(&p))
    }
    /// Reconnect using only persisted credentials. Endpoint cannot change the pinned key/workspace.
    pub fn connect(&self, id: &str) -> Result<()> {
        self.active()?;
        let peer = self.shared.identity.peer(id)?;
        if self.shared.backend.workspace_id()? != peer.workspace_id {
            return Err(SyncError::WorkspaceMismatch);
        }
        if self.shared.policy.is_some() {
            return self.account_action(id, Duration::from_secs(27), move |s| async move {
                let _socket = account_socket(&s, &peer).await?;
                s.status(&peer.invitation_id, "connected", None, false);
                Ok(())
            });
        }
        let mut clients = self.clients.lock().map_err(|_| SyncError::Io)?;
        if clients.contains_key(id) {
            return Err(SyncError::Busy);
        }
        if clients.len() >= 4 {
            return Err(SyncError::Limit);
        }
        let (stop, rx) = watch::channel(false);
        let (done_tx, done) = mpsc::channel();
        let s = self.shared.clone();
        let wake = self.wake.clone();
        let task = self.handle.spawn(async move {
            client_loop(s, peer, None, rx, wake).await;
            let _ = done_tx.send(());
        });
        clients.insert(
            id.into(),
            Worker {
                stop,
                done,
                abort: task.abort_handle(),
            },
        );
        Ok(())
    }
    fn stop_account_task(&self, id: &str, budget: Duration) -> Result<()> {
        let account = self
            .account_task
            .lock()
            .map_err(|_| SyncError::Io)?
            .as_ref()
            .filter(|task| task.peer_id == id)
            .map(|task| task.worker.clone());
        if let Some(worker) = account {
            // A timeout retains the retiring slot; retries remain Busy until join.
            worker.stop(budget)?;
        }
        Ok(())
    }
    pub fn disconnect(&self, id: &str) -> Result<()> {
        self.stop_account_task(id, Duration::from_secs(7))?;
        if let Some(w) = self.clients.lock().map_err(|_| SyncError::Io)?.remove(id) {
            w.stop()?;
        }
        if self.shared.policy.is_none() {
            self.shared.status(id, "stopped", None, false);
        }
        Ok(())
    }
    pub fn revoke(&self, id: &str) -> Result<()> {
        self.shared.identity.revoke(id)?;
        self.disconnect(id)
    }
    pub fn sync_now(&self) -> Result<()> {
        self.active()?;
        if self.shared.policy.is_none() {
            self.wake.notify_waiters();
        }
        Ok(())
    }
    /// Account-only, selected pinned peer, one finite exchange. Success means durable
    /// version/blob receipts, never foreground application. No retry or retained worker.
    /// Call outside account lifecycle/Store locks; disconnect/shutdown cancels the action.
    pub fn transfer_once(&self, id: &str, direction: TransferDirection) -> Result<()> {
        self.active()?;
        if self.shared.policy.is_none() {
            return Err(SyncError::InvalidInput);
        }
        let peer = self.shared.identity.peer(id)?;
        self.account_action(id, ACCOUNT_TRANSFER_TIMEOUT, move |s| async move {
            let socket = account_socket(&s, &peer).await?;
            let mut client = Client {
                shared: s.clone(),
                peer,
                socket,
            };
            match client
                .rpc(wire::Request::BeginTransfer {
                    version: 1,
                    direction,
                })
                .await?
            {
                wire::Response::TransferReady {
                    version: 1,
                    direction: accepted,
                } if accepted == direction => {}
                _ => return Err(SyncError::Protocol),
            }
            s.status(&client.peer.invitation_id, "transferring", None, false);
            client.cycle(direction).await?;
            match client.rpc(wire::Request::FinishTransfer).await? {
                wire::Response::TransferComplete => {}
                _ => return Err(SyncError::Protocol),
            }
            s.status(&client.peer.invitation_id, "idle", None, true);
            Ok(())
        })
    }
    fn account_action<T, F, Fut>(&self, id: &str, budget: Duration, action: F) -> Result<T>
    where
        T: Send + 'static,
        F: FnOnce(Arc<Shared>) -> Fut + Send + 'static,
        Fut: std::future::Future<Output = Result<T>> + Send + 'static,
    {
        self.account_action_with_limits(
            id,
            budget,
            Duration::from_secs(1),
            Duration::from_secs(7),
            action,
        )
    }
    fn account_action_with_limits<T, F, Fut>(
        &self,
        id: &str,
        budget: Duration,
        caller_grace: Duration,
        cleanup_budget: Duration,
        action: F,
    ) -> Result<T>
    where
        T: Send + 'static,
        F: FnOnce(Arc<Shared>) -> Fut + Send + 'static,
        Fut: std::future::Future<Output = Result<T>> + Send + 'static,
    {
        let token = Arc::new(());
        let (result_tx, result_rx) = mpsc::channel();
        let worker = {
            let mut slot = self.account_task.lock().map_err(|_| SyncError::Io)?;
            self.active()?;
            if slot.is_some() {
                return Err(SyncError::Busy);
            }
            let permit = Arc::new(self.shared.reserve_account_operation()?);
            // Both the action future and join observer retain authority: aborting
            // or dropping either one cannot release it while the other still runs.
            let task_permit = permit.clone();
            self.shared.status(id, "connecting", None, false);
            let (stop, mut rx) = watch::channel(false);
            let retired = Arc::new((Mutex::new(false), Condvar::new()));
            let s = self.shared.clone();
            let peer_id = id.to_string();
            let task = self.handle.spawn(async move {
                let _permit = task_permit;
                let result = tokio::select! {
                    biased;
                    _=rx.changed()=>Err(SyncError::Stopped),
                    result=timeout(budget, action(s.clone()))=>result.unwrap_or(Err(SyncError::Timeout)),
                };
                if let Err(error) = &result { s.status(&peer_id, "error", Some(*error), false); }
                let _ = result_tx.send(result);
            });
            let worker = AccountWorker {
                stop,
                abort: task.abort_handle(),
                retired: retired.clone(),
            };
            *slot = Some(AccountTask {
                peer_id: id.into(),
                token: token.clone(),
                worker: worker.clone(),
            });
            let slots = self.account_task.clone();
            self.handle.spawn(async move {
                // Only observed task termination permits clearing this identity.
                let _ = task.await;
                drop(permit);
                if let Ok(mut slot) = slots.lock() {
                    if slot
                        .as_ref()
                        .is_some_and(|task| Arc::ptr_eq(&task.token, &token))
                    {
                        slot.take();
                    }
                }
                let (lock, changed) = &*retired;
                if let Ok(mut done) = lock.lock() {
                    *done = true;
                    changed.notify_all();
                }
            });
            worker
        };
        // No reservation mutex across either bounded caller wait or cleanup wait.
        let result = result_rx
            .recv_timeout(budget + caller_grace)
            .unwrap_or_else(|error| Err(channel_error(error)));
        worker.stop(cleanup_budget)?;
        result
    }
    pub fn shutdown(&mut self) -> Result<()> {
        if self.stopped.swap(true, Ordering::AcqRel) {
            return Ok(());
        }
        let mut error = self.stop_listener().err();
        let account = self
            .account_task
            .lock()
            .map_err(|_| SyncError::Io)?
            .as_ref()
            .map(|task| task.worker.clone());
        if let Some(worker) = account {
            if let Err(e) = worker.stop(Duration::from_secs(7)) {
                error.get_or_insert(e);
            }
        }
        match self.clients.lock() {
            Ok(mut clients) => {
                for (_, worker) in std::mem::take(&mut *clients) {
                    if let Err(e) = worker.stop() {
                        error.get_or_insert(e);
                    }
                }
            }
            Err(_) => {
                error.get_or_insert(SyncError::Io);
            }
        }
        let _ = self.shutdown.send(true);
        if let Some(t) = self.thread.take() {
            if t.join().is_err() {
                error.get_or_insert(SyncError::Io);
            }
        }
        match error {
            Some(e) => Err(e),
            None => Ok(()),
        }
    }
}
impl Drop for SyncService {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
}
async fn listen_loop(
    shared: Arc<Shared>,
    listener: TcpListener,
    mut stop: watch::Receiver<bool>,
) -> Result<()> {
    let listener = tokio::net::TcpListener::from_std(listener).map_err(|_| SyncError::Io)?;
    let mut workers = JoinSet::new();
    let result = loop {
        tokio::select! {
            _=stop.changed()=>break Ok(()),
            Some(_)=workers.join_next(),if !workers.is_empty()=>{},
            accepted=listener.accept()=>{
                let (stream,_)=match accepted {Ok(v)=>v,Err(_)=>break Err(SyncError::Transport)};
                if workers.len()>=4 {drop(stream);continue;}
                let shared=shared.clone();let stop=stop.clone();
                workers.spawn(async move {let _=transport::serve(shared,stream,stop).await;});
            }
        }
    };
    workers.abort_all();
    while workers.join_next().await.is_some() {}
    result
}
async fn pair_loop(
    shared: Arc<Shared>,
    invite: PairingInvite,
    mut stop: watch::Receiver<bool>,
    wake: Arc<Notify>,
    ready: mpsc::Sender<Result<PairingStatus>>,
) {
    let authentication = tokio::select! {
        result=timeout(NETWORK_TIMEOUT*5,transport::client(&shared,&invite))=>result.map_err(|_|SyncError::Timeout).and_then(|r|r),
        _=stop.changed()=>Err(SyncError::Stopped),
    };
    let (socket, device) = match authentication {
        Ok(value) => value,
        Err(error) => {
            shared.status(&invite.invitation_id, "error", Some(error), false);
            let _ = ready.send(Err(error));
            return;
        }
    };
    let preparation = (|| {
        shared.authorize(&device, &invite.host_key)?;
        let mut durable = invite.clone();
        if shared.policy.is_some() {
            durable.endpoint = "wss://account.invalid/".into();
        }
        let peer = shared.identity.remember_peer(&durable, &device)?;
        shared.backend.adopt_workspace(&peer.workspace_id)?;
        shared.identity.commit_pairing(&peer.invitation_id)
    })();
    match preparation {
        Ok(peer) => {
            let _ = ready.send(Ok(PairingStatus::from(&peer)));
            client_loop(shared, peer, Some(socket), stop, wake).await;
        }
        Err(error) => {
            shared.status(&invite.invitation_id, "pairing_pending", Some(error), false);
            let _ = ready.send(Err(error));
        }
    }
}
async fn pair_socket(
    shared: &Shared,
    invite: &PairingInvite,
) -> Result<(Peer, transport::SecureSocket)> {
    let (socket, device) = transport::client(shared, invite).await?;
    let peer = (|| {
        shared.authorize(&device, &invite.host_key)?;
        let mut durable = invite.clone();
        if shared.policy.is_some() {
            durable.endpoint = "wss://account.invalid/".into();
        }
        let peer = shared.identity.remember_peer(&durable, &device)?;
        shared.backend.adopt_workspace(&peer.workspace_id)?;
        shared.identity.commit_pairing(&peer.invitation_id)
    })()?;
    Ok((peer, socket))
}
async fn account_socket(shared: &Shared, peer: &Peer) -> Result<transport::SecureSocket> {
    shared.authorize(&peer.device_id, &peer.host_key)?;
    if shared.backend.workspace_id()? != peer.workspace_id {
        return Err(SyncError::WorkspaceMismatch);
    }
    let invite = PairingInvite {
        version: 1,
        workspace_id: peer.workspace_id.clone(),
        invitation_id: peer.invitation_id.clone(),
        endpoint: shared
            .policy
            .as_ref()
            .ok_or(SyncError::InvalidInput)?
            .endpoint(&peer.device_id)?,
        host_key: peer.host_key.clone(),
        psk: peer.psk.clone(),
        expires_at: 0,
    };
    let (socket, device) = transport::client(shared, &invite).await?;
    if device != peer.device_id {
        return Err(SyncError::Authentication);
    }
    shared.authorize(&peer.device_id, &peer.host_key)?;
    Ok(socket)
}
struct Client {
    shared: Arc<Shared>,
    peer: Peer,
    socket: transport::SecureSocket,
}
impl Client {
    fn authorized(&self) -> Result<()> {
        self.shared
            .authorize(&self.peer.device_id, &self.peer.host_key)?;
        let p = self.shared.identity.peer(&self.peer.invitation_id)?;
        if p.host_key != self.peer.host_key || p.device_id != self.peer.device_id {
            return Err(SyncError::Authentication);
        }
        if self.shared.backend.workspace_id()? != self.peer.workspace_id {
            return Err(SyncError::WorkspaceMismatch);
        }
        Ok(())
    }
    async fn rpc(&mut self, r: wire::Request) -> Result<wire::Response> {
        self.authorized()?;
        let value = self.socket.rpc(&r).await?;
        self.authorized()?;
        Ok(value)
    }
    async fn inventory(&mut self) -> Result<BTreeSet<String>> {
        let mut result = BTreeSet::new();
        let mut after = None;
        loop {
            let page = match self
                .rpc(wire::Request::Inventory {
                    after: after.clone(),
                    limit: PAGE_SIZE,
                })
                .await?
            {
                wire::Response::Inventory { page } => page,
                _ => return Err(SyncError::Protocol),
            };
            wire::validate_page(&page, after.as_deref(), PAGE_SIZE)?;
            result.extend(page.digests);
            if result.len() > 65536 {
                return Err(SyncError::Limit);
            }
            after = page.next;
            if after.is_none() {
                break;
            }
        }
        Ok(result)
    }
    async fn get_head(&mut self, id: &str) -> Result<Value> {
        let mut bytes = Vec::new();
        let mut size = None;
        loop {
            let (total, offset, data) = match self
                .rpc(wire::Request::Head {
                    digest: id.into(),
                    offset: bytes.len(),
                })
                .await?
            {
                wire::Response::Chunk {
                    total,
                    offset,
                    data,
                } => (total, offset, wire::bytes(&data)?),
                _ => return Err(SyncError::Protocol),
            };
            if total == 0
                || total > MAX_HEAD as u64
                || offset != bytes.len() as u64
                || size.is_some_and(|n| n != total)
                || data.is_empty()
                || offset + data.len() as u64 > total
            {
                return Err(SyncError::Protocol);
            }
            size = Some(total);
            bytes.extend(data);
            if bytes.len() as u64 == total {
                break;
            }
        }
        let value: Value = serde_json::from_slice(&bytes).map_err(|_| SyncError::Protocol)?;
        check_json(&value)?;
        if value.get("digest").and_then(Value::as_str) != Some(id) {
            return Err(SyncError::Protocol);
        }
        Ok(value)
    }
    async fn get_blob(&mut self, b: &BlobRef) -> Result<()> {
        let mut offset = self
            .shared
            .staging
            .offset(self.shared.backend.as_ref(), b)?;
        if offset == b.size && !self.shared.backend.has_blob(b)? {
            self.shared
                .staging
                .write(self.shared.backend.as_ref(), b, offset, &[], true)?;
        }
        while offset < b.size {
            let (total, returned, data) = match self
                .rpc(wire::Request::Blob {
                    blob: b.clone(),
                    offset,
                })
                .await?
            {
                wire::Response::Chunk {
                    total,
                    offset,
                    data,
                } => (total, offset, wire::bytes(&data)?),
                _ => return Err(SyncError::Protocol),
            };
            if total != b.size
                || returned != offset
                || data.len() != (b.size - offset).min(CHUNK as u64) as usize
            {
                return Err(SyncError::Protocol);
            }
            let end = offset + data.len() as u64;
            offset = self.shared.staging.write(
                self.shared.backend.as_ref(),
                b,
                offset,
                &data,
                end == b.size,
            )?;
        }
        if !self.shared.backend.has_blob(b)? {
            return Err(SyncError::Backend);
        }
        Ok(())
    }
    async fn put_blob(&mut self, b: &BlobRef) -> Result<()> {
        let mut offset = match self
            .rpc(wire::Request::BlobOffset { blob: b.clone() })
            .await?
        {
            wire::Response::Offset { offset } if offset <= b.size => offset,
            _ => return Err(SyncError::Protocol),
        };
        if offset == b.size {
            return match self
                .rpc(wire::Request::PutBlob {
                    blob: b.clone(),
                    offset,
                    data: String::new(),
                    finish: true,
                })
                .await?
            {
                wire::Response::Offset { offset } if offset == b.size => Ok(()),
                _ => Err(SyncError::Protocol),
            };
        }
        while offset < b.size {
            let data = self.shared.backend.read_blob_chunk(b, offset, CHUNK)?;
            if data.len() != (b.size - offset).min(CHUNK as u64) as usize {
                return Err(SyncError::Backend);
            }
            let end = offset + data.len() as u64;
            match self
                .rpc(wire::Request::PutBlob {
                    blob: b.clone(),
                    offset,
                    data: wire::encoded(&data),
                    finish: end == b.size,
                })
                .await?
            {
                wire::Response::Offset { offset: o } if o >= end && o <= b.size => offset = o,
                _ => return Err(SyncError::Protocol),
            }
        }
        Ok(())
    }
    async fn prepare_head(&mut self, id: &str, v: &Value) -> Result<()> {
        let data = serde_json::to_vec(v).map_err(|_| SyncError::Protocol)?;
        if data.is_empty() || data.len() > MAX_HEAD {
            return Err(SyncError::Limit);
        }
        let mut offset = 0;
        for chunk in data.chunks(CHUNK) {
            let end = offset + chunk.len();
            let response = self
                .rpc(wire::Request::PutHead {
                    digest: id.into(),
                    total: data.len(),
                    offset,
                    data: wire::encoded(chunk),
                })
                .await?;
            match response {
                wire::Response::Offset { offset: o } if end < data.len() && o == end as u64 => {}
                wire::Response::Prepared if end == data.len() => return Ok(()),
                _ => return Err(SyncError::Protocol),
            }
            offset = end;
        }
        Err(SyncError::Protocol)
    }
    async fn cycle(&mut self, direction: TransferDirection) -> Result<()> {
        self.authorized()?;
        self.shared.backend.flush()?;
        let remote = self.inventory().await?;
        let mut local = local_inventory(&self.shared)?;
        if direction.receives() {
            for id in remote.difference(&local) {
                let v = self.get_head(id).await?;
                for b in blobs(&self.shared, &v)? {
                    if !self.shared.backend.has_blob(&b)? {
                        self.get_blob(&b).await?;
                    }
                }
                if !self.shared.backend.receive_head(v)?.durable {
                    return Err(SyncError::Backend);
                }
            }
        }
        // Re-read after pull, as another device/local editor may have committed during transfer.
        if direction.sends() {
            local = local_inventory(&self.shared)?;
            for id in local.difference(&remote) {
                let v = self.shared.backend.version(id)?;
                check_json(&v)?;
                let refs = blobs(&self.shared, &v)?;
                self.prepare_head(id, &v).await?;
                for b in refs {
                    self.put_blob(&b).await?;
                }
                match self
                    .rpc(wire::Request::CommitHead { digest: id.clone() })
                    .await?
                {
                    wire::Response::Stored { receipt } if receipt.durable => {}
                    _ => return Err(SyncError::Protocol),
                }
            }
        }
        Ok(())
    }
}
fn local_inventory(s: &Shared) -> Result<BTreeSet<String>> {
    s.backend.flush()?;
    let mut set = BTreeSet::new();
    let mut after = None;
    loop {
        let p = s.backend.inventory(after.as_deref(), PAGE_SIZE)?;
        wire::validate_page(&p, after.as_deref(), PAGE_SIZE)?;
        set.extend(p.digests);
        if set.len() > 65536 {
            return Err(SyncError::Limit);
        }
        after = p.next;
        if after.is_none() {
            break;
        }
    }
    Ok(set)
}
async fn client_loop(
    shared: Arc<Shared>,
    peer: Peer,
    initial: Option<transport::SecureSocket>,
    mut stop: watch::Receiver<bool>,
    wake: Arc<Notify>,
) {
    let id = peer.invitation_id.clone();
    // Defense against accidentally routing an account caller through legacy workers.
    if shared.policy.is_some() {
        shared.status(&id, "error", Some(SyncError::Protocol), false);
        return;
    }
    let mut socket = initial;
    let mut backoff = Duration::from_millis(500);
    loop {
        if *stop.borrow() {
            break;
        }
        shared.status(&id, "connecting", None, false);
        let invite = PairingInvite {
            version: 1,
            workspace_id: peer.workspace_id.clone(),
            invitation_id: id.clone(),
            endpoint: match &shared.policy {
                Some(policy) => match policy.endpoint(&peer.device_id) {
                    Ok(endpoint) => endpoint,
                    Err(error) => {
                        shared.status(&id, "authorization_pending", Some(error), false);
                        tokio::select! {_=sleep(Duration::from_secs(2))=>{},_=wake.notified()=>{},_=stop.changed()=>break}
                        continue;
                    }
                },
                None => peer.endpoint.clone(),
            },
            host_key: peer.host_key.clone(),
            psk: peer.psk.clone(),
            expires_at: 0,
        };
        let connected = match socket.take() {
            Some(s) => Ok(s),
            None => {
                tokio::select! {r=transport::client(&shared,&invite)=>r.and_then(|(s,d)|if d==peer.device_id{Ok(s)}else{Err(SyncError::Authentication)}),_=stop.changed()=>break}
            }
        };
        let result: Result<()> = match connected {
            Ok(socket) => {
                let mut client = Client {
                    shared: shared.clone(),
                    peer: peer.clone(),
                    socket,
                };
                loop {
                    shared.status(&id, "transferring", None, false);
                    let cycle = tokio::select! {r=client.cycle(TransferDirection::Both)=>r,_=stop.changed()=>break Err(SyncError::Stopped)};
                    if let Err(e) = cycle {
                        break Err(e);
                    }
                    backoff = Duration::from_millis(500);
                    shared.status(&id, "idle", None, true);
                    tokio::select! {_=sleep(Duration::from_secs(2))=>{},_=wake.notified()=>{},_=stop.changed()=>break Err(SyncError::Stopped)}
                }
            }
            Err(e) => Err(e),
        };
        let e = result.unwrap_err();
        if e == SyncError::Stopped {
            break;
        }
        shared.status(&id, "error", Some(e), false);
        // Protocol, auth, invalid data and budget errors require explicit retry. Never hot-loop bad heads.
        if !matches!(
            e,
            SyncError::Transport | SyncError::Timeout | SyncError::Io | SyncError::PlanStale
        ) {
            tokio::select! {_=wake.notified()=>{},_=stop.changed()=>break}
        } else {
            tokio::select! {_=sleep(backoff)=>{},_=wake.notified()=>{},_=stop.changed()=>break}
            backoff = (backoff * 2).min(Duration::from_secs(30));
        }
    }
    shared.status(&id, "stopped", None, false);
}

#[cfg(test)]
mod channel_tests {
    use super::*;
    struct UnusedBackend(String, String);
    macro_rules! unused_backend {
        ($name:ident($($arg:ident:$ty:ty),*) -> $out:ty) => {
            fn $name(&self, $($arg:$ty),*) -> Result<$out> {
                $(let _ = $arg;)*
                panic!("account task deadline must not access backend")
            }
        };
    }
    impl SyncBackend for UnusedBackend {
        fn device_id(&self) -> Result<String> {
            Ok(self.0.clone())
        }
        fn workspace_id(&self) -> Result<String> {
            Ok(self.1.clone())
        }
        unused_backend!(prepare_pairing(workspace: &str) -> ());
        unused_backend!(adopt_workspace(workspace: &str) -> ());
        unused_backend!(flush() -> ());
        unused_backend!(inventory(after: Option<&str>, limit: usize) -> InventoryPage);
        unused_backend!(version(digest: &str) -> Value);
        unused_backend!(required_blobs(version: &Value) -> Vec<BlobRef>);
        unused_backend!(has_blob(blob: &BlobRef) -> bool);
        unused_backend!(read_blob_chunk(blob: &BlobRef, offset: u64, max: usize) -> Vec<u8>);
        unused_backend!(store_blob(blob: &BlobRef, source: &Path) -> ());
        unused_backend!(receive_head(version: Value) -> Receipt);
    }
    struct UnusedPolicy;
    impl ReplicationPolicy for UnusedPolicy {
        fn authorize(&self, _: &str, _: &str) -> Result<()> {
            Ok(())
        }
        fn endpoint(&self, _: &str) -> Result<String> {
            Err(SyncError::Transport)
        }
    }
    #[test]
    fn account_action_deadline_retires_task_and_allows_only_explicit_retry() {
        let dir = tempfile::tempdir().unwrap();
        let device = uuid::Uuid::new_v4().to_string();
        let backend = Arc::new(UnusedBackend(
            device.clone(),
            uuid::Uuid::new_v4().to_string(),
        ));
        let identity =
            Arc::new(IdentityStore::open(&dir.path().join("identity"), &device).unwrap());
        let service = SyncService::with_policy(
            backend,
            identity,
            dir.path().join("stage"),
            Some(Arc::new(UnusedPolicy)),
        )
        .unwrap();
        let started = std::time::Instant::now();
        assert_eq!(
            service.account_action("deadline", Duration::from_millis(30), |_| {
                std::future::pending::<Result<()>>()
            }),
            Err(SyncError::Timeout)
        );
        assert!(started.elapsed() < Duration::from_secs(2));
        assert!(service.account_task.lock().unwrap().is_none());
        assert_eq!(
            service.account_action("explicit-retry", Duration::from_secs(1), |_| async {
                Ok(())
            }),
            Ok(())
        );
        assert!(service.account_task.lock().unwrap().is_none());
    }
    #[tokio::test(flavor = "current_thread")]
    async fn active_and_passive_contenders_share_one_nonqueueing_permit() {
        let dir = tempfile::tempdir().unwrap();
        let device = uuid::Uuid::new_v4().to_string();
        let workspace = uuid::Uuid::new_v4().to_string();
        let service = Arc::new(
            SyncService::with_policy(
                Arc::new(UnusedBackend(device.clone(), workspace.clone())),
                Arc::new(IdentityStore::open(&dir.path().join("identity"), &device).unwrap()),
                dir.path().join("stage"),
                Some(Arc::new(UnusedPolicy)),
            )
            .unwrap(),
        );
        let address = service
            .start_listener("127.0.0.1:0".parse().unwrap())
            .unwrap();
        let invite =
            PairingInvite::decode(&service.invitation(&format!("ws://{address}/")).unwrap())
                .unwrap();
        let client_dir = tempfile::tempdir().unwrap();
        let client_device = uuid::Uuid::new_v4().to_string();
        let client_service = SyncService::new(
            Arc::new(UnusedBackend(client_device.clone(), workspace)),
            Arc::new(
                IdentityStore::open(&client_dir.path().join("identity"), &client_device).unwrap(),
            ),
            client_dir.path().join("stage"),
        )
        .unwrap();
        let (mut passive, _) = transport::client(&client_service.shared, &invite)
            .await
            .unwrap();
        let (started_tx, started) = mpsc::channel();
        let active_service = service.clone();
        let active = thread::spawn(move || {
            active_service.account_action("local-active", Duration::from_secs(2), |_| async move {
                started_tx.send(()).unwrap();
                std::future::pending::<Result<()>>().await
            })
        });
        started.recv_timeout(Duration::from_secs(1)).unwrap();
        // Rejected socket must never reach any of the panic-on-use business methods.
        assert!(matches!(
            passive
                .rpc(&wire::Request::BeginTransfer {
                    version: 1,
                    direction: TransferDirection::Push,
                })
                .await,
            Err(SyncError::Busy)
        ));
        assert!(passive
            .rpc(&wire::Request::Inventory {
                after: None,
                limit: 1
            })
            .await
            .is_err());
        service.disconnect("local-active").unwrap();
        assert_eq!(active.join().unwrap(), Err(SyncError::Stopped));
        let (mut passive, _) = transport::client(&client_service.shared, &invite)
            .await
            .unwrap();
        assert!(matches!(
            passive
                .rpc(&wire::Request::BeginTransfer {
                    version: 1,
                    direction: TransferDirection::Pull,
                })
                .await,
            Ok(wire::Response::TransferReady { .. })
        ));
        assert_eq!(
            service.account_action("local-contender", Duration::from_secs(1), |_| async {
                panic!("rejected active action must not run")
            }),
            Err::<(), _>(SyncError::Busy)
        );
        passive.rpc(&wire::Request::FinishTransfer).await.unwrap();
        // Explicit retries have no internal queue; wait for the permit's actual release.
        let deadline = std::time::Instant::now() + Duration::from_secs(1);
        loop {
            match service.account_action("explicit", Duration::from_secs(1), |_| async { Ok(()) }) {
                Ok(()) => break,
                Err(SyncError::Busy) if std::time::Instant::now() < deadline => {
                    thread::sleep(Duration::from_millis(1))
                }
                result => panic!("unexpected explicit retry result: {result:?}"),
            }
        }
    }
    #[test]
    fn simultaneous_opposite_initiations_reject_without_retaining_either_permit() {
        let dir_a = tempfile::tempdir().unwrap();
        let dir_b = tempfile::tempdir().unwrap();
        let workspace = uuid::Uuid::new_v4().to_string();
        let make = |dir: &Path| {
            let device = uuid::Uuid::new_v4().to_string();
            let service = Arc::new(
                SyncService::with_policy(
                    Arc::new(UnusedBackend(device.clone(), workspace.clone())),
                    Arc::new(IdentityStore::open(&dir.join("identity"), &device).unwrap()),
                    dir.join("stage"),
                    Some(Arc::new(UnusedPolicy)),
                )
                .unwrap(),
            );
            let address = service
                .start_listener("127.0.0.1:0".parse().unwrap())
                .unwrap();
            let invite =
                PairingInvite::decode(&service.invitation(&format!("ws://{address}/")).unwrap())
                    .unwrap();
            (service, invite)
        };
        let (a, invite_a) = make(dir_a.path());
        let (b, invite_b) = make(dir_b.path());
        let admission = Arc::new(tokio::sync::Barrier::new(2));
        let rejection = Arc::new(tokio::sync::Barrier::new(2));
        let start = |service: Arc<SyncService>, invite, direction| {
            let admission = admission.clone();
            let rejection = rejection.clone();
            thread::spawn(move || {
                service.account_action("opposite", Duration::from_secs(2), move |s| async move {
                    admission.wait().await;
                    let (mut socket, _) = transport::client(&s, &invite).await?;
                    let result = socket
                        .rpc(&wire::Request::BeginTransfer {
                            version: 1,
                            direction,
                        })
                        .await;
                    // Keep each active permit until both passive admissions have answered.
                    rejection.wait().await;
                    match result {
                        Err(error) => Err(error),
                        Ok(_) => Err(SyncError::Protocol),
                    }
                })
            })
        };
        let left = start(a.clone(), invite_b, TransferDirection::Push);
        let right = start(b.clone(), invite_a, TransferDirection::Pull);
        assert_eq!(left.join().unwrap(), Err::<(), _>(SyncError::Busy));
        assert_eq!(right.join().unwrap(), Err::<(), _>(SyncError::Busy));
        for service in [a, b] {
            assert!(service.account_task.lock().unwrap().is_none());
            assert_eq!(
                service.account_action("explicit-retry", Duration::from_secs(1), |_| async {
                    Ok(())
                }),
                Ok(())
            );
        }
    }
    struct BlockingBackend {
        device: String,
        entered: mpsc::Sender<()>,
        release: Mutex<mpsc::Receiver<()>>,
        calls: std::sync::atomic::AtomicUsize,
    }
    impl SyncBackend for BlockingBackend {
        fn device_id(&self) -> Result<String> {
            Ok(self.device.clone())
        }
        fn flush(&self) -> Result<()> {
            if self.calls.fetch_add(1, Ordering::SeqCst) == 0 {
                self.entered.send(()).unwrap();
                // Deliberately blocks the runtime thread, not an async pending future.
                self.release.lock().unwrap().recv().unwrap();
            }
            Ok(())
        }
        unused_backend!(workspace_id() -> String);
        unused_backend!(prepare_pairing(workspace: &str) -> ());
        unused_backend!(adopt_workspace(workspace: &str) -> ());
        unused_backend!(inventory(after: Option<&str>, limit: usize) -> InventoryPage);
        unused_backend!(version(digest: &str) -> Value);
        unused_backend!(required_blobs(version: &Value) -> Vec<BlobRef>);
        unused_backend!(has_blob(blob: &BlobRef) -> bool);
        unused_backend!(read_blob_chunk(blob: &BlobRef, offset: u64, max: usize) -> Vec<u8>);
        unused_backend!(store_blob(blob: &BlobRef, source: &Path) -> ());
        unused_backend!(receive_head(version: Value) -> Receipt);
    }
    fn blocked_backend_retirement(disconnect: bool) {
        let dir = tempfile::tempdir().unwrap();
        let device = uuid::Uuid::new_v4().to_string();
        let (entered_tx, entered) = mpsc::channel();
        let (release, release_rx) = mpsc::channel();
        let backend = Arc::new(BlockingBackend {
            device: device.clone(),
            entered: entered_tx,
            release: Mutex::new(release_rx),
            calls: std::sync::atomic::AtomicUsize::new(0),
        });
        let service = Arc::new(
            SyncService::with_policy(
                backend.clone(),
                Arc::new(IdentityStore::open(&dir.path().join("identity"), &device).unwrap()),
                dir.path().join("stage"),
                Some(Arc::new(UnusedPolicy)),
            )
            .unwrap(),
        );
        let caller_service = service.clone();
        let caller = thread::spawn(move || {
            caller_service.account_action_with_limits(
                "held",
                Duration::from_millis(80),
                Duration::from_millis(10),
                Duration::from_millis(20),
                |s| async move { s.backend.flush() },
            )
        });
        entered.recv_timeout(Duration::from_secs(2)).unwrap();
        if disconnect {
            assert_eq!(
                service.stop_account_task("held", Duration::from_millis(20)),
                Err(SyncError::Timeout)
            );
        }
        assert_eq!(caller.join().unwrap(), Err(SyncError::Timeout));
        assert!(service.account_task.lock().unwrap().is_some());
        assert_eq!(
            service.account_action("replacement", Duration::from_secs(1), |s| async move {
                s.backend.flush()
            }),
            Err(SyncError::Busy)
        );
        assert!(matches!(
            service.shared.reserve_account_operation(),
            Err(SyncError::Busy)
        ));
        assert_eq!(backend.calls.load(Ordering::SeqCst), 1);
        release.send(()).unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(2);
        while service.account_task.lock().unwrap().is_some() {
            assert!(
                std::time::Instant::now() < deadline,
                "join did not retire the slot"
            );
            thread::sleep(Duration::from_millis(1));
        }
        assert_eq!(
            service.account_action("explicit-retry", Duration::from_secs(1), |s| async move {
                s.backend.flush()
            }),
            Ok(())
        );
        assert_eq!(backend.calls.load(Ordering::SeqCst), 2);
    }
    #[test]
    fn synchronous_backend_outer_timeout_keeps_busy_until_join() {
        blocked_backend_retirement(false);
    }
    #[test]
    fn synchronous_backend_disconnect_keeps_busy_until_join() {
        blocked_backend_retirement(true);
    }
    #[test]
    fn ready_channel_disconnect_is_transport_and_elapsed_wait_is_timeout() {
        let (tx, rx) = mpsc::channel::<()>();
        assert_eq!(
            channel_error(rx.recv_timeout(Duration::from_millis(1)).unwrap_err()),
            SyncError::Timeout
        );
        drop(tx);
        assert_eq!(
            channel_error(rx.recv_timeout(Duration::from_secs(27)).unwrap_err()),
            SyncError::Transport
        );
    }
}
