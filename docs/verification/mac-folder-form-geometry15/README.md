# Mac ordinary new-folder geometry 15

SOURCE-READY / STOP for independent review. Author baseline: `e482dac285a1e2b66f88bac035824b7c98e832a7`. Only `src/SmartFolderForm.tsx` and `src/smart-folders.css` changed. No formal platform build, shared target/cache operation, download, device/GUI/database/original Notes operation, stage or commit occurred. The user’s paused original-Notes deletion experiments remain untouched.

## Layout-unit evidence before editing

The fixed geometry14 research and its 09/26 sources are the sole original-image measurement reference. The raw target values are screenshot pixels, not assumed CSS or native points. Before editing, the controlled nonpersistent WKWebView rendered the complete baseline production CSS and matching ordinary form DOM. Its actual viewport was1088×660, devicePixelRatio2, snapshot2176×1320, with no attached/visible window and an inactive application. It measured panel680×191 CSS, exactly producing the1360×382 runtime09 crop; independently,80×25 buttons and8 gap map to160×50 and16 screenshot pixels. The source Tauri configuration is1088×660, also matching the runtime09 full capture2176×1320. See `baseline-native.html`, `.json`, `.png`, `baseline-metrics.js`, baseline source copies and `inputs-before.json`.

This establishes the clone’s factor2 mapping in this capture/rendering environment before converting the target. It does not assert the original application’s internal point geometry or a general scale for other captures. The intended clone output800×414 therefore uses400×207 CSS units.

## Implementation and final layout

The real state condition `!mobile && !folder && !draft.smart` opts into `smart-ordinary`. Smart creation, smart definition editing, mobile creation/filter panels and the saved/synchronizing section never opt in. Toggling the existing checkbox updates this class from the actual draft state. No event handler, query, persistence, save/cancel path or Rust/native code changed.

```text
Ordinary Mac creation                    Checked smart creation
+--------------------------+            +------------------------------------+
| 新建文件夹               |            | existing smart form                |
| 名称 [_________________] |     --->   | existing rules/width/controls      |
| [ ] 制作智能文件夹       |     <---   |                                    |
|     使用标签和其他…      |            |                                    |
| ------------------------ |            |                                    |
|             [取消] [好] |            |                        [取消] [好] |
+--------------------------+            +------------------------------------+
```

The compact layout is a natural document flow:400 width,19 padding plus the existing1 border,13/16 title,24-high name input with the scoped2px focus outline,16 checkbox, explicit16 label line-height, and a footer separator with16.5 top padding. There is no fixed ordinary height. Error text and wrapping grow the form; the existing max-height/overflow retains access in short windows. The ordinary selectors follow the narrow-window rule and explicitly include `.smart-mac`, so the width remains bounded without changing mobile styles.

Final native rendering uses DOM serialized from the actual mounted production React component, plus complete final production CSS. WK reports400×207 CSS and a native800×414 integer crop. It does not run the App bridge or access any database. See `browser-attempt03/candidate-native.html`, `final-native.json`, `native-geometry-result.json`, `final-native-form.png` and `check-native.py`.

| Region | Final local CSS geometry | Factor2 output / original screenshot target |
| --- | --- | --- |
| Panel |400×207 |800×414 |
| Checkbox |x20,y96,16×16 |[40,192,72,224) |
| Footer separator |x20,y146,width360,border0.5 |x40..760,y292..293 |
| Cancel |x212,y163,80×24 |[424,326,584,374) |
| OK |x300,y163,80×24 |[600,326,760,374) |
| Buttons gap / right / bottom |8 /20 /20 |16 /40 /40 |
| Name input box |x≈64.703,y56,width≈315.297,height24 |A2px outline plus1px offset would extend to≈[123.406,106,766,166) when focused |

The offscreen WK is unattached and did not paint the native focus ring/selection; the name box and focus-rule sizes are available, and Chromium confirms the scoped focus style. Actual focused WK/package pixels remain for root’s Computer Use acceptance. The native helper constructs no NSWindow. WebKit allocated one internal invisible TUINSWindow during the final run; appActive=false and all visible/key/main flags=false, with no WK window attachment. The initial overly strict zero-window assertion failed on this diagnostic; the same saved result was then checked for the relevant visibility/activation constraints without rerendering.

The title’s dark160 bounding box is exactly[41,45,167,69),126×24, in both original26 and the candidate native crop. `title-bbox.json` records the common ROI/predicate. This matches geometry, not glyph pixels, colors or complete visual identity. The original remains JPEG with its stated edge uncertainty. `native-side-by-side.png` places original on the left and candidate on the right at their unchanged800×414 sizes, separated by24 pixels; no resizing/fitting/individual control translation occurred.

## Checks, preserved failures and limits

`browser-attempt03/browser-result.json` passes12 actual production React/complete CSS scenarios: ordinary geometry; smart on/off with custom-name retention and cancel without save; empty-name rejection with natural growth/footer retention; long name containment; ordinary submission and sync-section exclusion;700/390/280 viewport widths;180-high viewport error/scroll access; unchanged smart editing; unchanged mobile creation and filter panel. Smart/edit/mobile comparisons use full computed styles and local rectangles before/after swapping baseline and candidate smart CSS. Callbacks are isolated test props; no backend or persistence claim follows. External requests and browser errors are empty. Existing pnpm typecheck and30 production smart contract cases pass. `checks.json` records commands/results, and `check-form.mjs` contains the reproducible browser harness using the preinstalled browser tooling.

`browser-attempt01` retains the initial209.5-vs207 Chromium failure. Its default label line-height differed from WK; the final ordinary-only explicit16 line-height addresses that. `browser-attempt02` retains the subsequent1px-vs0.5px border assertion failure. Chromium computes this0.5px border as1px, while actual WK computes0.5px; Chromium therefore renders207.5 height and163.5 button y, explicitly recorded with0.5CSS tolerance in the interaction harness. Exact207/163/0.5 checks are in the saved native WK check. These engine distinctions are not hidden or treated as installed-Mac pixel equivalence. Only this task’s own temporary Vite fixture caches were removed after the processes stopped; no shared cache or target was touched.

`source-manifest.json` records the final source identities, changed-path/input check, unchanged build tools, reference inputs and author evidence. The320-entry build05 frozen input list is compared with current bytes: only the two authorized source paths differ. Geometry14/source screenshot bytes and the other frozen product/dependency/generated inputs remain unchanged. Roundness, colors, checkbox surface, common smart-form typography/controls and the complete smart-rule feature goal remain open. Independent source review and a separately authorized exact Mac package plus actual same-state Computer Use capture are required before any formal-package geometry or pixel acceptance.
