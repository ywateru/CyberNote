# account110 transfer-future manifest independent review

2026-11-14 — **PASS; no blocking findings.** Exact pins commit
`568a47b4d09ff308141f79232581c259b0dbbd89`, parent
`7f6925191f161c482cab445411ced5d286bca24a`.

Read-only verification in clean author tree
`/private/tmp/cybernote-account109-cancel-pin-9e7c46d2`; only this report is written
in reviewer tree `/private/tmp/cybernote-account109-relay-observer-review-01`.

Only `scripts/publish/manifest.json` changes, refreshing two existing hashes:

| Path | Independently verified SHA256 |
| --- | --- |
| `src-tauri/src/account/transport.rs` | `08e33e38633ad01ef3b40992262fc8a72cef13d390ab25c6ccff022fade34aa3` |
| `src-tauri/src/account/worker.rs` | `464117c35ad2c4a44bb9921d0fb6b01e51df976e392ac81ff2724277f0940e88` |

Each hash matches the committed candidate blob, and the full bytes equal both
its exact parent and approved final source
`ddf7b79281a2c94f35a28f470855f5bb990268f9`. Native implementation/future-layout
approval remains the separate Erdos verdict (`8d9f77b7`); this review binds the
pins without repeating that implementation review.

No inventory additions/deletions. All non-files declarations are structurally
identical: policy, ownership, firstParty/thirdParty, upstream revisions, licenses
and runtime assets. Inventoried Cargo manifests and dependency locks retain
both their prior hashes and committed bytes. Verification fixtures/runners,
docs and artifact receipts remain outside the export inventory. Manifest SHA256:
`281c291213f89e70dece4b5b296bbcf3e5f415305341307b526da3284455c00b`.

Independent bounded checks on the exact candidate:

- `git diff --check 568a47b4^ 568a47b4`: **PASS**.
- `node scripts/publish/manifest.mjs --ref 568a47b4d09ff308141f79232581c259b0dbbd89`:
  dry-run **exit0, `changes=[]`**.
- `node scripts/publish/export.mjs --ref 568a47b4d09ff308141f79232581c259b0dbbd89`:
  dry-run **exit0, 1,794 files / 95,818,900 bytes**. Full committed
  hash/privacy/license/runtime validation and implemented source closure pass;
  `initializedNewHistory=false`, no export root created.
- Author HEAD remained exact and clean after checks.

No suites, Cargo/native tests, dependency resolution, builds, App, network,
devices, login, credentials or original stores were used. Main and author source
were not changed. Parent can merge pins and freeze the next build source; this
does not approve a not-yet-verified package or establish real App push success.
