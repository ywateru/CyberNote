# account110 typed account staging manifest independent review

2026-11-14 — **PASS; no blocking findings.** Exact manifest-only commit
`eef18b57474ff33552f55e5a669bd9be1c334927`, exact parent
`4c403c1dd8ca2aa813713158f0debcc8ebd6b7c1`.

Read-only checks in clean author tree
`/private/tmp/cybernote-account109-cancel-pin-9e7c46d2`. Only this report is written
in reviewer tree `/private/tmp/cybernote-account109-relay-observer-review-01`.

Only `scripts/publish/manifest.json` changes: one explicit inventory addition and
six existing SHA refreshes. All seven independently hashed candidate blobs equal
both the parent and final approved source
`28b00eb733891c3430052c5415236505ec8f6e52` byte-for-byte:

| Path | Independently verified SHA256 |
| --- | --- |
| `src-tauri/src/sync/adapter_account_transfer_tests.rs` (added inventory) | `aaa5521cd6221ef3473dead8fa32bbeb8a591912ea3c036ccc6b28413251f11a` |
| `src-tauri/src/store.rs` | `814c6fcdb644f2551ac8b678a23973ddf66cdf105365ff6bba97c7b2da6be5fb` |
| `src-tauri/src/store/synchronization.rs` | `eb9a2bb956f651c4504cd34b6341ee21729bce82048e658365390cd1bdda49b5` |
| `src-tauri/src/store/synchronization/blob.rs` | `c84b6029ecead56186ef9fa5d9bedf574912cf766bef89658d1a65ca911e7190` |
| `src-tauri/src/sync/adapter.rs` | `796da9e8d7bee971c28c05fc3dd57f8ce20555db56c06d3e874aa90c858025bd` |
| `src-tauri/src/sync/adapter_media_tests.rs` | `40583fd150bf481ce766a3c6b68d2ffa972573e2dc53f3f1610d637ad433c60e` |
| `src-tauri/src/sync/adapter_retry_tests.rs` | `ddcfc7b6efb69038e89c8ef3055017ec0ca2498890e085bf93b57aa5ea75d2db` |

Confirmed `adapter.rs` imports the new test via `#[cfg(test)]` and explicit
`#[path = "adapter_account_transfer_tests.rs"]`; inventory preserves that source
compilation closure. No deletion, extra addition or other hash refresh. All
non-files declarations are structurally identical: policy, ownership,
firstParty/thirdParty, upstream, licenses and runtime assets. Dependency locks
retain prior bytes/hashes; docs and verification collectors remain excluded.
Manifest SHA256:
`c100fe5aa17278c585142b58e5136a627686268d7c379cd76774c19150837b8f`.

Independent bounded verification on the exact candidate:

- `git diff --check 4c403c1d eef18b57`: PASS.
- `node scripts/publish/manifest.mjs --ref eef18b57474ff33552f55e5a669bd9be1c334927`:
  exit0, dry-run, `changes=[]`.
- `node scripts/publish/export.mjs --ref eef18b57474ff33552f55e5a669bd9be1c334927`:
  exit0, dry-run **1,796 files / 95,857,991 bytes**, full hash/privacy/license/
  runtime and implemented source-closure checks passed;
  `initializedNewHistory=false`. No apply or export root created.
- Author HEAD remained exacteef18b57 and clean after checks.
- Independently checked merged main
  `b44f0b0e5a655f7669b4736da7f3db4dc1b784ac`: clean; actual working files and
  committed manifest/seven native blobs equal the exact candidate. All seven
  native blobs also equal approved28b00eb7. No stale main input found.

Native typed staging/manual-account separation and real-adapter behavior remain
the separate Erdos approvals (`1f75793f`, `d1119c2d`); no implementation suite was
repeated. No Cargo, target lease, dependency installation, build, App, network,
device, login or private-store access. Main was not changed. Pins may merge and
parent may freeze the next package source; actual App repair/push acceptance
still requires the separately verified new package and controlled real run.
