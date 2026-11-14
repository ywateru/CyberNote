# Account-independent library — final integrated native review 05

2026-11-14. **APPROVE — static source review; no remaining native review blockers identified in this exact integration.** Reviewed final main `c8e9e30d1498178f3e6d1e20b09332c9a08efad0` against baseline `f423617327a260517702616d28ebd0bad4211050`, carrying forward reviews01–04 and reviewing every native delta since their exact approved/blocked sources. Final pure-protocol author commit `ca7545967d77a10b06ddab592359aa1fd04f1e0e` and main c8e9e30d have identical native/crate product bytes. The complete native range changes 14 files (2205 insertions, 118 deletions). Since reviewed main47e14bcc, the only native differences are this fix and the corrected local-recovery fixture (`abe853f1`, author equivalent `2d0e228a`). No uncommitted author bytes were used for this final verdict.

This approves the complete native source integration, including the previously residual notification finding. It is not a build, actual account login, multi-window execution or sync acceptance result. Huygens's final focused tests were still in progress when this review was written; I did not independently run tests or claim their outcome. Source pins can now be refreshed against the approved exact product source; they were not changed here.

## Finding closure ledger

| Historical finding | Final integrated conclusion |
| --- | --- |
| Review01 P1: renderer-only content can cross adoption without preservation | **Closed.** All-live-window probe/freeze/flush/prepare ACK barrier and final locked rechecks remain intact. Pure-protocol adoption does not remove or bypass that barrier. |
| Review01/review04 P2: post-commit release/access emission failure strands windows; retry cannot reconcile | **Closed by ca754596/c8e9e30d.** Preserve local authority and the original commit terminal, retain/replay the original release, remove migration-specific destructive access publication. Details below. |
| Review02 P1: retained offline restart loses connection recovery; wrong SignIn changes enable intent | **Closed; prior review03 approval retained.** Usable retained identity is matched to the current binding for presentation, remote verification still precedes networking, SignIn's retained-grant Busy guard precedes enable mutation, and persisted pause/enable intent is preserved. |
| Review02 P2: safely blocked adoption has no supported recovery route | **Closed; prior review03 approval retained.** Logout can unbind after cleanup; original manual or verified exact old account/device can explicitly recover old projections before a target adoption. Missing old credentials/blob bytes remain prerequisites, without deleting data or silently fetching another workspace. |

Reviews01–04 remain historical evidence of the original defects and intermediate scope. This final ledger supersedes review04's residual BLOCK for the exact final source only; no earlier failed result is reclassified.

## P1: preservation barrier and atomic adoption

`Session::sync_begin_workspace_adoption` uses the existing quiet protocol with a dedicated adoption purpose. Probe includes every live document participant and rejects protected/composing/media-busy windows. Prepare targets all notes; renderer freezes editor authority, flushes pending saves and rejects save failures before ACK. Adapter waits for actual replies, verifies media after readiness, then rechecks under the final Session lock: operation, target pair, Store instance, epoch, unchanged participants/targets, timeout, no pending access work/intents/protected notes, current policy and Store preflight. The coordinator does not apply old inbox data through this adoption purpose, and pre-commit error cleanup releases only the original operation.

Store still rejects unprojected/conflicting heads, nonempty inbox and unmatched projection/content/media. Capture of dirty local content, old protocol table replacement and bootstrap of retained business content are transactional; failure preserves old protocol state and instance. Business rows, managed files and unlocked keys are not revoked by protocol migration. Nothing in the final fix weakens those earlier-reviewed gates.

## P2: real terminal query, replay and partial delivery

After the Store transaction commits, adapter records the original operation's commit terminal through `sync_release_workspace_adoption` and places the resulting release payload in `pending_adoption_release` before any fallible broadcast. It no longer calls the removed `sync_finish_workspace_adoption`: no Session-id rotation, quiet reset, attachment-window clearing, metadata/last-commit clearing or migration-specific `notes-access` remains. A post-commit emit error retains the pending payload; it does not fake an abort or roll back committed data. Replay runs before same-pair no-op/new adoption and before successful logout unbinding/marker cleanup. Replay failure leaves the payload pending; success clears only that pending broadcast. Account lifecycle serialization orders these adoption/logout callers.

Native emit success is not treated as proof of every renderer's recovery. A missed participant has the independent receipt path: `bridge.replyNetworkSync` invokes registered `lib.rs::sync_window_reply` with the existing AccessGate token; native obtains the real caller window label, `Runtime::reply` checks live membership and Session authority, and `Session::sync_reply` returns the original participant's retained terminal. No old-token bypass was added. Keeping Session/global authority and quiet completion state makes that existing path usable. A committed receipt reports operation/outcome only; a committed conflict-resolution read still rejects a retired Store instance.

`NetworkSyncCoordinator`'s existing 5.5-second watchdog requests termination/receipt rather than guessing abort. Commit handling awaits trusted metadata refresh and recording-editor commit before releasing the edit freeze. Concurrent duplicate commit events share `finishing`; an already-finished operation's repeated release only records the id, and an old release cannot release a newer active operation. It does not call `clearSensitive`, repeat a destructive access transition, or rehydrate a newly edited window for that duplicate. Thus window A's post-recovery editor-only draft is not targeted when replay recovers missed window B. The original release payload remains stable across retries; no second adoption or local-authority rollover is required.

Retention/restart boundaries are unchanged and explicit: quiet terminal history is bounded to 64 operations, not an unlimited durable renderer journal. Real lock/revoke/Session replacement retains normal authority rejection. Pending release is process-local; after full process exit old renderers no longer exist and a fresh Session initializes from committed data, while the disk adoption marker preserves paused/explicit recovery semantics.

## Local permission versus protocol authority

Final adoption preserves Session id, global/note epochs and tokens, attachment owner/incarnation, unlocked local keys, metadata_event and last_commit. It changes only protocol identity/state after the preservation transaction. Store instance rotates after successful commit and is included in plan and prepared-media generations; the generation cannot revive through A→B→A. Production backends additionally validate captured transport epoch and device before Store work, including after filesystem media preparation. Old transports are stopped/joined and invalidated before account replacement. Ordinary sync lock/delete/revoke continues to revoke keys/bump access and emit access events when required; the pure-protocol exception does not suppress those real permission changes. Issuer/subject/product/workspace, enrollment signature/audience and matching Noise checks retain the earlier-reviewed boundaries.

## Evidence limits and reproducibility

Read the committed partial-delivery fixture: two windows, release failures after the first participant, original token/commit terminal retained, pending marker retained until retry success, identical repeated release, stable Store instance, subsequent saved draft retained, no `notes-access`. The Session fixture covers retained global/note/media/attachment authority, metadata/local commit state, old plan/media rejection through a return workspace, and committed receipt distinct from a prohibited retired-instance resolution read. The local-recovery fixture now creates a real business/head divergence with no inbox, rather than only deleting a projection receipt.

These are **statically inspected test assertions, not my executed results**. The partial-delivery fixture directly calls `Session::sync_reply` and saves its draft; it does not execute `Runtime::reply` or a real renderer-only draft. The production registered-command/live-window gate and renderer duplicate/refresh paths were independently source-traced above and are unchanged since main47e14bcc. Using the Runtime entry point and an actual renderer draft fixture remains useful additional coverage, but is not an unresolved source defect. Prior rotation-plus-access-specific test requirements in review04 are superseded by the selected non-destructive design; no access event remains to replay. No build, test, module/export, App, device/ADB or network operation ran; no real DB/grant/baseline/account content was accessed. Shared target was not acquired. Only this reviewer document was written in the existing isolated review tree.

Selected final committed-byte SHA-256 values (computed with Git object reads, not worktree product files):

| Path | SHA-256 |
| --- | --- |
| `src-tauri/src/account/enrollment.rs` | `bc413b024593ccae1d89ab4f0d4d288104eac0a8ca70af29cc629eedd86d6a8f` |
| `src-tauri/src/account/mod.rs` | `777f16325de7930d50a305229ec79ae765610c67e895a14f54d4b3923811350c` |
| `src-tauri/src/session/synchronization.rs` | `f2d450364f35dc0bdbb051ce4b93d349159ccb1d14d03208bd539aecd431d4bb` |
| `src-tauri/src/sync/adapter.rs` | `4f974f86764eb61b7635f8f83f3444beddba2cc1f870ad9dc9ab904e98b8a3e3` |
| `src-tauri/src/store/synchronization/schema.rs` | `94f313524d222ca6210da9d8e4309c810fd7207c75352b95218a5443554af159` |
| `src-tauri/src/store/synchronization.rs` | `2e86196f4b7327377a67d9cc30659204dc4295f87c97bc750a0c553e6828b617` |
| `src-tauri/src/store/synchronization/media.rs` | `cefb8a207adf1cfae57ca129ab9db998b28d7318f59d105945b6a0473fcf413a` |
| `src-tauri/src/lib.rs` | `801a6410a742dbdcacf039257a018c9c2a1f78c17bb5c9024fefa156043ac52b` |
| `src/bridge.ts` | `a33300d798ca292a71fb8b1ff9c4269a2d16153b7df79567c1b21625029bae4e` |
| `src/network-sync.ts` | `3b46699920df0bd3fd6fc205399c489273505ba4cac095fd0f0c6cf3b939837e` |
| `src/App.tsx` | `78f7c08faec9b1687dc7bc93478048edb07ce6995a52b7b121be7e738fae5621` |
