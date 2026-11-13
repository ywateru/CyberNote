# Fixed Account109 preserving upgrade: prepared, not executed

Contract: `c8d8d527`, `docs/plan/tasks/app-account109-android-preserving-upgrade.md`. Independent review must precede execution. This preparation performed no ADB operation, installation or product launch. Device-free fixture tests establish runner policy only.

After review, the parent runs from the integrated repository root:

```sh
node scripts/verification/account109-android-preserving-upgrade.mjs --output /private/tmp/account109-android-preserving-upgrade-live01
```

The output directory must be absent. There are no APK, package, serial, account, URL, command or baseline override arguments. Do not reuse an existing output or retry a failed install. Preserve failed evidence for separate read-only review.

## Fixed inputs

| Input | Pin / existing evidence |
| --- | --- |
| Serial / package | `98895a3147304c3132` / `com.local.notesclone.account109` |
| Expected existing PID | `28911`, from `login-surfaces-attachment-read01/result.json`; a changed PID stops before install |
| Existing APK SHA-256 | `da74379984dfc0af86bff1ae89aeac43c83fdab4e7884b9b032961519c404ce9`, recorded by `9263-debug/device-after-update.json` |
| New source | `88b2dabe4bb898b0bf225e913883b43ed2cac865` |
| New APK | `/Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/android-88b2dabe-debug-01/CyberNote-account109-debug.apk` |
| New bytes / SHA-256 | 77,335,388 / `2fee1cfbe27dd3b4c537c7051206831daa5c22bb9d08db50cf25f28d6e381870` |
| Debug certificate SHA-256, old and new | `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79` |

New package identity, signature and embedded source were independently approved in `native/88b2dabe-android-build-review01`. Local APK length/hash and actual apksigner v2/one-debug-signer/certificate checks run before device access and again immediately before installation. Old installed hash binds to the previously verified old debug package. After installation, actual on-device base.apk hash must equal the new reviewed APK; source identity is established through that exact complete-package match to the reviewed embedded source, not an invented runtime source field. The helper's `sourceRevision: 'unverified'` is not used as proof.

## Ordered execution and stops

1. Create output mode 0700. Connect only to the existing fixed-package PID, with `launch:false`, through the existing helper's exclusive lease, exact PID-owned forward and unique main Tauri CDP page. Require the old APK/PID and original `error / account_network / coordinator`, enabled=false, no profile and no connected device.
2. Read current full notes and descriptors twice using product APIs. Validate the pinned historical snapshot file SHA, four exact IDs/plainText, three full historical documents, target's unchanged original three blocks/root fields, only its known attachment plus empty paragraph, exact descriptor keys/owner/reference/name/kind and native note authorization. Pin the raw-ID digest and existing structure receipt's attachment-node JSON digest; any mismatch stops, never recomputes an accepted pin. Authorized product `read_attachment` must return exactly 114,608 bytes with SHA `c95b15e981fe59edf68449ac3a73bc01f609e5e5e74696bb0ef7302927e40cab`. Read workspace again to reject changes during byte reads. Bytes/base64 remain in memory only.
3. Write `before.private.json` with mode 0600, exclusive create and read-back byte-hash verification. It contains current full product note fields, descriptors and attachment byte digests, **no** workspace access/session values, raw bytes, credentials, grant, DB or authentication URL. Preserve this file privately; never copy it to Git. This is an independent pre-upgrade capture, not historical baseline replacement or provenance evidence.
4. Close CDP and confirm the exact forward and lease absent. Acquire the same exclusive lease for the installer. Recheck user0/device, foreground/unlocked state, old PID and old installed hash, plus the local candidate. Invoke exactly one `adb -s 98895a3147304c3132 install -r <fixed APK>` with a 120-second subprocess deadline. No uninstall, clear, `-d`, force-stop, settings change, file/grant write, account command mutation or installer retry exists. Install failure/timeout preserves FAIL and does not launch; an indeterminate install needs separate review.
5. Verify actual installed APK hash, release installer lease and normally start using `connectAndroid({launch:true})` (`am start`, no restart/force-stop). Require a new owned PID and the new package hash. Twice, separated by one second, compare every full note field (including document/plainText and metadata), every descriptor field including path, all references and authorized original-byte digests against the private capture. No revision/path normalization is applied. Any change fails without rewriting the capture. Native `authorizing` stops; authentication/cleanup-required errors stop after the data checks, preserving diagnostics. No user authorization or recovery command is sent.
6. Best-effort close every owned driver and installer lease even after failure, verify exact forwards absent and final shared lease absent, and only then finalize. Failure and cleanup failure are both retained. Only all comparisons plus cleanup permit `pass-data-preservation-only`. This is not login, recovery, relay or multi-device sync acceptance. Safe native status retains the existing finite endpoint/provider diagnostics. Existing coordinator network error alone is not a data-loss assertion and is not cleared.

All waits are finite: existing driver CDP/read/connect bounds, local command bounds of 20 seconds, single install bound of 120 seconds and one 1-second observation interval. No unbounded auth/recovery polling is added. Raw command stdout/stderr and errors are captured internally and never persisted or printed; failures use fixed phase/code labels.

## Preparation checks

```sh
node --check scripts/verification/account109-android-preserving-upgrade.mjs
node --test scripts/verification/account109-android-preserving-upgrade.test.mjs
git diff --check
```

31 device-free cases cover structural/reference/owner changes, fixed evidence mismatch, complete metadata/body/descriptor/byte comparison, signature rejection, private file permissions/no overwrite, install ordering/fences, single attempt, failed preconditions preventing installation, failed installed identity preventing launch, auth stops and cleanup failure preventing pass while attempting other cleanup. The tests use synthetic data and fake effects; they do not supply a replacement phone baseline or imply live upgrade success.

The unknown attachment's origin remains unresolved, all previous failures remain, and the clean-signedOut login cancellation smoke is not invoked. Neither installation success nor a changed account status can turn that history into PASS. Do not delete private output/store evidence automatically on success or failure; the parent decides cleanup only after finite archival review.
