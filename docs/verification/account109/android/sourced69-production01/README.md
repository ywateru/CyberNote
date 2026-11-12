# sourced69 Android production candidate

Status: **real production build, clean-source verification, official staging and static package checks passed**. This is local unsigned package preparation, not installation, visible UI/login/sync acceptance or publication.

Source snapshot: `d69ffbce2ad1284e6c7ce830f6840ba083148aab`. Sanitized initial commit: `d7f3e2a9431f80ae5711a6a8f3fb3c55b86e3cbd`; tree `dd810c45833ffb999a292a1ffc8bbe9a9df9fd27`. The pristine root was announced before dependency/frontend/build operations and retained without changes. Android used an independent APFS source copy and target. Both source roots are clean.

Build identity is production/Android, sourceDirty=false, inputCount1619, fingerprint `3f3b76ebfe6c8a146cb35ffad5b4daeff2696c05612dc8846a55a2d450de2058`. New-root verification passed before and after build. Frozen/offline pnpm installation, version check, publish19/19, typecheck and locked/offline Cargo metadata passed. Four lockfile hashes are unchanged.

The real command was `pnpm exec tauri android build --target aarch64 --apk --ci --verbose`, with Cargo2/Gradle2 workers. The successful retry exited0 in186.666 seconds; official Android stage exited0. The workflow-owned Cargo build did not explicitly receive `--locked`; evidence records the locked metadata check and unchanged lockfile bytes rather than claiming that flag. Toolchain: Node22.16.0, pnpm10.15.0, Rust1.97.1, JDK17, SDK36/build-tools36.0.0 and NDK27.2.12479018. Local macOS/Homebrew OpenJDK17.0.19 differs from workflow Ubuntu/Temurin17.

## Actual staged APK

- APK SHA-256: `82f79f7e306fd60f2148132eae1f727efb7876fdcfb0bc1b7b59087d1565145d`.
- Native library SHA-256: `82982d160e8a66b170fb979ef4fba0b87d605e8411adc75aa7d829da07e6e1b2`.
- Notices ZIP SHA-256: `e4a8dce92e437712e07a2e3fb0c27575da8131e61ca1cfea510444f5b9d4abcd`.
- SDK36 apksigner returns exactly exit1 / `DOES NOT VERIFY` / `ERROR: Missing META-INF/MANIFEST.MF`; strict stage accepts this known unsigned diagnostic.
- All five native libraries are ELF64/little-endian/ET_DYN/AArch64. ABI directories are arm64 only; APK ZIP entries are unique. Provider bytes equal the pinned28,812,032-byte source asset.
- SDK36 aapt2 decoded actual binary AndroidManifest: package com.local.notesclone, version0.1.0/code1000, min26/target36, debuggable/testOnly absent (false defaults), one account callback scheme filter. The tracked source manifest remains byte-identical to its committed pin after normal generator execution.
- Actual Cargo product features are empty; Tauri custom-protocol is enabled, devtools is absent. ACCOUNT_NATIVE/ACCOUNT_UI/DEBUG overrides were absent. The compiled default account gate is `bp()||!1`, whose pure isTauri helper evaluates native=true/browser=false. Exact Brotli frontend bytes were found in the packaged native library. No app or whole bundle was executed.
- All1,200 notice payloads independently match retained source bytes, including the new9 original Rust license files plus provenance and all1,138 SDK license bundle files.

The adjacent receipt is an exact copy of the official staged receipt. Its identity helper recomputed the current clean source and matched the actual packaged native library's embedded production build-info; the package SHA, native SHA and notices SHA were independently checked again.

## Preserved attempts and recovery

The first sourced69 attempt exited1 after200.752 seconds because the APFS-cloned Cargo target retained Tauri build-script output paths naming the old source5d30 root. Wry classes regenerated, but TauriActivity did not. Only the new owned target's exact tauri release package was invalidated with cargo clean (33.7MiB); no old target was cleaned, no generated class was copied, and no tracked source/workflow was changed. Normal codegen then emitted TauriActivity into the new root. The first failure logs and old/new cached output-path evidence remain local.

The prior source5d30 baseline is also retained: documentation commit `fd2c485c52a9a09e5353ae80a98540124846e044`, [baseline report](../source5d30-baseline01/README.md). Its actual Android build exited0, while clean-source driver and official stage exited1 because the deep-link generator changed tracked manifest bytes. It produced no valid receipt. Its APK SHA `f4647da47f0384dfe85d09d2fa1b124282e335eef3885c20e5c6ed2b6d559f85` and the prior Mac package remain unchanged. The new accepted source identity is distinct.

All owned build groups and both sourced69 single-use Gradle daemons exited normally, without process kills or global Gradle stop. No install, ADB, user-library operation, app launch, remote creation or publication occurred.
