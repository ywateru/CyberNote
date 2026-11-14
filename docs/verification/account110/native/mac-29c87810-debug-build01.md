# Account110 macOS debug build: 29c87810

Built and statically verified from clean main `29c878108b2ea421b5e4fccd71547206071fdbfa`. No source edits, module-suite reruns, App launch, runner execution, original store access, network or ADB operation occurred. This report records the at-verification boundary; later authorized runtime receipts will be separate. Main and artifact are held static for independent package review and subsequent owned-push/fresh-run acceptance; this docs-only report stays on the author's branch until both runtimes end.

App: `artifacts/account110/mac-29c87810-debug-01/CyberNote-Account110-29c87810.app`. Bundle identity: `com.local.notesclone.account110.debug29c87810`. The compiled Tauri default data selection remains unchanged; any subsequent diagnostic must use its explicit owned data-dir.

| Identity | SHA256 |
|---|---|
| Original arm64 Mach-O, 207,260,848 bytes | `ec6d2b3385947dea4903b8aa33d61b5f7fe709a07c340c3222bbb9d4a5db6342` |
| Signed executable | `96192c49b6abcc9b689dad895203455c7ceefa713d2e17e15c7379ca85c7ef42` |
| packaging-receipt.json | `8f1dc6d52f00732b9e76018ef76433404e23314573e5f59efb55b7c1832c13b0` |
| completion-receipt.json | `2fc3b9211adca042a054b44368777c8260b2b952c2b4aa28517404de39ff9728` |
| SHA256SUMS | `88bc4c3306c1acfdb5e600c50ee077186a2e181555a164aa6d118d0e21eb0f03` |

Manifest dry-run reported no changes; export of the exact commit and pnpm typecheck passed. `pnpm build`, 24 compiled debug-capability checks, native build and embedded package identity all passed. The native command used `cargo build --manifest-path src-tauri/Cargo.toml --features sync-e2e,tauri/custom-protocol --locked --offline`; only the existing `/private/tmp/cybernote-account109-mac-ec4348c6-target-01` was used, with jobs 2, dev/test debug 0, incremental 0 and Cargo offline. Frontend debug and development flags match the prior reviewed build method.

Controllers, packaging and asset verification derive from the sealed mac-9e8a4011 scripts; `controller-provenance.json` pins their original/derived hashes. Changes are exact source revision, source-derived artifact/bundle names and prior-controller provenance. No gate was removed. Native build completed in 86.238 seconds; there was no compile or packaging failure.

The app contains a COW clone with a distinct inode. Ad-hoc signing, deep/strict signature verification, signed executable identity, source plist/icon/entitlements and linked-library capture passed. The original executable's bytes, inode, mode and mtime remained unchanged. All eight required JS/CSS/JSON/SVG resources among nine dist files were located in readable Mach-O load segments; debug runtime import, fixed startup diagnostic and execute double-rAF barrier checks passed. HTML is hashed and asset references checked, without asserting byte equality for transformed embedded HTML.

Source tree `a02687c56973d3ea7ff001304ef848481ede68e7`, source fingerprint `6c6d07a520305917f668f63ae5ac91c307da049103edc8bce003865af95fe491`, 1,670 source-identity inputs. HEAD/clean/fingerprint and all four lockfiles matched before/after checks and build. Publish export inventory and source-identity input counts are different scopes. All 34 archived entries were read back and matched SHA256SUMS after finalization.

The controller monitored the 6 GiB floor every second. Native-build initial free space was 8,616,374,272 bytes; minimum observed was 7,780,151,296 bytes. Final static verification recorded 8,157,159,424 bytes free. No disk stop or forced build termination occurred. All compiler processes had exited; unique target lease was explicitly released at completion. The immutable artifact directory contains complete commands, logs, checksums and receipts for Cicero's independent actual-file review. No package/runtime PASS is claimed beyond static verification.
