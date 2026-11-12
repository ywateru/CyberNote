# d69 default-native isolated Android debug candidate

Built, installed in place, and passed exactly three authorized local smoke checks.
This is a debug test candidate, not a production APK or an auth/sync success.
Earlier hosted login and canonical-network failures remain unchanged elsewhere.

| Identity | Value |
|---|---|
| Exact product source | `d69ffbce2ad1284e6c7ce830f6840ba083148aab` |
| Clean source worktree | `/private/tmp/cybernote-account109-android-d69-debug` |
| Source tree | `44e4970324a9a8c3fec5c2873dc5942490d2a8e5` |
| Frontend source fingerprint | `46e5ba2db1b5f535fcbed89abcdd4e5ebce7737834a3abf2ff79c5339d8d911a` |
| Preserved APK | `/Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/android-candidate-d69ffbce-debug.apk` |
| APK bytes / SHA-256 | 77148012 / `a87cc372a4d84924e905e19abd12837dff36a4b86c23599fe0ce36ba6d7575f5` |
| Package / label | `com.local.notesclone.account109` / CyberNote Account Test |
| Activity | `com.local.notesclone.MainActivity` |
| Final observed device / PID | `98895a3147304c3132` / `15212` |
| Native arm64 ELF SHA-256 | `5e484faeeb0fabc95080568b6b46fbec46b84169cdeda8ddf4795f2f50003628` |
| Provider ELF SHA-256 | `c1f6fc493bef37eb530022a1598e689c0d50073680192616aa7aea4e732cdd3c` |
| Certificate SHA-256 | `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79` |
| Callback | `com.local.notesclone.auth://callback` |

## Build and provenance

The independently clean worktree was created directly at d69. The product and
all four lockfiles stayed unchanged. The default-native capability was tested
with NODE_ENV=development and VITE_NOTES_DEBUG=1; both VITE_NOTES_ACCOUNT_NATIVE
and VITE_NOTES_ACCOUNT_UI were removed, including inherited opt-in/opt-out values.
No root env files were present. `build/identity.json` includes the four exact lock
hashes, frontend build-info, native/provider ELF hashes and artifact fingerprints.
Build-info reports sourceDirty=false; the tracked derived patch is empty.

The audited prepareCandidate path was minimally extended for an explicit target
and default-native environment, then frozen. A no-build/no-device preparation
check deliberately inherited ACCOUNT_NATIVE=0 and ACCOUNT_UI=1 and verified both
were removed. It also verified development/debug settings and four lock hashes.
The fourth lock path was initially wrong and corrected before compilation; the
fixed preparation history is preserved in `build/preparation-history.json`.

The target `/private/tmp/cybernote-account109-d69-debug-target` was an APFS cp -cR
clone of the previous debug cache, not a shared output directory. Only this owned
clone received `cargo clean -p tauri --target aarch64-linux-android`; normal build
regenerated TauriActivity.kt. No generated class was manually supplied. Jobs and
Gradle workers were capped at 2, dev/test debug at 0, incremental disabled. The
bounded runner launched exactly once, exited 0 without signal or timeout, and
its process group became empty. A briefly remaining owned-path Java process
exited naturally before inspection; final owned build process count is zero and
no signals were sent. Disk free space after completion was about 8.4 GiB.

`build/manifest.txt`, `badging.txt` and `signature.txt` are actual packaged-artifact
metadata. The APK is debuggable, backup=false, extractNativeLibs=true, all native
libraries are 64-bit AArch64, and provider bytes match the pinned SDK/provider
receipt. All provider authorities are package-scoped. Exactly one callback scheme
and host attribute occur in the packaged filter; before/after device resolution
returned exactly the owned MainActivity. This does not exercise a live callback
or run the authenticated provider/SDK path. SDK license metadata remained pinned
and the candidate helper verified all 1,139 license receipt files.

## In-place device update and three local checks

Before installation, a read-only PID-owned CDP connection captured the two existing
synthetic notes' full document/plainText and hashes into `device/before.json`.
The app was in its prior error state, with no profile and sync disabled. No secret
file body was read, and the original user app/Sync108 package was not operated.
The baseline connection was closed before installation.

Installation used only adb install --user 0 -r -t against the verified same-ID,
same-certificate debug APK. It returned Success without uninstall or data clear.
The installed base APK SHA-256 was independently read and equals the preserved
artifact. The package's synthetic data root was retained.

The frozen limited tool `scripts/verification/account109-android-local-upgrade.mjs`
executed exactly these checks; the old six-case login/cancel smoke was not run:

1. Both old synthetic notes retain complete document deep equality and plainText
   equality by existing note ID, with no global-count assumption.
2. Real account settings opened through visible UI under the default native gate.
   Actual native account_command status was signedOut, disabled, no profile/error.
3. Real CDP Input and existing UI handlers created and saved one new synthetic
   note. The complete heading/two-paragraph document and exact plainText matched
   expected values on native readback. The final native state remained signedOut
   and sync disabled.

The complete synthetic new note and its hashes are in `device/result.json`.
No SignIn, grant transfer, callback injection, SQL business write, sync enablement,
network-setting change, production install or prior-note deletion occurred. No
authentication, callback, automatic sync or three-peer pass is claimed.

## Cleanup and evidence

At 2026-11-12T21:35:20.261Z, the final read-only observation confirmed u0 test app
foreground with PID 15212, the
installed APK hash match, and the unique owned callback handler. Exact smoke
forward plus any owned Chrome/old/new app PID forward, reverse mappings and both
driver leases were absent at that cleanup observation. The PID/foreground values
are historical observations, not assumptions of continued liveness for future
operations. The test package and all synthetic data were retained.

Sources for the bounded build runner/artifact checker are in `source/`; tool
helper/smoke commit IDs and hashes are in checks.json. The raw build log remains
in the ignored build-worktree artifacts with its SHA. The archived build log
only strips ANSI colors and trailing line whitespace; no vendor/license file was
normalized. Tool-only hash-API/manifest-literal assertion corrections are recorded
separately from the single successful product build. No build was restarted due
to an observation timeout. Main workspace tracked files were not modified; only
the authorized ignored APK artifact was added there.
