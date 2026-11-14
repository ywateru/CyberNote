# account110 a663586b request-deadline Mac package independent review

2026-11-14 — **PASS for static package identity; no blocking findings.**
Same static scope as [the established package review](mac-package-review01.md).
Exact frozen source `a663586b47f136508d1cab50f7ca2a075b9fd67b`, tree
`e1bc98e207c21a37b1d325c90b2b2a56b47e2fb6`. Actual inspected package:
`/Users/water/work/2026/Apple-Notes-Clone/artifacts/account110/mac-a663586b-debug-01/CyberNote-Account110-a663586b.app`.
Completion/build/packaging records explicitly marked static completion before
actual-file verification; no builder docs merge was needed.

| Independently rehashed file | Bytes | SHA256 |
| --- | --- | --- |
| Original `notes-clone` | 207,032,848 | `0dbd9055440341e8980167a090ebc929a1909f0574e0cbe5ec3a31ae96eaa99c` |
| App `Contents/MacOS/notes-clone` | 205,847,776 | `a6c2d19e0ec1c33fe206235d16ad3452e31b8c57c281531f5c6da30d1ab7fc0f` |
| Artifact `SHA256SUMS` | — | `47188877f193550eed6862204b5cf253991e0e4d50bc015d12a673529c7bcdc3` |

## Actual independent checks

- Recomputed clean source identity: **1,668 tracked product inputs**, fingerprint
  `c4aecff725103ed0d456e22dfa605863693ad23bebd775f27ed3d354e28b1f01`.
  Recorded source before/after and actual embedded identities agree. Actual
  HEAD/tree match the frozen source. Four lockfiles match recorded endpoints,
  current files and exact committed blobs.
- Full `readInventory` validates **1,790 manifest inputs**, including privacy,
  ownership, licenses and runtime assets. Manifest SHA256:
  `b797bbc3e2a96c8bfddd63e20bd8372755d1af8205b8f40a4aca45c81270f274`.
- Read-only `scripts/publish/package-identity.mjs` passes for both executables:
  current source/version0.1.0/macos, embedded identity payload SHA256
  `868479a8f0c4ec9678069edc5b6497244c77373dc860dba81a525013b90221c2`.
- Independently decoded existing Tauri asset candidates, matched all **9 dist
  hashes** and located all **8 required JS/CSS/JSON/SVG resources** in readable
  Mach-O segments of both executables. Current HTML main/CSS references, compiled
  startup diagnostic, actual dynamic debug import and source execute double-rAF
  agree. No exact transformed-HTML equivalence or runtime readiness claim.
- Both binaries contain the complete pinned macOS provider in readable load
  segments: **38,893,120 bytes**, SHA256
  `2d67b7315f96799123e19442580ce7c7616d6d7f322686fa829dd4e3fddfe715`.
- Both parse as arm64 Mach-O executables. Original/signed `__TEXT` excluding
  load-command headers, `__DATA_CONST` and `__DATA` compare byte-for-byte equal.
  Executable inodes are distinct; original SHA matches pre-sign/build evidence.
- All **37 artifact files** match complete SHA256SUMS coverage; all **5 package
  files** match sizes/hashes with no extras/symlinks. Completion's four receipt
  hashes and every build/packaging/integration command-log hash match actual files.
- Source plist fields retained; executable/version correct; icon and entitlements
  equal frozen source. No external `bundle.resources`. Independent `otool -L`
  lists only system frameworks and `/usr/lib` libraries.
- Independently ran original `codesign --verify --strict --verbose=2` and App
  `codesign --verify --deep --strict --verbose=2`: both exit0. Signature is ad-hoc
  arm64 with sealed resource envelope and no TeamIdentifier. Extracted signed XML
  entitlements equal source. No distribution certificate/notarization claim.

## Build evidence and handoff

Inspected completed controller/records/logs without running builds or suites.
Recorded native command is `cargo build --manifest-path src-tauri/Cargo.toml
--features sync-e2e,tauri/custom-protocol --locked --offline`; existing shared
target, jobs2, DEV/TEST debug0, incremental0. Production frontend build metadata
with debug bridge (`VITE_NOTES_DEBUG=1`, controller `NODE_ENV=development`) does
not imply a release native binary: this is a debug package.

Rehashed integration logs show exact-source manifest `changes=[]`, export dry-run
**1,794 files / 95,808,039 bytes**, typecheck exit0; capability24 is recorded and
its log checked. Frontend/runner/native suites were not repeated. Builder records
6GiB floor, minimum free8,545,075,200 bytes and released target. Historical
before/after observations and environment are builder evidence, checked for
consistency rather than independently observed at compilation; no reproducible
build attestation.

This candidate has no old `template-provenance.json`. The verifier's initial
expectation of that optional sidecar failed; direct full script comparison then
verified build-controller/package-wrapper/verify-assets against the prior approved
d0ad2267 artifacts. Differences are only new source/output/bundle identity and
the prior-controller hash, whose actual referenced bytes match the build record.
No artifact was modified to satisfy the check.

Bundle ID `com.local.notesclone.account110.debuga663586b` does **not** change compiled
Tauri identifier `com.local.notesclone` or default data-dir choice. Separate test
libraries require explicit data-dir selection. No App, Cargo/compiler, suites,
network, devices, login, credentials or original/private stores were used.
Existing shared target assets were read only; no lease acquired.

Parent may perform the separately controlled real App push retest. Static PASS
does not prove request-deadline behavior, successful push or overall acceptance.
Only this report is written in reviewer tree
`/private/tmp/cybernote-account109-relay-observer-review-01`; main remains clean
at the frozen source. Report stays unmerged while the parent holds the runtime
source gate.
