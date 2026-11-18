# CyberBus120 combined macOS Debug build

2026-11-18. **BUILD PASS**, exit code **0**. This is an **ARM64 Debug manual-test
application, not a release/distribution package**. No app, WebView or UI was launched.

## Exact inputs and ownership

- Workspace: `/Users/water/work/2026/Apple-Notes-Clone`, branch `main`.
- Input and post-build HEAD: `c693a748788fe648f7959a6a72a17aa83362c6e3`.
- Product source fingerprint before and after build:
  `339f23bbb4a1e4603bbbf92a07157a3ea4cb750f21a5ec4f58105f4a096b7773`.
- Product input count: **1802**. No product input changed during the build.
- `sourceDirty=true` is intentional: other tasks/parent were writing documentation.
  No stash, reset, checkout, stage or Git commit was performed by this build task.
- Initial input checks observed the parent's documentation set growing beyond the
  originally announced README/manual pair. The checks stopped before launching a
  build; after confirming all dirty inputs were under `docs/`, the single real
  build proceeded. The exact captured pre-build dirty set was:

```text
 M docs/plan/cyberbus-migration-20261118.md
 M docs/plan/tasks/cyberbus121-account.md
 M docs/plan/tasks/cyberbus123-platform.md
 M docs/plan/tasks/cyberbus124-network-harness.md
 M docs/sync-usage.md
 M docs/verification/cyberbus120/MANUAL-UI-TESTS.md
 M docs/verification/cyberbus120/README.md
?? docs/verification/cyberbus120/combined-rust.md
```

These existing documentation files were not modified by this task; their SHA-256
values captured immediately before and after the build matched. A separate
`combined-cli.md` appeared from another task later. This task's only persistent
source/document write is this `combined-build.md`. Generated build outputs are
under the existing ignored `dist/`, `artifacts/` and `src-tauri/target/` locations.

## Command and environment

Started **2026-11-18 20:46:47 +08:00**, finished **20:48:12 +08:00**; approximately
85 seconds wall time. Executed from the workspace root:

```sh
env -u TAURI_CONFIG \
  CARGO_BUILD_JOBS=2 \
  CARGO_PROFILE_DEV_DEBUG=0 \
  PROTOC=/Users/water/.cargo/registry/src/mirrors.ustc.edu.cn-38d0e5eb5da2abae/protoc-bin-vendored-macos-aarch_64-3.3.0/bin/protoc \
  pnpm mac:build --debug
```

- Actual protoc version: **libprotoc 36.2**.
- `TAURI_CONFIG` was removed for the build. The real main configuration and its
  automatic macOS overlay were used, including sidecar and frontend build hooks.
- `CARGO_TARGET_DIR` was not overridden for the application; it reused the existing
  `/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target` cache. The MCP hook also
  explicitly uses that target directory.
- All Cargo subprocesses inherited `CARGO_PROFILE_DEV_DEBUG=0`. For the main app
  this disables Rust debug symbols; it does not change the Debug profile to release,
  remove Debug assertions, skip assets, or replace production application code.
  Rust compilation was observed using `-C strip=debuginfo`.
- Node `v22.16.0`, pnpm `10.15.0`, rustc `1.97.1 (8bab26f4f 2026-07-14)`,
  cargo `1.97.1 (c980f4866 2026-06-30)`, macOS `26.4`, macOS SDK `26.5`.

## Real build stages

1. `beforeBuildCommand` ran `node scripts/bundle-mcp.mjs && pnpm build`.
2. The sidecar hook ran the real locked release build of `crates/notes-mcp` from
   this checkout, reusing its prepared cache (0.13 seconds). It staged
   `artifacts/bundled-mcp/cybernote-mcp-aarch64-apple-darwin`; no dummy was used.
   This hook intentionally remains release-profile even when the app is Debug.
3. `tsc -b && vite build` completed; Vite transformed 1991 modules and rebuilt
   the actual frontend assets in `dist/` (1.85 seconds).
4. The Tauri CLI actually invoked `cargo build --bins --features tauri/custom-protocol`.
   It finished the unoptimized dev profile in 1 minute 17 seconds and bundled one
   complete `.app`, including the real sidecar, icons and Info.plist.

`dist/build-info.json` records source revision/fingerprint/input count exactly as
above, `sourceDirty=true`, `builtAt=2026-11-18T12:46:52.062Z`, `target=darwin` and
`releasePreparedAt=null`. Its `mode=production` describes the Vite build/assets;
it does **not** make the native Debug application a release package.

Warnings retained: Vite's large-chunk advisory, native Objective-C property
warnings, three SDK unused helpers, and 35 application Rust warnings. No build
error was observed. This task did not expand scope to fix existing warnings.

## Bundle signing correction and exit codes

The initial successful Debug bundle had only linker-generated ad-hoc Mach-O
signatures. File-only strict verification returned **1**, with
`code has no resources but signature indicates they must be present`;
Info.plist was not bound by that initial signature. This failure is retained here.

Only the generated `.app` was corrected with local ad-hoc signatures, using the
repository's existing entitlements. No certificate, signing identity, Keychain
credential, publication configuration or source file was changed:

```sh
codesign --force --sign - \
  src-tauri/target/debug/bundle/macos/CyberNote.app/Contents/MacOS/cybernote-mcp
codesign --force --sign - --entitlements src-tauri/Entitlements.plist \
  src-tauri/target/debug/bundle/macos/CyberNote.app
codesign --verify --deep --strict --verbose=2 \
  src-tauri/target/debug/bundle/macos/CyberNote.app
plutil -lint src-tauri/target/debug/bundle/macos/CyberNote.app/Contents/Info.plist
```

| Operation | Exit code / result |
| --- | --- |
| Complete `pnpm mac:build --debug` | **0** |
| Initial bundle strict signature verification | **1**, recorded above |
| Local ad-hoc sidecar signing | **0** |
| Local ad-hoc app signing with existing entitlements | **0** |
| Final `codesign --verify --deep --strict --verbose=2` | **0**, valid on disk / satisfies Designated Requirement |
| Final signature/entitlements inspection | **0**, ad-hoc; identifier `com.local.notesclone`; Info.plist bound; sealed resources present; no TeamIdentifier |
| `plutil -lint` | **0**, OK |

The final app has `com.apple.security.automation.apple-events=true`, matching
`src-tauri/Entitlements.plist`. This is local ad-hoc signing, not Developer ID
signing or notarization. Strict signature checks do not substitute for launch or
Gatekeeper acceptance, neither of which was executed.

## Final artifacts

Manual-test bundle:

`/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target/debug/bundle/macos/CyberNote.app`

Both executables below are real **Mach-O 64-bit arm64**, executable mode **0755**.
Hashes refer to the **final locally ad-hoc signed bundle**, after the correction:

| Path relative to `.app` | Bytes | SHA-256 |
| --- | ---: | --- |
| `Contents/MacOS/notes-clone` | 204522432 | `d8ac628565236c10b78b79aa917387c964734ff96faf14551dfd82fb251165a1` |
| `Contents/MacOS/cybernote-mcp` | 8264496 | `8ac60210590e8c00784012e9b11e833c3ef29618e71810ccbcab4c330a84281a` |
| `Contents/Info.plist` | 1404 | `cedac2b2819ab46778e4a6e20e10794e2b3e67aee6479af43dee306b5e368463` |
| `Contents/_CodeSignature/CodeResources` | 2663 | `52c0a25881c3deae1ffbe633ad34cf0d9cfbc0c9ddd7f2264f560364078217c5` |

For provenance, before bundle ad-hoc signing the compiled main binary and the
initial bundle copy both had SHA-256
`87a06bd317c594a9eaf98b1b675c16b2ed2c950a38493cf2f93ebd23e7c69718`
(205699776 bytes). The real release sidecar, staged sidecar and initial bundle
copy all had SHA-256
`0d662506f19c51f08ce88637b12a5833812fb2a573cc16324db9edf3fe968f17`
(8294592 bytes). Local signing changed bundle Mach-O signatures and thus the final
bytes/hashes above; it did not substitute a different sidecar implementation.

## Info.plist inspection

The actual bundled plist passed parsing and lint. Key values:

| Key | Value |
| --- | --- |
| `CFBundleIdentifier` | `com.local.notesclone` |
| `CFBundleExecutable` | `notes-clone` |
| `CFBundleName` / `CFBundleDisplayName` | `CyberNote` |
| `CFBundlePackageType` | `APPL` |
| `CFBundleShortVersionString` / `CFBundleVersion` | `0.1.0` |
| `LSMinimumSystemVersion` | `12.0` |
| `LSApplicationCategoryType` | `public.app-category.productivity` |
| `CFBundleIconFile` | `icon.icns` |
| `NSHighResolutionCapable` | `true` |
| `NSMicrophoneUsageDescription` | 将录音添加到本地备忘录。 |
| `NSCameraUsageDescription` | 拍摄照片添加到本地备忘录。 |
| `NSAppleEventsUsageDescription` | 只读系统备忘录并将所选笔记及附件复制到本应用；不会修改原笔记。 |

## Limits and handoff

- **Debug manual-test package, not a release/distribution package.** Native Debug
  behavior remains enabled; debug symbols were disabled only to reuse the requested
  cache and limit disk use. No release SDK optimization build was launched.
- No app/UI launch, login, real user library, microphone/camera/Apple Events access,
  sync, attachment transfer or runtime MCP connection was performed. Static package
  checks do not establish those behaviors. UI execution remains with the user.
- Build logs and exact command/metadata are local aids at
  `/tmp/cyberbus120-combined-build-c693a748.log` and
  `/tmp/cyberbus120-combined-build-c693a748.json`; this document retains the material
  results without relying on their persistence.
- The shared target was released after build completion. Goodall was explicitly
  notified, at the user's request, that final sequential Rust CLI regression could
  proceed. This task will not start another Cargo build/test; those test results
  belong to the separate CLI report and are not claimed here.
- No automatic Git commit, UI preparation run, extra fault enhancement or release
  source export was performed.
