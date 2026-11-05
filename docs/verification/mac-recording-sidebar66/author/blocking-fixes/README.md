# sidebar66 P1 recovery and requesting-close fixes

Source: `f4a2fba7b5d1fda854b3bc802a629a6e1045c7f4`. This is a follow-up to product `11c73a914deb6bb955fe88ec54ab70f8a5566a60` and its frozen author evidence `182617db952c59540da0da7214eabbe343a923cf`. It addresses the two P1 blockers independently reproduced in review `bd6172eb`: a successful native registration with a lost response, and closing during preparation admitting a recording after the close request. The original report and baseline evidence are preserved.

## Product behavior

The renderer allocates the original session and operation before registration, retains that ticket on error, and displays retry and explicit no-audio cancellation. Both routes recover the same identity. Native registration is idempotent only for the same live document owner, current incarnation, session, operation, and pre-capture state, with no revision/final acknowledgement. Exact recovery is allowed during Quit so an empty registration can finish cleanup; new registration during Quit remains rejected. Started, stale, cross-owner, consumed, and completed identities remain rejected. The existing release guard and every-document Quit seal/ACK requirements remain in force.

Closing an empty Panel synchronously disposes pending preparation before its first await. Pending native start, authorization, or getUserMedia cannot delay the no-audio close or later admit capture. Late streams are still stopped by the production Session. Once `onRecording` has established audio ownership, close follows the existing final WAV/document acknowledgement path. Main-window close invokes the current Panel close before yielding; the sidebar is inert only while main close/Quit seals admission.

Visible recovery controls: `重试准备录音`; cancel button with aria-label `取消准备录音`; after cancellation recovery fails, `重试取消录音`.

## Targeted validation

| Check | Result | Evidence |
| --- | --- | --- |
| Mounted production App/Host/Editor/Panel/Session with headless Chrome oscillator and real MediaRecorder | 19/19 assertions; zero uncaught page errors | `app-attempt03/result.json`, `app-attempt03.log` |
| Native registry tests | 12 passed, 0 failed; 95 unrelated tests filtered | `native-registration.log` |
| TypeScript | passed | `typecheck.log` |
| Production build | passed, existing bundle-size warning retained | `build.log` |
| Whitespace/diff check | passed before product commit | recorded in source manifest |

The browser cases exercise response loss after native insertion, duplicate entry, exact identity retry, idle empty close, direct cancel, repeated response loss during cancel, cancellation retry, main close, and the CmdQ participant path. The three pending gates are native `recording_local_started` response, native authorization preflight, and browser getUserMedia. Each close finishes within a 1.5-second deadline without waiting for the held gate, makes no MediaRecorder start or store, and releases `saved:false/revision:0`. After the held promise resolves, capture remains stopped; a late stream's tracks end. Empty cleanup failure keeps a visible retry and native guard; late authorization does not restart capture, and retry releases the original identity. A final case starts real synthetic media, closes after recording, and observes one WAV store plus exact `saved:true/revision:1` final release.

The runner loads actual production components. Native IPC/registry is a controlled substitute at the process boundary, and the source registry rules are separately covered by the Rust test. The runner explicitly sets a native marker and Mac platform so production `browserEnvironment.authorize` takes the native preflight path. The oscillator stream is synthetic and getUserMedia is replaced; no physical microphone is requested. The native toolbar bind is outside this test's mock contract and produces the existing visible controlled-IPC banner; locators are scoped to the recording sidebar. No real Notes window, recording process, Mac18 audio, phone, simulator, signing, TCC, application identity, schema, or journal migration was touched. The earlier full matrix remains evidence for the earlier product only and was not re-labelled as a full rerun of this fix.

## Preserved attempts

1. `app-initial.log` and `app/failure.json`: the first test run used an unscoped alert locator, which matched the general controlled-IPC error banner and the registration alert. The runner scoped the alert to `.recording-dock`; no product claim is drawn from this failed run.
2. `app-final.log` and `app-final/failure.json`: the first 9 registration/retry/cancel/main-close/CmdQ assertions passed. The authorization gate timed out because the runner omitted `window.__TAURI_INTERNALS__`; production correctly followed its ordinary-browser path, skipped native preflight, and started the synthetic stream. The failure snapshot is preserved. This is not counted as a pending-authorization pass.
3. `app-attempt03.log` and `app-attempt03/result.json`: with explicit native marker and Mac platform, all 19 assertions passed, including all three pending gates. Product bytes match the committed source listed above. `source-manifest.json` binds the runner and relevant production modules by SHA-256. `evidence-manifest.json` binds these artifacts, excluding itself.

## Reproduction

From this worktree, use a Playwright Core module and installed Chrome paths appropriate to the host:

```sh
PLAYWRIGHT_CORE_PATH=/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/check-recording-sidebar66-recovery.mjs <fresh-output-directory>
cargo test --manifest-path src-tauri/Cargo.toml recording_window::tests -- --nocapture
pnpm typecheck
pnpm build
```

Run browser suites sequentially; the local Vite runtime can share a development websocket port. Keep native compilation serialized with independent review. All directories named `vite-cache*` remain on disk and are excluded from commits. Logs are intentionally staged explicitly despite the repository ignore rule.
