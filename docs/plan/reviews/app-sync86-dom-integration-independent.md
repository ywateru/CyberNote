# SYNC86 actual dual App DOM integration: independent review

Date: 2026-11-06. Verdict **PASS-REAL-APP-DOM-MATRIX**, within the exact local browser/Session/Store/socket scope below. Reviewed tool source chain3352b913→6d33147e→`b08c77289203691c30026ce673116721c5ca5a59`; worktree HEAD before this evidence commit `40b93a6a05d739672c2720a73969ee9afb7cb191`. Only the three shared tool files were reviewed; none were changed by the reviewer.

## Findings

No blocking finding in this tool delivery scope.

The runtime creates the explicit real Rust backend before mounting actual React/Tiptap App, then registers that existing page as main. All response events enter one synchronous admission sink, are drained from the returned response, and are delivered in order to the existing App event listeners. Concurrent poll_events continues while an operation awaits window replies, so pair/probe/prepare do not deadlock on command completion. Request IDs associate out-of-order responses with their own callers. Pair-capable runtime timeouts are at least35000ms. There is no headless_apply, injected workspace metadata, JS merge, generated ready/probe ACK, or fallback to FakeBackend on a Rust failure. The existing optional fake OS/device boundary is explicit and does not implement synchronization.

The runner's controlled delays/lost receipt are local IPC delivery faults around actual Session replies. They preserve the real operation ID and terminal receipt. The stale-conflict helper permits only sync_plan_stale to become a fresh observation query; it does not replay a committed resolve. Other errors in that helper assert immediately. Post-operation convergence waits remain read-only observations. The actual run records one permitted stale query and no mutation replay.

Browser shutdown uses the public owned BrowserServer child process. It records actual child exit before destroying only that child's inherited stdio, then requires code0/signalnull, server close and browser disconnect. It does not scan global handles, kill descendants, force process.exit or label a still-running browser as closed. Runtime cleanup unregisters the real page, stops polling, settles event delivery, closes context/browser/HTTP, then awaits Rust termination and records failure if any part fails. Immutable SQLite evidence runs only after all owned Rust and browser terminals, checks zero WAL, opens mode=ro&immutable=1 and verifies the database hash is unchanged.

The default non-rustEvents path still uses its existing browser launch and fixture semantics. The author final-default-notes01's nine passing compatibility checks are retained as author evidence; this independent review did not repeat unrelated fixture suites or claim those as real Rust tests.

## Independent actual matrix

Executed once from `/private/tmp/apple-notes-sync86-dom`:

```sh
node scripts/debug/sync-rust-dom.mjs /private/tmp/sync86-transport-build11-dom-input /private/tmp/sync86-dom-independent-build11-01 /Users/water/work/2026/Apple-Notes-Clone
```

All **39 checks** passed, including three Rust natural-exit assertions. The outer Node process **naturally exited0 in92.129075458 seconds**; internal runner wall91585ms. The actual front-end136-file hash is unchanged before/after: `6c50a195c5bbb65e18d23d94c5427a392bcb1ecf0129b16b01d70368629813b2`, product source clean. Three reviewed files match the frozen tool commit before/after. All47 real backend inputs match the root-supplied build manifest before and after. Runtime backend source is read from main only; no main file was written. Build product source `cd334bc88513a89c490788d2e2e27c7967575f4a`, immutable11 binary SHA256 `333fcd44e19ebbd30ece11b7a595816249a9458a46fb03523855ae8c51215800`. The runner uses its own verified binary snapshot rather than a mutable Cargo target.

The actual matrix covers paired preexisting records; both-direction text, folders/smart form/pin; unrelated DOM/focus/Undo preservation; pending local save and both conflict heads; real search input plus lost terminal receipt, retained cancellation and focus recovery; CDP IME/TagComposition and natural final insertion; actual chooser/FileReader/ACK ownership and image original-byte export; full synthetic-recording ticket protection through checkpoint, unrelated lock/delete/globalepoch rebind and final body/release ACK; original peer audio bytes; selected target lock and stale-token rejection; strict IPC negatives; and same-directory process/page restart with stable identity/paused dirty convergence.

| Runtime | Rust PID | Browser PID | Actual Rust/browser exit | Cleanup ms |
| --- | --- | --- | --- | --- |
| A |28788|28803|0 / signal null for both|512.371|
| B |28834|28847|0 / signal null for both|645.030|
| A-restart |29132|29141|0 / signal null for both|236.188|

All three report pending0, stopped poll, pageErrors empty, actual Context close, browser disconnect, browser-process-exit with owned stdio destroyed, BrowserServer close and successful cleanup. No forced Rust/browser termination occurs in this real matrix.

Two immutable SQLite inventories have integrity=ok, inbox0, dirty0, WAL0,17 heads and15 projections, and read-before/after hashes unchanged. Both have13 notes. Their attachment row counts differ4/2; an additional independent immutable read after all terminals proves **the two currently referenced media IDs, owners, lengths and original hashes match exactly**. Remaining A-only local checkpoint rows are not represented as a convergence failure or falsely claimed to equal B; orphan collection is outside this matrix. No database was altered.

The final75126-byte synthetic WAV independently has one channel,16-bit PCM,24000Hz,37541 frames, duration1.5642083333s and SHA256 `94c3f59c20dc49ef1f85397b40241609c2c013a87dab40843cdc40334eee262e`. The actual App's AudioContext decode and nonzero late samples plus remote-byte equality also passed. The exported PNG matches its original bytes. Variations from author audio length/checkpoint counts are accurately retained rather than copied from that run.

## Independent small transport negatives

Five narrowly scoped checks additionally passed with a **synthetic NDJSON child**, natural parent exit0/0.616427625s: out-of-order requestID association plus exactly-once sink delivery; synchronous sink failure rejecting current and pending calls; unknown response ID rejection; bounded request timeout; invalid poll interval rejection. The three deliberate protocol-negative child processes end by the transport's owned SIGTERM and are explicitly recorded that way. They are not natural Rust exits or actual App/crypto/SQLite proof. The positive synthetic child exits naturally0.

## Evidence and limits

Exact command logs, outer timing, unchanged source maps, actual result/events/calls/process terminals, safe screenshots/HTML, readonly attachment inventory and separate synthetic probes are in `docs/verification/sync86-dom-independent/`. Outputs were generated under fresh/private temporary directories and copied only after every real process/browser closed. Original author failures and their recovery history remain unchanged under sync86-dom-integration; this independent pass does not relabel those failed runs.

This is an explicit DEV browser App integration using real Rust Session/SQLite/Noise sockets on the local host. Browser file chooser, synthetic440Hz media, clipboard/dialog, window and OS boundaries remain test boundaries. It is not a production-debug-exclusion check, native macOS App, Android/provider/system-IME/microphone test, LAN/public-tunnel/VPN route test, original Apple pixel proof, or full sync-goal completion. Wider wire/crash/multi-peer/participant-generation matrices belong to their separately recorded Rust and route evidence. Native tools must update their exact shared dependency hashes before final build11 Peer smoke; this review does not edit or implicitly accept those native changes.
