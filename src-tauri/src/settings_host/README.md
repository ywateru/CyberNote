# Settings121 application host

This directory assembles the settings modules against the process's one
`AppState` / `Session` / `Store`. `lib.rs` manages each module once and registers
all commands in both invoke handler lists. No port opens another database.

`Host` owns window readiness, native archive preview bytes and the quit lease.
The Session owns quiet operation state. A settings-owned quiet operation uses
existing `notes-sync` probe/prepare/held-media messages and the real App
`NetworkSync` / `windowWrites` coordinator. The normal P2P coordinator cannot
advance a settings-owned operation. The holder releases it on all error paths;
no Session mutex is retained across ACK, network or whole-media verification.
The App prepare ACK flushes `ConfirmedSettings` as well as the existing document
queues. Recording, IME and attachment targets defer a snapshot.

Backup snapshots use checked `Session::stage_archive` and immutable bytes.
Restore is additive import with an immutable preview, full Store instance/content
and settings fence, real `importArchive` save ACKs, a recovery snapshot obtained
inside that barrier, then the existing Session finish/incarnation/MCP maintenance
path. A committed receipt is retained on maintenance/refresh failure. File-based
plain/encrypted import/export uses native pickers, bounded codec and document IO.
Private backup folders use the backup owner; ordinary export still cannot target
the live Store. Android has no external directory chooser or pretend SAF support.

Cloud checks a native `Context` and opaque config lease independently of the
account owner. Original wire validation precedes namespace translation. Receive
uses receipt media capabilities; apply obtains a new full media capability and
uses the Session quiet final gate. Portable settings apply in the same SQLite
transaction as note/folder/attachment projection. Complete cloud generation
includes sync-only state and the module's effective portable-setting owner values;
archive restore additionally checks all settings bytes. Theme maps to
AppearanceV2.schemePreference and view maps to PresentationV1.desktop.collectionView;
the module preserves themeId, navigation/density/mobile and unrelated fields.
The host never projects theme/view a second time after SettingsPort.apply.
Store opening validates an existing cloud-settings extension before initialization/
recovery and commits only the module's exact complete legacy-trigger migration.
A missing singleton, persisted capture=0, partial or unknown schema is rejected,
never repaired. An absent extension is not installed at open/inspect; only a
confirmed capture can initialize local sync/portable-setting history.

Every final cloud transaction acquires `Lease::enter()` before Session, then
uses only `CheckedLease::check_workspace/binding/check` on that held guard. No
Lease re-entry or CloudRuntime.state access occurs while it is held, including
when a configuration Save writer is queued. Full media/network work remains
outside both gates.

Installation uses a native confirmation and the App's actual recording/OCR final
save routines. All document windows seal before any final save ACK. The native
recording registry then lends its existing admission seal; Session rejects new
writes while the updater owns the lease. Old operation IDs cannot release that
lease. Exit still goes through existing recording/account orderly shutdown;
`app.exit` returning does not establish that the PID exited. The updater owns
helper/PID/ready-handshake/rollback policy, not this host. Readiness is reported
only after trusted workspace loading and all save/quit listeners are installed.
Native main/all live document readiness precedes updater launch acknowledgement.

The native timer is one app owner, independent of React settings visibility.
Its serial cloud/backup tick waits for a ready main window. Closing settings
only stops component polling. Exit cancels cloud work, cancels and joins the timer,
and shuts down the updater scheduler. Corrupt module state is retained and the
module becomes unavailable; initialization never resets it to defaults.

Targeted evidence (fixture scope is explicit):

```sh
CARGO_TARGET_DIR=/private/tmp/cybernote-settings121-native-target cargo test --offline --locked --manifest-path src-tauri/src/settings_host/harness/Cargo.toml --lib settings121_
node scripts/verification/settings121-integration/actual-app.mjs
pnpm typecheck
pnpm build
# Generate the actual sidecar first; do not create a placeholder binary.
node scripts/bundle-mcp.mjs
CARGO_TARGET_DIR=/private/tmp/cybernote-settings121-native-target cargo check --offline --locked --manifest-path src-tauri/Cargo.toml --lib
CARGO_TARGET_DIR=/private/tmp/cybernote-settings121-native-target cargo check --offline --locked --manifest-path src-tauri/Cargo.toml --lib --features access-boundary-proof
```

The lean harness tests actual Store/Session/portable SQL and window receipt state;
it does not create native Tauri windows. The actual-App browser script substitutes
only the native invoke boundary and device/OS fixtures and establishes the real
App/component route to invoke, including quit listener lifetime. Neither is an
installed application, account transport, actual cloud service or native update
installation acceptance. The integration branch is not a delivery-pass receipt.
