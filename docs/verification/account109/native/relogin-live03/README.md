# Original desktop re-login live03 — FAIL

Run `2026-11-13T07:50:43.241Z` through `2026-11-13T07:52:56.239Z`. This archive preserves the actual failure; it is not successful login, account sync, or relay acceptance.

Both GUIs reported interactive ready/startup detached. The original-note baseline passed with original files unchanged and overlap agreement checked before launch. Both initial account statuses were clean signedOut. B completed the runner's full 120-second read-only clean-signedOut interval, then one real production UI SignIn handler was invoked (not physical input). B transitioned to authorizing and failed in `b-recovery` with `ACCOUNT_AUTHENTICATION_FAILED`; native diagnostics were `account_auth_identity_invalid`, `reason=responseMetadata`, `tokenOperation=codeExchange`, `tokenField=scope`.

No note edits or enable action occurred. All scenarios after baseline remained `not-run`, including login, paused edits, catchup, bidirectional, restart, final state, and AUTH06. The requested `endState=enabled` was not attained. No account/grant contents were read to infer post-failure state or cause.

Parent CUA observed 34 browser tabs before and after, with no new tab observed in those snapshots. This is not proof that no transient tab existed between observations. No browser content or tab identity is archived.

## Candidate and runner provenance

- Candidate source: `d1a6eadfd62ac45ba4ecb82e39dd3bd61fd4f5b4`.
- Candidate binary SHA-256 recorded by the live runner: `bb45bfe591463c4197e8f856090daf666b6b22031bc240b6c52f10b28b5cc5b5`.
- Pin author commit: `fb6d26a1f368e460d8ad9e82bc372fb174a39a27`.
- Runner integration commit: `2fb4fe118714adc2c81cce97f16ce3dc4ab08650`.
- Archive preparation checkout: `ca023ece64a3e9b335a9d6901b3f418539cb6265`; all six relevant module blobs match the integration commit.

`module-provenance.json` records paths, exact committed Git blob IDs and SHA-256 values instead of copying modules. All five modules fingerprinted by the live result match their committed bytes. The sixth is the necessary headless-driver static dependency, not separately fingerprinted in the live result; this does not claim or authorize headless execution.

## Cleanup and source preservation

Both owned App processes naturally exited code 0, signal null, with no forced signals. Read-only `ps` at `2026-11-13T07:56:59.484875+00:00` found recorded PIDs 4327 and 4350 absent; details are in `pid-check.json`. This observation concerns only those PIDs.

Source result: `/private/tmp/account109-desktop-relogin03/result.json`.
SHA-256 before and after archiving: `da1715da99ab5cb90412c40ec6f79d4ea2e65d1d40445e2d404becaa0ea75ad7`; exact source bytes were re-read and unchanged. No source-run file was written or removed.

`result.json` redacts only the local candidate binary path and original synthetic store directories, following live02. It retains finite diagnostics, scenario outcomes, lifecycle, synthetic entity IDs/content hashes and historical subject SHA-256. No database/WAL/SHM, grants, credentials, plain identities, raw App output, note bodies, attachment bytes, modules or binary were copied.

Archive preparation ran only local read-only inspection and wrote this new directory. No App/ADB/network/build/test invocation occurred. `SHA256SUMS` covers the four other files. No commit was made; parent review is pending.
