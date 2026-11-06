use super::*;
use std::{
    collections::{BTreeMap, BTreeSet},
    net::{SocketAddr, TcpListener},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    thread,
};
use tokio::{
    runtime::Handle,
    sync::{watch, Notify},
    task::JoinSet,
    time::{sleep, timeout},
};
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
            Err(_) => {
                self.abort.abort();
                Err(SyncError::Timeout)
            }
        }
    }
}
/// Owns a bounded Rust networking runtime. No installed application, microphone or UI timer is used.
pub struct SyncService {
    shared: Arc<Shared>,
    handle: Handle,
    shutdown: watch::Sender<bool>,
    thread: Option<thread::JoinHandle<()>>,
    listener: Mutex<Option<Worker>>,
    clients: Mutex<BTreeMap<String, Worker>>,
    wake: Arc<Notify>,
    stopped: AtomicBool,
}
impl SyncService {
    pub fn new(
        backend: Arc<dyn SyncBackend>,
        identity: Arc<IdentityStore>,
        staging_directory: PathBuf,
    ) -> Result<Self> {
        if backend.device_id()? != identity.device_id()? {
            return Err(SyncError::Authentication);
        }
        let shared = Arc::new(Shared {
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
            .map_err(|_| SyncError::Timeout)?;
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
    pub fn disconnect(&self, id: &str) -> Result<()> {
        if let Some(w) = self.clients.lock().map_err(|_| SyncError::Io)?.remove(id) {
            w.stop()?;
        }
        self.shared.status(id, "stopped", None, false);
        Ok(())
    }
    pub fn revoke(&self, id: &str) -> Result<()> {
        self.shared.identity.revoke(id)?;
        self.disconnect(id)
    }
    pub fn sync_now(&self) -> Result<()> {
        self.active()?;
        self.wake.notify_waiters();
        Ok(())
    }
    pub fn shutdown(&mut self) -> Result<()> {
        if self.stopped.swap(true, Ordering::AcqRel) {
            return Ok(());
        }
        let mut error = self.stop_listener().err();
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
        let peer = shared.identity.remember_peer(&invite, &device)?;
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
struct Client {
    shared: Arc<Shared>,
    peer: Peer,
    socket: transport::SecureSocket,
}
impl Client {
    fn authorized(&self) -> Result<()> {
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
    async fn cycle(&mut self) -> Result<()> {
        self.authorized()?;
        self.shared.backend.flush()?;
        let remote = self.inventory().await?;
        let mut local = local_inventory(&self.shared)?;
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
        // Re-read after pull, as another device/local editor may have committed during transfer.
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
            endpoint: peer.endpoint.clone(),
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
                    let cycle = tokio::select! {r=client.cycle()=>r,_=stop.changed()=>break Err(SyncError::Stopped)};
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
        if !matches!(e, SyncError::Transport | SyncError::Timeout | SyncError::Io) {
            tokio::select! {_=wake.notified()=>{},_=stop.changed()=>break}
        } else {
            tokio::select! {_=sleep(backoff)=>{},_=wake.notified()=>{},_=stop.changed()=>break}
            backoff = (backoff * 2).min(Duration::from_secs(30));
        }
    }
    shared.status(&id, "stopped", None, false);
}
