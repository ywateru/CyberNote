# Reviewed native instrumentation source preparation

2026-11-13. **Prepared draft; not final accepted. No new blocking preparation findings.** Exported exact committed main `3192943d8deef802629616e91e95190c37ab0b6b` into the fresh separate root:

`/private/tmp/account109-source-3192943d-prepared-20261113-01`

The old sealed `2b0bd7e2` root was not edited or reused. This source preparation does not approve publication, Actions, deployment or real-device acceptance. Parent reports phone connectivity blocking live three-device testing; the parent’s active smoke/runtime was not accessed.

## Exact manifest and source review

The three-line manifest diff updates only `src-tauri/src/lib.rs` and adds `src-tauri/src/sync_headless.rs`. Both exported files match the exact source bytes independently approved at native commit `be037f3cc542f53fba06d604f932743542e29bc4`:

| Path | SHA-256 |
| --- | --- |
| `src-tauri/src/lib.rs` | `7721259e60a410d03c2065805b265480eee2556555afdc28a4f6c0723e4d995e` |
| `src-tauri/src/sync_headless.rs` | `56361c27f32b74b44f13de4a3fa1fb6e543fca46ec6837c8796c5c53c49975b2` |

Reconstructed the pre-pin refresh against committed parent `3f64f2baf38615ba26041622d3cafab559ba7b70` using an explicit one-file extension: exactly two intended changes, lib hash plus headless addition. A separate manifest dry run at the final pinned commit reports zero changes. No refresh was written and no manifest was silently repinned. Export tool bytes used also match the pinned source commit.

Compared every exported path, mode, length and SHA against `/private/tmp/account109-source-2b0bd7e2-prepared-20261113-01`. Exactly three paths differ:

- `scripts/publish/manifest.json`
- `src-tauri/src/lib.rs`
- `src-tauri/src/sync_headless.rs` (the sole added file)

No paths were removed. All other source, public package/smart-fixture transforms, SDK provenance metadata, ownership and first-party rights declarations, notices/licenses, workflows and runtime-provider pins remain byte-identical. Private docs, Node verification drivers/runners and active smoke artifacts are excluded. See `export-diff.json` and the complete `source-payload-inventory.json`.

## Checks and immutable preparation boundary

The explicit `--ref`, `--target`, identical `--expected-target`, `--apply --init` export passed exact inventory/hash, privacy, ownership/license, runtime-provider and dependency closure checks: **1,771 files, 95,171,916 bytes**. Exporter CLI and guards were inspected before use; commands and outputs are retained outside the candidate.

- `verify.mjs --new-root`: passed. Exactly one parentless `main` commit, one ref, no remotes, alternates, shallow history, old reflog commits or unreachable historical objects. Root commit: `d29e4abd94591a9b197ad80beac8fe899148cb30`.
- `versions.mjs --check`: passed.
- Existing six publishing test suites: **19 passed, 0 failed, 0 skipped**, including policy/ownership/runtime exceptions, export isolation/privacy/symlinks, history and packaging identity/staging negatives. Only synthetic fixture packages/tools were used; no application build or dependency installation occurred.
- Clean source identity: fingerprint `525db23d515cf34793b1a3602d30d8db6326b6d8c0c87f9eb0edcab5cb7c3844`, **1620 inputs**, `sourceDirty=false`.

Automatic Git maintenance was disabled by process-only configuration before initialization, optional index writes were disabled, and Python bytecode writes were disabled. The new root’s full file seal including `.git` is identical immediately after export initialization and after all checks:

`3138f4505021f559da2cc15be9bdc4b69a4c1d19d96eb4fc69a42cc873fdd750`

Source-payload seal: `ecb50ce3fc0df8b86d499a418903a8d0b0e5a82b0b413063a15af71fe5d91440`. The old root’s independently measured full seal is identical before/after: `21e335b6d40f594e9674278a8942aedea987a109ebd2108a206c863552003de4`. This review’s exact seal definition is recorded in `receipt.json`; it uses canonical inventory JSON and differs from the earlier receipt’s seal encoding. No root mutation followed sealing. Receipt/logs/hashes are stored only in this main docs review directory.

No external repo, credentials, remote, network request, install, native/frontend build, App/device operation or active runtime access was performed. Source policy/provider-byte closure is not packaged native-provider or embedded-frontend acceptance; the prior Android package-provider validation limit remains unchanged. Native debug instrumentation remains guarded as reviewed; release/UI behavior was not exercised here. Actual tests must be accepted before any later publication or Actions decision.
