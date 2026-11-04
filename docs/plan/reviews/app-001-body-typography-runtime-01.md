# APP-001 body typography runtime 01 — bounded independent review

2026-11-04. Decision: **the existing evidence supports the stated limited body-geometry observations; pixel acceptance remains open**. This report records the already completed read-only review. It does not add an image recomputation, test run, source-hash recheck, live process inspection or GUI observation. Writing was deferred while disk space was below2GiB and resumed only after root restored the space guard.

## Reviewed materials and scope

Read `docs/research/mac-body-candidate06-geometry-01/README.md`, `result.json` and `analyze.py`, the primary07 original and03 clone AX text, `corpus.json`, the recorded04 process/package identity, relevant prior geometry records and the existing small body crops. The review did not execute the analysis script or regenerate images. Existing source identities and the analysis-time unchanged assertion were read as recorded evidence, not independently recomputed in this review.

Primary pair is `07-original-blank-area-click` ↔ `03-candidate-corpus-wide`. Both focused AX Value entries contain the complete same corpus, including the empty line. The clone identity record names source `a90e55f484149be562b2aa8a6f6f298bd953c203`, then-recorded PID88780 and exact body-build03 sealed executable hash `b3c9013f48e6bbfbe466a9f0089e80b9fce9448a02074441bf3e97839c782587`. This review reads that record; it does not establish a currently running PID. The separately completed artifact independent review covers the saved package bytes.

AX text equality supports content equivalence. It does not establish the original or clone node type, selected paragraph font, actual glyph fallback, native baseline, caret position, viewport zoom or full stored document JSON. The geometry report correctly avoids those inferences.

## Method and arithmetic assessment

The script and recorded result consistently use JPEG-decoded image pixels, top-left origin and `[x0,y0,x1,y1)` boxes. Fixed row/suffix/empty-line/divider ROIs, neutral-ink thresholds120/160/200, explicit empty-ROI null and the bbox/dimension/delta formulas match the written method. Images are not registered, translated, scaled or masked to erase differences. The method measures visible neutral ink, not native font metrics; colored spellcheck/caret and JPEG antialiasing remain limitations.

The README's t160 table agrees with the saved boxes and differences:

| Observation | Supported limited conclusion |
| --- | --- |
| First three rows | Clone width differences+1/+2/+2 image pixels, identical measured heights; top offsets−4/−4/−3. |
| Alphabet row | Width difference−2, height−1 at160; threshold-sensitive height is explicitly retained. |
| Number/punctuation row | Width difference+74 at each threshold. This is a substantial remaining mixed-punctuation spacing difference, without a demonstrated cause. |
| Isolated Q/A/宽/仅 | Selected blank-column-separated initial glyph boxes agree in width/height at160; this does not prove outline, grayscale or font identity. |
| Divider-relative first-row left | Original50 versus clone49 pixels from the respective dark-band starts; dividers themselves differ2 pixels, retained without alignment. |
| Repeated Ag中文 suffix | Original top advances34/34 versus clone35/34; these are ink-top advances, not baseline or CSS line-height. |
| Empty line and following row | Empty fixed ROI has no neutral ink; following row begins at y479 in both. Third repeat to following row is68 versus69. |
| Long paragraph | Two visible lines share the reported corpus break and y513/y547 starts. Width differences−2/+1 and equal measured height are consistent with saved boxes. |

Visual inspection of the existing small body crops supports the evident punctuation spacing difference and the stated same long-paragraph break. The known85-codepoint paragraph divides into58 and27 codepoints at that manually reported break; this is a corpus/visual interpretation, not OCR or DOM layout capture. The true content-box right frame has not been established, so the report correctly limits this to the observed sample.

The first row starts4 pixels high while later text converges to equal y after the empty line. That evidence does not support shifting all body content down4 pixels: doing so would move the already aligned later rows. The report's recommendation to separate starting position, line rhythm and punctuation investigation is justified.

## Historical comparison and contamination

The old shared Chinese sentence boxes were314×26 versus290×24 and203×26 versus188×24; the new shared sentence boxes are292×24 versus290×24 and190×24 versus188×24. This supports bounded size improvement for those shared strings. Different rounds, canvas widths and the changed first-line marker prevent treating the comparison as a fully normalized controlled A/B. The old sample does not contain the new punctuation or long paragraph, so no cross-round improvement claim for those rows is supported or made.

The report preserves01 and05 first-row pointer contamination and uses07 as the clean primary original rather than masking the image. Its stated primary pointer locations are outside the body ROI. This review checked the method/report and existing small crops; it did not re-inspect full-size pointer imagery or independently reproduce image coordinates. The original JPEG identity, decoded/derived PNG distinction, color/antialiasing limits and absence of whole-window similarity acceptance remain appropriate.

## Runtime wording awaiting final README

Root separately reported new09 normal-quit/relaunch observations, followed by10 hide,11 hidden menu and12 button restoration, with complete corpus retained. Those later observations are not substituted for the07↔03 geometry pair. Root's then-current message also identified new PID89698 with the same executable hash; this report treats that as a message pending final runtime evidence linkage, not a fresh process check by this reviewer.

The runtime README was still in progress during review and retained older text saying the new candidate had not run. Root will update it to the actual sequence. The final text should distinguish the unexplained earlier package input failure from03 success, avoid attributing that success to a CSS focus fix, preserve01/05 contamination, identify09 as manual selection of the test folder after normal quit/new process, and distinguish saved10–12 observations from unsaved menu observations. A canceled accidental format overlay must not be described as a format edit. Full stored JSON, actual font identity and automatic selection restoration across exit must not be inferred from AX-visible full text or manual navigation.

No new test, image analysis, platform command, target/cache access, GUI/ADB action, user-data access, product modification or commit was performed for this review. Only this report is written after the space guard recovered. Full-window Apple pixel parity, all typography formats, mobile parity and the exact cause of the remaining punctuation/start-position differences remain open.

## Final runtime README wording review

Root subsequently completed the [runtime README](../../verification/mac-body-typography-runtime-01/README.md). This final section supersedes the pending-README status above while preserving the earlier review history. Read-only inspection of the updated README and corresponding03/07/08/09–14 records found its limited wording appropriate; no new test, screenshot analysis or live action was performed.

- [03 candidate AX](../../verification/mac-body-typography-runtime-01/03-candidate-corpus-wide.ax.txt) and [07 original AX](../../verification/mac-body-typography-runtime-01/07-original-blank-area-click.ax.txt) contain the full corpus in their focused body values. The README preserves the unexplained earlier package input failure and does not attribute03 success to a CSS focus repair. It retains01/05 pointer contamination and the07 primary-pair decision.
- [08 quit record](../../verification/mac-body-typography-runtime-01/08-normal-quit.json) stores PID88780, exit1 and empty stdout/stderr. The JSON does not itself contain the ps argv or CmdQ action; the command/action semantics come from root's explicit contemporaneous observation and README narrative. It should not be presented as a standalone raw record proving the whole exit sequence.
- [14 relaunch identity](../../verification/mac-body-typography-runtime-01/14-relaunch-process.json) records psExit0, new PID89698, the exact body-build03 executable path, sourcea90e55f and the same16,013,344-byte/b3c9013f… identity. This review read the record without rerunning ps or hashing the binary. [09 relaunch AX](../../verification/mac-body-typography-runtime-01/09-relaunch-corpus.ax.txt) shows the complete corpus, including its empty line, after root's manual folder selection; its focused element is HTML content, so it is not claimed to prove body focus. The README correctly limits the observation to visible full-text persistence across the reported normal-exit/relaunch sequence, excluding automatic selection restoration, complete stored JSON and save-ACK tracing.
- [10 hidden AX](../../verification/mac-body-typography-runtime-01/10-relaunch-sidebar-hidden.ax.txt) omits the folder column while retaining the direct toggle and complete body. [11 menu AX](../../verification/mac-body-typography-runtime-01/11-relaunch-hidden-menu.ax.txt) explicitly reads “显示文件夹”. [12 restored AX](../../verification/mac-body-typography-runtime-01/12-relaunch-sidebar-restored.ax.txt) again includes the folder column and complete body, and [13 menu AX](../../verification/mac-body-typography-runtime-01/13-relaunch-visible-menu.ax.txt) explicitly reads “隐藏文件夹”. These support this finite hide/button-restore/menu-label sequence; they do not independently replay the clicks or establish every window mode.
- The README distinguishes root's canceled accidental format overlay from a format edit and keeps the earlier package input issue unexplained. No selection, font-property or document-format identity is inferred from that cancellation or from textual equality.

The final README preserves the measured punctuation/start-position residuals and excludes font identity, lossless capture, full-window pixel acceptance, complete sidebar/window coverage and mobile parity. The independent conclusion remains supported limited geometry/runtime observations, with overall pixel parity open. This final section changes only this review report; root will seal/commit the documentation.
