# Account110 network independent review 01

Verdict: **CHANGES REQUESTED** for exact source `29b2a86d5b65cfad469d62fe87098302e4c1d4ef`, parent `c4cb45ac2cf0913d9f105d3e6a087bbaf03f247b`. Two unresolved findings below prevent whole-network approval. Review performed 2026-11-14 by static source inspection and independent hashing/reading of the author's existing receipts; **no independent Cargo execution** in this review.

Review branch: `codex/account110-native-review`, based on `500f86218b77e50ba041c6f3b44519a4f3e6dd3f`. The contract is `docs/architecture/account-device-actions.md`, including its requirement that one account runtime has at most one bounded device operation. Native WIP, registry server implementation, deployment, and real-account acceptance are outside this verdict.

## Findings

### P1 — Action reservation is released before confirmed task retirement

At the reviewed revision, `src-tauri/src/sync/network/service.rs:411-426` removes `account_task` before calling `worker.stop()`. `Worker::stop` at lines 29-35 waits seven seconds, then requests Tokio abort and returns an error without observing future destruction. `disconnect` at lines 299-311 also clears the reservation even when `worker.stop()` fails. Its comment promises a joined task, but the timeout path does not establish that fact.

A synchronous backend call running inside the async action prevents the single-thread Tokio executor from polling cancellation or its action deadline. Once the outer channel deadline expires, the slot is cleared while that call is still running; another `pair`/`connect`/`transfer_once` can reserve the service and enqueue a replacement. Abort cannot interrupt that synchronous call. The old action may still finish its current backend work, or continue within the current poll, after callers have received failure and begun an explicit retry. This is admission of a replacement before retirement, not a claim that two synchronous Rust calls execute simultaneously on the single runtime thread.

This is relevant to the supplied integration: `StoreBackend::flush`, `required_blobs`, and `receive_head` call media verification synchronously, and blob publication does disk work. The trait's requirement for short backend calls is not a measured or enforced upper bound on disk/lock delays. Cancellation need not roll back an already committed atomic write, but it must not advertise a reusable operation slot while the old future can still work.

Required correction: preserve an identity-matched retiring reservation until actual task/future termination is observed. A bounded API timeout may return failure while retaining Busy for replacements; it must not silently detach authority to continue and clear the slot. Retirement must cover both the outer timeout path and `disconnect`, without keeping a mutex held across waits. Dropping the result receiver or merely requesting abort is insufficient.

Required targeted fixture: use a backend barrier to hold a synchronous method beyond a short injectable action/cleanup budget. Trigger timeout or disconnect, verify replacements remain Busy and cannot perform backend work while the old task is held, release the barrier, observe retirement, then allow one explicit retry. Preserve the existing cooperative socket-cancellation coverage.

### P2 — Passive transfers do not participate in runtime-wide serialization

`account_task` is a field of `SyncService`, accessed only by locally initiated actions. `listen_loop` at `service.rs:476-485` admits up to four connection workers. Each `transport::serve` constructs its own `wire::Handler`; `wire.rs:140-148` accepts `BeginTransfer` using only that handler's `direction` and `finished` state. Neither handler nor `Shared` acquires a common account-operation permit.

Consequently two authenticated passive sockets can both receive `TransferReady` and interleave content RPCs. A local `transfer_once` can also run while a passive transfer remains admitted. The four-socket transport cap and per-socket direction checks do not implement the frozen account-runtime single-operation rule. The existing Busy fixture covers two local calls only.

Required correction: introduce a non-waiting shared account transfer reservation for active operations and passive `BeginTransfer` admission. Additional operations must fail with a finite Busy response, without automatic queue/replay. Release only on terminal completion or confirmed teardown; preserve the legacy `policy=None` concurrent behavior. Handle simultaneous opposite-direction initiations without retaining either side's reservation indefinitely after rejection.

Required targeted fixtures: two independently authenticated passive sockets, plus passive-versus-active contention, with zero business reads/writes on the rejected contender. Verify permit release on Finish, disconnect, timeout, and revocation, and unchanged legacy concurrency.

## Boundaries verified in source

- For `Some(policy)`, pair and reconnect authenticate/pin only, `sync_now` does not wake a content loop, and `client_loop` defensively rejects account mode. The manual `None` path still invokes the existing bidirectional cycle.
- `TransferDirection` is finite. The active cycle pulls only for pull/both and pushes only for push/both. The passive handler fixes the direction once per socket: push cannot read Head/Blob; pull cannot prepare/write/commit content. Inventory is explicitly permitted. Repeated or unsupported BeginTransfer is rejected.
- Old account clients cannot issue content RPCs without the capability handshake. A new account client requires an exact version/direction acknowledgement and does not downgrade to legacy content exchange. `Status` remains a content-free pre-handshake probe.
- Account connection reconstruction uses the policy-provided endpoint and stored peer UUID/Noise key, checks returned device identity, workspace, and authorization, and repeats checks around business RPCs. No arbitrary endpoint input or weakened Noise verification is introduced by this delta.
- Success requires durable receive/commit receipts and a terminal TransferComplete; it does not imply foreground projection or resolved conflicts. Partial staging remains hash/size checked. Server policy checks continue around handler calls; socket read/write limits, action timeout, and passive elapsed/idle limits remain finite, subject to the synchronous retirement finding above.
- Changes are confined to four network source files and the standalone test harness/Cargo dependency lock. No SDK, frontend, product Cargo manifest, publishing manifest, or server policy change is part of this commit.

## Existing author evidence independently checked

The seven changed working-tree files matched their exact committed bytes at review time. Author tree was clean at `29b2a86d`.

| Evidence | Independently computed SHA-256 | Observed content |
| --- | --- | --- |
| `/private/tmp/account110-network-author-receipt01.json` | `4f1258486be449e2a7b2abfd723b54aec9bf63619640407a1a61d5850d7e499e` | Exact source/base, finite test claims and safety limits |
| `/private/tmp/account110-network-suite02.log` | Independently computed; exact match to receipt `networkSuite.sha256` | 18 + 1 + 3 + 6 + 1 = 29 passed; zero failed/ignored |
| `/private/tmp/account110-network-store-tests07.log` | `13a811ebccd2a73b557e4ce1299086119c249c215fe08980d01a91acf68c43cc` | Four PASS groups matching the receipt |

The actual-Store fixture uses fresh temporary SQLite stores and local authenticated sockets. Its three-direction loop compares formatted documents, plain text, attachment bytes and blob hashes; prohibited-direction checks inspect absence in heads/seen/inbox and attachment/blob storage. It also tests pair/reconnect/wake/idle and late edits without automatic transfer, legacy automatic both, rejection of a legacy listener, local Busy, blackhole-socket cancellation, explicit retry, and revocation. These are meaningful authored tests, not an independently repeated run or live coordinator/account/device acceptance.

The deadline unit test uses a pending future that yields; the cancellation fixture stalls network I/O. Neither covers an unyielding synchronous backend call. Neither the listed network tests nor the four Store groups demonstrates account-mode passive-versus-passive or passive-versus-active serialization. Thus their passing results do not close the two findings.

Committed product-source SHA-256:

| Path | SHA-256 |
| --- | --- |
| `src-tauri/src/sync/network.rs` | `a7163e173e029bd87911649f65de14b0ecbf749f300394fb0ac475e1c9ebe3b4` |
| `src-tauri/src/sync/network/service.rs` | `4ff778e81f192a78a82b7e070ed4e9139130aa9f09a233aa0b4e5ce1de983882` |
| `src-tauri/src/sync/network/transport.rs` | `f5faf2824fb40ea764622775a80773cb1e29fa1bdbf0a6bce922bfeaabc130d2` |
| `src-tauri/src/sync/network/wire.rs` | `badca08750fffb58ee66a8b301c8e3fc895477d14bc590ef8a18d0ccee93b2d3` |

No author/server tree was modified. No shared-target lease was acquired; Huygens owns the target for native compilation. No Cargo, app, device, external network, real-account data, or private-store access occurred. Precise fix commits and coordinated focused validation are required before a final network approval; native integration remains a separate review.
