# Bounded adoption media — independent native/frontend integration review

2026-11-14. **APPROVE. No remaining blocking finding identified for this exact integration.** Native author `602dd4146d7c5beac4a2338e2f9a92f7cb6775ef` (base `b8a6d846c6f6db39f1b97ae733c387a1b34c2f4a`), frontend authors `c9eb6d1c2d9aca8c1d1ef21d11710679a1cf12d6` + `935effdc0aa3dad6b41d55cd9962a8e35ca9ef7a`, integrated frontend main `60096dac2930c0f31abfb28672108c8f474afc0a`. Contract: `docs/plan/tasks/app-account109-adoption-large-library.md` at b8a6d846. Reviewed all four native changed files and both frontend deltas, including protocol/DTO/React tests.

The existing isolated review tree was fast-forwarded to main60096dac, then the exact native commit was cherry-picked as local integration `702f389c6a4cee82697ac22902cc0a49fce0b3b6`. All four native files were compared byte-for-byte against author602dd414, and the three frontend product files against main60096dac before and after verification. This report's commit is docs-only; cherry-pick that report commit rather than merging the review branch. No source pin was changed.

## Findings and closure

The WIP P2 reported during preliminary review is **closed**: previously `snapshot.verify()?` could replace an already-established media timeout with a late verifier error. Final code queries `sync_workspace_adoption_timeout_error(operation)` on verifier failure and again on success before other post-verification checks. It returns only that operation's retained timeout, or its currently expired non-cancelled adoption lease; it does not manufacture a timeout from arbitrary error text or a replacement operation. The independent native fixture passed both variants: established timeout followed by corrupted-media verification reports media timeout; the same verifier failure without expiry retains `sync_attachment_conflict`. Earlier WIP diagnosis remains historical, not a finding against this final source.

No blocker was found in the final lifetime/commit ordering:

- Probe and prepare retain separate 5-second monotonic deadlines. All prepare ACKs, exact participants, operation/pair, Store instance, Session epoch, no pending/intent/protected work, target set and Store preflight are checked before the single transition to adoptionMedia. Repeating the transition cannot renew it. The adopter advances only its own barrier while an older ordinary coordinator preparation is outstanding.
- Native adoptionMedia has one 60-second pre-transaction budget. Final checks include timeout, policy/generation, original authority, live windows, Store/media generation and the complete preservation preflight, with another deadline check after Store inspection. A cancelled, released, replaced or expired operation cannot authorize a late verifier result. Pre-commit cleanup cannot release a replacement operation.
- An admitted atomic transaction remains protected by the Session lock. No post-transaction deadline test invents abort for a real commit. A renderer cancellation queued behind that lock obtains the real commit terminal after release; its timer alone never proves rollback or success. Store/media atomicity and earlier account-independent-library fences remain intact.
- Only active adoption skips ordinary coordinator media work. The coordinator rechecks purpose after its outside-lock preparation returns, so an obsolete success/error does not install old media or abort the now-active adoption. This late-return branch was source-traced; no newly orchestrated concurrent verifier race is claimed. The independently executed fixture proves adoption advances despite deliberately corrupt ordinary media while ordinary apply still verifies and aborts. Store generation still rejects retired prepared capabilities after replacement.

## Strict frontend/native agreement

Native emits exactly `{phase:"adoptionMedia", operationId, sessionId}`; the frontend parser accepts that fixed shape and rejects extra fields, invalid identities and unknown phases. Only the same active/prepared operation, same trusted Session, valid original freeze lease and unprotected/unblocked state may receive the extension. Readiness is set immediately before invoking the prepare ACK, allowing native's accepted-ACK media event to arrive before its IPC promise resolves. Events during unfinished flush, wrong operation/Session, cancelled/finishing operations and duplicate media phases cannot extend the deadline.

The renderer retains the original lease, replaces the 5.5-second timer once with 60.5 seconds, and still obtains a real terminal before thawing. The follow-up timer fix checks the captured timer handle, operation identity and current Session. Independently executed tests cover queued old prepare callbacks after media extension, callbacks after operation replacement and Session replacement, duplicate phases, missing media event/ordinary timing and unresolved ACK IPC. They demonstrate the stale callbacks cannot cancel the replacement owner or defeat the media timer.

Native SafeError retains `account_sync_adoption_blocked`, adding only the paired finite `adoptionStage: probe|prepare|media` and `adoptionReason: timeout` for typed timeout variants. Terminal storage preserves timeout stage after coordinator release and cleanup; unrelated/ordinary errors do not gain the fields. Frontend validates the pair exclusively on that code, rejects partial/unknown/cross-branch fields and ignores upstream message text. Both status and direct-rejection React paths use fixed timeout copy; legacy blockage keeps its existing explanation. No automatic enable/retry was introduced.

Local Session/global/note/media-window permissions, unlocked state, metadata/local commit state, original participant receipt and pending release replay are preserved. The passing adoption filter includes the pre-existing partial-release retry, content/media preservation, transactional rollback and A→B→A stale-capability regressions. This correction does not restore destructive migration-specific notes-access.

## Independently executed verification

| Check | Result | Wall time including compile/startup |
| --- | --- | ---: |
| `cargo test --manifest-path src-tauri/Cargo.toml --lib --locked --offline workspace_adoption -- --test-threads=1` | **23 passed**, 0 failed/ignored; 287 filtered | 73.597 s |
| Same command with filter `account::types::tests` | **7 passed**, 0 failed/ignored; 303 filtered | 17.665 s |
| `node --test scripts/verification/account109-adoption-media.test.mjs scripts/verification/account109-status-dto.test.mjs scripts/verification/account109-login-surfaces.test.mjs` | **60 passed**, 0 failed/cancelled/skipped | 0.707 s |

These are independent executions, not the author's reported counters. No additional Session-wide run is claimed or added to the totals. The native adoption filter includes six new adapter tests plus existing Session/Store/enrollment regressions; controlled-clock tests simulate 25.766-second media work and expiry without wall-clock 60-second waits or large synthetic media. Native tests use tiny disposable synthetic Stores and explicit ACK fixtures; Node exercises the production coordinator and real React commits in device-free hosts. They are not GUI routing/layout, real-account enable or multi-device acceptance.

Used the released existing `/private/tmp/cybernote-account109-mac-ec4348c6-target-01` only, with `CARGO_BUILD_JOBS=2`, `CARGO_PROFILE_DEV_DEBUG=0`, `CARGO_PROFILE_TEST_DEBUG=0`, `CARGO_INCREMENTAL=0`, `CARGO_NET_OFFLINE=true`; commands were locked/offline and serial on the target. Free space observed 12.20 GiB before checks and 11.94 GiB near completion. The sparse checkout's one existing `docs/fixtures/smart-projection09.json` include was restored from exact HEAD before compiling. Existing main node_modules was reused through an ignored reviewer-created symlink, removed after the checks; the dependency directory was untouched. No new target/cache, install or dependency download was created. Post-run compiler inventory showed zero cargo/rustc/clang processes; shared target released.

Finite execution receipts/logs remain under `/private/tmp/account109-adoption-budget-review01`; no Stores or baseline payloads are archived here. Log SHA-256:

| Log | SHA-256 |
| --- | --- |
| `native-workspace-adoption.txt` | `25a82133bcd240669797b36c766dd6277a20dca7b7630dd9219a89d2e4ac2dd3` |
| `native-account-types.txt` | `287aafdddba31fbcafdefd0acab43aca5db3d6af66e5a22ec9df1265729185b0` |
| `frontend.txt` | `f7252eb1adbf607ea2d08c3bf61c9f9fc01b4386c450a2af2861677de7c2b043` |

No actual user data, DB/grant, private-copy evidence, GUI/App, device/ADB or account/network operation was accessed. The parent's private-copy Store diagnosis was read only as its finite committed report: it supports the architecture issue but does not establish the screenshot's unique failing branch. No product source was edited and no application build/package/export was performed; Cargo compilation was solely for the reported unit tests. This source/verification approval does not claim a successful real-library enable. Refreshing source pins and building a candidate are subsequent steps.

## Exact product hashes

| Committed path | SHA-256 |
| --- | --- |
| `src-tauri/src/account/types.rs` | `cb8d44ce044b32f4eff327e13c85ad363b75236a2e2a7da944ef91fec052047a` |
| `src-tauri/src/session/synchronization.rs` | `379c33c8f1da6795f3764f63d3cb108ac511c0bec9cda8eaacb0f3c8bec4f91f` |
| `src-tauri/src/sync/adapter.rs` | `d9e359fb2fb708541ee56337d29e7a8d0da076362aca8ab7c815af693ea9260f` |
| `src-tauri/src/sync/adapter_adoption_tests.rs` | `fa0c59d6f17276b435dfe1458b24451fb18f3534818b5e1c668e93fde3d9f304` |
| `src/network-sync.ts` | `f758815474bff8ff7a984e1c65bed0f807b597277de0c148ccc2e739b5d2597b` |
| `src/account-client.ts` | `d8aacd0a6786d05ee2994f5e2cdc6b1640856401ae4f73b63461685b651795db` |
| `src/AccountSettings.tsx` | `0baf58669c4c4c4bc89fa57afad5139bfc2ee3678b126f4a889f45d0581d6512` |
