# Hosted login surface export manifest verification

2026-11-13. Based on exact reviewed integrated source `45876d3e62655ff99b148779b606c72da7775117`. Policy commit `49414bbf422f9d826f8f11fd6eb58426c92f3e0c`; exact manifest commit `af926c52b878aad1c42a98d24e88afbd25da4ddc`. Independent review remains separate.

The explicit extension adds nine tracked files under `plugins/tauri-plugin-notes-auth` and `src-tauri/src/account/surface.rs`, each hashed from its committed blob. It declares only this new plugin as `project-authored`, `reserved`, using the existing project rights source. The validator previously accepted first-party crate roots only; it now additionally accepts this exact plugin root and requires its ownership declaration. It does not admit arbitrary sibling plugins or reclassify vendor code. The policy test checks omitted ownership, unrelated/parent/nested/vendor roots, wrong provenance/rights/source and duplicate ownership.

Thirteen existing pins refresh for reviewed UI/native/Cargo inputs and the policy/README/test changes. Existing third-party declarations, runtimeAssets and every vendor file pin are identical to the base. Cargo.lock comparison from pre-native main `263e80e7` to `45876d3e` confirms all 810 third-party package name/version/source/checksum identities unchanged; the only added local package is `tauri-plugin-notes-auth` 0.1.0. No SDK/provider/license data or runtime product source was edited here.

## Validation

- `node --test scripts/publish/policy.test.mjs scripts/publish/export.test.mjs`: 8/8 passed, zero skipped. Tests include export/history isolation, hash/credential/symlink rejection, runtime provider pins and first-party ownership boundaries.
- `node scripts/publish/manifest.mjs --ref HEAD`: exact manifest commit, `changes=[]`.
- `node scripts/publish/export.mjs --ref HEAD`: validation-only PASS, 1,782 payload files / 95,347,068 bytes. This runs committed-blob hash/policy/scanning checks, public transforms and existing Rust fixture/Cargo path/JS module/public-script closure checks. It does not constitute a compilation or comprehensive platform dependency proof.
- `git diff --check`: PASS.

`extension.json` contains the ten exact source hashes. `manifest-before.json` records additions/refreshes against the committed policy ref; `manifest-after.json` and `export-dry.json` identify the tested manifest commit. `receipt.json` records the unchanged-boundary checks; `dependency-check.json` records the finite Cargo comparison. SHA256SUMS covers this compact archive.

No real source export/DRAFT, checkout/dependency copy, frontend/native build, shared target use, App/device/ADB/network operation, credential/grant or original-store access occurred. Existing sealed DRAFTs and candidates remain unchanged. Small test fixture repositories were temporary and removed by the test harness. This evidence does not establish dual-surface live acceptance or release readiness.
