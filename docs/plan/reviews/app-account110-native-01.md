# Account110 native final-source review 01

Verdict: **CHANGES REQUESTED — package/native gate remains blocked** at exact final author HEAD `0c44b9e59b09375597eb1f7d6cdf3378428626e2`, tested product HEAD `5bfc5f33395fb70e27fe40ad493a0d859a2d3781`. Review date: 2026-11-14. The previously reported P1 IPC-timeout cancellation issue is still present; passing unrelated tests does not resolve it. No independent Cargo execution or shared-target lease is needed to establish that the defective production code is unchanged.

## Blocking P1: terminal IPC timeout leaves admitted work running

The exact-source finding, counterexample and required focused fixtures are preserved in [checkpoint findings](app-account110-native-checkpoint-01.md), commit `4a0968f0d51b690128e8c3a4b9e2ec9ff691fc6f`. Its locations remain valid for this final source:

- `src-tauri/src/account/mod.rs:678-682`: the 185-second timeout drops only the oneshot receiver and returns `Error::Sync`; lines 689-705 then publish Failed/finishedAt without requesting operation cancellation.
- `src-tauri/src/account/worker.rs:12-17`: DeviceRequest carries target/direction/epoch/permit/done, without request-specific cancellation. The work-owned permit prevents same-epoch overlap, but does not stop the work.
- `src-tauri/src/account/transport.rs:932-940`: receiver closure is checked only before admission. The already-started `transfer.await` does not observe caller timeout/drop and can continue until its eventual failed terminal send.
- `src-tauri/src/account/transport.rs:1048-1073`: preparation and network action observe only the content-child stop token. The IPC timeout does not cancel it. Pause/signout have their own lifecycle fence and are not alleged to bypass that fence.

Relative to reviewed checkpoint `c6f6e6da5f2d5bc512c38bd580b0ee7354db41b6`, final product change `5bfc5f33` adds only `private::directory(root.path()).unwrap()` to a test fixture. `0c44b9e5` adds the author verification archive. Neither changes request cancellation, the waiter or transfer execution. `account/mod.rs` and `account/transport.rs` are byte-for-byte unchanged from the checkpoint.

Static counterexample, not an executed reproduction: admit a request, hold its preparation/transfer after the one-time receiver check using a deterministic synthetic barrier, expire a shortened IPC deadline, then release the barrier. The current implementation sends no cancellation and permits subsequent transfer work before discovering that the caller is gone. Fix requirements are request-owned cancellation on timeout/waiter drop, execution-owned orderly cleanup/retirement, Busy until retirement, and protection against a queued blocking closure entering network admission after an earlier disconnect found no task. Do not merely increase 185 seconds, drop the transfer future, or ignore retirement errors. Existing committed atomic work need not be rolled back.

The author must provide an exact correction plus targeted synthetic tests for in-flight timeout, dropped waiter, before-dequeue cancellation, preparation cancellation and late network admission. Retain the fixed target/direction, epoch fence, directory owner, grants and local data. No automatic retry or replay. Final whole-native approval is withheld until this finding is closed and the correction is reviewed.

## Author evidence verified, with scope limits

Read the committed archive `docs/verification/account110/native-device-actions01/` at `0c44b9e5`. All **13 entries** in its SHA256SUMS match independently computed committed-byte hashes. Receipt SHA-256: `7e922c7d692a5546169ad19e19d1fa063bc5e593d5dab58c2729184a5d9e019a`.

| Author log | Observed result |
| --- | --- |
| `account-resume02.log` | 62 passed, zero failed/ignored |
| `summary.log` | 1 passed, zero failed/ignored |
| `sdk-accessor-harness.log` | 1 passed, zero failed/ignored |
| `adoption-focused.log` | 6 passed, zero failed/ignored |

The archive also preserves the compile failure, the earlier 61-pass/1-fail fixture run, rejected SDK invocation and zero-match adoption filter. Those are not counted as successful coverage. The final tests are useful evidence for their stated directory/schema/registry/paused-owner/epoch/summary/accessor/adoption boundaries, but do not test cancellation of already-started work when its IPC waiter expires or disappears. The compile/test success claim is therefore compatible with this unresolved blocker.

Exact production source hashes:

| Path | SHA-256 |
| --- | --- |
| `src-tauri/src/account/mod.rs` | `470b787096dd7b4b7fcb6c6748aafe1084cf9ac0952f172838e7b38aa55176fe` |
| `src-tauri/src/account/transport.rs` | `879f18a637f080a820fd6dceb7c64b355fa11395c70a0f52edfe0435c2d52a6c` |
| `src-tauri/src/account/worker.rs` | `1610005403046e3fcfc9a719cbb6120a960052538fa30d75fb77104f62cf8f70` |

Network approval through `7177ca9c` remains valid under [network review02](app-account110-network-02.md). It fixes network task retirement and shared active/passive serialization; it cannot initiate cancellation that the native caller never requests. This report does not revoke that approval or substitute for separate UI/server/deployment reviews.

Only this documentation was written in the independent review tree. Author tree was clean at the exact final HEAD when checked. No author/server/source/manifest changes, Cargo, target writes, build, app, device, network, private body/DB/grant access, or recovery rerun occurred. Parent and author should receive this blocking result before packaging proceeds.
