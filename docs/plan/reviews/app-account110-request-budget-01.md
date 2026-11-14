# Account110 unified request deadline independent review

Verdict: **APPROVE source integration/repackaging** for `493550e545749e735ff862e46a79bdddd0529b92`, author receipt `91ab7e802f0d6842dc758c49db5c875047948b96`, contract `7b950f2eb55205e8ce8563b8f54392fe8e2dad22`. Date: 2026-11-14. No remaining blocker in this delta. Actual App transfer acceptance remains pending.

## Source review

The only production behavior removed is the separate preparation 60-second timeout branch. The extracted `transport::prepare_request` retains the biased stop selection and awaits its preparation future after cancellation rather than dropping an owned blocking admission/retirement path. The actual transfer preparation calls this helper. The request's existing cancellation/deadline machinery is unchanged: its absolute 185-second Instant is set at request creation, caller wait uses timeout_at on that same Instant, and expiry cancels then awaits the work-owned receipt. No phase grants a fresh 185-second budget. Cancellation/expiry outcome still overrides late success.

Target selection, bootstrap/nonce, owner/workspace/Noise verification, admission fence and post-prepare stop/gate check remain. `blocking_request`, its error precedence and disconnect-confirmation loop, mapping close, work permit ownership and operation publication remain unchanged. Deadline means cancellation, not completion: work must drain and mappings close before request.complete publishes a terminal receipt and releases Busy. Cleanup can legitimately exceed the deadline; this patch does not introduce an early terminal timeout or release the permit early.

Only the added Tokio test-util declaration is dev-only; the normal dependency declaration is unchanged. All new tests/imports in worker.rs are under cfg(test), with start_paused scoped to their test runtime. There is no production clock pause, thread-stack modification, timeout increase, permission change, fallback or transfer retry.

## Independent validation

After explicit exclusive lease transfer, verified no compiler was active, clean author receipt HEAD, all eight author SHA256SUMS entries, and all three source/three unchanged lock hashes. The author's initial missing-trait-import compilation failure remains archived; the final source adds the test-only ReplicationPolicy import. No old failure was overwritten.

Ran each affected set once on the exact source, without repeating the full account suite:

- `cargo test --manifest-path src-tauri/Cargo.toml --lib --locked --offline account::worker::tests::unified_deadline -- --nocapture`: **3 passed, 0 failed, 0 ignored**. Uses the actual helper and existing request/cancellation/permit machinery with synthetic paused-clock preparation/transfer. Tests establish completion at 73.426 virtual seconds after crossing 60; original expiry at 185 after 100 seconds preparation; Busy and failed late admission through delayed retirement; late success rejected; dropped caller after 61.426 seconds drains preparation and never reaches transfer.
- The same freshly verified Cargo test executable, with nine exact existing test names from the author command receipt: **9 passed, 0 failed, 0 ignored**. Covers pre-dequeue expiry, dropped in-flight caller, real network service with blocked synthetic backend, late blocking admission, pending preparation IO cancellation, unconfirmed retirement, and three bootstrap identity/owner/nonce fences. These are synthetic/loopback regressions, not actual SDK tunnel or App acceptance.

Existing target `/private/tmp/cybernote-account109-mac-ec4348c6-target-01` only; jobs2, dev/test debug0, incremental0, locked/offline. Minimum sampled free space 9,186,201,600 bytes, above 6GiB (6,442,450,944 bytes), no floor trigger. Commands exited 0. No compiler remains, author tree remains clean, **target released**. [Exact independent logs, commands and hashes](../../verification/account110/native/request-budget-independent01/receipt.json) are archived with SHA256SUMS.

## Cargo feature boundary clarification

An initial reviewer assertion that normal/build dependencies would exclude every tokio/test-util activation was incorrect. The read-only inverse feature tree identifies a **pre-existing transitive activation through n0-future v0.3.2**. This is not introduced by the added direct dev-dependency. Independent locked/offline `cargo tree --edges normal,build,features --invert tokio` outputs at candidate and pre-patch reviewer source are byte-identical after replacing only their source-root paths. The receipt records both raw hashes and the common normalized hash. Thus this patch adds no normal/build Tokio feature expansion. The source-level statement is precisely that its new direct declaration is dev-only, not that all production dependencies lack test-util. Raw trees remain private to avoid duplicating a large dependency inventory.

## Evidence boundaries

Two successful exact-lock CLI maps totaling 61.426 seconds establish that the extra 60-second preparation cap can cancel otherwise legal work inside the existing request budget. These tests validate its removal and preservation of the absolute request/retirement contract. They do not explain the separate earlier approximately 24-second SDK failure, and do not convert live02 or any previous push failure to PASS. Fresh package/App direction-sync verification remains required. No App, account endpoint, device, actual library, grant/Noise data, manifest or package was accessed/changed by this review; only review docs/evidence were written.
