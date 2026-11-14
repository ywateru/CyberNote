# account110 0a4a4cda Mac package independent review

2026-11-14 — **PASS for static package identity; no blocking findings.**
Scope follows [the previous package review](mac-package-review01.md), with actual
new files checked independently; no build, suites or App execution repeated.

Frozen source: `0a4a4cda80d926c470cfbc8d5cef3bb2937ca58a`, tree
`51657f0b5de11997775d8cfacea2a32ba56cb183`. Package:
`/Users/water/work/2026/Apple-Notes-Clone/artifacts/account110/mac-0a4a4cda-debug-01/CyberNote-Account110-0a4a4cda.app`.
Builder completion, build and packaging records were all marked complete before
review. Their claims were checked against actual files, not accepted on status alone.

| Actual independently rehashed file | Bytes | SHA256 |
| --- | --- | --- |
| Original `notes-clone` | 206,997,984 | `1dcce09b612d4c7c7d004e70fd5e4b9547e7197c5e7ccdcf6c2ddce09001216c` |
| App `Contents/MacOS/notes-clone` | 205,813,136 | `a9cca8b3bdd6c270162924287ab4a12c59d72ae5219a47167d8061b9384b967b` |
| Artifact `SHA256SUMS` | — | `59fdb4af4aef2ce254e5cfd2933326103d2ca053250858891caa45619b14930d` |

Independent static checks:

- Actual source identity recomputed: fingerprint
  `faed72665d63541cfe00158b552d4e21818996fc7e1ab9afad1e72424e1d6121`,
  **1,668 tracked product inputs**, clean frozen source. Recorded before/after
  source identities agree. All four lockfiles match both recorded endpoints,
  current files and frozen committed blobs.
- Full `readInventory` validation passes for **1,790 manifest inputs**, including
  privacy, ownership, license and runtime pins. Manifest SHA256:
  `5dc5273b65269975acf1ff5c56a6560f300174a18403a54057ed403981b56623`.
- Read-only `scripts/publish/package-identity.mjs` independently passes for both
  executable paths and existing generated assets. Their embedded build-info
  matches current exact source/version0.1.0/macos, not a stale sidecar; identity
  payload SHA256 `aec395cee28f0ff1f2355ace903bccce1f0eb2198b91ad8fb94ef23eb81a9c5f`.
- Separately decoded Tauri asset candidates, checked **9 actual dist file hashes**
  and found all **8 required JS/CSS/JSON/SVG resources** in readable Mach-O load
  segments of both executables. Verified current HTML main/CSS references,
  compiled startup diagnostic assignment and dynamic debug import, plus preserved
  source execute double-rAF. HTML is hashed/reference-checked, without claiming
  exact transformed HTML byte equivalence or runtime readiness.
- Complete pinned macOS provider payload is present in readable load segments of
  both binaries: **38,893,120 bytes**, SHA256
  `2d67b7315f96799123e19442580ce7c7616d6d7f322686fa829dd4e3fddfe715`.
- Both files parse as arm64 Mach-O executables. Signed/original `__TEXT` excluding
  load-command headers, `__DATA_CONST` and `__DATA` compare byte-for-byte equal.
  Executable inodes are distinct; original SHA matches builder/pre-sign records.
- **35 artifact files** match the complete SHA256SUMS inventory; **5 App files**
  match packaging hashes/sizes, with no extras or symlinks. Completion's four
  receipt hashes and every build/packaging command-log hash match actual files.
- Source plist fields retained, bundle executable/version correct, icon and
  entitlements equal frozen source. Config has no external bundle resources.
  Independent `otool -L` shows only system frameworks and `/usr/lib` libraries.
- Independently executed original `codesign --verify --strict --verbose=2` and
  App `codesign --verify --deep --strict --verbose=2`: both exit0. Signature
  display confirms ad-hoc arm64, resource envelope, no TeamIdentifier and the
  source automation entitlement. No distribution/notarization claim; display's
  deprecated `:-` syntax warning does not affect successful verification.

Build/integration evidence was inspected and rehashed, without rerunning it:
recorded native command uses `sync-e2e,tauri/custom-protocol --locked --offline`,
existing shared target, jobs2, DEV/TEST debug0, incremental0. Frontend has production
Vite metadata with debug bridge enabled (`VITE_NOTES_DEBUG=1`, controller
`NODE_ENV=development`); native package remains debug. Builder records
Node22.16.0/pnpm10.15.0, Cargo/rustc1.97.1, SDK26.5, 6GiB floor and minimum free
9,608,052,736 bytes. Builder logs confirm **24 runner + 8 publish PASS**, zero
failures/skips, typecheck exit0 and capability24. Unchanged frontend/native suites
were not repeated. Template and adapted-script hashes match provenance records.
Historical before/after observations and build environment remain builder
evidence, checked for consistency rather than independently observed at compile
time; this is not a reproducible-build attestation.

Bundle ID `com.local.notesclone.account110.debug0a4a4cda` does **not** change compiled
Tauri identifier `com.local.notesclone` or default data-dir selection. An explicit
isolated data-dir is required for a separate library. No original/private store,
credentials, App, Cargo/compiler, test suites, device, network or login was used
by this reviewer. Shared target was read only for existing asset evidence; no
lease acquired. Prior login PASS and stack overflow remain separate live facts;
this static PASS does not prove heap-pin or restart behavior on a real App.

Only this document is written in
`/private/tmp/cybernote-account109-relay-observer-review-01`. Main remains clean at
the frozen source. Report stays in reviewer-tree commit, not cherry-picked while
the parent holds the runtime source gate.
