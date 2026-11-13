# Three-peer current preflight — static review 01

Date: 2026-11-13. Role: independent reviewer. **APPROVE for source integration on static review; the previously reported P2 is closed.** No remaining blocking finding was identified within this review scope. This is not runtime or three-peer acceptance.

## Exact scope

- Contract: `docs/plan/tasks/app-account109-three-peer-current-preflight.md`, item 2 and the device-free matrix at main `88c183713871eb1386de9d4274c1c82bd1f97938`.
- Initial source review: `6d53c58c025b09be294d8ca757721e569828ee30`, covering the preflight helper, runner integration and the two associated fixture files.
- Final corrective source review: `a2457983cac139ea74714f5041ce12df3e8bd60d`, limited to closure of the failure-preservation finding and its immediate caller/report behavior. Its helper Git blob `994c2bd91f3cc8dd28d03a718fcbdda7f3b811fa` is identical to the previously inspected `130e343778e0eec428969cb7f022b5489775a325`; the only file difference corrects fixture expectations to C/B failure and A success for union checks, and four total preservation failures. This diff was inspected without executing the fixture.
- The author's worktree was clean when inspected; its observed HEAD had advanced to docs-only `22f06cb37a5914a63f380a85f04fdd8f8f70cd55`. That later receipt is not a substitute for source review or execution evidence.

## Closed finding

The initial implementation stopped `verifyOriginalSources()` on its first exception. Production sources are ordered C/B/A, so a phone read or preservation failure could prevent both desktops' final checks. The single outer catch also omitted per-device outcomes.

At corrective commit `a2457983`, `account109-three-peer-preflight.mjs:134` introduces `originalChecks()`. Each source is awaited inside its own try/catch; a failure produces only a device label, finite status and classified code, then iteration continues. Source/union verification helpers throw only after their respective complete result lists have been collected.

At the same commit, `preserveBeforeCleanup()` independently collects `sourceChecks` and, after a completed merge, `unionChecks`. An incomplete merge records union entries as `not-checked` with reason `merge-not-completed`; it does not misclassify absent remote originals as lost local data. Source failures do not suppress the union attempt. Full before-cleanup success requires all three source checks and all applicable union checks to pass.

Failures retain their device and source/union scope in `originalPreservationFailure.failures`; `report.failure ??=` preserves an earlier scenario failure. Ordinary peer read/preservation exceptions are classified within the loop. The runner's existing finally sequence still proceeds from preservation to `finishThreePeers()`, whose owned-close operations use `Promise.allSettled`. Preservation failure sets overall failure, and successful teardown cannot turn it into PASS. These are conclusions from source control flow, not observed cleanup behavior.

The added synthetic fixture describes first-C read/change failure, a further B change, continued A inspection, source/union result separation, retention of the original failure, safe reporting and owned cleanup. **Its source was read only; neither this new fixture nor any other test was executed in this review.**

## Integration disposition

The original four-file implementation is connected to the production runner path: fixed Mac/Android candidate hashes, fixed historical owner, healthy paused prerequisites, the exact current phone snapshot, complete A/B source semantics and authorized attachment-byte proofs precede runner enable/sync/test writes. Overlapping original IDs must agree. Original source data and the document-referenced cross-peer union are checked at the declared stages. Unreferenced recovery descriptors remain protected at their source, consistent with `src-tauri/src/store/synchronization/projection.rs`; they are not represented as guaranteed remote media. The original phone attachment's provenance remains unexplained.

Integrate `6d53c58c` plus final corrective commit `a2457983` together, followed by the author's docs commit `22f06cb3`. Preserve main's independently owned pause-sampling fix when resolving the shared runner file; do not replace that file with the author's older baseline. The pause-sampling task is outside this review's approval scope. This review does not approve starting the runner or resuming automatic tests; the user's pause and manual-testing handoff remain in force.

## Validation boundary

Only Git metadata/diffs and source text were read. No tests, newly added tests, module execution, syntax/build command, product build, App/device/ADB operation or network request was run. No private snapshot/body, database, grant or credential content was read. No author files were changed. No new runtime receipt, successful authentication, data-preservation run, three-peer or relay PASS is claimed.

This docs-only review was written in the existing reviewer worktree `/private/tmp/cybernote-account109-login-surfaces`, clean at base `e14529f0affa4daa9a2f08740fa4d279dba15d0e`. Its commit is suitable for parent cherry-pick independently of the source commits.
