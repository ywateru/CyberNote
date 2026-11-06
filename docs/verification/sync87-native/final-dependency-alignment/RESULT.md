# SYNC87 native final shared-runtime dependency alignment

2026-11-06. Final small source freeze `16ce577907b3aa2dcd04b834cb00b887cfd6d99a`, based on root's clean native candidate4b6354e7. Only DesktopPeer's exact three-file hash/sourceCommit mapping and its README changed. This records author candidate validation pending independent narrow dependency review. No mainline write/merge or device acceptance occurred.

## Exact dependency and product provenance

DesktopPeer reuses the existing shared runtime and transport with the final three files byte-identical to `b08c77289203691c30026ce673116721c5ca5a59`: runtime.mjs `f6d84cfc6b48a33b4d8c12c98e84e8635dd093b507ccdca87539b12c4b092618`, rust-backend.mjs `3df944b85e2e65e10a4a1eaaae5b23c6b107b73ecfd9ed071bd8de9b2f988d0f`, sync-rust-dom.mjs `b8fe79058842c73303b4019e172842cd6ab74803a09f83f365d5ad6cfed62ff7`. No hash check was relaxed and no second runtime was introduced. Root incorporated6d33147e/b08c7728 for owned browser-pipe cleanup and legitimate stale-observation polling; final product including SyncSettings update-connection UI is the package product.

Both `docs/verification/sync87/native-build/result.json` and `android-build/result.json` contain321 inputBefore/inputAfter rows. Each row's relative path, byte count and SHA256 were recomputed from this worktree before and after all validation and compared exactly. Both full manifests are equal to each other and to this worktree; no package input changed. Native build head8b855420 and Android build head5e552c56 differ as recorded, while their321 product/config inputs are identical. Full original and actual rows are retained in package-input-before.json and package-input-after.json. This is source/package-input identity validation, not independent package-signature/embedded-resource or Android runtime acceptance.

Root's corrected receipt peer-receipt.json authorizes the existing immutable11 candidate `/private/tmp/sync86-transport-build11/notes-current-attachment-transport`, binary SHA256 `333fcd44e19ebbd30ece11b7a595816249a9458a46fb03523855ae8c51215800`, backend source `cd334bc88513a89c490788d2e2e27c7967575f4a`, build11. DesktopPeer verifies the direct executable/hash before launching and after closing. No Rust build or old exact10 invocation occurred.

## Narrow validation

Source was frozen before execution. Exact commands/natural exits/complete subprocess wall times and per-file tool/shared-dependency before/after maps are in processes.json; the -e dependency check's exact script bytes are retained in dependency-check.mjs.txt. All source maps are unchanged.

- Dependency admission: **6 checks, natural exit0**, outer0.119264s. Correct sourceCommit/three-entry mapping/current bytes and complete copied mapping succeed; separate changed-byte corruption of each shared file rejects. No backend or browser is run by that check.
- DesktopPeer syntax and whitespace checks naturally exit0.
- Single actual DesktopPeer smoke: **10 checks, natural exit0**, complete outer **9.546326625s**. Real React/Tiptap App and reviewed Rust Session/SQLite Store mount, host starts through actual handler, invitation is generated through actual handler and stays only in memory, secret UI closes, text creates/updates through editor/save queue, actual FileChooser/FileReader path stores synthetic PNG, original read/export/separate managed-file hashes match, image decodes and actual stop handler runs. Page errors0; five backend events pass through the real shared sink. It is one peer, not a network convergence or two-App matrix.

Runtime resource records show context close, browser disconnection, owned browser PID29270 natural exit0/signalnull with stdioDestroyed=true, BrowserServer close code0/signalnull, and final cleanup terminal=true (180.557ms). Owned Rust PID29268 naturally exits0/signalnull, forcedOrFailed=false. Peer internal wall9.368245542s is preserved separately and never substituted for complete outer wall9.546326625s. Runtime cleanup covers browser pipes/server and Rust process before final node process exits.

The153-file frontend/tool source fingerprint before/after and inner/outer is exactly `6b143fb87d3cbf6b5ca8b44e912c2a21a0e857d817a8569ff05bea09178105f9`, source clean. The final three dependency hashes and reviewed binary are unchanged. result.json and desktop-peer-lifecycle.json retain exact observations. Temporary Store, synthetic PNG and exported bytes remain only under owned /private/tmp run folders, not this compact evidence copy. No invitation string or arbitrary IPC/error frame is recorded.

## Limits and handoff

Only the two-file source mapping/README alignment and necessary dependency/single-peer/syntax checks ran. Earlier82/43/33 suites and full dual-App matrix were not repeated or relabeled. Their historical evidence stays separate; original3352/exact10 smoke is not claimed as final combination acceptance. Original full-text assertion repair and its independent re-review are not superseded here.

Zero Android/ADB/native-CDP commands, emulator lifecycle operations, APK installs/launches, real microphone or user Store access. Original roughly13-second unsaved recording remains untouched. Exact Mac27/Android17 packages exist but root's independent package review and eventual original-device-independent native acceptance remain separate gates. This source is ready for another agent's narrow dependency mapping/resource closure review; root controls final integration and native execution.
