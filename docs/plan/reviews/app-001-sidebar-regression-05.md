# APP-001 sidebar regression 05 — read-only source and preserved Mac04 review

2026-11-04. Reviewer: verify_app. **No newly established static defect in the reviewed sidebar restore path; root's newly preserved current-session evidence supports both list-window restore paths.** Current reviewed source retains the direct restore control and dynamic application-menu wording, and the preserved Mac body-build04 package includes that source. The final addendum below independently reads root's fresh GUI evidence after the user's unlock reply, within its finite scope.

## Scope and source identity

Current HEAD observed: `832be31f13998f20aa87edcd9987831e0a1fed91`. Read only relevant source, Git comparisons and preserved evidence. No GUI, ADB, app/process inspection, build, test, package/signature command, download, product edit, staging or commit was performed. Only this report is created. Available disk space was 74,336,936 KiB, above the 2 GiB guard.

`git diff 62244d445b19321a3fe773ffa074563c56970595 --` was empty for these eight reviewed files:

- `src/App.tsx`
- `src/native-toolbar-state.ts`
- `src/native-toolbar-controller.ts`
- `src/native-toolbar.ts`
- `src-tauri/src/lib.rs`
- `plugins/tauri-plugin-notes-ui/macos/toolbar.m`
- `plugins/tauri-plugin-notes-ui/src/macos.rs`
- `plugins/tauri-plugin-notes-ui/src/lib.rs`

The current `src/style.css` comparison differs only in the mobile paper chooser's selected outline/pseudo-element. Its desktop sidebar grid, hide/show, gallery column and native-top selectors have no change from that source. This is a bounded source comparison, not a claim that the entire current product aggregate equals the Mac04 freeze.

## Restore and menu paths

`src/native-toolbar-state.ts:52` supplies `toggleSidebar` in all three main-window layouts (`threeColumn`, `galleryBrowse`, `galleryExpanded`) and excludes it in `independentNote`. The action is selected from the actual React `sidebar` value, enabled from `available`, and `columns.sidebarVisible` is projected from the same value. No second sidebar state is introduced.

`toolbar.m:341` lays out the main-window sidebar group separately from the right-hand editing/overflow decisions. Hidden folders remove `newFolder` but retain `toggleSidebar` as a direct 36 pt action. When a visible sidebar is narrow, only `newFolder` is moved to overflow. The subsequent editing-action drop loop does not contain `toggleSidebar`. `titleX` and gallery return placement account for the direct group. The layout's final group-visibility pass includes the retained sidebar group. These source facts support intended visibility; actual AppKit hit testing and occlusion require GUI evidence.

`toolbar.m:506` sends the enabled direct action through the existing intent callback. `src/App.tsx:3166` changes the React sidebar value using the functional toggle. The native menu `sidebar` route at `src/App.tsx:3368` uses that same handler. `NativeToolbar.receive` validates window/binding/sequence/revision/context before delivering action intents, and the state pump sends changed sidebar projections back to native code. The fallback DOM restore button at `src/App.tsx:3739` is used only when the native top strip is absent; a healthy Mac native toolbar therefore needs its own direct control, which the reviewed Objective-C layout supplies.

The shared application-menu item is initially titled `隐藏文件夹` in the host. `macos.rs:130` projects its later title from the current **main** binding: visible → `隐藏文件夹`, hidden → `显示文件夹`. Successful native bind/update synchronizes that title; the plugin's `Focused(true)` callback synchronizes it when main regains focus. Missing bindings and independent windows are no-ops. The binding lock is released before menu dispatch, stale-state validation precedes update, and menu-title failure is separately logged rather than undoing an applied toolbar state. Existing source/integration reviews cover the finite source checks; they were read, not rerun in this round.

Transient loading, synchronization, access operations and modal/drawing/recording/OCR activity can disable toolbar actions or cause `nativeAssert` to reject the shared handler. Stale events can also be dropped by the controller. Their presence is not established for the user's new report. If the button exists but does not act, capture enabled state, active overlay/error and event context before attributing the failure to geometry or silently resetting state.

## Actual Mac04 package and prior runtime evidence

The existing independent artifact report [mac-body-independent04](../../verification/unified-candidate06/mac-body-independent04/README.md) records **929 successful checks** of saved source/input/artifact/signature provenance, including exact source `62244d445b19321a3fe773ffa074563c56970595`, 302 inputs and 238 product files. It is referenced as a completed prior verification, not rerun here. The freeze is `mac-body-build04/input-freeze.json`, SHA256 `0d3917a81a90ff6ad41d44df534bf77002bf9db9e929c2dc598c60f6e10a0f2c`; product aggregate `560f9826b44320f184493f8f522a2cfefaf78a7e4e7c1faad8fa001e1190583d`.

The preserved sealed executable is `artifacts/unified-candidate06/mac-body-build04/mac-attempt01/mac-sealed.app/Contents/MacOS/notes-clone`, 16,013,344 bytes, SHA256 `db92182330f81f0adfef38d5a9a103e705f166c27c3ff5d3578a8a0e0df85a8e`. The existing artifact review distinguishes this app from the original generated app and earlier body-build03. Combined with the exact reviewed-source comparison, this supports **Mac04 contains the reviewed direct-restore and dynamic-menu implementation**. It does not identify the app currently visible to the user.

Read the following actual Mac04 records under [mac-body-vertical-runtime-03](../../verification/mac-body-vertical-runtime-03/):

| Record | Directly supported observation |
| --- | --- |
| `10-body04-identity.json` | Historical PID 18440, the exact sealed path/hash above, source 62244d…, captured at 16:44:15 +08:00. |
| `13-body04-sidebar-hidden.ax.txt` | Folder column absent; native `显示或隐藏文件夹` button present; selected synthetic note and folder heading count 6 retained. |
| `14-body04-hidden-menu.ax.txt` | Actual open `显示` menu contains `显示文件夹`. |
| `15-body04-menu-restored.ax.txt` | Folder/navigation buttons return; direct toggle remains; selected synthetic body and heading count 6 retained. |
| `16-body04-direct-restored.ax.txt` | Restored folder/list/body state with direct toggle and the same synthetic body/count. |
| `22-body04-cold-identity.json` | Same sealed executable/source/hash; historical cold-start PID 21092, prior PID 18440, captured at 16:53:23 +08:00. |

The completed independent runtime review [mac-body-vertical-runtime-independent-03/result.json](../../verification/mac-body-vertical-runtime-independent-03/result.json) records exact equality of the full 257-codepoint synthetic AX body in 12/13/15/16, plus count 6 preservation, hidden-state toggle and hidden-menu label. Its explicit limits remain: static endpoints do not prove every click; the second hidden intermediate state before direct restoration is not separately saved, so that action attribution partly relies on the operator's account. The saved original images are lossy JPEGs, and this review did not perform image comparison. These historical observations cannot disprove a different current process/window/focus or later runtime failure.

The earlier [sidebar-final-04 review](app-001-sidebar-final-04.md) concerns **body-build03**, with executable SHA256 `b3c9013f…`, and must not be mistaken for fresh Mac04/current-session acceptance.

## Minimal fresh regression checklist for root

1. Record actual running process/path/executable identity and initial focused window, layout, width, selected synthetic note/folder and full body. Distinguish the user-visible app from previous preserved packages.
2. In the same main list window, hide folders with the direct button; save the hidden intermediate state with the direct button's visibility, enabled state and unobscured hit area. Click that same button to restore and confirm folder selection, body and widths.
3. Hide again, save the intermediate state, open `显示` and capture `显示文件夹`; use it to restore, then reopen the menu and capture `隐藏文件夹`. This closes the missing second-hide and visible-menu evidence boundaries of the finite historical Mac04 set.
4. Repeat one direct hide/restore round at a narrow width and one with global-search focus, retaining query/caret where applicable. If the user reproduces the failure in gallery, perform the same finite path in the actual affected gallery mode; keep unrelated matrix expansion out of this regression.
5. If either route fails, preserve the failure before retrying: active window and package identity, direct control absent/disabled/obscured distinction, current menu wording, any overlay/error, and unchanged synthetic body/count. Check main → independent → main focus only if the failure follows a window switch.

No product fix is justified solely by this static review. Root's current runtime evidence should determine whether the next action is an implementation change, version/process correction, or a narrower interaction repair. Whole-window pixel identity, every window width/layout, persistence and desktop/mobile completeness remain outside this bounded result.

## Fresh user regression05 evidence — final addendum

Root subsequently completed the authorized GUI round and supplied [mac-sidebar-user-regression05/README.md](../../verification/mac-sidebar-user-regression05/README.md) and records 01–09. Independently read that README, all eight AX records, and `09-identity.json`; parsed the five full clone body Values directly from their saved AX files and inspected the five original image file formats/dimensions. No app, GUI or new product test was run by this reviewer. The scope above permits small read-only evidence parsing; it does not imply a new platform/interaction test.

The newly captured `09-identity.json` records **2026-11-04 17:40:09 +08:00**, exact PID **21092**, successful `/bin/ps -p 21092 -o pid=,comm=` exit 0, and the Mac04 sealed command path. It also records 16,013,344 bytes and executable SHA256 `db92182330f81f0adfef38d5a9a103e705f166c27c3ff5d3578a8a0e0df85a8e`. Source `62244d…` remains linked through the existing freeze/artifact review. This is root's saved current-session process/hash observation, independently read here; no fresh process or executable rehash was performed by this reviewer.

| New record | Independently supported saved state |
| --- | --- |
| `01-original-hidden.ax.txt` | Original Notes has no folder column and retains a native toolbar `文件夹` button. Its Help string still reads `隐藏文件夹`; the hidden state is established by the structure, not by assuming that Help is current. Original restoration is root's live observation; no separate restored original file is supplied. |
| `02-clone-visible.ax.txt` | Clone starts with the folder column and selected synthetic `QA-TYPE-20261104-01` content. Test-folder heading count is **7**. |
| `03-clone-hidden.ax.txt` | Folder column absent; direct `显示或隐藏文件夹` button retained. |
| `04-clone-direct-restored.ax.txt` | Folder column returns and the same direct toggle remains. |
| `05-clone-visible-menu.ax.txt` | Actual open `显示` menu says **隐藏文件夹**. |
| `06-clone-menu-hidden.ax.txt` | A separately saved second hidden state: folder column absent, direct toggle retained. |
| `07-clone-hidden-menu.ax.txt` | Actual open `显示` menu says **显示文件夹**. |
| `08-clone-menu-restored.ax.txt` | Folder column restored; final direct toggle and folder heading count **7** present. |

The complete body Values in 02/03/04/06/08 are equal: **257 Unicode code points**, SHA256 `69fc53a7926291444f2a846074f92f625c945d997fa8e33c7c957038ff90cd82`, including the blank line and full long paragraph. Each retains `Notes Clone UI 对照 7 个备忘录`; the selected note's date is 14:19. This is current-session visible-text/count evidence and does not replace the historical count 6 in the earlier Mac04 round. It establishes no database, rich-text JSON, editor-instance, selected-range or Undo identity. All five supplied `.cua-image` files are actual **JPEG 2788×1806**, so no lossless/pixel-parity claim follows; this addendum does not visually certify their geometry.

This new evidence supports root's reported same-window sequence **visible → direct hide → direct restore → menu hide → menu restore**, with separately preserved hidden intermediates and both actual menu titles. Static endpoints plus the operator account support this finite interaction result; they are not independent replay/click telemetry. The final saved clone state is visible. No contrary endpoint or fresh defect is established in these records.

Root explicitly bounded this round to the actual list window. The checklist's narrow-width/search/gallery/focus suggestions above are conditional future diagnostics, **not outstanding requirements for this completed finite round**. No narrow-window, search-focus, gallery, independent-window, cold-start, persistence or full pixel acceptance is added. Root's new manifest is acknowledged as preservation metadata; this reviewer does not claim to have independently audited its whole inventory/hash formula in this addendum. No further writing or product action is needed from verify_app for this assignment.
