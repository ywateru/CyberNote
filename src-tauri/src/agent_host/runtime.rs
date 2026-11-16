use super::{
    files::{self, PrivateDir, SocketGuard},
    types::*,
};
use crate::{
    agent_access::{Revocation, TrustedContext},
    application::{ToolError, ToolResult},
};
use futures_util::FutureExt;
use rand::RngCore;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeSet, HashMap, VecDeque},
    fs::File,
    future::Future,
    io::Write,
    path::PathBuf,
    pin::Pin,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{UnixListener, UnixStream},
    sync::{watch, Semaphore},
    task::{JoinHandle, JoinSet},
    time::{timeout, Instant},
};
use uuid::Uuid;

pub type HandlerFuture = Pin<Box<dyn Future<Output = ToolResult<Value>> + Send + 'static>>;
/// Implement using the existing process-owned application service and its coordinator.
/// The handler must enforce strict tool DTOs, note/folder visibility, incarnation and
/// context checks at read/commit/delivery. Cancellation must abort/release pre-commit
/// barriers; committed writes remain recoverable using the original idempotency key.
/// It must never open another Store. notes_get_operation checks original tool scope.
/// Capabilities come from the real application (actual context grants and service session).
pub trait ApplicationHandler: Send + Sync + 'static {
    fn call(&self, context: TrustedContext, tool: String, arguments: Value) -> HandlerFuture;
}
impl<F, Fut> ApplicationHandler for F
where
    F: Fn(TrustedContext, String, Value) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = ToolResult<Value>> + Send + 'static,
{
    fn call(&self, context: TrustedContext, tool: String, arguments: Value) -> HandlerFuture {
        Box::pin(self(context, tool, arguments))
    }
}

pub struct HostConfig {
    /// Absolute private directory, with an existing non-symlink parent. No implicit fallback.
    pub runtime_dir: PathBuf,
    /// Read from the live application's identity, never from tool arguments.
    pub workspace_id: String,
    pub incarnation: String,
}
impl HostConfig {
    /// macOS application support location; callers may supply a shorter private directory.
    /// Other Unix development platforms deliberately require an explicit runtime_dir.
    #[cfg(target_os = "macos")]
    pub fn macos_default(workspace_id: String, incarnation: String) -> ToolResult<Self> {
        let home = std::env::var_os("HOME").ok_or_else(files::invalid)?;
        Ok(Self {
            runtime_dir: PathBuf::from(home)
                .join("Library/Application Support/com.local.notesclone/agent-runtime"),
            workspace_id,
            incarnation,
        })
    }
}
struct Cached {
    context: TrustedContext,
    revocation: Revocation,
}
struct Limits {
    reads: Arc<Semaphore>,
    write: Arc<Semaphore>,
    write_slots: Arc<Semaphore>,
}
impl Limits {
    fn new() -> Self {
        Self {
            reads: Arc::new(Semaphore::new(4)),
            write: Arc::new(Semaphore::new(1)),
            write_slots: Arc::new(Semaphore::new(9)),
        }
    }
}
struct State {
    enabled: bool,
    grants: Vec<StoredGrant>,
    contexts: HashMap<String, Cached>,
    clients: HashMap<String, Arc<Limits>>,
    audit: VecDeque<AuditEntry>,
    // An unsuccessful durable mutation prevents restart until a successful flush.
    dirty: bool,
}
struct Run {
    shutdown: watch::Sender<bool>,
    task: JoinHandle<()>,
}
struct Inner {
    config: HostConfig,
    session: String,
    registry_leaf: String,
    socket_basename: String,
    runtime: PrivateDir,
    credentials: PrivateDir,
    _lock: File,
    handler: Arc<dyn ApplicationHandler>,
    state: Mutex<State>,
}
/// One host per workspace in a shared runtime directory. Opening is always disabled.
/// Lifecycle methods require &mut self; settings/grants may be called concurrently.
pub struct AgentHost {
    inner: Arc<Inner>,
    run: Option<Run>,
}
fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}
fn error(code: &str, message: &str) -> ToolError {
    ToolError::new(code, message)
}
fn identity(value: &str) -> bool {
    !value.is_empty() && value.len() <= 128 && !value.chars().any(char::is_control)
}
fn digest(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}
fn bounded_json(value: &impl serde::Serialize, limit: usize) -> Result<Vec<u8>, serde_json::Error> {
    struct Buffer {
        bytes: Vec<u8>,
        limit: usize,
    }
    impl Write for Buffer {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            if bytes.len() > self.limit.saturating_sub(self.bytes.len()) {
                return Err(std::io::Error::other("Agent JSON size limit"));
            }
            self.bytes.extend_from_slice(bytes);
            Ok(bytes.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let mut buffer = Buffer {
        bytes: Vec::new(),
        limit,
    };
    serde_json::to_writer(&mut buffer, value)?;
    Ok(buffer.bytes)
}
fn matches_hash(a: &str, b: &str) -> bool {
    a.len() == 64
        && b.len() == 64
        && a.as_bytes()
            .iter()
            .zip(b.as_bytes())
            .fold(0u8, |v, (a, b)| v | (a ^ b))
            == 0
}
fn credential_leaf(reference: &str) -> ToolResult<String> {
    let parsed = Uuid::parse_str(reference).map_err(|_| files::invalid())?;
    if parsed.to_string() != reference {
        return Err(files::invalid());
    }
    Ok(format!("{reference}.json"))
}
fn context(info: &GrantInfo) -> ToolResult<Cached> {
    let (context, revocation) = TrustedContext::from_verified_grant(
        info.client_id.clone(),
        info.grant_id.clone(),
        info.workspace_id.clone(),
        info.incarnation.clone(),
        info.scopes.clone(),
        info.folder_ids.clone(),
        info.expires_at,
        info.revocation,
    )?;
    Ok(Cached {
        context,
        revocation,
    })
}
fn validate_info(info: &GrantInfo, workspace: &str, incarnation: &str) -> ToolResult<()> {
    if !identity(&info.client_id)
        || info.workspace_id != workspace
        || info.incarnation != incarnation
        || Uuid::parse_str(&info.grant_id).is_err()
        || info.scopes.is_empty()
        || info.folder_ids.is_empty()
        || info.folder_ids.len() > 10_000
        || info
            .scopes
            .iter()
            .any(|s| !matches!(s.as_str(), "notes:read" | "notes:create" | "notes:update"))
    {
        return Err(files::invalid());
    }
    credential_leaf(&info.credential_ref)?;
    // Validate even expired/revoked persistent entries using the same authority constructor.
    let mut checked = info.clone();
    checked.expires_at = now().saturating_add(60_000);
    context(&checked)?;
    Ok(())
}
impl Inner {
    fn state(&self) -> ToolResult<std::sync::MutexGuard<'_, State>> {
        self.state.lock().map_err(|_| files::invalid())
    }
    fn persist(&self, state: &State) -> ToolResult<()> {
        let bytes = bounded_json(
            &Registry {
                version: 1,
                workspace_id: self.config.workspace_id.clone(),
                incarnation: self.config.incarnation.clone(),
                grants: state.grants.clone(),
            },
            4 * 1024 * 1024,
        )
        .map_err(|_| error("RATE_LIMITED", "Grant registry limit reached"))?;
        self.runtime.write(&self.registry_leaf, &bytes)
    }
    fn disable(state: &mut State) {
        state.enabled = false;
        for cached in state.contexts.values() {
            cached.revocation.revoke();
        }
        state.contexts.clear();
    }
    fn check(&self, state: &State, grant_id: &str, tool: &str) -> ToolResult<TrustedContext> {
        if !state.enabled {
            return Err(error("HOST_UNAVAILABLE", "Agent access is disabled"));
        }
        let grant = state
            .grants
            .iter()
            .find(|g| g.info.grant_id == grant_id)
            .ok_or_else(|| error("UNAUTHORIZED", "Invalid or expired grant"))?;
        if grant.info.revoked || grant.info.expires_at <= now() {
            return Err(error("UNAUTHORIZED", "Invalid or expired grant"));
        }
        let cached = state
            .contexts
            .get(grant_id)
            .ok_or_else(|| error("UNAUTHORIZED", "Invalid or expired grant"))?;
        cached.context.check(
            &self.config.workspace_id,
            &self.config.incarnation,
            scope(tool),
        )?;
        Ok(cached.context.clone())
    }
    fn authenticate(&self, req: &HostRequest) -> ToolResult<(String, TrustedContext, Arc<Limits>)> {
        let state = self.state()?;
        if req.workspace_id != self.config.workspace_id {
            return Err(error(
                "WORKSPACE_UNAVAILABLE",
                "Bound workspace is unavailable",
            ));
        }
        if req.credential.len() != 64 || !req.credential.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(error("UNAUTHORIZED", "Invalid or expired grant"));
        }
        let hash = digest(&req.credential);
        let grant = state
            .grants
            .iter()
            .find(|g| g.info.client_id == req.client_id && matches_hash(&hash, &g.credential_hash))
            .ok_or_else(|| error("UNAUTHORIZED", "Invalid or expired grant"))?;
        let ctx = self.check(&state, &grant.info.grant_id, &req.tool)?;
        // Only explicit physical IDs. Object-derived folder authorization remains in application.
        if let Some(Value::String(folder)) = req.arguments.get("folderId") {
            if !grant.info.folder_ids.contains(folder) {
                return Err(error("NOT_FOUND", "Object is not visible"));
            }
        }
        let limits = state
            .clients
            .get(&req.client_id)
            .cloned()
            .ok_or_else(files::invalid)?;
        Ok((grant.info.grant_id.clone(), ctx, limits))
    }
    fn audit(&self, req: &HostRequest, outcome: &str, note: Option<&str>) {
        // Only fixed tool names and validated, authenticated client IDs can reach here.
        if let Ok(mut state) = self.state() {
            if state.audit.len() == MAX_AUDIT {
                state.audit.pop_front();
            }
            state.audit.push_back(AuditEntry {
                client_id: req.client_id.clone(),
                tool: req.tool.clone(),
                note_id: note
                    .filter(|s| crate::sync::model::valid_id(s))
                    .map(str::to_owned),
                at: now(),
                outcome: outcome.to_owned(),
            });
        }
    }
}
impl AgentHost {
    pub fn open(config: HostConfig, handler: Arc<dyn ApplicationHandler>) -> ToolResult<Self> {
        if !identity(&config.workspace_id) || !identity(&config.incarnation) {
            return Err(files::invalid());
        }
        let runtime = PrivateDir::open(config.runtime_dir.clone())?;
        let workspace_hash = digest(&config.workspace_id);
        let registry_leaf = format!("grants-{}.json", &workspace_hash[..12]);
        let lock = runtime.lock(&format!("host-{}.lock", &workspace_hash[..12]))?;
        let credentials = PrivateDir::open(runtime.path.join("credentials"))?;
        let session = Uuid::new_v4().to_string();
        let socket_basename = format!(
            "{}.sock",
            &digest(&format!("{}:{session}", config.workspace_id))[..12]
        );
        runtime.socket_path(&socket_basename)?;
        let mut grants = Vec::new();
        if let Some(bytes) = runtime.read(&registry_leaf, 4 * 1024 * 1024)? {
            let saved: Registry = serde_json::from_slice(&bytes).map_err(|_| files::invalid())?;
            if saved.version != 1 || saved.grants.len() > MAX_GRANTS {
                return Err(files::invalid());
            }
            if saved.workspace_id != config.workspace_id || saved.incarnation != config.incarnation
            {
                // An imported/restored/switched library never inherits external authority.
                // Do not silently overwrite another identity's registry. Reset requires an
                // explicit app-managed new private runtime directory (or cleanup while stopped).
                return Err(error(
                    "WORKSPACE_UNAVAILABLE",
                    "Agent registry belongs to another workspace incarnation",
                ));
            }
            let mut ids = BTreeSet::new();
            let mut refs = BTreeSet::new();
            let mut hashes = BTreeSet::new();
            for g in &saved.grants {
                validate_info(&g.info, &config.workspace_id, &config.incarnation)?;
                if g.credential_hash.len() != 64
                    || !g.credential_hash.bytes().all(|b| b.is_ascii_hexdigit())
                    || !ids.insert(&g.info.grant_id)
                    || !refs.insert(&g.info.credential_ref)
                    || !hashes.insert(&g.credential_hash)
                {
                    return Err(files::invalid());
                }
            }
            grants = saved.grants;
        }
        let clients = grants
            .iter()
            .map(|g| (g.info.client_id.clone(), Arc::new(Limits::new())))
            .collect();
        Ok(Self {
            inner: Arc::new(Inner {
                config,
                session,
                registry_leaf,
                socket_basename,
                runtime,
                credentials,
                _lock: lock,
                handler,
                state: Mutex::new(State {
                    enabled: false,
                    grants,
                    contexts: HashMap::new(),
                    clients,
                    audit: VecDeque::new(),
                    dirty: false,
                }),
            }),
            run: None,
        })
    }
    pub fn settings(&self) -> ToolResult<HostSettings> {
        let state = self.inner.state()?;
        Ok(HostSettings {
            enabled: state.enabled,
            host_session_id: self.inner.session.clone(),
            workspace_id: self.inner.config.workspace_id.clone(),
            incarnation: self.inner.config.incarnation.clone(),
            runtime_dir: self.inner.runtime.path.to_string_lossy().into_owned(),
            grants: state.grants.iter().map(|g| g.info.clone()).collect(),
            recent_operations: state.audit.iter().rev().cloned().collect(),
        })
    }
    pub fn create_grant(&self, input: CreateGrant) -> ToolResult<CreatedGrant> {
        let inner = &self.inner;
        let mut state = inner.state()?;
        if !state.enabled || state.dirty {
            return Err(error(
                "HOST_UNAVAILABLE",
                "Enable agent access before creating a grant",
            ));
        }
        if state.grants.len() >= MAX_GRANTS {
            return Err(error("RATE_LIMITED", "Grant registry limit reached"));
        }
        let info = GrantInfo {
            grant_id: Uuid::new_v4().to_string(),
            client_id: input.client_id,
            workspace_id: inner.config.workspace_id.clone(),
            incarnation: inner.config.incarnation.clone(),
            scopes: input.scopes,
            folder_ids: input.folder_ids,
            expires_at: input.expires_at,
            revocation: 0,
            revoked: false,
            credential_ref: Uuid::new_v4().to_string(),
        };
        validate_info(&info, &inner.config.workspace_id, &inner.config.incarnation).map_err(
            |_| {
                error(
                    "SCHEMA_INVALID",
                    "Invalid grant identity, scopes or directory IDs",
                )
            },
        )?;
        let cached = context(&info)?;
        let mut random = [0u8; 32];
        rand::rngs::OsRng
            .try_fill_bytes(&mut random)
            .map_err(|_| files::storage())?;
        let credential = random
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        let record = CredentialRecord {
            version: 1,
            workspace_id: info.workspace_id.clone(),
            client_id: info.client_id.clone(),
            credential,
            socket_path: inner
                .runtime
                .path
                .join(&inner.socket_basename)
                .to_string_lossy()
                .into_owned(),
        };
        let leaf = credential_leaf(&info.credential_ref)?;
        inner.credentials.write(
            &leaf,
            &serde_json::to_vec(&record).map_err(|_| files::storage())?,
        )?;
        state.grants.push(StoredGrant {
            info: info.clone(),
            credential_hash: digest(&record.credential),
        });
        if let Err(e) = inner.persist(&state) {
            // A failed fsync may have installed the new registry. Persist a tombstone
            // before allowing any further access, never leave ambiguous active authority.
            let last = state.grants.last_mut().ok_or_else(files::invalid)?;
            last.info.revoked = true;
            last.info.revocation = 1;
            state.dirty = inner.persist(&state).is_err();
            Inner::disable(&mut state);
            let _ = inner.credentials.remove(&leaf);
            return Err(e);
        }
        state.contexts.insert(info.grant_id.clone(), cached);
        state
            .clients
            .entry(info.client_id.clone())
            .or_insert_with(|| Arc::new(Limits::new()));
        Ok(CreatedGrant {
            connection: ConnectionConfig {
                workspace_id: info.workspace_id.clone(),
                credential_ref: info.credential_ref.clone(),
                runtime_dir: inner.runtime.path.to_string_lossy().into_owned(),
            },
            grant: info,
        })
    }
    /// Invalidates all outstanding clones immediately, including queued application calls.
    /// A failed persistence returns an error and disables this host until flush succeeds.
    pub fn revoke_grant(&self, grant_id: &str) -> ToolResult<HostSettings> {
        {
            let inner = &self.inner;
            let mut state = inner.state()?;
            let pos = state
                .grants
                .iter()
                .position(|g| g.info.grant_id == grant_id)
                .ok_or_else(|| error("NOT_FOUND", "Grant was not found"))?;
            if let Some(cached) = state.contexts.remove(grant_id) {
                cached.revocation.revoke();
            }
            let g = &mut state.grants[pos].info;
            if !g.revoked {
                g.revoked = true;
                g.revocation = g.revocation.saturating_add(1);
            }
            let leaf = credential_leaf(&g.credential_ref)?;
            state.dirty = true;
            if let Err(e) = inner.persist(&state) {
                Inner::disable(&mut state);
                return Err(e);
            }
            state.dirty = false;
            // Persistent tombstone is authoritative even if credential cleanup fails.
            inner.credentials.remove(&leaf)?;
        }
        self.settings()
    }
    /// Application calls stop before workspace switch, restore, shutdown or lock-owner handoff.
    pub async fn stop(&mut self) -> ToolResult<HostSettings> {
        {
            Inner::disable(&mut *self.inner.state()?);
        }
        if let Some(run) = self.run.take() {
            let _ = run.shutdown.send(true);
            let _ = run.task.await;
        }
        self.settings()
    }
    pub async fn start(&mut self) -> ToolResult<HostSettings> {
        if self.inner.state()?.enabled {
            return self.settings();
        }
        // Clean any prior failed run and invalidate its old context generation first.
        self.stop().await?;
        let inner = &self.inner;
        inner.runtime.verify()?;
        inner.credentials.verify()?;
        let path = inner.runtime.socket_path(&inner.socket_basename)?;
        let listener =
            std::os::unix::net::UnixListener::bind(&path).map_err(|_| files::invalid())?;
        let socket = SocketGuard::install(path.clone())?;
        listener
            .set_nonblocking(true)
            .map_err(|_| files::invalid())?;
        let listener = UnixListener::from_std(listener).map_err(|_| files::invalid())?;
        {
            let mut state = inner.state()?;
            if state.dirty {
                inner.persist(&state)?;
                state.dirty = false;
            }
            let mut contexts = HashMap::new();
            for g in &state.grants {
                if g.info.revoked || g.info.expires_at <= now() {
                    continue;
                }
                let leaf = credential_leaf(&g.info.credential_ref)?;
                let bytes = inner
                    .credentials
                    .read(&leaf, 16 * 1024)?
                    .ok_or_else(files::invalid)?;
                let mut record: CredentialRecord =
                    serde_json::from_slice(&bytes).map_err(|_| files::invalid())?;
                if record.version != 1
                    || record.workspace_id != g.info.workspace_id
                    || record.client_id != g.info.client_id
                    || record.credential.len() != 64
                    || !matches_hash(&digest(&record.credential), &g.credential_hash)
                {
                    return Err(files::invalid());
                }
                record.socket_path = path.to_string_lossy().into_owned();
                inner.credentials.write(
                    &leaf,
                    &serde_json::to_vec(&record).map_err(|_| files::storage())?,
                )?;
                contexts.insert(g.info.grant_id.clone(), context(&g.info)?);
            }
            state.contexts = contexts;
            state.enabled = true;
        }
        let (shutdown, rx) = watch::channel(false);
        let inner = Arc::clone(inner);
        let task = tokio::spawn(async move {
            listen(inner, listener, socket, rx).await;
        });
        self.run = Some(Run { shutdown, task });
        self.settings()
    }
}
impl Drop for AgentHost {
    fn drop(&mut self) {
        if let Ok(mut state) = self.inner.state() {
            Inner::disable(&mut state);
        }
        if let Some(run) = self.run.take() {
            let _ = run.shutdown.send(true);
            // Dropping the accept task drops its JoinSet and cancels outstanding handlers.
            run.task.abort();
        }
    }
}

async fn listen(
    inner: Arc<Inner>,
    listener: UnixListener,
    socket: SocketGuard,
    mut shutdown: watch::Receiver<bool>,
) {
    let connections = Arc::new(Semaphore::new(64));
    let mut jobs = JoinSet::new();
    loop {
        tokio::select! {
            biased;
            _ = shutdown.changed() => break,
            Some(_) = jobs.join_next(), if !jobs.is_empty() => (),
            accepted = listener.accept() => {
                let Ok((stream, _)) = accepted else { break; };
                if inner.runtime.verify().is_err() || socket.verify().is_err() { break; }
                // Accept-and-close excess connections, no unbounded task/queue allocation.
                let Ok(permit) = connections.clone().try_acquire_owned() else { continue; };
                let inner = inner.clone();
                let mut cancel = shutdown.clone();
                jobs.spawn(async move {
                    let _permit = permit;
                    tokio::select! {
                        biased;
                        _ = cancel.changed() => (),
                        _ = connection(inner, stream) => (),
                    }
                });
            }
        }
    }
    if let Ok(mut state) = inner.state() {
        Inner::disable(&mut state);
    }
    jobs.abort_all();
    while jobs.join_next().await.is_some() {}
    drop(listener);
    drop(socket);
}

/// Strict LF framing: max includes LF; EOF without LF, CRLF, trailing bytes in the
/// same read, unknown fields, non-object args and malformed UTF-8 are rejected.
async fn frame(stream: &mut UnixStream) -> ToolResult<Vec<u8>> {
    let mut bytes = Vec::with_capacity(4096);
    let mut chunk = [0u8; 8192];
    loop {
        let remaining = MAX_FRAME - bytes.len();
        if remaining == 0 {
            return Err(error("CONTENT_TOO_LARGE", "IPC frame exceeds the limit"));
        }
        let capacity = chunk.len().min(remaining);
        let count = stream
            .read(&mut chunk[..capacity])
            .await
            .map_err(|_| error("HOST_UNAVAILABLE", "IPC read failed"))?;
        if count == 0 {
            return Err(error(
                "SCHEMA_INVALID",
                "IPC frame requires a terminating newline",
            ));
        }
        if let Some(pos) = chunk[..count].iter().position(|b| *b == b'\n') {
            if pos + 1 != count
                || (pos > 0 && chunk[pos - 1] == b'\r')
                || (pos == 0 && bytes.last() == Some(&b'\r'))
            {
                return Err(error(
                    "SCHEMA_INVALID",
                    "Expected one LF-terminated IPC frame",
                ));
            }
            bytes.extend_from_slice(&chunk[..pos]);
            return Ok(bytes);
        }
        bytes.extend_from_slice(&chunk[..count]);
    }
}
fn response(request_id: String, result: ToolResult<Value>) -> HostResponse {
    match result {
        Ok(result) => HostResponse { version: 1, request_id, result, is_error: false },
        Err(e) => HostResponse { version: 1, request_id, result: serde_json::to_value(e).unwrap_or_else(|_| json!({"code":"STORAGE_ERROR","message":"Response encoding failed","retryable":false})), is_error: true },
    }
}
async fn send(stream: &mut UnixStream, response: HostResponse) {
    let bytes = encode(response);
    let _ = timeout(Duration::from_secs(5), stream.write_all(&bytes)).await;
    let _ = stream.shutdown().await;
}
fn encode(response: HostResponse) -> Vec<u8> {
    let mut bytes = match bounded_json(&response, MAX_FRAME - 1) {
        Ok(bytes) => bytes,
        Err(_) => match serde_json::to_vec(&self::response(
            response.request_id,
            Err(error("CONTENT_TOO_LARGE", "IPC response exceeds the limit")),
        )) {
            Ok(b) => b,
            Err(_) => return Vec::new(),
        },
    };
    bytes.push(b'\n');
    bytes
}
async fn deliver(
    inner: &Inner,
    stream: &mut UnixStream,
    grant_id: &str,
    tool: &str,
    response: HostResponse,
    deadline: Instant,
) {
    let request_id = response.request_id.clone();
    let mut bytes = encode(response);
    let mut offset = 0;
    let mut denial = false;
    let write = async {
        while offset < bytes.len() {
            if stream.writable().await.is_err() {
                return;
            }
            // The check and each nonblocking write share the grant mutex with revoke.
            // Already written bytes cannot be recalled; never release more after revoke.
            let Ok(state) = inner.state() else {
                return;
            };
            if !denial {
                if let Err(e) = inner.check(&state, grant_id, tool) {
                    if offset != 0 {
                        return;
                    }
                    bytes = encode(self::response(request_id.clone(), Err(e)));
                    denial = true;
                }
            }
            match stream.try_write(&bytes[offset..]) {
                Ok(0) => return,
                Ok(n) => offset += n,
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => (),
                Err(_) => return,
            }
        }
    };
    let _ = tokio::time::timeout_at(deadline, write).await;
    let _ = stream.shutdown().await;
}
async fn connection(inner: Arc<Inner>, mut stream: UnixStream) {
    let received = Instant::now();
    // A same-user private socket still verifies peer identity where supported by Tokio.
    if stream
        .peer_cred()
        .map(|p| p.uid() != unsafe { libc::geteuid() })
        .unwrap_or(true)
    {
        return;
    }
    let bytes = match timeout(Duration::from_secs(5), frame(&mut stream)).await {
        Ok(Ok(bytes)) => bytes,
        Ok(Err(e)) => {
            send(&mut stream, response(String::new(), Err(e))).await;
            return;
        }
        Err(_) => {
            send(
                &mut stream,
                response(
                    String::new(),
                    Err(error("TIMEOUT", "IPC request deadline exceeded")),
                ),
            )
            .await;
            return;
        }
    };
    // Retain only a valid requestId for malformed-envelope errors; never echo input text.
    let request_id = serde_json::from_slice::<Value>(&bytes)
        .ok()
        .and_then(|v| {
            v.get("requestId")
                .and_then(Value::as_str)
                .filter(|id| Uuid::parse_str(id).is_ok())
                .map(str::to_owned)
        })
        .unwrap_or_default();
    let req: HostRequest = match serde_json::from_slice(&bytes) {
        Ok(req) => req,
        Err(_) => {
            send(
                &mut stream,
                response(
                    request_id,
                    Err(error("SCHEMA_INVALID", "Invalid IPC request envelope")),
                ),
            )
            .await;
            return;
        }
    };
    if req.version != 1
        || Uuid::parse_str(&req.request_id).is_err()
        || !identity(&req.workspace_id)
        || !identity(&req.client_id)
        || !TOOLS.contains(&req.tool.as_str())
    {
        send(
            &mut stream,
            response(
                request_id,
                Err(error(
                    "SCHEMA_INVALID",
                    "Unsupported IPC version, identity or tool",
                )),
            ),
        )
        .await;
        return;
    }
    let (grant_id, _, limits) = match inner.authenticate(&req) {
        Ok(v) => v,
        Err(e) => {
            // These denials are reached only after credential verification. Do not
            // let unauthenticated client/tool strings enter the operation audit.
            if matches!(e.code.as_str(), "FORBIDDEN" | "NOT_FOUND") {
                inner.audit(&req, audit_code(&e.code), None);
            }
            send(&mut stream, response(req.request_id, Err(e))).await;
            return;
        }
    };
    let deadline = received + Duration::from_secs(if is_write(&req.tool) { 20 } else { 5 });
    let execute = async {
        let (_slot, _permit) = if is_write(&req.tool) {
            let slot = limits
                .write_slots
                .clone()
                .try_acquire_owned()
                .map_err(|_| error("RATE_LIMITED", "Client write queue is full"))?;
            let permit = limits
                .write
                .clone()
                .acquire_owned()
                .await
                .map_err(|_| files::invalid())?;
            (Some(slot), permit)
        } else {
            (
                None,
                limits
                    .reads
                    .clone()
                    .try_acquire_owned()
                    .map_err(|_| error("RATE_LIMITED", "Client read concurrency is full"))?,
            )
        };
        // Recheck AFTER queue admission. This clone shares the same generation as
        // every other request for this grant, including the application's own queue.
        let ctx = inner.check(&*inner.state()?, &grant_id, &req.tool)?;
        let result = std::panic::AssertUnwindSafe(inner.handler.call(
            ctx,
            req.tool.clone(),
            Value::Object(req.arguments.clone()),
        ))
        .catch_unwind()
        .await
        .map_err(|_| error("STORAGE_ERROR", "Application handler failed"))??;
        if !result.is_object() {
            return Err(error(
                "STORAGE_ERROR",
                "Application handler returned an invalid DTO",
            ));
        }
        Ok(result)
    };
    let mut extra = [0u8; 1];
    let result = tokio::select! {
        // A disconnect or second frame cancels a pre-commit handler. The adapter
        // must keep the connection open; recovery uses the original idempotency key.
        read = stream.read(&mut extra) => {
            if matches!(read, Ok(0) | Err(_)) { return; }
            Err(error("SCHEMA_INVALID", "Only one request is allowed per connection"))
        }
        result = tokio::time::timeout_at(deadline, execute) => {
            result.unwrap_or_else(|_| Err(error("TIMEOUT", "Application request deadline exceeded")))
        }
    };
    // Revoke/expiry/disable wins over both successful and failed application results.
    let delivery_check = {
        let Ok(state) = inner.state() else {
            return;
        };
        inner.check(&state, &grant_id, &req.tool)
    };
    let result = match delivery_check {
        Ok(_) => result,
        Err(e) => Err(e),
    };
    let note = result
        .as_ref()
        .ok()
        .and_then(|v| v.get("noteId").or_else(|| v.get("id")))
        .and_then(Value::as_str);
    // Never derive audit text from an application error or raw arguments.
    let outcome = match &result {
        Ok(_) => "OK",
        Err(e) => audit_code(&e.code),
    };
    inner.audit(&req, outcome, note);
    deliver(
        &inner,
        &mut stream,
        &grant_id,
        &req.tool,
        response(req.request_id, result),
        deadline,
    )
    .await;
}
fn audit_code(code: &str) -> &'static str {
    match code {
        "UNAUTHORIZED" => "UNAUTHORIZED",
        "FORBIDDEN" => "FORBIDDEN",
        "NOT_FOUND" => "NOT_FOUND",
        "WORKSPACE_UNAVAILABLE" => "WORKSPACE_UNAVAILABLE",
        "HOST_UNAVAILABLE" => "HOST_UNAVAILABLE",
        "RATE_LIMITED" => "RATE_LIMITED",
        "TIMEOUT" => "TIMEOUT",
        "NOTE_BUSY" => "NOTE_BUSY",
        "BARRIER_BUSY" => "BARRIER_BUSY",
        "REVISION_CONFLICT" => "REVISION_CONFLICT",
        "SCHEMA_INVALID" => "SCHEMA_INVALID",
        "CONTENT_TOO_LARGE" => "CONTENT_TOO_LARGE",
        "LOSSY_REPLACEMENT" => "LOSSY_REPLACEMENT",
        "CURSOR_EXPIRED" => "CURSOR_EXPIRED",
        "IDEMPOTENCY_CONFLICT" => "IDEMPOTENCY_CONFLICT",
        _ => "STORAGE_ERROR",
    }
}
