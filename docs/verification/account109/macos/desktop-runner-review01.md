# Account109 desktop runner independent review 01

Reviewed commit `649129373624b12caf2f5c18a0b0cf7fe39584e4` in `/private/tmp/cybernote-account109-test-audit` on 2026-11-13. The three changed files are `account109-desktop.mjs`, `account109-desktop-helpers.mjs`, and `account109-desktop-helpers.test.mjs` under `scripts/verification/`. The reviewer did not author this runner change. Diagnostic allowlists were compared against the separate native diagnostics implementation at commit `c6a8a1eec7529be82187e00739b064b20a99d80a`.

**Verdict: changes required before the proposed native run. One blocking issue.** Passing helper tests do not establish live account synchronization or resolve the earlier authentication failure. No native app, ADB, browser, deployment, or build was run during this review. Driver tests used owned Node protocol fixtures only.

**[P1] Permit recoverable network statuses within the existing bounded polling deadlines.** At [account109-desktop-helpers.mjs:20](/private/tmp/cybernote-account109-test-audit/scripts/verification/account109-desktop-helpers.mjs:20), `requireHealthy()` throws for every `status.error`, including `account_network`. [account109-desktop.mjs:51](/private/tmp/cybernote-account109-test-audit/scripts/verification/account109-desktop.mjs:51) applies that check to normal account reads and action results, including every discovery and convergence poll. The runtime deliberately publishes recoverable cycle errors, backs off up to 30 seconds, and clears the error on a successful later cycle (`src-tauri/src/account/transport.rs:429–450`, with status publication in `account/mod.rs`). The runner therefore aborts a recoverable run on the first network-error sample, before its 60/120-second polling budget can help. The helper test at line 28 explicitly asserts this premature failure.

An independent in-memory reproduction supplied `account_network` followed by `ready` to the existing `until()` helper: it returned `ACCOUNT_STATUS_FAILED` after exactly one poll; the ready sample was never observed. No app was involved.

The runner developer should treat only the explicitly recoverable network category as pending inside bounded waits, retain its sanitized status transitions, and require the phase's healthy success condition before completing. Authentication and permanent configuration, ownership, proof, storage, and protocol failures must continue to fail promptly. Also update [enable():100](/private/tmp/cybernote-account109-test-audit/scripts/verification/account109-desktop.mjs:100): its predicate currently accepts `enabled && state !== 'authorizing'` even with an error, then immediately asserts `!status.error`. Merely exempting `account_network` in `requireHealthy()` leaves that false negative in place. Add coverage for network → ready success, persistent network → bounded timeout, authentication → immediate failure, and enable remaining pending during a transient error. This finding does not establish the cause of the previous real-run failure or justify retrying terminal authentication failures.

The remaining requested checks passed source review:

| Area | Evidence and scope |
| --- | --- |
| Native account path | Helper lines 35–42 construct only status/signIn/signOut/syncNow/setEnabled production `account_command` payloads. Extra token, grant, URL, and other command arguments are rejected. The runner supplies no credentials, callbacks, invitations, or workspace IDs. Resume uses existing owned stores without reading grants. Native mode explicitly disclaims account UI confirmation coverage. |
| Diagnostic projection | Ordered allowlists exactly match the diagnostics DTO: 15 stages, 14 identity reasons, and 15 provider reasons. Unknown labels become `unknown`; messages, tokens, subject/device identifiers, and upstream strings are omitted from status snapshots. This helper is a safe reporting projection, not a substitute for the frontend DTO validator and its provider-reason context checks. |
| Conflict keep-all | Runner lines 131–163 replicate a shared base, pause both account runtimes before editing, observe both heads on both devices, and click the production keep-all action and confirmation. Full documents and plainText are compared with only attachment IDs normalized to uniquely owned metadata. Both branches must remain live on both devices with zero conflicts. Each retained branch's PNG/bin is checked through production authorized attachment reads and stored-file hashes against the original fixture bytes. Runtime pausing is explicitly distinguished from OS network loss. |
| Logout exclusion | Lines 165–180 sample signed-out/no-connected-stream status, retained complete local bodies, and absence of post-logout remote IDs for at least 3 seconds before and after restart. The remote source must remain signed in, enabled, and ready and receives syncNow. Delayed arrival and a single slow read have negative tests. Report limitations correctly restrict the claim to these sampled windows. Required fixture attachment bytes are rechecked after restart. |
| Required scenarios and cleanup | Concurrent-offline and logout begin as not-run and reach pass only after their assertions. Earlier failures remain failures. Overall pass is assigned only after both scenarios pass and every owned process closes naturally; rejected cleanup or forced/nonnatural exits force failure. |

Verification completed from the audited worktree:

```sh
node --test scripts/verification/sync108-native-driver.test.mjs scripts/verification/account109-desktop-helpers.test.mjs
node --check scripts/verification/account109-desktop.mjs
node --check scripts/verification/account109-desktop-helpers.mjs
node --check scripts/verification/account109-desktop-helpers.test.mjs
```

All **26 tests passed** (14 account helper tests and 12 driver tests); all three syntax checks passed. Only this review document was written. No product edits or commit were made. Approval for the actual run remains with the parent after the blocking runner fix is reviewed.
