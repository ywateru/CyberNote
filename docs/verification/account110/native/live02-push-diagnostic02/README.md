# Account110 owned live02 single-push diagnostic 02

2026-11-14. Parent authorized this independent diagnostic after Cicero package
approval 59513c90. Exact source d0ad2267289cbe3f527fd7ee30299a62812d6ac9;
package mac-d0ad2267-debug-01. Signed executable identity is pinned in result.json.
No source edits, builds, new login or credential/Noise copying occurred in this run.

Only the existing owned live02 desktop-a and desktop-b libraries were normally
restored through the real NativeApp driver with explicit data directories. Both
became ready/enabled with profiles and online/syncAvailable directory rows. Subject
equality was checked in RAM only. No synthetic content was added. One A-to-B push
was submitted; no replay or other direction occurred. The temporary helper uses
the reviewed safeAccountError projection and records account errors separately
from operation states; an account error is latched, so later recovery cannot make
this diagnostic pass. It waits boundedly for the native command terminal even if
an account error appears. This helper is not the full acceptance runner.

## Actual failure

Command done=true, rejected=false. Actual native operation terminal failed after
24246 ms. Error exactly code=account_network, stage=coordinator. Native provided
no syncStage, syncReason, requestReason or httpStatus. None were inferred or added.
No earlier account error was sampled. B's last status remained ready/enabled,
error absent, pendingCount=0/conflictCount=0; directory rows online/syncAvailable.
Both clients then naturally exited zero, with pipe close confirmed and no forced
signals. No crash or cleanup failure occurred. Original live02 result bytes/SHA
were verified unchanged before and after. All owned libraries remain retained;
this run is not evidence that their business/files were compared unchanged.

This is a different observed error from the earlier independent diagnostic's
account_sync_failed. It does not supply missing details for that earlier failure.
The 24.246-second elapsed duration alone is not proof of timeout. No transfer,
reverse-exclusion, application, attachment or full acceptance PASS is claimed.

Read-only source tracing: transfer_target has two client.map calls (enrollment and
sync); request_io maps SDK errors using Error::from, whose fallback is coordinator.
These precede the typed pair/recover/transfer diagnostic boundaries. Bootstrap IO
and JWKS use different error mappings. The actual error narrows investigation to
these SDK map paths, subject to native author's independent confirmation; it does
not identify which map or an underlying SDK error reason. Huygens received the
exact safe result immediately. No product change, timeout increase or further
network probe/retry has been performed.

## Evidence and privacy

result.json is the exact first result from this diagnostic, not overwritten with
subsequent evidence. safe-summary.json pins its digest and the private temporary
harness digest. SHA256SUMS covers this archive. Private original output:
/private/tmp/account110-device-actions-d0ad2267-live02-push-diagnostic01/result.json.
Temporary helper: /private/tmp/account110-d0ad2267-live02-push-diagnostic01.mjs.

Privacy review found only source/binary hashes, finite enums/booleans, timestamps,
aggregate counts and a/b labels. No IDs/profile/subject, note text/title, raw message,
authorization URL, credentials/grants/keys or attachment body are archived. No
extra tests or Cargo/target work was run for this docs-only archive. Main and
package artifacts remain frozen; independent result/root-cause review is pending.
