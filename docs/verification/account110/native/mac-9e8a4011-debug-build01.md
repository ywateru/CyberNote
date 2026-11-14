# Account110 exact-main 9e8a4011 Mac debug build 01

Verified 2026-11-14T21:49:43.783699+08:00 (Asia/Shanghai). Build, package and static checks PASS; no App or collector launch. Exact frozen clean source `9e8a4011faab0e363447a3765eb937c7d5e297e7`. This report is committed only in the author worktree; main/artifact remain static.

App: `artifacts/account110/mac-9e8a4011-debug-01/CyberNote-Account110-9e8a4011.app` in main. Bundle `com.local.notesclone.account110.debug9e8a4011`. Distinct packaging identity does not change compiled default data selection; later runtime requires explicit owned data-dir.

| Identity | SHA256 |
| --- | --- |
| Original arm64 executable | `81d78e4c1a85acc9bda35ae5970d8c9e41b4697bd2ea377accdf6df9617a4024` |
| Signed executable | `86246535b5f7d8942f79cd3c5fac156d9a7993f067ecef1372ca8a697c4f8982` |
| completion-receipt.json | `aebc7d5c05d198e52163f15f1e8c106d7274906d816119aa78e49fc2ff2c3ef4` |
| packaging-receipt.json | `58527fa391ea32e25b3e39c4162150bc28ab119fec2dea71043bac7386f29d59` |
| build-record.json | `182d858622c1b7be533203c2f2928201afe1c05cf013872b3efdf882266c3f01` |
| resource-identity.json | `e5e511288d4313a2ed46bb2b6625473ca486ef4c6b9317901dab6377c5b9c200` |
| integration-checks.json | `38ec048e96bfb81c40a49b18ff45e9987881bedd230e697360fddcf5f68908e5` |
| SHA256SUMS | `f1f3db0712e76201ccf7500db839d3349c60b4a6bcd4cded176cb81f213d1ce3` |

All 34 manifest entries were reread and matched, including signed App contents. Executable SHA is not a directory digest. Source tree `d5dd22ddc777738c2c387c8ff759cf396c63f21f`, fingerprint `a87ad7866b6aae7ec749ca93838526549421e385841227ca2e126dfabbd767c7`, 1669 inputs. Exact HEAD/clean/fingerprint and four lockfiles matched before/after.

## Necessary checks and actual build

Manifest dry-run: no changes. Exact-commit export and typecheck PASS. No frontend/runner/native suites repeated.
- manifest-current: exit 0, 18.053 seconds.
- export-current: exit 0, 18.056 seconds.
- typecheck: exit 0, 8.031 seconds.
- frontend-build: exit 0, 11.032 seconds.
- compiled-capability: exit 0, 1.007 seconds.
- native-build: exit 0, 85.231 seconds.
- embedded-identity: exit 0, 1.008 seconds.

Reused reviewed 39711ae8 ignored controller/package/resource/finalization templates; adapted exact source/output/app/bundle identity and prior-controller hash only, with provenance pinned in preflight.json. Sole target `/private/tmp/cybernote-account109-mac-ec4348c6-target-01`; locked/offline, jobs2, DEV/TEST debug0, incremental0; features `sync-e2e,tauri/custom-protocol`, same frontend debug flags. No new target, dependency download, HOME override, source/pin/lock correction, failed step or identity-assertion bypass.
Six-GiB floor (6442450944 bytes) monitored each second. Initial 8253181952, minimum 7384150016, completion free 7793512448 bytes; no floor trigger.

Compiled capability24 PASS. Eight required JS/CSS/JSON/SVG assets from nine dist files match loaded Mach-O segments. HTML references, debug import, startup diagnostic and execute double-rAF preserved. Original and signed embedded identity PASS. COW clone separate inode; original bytes/inode/mode/mtime unchanged after signing. Exact plist/icon/entitlements, plist lint, original signature, ad-hoc deep/strict bundle signature and linked-library checks PASS. No distribution/notarization claim. Existing warnings remain in ignored build logs.

## Handoff

Target released after static asset verification; zero compiler processes. Artifact immutable for Cicero actual-file review. No App, collector, SDK probe, account/network, owned/default store, grant/Noise, GUI or ADB operations. Older packages, first failures and owned libraries retained.

After actual-file package approval: use reviewed collector, explicit diagnostic env, normal restore of existing owned live02 A/B and one push to fresh output. Capture actual typed map error and finite SDK events without raw stderr. Static tunnel-startup-window hypothesis remains unproved: compare actual variant and fallback/websocket-dial/upgraded observations, do not infer from elapsed time, change SDK or retry automatically. Route witness not implemented, match remains unknown. Package build is not runtime/transfer acceptance.
