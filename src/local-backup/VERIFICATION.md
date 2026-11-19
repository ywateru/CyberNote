# settings121-backup verification

Date: 2026-11-19. Isolated implementation tree:
`/Users/water/work/2026/.cybernote-worktrees/settings121-backup`.
Base source: `f4cc23082a1e013940480b83de32877eb3bce8b0`.
The delivery commit reported by this worker contains the tested implementation;
the final message gives its exact SHA. This receipt does not certify host wiring.

## Completed evidence

| Check                                            | Result and boundary                                                                                                                                                                            |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core Rust harness, offline/locked                | 12 tests passed; actual production local_backup code, temporary directories, serialized bytes, no Tauri                                                                                        |
| `--features real-store-proof local_backup_store` | 1 selected test passed; real Store/Session logical export, backup encode/decode, settings/body/attachment original bytes, acknowledged import barrier and preserved local entity               |
| `pnpm typecheck`                                 | Passed for this tree including the new exported frontend contracts                                                                                                                             |
| `pnpm version:check`                             | Passed; product remains 0.1.0                                                                                                                                                                  |
| React/Vite/Chrome fixture                        | Passed; controls, radio keyboard behavior, archive handler route, confirmation, focus/Escape, password lifecycle, errors, stale picker/read, access blocking, optional archive-row suppression |
| Layout screenshots                               | 960px and 390px, light and dark; no horizontal overflow; active phone buttons >=44px                                                                                                           |
| Whitespace diff                                  | `git diff --check` passed                                                                                                                                                                      |

The 12 core tests include missing/partial/explicit-off config, preserved fields,
0600 and unchanged writes, corrupt/unsupported config refusal, actual payload
bytes and manifest/checksum validation, all four retention values, failed-new-
backup retention safety, foreign libraries/unrelated/corrupt-file preservation,
directory replacement and symlink/hardlink traversal defenses, disabled scheduling,
controlled recording/access denial without retry, delayed save revocation,
preview/expiry/window/identity checks, barrier/protection failures, and randomized
encrypted roundtrip/wrong-password/header-tamper zero-write behavior.

Screenshots are local test artifacts, outside tracked source:

- `/tmp/settings121-backup-ui/local-backup-960-light.png`
- `/tmp/settings121-backup-ui/local-backup-960-dark.png`
- `/tmp/settings121-backup-ui/local-backup-390-light.png`
- `/tmp/settings121-backup-ui/local-backup-390-dark.png`

The fixture loaded the UI worker's read-only `Preferences.css` at revision
`e29a7d8c0c6cec1accf4ee1599be283baa33cb10`. It uses the public shared classes and
workspace tokens. A pending shared CSS review changes `.settings121-text` to
gray regular text actions; this module has no independent action accent rule.
These screenshots precede that shared gray-action correction. No copy of the UI
worker stylesheet was committed. The original requested reference screenshot was
not supplied to this worker; visual comparison used the specified reference
source plus the reviewed UI worker primitives.

During development, browser regressions exposed a disabled-button focus timing
error; the component now waits until preview loading finishes before focusing
Cancel. The stale native-picker test waits for the actual React hide commit
before resolving the picker, then proves no configuration call occurs. Final
listed checks pass; no unresolved test failure is hidden.

## Remaining integration and acceptance

- Add module/native command registration to both handler lists, App-owned runtime,
  scheduler cancellation/join and checked port implementation.
- Add the Session barrier-owned recovery staging hook described in the native
  README. Existing `export_archive/stage_archive` reject pending barriers.
- Supply native directory selection/reveal, App cancel/flush/recording protection,
  expected Token validation and normal import delivery hydrate.
- Optional encrypted file import/export still needs that functional App/native
  host and prepared-import lifecycle; the pure authenticated codec and frontend
  typed ports/confirmation are implemented and tested.
- Compile/register `commands.rs` in the native host. The core-only harness does
  not compile Tauri command macros. No full Tauri build was run, as requested.
- Verify actual app scheduling, multi-window protection snapshots, native dialogs,
  real recording races, macOS WebKit, Android WebView/SAF, installed packages and
  physical devices after integration. Chrome fixtures and real Store unit tests
  do not establish these facts.

No real user library, backup directory, account store or running app was accessed.
Only local file changes and a commit in the authorized isolated tree were made;
there is no push, deployment or release claim.

## D2/D3/D7/D8 follow-up freeze

The follow-up commit (SHA in worker delivery) strengthens the host contract with
TargetStoreFence instance/full generation/settings hash, immutable manifest hash
binding, explicit committed maintenance results and client refresh-error handling.
It declares currentBusinessProjection scope, preserves manual additive settings
semantics and private module config, defaults native directory capability to
privateOnly, and omits unsupported chooser controls. The desktop opt-in is native
only. This supersedes the earlier "12 tests" count: 16 core tests are selected,
including generation/instance/settings stale previews, a delayed final host gate,
committed maintenance failure without duplicate import and private-only override
rejection. The real Store proof additionally exercises Session stage bytes to a
backup folder inside app root while ordinary user export to that folder remains
rejected. React checks additionally cover committed refresh warning with consumed
confirmation/no repeat, and private-only directory controls. These are module and
fixture evidence; the real shared host barriers and preservation of full existing
conflict/inbox/tombstone state still require integration verification.
