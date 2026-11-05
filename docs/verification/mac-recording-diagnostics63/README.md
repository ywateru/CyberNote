# Mac recording diagnostics 63 — author verification

## Scope and source binding

This is author evidence for the opt-in native AV authorization preflight diagnostics and structured JS error preservation. It is not independent acceptance, a real-device recording result, a permission repair, a root-cause finding, or a pixel comparison.

- Current frozen source: `78f9f9d896e8c5d75311f3202484ff119f57369c`.
- First implementation: `600efea487e492551eb03c9bc614f7ddfdc40378`.
- Worker-thread harness correction: `8d47e7791e549aed26f091676075de9930461b17`; production source was identical to 600efea.
- Nonblocking producer correction: current source; includes root's task contract clarification `68b9f2b` via cherry-pick `adb507b9`.
- `source-files.json` hashes all touched implementation and check sources. The evidence commit is separate from source commits.
- No GUI, current Mac17, original Android scene, microphone request, user media/notes, signing, installation, capability, dependency or cache changes were performed. Native tests instantiate the existing 52 fake class boundary and never an NSApplication/NSWindow.
- The sealed `docs/verification/mac-recording-access52/` files retain their original bytes. The old C entry point remains a thin default-off compatibility wrapper over the same diagnosed implementation.

## Product behavior and diagnostic policy

Only the exact process environment value `NOTES_RECORDING_DIAGNOSTICS=1`, sampled on the first explicit preflight, enables the diagnostics. Absent, `0`, `true` and other values are off. There is no UI switch, startup permission query, retry, file persistence or network sink.

A content-free, decimal process request ID is created before Rust dispatch and passed to ObjC as a scalar. The native OS completion captures only that immutable ID, the function pointer and the system Boolean for its entry event. Entry emission occurs before dispatching main processing. The owning ObjC object is still captured by the actual main-completion block with the original ownership rules.

The producer does no I/O, lock waiting, blocking send, worker join or flush. It performs fixed scalar/atomic operations and `try_send` into a 64-slot queue. A dedicated writer owns stderr formatting and I/O. It may remain blocked without holding an authorization context. Up to 256 event attempts are admitted per process; queue-full/disconnected and exhausted-budget counts are fixed atomic scalars. Once it can drain, the writer emits at most one `truncated` snapshot with emitted, queue-dropped and budget-dropped counts. That snapshot is a momentary loss indication, not a promise to summarize future attempts. After the snapshot no more event lines are emitted. On process exit, queued events can be lost; there is deliberately no producer flush/join. A blocked or failed writer can prevent visible diagnostic output and cannot be used as evidence that an OS callback did not occur.

Event records contain a fixed stage name, fixed numeric result code, content-free request ID, monotonic elapsed microseconds, and public status/Boolean/minimal phase scalars. Concurrent producers may enqueue in a different order from their timestamp sampling; callback-entry precedes its own main event in the FIFO whenever both are admitted. No raw error object, native pointer, note title, file path, note text or audio value is formatted.

Stages cover Rust dispatch/main/window checks; native entry/main/window checks; pending busy; the existing pre-request status; request issue; native terminal finish (code 7 is the unchanged 30-second timeout, code 2 is closed/invalid window); callback entry; main completion; existing post-completion status; pending clear; exception; late/duplicate completion; native result/context release; Rust receive/deadline; success window revalidation; final delivery; dropped Rust waiter; late dispatch/receiver. A dropped waiter means the Rust future was cancelled/expired; it does not cancel or clear the pending OS request.

The single pending request, 30-second native timeout, both 35-second Rust waits and Session's 45-second limits are unchanged. No status query is added. Timeout and close do not clear pending or release the context still held by the OS block. Only real completion or the existing exception path clears pending.

`authorizeNativeRecording()` keeps the same `Error.message`, always preserves a structured native string `code`, and forwards ordinary Error instances unchanged. An enabled native preflight may add a fixed `stage` and decimal `requestId`; off leaves both absent from the native wire shape. JS copies only a closed stage vocabulary and a positive u64 decimal request ID. Unknown failures retain the previous explicit failure message. Timeout/busy are never relabelled denied. Other plugin errors still serialize as the original `{code,message}` shape.

## Checks

All author checks passed at the current source. Independent review remains separate.

| Check | Result | Evidence |
| --- | --- | --- |
| Production ObjC compile, ARC/ARC-exceptions/blocks | PASS | `objc-production-compile.log` |
| Production native class, fake OS, diagnostics off/on | 17 per mode; identical 69-operation trace; 134 diagnostic events | `objc-diagnostics-test.log` |
| Original 52 owner/status + supplement harnesses | 14 + 4 PASS, original bytes | `objc52-test.log`, `objc52-supplement-test.log`, `sealed52-hashes.json` |
| Production JS structured errors | 17 PASS | `js-error-final.log` |
| Production Rust sink, off/invalid/on, four concurrent producers | PASS; stderr held during 400 producer calls; bounded queue and one truncation | `js-and-rust-sink-test.log` |
| Complete synthetic sink output | 3 normal events; saturated 65 events + one snapshot (`queue_dropped=191`, `budget_dropped=144`) | `synthetic-sink-on.log`, `synthetic-sink-saturated.log` |
| Filled stderr, no reader, Rust sink linked into ObjC fake suite | 8,192 bytes prefilled; 10,000 producer calls in 0.291 ms; same 17×2 cases/69 operations | `js-and-rust-sink-test.log` |
| Cargo plugin library, locked offline | 22/22 PASS | `cargo-plugin-test.log` |
| App Rust library integration check, locked offline | PASS, four existing dead-code warnings | `cargo-app-check.log` |
| TypeScript check / frontend build | PASS; unchanged frontend source since first source commit | `attempt-600efea/typecheck.log`, `attempt-600efea/build.log` |
| Required 52 production preflight / Session / handoff / microtask / session script regressions | PASS (8 / 15 / handoff / microtask cuts / 26) | `attempt-600efea/*52.log`, `attempt-600efea/session-script.log` |

Command arguments and exit codes are retained in `native-results.json`, `cargo-results.json` and the attempt result files. `result.json` provides a compact author outcome. All generated diagnostic lines are synthetic; the blocked pipe filler contains only repeated `X` bytes and is intentionally discarded by the harness parent after the child exits.

Final checks and command logs are recorded alongside this file. The native build/test slot is serialized with root; Cargo uses the private `/private/tmp/apple-notes-recording-diagnostics63-target` and locked offline dependency resolution.

The controlled native suite runs 17 cases with diagnostics off and on. It compares the entire 69-operation query/request/reply/release trace between modes. Coverage includes known/impossible statuses, no callback → timeout → busy → late completion, close → late completion, changed window at callback, status/Boolean mismatch, query exception, request-boundary exception with escaped completion, repeated late callback, and invalid FFI arguments. Callback entry is invoked from an asynchronous worker while main is occupied, so entry must be observed before any main-completion event.

The Rust sink check uses the production module without a Tauri or audio runtime. It checks strict opt-in/default-off silence, unique request IDs, optional metadata, the fixed stage vocabulary, dropped waiter delivery, four concurrent producers, process event budget and one truncation snapshot. Its saturation test holds the actual stderr lock until all 400 producer calls have returned. A second integration build links this production Rust sink into the production ObjC fake-OS suite; it first fills a synthetic stderr pipe, restores blocking mode and runs with no parent reader until the process exits. It requires 10,000 producer calls to return within one second and the same authorization trace to complete.

The production JS helper check covers 17 structured/ordinary/unknown error and success cases. Required 52 regression checks cover the production preflight/Session, cancellation and microtask handoff, with fake OS/media promises only. TypeScript checking and production frontend build are also recorded.

## Preserved first attempts

`attempt-600efea/` contains the initial test run and its new-harness assertion failure: `dispatch_sync` to a global queue did not guarantee a worker thread. Production ObjC compilation, original 52 14+4 cases, JS 17 cases, sink budget/opt-in tests, frontend typecheck/build and 52 JS regressions passed. That initial sink still did synchronous stderr I/O and is not the final implementation.

`attempt-8d47e77/` contains the corrected worker harness pass: 17 cases per mode, 69 unchanged operations and 134 diagnostic events; original 52 14+4 and JS/sink checks passed. The plugin Cargo run passed 22 tests. Independent static review then identified that synchronous stderr locking/writing could block main or callback entry. Current source moves all sink I/O to the dedicated writer; these older passes do not close that finding.

Frontend checks in `attempt-600efea/` apply to byte-identical frontend files at the final source. No frontend source changed in either later commit. Native/sink checks must bind current source separately because the diagnostic implementation changed.
