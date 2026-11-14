# Account110 selected transfer future independent review 01

Verdict: **CHANGES REQUESTED — one test-path assertion remains**, exact `4c1ac0033d10cd7bc864f2ff4ca087f147f235d8`, base `a663586b47f136508d1cab50f7ca2a075b9fd67b`. Date: 2026-11-14. Independent affected regressions **13 passed / 0 failed / 0 ignored**. No production control-flow defect identified in this heap-boundary delta. The remaining requirement was already raised in static review and remains present in the submitted SHA; it is not a newly observed runtime failure.

## Remaining P2 verification requirement

At `src-tauri/src/account/transport.rs:1396–1399`, the real small-stack reject branch still matches `Poll::Ready(Err(_))`. The case claims to enter the actual SDK map path, but an unrelated early error would also satisfy it. Tighten this to `Poll::Ready(Err(Error::AuthenticationAt(NetworkStage::CoordinatorSession)))`, using the appropriate module path. The synthetic target has all required fields; loopback map calls connect, whose active() rejects the deliberately unlogged Client with SDK NotLoggedIn, which the existing account conversion maps to that exact finite error. This makes the claimed path a persistent regression assertion instead of relying only on today's source inspection. Keep the precise Cancelled assertion in the separate cancellation case and existing size checks.

After an exact test-only follow-up, re-review its delta and rerun the affected real-future test; the already passed unchanged 12 other cases need not be repeated. This is the only remaining approval requirement identified here. No additional instrumentation, real login or binary analysis is requested.

## Production review

`execute_request` now takes Pin<Box<Fut>> and its real run_service caller boxes transfer_target before composition. `prepare_request` takes a boxed future, preparation itself is boxed, and each IO wrapper receives a boxed SDK map/connect/read/write/verification future. Thus the large underlying SDK state is not embedded repeatedly in generic wrapper async state. No detached spawn, lifetime erasure, unsafe code or production thread-stack increase is introduced.

Biased cancellation selection is retained. request_io still drops its IO on cancellation; prepare_request and execute_request still await their owned futures to finish after stop. The post-prepare stop/gate check remains. Absolute 185-second deadline, its creation time and outcome precedence are unchanged. Identity, target, bootstrap nonce, workspace/Noise verification, transfer direction, finite errors, blocking admission/disconnect/join, mapping closure and work-owned permit/terminal receipt are unchanged. No retry/fallback or relaxed success rule is added. Existing deadline/retirement tests were adapted only to pass boxed futures, preserving their assertions. Test measurements/env modes exist only under cfg(test).

## Exact evidence and independent results

Verified all 11 entries in the author's private SHA256SUMS, exact clean source HEAD and both committed source hashes. Author baseline and first partial fix genuinely failed their isolated 512KiB reject child with stack overflow; they were not just mock size checks. Original baseline measured prepare=50472, transfer=253008, execute=506160 bytes. The partial fix reduced outer types but left prepare=50472 and still failed. Final source also boxes underlying SDK IO futures. These historical logs and final author result are copied byte-for-byte into the project evidence archive, with their original hashes retained. No baseline failure was rerun, rewritten or converted to PASS.

Following explicit target release, no compiler was active, and the reviewer used the sole existing target with jobs2, dev/test debug0, incremental0, locked/offline and a 6GiB floor. Ran exactly the author's 13 named affected tests once using Cargo at this exact source. **13 passed, 0 failed, 0 ignored, exit 0**. Includes:

- Actual locked SDK map/connect type layout and real transfer/prepare/execute future composition. Final measured bytes: SDK map=24792, connect=24560, request_io=128, prepare=1360, preparation wrapper=208, transfer_target=832, execute_request=152.
- Isolated real-future reject and pre-cancelled preparation polls on 512KiB threads, with a separate 16MiB measurement-only test thread; production stack size is unchanged. Current reject assertion has the limitation above. Backend inventories stay zero, the Client has no logged-in session, and close is awaited. This is a real unauthenticated SDK entry poll, not a successful logged-in connection or full transfer.
- Three virtual-clock shared-deadline cases plus pre-dequeue expiry, dropped in-flight caller, real SyncService blocked synthetic backend, late blocking admission, pending IO cancellation, unconfirmed retirement and three bootstrap identity/nonce/owner fences.

Minimum sampled free space 8,720,179,200 bytes exceeded 6GiB; no floor trigger. All owned test processes exited, no compiler remains, source tree remains clean, **target lease released**. No full account suite or unrelated test was repeated.

[Project receipt and hashes](../../verification/account110/native/transfer-stack-independent01/receipt.json) include the exact independent command/output, source hashes, author original baseline/partial-failure/final logs and original author receipt/SHA manifest. The archive is intentionally limited to normal source/regression evidence. No binary/instruction analysis, actual App, account/device traffic, original/live library, grant/Noise data, product source mutation, manifest edit or package build was performed. Historical owned push crash remains FAIL. Even after this test requirement is closed, actual new-package App acceptance is required.
