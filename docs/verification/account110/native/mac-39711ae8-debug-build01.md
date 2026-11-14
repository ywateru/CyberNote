# Account110 exact-main 39711ae8 Mac debug build 01

2026-11-14 (Asia/Shanghai). Build, packaging and static verification PASS; App
not launched. Exact frozen clean source `39711ae8f6c2cc92c387a3638c92c43024dcc68e`.
This docs-only report is in the existing author worktree. Main and artifact
directory remain static after handoff; no source/pin/lock changes were made.

App: `artifacts/account110/mac-39711ae8-debug-01/CyberNote-Account110-39711ae8.app`
in the main workspace. Bundle ID `com.local.notesclone.account110.debug39711ae8`.
A distinct bundle ID does not isolate compiled default data selection; any later
launch must use an explicit owned data directory.

| Identity | SHA256 |
| --- | --- |
| Original arm64 executable | `638261134a287113a8d0aae064c2fdc7a995f29a0f572430ac03071d0df3485d` |
| Signed app executable | `b3270ad720bce83fc16f5da38f9ce7caeb7120b219b8a2c4674b76491322a4f6` |
| completion-receipt.json | `3af3f27ea32588d1c9fb2eef642c07ef6ab439d99f00d46b520365e0919883e8` |
| build-record.json | `0dd2f77429af31722998158fb84f72d01ac35a1747c5e5b0875f3435e89674dd` |
| packaging-receipt.json | `e361ac4179b5b81b252f7da975242b974fab90ad3730abcf32d1f1506cde97e9` |
| resource-identity.json | `61662aa57c922f663dcd948a7b5e75014ee76a8b3d1f9fe8fe4a2e53b67c8f49` |
| integration-checks.json | `b5c40bd041770520a06d3502d80d2d0974aced251089b42775b9abc27ac5fbeb` |
| SHA256SUMS | `bb65d82f77d89a76661413356f68776ecc76d6423b4fb2f3d44e82030905983c` |

Executable hashes are not app-directory digests. All37 checksum entries
were reread and matched, including signed app contents. Source tree
`c7689efc674ca1c15794a04e8cd129342251d9ab`; fingerprint
`8bbb1392aad044f6c8474aa0e5cede47a3c8c84c64a6ebb26a6795c5bcdeb1f8`,1668 inputs.
HEAD, clean state, identity fingerprint and four locks matched before/after.

## Necessary checks and build

No frontend/runner/native test suites were repeated. Exact-commit manifest
dry-run reported no changes. Export validation and typecheck passed.
- manifest-current: exit0, 18.057 seconds.
- export-current: exit0, 18.054 seconds.
- typecheck: exit0, 8.021 seconds.

Actual required build steps:
- frontend-build: exit0, 11.028 seconds.
- compiled-capability: exit0, 1.004 seconds.
- native-build: exit0, 86.209 seconds.
- embedded-identity: exit0, 1.007 seconds.

Reused reviewed a663 ignored controller/package/asset/finalization templates,
adapting exact SHA, output/app/bundle identity and prior-controller provenance.
Sole existing target `/private/tmp/cybernote-account109-mac-ec4348c6-target-01`;
features `sync-e2e,tauri/custom-protocol`, locked/offline, jobs2, DEV/TEST debug0,
incremental0. Same frontend build/debug-bridge flags. No new target, download,
HOME override, source correction, failed step or identity assertion bypass.
Existing native/Vite warnings are retained in logs. Six-GiB floor monitored each
second: minimum 8030285824 bytes; completion free 8258998272 bytes.

Capability24 and exact original/signed native/frontend identities passed. All
eight required JS/CSS/JSON/SVG assets from nine dist files matched loaded Mach-O
segments. HTML references, debug import, startup diagnostic and execute double-rAF
checks passed. COW clone has a separate inode; original bytes/inode/mode/mtime
unchanged after signing. Exact source plist/icon/entitlements, plist lint, original
signature, local ad-hoc deep/strict verification, linked libraries and signed
embedded identity passed. No distribution/notarization claim.

## Handoff

Target released with zero compiler processes at completion. Artifact directory
is static for Cicero actual-file review. No App/runner, original or owned store,
credentials, account network, ADB or GUI operations. All previous candidate and
failure evidence, and owned libraries remain retained.

After package approval and parent authorization: normal restore on existing owned
live02 A/B and one push to a fresh diagnostic output. Only after that passes,
fresh dual-client complete acceptance. No further SDK probe. This static package
receipt does not claim runtime stability or successful product transfer.
