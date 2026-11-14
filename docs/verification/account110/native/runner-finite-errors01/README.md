# Account110 runner finite account-error receipts

Author source chain: ffff8f6dd2e79903569998fc878d3b78d84a2890 then
67587914dcbf4fa6990d25db014aa787749b0323. Only the existing device-actions runner
and its synthetic fixtures changed. Contract: 47572b955d75ac7e7bffd1f46d2588eb454de1b0.
Independent review is pending; no real acceptance or diagnosis retry is claimed.

Previously parseStatus threw ACCOUNT_FAILURE before retaining the native error.
It now attaches a whitelist projection, persisted as failure.accountError:
code, optional stage/requestReason/httpStatus, optional paired syncStage/syncReason.
Messages and all other nonreported values are not copied. Unknown codes/stages,
request combinations and sync pairs reject as INVALID_DTO without raw diagnostics.
The final receipt revalidates attached projections before writing them.

The four sync stages and 15 snake_case SyncError reasons match Huygens' native
contract. A sync pair is permitted only for account_sync_failed, with both fields
present and valid; null, partial, unknown and cross-code combinations reject.
Generic account_sync_failed without a pair stays supported. HTTP diagnostics keep
the existing coordinatorProfile/Enrollment/Jwks scope, non-2xx 100..599 range and
401/403 authentication-code relationship; other request reasons cannot carry HTTP.

An account/directory error remains an immediate failure. A concurrent operation
is recorded separately as failure.deviceOperation with only direction, phase,
startedAt and optional finishedAt. Its device ID is validated but never emitted.
In particular a directory error observed with running does not manufacture failed,
wait for success or mark the overall run PASS. No retry, timeout, command, owner,
cleanup or transport behavior changes. Historical live01/live02 receipts remain
untouched; these new fields only describe future observations.

Final author verification: Node-only synthetic fixtures 29/29 PASS. Coverage includes
all 60 sync-stage/reason combinations, legacy generic errors, malformed pairs,
HTTP/code boundaries and invalid combinations, unknown/raw-value suppression,
status polling and command-terminal error paths, one-command/no-replay behavior,
directory failure while an operation remains running, independent operation snapshots,
and actual main/finally persistence with safe native cleanup using a fake App.
No NativeApp was instantiated; no product module, socket, real library, credential,
Cargo target, app, GUI or device was used. No source pins were changed.

The first new author pass was 28/29: its new terminal-error fixture returned a
failed operation from its status mock before the intended command-terminal sample.
The fixture now holds the mocked status at running to exercise the terminal path.
Its first TAP remains retained; no production condition was bypassed. Subsequent
29/29 passes and exact file/TAP digests are in result.json. Private TAP files are
/private/tmp/account110-runner-finite-errors-author01.tap through author03.tap.
