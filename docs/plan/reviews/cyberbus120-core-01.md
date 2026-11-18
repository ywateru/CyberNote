# CyberBus120 core independent review 01

Date: 2026-11-18. Verdict: **BLOCKED** for the committed review baseline.

Reviewed `c3ea6dc7d315ecf750540041edf6dd10083c00b1` plus deadline patch
`127a08e200396cf1de1a1a5186440b5c27ffbe9c`. All product line numbers below refer to
127a08e2, not the subsequently dirty/staged working tree. Reviewer authored platform scope,
not this core implementation. No product files, author index entries or stash were applied,
changed or used as test inputs. Tests export the exact commit into temporary directories.

Inputs: `docs/plan/tasks/cyberbus120-core.md`,
`docs/architecture/cyberbus-migration-20261118.md`, crate README and
`docs/verification/cyberbus120/core.md`. The last document correctly discloses that the saved
post-stage lifecycle fixes are absent from this baseline. Those fixes require a separate
committed revision and re-review; their earlier green run cannot clear this baseline.

## Blocking findings

### F1 — P1 blocking: revocation invalidates discovery without rebuilding its watch

Locations: `crates/notes-cyberbus/src/bus.rs:151`, `:204`, `:302`, `:343`, `:421`.
Design: architecture lines 37 and 57 (revocation, recovery restores discovery).

The internal WatchDevices is registered only during construction. NetworkStop, auth changes,
network failures, validation lease expiry and revision gaps set `directory_valid=false`.
Thereafter apply_devices rejects every ordinary delta while invalid, but no owner operation
requests a replacement snapshot/reset or re-registers the watch. The SDK's WatchDevices
implementation sends its initial Snapshot on registration and ordinary changes as deltas
(`vendor/cyberbus/crates/cyberbus/src/runtime.rs:376`, `:786`). Thus a healthy continuing
watch cannot recover the core directory by ordinary updates; peer_available remains false
and all future mappings fail until a runtime rebuild or an incidental SDK Reset.

Fixture `review_watch_recovers_after_revocation_without_account_or_network` uses the real
SDK and MemoryStore, drains its initial snapshot, executes NetworkStop, then performs a
valid offline public-profile update. It expects discovery to recover. Fix must actively
obtain a new trusted baseline, retain revision/account fencing and avoid unbounded retry
work or reopening cancelled content operations. Also exercise auth/network restoration and
revision gaps. This is normal reconnect/login availability, not optional test hardening.

### F2 — P2 blocking: EOF leaves the completion worker and store owner alive

Locations: `crates/notes-cyberbus/src/bus.rs:113`, `:130`, `:134`;
`crates/notes-cyberbus/src/bridge.rs:486`.
Design: architecture line 53 (close streams and drain owned tasks on revocation/Close).

On SDK event receiver EOF, the owner revokes and publishes Closed/owner_done but never cancels
`inner.stop`, closes its TaskTracker or waits for owned tasks. The completion worker retains
a Bus clone, whose Inner retains the completion sender. It can wait forever for another
command while retaining SDK/store ownership. Automatic EOF cleanup must not depend on a
later explicit Bus::close from a consumer that has already observed Closed. Active stream
cancellation alone does not release this worker/owner cycle.

Fixture `review_sdk_eof_drains_adapter_owned_tasks` closes the *private real SDK client* only
to deterministically induce receiver EOF without running the adapter's close cleanup. After
owner_done, snapshot.closed is true but stop=false and tracker.len=1. The fixture then calls
Bus::close to clean up before asserting. Public normal Bus::close does drain; this finding
concerns unexpected receiver EOF. Required fix must cancel/join before signaling completed
EOF cleanup and handle command timeouts without self-join/deadlock.

### F3 — P2 blocking: Bootstrap claim is not a local ingress capability and can replay

Locations: `crates/notes-cyberbus/src/bootstrap.rs:10`, `:24`;
`crates/notes-cyberbus/src/bridge.rs:111`, `:301`, `:442`, `:610`.
Design: architecture line 55 (loopback does not authorize arbitrary native callers);
crate README “Bootstrap context” explicitly promises invented callers/replay rejection.

All context bytes are peer ID, initiator-selected stream/generation and a predictable local
account-generation counter. The receiving core adds no receiver-only random capability and
claim checks only these fields against a live entry. In the fixture an authenticated
synthetic remote selects an Open, the genuine core ingress socket is accepted but never
read, and a context constructed from those known fields successfully claims that entry.
The actual socket's later claim is rejected. Threat prerequisite is knowledge of an active
Open's identifiers (for example a cooperating authenticated peer); this is **not** a claim
that an unauthenticated remote or a local caller can guess arbitrary 128-bit stream IDs.
Profile/Noise identity checks are still required and do not bind this local socket to core.

Additionally, after finish_stream removes an entry, the same peer/stream/generation can be
allocated again and the already consumed context claims the new slot. The second fixture
uses private allocate/remove primitives, exactly as receive_data/finish_stream do; it does
not claim an end-to-end authenticated SDK replay test. SDK message-ID deduplication does not
prevent a peer sending the same Open in a fresh Data message.

Provide a fresh receiving-core-only unpredictable token per incoming Bootstrap connection,
bind its one-time claim to that active incoming entry/current account, and reject old
contexts after slot recreation. Retired-ID policy must be bounded and fail closed on
exhaustion; adding tombstones alone does not fix the first-claim local forgery. Preserve
host profile/Noise validation. Fixtures:
`review_bootstrap_context_can_be_claimed_without_reading_ingress_socket` and
`review_bootstrap_claim_replays_after_stream_slot_recreated`.

### F4 — P2 blocking: replaced lock path permits two usable file-vault owners

Locations: `crates/notes-cyberbus/src/store.rs:128`, `:177`.
Design/task: protected store exclusive ownership and corruption/missing fail-closed tests.

EncryptedFileStore locks an inode once; check() validates directory identity and marker but
not that exclusive.lock still names the held inode. In an isolated private temporary vault,
create/write owner A, unlink exclusive.lock, then open owner B in Existing mode. B succeeds
and A.load still succeeds. Both may now mutate the same blob. This is a lock-path deletion
or replacement/fault scenario requiring same-user access; it is not a remote exploit.

Fixture `review_replaced_lock_file_does_not_allow_two_live_owners` demonstrates it through
public store APIs with a synthetic cipher key. Require stable lock-file identity/ownership
validation and fail-closed behavior on replacement/deletion, including reopen/subprocess
coverage. This finding applies to the optional file backend; it does not assert that the
macOS production KeyringStore has been live-tested or that its implementation was modified.

## Passed checks, observations and limits

- **PASS**: exact c3ea6dc7 cargo test: 13 passed, 0 failed; cargo check passed.
- **PASS**: exact 127a08e2 cargo test: 15 passed, 0 failed, doc tests 0; cargo check passed.
  Both use `--locked --offline`, actual Git-pinned SDK, cached vendored protoc, and the same
  existing dev/test target directory. Three upstream dead_code warnings remain.
- Single SDK receiver acquisition and owner loop; async TCP/ACK work is outside it. Snapshot
  peer gate requires current auth/account/lease/network/directory/online state. Revocation
  cancels streams/pending ACKs immediately; directory revision gaps fail closed. Recovery
  failure is F1, not acceptance of untrusted deltas.
- Descriptor registration is real: Bus construction successfully subscribes Notes TYPE_URL
  without a dummy RPC. Independent fixture verifies unknown schema subscription rejection.
  Committed descriptor test validates a 24 KiB envelope via SDK protocol validation and
  canonical frame decode. Offline Send returns NetworkNotReady *before* payload validation;
  equal errors for valid/malformed payloads are not proof of authenticated Data delivery.
  Source tracing confirms Data send and reassembled receive validate with the registered
  pool. Actual dual-peer Data/relay/Noise remains unverified.
- Compared retained vendored runtime files to the fixed SDK Git checkout: only Cargo.toml,
  src/lib.rs and src/runtime.rs differ, matching README.notes.md. Other SDK crates remain
  pinned to 359465e83bd74b571a963f3d1fdc238f50169919. No sibling path runtime dependency.
- Reviewed canonical fragment offset/size/type/encoding checks, per-direction Open/OpenAck/
  chunk/Close ordering, peer/generation/service binding, bounded queue failure and processed
  ACK peer/message matching. Existing real TCP fixture covers multichunk and half-close.
  ACK acceptance represents bounded queue admission, not durable notes success.
- Mac KeyringStore is re-exported directly. Source audit finds native keyring API, private
  lock checks, missing-entry distinction and protected-vault decoding. Existing/CreateNew
  errors are not retried as fresh identity. No actual Keychain read/write was performed.
  File-store committed tests pass tamper, wrong key, missing blob/marker, interrupted
  provisioning, symlink/private-directory and ordinary exclusive-lock checks. F4 extends
  the fault model; full-vault rollback protection is not established by these tests.
- Error variants carry only finite SDK code/I/O kind; Snapshot/BusEvent/BootstrapContext
  Debug are redacted and committed sensitive-string tests pass. **P3 nonblocking**:
  public raw Envelope's prost-derived Debug contains payload bytes. No core logging call
  exposing those bytes was found; retain the native-only/no-raw-logging contract, consider
  redacted Debug before adding logging. This is not an observed production token leak.
- **127a08e2 deadline patch PASS, nonblocking integration obligation**: default/hard maximum
  1380 seconds and idle expiry tests pass. The stream timer begins after local accept/open,
  so the host must enforce its original setup-inclusive absolute operation deadline and
  cancel/drop the lease. README now explicitly requires this. The independent short-budget
  fixture records that setup is outside this timer; no 23-minute wall-clock transfer run.

## Reproduction and fixture record

Runner: `docs/plan/reviews/cyberbus120-core-01-fixture/run.py`. It git-archives only the core
crate and vendor runtime into a new temporary directory. Adversarial includes are inserted
inside existing cfg(test) modules **only in that snapshot**, never the working tree. No
network account, user notes, platform app, real auth injection, Keychain or device is used.
Synthetic authenticated state is limited to the author's existing test wire for bridge
boundary tests; offline SDK tests use MemoryStore.

```sh
python3 docs/plan/reviews/cyberbus120-core-01-fixture/run.py \
  --target-dir crates/notes-cyberbus/target --protoc /absolute/path/to/protoc --baseline
python3 docs/plan/reviews/cyberbus120-core-01-fixture/run.py \
  --target-dir crates/notes-cyberbus/target --protoc /absolute/path/to/protoc --check
python3 docs/plan/reviews/cyberbus120-core-01-fixture/run.py \
  --target-dir crates/notes-cyberbus/target --protoc /absolute/path/to/protoc
```

Default revision is the exact 127a08e2 hash; use --revision to review a subsequent fix.
Adversarial regression assertions intentionally fail on this baseline; their failures do
not replace the passing committed suite. Final outcomes are recorded below. Fixture setup
iterations corrected an invalid profile update, an over-specific error assumption before
SDK's offline gate, and a watchdog shorter than configured command timeout; those setup
failures were not counted as product findings. No stash tests are substituted.

Checkpoint execution evidence: final completed adversarial run against 127a08e2 had
**2 pass / 6 fail**. Five desired-security assertions reproduce F1–F4 (F3 has two tests).
The sixth failure was the saturation fixture receiving `Error::Timeout` from close with
100ms command budget; it is **not a fifth blocking finding**. A refined version records the
bounded Timeout and separately waits for task drain. Its rerun was still compiling when the
user requested this checkpoint; saturation/drain acceptance remains **not completed**.
Schema/offline-gate and setup-deadline observation fixtures passed. Logs are temporary host
outputs (`/tmp/cyberbus120-127a08e2-{baseline,check,fixture-final2}.log`), not portable evidence;
the committed runner/fixtures retain the reproduction. No follow-up core patch is covered.
