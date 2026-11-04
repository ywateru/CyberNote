# APP-001 body typography 01 — independent source review

Decision: **SOURCE-READY for the experimental CSS candidate only**, exact candidate `0d3d52776f92503b356449ae651853565b9c025f`, baseline `e44dba736e377ea7abd2969f6c9ea1a5b24b3cc4`. No product-source blocker found. Root's new native package and comparison against Apple Notes are unfinished; this decision does not establish original font size, WebKit behavior or pixel parity.

## Exact change and production scope

The only product delta is six added CSS lines. Removing their exact bytes reproduces the complete baseline CSS. Selector `.desktop.native-toolbar:not(.separate) .note-document .tiptap > p` sets ordinary top-level paragraphs to13px with explicit17.22px line-height and min-height. The latter retains the previous ordinary14×1.23 static value as a controlled variable; it is not a measured native baseline or a promise about every possible inline line box. Font family, weight, letter-spacing, padding, ancestor font rules, headings, schema, editor, App, dependencies and storage code remain unchanged.

Production `App.tsx` creates the native toolbar only when native and macNative are both true. `macNative` requires Mac platform and excludes Android/iPhone/iPad. `nativeTop` requires a non-mobile layout and nativeInfo; the root class combines desktop/native-toolbar and independently adds separate. Thus desktop alone is not treated as Mac identity. Phone and wide Android paths do not acquire the necessary native-toolbar class, and separate windows fail the explicit exclusion. NoteEditor's actual note-document wraps EditorContent; Tiptap creates the targeted paragraph children. Title heading, nested list/task/table/blockquote paragraphs, pre/codeBlock and attachment/drawing divs are outside the direct-child selector. Gallery's real expanded editor may match; gallery card preview does not acquire this editor chain. Runtime class confirmation remains open.

## Production schema and checker review

The checker imports the actual `createEditorExtensions` and Tiptap Editor, invokes the real schema validation, uses the complete baseline CSS from exact Git source and the complete candidate CSS from the worktree, and alternates them on the same document and DOM. Its fixture samples three English/Chinese body lines, an empty paragraph, nine inline marks and12 excluded nodes across four layout contexts. It records getJSON and actual browser-computed properties rather than implementing a handwritten cascade. JSON equality proves this fixture is preserved; it is not a persisted-row or input test.

The production extension factory is unchanged and shared by the real NoteEditor. It configures headings1–3, lists/tasks/tables, marks, attachment and drawing nodes; it does not add app-level font-size/font-family/line-height document attributes. Actual React media/drawing NodeViews are not mounted by this checker, and the author states that limit. Inline marks inside the targeted paragraph inherit13px; bold weight650, color/highlight/tag/link and sampled decoration fields are retained. The sample is not an exhaustive enumeration of CSS properties: fontStyle, for example, is not sampled. Source inspection shows this addition does not reset italic or other existing rules. It does not prove every mark or arbitrary document behaves identically.

The browser runs in an isolated headless process and context, using already installed tooling, loopback Vite and blocked/recorded external page requests. Its finally closes browser/server/Vite, while the independent wrapper also monitors its own process group, imposes120 seconds and a2GiB guard. It uses no platform build, GUI, ADB, shared Rust target, user browser or database. The wrapper creates only its own temporary node_modules symlink, verifies its identity before unlinking, and has removed it.

## Independent verification

One bounded offline rerun of the final exact checker passed, browser156.0.8078.80, DPR1. Its process group stopped with no remaining members, elapsed2.764 seconds, minimum free3,011,842,048 bytes. No dependency install occurred. An independent evidence inspection added145 passing assertions on exact CSS, frozen author file identities, unchanged production context, observed samples, and the recorded build result.

| Context | Ordinary paragraph after | Observed result |
| --- | --- | --- |
| Mac main1088px | 13px /17.22px | All5 top-level paragraphs targeted;9 marks inherit13px; other sampled paragraph/mark fields retain baseline values. First DOM Range width154.546875→144.71875 CSS px. |
| Phone390px | 17px /22.95px | Target selector does not match; complete sampled paragraph/mark objects and range width remain equal. |
| Wide Android1088px | 14px /17.22px | No native-toolbar class; sampled values and range width remain equal. |
| Independent900px | 14px /17.22px | separate excludes it; sampled values and range width remain equal. |

All four contexts retain12 excluded-node computed objects and sampled root/editor-scroll/date/note-document/Tiptap ancestor objects exactly. getJSON is unchanged. These are Chromium sample results, not WKWebView screenshots, actual glyph fallback/font-file identity, native caret/selection metrics or Apple comparison.

The existing frozen `pnpm build` record reports exit0 for TypeScript plus Vite, owned-group cleanup and sufficient space. Its raw log retains the large-chunk warning. All associated author log/JSON identities match. The review did not repeat this already successful frontend build or invoke any platform build.

## Non-blocking evidence metadata finding

Author `identity.json` says its evidence aggregate is path sorted. All individual file bytes/hashes match, but recorded aggregate `b08f04836fcf9bc9f96ee631109fa8c469bd0360214aaf49f9793e4a872759e0` actually follows the evidenceFiles array order. Independently sorting those same relative paths produces `8566c746e4c3ba39f6257bc2280e860972ac46f264683726587f86884e146581`. This is a reproducibility-label mismatch, not a source or browser-result mismatch. This review records both without rewriting the author's evidence. The first local inspection assertion detected this discrepancy; the final inspection explicitly verifies and reports it rather than silently accepting the stated algorithm.

## Remaining acceptance

Root must build the new Mac package and compare the same explicitly plain-text paragraphs, actual classes/computed styles, window/columns/theme/activity and native rendering against Apple Notes.13 CSS px remains an experimental point inferred from earlier width differences; it must not be restated as Apple's exact13pt.17.22px remains an isolation choice. Original font-panel values, actual fallback, WebView zoom/DPR, line advance/first glyph position, caret/wrapping, formatted content and pixel acceptance are outside this source-ready decision. No product file was modified by this review.
