# CyberBus120 core independent review 02

2026-11-18. **PASS for closure of review 01 findings F1–F4 on the reviewed core revision.**
No remaining blocking finding was reproduced within this follow-up's CLI/source scope.
This is not full account/network/UI/device acceptance.

Reviewed exact commit `2b24104a294223382b9bff1aae793dd6e4b7aa61`, including ancestor
`b1dcdb0acfd878142f0fc30da9bfacbb16f8f8e5` and deadline patch 127a08e2. Previous review
commits 9afaf422 and d9e342a5, their report and all original failure fixtures remain
unchanged. This follow-up writes only this new report. No product source, stash or index
entries belonging to another author were changed. The reviewer authored platform scope,
not this core implementation.

## Finding disposition

Line numbers refer to 2b24104a.

| Original finding | Disposition | Reviewed change and independent evidence |
| --- | --- | --- |
| F1 P1 blocking: revoked directory never rebuilds | **Closed** | bus.rs:328–380 schedules a coalesced StopWatchDevices/WatchDevices rebuild outside the sole receiver. The independent real offline SDK fixture executes NetworkStop and a valid profile update, then observes directory validity recover. The committed suite additionally passes repeated stop/rebuild and a skipped-revision recovery without an incidental SDK reset. Reset/runtime changes cancel streams and advance the account generation. |
| F2 P2 blocking: EOF leaves worker/store owner alive | **Closed** | bus.rs:143–156 cancels stop, closes and waits for tracked tasks before signaling owner completion; bridge.rs:535–559 makes control/resync waits select cancellation. The original independent EOF fixture induces actual SDK receiver EOF without running adapter close first: stop is cancelled and tracker is empty at owner_done. The committed active-TCP/withheld-ACK EOF case also passes. Owner stays outside the tracker, avoiding self-join. |
| F3 P2 blocking: Bootstrap local forgery and recreated-slot replay | **Closed** | bootstrap.rs:7–31 and bridge.rs:145–186, :350–369, :491 introduce a fresh 32-byte receiving-core nonce only for incoming Bootstrap. The prelude is NCBBOOT2/112 bytes. Nonce never enters the SDK envelope or initiating entry; a successful claim consumes it under the entry lock. Adapted independent attack assertions reject a guessed nonce before reading ingress, preserve the legitimate subsequent socket claim, reject its second claim and reject the OLD consumed nonce after identical slot recreation. A new slot's fresh legitimate context remains claimable. |
| F4 P2 blocking: replaced lock permits two usable vault owners | **Closed** | store.rs:128–131, :179–208, :268–281 validate held descriptor/path device and inode, regular-file status, one link, private mode and owner on Unix. Identity failure poisons the object. The unchanged independent unlink/reopen fixture no longer leaves the old object usable. Committed subprocess cases pass unlink and atomic replacement/new-owner write; stale-owner read/write fails, ciphertext remains intact, and restoring the old path cannot resurrect a poisoned object. |

Watch rebuild command failure remains explicitly fail-closed with a finite Fault rather
than an automatic retry guarantee. EOF drain is bounded by the command timeout and emits
a finite Timeout fault if that budget expires; the tested normal and active-stream EOF
paths drained successfully. These are documented limits, not claims of unlimited recovery.
No content operation is automatically replayed/remapped by discovery reconstruction.

## Independent CLI execution

Exported only `crates/notes-cyberbus` and `vendor/cyberbus` from the exact Git object into
an isolated temporary directory. Used actual fixed Git SDK revision
`359465e83bd74b571a963f3d1fdc238f50169919`, cached vendored protoc and the existing
`crates/notes-cyberbus/target` dev/test cache. No sibling-source dependency was introduced.
Every Cargo invocation had a 240-second wall-clock bound, including build-lock waiting.
All three commands completed without hitting that bound.

| Command / phase | Result |
| --- | --- |
| `cargo test --locked --offline --manifest-path crates/notes-cyberbus/Cargo.toml` on unmodified exported product | **27 passed / 0 failed / 0 ignored**, doc tests 0. Ordinary lock-contention child plus unlink/replacement reopen children also passed. |
| `cargo check --locked --offline --manifest-path crates/notes-cyberbus/Cargo.toml` on unmodified exported product | **PASS**, production configuration. |
| `cargo test --locked --offline --manifest-path crates/notes-cyberbus/Cargo.toml review_ -- --nocapture` after temporary test-only includes | **8 passed / 0 failed / 0 ignored**, 27 filtered out. |

Only the same three upstream unused-helper warnings (`used`, `emit_data`, `cancel_rpc`)
were observed. The eight independent cases were:

- Real SDK schema registration/unknown-schema rejection and explicit offline Send gate.
- Real SDK NetworkStop/profile-update watch recovery.
- SDK receiver EOF worker drain before host close.
- Remote-known Bootstrap Open fields with an unknown receiver nonce before ingress read.
- Consumed Bootstrap context replay into a recreated slot.
- Replaced lock path with two attempted owners, unchanged from review 01.
- Bounded cancellation/join with full stream slots, withheld processed ACK and saturated
  synthetic completion traffic. Its assertion allows an explicit finite Timeout result,
  then requires tracker drain within its separate watchdog; it passed. This does not
  establish authenticated transport saturation behavior.
- The documented setup/deadline responsibility: host setup-inclusive absolute deadline
  remains required; core stream timer begins after accept/open.

Temporary host logs: `/tmp/cyberbus120-core02-baseline.log`,
`/tmp/cyberbus120-core02-check.log`, `/tmp/cyberbus120-core02-adversarial.log`.
They are local execution aids rather than durable shared artifacts.

## F3 fixture adaptation and reproduction boundary

The original committed review fixtures were copied into the temporary export; none was
edited in the repository. Bus/store fixtures were used unchanged. Bridge fixture changes
were limited to new-API setup and preserving the original attack assumptions:

1. The attacker's manually constructed context gets `receiver_nonce: [0; 32]`, a guess.
   It is submitted **before** reading the genuine ingress socket. The desired assertion
   that this forged claim is rejected remains unchanged.
2. A synthetic initiator OpenAck slot is kept alive so the receiver does not cancel the
   stream merely because a test omitted the opposite handshake entry. It contains no
   receiver nonce and gives the attacker no new information.
3. Only after the attack attempt does the legitimate side call read_bootstrap_context
   on the actual socket and claim its returned nonce. A wrong nonce must leave this
   claim available; a repeated legitimate claim must fail.
4. The recreated-slot test first obtains and consumes the original receiver context,
   removes/reallocates the same peer/stream/generation slot as in review 01, and replays
   that **old** context. It does not replace the attacker's old nonce with the new one.
   A separate positive check verifies the recreated slot has a different nonce and its
   own valid context can be claimed.

The failures are closed by passing security assertions and source tracing, not by a
compile error or by weakening the unknown-nonce/replay condition. To reproduce, export
2b24104a, copy the retained review-01 test includes into that export, apply only the four
setup adaptations above and run the same bounded Cargo commands. The user requested only
this new report as a persistent write, so no second fixture directory is added.

## Acceptance limits retained

This review ran CLI tests directly and inspected source. Real authentication/grant restore,
authenticated dual-peer discovery/Data/relay/Noise, Notes push/pull/attachments, actual
account call chains, macOS user's Keychain, Android Keystore and power-loss behavior were
**not independently executed** here. Developer/user reports of separate harness runs are
not substituted for this evidence. Synthetic auth state/test wire is confined to bridge
fixtures with actual loopback TCP; the lifecycle/watch SDK commands themselves are real
and offline.

The new native Bootstrap prelude requires downstream callers to use the shared parser or
adopt NCBBOOT2/112 bytes. Profile/Noise validation and account-generation checks remain host
requirements; a local capability alone does not grant Notes protocol identity. The previous
P3 nonblocking observation about raw Envelope Debug remains unchanged: no core logging
exposure was found, and raw protobuf payloads remain native-only/no-log.

No additional fault-enhancement work, Android test app, UI operation preparation, app
installation, online change or user-notes access was performed. Full integration and user
manual UI acceptance remain separate from the four core fixes cleared by this review.
