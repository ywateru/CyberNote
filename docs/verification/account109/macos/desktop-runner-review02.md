# Account109 desktop runner independent re-review 02

**Verdict: approved for the parent's proposed full acceptance run. The review01 blocking finding is resolved in runner commit `ca6fb3823e624d876630a5709964bba75e81f24b`. No remaining blocker was found in the requested re-review scope.**

Reviewed the delta from `649129373624b12caf2f5c18a0b0cf7fe39584e4` in `/private/tmp/cybernote-account109-test-audit` on 2026-11-13. Scope was limited to review01's recoverable-network false negative, its regression tests, and the affected source success predicates. Review01 is preserved. This approval concerns runner readiness; full acceptance results remain to be collected by the parent.

At [account109-desktop-helpers.mjs:21](/private/tmp/cybernote-account109-test-audit/scripts/verification/account109-desktop-helpers.mjs:21), only `account_network` can return pending when a bounded wait explicitly opts in. Strict reads retain their previous behavior. Authentication, configuration, ownership, proof, storage, protocol, unknown, and other permanent failures still throw promptly. Status projection and transition recording remain active during recovery.

At [waitForAccountStatuses():28](/private/tmp/cybernote-account109-test-audit/scripts/verification/account109-desktop-helpers.mjs:28), the existing deadline is retained, the optional initiating command executes once, and every status is classified before success is evaluated. A network sample prevents the success callback from running, even if data already matches. Classification checks every status, so one pending network error cannot hide a second device's terminal failure. Persistent network errors reach the bounded timeout.

The source predicates and call sites were checked:

- [waitAccounts():53](/private/tmp/cybernote-account109-test-audit/scripts/verification/account109-desktop.mjs:53) consistently opts bounded reads into pending-network handling. Command-result handling uses the same option within the wait for login, enable, pause, sign-out, and the remote sync request. Commands are not replayed on each poll.
- [enable():100](/private/tmp/cybernote-account109-test-audit/scripts/verification/account109-desktop.mjs:100) now uses `accountEnabled`, which rejects enabled samples containing an error or authorizing/error state. A clean connecting status can acknowledge enable; automatic discovery separately requires both devices ready with a connected remote device.
- Restore, document convergence, conflict-head visibility, and keep-all completion now pass through the common health gate before evaluating their existing identity, document, conflict, and copy assertions. Keep-all uses the already classified status snapshot for its conflict-count predicate. Matching documents or an enabled flag cannot turn an error sample into success.
- Sign-out still requires the signed-out invariant. Remote-source preparation waits for ready, enabled, signed-in status. The subsequent sampled logout exclusion retains its strict source-readiness and signed-out checks; the fix does not weaken that negative observation.

Focused verification completed successfully:

```sh
node --test scripts/verification/account109-desktop-helpers.test.mjs
node --check scripts/verification/account109-desktop.mjs
node --check scripts/verification/account109-desktop-helpers.mjs
node --check scripts/verification/account109-desktop-helpers.test.mjs
```

All **18 account helper tests passed**, including the four new regressions for network recovery, persistent-network timeout despite matching data, immediate permanent/authentication failure, and enable remaining pending through transient results. All three syntax checks passed. The unchanged driver suite was not rerun in this focused pass; its 12 tests passed in review01.

Only this new review document was written. No product mutations, commit, native app, browser, ADB, deployment, or build actions were performed.
