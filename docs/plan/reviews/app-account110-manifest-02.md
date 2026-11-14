# account110 heap-pin candidate manifest independent review

2026-11-14 — **PASS; no blocking findings.** Exact reviewed commit:
`cd12fd2218de5d81c1d900f5e90e407a6e31c4b4`, parent
`a9766db4243300505f09c1fe4ed1c1d8d8c093c0`.

Read-only verification in clean author tree
`/private/tmp/cybernote-account109-cancel-pin-9e7c46d2`; only this report is written
in `/private/tmp/cybernote-account109-relay-observer-review-01`.

The commit changes only `scripts/publish/manifest.json`, refreshing exactly two
hashes, with no added/deleted inventory paths:

| Path | Independently verified SHA256 |
| --- | --- |
| `src-tauri/src/account/enrollment.rs` | `c9135a8b3809b9eacd349698cdeb1655713e6c4caac548db8bfa58c879305e05` |
| `src-tauri/src/account/worker.rs` | `46a1e697311521aebaec92030af680b89c998e35d92e97ee0388919063c0726a` |

Both hashes match actual committed candidate blobs, its parent and main
`ce9b8d2c` source bytes. Also compared the full files to original approved author
commits: worker equals `8c3fc430c7289a4e5a96f45f676612861037fd2e` (integrated as
`e2d54eba`); enrollment equals `08e4b6c76a4fd9f8b4e74b9625fa94be562d2de3`
(integrated as `6ca3e4a2`). This review binds the pins, without repeating Erdos's
native implementation verdict.

All non-file declarations are structurally identical: policy, firstParty,
thirdParty, upstream revisions, retained licenses and runtimeAssets. No SDK
SOURCE/provider bytes or dependency locks are repinned. Runner verification,
private receipts, docs and artifacts remain outside the export inventory.
Manifest file SHA256:
`5dc5273b65269975acf1ff5c56a6560f300174a18403a54057ed403981b56623`.

Independent commands on the exact candidate:

- `node scripts/publish/manifest.mjs --ref cd12fd2218de5d81c1d900f5e90e407a6e31c4b4`:
  dry-run **`changes=[]`**.
- `node scripts/publish/export.mjs --ref cd12fd2218de5d81c1d900f5e90e407a6e31c4b4`:
  dry-run **1,794 files / 95,793,198 bytes**, full inventory/hash/privacy/license/
  runtime validation and implemented source closure passed; no root created.
- `git diff --check cd12fd22^ cd12fd22`: PASS. Author HEAD/clean state verified.

Policy/export implementation and tests are unchanged by this delta; the earlier
independent 8/8 policy/export result is retained, not rerun or represented as a
new execution. No frontend suites, Cargo/native/CLI runtime, build, App, device,
network, credentials or original-store access. Author implementation and main
were not modified. Final rebuilt Mac package requires its new frozen source SHA
and a separate actual-file review; this PASS does not validate stack behavior or
live restart/synchronization.
