# account109 source preparation / publishing review

2026-11-13. **Prepared draft only; not accepted final.** Exported exactly
`f7a2a0a6a8a767f39aee257ab8200649be0cb136` to the previously absent canonical path
`/private/tmp/account109-source-f7a2a0a6-prepared-20261113-01`. Current real-device
acceptance remains with the parent. This pinned f7a draft predates the SDK
provenance correction, merged subsequently as
`159be3d5fdb547ec8be4beb31c69e8d59e2dd764` and manifest pin
`2b0bd7e211352cda6c03f4ba7707c78453e4c36a`. The corrected preparation is recorded
separately in `../recovery-2b0-prepared01/`. Neither that correction nor the
Android package-validation gap below was repaired or silently repinned in this
sealed f7a root.

## Actionable finding

**[P2, known bounded publication finding] SDK SOURCE.json omits local changes.**
The parent identified, and this review confirmed, that the sealed candidate's
`vendor/cybergrid-sdk/SOURCE.json:6` still says `"changes": []`, despite the four
reviewed local SDK diagnostics edits in `src/client.rs`, `src/error.rs`,
`src/lib.rs` and `src/tests.rs`. Its manifest hash faithfully pins those stale
metadata bytes; passing the hash/policy tests does not make the attribution
accurate. At the time of the initial review, the native author was preparing a
**metadata-only** correction; it is now merged in the commits above. There is no
functional exported-source delta from that correction, and this is not a
secret-risk finding. The stale metadata remains an exact historical boundary of
this f7a draft: the correction is present only in the separate 2b0 preparation.
This f7a candidate is superseded for source selection and is never relabeled as
the corrected source. No broad test rerun was required for the metadata fix.

**[P2] Require the pinned Android provider in the staged APK.**
`scripts/publish/stage-packages.py:90–105` requires the application's native
library and checks the ELF64/AArch64 header of every library present. It neither
requires `libcloudflared.so` nor compares its actual packaged size/hash with the
retained Android runtime asset. The Android branch subsequently checks embedded
build identity only in `libnotes_clone_lib.so`, then writes the receipt used by
`.github/workflows/packages.yml:98–109` for artifact upload.

Two read-only, in-memory ZIP probes against the exact exported validator were
accepted: (1) only an AArch64-header application library, with no provider; (2)
that library plus an AArch64-header provider containing unrelated synthetic
bytes. The first matches a provider omitted during packaging; the second matches
a substituted or modified provider. The other unsigned/production-manifest and
application-identity checks do not inspect provider content. Thus an otherwise
valid APK can pass staging while its required account-networking provider is
absent or differs from the reviewed pin. Runtime provider verification fails
closed; this is an artifact-completeness/availability gap, not a bypass of that
runtime hash check.

Before treating an Android artifact as provider-complete, require exactly one
packaged provider entry and compare its uncompressed bytes' size/SHA-256 with the
validated `runtimeAssets` entry. Add negative tests for missing provider and
wrong bytes with a valid AArch64 header, plus a positive exact-pin case. Existing
19 passing publishing tests do not cover these cases. Evidence and exact
accepted cases are in `policy-review.json`. No actual built APK was changed or
claimed to fail; the counterexamples exercise the staging validator directly.

## Export and history receipt

The CLI was inspected before use. Exact command:

```sh
node scripts/publish/export.mjs \
  --ref f7a2a0a6a8a767f39aee257ab8200649be0cb136 \
  --target /private/tmp/account109-source-f7a2a0a6-prepared-20261113-01 \
  --expected-target /private/tmp/account109-source-f7a2a0a6-prepared-20261113-01 \
  --apply --init
```

- Export: **1,770 files; 95,145,618 bytes**. Input came from committed blobs, not
  dirty/ignored main-worktree material. Source manifest SHA-256:
  `b6d053738b9d69b6bfe1fb842111879beba218c37bdd3d35c479702bd38a6b75`.
- Fresh root commit: `111e7ef088050412277712f5b7a52373525e5ac5`.
  `node scripts/publish/verify.mjs --new-root` passed: independent `.git`, one
  parentless commit, only `main`, no remote, no alternates/shallow history,
  no old reflog commits or unreachable historical objects. No private history
  was imported. Future package metadata must identify this new root commit,
  rather than pretend its revision is the original private source commit.
- Comparing f7a's manifest with its parent confirms **exactly 11 existing SHA
  pins changed**, no paths were added/removed, and policy, first-party,
  third-party and runtime-asset declarations were unchanged. All 11 actual
  exported file hashes match those pins. The exporter made only its documented
  public package/smart-fixture/template/control-file transforms. No manifest
  refresh command was run.
- Current clean product identity: fingerprint
  `a7054da10268ef665e8f7375df0ae13e6e311cc3cd0a07b9695a60b6a6b4793e`,
  **1,619 product inputs**, `sourceDirty=false`. Product-input count is distinct
  from the full 1,770-file source inventory. All 1,770 source files still match
  the exact export; no source file was modified after initialization.
- **Git-storage seal transition:** the immediate post-export snapshot included
  loose Git objects. They became packed storage with metadata timestamps about
  two seconds after the initial commit, so that first whole-directory seal was
  not yet stable. No manual candidate write, `gc`, `repack` or refresh was run
  by this review. Both snapshots are preserved in `receipt.json`; root identity
  and all source bytes were revalidated, and the final whole-directory snapshot
  is stable across another complete `--new-root` check. Future immutable export
  receipts should disable initialization maintenance or wait for it to settle
  before sealing Git storage.

## Policy, rights, notices and source providers

Executed inside the dependency-free candidate:

- `node --test scripts/publish/*.test.mjs`: **19 passed, 0 failed, 0 skipped**.
- `node scripts/publish/verify.mjs --new-root`: passed exact transformed tree,
  input hashes, source/module/fixture/script closure, policy scans and history.
- `node scripts/versions.mjs --check`: passed.

The exact file policy rejects private docs/evidence, generated outputs,
databases/media/signing material, unapproved binaries, symlinks/submodules,
credential patterns and local user paths. Historical device/debug/release
commands are removed from the public package scripts. These checks passed;
pattern scans and reviewed allowlists are not a universal proof of provenance.

`crates/account-auth` remains explicitly project-authored with reserved rights;
the public root LICENSE makes no new general license grant. Coordinator and SDK
retain their pinned CyberGrid source provenance and original component notices.
All **1,200 notice payloads / 5,137,754 bytes** were independently read through
the actual staging no-follow/hash validator without creating an archive. This
includes declared license paths with ordinary filenames, first-party rights,
provider notices, service notices and font/OFL attribution.

Both source providers retain Cloudflare version `2026.9.0`, commit
`b749dfd998f4bced81f48727b9c971cfc3056865`, `runtimeDownload=false`, matching
manifest paths/sizes/hashes/licenses and retained patch/build references:

| Source provider | Bytes | SHA-256 |
| --- | ---: | --- |
| Darwin arm64 cloudflared | 38,893,120 | `2d67b7315f96799123e19442580ce7c7616d6d7f322686fa829dd4e3fddfe715` |
| Android arm64 libcloudflared.so | 28,812,032 | `c1f6fc493bef37eb530022a1598e689c0d50073680192616aa7aea4e732cdd3c` |

Actual exported bytes were rehashed independently. This proves source-provider
closure, not build reproducibility or provider completeness in a future APK.

## Workflow and artifact identity review

The exported workflow matches the pinned source. It runs on manual dispatch,
push to `main` and pull requests, with `contents: read`, checkout credentials not
persisted, per-ref concurrency cancellation and 60-minute jobs. Upload is
`actions/upload-artifact@v4`, missing files fail, retention is 14 days. There is
no release, repository-creation, push or deployment step.

- **macOS:** `macos-15`, mandatory actual `uname -m = arm64`, explicit
  `aarch64-apple-darwin`, Node 22/pnpm 10.15.0/Rust 1.97.1, locked dependency
  install, publishing/type/version checks and locked archive-fixture test, then
  app build and staging. Uploaded files are exactly app ZIP, notices ZIP,
  identity JSON and checksums. Staging inspects the packaged executable and
  requires arm64-only architecture. Signing/notarization acceptance is not
  asserted. Hosted-runner/toolchain availability was not checked offline; the
  architecture guard fails closed if the assigned runner is not arm64.
- **Android:** Ubuntu 24.04/JDK 17, SDK 36/build-tools 36.0.0/NDK
  27.2.12479018, Rust `aarch64-linux-android`; explicit aarch64 release APK.
  Uploaded files are exactly unsigned APK, notices ZIP, identity JSON and
  checksums. Staging rejects JAR/v2/v3 signing material, requires the exact
  apksigner unsigned diagnostic and a decodable production package/version/code
  with no debug/test-only flags, and checks every packaged native library's
  actual ELF architecture. The provider-presence/hash gap above remains.
- **Build identity:** both jobs keep Cargo targets outside source. Staging
  recomputes current clean source revision/fingerprint/input count, checks
  production mode/version/date and matches current raw or Brotli build-info
  bytes inside the extracted application executable. Native/package/notice
  hashes and proof are retained in receipts. Existing tests reject stale/dirtied
  source, stale metadata and old executables lacking current identity. This is
  a source/embedded-byte association, not an execution proof or authenticated
  build attestation. No actual app/APK was built or staged in this review.

Only this directory contains newly authored main-repository review artifacts.
No dependency installation, build, credential access, network call, external
write, GitHub/Actions operation, deployment, ADB or app operation was performed.
The candidate remains a preserved prepared draft, superseded for source selection
by the separate provenance-corrected 2b0 preparation. Current device acceptance
remains incomplete; the parent reports Android coordinator TCP 443 blocked.
Neither root is final accepted. The package-validation finding also remains
documented. No push is authorized or performed here.
