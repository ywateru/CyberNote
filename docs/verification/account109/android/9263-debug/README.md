# Account109 9263: static identities and one Android local update

Source revision: `9263ea87b5f6112bbd23d4b57d6d7a8b21c9fee3`.
Source Git tree: `d72ca37aa5555fcf73327d9201b59d15e24116b1`.
Both checkouts were independently observed clean before evidence writes. Product
identity was recomputed as fingerprint
`53c8941f3a133f55e03cacf65e89c71a9a12f343c11c2f52b86679a8ce3ccb2c`
over 1,652 inputs. Subsequent parent documentation edits are recorded separately
from product identity; the final check does not require the shared checkout to
remain globally clean.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Preserved macOS executable | 203,070,800 | `2d878d7dedf23f039889c97fc6651a54f4407f3dfeb96d001d998605519f9449` |
| Preserved and installed Android APK | 77,150,696 | `da74379984dfc0af86bff1ae89aeac43c83fdab4e7884b9b032961519c404ce9` |

The macOS executable remains at
`artifacts/account109/mac-9263ea87-initial-recovery/notes-clone`.
Its receipt is [9263ea87-debug-e2e.json](../../macos/9263ea87-debug-e2e.json).
It is an arm64 Mach-O file. Existing
`scripts/publish/package-identity.mjs#verifyEmbeddedIdentity` matched a locally
recompressed Brotli payload byte-for-byte in that executable and decoded it to
the exact captured `dist/build-info.json`. The receipt preserves those JSON
bytes, their hash, source identity and successful compression parameters, so
main `dist` can be overwritten without losing this evidence. A final recheck
uses [source/mac-identity.mjs](source/mac-identity.mjs), which needs neither
`dist` nor Cargo output. No macOS Cargo target was read or altered.

The Android APK is preserved at
`artifacts/account109/android-candidate-9263ea87-debug.apk`. Preservation uses
exclusive creation and refuses to overwrite an existing mismatched file.
[identity.json](identity.json) records the independent static checks, complete
library hashes, build request/result hashes, lockfile verification, environment
claims and embedded build identity. The adapted verifier is
[source/identity.py](source/identity.py); its reference is the earlier
`d69-debug/source/identity.py`.

Android static checks passed for:

- Package `com.local.notesclone.account109`, activity
  `com.local.notesclone.MainActivity`, label `CyberNote Account Test`.
- One callback scheme `com.local.notesclone.auth` and one host `callback`;
  provider authorities belong to Account109.
- `allowBackup=false`, `debuggable=true`, `extractNativeLibs=true`.
- One verified signing certificate, SHA-256
  `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`.
- All five native libraries are 64-bit little-endian AArch64 ELF files in the
  arm64 ABI directory. `libcloudflared.so` SHA-256 is
  `c1f6fc493bef37eb530022a1598e689c0d50073680192616aa7aea4e732cdd3c`.
- The APK's actual `libnotes_clone_lib.so` contains the exact Android build-info
  payload, verified with the existing embedded-identity function. Library bytes
  were piped directly from the APK to Node without extracting a native library
  or accessing Cargo output.

The parent subsequently delegated sole ADB ownership for one local update on
serial `98895a3147304c3132`. Read-only
[source/device-preflight.py](source/device-preflight.py) established an unlocked
device, user 0, Account109 foreground, no serial-scoped forwards, and the expected
installed package/activity/certificate. The prior installed APK SHA-256 was
`a87cc372a4d84924e905e19abd12837dff36a4b86c23599fe0ce36ba6d7575f5`.
No original app was accessed.

The helper snapshotted **all three** existing synthetic notes using the existing
production `connectAndroid().readWorkspace()` interface before installation.
It archived only note identity/title/document/plainText, with a synthetic-title
guard; no workspace metadata, account profile, token, raw device dump, logcat,
or personal log body was archived.

Exactly one `adb install -r --user 0` installed the preserved candidate. Installed
APK bytes were read back and the complete SHA-256, certificate, package and
activity reverified. All original documents and plain text matched after the
update. The account UI opened through visible product controls and rendered
`signedOut`, matching the read-only native status, with login present, cancel
absent, no profile and sync disabled.

The initial helper had an overly strict assertion that a terminal account
`error` must remain unchanged after process recreation; the candidate instead
reported `signedOut`. That attempt stopped before creating a note. Its exact
source and result are preserved as
[source/local-update-initial.mjs](source/local-update-initial.mjs) and
[local-update-initial-result.json](local-update-initial-result.json). No login,
cancel, sign-out or authorization command was called. This is an evidence-helper
assertion correction, not an asserted account-persistence regression.

[source/local-update.mjs](source/local-update.mjs) resumed with
`--resume-after-verified-install`, checked the previously installed candidate
and original baseline again, and **did not reinstall**. It created one synthetic
note with the existing driver's real product controls and CDP input, verified
the exact full document and plain text, restarted only Account109, and verified
all four full documents and plain text again. The restarted process had a new
PID and continued to report native `signedOut` with sync disabled.

[local-update-result.json](local-update-result.json) records the passing
continuation. [synthetic-baseline.json](synthetic-baseline.json),
[synthetic-created-note.json](synthetic-created-note.json) and
[synthetic-after-restart.json](synthetic-after-restart.json) support exact offline
document comparisons. Both attempts closed their leases and removed only their
five exact owned forwards. Final serial-scoped forwards were empty and the
driver lease was absent. ADB ownership was explicitly returned to the parent;
no further phone operations were performed.

Evidence limits:

- This establishes static identity and one Android **local update** with
  synthetic data. It is not a three-way account/sync pass or real-account login.
- Android build exit/source/environment claims are attributed to the supplied
  request and result. The verifier did not observe the historical build process
  or its complete environment. Requested account flags were removed and no
  `.env*` file was present in the Android checkout; runtime default-native UI and
  native status were checked separately.
- Embedded build-info says frontend `mode=production`. It does not establish
  Rust optimization, Cargo features or release eligibility. The Android APK is
  explicitly debug. The macOS filename `debug-e2e` is a candidate label; no macOS
  app, E2E run, auth or sync was executed, and its historical compiler environment
  and feature flags were not independently established.
- No browser, external account/network operation, build, Cargo command, data
  clear, Developer ID/notarization acceptance, store acceptance or publication
  was performed by this verification. The Android driver's loopback CDP
  connection was used only for the delegated local phone checks.
- No commit was made. Parent archive/report edits belong to the parent.

[verification-summary.json](verification-summary.json) records the final offline
comparison. [evidence-manifest.json](evidence-manifest.json) records full SHA-256
values for the archived evidence and preserved binaries.
