# Preserved full02 continuation: continuation01

Result: **FAIL**, `existing-conflict / TIMEOUT` on A's first `ready` operation,
with **CLEANUP_FAILED** and a recorded SIGTERM. This was the one authorized
continuation attempt, not a full acceptance rerun. It ran from
2026-11-13T03:41:24.845Z to 03:42:25.409Z (60.564 seconds), exiting with code 1.
No retry or replacement conflict was created.

The exact [result.json](result.json), fixed-label [steps.jsonl](steps.jsonl),
unchanged [prior full02 result](prior-full02-result.json), and exact tool sources
are archived here. Raw SQLite files, SQLite snapshots and full baseline payloads
are **not** included in this repository archive. Those private runner outputs
remain in the fresh temporary output directory.

## Approved invocation and provenance

```sh
node scripts/verification/account109-desktop-recovery.mjs \
  --binary /Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/mac-39c1420d-finite-diagnostics/notes-clone \
  --stores /private/tmp/account109-desktop-real-90b8b28b-01 \
  --output /private/tmp/account109-desktop-real-39c1420d-continuation01 \
  --prior-run /private/tmp/account109-desktop-real-39c1420d-full02
```

Execution followed the explicit approved-and-merged notice for recovery changes
`162ccb4e` and `9059a465`, integrated as `53bdf876` and `dedc6964`. Main HEAD at
launch was `dedc6964b5258bf6876b45e0918f2bf5657109d0`. The runner's bytes matched
the exact required hash before launch. The executable is the same previously
verified source-39c1420d binary; its complete hash was checked before and after
this attempt. No build or repeated embedded-asset verification was performed.

| Artifact | SHA-256 |
| --- | --- |
| Binary | `b4cec5d9b78509ab07d5e0b3700032bad9b09ba178024e4e1863b7ab3fa310d2` |
| Recovery runner | `c88f2b2f14a6fe04657f5a51dcce4e1076f8d12c4b2bb592c5cfcc799a508672` |
| Helpers | `67a2651b92d5311c6a0382a752b9e13aa408c599870ceea9ddb57fb3ff3bb943` |
| Driver | `8501c7f55777ec9de2292433fa5ab122253d6302e844914ece44245a343524e2` |
| Full02 prior result | `d8e092bff3e1b82781594f03bb53eca4ae575a802be88c17ea23f9bd6ca067f2` |
| Exact continuation result | `6e94e8693dfdcc0ae90e55292266b6449f2b0de647b8acf449c51ea6c1ce5502` |

The report's tool hashes match the copied tool bytes. `SHA256SUMS` records hashes
for all archive files other than itself. [preflight.json](preflight.json) records
the launch provenance, absence of desktop processes and protected evidence hashes.
The parent's independent review reported 44 passing tests; they were not rerun
during this real-store continuation.

## Baseline and exact failure boundary

The baseline check passed before app launch. The approved runner copied only its
fixed SQLite evidence files into temporary snapshot directories, queried those
copies read-only for the preserved conflict, and verified original SQLite file
hashes were unchanged during the copy/query process. Both stores agreed on exactly
two preserved synthetic branch heads, including complete payloads and the expected
PNG/bin descriptors and hashes. Only finite identifiers and hashes from that
validation are retained in the safe report; the full baseline payload file is
excluded from this archive.

Only A launched. B was never launched. The four recorded step events are:

| Sequence | Stage | Device | Operation | Event | Code |
| --- | --- | --- | --- | --- | --- |
| 1 | existing-conflict | a | ready | before | — |
| 1 | existing-conflict | a | ready | failed | TIMEOUT |
| 2 | existing-conflict | a | close | before | — |
| 2 | existing-conflict | a | close | failed | TIMEOUT |

A's `ready` failed after the configured 45-second readiness wait. Its lifecycle
records native failure phase `documentProbe`, with 1,313 document probes. The final
safe document sample has debug registration present and document `readyState`
`complete`, while `interactive` is false, startup is `loading`, root is hidden and
inert, and visibility is `hidden`. The driver's readiness diagnostic attempt was
unavailable. These samples locate the failure at startup readiness; they do not
establish a root cause or justify changing the timeout.

Exact safe lifecycle diagnostic retained in the result:

```json
{
  "failurePhase": "documentProbe",
  "nativeDiagnostic": {
    "documentProbes": 1313,
    "lastDocument": {
      "debug": true,
      "interactive": false,
      "readyState": "complete",
      "rootHidden": "true",
      "rootInert": true,
      "startup": "loading",
      "timeOrigin": 1794541286802,
      "visibility": "hidden"
    }
  },
  "readinessFailure": {
    "code": "DIAGNOSTIC_UNAVAILABLE"
  },
  "failureCode": "TIMEOUT"
}
```

No `account.status`, `sync.conflicts`, `sync.resolve`, attachment read, editor
command or account sign-out operation was reached. No conflict resolution or
logout acceptance claim is supported. The exact report leaves the conflict
scenario field `running` when the overall status becomes `fail`; that field has
not been rewritten. Logout remains `not-run`, and **A was not signed out**.
Full02's ten prior checks are preserved as prior evidence, not rerun or reclassified.

## Owned process cleanup

A was the sole owned child, PID **61769**. Its fatal readiness timeout remained a
driver failure. Closing did not reach natural exit within the 15-second close
budget, so the approved driver's existing cleanup path sent **SIGTERM** to that
exact child. Exit and pipe-close both record null exit code and signal `SIGTERM`;
`naturalExit` is false. The forced signal and `CLEANUP_FAILED` are preserved.

After the runner returned, an explicit PID check confirmed 61769 absent, and
`pgrep -x notes-clone` returned exit code 1: **zero active native desktops**.
[post-run-status.json](post-run-status.json) records this ownership check and the
cleanup outcome. No additional cleanup signal was necessary or sent.

## Retained stores and evidence

Original store locations remain
`/private/tmp/account109-desktop-real-90b8b28b-01/desktop-a` and `desktop-b`.
No recovery command was reached, and no store was reopened, queried, copied, reset
or otherwise operated on after the failed runner completed. The prelaunch baseline
preserves exact branch evidence. Launching A may run background native behavior;
this report does not assert that launching and terminating A left every original
store file byte-identical. No post-failure store query was added to infer that.

All 24 protected evidence files were verified unchanged after completion, including
the original resume result, full02 output result, review03, and every file in the
full01/full02 archives. The new archive result exactly matches the temporary
output result. No prior failure evidence was overwritten.

This attempt made no product, runner or existing manifest edit, build, ADB or
browser operation, manual pairing, recovery login, merge or commit. Native
stdout/stderr bodies were discarded by the approved driver. No browser URL,
callback, secret or arbitrary upstream error text was logged. The private SQLite
snapshots and raw baseline payload remain excluded from repository artifacts.

## Separate current access observation reported by parent

After this failure, the parent reported that a fresh read-only CUA `listApps`
attempt failed with the exact message:

> The Mac is locked and automatic unlock could not unlock it

This is a parent observation relayed by the parent, not independently
reproduced in this verification session. Its exact observation time was not
supplied. [parent-current-access-observation.json](parent-current-access-observation.json)
records the attribution, verbatim error and archive recording time separately
from the continuation's native diagnostics.

No causal relationship is established between this current access failure and
continuation01's startup readiness timeout or historical full02's
`NATIVE_TIMEOUT / evalNotObserved`. It does not reclassify either failure. No CUA
retry, unlock attempt, UI/network/ADB change, app restart or headless continuation
was performed by this verification task.
