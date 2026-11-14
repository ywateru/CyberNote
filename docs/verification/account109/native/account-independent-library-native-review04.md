# Account-independent library — complete native review 04

2026-11-14. **BLOCK: one P2 remains in the complete native integration.** Exact review range: `f423617327a260517702616d28ebd0bad4211050` → `47e14bcc9cf1393e00109f1b9e9ba781182af019`, all native/crate product differences and changed fixtures (14 files; 2104 insertions, 118 deletions). This replaces neither historical failure evidence nor the narrower recovery approval in review03. The six recovery files are byte-identical between author `a675d959ec9ead6a40fbf74209fdc4a9272dd1d3` and main `47e14bcc`.

## Finding ledger

| Earlier finding | Exact-main conclusion |
| --- | --- |
| Review01 P1: renderer-only work can be destroyed by adoption | **Closed statically.** Dedicated adoption quiet purpose obtains all-live-window probe/freeze/flush/prepare ACKs, targets every note, and rechecks participant set, intents, pending access work, epoch, Store instance, target set, policy generation and timeout under the final Session lock. Media preparation follows ACKs and is revalidated before the Store transaction. |
| Review01 P2: post-commit release/access delivery failure is not recoverable on retry | **Still open; blocks final approval.** Exact details below. |
| Review02 P1: offline retained restart loses connection recovery / wrong SignIn changes enable intent | **Closed for the reported bound-session network-error path**, as documented for the exact identical source in review03. Retained usable identity plus current binding supplies presentation, not remote authorization; SyncNow restores and validates before networking. SignIn's retained-grant guard precedes policy mutation. |
| Review02 P2: adoption refusal has no supported non-conflict recovery route | **Closed as an explicit supported route**, subject to genuine old-credential/media availability. Logout settles grant cleanup before unbinding; original manual or matching old-account recovery can resume. Dedicated local recovery handles nonempty projection changes even with no inbox digests, preserving normal quiet/media/final-plan checks. |

The new adoption purpose also avoids applying late old inbox data while waiting to switch namespaces. Empty/missing/changed participants, protected editors, late intent, timeout, replacement Store, changed epoch/targets and cancellation remain rejecting conditions. Abort cleanup is operation-specific and cannot release a replacement quiet operation. The all-note renderer path checks composition, pending/failed saves and media operations before ACK; the native adapter does not manufacture production ACKs. Actual multi-window runtime preservation has not been independently exercised here.

## Remaining P2 — preserve post-commit completion across notification failure

At `src-tauri/src/sync/adapter.rs:772–785`, Store adoption commits, `committed` becomes true, the old quiet operation is released internally, and Session authority rotates **before** the fallible `notes-sync` release and `notes-access` emissions. `session/synchronization.rs:353–366` changes the Session id and replaces the entire quiet state, deleting the just-recorded terminal receipt. Adapter cleanup at lines 789–800 runs only before commit, so neither post-commit emission failure retains a completion notification for retry.

The new renderer barrier makes the lost-release branch concrete:

1. All real windows ACK prepare and retain their quiet edit gates.
2. Store commits; Session rotates and forgets the old terminal.
3. The release emission at adapter line 782 fails or reaches only some participants; access emission is skipped. A missed window still has the old Session/token and a frozen lease.
4. Its existing 5.5-second renderer timer requests cancellation; it deliberately cannot unfreeze without a native terminal (`src/network-sync.ts:236–240,278–305`). Adapter `reply` checks the current window token before looking up the terminal (`adapter.rs:1175–1181`), and Session id has changed. Even retaining a terminal without a narrowly valid retired-operation receipt path would therefore be insufficient.
5. Explicit enable retry finds the DB already on the requested workspace/device and immediately returns from `adopt_account_store` (`adapter.rs:702–705`). Activation can clear the adoption marker (`670–671`) without replaying the old release or access snapshot. New-Session probes do not repair a window which still recognizes the old Session. Restart can bootstrap a fresh window, but the current explicit retry is not the requested completion recovery path.

If release succeeds and only access emission fails, the renderer commit callback's trusted metadata read may recover that window. That partial defense does not close the failed/missed release branch or establish recovery for every participant. No data loss is inferred from this failure; the proven issue is stale/frozen window authority after a committed migration and an apparently successful later activation.

Required correction: retain a pending adoption completion/authority publication until affected live windows can obtain the committed terminal and trusted new snapshot, including partial delivery. Retry of an already-adopted pair must reconcile that completion before clearing its pending state. A narrowly scoped retained-operation receipt/resynchronization path must validate the original participant and operation without accepting retired tokens for ordinary writes or new operations. Do not roll back a committed DB, weaken normal authority checks, or let a renderer timer guess abort.

Minimum meaningful regression: inject failure on the first post-commit release emission, retry the same workspace/device, and establish exact business/media preservation plus recovery of the original window(s)' freeze and authority. Include partial two-window delivery and access-only failure. Existing always-successful AdoptionWindows fixtures and passing Store SQL/Session handshake fixtures do not cover this branch.

## Other native boundaries reviewed

Login and local-library ownership are separated without weakening pinned issuer, profile subject, product/workspace, signed enrollment, audience/signature or Noise matching. Historical account-device reuse requires the remote profile and exact current Store pair plus existing matching key; it remains paused. Manual/account backends are fenced by captured epoch and Store device; media work rechecks authority after filesystem preparation. Namespace-specific staging remains native-selected.

Store adoption rejects unapplied inbox, concurrent/missing/mismatched projections and unpreserved content/media. Dirty capture, protocol teardown/rebuild and current-library bootstrap share a SQLite transaction; business rows/files are retained. Store instance changes only after commit and participates in plan/media generations, preventing A→B→A capability revival. Adoption markers precede enable intent and interrupted startup remains paused. This is source analysis; the separately reported Store 12-test pass and UI reviews are not relabeled as my independently executed results.

No independent test or compile was needed to establish the remaining control-flow failure. No target was acquired while Huygens was preparing focused verification. No build, module/export, application, device/ADB or network action ran; no real store/DB/grant/private baseline was read. No product, manifest, main/author tree or previous evidence was changed. This new review is the only reviewer write. Preserve review01–03 and their commits as the historical blocker/correction record.
