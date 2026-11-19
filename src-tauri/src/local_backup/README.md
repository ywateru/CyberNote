# Local backup core and native host contract

Implemented here: versioned local configuration, private atomic publication,
checksummed backup files, per-library history/retention, native scheduling policy,
one-shot restore previews, a durable pre-import protection sink, and an in-memory
Argon2id/AES-256-GCM encrypted archive codec. No Store, account store, grant owner,
or second save queue is created. The module runs with injected checked ports;
the lightweight tests execute the production core. Native application wiring is
owned by the integration worker and is not present in this isolated change.

## Exact native integration

In `lib.rs`, the integration worker adds the following module declarations:

```rust
mod local_backup;
#[path = "local_backup/commands.rs"]
mod local_backup_commands;
```

Implement `local_backup::BackupPorts` using the existing process-owned AppState /
`ui_session` / Session services. Construct one `Arc<BackupRuntime>` during app
setup and manage `local_backup_commands::LocalBackupState(runtime.clone())`.
Constructor arguments, in order:

1. A private application-owned configuration directory, outside logical archives.
2. Default app-private backup directory (for example Store root/backups), owned by this module and separate from attachment/import staging directories.
3. The existing Store root, obtained from `data_management.rootPath` or its current
   data method. This is for display; no public Store field is needed.
4. Application version from the native package version.
5. `Arc<dyn BackupPorts>`.

Runtime construction defaults to `BackupDirectoryMode::PrivateOnly`. The desktop
host may opt in with `.with_selectable_directory()`; Android remains private-only,
including when that method is called. `BackupStatus.directoryMode` exposes the
native capability. In private-only mode a directory patch is rejected and any
existing unsupported directory override is reported without being overwritten.
The UI omits change/default controls even if a chooser was accidentally supplied.
Android retains existing single-document import/export; no SAF tree claim is made.

All paths must be canonical absolute POSIX paths without symlink components. The
host establishes directory/library identity and rejects unsafe destinations. On
macOS canonicalize the trusted app-data root once (`/private/var`, not `/var`).
Do not canonicalize an arbitrary selected backup file to bypass link checks.
The module supports ordinary native filesystem directories; a `content://` SAF
tree is not a filesystem path. A host picker must report that limitation instead
of pretending to save into such a tree.

Register **all five** commands in both invoke-handler lists:

| Command | Additional arguments | Return |
| --- | --- | --- |
| `local_backup_status` | none | `BackupStatus` |
| `local_backup_configure` | `patch: ConfigPatch` | `BackupStatus` |
| `local_backup_now` | none | `BackupVersion` |
| `local_backup_prepare_restore` | `name: String` | `RestorePreview` |
| `local_backup_restore` | `confirmation: String` | `RestoreResult` |

Each also accepts `expected: ExpectedSession` with the exact Session Token wire
shape `{sessionId, epoch, noteEpoch?}`. The WebviewWindow label is injected by
Tauri, not accepted from JavaScript. Convert the expectation to the existing
Token and validate it against the current Session; never trust a renderer
`active`, `blocked` or purported authorization flag. The adapter does not retry
an error or obtain a replacement Token. `commands.rs` is a real adapter but is
deliberately not included in the core-only harness; native macro/registration
compilation remains an integration check.

### Required checked ports

The precise signatures and exported DTOs are in `runtime.rs`:

- `authorize(caller, intent)` returns `CheckedAuthority { library_id, session, target_store }`.
  Check the actual calling window, current Token/session/library and application
  lifecycle. For write/automatic intents, check all native recording owners and
  competing archive/quit/access operations. The scheduler caller is a Rust-only
  enum variant. A configured interval does not establish permission by itself.
  Use the existing stable workspace/library ID for `library_id`, not a new ID per
  export and not an import incarnation; otherwise history would disappear after
  each restore. Incarnation/epoch/save-version validation remains the host's
  separate authority fence. `TargetStoreFence` contains the exact Store `instance`,
  complete opaque content/sync `generation` and `settings_sha256`. The generation
  must cover sync-only heads/inbox/tombstone changes, not just application rows or
  Session epoch. Preview and confirmation bind this fence; the final barrier gate
  must compare it again after asynchronous saves. A mismatch requires a new
  preview, not an automatically updated fence or an unconfirmed reimport.
- `export_checked(authority)` runs the existing editor save/quiet protection and
  captures with `Session::stage_archive`, reads the bounded original bytes, then
  returns those bytes for the backup owner to publish. Never call ordinary
  `export_archive` with root/backups: its existing target restriction correctly
  rejects the entire app root and must remain unchanged. Revalidate after asynchronous work and return the same
  library identity with the logical archive's original bytes. Do not export
  account files, MCP grants, passwords, local backup configuration or credentials.
- `preview_checked(authority, archive)` performs full existing archive/attachment
  validation without live-library writes, and returns counts plus a clear import
  summary. The module already verifies backup envelope, size and SHA-256 first.
- `restore_checked(CheckedRestore, RecoveryWriter)` uses the existing
  `importArchive` save barrier. After all participants' saves have drained, obtain
  the current logical archive and call `RecoveryWriter::write(ExportSnapshot)`.
  Abort on any protection failure; only then commit via Session and return the
  normal mutation delivery in `CommittedRestore { delivery, maintenance_error }`.
  `Err` is reserved for known pre-commit failure. Once the DB import commits,
  maintenance failure is an explicit committed outcome, never an import failure
  suitable for retry. `RestoreResult.outcome` is `committed`; the frontend adapter
  catches subsequent hydrate failures as `refreshError`, closes the confirmation,
  and never repeats import. The same committed-result contract applies to
  encrypted `confirmImport`. Host IPC-loss recovery must use the existing commit
  receipt/operation status; never infer "not committed" from a lost response. The host must revalidate authority/library/version
  after awaits, follow existing facts/metadata publication, and hydrate through
  the existing frontend path. Port futures must be cancellation safe: no detached
  mutation may outlive its Session operation owner. Hold no Session mutex while
  waiting for windows, native dialogs, network or process work.

**Host API addition required for protection inside the barrier:** current
`Session::export_archive` and `stage_archive` reject any pending barrier. The
integration worker must expose a checked recovery staging operation after all
save acknowledgements and before import commit. It must check operation ID,
participants/readiness, expected Token, current library identity and save fence,
then serialize current bytes while still owning that barrier. Do not bypass the
barrier with a direct Store import, and do not export before acknowledgement as
the recovery snapshot (another window may still have an accepted pending save).
This change is outside this worker's allowed files and has been reported early.

The existing archive import retains local entities, remaps colliding IDs and
updates portable settings. Restore here deliberately uses that explicit import
semantics. A recovery version is an importable snapshot of the prior library;
this implementation does not claim destructive in-place rollback. Both ordinary
and pre-restore snapshots capture only the current business projection, not every
historical head, pending inbox version or purge tombstone. Existing conflicts,
inbox, frontiers and tombstones must survive additive import; no sync reset,
workspace adoption, destructive SQL or restoration of old sync tables is allowed.
The current protection snapshot is retained by the publication that creates it.
MCP maintenance pause, incarnation invalidation and commit receipts remain owned
by the existing host import path.

### Scheduler lifetime

The application host starts exactly one native timer (a 60-second cadence is
sufficient), calls `runtime.tick(now_ms).await` serially only while the app is
running, and cancels **and joins** it during app shutdown/owner disposal. There is
no webview tick command and no backup scheduler in React. Use the host's checked
scheduled authority; validate it on every tick/export and never refresh a stale
Token in a retry loop. An error latches automatic scheduling off. Only an explicit
authorized configuration update clears that suspension. Closing settings only
stops status polling, not the app-owned timer. Default `hours=0` makes no export
and calls no scheduler authorization port.

The last verified non-recovery backup determines the next due time; without one,
an enabled schedule is due on its next valid tick. An automatic backup is a full
snapshot even when bytes did not change. Already existing versions remain when
automatic backup is disabled. There is no wakeup, daemon or closed-app backup.

## Files and failure behavior

`local-backup.json` version 1 stores only hours (0/1/6/24/168), keep (3/7/14/30),
and an optional directory override. Missing means defaults (off, 7, default
directory). Empty/malformed/unreadable/unsupported files are unknown and fail
closed. A patch preserves missing values; explicit hours 0 disables scheduling,
and directory `""` restores the default. Non-0600 config is rejected. Config writes
use a same-directory 0600 temporary file, fsync, atomic replacement and directory
fsync; unchanged bytes are not rewritten. Advisory file locking serializes module
writers, and the previous bytes are reread before replacement to detect external
edits. External editors should cooperate with the lock; the module cannot make a
filesystem CAS against an arbitrary writer that ignores it.

Each `cybernote-<uuid>.cyberbackup` contains `CYBNBK01`, a little-endian u32 header
length, a bounded JSON manifest, and the original logical archive bytes. Manifest
contains format/version, ID, application version, library ID, milliseconds,
reason, scope (`currentBusinessProjection`), byte length and SHA-256. Earlier v1 manifests without scope are read as this same projection-only scope. Files are 0600, created directories 0700. All
traversal and file operations use pinned directory descriptors and no-follow
opens; linked/non-regular/multiply-linked/foreign-owned files are refused.
Listings stream-hash each backup, expose corrupt/unreadable candidates as issues,
and never equate unreadable bytes with a valid/empty backup.

Publication refuses overwriting existing destinations. Retention runs only after
durable publication and a successful reread, retains the newly published file
even under clock rollback, and only handles verified versions of the current
library. Candidate cleanup atomically quarantines and revalidates bytes before
unlinking. Changed/unknown files are restored without replacement or preserved as
quarantine evidence. Other files, damaged versions, links and other libraries are
not deleted. A cleanup failure returns an error; the new durable file remains,
and a restore must abort rather than lose protection. Crash leftovers remain as
evidence; arbitrary temporary files are not swept. The hash is corruption
detection, not an authenticity signature against the filesystem owner.

Restore previews expire after five minutes, bind window/session epoch/library/
target Store instance + full generation + settings hash/directory/name/manifest, and their confirmation is consumed on the first attempted
commit. Commit rereads and checks bytes. A changed file, wrong window/library,
expired/revoked Token or failed barrier does not call the import commit.

## Encrypted archive integration

`seal_archive(&bytes, password)` and `open_encrypted_archive(&bytes, password)` are
complete in-memory codecs. `CYBENC01` uses the same Argon2id v19 default profile
as Store (19 MiB, 2 iterations, 1 lane), a new random 16-byte salt, random 12-byte
nonce and AES-256-GCM, with the fixed header authenticated as AAD. Input KDF cost
cannot be raised by an attacker. Plaintext is bounded at 256 MiB; use exported
`MAX_ENCRYPTED_ARCHIVE_BYTES` for bounded encrypted reads. Authentication failure
returns no plaintext and performs no filesystem/Store writes.

To expose file-based encrypted import/export, the integration worker supplies
the frontend `EncryptedArchiveHost` alongside App's normal archive handler:
native file selection, `windowWrites.cancel` + flush + recording recheck, bounded
read/encrypt/decrypt using these codecs, existing archive validation/preview, an
expiring host-owned prepared import, recovery snapshot, the existing Session
barrier and hydrate. Keep passwords in transient call arguments only. Existing
export-target restrictions and Android document staging still apply. The optional
encrypted controls are absent until this functional host is supplied; no
unimplemented native encrypt/decrypt command or fake success path is registered.

## Targeted validation

Run from the isolated tree, using a target directory outside source:

```sh
CARGO_TARGET_DIR=/tmp/settings121-backup-target cargo test --offline --locked \
  --manifest-path src-tauri/src/local_backup/harness/Cargo.toml
CARGO_TARGET_DIR=/tmp/settings121-backup-target cargo test --offline --locked \
  --manifest-path src-tauri/src/local_backup/harness/Cargo.toml \
  --features real-store-proof local_backup_store
pnpm typecheck
pnpm version:check
git diff --check
```

Default tests use only temporary directories and controlled checked-port futures.
The optional, filtered proof uses real production Store, Session, archive and
attachment code and exercises the existing import acknowledgement barrier. It
does not implement or certify the new host recovery staging hook, installed
native scheduling, macOS WebKit, Android WebView/SAF or physical device behavior.
Do not run the remaining application tests just because they compile into this
test executable; only `local_backup_store` is selected for this proof.


## Settings boundary (D7)

This module uses the existing explicit manual archive settings semantics: archive
settings are applied by the existing additive import path. They are not advertised
as a newly defined cloud-portable settings DTO or a complete machine backup.
`local-backup.json` is separate app-private configuration and never part of the
logical archive; import cannot restore another machine's backup path, interval or
retention choice. Private account/MCP authorization files are not archive inputs.
Do not add those fields to Store.settings. Any shared portable-settings whitelist
or credential projection is owned by the canonical archive/host contract, not by a
second settings merge in this module.
