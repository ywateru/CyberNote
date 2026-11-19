# Software update UI

All production operations call native invoke. Without registration, the section
shows an unavailable native service; it has no browser-success fallback.

```tsx
import { SoftwareUpdateProvider, SoftwareUpdateSettings, UpdateBadge }
  from "./software-update";

<SoftwareUpdateProvider>
  {/* existing App tree */}
  <Preferences
    {...existingPreferencesProps}
    softwareUpdate={<SoftwareUpdateSettings />}
    softwareUpdateBadge={<UpdateBadge />}
  />
</SoftwareUpdateProvider>
```

Public props:

- `SoftwareUpdateProvider({ children: ReactNode, client?: SoftwareUpdateClient })`:
  one main-window root instance, preserved while Preferences is closed.
  `client` is dependency injection for isolated fixtures only; omit in production.
- `SoftwareUpdateSettings()` has no props. Uses compact rows, native form
  controls, localized Chinese copy, the shared `.settings121-list/row/label/actions/text` primitives, scoped
  `.software-update-*` CSS and `--settings-*` tokens in `.preferences-workspace`. It owns no modal/focus trap or global Preferences styling.
- `UpdateBadge()` has no props and renders a non-interactive span inside the
  host update button. Preferences owns navigation/focus. The settings panel
  owns three-day dismissal/restoration using `quietUntil`. When suppressed, the
  badge keeps the generic 更新 label so the host button stays accessible.
- `useSoftwareUpdate()` returns `status: UpdateStatus | null`, `error: string |
  null`, `busy: boolean`, and async `check()`, `download()`, `install()`,
  `configure(patch: Partial<UpdatePreferences>)`. Methods expose native state and
  errors through the context; they do not throw errors to button handlers.

The native scheduler owns startup/periodic checks. Provider timers only observe
status (2s idle, 350–400ms progress). A single native operation is accepted at a
time. Cleanup discards stale responses and removes timers on unmount/client
change; a progress response cannot overwrite a completed command. Closing the
UI does not cancel a native install already requested by a manual click.

Download button names the release version, with platform/arch/size and plain
text release notes beside it. Downloads never install automatically. Only the
explicit `安装并重新启动…` action calls native install; the host must present
native confirmation and hold its existing durable-save/recording exit barrier.
Android unsigned releases show a download-only reason and no install action.
`installReport` reflects helper confirmation or rollback, never inferred success.

Commands: `software_update_status`, `software_update_configure` (`{patch}`),
`software_update_check`, `software_update_download`, `software_update_install`.
The types in `types.ts` mirror the native camelCase DTO. Required host setup,
both handler lists, lifecycle and guard signatures are documented in
[`software_update/README.md`](../../src-tauri/src/software_update/README.md).

The browser fixture is under `scripts/verification/settings121-update/`; its
injected client is never imported by this production module. Native tests use
real loopback HTTP/downloads; browser fixtures establish React presentation and
interaction only. Final Preferences/header placement, macOS WebKit and Android
WebView/device evidence belong to integration.
