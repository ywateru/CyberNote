# account110 29c87810 typed staging Mac package independent review

2026-11-14 — **PASS for actual-file static package identity; no blocking findings.**
Frozen source `29c878108b2ea421b5e4fccd71547206071fdbfa`, tree
`a02687c56973d3ea7ff001304ef848481ede68e7`. Actual inspected package:
`/Users/water/work/2026/Apple-Notes-Clone/artifacts/account110/mac-29c87810-debug-01/CyberNote-Account110-29c87810.app`.
Builder confirmed static/sealed artifact and target release before review; builder
docs `fadbb956` need not merge before verification. Same static scope as
[the previous package review](mac-package-review06.md).

| Independently rehashed file | Bytes | SHA256 |
| --- | --- | --- |
| Original `notes-clone` | 207,260,848 | `ec6d2b3385947dea4903b8aa33d61b5f7fe709a07c340c3222bbb9d4a5db6342` |
| App `Contents/MacOS/notes-clone` | 206,074,464 | `96192c49b6abcc9b689dad895203455c7ceefa713d2e17e15c7379ca85c7ef42` |
| Packaging receipt | — | `8f1dc6d52f00732b9e76018ef76433404e23314573e5f59efb55b7c1832c13b0` |
| Completion receipt | — | `2fc3b9211adca042a054b44368777c8260b2b952c2b4aa28517404de39ff9728` |
| Artifact `SHA256SUMS` | — | `88bc4c3306c1acfdb5e600c50ee077186a2e181555a164aa6d118d0e21eb0f03` |

## Independent actual-file checks

- Both binaries pass read-only `scripts/publish/package-identity.mjs`, which
  revalidates current clean source: **1,670 product inputs**, fingerprint
  `6c6d07a520305917f668f63ae5ac91c307da049103edc8bce003865af95fe491`.
  Embedded build-info SHA256
  `be0666a5095a7463a957af000d87641ec88915dc59126a0f8a7576bf8131a429`,
  version0.1.0/macos, builtAt `2026-11-14T14:40:49.437Z`.
- Four dependency locks equal actual current bytes, frozen committed blobs and
  recorded before/after hashes. Full `readInventory()` validates **1,792 inputs**,
  including privacy, ownership, licenses and runtime assets. Manifest SHA256
  `c100fe5aa17278c585142b58e5136a627686268d7c379cd76774c19150837b8f`.
- **34 checksum entries**, plus SHA256SUMS itself = **35 artifact files**;
  exact coverage and every hash pass. All **5 App files** match packaging
  sizes/hashes; no extras or symlinks. Completion's four subordinate receipt
  hashes and every build/packaging/integration command-log hash match actual
  files, recorded commands exit0.
- Independently decoded existing generated Tauri candidates and matched actual
  dist: **9 files**, all **8 required JS/CSS/JSON/SVG resources** embedded in
  readable loaded segments of both binaries, excluding `__LINKEDIT`.
  Current main `assets/index-BawO1W0D.js`, CSS `assets/index-CYEzx96Y.css`,
  compiled startup diagnostic and real `runtime-Cr2PSpNt.js` dynamic import agree.
  Source execute double-rAF remains. No exact transformed-HTML equivalence or
  runtime readiness claim.
- Complete pinned macOS provider embedded in readable loaded segments of both
  binaries: **38,893,120 bytes**, SHA256
  `2d67b7315f96799123e19442580ce7c7616d6d7f322686fa829dd4e3fddfe715`.
- Both parse as arm64 Mach-O executables. Original/signed `__TEXT` excluding
  load-command headers, `__DATA_CONST` and `__DATA` compare byte-for-byte equal.
  Executable inodes differ; original hash matches build/pre-sign evidence.
- Independently ran original `codesign --verify --strict --verbose=2` and App
  `codesign --verify --deep --strict --verbose=2`: both exit0. Actual signature
  is ad-hoc arm64, sealed resource envelope, no TeamIdentifier. Extracted signed
  XML entitlements equal frozen source; source plist fields, executable/version
  and icon agree. No external `bundle.resources`; actual `otool -L` lists only
  system frameworks and `/usr/lib` libraries. No reviewer signing/mutation or
  distribution certificate/notarization claim.

## Build evidence and handoff

Recorded native command is `cargo build --manifest-path src-tauri/Cargo.toml
--features sync-e2e,tauri/custom-protocol --locked --offline`; existing shared
target, jobs2, DEV/TEST debug0, incremental0 and offline. Recorded frontend flags
remain `NODE_ENV=development`, `VITE_NOTES_DEBUG=1`, `CYBERNOTE_BUILD_TARGET=macos`.
Frontend build-info mode=production does not change the native debug profile.
No build or suite repeated.

Rehashed/parsed logs record exact-ref manifest `changes=[]`, export dry-run
**1,796 files / 95,857,991 bytes**, `initializedNewHistory=false`, typecheck PASS,
capability24. Full script comparison of build-controller, package-wrapper and
verify-assets against approved9e8a4011 artifacts shows only source/output/bundle
identity and prior-controller hash differences; referenced prior hash matches
actual bytes. Builder records 6GiB floor, minimum free **7,780,151,296 bytes**,
target released. Historical compile environment and before/after observations
remain consistency-checked builder evidence, not independently observed
compilation or reproducible-build attestation.

Wrapper ID `com.local.notesclone.account110.debug29c87810` does not change compiled
Tauri identifier `com.local.notesclone` or default data-dir selection. Separate
libraries require explicit data-dir selection. Main reconfirmed exact frozen
source and clean. Report is written only in reviewer tree
`/private/tmp/cybernote-account109-relay-observer-review-01`; leave unmerged while
parent preserves the single-push/fresh-runner source gate.

Parent may perform the separately controlled collector/single push, followed by
fresh complete runner. Static PASS does not prove typed staging repair, successful
direction/content/attachment transfer or overall acceptance, and does not
reclassify prior failures. No App, collector, Cargo/compiler, suites, network,
device, login, credential or original/private-store access. Shared target assets
read only; no target lease acquired.
