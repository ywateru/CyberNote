# Account109 Android candidates and device verification

## Current actual device checkpoint

On 2026-11-13 the isolated Account109 package was installed, started, and updated
in place on Samsung Android 9 arm64, serial `98895a3147304c3132`. The original
`com.local.notesclone` application and Sync108 sandbox were not controlled or read.
The installed candidate's exact integrated main source is
`6537b74bf2c957be2ada5511778f597400877029`, including bootstrap cancellation guard
and fresh signed-out metrics repair. The current application PID observed at the
end of verification was `21082`, with private root
`/data/data/com.local.notesclone.account109`.

| Identity field | Current verified value |
| --- | --- |
| Preserved APK | `/Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/android-candidate-6537b74b.apk` |
| APK SHA256, also verified on installed base.apk | `92fe135c7ea552bb7ccbfad27de86c7061813f8a82f99e5a725d4410958633ae` |
| APK bytes | 124,767,515 |
| Package / Activity | `com.local.notesclone.account109` / `com.local.notesclone.MainActivity` |
| Display name / ABI | `CyberNote Account Test` / arm64 only |
| Native library SHA256 | `f857f2e299b55e179f877c780e0f1f1b856e9bfcacc99a22820f2d698884b462` |
| Provider SHA256, exact pinned input bytes | `c1f6fc493bef37eb530022a1598e689c0d50073680192616aa7aea4e732cdd3c` |
| APK v2 signing certificate SHA256 | `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79` |
| Backup / native extraction | `allowBackup=false` / `extractNativeLibs=true` |
| Callback | `com.local.notesclone.auth://callback`; exactly one handler, this package's MainActivity |

Before initial installation, the isolated package was absent, the device was
unlocked and on (`showing=false`, `inputRestricted=false`), and the callback had
no handler. After installation and again after update it had exactly one owned
handler. No callback was injected. [build03/identity.json](build03/identity.json),
the actual aapt2/signature outputs, and [device02/final-state.json](device02/final-state.json)
record the source/package/library identity and installed-package hash.

The [actual device02 suite](device02/result.json) passed all six checks:

1. Real native `account_command(status)` returns signedOut, disabled, no profile/error.
2. The original synthetic note survives the APK update with identical complete document/plainText.
3. CDP Input and visible product controls create/save the expected complete document and exact plainText.
4. The real Login UI starts native authorization and opens an external activity.
5. Returning through normal `am start` and clicking Cancel returns native signedOut without profile/error.
6. Cancellation preserves the synthetic complete document/plainText.

At the end of device02 the foreground Account settings panel was signedOut,
Login enabled, with no pending Cancel action. That suite did not enter
credentials. A later real hosted-login attempt did enter and submit synthetic
credentials but failed with native `account_network`, as recorded below.
Synchronization remains disabled; successful native callback acceptance, owner
binding, automatic peer discovery and cross-device replication remain unverified.
All synthetic notes are retained.

Each CDP connection forwarded only
`localabstract:webview_devtools_remote_<verified-owned-PID>` to an allocated local
port. [device02/receipt.json](device02/receipt.json) hashes the original and final
device results plus the frozen driver/runner. Final checks found no owned forward,
no reverse mappings, and no Account109 driver lock. The package is left running.

## Preserved attempts and product fixes

| Attempt | Outcome |
| --- | --- |
| build01, main `efb10f8b` | Build and static identity passed; initial installation/start succeeded. |
| [device01](device01/result.json) | Real local full-document edit passed, but native account status failed with `account_sync_failed`. This original failure is retained. |
| Fresh-status unit red/green | Red reproduced `no such table: sync_inbox`; repair returns zero metrics only for an unactivated Store, without enabling sync or creating identity. Account suite 13/13 passed. See [native evidence](../native/fresh-status/checks.json). |
| build02, derived `5c8e0ad4` | Build passed, not installed; superseded to use the canonical integrated main SHA directly. [Receipt](build02/receipt.json). |
| build03, main `6537b74b` | Build/static checks passed; in-place update preserved synthetic data; device02 six checks passed. |
| [hosted-live01](hosted-live01/README.md) | One real guarded credential input and submit; returned to the owned app with native `error/account_network`, no profile and sync disabled. Login failed; no automatic retry. |

## Latest hosted-login failure and network diagnosis

The [single live attempt](hosted-live01/result.json) supersedes device02's
signed-out checkpoint as the latest authentication observation. The following
[read-only native diagnosis](hosted-live01/native-diagnostic01.json) confirmed
`state=error`, safe code `account_network`, and no regular grant/binding files
under the unique account directory. No secret file bodies were read. This does
not establish which native request failed or that callback validation succeeded.

After bounded cross-origin fetch probes produced no HTTP result, a
[direct-navigation control](hosted-live01/public-navigation03.json) used only a
new owned user0 Chrome target: canonical Vercel `/healthz` produced no Document
HTTP status within 30 seconds; the fixed Logto discovery control returned 200 in
about 606 ms. This removes the earlier fetch/CORS ambiguity but does not locate
a DNS/TCP/TLS cause or equate Chrome with native reqwest. See the
[full evidence and limits](hosted-live01/README.md).

The one-use envelope was disposed and exact owned forwards, created target and
leases were cleaned up. The isolated app was restored to user0 foreground;
original apps and synthetic data were retained. The next integration step is to
confirm normal canonical coordinator reachability and then run a separately
recorded login attempt. Successful same-account login and three-device data
convergence remain outstanding.

Bootstrap tests separately proved the prior async verification window could mint
an invitation after gate close/owner cancellation. Guard repair is in main
`be930dfb`; old Noise authorization still fenced data, so the invitation red tests
do not prove a post-close note disclosure. Real sync must use the repaired
candidate. Both red tests and the account green results remain in
[bootstrap-close](../native/bootstrap-close/checks.json).

## Reusable bounded device API

`scripts/verification/account109-android.mjs` fixes both serial and package. It
exports `connectAndroid`, `launchAndroid`, `assertInteractive`, and bounded
background lifecycle helpers. A connected client supports `accountStatus`,
`openAccount`, `signIn`, `cancelLogin`, `createNote`, `openNote`, `readNote`,
`readWorkspace`, `readAttachment`, `inspect`, and idempotent `close`.
It exposes no generic JS/ADB API, grant access, manual pairing or SQL writer.
Mutations use real visible UI controls and Input; IPC calls are reads only.
Every Input phase verifies an unlocked device and this package in the foreground.
The driver removes only the exact forward tuple it owns and uses the shared
token-checked lifecycle lease with an Account109-specific lock.

`scripts/verification/account109-android-smoke.mjs OUTPUT_DIR [PRIOR_SMOKE_JSON]`
runs the six checks above; its prior-note option proves update continuity rather
than assuming a globally empty note count. It never enters credentials, enables
sync, or fabricates a callback. The sole phone operator runs it; do not run a
second driver concurrently. It may open the real system browser during Login,
then returns to this package and cancels without reading the browser page.

### Hosted-login transfer boundary

The first credential-transfer attempt was rejected before any credential Input
or submit action. Its original fixed error is preserved in
[hosted-ready/transfer01.json](hosted-ready/transfer01.json). That error grouped
clipboard reading and JSON parsing, so it does not establish which operation
failed. A subsequent read-only check found the trusted hosted form editable and
native authorization still pending, without a profile or enabled sync. This is
not evidence of authenticated callback success.

`scripts/verification/account109-credential-transfer.mjs` now provides a one-shot
`createCredentialTransfer({ captured, consume })` factory. Import has no effects;
calling the returned function with the separately supplied marker reads the
clipboard into memory, validates the synthetic owner, purpose, marker and short
expiry, then acknowledges capture before invoking the private UI consumer.
Read failures report `CLIPBOARD_READ_FAILED`; malformed JSON reports
`CLIPBOARD_JSON_INVALID`. Validation failures never call either callback, and
every attempted instance rejects a second capture. The raw Buffer is wiped and
parsed credential references are cleared on success and failure; JavaScript
strings cannot be guaranteed to be zeroized. No credentials enter command
arguments, output or files. The private consumer must independently verify the
current native authorization, trusted origin, foreground/unlocked device and
expected form before real CDP Input, and must not log the supplied object.

The `captured` and `consume` callbacks are external error boundaries: their
exceptions are replaced by `CAPTURE_ACKNOWLEDGEMENT_FAILED` and
`CREDENTIAL_CONSUMER_FAILED`, respectively, without the original message, code,
custom fields or cause. After awaiting capture acknowledgement the original
expiry is checked again, before any consumer call. Successful helper completion
returns only `{ phase: "consumer-completed", consumerCompleted: true,
valuesRecorded: false }`. It does not establish that any login was submitted;
real submission and callback observations belong to the UI consumer's separate
authoritative evidence.

`node --test scripts/verification/account109-credential-transfer.test.mjs` passed
22 offline tests using synthetic fixtures only. These cover acknowledgement
ordering, rejection without submission, read/parse error separation, expiry,
single-use behavior, external error sanitization, expiry after acknowledgement,
and reference cleanup when a page/transaction guard fails.
They do not access the clipboard or device and do not prove live login. The
later single-use RSA envelope and guarded consumer attempt is recorded in
[hosted-live01](hosted-live01/README.md); it reached submit but failed at the
native terminal. Consumed or failed transfer instances cannot be reused. A
future attempt must inspect the current native/hosted state first, because the
real browser flow may retain an SSO session.

## Original build01 record

Built successfully on 2026-11-13 from integrated source
`efb10f8b8b684234829c95c3f578ad6b3d86ffbb`. This includes the pinned CyberGrid Rust
SDK license closure and the empty-refresh-token cleanup fix. This is a debug
candidate build record; no device installation, browser authorization, callback,
account discovery, or multi-device acceptance is claimed here.

The build used the externally invoked committed helper `90153228`, existing
Android project/SDK/NDK27.2/JDK17, two Cargo/Gradle workers, debug information and
incremental compilation disabled, and the shared Account109 target. The frontend
flags were `NODE_ENV=development VITE_NOTES_DEBUG=1 VITE_NOTES_ACCOUNT_NATIVE=1`.
The build process exited naturally with code 0 and no signal. No Gradle or Kotlin
daemon remained in the process inventory after this build.

| Artifact | Value |
| --- | --- |
| APK | 77,149,260 bytes |
| APK SHA256 | `2027195d3312927e392c063a3ab9848ee42eb9b2efabe6e1466a8fa5ebf6332b` |
| Preserved APK | `/Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/android-candidate-efb10f8b.apk` |
| Package | `com.local.notesclone.account109` |
| Activity | `com.local.notesclone.MainActivity` |
| Display name | `CyberNote Account Test` |
| Native library SHA256 | `4e5f5a4a31f89724f6b7ebeb755062f86b6f81a602327cc48a3a3242045a7263` |
| Provider SHA256 | `c1f6fc493bef37eb530022a1598e689c0d50073680192616aa7aea4e732cdd3c` |
| ABI | `arm64-v8a` only |
| Signing | Android Debug, APK v2 verification passed |

`aapt2` confirmed `debuggable=true`, `allowBackup=false`,
`extractNativeLibs=true`, package-specific provider authorities, and the registered
`com.local.notesclone.auth://callback` intent filter. The APK provider/native bytes
equal the corresponding build inputs exactly. Three existing OCR/camera native
libraries are also present, all arm64; the complete five-library inventory and
hashes are in [candidate-build.json](build01/candidate-build.json). The initial
inventory assertion incorrectly expected only the two account/native libraries;
read-only inspection identified the existing OCR libraries, with no product or
build changes needed.

The source worktree was clean at the frontend fingerprint step. Tauri then
appended its generated deep-link filter alongside the equivalent explicit filter.
The exact generated diff is preserved in
[generated-manifest.patch](build01/generated-manifest.patch); its trailing spaces
are original generated bytes and are intentionally retained. This is the only
tracked source diff produced by the build. Production application ID and release
configuration were not changed. Generated plugin bindings include both opener
and deep-link and are archived with the evidence. Frontend `mode=production` is
Vite build mode; this candidate explicitly enables the debug UI capability.

[receipt.json](build01/receipt.json) hashes the archived evidence. The raw build
log is preserved separately in the main workspace's ignored artifacts directory;
the readable archived log strips ANSI and trailing whitespace and records the
original raw hash. [frontend-files.json](build01/frontend-files.json) hashes all
frontend build files. This original artifact has been superseded by the repaired
main6537 candidate above. No device mappings were created by build01 itself;
subsequent actual device attempts and their cleanup are recorded separately.
