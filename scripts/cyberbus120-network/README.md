# CyberBus / production Store network harness

Two child processes each own a real core `Bus`, a distinct SDK installation vault, a
distinct SQLite `Store`, a production `IdentityStore` and a production `SyncService`.
The controller is the only reader of each worker's confidential stdout pipe. Do not
run a worker interactively or redirect its stdout to a public log.

## Build and local checks

From the repository root:

```sh
python3 scripts/cyberbus120-network/build.py \
  --target-dir /Users/water/work/2026/Apple-Notes-Clone-cyberbus120/crates/notes-cyberbus/target
python3 -m unittest discover -s scripts/cyberbus120-network -p 'test_*.py' -v
```

`build.py` creates a small ignored `.build` manifest whose bin points to this source
and whose dependency points to the integrated `crates/notes-cyberbus`. The source
closure requires this integrated checkout. Cargo owns the shared target
lock; jobs are capped at two. No alternate SDK or source copy is built. Cargo.lock
pins the Git SDK to `359465e83bd74b571a963f3d1fdc238f50169919` through core's patched
local runtime. The binary embeds the node.rs digest, the core source baseline and
an aggregate of the local source closure including Backend, Cargo files, included
production modules, core, patched runtime and the public controller/configuration.

With `NODE` set to that target's `debug/cyberbus120-node`:

```sh
"$NODE" --fixture-probe
python3 scripts/cyberbus120-network/controller.py --binary "$NODE" \
  --mode lifecycle --report scripts/cyberbus120-network/lifecycle-report.json
```

The fixture probe runs production Store capture, media hashing and wire validation
locally; it does not test network or authentication. Lifecycle mode creates two
SDK installations and closes both. Neither local check can pass the real suite.

## Real authentication and network run

The callback-only driver and its imported `Flow` were read before use. Its
`--deliver-loopback` branch pins the old 18765 callback and must not be used. Its
`--callback-file` branch validates issuer, client, resource, scopes, PKCE and allowed
redirect against the supplied public config, and does not exchange the code.
The audited driver digest is:

```text
0eec7c477991cd3e81518d937429af24ff80ca3c45878276c27362ef227a23e3
```

```sh
python3 scripts/cyberbus120-network/controller.py --binary "$NODE" --mode real \
  --driver-sha256 0eec7c477991cd3e81518d937429af24ff80ca3c45878276c27362ef227a23e3 \
  --report scripts/cyberbus120-network/real-report-next.json
```

The controller logs in A then B. AuthStart comes from each SDK. Only SSH stdin
carries the authorization URI. The remote helper creates a fresh 0700 test directory,
writes public-config and authorization as 0600 files, copies the authorized
`qa-primary/test-account.json` fixture with mode 0600, invokes only the callback-only
driver, and returns the callback into a captured private subprocess pipe. The same
SDK operation receives `AuthCallback` and owns all PKCE exchange and restoration.
The remote helper removes its directory in `finally`. It never calls management
APIs, changes users, runs `verify-logto.main`, or calls `Flow.exchange`.

`public-config.json` contains public production pins and explicit 17897 callback.
The test opts in to `persist_grant=true` so the SDK can test grant restoration in
an encrypted vault. This is a harness storage choice; it changes no Logto config.
It differs from the deployment document's memory-only sample. The callback URI
is submitted to the SDK directly; an HTTP loopback callback listener is not tested.

Every run creates private independent installation directories. The core
`EncryptedFileStore` uses its `test-key` feature, with one random test-only AES key
saved as a private 0600 file per installation. Existing mode reads that same key
and vault; it never copies either to another installation or falls back to CreateNew.
These directories contain sensitive SDK grants and remain private after the run.
Use `--private-path-fd` only with a caller-owned private file descriptor if their
path is needed for investigation. No path is printed by default. They are not
production Keychain/Keystore evidence and must never be committed.

## Sync path and assertions

The exact production Store, model, identity and network modules are included with
`#[path]`. The local Backend implements inventory, validated wire reception, media
snapshot verification, blob reads, and capability-bound `NetworkStaging` publication
by calling those production APIs. Store's application/session type dependencies
are included solely for compilation; no Tauri Account or Session is constructed.
An unused legacy SDK diagnostic type signature in production `network.rs` has a
compile-only unit type shim. No legacy SDK/provider, fake Store/backend, alternate
merge, fixture bus state, token injection or copied installation identity is used.

The test publishes a harness-specific protobuf public profile. The policy pins
the actual online SDK peer plus profile protocol UUID, Noise public key and
workspace; every production authorize call rechecks SDK authentication, current
directory, network, validation lease and pause state. Workspace derivation is
explicitly harness-specific from SDK-verified AccountSummary, not the app account
workspace contract or unverified token claims.

For pair and each transfer, A creates a fresh `Bus.map(peer32, Service::Sync)`.
B issues a production Noise invitation with **A's mapped listener** as its dial
endpoint. That invitation is passed only over the controller's private IPC. The
production WebSocket + Noise handshake and every replication byte then pass
through CyberBus Data to B's registered production SyncService listener. The
controller never dials B's actual listener. Bootstrap is not part of this test.
Production account policy mode prevents idle automatic replication.

The full real suite, only if discovery and pair succeed, checks:

- Push A to B with Chinese rich text, a valid PNG, and a distinct binary file of
  524425 bytes; compare full document, plainText, production wire payload/metadata,
  MIME/name and original base64 bytes. The forbidden reverse note is absent from
  projection, heads, seen, inbox, attachment lookup and its unique file blob.
- Pull B to A with the symmetric reverse exclusion, then both for convergence.
- Stop both networks, edit B, close/reopen B's SDK/vault/Store/Noise identity,
  restore the real SDK grant, confirm dirty capture survives, then pull. Reopen A
  before applying its durable inbox to check pending data survives a second process.
- Concurrent offline edits of the same note with distinct attachments, then both;
  require the same two complete wire branches and verified SHA/size blobs on both
  installations. Call production `sync_resolve(keep_all=true)` with its reserved
  verified media snapshot on each installation. Require both recovered full
  documents, plain text and original PNG/file bytes through `read_attachment`.
  Normalize only newly generated attachment IDs in documents for comparison;
  the document structure, marks, text, MIME, filename and bytes must match fully.
- Pause and require an explicit production transfer to return `sync_Revoked`.

Transport processed ACKs are not business success. The test checks durable inbox
before applying it through production `sync_apply_pending`, and only compares
projected content after that application. A completed transfer must also drain
its mapping, and all processes must complete SyncService shutdown and Bus.close
before natural exit. A deadline, malformed child output, failed join or forced
termination leaves the report failed. Worker request and SSH/driver waits are bounded.

## Reports and limitations

Public reports contain only constructed booleans, counts, finite codes/stages,
source/test SHA256, and a sanitized trajectory. Child responses and error text
are never forwarded. The trajectory records observation elapsed time, auth phase,
directory validity/revision/counts, core network flags/code, raw SDK NetworkState
flags/code, and NetworkStart submitted/result. Events drained together share the
time they were observed by the harness; this is not an SDK wall-clock event time.
The trajectory is capped at 256 entries per worker, preserving its first 128 and
latest tail. Lag is counted and never silently interpreted as complete evidence.

The reports distinguish SDK NetworkStart's successful terminal result, raw SDK
network events, core snapshot state, authenticated discovery, Data ACKs, Noise
pair, durable Store receipts and projection checks. `passed=true` in lifecycle
mode describes only that mode; `real_network_suite` identifies real mode.

After freezing source in Git, bind the executed report to the binary and a
recomputable public manifest (use a new report name for every attempt):

```sh
python3 scripts/cyberbus120-network/evidence.py --binary "$NODE" \
  --report scripts/cyberbus120-network/real-report-05.json \
  --manifest scripts/cyberbus120-network/evidence-05.json
python3 scripts/cyberbus120-network/evidence.py --binary "$NODE" \
  --report scripts/cyberbus120-network/real-report-05.json \
  --manifest scripts/cyberbus120-network/evidence-05.json --verify
```

The manifest lists relative paths, per-file SHA256, the node/backend/Cargo aggregate,
local source closure aggregate, source checkout/core/production account-sync Git
baselines, toolchain, exact public build/run command, binary and report SHA256.
Generation rejects a binary/report digest mismatch or a closure differing from
the embedded build aggregate. The local closure is a conservative superset of
compiled source including nearby tests and the compiled document schema; external
registry/Git dependencies are pinned by Cargo.lock checksums/revisions. It is not
a vendored hash of all external dependencies or a reproducible-build claim. No
private vault, key, account fixture or authorization file is included. Early
reports that have only node.rs hashes do not establish this complete binding.

This harness does not verify Tauri account/Session creation, native callback
dispatch, UI quiet barriers, production platform key stores, Bootstrap, Android,
mobile/heterogeneous networks, three-device forwarding, cross-account/product
isolation, locked notes, tombstones, or app signout/switch behavior. Those require
their own acceptance evidence. See the verification report for actual executed
results; implemented assertions are not recorded as passing without execution.
