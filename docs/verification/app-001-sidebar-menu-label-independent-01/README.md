# Independent source evidence: APP-001 sidebar menu label

Reviewed candidate: `8bfeb435d2fba006a66fbb6532729cfb393669a6`.

Decision and actual production/dependency sequencing are in `docs/plan/reviews/app-001-sidebar-menu-label-static-01.md` (**SOURCE-READY**, runtime pending).

`source-identities.json` freezes all three production files against the candidate and independently verifies author identity. It records the exact locked dependency source identities and selected excerpts used for the main-thread analysis. `plugin-test.*` and `host-check.*` are independent offline checks, run under the already reviewed owned-process-group monitor by `run-checks.py`. The shared host target was released after these checks. Do not rerun that script without exclusive target ownership.

`projection-fixture.rs` contains exact extracted production function text plus minimal independent test scaffolding. `projection-fixture.json` records its extraction hash, bounded compile/test argv and complete output. It supports only lock release, fresh current-binding read, and independent-window no-op. It is not a real NSMenu or bind/update test.

`manifest.json` covers this evidence and the report, excluding itself. Aggregate format is sorted `path TAB bytes TAB sha256 NEWLINE`, hashed with SHA-256. No product files are modified by this review.
