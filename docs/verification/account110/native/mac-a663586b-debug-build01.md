# Account110 exact-main a663586b Mac debug build 01

2026-11-14 (Asia/Shanghai). Build, packaging and static verification PASS; App not
launched. Frozen clean source `a663586b47f136508d1cab50f7ca2a075b9fd67b`. This docs-only report is in
the existing author worktree; main/artifacts stayed static after package handoff.

App: `artifacts/account110/mac-a663586b-debug-01/CyberNote-Account110-a663586b.app`
in the main workspace. Bundle ID `com.local.notesclone.account110.debuga663586b`.
Distinct bundle identity does not change compiled default-library selection;
any later execution must use an explicit owned data directory.

| Identity | SHA256 |
| --- | --- |
| Original arm64 executable | `0dbd9055440341e8980167a090ebc929a1909f0574e0cbe5ec3a31ae96eaa99c` |
| Signed app executable | `a6c2d19e0ec1c33fe206235d16ad3452e31b8c57c281531f5c6da30d1ab7fc0f` |
| completion-receipt.json | `650f6a3e3787de27096d02a25f9420c69d245c91ff84eec2226ae5211e5b226c` |
| build-record.json | `63c423c640012f46a74c25a50b19191b109bc6da632bb1b40a09171a96aec99b` |
| packaging-receipt.json | `6ec16d35e9b2ac9de1d37033616595747c56d47de552422e8d25cc13d62c323d` |
| resource-identity.json | `dacad04b8e24dec02e5deb016f93a8c08e16326ed494558c4c17db92a9ff2c5f` |
| integration-checks.json | `bd931753b9bb289985399349b8f6cdab7a55c3bd8bab0e8f36da8e3f86ac398a` |
| SHA256SUMS | `47188877f193550eed6862204b5cf253991e0e4d50bc015d12a673529c7bcdc3` |

Executable hashes are not app-directory digests. All 37 checksum entries were
reread and matched, including signed app contents. Source tree
`e1bc98e207c21a37b1d325c90b2b2a56b47e2fb6`, fingerprint
`c4aecff725103ed0d456e22dfa605863693ad23bebd775f27ed3d354e28b1f01`, 1668 product inputs.
HEAD/clean/fingerprint and all four locks matched before/after checks and build.

## Necessary checks and build

Manifest dry-run: no changes. Exact-commit export validation and pnpm typecheck:
PASS. No frontend/runner/native test suites were repeated. Actual frontend build
exit0 in11.032s; compiled capability24 exit0 in1.005s; native build exit0 in84.215s;
embedded identity exit0 in1.004s. No failed step, source correction or skipped
identity assertion. Existing native/Vite warnings remain in the build logs.

Reused the d0ad ignored templates, adapted SHA/output/app/bundle identity and
prior-controller digest. Integration checks now perform manifest/export validation
and typecheck, avoiding unchanged test suites. Sole existing target
`/private/tmp/cybernote-account109-mac-ec4348c6-target-01`; features
`sync-e2e,tauri/custom-protocol`, locked/offline, jobs2, DEV/TEST debug0,
incremental0. Same frontend build/debug-bridge flags. No new target, downloads,
HOME override or product source/pin edits. Six-GiB disk floor monitored each
second; build minimum 8545075200 bytes,
completion free 8717438976 bytes.

All eight required JS/CSS/JSON/SVG assets from nine dist files matched loaded
Mach-O segments. HTML references, dynamic debug import, startup diagnostic,
execute double-rAF, capability24 and native/frontend exact source identity
passed. COW clone is a separate inode; original bytes/inode/mode/mtime stayed
unchanged after signing. Source plist/icon/entitlements, plist lint, original
signature, local ad-hoc deep/strict verification, linked libraries and signed
embedded identity passed. No notarization/distribution claim.

## Handoff

Target lease released; zero Cargo/rustc/linker processes at completion. Artifact
directory is static for Cicero actual-file independent review. App/runner not
started; no stores, credentials, account network, ADB or GUI access. Old packages,
owned libraries and previous failure/probe evidence retained.

After independent package PASS and parent runtime authorization: one owned-App
single-push diagnostic to a new output, preserving previous results. Only if that
transfer passes, run the full acceptance with two fresh clients. No further SDK
probe. This package receipt makes no runtime success claim.
