# account110 9e8a4011 diagnostic Mac package independent review

2026-11-14 — **PASS for actual-file static package identity; no blocking findings.**
Frozen source `9e8a4011faab0e363447a3765eb937c7d5e297e7`, tree
`d5dd22ddc777738c2c387c8ff759cf396c63f21f`. Actual inspected artifact:
`/Users/water/work/2026/Apple-Notes-Clone/artifacts/account110/mac-9e8a4011-debug-01/CyberNote-Account110-9e8a4011.app`.
Builder explicitly confirmed artifact static and target released before review.
Scope follows [the previous package review](mac-package-review05.md); native
diagnostic and collector source approvals remain their separate reviews.

| Independently rehashed file | Bytes | SHA256 |
| --- | --- | --- |
| Original `notes-clone` | 207,259,712 | `81d78e4c1a85acc9bda35ae5970d8c9e41b4697bd2ea377accdf6df9617a4024` |
| App `Contents/MacOS/notes-clone` | 206,073,328 | `86246535b5f7d8942f79cd3c5fac156d9a7993f067ecef1372ca8a697c4f8982` |
| Packaging receipt | — | `58527fa391ea32e25b3e39c4162150bc28ab119fec2dea71043bac7386f29d59` |
| Completion receipt | — | `aebc7d5c05d198e52163f15f1e8c106d7274906d816119aa78e49fc2ff2c3ef4` |
| Artifact `SHA256SUMS` | — | `f1f3db0712e76201ccf7500db839d3349c60b4a6bcd4cded176cb81f213d1ce3` |

## Independent actual-file checks

- Both executables pass read-only `scripts/publish/package-identity.mjs` against
  actual current clean source: **1,669 product inputs**, fingerprint
  `a87ad7866b6aae7ec749ca93838526549421e385841227ca2e126dfabbd767c7`.
  Embedded build-info SHA256
  `86e1c6820832ae91659c9a9327889ee78b3d7ef727693a50e84bbf6b8e829457`,
  version0.1.0/macos, builtAt `2026-11-14T13:46:59.821Z`.
- Actual four dependency locks equal frozen committed blobs, recorded before/after
  hashes and current bytes. Full `readInventory()` validates **1,791 inputs**,
  including privacy, ownership, licenses and runtime assets. Manifest SHA256
  `943f5e90cbeab76523ca76a2b85bd39efcb25a20076b3a5225c26470d8eeaa85`.
- Exact SHA256SUMS coverage of **35 artifact files** (the sums file itself excluded
  from its entries); all hashes pass. All **5 App files** match receipt sizes and
  hashes; no extras or symlinks. Completion's four subordinate receipt hashes and
  all build/packaging/integration command-log hashes match actual files, exit0.
- Independently decoded existing generated Tauri candidates and matched actual
  dist bytes: **9 dist files**, all **8 required JS/CSS/JSON/SVG assets** located
  in readable loaded segments of both binaries, excluding `__LINKEDIT`.
  Current main `assets/index-ubQAqyYi.js`, CSS `assets/index-CYEzx96Y.css`,
  compiled startup diagnostic and actual `runtime-DsSQOBCO.js` dynamic import
  agree. Source execute double-rAF remains. No exact transformed-HTML equivalence
  or runtime readiness claim.
- Complete pinned macOS provider present in readable loaded segments of both
  binaries: **38,893,120 bytes**, SHA256
  `2d67b7315f96799123e19442580ce7c7616d6d7f322686fa829dd4e3fddfe715`.
- Both actual binaries parse as arm64 Mach-O executables. Original/signed
  `__TEXT` excluding load-command headers, `__DATA_CONST` and `__DATA` compare
  byte-for-byte equal. Executable inodes differ; original SHA matches build and
  pre-sign evidence.
- Independently ran original `codesign --verify --strict --verbose=2` and App
  `codesign --verify --deep --strict --verbose=2`: both exit0. Signature is ad-hoc
  arm64 with sealed resource envelope and no TeamIdentifier. Actual signed XML
  entitlements equal frozen source; source plist fields and icon preserved.
  No external `bundle.resources`; actual `otool -L` lists only system frameworks
  and `/usr/lib` libraries. No signing or package mutation by reviewer; no
  distribution certificate or notarization claim.

## Build evidence and handoff

Recorded native command is `cargo build --manifest-path src-tauri/Cargo.toml
--features sync-e2e,tauri/custom-protocol --locked --offline`; existing shared
target, jobs2, DEV/TEST debug0, incremental0, offline. Frontend flags
`NODE_ENV=development`, `VITE_NOTES_DEBUG=1`, `CYBERNOTE_BUILD_TARGET=macos` agree
with prior build procedure. Frontend build-info mode=production does not change
the native debug profile. No suite/build repeated.

Rehashed and parsed logs record exact-ref manifest `changes=[]`, export dry-run
**1,795 files / 95,836,791 bytes**, `initializedNewHistory=false`, typecheck PASS,
capability24. Complete script comparison against approved39711ae8 build-controller,
package-wrapper and verify-assets shows only source/output/bundle identity and
prior-controller hash differences; referenced prior hash matches actual bytes.
Builder recorded 6GiB floor, minimum free **7,384,150,016 bytes**, target released.
Historical compile environment and before/after observations are consistency-
checked builder evidence, not independently observed compilation or reproducible
build attestation.

Wrapper ID `com.local.notesclone.account110.debug9e8a4011` leaves compiled Tauri
identifier `com.local.notesclone` and default data-dir behavior unchanged; separate
libraries still require explicit data-dir selection. Main reconfirmed clean at
exact frozen9e8a4011 after checks. Only this report is written in reviewer tree
`/private/tmp/cybernote-account109-relay-observer-review-01`; leave it unmerged
during the actual-run source gate.

Parent may proceed to the separately controlled real App/approved collector run.
No App, collector, Cargo/compiler, suites, network, devices, login, credentials
or original/private stores used here. Shared target assets read only; no lease
acquired. Static PASS does not establish actual SDK map category, successful push
or overall acceptance, and does not reclassify earlier failures.
