# Isolated Android account candidate

`scripts/verification/account109-android-build.mjs` is a build-only tool. It has no
ADB, installation, launch, grant, or callback injection operation. The final
integrated source commit must be frozen before building an acceptance candidate.

Run in a dedicated clean worktree with its `node_modules` prepared:

```sh
node scripts/verification/account109-android-build.mjs FULL_40_CHARACTER_SOURCE_SHA --prepare-only
node scripts/verification/account109-android-build.mjs FULL_40_CHARACTER_SOURCE_SHA
```

The tool checks HEAD and the clean worktree, verifies all 1,139 files in the pinned
SDK license receipt, then prepares a private Account109 Gradle home. It reuses only
`caches` and `wrapper` from `~/.gradle` (or `ACCOUNT109_GRADLE_CACHE`), not daemon
state. The build uses the existing SDK/NDK27.2/JDK17 selection in
`scripts/android.mjs`, arm64 debug APK output, two Cargo/Gradle workers, no Cargo
incremental/debug information, and `/private/tmp/cybernote-account109-target`.
Cargo coordinates access to the shared target; coordinate the build start with
the desktop builder to avoid blocking its acceptance run.

The opt-in Gradle init script changes only the debug application ID suffix and
display resources. The expected installed package is
`com.local.notesclone.account109`, display name `CyberNote Account Test`, and
Activity `com.local.notesclone.MainActivity`. Production/release identity and
the Kotlin namespace are unchanged. The Logto callback remains
`com.local.notesclone.auth://callback` and must be checked for handler ambiguity
before a real browser authorization; this tool does not resolve that ambiguity
by changing the registered callback or touching existing packages.

The frontend receives `NODE_ENV=development`, `VITE_NOTES_DEBUG=1`, and
`VITE_NOTES_ACCOUNT_NATIVE=1`. A build request records the exact source tree,
tool/init hashes, public flags and command under ignored
`artifacts/account109/build-request.json`. It is a request, not proof of APK
identity or successful acceptance. Generated source changes cause a final error
so the derived diff must be inspected rather than silently accepted.

Before an authorized installation, inspect the APK package/Activity, signing,
arm64 libraries, provider byte hash, deep-link intent filter, and backup isolation;
record the final APK/native library SHA256 and preserve the APK in the main
workspace's ignored `artifacts/account109/`. Recheck that the isolated package is
absent and the device is unlocked. Do not stop, clear, replace, or read data from
the original package or the Sync108 sandbox. Hosted authorization must use the
real browser/PKCE flow; never copy a grant into the application.

This tooling commit does not claim that an Android candidate was built,
installed, or accepted.
