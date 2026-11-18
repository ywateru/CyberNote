# CyberBus121 native account migration — author evidence

2026-11-18. Develop scope: `/Users/water/work/2026/Apple-Notes-Clone-cyberbus121`,
`codex/cyberbus121-account`. This is a stage for independent review, not production acceptance.
No original Notes library or real App session was opened or changed.

## Creation and authorization chain

`account::Runtime::bus` → SDK-native macOS KeyringStore (root-scoped Keychain account,
exclusive lock, explicit provisioning marker/Existing) or Android JNI SecureStore →
`notes_cyberbus::Bus::new`. CyberBus alone owns AuthStart/Callback/Restore/Logout;
no old AuthClient, token injection, coordinator directory, enrollment JWT or CyberGrid
compile dependency remains in the account creation path. Legacy account-auth is retained
only for its finite error types. Old grant files are not read, imported or deleted.

Public pins: `https://auth.x.aixgg.com/oidc`, client `il4abzwbu1ohjwv5mb667`,
resource `https://cyberbus.x.aixgg.com/api`, product `cybernote`, native client map containing
only this client/product. Redirect is explicitly platform-selected (17897 loopback / original
Android callback). TCP and UDP relay are `43.155.169.102:11010`; persistent grants are enabled.
Remote product deployment/readback was reported by the parent task; it is not author live-login evidence.
SDK AccountSummary has no display name/username. UI uses the fixed label `CyberBus 账户`.

Workspace derivation is frozen in enrollment.rs: SHA-256 of
`cybernote/cyberbus/workspace/v1\0` then each verified issuer/subject/product UTF-8 field
preceded by its big-endian u32 byte length, first 16 digest bytes with UUID version 8 and
RFC variant bits. Login selects an account but never opts into content migration. Existing
Store/Session preflight, adoption markers, editor quiet/release, attachments, pending inbox
and conflict preservation paths are reused. Fresh login is paused; only an exact retained
binding/store/Noise identity with no interrupted adoption can preserve enabled intent.

Gate is default-deny. Each replication authorize checks lifecycle cancellation and SDK
account generation, current authenticated account/validation lease, network running/reachable,
valid directory and the selected SDK peer's current online authenticated profile protocol UUID
and Noise key. No cached 300-second local renewal or server JWT can authorize a peer.
Bootstrap first parses the core prelude and **claims its one-time active stream context**,
then looks up the current SDK peer/profile and compares request protocol UUID/key. The nonce
response and Noise invite host_key must match the selected authenticated profile. Sync uses
its existing Noise/WebSocket protocol without a prelude.

## Devices, transport and operation boundaries

Profile type: `type.cybernote.app/notes.public.v1.Profile`. Any.value is canonical Protobuf
`ProfileEnvelope { uint32 schema_version=1; bytes json_payload=2; }`, with strict Notes JSON
validation inside. The payload is limited to **7 KiB**, below SDK's 8192-byte serialized Any
limit; full SDK PublicProfile remains below 16 KiB. History is at most 64 records. Publication
selects a deterministic bounded roster by dropping excess history from the end until it fits.
Malformed/duplicate/noncanonical wrapper or profile input is rejected.

Authenticated current SDK profiles determine online/available targets. Per-workspace private
history survives restart and contributes offline UI entries only. Authenticated peers can
contribute a bounded knownDevices roster of registry UUID, canonical SDK32 ID and name.
Gossip never grants online/sync/Noise authority or overrides an existing live association.
A newly installed device can learn historical offline devices only after meeting a peer that
has those records; bounded gossip is not the full semantics of the former central directory.
The 32-byte SDK identity remains native; renderer IDs remain registry UUIDs. No transport
route is inferred: diagnostics report CyberBus/unknown with unavailable route telemetry.

Content pause retires the child service and endpoint registrations while discovery stays
running. Device actions are single-target push/pull/both, at most one active request, with
an absolute 23-minute native deadline and progress. Completion follows real SyncService
receipt and blocking disconnect/join retirement; timeout/cancel never becomes success.
MappingLease is single-use, so pairing/recovery and transfer use distinct Sync leases.
No discovery poll invokes content replication or replays a failed transfer.

Android uses `com/local/notesauth/CyberBusSecureStore` through application Context ClassLoader,
`getNoBackupFilesDir()/cyberbus`, static lock/load/save/close and a held GlobalRef. Exceptions
are cleared and mapped to Conflict/Storage without formatting. SDK-owned Drop releases the
Java store after SDK closure/drain. Android compilation and device Keystore evidence are
separate outstanding gates in this stage.

## Commands and verification

All Rust commands use main's existing `src-tauri/target` cache with dev/test debug=0 and
registry vendored macOS protoc; no cache/user evidence was deleted. Bundle resources/sidecar
are cleared only through `TAURI_CONFIG` for compile/tests because this isolated worktree
has no bundled MCP executable. This does not verify packaging or release manifests.

- `cargo check --offline --manifest-path src-tauri/Cargo.toml --features sync-e2e`: PASS
  after the corrections below (unoptimized, debug=0).
- `pnpm typecheck`: PASS, using a local ignored symlink to main's existing node_modules.
- Account and real Store/Session directional tests: running; exact results will be appended.

Preserved failures:

1. Initial cargo check failed in rust-i18n-macro 4.0.0 against support 4.2.4. Old GTK macro
   lock's proc-macro-crate 2.0.2 pinned toml_datetime 0.6.3. Lock-only correction selects
   proc-macro-crate 2.0.0, compatible toml/toml_datetime and i18n 4.2.4; no SDK source was changed.
2. Next build stopped because the worktree lacks its bundled MCP sidecar. Compile/test bundle
   override above is explicit; no placeholder binary was created.
3. First application diagnostics: missing Control retirement helpers, a borrowed history key
   during move, and a Registry mutex guard across an await. Corrected with explicit helpers,
   owned validation keys and a short lexical critical section. Subsequent check passed.
4. First test compilation found one preserved Session test's missing config import. Corrected;
   its actual Store/Session preservation assertions are retained.
5. Initial typecheck failed because this worktree lacked node_modules; rerun with the existing
   dependency symlink passed.

## Fixed real-login harness

Only debug desktop `sync-e2e` builds with both `NOTES_SYNC_E2E=1` and
`NOTES_SYNC_E2E_HEADLESS=1` accept native stdio commands `signIn`, `cancelAccount`, `setEnabled`,
`syncDevice`, `accountStatus`, `signOut`. The existing restricted Store/Session fixture operations
remain. `NOTES_SYNC_E2E_AUTHORIZATION_FILE` must name an absent file in an existing canonical,
user-owned mode-0700 directory. AuthStart writes its URL atomically mode 0600 there; it is
never returned on stdio, sent to renderer state or logged. The independent driver reads that
private file and delivers its callback to the original 17897 listener; SDK verifies PKCE/state
and exchanges the code. There is no production arbitrary callback or token IPC.

Real Logto login/restore/logout, multi-peer relay/Noise/Store data tests, full Chinese rich text,
PNG/file byte equality, offline/restart/conflicts/deletion/cross-account/unknown-outcome tests,
Android native compilation/Keystore, and exact App UI smoke remain unverified by this author.
Those tests must run before production acceptance; old CyberGrid evidence is not reused.

## Checkpoint freeze (before independent review)

User requested an immediate reviewable checkpoint while tests are incomplete. The latest
`cargo test --offline --manifest-path src-tauri/Cargo.toml --features sync-e2e --lib account::`
**did not compile and ran no tests**: E0499 in transport.rs, because the preparation future
retains a mutable borrow of the mappings vector when the subsequent single-use transfer
lease is inserted. This is the current source's compile blocker. The earlier successful
`cargo check` predates this final mapping-lifecycle adjustment; it must not be read as a
passing check of this checkpoint. Typecheck passed. No real account/network validation was
attempted here. Next action: scope the preparation future so its borrow is released before
adding the transfer lease, rerun check and the directed tests, then validate the Android JNI
boundary. Checkpoint is intentionally not a completed delivery.
