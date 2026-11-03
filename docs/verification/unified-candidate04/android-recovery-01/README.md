# Android recovery 01 — built and preserved

Local date: November 4, 2026. Authorized Android-only recovery at HEAD `3d55dbaaa7e87e74629bce8dc6f42b6167968e7d`. No install, app launch, device or GUI action.

The first and only formal recovery build succeeded, exit 0, from 2026-11-03T21:34:45.967199Z to 21:35:19.845702Z (November 4, 05:34–05:35 Asia/Shanghai). `pnpm android:build --debug` used default features and normal CLI compiler/linker environment. No additional feature/config/compiler/linker overrides were introduced. Offline enforcement printed twice. No download prompt, stop reason, input invalidation or cleanup error occurred. Configuration cache stored successfully. The log reports exactly one newly finished APK, and its source modification time falls within this build.

Preserved APK: `/private/tmp/notes-unified-candidate04-android-recovery-01-android-bbc4c1a8.apk`

- 304,110,831 bytes; SHA-256 `bbc4c1a81d22c01082e94a169b5dedc410c8503ede7c405f32d2d0656a56c2c2`.
- ABI: arm64-v8a. This is a debug APK; the generated output directory name universal does not imply other ABIs are included.
- apksigner verify exit 0, v2 scheme true, one Android Debug RSA 2048 signer. Certificate SHA-256 `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`.
- 25 packaged OCR model files, total 2,490,310 bytes, each path/size/SHA exactly matches the original cached model AARs.

Freeze: 284 listed inputs, source aggregate `90d10570359f935eb809b0df0d71bcd1e95cad661c332a21cc04c9ccfb5d4076`. All original 279 rows from accepted Mac source HEAD `d8f832e83349c7503b872e0e88853d1ab7b0713a` remain individually identical; only five merged window-capture tool files were added. All seven original input comparison groups are true before/after build and at collection. The accepted Mac remains the previously preserved d8 artifact; its true manifest/source reference is recorded, with sameCompleteFreezeAsRecovery=false. No new Mac marker or Mac rebuild was created.

Additional build inputs were separately frozen and compared before/after build and before/after collection: `GRADLE_RO_DEP_CACHE=/private/tmp/notes-lifecycle-cache-overlay-01/overlay-ro`; `GRADLE_OPTS=-Dorg.gradle.daemon=false`. The two read-only overlay files total 73,704 bytes, aggregate `2119fb466e6bb78233d6454b62a910337b2a4aa25e34fc0ff365601becc17518`, unchanged throughout. They supplement the original selected cache; they are not covered implicitly by the old seven-group comparison.

The 600-second deadline and 2GiB/download guards did not trigger. Minimum observed free disk during build: 3,728,007,168 bytes. The temporary offline init's device/inode/size/SHA matched before cleanup and it was removed. Postcheck found no active new build/related process; shared build lock was acquirable; no process was stopped. Existing Gradle/Kotlin daemons 49050, 49089, 82371 and pre-existing project Node services were preserved. Known relevant processes had zero shared-target files open; the old selected-cache daemons still keep their normal cache files open. The attempted during-build process snapshot occurred after successful completion, so it found no runner; the later postcheck explicitly distinguishes old services by start time.

`android-original-identity.json` contains complete APK entry hashes, signature output, model comparison and accepted-Mac relationship. `android-attempt01/` preserves raw build log, result, regular inputs and supplementary before/after/collection records. This stage proves package build/signature/model-byte acceptance, not device install, runtime model loading, offline first recognition, UI or interaction equivalence. Target/build ownership is released to the root agent; no old cache or target tree was cleaned/copied.
