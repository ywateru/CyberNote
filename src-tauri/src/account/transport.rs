//! Authenticated bootstrap is separate from replication; it never reads note data.
use super::{
    config,
    enrollment::{Claims, Enrollment, Gate},
    private::Binding,
    types::{Error, RequestFailure, Result},
};
use crate::sync::{
    adapter,
    identity::{now, IdentityStore, PairingInvite},
    network::{ReplicationPolicy, SyncService},
};
use cybergrid_sdk::{Client, Mapping, Port};
use serde::{Deserialize, Serialize};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    task::JoinSet,
};
use tokio_util::sync::CancellationToken;

// Cache and sampler contain no transport selection, authentication or network IO.
// Kept inline so the existing exact export inventory needs no new source path.
pub(super) mod observation {
    use super::super::types::{MappingObservation, Phase, Status, TransportKind};
    use std::{
        collections::HashMap,
        future::Future,
        sync::{Arc, Mutex},
        time::{Duration, Instant},
    };
    use tokio::task::JoinHandle;
    use tokio_util::sync::CancellationToken;

    pub const MAX_AGE_MS: u64 = 3000;
    const READ_LIMIT: Duration = Duration::from_millis(250);
    #[derive(Default)]
    struct State {
        serial: u64,
        active: Option<(u64, u64)>, // observation generation, account generation
        ready: bool,
        ready_since: Option<Instant>,
        sample: u64,
        samples: HashMap<String, (Instant, MappingObservation)>,
    }
    #[derive(Default)]
    pub struct Cache(Mutex<State>);
    #[derive(Clone)]
    pub struct Lease {
        cache: Arc<Cache>,
        generation: u64,
    }
    impl Cache {
        pub fn begin(self: &Arc<Self>, owner_generation: u64) -> Option<Lease> {
            let mut state = self.0.lock().ok()?;
            state.active = None;
            state.ready = false;
            state.ready_since = None;
            state.samples.clear();
            state.serial = state.serial.checked_add(1)?;
            state.sample = 0;
            state.active = Some((state.serial, owner_generation));
            Some(Lease {
                cache: self.clone(),
                generation: state.serial,
            })
        }
        pub fn close(&self) {
            if let Ok(mut state) = self.0.lock() {
                state.active = None;
                state.ready = false;
                state.ready_since = None;
                state.samples.clear();
            }
        }
        pub fn suspend(&self) {
            if let Ok(mut state) = self.0.lock() {
                state.ready = false;
                state.ready_since = None;
                state.samples.clear();
            }
        }
        pub fn overlay(&self, status: &mut Status, owner_generation: u64) {
            status.transport_generation = None;
            for device in &mut status.devices {
                device.transport = None;
            }
            if status.state != Phase::Ready || !status.enabled || status.error.is_some() {
                return;
            }
            let Ok(state) = self.0.lock() else {
                return;
            };
            let Some((generation, owner)) = state.active else {
                return;
            };
            if !state.ready || owner != owner_generation {
                return;
            }
            status.transport_generation = Some(generation);
            for device in &mut status.devices {
                if device.current || !device.online {
                    continue;
                }
                if let Some((at, sample)) = state.samples.get(&device.id) {
                    let age = at.elapsed().as_millis();
                    if age <= u128::from(MAX_AGE_MS) {
                        let mut sample = sample.clone();
                        sample.age_ms = age as u64;
                        device.transport = Some(sample);
                    }
                }
            }
        }
    }
    impl Lease {
        pub fn resume(&self) {
            if let Ok(mut state) = self.cache.0.lock() {
                if state
                    .active
                    .is_some_and(|(generation, _)| generation == self.generation)
                    && !state.ready
                {
                    state.samples.clear();
                    state.ready = true;
                    state.ready_since = Some(Instant::now());
                }
            }
        }
        fn remove(&self, peer: &str) {
            if let Ok(mut state) = self.cache.0.lock() {
                if state
                    .active
                    .is_some_and(|(generation, _)| generation == self.generation)
                {
                    state.samples.remove(peer);
                }
            }
        }
        fn task_remove(&self, peer: &str, stop: &CancellationToken) {
            if let Ok(mut state) = self.cache.0.lock() {
                // Check under the same lock as Drop's final removal: a task
                // already executing synchronously may outlive abort().
                if !stop.is_cancelled()
                    && state
                        .active
                        .is_some_and(|(generation, _)| generation == self.generation)
                {
                    state.samples.remove(peer);
                }
            }
        }
        fn record(
            &self,
            peer: &str,
            stop: &CancellationToken,
            enrollment: TransportKind,
            sync: TransportKind,
            started: Instant,
        ) {
            if let Ok(mut state) = self.cache.0.lock() {
                if stop.is_cancelled()
                    || !state.ready
                    || !state.ready_since.is_some_and(|since| started >= since)
                    || !state
                        .active
                        .is_some_and(|(generation, _)| generation == self.generation)
                {
                    return;
                }
                let Some(sample) = state.sample.checked_add(1) else {
                    state.samples.remove(peer);
                    return;
                };
                state.sample = sample;
                state.samples.insert(
                    peer.into(),
                    (
                        started,
                        MappingObservation {
                            generation: self.generation,
                            sample,
                            age_ms: 0,
                            enrollment,
                            sync,
                        },
                    ),
                );
            }
        }
        pub fn spawn<F, Fut>(&self, peer: String, read: F) -> Sampler
        where
            F: Fn() -> Fut + Send + 'static,
            Fut: Future<Output = (TransportKind, TransportKind)> + Send + 'static,
        {
            let lease = self.clone();
            let task_peer = peer.clone();
            let stop = CancellationToken::new();
            let task_stop = stop.clone();
            let task = tokio::spawn(async move {
                loop {
                    // A pending/failed sample never reuses the previous success.
                    lease.task_remove(&task_peer, &task_stop);
                    let started = Instant::now();
                    let result = tokio::select! {
                        biased;
                        _ = task_stop.cancelled() => break,
                        result = tokio::time::timeout(READ_LIMIT * 2, read()) => result,
                    };
                    let (enrollment, sync) =
                        result.unwrap_or((TransportKind::Unavailable, TransportKind::Unavailable));
                    lease.record(&task_peer, &task_stop, enrollment, sync, started);
                    tokio::select! { biased; _ = task_stop.cancelled() => break, _ = tokio::time::sleep(Duration::from_secs(1)) => {} }
                }
            });
            Sampler {
                lease: self.clone(),
                peer,
                stop,
                task,
            }
        }
    }
    pub struct Sampler {
        lease: Lease,
        peer: String,
        stop: CancellationToken,
        task: JoinHandle<()>,
    }
    impl Drop for Sampler {
        fn drop(&mut self) {
            self.stop.cancel();
            self.task.abort();
            self.lease.remove(&self.peer);
        }
    }
    pub async fn read_path(
        read: impl Future<Output = std::result::Result<Option<String>, ()>>,
    ) -> TransportKind {
        match tokio::time::timeout(READ_LIMIT, read).await {
            Ok(Ok(Some(value))) => match value.as_str() {
                "webrtc-direct" => TransportKind::WebrtcDirect,
                "iroh-direct" => TransportKind::IrohDirect,
                "cloudflare-tunnel" => TransportKind::CloudflareTunnel,
                _ => TransportKind::Unknown,
            },
            _ => TransportKind::Unavailable,
        }
    }

    #[cfg(test)]
    mod tests {
        use super::super::super::types::{Device, Error};
        use super::*;
        fn ready() -> Status {
            Status {
                state: Phase::Ready,
                enabled: true,
                devices: vec![Device {
                    id: "fixture-peer".into(),
                    name: "Fixture".into(),
                    online: true,
                    current: false,
                    connected: true,
                    sync_available: true,
                    summary: None,
                    transport: None,
                }],
                ..Status::default()
            }
        }
        fn sample(cache: &Cache, owner: u64) -> Option<MappingObservation> {
            let mut status = ready();
            cache.overlay(&mut status, owner);
            status.devices[0].transport.clone()
        }
        #[tokio::test]
        async fn only_current_finite_paths_survive_closed_unknown_error_and_lock_timeout() {
            for (value, expected) in [
                (Some("webrtc-direct"), TransportKind::WebrtcDirect),
                (Some("iroh-direct"), TransportKind::IrohDirect),
                (Some("cloudflare-tunnel"), TransportKind::CloudflareTunnel),
                (Some("private-provider-sentinel"), TransportKind::Unknown),
                (None, TransportKind::Unavailable),
            ] {
                assert_eq!(
                    read_path(async { Ok(value.map(str::to_owned)) }).await,
                    expected
                );
            }
            assert_eq!(
                read_path(async { Err(()) }).await,
                TransportKind::Unavailable
            );
            let locked = tokio::sync::Mutex::new(());
            let _held = locked.lock().await;
            assert_eq!(
                read_path(async {
                    let _guard = locked.lock().await;
                    Ok(Some("cloudflare-tunnel".into()))
                })
                .await,
                TransportKind::Unavailable
            );
        }
        #[test]
        fn stale_failure_pause_logout_and_account_or_network_generation_cannot_reuse_success() {
            let cache = Arc::new(Cache::default());
            let stop = CancellationToken::new();
            let lease = cache.begin(7).unwrap();
            lease.resume();
            lease.record(
                "fixture-peer",
                &stop,
                TransportKind::WebrtcDirect,
                TransportKind::CloudflareTunnel,
                Instant::now(),
            );
            let initial = sample(&cache, 7).unwrap();
            assert_eq!(initial.sync, TransportKind::CloudflareTunnel);
            assert!(sample(&cache, 8).is_none());
            for phase in [
                Phase::Paused,
                Phase::SignedOut,
                Phase::Authorizing,
                Phase::Error,
                Phase::Connecting,
            ] {
                let mut status = ready();
                status.state = phase;
                cache.overlay(&mut status, 7);
                assert!(
                    status.transport_generation.is_none() && status.devices[0].transport.is_none()
                );
            }
            for inactive in [0, 1, 2] {
                let mut status = ready();
                if inactive == 0 {
                    status.enabled = false;
                }
                if inactive == 1 {
                    status.error = Some(Error::Network.safe());
                }
                if inactive == 2 {
                    status.devices[0].current = true;
                }
                cache.overlay(&mut status, 7);
                assert!(status.devices[0].transport.is_none());
            }
            let before_failure = Instant::now();
            cache.suspend();
            lease.resume();
            lease.record(
                "fixture-peer",
                &stop,
                TransportKind::CloudflareTunnel,
                TransportKind::CloudflareTunnel,
                before_failure,
            );
            assert!(
                sample(&cache, 7).is_none(),
                "in-flight pre-failure sample cannot return after resume"
            );
            lease.record(
                "fixture-peer",
                &stop,
                TransportKind::Unknown,
                TransportKind::IrohDirect,
                Instant::now(),
            );
            assert!(sample(&cache, 7).unwrap().sample > initial.sample);
            cache
                .0
                .lock()
                .unwrap()
                .samples
                .get_mut("fixture-peer")
                .unwrap()
                .0 = Instant::now() - Duration::from_millis(MAX_AGE_MS + 1);
            assert!(sample(&cache, 7).is_none());
            let next = cache.begin(7).unwrap();
            next.resume();
            lease.record(
                "fixture-peer",
                &stop,
                TransportKind::CloudflareTunnel,
                TransportKind::CloudflareTunnel,
                Instant::now(),
            );
            assert!(sample(&cache, 7).is_none());
            next.record(
                "fixture-peer",
                &stop,
                TransportKind::Unavailable,
                TransportKind::Unavailable,
                Instant::now(),
            );
            assert_ne!(sample(&cache, 7).unwrap().generation, initial.generation);
            cache.close();
            next.resume();
            next.record(
                "fixture-peer",
                &stop,
                TransportKind::CloudflareTunnel,
                TransportKind::CloudflareTunnel,
                Instant::now(),
            );
            assert!(sample(&cache, 7).is_none());
        }
        #[tokio::test]
        async fn retired_sampler_cannot_record_or_remove_replacement_in_same_generation() {
            let cache = Arc::new(Cache::default());
            let lease = cache.begin(1).unwrap();
            lease.resume();
            let old = lease.spawn("fixture-peer".into(), || std::future::pending());
            let old_stop = old.stop.clone();
            lease.record(
                "fixture-peer",
                &old_stop,
                TransportKind::WebrtcDirect,
                TransportKind::CloudflareTunnel,
                Instant::now(),
            );
            let first = sample(&cache, 1).unwrap();
            drop(old);
            assert!(old_stop.is_cancelled());
            assert!(sample(&cache, 1).is_none());
            // Simulate synchronous operations that continue after abort/Drop.
            lease.record(
                "fixture-peer",
                &old_stop,
                TransportKind::WebrtcDirect,
                TransportKind::CloudflareTunnel,
                Instant::now(),
            );
            assert!(
                sample(&cache, 1).is_none(),
                "retired record cannot resurrect relay evidence"
            );
            let replacement = lease.spawn("fixture-peer".into(), || std::future::pending());
            lease.record(
                "fixture-peer",
                &replacement.stop,
                TransportKind::IrohDirect,
                TransportKind::IrohDirect,
                Instant::now(),
            );
            let current = sample(&cache, 1).unwrap();
            assert_eq!(current.generation, first.generation);
            assert!(current.sample > first.sample);
            lease.record(
                "fixture-peer",
                &old_stop,
                TransportKind::WebrtcDirect,
                TransportKind::CloudflareTunnel,
                Instant::now(),
            );
            lease.task_remove("fixture-peer", &old_stop);
            let preserved = sample(&cache, 1).unwrap();
            assert_eq!(preserved.sample, current.sample);
            assert_eq!(preserved.sync, TransportKind::IrohDirect);
            // The replacement's own task removal and Drop remain effective.
            lease.task_remove("fixture-peer", &replacement.stop);
            assert!(sample(&cache, 1).is_none());
            lease.record(
                "fixture-peer",
                &replacement.stop,
                TransportKind::IrohDirect,
                TransportKind::IrohDirect,
                Instant::now(),
            );
            drop(replacement);
            assert!(sample(&cache, 1).is_none());
        }

        #[test]
        fn cancellation_while_waiting_for_cache_lock_fences_record_and_task_remove() {
            let cache = Arc::new(Cache::default());
            let lease = cache.begin(1).unwrap();
            lease.resume();
            let old_stop = CancellationToken::new();
            let current_stop = CancellationToken::new();
            lease.record(
                "fixture-peer",
                &current_stop,
                TransportKind::IrohDirect,
                TransportKind::IrohDirect,
                Instant::now(),
            );
            let current = sample(&cache, 1).unwrap();
            std::thread::scope(|scope| {
                let held = cache.0.lock().unwrap();
                let (entered, waiting) = std::sync::mpsc::channel();
                let entered_remove = entered.clone();
                let old_stop = &old_stop;
                let lease = &lease;
                let record = scope.spawn(move || {
                    entered.send(()).unwrap();
                    lease.record(
                        "fixture-peer",
                        old_stop,
                        TransportKind::WebrtcDirect,
                        TransportKind::CloudflareTunnel,
                        Instant::now(),
                    );
                });
                let remove = scope.spawn(move || {
                    entered_remove.send(()).unwrap();
                    lease.task_remove("fixture-peer", old_stop);
                });
                for _ in 0..2 {
                    waiting.recv_timeout(Duration::from_secs(2)).unwrap();
                }
                old_stop.cancel();
                drop(held);
                record.join().unwrap();
                remove.join().unwrap();
            });
            let preserved = sample(&cache, 1).unwrap();
            assert_eq!(preserved.sample, current.sample);
            assert_eq!(preserved.sync, TransportKind::IrohDirect);
        }

        #[tokio::test]
        async fn pending_sample_revokes_previous_success_and_timeout_records_unavailable() {
            use std::sync::atomic::{AtomicUsize, Ordering};
            let cache = Arc::new(Cache::default());
            let lease = cache.begin(1).unwrap();
            lease.resume();
            let calls = Arc::new(AtomicUsize::new(0));
            let source = calls.clone();
            let sampler = lease.spawn("fixture-peer".into(), move || {
                let call = source.fetch_add(1, Ordering::SeqCst);
                async move {
                    if call > 0 {
                        return std::future::pending().await;
                    }
                    (TransportKind::WebrtcDirect, TransportKind::CloudflareTunnel)
                }
            });
            tokio::time::timeout(Duration::from_secs(2), async {
                while sample(&cache, 1).is_none() {
                    tokio::task::yield_now().await;
                }
            })
            .await
            .unwrap();
            let first = sample(&cache, 1).unwrap();
            tokio::time::timeout(Duration::from_secs(2), async {
                while calls.load(Ordering::SeqCst) < 2 {
                    tokio::task::yield_now().await;
                }
            })
            .await
            .unwrap();
            assert!(
                sample(&cache, 1).is_none(),
                "pending read must revoke old relay success"
            );
            tokio::time::timeout(Duration::from_secs(1), async {
                loop {
                    if let Some(sample) = sample(&cache, 1) {
                        assert!(sample.sample > first.sample);
                        assert_eq!(sample.enrollment, TransportKind::Unavailable);
                        assert_eq!(sample.sync, TransportKind::Unavailable);
                        break;
                    }
                    tokio::task::yield_now().await;
                }
            })
            .await
            .unwrap();
            drop(sampler);
            assert!(sample(&cache, 1).is_none());
        }

        #[tokio::test]
        async fn switching_live_samples_and_cancelling_pending_sampler_clear_evidence() {
            use std::sync::atomic::{AtomicBool, Ordering};
            let cache = Arc::new(Cache::default());
            let lease = cache.begin(1).unwrap();
            lease.resume();
            let direct = Arc::new(AtomicBool::new(false));
            let source = direct.clone();
            let sampler = lease.spawn("fixture-peer".into(), move || {
                let kind = if source.load(Ordering::Acquire) {
                    TransportKind::IrohDirect
                } else {
                    TransportKind::CloudflareTunnel
                };
                async move { (TransportKind::WebrtcDirect, kind) }
            });
            tokio::time::timeout(Duration::from_secs(2), async {
                loop {
                    if sample(&cache, 1).is_some() {
                        break;
                    }
                    tokio::task::yield_now().await;
                }
            })
            .await
            .unwrap();
            let first = sample(&cache, 1).unwrap();
            assert_eq!(first.sync, TransportKind::CloudflareTunnel);
            direct.store(true, Ordering::Release);
            tokio::time::timeout(Duration::from_secs(2), async {
                loop {
                    if sample(&cache, 1).is_some_and(|s| {
                        s.sync == TransportKind::IrohDirect && s.sample > first.sample
                    }) {
                        break;
                    }
                    tokio::task::yield_now().await;
                }
            })
            .await
            .unwrap();
            drop(sampler);
            assert!(sample(&cache, 1).is_none());
            let pending = lease.spawn("fixture-peer".into(), || std::future::pending());
            tokio::task::yield_now().await;
            drop(pending);
            tokio::task::yield_now().await;
            assert!(sample(&cache, 1).is_none());
        }
    }
}

struct OwnedMapping(Arc<Mapping>);
impl Drop for OwnedMapping {
    fn drop(&mut self) {
        let mapping = self.0.clone();
        // Cancellation/timeout of a selected operation must also retire mappings.
        tokio::spawn(async move {
            mapping.close().await;
        });
    }
}

pub(crate) fn transient_sdk(error: &cybergrid_sdk::Error) -> bool {
    matches!(
        error,
        cybergrid_sdk::Error::Http(_)
            | cybergrid_sdk::Error::Timeout(_)
            | cybergrid_sdk::Error::Api {
                status: 500..=599,
                ..
            }
    )
}

/// Retry coordination on the SAME SDK owner. Never drop an in-flight owned
/// registration or replace an uncertain operation with a fresh Client/device.
pub(crate) async fn retry_sdk<T, F, Fut, R>(
    stop: &CancellationToken,
    mut operation: F,
    retryable: R,
) -> cybergrid_sdk::Result<T>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = cybergrid_sdk::Result<T>>,
    R: Fn(&cybergrid_sdk::Error) -> bool,
{
    for attempt in 0..3 {
        if stop.is_cancelled() {
            return Err(cybergrid_sdk::Error::Cancelled);
        }
        // The SDK owns reconciliation of a request whose result is uncertain.
        // Cancellation fences the next attempt, rather than dropping this one.
        match operation().await {
            Ok(value) if !stop.is_cancelled() => return Ok(value),
            Ok(_) => return Err(cybergrid_sdk::Error::Cancelled),
            Err(error) if attempt == 2 || !retryable(&error) => return Err(error),
            Err(_) => {}
        }
        tokio::select! {
            _ = stop.cancelled() => return Err(cybergrid_sdk::Error::Cancelled),
            _ = tokio::time::sleep(Duration::from_secs(1 << attempt)) => {}
        }
    }
    unreachable!()
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    proof: String,
    nonce: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Response {
    proof: String,
    nonce: String,
    invitation: String,
}
async fn write<T: Serialize>(io: &mut (impl AsyncWriteExt + Unpin), value: &T) -> Result<()> {
    let bytes = serde_json::to_vec(value).map_err(|_| Error::InvalidProof)?;
    if bytes.len() > 16384 {
        return Err(Error::InvalidProof);
    }
    io.write_u32(bytes.len() as u32).await?;
    io.write_all(&bytes).await?;
    Ok(())
}
async fn read<T: serde::de::DeserializeOwned>(io: &mut (impl AsyncReadExt + Unpin)) -> Result<T> {
    let size = io.read_u32().await? as usize;
    if size == 0 || size > 16384 {
        return Err(Error::InvalidProof);
    }
    let mut bytes = vec![0; size];
    io.read_exact(&mut bytes).await?;
    serde_json::from_slice(&bytes).map_err(|_| Error::InvalidProof)
}
struct Bootstrap {
    enrollment: Arc<Enrollment>,
    binding: Binding,
    identity: Arc<IdentityStore>,
    gate: Arc<Gate>,
    proof: Mutex<String>,
}
impl Bootstrap {
    async fn serve(&self, mut stream: TcpStream) -> Result<()> {
        let request: Request = read(&mut stream).await?;
        uuid::Uuid::parse_str(&request.nonce).map_err(|_| Error::InvalidProof)?;
        let claims = self
            .enrollment
            .verify(&request.proof, &self.binding)
            .await?;
        if claims.device_id == self.binding.device_id {
            return Err(Error::InvalidProof);
        }
        self.gate.admit(&claims);
        // Verification awaits network IO. The owner, SDK or signed local lease
        // may have closed meanwhile; fence invitation creation as well as Noise.
        self.gate
            .authorize(&claims.device_id, &claims.noise_public_key)?;
        let proof = self.proof.lock().map_err(|_| Error::Storage)?.clone();
        // A loopback connection is not authentication; only a signed enrollment
        // plus the expected static Noise key/device grants access to the PSK.
        let invitation = self
            .identity
            .invite_enrolled(
                &self.binding.workspace_id,
                "ws://127.0.0.1:1/",
                &claims.device_id,
                &claims.noise_public_key,
            )?
            .token()?;
        write(
            &mut stream,
            &Response {
                proof,
                nonce: request.nonce,
                invitation,
            },
        )
        .await
    }
}
pub(super) fn authorization_failure(error: Error) -> bool {
    match error {
        Error::Authentication
        | Error::AuthenticationAt(_)
        | Error::ProviderAuthentication(_)
        | Error::InvalidProof
        | Error::OwnershipMismatch
        | Error::RequestAt(_, RequestFailure::InvalidResponse) => true,
        Error::RequestAt(_, RequestFailure::HttpStatus(status)) => {
            matches!(status.as_u16(), 401 | 403) || status.is_success() || status.as_u16() > 599
        }
        _ => false,
    }
}
fn fence_authorization(gate: &Gate, error: Error) -> bool {
    let terminal = authorization_failure(error);
    if terminal {
        gate.close();
    }
    terminal
}
/// Content service is entered only by the enabled child owner. Directory never
/// calls this path, and no directory poll pairs or cycles a peer.
pub(crate) async fn run_content(
    runtime: Arc<adapter::Runtime>,
    identity: Arc<IdentityStore>,
    binding: Binding,
    auth: Arc<account_auth::AuthClient>,
    client: Arc<Client>,
    enrollment: Arc<Enrollment>,
    gate: Arc<Gate>,
    stop: CancellationToken,
    observation: Option<observation::Lease>,
    control: Arc<super::worker::Control>,
    epoch: u64,
    requests: &mut tokio::sync::mpsc::Receiver<super::worker::DeviceRequest>,
) -> Result<()> {
    let access = auth.access_token(Duration::from_secs(60), false).await?;
    let (proof, claims, verified) = enrollment.issue(access.secret(), &binding).await?;
    if stop.is_cancelled() || !gate.is_current() {
        return Err(Error::Cancelled);
    }
    let service = {
        let runtime = runtime.clone();
        let identity = identity.clone();
        let gate = gate.clone();
        tokio::task::spawn_blocking(move || runtime.activate_account(&verified, identity, gate))
            .await
            .map_err(|_| Error::Sync)??
    };
    let service = Arc::new(service);
    let result = run_service(
        &service,
        identity,
        binding,
        auth,
        client,
        enrollment,
        gate.clone(),
        stop,
        observation,
        control,
        epoch,
        requests,
        proof,
        claims,
    )
    .await;
    gate.close();
    runtime.pause_account();
    let shutdown = tokio::task::spawn_blocking(move || {
        let mut service = Arc::try_unwrap(service).map_err(|_| Error::Sync)?;
        service.shutdown().map_err(Error::from)
    })
    .await
    .map_err(|_| Error::Sync)?;
    result.and(shutdown)
}
async fn run_service(
    service: &Arc<SyncService>,
    identity: Arc<IdentityStore>,
    binding: Binding,
    auth: Arc<account_auth::AuthClient>,
    client: Arc<Client>,
    enrollment: Arc<Enrollment>,
    gate: Arc<Gate>,
    stop: CancellationToken,
    observation: Option<observation::Lease>,
    control: Arc<super::worker::Control>,
    epoch: u64,
    requests: &mut tokio::sync::mpsc::Receiver<super::worker::DeviceRequest>,
    proof: String,
    mut claims: Claims,
) -> Result<()> {
    let sync = service.start_listener("127.0.0.1:0".parse().map_err(|_| Error::Configuration)?)?;
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let bootstrap = Arc::new(Bootstrap {
        enrollment: enrollment.clone(),
        binding: binding.clone(),
        identity: identity.clone(),
        gate: gate.clone(),
        proof: Mutex::new(proof),
    });
    gate.renew_local(claims.exp);
    client
        .expose(Port::tcp(
            config::SYNC_PORT,
            sync.port(),
            "notes-sync/account110",
        ))
        .await?;
    client
        .expose(Port::tcp(
            config::ENROLL_PORT,
            listener.local_addr()?.port(),
            "cybernote-enrollment/1",
        ))
        .await?;
    client.enable_remote().await?;
    if stop.is_cancelled() || !control.current(epoch) {
        return Err(Error::Cancelled);
    }
    let child = stop.child_token();
    let server_stop = child.clone();
    let handler = bootstrap.clone();
    let server = tokio::spawn(async move {
        let mut tasks = JoinSet::new();
        loop {
            tokio::select! {
                _=server_stop.cancelled()=>break,
                Some(_)=tasks.join_next(),if !tasks.is_empty()=>{},
                accepted=listener.accept()=>{let Ok((stream,_))=accepted else{break};if tasks.len()>=4{drop(stream);continue}
                    let handler=handler.clone();tasks.spawn(async move{let _=tokio::time::timeout(Duration::from_secs(20),handler.serve(stream)).await;});}
            }
        }
        tasks.abort_all();
        while tasks.join_next().await.is_some() {}
    });
    control.mark_ready(epoch);
    if let Some(observation) = &observation {
        observation.resume();
    }
    let result = loop {
        tokio::select! {
            _=stop.cancelled()=>break Ok(()),
            _=tokio::time::sleep(Duration::from_secs(20))=>{
                if claims.exp <= now() + 90 {
                    let renewed = async {
                        let access = auth.access_token(Duration::from_secs(60), false).await?;
                        enrollment.issue(access.secret(), &binding).await
                    };
                    let renewed = tokio::select! {_=stop.cancelled()=>break Ok(()), value=renewed=>value};
                    match renewed {
                        Ok((proof, next, _))=>{
                            match bootstrap.proof.lock() {
                                Ok(mut slot)=>*slot=proof,
                                Err(_)=>break Err(Error::Storage),
                            }
                            claims=next; gate.renew_local(claims.exp);
                        }
                        Err(error) if fence_authorization(&gate, error)=>break Err(error),
                        Err(_) if claims.exp <= now()=>break Err(Error::Authentication),
                        Err(_)=>{},
                    }
                }
            },
            request=requests.recv()=>{
                let Some(request)=request else{break Ok(())};
                if request.epoch != epoch || !control.current(epoch) || request.done.is_closed() {
                    let _=request.done.send(Err(Error::Cancelled)); continue;
                }
                let transfer = transfer_target(service, &identity, &binding, &client, &enrollment, &gate,
                    &bootstrap, &request.target, request.direction, observation.as_ref(), &stop);
                let outcome = transfer.await;
                let terminal = outcome.as_ref().err().is_some_and(|e| fence_authorization(&gate, *e));
                let error = outcome.as_ref().err().copied();
                let _=request.done.send(outcome);
                if terminal { break Err(error.unwrap_or(Error::Sync)); }
            }
        }
    };
    gate.close();
    child.cancel();
    let _ = server.await;
    result
}
async fn transfer_target(
    service: &Arc<SyncService>,
    identity: &IdentityStore,
    binding: &Binding,
    client: &Arc<Client>,
    enrollment: &Enrollment,
    gate: &Gate,
    bootstrap: &Bootstrap,
    target: &super::directory::Row,
    direction: super::types::TransferDirection,
    observation: Option<&observation::Lease>,
    stop: &CancellationToken,
) -> Result<()> {
    let prepare = async {
        let (transport, protocol, key) = target.target("")?;
        let enroll = OwnedMapping(Arc::new(
            client
                .map(
                    transport,
                    config::ENROLL_PORT,
                    "127.0.0.1:0".parse().map_err(|_| Error::Configuration)?,
                )
                .await?,
        ));
        let sync = OwnedMapping(Arc::new(
            client
                .map(
                    transport,
                    config::SYNC_PORT,
                    "127.0.0.1:0".parse().map_err(|_| Error::Configuration)?,
                )
                .await?,
        ));
        let sampler = observation.map(|lease| {
            let enroll = enroll.0.clone();
            let sync = sync.0.clone();
            lease.spawn(target.id.clone(), move || {
                let enroll = enroll.clone();
                let sync = sync.clone();
                async move {
                    tokio::join!(
                        observation::read_path(async { Ok(enroll.current_transport().await) }),
                        observation::read_path(async { Ok(sync.current_transport().await) })
                    )
                }
            })
        });
        let mut stream = TcpStream::connect(enroll.0.addr).await?;
        let nonce = uuid::Uuid::new_v4().to_string();
        let proof = bootstrap.proof.lock().map_err(|_| Error::Storage)?.clone();
        write(
            &mut stream,
            &Request {
                proof,
                nonce: nonce.clone(),
            },
        )
        .await?;
        let response: Response = tokio::time::timeout(Duration::from_secs(25), read(&mut stream))
            .await
            .map_err(|_| Error::Network)??;
        if response.nonce != nonce {
            return Err(Error::InvalidProof);
        }
        let remote = enrollment.verify(&response.proof, binding).await?;
        // Selection pins both the enrollment identity and static Noise key.
        // A directory refresh never redirects an already selected operation.
        if remote.device_id != protocol
            || remote.noise_public_key != key
            || remote.device_id == binding.device_id
        {
            return Err(Error::InvalidProof);
        }
        let mut invite = PairingInvite::decode(&response.invitation)?;
        if invite.workspace_id != binding.workspace_id || invite.host_key != remote.noise_public_key
        {
            return Err(Error::InvalidProof);
        }
        gate.admit(&remote);
        gate.route(&remote.device_id, format!("ws://{}/", sync.0.addr));
        let paired = identity.peer_for_device(&remote.device_id)?;
        if let Some(id) = paired {
            let pinned = identity.credential(&id)?;
            if pinned.host_key != remote.noise_public_key {
                return Err(Error::InvalidProof);
            }
            if pinned.phase == crate::sync::identity::PairingPhase::Prepared {
                tokio::task::block_in_place(|| service.recover_pairing(&id))?;
            }
        } else {
            invite.endpoint = format!("ws://{}/", sync.0.addr);
            tokio::task::block_in_place(|| service.pair(&invite.token()?))?;
        }
        let id = identity
            .peer_for_device(&remote.device_id)?
            .ok_or(Error::InvalidProof)?;
        Ok((id, enroll, sync, sampler))
    };
    let (id, enroll, sync, sampler) = tokio::select! {
        _=stop.cancelled()=>return Err(Error::Cancelled),
        prepared=tokio::time::timeout(Duration::from_secs(60),prepare)=>prepared.map_err(|_| Error::Network)??,
    };
    if stop.is_cancelled() || !gate.is_current() {
        return Err(Error::Cancelled);
    }
    let direction = match direction {
        super::types::TransferDirection::Push => crate::sync::network::TransferDirection::Push,
        super::types::TransferDirection::Pull => crate::sync::network::TransferDirection::Pull,
        super::types::TransferDirection::Both => crate::sync::network::TransferDirection::Both,
    };
    let task_service = service.clone();
    let task_id = id.clone();
    let mut action =
        tokio::task::spawn_blocking(move || task_service.transfer_once(&task_id, direction));
    // No lifecycle/Session/Store lock is held. Cancellation disconnects AND joins
    // the network-owned task before mappings or the content service can retire.
    let result = tokio::select! {
        result=&mut action=>result.map_err(|_| Error::Sync)?.map_err(Error::from),
        _=stop.cancelled()=>{
            let task_service=service.clone();
            let _=tokio::task::spawn_blocking(move ||task_service.disconnect(&id)).await;
            let _=action.await;
            Err(Error::Cancelled)
        },
    };
    drop(sampler);
    enroll.0.close().await;
    sync.0.close().await;
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
    use p384::{
        elliptic_curve::sec1::ToEncodedPoint,
        pkcs8::{EncodePrivateKey, LineEnding},
        SecretKey,
    };
    use std::sync::atomic::{AtomicBool, Ordering};

    #[test]
    fn coordinator_request_classification_preserves_authorization_fences() {
        use super::super::types::NetworkStage;
        for stage in [
            NetworkStage::CoordinatorProfile,
            NetworkStage::CoordinatorEnrollment,
            NetworkStage::CoordinatorJwks,
        ] {
            let mut cases = vec![
                (Error::AuthenticationAt(stage), true),
                (Error::InvalidProof, true),
                (Error::OwnershipMismatch, true),
                (
                    Error::RequestAt(stage, RequestFailure::InvalidResponse),
                    true,
                ),
                (Error::RequestAt(stage, RequestFailure::Timeout), false),
                (Error::RequestAt(stage, RequestFailure::Connect), false),
                (Error::RequestAt(stage, RequestFailure::Request), false),
                (Error::RequestAt(stage, RequestFailure::ResponseBody), false),
            ];
            for (status, terminal) in [
                (401, true),
                (403, true),
                (429, false),
                (503, false),
                (200, true),
                (600, true),
            ] {
                cases.push((
                    Error::RequestAt(
                        stage,
                        RequestFailure::HttpStatus(reqwest::StatusCode::from_u16(status).unwrap()),
                    ),
                    terminal,
                ));
            }
            for (error, terminal) in cases {
                let gate = Gate::default();
                let proof = Claims {
                    iss: config::ENROLLMENT_ISSUER.into(),
                    aud: "cybernote-enrollment-v1".into(),
                    sub: "synthetic-owner".into(),
                    account_issuer: config::ISSUER.into(),
                    product_id: "cybernote".into(),
                    workspace_id: uuid::Uuid::new_v4().to_string(),
                    device_id: uuid::Uuid::new_v4().to_string(),
                    noise_public_key: B64.encode([7; 32]),
                    purpose: "pair".into(),
                    iat: now(),
                    exp: now() + 200,
                    jti: uuid::Uuid::new_v4().to_string(),
                };
                gate.renew_local(proof.exp);
                gate.admit(&proof);
                gate.route(&proof.device_id, "ws://127.0.0.1:1234/".into());
                assert!(gate
                    .authorize(&proof.device_id, &proof.noise_public_key)
                    .is_ok());
                assert_eq!(fence_authorization(&gate, error), terminal);
                assert_eq!(
                    gate.authorize(&proof.device_id, &proof.noise_public_key)
                        .is_err(),
                    terminal
                );
                assert_eq!(gate.endpoint(&proof.device_id).is_err(), terminal);
                // A fenced gate cannot be resurrected by a stale renewal/admit.
                gate.renew_local(proof.exp);
                gate.admit(&proof);
                gate.route(&proof.device_id, "ws://127.0.0.1:1234/".into());
                assert_eq!(
                    gate.authorize(&proof.device_id, &proof.noise_public_key)
                        .is_err(),
                    terminal
                );
            }
        }
    }

    #[tokio::test]
    async fn initial_coordination_retries_are_bounded_and_permanent_rejections_do_not_retry() {
        use std::sync::atomic::AtomicUsize;
        let stop = CancellationToken::new();
        let calls = AtomicUsize::new(0);
        let result = retry_sdk(
            &stop,
            || async {
                if calls.fetch_add(1, Ordering::SeqCst) < 2 {
                    Err(cybergrid_sdk::Error::Timeout("synthetic registration"))
                } else {
                    Ok(7)
                }
            },
            transient_sdk,
        )
        .await
        .unwrap();
        assert_eq!(result, 7);
        assert_eq!(calls.load(Ordering::SeqCst), 3);

        for status in [401, 403, 400, 429] {
            let calls = AtomicUsize::new(0);
            assert!(retry_sdk::<(), _, _, _>(
                &stop,
                || async {
                    calls.fetch_add(1, Ordering::SeqCst);
                    Err(cybergrid_sdk::Error::Api {
                        status,
                        code: "synthetic-private-provider-text".into(),
                    })
                },
                transient_sdk
            )
            .await
            .is_err());
            assert_eq!(calls.load(Ordering::SeqCst), 1);
        }
        assert!(!transient_sdk(
            &cybergrid_sdk::Error::ExchangeOutcomeUnknown
        ));
        assert!(!transient_sdk(&cybergrid_sdk::Error::Protocol(
            "synthetic".into()
        )));
    }

    #[tokio::test]
    async fn cancelling_initial_coordination_drains_dispatched_work_and_fences_retry() {
        use std::sync::atomic::AtomicUsize;
        let stop = CancellationToken::new();
        let entered = tokio::sync::Notify::new();
        let release = tokio::sync::Notify::new();
        let completed = AtomicBool::new(false);
        let calls = AtomicUsize::new(0);
        let operation = retry_sdk::<(), _, _, _>(
            &stop,
            || async {
                calls.fetch_add(1, Ordering::SeqCst);
                entered.notify_one();
                release.notified().await;
                completed.store(true, Ordering::SeqCst);
                Err(cybergrid_sdk::Error::Timeout(
                    "synthetic uncertain response",
                ))
            },
            transient_sdk,
        );
        let cancel = async {
            entered.notified().await;
            stop.cancel();
            assert!(!completed.load(Ordering::SeqCst));
            release.notify_one();
        };
        let (result, _) = tokio::join!(operation, cancel);
        assert!(matches!(result, Err(cybergrid_sdk::Error::Cancelled)));
        assert!(completed.load(Ordering::SeqCst));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        let called_after_cancel = AtomicBool::new(false);
        assert!(matches!(
            retry_sdk(
                &stop,
                || async {
                    called_after_cancel.store(true, Ordering::SeqCst);
                    Ok(())
                },
                transient_sdk
            )
            .await,
            Err(cybergrid_sdk::Error::Cancelled)
        ));
        assert!(!called_after_cancel.load(Ordering::SeqCst));
    }

    async fn bootstrap_during_verification(revoke: &str) {
        let directory = tempfile::tempdir().unwrap();
        let device = uuid::Uuid::new_v4().to_string();
        let identity = Arc::new(IdentityStore::open(directory.path(), &device).unwrap());
        let before = std::fs::read(directory.path().join("identity-v1.json")).unwrap();
        let binding = Binding {
            issuer: config::ISSUER.into(),
            subject: "synthetic-bootstrap-owner".into(),
            product_id: "cybernote".into(),
            workspace_id: uuid::Uuid::new_v4().to_string(),
            device_id: device,
            noise_public_key: identity.public_key().unwrap(),
            enabled: true,
        };
        let secret = SecretKey::random(&mut rand::rngs::OsRng);
        let point = secret.public_key().to_encoded_point(false);
        let jwks = serde_json::json!({"keys":[{"kty":"EC","crv":"P-384","kid":"synthetic-bootstrap","alg":"ES384","use":"sig","x":B64.encode(point.x().unwrap()),"y":B64.encode(point.y().unwrap())}]}).to_string();
        let key = jsonwebtoken::EncodingKey::from_ec_pem(
            secret.to_pkcs8_pem(LineEnding::LF).unwrap().as_bytes(),
        )
        .unwrap();
        let http = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let origin = format!("http://{}", http.local_addr().unwrap());
        let claims = Claims {
            iss: config::ENROLLMENT_ISSUER.into(),
            aud: "cybernote-enrollment-v1".into(),
            sub: binding.subject.clone(),
            account_issuer: binding.issuer.clone(),
            product_id: binding.product_id.clone(),
            workspace_id: binding.workspace_id.clone(),
            device_id: uuid::Uuid::new_v4().to_string(),
            noise_public_key: B64.encode([7; 32]),
            purpose: "pair".into(),
            iat: now(),
            exp: now() + 200,
            jti: uuid::Uuid::new_v4().to_string(),
        };
        let mut header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::ES384);
        header.kid = Some("synthetic-bootstrap".into());
        let proof = jsonwebtoken::encode(&header, &claims, &key).unwrap();
        let local_proof = jsonwebtoken::encode(
            &header,
            &Claims {
                device_id: binding.device_id.clone(),
                noise_public_key: binding.noise_public_key.clone(),
                ..claims.clone()
            },
            &key,
        )
        .unwrap();
        let (seen, verification_started) = tokio::sync::oneshot::channel();
        let (release, proceed) = tokio::sync::oneshot::channel();
        let jwks_server = tokio::spawn(async move {
            let (mut stream, _) = http.accept().await.unwrap();
            let mut request = Vec::new();
            while !request.windows(4).any(|w| w == b"\r\n\r\n") {
                let mut chunk = [0; 1024];
                let n = stream.read(&mut chunk).await.unwrap();
                assert!(n > 0 && request.len() + n <= 4096);
                request.extend_from_slice(&chunk[..n]);
            }
            assert!(request.starts_with(b"GET /api/v1/account/jwks HTTP/1.1\r\n"));
            seen.send(()).unwrap();
            proceed.await.unwrap();
            stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",jwks.len(),jwks).as_bytes()).await.unwrap();
        });
        let gate = Arc::new(Gate::default());
        gate.renew_local(now() + 200);
        let active = Arc::new(AtomicBool::new(true));
        let owner = active.clone();
        gate.bind_lifecycle(Arc::new(move || owner.load(Ordering::Acquire)));
        let bootstrap = Bootstrap {
            enrollment: Arc::new(Enrollment::new(origin).unwrap()),
            binding: binding.clone(),
            identity: identity.clone(),
            gate: gate.clone(),
            proof: Mutex::new(local_proof.clone()),
        };
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let mut client = TcpStream::connect(listener.local_addr().unwrap())
            .await
            .unwrap();
        let (stream, _) = listener.accept().await.unwrap();
        let host = tokio::spawn(async move { bootstrap.serve(stream).await });
        let nonce = uuid::Uuid::new_v4().to_string();
        write(
            &mut client,
            &Request {
                proof,
                nonce: nonce.clone(),
            },
        )
        .await
        .unwrap();
        tokio::time::timeout(Duration::from_secs(5), verification_started)
            .await
            .unwrap()
            .unwrap();
        match revoke {
            "close" => gate.close(),
            "cancel-owner" => active.store(false, Ordering::Release),
            "active" => (),
            _ => unreachable!(),
        }
        release.send(()).unwrap();
        let result = tokio::time::timeout(Duration::from_secs(5), host)
            .await
            .unwrap()
            .unwrap();
        jwks_server.await.unwrap();
        if revoke == "active" {
            result.unwrap();
            let response: Response = read(&mut client).await.unwrap();
            assert_eq!(response.nonce, nonce);
            assert_eq!(response.proof, local_proof);
            let invite = PairingInvite::decode(&response.invitation).unwrap();
            assert_eq!(invite.workspace_id, binding.workspace_id);
            assert_eq!(invite.host_key, binding.noise_public_key);
            assert!(identity
                .authorize(
                    &invite.invitation_id,
                    &binding.workspace_id,
                    &B64.encode([8; 32]),
                    &claims.device_id
                )
                .is_err());
            identity
                .authorize(
                    &invite.invitation_id,
                    &binding.workspace_id,
                    &claims.noise_public_key,
                    &claims.device_id,
                )
                .unwrap();
        } else {
            assert!(
                result.is_err(),
                "bootstrap returned an invitation after {revoke}"
            );
            assert_eq!(
                std::fs::read(directory.path().join("identity-v1.json")).unwrap(),
                before,
                "closed bootstrap persisted an invitation"
            );
        }
    }

    #[tokio::test]
    async fn bootstrap_rechecks_closed_gate_after_proof_verification() {
        bootstrap_during_verification("close").await;
    }
    #[tokio::test]
    async fn bootstrap_rechecks_cancelled_owner_after_proof_verification() {
        bootstrap_during_verification("cancel-owner").await;
    }
    #[tokio::test]
    async fn active_bootstrap_returns_nonce_bound_noise_key_pinned_invitation() {
        bootstrap_during_verification("active").await;
    }
}
