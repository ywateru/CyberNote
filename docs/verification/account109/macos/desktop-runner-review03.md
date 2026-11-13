# Account109 desktop runner independent review 03

**Verdict: APPROVED for merge as a verification-only fix. No blocking finding in the requested committed delta. This is runner review approval; full02 has not been executed or authorized by this review.**

Reviewed on 2026-11-13, strictly comparing base
`ca6fb3823e624d876630a5709964bba75e81f24b` with commit
`de3a24aa0b5c6346a77657c078684c6d7d6d3bbf` in
`/private/tmp/cybernote-account109-test-audit`. The delta contains exactly three
files: desktop runner, desktop helpers, and helper tests (29 additions, five
deletions). Uncommitted Android and three-peer work was excluded. All executable
review inputs were extracted with `git show COMMIT:path` into an isolated temporary
directory; tests did not import the audit worktree's mutable files.

## Connection and data gates

At committed `account109-desktop-helpers.mjs:39`, `accountConnected` requires
`state === 'ready'`, enabled synchronization, no error, and at least one connected
device whose `current` flag is false. At lines 40–42,
`waitForConnectedData` first waits for **every supplied desktop** to satisfy that
predicate within 120,000 ms, then starts a separate 60,000 ms data wait. Data
predicates cannot run before the readiness stage succeeds. One ready desktop or
two desktops becoming ready in different polls cannot satisfy the initial gate.

Readiness is an entry gate for the data phase. During data polling, the unchanged
health checks continue to run; the helper does not assert continuous connectivity
on every data sample. This matches the requested readiness-before-data behavior
and does not weaken any prior data assertion.

The runner's `waitConnectedData` wrapper supplies both desktop statuses. Call-site
coverage was checked against the committed runner:

- `converge()` at line 91 uses `[source, target]`, so both original directions,
  pause/resume catch-up (line 132), offline process restart catch-up (line 133),
  and the concurrent shared base (line 136) receive the new connection stage.
- Concurrent-head visibility at line 147 now waits on `[a, b]` before evaluating
  each desktop's conflict rows. The previous conflict-count assertion remains.
- Keep-all preservation at line 158 waits on `[a, b]` before checking each
  desktop's zero-conflict count and both complete branch copies.

Complete rich document/plain-text comparison, owned attachment references,
production attachment reads, stored-file byte hashes, both branch comparisons,
and explicit keep-all action/confirmation are unchanged. Initial discovery,
login/restore/enable/pause, sign-out, logout observation, and cleanup budgets and
assertions are unchanged. No product source or native driver changed.

## Health, cancellation, and deadline behavior

Both stages call the existing `waitForAccountStatuses()`. It classifies every
desktop before evaluating success. Recoverable `account_network` samples stay
pending and cannot turn matching data into success. Authentication, cancellation
(`account_cancelled`), configuration, ownership, storage, protocol, unknown, and
other terminal errors still reject promptly. One device's pending network status
cannot conceal another device's terminal error. Strict status reads retain their
existing behavior. The new wrapper neither replays account commands nor catches
and restarts a rejected stage.

This is a scoped addition of a connection stage, not a blanket enlargement of the
60-second data timeout. A call has up to 120 seconds of connection polling and
then its own 60 seconds of data polling. The existing `until()` checks the deadline
between awaited polls; this is not a hard wall-clock cap interrupting an in-flight
callback. Native operations retain the unchanged per-request bounds and fail-closed
driver behavior. No AbortSignal cancellation contract was added or removed.
The unchanged runner finally block still closes owned processes and withholds
overall pass unless all required scenarios pass and cleanup is natural.

## Independent verification

Node `v22.16.0` ran the committed helper and driver suites plus seven temporary
independent review probes: **40/40 passed**, zero failures, cancellations or skips
(3,546.324667 ms). This comprises 21 committed helper tests, 12 unchanged driver
protocol tests, and seven independent probes. Driver children were Node protocol
fixtures, not desktop applications.

The three new committed fake-clock cases exercise the real polling helper:
connection ready at 80 seconds followed by data at 130 seconds succeeds; missing
connection times out at 120 seconds without any data predicate call; and missing
data times out at 140 seconds when connection took 80 seconds. Independent probes
verify simultaneous readiness of both desktops, rejection of disabled/current-only/
missing-peer/error readiness, network-error suppression of a matching data
predicate, and immediate authentication/cancellation rejection in both stages.
The committed desktop runner syntax check also passed.

The exact source snapshot, independent probes, source hashes and TAP log remain
at `/private/tmp/account109-review03-n7kb3hvr`. Test invocation:

```sh
node --test /private/tmp/account109-review03-n7kb3hvr/account109-desktop-helpers.test.mjs \
  /private/tmp/account109-review03-n7kb3hvr/sync108-native-driver.test.mjs \
  /private/tmp/account109-review03-n7kb3hvr/independent-review.test.mjs
```

| Reviewed committed artifact | SHA-256 |
| --- | --- |
| Desktop runner | `447ec26839c2a4d978e00942cab6d8ce9a98b6f182f410eb6a7b99d02f5d5d6e` |
| Desktop helpers | `67a2651b92d5311c6a0382a752b9e13aa408c599870ceea9ddb57fb3ff3bb943` |
| Helper tests | `b8cdff16b845e09ed884a05a0e4b43fa08c50a636743989c980edce9ff817caa` |
| Driver | `8501c7f55777ec9de2292433fa5ab122253d6302e844914ece44245a343524e2` |
| Independent probes | `7615dff5cfa1c9eaee8af9fb4859fb2fe5288664ad3ce1f5ba33c457f06bfbbf` |
| TAP output | `257d8789b740745d2921101369ca7de251c3f95745b2c2c7d29d8bec1a06ee74` |

## Acceptance evidence and handoff

Full01 remains a preserved `pause / CONDITION_TIMEOUT` failure. This source review
supports the budget explanation as plausible; it does not prove a false negative
or demonstrate recovery against the real service. That classification requires
the separately authorized same-store rerun after the parent merges the fix.

Only this review document was added to the main workspace. No desktop application,
browser, ADB, product build, merge or commit was performed. The original stores at
`/private/tmp/account109-desktop-real-90b8b28b-01/desktop-a` and `desktop-b` were not
opened, read, copied, reset, or otherwise operated on during this review. Their
locations and the preserved full01 result/cleanup evidence remain unchanged.
Wait for the parent's merge confirmation and explicit full02 execution request.
