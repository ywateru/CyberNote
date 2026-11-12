# FORMAT102 bounded source-cause research

2026-11-10; research base `dec30b59`, original product `e521306e`. No product change, native build or device operation was performed for this source stage. The original Android r2 failure remains unresolved.

## Native Back and Escape

Installed dependency sources were inspected directly, rather than assuming that ActionMode produces Back:

- `tauri-2.12.5/mobile/android-codegen/TauriActivity.kt` overrides `handleBackNavigation = false`. Therefore Wry's optional WebView-history Back callback is disabled for this application.
- `tauri-2.12.5/mobile/android/src/main/java/app/tauri/AppPlugin.kt:28` registers an AndroidX `OnBackPressedCallback`. With the renderer's listener registered, its handler emits `back-button` and `canGoBack`; it does not inspect selection or ActionMode.
- `wry-0.57.1/src/android/kotlin/WryActivity.kt:59` contains the disabled optional fallback callback; window-focus changes are separately forwarded to Rust. `RustWebView.kt`, generated `TauriActivity.kt` and app `MainActivity.kt` contain no ActionMode→Back or ActionMode→Escape conversion.
- `src/platform/system-events.ts:191` subscribes to the Tauri app event and calls the current navigation adapter. `src/navigation/use-navigation.ts:315` closes the format panel with `back` when that panel is the top applicable layer.
- A full format panel's own `MenuSurface` consumes document `keydown Escape` before the window handler (`src/Menu.tsx:136`). Its generic close callback is wired through `App.tsx:3284` to `closeFormat("outside")`. Thus **the v2 reason `outside` can mean Escape**, even though outside pointer/contextmenu/blur dismissal is disabled for this mobile panel. The window fallback would use `escape` if it received the event. This is an interpretation limit of existing diagnostics, not a newly established cause of r2.

The API28 framework/WebView/WeType implementation is outside those app/dependency sources; SDK framework sources are not installed locally. A native or IME Back event delivered late to JS remains possible. No captured r2 event proves it occurred. `Navigation.run` captures request and session generation before waiting for sync cancellation; opening format increments generation and invalidates an already pending old request. This does not timestamp a native message that reaches JS only after opening format. Neither case may be asserted as the cause from screenshots alone.

## Render, metadata and delayed work

`App.tsx:711` configures session visibility, authorization and `blocked` every render; `use-editor-session.ts` reconciles in a layout effect. A genuine blocked/unauthorized/invisible transition invalidates an open panel, as do navigation/editor identity changes and explicit drawing/overlay operations. Ordinary body focus, selection transactions and viewport resize do not close it.

`synchronizingRef.current` is only assigned true in `synchronizeRef.current`'s begin callback (`App.tsx:1716`). This is a real route to temporary `blocked` and `access` close, including quiet trusted validations. Its callers are initialization/retry, actual access/sync transitions, metadata session mismatch/AccessChanged, and explicit operations such as attachment/recording validation. This audit did not find an ordinary selection or longpress path starting such validation. Injecting an access event or forcing blocked would prove an intentional barrier, not the r2 failure, so those were not presented as causal reproductions.

Passive metadata refresh (`App.tsx:899`) does not itself set synchronizing or a loading cover. It retries MetadataStale reads and escalates AccessChanged to trusted synchronization. AccessGate read-generation invalidation occurs on actual access events or trusted sync begin; own save responses only acknowledge revision. Own pending save updates `wsRef` before ACK (`App.tsx:1238`), preventing an own ACK from masquerading as an external document change. A real different external document with no pending local body increments `externalVersions` during hydration and remounts its Editor; that identity boundary is deliberate and requires an actual external document difference.

The 138-second original gap was checked against relevant scheduled work:

| Scheduled work | Prerequisite and effect | Relation to format close |
| --- | --- | --- |
| App notice 3500ms | Clear notice text | No close call |
| App longpress 520ms | Folder/list touch starts it | Not Editor text selection; no idle timer |
| PM Android composition watchdog 5000ms | Active composition | Ends composition; no session close call; original panel still open 42 seconds after opening |
| SyncSettings status poll 5000ms | Active settings sync tab | Settings already blocks panel; not ordinary editor polling |
| Quiet sync deadline 5500ms | An actual prepared network operation | Requests cancellation through backend receipt; freeze already explicitly invalidates the relevant note |
| MainActivity keyboard show 80ms | Explicit keyboard request | Generation-cancelled keyboard work, not panel timeout |
| Rust quiet-operation expiry | Actual sync/barrier operation | Not an editor authorization idle TTL |

No 120/138-second format/access idle timer was found in these paths. This is a bounded source result, not proof that native WebView/IME, network activity or external app state cannot change over real elapsed time.

## Actual App regression

Command: `node scripts/check-format102-source-boundaries.mjs` — **10 checks passed**. Output: `artifacts/mobile-format102-source-boundaries/result.json` and `panel-after-selection-and-clock.png` in this worktree.

The real production App and Editor ran in Chrome with the existing isolated JS IPC fixture. It established nonempty PM selection plus synthetic composing state, dispatched the actually registered Back channel with a simulated viewport keyboard inset before opening format, then tapped/reselected/opened the panel. A real delayed own save ACK and resulting metadata read preserved the same Editor DOM and the open panel. Advancing controlled page timers by 138000ms, then selecting text and dispatching contextmenu, also preserved the full panel. Explicit Back closed with `back`; explicit Escape closed with `outside`, confirming the route above. There were no uncaught browser errors.

Limitations: synthetic composition is not WeType/native ActionMode, viewport inset is not visible Android IME, controlled page time is not wall-clock native idle, and explicitly dispatched Back/Escape does not prove longpress emitted either. The test does not mutate session context, access gates or product handlers. Attempt1 incorrectly read PM selection JSON as from/to instead of anchor/head; attempt2 expected Escape's window-fallback reason instead of its actual MenuSurface reason. Both intermediate results are preserved and are test-expectation errors, not product failures. The final expectation follows observed source routing and still requires the panel to close only for those explicitly supplied closing events.

The next authorized phone-only case will reuse installed v2, create no note, establish a real nonempty preselection, open format and wait at least145 seconds before the only hold. It will separately record panel state before and after the hold. No source fix is justified by this research alone.
