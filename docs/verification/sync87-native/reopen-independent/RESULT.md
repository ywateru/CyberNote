# Existing owned peer reopen/observation — independent review BLOCKED

Frozen author578e8af4 vs25c5e65c adds same-store reopen and read-only status observation. No real peer/device was operated in this review.

The new branches are unreachable: unchanged protocol.mjs action allowlist rejects both reopenDesktop and observeSync as INVALID_REQUEST. The retained exact-source host check imports protocol from the578e8af4 git object and requires these actions to parse. It naturally exits1 after printing both original rejected results. This failure must remain preserved when the exact actions are added and the same counterexample is rechecked.

Observation serialization also needs a finite safe error-code set or fixed redaction for unknown codes. /^sync_[a-z_]{1,80}$/ is only a format filter and would copy arbitrary code-shaped strings; lastSyncAt currently copies an unconstrained value. Validate the expected finite scalar type. This is a narrow tool serialization correction, not a product/business change.

Source inspection finds the reopen path aligned with preserving the bound Store: exact owned output/runId/serial/AVD state, prior natural0 matching binary/source lifecycle, canonical direct root/.sync/database identities, exclusive archive of prior lifecycle, and unchanged existing runtime path. It does not start host/invite, reset a database or forge renderer replies/ACKs. Final admission awaits the narrow reachability/serialization repair and its host counterexamples. Immediate author/root findings are recorded in /private/tmp/sync87-reopen-review-status.md.
