# Actual real-account two-desktop acceptance: full-native02

Result: **FAIL**, `concurrent-offline / NATIVE_TIMEOUT`, with a separate
`CLEANUP_FAILED` outcome. Ten runner checks passed. Full02 ran once from
2026-11-13T03:05:56.513Z to 03:12:52.887Z (416.374 seconds), exiting with code 1.
The exact report is [result.json](result.json); the safe runner progress transcript
is [runner-progress.log](runner-progress.log). No retry followed the failure.

## Invocation and exact identity

```sh
node scripts/verification/account109-desktop.mjs \
  --binary /Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/mac-39c1420d-finite-diagnostics/notes-clone \
  --output /private/tmp/account109-desktop-real-39c1420d-full02 \
  --resume-from /private/tmp/account109-desktop-real-90b8b28b-01 \
  --account-path native
```

Main HEAD at launch was `770ce7648db5839fc93e7695a4c22738fe797979`. The integrated
runner/helper bytes exactly match the independently approved `de3a24aa` inputs
recorded in [review03](../desktop-runner-review03.md). Connection readiness has its
own 120-second polling budget before the unchanged 60-second data budget. No
additional timeout or product changes were made for this run.

The executable was checked before and after the run. Its supplied
[identity receipt](identity-receipt.json) records source revision
`39c1420d23daaa9397036d24826219e1bd2b89ff`. No build or repeated embedded-asset
verification was performed.

| Artifact | SHA-256 |
| --- | --- |
| Binary | `b4cec5d9b78509ab07d5e0b3700032bad9b09ba178024e4e1863b7ab3fa310d2` |
| Runner | `447ec26839c2a4d978e00942cab6d8ce9a98b6f182f410eb6a7b99d02f5d5d6e` |
| Helpers | `67a2651b92d5311c6a0382a752b9e13aa408c599870ceea9ddb57fb3ff3bb943` |
| Driver | `8501c7f55777ec9de2292433fa5ab122253d6302e844914ece44245a343524e2` |
| Exact result | `d8e092bff3e1b82781594f03bb53eca4ae575a802be88c17ea23f9bd6ca067f2` |

Exact runner/helper/driver sources were captured before launch and are archived
here; each matches the report's tool hash. `SHA256SUMS` covers all archived files
other than itself. [preflight.json](preflight.json) retains provenance and protected
file hashes. The relevant tests were not repeated: review03 had already verified
these exact bytes with 40/40 helper, protocol and independent review checks.

## Passed coverage

The ten successful checks establish:

- Both isolated native stores became interactive and restored their existing
  same-account sessions without new authorization.
- Automatic discovery connected both desktops without manual pairing.
- Both original note transfer directions matched full rich documents/plain text,
  document attachment references, production attachment reads, and stored PNG/bin
  original byte hashes.
- Paused B retained its account and excluded the new remote note.
- Resume catch-up matched the full body and original attachment bytes.
- Catch-up after B's natural shutdown and restart matched the full body and
  original attachment bytes; account runtime restoration worked with account UI
  closed.
- The concurrent-edit shared baseline matched the full body and original bytes
  before both account runtimes were paused and independently edited.

Thus full02 cleared full01's timed-out resume phase on the same stores using the
separate connection/data budgets. This does not establish the precise timing or
root cause of full01, and it does not make full02 an acceptance pass.

## Failure evidence and limits

The runner failed in `concurrent-offline` with `NATIVE_TIMEOUT`. A's lifecycle
records last action `eval`, native failure phase `evalNotObserved`, and null native
diagnostic. Both final recorded account transitions before the failure were
`ready`, enabled, profile present, with a connected remote peer, pendingCount 0,
and conflictCount 1. No account-error transition was recorded anywhere in full02.

The failure-status observation was available only for B: still ready, enabled,
profile present, remote connected, pendingCount 0 and conflictCount 1. A's fatal
driver timeout prevented a later status observation. The evidence does not
identify the precise conflict UI/evaluation substep or an underlying cause.
No additional app, browser, credential, grant, database or network probe was used.

`concurrentOffline` is `fail`; its final keep-all preservation observation is
absent. Conflict-count evidence does not establish successful keep-all resolution
or preservation of both complete branches. `logout` is `not-run`; logout exclusion
and the subsequent A restart were not exercised. **A was not signed out.**

## Cleanup and process ownership

All three owned process instances closed, with exit/close code 0, null signals
and no forced signals. This is **not** a successful natural-cleanup result:

| Instance | PID | Last action | naturalExit | Driver failure |
| --- | --- | --- | --- | --- |
| A | 31206 | eval | false | NATIVE_TIMEOUT / evalNotObserved |
| B before offline restart | 31216 | shutdown | true | none |
| B after offline restart | 56955 | shutdown | true | none |

The approved driver's close path treats A's fatal timeout as a failure even
though the process subsequently exited with code 0 and no signal. The runner
therefore also reports `CLEANUP_FAILED`. That failure is preserved, not relabeled
as natural shutdown. An exact-name process check after completion found **zero
active `notes-clone` processes**. [post-run-status.json](post-run-status.json)
records the check and lifecycle summary.

## Store and evidence preservation

The original store locations remain:

```text
/private/tmp/account109-desktop-real-90b8b28b-01/desktop-a
/private/tmp/account109-desktop-real-90b8b28b-01/desktop-b
```

The acceptance itself created synthetic notes, paused/re-enabled synchronization,
restarted B, and made concurrent branch edits. No claim is made that store contents
are byte-identical to their pre-run contents. Stores were not copied, cleared,
reset, reopened or otherwise operated on after the failed runner closed.

Thirteen protected files were hashed before launch and verified unchanged after
completion: the original resume report, review03 and every file in full-native01.
The archived result is byte-identical to the fresh output result. Existing
reports were not overwritten. No product, runner or existing manifest was edited;
no build, ADB, browser operation, credential/grant read or copy, manual pairing,
merge or commit occurred. Native stdout/stderr bodies remained discarded by the
approved driver; only safe runner messages and finite report diagnostics were
retained. Browser URLs, callbacks and secrets were not logged.

This remains debug/e2e native-command coverage with the existing synthetic File[]
attachment boundary. Account UI confirmations, OS picker/physical keyboard and
Android behavior are outside its scope. Progress and both failure outcomes were
reported in this verification session for the parent handoff.
