# Account110 request cancellation author receipt — 2026-11-14

Product correction: `5d4eac3bbf90be851fc91ed931ced2f5ec81670d`, following native checkpoint `0c44b9e5`. Addresses the P1 described in independent review `dd9c7d827f36037896123faceeeea68840c6c6da`; **independent re-review remains required**. This is not live acceptance or packaging approval.

Only account/mod.rs, account/worker.rs and account/transport.rs changed. Network source/public APIs, frontend/DTO, server, SDK, manifest and product lockfiles are unchanged by this correction. Exact committed product hashes are in receipt.json.

## Behavior and retirement

Every admitted device request owns an absolute 185-second deadline, cancellation tokens, a work-owned permit and a private operation UUID. The deadline is unchanged. IPC timeout or dropped Rust waiter cancels the request; neither is treated as evidence that the work has retired. Terminal status now comes from the worker after execution, confirmed retirement and awaited mapping closure. An operation may remain running/Busy beyond the execution deadline while a backend is still finishing; no terminal failure or replacement operation is published prematurely.

The existing Gate lifecycle additionally checks the active request's cancellation, deadline and admission fence. The blocking closure rechecks cancellation on entry. This covers an admission delayed until after an early disconnect found no task: policy authorization still rejects it. No directory owner, grant, remote identity/issuer/Noise validation, target/direction pin, or automatic replication behavior is changed.

Prepare IO is cancellable; pair/recover/transfer blocking calls are joined. Every admitted blocking call receives a final disconnect/retirement confirmation after its closure exits, including a panic. Retirement errors fence further admission, retain the work permit, and retry only retirement confirmation, never the transfer. An initial disconnect success cannot substitute for the post-join check. The separate 60-second preparation deadline also cancels and drains its work instead of dropping a blocking admission. SDK mappings are closed and awaited on cancellation and errors as well as success.

Worker completion is fenced by owner generation, content epoch and internal operation identity. It cannot turn expired/cancelled work into success, overwrite a replacement operation, or change an already terminal receipt. Already committed atomic work is retained; cancellation is not a rollback of such work.

## Device-free evidence

Final commands, with the environment in receipt.json (same single target, jobs2/debug0/incremental0):

```sh
cargo test --manifest-path src-tauri/Cargo.toml --lib --features sync-e2e --locked --offline account::
cargo test --manifest-path src-tauri/Cargo.toml --lib --features sync-e2e --locked --offline sync::adapter::adoption_tests
```

Final source: **72 account tests and 6 adoption regressions passed; zero failed, zero ignored**. The tests ran on the exact final product file contents before the source commit; no product content changed between successful final runs and that commit. Existing warnings remain in logs; no full-suite or clippy result is claimed. SDK accessor and summary source are unchanged and retain the separately scoped earlier receipt.

New focused cases (10, included in the 72):

- Deadline before dequeue: work never starts; duplicate reservation remains Busy until receipt.
- Dropped waiter before dequeue: cancellation fires while the request retains its permit.
- In-flight deadline: delayed cleanup retains Busy; a late success becomes failure.
- Dropped in-flight waiter: execution cancels but its permit survives until cleanup.
- Pending prepare IO: cancellation prevents the next step.
- Late blocking admission after early disconnect: actual Gate policy rejects it; helper waits for join and rechecks retirement.
- Real pair + transfer_once over loopback with a controllably blocked backend flush: native deadline cancels, Gate is fenced, duplicate reservation is Busy, waiter stays pending until backend release/join; neither backend inventory nor content methods run after cancellation. Pairing is pure and the test performs no UI/store adoption.
- Blocking action panic: error cannot bypass retirement confirmation.
- Unconfirmed retirement: helper remains pending/fenced and eventual retirement cannot turn its earlier error into success.
- Status receipt identity and terminal guard: old/duplicate success cannot alter a newer or failed operation or advance lastSyncAt.

All logs, including two compile failures caused by test-import collisions, are retained. account03 (69 tests) and account04 (72 tests) are intermediate-source evidence, not final-source evidence. account-final.log and adoption-final.log are the final runs. SHA256SUMS covers this receipt and all archived logs.

No App/device, real login, original/private data, external account request or deployment was used. Target released with no owned Cargo process remaining. Last free-space observation: 10,661,328 KiB. No caches or old evidence were deleted.
