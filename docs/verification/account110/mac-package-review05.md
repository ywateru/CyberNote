# account110 39711ae8 future-layout Mac package independent review

2026-11-14 — **PASS for actual-file static package identity; no blocking findings.**
Frozen source `39711ae8f6c2cc92c387a3638c92c43024dcc68e`, tree
`c7689efc674ca1c15794a04e8cd129342251d9ab`. Inspected completed artifact directory
`/Users/water/work/2026/Apple-Notes-Clone/artifacts/account110/mac-39711ae8-debug-01`
and its `CyberNote-Account110-39711ae8.app`, after builder confirmed static completion
and target release. Builder report: `1c9c88b362beffd167e263cb3ecf7fb2b31cbff5`.
Same static scope as [the preceding package review](mac-package-review04.md).

| Independently rehashed file | Bytes | SHA256 |
| --- | --- | --- |
| Original `notes-clone` | 207,046,528 | `638261134a287113a8d0aae064c2fdc7a995f29a0f572430ac03071d0df3485d` |
| App `Contents/MacOS/notes-clone` | 205,861,392 | `b3270ad720bce83fc16f5da38f9ce7caeb7120b219b8a2c4674b76491322a4f6` |
| Artifact `SHA256SUMS` | — | `bb65d82f77d89a76661413356f68776ecc76d6423b4fb2f3d44e82030905983c` |

## Independent actual-file checks

- Recomputed clean source fingerprint
  `8bbb1392aad044f6c8474aa0e5cede47a3c8c84c64a6ebb26a6795c5bcdeb1f8`
  over **1,668 tracked product inputs**. Actual HEAD/tree and embedded identities
  agree. Four lockfiles (root pnpm, native Cargo, account-auth Cargo, coordinator
  npm) equal frozen committed blobs and recorded before/after bytes.
- Full `readInventory()` validates **1,790 manifest inputs**, including privacy,
  ownership, licenses and runtime assets. Manifest SHA256:
  `281c291213f89e70dece4b5b296bbcf3e5f415305341307b526da3284455c00b`.
- Read-only `scripts/publish/package-identity.mjs` passes for both executables:
  exact clean source, version0.1.0, macos; embedded payload SHA256
  `8ab91d05ae6d919df957350469a8239a17dfe715560b0ef56b292f9512c2dff2`,
  builtAt `2026-11-14T12:58:16.319Z`.
- Independently decoded existing generated Tauri asset candidates, compared all
  **9 dist hashes**, and located all **8 required JS/CSS/JSON/SVG resources** in
  readable loaded Mach-O segments of both executables, excluding `__LINKEDIT`.
  HTML references `assets/index-CEHWm97Z.js` and `assets/index-CYEzx96Y.css`;
  compiled startup diagnostic and actual debug dynamic import match. Source
  execute double-rAF barrier remains. No exact transformed-HTML equivalence or
  runtime readiness claim.
- Both executables contain the complete pinned macOS provider in readable load
  segments: **38,893,120 bytes**, SHA256
  `2d67b7315f96799123e19442580ce7c7616d6d7f322686fa829dd4e3fddfe715`.
- Both parse as arm64 Mach-O executables. Original/signed `__TEXT` excluding
  load-command headers, `__DATA_CONST` and `__DATA` compare byte-for-byte equal.
  Executable inodes differ; original hash matches build/pre-sign evidence.
- All **37 artifact files** have exact SHA256SUMS coverage and valid hashes;
  all **5 App files** match packaging hashes/sizes, with no extras or symlinks.
  Completion's four receipt hashes and every recorded command-log hash match
  actual files; recorded commands exit0.
- Source plist fields retained; executable/version correct; icon and signed XML
  entitlements equal frozen source. No external `bundle.resources` declared.
  Independent `otool -L` lists only system frameworks and `/usr/lib` libraries.
- Independent original `codesign --verify --strict --verbose=2` and App
  `codesign --verify --deep --strict --verbose=2` both exit0. Ad-hoc arm64 signature
  has a resource envelope and no TeamIdentifier. No distribution certificate or
  notarization claim; reviewer performed no signing or package modifications.

## Recorded build evidence and handoff

Inspected completed controller/records/logs without rebuilding or rerunning
suites. Native command: `cargo build --manifest-path src-tauri/Cargo.toml
--features sync-e2e,tauri/custom-protocol --locked --offline`, existing shared
target, jobs2, DEV/TEST debug0 and incremental0. Frontend used
`NODE_ENV=development`, `VITE_NOTES_DEBUG=1`, `CYBERNOTE_BUILD_TARGET=macos`.
Frontend build-info mode=production does not change this package's native debug
profile.

Rehashed and parsed integration logs record exact-ref manifest `changes=[]`,
export dry-run **1,794 files / 95,818,900 bytes**, typecheck PASS and capability24.
No fresh export root or repeated frontend/runner/native suites. Builder records
6GiB disk floor, minimum free **8,030,285,824 bytes** and released target.
Direct full comparison of `build-controller.py`, `package-wrapper.py` and
`verify-assets.mjs` with the prior approved a663586b artifacts shows only
source/output/bundle identity and prior-controller hash changes; that referenced
hash matches actual previous script bytes. Historical compile environment and
before/after observations are consistency-checked builder evidence, not an
independently observed compilation or reproducible-build attestation.

Wrapper bundle ID `com.local.notesclone.account110.debug39711ae8` leaves compiled
Tauri identifier `com.local.notesclone` and default data-dir behavior unchanged.
Separate test libraries require explicit data-dir selection. No App, Cargo,
compiler, suites, network, devices, login, credentials or original/private stores
were used. Shared target generated assets were read only; no target lease acquired.

Parent may arrange the separately controlled real App push retest. Static PASS
does not establish future-layout runtime behavior, push success or overall
acceptance, and does not reclassify earlier failures. Only this report is written
in reviewer tree `/private/tmp/cybernote-account109-relay-observer-review-01`.
Main was reconfirmed clean at frozen39711ae8; report remains unmerged while the
parent holds the runtime source gate.
