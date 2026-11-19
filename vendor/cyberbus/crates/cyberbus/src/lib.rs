//! CyberBus native runtime. One serialized command owner, one bounded event consumer.
mod config;
mod directory;
mod discovery;
mod events;
pub use events::EventReceiver;
mod queries;
mod rpc;
mod runtime;
mod session;
pub use config::{ClientConfig, CloudflareFallbackConfig};
pub use cyberbus_auth::{SecureStore, StoreMode};
use cyberbus_protocol::{codec, noise};
pub use cyberbus_protocol::{example, pb};
#[cfg(feature = "cloudflared")]
pub use cyberbus_transport::{
    CloudflareRelay, CloudflareRelayConfig, CloudflareRelayState, ConnectorProtocol,
};
use prost::Message;
use std::{sync::Arc, time::Duration};
use tokio::sync::{mpsc, oneshot, Mutex};

pub(crate) fn error(code: pb::ErrorCode, message: impl Into<String>) -> pb::ProtocolError {
    pb::ProtocolError {
        code: code as i32,
        message: message.into(),
        retryable: false,
        retry_after: None,
    }
}
pub(crate) fn auth_error(e: cyberbus_auth::Error) -> pb::ProtocolError {
    use cyberbus_auth::Error::*;
    let code = match e {
        Configuration => pb::ErrorCode::LogtoConfiguration,
        InvalidClaims => pb::ErrorCode::InvalidClaims,
        Conflict | Rollback => pb::ErrorCode::Conflict,
        DeadlineExceeded => pb::ErrorCode::DeadlineExceeded,
        Cancelled => pb::ErrorCode::Cancelled,
        Unauthenticated | ReauthRequired | SessionRevoked => pb::ErrorCode::Unauthenticated,
        UnknownOutcome => pb::ErrorCode::UnknownOutcome,
        Unavailable => pb::ErrorCode::Unavailable,
        Storage => pb::ErrorCode::Internal,
        ResourceExhausted => pb::ErrorCode::ResourceExhausted,
        InvalidDevice => pb::ErrorCode::InvalidArgument,
        Unsupported => pb::ErrorCode::Unsupported,
    };
    error(code, e.to_string())
}
pub(crate) enum Request {
    Execute(
        pb::SdkCommand,
        tokio::time::Instant,
        oneshot::Sender<pb::SdkResult>,
    ),
    Resume(oneshot::Sender<Result<(), pb::ProtocolError>>),
    Diagnostic(oneshot::Sender<Result<DiagnosticSnapshot, pb::ProtocolError>>),
}

/// Bounded, identifier-free runtime state for native diagnostics.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DiagnosticSnapshot {
    pub schema_version: u32,
    pub transport_running: bool,
    pub transport_phase: &'static str,
    pub transport_generation: u64,
    pub local_ipv4_present: bool,
    pub route_count: u32,
    pub remote_route_count: u32,
    pub indirect_route_count: u32,
    pub device_count: usize,
    pub online_device_count: usize,
    pub devices_with_virtual_ipv4: usize,
    pub directory_revision: u64,
    pub live_peer_count: usize,
    pub live_probe_count: usize,
    pub active_refresh_count: usize,
    pub active_profile_query_count: usize,
    pub metadata_received: u64,
    pub metadata_valid: u64,
    pub noise_verified: u64,
    pub probe_success: u64,
    pub probe_failure: u64,
    pub route_fetch_success: u64,
    pub route_fetch_failure: u64,
    pub network_unready: bool,
    pub sessions_established: u64,
    pub sessions_inbound: u64,
    pub sessions_outbound: u64,
    pub probe_sessions_established: u64,
    pub business_sessions_established: u64,
    pub up_published: u64,
    pub up_installed: u64,
    pub metadata_queued: u64,
    pub metadata_queue_failed: u64,
    pub writer_frames_sent: u64,
    pub writer_metadata_sent: u64,
    pub writer_send_failed: u64,
    pub writer_probe_expired: u64,
    pub frames_received: u64,
    pub metadata_frames_received: u64,
    pub reader_errors: u64,
    pub reader_closed: u64,
    pub reader_io: u64,
    pub reader_protocol: u64,
    pub reader_authentication: u64,
    pub reader_limit: u64,
    pub reader_timeout: u64,
    pub reader_aborted: u64,
    pub reader_forced_abort: u64,
    pub reader_prefix_timeout: u64,
    pub reader_no_frame_exits: u64,
    pub reader_close_frames: u64,
    pub reader_admission_closed: u64,
    pub reader_channel_closed: u64,
    pub writer_closed: u64,
    pub writer_io: u64,
    pub writer_protocol: u64,
    pub writer_authentication: u64,
    pub writer_limit: u64,
    pub writer_timeout: u64,
    pub writer_shutdown_failed: u64,
    pub writer_exit_cancel: u64,
    pub writer_exit_stop: u64,
    pub writer_exit_queue_closed: u64,
    pub writer_exit_probe_expired: u64,
    pub writer_exit_prefix_timeout: u64,
    pub writer_exit_admission_closed: u64,
    pub writer_exit_send_failed: u64,
    pub writer_close_attempted: u64,
    pub writer_close_sent: u64,
    pub writer_close_failed: u64,
    pub local_prefix_ready: u64,
    pub local_prefix_sent: u64,
}
struct Inner {
    closure: Arc<std::sync::Mutex<Option<pb::SdkClosed>>>,
    commands: mpsc::Sender<Request>,
    events: Mutex<Option<EventReceiver>>,
}
#[derive(Clone)]
pub struct Client {
    inner: Arc<Inner>,
}
impl Client {
    /// Initializes installation identity and an OFFLINE self snapshot without network I/O.
    pub async fn new(
        config: ClientConfig,
        store: Box<dyn SecureStore>,
        mode: StoreMode,
    ) -> Result<Self, pb::ProtocolError> {
        Self::new_with_application_schema(config, store, mode, &[]).await
    }
    /// Local, bounded Data schema registration. Does not advertise an RPC handler.
    /// The descriptor set is immutable for this runtime and must be supplied on every open.
    pub async fn new_with_application_schema(
        config: ClientConfig,
        store: Box<dyn SecureStore>,
        mode: StoreMode,
        descriptor_set: &[u8],
    ) -> Result<Self, pb::ProtocolError> {
        if descriptor_set.len() > 65536 {
            return Err(error(
                pb::ErrorCode::ResourceExhausted,
                "application schema limit",
            ));
        }
        let application_schema =
            prost_reflect::DescriptorPool::decode(descriptor_set).map_err(|_| {
                error(
                    pb::ErrorCode::TypeMismatch,
                    "invalid application descriptor",
                )
            })?;
        if application_schema.all_messages().count() > 32 {
            return Err(error(
                pb::ErrorCode::ResourceExhausted,
                "application schema message limit",
            ));
        }
        config.validate()?;
        let clock = Arc::new(cyberbus_auth::SystemClock::new().map_err(auth_error)?);
        let auth = cyberbus_auth::AuthManager::new(config.auth(), store, mode, clock.clone())
            .map_err(auth_error)?;
        let (commands, rx) = mpsc::channel(64);
        let (events, event_rx) = events::channel();
        let closure = Arc::new(std::sync::Mutex::new(None));
        let mut state = runtime::Runtime::new(config, auth, events, clock, closure.clone())?;
        state.application_schema = application_schema;
        tokio::spawn(state.run(rx));
        Ok(Self {
            inner: Arc::new(Inner {
                closure,
                commands,
                events: Mutex::new(Some(event_rx)),
            }),
        })
    }
    pub async fn execute(&self, command: pb::SdkCommand) -> pb::SdkResult {
        let submitted = tokio::time::Instant::now();
        let id = command.command_id.clone();
        if let Err(e) = codec::encode(&command) {
            return pb::SdkResult {
                command_id: id,
                body: Some(pb::sdk_result::Body::Error(e.to_protocol_error())),
            };
        }
        let is_close = matches!(&command.body, Some(pb::sdk_command::Body::SdkClose(_)));
        if let Some(closed) = self.inner.closure.lock().unwrap().clone() {
            return pb::SdkResult {
                command_id: id,
                body: Some(if is_close {
                    pb::sdk_result::Body::SdkClosed(closed)
                } else {
                    pb::sdk_result::Body::Error(error(pb::ErrorCode::Cancelled, "SDK closed"))
                }),
            };
        }
        let (tx, rx) = oneshot::channel();
        if self
            .inner
            .commands
            .send(Request::Execute(command, submitted, tx))
            .await
            .is_err()
        {
            let closed = self.inner.closure.lock().unwrap().clone();
            return pb::SdkResult {
                command_id: id,
                body: Some(match closed {
                    Some(closed) if is_close => pb::sdk_result::Body::SdkClosed(closed),
                    Some(_) => {
                        pb::sdk_result::Body::Error(error(pb::ErrorCode::Cancelled, "SDK closed"))
                    }
                    None => {
                        pb::sdk_result::Body::Error(error(pb::ErrorCode::Closed, "runtime closed"))
                    }
                }),
            };
        }
        let result = rx.await.unwrap_or_else(|_| {
            let closed = self.inner.closure.lock().unwrap().clone();
            pb::SdkResult {
                command_id: id,
                body: Some(match closed {
                    Some(closed) if is_close => pb::sdk_result::Body::SdkClosed(closed),
                    Some(_) => {
                        pb::sdk_result::Body::Error(error(pb::ErrorCode::Cancelled, "SDK closed"))
                    }
                    None => {
                        pb::sdk_result::Body::Error(error(pb::ErrorCode::Closed, "runtime closed"))
                    }
                }),
            }
        });
        if let Some(pb::sdk_result::Body::SdkClosed(closed)) = &result.body {
            *self.inner.closure.lock().unwrap() = Some(closed.clone());
        }
        result
    }

    /// Strict protobuf dispatch, including unknown-control/duplicate-field rejection.
    pub async fn execute_bytes(&self, bytes: &[u8]) -> Vec<u8> {
        let result = match codec::decode_command(bytes) {
            Ok(command) => self.execute(command).await,
            Err(e) => pb::SdkResult {
                command_id: noise::random_bytes::<16>().unwrap_or([1; 16]).to_vec(),
                body: Some(pb::sdk_result::Body::Error(e.to_protocol_error())),
            },
        };
        result.encode_to_vec()
    }
    /// Returns None on timeout or EOF. Native bindings distinguish closure using their handle state.
    pub async fn poll_event(&self, timeout: Duration) -> Option<pb::SdkEvent> {
        let mut guard = self.inner.events.lock().await;
        let rx = guard.as_mut()?;
        tokio::time::timeout(timeout, rx.recv())
            .await
            .ok()
            .flatten()
    }
    /// Transfers the single event consumer. Further poll calls return None.
    pub async fn take_event_receiver(&self) -> Option<EventReceiver> {
        self.inner.events.lock().await.take()
    }
    pub async fn on_resume(&self) -> Result<(), pb::ProtocolError> {
        let (tx, rx) = oneshot::channel();
        self.inner
            .commands
            .send(Request::Resume(tx))
            .await
            .map_err(|_| error(pb::ErrorCode::Closed, "runtime closed"))?;
        rx.await
            .map_err(|_| error(pb::ErrorCode::Closed, "runtime closed"))?
    }
    /// Returns a bounded, identifier-free view of the live native runtime.
    pub async fn diagnostic(&self) -> Result<DiagnosticSnapshot, pb::ProtocolError> {
        let (tx, rx) = oneshot::channel();
        self.inner
            .commands
            .send(Request::Diagnostic(tx))
            .await
            .map_err(|_| error(pb::ErrorCode::Closed, "runtime closed"))?;
        rx.await
            .map_err(|_| error(pb::ErrorCode::Closed, "runtime closed"))?
    }
}
