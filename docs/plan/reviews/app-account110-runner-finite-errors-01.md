# Account110 runner finite diagnostics independent review

Verdict: **APPROVE runner source** `ffff8f6dd2e79903569998fc878d3b78d84a2890` + `67587914dcbf4fa6990d25db014aa787749b0323`, author receipt `ebc6091c8514f008fc16799dcb84c40dccf72a7e`. Contract: `47572b955d75ac7e7bffd1f46d2588eb454de1b0`. Date: 2026-11-14. No blocking finding in this runner delta.

## Review

Only the existing runner and its synthetic tests change. `parseStatus` still stops immediately on any account/directory error. It attaches an explicitly projected finite error before throwing; final receipt generation revalidates that projection. No message, profile, device ID/name, endpoint, upstream body or arbitrary text enters these added fields. Existing unreported error fields are dropped, not copied. Unknown codes/stages or invalid request/sync combinations fail closed. Generic old `account_sync_failed` remains valid without stage/reason, and text or timing never supplies missing classifications.

The four sync stages and 15 reasons exactly match the native typed serialization at `c31a9b1c1cc4a7d56c73544fef987024b4111c3f`. Both fields are required together, only with `account_sync_failed`, with other diagnostic categories excluded. All 60 combinations and negative partial/unknown/cross-code cases are tested. Request diagnostics retain finite coordinator stages and HTTP/code consistency, including the 401/403 authentication distinction.

The observed concurrent operation is separate from account error: only validated direction, phase and times are emitted, with no device ID. A directory error while an operation is running remains an immediate overall failure and records running, not a manufactured failed terminal state. The status-poll and command-terminal failure paths both propagate the finite snapshot. `syncOnce` still submits one command, requires the pinned successful operation receipt to pass, and does not retry, extend deadlines, or accept errors. Lifecycle/cleanup and package/deployment/ownership gates are unchanged by the delta. Main's synthetic failing-App test demonstrates safe failure persistence through finally/cleanup.

No future diagnostic can be backfilled into historical live02 or the separate single-push observation. Neither is evidence of a specific pair/transfer/retirement reason until a new actual observation provides the typed fields. This approval is not real-client acceptance.

## Independent verification

Verified author committed runner/test bytes against their reported SHA-256 values and the clean receipt HEAD. Verified all three retained private author TAP file hashes, including the original 28/1 fixture failure and subsequent 29/0 results. The first failure's mock scheduling correction holds status at running until the intended terminal command path; it does not alter runner success conditions.

Ran once: `node --test scripts/verification/account110-device-actions.test.mjs` at exact author receipt HEAD. **29 passed, 0 failed, 0 skipped**, exit 0. The tests use synthetic fake Apps/VMs/files and do not instantiate NativeApp or contact a service. No Cargo target, app, device, real library, auth/Noise data, network or live evidence was accessed for execution. Author tree remains read-only.

[Exact independent TAP and receipt](../../verification/account110/runner-finite-errors-independent01/receipt.json) are archived with SHA256SUMS; TAP SHA-256 is `c512a5dffe87e3f360a024bae7af117c4f3c482164cc9ba4cc6549028c85ee42`.

## Native source checkpoint (separate gate)

Static review of exact `c31a9b1c` finds no blocker: actual pair/recover_pairing/transfer_once/disconnect typed results provide the stage, while legacy conversion remains generic. `blocking_request` and its cancellation-first/error-priority/drain loop are unchanged. New native tests cover finite serialization, preservation through action failure, unchanged authorization fencing, retirement-error precedence and cancellation winning. No new diagnostic contains a payload-bearing type. The runner review itself used no Cargo lease. After subsequent explicit release, native independent execution/approval was completed separately in [native review](app-account110-native-sync-diagnostics-01.md). UI source approval is outside this report.
