# CyberNote software update host contract

Implementation for the update section of
[`settings121.md`](../../../docs/architecture/settings121.md).
This directory owns the fixed release client, preferences, downloads, scheduling
and macOS installation transaction. It does not open CyberNote stores/accounts.
It directly uses the already locked flate2 and crc32fast crates for bounded ZIP32 inflation and CRC validation; it adds no frontend dependency. The integration worker owns `lib.rs`,
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
   acknowledgement and will preserve the candidate and backup for manual recovery. Surface errors and
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
`intervalMinutes` (15/30/60/360/720/1440), `channel`
(`stable`/`preview`/`daily`),
`showBadge`, `quietUntil` (Unix seconds; zero shows immediately). Missing
values preserve current settings; explicit false/zero are respected. Unknown
stored keys survive updates; invalid JSON/types/intervals are errors. Config
writes compare original bytes, skip unchanged contents, fsync a private temp
file and atomically rename. No session/account preferences are modified.
Concurrent check/download/install/configure operations reject `update_busy`.
After helper handoff, native admission also rejects these operations while the
transaction-owned InstallLease exists, even though the initial async method has
returned or any display phase has changed. `status()` reconciles the pending
transaction hash and helper phase into authoritative state. Only a matching
safe terminal (`cancelled`, `unchanged`, `rolled_back`, `complete`) releases the
lease, once and outside service locks. Missing/corrupt/replaced transaction,
`rollback_failed` or `recovery_required` retain admission and the barrier for
explicit recovery. Host shutdown still owns final teardown; phase text is not
an authorization token.

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
- `CyberNote-android-arm64.apk`, `CyberNote-android-arm64.json`, `.sha256`.
  Older releases may instead provide `CyberNote-android-arm64-unsigned.apk`.

The `.sha256` file lists both package and notices; selection requires exactly
one checksum line for the selected package. The receipt must match the package
hash, platform, arch, release core package version and production build mode.
A newer release missing these assets reports `missing_asset`; it does not
silently offer an older release. Downloads are limited to 1 GiB, exact published
size, and SHA-256. Partial/cancelled files are removed; verified downloads are
not restored across launches and their orphan cache is cleared. A live host
retains at most one verified download. Current version comes from one helper: nonempty
`option_env!("CYBERNOTE_RELEASE_VERSION")`, otherwise `CARGO_PKG_VERSION`.
The integration build owns setting that environment value; absent/empty old
build identities conservatively retain stable-version semantics. The same full
version is parsed during construction and compared when staging a macOS
candidate; the installed plist and receipt core still match package version.
Optional top-level receipt `releaseVersion` and `buildInfo.releaseVersion`, when
present, must each be a nonempty valid full tag matching the candidate (a leading
`v` is accepted); null/wrong types and different preview/build identities reject.
Legacy receipts lacking both fields retain core validation. No build.rs or feed
version policy is replaced by this module.

SemVer prerelease/build ordering is implemented explicitly. Stable accepts only
formal releases, Preview accepts prereleases and formal releases, and Daily
accepts newer prereleases whose identifiers include `daily` (for example
`v0.1.0-preview.3.daily.20261119`). A stable `0.1.0`
never updates to `0.1.0-preview.N`, including on preview channel. Stable channel
with only preview.1/.2 releases reports no stable publication, not a network
error. Today's release pipeline keeps `package.json`/Cargo/plist versions stable
while release tags may add a preview suffix; receipt/plist identity compares the
tag's **core**, and upgrade eligibility compares the full SemVer tag.

macOS ZIP32 validation checks central/local names, metadata, extra fields,
entry types, duplicates, overlap, descriptors, count and advertised expansion.
It then reads every stored/deflated stream with bounded input/output buffers,
counts **actual** output (2 GiB total and exact entry size), validates CRC32,
stream termination and compressed byte consumption, and applies a 90-second
work deadline. Deflate uses incremental `Decompress` steps so even zero-output
blocks are checked against the deadline; budget violations fail before a chunk
is written. ZIP64 sentinel values and 0x0001 extras in either header, multipart,
encrypted/link/device entries fail closed. There is no `ditto` extraction.

Staging copies the package once through a 1 GiB budget and published SHA-256 into
a private 0600 file inside the private adjacent stage, immediately unlinks its
name, and uses that same retained descriptor for full validation and extraction.
A download path replacement or in-place mutation cannot substitute unchecked
extraction input: the snapshot hash must match. Extraction repeats actual-byte
bounds and CRC, creates files exclusively with openat/no-follow, traverses only
retained directory descriptors and never restores archive links or AppleDouble
metadata. No unchecked system extractor or post-extraction walk supplies the
budget. The existing walk remains a defense in depth, and the extracted native
Mach-O hash, exact executable, com.local.notesclone/core version, arm64 and
codesign --deep --strict checks remain mandatory. Failure cleans the unhanded
off private stage. This proves package identity/ad-hoc integrity, not Developer
ID, same signer, notarization or real package acceptance. Translocated,
disk-image/development/non-writable locations remain rejected.

After the guard, a private helper waits for the old PID to exit, rechecks live
and staged native hashes, renames the old bundle to its unique adjacent backup,
and moves the candidate into place. A stage rename failure **before attempting
launch** may restore/reopen the old bundle. Once the opener has been attempted,
its error or a missing ACK does not prove that a new process stopped: the helper
never automatically rolls back or starts an old host. It records
`recovery_required`, retains candidate/backup/transaction/report, and tells the
user to safely stop the application before manual restoration. A late ACK does
not change this terminal state; acknowledge_launch refuses it. No guessed PID
is killed, and a second host is never opened by this failure path. A valid ready
ACK within the wait records complete. The backup, receipt and log remain;
there is no recursive deletion after handoff or privilege escalation. Power
loss/SIGKILL between directory renames also requires recovery from the retained
`.CyberNote-rollback-*`/pending.json; this is not an atomic filesystem exchange.
Helper success only means host readiness, not content-sync/device acceptance.

Android checks package SHA-256, the release receipt and the ZIP header before
keeping the download in its private cache. For manual installation, get the
signed APK from the release page and open it with the system installer. Android
enforces signer continuity for updates. The app has no direct installer or
external-file export integration.

Release checksum/receipt publication is trusted through GitHub HTTPS. There is
no project-signed checksum manifest/attestation key today. UI does not import
magpie's ed25519, Sigstore, same-team or notarization claims.

## Isolated verification

Run from the assigned checkout:

```sh
python3 scripts/verification/settings121-update/verify.py --commands --identity-fixtures
python3 scripts/verification/settings121-update/replace-proof.py
python3 scripts/verification/settings121-update/helper-blocking-proof.py
node scripts/verification/settings121-update/ui-blocking-proof.mjs
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

## Blocking-fix handoff (U1–U5 and D5 native identity)

The frozen review input is cfde38103f71d0dd1fdf3e60a5c720a63abb2461;
its independent review is docs/plan/reviews/settings121-update.md. The fix keeps
that document unchanged. `native-blocking-proof.py` runs actual frozen/current
source mirrors and demonstrates the same U1 central-size/ZIP64 and U3 native
admission assertions fail on the old source and pass on the fix.
`helper-blocking-proof.py` demonstrates the old host-reopen failure with a live
replacement child, then verifies no-ACK/opener-error/late-ACK retention and valid
ACK completion; every synthetic child is terminated and waited. The current
helper intentionally has no unsafe automatic post-launch rollback.
`ui-blocking-proof.mjs` loads frozen/current React code and controlled clients:
old configure retry invokes check and old controls measure30×18/no label; fixed
retry retains the original patch even with stale download/install retry state,
and switches measure44×44 with labels, edge/disabled/keyboard behavior.

D5 adds no build.rs change: the integration owner supplies
CYBERNOTE_RELEASE_VERSION. The identity fixtures compile the actual helper with
unset/empty/preview env, verify conservative fallback versus preview upgrade,
reject same/older tags and mismatched installed core. Optional receipt full-tag
checks are exercised in both top-level and buildInfo locations, including
mismatch, malformed, null and legacy omission. Confucius should include these
small D5 native changes in the U1–U5 fix review; they do not replace the release
metadata worker's build-time/publication tests.

All checks remain module/harness evidence. No actual release ZIP/bundle is
installed, no installed application is replaced, no user service or account is
contacted, and no full Tauri/sidecar build is performed. Real bundle support
(including any AppleDouble/resource-fork expectations), all-window quit lease,
readiness timing and package/platform acceptance still need integration proof.
