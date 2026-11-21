# CyberBus121 native account migration — author evidence

> 2026-11-21 后续变更：macOS 已移除 Keychain/KeyringStore 后端和凭据存储设置，只使用本地加密文件。本页描述 11-18 的迁移时点；旧 Keychain 项现在不读取、不删除，相关历史引用不能作为当前产品行为。

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

## Post-checkpoint compile and bounded integration tests

On core `71e2c984`, after checkpoint `0805281e`:

- Fixed E0499 by ending the preparation future's lexical scope before inserting the
  single-use transfer mapping. No mapping reuse or weaker retirement assertion was added.
- Account test execution first reached 25 passed / 2 failed. Both failures used invalid
  registry UUID fixtures without the required v4 version/variant bits. Fixtures now generate
  canonical v4 IDs; production registry validation remains strict.
- Found and fixed an independent production bug: the account directory incorrectly applied
  registry-v4 validation to the deterministic workspace-v8 cache path. Cache path validation
  now accepts canonical RFC v4/v8 UUIDs; actual derived-v8 restart and path-rejection tests pass.
- Added 64-device long-name roster budget and noncanonical/unknown Protobuf field rejection
  tests. The actual offline SDK UpdatePublicProfile test submits the bounded roster through
  the real SDK validation boundary; it does not merely round-trip serde. A missing test-only
  base64 import caused an intermediate E0425; corrected before the results below.

Exact directed command results (same environment/TAURI_CONFIG override as above):

| Command suffix | Result |
| --- | --- |
| `cargo test --offline --manifest-path src-tauri/Cargo.toml --features sync-e2e --lib account::` | PASS: 29 passed, 0 failed |
| `cargo test --offline --manifest-path src-tauri/Cargo.toml --features sync-e2e --lib account_policy_real_store` | PASS: 3 passed, 0 failed |
| `cargo test --offline --manifest-path src-tauri/Cargo.toml --features sync-e2e --lib sync_headless::` | PASS: 7 passed, 0 failed |
| `cargo test --offline --manifest-path src-tauri/Cargo.toml --features sync-e2e --lib sync_e2e::` | PASS: 4 passed, 0 failed |
| `cargo check --offline --manifest-path src-tauri/Cargo.toml --features sync-e2e` | PASS (35 warnings, no errors) |

Directional tests still use real Store/Session, Noise and SyncService and verify durable
inbox, no foreground apply, push/pull isolation, and attachment byte equality. Their Gate
fixtures are not evidence of CyberBus-authenticated bootstrap or a live-account transfer.
That real chain remains a required network-harness gate; parent reports discovery and
SDKData/Noise pair now work, but Store push has a classified failure under investigation.

The exact Android JNI module was extracted into a temporary host-only harness and checked
against pinned SecureStore/JNI types: PASS (45.49s). This validates JNI Rust calls/lifetimes,
not a full Android-target build, Java integration, Keystore execution, or APK packaging.

Subsequent core `e26ac0d1` supplies receiver-only bootstrap claim nonce and file lock fixes.
The application already calls `read_bootstrap_context` then `claim_bootstrap_context` and
never hardcodes the prelude size. Revalidation against this new core is recorded separately.
Build cache is 9.8 GiB with 42 GiB free at this stage; no user data or evidence was deleted.

## Account review A2/A3/A4/A6 fixes

The core receiver-nonce/file-lock update `e26ac0d1` was checked with the application:
`cargo check --features sync-e2e` PASS and account tests 29/29 PASS. No bootstrap
prelude size is duplicated in application code.

- A2: SDK local closure is separated from the cloud revocation result. After confirmed
  local closure, app enable intent, adoption release, binding and current status are
  cleaned even when the independent cloud receipt fails/is unknown; that error remains
  in the returned failure/status. Local persistence/retirement failures still block.
  The SDK owner's GetAuthState.refresh_supported (including its persisted vault grant)
  selects RevokeGrant or, for no grant, LocalOnly. Cancelled pre-callback login and repeated
  no-grant signout no longer become Unsupported. Real offline SDK no-grant repeated
  logout and finite local/cloud receipt classification tests pass. True Logto revocation
  failure and full Tauri AuthCallback/cancel races remain unverified by this author.
- A3: the running discovery loop projects current SDK auth/network errors before content
  paused/ready state. ReauthRequired uses the existing identityRefresh login-recovery
  category; degraded network, pending persistence and EOF remain finite explicit errors.
  Explicit SyncNow failure also updates status. Tests call the same production projection
  through successive typed SDK snapshots for enabled and paused content; they are not
  full Tauri Runtime/online event-injection evidence.
- A4: strict TS validation now accepts native SDK errors with only an integer SDK code
  1..26 and the fixed safe fields. Unknown-outcome/deadline retain their own categories;
  mixed metadata, invalid SDK values and arbitrary fields still fail closed. Fixed local
  messages never display upstream SDK text. `scripts/verification/cyberbus121-account-dto.mjs`
  runs the actual Rust SafeError serialization test then builds/imports the actual TS
  validator in memory: PASS, 5 native fixtures and 11 rejected invalid combinations.
  This CLI test starts no browser, UI, Keychain operation or network.
- A6: an authenticated descriptor declaring the Notes type must pass Notes decoding.
  Malformed first discovery, incompatible version after cached history, and inconsistent
  summary now explicitly return DeviceIncompatible and fence directory publication.
  Unknown app types and not-yet-published descriptors remain outside the Notes catalog.

Latest directed account command (offline + locked, sync-e2e): **35 passed / 0 failed**.
This includes the existing real SDK profile validation and real Session/Store preservation
cases. `pnpm typecheck` PASS after TS DTO changes. Default/sync-e2e final check results follow.
Previous E0499, invalid UUID fixtures, missing import and other failures above are preserved.

### Accepted legacy authorization limitation (A5)

This release neither reads nor restores the legacy `.account/grant.json`, imports it into
CyberBus, nor starts an old AuthClient/provider to revoke it. New signOut reports only the
CyberBus owner's local closure and separate cloud receipt. It does **not** prove or claim
that every historical authorization has been revoked. Legacy cloud authorization retirement
is unverified and remains outside this implementation; older material is not deleted as a
side effect of clearing binding. No library, attachment, Noise identity or session history
is deleted for authorization cleanup. Existing UI exit text does not claim universal cloud
revocation; the new failure messages likewise make no such claim.

Per the user's scope reduction, no new live Tauri/headless online acceptance gate is added
for this review. No native binary or real account session was started by this author. UI
execution is manual using the parent task's test document and composed package. Android
full target/Keystore and live Auth→bootstrap→Store conclusions remain separate evidence.

Final author checks of these fixes: default `cargo check --offline --locked` PASS (29.06s),
`cargo check --offline --locked --features sync-e2e` PASS (3.68s), both with the manifest and
compile-only bundle override documented above; 35 library warnings remain, no errors.
`git diff --check` PASS. No UI automation or additional live-account run was performed.
