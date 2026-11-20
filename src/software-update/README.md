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
    softwareUpdateBadge={openAbout => <UpdateBadge openAbout={openAbout} />}
  />
</SoftwareUpdateProvider>
```

Public props:

- `SoftwareUpdateProvider({ children: ReactNode, client?: SoftwareUpdateClient })`:
  one main-window root instance, preserved while Preferences is closed.
  `client` is dependency injection for isolated fixtures only; omit in production.
- `SoftwareUpdateSettings()` has no props. Uses compact rows and shared segmented
  controls in About. Uses `.settings121-list/row/label/actions/text` primitives, scoped
  `.software-update-*` CSS and `--settings-*` tokens in `.preferences-workspace`. It owns no modal/focus trap or global Preferences styling.
- `UpdateBadge({ openAbout })` renders only when there is a newer release and
  the badge is enabled. It opens About and starts an available download or
  requests confirmation for a ready macOS package. Its dismiss action sets
  `quietUntil` for three days. About can restore the badge.
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


Failed actions retain their actual operation identity in the Provider. In
particular configure failure owns a copy of its patch; Retry replays that patch,
independent of a stale native download/install retry field. A polling/check
success is not used as a substitute for retrying configuration. Action errors
have priority over stale native errors. External-file CAS failures may continue
to reject: the user must reopen/reload the application before reapplying, rather
than silently overwriting intervening preferences.

Mobile segmented choices keep a minimum 44px hit height. Native recovery_required
retains both bundles until recovery is confirmed.
