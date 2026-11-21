# notes-cyberbus

Tauri-independent CyberBus owner, protected-storage integration and bounded loopback byte bridge.
Source: CyberBus `359465e83bd74b571a963f3d1fdc238f50169919`. See `vendor/cyberbus/README.notes.md`
for the narrowly patched runtime; auth/protocol/transport/EasyTier remain pinned Git dependencies.
The crate's Cargo.lock is committed. Build requires protoc (or explicit PROTOC to a vendored binary).

## Account-owner API

```rust,ignore
use notes_cyberbus::{Bus, ClientConfig, SecureStore, StoreMode, Service, pb};
let bus = Bus::new(config, store, StoreMode::Existing).await?;
let mut state = bus.watch();                   // watch::Receiver<Snapshot>
let mut events = bus.subscribe();              // broadcast::Receiver<BusEvent>
let current = bus.snapshot();                  // Snapshot, including raw SDK AuthEvent
let result = bus.cmd(pb::sdk_command::Body::GetAuthState(pb::GetAuthState {})).await?;
bus.register_endpoint(Service::Bootstrap, bootstrap_addr).await?;
bus.register_endpoint(Service::Sync, websocket_addr).await?;
let lease = bus.map(peer32, Service::Sync).await?;
let websocket_address = lease.local_addr();
// Keep lease for the entire connection. It accepts one local connection, then closes listener.
lease.cancel();
let outcome = lease.close().await;             // joins; intentional cancellation is Err(Cancelled)
bus.close().await?;                            // SDK close, EOF drain, cancellation and task join
```

`cmd(Body)` generates command IDs; `execute(SdkCommand)` retains caller IDs. SDK errors become
`Error::Sdk(i32)` without error text, and command acceptance never means Data/notes success.
Use `close()` instead of raw SdkClose. The bridge's subscription/watch and type URL are reserved.
Other raw commands/results/events remain available, including SDK auth operations, raw query
results, `PublicProfile.public_config: Option<prost_types::Any>` and descriptor/device events.
Profile updates must supply the SDK-required field mask and expected revision. Profile type URLs
must include a fully qualified protobuf message name. The account owner encodes its own profile.

Broadcast subscribers must handle `RecvError::Lagged` and resynchronize with `snapshot()`/`watch()`.
Snapshot and BusEvent Debug output is redacted. Their raw protobuf fields are sensitive native-only
values: callers must not independently log or serialize raw auth, callback URIs or SDK errors to UI.
Device history partitioning/persistence and Notes profile validation belong to the account owner.
`directory_valid=false` forbids mappings. Revocation and watch revision gaps actively rebuild the
reserved watch (`StopWatchDevices` then `WatchDevices`) on the bounded control worker to obtain
a fresh SDK snapshot; recovery does not wait for a spontaneous reset. Requests are coalesced,
and a failed/timed-out rebuild remains fail-closed with a finite Fault event.
Authenticated account, nonexpired validation lease, running/reachable network and current online
peer are all required. NetworkStop/AuthLogout/auth changes/EOF invalidate existing leases; there
is no automatic replay or remapping.

## Bootstrap context: required two-step verification

Only incoming **Bootstrap** connections to the registered host endpoint begin with a 112-byte
native-only prelude. Sync receives byte-exact WebSocket data without a prelude.

```rust,ignore
let context = notes_cyberbus::read_bootstrap_context(
    &mut socket, std::time::Duration::from_secs(2),
).await?;
bus.claim_bootstrap_context(&context)?;
// Now pin context.peer's current profile protocol UUID and Noise public key, and retain
// context.account_generation for subsequent authorization/operation checks.
```

`BootstrapContext { peer: [u8;32], stream_id: [u8;16], generation: [u8;16],
account_generation: u64, receiver_nonce: [u8;32] }`. Encoding is `b"NCBBOOT2" / peer32 /
stream_id16 / generation16 / account_generation big-endian u64 / receiver_nonce32`. Version 1
is rejected. Use the shared reader and length constant instead of a hand-coded parser.
The receiving core generates a fresh unpredictable nonce for each incoming Bootstrap entry;
it is delivered only on the host ingress socket, never in SDK Data or to the initiating peer.
Treat this nonce as a local capability: never log it or send it to a peer.
Parsing alone is untrusted. `claim_bootstrap_context` checks the current peer/account and
active incoming core entry, exact stream/generation/service and receiver nonce, then consumes
the nonce once. Outgoing entries and recreated slots cannot accept a previous slot's context.
This rejects invented native TCP callers, replay and stale streams. Bootstrap endpoints must be
owned exclusively by the account runtime. Account owner must check the peer's SDK-authenticated
profile, protocol UUID and Noise key; the bridge cannot decide Notes identity or grant scope.

## Storage

macOS production: use `EncryptedFileStore` with a private `0600` local key file. The host
explicitly chooses CreateNew or Existing; never retry Existing errors as CreateNew.

Android: inject host `Box<dyn SecureStore>` (Keystore JNI / whole-blob CallbackStore). Android
production protection is **not implemented or verified by this crate**. CallbackStore and
SecretBytes are re-exported. No plaintext 0600 production fallback exists.

Optional `store::EncryptedFileStore::open(directory, Box<dyn BlobCipher>, mode)` provides a
private AES-GCM file backend with process-exclusive lock, authenticated marker, fsync + atomic
replace and corruption/missing fail-closed. `AesGcmCipher::from_provider(&mut dyn KeyProvider,
mode)` obtains a host-protected key; `BlobCipher::{seal,open}` supports a nonexportable host key.
The held lock descriptor and current lock pathname must identify the same private regular
file (device/inode, owner, permissions, one link) on Unix. Identity is checked after locking
and during load/replace. Removing/replacing the path permanently poisons the old owner on
detection, even if the original path is later restored. A new owner of a replacement inode
does not authorize the old owner to load or overwrite the blob. The `test-key` feature
explicitly exposes `AesGcmCipher::injected_for_tests([u8;32])` and is only
for tests. No key is generated to plaintext files. Interrupted provisioning leaves a marker and
requires an explicit external recovery decision; it never regenerates an installation identity.

## Bounds and protocol

Fixed type URL: `type.notes.cyberbus/notes.bridge.v1.Envelope`. Canonical prost envelope contains
version, random 16-byte stream ID and generation, service, per-direction sequence, kind, bytes,
and finite close code. No endpoint/port/path is present. Open/OpenAck use sequence 0; chunks and
Close use increasing sequence from 1. Every frame binds the authenticated SDK peer and fixed
stream/generation/service. EOF preserves TCP half-close; both halves must finish within the
absolute stream deadline. Cancellation attempts a bounded Close; unknown effects are never
reported as success.

Defaults: <=24 KiB per chunk, 16 global streams, 4 per peer, 4 queued frames per stream, 32
inflight SDK messages, 128 completion commands, 10s command/open, 15s processed ACK, **23 minutes absolute
stream lifetime** (also the hard stream lifetime cap). This matches the existing device-operation
absolute budget so slow large attachments are not cut off by an earlier core-only 300s timer.
The account owner retains its original 23-minute operation deadline, including setup time, and
must cancel/drop the MappingLease when that deadline or cancellation occurs. This core setting
does not extend the application deadline. Establishment, command and ACK budgets stay unchanged.
`MAX_STREAM_LIFETIME` exposes this bound. `Bus::with_limits` accepts values only within hard caps. Timers
and queued SDK commands may settle with unknown effects; none are silently replayed. SDK send
acceptance is separate from PROCESSED. Owner validates/enqueues before CompleteData(PROCESSED).
ACK waits and TCP copies run outside the sole SDK receiver. A bounded completion worker submits
CompleteData/CancelData without blocking that receiver. All business tasks belong to one tracker.
On SDK EOF, the receiver owner revokes the directory/leases, cancels stop, closes the tracker and
joins control/stream tasks before publishing Closed. The owner itself is outside that tracker,
so drain cannot await the owner's own completion. In-progress control commands select on stop
as well as their deadline; a stopped SDK does not strand a worker waiting on command completion.
The host must still explicitly `Bus::close().await` before releasing its runtime. Closed streams
retain bounded peer/stream tombstones for 600 seconds (1024 active + retired IDs total); duplicate
Open and saturation are rejected rather than evicting unexpired replay protection.

Testing boundaries: real SDK lifecycle/storage tests are offline. Byte bridge tests use a
`cfg(test)` bounded message switch plus actual TCP sockets. No real account, network, relay,
Noise, Android Keystore or macOS user's Keychain session is touched by tests.
