# Actual real-account two-desktop acceptance: full-native01

Result: **FAIL**, `pause / CONDITION_TIMEOUT`. This was the single authorized run,
from 2026-11-13T02:55:20.573Z through 02:57:40.601Z (140.028 seconds). The runner
exited with code 1. The exact, byte-identical report is [result.json](result.json).

## Invocation and identity

```sh
node scripts/verification/account109-desktop.mjs \
  --binary /Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/mac-39c1420d-finite-diagnostics/notes-clone \
  --output /private/tmp/account109-desktop-real-39c1420d-full01 \
  --resume-from /private/tmp/account109-desktop-real-90b8b28b-01 \
  --account-path native
```

Binary SHA-256: `b4cec5d9b78509ab07d5e0b3700032bad9b09ba178024e4e1863b7ab3fa310d2`.
The supplied identity receipt records source
`39c1420d23daaa9397036d24826219e1bd2b89ff`; the runner was executed from main
`7680e1d22cd19d2923da5c7cd95c9560d7c5f7d7`. Their repository diff contains only
verification scripts and documentation, with no product source changes.
The executable hash was independently checked before and after the run. Embedded
asset verification and building were not repeated. The existing
[identity receipt](identity-receipt.json) is copied verbatim for provenance.

| Tool | SHA-256 |
| --- | --- |
| Runner | `86dea0e706c34df3ebcc265ada9095a4461b1f5599065083bab9f49b35a1aa09` |
| Helpers | `559c3c7fe19b97ad7ee388c374825bc829172f09f3b75833a17b1d9e69cb657a` |
| Driver | `8501c7f55777ec9de2292433fa5ab122253d6302e844914ece44245a343524e2` |

Exact runner/helper/driver and both test sources are archived here. `SHA256SUMS`
records all archived file hashes. The report's tool hashes match the copied tools.
The two helper/driver suites were run once: **30/30 passed**, zero failures,
cancellations or skips. [helper-driver-checks.json](helper-driver-checks.json)
records the observed TAP summary; its raw transcript was not retained.

## Passed and failed coverage

Six runner checks passed: both native stores became interactive; existing sessions
restored for the same real account without new authorization; automatic discovery
connected the two desktops without manual pairing; A-to-B and B-to-A transfers
matched complete rich documents and plain text plus referenced original PNG/bin
attachment bytes; and B retained its account while paused and did not apply the
new remote note during the pause observation.

The timeout occurred during `converge(a,b,pending,'resume catch-up')`, after B was
re-enabled. The saved phase remains `pause` throughout this sequence. There is no
`resume catch-up` success observation. B transitioned from `paused`, disabled,
profile present, to `connecting`, enabled, profile present. At failure B still
reported `connecting`, no devices, pendingCount 1, conflictCount 0, with no account
error. A reported `ready`, enabled, profile present, pendingCount 0, conflictCount
0, with current and remote devices online but neither marked connected. Safe
statuses support a failure to re-establish peer synchronization within the
60-second catch-up bound; they do not identify an underlying provider/network
cause. No credential, grant, database or network probing was added to diagnose it.

Classification: **possible transport-readiness budget interaction, unproven**.
The earlier read-only discovery observation took approximately 78 seconds. This
runner's 60-second body convergence wait also includes reconnecting transport
after re-enabling B, so the timeout may reflect that combined budget. The parent
reported a proposed verification-only change to wait for transport readiness
within the existing 120-second budget before starting the 60-second body
convergence budget, also covering restart and conflict paths. This run did not
execute that change. It remains a recorded failure; calling it a false negative
requires a reviewed, same-store rerun. No product behavior change or root cause
has been established by this evidence.

Offline process restart, concurrent offline edits/keepAll, and logout exclusion
before/after restart were not reached. Both scenario fields remain `not-run`.
A was **not signed out**. Both profiles remained present in the failure samples.
This run is not an acceptance pass or evidence that those later scenarios work.

## Lifecycle, retained data and scope

The runner's finally block closed both owned desktops naturally: A PID 88209 and
B PID 88215, both exit/close code 0, null signals, naturalExit true, no forced
signals and no cleanup failure. A subsequent exact-name process check found no
active `notes-clone` processes. [post-run-status.json](post-run-status.json)
records that check. Native stdout/stderr bodies were discarded by the approved
driver; only byte counts are retained.

The original owned stores remain under the resume root. The approved acceptance
created its pending test note on A and changed B's pause/enable state. No stores
were copied, deleted, cleared or reset, and no recovery login or retry occurred.
The store locations remain exactly
`/private/tmp/account109-desktop-real-90b8b28b-01/desktop-a` and
`/private/tmp/account109-desktop-real-90b8b28b-01/desktop-b`. No desktop was reopened
and no store operation was performed after the failed runner's natural shutdown.
This preserves the same stores for a separately authorized rerun; it does not
claim that running the acceptance left their contents byte-identical.
The original full documents and raw attachments passed verification in both
directions before the timeout. The prior result file stayed byte-identical to
SHA-256 `4871688c43f69dae19a84fc6f119db865856676867626a4c02d929ff68b1fd95`;
existing verification reports were not edited.

This verification built nothing and edited no product, runner or existing manifest.
It used no ADB, browser operation, manual pairing or credential/grant reads or
copies. No browser URL, callback, token, profile identifier or arbitrary upstream
error text was logged. Mutations used the approved native production
`account_command` path via debug evaluation; account UI confirmations are outside
this run's coverage. Existing synthetic attachment File[] boundary and debug/e2e
build limitations remain. No commit was created.

A progress delivery to the parent chat was attempted, but the desktop messaging
tool rejects messages to native ancestor chats. Progress and immediate failure
stage were reported in this verification session; the final response is the
parent handoff.
