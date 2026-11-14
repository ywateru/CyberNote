# Account110 controlled App SDK map diagnostics independent review

Date: 2026-11-14. Contract `aa432624350db85e927c6f1057acf9fbdd3ec690`.

- **APPROVE native** `c603cab6300b314c087cea2e88df9d25217e30ba` within this diagnostic-only scope.
- **CHANGES REQUESTED collector** `01dbb992a360c28dde071b373926f5fc1747dd4c`; also inspected its author follow-up `a6fecc69b25223b615866c07e9b462ef2cec3203` and report HEAD `108129f4`. The finding applies to both versions. No actual diagnostic run is approved by this review.

## P1 — status samples/terminal bypass the finite report boundary

The collector calls `safeStatus(s, labels)` directly on App `account_command` replies in sample() and commandTerminal, without strict status validation. That imported helper assumes validated input: it copies state/enabled/count/operation values directly and spreads each device summary. Unlike the SDK ring parser, this route does not reject unknown fields or arbitrary values. A synthetic status containing an extra summary.message is copied to the report, and an arbitrary state string is also copied. Both the on-disk result and printed terminal can therefore contain values outside the promised finite schema. The same helper call occurs in original `01dbb992` (lines 130/167) and current `a6fecc69` (lines 130/169).

This is a concrete device-free counterexample, not a claim that a real secret was emitted. It violates the fixed whitelist collector contract independently of the otherwise strict SDK ring validation. Existing 20 collector fixtures do not cover the status/terminal report boundary.

Required correction: validate every status/terminal DTO and build the finite projection explicitly, including nested summary/operation types and permitted fields. Preserve error-bearing states as observations instead of invoking the old parseStatus unchanged (which throws before the desired terminal can be retained). Reject unknown fields, invalid enums/types/counts, and extra nested data before persistence/printing. Add sentinel fixtures for status and terminal outputs, including error-bearing running/failed states, showing no raw or extra value reaches either output. Keep one push, owner fence, source/owned-root/first-result gates and eventual command-terminal observation unchanged. Do not solve this by suppressing all account errors or weakening native validation.

## Native implementation review

The module and all integration call sites are gated by sync-e2e + debug_assertions + desktop. Native collection/snapshot additionally requires both NOTES_SYNC_E2E=1 and NOTES_SYNC_E2E_SDK_DIAGNOSTIC=1. The fixed stdin action has no parameters, rejects extra fields and requires the existing ready gate; no account/device DTO or routing input is added.

All emitted strings are static literals: SDK Error variants are matched by type, timeout payloads are mapped against audited labels with unknown fallback, event phase/transport strings are similarly projected, API/OAuth status is bounded to 100..599. Error/event Display/Debug, raw message, peer ID, epoch, endpoint, credentials and contents are not serialized. Numeric generation/sequence/operation values are local counters, not SDK identifiers. Ring capacity is 256, eviction/lag are counted, and the SDK event receiver does not accumulate an unbounded transcript.

Attachment uses a Weak Client plus owner generation. Old owner/map observations are fenced against replacement; the observer task does not retain a live Client or mutate any business gate. Drop aborts the diagnostic-only receiver and clears its weak pointer only if still current. Historical finite records may remain observable with sdkGeneration=null; they are not current-session receipts. Events are asynchronous SDK-owner observations and carry no proven per-operation attribution. Maps have separate local operation/stage started/result records from the actual typed map result. A dropped/cancelled future can leave only started: the native observer does not invent a Cancelled return.

The two actual SDK map calls remain inside request_io's original stop handling and boxed composition. The observer awaits and returns the original result. It adds no deadline, retry, map concurrency, identity/Noise/workspace relaxation, disconnect change or early terminal. Existing cancellation, actual work drain, mapping close and Busy/receipt semantics remain. Disabled collection produces no diagnostic records/output; the additional e2e wrapper does not change the map result.

## Collector portions that are sound

The ring schema rejects unknown root/record fields and values, validates all applicable/null fields, bounds 256 native/512 collected records and finite counts, deduplicates immutable sequences, and exposes gaps/lag/overflow. The new driver action is parameterless; stderr remains counted and discarded. Typed map errors and generic operation terminal are separate observations. Account errors latch failure without being reinterpreted as command success. Ring loss or diagnostic failure prevents the diagnostic success label, which itself explicitly does not claim acceptance.

Route comparison is **available=false, match=null**; no witness/expected-target API is implemented here. This is not proof of route equality. SDK map cancellation with started/no result is incomplete, not an inferred typed reason. The follow-up retains SDK generation and adds a retained-owner check during sampling; neither fixes the status projection finding above.

## Independent verification and evidence

The supplied native path had transposed words; actual evidence was found at `/private/tmp/account110-sdk-diagnostic-native01`. Verified all three manifest entries and all five committed source hashes. Author 8/8 result is retained. After explicit target release, verified no compiler, exact clean native HEAD, and ran the same eight affected native tests once: **8 passed, 0 failed, 0 ignored**, exit 0. Covers payload suppression, typed errors/status, ring eviction, both environment switches with actual SDK NotLoggedIn, fixed ready-only action, actual transfer small-stack/type regression, pending preparation cancellation and shared-deadline/retirement. Only the existing target was used, jobs2, dev/test debug0, incremental0, locked/offline, 6GiB floor; no floor trigger.

At clean collector report HEAD, independently ran collector and existing driver fixtures once: **20 + 15 = 35 passed, 0 failed, 0 skipped**, exit 0. Also performed the bounded synthetic safeStatus counterexample, retaining only booleans, not the sentinel string. Passing fixtures do not override the uncovered P1.

[Project receipt, exact logs and hashes](../../verification/account110/native/sdk-map-diagnostics-independent01/receipt.json) record exact commands/source bytes and the finite counterexample result. Both author trees remain clean, no compiler remains, **shared target released**. No App, account/network/device operation, live/default library, grant/Noise material, binary analysis, source mutation, manifest refresh or package build was performed. Historical 39711 push failure and CLI mapping success remain independent evidence; neither is explained or upgraded by this source review.
