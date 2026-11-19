# CyberNote software update host contract

Implementation for the update section of
[`settings121.md`](../../../docs/architecture/settings121.md).
This directory owns the fixed release client, preferences, downloads, scheduling
and macOS installation transaction. It does not open CyberNote stores/accounts.
It adds no Cargo or frontend dependency. The integration worker owns `lib.rs`,
App/Preferences, readiness and the existing save/recording/quit coordinator.

## Mandatory host integration

1. Declare `mod software_update;` in `lib.rs`. Add **all five** commands below to
   **both** existing `tauri::generate_handler!` lists (normal and
   `access-boundary-proof`). Do not install a second `invoke_handler`, which
   would replace the application's existing handler.

```rust
software_update::commands::software_update_status,
software_update::commands::software_update_configure,
software_update::commands::software_update_check,
software_update::commands::software_update_download,
software_update::commands::software_update_install,
```

2. During setup, after resolving the isolated workspace/cache paths, construct
   exactly one host and manage its **Arc**, not the inner struct:

```rust
use tauri::Manager;
let updater = software_update::SoftwareUpdater::new(
    app.path().app_cache_dir()?.join("software-update"),
    install_guard, // Arc<dyn software_update::InstallGuard>
)?;
app.manage(updater.clone()); // command State<'_, Arc<SoftwareUpdater>>
let scheduler = tauri::async_runtime::block_on(async {
    software_update::UpdateScheduler::start(updater.clone())
});
app.manage(std::sync::Mutex::new(Some(scheduler)));
```

`new(PathBuf, Arc<dyn InstallGuard>) -> Result<Arc<SoftwareUpdater>, String>`
only accesses its private cache directory. Invalid/unreadable preferences fail
initialization; report an unavailable updater instead of replacing corrupted
preferences with defaults. `DenyInstall` is a safe temporary guard when the
real host coordinator is unavailable; it always rejects installation.
`UpdateScheduler::start` must execute inside an entered Tokio/Tauri runtime;
setup's event-loop thread alone does not supply one.

3. Implement the existing host boundary using these exact traits:

```rust
pub trait InstallGuard: Send + Sync {
    fn prepare_install<'a>(&'a self, release: &'a Release)
        -> std::pin::Pin<Box<dyn std::future::Future<
            Output = Result<Box<dyn InstallLease>, String>
        > + Send + 'a>>;
}
pub trait InstallLease: Send {
    fn exit(&mut self) -> Result<(), String>;
}
```

`Release` is re-exported and includes `version`, `notes`, `url`, `package`,
`size`, `platform`, `architecture`. After a **manual install invocation**,
`prepare_install` must present native confirmation naming the version,
ad-hoc/non-notarized status and restart, obtain a barrier from the existing
save/recording/quit coordinator, flush durable saves, end/seal recording, and
prevent all windows from starting new edits/recordings. Return an error on
cancellation, save failure or unavailable guard. Hold that barrier in the lease
until process exit; dropping a failed/cancelled lease releases it. `exit` must
request orderly exit through the existing quit path, after account/background
owners are ready. Do not use `process::exit`, bypass recording acknowledgements,
or create another save queue. Do not hold the coordinator mutex while waiting
for a webview acknowledgement that needs the same mutex.

If the existing ExitRequested flow vetoes exit after `exit()` returned `Ok`,
the helper waits at most 120 seconds and leaves the application unchanged;
status then reports cancellation. Prefer completing veto-capable checks while
preparing the lease. A rejected `exit()` kills the waiting helper and discards
its unused stage. A manually requested install is owned by the native service;
closing the IPC awaiter does not abandon an in-flight blocking validator.

4. On **every launch**, after stores, main UI, save/recording coordination and
   quit hooks have successfully initialized, call
   `updater.acknowledge_launch() -> Result<(), String>` via the host's actual
   readiness path. This is deliberately NOT called by the Provider or setup.
   A replacement that never reaches this boundary is rolled back after 90
   seconds. Do not acknowledge merely because a window was created. If the
   previous/current build lacks this integration, the helper cannot receive
   acknowledgement and will restore the old bundle. Surface errors and
   `Status.installReport`; do not clear an unknown/corrupt transaction.

5. Retain the scheduler owner until application exit. In `RunEvent::Exit`, take
   it out of `Mutex<Option<UpdateScheduler>>` and drop it to abort the timer.
   If an async shutdown phase is available, take the value **before** awaiting
   `scheduler.shutdown().await`, which aborts and joins its task. Provider
   unmount/client changes clear its own status/progress timers and reject stale
   responses; they do not own the native checking schedule.

6. Mount one frontend `SoftwareUpdateProvider` at the main-window root, outside
   conditional Preferences rendering. Pass `softwareUpdate={<SoftwareUpdateSettings />}` and
   `softwareUpdateBadge={<UpdateBadge />}` to the UI worker's Preferences.
   `UpdateBadge()` renders content only, with no props or interactive descendants;
   Preferences owns the surrounding update button and panel navigation. Production must omit the `client` prop.
   See [`src/software-update/README.md`](../../../src/software-update/README.md).

## IPC and state

Only the `main` WebviewWindow may invoke these commands. No command accepts a
feed URL, local path, install target, package metadata, checksum, current
version, or frontend-provided guard approval.

| Command | JS arguments | Result |
| --- | --- | --- |
| `software_update_status` | none | `Status` |
| `software_update_configure` | `{ patch }` | `Status` |
| `software_update_check` | none | `Status` |
| `software_update_download` | none | `Status` |
| `software_update_install` | none | `Status` (exit requested, not installation success) |

`PreferencePatch` accepts only optional `checkOnStartup`, `automaticChecks`,
`intervalMinutes` (15/30/60/360/720/1440), `channel` (`stable`/`preview`),
`showBadge`, `quietUntil` (Unix seconds; zero shows immediately). Missing
values preserve current settings; explicit false/zero are respected. Unknown
stored keys survive updates; invalid JSON/types/intervals are errors. Config
writes compare original bytes, skip unchanged contents, fsync a private temp
file and atomically rename. No session/account preferences are modified.
Concurrent check/download/install/configure operations reject `update_busy`.

The serialized `Status` shape is mirrored in `src/software-update/types.ts`.
`phase` differentiates `no_release` (no eligible channel release at all),
`up_to_date` (no newer eligible version), `available`, progress, verified
`ready`, staging, confirmation, requested restart, and errors. `retry` identifies
which operation to retry. `installReport` reports the actual helper transaction,
including failed rollback and the retained backup path. No download or exit
request claims that installation completed.

## Fixed publication and package policy

Production always reads `https://api.github.com/repos/ywateru/CyberNote/releases`
with bounded pagination, connect/body limits and HTTPS GitHub-only redirects.
There is no environment/feed override in production. Loopback feeds exist only
in Rust `cfg(test)`. Only exact current arm64 asset names are accepted:

- `CyberNote-macos-arm64.zip`, `.json`, `.sha256`.
- `CyberNote-android-arm64-unsigned.apk`, `CyberNote-android-arm64.json`, `.sha256`.

The `.sha256` file lists both package and notices; selection requires exactly
one checksum line for the selected package. The receipt must match the package
hash, platform, arch, release core package version and production build mode.
A newer release missing these assets reports `missing_asset`; it does not
silently offer an older release. Downloads are limited to 1 GiB, exact published
size, and SHA-256. Partial/cancelled files are removed; verified downloads are
not restored across launches and their orphan cache is cleared. A live host
retains at most one verified download. Current version is `CARGO_PKG_VERSION`.

SemVer prerelease/build ordering is implemented explicitly. A stable `0.1.0`
never updates to `0.1.0-preview.N`, including on preview channel. Stable channel
with only preview.1/.2 releases reports no stable publication, not a network
error. Today's release pipeline keeps `package.json`/Cargo/plist versions stable
while release tags may add a preview suffix; receipt/plist identity compares the
tag's **core**, and upgrade eligibility compares the full SemVer tag.

macOS rehashes the verified ZIP before staging. ZIP central/local names, paths,
entry types, duplicates, overlaps, counts and total expanded bytes are checked
before `ditto`. Links, ZIP64, multipart and encrypted packages fail closed.
A private stage is made beside the installed bundle (same filesystem), extracted
without following archive links, then checked for `com.local.notesclone`, exact
executable name, expected short version, arm64-only Mach-O, receipt's native
binary hash, and `codesign --verify --deep --strict`. This proves package identity
and ad-hoc integrity; it does NOT prove Developer ID, same signer or notarization.
Translocated/disk-image/development/non-writable locations are rejected.

After the guard, a private helper waits for the old PID to exit, rechecks live
and staged native hashes, renames old bundle to a unique adjacent backup, moves
the stage into place and invokes `/usr/bin/open -n`. An opener failure or missing
startup acknowledgement restores the backup and retains the failed bundle.
The old backup, transaction receipt and helper log remain for recovery; they
are never recursively deleted after handoff. Failed rollback is explicit.
There is no privilege escalation. Power loss/SIGKILL between the two directory
renames may require manual restoration from the adjacent `.CyberNote-rollback-*`
bundle using the retained `pending.json` transaction; this is not a filesystem
atomic exchange. The helper's success means the new host reached readiness,
not a device/content-sync acceptance result.

Android currently supports real bounded download, package SHA/receipt matching
and ZIP header validation **only**. Actions publishes an unsigned APK; no system
installer can accept it as an installable compatible update. UI explicitly says
this and offers no install button. No signing bypass, fabricated installation,
manifest/device acceptance, or arbitrary system opener is implemented. Download
stays in private app cache; no external-file export is claimed. A future signed
pipeline needs actual package-manager manifest/signature checks plus a scoped
FileProvider/installer integration before enabling installation.

Release checksum/receipt publication is trusted through GitHub HTTPS. There is
no project-signed checksum manifest/attestation key today. UI does not import
magpie's ed25519, Sigstore, same-team or notarization claims.

## Isolated verification

Run from the assigned checkout:

```sh
python3 scripts/verification/settings121-update/verify.py --commands
python3 scripts/verification/settings121-update/replace-proof.py
pnpm typecheck
pnpm version:check
git diff --check
```

The standalone crate compiles the **actual source**, including macOS validators,
Tauri command functions and their real `generate_handler!` registration, against
the repository lockfile versions. It avoids a full app build/sidecar and uses
only temporary directories and loopback servers. Native bundle tests compile
and ad-hoc-sign a tiny arm64 fixture; replacement tests invoke an inert opener
and fake sleep/mv fault injectors exclusively on temporary fake bundles.

For real React fixture screenshots, serve Vite on 127.0.0.1:1431 and run
`node scripts/verification/settings121-update/browser-proof.mjs`. It uses the
bundled Playwright runtime/Chrome by default and injects the UI worker's exact
`e29a7d8c:src/Preferences.css` into its isolated `.preferences-workspace` host. Set `PLAYWRIGHT_MODULE`,
`CHROME_PATH`, `UPDATE_PROOF_ORIGIN`, `UPDATE_PROOF_OUT` to override; optionally
`UPDATE_WEBKIT=1` when a WebKit Playwright runtime is installed. This fixture
injects an explicit client and separately verifies that a production browser
without native registration shows unavailable, never mock success.

These checks establish module/fixture behavior. They do not establish the final
host's two-handler registration, real quit barriers, a running application
replacement/relaunch, macOS WebKit, Android WebView/device installation, or sync
acceptance. The integration worker must finish those boundaries before release.
