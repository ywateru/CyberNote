# Fixed current-data login cancellation smoke: prepared only

Implements the parent's `docs/plan/tasks/app-account109-android-current-login-smoke.md` contract. No phone operation, installation, application launch, SignIn or cancellation was performed during preparation. Independent review precedes parent execution.

This small wrapper reuses the approved `account109-android-login-surfaces.exercise` unchanged, injecting `account109-android-preserving-upgrade.capture` plus `sameSnapshot`. Old `KNOWN_BODIES`, historical baseline files and old smoke gates remain unchanged. The new expected snapshot proves preservation of this run's current contents; it neither establishes attachment origin nor reclassifies old failures.

## Fixed evidence and identity

- Serial/package: `98895a3147304c3132` / `com.local.notesclone.account109`.
- Source: `88b2dabe4bb898b0bf225e913883b43ed2cac865`.
- Installed APK must hash to `2fee1cfbe27dd3b4c537c7051206831daa5c22bb9d08db50cf25f28d6e381870`. This binds the installed bytes to the independently reviewed source/certificate/embedded identity; the helper's unverified runtime source field is not used as proof.
- Exact existing finite upgrade receipt: `/private/tmp/account109-android-preserving-upgrade-live01/result.json`, SHA-256 `960a6fc409c039f36d3925c3d604b313dd1cf92ca7fac81ed44d74fa20cdc1b9`.
- Exact private expected contents: `/private/tmp/account109-android-preserving-upgrade-live01/before.private.json`, SHA-256 `df83265e2b527804bdfa88cc673ba82b6edb38a2d2b4e0acb1423b3d5339fa18`.

Both private input files must be regular, non-symlink, mode 0600 and match their hardcoded byte hashes before device access. The finite receipt must prove successful installation, complete comparison and cleanup, retain all historical limitations, and record clean signedOut. The snapshot's four known IDs, sole descriptor/reference node and sole byte digest are checked against the fixed evidence. The original historical snapshot file is also SHA-pinned. Before SignIn, genuine product capture additionally checks all historical prefixes, references/ownership/current authorization and known original bytes, then compares every full note field and descriptor against the private expected snapshot. There is no arbitrary baseline, source, APK, package, account, command or URL option.

The parent reports Erdos's independent approval archived in main `9b3b5a51` (latest `cd409830`), with the exact receipt SHA above and private-file 0600/directory 0700 permissions independently checked. The wrapper checks the original finite receipt bytes by that same SHA; it does not rewrite either input.

## Parent commands after approval

Run each independently and stop the sequence on any failure. Every output must be absent:

```sh
node scripts/verification/account109-android-current-login-smoke.mjs --case embedded-back --output /private/tmp/account109-android-current-login-smoke-embedded-back01
node scripts/verification/account109-android-current-login-smoke.mjs --case embedded-browser --output /private/tmp/account109-android-current-login-smoke-embedded-browser01
node scripts/verification/account109-android-current-login-smoke.mjs --case browser --output /private/tmp/account109-android-current-login-smoke-browser01
```

Each run connects without launch to the already running owned main Tauri page and requires healthy signedOut, disabled, no profile/error, no authorization surface, no connected device or conflicts. Before login, after cancellation and after background reclaim/normal reopen, the original exercise requires at least three signedOut/full-data samples spanning at least three seconds. Full product note metadata, complete document/plainText, descriptor fields including paths, exact references and authorized original-byte SHA are retained with no revision/path normalization.

There is one SignIn attempt per case, with actual UI radio selection and surface observation. `embedded-back` waits for the native Dialog/WebView/form boolean projection and uses guarded native Back. `embedded-browser` requires that projection, clicks the unique non-WebView toolbar continue button, observes the actual surface becoming browser and an external browser activity, returns to the owned app and clicks the real Cancel UI control. `browser` uses the original browser-start/cancel flow. The existing finite authorization/surface/form budgets are unchanged. No credentials or callback/URL input are supplied; native XML remains in memory and remote Logto CDP is never inspected. Form projection alone does not independently establish trusted origin.

Unexpected authentication, native error, wrong surface, missing form/transfer, changed data or timeout fails and preserves the current state. No error clearing, logout, sync enable/SyncNow, installation, note/attachment edit, data clear, force-stop or retry is added. Restart uses only the approved Home → owned background `am kill` → normal launch path after strict signedOut. Every acquired driver is closed, only its exact forward is removed, and final lease absence is checked. Failure cleanup never cancels a pending transaction implicitly or deletes evidence. Final pass requires the original restarted-preserved check and successful cleanup.

Output is a mode-0600 finite `result.json` in a mode-0700 fresh directory: pins, checks, observation booleans/durations, finite observed surfaces, safe account diagnostics and cleanup outcome. No full snapshot/body, descriptor values, raw bytes, raw command/error output, browser URL, XML, credentials, access/session values or grants are copied into the report or Git. The existing private upgrade capture is read without modification. `pass-current-data-cancellation-only` does not claim successful authentication, late-valid-callback rejection, attachment provenance, relay or three-peer acceptance.

## Device-free validation

```sh
node --check scripts/verification/account109-android-current-login-smoke.mjs
node --test scripts/verification/account109-android-current-login-smoke.test.mjs
```

9 focused tests cover finite upgrade-receipt rejection, constrained CLI, all three real exercise paths with a fake clock/full capture, initial-error stop before capture/SignIn, note-metadata loss before login, descriptor/byte loss after cancellation, and wrong-surface refusal. Fixtures are synthetic and effects are device-free; they are not live phone evidence. A separate read-only local input check successfully loaded the exact existing private files and verified their pinned hashes/modes and finite structure without printing their contents or accessing ADB.
