# APP-001 native metrics 02 — independent read-only review

2026-11-04. Decision: **the saved evidence supports a bounded native-font/context diagnostic; it does not select a product CSS change or establish Apple Notes screen typography**. The author README preserves these limits. No blocking defect was found for using the recorded attempt03 as a diagnostic lead. Pixel acceptance remains open.

## Scope and identities

Read [measure.m](../../research/mac-body-native-metrics-02/measure.m), [result-attempt03.json](../../research/mac-body-native-metrics-02/result-attempt03.json), all three attempt manifests, the saved compile/run logs, both input corpora and the author [README](../../research/mac-body-native-metrics-02/README.md). Inspection was limited to existing code, JSON and logs. A read-only Python invocation parsed saved JSON, printed selected fields, compared already saved feature-line structures and hashed the listed source/input/report files. It did not execute the diagnostic, recompile, recompute screenshot geometry, inspect native processes or call GUI/ADB/platform tools. No target/cache or temporary diagnostic binary was opened. Only this review report is written; no commit is made.

The final source is 16,273 bytes, SHA256 `586f35a1e6d770bf9aa75f6ecf261ad0f2f7cc37979d4809c2bed49444ec9dc9`, matching attempt03. The two input file hashes match attempt03's recorded input identities: original body corpus `bb1ea53fc968f97ce5b17ac7566bf6afc7633927427ad9074864a9f83bd56e19`; punctuation-context corpus `572d1d4ef54bf19089c9c9515cc6d222137d0c973303765231ce7f5e51b33e17`. The saved result is 114,674 bytes, SHA256 `7bc27e201d12c1ddfa8e14dd65c5f44e4805c073aafd92d78b746afc33994e1f`. Result metadata reports macOS26.4 build25E246, explicit `zh-Hans` and native-point units.

The reviewed author README is 5,796 bytes, SHA256 `bb3195d85ec38ecbb6d9f1ae37facb8251b810f10c922fd454bfa1b1eb9c0a30`. Its six-decimal mixed-row table values differ from exact JSON by about 0.000003pt; this is immaterial to the diagnostic. Exact values are used below.

Attempt01 records compile exit1 and preserves the real `Rect`/`Point` SDK-name collisions. Attempt02 and03 record compile/run exit0; their saved stdout sizes agree with their result-file sizes. Current source hash verifies attempt03 only: earlier source versions and temporary binaries were not independently retrieved, compiled or hashed by this reviewer. Binary hashes, elapsed times, environment/TMPDIR handling and historical free-space values are recorded author evidence, not replayed observations. Current read-only space inspection showed 35,883,592KiB available, above the 2GiB guard.

## Requested font versus actual run font

The source gives `CTLineCreateWithAttributedString` an attributed complete line, then reads the actual font from each `CTRunGetAttributes` dictionary. It does not infer actual fallback from the requested family string. `requestedFontId`, run `fontId`, UTF-16 ranges, glyph IDs/positions/advances and the inventory are separately preserved. This is the right distinction for the stated question.

The system13 request has base `.SFNS-Regular`, while its CJK/punctuation runs have actual `.PingFangUITextSC-Regular`; the mixed row also includes `.CJKSymbolsFallbackSC-Regular` for its two square brackets. The ordinary control returns `PingFangSC-Regular` and uses that font for the whole mixed line. The UI and ordinary records both report the Reserved `PingFangUI.ttc` URL, but differ in PostScript/family names, metrics and the measured punctuation glyph IDs. A common resource URL does not make these run fonts equivalent. These are actual fonts of this controlled CLI's CTLine, not an inspection of Notes or the current WebKit run fonts.

Both direct `.PingFangUITextSC-Regular` name requests, at13 and nominal12, are stored under `failures` as `NSFont fontWithName returned nil; no replacement requested`. The code continues without adding them to measurements. The run log's CoreText warning mentions a possible Times substitution, but there is no resulting Times measurement in the JSON: there are exactly two successful controls, system13 and ordinary13. The failure does not show that UI fallback is unavailable; it occurs in a successful system13 run. Nor does the fallback name establish that the directly requested12pt export control was measured.

The PDF export resource/name and nominal12 matrix are appropriately treated only as reasons to attempt a control. Neither this code nor the saved result establishes original screen font size, screen font-file identity, WebKit CSS resolution, variable-font axes or a conversion between PDF points, native points and JPEG pixels.

## Context evidence and feature-control limits

The exact saved CTLine typographic advances support the author's context contrast:

| Saved text | system13 pt | ordinary13 pt | ordinary−system pt |
| --- | ---: | ---: | ---: |
| Existing mixed punctuation row | 239.942802614 | 277.040459351 | 37.097656737 |
| `，。！？；：《》` | 66.391050584 | 104 | 37.608949416 |
| `中，中。中！中？中；中：中《中》中` | 217.021595331 | 221 | 3.978404669 |

Each isolated system13 punctuation has advance6.575875486pt. The adjacent sequence retains the corresponding UI glyph IDs but advances vary approximately6.576–12.570pt; the Han-separated sequence changes advances again, including adjustments near the book-title brackets. The ordinary control gives each measured Han/punctuation glyph13pt in these contexts and uses different punctuation glyph IDs. This supports a font/context distinction. It does not identify the mechanism as a particular OpenType feature, or prove that a native37.608949pt difference is the cause of a screen74-pixel width residual. Typographic advances, glyph-path bounds and thresholded raster ink boxes measure different quantities.

The code requests `palt=1`, `chws=1`, `halt=1` through a copy descriptor and records the request separately from `CTFontCopyFeatureSettings`. For both successful controls, the returned candidate IDs collapse to the same recorded base IDs with `actualFeatureSettings:null`; all saved line dictionaries, including the detailed mixed-row glyph records, equal the corresponding default dictionaries. No effective feature change has therefore been demonstrated for these controls.

The safe conclusion is **unverified feature application with no observed saved-output change**. Null settings and identical output cannot establish universal lack of font support, which feature produced the default UI behavior, whether a fallback inherited an intended setting, or how WebKit/CSS would apply it. The README correctly avoids those claims. This experiment cannot justify choosing or excluding `font-feature-settings`, `font-kerning` or a particular font stack in product code. The context CTLine calls use the base font only, so the JSON also does not contain a feature-by-context matrix for the new punctuation corpus.

## TextKit defaults, actual fragments and screen limits

`MeasureLayout` constructs NSTextStorage/NSLayoutManager/NSTextContainer without a view or application, uses a10,000pt-wide container and explicitly removes the initial5pt fragment padding. It preserves explicit newlines and the empty paragraph. The source actually enumerates laid-out fragments and first-glyph locations after ensuring layout, in addition to saving the default font-height queries. These are useful separate records.

Both saved corpora have11 fragments in each control. Natural system13 fragments are16pt high at y0,16,…,160; ordinary13 fragments are18pt high at y0,18,…,180. Natural visible-text first baselines start at13 and14pt respectively. Turning font leading off leaves the saved fragment and baseline records unchanged for these inputs; all four recorded fonts have zero leading. That is a finite observation, not a rule for all fonts or richer content.

For both fonts, the explicit minimum/maximum17.22 control produces actual17.22pt fragments at y0,17.22,…,172.2. Crucially, `defaultLineHeightForFontPt` remains16/18 and `defaultBaselineOffsetForFontPt` remains13/14: those default queries do not become the actual fixed fragment height/baseline. Actual first visible baselines in that fixed layout instead begin14.22/13.22pt. The JSON itself demonstrates why font-default metrics and laid-out fragment geometry must not be substituted for each other.

The empty paragraph's stored first-glyph location is a control-character/layout record. Its computed `firstGlyphBaselineYPt` lands at the following fragment origin in these results, unlike visible rows. The README explicitly prevents interpreting that number as visible ink. The full long paragraph remains one native fragment because of the large container; this is not a reproduction of screen wrapping. A newline-containing native attributed string also does not reproduce the production editor's multiple DOM paragraphs, CSS boxes or keyboard/caret behavior.

The actual screen's repeated ink-top advance of34 pixels is not native baseline evidence and does not select17pt,16pt,18pt or17.22pt from this experiment. The author correctly avoids that conversion. Fixed17.22 is an imposed diagnostic control, not a measured Notes default or a validation of existing product CSS.

## Bounded code risks and next step

Two nonblocking limitations matter if this diagnostic is reused. `FontID` deduplicates the recorded name/size/metrics/URL/feature fields, without variation axes, font matrix, complete descriptor or file bytes; its IDs identify these recorded properties and are not exhaustive font fingerprints. Also, `contextLines[1]`/`[2]` and detailed `i==4` selection rely on the frozen corpora: the code validates only that each `text` is a string. The supplied valid corpora satisfy those assumptions, but a shorter/reordered future corpus could fail or silently select the wrong detail row. Neither issue invalidates this fixed saved result; no rerun or product patch is needed for this review.

The supported next step is the already scoped WebKit comparison of the exact existing stack, `-apple-system`/`system-ui` and a separately bounded kerning control, using the same punctuation contexts and retaining actual rendered text/layout evidence. It should establish what that engine actually resolves and whether the context-dependent width contrast survives before selecting a product change. The newly recorded original/clone context pair can independently measure screen widths and row rhythm; this review does not inspect or pre-approve its geometry analysis. Any candidate must preserve the existing Latin/Han sizes, blank paragraph, later-row positions and long-paragraph wrapping before new pixel claims are made.

The author README's conclusions are supported at this diagnostic scope. No product source, existing evidence, screenshot, platform artifact or user data was changed. Apple Notes screen implementation/font identity, cause of the remaining punctuation discrepancy, full-window pixel parity and desktop/mobile acceptance remain unproved.
