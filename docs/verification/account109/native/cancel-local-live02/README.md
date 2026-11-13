# Fresh GUI cancel/local live02 — PASS within bounded scope

Actual run `2026-11-13T10:11:31.835Z` to `2026-11-13T10:11:45.858Z` passed all five checks. Parent reports the runner command exited 0 on main `2f10dd1352950513a21616f66dd0464dda04307d`. The raw result passed a finite privacy review and is archived **byte-for-byte**, with no redaction or reserialization.

The verified GUI candidate is source `9e7c46d2fcc8ed31bf1210ce4272f73edffe9143`, binary SHA-256 `3fa9a3851e610348352f5594f976f145e2d344fd97a9f0d27124566f458ce65c`. The pin author is `213e7b77c6134ea5ce7add0e656b71ffe37a7fc5`. All four tool hashes in the live result match exact committed module bytes at the main reference above; Git blob IDs and SHA-256 values are recorded in `receipt.json` without copying modules or the binary.

## Actual checks and lifecycle

- `localSave`: fresh signedOut GUI created and saved the synthetic full document, including heading, bold/italic marks and exact plainText.
- `authorizing`: one real production UI SignIn handler reached native authorizing; no credentials or browser form input were supplied by the runner.
- `cancelledWindow`: one existing UI cancel handler returned to strict signedOut/disabled/no profile/no connected devices/no conflicts. **7** status and full-document samples over **3013 ms** retained the original structured body and plainText.
- `localEdit`: local editing after cancellation produced the expected new complete document/plainText and safe digest.
- `restartWindow`: the first process closed naturally, the same store reopened with account settings closed, and **7** samples over **3018 ms** retained the edited full body and strict signedOut state.

The runner asserts actual document JSON plus plainText, not text-only/substring equality. This archive stores only the resulting digests and synthetic note ID, not body copies. Both GUI instances reported interactive ready/startup detached. Both owned processes (17477, 17528) naturally exited and closed code 0/signal null, with no forced signals and `pidAbsent=true` in the original result. Independent read-only `ps` at `2026-11-13T10:13:53.571935+00:00` also found both PIDs absent; the receipt preserves that observation. This is not a claim about unrelated processes.

## AUTH-04 and acceptance limits

This is actual GUI cancellation, signedOut local-editing and natural-restart persistence evidence on a fresh synthetic store. It does **not** submit a valid old callback after cancellation, prove that such a callback is rejected, establish successful account login or identity validation, cover account switching/QA re-login, or establish three-peer synchronization/4G-WiFi relay acceptance. Reaching authorizing alone does not prove browser-page visibility. UI/editor functions are invoked through existing debug/e2e handlers, not physical typing; no browser content is archived.

The earlier `cancel-local-live01` remains FAIL with its startup/cleanup timeout and forced SIGTERM. This PASS neither reclassifies that attempt nor establishes its historical cause.

## Integrity, privacy and preservation

Source: `/private/tmp/account109-cancel-local-live02-output/result.json`.
Source and archived result SHA-256: `6f989d4317c94ec5455bbeb8f19db559f8c45b82a8d8c54c098604b1632fe56b`. Exact source bytes were re-read unchanged after archive creation. `SHA256SUMS` covers the three other archive files.

Finite result review found safe status, tool/candidate/content digests, synthetic note ID and lifecycle counters. Its only absolute path is the dedicated synthetic fresh-store path, intentionally retained to preserve exact raw bytes. No plain account identity, credential, grant, callback/browser URL, raw App/browser/AX output or document/plainText body is present. No DB/grant/binding/WAL/SHM or attachment file was opened or copied for this archive. Store and original output remain intact; no cleanup was performed. Archive preparation performed no App, network, ADB, build or test execution. Independent review is requested separately; this author receipt is not an independent approval.
