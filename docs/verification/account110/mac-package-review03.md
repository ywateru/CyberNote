# account110 d0ad2267 diagnostic Mac package independent review

2026-11-14 — **PASS for static package identity; no blocking findings.**
Scope follows [the established static package checks](mac-package-review01.md).
Exact source `d0ad2267289cbe3f527fd7ee30299a62812d6ac9`, tree
`debd3aab7a206b6ae06918c986e22fb3fbac2fbd`. Actual inspected package:
`/Users/water/work/2026/Apple-Notes-Clone/artifacts/account110/mac-d0ad2267-debug-01/CyberNote-Account110-d0ad2267.app`.
Completion/build/packaging receipts were complete before inspection; actual-file
checks below independently validate their claims.

| Independently rehashed file | Bytes | SHA256 |
| --- | --- | --- |
| Original `notes-clone` | 207,025,312 | `98654d4920fec41ee29510c1811801d6ca827055caac578523eae19e6bfa2cad` |
| App `Contents/MacOS/notes-clone` | 205,840,272 | `2823cfb35ca6f3c4a55e677d37b63bd74dab3c4b96d2ad70fefa38084375141e` |
| Artifact `SHA256SUMS` | — | `3277924fe082837e74c498f68e6089dd6661f4742aa11ace7ac963ac7f74f58d` |

## Independent actual-file checks

- Recomputed clean source identity: **1,668 tracked product inputs**, fingerprint
  `28131d9ebe499b3ba9642320a9be48755bac72665e4c383bab5060b488134e74`.
  It matches recorded before/after identities and both embedded build-info
  payloads. Actual HEAD/tree match the frozen source.
- All four locks match recorded before/after values, actual files and frozen
  committed blobs. Full `readInventory` validates **1,790 inputs**, including
  privacy/ownership/license/runtime rules. Manifest SHA256 remains
  `bb87326dcb40bfa3d817a08abd10f517efa93193c7161077bb24adba1ddac7bd`.
- Read-only `scripts/publish/package-identity.mjs` passes separately for original
  and signed executable. Embedded identity payload SHA256:
  `45f8d0790349cf8484182d3cf08f42f47983b0f997f1b12eaf2c446259d15058`;
  exact current source, version0.1.0, production frontend metadata, macos target.
- Independently decoded existing Tauri asset candidates, checked all **9 dist
  hashes**, and located all **8 required JS/CSS/JSON/SVG resources** in readable
  Mach-O load segments of both executables. HTML main/CSS references, compiled
  startup diagnostic, dynamic debug import and source execute double-rAF agree.
  This does not assert exact transformed HTML equivalence or runtime readiness.
- Complete pinned macOS provider is embedded in readable load segments of both
  files: **38,893,120 bytes**, SHA256
  `2d67b7315f96799123e19442580ce7c7616d6d7f322686fa829dd4e3fddfe715`.
- Both executables parse as arm64 Mach-O. Signing preserves actual `__TEXT`
  payload excluding load-command headers, `__DATA_CONST` and `__DATA` byte-for-byte.
  Their inodes differ; current original SHA matches build/pre-sign records.
- Rehashed **37 artifact files** with exact SHA256SUMS coverage, **5 package files**
  with exact packaging sizes/hashes, completion's four receipt hashes and all
  recorded build/packaging command logs. No unexpected files or symlinks.
- Plist source fields retained; bundle executable/version correct. Icon and
  entitlements match frozen source; no external `bundle.resources`. Independent
  `otool -L` finds only system frameworks and `/usr/lib` libraries.
- Independently executed original `codesign --verify --strict --verbose=2` and
  App `codesign --verify --deep --strict --verbose=2`: both exit0. Signature is
  ad-hoc arm64 with resource envelope, no TeamIdentifier. Extracted signed XML
  entitlements equal source. Initial raw-format entitlement parsing failed in
  this verifier; explicit XML extraction resolved it without modifying the package.
  No distribution certificate/notarization claim.

## Recorded build evidence and handoff limits

Rehashed and inspected builder evidence, without running builds or suites:
exact native command has `sync-e2e,tauri/custom-protocol --locked --offline`,
existing shared target, jobs2, DEV/TEST debug0, incremental0. Frontend uses
`VITE_NOTES_DEBUG=1`, target macos and controller `NODE_ENV=development`; native
package remains debug. Integration logs show **29 runner + 8 publish PASS**,
zero failures/skips, typecheck exit0 and capability24. Template/adapted-script
hashes match provenance. Builder records 6GiB floor, minimum free9,940,299,776
bytes and released target. Before/after compilation observations and environment
remain builder evidence, consistency-checked rather than independently observed
during compilation; no reproducible-build attestation.

Bundle ID `com.local.notesclone.account110.debugd0ad2267` does **not** change compiled
Tauri identifier `com.local.notesclone` or default data-dir selection. Separate
test libraries require explicit data-dir selection. No App, Cargo/compiler,
test suites, network, devices, login, credentials or private/original stores were
used. Shared target was read only for generated assets; no build lease acquired.

This permits the parent's separately controlled owned live02 **single-push finite
stage/reason diagnosis**. It proves neither successful transmission nor overall
acceptance and cannot supply diagnostic fields retroactively for earlier failures.
Only this document is written in reviewer tree
`/private/tmp/cybernote-account109-relay-observer-review-01`; main stays clean at
the frozen source. Report remains unmerged while the runtime source gate is held.
