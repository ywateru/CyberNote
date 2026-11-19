# Preferences menu adapter

The settings visual contract is `docs/architecture/settings121.md`. This adapter
keeps option values and persistence in the existing Preferences owners. It does
not create a settings store, save queue, account authority or native menu owner.

`PreferenceSelect` renders a platform select on mobile and a DOM radio menu on
desktop. Desktop reuses `MenuSurface` for top-layer registration, outside-click
and blur dismissal, fixed viewport placement, resize/scroll tracking and observer
cleanup. `NativeMenuContext=false` and inline placement keep this surface inside
the workspace palette and Preferences focus boundary, even when the containing
App normally uses native menus. The shared Menu implementation is unchanged.

The adapter supplies `menuitemradio` semantics because MenuSurface's ordinary
keyboard item selector intentionally handles only `menuitem`. Arrow/Home/End,
typeahead, Enter/Space, Tab and Escape are handled on the surface's React event
path. There is no second document Escape listener. Preferences consults the shared
top-layer owner before closing its update pane or the whole dialog. Clicking
outside restores a usable trigger before the browser moves focus to the clicked
control; hidden/disabled triggers are never focused. Hiding a retained settings
page, disabling a picker, switching platform or unmounting releases the menu.

`Preferences.css` owns shared settings tokens and text/pill/segment primitives.
The adapter stylesheet only supplies picker and menu material. Defaults, explicit
false values, failed-save rollback and confirmation remain in the existing
handlers. All pickers in Preferences, presentation settings and interface-detail
menu spacing use this adapter; mobile retains the same native select values.

Search navigation stays in Preferences: a serialised intent waits at most five
seconds for a visible/enabled destination. Its MutationObserver/timer are cancelled
on success, failure, timeout, new search, navigation, user focus transfer or
unmount. AccountSettings exposes only a presentation availability attribute
(`loading/error/signedIn/signedOut`); it is not an authorization port. Known absent
device searches are filtered, unknown state offers a login prerequisite, and the
actual AccountSettings UA rule determines whether credential storage can exist.

## Regression evidence

Run `scripts/check-settings121-ui.mjs` with an existing local Playwright/Chrome
installation; no app data, live service or installed app is used. The script uses
real production React surfaces with local synthetic ports and reports source
revision/dirty state. It covers the original settings geometry and account
confirmations plus the R1/R2/R3/R4/R5/R6 repair cases: immediate update Escape,
nested menu then update dismissal, delayed search success/cancellation/replacement/
failure, a controlled-clock five-second timeout with no late focus theft,
Android UA/signed-out availability, forced native-menu context, keyboard and
outside dismissal, short viewport placement, disabled options/save state,
persisted selection/failed rollback, shared gray-action metrics, update pill
metrics, desktop light/dark and mobile 320/390px layout/touch targets.

Development artifacts are under `/tmp/cybernote-settings121-ui-fix`, including
`result.json`, `fix-metrics.json`, light/dark menu screenshots and the search
destination/Android prerequisite screenshots. Chromium subpixel geometry permits
one pixel of rounding in the shared menu's nominal eight-pixel viewport margin;
the actual menu remains fully inside the viewport.

This is developer regression evidence, not independent review approval. Preserve
`docs/plan/reviews/settings121-ui.md`; Locke owns the re-review. Its I1 real-App
conflict wiring remains an integration task. No App, DataManagement, lib.rs,
shared Menu implementation, account authorization flow or backup tree is changed.
Full Tauri, macOS WebKit, Android WebView/native-select/IME and real-device
acceptance are not established by this browser fixture. WebKit was unavailable
locally, and no browser download or heavyweight build was performed.
