# Classified GUI candidate and re-login runner: independent review

2026-11-13. **Approved for the already authorized parent-operated continuation**, binding all of these identities:

- Build receipt commit `30238337d962cc69e9338cd76dc62543c137a876`.
- Runner adaptation `7ffe4e12f4795e0407502d5936bd365d6d45b80a` plus final `b867bccfa3b4a57b3f5a94f3347f64349ff2eceb` in `/private/tmp/cybernote-account109-relogin-test`.
- GUI source `10814415ca088273bacc311d192b9605bda16775`, executable `/Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/mac-10814415-debug-e2e-02/notes-clone`, SHA256 `b981400529f36cb698616d3871cc83b9a5d7cc4c10fb75009276697daba9ee6f`.

No blocking finding in the build receipt or scoped runner change. This approves preparation and the runner's bounded recovery policy; it does not establish live login, recovery or sync success. Earlier baseline and fail-closed findings remain in [relogin-review01.md](relogin-review01.md) and [relogin-review02.md](relogin-review02.md). Production native/UI review is [auth-recovery-review01.md](auth-recovery-review01.md).

## Build identity evidence

Independently rehashed the actual 203,587,424-byte executable, all four archived build logs and controller, and the four lockfiles in the clean build checkout. They match `docs/verification/account109/macos/10814415-debug-e2e-build01/build-record.json` at receipt commit `30238337`. Re-executed only the read-only `scripts/publish/package-identity.mjs` verifier from `/private/tmp/cybernote-account109-gui-reauth-01`: actual Brotli payload occurs in the executable, decodes to the dist build-info bytes, and matches freshly recomputed clean source identity. Verified source fingerprint `a410d97848c82a11373791d311231e488d0f3da21b332f40cfd00f9d689c1387`, 1,654 inputs, sourceDirty=false; embedded identity SHA256 `e5f492daf3edf3c7258429e222d87bb82c35badc93a1b6264a4ddf365c1a16d3`.

The committed procedure uses the explicit development/debug/mac environment, Cargo `sync-e2e,tauri/custom-protocol`, locked/offline, two jobs, debug=0 and incremental=0, copies the built executable, then checks identity and unchanged source/locks. Archived frontend/native/capability/identity commands all exited 0; native build took 22.407 s and compiled-capability receipt covers 24 cases. These are inspected author build results, not independent rebuilds. The Vite build-info production label does not imply absence of debug/e2e APIs. The initial CLT/xcodebuild metadata failure is separately preserved as pre-build failure; no successful build is claimed for that preparation attempt.

`git diff 43b977c5 10814415 -- src src-tauri crates/account-auth` is empty: the new candidate's production paths retain the reviewed native/UI and auth source. The classified refresh adapter in exact source `10814415` maps `RefreshFailed` only for a typed HTTP 400 `invalid_grant`; transport/temporary/configuration/invalid-response failures keep other finite categories. This classification was checked in source, without contacting an issuer. No old candidate is given the new meaning.

## Runner boundaries

- Startup polls are read-only and bounded to 120 seconds. The final correction waits through the default signedOut and connecting profile states, then dispatches on paused/ready/error rather than treating an early connecting profile as success. Subject changes during observed startup reject.
- Two independent opt-ins gate B actions. Only the pinned direct identityRefresh classification without providerReason admits rejected-refresh SignIn, and only when the initial original owner is disconnected/conflict-free and disabled. A finite network category admits one real UI SyncNow with its own flag and retained original subject. Provider diagnostics cannot be used to relabel arbitrary authentication errors as rejected refresh.
- Before the chosen recovery action, both peers' original semantic projection and attachment bytes are checked. The actual error panel/button is inspected for visible/enabled exact label, with native classification and subject checked again. Commands enter the existing product account UI handler; no native enable shortcut, token, grant, pairing or ownership injection is added.
- A chosen branch executes once, with no retry or fallback to the other branch or SignOut. Healthy same-subject/expected-username recovery is required before existing UI enable confirmation. Network SyncNow uses the driver's supported 60-second request budget. SignIn permits the pending partial profile while waiting up to 120 seconds for its strict terminal result. B must become ready before A's original SignIn flow. NoSession at startup records a finite action-required result and explicit SignOut guidance; SignOut is not performed. If noSession appears only after the one network action, normal auth-failure handling stops the run; native UI still supplies the reviewed guidance, with no second action.
- Original full-library snapshots, shared-ID metadata/reference agreement, raw attachment SHA/production reads, new-note-only edits, restart checks and all-child cleanup requirements remain. AUTH06 remains not run; pause evidence remains a short setting-based window. Poll budgets are checked between finite driver calls, so they are not exact wall-clock caps on an entire stage.

## Independent checks and limits

At exact final `b867bccf`: `node --test scripts/verification/account109-desktop-relogin.test.mjs` **23 passed, 0 failed, 0 skipped** (132.604 ms); both `node --check` checks and cumulative `git diff --check 4d4fcf37 HEAD` pass. Tests include delayed startup error after a connecting profile, one-action selection, unchanged initial errors, subject/username rejection, noSession stop, baseline metadata/reference/byte failures and cleanup. Author worktree clean at final inspection. An earlier independent run at `7ffe4e12` passed its 22 cases before the final startup correction.

No App, browser, original store, device/ADB, external network or build executed in this review; no product edits or commits. The parent owns actual system-browser authorization. Old relogin01 evidence and sealed source candidates were not changed.

## Current execution gate

Subsequent parent report on 2026-11-13: read-only native Chrome AX explicitly showed `macLocked`; no new App or authorization was started. This is parent-reported access evidence, not another device probe by this reviewer. **Prepared and reviewed only; relogin02 must wait for desktop unlock and the separate GUI verification assigned to Erdos.** No headless authorization workaround is approved. Existing production CLI evidence remains evidence of its original scope and does not become live UI acceptance.

Read-only integration check at main `70d6ddbf3e57215673802f7b6c3adc51553f88f1`: the final `7ffe4e12` plus `b867bccf` runner adaptation has not yet been integrated; author worktree remains clean at exact `b867bccfa3b4a57b3f5a94f3347f64349ff2eceb`. Parent may integrate that reviewed source in preparation, retaining the exact candidate pin and both bounded recovery gates. Actual execution after unlock still requires fresh output, explicit end-state and parent browser authorization; no live pass is recorded here. Socrates was notified of the current execution gate. No further tests were repeated because source was unchanged.
