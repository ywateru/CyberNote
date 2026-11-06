# Existing owned peer reopen/observation — independent review BLOCKED

Frozen author578e8af4 vs25c5e65c adds same-store reopen and read-only status observation. No real peer/device was operated in this review.

The new branches are unreachable: unchanged protocol.mjs action allowlist rejects both reopenDesktop and observeSync as INVALID_REQUEST. The retained exact-source host check imports protocol from the578e8af4 git object and requires these actions to parse. It naturally exits1 after printing both original rejected results. This failure must remain preserved when the exact actions are added and the same counterexample is rechecked.

Observation serialization also needs a finite safe error-code set or fixed redaction for unknown codes. /^sync_[a-z_]{1,80}$/ is only a format filter and would copy arbitrary code-shaped strings; lastSyncAt currently copies an unconstrained value. Validate the expected finite scalar type. This is a narrow tool serialization correction, not a product/business change.

Source inspection finds the reopen path aligned with preserving the bound Store: exact owned output/runId/serial/AVD state, prior natural0 matching binary/source lifecycle, canonical direct root/.sync/database identities, exclusive archive of prior lifecycle, and unchanged existing runtime path. It does not start host/invite, reset a database or forge renderer replies/ACKs. Final admission awaits the narrow reachability/serialization repair and its host counterexamples. Immediate author/root findings are recorded in /private/tmp/sync87-reopen-review-status.md.

## Repaird0096346 — independent narrow admission PASS

Frozen d0096346765cc5371d70b5f430d9253374dbd83f passes the SAME two original protocol samples; both exact actions are reachable and extra invitation arguments are refused. Original failed samples/output are untouched. The retained independent repaired check naturally exited0; timing and source SHA receipts are adjacent.

The actual reviewExistingStore helper accepts an inert canonical owned Store without changing its inode or contents, archives the original lifecycle, and refuses wrong5580 state and a symlink .sync directory. The retained host fixture never launches runtime/backend/ADB/device. Original author7host checks also passed when inspected; those are not substituted for the independent counterexample recheck.

The safe status module uses a finite known-code allowlist plus REDACTED_UNKNOWN, bounded hashed identities, <=64peers and strict connection booleans; timestamps are reduced to a finite-integer/nonnegative presence boolean. The original lowercase code-shaped secret sentinel and timestamp object are not exposed. Invalid connection type, oversized peer list and identity length are refused. The Rust Command::Status path was inspected: its command body is no-op, it preserves existing error and returns status after existing authority/window checks. No renderer reply/ACK, database fix or network protocol bypass was added.

Post-runtime reopen identity checks compare device/inode for root/database. Initial content hash is retained as provenance; we do not claim bytes are immutable after normal runtime startup/network activity. The reopen branch does not mkdir/reset a Store, start host, regenerate invitation or rebind. It reuses the original exact owned root and naturally closed lifecycle, with the reviewed immutable binary and the existing real App event path.

Immediate PASS was appended to /private/tmp/sync87-reopen-review-status.md and delivered to root/author before this evidence commit. It permits actual same-bound-Store reopen and finite read-only diagnosis only. Actual reverse convergence, media/reconnect/restart/coldboot/provider/export still require genuine runtime evidence. No production source or user device was touched by this review.
