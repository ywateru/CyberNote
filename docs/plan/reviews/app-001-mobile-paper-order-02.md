# APP-001 mobile paper order 02 — independent source/render review

2026-11-04. Decision: **SOURCE-READY for the mobile paper-option order only**, at exact commit `8463ed896847f891fd4fd5579affb253a11d681b`, parent `a6b629479deddff18a84214b4420d8c1272b0aae`. The actual rendered row order now matches the saved86-second reference. The first already-selected-plain choice still resets the Chrome-preview selection from3..8 to1..1; this review independently reproduces and preserves that open failure. It does not certify every close/selection path, Android behavior or pixel parity.

## Exact scope and reference

Independently resolved the requested short SHA to40 characters and inspected the complete product diff. Across `src`, `assets`, `package.json` and `pnpm-lock.yaml`, only `src/App.tsx` differs from the parent. Removing the old/new `mobilePaperOptions` block makes all remaining App bytes equal. The change moves `grid-small` and `grid-medium` after the three lines options, yielding `plain, lines-small, lines-medium, lines-large, grid-small, grid-medium, grid-large`. Exact-commit CSS is unchanged. No desktop array, style ID, label, React key, handler, Editor, persistence code, preview SVG, geometry or platform setting changes in this commit.

App candidate SHA256 is `99a6df4a9e06998f85122810a61359d251110fe73022e0372fec9ef87a8c0d5e`; exact CSS SHA256 is `75227796447c2f1404d5bb6e11f5c4663d53035d6cd343c288d92f6302f18bf7`. Root's ongoing CSS research is a separate working-tree activity. This check explicitly loads both App and complete CSS from the reviewed commit, so a later main-tree style edit cannot silently become part of this candidate result.

Read the task, `docs/ui/android.md`, author evidence/code/failures and existing current06 capture. Independently viewed saved `references/mobile/frames-2s/frame-044.png`: blank occupies the first row, then dense/medium lines, sparse lines/dense grid, medium/sparse grid. This matches the new mobile array when CSS places blank across two grid columns. The saved reference is224×480 with unknown source DPR and compression; this review confirms ordering, not recovered device dimensions or exact typography/color.

The currently installed06 PNG from the earlier authorized capture still shows the old left-lines/right-grids layout. This source review does not modify or replace that evidence and does not claim the installed APK has changed.

## Real production rendering

New independent evidence is in [app-001-mobile-paper-order-independent-02](../../verification/app-001-mobile-paper-order-independent-02/README.md). The independent fixture derives from the author's actual-App checker, rather than testing a copy of the option array. It renders production React App, Editor, imported preview bridge, SVG assets and complete CSS through local Vite into one isolated headless Chrome context. It uses synthetic localStorage only, blocks external requests and does not operate the user's browser session, GUI, ADB, native packages, databases or shared target.

The fixture adaptation is narrow and recorded: pin App and CSS to the exact candidate commit, keep reference-order/actual-CSS-row assertions enabled despite specifying a sourceRef, add the CSS hash and remove only the newly owned temporary Vite cache on completion. The48 current production input files checked against commit blobs match except that independently allowed root style edits may differ; the test reads the pinned CSS. No dependencies were installed/upgraded, and no product file was written.

One independent run completed12 steps, exit0 in5.942seconds with Chrome156.0.8078.80, empty stderr, no page errors and no external requests. At390×844, the actual DOM buttons have the correct seven aria labels/data-style associations. Measured CSS row tops are162.765625,312.484375,462.203125 and611.921875; card slots are128.828125×104.453125 CSS pixels. Actual row grouping is:

```text
plain
lines-small    lines-medium
lines-large    grid-small
grid-medium    grid-large
```

These are browser CSS measurements, not Android screenshot pixels or pixel acceptance. The desktop1088×800 real-App branch retains its original seven IDs/labels and has no mobile preview spans. The original and candidate slots are also identical in the author's saved old/new DOM records; moving option IDs to different slots is the intended behavior. The new independent run does not repeat all baseline runs.

## Selection, saving and closing boundaries

Source review confirms that `paperOptions` is chosen from mobile/desktop arrays and directly mapped to buttons whose stable ID supplies key, label, data-style, class, preview URL and `patchNote.paperStyle`. Selection uses `await patch(...)` then `closePaper()`. Opening captures the current editor/bookmark/editable state, synchronously blurs/freezes the editor and hides the keyboard bridge; closing restores the recorded editor and conditionally resolves its bookmark, then leaves keyboard/editing off. None of those paths changes in this commit. Reading that source is not proof that every native timing path succeeds.

The actual-App browser exercise covers seven distinct choices. Each writes the corresponding `paperStyle` in the browser-preview store, retains the exact document JSON, restores editability, remains blurred and reopens with exactly that option selected. Cancel after each reopen preserves its then-current stored style/document/selection snapshot. Initial cancel also preserves its before-open snapshot. This is the preview bridge's storage, not Rust/SQLite/Android persistence or process-restart survival.

**The first click on already-selected plain fails selection preservation:** before `{anchor:3,head:8}`, after `{anchor:1,head:1}`. This is present in the new independent result as `selectionPreserved:false`. The other six tested choices retain3..8. Author baseline and candidate behavior records show the same first-plain failure, supporting no observed order-change regression in that controlled sample, while leaving the failure unresolved. The independent run uses explicit observation mode so it can retain all seven results; its overall `pass:true` means the order and bounded state assertions completed. It must not be summarized as all-selection-pass or a closePaper fix.

Escape and the production backdrop handler preserve the saved snapshots in this test after the final style. Backdrop is exercised through DOM-dispatched click, not a native pointer gesture. It does not establish Android Back, IME behavior, a non-collapsed selection for every cancel/close method, note-switch target invalidation, Editor-host identity, real touch, short-screen scrolling or all selected-style combinations. Those remain separate runtime requirements; a new APK must be built/identified/upgraded and actually opened before the installed-order defect is closed.

## Author evidence and retained failures

Independently verified all15 author manifest-listed files' current sizes/SHA256 against the manifest, and linked the product hash to the exact reviewed App. The saved `pnpm build` result is exit0,5.885seconds, with the expected bundle-size warning retained. This review reads that build evidence and does not rerun a platform build or redundantly rebuild the unchanged TypeScript change after the successful real render.

The author preserved the actual baseline wrong-order failure, local-listen permission startup failure, asynchronous-blur fixture issue, overly broad data-style locator failure, strict3..8→1..1 failures and candidate-behavior01 WebSocket error. The final fixture fixes only the fixture issues and reports the selection risk separately. Final serial candidate-behavior02 has no page/external-request errors. None of the failed records is deleted or rewritten. The reviewer does not reinterpret the raw strict selection failures as a successful assertion merely because the later observation-mode run completed.

New independent source audit, exact checker adaptation, command/environment, full result and sealing records are preserved in the new directory. Free space remained above2GiB (run start77,599,457,280bytes; end77,596,700,672bytes). Only this report and that owned evidence directory are staged. No GUI/ADB/native verification, target/cache inspection, platform build, source mutation or commit was performed by this review.

The reviewed order-only source is ready for root's controlled integration/build decision. Installed Android order, data-preserving upgrade, cancel/current-style preservation on that accurate package and the separate selection failure still require their own evidence; complete Apple pixel parity remains open.
