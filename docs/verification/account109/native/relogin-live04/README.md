# Original desktop re-login live04 — FAIL

Run `2026-11-13T08:46:44.025Z` through `2026-11-13T08:50:54.102Z` ended `fail`, `CONDITION_TIMEOUT` in `b-recovery`. This is not successful browser authorization, account login, sync, or relay acceptance.

Both GUIs reported interactive ready/startup detached. Baseline passed with original files unchanged and overlap agreement checked before launch. Both initial statuses were clean signedOut. B completed the full 120-second read-only signedOut wait, then one production UI SignIn handler was invoked (not physical input). B reached authorizing; browser authorization did not complete within the bounded wait. The last recorded B state was authorizing with no profile/error, enabled false. No note edits or enable action occurred; all scenarios after baseline remained `not-run`, and requested final state `enabled` was not attained.

The scope error observed in live03 was not reproduced in this attempt. This does not establish that it is resolved: live04 did not complete browser login or the subsequent exchange/validation path. No replacement cause is inferred from the timeout.

## Parent-supplied CUA observations and limits

At the beginning, native AX access succeeded. The extension browser inventory before B SignIn contained 34 tabs. One extension inventory after SignIn still contained 34 tabs and showed no new page. Later, a native Chrome AX read timed out after 30 seconds and the CUA kernel was reset. A subsequent `getApp` for Chrome succeeded and showed a tab titled “Sign in to your account”. Parent states that this AX observation occurred while the runner was still authorizing; its exact operation timestamp was not recorded. A subsequent extension search for that exact title returned no result. No form input was performed, and the CUA segment was completed.

Native visibility and the extension inventory disagree. We cannot conclude that the page failed to open, identify a newly created tab, exclude a transient tab, or derive precise cross-tool ordering beyond the supplied observations. The archive contains this bounded account only: no raw AX/browser output, private tab inventory, URL, old callback, or credentials. These CUA observations are parent-supplied context, not observations independently reconstructed from the runner JSON.

## Candidate, runner, cleanup and integrity

- Candidate source: `920fa9cf3af6e3b3cc3b99fb1a78d960ab0c7d11`.
- Candidate binary SHA-256 recorded by the run: `bea14bbe7fe136578d27d691c49425bc7e6e438097780154406dbde796ca83fd`.
- Run source reference supplied before execution: `9010c5bada147936c9f3e8db8159ef777d3bbb87`.
- Pin author / archive base: `8806ca4eb84175754ad54a021bdf60c47afe3b5d`.
- All five module hashes in the live result match exact committed module bytes at the run reference; `receipt.json` records their Git blob IDs and SHA-256 values without copying module sources.

Both Apps naturally exited code 0 with signal null and no forced signals, as recorded in the result. A separate read-only `ps` check at `2026-11-13T08:52:55.302076+00:00` found owned PIDs 86247 and 86257 absent. Its bounded results are in the receipt; this makes no claim about unrelated processes.

Original result `/private/tmp/account109-desktop-relogin04/result.json` SHA-256 before and after archiving: `8c9cae1a08f0c3054a8cab160b3176eebba2d6ff0c8fe2bf72a3eebc818e474a`. The source result bytes were re-read unchanged; no source-run file was written or removed.

Sanitization replaces only the local binary path and original synthetic store directory paths, consistent with live02/live03. Fixed diagnostics, synthetic note IDs/body digests and historical subject SHA-256 remain. No grant/binding/DB/WAL/SHM, raw App output, body/attachment bytes, browser AX, credential, module source or binary is included. Archive preparation performed no App/ADB/network/build/test invocation. `SHA256SUMS` covers the three other files. Prior archives remain unchanged.
