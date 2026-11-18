//! Private JSONL worker. stdout is a confidential controller pipe, NEVER a public log.
#![allow(dead_code)]
#[path = "../../src-tauri/src/agent_access/mod.rs"]
mod agent_access;
#[path = "../../src-tauri/src/application/mod.rs"]
mod application;
#[path = "../../src-tauri/src/sync/identity.rs"]
pub(crate) mod identity;
#[path = "../../src-tauri/src/sync/model.rs"]
pub(crate) mod model;
#[path = "../../src-tauri/src/sync/network.rs"]
pub(crate) mod network;
#[path = "../../src-tauri/src/session.rs"]
mod session;
#[path = "../../src-tauri/src/store.rs"]
mod store;
mod sync {
    pub(crate) use crate::{identity, model, network};
}
mod backend;

// The current production network.rs retains one unused legacy diagnostic signature.
// A compile-only type satisfies that signature without linking/running the old provider.
// No transport, Backend, Store, wire or merge implementation is replaced here.
extern crate self as cybergrid_sdk;
#[derive(serde::Serialize)]
pub struct DiagnosticSnapshot;

use backend::Backend;
use identity::{IdentityStore, SyncError};
use network::{ReplicationPolicy, SyncBackend, SyncService, TransferDirection};
use notes_cyberbus::{
    pb,
    store::{AesGcmCipher, EncryptedFileStore},
    Bus, BusEvent, ClientConfig, MappingLease, Service, StoreMode,
};
use pb::sdk_command::Body as C;
use prost::Message;
use rand::RngCore;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{BufRead, Read, Write},
    os::unix::fs::{OpenOptionsExt, PermissionsExt},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

type R<T> = std::result::Result<T, String>;
fn io<T>(r: std::io::Result<T>) -> R<T> {
    r.map_err(|_| "io".into())
}
fn se<T>(r: identity::Result<T>) -> R<T> {
    r.map_err(|e| format!("{e}"))
}
fn be<T>(r: notes_cyberbus::Result<T>) -> R<T> {
    r.map_err(|e| match e {
        notes_cyberbus::Error::Sdk(n) => format!("sdk_{n}"),
        notes_cyberbus::Error::Timeout => "deadline".into(),
        _ => "adapter".into(),
    })
}
#[derive(Clone, serde::Serialize)]
struct StoreFailure {
    code: &'static str,
    phase: &'static str,
}
static LAST_STORE_FAILURE: Mutex<Option<StoreFailure>> = Mutex::new(None);
pub(crate) fn record_store_failure(phase: &'static str, e: store::AppError) -> String {
    let code = match e.code.as_str() {
        "database" => "database",
        "filesystem" => "filesystem",
        "document" => "document",
        "invalid" => "invalid",
        "not_found" => "not_found",
        "locked" => "locked",
        "conflict" => "conflict",
        "too_large" => "too_large",
        "unsupported" => "unsupported",
        "sync_disabled" => "sync_disabled",
        "sync_pending_flush" => "sync_pending_flush",
        "sync_invalid" => "sync_invalid",
        "sync_limit" => "sync_limit",
        "sync_equivocation" => "sync_equivocation",
        "sync_plan_stale" => "sync_plan_stale",
        "sync_version_missing" => "sync_version_missing",
        "sync_blob_corrupt" => "sync_blob_corrupt",
        "sync_missing_blob" => "sync_missing_blob",
        "sync_attachment_conflict" => "sync_attachment_conflict",
        "sync_media_publish" => "sync_media_publish",
        "sync_adoption_blocked" => "sync_adoption_blocked",
        "sync_device_mismatch" => "sync_device_mismatch",
        "sync_schema_invalid" => "sync_schema_invalid",
        "sync_workspace_mismatch" => "sync_workspace_mismatch",
        _ => "unclassified",
    };
    *LAST_STORE_FAILURE.lock().unwrap() = Some(StoreFailure { code, phase });
    format!("store_{code}")
}
fn st_at<T>(phase: &'static str, r: store::Result<T>) -> R<T> {
    r.map_err(|e| record_store_failure(phase, e))
}
fn st<T>(r: store::Result<T>) -> R<T> {
    st_at("harness.store_api", r)
}
fn field<'a>(v: &'a Value, k: &str) -> R<&'a str> {
    v[k].as_str().ok_or("input".into())
}
fn hash(b: &[u8]) -> String {
    format!("{:x}", Sha256::digest(b))
}

#[derive(Clone, PartialEq, Message)]
struct Profile {
    #[prost(string, tag = "1")]
    device: String,
    #[prost(string, tag = "2")]
    key: String,
    #[prost(string, tag = "3")]
    workspace: String,
}
const PROFILE: &str = "type.notes.test/notes.test.NetworkHarnessProfile";
struct Policy {
    bus: Bus,
    enabled: AtomicBool,
    bound: Mutex<Option<(Vec<u8>, Profile)>>,
    endpoint: Mutex<String>,
}
impl Policy {
    fn current(&self) -> identity::Result<Profile> {
        if !self.enabled.load(Ordering::Acquire) {
            return Err(SyncError::Revoked);
        }
        let bound = self.bound.lock().map_err(|_| SyncError::Backend)?;
        let (peer, expected) = bound.as_ref().ok_or(SyncError::Authentication)?;
        let s = self.bus.snapshot();
        let auth = s.auth.as_ref().ok_or(SyncError::Authentication)?;
        let now = identity::now() as i64;
        if s.closed
            || !s.directory_valid
            || auth.phase != pb::AuthPhase::Authenticated as i32
            || auth.reauth_required
            || auth.security_state_persistence_pending
            || !auth
                .validation_lease_expires_at
                .as_ref()
                .is_some_and(|t| t.seconds > now)
            || !s
                .network
                .is_some_and(|n| n.running && n.reachable && n.error.is_none())
        {
            return Err(SyncError::Revoked);
        }
        let p = s
            .devices
            .devices
            .iter()
            .find(|d| {
                !d.is_local
                    && &d.device_id == peer
                    && d.presence == pb::DevicePresence::Online as i32
            })
            .and_then(|d| d.profile.as_ref())
            .and_then(|p| p.public_config.as_ref())
            .filter(|a| a.type_url == PROFILE)
            .ok_or(SyncError::Authentication)?;
        let actual = Profile::decode(p.value.as_slice()).map_err(|_| SyncError::Authentication)?;
        if &actual != expected {
            return Err(SyncError::Authentication);
        }
        Ok(actual)
    }
}
impl ReplicationPolicy for Policy {
    fn authorize(&self, device: &str, key: &str) -> identity::Result<()> {
        let p = self.current()?;
        if p.device != device || p.key != key {
            return Err(SyncError::Authentication);
        }
        Ok(())
    }
    fn endpoint(&self, device: &str) -> identity::Result<String> {
        if self.current()?.device != device {
            return Err(SyncError::Authentication);
        }
        Ok(self
            .endpoint
            .lock()
            .map_err(|_| SyncError::Backend)?
            .clone())
    }
}
struct Data {
    backend: Arc<Backend>,
    identity: Arc<IdentityStore>,
    policy: Arc<Policy>,
    service: SyncService,
}
struct Node {
    bus: Bus,
    root: PathBuf,
    data: Option<Data>,
    auth_operation: Vec<u8>,
    mappings: Vec<MappingLease>,
    diagnostics: Mutex<Diagnostics>,
}
struct Diagnostics {
    receiver: tokio::sync::broadcast::Receiver<BusEvent>,
    values: EventCounts,
    started: Instant,
    trajectory: Vec<Value>,
}
#[derive(Default, serde::Serialize)]
struct EventCounts {
    directory_faults: u64,
    adapter_faults: u64,
    subscriber_lagged: u64,
    network_events: u64,
    sdk_network_ever_running: bool,
    sdk_network_ever_reachable: bool,
    sdk_network_running: bool,
    sdk_network_reachable: bool,
    first_network_error: Option<i32>,
    device_events: u64,
    first_removed_error: Option<i32>,
    data_received: u64,
    data_status: u64,
    first_data_error: Option<i32>,
}
impl Diagnostics {
    fn sample(&mut self, label: &str, s: &notes_cyberbus::Snapshot, extra: Value) {
        // Closed schema: no AuthEvent/account/DeviceSnapshot/error message serialization.
        let sample = json!({"event":label,"elapsed_ms":self.started.elapsed().as_millis() as u64,
            "auth_phase":s.auth.as_ref().map(|a|a.phase),"directory_valid":s.directory_valid,
            "directory_revision":s.devices.revision,"device_count":s.devices.devices.len(),
            "online_count":s.devices.devices.iter().filter(|d|d.presence==1).count(),
            "network":s.network.as_ref().map(|n|json!({"running":n.running,"reachable":n.reachable,"error_code":n.error.as_ref().map(|e|e.code)})),
            "detail":extra});
        // Always retain initial observations plus the most recent tail, bounded per process.
        if self.trajectory.len() >= 256 {
            self.trajectory.remove(128);
        }
        self.trajectory.push(sample);
    }
    fn drain(&mut self, s: &notes_cyberbus::Snapshot) {
        use tokio::sync::broadcast::error::TryRecvError;
        loop {
            match self.receiver.try_recv() {
                Ok(BusEvent::Fault(notes_cyberbus::Error::DirectoryReset)) => {
                    self.values.directory_faults += 1;
                    self.sample("directory_reset_fault", s, json!({}));
                }
                Ok(BusEvent::Fault(_)) => {
                    self.values.adapter_faults += 1;
                    self.sample("adapter_fault", s, json!({}));
                }
                Ok(BusEvent::Raw(event)) => {
                    match event.body {
                        Some(pb::sdk_event::Body::Network(n)) => {
                            self.sample("sdk_network_event",s,json!({"running":n.running,"reachable":n.reachable,"error_code":n.error.as_ref().map(|e|e.code)}));
                            self.values.network_events += 1;
                            self.values.sdk_network_ever_running |= n.running;
                            self.values.sdk_network_ever_reachable |= n.reachable;
                            self.values.sdk_network_running = n.running;
                            self.values.sdk_network_reachable = n.reachable;
                            if let Some(e) = n.error {
                                self.values.first_network_error.get_or_insert(e.code);
                            }
                        }
                        Some(pb::sdk_event::Body::Devices(d)) => {
                            self.sample("sdk_devices_event",s,json!({"revision":d.revision,"previous_revision":d.previous_revision}));
                            self.values.device_events += 1;
                            if let Some(pb::devices_event::Body::Removed(r)) = d.body {
                                if let Some(e) = r.error {
                                    self.values.first_removed_error.get_or_insert(e.code);
                                }
                            }
                        }
                        Some(pb::sdk_event::Body::Auth(a)) => self.sample(
                            "sdk_auth_event",
                            s,
                            json!({"phase":a.phase,"error_code":a.error.as_ref().map(|e|e.code)}),
                        ),
                        Some(pb::sdk_event::Body::DataReceived(_)) => {
                            self.values.data_received += 1
                        }
                        Some(pb::sdk_event::Body::DataStatus(d)) => {
                            self.values.data_status += 1;
                            if let Some(pb::data_status::Result::Error(e)) = d.result {
                                self.values.first_data_error.get_or_insert(e.code);
                            }
                        }
                        _ => {}
                    }
                }
                Ok(_) => {}
                Err(TryRecvError::Lagged(_)) => self.values.subscriber_lagged += 1,
                Err(_) => break,
            }
        }
    }
}
impl Node {
    async fn open(v: &Value) -> R<Self> {
        let root = PathBuf::from(field(v, "root")?);
        let meta = io(fs::symlink_metadata(&root))?;
        if !meta.is_dir() || meta.permissions().mode() & 0o077 != 0 {
            return Err("private_root".into());
        }
        let existing = v["existing"].as_bool().ok_or("input")?;
        let mode = if existing {
            StoreMode::Existing
        } else {
            StoreMode::CreateNew
        };
        let keypath = root.join("test-only.key");
        let mut key = [0u8; 32];
        if existing {
            let mut f = io(fs::OpenOptions::new()
                .read(true)
                .custom_flags(libc::O_NOFOLLOW)
                .open(&keypath))?;
            if io(f.metadata())?.permissions().mode() & 0o077 != 0 {
                return Err("private_key".into());
            }
            io(f.read_exact(&mut key))?;
        } else {
            rand::rngs::OsRng.fill_bytes(&mut key);
            let mut f = io(fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .mode(0o600)
                .open(&keypath))?;
            io(f.write_all(&key))?;
            io(f.sync_all())?;
        }
        let secure = EncryptedFileStore::open(
            root.join("vault"),
            Box::new(AesGcmCipher::injected_for_tests(key)),
            mode,
        )
        .map_err(|_| "secure_store")?;
        let config = ClientConfig::from_json(field(v, "config")?)
            .map_err(|e| format!("config_{}", e.code))?;
        let bus = be(Bus::new(config, Box::new(secure), mode).await)?;
        let diagnostics = Mutex::new(Diagnostics {
            receiver: bus.subscribe(),
            values: EventCounts::default(),
            started: Instant::now(),
            trajectory: vec![],
        });
        let node = Self {
            bus,
            root,
            data: None,
            auth_operation: vec![],
            mappings: vec![],
            diagnostics,
        };
        let mut watch = node.bus.watch();
        tokio::time::timeout(Duration::from_secs(10), async {
            while watch.borrow().devices.devices.is_empty() {
                watch.changed().await.map_err(|_| "closed")?
            }
            Ok::<_, String>(())
        })
        .await
        .map_err(|_| "deadline")??;
        Ok(node)
    }
    fn data(&self) -> R<&Data> {
        self.data.as_ref().ok_or("data_uninitialized".into())
    }
    fn state(&self) -> Value {
        let s = self.bus.snapshot();
        let mut diagnostics = self.diagnostics.lock().unwrap();
        diagnostics.drain(&s);
        diagnostics.sample("core_snapshot", &s, json!({}));
        let a = s.auth.as_ref();
        json!({"build_source_sha256":option_env!("CYBERBUS_HARNESS_SOURCE_SHA256"),
            "core_revision":option_env!("CYBERBUS_HARNESS_CORE_REVISION"),
            "core_source_sha256":option_env!("CYBERBUS_HARNESS_CORE_SHA256"),
            "compiled_local_closure_sha256":option_env!("CYBERBUS_HARNESS_LOCAL_CLOSURE_SHA256"),
            "event_counts":diagnostics.values,
            "trajectory":diagnostics.trajectory,
            "last_store_error":LAST_STORE_FAILURE.lock().unwrap().clone(),
            "phase":a.map(|a|a.phase),"authenticated":a.is_some_and(|a|a.phase==4),
            "auth_code":a.and_then(|a|a.error.as_ref()).map(|e|e.code),
            "account":a.and_then(|a|a.account.as_ref()).map(|a|json!([a.issuer,a.subject,a.product_id])),
            "local":s.devices.devices.iter().find(|d|d.is_local).map(|d|d.device_id.clone()),
            "network":s.network.as_ref().map(|n|json!({"running":n.running,"reachable":n.reachable,"code":n.error.as_ref().map(|e|e.code)})),
            "directory_valid":s.directory_valid,
            "peers":s.devices.devices.iter().filter(|d|!d.is_local && d.presence==1).map(|d|json!({"id":d.device_id,"profile":d.profile.as_ref().and_then(|p|p.public_config.as_ref()).filter(|a|a.type_url==PROFILE).and_then(|p|Profile::decode(p.value.as_slice()).ok()).map(|p|json!({"device":p.device,"key":p.key,"workspace":p.workspace}))})).collect::<Vec<_>>()})
    }
    async fn command(&mut self, v: &Value) -> R<Value> {
        if v["op"] != "state" {
            *LAST_STORE_FAILURE.lock().unwrap() = None;
        }
        match field(v, "op")? {
            "state" => Ok(self.state()),
            "auth_start" => {
                let r = be(self
                    .bus
                    .cmd(C::AuthStart(pb::AuthStart {
                        intent: pb::AuthIntent::Login as i32,
                    }))
                    .await)?;
                if let Some(pb::sdk_result::Body::AuthStarted(a)) = r.body {
                    self.auth_operation = a.operation_id;
                    Ok(json!({"authorization":a.authorization_uri}))
                } else {
                    Err("auth_result".into())
                }
            }
            "auth_callback" => {
                be(self
                    .bus
                    .cmd(C::AuthCallback(pb::AuthCallback {
                        operation_id: self.auth_operation.clone(),
                        callback_uri: field(v, "callback")?.into(),
                    }))
                    .await)?;
                Ok(json!(true))
            }
            "restore" => {
                be(self
                    .bus
                    .cmd(C::AuthRestore(pb::AuthRestore {
                        operation_id: uuid::Uuid::new_v4().as_bytes().to_vec(),
                    }))
                    .await)?;
                Ok(json!(true))
            }
            "data_start" => {
                if self.data.is_some() {
                    return Err("already_started".into());
                }
                let s = self.bus.snapshot();
                let a = s
                    .auth
                    .filter(|a| a.phase == 4)
                    .and_then(|a| a.account)
                    .ok_or("unauthenticated")?;
                // Harness-only workspace derivation from SDK-verified account, not JWT input.
                let mut h = Sha256::new();
                h.update(b"cybernote/network-harness/workspace/v1");
                for f in [&a.issuer, &a.subject, &a.product_id] {
                    h.update((f.len() as u32).to_be_bytes());
                    h.update(f.as_bytes());
                }
                let digest = h.finalize();
                let mut bytes = [0; 16];
                bytes.copy_from_slice(&digest[..16]);
                bytes[6] = (bytes[6] & 15) | 0x50;
                bytes[8] = (bytes[8] & 63) | 0x80;
                let workspace = uuid::Uuid::from_bytes(bytes).to_string();
                let mut store = st(store::Store::open(&self.root.join("library")))?;
                let device = st(store.sync_enable(Some(&workspace)))?.device_id;
                let staging = st(store::NetworkStaging::account(
                    &self.root.join("library"),
                    &device,
                ))?;
                let stage = st(staging.prepare())?;
                let backend = Arc::new(Backend(Mutex::new(store), staging));
                let identity = Arc::new(se(IdentityStore::open(
                    &self.root.join("library/.sync"),
                    &device,
                ))?);
                let profile = Profile {
                    device: device.clone(),
                    key: se(identity.public_key())?,
                    workspace: workspace.clone(),
                };
                let policy = Arc::new(Policy {
                    bus: self.bus.clone(),
                    enabled: AtomicBool::new(true),
                    bound: Mutex::new(None),
                    endpoint: Mutex::new(String::new()),
                });
                let service = se(SyncService::with_policy(
                    backend.clone(),
                    identity.clone(),
                    stage,
                    Some(policy.clone()),
                ))?;
                let listener = se(service.start_listener("127.0.0.1:0".parse().unwrap()))?;
                be(self.bus.register_endpoint(Service::Sync, listener).await)?;
                let revision = self
                    .bus
                    .snapshot()
                    .devices
                    .devices
                    .iter()
                    .find(|d| d.is_local)
                    .and_then(|d| d.profile.as_ref())
                    .map_or(0, |p| p.config_revision);
                be(self
                    .bus
                    .cmd(C::UpdatePublicProfile(pb::UpdatePublicProfile {
                        profile: Some(pb::PublicProfile {
                            device_name: field(v, "label")?.into(),
                            public_config: Some(prost_types::Any {
                                type_url: PROFILE.into(),
                                value: profile.encode_to_vec(),
                            }),
                            config_semantic_version: "1.0.0".into(),
                            ..Default::default()
                        }),
                        expected_revision: revision,
                        update_mask: Some(prost_types::FieldMask {
                            paths: vec![
                                "device_name".into(),
                                "public_config".into(),
                                "config_semantic_version".into(),
                            ],
                        }),
                    }))
                    .await)?;
                self.data = Some(Data {
                    backend,
                    identity,
                    policy,
                    service,
                });
                Ok(json!({"workspace":workspace,"device":device,"key":profile.key}))
            }
            "network_start" => {
                self.diagnostics.lock().unwrap().sample(
                    "network_start_submitted",
                    &self.bus.snapshot(),
                    json!({}),
                );
                let result = self
                    .bus
                    .cmd(C::NetworkStart(pb::NetworkStart {
                        private_config: None,
                    }))
                    .await;
                let code = match &result {
                    Err(notes_cyberbus::Error::Sdk(n)) => Some(*n),
                    _ => None,
                };
                let sdk_ok = matches!(
                    &result,
                    Ok(pb::SdkResult {
                        body: Some(pb::sdk_result::Body::Ok(_)),
                        ..
                    })
                );
                let s = self.bus.snapshot();
                let mut d = self.diagnostics.lock().unwrap();
                d.drain(&s);
                d.sample(
                    "network_start_result",
                    &s,
                    json!({"result_ok":sdk_ok,"error_code":code}),
                );
                drop(d);
                be(result)?;
                if !sdk_ok {
                    return Err("network_result".into());
                }
                Ok(json!({"result_ok":true}))
            }
            "network_stop" => {
                be(self.bus.cmd(C::NetworkStop(pb::NetworkStop {})).await)?;
                Ok(json!(true))
            }
            "bind" => {
                let id: Vec<u8> = serde_json::from_value(v["peer"].clone()).map_err(|_| "input")?;
                let d = self.data()?;
                *d.policy.bound.lock().unwrap() = Some((
                    id,
                    Profile {
                        device: field(v, "device")?.into(),
                        key: field(v, "key")?.into(),
                        workspace: field(v, "workspace")?.into(),
                    },
                ));
                se(d.policy.current())?;
                Ok(json!(true))
            }
            "map" => {
                let id: Vec<u8> = serde_json::from_value(v["peer"].clone()).map_err(|_| "input")?;
                let lease = be(self
                    .bus
                    .map(id.try_into().map_err(|_| "input")?, Service::Sync)
                    .await)?;
                let endpoint = format!("ws://{}/", lease.local_addr());
                *self.data()?.policy.endpoint.lock().unwrap() = endpoint.clone();
                self.mappings.push(lease);
                Ok(json!({"endpoint":endpoint}))
            }
            "drain_maps" => self.drain_maps().await,
            "invitation" => {
                Ok(json!({"invitation":se(self.data()?.service.invitation(field(v,"endpoint")?))?}))
            }
            "pair" => {
                Ok(json!({"peer":se(self.data()?.service.pair(field(v,"invitation")?))?.peer_id}))
            }
            "transfer" => {
                let direction: TransferDirection =
                    serde_json::from_value(v["direction"].clone()).map_err(|_| "input")?;
                se(self
                    .data()?
                    .service
                    .transfer_once(field(v, "peer")?, direction))?;
                Ok(json!(true))
            }
            "pause" => {
                self.data()?
                    .policy
                    .enabled
                    .store(!v["paused"].as_bool().ok_or("input")?, Ordering::Release);
                Ok(json!(true))
            }
            "fixture" => self.fixture(v),
            "inspect" => self.inspect(v),
            "apply" => {
                let d = self.data()?;
                Ok(
                    serde_json::to_value(se(d.backend.prepared(&[], |s| s.sync_apply_pending()))?)
                        .map_err(|_| "json")?,
                )
            }
            "conflicts" => {
                let d = self.data()?;
                let s = d.backend.0.lock().unwrap();
                let conflicts = st(s.sync_conflicts())?;
                let mut versions = vec![];
                for c in conflicts {
                    for v in c.versions {
                        versions.push(st(s.sync_version(&v.digest))?)
                    }
                }
                Ok(serde_json::to_value(versions).map_err(|_| "json")?)
            }
            "recover_conflict" => {
                let d = self.data()?;
                let mut s = d.backend.0.lock().unwrap();
                let id = field(v, "note")?;
                let digest = field(v, "digest")?;
                let before = st_at("harness.recover.notes_before", s.notes())?;
                let media = st_at(
                    "harness.recover.snapshot",
                    s.sync_media_snapshot(&[], false),
                )?
                .reserve_keep_all(Some(id));
                let media = st_at("harness.recover.verify", media.verify())?;
                st_at(
                    "harness.recover.resolve",
                    s.sync_with_media(media, |s| {
                        s.sync_resolve(model::EntityKind::Note, id, digest, true)
                    }),
                )?;
                let notes = st_at("harness.recover.notes_after", s.notes())?;
                let mut recovered = vec![];
                for n in notes
                    .iter()
                    .filter(|n| n.id == id || !before.iter().any(|b| b.id == n.id))
                {
                    let mut document = n.document.clone();
                    let mut attachments = vec![];
                    normalize_attachments(&s, &mut document, &mut attachments)?;
                    recovered.push(json!({"document":document,"plain":n.plain_text,
                        "attachments":attachments,"locked":n.locked}));
                }
                Ok(json!({"notes":recovered,"remaining_conflicts":st(s.sync_conflicts())?.len()}))
            }
            _ => Err("unknown_operation".into()),
        }
    }
    fn fixture(&self, v: &Value) -> R<Value> {
        let d = self.data()?;
        make_fixture(&mut d.backend.0.lock().unwrap(), v)
    }
    fn inspect(&self, v: &Value) -> R<Value> {
        let d = self.data()?;
        let s = d.backend.0.lock().unwrap();
        let id = field(v, "note")?;
        let db = io(rusqlite_open(&self.root.join("library/notes.sqlite3")))?;
        let mut counts = vec![];
        for (table, column) in [
            ("sync_heads", "entity_id"),
            ("sync_seen", "entity_id"),
            ("sync_inbox", "json_extract(wire,'$.entityId')"),
        ] {
            let n: i64 = db
                .query_row(
                    &format!("SELECT count(*) FROM {table} WHERE {column}=?1"),
                    [id],
                    |r| r.get(0),
                )
                .map_err(|_| "query")?;
            counts.push(n);
        }
        let note = s
            .note(id)
            .ok()
            .map(|n| json!({"document":n.document,"plain":n.plain_text,"locked":n.locked}));
        let mut attachments = vec![];
        for a in v["attachments"].as_array().ok_or("input")? {
            let aid = a.as_str().ok_or("input")?;
            attachments.push(s.read_attachment(aid).ok());
        }
        // Inspection must not call sync_inventory: it deliberately rejects any local dirty.
        // Read only existing nonredacted digests; no capture/merge/apply bypass or mutation.
        let versions = existing_versions(&s, &db, id)?;
        let blobs = v["blob_refs"]
            .as_array()
            .ok_or("input")?
            .iter()
            .map(|b| {
                st(st(s.sync_blob_storage())?
                    .contains(field(b, "sha256")?, b["size"].as_u64().ok_or("input")?))
            })
            .collect::<R<Vec<_>>>()?;
        Ok(
            json!({"note":note,"attachments":attachments,"counts":counts,"versions":versions,
            "blobs_present":blobs,"pending":st(s.sync_pending_count())?,"dirty":st(s.sync_has_dirty())?}),
        )
    }
    async fn close(&mut self) -> R<Value> {
        let mappings = self.drain_maps().await;
        let service = self
            .data
            .as_mut()
            .map(|d| se(d.service.shutdown()))
            .transpose();
        let bus = be(self.bus.close().await);
        mappings?;
        service?;
        bus?;
        Ok(json!(true))
    }
    async fn drain_maps(&mut self) -> R<Value> {
        let mut failed = false;
        for lease in self.mappings.drain(..) {
            lease.cancel();
            match tokio::time::timeout(Duration::from_secs(5), lease.close()).await {
                Ok(Ok(())) | Ok(Err(notes_cyberbus::Error::Cancelled)) => {}
                _ => failed = true,
            }
        }
        if failed {
            Err("mapping_drain".into())
        } else {
            Ok(json!(true))
        }
    }
}
// Compare the complete document after production keep_all remaps attachment IDs.
// The returned attachment responses contain the original bytes in a private pipe.
fn normalize_attachments(
    s: &store::Store,
    document: &mut Value,
    attachments: &mut Vec<Value>,
) -> R<()> {
    if document["type"] == "attachment" {
        let aid = field(&document["attrs"], "id")?;
        attachments.push(st_at(
            "harness.recover.read_attachment",
            s.read_attachment(aid),
        )?);
        document["attrs"]["id"] = json!(format!("attachment-{}", attachments.len()));
    }
    if let Some(children) = document.get_mut("content").and_then(Value::as_array_mut) {
        for c in children {
            normalize_attachments(s, c, attachments)?;
        }
    }
    Ok(())
}
fn existing_versions(
    s: &store::Store,
    db: &rusqlite::Connection,
    id: &str,
) -> R<Vec<model::WireVersion>> {
    let mut q = db
        .prepare("SELECT digest FROM sync_heads WHERE entity_id=?1 AND redacted=0 ORDER BY digest")
        .map_err(|_| "query")?;
    let digests = q
        .query_map([id], |row| row.get::<_, String>(0))
        .map_err(|_| "query")?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|_| "query")?;
    digests
        .iter()
        .map(|digest| st_at("harness.inspect.version", s.sync_version(digest)))
        .collect()
}
fn make_fixture(s: &mut store::Store, v: &Value) -> R<Value> {
    let id = if let Some(id) = v["note"].as_str() {
        id.to_owned()
    } else {
        field(
            &st_at(
                "harness.fixture.create_note",
                s.action(json!({"type":"createNote"})),
            )?,
            "id",
        )?
        .to_owned()
    };
    let text = field(v, "text")?;
    // Valid 1x1 PNG plus a multi-chunk binary file with zero/255 bytes.
    use base64::Engine;
    let png=base64::engine::general_purpose::STANDARD.decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMQaPj/HwAEwgKP3LagKAAAAABJRU5ErkJggg==").map_err(|_|"png")?;
    let seed = Sha256::digest(text.as_bytes());
    let bytes: Vec<u8> = (0..(512 * 1024 + 137))
        .map(|i| ((i * 31 + seed[i % 32] as usize) % 256) as u8)
        .collect();
    let blob_refs =
        json!([{"sha256":hash(&png),"size":png.len()}, {"sha256":hash(&bytes),"size":bytes.len()}]);
    let image = st_at(
        "harness.fixture.png",
        s.store_attachment(&id, "像素.png", "image/png", png),
    )?;
    let file = st_at(
        "harness.fixture.file",
        s.store_attachment(&id, "原始字节.bin", "application/octet-stream", bytes),
    )?;
    let rev = st(s.note(&id))?.revision;
    let document = json!({"type":"doc","content":[
        {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":text}]},
        {"type":"paragraph","content":[{"type":"text","text":"中文富文本🙂","marks":[{"type":"bold"},{"type":"italic"},{"type":"underline"}]}]},
        {"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"列表项"}]}]}]},
        {"type":"attachment","attrs":{"id":image.id,"kind":"image","name":"像素.png"}},
        {"type":"attachment","attrs":{"id":file.id,"kind":"file","name":"原始字节.bin"}}
    ]});
    st_at(
        "harness.fixture.save_note",
        s.action(json!({"type":"saveNote","id":id,"revision":rev,"document":document})),
    )?;
    // Deliberately leave dirty capture until the production transfer flush (restart checks it).
    Ok(json!({"note":id,"attachments":[image.id,file.id],"blob_refs":blob_refs}))
}

fn rusqlite_open(path: &std::path::Path) -> std::io::Result<rusqlite::Connection> {
    rusqlite::Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|_| std::io::Error::from(std::io::ErrorKind::Other))
}
fn main() {
    // Do not allow a panic payload or upstream stderr to enter a shared transcript.
    std::panic::set_hook(Box::new(|_| {}));
    if std::env::args().nth(1).as_deref() == Some("--fixture-probe") {
        let result = fixture_probe();
        match result {
            Ok(value) => println!("{value}"),
            Err(code) => {
                println!("{}", json!({"fixture_valid":false,"code":code}));
                std::process::exit(1)
            }
        }
        return;
    }
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .unwrap();
    let mut node: Option<Node> = None;
    let stdin = std::io::stdin();
    for line in stdin.lock().lines() {
        let result = match line
            .ok()
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        {
            Some(v) => runtime.block_on(async {
                let op = field(&v, "op")?;
                if op == "init" && node.is_none() {
                    node = Some(Node::open(&v).await?);
                    Ok(node.as_ref().unwrap().state())
                } else if op == "close" {
                    node.as_mut().ok_or("uninitialized")?.close().await
                } else {
                    node.as_mut().ok_or("uninitialized")?.command(&v).await
                }
            }),
            None => Err("input".into()),
        };
        let closed = line_is_closed(&result, &node);
        let response = match result {
            Ok(data) => json!({"ok":true,"data":data}),
            Err(code) => json!({"ok":false,"code":code,
            "store_failure":LAST_STORE_FAILURE.lock().unwrap().clone()}),
        };
        println!("{}", response);
        let _ = std::io::stdout().flush();
        if closed {
            break;
        }
    }
    if let Some(mut n) = node {
        if !n.bus.snapshot().closed {
            let _ = runtime.block_on(n.close());
        }
    }
    runtime.shutdown_timeout(Duration::from_secs(10));
}
fn line_is_closed(_: &R<Value>, node: &Option<Node>) -> bool {
    node.as_ref().is_some_and(|n| n.bus.snapshot().closed)
}

fn fixture_probe() -> R<Value> {
    let root = io(tempfile::tempdir())?;
    let mut store = st(store::Store::open(root.path()))?;
    st(store.sync_enable(Some(&uuid::Uuid::new_v4().to_string())))?;
    let fixture = make_fixture(&mut store, &json!({"text":"本地完整 fixture 校验"}))?;
    // Reproduce run 03's failure locally, then verify the readonly inspection preserves dirty.
    let code = st_at("harness.inspect.inventory", store.sync_inventory())
        .err()
        .ok_or("fixture_expected_dirty")?;
    if code != "store_sync_pending_flush" {
        return Err("fixture_expected_dirty".into());
    }
    let db = io(rusqlite_open(&root.path().join("notes.sqlite3")))?;
    if !existing_versions(&store, &db, field(&fixture, "note")?)?.is_empty()
        || !st(store.sync_has_dirty())?
    {
        return Err("fixture_readonly_inspection".into());
    }
    drop(db);
    let backend = Backend(
        Mutex::new(store),
        store::NetworkStaging::manual(root.path()),
    );
    se(backend.prepared(&[], |s| s.sync_flush()))?;
    let store = backend.0.lock().unwrap();
    let id = field(&fixture, "note")?;
    let note = st(store.note(id))?;
    if !note.plain_text.contains("中文富文本")
        || note.document["content"].as_array().map_or(0, |a| a.len()) != 5
    {
        return Err("fixture_document".into());
    }
    let versions = st(store.sync_inventory())?;
    let version = versions
        .iter()
        .find(|v| v.entity_id == id)
        .ok_or("fixture_version")?;
    let wire = st(store.sync_version(&version.digest))?;
    let media = st(store.sync_required_blobs(&wire))?;
    if media.len() != 2 {
        return Err("fixture_blobs".into());
    }
    for blob in &media {
        let bytes = io(fs::read(st(store.sync_blob_path(&blob.hash))?))?;
        if bytes.len() as u64 != blob.size || hash(&bytes) != blob.hash {
            return Err("fixture_bytes".into());
        }
    }
    Ok(
        json!({"fixture_valid":true,"attachment_count":media.len(),"dirty_inventory_rejected":true,
        "readonly_inspection_preserved_dirty":true,"reproduced_code":"store_sync_pending_flush",
        "reproduced_api_phase":"harness.inspect.inventory","file_sha256":fixture["blob_refs"][1]["sha256"]}),
    )
}
