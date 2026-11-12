# source5d30 Android production baseline

Status: **real release build passed; clean-source staging blocked**. This is a preserved baseline, not an accepted final package or device/UI/account/sync result.

The independent local clone retained sanitized initial commit `6906f10d842b011d7476d26e4af6570722ce8793`, source snapshot `5d30f16cd41dfd0e6b1ddf37e0c71b5628dc5d07`, and no remote. The original sanitized root and existing Mac candidate were preserved. The workflow command `pnpm exec tauri android build --target aarch64 --apk --ci --verbose` exited 0 after 446.416 seconds, with independent Cargo target, two Cargo jobs, two Gradle workers and a single-use Gradle daemon. Local macOS/Homebrew JDK17 differs from the workflow Ubuntu/Temurin17 host; SDK36, build-tools36.0.0, NDK27.2.12479018, Rust1.97.1, Node22 and pnpm10.15 match the required versions.

All four lockfile hashes remained unchanged. Frozen offline pnpm installation, new-root verifier, version check, publish tests, typecheck and locked/offline Cargo feature metadata passed. The build was offline for Cargo; no claim is made that the Tauri-owned Cargo invocation passed `--locked`. Actual fingerprints show product features `[]`, Tauri custom-protocol enabled and devtools absent. No account/debug/UI environment overrides were inherited.

## Actual APK checks

- SHA-256: `f4647da47f0384dfe85d09d2fa1b124282e335eef3885c20e5c6ed2b6d559f85`.
- SDK36 apksigner exited 1 with exactly `DOES NOT VERIFY` and `ERROR: Missing META-INF/MANIFEST.MF`.
- All five native libraries have ELF64 little-endian ET_DYN/AArch64 headers; ABI directory is arm64 only. No duplicate APK ZIP entries exist. The provider is 28,812,032 bytes and matches the exact source manifest pin.
- SDK36 aapt2 decoded the actual binary AndroidManifest: package `com.local.notesclone`, version0.1.0/code1000, min26/target36, no debuggable/testOnly attributes (Android defaults false).
- The actual compiled account gate is `bp()||!1`, with the pure `isTauri` helper returning native=true/browser=false. Its exact compressed frontend bytes are embedded in the APK native library. No app or whole bundle was executed.
- A supplemental notices ZIP contains 1,200 entries, including all nine added Rust auth/plugin licenses, their provenance and all 1,138 declared SDK license bundle files; their pinned SHA-256 values match. This ZIP is not a completed official stage output.

## Preserved blocker

`tauri-plugin-deep-link2.6.3/build.rs` rewrites the tracked AndroidManifest, adding its generated callback block beside the existing manual callback filter. The added 763-byte block is byte-for-byte identical, including renderer whitespace, to the existing build01 archived patch. The full diff is retained with the local build evidence, without copying build logs or process files into this source tree. Final build checkout has exactly this tracked manifest difference; the transient `.kotlin/` files naturally disappeared during normal process exit. No source was restored to disguise this.

The frontend identity was generated before this hook. Its embedded fingerprint is `bedc35bf7875de54a9e1183a48a92858d00591acfbaa9af462d660a1c369c61a`, but actual post-build source is dirty with fingerprint `3b75e5c3e3873066fdb9373adf8ef4e6334563d33ce52b5bcfbfcbd2d03f1f28`. The real frozen stager exited 1 with `Expected production identity from current clean source`. It left a partial APK copy and produced **no valid receipt**. The embedded pre-hook identity is not accepted as current-source proof.

Main owns the generated manifest normalization and staging verifier fixes. A new precise manifest/export and a rebuild are required for acceptance. Supplemental APK checks do not close those frozen-tool weaknesses. All owned process groups and the exact single-use Gradle daemon exited normally; no install, ADB, app launch, device/library access, external publication or global Gradle stop occurred.
