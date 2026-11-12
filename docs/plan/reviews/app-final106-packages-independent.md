# Final106 — independent package verification

2026-11-10. **Accepted for exact same-source package identity, final signed bytes, embedded assets/font, notice distribution and recorded full-lint result.** Author's batch is `artifacts/releases/20261110-modernization106`; this reviewer did not build it. No installation, UI/device operation, README publication or cleanup was performed.106 native rotation/IME and original102 long-press acceptance remain open.

Evidence and reproducible readers: `artifacts/final106-packages-independent/{integration-precheck.json,verify.mjs,package-verify.json,bytes_signatures.py,byte-signature-check.json}` plus actual signature-command outputs in that directory. Author report SHA`d0156f6ebe512f9e35674bfa5a9f09627b21f3ce5f52da2d2ee66d15a1540918` and `completion.json` describe this106 batch, not105/r2/v2.

## Same source and actual entry resources

Independently recomputed current identity:0.1.0, revision`bf26dae17f972fc09276deb456b4599e1ebe5d67`, dirtytrue,**446 inputs**, fingerprint`74c0a8bbe365664d3100f66165ac4bf28427c34cf1650170865d6d40ceb8d55a`. Exact current input path inventory and all446 SHA values equal `product-inputs.json`; shared prepare is **2026-11-10T08:05:15.754Z**. Six integrated106 source/check paths match accepted candidate26ffffca by length/SHA; controller remains unchanged. Mac/Android build-result records both have ordinary production targets and diagnosticEnvAbsent=true.

Reused previously reviewed release verification functions read-only on the new actual files, and compared every reported manifest field except new verification timestamp. Real plist executable and actual unique APK Cargo main library are checked, not a nearby decoy file.

| Platform | Actual entry / bytes | Built UTC | Primary SHA256 |
| --- | --- | --- | --- |
| Mac | `Contents/MacOS/notes-clone` /58,009,024B |2026-11-10T08:05:59.823Z|`92161da1222fc2e0095ec0dde20083023b57a512d96ea336e12429475663f71e`|
| Android | `lib/arm64-v8a/libnotes_clone_lib.so` /56,908,160B|2026-11-10T08:23:18.611Z|`63343080ad36c77f71b55b9878c15fef12843b7a4d1a2ee790a1ec22a8da0759`|

APK native libraries are single ABI arm64-v8a, with exactly one Cargo main-library entry. Actual archive bytes equal the supplied final `.so`. Both actual primaries contain the exact encoded matching metadata **and** production runtime; production frontend identity matches each respective build timestamp and shared stamp. Each side's21 copied codegen files exactly match its selected real build origin inventory/bytes, whose metadata/runtime are independently found in the actual primary. Selection is not based on cache mtime.

## Final bytes and signatures

| Archive | Bytes | Independently streamed SHA256 |
| --- | ---: | --- |
| `CyberNote-Mac.zip` |36,117,040|`1cdae91c9dbb3937dbca58c62a018741ebfe6967e16f9a3e013ef84681883760`|
| `android/CyberNote-Android-arm64.apk` |72,669,322|`56d1c3246c3612cc1bc392de8b8493dac189be1e8c83e35c142ffb41d61f2a05`|

Final app-directory release digest recomputes to`5b3de4d3c23944fa7f483f921c63802ef0a8e26b89c52afad6687a693daa4a85`. Mac ZIP has exactly six non-directory files, each byte-identical to its final staged app/notice file with matching Unix modes; no duplicate/extra archive entry accepted.

Executed `codesign --verify --deep --strict --verbose=2` on this app, exit0. Details show ad-hoc/no team identifier; no notarization claim. Actual APK `apksigner verify --verbose --print-certs` exits0, v2/v3 true. Retained105 APK independently verifies with the same Android Debug certificate SHA`e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`; previous105 review links that certificate to r2. `zipalign -c -P 16 -v 4` exits0, Verification successful. Debug signing is not a production-signing claim.

## Complete font and notices

Source font is16,437,364B/SHA`2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b`. Independently searched complete bytes, not a font marker or isolated glyph:

| Actual primary | Complete byte offsets |
| --- | --- |
| Mac |13,868,418;30,331,509|
| APK main library |2,080,524;18,661,251|

Each has two complete copies. This is not a one-copy or native Chinese-rendering result. Both distribution-side OFL/README copies exactly equal source SHA/length. Source README identifies unmodified official Noto CJK static font, pinned commit/source URL/copyright/SHA and OFL1.1. Mac ZIP contains those exact notices. Android notices remain distribution sidecars; no claim they are APK resources. Keep them accessible when distributing the package; bare APK alone is not the complete notice distribution.

## Actual lint and process boundary

Read actual `android-full-lint.log` and report XML: full`:app:lintUniversalRelease` finished exit0, **0Error/0Fatal/30Warning/1Hint**. It records BUILD SUCCESSFUL in9s,139 actionable tasks:1 executed/**138 up-to-date**. Command excludes only already-built`:app:rustBuildUniversalRelease`; no lint rerun was performed by reviewer and no forced full reanalysis is claimed. Recorded APK before/after-lint SHA equals independently streamed final APK. Compile warnings remain in author build logs; successful exit does not mean warning-free.

All six owned build wrapper/helper PIDs are absent in independent current ps; current compiler/Cargo/Gradle process filter also finds none. Filter uses actual process command name plus Gradle Java argv, avoiding substring matches on this review's own shell/Python command. No cache or static library was needed for package verification, and no cleanup occurred here. Parent can perform its separately scoped six-path own`.a/.rlib` cleanup after this acceptance while retaining actual distributions, primary libraries, codegen/frontends, notices and raw evidence.

## Functional limits

Both files are ordinary106 candidates, not runtime-accepted releases. No new Mac UI, real rotation, IME, Chinese thumbnail or microphone test was performed. Old-v2 live-02's successful one-tap keyboard observation is separate; historical trigger and permanent recovery remain unknown. Original102 format panel loss after long press remains a real open failure. MEDIA105 measurements remain Chrome/production-Rust evidence with their accepted comparison scope; this package review does not turn them into native benchmarks or all-phase performance wins. README publication and functional/native gates require their separate authorized steps.
