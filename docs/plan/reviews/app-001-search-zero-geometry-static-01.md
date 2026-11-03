# Search zero geometry: independent source review 01

Result: **SOURCE-READY** for frozen candidate `47d44464fef4f3b038b191ff63d041637fb728d3` against baseline `87e538c4577483c8756aa49445f47b24badd98ff`. No source blocker was found in the two changed product files. This is a source review, not native runtime or pixel acceptance. Native/AppKit and WKWebView rendering, exact stroke weight, and final pixel acceptance remain **UNKNOWN**.

Review was performed only in `/private/tmp/apple-notes-search-zero-geometry-review01`. No product file was edited, no native build or GUI/device run was performed, no shared target was touched, and no merge or main-tree Git mutation was performed. A temporary dependency symlink to the existing main-tree node_modules was used for the necessary checks, verified, and removed afterward.

## Frozen source and scope

The two product files and independently reproduced SHA-256 values are:

| Path | Candidate SHA-256 |
| --- | --- |
| `plugins/tauri-plugin-notes-ui/macos/toolbar.m` | `3697f58ab1b73e3d5a7a1cc5eabe2c14ce59d6ff6bcaf71609fed0f26e721b91` |
| `src/style.css` | `6ec16f5201dd029df68eae85964cce920b9766f50c9147460f6ea52998512359` |

The product aggregate is `c421f6b874e1aff7b8096fa0eedb04b32278702f85cc7f8421e968e1a0a5528e`. Its input is the UTF-8 concatenation of each `sha256 + "  " + relativePath + "\n"`, sorted by full relative path string. Both the beginning and end identity checks reproduced the candidate hashes. The author's common prefix/suffix ranges and hashes were independently checked. All 49 author-protected files matched both their recorded hashes and the baseline Git bytes before and after review. This includes App/state/controller/protocol, editor, recording/preview/OCR, Rust/media/config, historical ROI evidence and the two original source screenshots.

## Native coordinate and guard review

`NotesUIRoot.isFlipped` returns YES; title and count are direct children of that root. The existing layout anchors the 52-point root at the top of its parent, accounting for the parent's coordinate direction. Thus changing the title frame from y9 to y11 moves its frame down 2 points; changing the count from y28 to y27 moves its frame up 1 point. Both x values move left 1 point. These frame deltas agree with the intended correction direction from the saved local text ROI measurements. They do not prove the resulting native ink bounding boxes.

The new `zeroSearchGeometry` guard requires `threeColumn`, visible sidebar, folderTitle equal to `搜索`, zero folderCount, an actual search control, and nonempty query. The unchanged App supplies `搜索` only for its confirmed desktop list zero state: workspace loaded; neither loading nor synchronizing; no sync/access error or active access gate; zero listed notes. Other query states supply `搜索结果`. An ordinary folder named `搜索` has no active query and therefore does not enter this guard. The existing display predicate for `无结果` uses the same search/title/count semantics.

Existing `titleX`, `titleRight`, calculated title width and title/count hiding are unchanged; only the selected text frame origins change. Existing native font sizes/weights/colors, control group and search layout, view hierarchy, and separator layout are unchanged. A left shift while retaining width slightly moves the title frame's right edge left as well; it does not extend into the controls. The minimum-width hiding rule remains the existing one.

## CSS scope and divider review

The added selector requires desktop + native-toolbar + visible sidebar and excludes gallery browse/edit and independent windows. It targets only `.search-zero-section`; ordinary date sections do not match. The unchanged App renders that section only for confirmed desktop list zero. Mobile, fallback toolbar, hidden sidebar, gallery and independent modes are excluded by these combined conditions.

The base section keeps height 40px, border-bottom 0.5px, font size 15px, line-height 20px, horizontal padding and all width/layout rules. The unchanged global border-box rule keeps that 40px outer height fixed. Reducing padding-top from 10px to 9px shifts text up 1 CSS pixel without changing the section box height or divider location. The new weight700 is a finite candidate for native comparison; the source review does not establish that it matches Apple Notes.

## Necessary existing checks rerun

| Command | Result | Evidence |
| --- | --- | --- |
| `node scripts/check-search-zero-ui.mjs` | PASS, 16/16 | `search-zero-ui.stdout.txt`, command JSON, empty stderr |
| `node scripts/check-native-toolbar.mjs` | PASS, 13/13 | `native-toolbar.stdout.txt`, command JSON, empty stderr |
| `./node_modules/.bin/tsc --noEmit` | PASS, exit0 | `typecheck.command.json`, empty stdout/stderr |
| `git diff --check 87e538c4577483c8756aa49445f47b24badd98ff HEAD` | PASS, exit0 | `diff-check.command.json`, empty stdout/stderr |

These are the existing presentation/controller/type checks and whitespace validation requested for this change. They do not execute AppKit geometry or establish pixels. No mirror-constant tests were added; the full application matrix was not rerun.

## Saved evidence independently checked

The author's Chrome diagnostic source and saved output were inspected, not rerun. Its eight fixture cases report unchanged element rectangles and visibility; only padding-top/logical alias and weight change in the target case. The target section rectangle remains x228,y52,w279,h40. The fixture uses the actual baseline/candidate CSS and exact zero-section JSX, but it does not mount the whole App and does not run AppKit or WKWebView. The saved first failed diagnostic is an author summary, not raw stderr: the harness initially omitted the logical `padding-block-start` alias from its expected-property allowlist. The author corrected the diagnostic allowlist; product source was not changed by that correction.

The independent saved-PNG recalculation used original pixel sizes and the same local ROI `[20,4,160,72)`, with `min(R,G,B) < threshold` at 128,160,180,200. All recomputed bboxes and pixel counts matched the author's table. At threshold160:

| Saved render | Ink pixels | Foreground bbox, half-open |
| --- | ---: | --- |
| Apple reference section | 1260 | [33,26,119,54) |
| Earlier candidate03 section | 990 | [33,28,119,55) |
| Chrome baseline600 | 1103 | [34,27,120,55) |
| Chrome candidate600 /650 /700 | 1103 | [34,25,120,53) |

The three candidate PNGs are byte-identical with SHA-256 `560326b9ad6e818f52430358d0fcfb46f1b2261788334ba6543dcc62fe0a90eb`. This confirms a saved Chrome text displacement of 2 physical pixels from the padding change; it provides no weight distinction among 600/650/700 and no proof of Apple or WKWebView stroke matching. The baseline600 saved PNG SHA-256 is `417f6d67ba784a657a61f293b1f3d9b73e265a8e8bd307c502866ba8930e76a3`.

The older source screenshots use different whole-window geometry (Apple1392×903pt, candidate1088×660pt, both2×). Only local original-scale ROIs inform this source correction. No whole-window pixel equality, resized pairing, material/blur attribution, focus-color fix, divider movement, or search-control width fix is claimed. Their recorded divider primary row is unchanged at y183; this review found no source basis to move that divider.

## Handoff and acceptance limit

Source inspection and the necessary existing checks are complete with no source blocker. The next owner must obtain a fresh native run and comparable original/candidate geometry to decide the actual title/count ink positions, WKWebView section displacement, stroke convergence, and pixel acceptance. Weight700 remains unproven; existing unrelated focus-color differences remain outside this patch. Do not relabel this report as a native or pixel PASS.

Independent evidence lives in `docs/verification/app-001-search-zero-geometry-independent-01/`. `identity-before.json`, `identity-after.json`, `product.diff.patch`, raw check outputs, command metadata, author snapshots and `saved-typography-recalculation.json` preserve the reviewed source and checks. The evidence manifest excludes itself and this external report from its file aggregate; it records the report hash separately.
