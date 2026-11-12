# Final105 built-package independent verification

Decision: **accepted for package identity, signed bytes, embedded assets/font, distribution notices and recorded lint evidence only**. Reviewed the author's actual new outputs in `artifacts/releases/20261110-modernization105`, not a self-authored build. No rebuild, install, device/UI run, README publication, cache removal or product change was performed.

## Source and real package entry identity

Independently recomputed current product identity and validated the shared source stamp: version `0.1.0`, revision `bf26dae17f972fc09276deb456b4599e1ebe5d67`, dirty=true, 445 inputs, fingerprint `a5b783239e3a2372a013a50ed73b72d4751d134c5e3285579095edafa91c9bb9`, prepared UTC `2026-11-10T01:08:57.822Z`. Reused the previously reviewed release verification functions read-only on the new actual packages, then compared all reported identities and witnesses with `mac.json`/`android.json`.

| Package | Actual entry | Built UTC | Primary SHA256 |
| --- | --- | --- | --- |
| Mac | plist `CFBundleExecutable` → `Contents/MacOS/notes-clone` | `2026-11-10T01:09:35.707Z` | `afc7dea70272ecd873369b99e95bad7b431d9f4089210661bf9ffc91cf3e9407` |
| Android | APK `lib/arm64-v8a/libnotes_clone_lib.so`, matching Cargo's main library | `2026-11-10T01:18:18.059Z` | `d77795fb4d3cae004a76a24825c6c4a125ffe9a1d3a26d3c1da2565eea3153a1` |

APK native libraries use only arm64-v8a and contain exactly one main-library entry; its actual archive bytes equal the supplied main `.so`. Mac is verified against the plist-resolved executable inside that app, rather than another file chosen as a witness. Matching embedded metadata **and** production runtime assets are present in each final primary. Each frontend uses the same release stamp and current identity. All 16 copied codegen files per side match their selected actual build-origin directory byte hashes. Evidence: `artifacts/final105-packages-independent/package-verify.json` and `byte-check.json`.

## Actual final bytes and signatures

Independently streamed the final archives:

| File | Bytes | SHA256 |
| --- | ---: | --- |
| `CyberNote-Mac.zip` | 36,132,872 | `0424db7621d7a0f9a174e04ab1eac2068f0a8f8f03bdd959c49ce33329449020` |
| `android/CyberNote-Android-arm64.apk` | 72,669,322 | `298b830711da80c9ea96dae79ca45126e1f8f2e1347720a5e925a3cc2c430a98` |

Recomputed app-directory digest using the documented release algorithm: `027d7a2f1cfbc4f869be21a67d36d365e7cf509cbc80d210917218bc7c023964`. All six actual non-directory Mac ZIP entries exactly equal their corresponding final staged app or notice file; no duplicate or extra file entry was accepted.

Executed read-only signature checks on the new files: Mac `codesign --verify --deep --strict --verbose=2` exits 0, details show `Signature=adhoc` and no team identifier. This is ad-hoc signing, without a notarization claim. Android `apksigner verify --verbose --print-certs` exits 0 with v2/v3 true. Independently verified the retained r2 APK as well; both certificates have SHA256 `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79` (Android Debug). `zipalign -c -P 16 -v 4` exits 0 and reports successful verification. Commands and outputs: `signature-check.json` and five text files in the independent evidence directory.

## Font and license distribution

Read the single source font, independently checked its 16,437,364 bytes and SHA256 `2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b`, then searched the actual final primaries for the **complete byte sequence**:

| Primary | Complete sequence offsets |
| --- | --- |
| Mac | 13,868,418 and 30,331,509 |
| APK actual Android main library | 2,082,356 and 18,663,083 |

Thus each primary contains two complete copies; this is not a one-copy size claim or a glyph-rendering test. The staged OFL and source README copies on both distribution sides exactly match their source files. The README identifies the unmodified official Noto CJK font, pinned source commit and SHA, copyright metadata and OFL 1.1. The Mac ZIP contains those exact notices. Android notices remain distribution sidecars; this review does not claim they are APK resources. Preserve them with distribution. Raw hashes and exact ZIP entry inventory are in `byte-check.json`.

## Recorded full lint and current build load

Inspected the actual `android-full-lint.log` and XML report, rather than invoking another Gradle run. The full `:app:lintUniversalRelease` entry reports `BUILD SUCCESSFUL in 6s`; 139 actionable tasks comprise 1 executed and **138 up-to-date**. XML independently counts 0 Error, 0 Fatal, 30 Warning and 1 Hint. The recorded command excludes only the already assembled Rust task. This verifies the successful recorded lint entry and its incremental reuse; it does not claim all analyses were forcibly repeated during this review. The report's APK hash equals the independently checked final signed APK.

A current read-only process inventory found no Cargo, rustc, Gradle wrapper or Gradle daemon build load. No cache was cleared. The author also retained process-exit and final-source-guard evidence; the current source/entry verification matches that identity.

## Limits

No native UI, Chinese thumbnail rendering, recording authorization, physical trackpad pinch or Android installation was tested in this batch review. Complete font bytes do not establish successful rendering in the installed app. Android FORMAT102's original r2 failure remains unresolved; diagnostic non-reproduction is not a fix. MEDIA105 formal run1 failed closed and has no complete-coverage/performance acceptance; its measurement tools and follow-up are separate from these package bytes. Package verification does not publish or authorize publishing this batch.
