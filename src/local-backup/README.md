# LocalBackupSettings integration

`index.ts` exports the component, all DTOs, `LocalBackupHost`,
`LocalBackupSettingsProps`, `EncryptedArchiveHost` and the native invoke adapter.
Native registration/initialization is specified in
`src-tauri/src/local_backup/README.md`. The component has no Store or backup
scheduler and makes no backup merely by mounting.

Mount inside `.preferences-workspace`, using the UI worker's Preferences.css
shared `.settings121-list/row/label/actions/text/segments` primitives and
`--settings-*` tokens. Segments use `role=radio`, `aria-checked`, roving tab focus
and arrow/Home/End keys. Module CSS only adds backup expansion, confirmation,
wrapping and 44px narrow-screen targets; it defines no competing palette or
general list/row/segment system.

For the reviewed UI worker `Preferences.automaticBackup` slot:

```tsx
<LocalBackupSettings
  active={backupTabActive}
  blocked={recordingOrArchiveOrAccessBlocked}
  accessKey={currentLibraryAndAccessGeneration}
  host={localBackupHost}
  onArchive={archive}
  showArchiveControls={false}
/>
```

The existing DataManagement `data` slot retains normal archive/Apple import rows.
`showArchiveControls` defaults true for an integrated standalone section; false
prevents duplicate normal import/export rows in `automaticBackup`. Pass
`appleImport` only if moving the existing functional Apple import UI into this
component. Pass optional `encryptedArchive` only when its host operations are
functional; these additional rows can coexist with `showArchiveControls=false`.

Create one stable, memoized host with `createLocalBackupClient(options)`:

- `expected()` returns the current `accessGate.expected()` shape. It is an
  expectation to be validated natively, never proof of authorization.
- `beforeOperation()` shares App's current cancel/flush/recording/quit guards.
  The host must keep native operation serialization/recording checks in effect
  for the whole actual operation, including after a picker or acknowledgement.
- `afterRestore(delivery)` performs App's existing import delivery
  hydrate/fallback and selection/metadata refresh. The client catches failure
  after native `outcome: "committed"` into `refreshError`; the UI consumes the
  confirmation and displays a committed warning without repeating import.
- `chooseDirectory?()` is desktop-only and uses the native directory picker;
  return null on cancel. `status.directoryMode` comes from the native runtime.
  Private-only hosts (Android this round) omit chooser/default controls and show
  the actual app-private path plus the uninstall/device-loss limitation.
  `revealDirectory` is optional and is omitted when unsupported. These ports
  should restrict opening to actual displayed directories. No data-folder move
  action is supplied.

`active` controls status polling and actions. `blocked` includes recording,
archive, quit and access transitions. `accessKey` changes on library/session/
permission generation changes. All asynchronous results are discarded across
these generations; a directory picker that returns after navigation cannot write
configuration. A native operation already started remains owned by the host.
The 30-second status poll is removed on hide/unmount. Failed status is displayed
as unknown; it is not rendered as an enabled/default configuration. Actions show
one local error and do not retry. The restore confirmation states the existing
append/remap/update-settings import semantics and pre-import recovery snapshot.
Cancel is initially focused; Escape closes the inner confirmation before the
outer Preferences handler and restores its trigger's focus.

`EncryptedArchiveHost` exposes typed `export`, `prepareImport`, `confirmImport`
and `discardImport` ports. Passwords are transient, cleared after use/navigation,
and never saved in configuration. Import first requests a preview and separate
confirmation; cancellation/navigation discards the host-owned staged operation.
The host must also expire prepared imports and clean abandoned staging on window
closure; renderer cleanup alone is not a native lifetime guarantee.

## Browser fixture

`test-browser.mjs` renders the real React component with an isolated typed-shaped
host, through Vite, in existing local Chrome. It never connects to Tauri, a live
library or the current app. Before the UI change is integrated, explicitly pass
its read-only stylesheet:

```sh
SETTINGS121_SHARED_CSS=/Users/water/work/2026/.cybernote-worktrees/settings121-ui/src/Preferences.css \
PLAYWRIGHT_CORE_PATH=/Users/water/.npm/_npx/9833c18b2d85bc59/node_modules/playwright-core/index.mjs \
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node src/local-backup/test-browser.mjs /tmp/settings121-backup-ui
```

After integration the script defaults to this checkout's Preferences.css. Tests
cover interval/keep/directory controls, existing archive handler routing,
preview/confirmation/focus/Escape, password mismatch/clearing/staged cancellation,
action error persistence, stale picker/read generations, blocked controls,
desktop/narrow layouts, light/dark colors and 390px touch sizes/overflow. Browser
screenshots establish Chromium fixture behavior only; actual WebKit, WebView,
native dialogs/IME, recording and installation acceptance remain host checks.

The preview binds `targetStore: {instance, generation, settingsSha256}` and the
verified immutable payload hash (version.manifest.sha256). The native host must
recheck the same target fence after save acknowledgements. Encrypted previews
bind `payloadSha256` and that same target fence too. `confirmImport` returns an
`ImportCommitted`, not a generic success/error archive result; after commit it
must never reject solely because maintenance/hydration failed. Pre-commit errors
may reject and require a fresh preview.

Restoration is additive: preserve existing content, create copies on ID collision,
and apply archive settings. The pre-import protection is only a current business
projection snapshot, not all historical heads/inbox/tombstones. Existing conflicts
and deletion knowledge must remain untouched; no in-place rollback is offered.
