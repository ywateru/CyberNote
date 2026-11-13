# Exact 72513d12 Android → Mac build receipt

2026-11-13. **PASS CLI builds and static package identity only.** Both platforms use exact reviewed source `72513d1296df4526a08834db65a3427957d3fb50`, tree `b84a306069b439f4c364405e0a1a6d21f189881b`. No App or ADB execution occurred. Mac was reported locked by the parent; no attempt was made to inspect/unlock it or change system settings.

| Platform | Artifact | SHA-256 |
| --- | --- | --- |
| Android debug | `artifacts/account109/android-72513d12-debug-01/CyberNote-account109-debug.apk` | `654ab2a820de70588edcceb5231818b3580e425cdf7de1db395b585066091268` |
| Mac debug/E2E | `artifacts/account109/mac-72513d12-debug-e2e-01/notes-clone` | `187cf39d9143b66436b5ea260793f1700f346ac2c6d24cc391be629e96705459` |

Android APK is 77,337,368 bytes, package `com.local.notesclone.account109`, version 0.1.0, debug-signed with the existing Android Debug certificate. Every packaged native library passed ELF64/AArch64 checks; app native bytes equal Cargo output and packaged cloudflared equals the retained vendor bytes. The actual packaged app library contains the current Brotli build-info, matched through package-identity to the source. This is an isolated debug candidate, not a production/unsigned release claim.

Mac executable is 204,326,848 bytes, Mach-O arm64. Frontend build, 24 compiled capability checks, `cargo build --manifest-path src-tauri/Cargo.toml --features sync-e2e,tauri/custom-protocol --locked --offline`, actual embedded identity and resource checks all passed. Eight current JS/CSS/JSON/SVG assets match bytes embedded in readable Mach-O load segments; current HTML references resolve. The DEV startup diagnostic/debug runtime import are compiled, and the execute double-rAF source barrier remains. This does not claim runtime window readiness, paint or login success. The prior 9e controller changed only root/source/out, verified byte-for-byte after those substitutions.

## Android first failure and bounded cache repair

The first Android build exited 1 at `:app:compileUniversalDebugKotlin`: MainActivity could not resolve TauriActivity. Frontend and Rust succeeded. Feynman independently confirmed the shared target retained Tauri build-script output naming an older checkout's generated Kotlin path, while pinned Tauri 2.12.5 reads WRY_ANDROID_KOTLIN_FILES_OUT_DIR without a corresponding env rerun declaration. Wry generated its classes in the new checkout; TauriActivity was missing. The new auth plugin Kotlin had warnings, without a reported compilation error.

Only the exact 16-byte `aarch64-linux-android/debug/.fingerprint/tauri-93dedab2faa6e790/run-build-script-build-script-build` derived fingerprint was invalidated after preserving its bytes/hash/JSON. No package/full-target clean, product change or copying from the old generated directory occurred. Retry02 explicitly compiled Tauri, generated the current TauriActivity and completed APK build with exit 0. Initial failure record and raw log remain unchanged at the artifact root; retry02 has its own controller/log/record. The cache repair does not require a new source revision.

## Source, resources and execution bounds

The existing sparse checkout was reused for both platforms. Complete Git-tree enumeration was compared with materialized productFiles paths and each regular file's blob identity; 1,664 expected inputs, zero missing/changed bytes. All four locks match committed blobs, and source/fingerprint/count/locks remain identical before Android and after Mac. Fingerprint: `d8502289204f2c148a5592f55021862155119bfd6beb633a78f7780d27871018`. Ordinary Git clean status alone was not used to prove sparse completeness.

Both builds use the sole shared target, jobs=2, debug=0, incremental=0. Android imports prepareCandidate with explicit targetDir, enforces its 1,139 SDK-license-input guard, Java 17 and NDK 27.2.12479018. Cargo offline and a task-owned Gradle offline/maxWorkers=2 init were set; the owned init was removed after completion. No dependency install/download or HOME override was performed. Android locks were pinned and checked unchanged; the helper's exact Tauri argv and Mac's explicit locked/offline Cargo argv are archived rather than claiming an extra Android CLI flag.

A one-second supervisor enforced the 10GiB start/runtime floor for each build; none of the compilation attempts crossed it. The earlier low-disk preparation stops occurred before a controller/build PGID existed and are not labeled compilation failures. Controllers awaited their children; both platform builds have ended and the target is released. Android and Mac dist are separately preserved in their artifact directories despite sharing one checkout. Detailed controllers, records, disk minima and log hashes are in receipt.json and adjacent files; raw logs/binaries remain in artifacts, not duplicated here.

No source, manifest pins, store, grant, credentials, device, hosted page, external configuration, sealed DRAFT or remote publication was changed. GUI/account/sync acceptance remains pending separate authorized real execution after manual unlock. SHA256SUMS covers the compact archive.
