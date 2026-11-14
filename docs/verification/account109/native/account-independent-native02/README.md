# Protocol-only adoption: editor authority and release recovery

2026-11-14. Author evidence for exact source **ca7545967d77a10b06ddab592359aa1fd04f1e0e**. Independent all-native approval remains required. This is the next source delta after a675d959 + 2d0e228a; the earlier receipt f60b957a and its failed/passing logs are unchanged. Store/Session base includes author213b1a5a via bb5bfe3b. No candidate build, App/device/default library/account/credential or external network operation occurred.

## Correction to review01 P2

The old post-commit destructive access event is removed entirely for protocol workspace adoption. The local editor Session ID, global/note/local media token, attachment window incarnation, unlocked keys, metadata_event and last_commit belong to the unchanged local library. Store adoption keeps its instance rotation (including A→B→A); sync plans and VerifiedMedia generations retain that instance. Native old backend epoch/device checks, stop/join, all-window freeze/flush/ACK, and final same-lock ready checks remain.

Session no longer implements sync_finish_workspace_adoption. In particular, quiet.completed is not reset after sync_release_workspace_adoption(true), so original-Session commit receipt recovery remains usable. Real lock/delete/revoke or library replacement paths are unchanged.

Adapter retains the original notes-sync release before the fallible broadcast. It replays pending release before the same-workspace/device no-op return or any other adoption. A partial/failing broadcast leaves the original payload queued. Only successful emission clears the queue; activation cannot reach complete_adoption before that point. Successful signout also settles the queued release before removing binding/marker. This is process-local because a full process exit destroys all old renderer sessions; persistent marker still suppresses restart auto-enable.

No notes-access event is emitted for adoption, including retry. Repeated original releases use the existing production NetworkSyncCoordinator operation/session and finishing/completed rules, so successfully released windows do not perform a second committed read or lose a new draft. No new IPC, frontend source, provider, token destination, manifest pin or Store file changed in this delta. The task contract and architecture explicitly record this boundary.

## Focused verification

Default-feature library tests used the sole shared target, locked/offline, jobs2, DEV/TEST debug0, incremental0, with a10GiB free-disk stop guard. Exact commands/environment/source and before/after lock hashes are in receipt.json.

- workspace_adoption: **14 passed /0 failed /0 ignored**. Includes the revised A→B→A test: old prepared plans/media rejected by Store instance generation, local tokens/attachment incarnation and metadata/commit caches retained; original quiet commit receipt preserved while old committed-resolution reads remain instance-fenced.
- account:: **52 passed /0 failed /0 ignored**. Includes two real Session participants and two consecutive partial release failures. First participant saves new content through Session.register_save/save with its original token. The second participant obtains the original commit receipt. Same-pair retries preserve the Store instance/content, retain marker on repeated failure, clear it only after final release success, send byte-identical original release to both windows, and never emit notes-access.
- release-consumer.mjs executes **unchanged production src/network-sync.ts** in memory using the existing TypeScript installation (no install/frontend build). It verifies duplicate release during an in-flight committed read invokes that read once, missed second-window release recovers, and later replay preserves the first window's new draft and releases each lease once. The exact production source hash and PASS result are in release-consumer.json. The native multi-window fixture and this consumer test cover different boundaries; neither is GUI evidence.

Native commands exited0; source was clean before/after, recorded lockfile hashes unchanged, approximately12.57GiB free afterwards. Controller exited and shared target lease was released after these commands. No Cargo or package build is pending. Existing compiler warnings remain visible in logs.

Previous native01 residual boundary remains: arbitrary damaged projection receipts with no actual projection changes are not automatically repaired. This correction addresses review01's post-commit notification/authority finding; it does not expand that separate recovery scope or claim real account switching/enable acceptance.

SHA256SUMS covers this README and all selected receipt/log/fixture payloads. Historical archives are not rewritten.
