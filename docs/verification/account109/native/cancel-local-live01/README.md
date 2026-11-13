# Fresh GUI cancel/local live01 — FAIL before scenario

Run `2026-11-13T09:21:37.412Z` to `2026-11-13T09:22:37.654Z` failed during `prepare/ready` with `TIMEOUT` after the 45-second ready budget. No checks or observations passed. No SignIn, cancel, note creation/edit, enable or restart was executed. This provides no successful cancellation or local-save/persistence evidence.

The fixed WebView diagnostic was `documentProbe`, `interactive=false`, `rootHidden="true"`, `rootInert=true`, `startup=loading`, `visibility=hidden`, `readyState=complete` (1,332 probes). Follow-up readiness diagnostics were unavailable. Cleanup also returned `TIMEOUT`; the driver sent SIGTERM to its owned child. The sole process exited/closed with signal SIGTERM and code null, `naturalExit=false`. `cleanupFailure=CLEANUP_FAILED` is retained alongside the original prepare failure. A second process was never opened.

The original result's `pidAbsent=false` is preserved unchanged. In this runner, close threw before the subsequent PID check could execute, so that field does not establish a surviving process. Parent separately reported the PID absent. An independent read-only `ps` at `2026-11-13T09:27:05.341550+00:00` also found PID 27714 absent (exit 1, empty stdout/stderr); see `receipt.json`. No signal was sent during this archive inspection.

## Access observation and causal limit

Parent reports that after the failed run, CUA `getApp` for Finder succeeded with normal native AX and did not report locked. Its exact AX operation time was not recorded. This later observation does not establish access conditions throughout the earlier run. The failure is not attributed to system lock, and the hidden/inert/loading diagnostic alone does not establish a root cause. The CUA segment was completed. No raw Finder AX, private window content, browser data, URLs or callbacks are included.

## Exact source and retained evidence

- GUI candidate source: `920fa9cf3af6e3b3cc3b99fb1a78d960ab0c7d11`.
- Binary SHA-256 recorded by the run: `bea14bbe7fe136578d27d691c49425bc7e6e438097780154406dbde796ca83fd`.
- Executed tools reference: `44a9f43f5600174682b1ef7e71eb2649205dcc0e`. All four module hashes recorded in the result match exact committed bytes at that reference. Receipt records Git blob IDs and SHA-256 values; module sources are not copied.
- Source result: `/private/tmp/account109-cancel-local-live01-output/result.json`.
- Source result SHA-256 before and after archive: `81e608bcbce43122aa6628f552b574e1ee946a29770075daa6aaa6182c142c97`. Exact original bytes were re-read unchanged.

The fresh run store and output remain present. A local `du -sk` measurement reported **72 KiB allocated** for the fresh store; this is a directory allocated-size observation, not a DB content query, logical payload size, or claim of disk space freed. Only parent decides whether to remove these run directories after archive review. Nothing was removed or retried here.

`result.json` redacts only the fresh store's local absolute path. It retains the original failure, finite startup diagnostics, forced signal, lifecycle and `pidAbsent=false`. `receipt.json` adds bounded source integrity, committed tool provenance, allocated size and independent PID absence. `SHA256SUMS` covers all three other files. No DB/WAL/SHM, grant/binding, note bodies, raw App/AX output, browser content, credentials or binary were read/copied for this archive. No App/ADB/network/native build/test execution or live retry occurred; only this new archive directory was written.
