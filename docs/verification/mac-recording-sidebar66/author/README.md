# Mac recording sidebar 66 — author evidence

Product source: `11c73a914deb6bb955fe88ec54ab70f8a5566a60`.
Base: `989f23e5` (accurate task65 implementation plus independent review).
Isolated tree: `/private/tmp/apple-notes-mac-recording-sidebar66-01`.
2026-11-05. No real microphone, existing application, Mac18 audio, simulator, mobile device, signing, TCC, application identifier, database schema, or attachment journal migration was changed or used.

## Product result

- App owns one desktop recording ticket per actual document window. Its stable sibling sidebar directly mounts DesktopRecordingPanel/Session and keeps the original A Editor/bookmark while navigating, searching, parking A, or editing B. Desktop does not set the mobile `record` modal gate.
- The active renderer no longer creates a recording child or loads RecordingWindow. No active transport/relay/presentation menu is used. Historical modules and old registry tests remain as inactive source references; old child commands are absent from the production invoke handlers, and dedicated child capabilities are removed. Existing main/note microphone preflight remains; document show/set-focus permission remains, and hide is removed.
- Pause persists complete cumulative immutable WAV revisions through the actual App validator, real Host commit wait, RecordingRevisions, AttachmentSubmission, actual Editor transaction, SaveQueue, document ACK, and authoritative committed query. Final completion and native cleanup are separate boundaries.
- Desktop close returns the actual shared promise. Busy close queues behind the checkpoint. Failed final or cleanup retains the sidebar. Final ACK plus cleanup failure retries cleanup only. An exact native terminal receipt recovers a lost cleanup response; an old identity cannot clear a successor session.
- Escape is handled only in the sidebar event subtree. Main window close seals new document/native admission synchronously, awaits final/cleanup and flush, then destroys. Failure restores legally allowed editing. Quit first seals every native document participant, then releases the ready phase for final/flush and exact participant ACK. Participant destruction after ACK and expired Quit identities cancel instead of inheriting a label.

## Final verification

- `app-final/result.json`, `app-final.log`: 42 unique controlled integration assertions using the mounted production App, Host, Editor, Gate, SaveQueue, direct DesktopPanel, DesktopSession, real Chrome MediaRecorder, actual AudioContext decoding, and a synthetic oscillator stream. Native IPC/permission and backend responses are controlled. Includes 440/880 Hz complete cumulative WAV decoding, A/B editing and focus, duplicate entry, search/parking stability, busy close button and reentrant promise, scoped Escape, store/save/query/decode/native revision failures and retained immutable File, lost revision/release response, real Editor delete/Undo/duplicate-card refusal, original owner/access changes during the Host wait, main close success/failure, and Quit seal/ready/cancel/stale identity.
- `native-final.log`: full production Cargo suite, **103 passed, 3 ignored**. Recording-window module has 11 passing tests, including five new grouped local-registry/quit boundary tests. Tests exercise exact production core helpers; they do not operate a real application process or claim actual OS close/quit verification.
- `mobile-final/result.json`, `mobile-final.log`: existing actual mounted mobile App/Host/Editor recording suite, **17 groups passed**. The mobile recorder/session source is unchanged. This is browser regression evidence, not a device run.
- `session/session.json`, `session-regression-final.log`: existing desktop Session/PCM and historical owner/relay regression suite, eight groups passed. Historical relay tests are not evidence of an active relay path in66.
- `typecheck-final.log`, `build-final.log`: passed. Existing frontend chunk-size advisory remains. Native dead-code warnings refer to inactive historical child helpers.
- `source-manifest.json` binds exact changed product files, preserved mobile/session source, and runners to SHA-256 values. `evidence-manifest.json` lists retained outputs and hashes. Cache files remain on disk and are intentionally excluded from the evidence commit.

## Attempts and retained failures

- `native-initial.log`: first compile rejected four missing MutexGuard dereferences. Fixed before the passing native runs.
- `native-run1.log`: 11 recording registry tests passed before final receipt/permission/comment refinements. `native-full.log` and `native-final.log` retain full-suite subsequent runs.
- `app-initial.log`: local listen was denied in the restricted environment, before test execution. Retried with authorized local-server access.
- `app-run1.log`: found handle object replacement on App rerender; changed the actual handle to a stable ref. The original runner wrote a fixed `app/failure.json`; its run1 snapshot was overwritten by run2 before separate preservation. The run1 raw log remains.
- `app-run2.log` and `app/failure-run2.json`: the test expected one failed document request to reject close, but the real ACK path retries it. Corrected the fault to persist until explicit retry. The failed snapshot was renamed without editing.
- `app-run3.log` and `app/result-run3.json`: 33 passing assertions before expansion.
- `app-run4.log` and `app/failure-run4.json`: the test inspected an ArrayBuffer transferred to decodeAudioData. Corrected the test to decode a copy.
- `app-run5.log` and `app/failure-run5.json`: the expanded runner listed revision-loss but omitted setting its injection flag. The expected rejection timed out. Added the actual mutation-before-response-loss injection.
- `app-run6.log` and `app/result-run6.json`: 43 passing entries, including the same busy-button check twice. The final runner removes the duplicate and produces 42 unique assertions in a fresh `app-final` directory. Product source did not change between run6 and final.
- `mobile-regression.log` and `mobile/failure.json`: all functional groups ran, but concurrent author App/mobile Vite servers collided on the development WebSocket port and failed the runner's page-error assertion. The isolated sequential run in `mobile-final` passed all17 groups. Initial records are retained.
- `session-regression.log`: first invocation used the legacy default output directory. Its source/result were unchanged and the Git diff showed no historical evidence changes. Re-ran with the explicit66 output directory; all final evidence is under this directory.

## Reproduce

Set `PLAYWRIGHT_CORE_PATH=/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs` and `CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

Run these browser checks sequentially, with separate fresh output directories:

```
node scripts/check-recording-sidebar66-app.mjs <fresh-output-directory>
node scripts/check-mobile-recording-save57.mjs <fresh-output-directory>
node scripts/check-recording-autosave64-session.mjs <fresh-output-directory>
pnpm typecheck
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
```

The author runner only replaces native IPC/hardware sources and inserts observation/access taps in App/Host commit checks. It does not replace the production React commit hook, original-A validator, Editor, SaveQueue, RecordingRevisions, DesktopPanel, DesktopSession, or PCM. Document/journal IPC is an in-memory controlled backend; full native integration through an actual Tauri WebView and actual OS lifecycle remains for independent review/packaging/runtime acceptance.

This evidence does not establish microphone behavior, real UI pixel parity, a new signed Mac package, real red-close/CmdW/CmdQ interaction, or mobile device acceptance. Those remain separate root-owned validation steps. Existing Mac18/phone unsaved real audio was preserved.
