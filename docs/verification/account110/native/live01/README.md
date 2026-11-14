# Account110 first live failure — immutable small receipts

Exact candidate cb91f4b82995a314268aa47b491b7973679dff8f, 2026-11-14.
These are exact byte copies of the first failed run result and the separately
sanitized native crash diagnosis. SHA256SUMS pins both. See ../device-actions-live01.md
for the bounded actual run, native failure, cleanup and interpretation limits.

Privacy review: finite phases/codes/booleans, public source/package/deployment hashes,
synthetic specimen labels/content hashes, aggregate counts and safe lifecycle records.
No profile/subject, note IDs/text/titles, attachment contents, credentials/grant/keys,
argv, full URL, raw crash state/addresses or original-library data are included.
The raw system crash report remains outside Git; only its digest and finite evidence
are retained. Original owned test libraries and first tmp receipts were not modified.

result.json is historical: CHECK_FAILED and exitCode=null are preserved exactly.
Do not backfill APP_EXITED, a signal or fields not observed by that runner. SIGABRT /
stack-overflow evidence comes separately from safe-diagnosis.json's matched system
report. The subsequent runner diagnostics patch is future coverage, not a revision
of this first run. Both real hosted logins passed; directory and all later actions
remain unaccepted. Independent review is still required.
