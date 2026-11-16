//! Opt-in, bounded observations of the real App SDK owner. Never a receipt or
//! routing input. No SDK error/event Debug, Display or raw serialization here.
#![cfg(all(feature = "sync-e2e", debug_assertions, desktop))]

use cybergrid_sdk::{Client, Error, Event};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex, OnceLock, Weak},
    time::Instant,
};

const CAPACITY: usize = 256;
pub(crate) fn enabled() -> bool {
    std::env::var("NOTES_SYNC_E2E").as_deref() == Ok("1")
        && std::env::var("NOTES_SYNC_E2E_SDK_DIAGNOSTIC").as_deref() == Ok("1")
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Record {
    sequence: u64,
    elapsed_ms: u64,
    sdk_generation: u64,
    kind: &'static str,
    phase: Option<&'static str>,
    transport: Option<&'static str>,
    operation: Option<u64>,
    map_stage: Option<&'static str>,
    map_outcome: Option<&'static str>,
    sdk_variant: Option<&'static str>,
    timeout: Option<&'static str>,
    api_status: Option<u16>,
    selected_transport_matches_expected: Option<bool>,
}
impl Record {
    fn empty(kind: &'static str, sdk_generation: u64) -> Self {
        Self {
            sequence: 0,
            elapsed_ms: 0,
            sdk_generation,
            kind,
            phase: None,
            transport: None,
            operation: None,
            map_stage: None,
            map_outcome: None,
            sdk_variant: None,
            timeout: None,
            api_status: None,
            selected_transport_matches_expected: None,
        }
    }
}
struct State {
    owner: u64,
    client: Weak<Client>,
    began: Instant,
    sequence: u64,
    operation: u64,
    dropped: u64,
    records: VecDeque<Record>,
}
impl Default for State {
    fn default() -> Self {
        Self {
            owner: 0,
            client: Weak::new(),
            began: Instant::now(),
            sequence: 0,
            operation: 0,
            dropped: 0,
            records: VecDeque::new(),
        }
    }
}
impl State {
    fn push(&mut self, mut record: Record) {
        self.sequence = self.sequence.saturating_add(1);
        record.sequence = self.sequence;
        record.elapsed_ms = self.began.elapsed().as_millis().min(u64::MAX as u128) as u64;
        if self.records.len() == CAPACITY {
            self.records.pop_front();
            self.dropped = self.dropped.saturating_add(1);
        }
        self.records.push_back(record);
    }
}
fn state() -> &'static Mutex<State> {
    static STATE: OnceLock<Mutex<State>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(State::default()))
}

// Return static literals only; even an SDK future adding a new message/phase
// cannot introduce arbitrary output through this boundary.
fn phase(value: &str) -> &'static str {
    match value {
        "coordination-ready" => "coordination-ready",
        "requires-login" => "requires-login",
        "recovering" => "recovering",
        "connecting" => "connecting",
        "direct-attempt" => "direct-attempt",
        "iroh-attempt" => "iroh-attempt",
        "iroh-skipped" => "iroh-skipped",
        "fallback-attempt" => "fallback-attempt",
        "websocket-dial" => "websocket-dial",
        "websocket-upgraded" => "websocket-upgraded",
        "mutual-tls-ready" => "mutual-tls-ready",
        "multiplexer-ready" => "multiplexer-ready",
        "mapping-ready" => "mapping-ready",
        "mapping-disconnected" => "mapping-disconnected",
        "port-open" => "port-open",
        "tunnel-ready" => "tunnel-ready",
        "provider-failed" => "provider-failed",
        "provider-restarting" => "provider-restarting",
        "error" => "error",
        "closed" => "closed",
        _ => "unknown",
    }
}
fn transport(value: &str) -> &'static str {
    match value {
        "webrtc-direct" => "webrtc-direct",
        "iroh-direct" => "iroh-direct",
        "cloudflare-tunnel" => "cloudflare-tunnel",
        _ => "unknown",
    }
}
fn event_record(event: &Event) -> Record {
    let mut record = Record::empty("event", event.generation);
    record.phase = Some(phase(&event.phase));
    record.transport = event.transport.as_deref().map(transport);
    // Deliberately do not read epoch, peer_id or message.
    record
}
fn timeout(value: &str) -> &'static str {
    match value {
        "peer connection budget" => "peer connection budget",
        "remote tunnel readiness or authentication" => "remote tunnel readiness or authentication",
        "remote port open" => "remote port open",
        "port selection" => "port selection",
        "WebRTC direct" => "WebRTC direct",
        "direct iroh handshake" => "direct iroh handshake",
        "device authorization" => "device authorization",
        "credential lock" => "credential lock",
        "peer TLS handshake" => "peer TLS handshake",
        "WebSocket connect" => "WebSocket connect",
        "Quick Tunnel registration (30 seconds)" => "Quick Tunnel registration (30 seconds)",
        _ => "unknown",
    }
}
fn classify(error: &Error) -> (&'static str, Option<&'static str>, Option<u16>) {
    let variant = match error {
        Error::Operation { .. } => "Operation",
        Error::Config(_) => "Config",
        Error::Api { .. } => "Api",
        Error::OAuth { .. } => "OAuth",
        Error::Protocol(_) => "Protocol",
        Error::Credentials(_) => "Credentials",
        Error::Cancelled => "Cancelled",
        Error::Timeout(_) => "Timeout",
        Error::NotLoggedIn => "NotLoggedIn",
        Error::ExchangeOutcomeUnknown => "ExchangeOutcomeUnknown",
        Error::RevocationPending => "RevocationPending",
        Error::IdentityChanged => "IdentityChanged",
        Error::AuthorizationUnavailable => "AuthorizationUnavailable",
        Error::AuthorizationProvider(_) => "AuthorizationProvider",
        Error::Transport(_) => "Transport",
        Error::Io(_) => "Io",
        Error::Http(_) => "Http",
    };
    let timeout = match error {
        Error::Timeout(value) => Some(timeout(value)),
        _ => None,
    };
    let status = match error {
        Error::Api { status, .. } | Error::OAuth { status, .. } if (100..=599).contains(status) => {
            Some(*status)
        }
        _ => None,
    };
    (variant, timeout, status)
}

pub(super) struct Owner {
    owner: u64,
    task: tokio::task::JoinHandle<()>,
}
impl Drop for Owner {
    fn drop(&mut self) {
        self.task.abort();
        if let Ok(mut state) = state().lock() {
            if state.owner == self.owner {
                state.client = Weak::new();
            }
        }
    }
}
pub(super) fn attach(client: &Arc<Client>) -> Option<Owner> {
    if !enabled() {
        return None;
    }
    let mut receiver = client.subscribe();
    let owner = {
        let mut state = state().lock().ok()?;
        let owner = state.owner.saturating_add(1);
        *state = State {
            owner,
            client: Arc::downgrade(client),
            ..State::default()
        };
        owner
    };
    let task = tokio::spawn(async move {
        loop {
            match receiver.recv().await {
                Ok(event) => {
                    let Ok(mut state) = state().lock() else {
                        return;
                    };
                    if state.owner != owner || state.client.strong_count() == 0 {
                        return;
                    }
                    state.push(event_record(&event));
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(count)) => {
                    let Ok(mut state) = state().lock() else {
                        return;
                    };
                    if state.owner != owner {
                        return;
                    }
                    state.dropped = state.dropped.saturating_add(count);
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => return,
            }
        }
    });
    Some(Owner { owner, task })
}
#[derive(Clone, Copy)]
pub(super) struct Operation {
    owner: u64,
    operation: u64,
}
pub(super) fn begin(client: &Arc<Client>) -> Option<Operation> {
    if !enabled() {
        return None;
    }
    let mut state = state().lock().ok()?;
    if !state.client.ptr_eq(&Arc::downgrade(client)) {
        return None;
    }
    state.operation = state.operation.saturating_add(1);
    Some(Operation {
        owner: state.owner,
        operation: state.operation,
    })
}
#[derive(Clone, Copy)]
pub(super) enum MapStage {
    Enroll,
    Sync,
}
fn map<T>(
    operation: Option<Operation>,
    client: &Arc<Client>,
    stage: MapStage,
    result: Option<&cybergrid_sdk::Result<T>>,
) {
    let Some(operation) = operation else { return };
    if !enabled() {
        return;
    }
    let Ok(mut state) = state().lock() else {
        return;
    };
    if state.owner != operation.owner || !state.client.ptr_eq(&Arc::downgrade(client)) {
        return;
    }
    let mut record = Record::empty("map", client.snapshot().generation);
    record.operation = Some(operation.operation);
    record.map_stage = Some(match stage {
        MapStage::Enroll => "enroll",
        MapStage::Sync => "sync",
    });
    record.map_outcome = Some(match result {
        None => "started",
        Some(Ok(_)) => "ok",
        Some(Err(_)) => "error",
    });
    if let Some(Err(error)) = result {
        let (variant, timeout, status) = classify(error);
        record.sdk_variant = Some(variant);
        record.timeout = timeout;
        record.api_status = status;
    }
    state.push(record);
}
pub(super) async fn observe<T, F>(
    operation: Option<Operation>,
    client: &Arc<Client>,
    stage: MapStage,
    future: std::pin::Pin<Box<F>>,
) -> cybergrid_sdk::Result<T>
where
    F: std::future::Future<Output = cybergrid_sdk::Result<T>>,
{
    map::<T>(operation, client, stage, None);
    let result = future.await;
    map(operation, client, stage, Some(&result));
    result
}
pub(crate) fn snapshot() -> Result<Value, &'static str> {
    if !enabled() {
        return Err("SDK_DIAGNOSTIC_DISABLED");
    }
    let state = state().lock().map_err(|_| "SDK_DIAGNOSTIC_UNAVAILABLE")?;
    let sdk_generation = state
        .client
        .upgrade()
        .map(|client| client.snapshot().generation);
    Ok(
        json!({"schemaVersion":1,"ownerGeneration":state.owner,"sdkGeneration":sdk_generation,
        "dropped":state.dropped,"records":state.records}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn projection_discards_all_event_identity_and_message_fields() {
        let event = Event {
            generation: 3,
            epoch: Some("PRIVATE_EPOCH".into()),
            phase: "https://PRIVATE_PHASE".into(),
            transport: Some("PRIVATE_TRANSPORT".into()),
            peer_id: Some("PRIVATE_PEER".into()),
            message: Some("PRIVATE_MESSAGE".into()),
        };
        let value = serde_json::to_string(&event_record(&event)).unwrap();
        assert!(!value.contains("PRIVATE"));
        assert!(!value.contains("https"));
        assert_eq!(phase("fallback-attempt"), "fallback-attempt");
        assert_eq!(transport("cloudflare-tunnel"), "cloudflare-tunnel");
    }
    #[test]
    fn typed_error_projection_never_formats_payload_and_bounds_status() {
        let cases = [
            (
                Error::Api {
                    status: 503,
                    code: "PRIVATE".into(),
                },
                ("Api", None, Some(503)),
            ),
            (
                Error::Api {
                    status: 65535,
                    code: "PRIVATE".into(),
                },
                ("Api", None, None),
            ),
            (
                Error::Timeout("PRIVATE"),
                ("Timeout", Some("unknown"), None),
            ),
            (
                Error::Timeout("remote port open"),
                ("Timeout", Some("remote port open"), None),
            ),
            (
                Error::Transport("PRIVATE".into()),
                ("Transport", None, None),
            ),
            (Error::NotLoggedIn, ("NotLoggedIn", None, None)),
        ];
        for (error, expected) in cases {
            assert_eq!(classify(&error), expected);
        }
    }
    #[test]
    fn ring_has_strict_capacity_and_reports_eviction() {
        let mut state = State::default();
        for _ in 0..CAPACITY + 9 {
            state.push(Record::empty("event", 1));
        }
        assert_eq!(state.records.len(), CAPACITY);
        assert_eq!(state.dropped, 9);
        assert_eq!(state.records.front().unwrap().sequence, 10);
        assert_eq!(
            state.records.back().unwrap().sequence,
            (CAPACITY + 9) as u64
        );
    }

    #[test]
    fn real_sdk_rejection_is_observed_only_under_both_environment_switches() {
        const CHILD: &str = "ACCOUNT110_SDK_DIAGNOSTIC_FIXTURE";
        if let Ok(mode) = std::env::var(CHILD) {
            let expected = mode == "enabled";
            assert!(["enabled", "disabled", "withoutE2e"].contains(&mode.as_str()));
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap();
            runtime.block_on(async {
                let client = Client::new(cybergrid_sdk::Config {
                    base_url: super::super::config::origin().unwrap(),
                    app_id: super::super::config::CLIENT_ID.into(),
                    ..Default::default()
                })
                .unwrap();
                let owner = attach(&client);
                assert_eq!(owner.is_some(), expected);
                let result = observe(
                    begin(&client),
                    &client,
                    MapStage::Enroll,
                    Box::pin(client.map(
                        "fixture-peer",
                        "fixture-port",
                        "127.0.0.1:0".parse().unwrap(),
                    )),
                )
                .await;
                assert!(matches!(result, Err(Error::NotLoggedIn)));
                if expected {
                    let value = snapshot().unwrap();
                    let maps: Vec<_> = value["records"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .filter(|r| r["kind"] == "map")
                        .collect();
                    assert_eq!(maps.len(), 2);
                    assert_eq!(maps[0]["mapOutcome"], "started");
                    assert_eq!(maps[1]["mapOutcome"], "error");
                    assert_eq!(maps[1]["sdkVariant"], "NotLoggedIn");
                    assert_eq!(maps[1]["mapStage"], "enroll");
                    assert_eq!(maps[0]["operation"], maps[1]["operation"]);
                    assert!(!value.to_string().contains("fixture-peer"));
                    assert!(client.device_session().await.is_none());
                    drop(owner);
                    assert!(snapshot().unwrap()["sdkGeneration"].is_null());
                } else {
                    assert_eq!(snapshot().unwrap_err(), "SDK_DIAGNOSTIC_DISABLED");
                    assert!(state().lock().unwrap().records.is_empty());
                }
                client.close().await.unwrap();
            });
            return;
        }
        for mode in ["enabled", "disabled", "withoutE2e"] {
            let output = std::process::Command::new(std::env::current_exe().unwrap())
                .args(["--exact", "account::sdk_diagnostic::tests::real_sdk_rejection_is_observed_only_under_both_environment_switches", "--nocapture"])
                .env(CHILD, mode)
                .env("NOTES_SYNC_E2E", if mode == "withoutE2e" { "0" } else { "1" })
                .env("NOTES_SYNC_E2E_SDK_DIAGNOSTIC", if mode == "disabled" { "0" } else { "1" })
                .output().unwrap();
            assert!(
                output.status.success(),
                "controlled diagnostic fixture {mode} failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
    }
}
