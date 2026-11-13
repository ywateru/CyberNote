# Original desktop re-login live02 — FAIL

This archive records the completed `account109-desktop-relogin02` attempt. It is evidence of a failed re-login continuation, not a successful account login or sync validation. Archive preparation performed no App, browser, ADB, network, build or test invocation.

- Run: 2026-11-13T07:06:50.106Z through 2026-11-13T07:07:04.075Z.
- Archive source checkout: `20d62c11fcfead606680928ec5f4f83297a72969` (integrated runner; unrelated parent changes left untouched).
- Candidate source: `10814415ca088273bacc311d192b9605bda16775`.
- Candidate SHA-256: `b981400529f36cb698616d3871cc83b9a5d7cc4c10fb75009276697daba9ee6f`.
- Source result SHA-256 before and after archiving: `56828fd1084597d010e86466815c66b4731215d1e8174d4c39ad83be9bb7a8f3`.

Both GUI instances reported interactive ready with startup detached. The pre-launch baseline check passed, including original-file unchanged and overlap-agreement checks. A was signed out. B's pinned-runner classification was `serverInvalidGrant400` from `account_authentication` at `identityRefresh`. The visible production “重新登录” UI action was invoked through the existing UI handler (not physical input). B transitioned through `authorizing` to `account_auth_identity_invalid`, reason `responseMetadata`. The run failed in `b-recovery` with `ACCOUNT_AUTHENTICATION_FAILED`. The other scenarios remained `not-run`; no login, catchup, bidirectional, restart, or final-state success is claimed.

Parent separately observed no new browser tabs in the before/after inventories and did not complete browser authorization. This does not prove that a page never opened transiently. That browser observation is parent-supplied context, not a claim derived from this result JSON. Current CUA access was confirmed unlocked by parent; this archive does not attribute this failure to a system lock. Code-level cause investigation belongs to the separate author and is not inferred here.

Both owned App processes naturally exited with code 0 and no forced signals, as recorded in `result.json`. A read-only `ps` check at 2026-11-13T07:09:03.697700+00:00 found neither recorded PID present; `pid-check.json` preserves that bounded observation. It does not claim absence of unrelated processes.

## Files and sanitization

`result.json` preserves the actual FAIL, scenario outcomes, diagnostics, lifecycle, synthetic note IDs/content hashes, and original-subject SHA-256 only. The local candidate binary path and original synthetic store directory paths are redacted. No plain account identity, credentials, grant, token, callback URL, raw app output, baseline database/WAL/SHM, raw note bodies, attachment bytes, or binary is included. The source result/run directory is unchanged.

`modules/` contains byte-exact copies of all five runner modules fingerprinted in the live result. Their SHA-256 values match its `tools` map. It also contains `account109-headless-driver.mjs`, required by the headless-recovery helper's static import: that additional module matches the archive source checkout above, but was not independently fingerprinted in the live result. Its inclusion is source provenance only and does not authorize or record a headless run. No runner modules were executed for this archive.

`SHA256SUMS` covers every archived file except itself. The archive is not committed by this delegation. Earlier failed runs/build preparations remain unchanged.
