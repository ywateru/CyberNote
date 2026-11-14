# account110 cb91f4b8 Mac package independent review

2026-11-14 — **PASS for static package identity; no blocking findings.**

Exact frozen source: `cb91f4b82995a314268aa47b491b7973679dff8f`, tree
`3fda0c09ffbed42a3dbd9b3598df27f838ad7b11`.
Actual package inspected:
`/Users/water/work/2026/Apple-Notes-Clone/artifacts/account110/mac-cb91f4b8-debug-01/CyberNote-Account110-cb91f4b8.app`.
Read completed receipts, then independently checked actual files; completion
status alone was not the acceptance criterion. Only this report is written in
`/private/tmp/cybernote-account109-relay-observer-review-01`.

| Independently rehashed file | Bytes | SHA256 |
| --- | --- | --- |
| Original `notes-clone` | 206,987,376 | `594043e5c267798236f785f85238e6d1868060241baa2f663130fbcc47dc98a9` |
| App `Contents/MacOS/notes-clone` | 205,802,560 | `43f2d86d3ceab4dabf24d395259037ae46b19c58b5fde15ecbc7e7f0cd4482a3` |
| Artifact `SHA256SUMS` | — | `b4ec5e5b2696b1b2e283a6ad069100ecb4acc53744b31e90d248189695be1c28` |

## Source, dependency and build binding

- Main HEAD matched the frozen source and `git status --short` was empty before
  and after checks. Recomputed product identity from actual source files:
  fingerprint `210aca54d96fdd35a090ce1aa82654589d50fed0542151d746d78a84357e0dc0`,
  **1,668 inputs**, all tracked. It matches recorded before/after identity and
  actual embedded build-info in both executables.
- Rechecked four lockfiles against actual files, the exact committed blobs and
  both recorded endpoints: root pnpm, native Cargo, account-auth Cargo and
  coordinator npm locks agree. Revalidated all **1,790 manifest inputs** through
  `readInventory`, including hash/privacy/ownership/license/runtime rules.
  Manifest SHA256 remains
  `c379d93f8c032ca7b87960da473c236de9e33eca8b8d905f2757bf813a515b73`.
- Inspected controller, completed command records and hashed build logs. Recorded
  native command is `cargo build --manifest-path src-tauri/Cargo.toml --features
  sync-e2e,tauri/custom-protocol --locked --offline`, jobs2, DEV/TEST debug0,
  incremental0 and the existing shared target. Frontend is Vite production output
  with `VITE_NOTES_DEBUG=1`, `CYBERNOTE_BUILD_TARGET=macos`; controller records
  `NODE_ENV=development`. Production frontend metadata does not imply a release
  native profile: this is an arm64 **debug** package.
- Builder records Node22.16.0/pnpm10.15.0, Cargo/rustc1.97.1 and macOS SDK26.5.
  Per-second monitor records a 6GiB floor and minimum free 10,268,532,736 bytes.
  Before/after history and environment are builder evidence, cross-checked for
  consistency, not independently observed during compilation or reproduced here.
- Completed integration logs were rehashed and counts checked: **69 frontend,
  19 runner, 8 publish passed, zero failures/skips**, typecheck exit0 and capability
  24 checks. These are builder runs, not repeated independent suites. All recorded
  build/packaging command log hashes also match. Old5590 template and adapted
  script hashes match their provenance receipt.

## Actual embedded resources and package closure

- Ran the read-only `scripts/publish/package-identity.mjs` against both executable
  paths and the existing target's generated assets. Both independently revalidate
  current clean source, version0.1.0, macos target, fingerprint/count and actual
  embedded Brotli build-info bytes; identity payload SHA256 is
  `a545a63278489be789ae6af2f3473a8930443a21784e2fd991c26812a7a877a1`.
- Separately decoded recorded Tauri asset candidates, compared to actual current
  dist bytes and located the encoded bytes in readable Mach-O load segments of
  **both** executables. All **9 dist file hashes** agree; all **8 required
  JS/CSS/JSON/SVG resources** are embedded. Checked HTML main/CSS references,
  compiled startup diagnostic assignment, actual debug dynamic import and source
  execute double-rAF barrier. No exact transformed-HTML byte-equivalence or
  runtime readiness claim.
- Independently located the complete pinned macOS provider payload in both
  binaries' `__TEXT`, offset68,018,101: **38,893,120 bytes**, SHA256
  `2d67b7315f96799123e19442580ce7c7616d6d7f322686fa829dd4e3fddfe715`.
  The provider is embedded, not an omitted external bundle resource.
- Both files parse as arm64 Mach-O executables. Signed/original `__TEXT`
  (excluding load-command headers), `__DATA_CONST` and `__DATA` bytes match;
  signing changes are outside those compared payload ranges. Distinct executable
  inodes verified. Current original SHA agrees with pre-sign clone/build receipts;
  original preservation across packaging is also recorded by the builder.
- Rehashed **all 36 files** in artifact `SHA256SUMS`; coverage equals all regular
  artifact files except the sums file itself, with no symlinks. All **5 App files**
  match packaging sizes/hashes with no additional files. Completion's four
  receipt hashes match actual receipts. This reviewer did not rewrite artifacts.
- Source plist fields are retained; executable/version/bundle fields are correct,
  icon and entitlements match exact committed source. Config declares no external
  `bundle.resources`. `otool -L` independently shows only system frameworks and
  `/usr/lib` libraries, with no missing local/custom dylib dependency.
- Independently ran original `codesign --verify --strict --verbose=2` and App
  `codesign --verify --deep --strict --verbose=2`: both exit0. Signature inspection
  confirms arm64, **ad-hoc**, resource envelope and no TeamIdentifier; extracted
  entitlement matches source automation entitlement. No distribution certificate
  or notarization claim. Signature display emits only the CLI's deprecated `:-`
  syntax warning; validation succeeds.

## Handoff boundary

Bundle ID `com.local.notesclone.account110.debugcb91f4b8` does **not** alter compiled
Tauri identifier `com.local.notesclone` or default library selection. Only an
explicit isolated data-dir establishes a separate test library; this review did
not launch against any data-dir. Native implementation/CLI review remains with
the assigned reviewers. Build provenance plus actual static bytes are verified;
this is not a reproducible-build attestation or a live device/action result.

No App, Cargo/compiler, test suites, network, ADB, credentials or original/private
stores were accessed. Shared target was read only for generated asset evidence;
no lease acquired or build started. Main remains frozen at the exact source;
report is a reviewer-tree docs-only commit for reading now, not cherry-picking
until the parent releases the source gate.
