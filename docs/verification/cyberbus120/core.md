# CyberBus120 core verification

2026-11-18, develop scope only. Workspace `/Users/water/work/2026/Apple-Notes-Clone-cyberbus120`,
branch `codex/cyberbus120-core`. No src-tauri/UI/user library/login sessions changed.

## Stage 1, ready for independent review

Public signatures and account integration are in `crates/notes-cyberbus/README.md` and source.
Includes Bus::new/cmd/execute/snapshot/watch/subscribe/register_endpoint/unregister_endpoint/map,
MappingLease, raw SDK auth/device events and Any profile, Bootstrap trusted-peer prelude +
read_bootstrap_context + one-time Bus::claim_bootstrap_context. Snapshot/BusEvent Debug is
redacted; Error contains only finite variant, SDK code or I/O kind.

Dependency: fixed public CyberBus commit `359465e83bd74b571a963f3d1fdc238f50169919`. Git dependencies
build successfully with protoc supplied. Minimal vendor runtime patch is documented in
`vendor/cyberbus/README.notes.md`: immutable 64 KiB / 32-message Data schema registration without
an advertised dummy RPC. Other SDK crates and EasyTier remain on the same Git revision. Both
root licenses and original runtime source/tests are retained. No sibling absolute dependency.

Cache audit: SDK `target` and prior metadata target paths no longer existed; searched existing
workspace/tmp caches before building. All commands reuse `crates/notes-cyberbus/target`, dev/test
with debug=0. Stage cache ~1.9 GiB; filesystem free ~52 GiB. No release/mobile profile built.

Executed:

- `cargo check --manifest-path crates/notes-cyberbus/Cargo.toml`: PASS after supplying PROTOC.
- `PROTOC=<cargo registry vendored macOS aarch64 protoc> cargo test --manifest-path
  crates/notes-cyberbus/Cargo.toml`: **13 passed, 0 failed**, 0 ignored; doc tests 0.
- `cargo fmt --manifest-path crates/notes-cyberbus/Cargo.toml`: applied.

Tests cover real SDK offline startup/watch/auth snapshot/profile Any/close, encrypted SDK identity
restart, independent file store restart/replacement/exclusive lock/corruption/wrong key/missing
marker or ciphertext/interrupted provisioning/symlink/private-directory enforcement, directory
revision/reset/gap handling, chunk cap/sequence/peer-generation binding/queue and stream limits,
ACK stage/peer matching and cancellation guard, mapped actual TCP multichunk transfer with
half-close and response after EOF, Bootstrap context parsing/claim/replay/forged peer rejection,
mapping cancellation/peer revocation and Debug redaction. Bridge transport switching is test-only;
these tests do not establish real CyberBus network interoperability.

Preserved failures and corrections:

1. Initial Git dependency build failed because protoc was absent from PATH. Continued using
   already downloaded protoc-bin-vendored, no unrelated system installation.
2. First tests: 5 PASS / 2 FAIL, both startup TYPE_MISMATCH: custom Data types require registration.
   Fixed by minimal vendor runtime Data schema constructor; no opaque bypass/dummy RPC.
3. Next tests: 6 PASS / 1 FAIL, then 11 PASS / 1 FAIL: fixture profile omitted SDK-required update
   field mask and originally used an unqualified profile type name. Fixed the fixture to match
   SDK raw command contract; production SDK validation remains unchanged.
4. Test-hook compile failure from accidental duplicate hook in close() was corrected before
   the green run. No test-only switching exists in a production build.

## Open verification boundaries

Independent code review is pending. Real Logto login/restore/logout, authenticated dual-peer
network/relay/Noise, actual Notes bootstrap/profile authorization and WebSocket synchronization,
real network loss/recovery, cross-account rejection and mobile builds remain unverified here.
No macOS user Keychain entry or real user vault was opened; production KeyringStore integration
is SDK-native API reuse, not a live Keychain acceptance result. Android Keystore is provided by
another task via SecureStore/CallbackStore and is not claimed complete.

Dedicated clock/deadline, EOF-owner failure, simultaneous traffic saturation and subprocess lock
fault-injection coverage will be added in the same scope after the stage commit; the initial
13-test result does not claim every failure scenario was exercised. Upstream warnings retained:
three pre-existing unused helpers (`used`, `emit_data`, `cancel_rpc`).


## Deadline integration patch

User requested a narrowly scoped follow-up while independent review continues. README contract
was updated before implementation: default and maximum `stream_timeout` are now **23 minutes
(1380 seconds)**, matching the existing device-operation absolute budget. `MAX_STREAM_LIFETIME`
is public. Command/open defaults remain 10 seconds, processed ACK remains 15 seconds, and their
hard limits remain 600 seconds. The host's original absolute deadline still includes setup and
must cancel/drop its mapping lease on expiry; core does not extend that host deadline.

Executed `PROTOC=<same vendored protoc> cargo test --manifest-path
crates/notes-cyberbus/Cargo.toml stream_deadline`: **2 passed / 0 failed**, 13 filtered out. This
compiled the updated library and tests in the existing shared dev/test cache. Tests check the
23-minute default, exact hard cap, zero/over-cap rejection and unchanged short ACK/setup defaults;
a real loopback TCP fixture with a shortened 80ms stream budget confirms idle sockets still
close at expiry and settle as Timeout. No real authenticated network or 23-minute wall-clock
transfer is claimed. Build briefly waited on the shared target lock; no duplicate profile/cache
was created. `cargo fmt --check` and `git diff --check` also pass for this patch.

Nonblocking work is paused at the user's request, pending independent review. Uncommitted
post-stage lifecycle work was saved in stash `cyberbus120 post-stage lifecycle fixes pending
independent review`; it is not part of the deadline patch. That saved work addresses watch
resubscription after revocation, EOF worker drain, retired stream IDs and lock-file replacement.
The watch-rebuild/EOF/ACK-timeout additions reached a 16-test green run before stashing; that is
not substituted for the committed stage's 13 tests plus this patch's two targeted checks.
A further in-progress test run was cancelled while waiting for the shared build lock when the
user requested this pause. These identified lifecycle boundaries remain for review and a
separate integration fix; this patch does not claim they are resolved in the committed tree.

## Lifecycle recovery integration patch

The user explicitly resumed the necessary correctness fixes. Restored only the core lifecycle
stash, retaining the 23-minute deadline patch and both of its tests. Independent review files
under `docs/plan/reviews/` were left untouched and are excluded from this commit.

Directory invalidation now requests a coalesced, active `StopWatchDevices` / `WatchDevices`
rebuild on the control worker, using the reserved core watch ID to receive a fresh SDK snapshot.
A revision gap preserves the last observed NetworkState instead of synthesizing network failure.
Reset/runtime changes revoke stream generations. Rebuild command failure leaves the directory
invalid and emits a finite Fault; this patch does not promise automatic retry after that failure.

SDK EOF now cancels the stop token, closes and drains the tracked business/control tasks within
the command timeout, then publishes Closed. In-progress SDK control/resync waits also select
cancellation. The sole receiver owner stays outside TaskTracker, so it never joins itself.
Retired peer/stream IDs are rejected for 600 seconds with a bounded 1024-entry active/retired
budget; saturation fails closed. Encrypted file storage also verifies that its held exclusive
lock still matches the lock pathname before load/replace.

Executed with the same vendored PROTOC and existing `crates/notes-cyberbus/target` cache:

- `cargo test --locked --manifest-path crates/notes-cyberbus/Cargo.toml`: **23 passed, 0 failed,
  0 ignored**; doc tests 0. The subprocess exclusive-lock fixture also passed its child run.
- `cargo check --locked --manifest-path crates/notes-cyberbus/Cargo.toml`: **PASS** for the
  production configuration. Only the same three upstream unused-helper warnings remain.

New fault coverage exercises a skipped directory revision with no spontaneous reset/delta,
repeated real SDK NetworkStop/watch reconstruction, real SDK EOF with an active TCP stream and
withheld processed ACK before any host Bus::close, ACK timeout/inflight cancellation, unused
listener expiry, retired-ID replay/saturation, subprocess lock contention and replaced lock or
marker failure. EOF assertions include closed/empty TaskTracker, cancelled stop, no active stream
or pending ACK, and terminated loopback TCP. SDK lifecycle/watch commands are real offline SDK
operations; bridge traffic/auth fixtures use synthetic authenticated state and a test-only byte
switch with real loopback sockets. These results do not establish authenticated network recovery.

The harness owner's `real-report-01.json` reports two authenticated independent identities in
the same verified workspace and relay TCP reachability, followed by invalid directory,
NetworkState running/reachable false and discovery_deadline. This agent has not established its
cause from a finite event trajectory and does not claim this patch resolves that real-network
failure. Real Logto sessions and user stores were not accessed. The previous pause/stash notes
above remain historical boundaries for the earlier commits; this section records the restored
and tested follow-up. Public API, Bootstrap trusted-peer prelude and 23-minute cap are unchanged.
