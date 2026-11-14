# Account110 live02 first failure and separate diagnostic

Exact candidate/source: 0a4a4cda80d926c470cfbc8d5cef3bb2937ca58a, 2026-11-14.
Package independently approved by Cicero 723db4d0 before the authorized live run.

`result.json` is an exact byte copy of the first live02 result. Its failure remains
push / ACCOUNT_FAILURE. It must not be backfilled with a later error or terminal.
`safe-diagnosis.json` states the evidence and limits of that first run.

Both real hosted logins, paused directory, distinct registry identities, rename,
and true summaries passed. Enable/discovery/syncNow produced no unsolicited data
in 11 samples over 5289 ms. The first A-to-B push was submitted once and running
was observed. The runner discarded the error DTO before recording it and no
terminal operation was captured. A concurrent directory error could also have
triggered that first stop; this cannot be decided retrospectively.

All four first-run native processes naturally exited zero with confirmed close,
no signal and no forced signals. The prior native stack crash was not reproduced
through this run's login/directory/enable/push path. This is not a transfer success
or proof that every possible worker path is stack safe. All 28 owned read-only
probe processes closed, with no probe failures. No later direction, reverse
exclusion, offline/restart or GUI acceptance is claimed.

## Separately authorized diagnostic

The parent then explicitly authorized reopening only these two owned live02
libraries with the same exact package and making one push, to capture finite
status/error/operation details. This diagnostic is not a repeated acceptance run
and does not replace the first failure. No fresh SignIn, content creation, grant
copying, default-library access, product edit or build was performed.

`separate-push-diagnostic01.json` is a finite summary of that independent attempt.
Both clients restored ready/enabled with profiles; verified subject equality was
checked in RAM only. Push was submitted once after the selected B row was online
and syncAvailable. The command promise completed, without invoke rejection, with
A's operation failed after 51115 ms and error `{code: account_sync_failed}`.
Stage, reason, requestReason and HTTP status were absent in native's DTO. B stayed
ready with no account error; directory rows remained online and syncAvailable.
No account error was sampled before A's failed terminal. Both diagnostic clients
then naturally exited zero, with close confirmed and no forced signal. The first
live02 result hash was checked unchanged before and after the diagnostic.

This narrows the independent attempt to the native operation failure path; it
cannot identify the underlying network error. Current native mapping at
src-tauri/src/account/types.rs (From<SyncError>) collapses all sync errors into
account_sync_failed. The transport preparation contains pairing/recovery, then
transfer_once; the DTO does not distinguish those stages. A 51.115-second duration
alone does not establish a timeout, server failure or protocol rejection. Native
author Huygens received the finite evidence and is investigating source paths.
No timeout increase, gate bypass, retry loop or product fix has been made.

Full finite diagnostic evidence and temporary diagnostic harness remain private:
/private/tmp/account110-device-actions-0a4a4cda-live02-diagnostic01/result.json
and /private/tmp/account110-live02-push-diagnostic01.mjs. Their digests are in the
summary. The harness was a narrowly authorized diagnostic, not independently
reviewed acceptance tooling. Owned A/B libraries are retained unchanged by cleanup.

Privacy review: archived receipts contain public source/package/deployment hashes,
finite enums/booleans, timestamps, synthetic labels/hashes and aggregate counts.
They contain no profile/subject, raw device/note IDs, note bodies/titles, attachment
contents, credentials/grant/keys, raw message/argv or full authorization URL.
No additional test suite was run for this documentation-only archive. Main and
package artifacts remain frozen and unchanged. Independent result review remains
required; push and all subsequent acceptance gates remain failed/unaccepted.
