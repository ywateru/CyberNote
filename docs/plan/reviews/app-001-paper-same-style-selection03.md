# APP-001 same-style paper selection03 — independent review

2026-11-04. Reviewer: verify_app, different from App author. **SOURCE-READY for the exact two-seam App candidate**, with the prior rounded CSS review retained. Independent mounted-App tests reproduce both old first-selection failures and pass the candidate's no-op, changed-style, pending-save and close-handler paths. Production closure/security checks and an independent frontend build also pass. No Android/native runtime, physical Back, Rust persistence or original-UI pixel acceptance is implied.

## Exact source and implementation

Reviewed [task](../tasks/app-001-paper-same-style-selection03.md), author [evidence](../../verification/app-001-paper-same-style-selection03/README.md), full verification scripts, result/trace records and failures; independently read production create/paper handlers, hydrate, closePaper/bookmark tracking, clearSensitive/access handling, bridge and AccessGate.

The candidate App SHA256 is **`6eff8e958057e79fa9968a5e89e936197a78567b1e1e58c101e2e99f74671fd4`**. Baseline `26d517fa4266923974105879063f49d744f72f4a` App SHA256 is `99a6df4a9e06998f85122810a61359d251110fe73022e0372fec9ef87a8c0d5e`. Fixed CSS is `d7facf680ee801c348fd2ed0619213e0fc916d276f8fb3ddef1a78d11acf44d7`, already independently reviewed in [rounded-selection03](app-001-paper-rounded-selection03.md). Exact full-App comparison verifies only these two changes:

- At `createNote`, use returned `n.access` when present; otherwise await the existing `loadWorkspace()` and take its accepted access before putting the created note into React state.
- At the actual paper option handler, if `current?.paperStyle === p`, call existing `closePaper()` and return before the metadata patch.

All other App bytes remain the baseline: hydrate, authorization/clearSensitive, revisions, pending Maps, queue/flush/save/ACK, externalVersions, host key expression, bookmark mapping and closePaper are unchanged. No no-op path clears a queue, confirms a pending document, synthesizes access, changes revision or force-writes editor contents. The changed-style path still calls the original patch/flush/action/refresh chain.

The create fallback is needed for this **browser preview response shape**: preview create returns Note without access; the old App adopts the new note while retaining workspace access with no entry for its ID. Its first metadata refresh sees `undefined → epoch 0`, correctly invokes existing sensitive cleanup and remounts the editor. Avoiding the same-style patch alone would leave first-change-to-grid failing. The second seam supplies the missing accepted access at creation rather than weakening hydrate's missing-old-entry cleanup.

The actual `bridge.loadWorkspace` stamps AccessGate, obtains a preview snapshot and calls `accessGate.accept` before returning it. Native `action` routes its response through `accept`, which throws if backend access is missing. A valid native create already contains access and therefore takes the unchanged direct branch, with no fallback read. The App does not handcraft an authorization state. Controlled stale-access tests below exercise the real AccessGate and extracted production closure, rather than claiming a native race has occurred.

The no-op close uses the existing paper target/bookmark and `restoreEditor`; the latter retains the owner/block checks of the editor gate. Existing clearSensitive destroys affected editors, clears paperTarget and closes the modal; note-switch and transaction bookmark effects remain intact. Source review establishes no new authorization bypass in this bounded no-write close.

## Independent actual App execution

All author 38 non-manifest files match their recorded bytes/SHA256 and the file set is exact. Independently froze 209 audited production/input files, plus the two actual imported plugin guest entries and the existing rich-document fixture in an owned temporary directory. This bounded list is not a package freeze. Exact full-App two-seam replacement is independently checked, not inferred from the patch file alone. Both baseline and candidate runs use this fixed directory and the same reviewed CSS; only the chosen App text differs.

The author production-App runner is reused after one statement adaptation: baseline App text is read from a frozen file instead of `git show` inside the non-Git fixture. The pending runner is byte-identical. Identity runner changes only its output directory. `source-identity.json` preserves every exact original/adapted hash and replacement. All original instrumentation sites remain unique. Probes observe actual state and trace events; only the pending runner controls transport timing. No fake Editor/component replaces the production React App, Tiptap or preview bridge.

The independent runs are saved under [same-style-selection-independent03](../../verification/app-001-paper-same-style-selection-independent03/README.md):

| Check | Actual independent result |
| --- | --- |
| Baseline actual-App observation | Exit 0 in 20.46 s means observations were saved, **not that baseline behavior passed**. First-current-plain and first-change-grid both preserve document but lose actual key, Editor/View/DOM, selection and history. Trace shows pending empty and document equal during refresh, followed by clearSensitive. |
| Candidate actual App | Exit 0 in 22.07 s; eight selections and eight close paths pass. Real identities, parent keys, entire document, selection and history remain. |
| Pending actual App | Exit 0 in 10.10 s; plain and grid-large both close while the existing body save remains waiting, with full state unchanged, then confirm correctly and pass real undo/redo. |
| Production identity/hydrate/access cases | 30/30, exit 0 in 0.69 s. Extracts actual current closures and host-key expression; uses real PM schema/state/history and AccessGate with controlled environment. |
| Existing production save/close security cases | 21/21, exit 0 in 2.07 s. Executes current production closures, SaveQueue, bridge and authority implementations with controlled platform I/O. |
| Independent `pnpm build` | Exit 0 in 6.28 s, in the owned fixture after browser runs completed. Existing chunk-size warning retained. |

The actual browser is **Chrome 156.0.8078.80**. Each App run has a fresh isolated browser context and synthetic data. External requests are blocked; successful records have no external requests or page errors. Parent keys are obtained through actual React ancestry; identity compares captured actual Editor/View/root-DOM references. Full JSON/selection/history is saved, not merely title text or screenshots.

Candidate action-count sequences are exactly **0 / 0 / 1 / 0 / 1** for `plain → plain → grid-large → grid-large → plain`, and **1 / 0 / 1** for `grid-large → grid-large → plain`. Every zero-action step retains the complete persisted note snapshot, including its revision. Every changed-style step persists the requested style via the existing action path. No clearSensitive trace appears in these candidate choices.

Each of cancel, Escape, backdrop-handler and original Back-handler closes with complete before/after state equality in both scenarios. The Back entry invokes `androidBack.current()` exposed read-only by a probe and therefore executes the existing paper branch and closePaper. It is a handler test; it is not hardware/system input. Escape is browser keyboard input, and backdrop uses a dispatched DOM click.

## Pending body, ACK and safety boundaries

In both pending cases, the live editor document differs from persisted preview text, the actual pending Map contains one full document, and the original save path is waiting. Clicking the current paper option closes before release; the entire captured state is equal: pending/failure Maps, stored note/revision, recorded queue request, selection/bookmark, full document, history, keys and actual references. The editor is editable and unfocused after close. Releasing the waiting action empties pending, leaves failures empty, stores exactly that document, increases revision by one for the body save, and preserves identity/selection/history. Real undo changes the document and redo restores it; the queue then drains normally.

Precisely, the pending harness waits **at the transport entry before original preview action persistence executes**, not after a durable write with only its response lost. It faithfully keeps the real App save queue/request unresolved and the backend preview document old. It supports this pending no-op contract, without claiming all IPC/ACK failure timings or a native durable-ACK-loss test. No pending Map is directly changed by the probe.

The independent 30 production-closure cases retain strict rich JSON comparison, real schema/PM bookmark/history, external document changes advancing the production host key, process/session and per-note epoch cleanup, unauthorized snapshots refusing pending-body revival, and missing-old-authorization cleanup. A pending external refresh retains its own document and original expected revision; it does not adopt an external revision as confirmation.

Native-shaped create responses cause zero fallback loads. Preview-shaped create receives accepted access from a controlled trusted load and its first metadata refresh preserves the key. A controlled fallback whose response becomes stale against a new AccessGate session fails with `access_changed`, selects no created note and leaves the latest workspace object intact. These are extracted production-closure/real-gate contract results; the fixture's action/load response timing is controlled. The native response and preview fallback are also checked against actual bridge source and mounted preview behavior above. No Rust command or native event delivery is executed.

The 21 reused save/security checks cover pending ACK, failed-save retry, close blocking and invalidation using the original production algorithms. Their `nativeEntry` fixtures replace platform I/O and do not launch a native application. These limited checks support unchanged safety boundaries; they do not certify every authorization/window/recording flow.

## Facilities, preservation and required next verification

The author preserves original/adapted01 identity runner dependency-resolution failures and adapted02's missing `documentText` test binding, then fixes only owned test facilities. They are facility failures rather than product assertions passing. The final adapter's current-schema dependencies, SearchEditorHost extraction and actual-create closure bindings are appropriate. One inherited comment still calls the older issue “installed-app failure”; the evidence establishes a browser-preview response mismatch. This review follows the actual source/trace and explicit README boundary, not that inaccurate comment.

The independent result-summary script initially used Python's reserved word `pass` as a keyword argument and stopped at compilation before assertions. Its failed script and preparation record are retained separately; the corrected verifier executes successfully and writes `analysis.json`. This is a reviewer preparation error, not an App failure. Command JSON/stdout/stderr and all actual run results are retained without overwriting failed evidence. Disk space stays above 2 GiB. Closing identity rechecks fixed inputs and exact candidate App/CSS, then removes the fixture's dependency symlink. No product, original evidence, shared build output/cache, GUI, ADB, platform package, dependency, stage or commit is touched by the reviewer.

No blocking defect was established for this exact source candidate. Next verification is the **combined exact App+CSS source package**: retained-data Android upgrade; first selection of current paper, first different-style selection, continued input and normal save/reopen; actual system Back/keyboard behavior; plain save/reopen corner inspection and restoration to the prior grid-large style. Browser success does not establish the Android square-to-rounded repair, native input/persistence or full Apple UI equality. Those remain separate acceptance work.
