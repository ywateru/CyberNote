# Workspace current audit 02

Observed main `9f536a5e1721fee1833a8600010f7cb9d45e06d6`; requested main `20d62c11fcfead606680928ec5f4f83297a72969` advanced concurrently. **No uncommitted first-party product/live-runner/config code found outside the active excluded investigation.** This supplements [the prior audit](../WORKSPACE-AUDIT-LATEST.md), without repeating its cache/content inventory.

Current registry: **27 valid worktrees** (prior 20), **42 prunable/invalid registrations retained**. Git metadata/status used `--no-optional-locks`. Snapshot is bounded/non-atomic while other agents operate.

| Valid worktree (basename; full paths in JSON) | HEAD | Tracked | Untracked | Classification |
| --- | --- | ---: | ---: | --- |
| `main` | `9f536a5e1721` | 0 | 0 | Expected docs/evidence |
| `cybernote-account109-android` | `6537b74bf2c9` | 0 | 0 | Clean |
| `cybernote-account109-android-90b8b28b-01` | `9263ea87b5f6` | 0 | 0 | Clean |
| `cybernote-account109-android-d69-debug` | `d69ffbce2ad1` | 0 | 0 | Clean |
| `cybernote-account109-auth` | `9ec4172c82c4` | 0 | 0 | Clean |
| `cybernote-account109-coordination-diagnostics` | `b396582a6f45` | 0 | 0 | Clean |
| `cybernote-account109-delivery` | `bb4d4ef3548a` | 0 | 0 | Clean |
| `cybernote-account109-gui-reauth-01` | `10814415ca08` | 0 | 0 | Clean |
| `cybernote-account109-headless-native` | `72b397a33449` | 0 | 0 | Clean |
| `cybernote-account109-jwks-errors` | `d3c0ea8e2853` | 0 | 0 | Clean |
| `cybernote-account109-mac-ec4348c6-01` | `ec4348c6df15` | 0 | 0 | Clean |
| `cybernote-account109-native` | `9103dbc99693` | 0 | 0 | Clean |
| `cybernote-account109-phone-files` | `4b639adfc9d3` | 0 | 0 | Clean |
| `cybernote-account109-refresh-classification` | `4a5cdf8d1b61` | 0 | 0 | Clean |
| `cybernote-account109-relay-test` | `d3a5f10e000a` | 0 | 0 | Clean |
| `cybernote-account109-relogin-test` | `b867bccfa3b4` | 0 | 0 | Clean |
| `cybernote-account109-response-metadata` | `a40185abef01` | 0 | 0 | ACTIVE EXCLUDED — Feynman |
| `cybernote-account109-server` | `9a0c7f152f42` | 0 | 0 | Clean |
| `cybernote-account109-test-audit` | `bb701339340e` | 0 | 0 | Clean |
| `cybernote-account109-ui` | `97cd013cb919` | 0 | 0 | Clean |
| `cybernote-android-manifest103` | `6578613a40d3` | 0 | 0 | Clean |
| `cybernote-delivery` | `5b15ce1d96ef` | 0 | 0 | Clean |
| `cybernote-interface-settings` | `988ade3b185c` | 0 | 168 | Historical generated/dependency only |
| `cybernote-svg104` | `59cbbf74822c` | 0 | 0 | Clean |
| `cybernote-sync108` | `9d72db2fb060` | 0 | 0 | Clean |
| `cybernote-sync108-android` | `7000cdde141d` | 0 | 111 | Historical generated/dependency only |
| `cybernote-sync108-driver` | `fe10afa6df7b` | 0 | 0 | Clean |

## Final commit readiness

1. **Already committed since the requested starting HEAD:** the known GUI package review, phone-files review, current-access03 evidence and relogin review03 are tracked at the observed main. Completed archive integrity was checked for current-access03 (2 entries), GUI build review (12), and phone-files review (12), all matching. Do not duplicate those additions. This is byte integrity, not repeated tests/content review.
2. **Parent reconciliation already committed:** at the complete status snapshot, main had 0 tracked changes and 0 untracked files before this audit directory was created. The earlier four tracked doc edits and known review/archive additions were concurrently committed by the parent; no further staging of those earlier paths is indicated by this snapshot.
3. **New audit commit candidate:** only this `workspace-current02/` report/result/checksums. `native/relogin-live02/` and `native/recovery-integration02.md` are tracked at the snapshot main; live02 remains excluded from content/checksum inspection and its archive owner's work was not duplicated. No review of that failure evidence is implied here.
4. **Active excluded:** Feynman's `cybernote-account109-response-metadata` worktree is excluded from readiness/integration judgment, whether currently clean or legitimately dirty. Only status/HEAD metadata is listed; no content/diff review or cleanup.
5. **Keep unstaged:** historical 279 generated/dependency untracked files: 168 in interface-settings (139 Android build + 29 copied Tauri dependency) and 111 in sync108-android (Android build). No source extension inside these exact generated roots changes their classification. Nothing was removed or staged.

## Committed branch-history boundary

Local ancestry and `git cherry` patch equivalence were checked without remotes. Some historical branches contain patch-unmatched commits; that fact alone is not proof of lost implementation or a safe merge candidate. The result records first-party tip paths equal to, different from, or absent from current main, excluding copied/generated dependencies. Auth-refresh and relogin tip source files match current main despite intermediate patch mismatch. Older native/UI/pre-account differences remain retained history; this metadata audit does not approve their integration or claim every historical branch is fully merged.

| Historical worktree | Unmatched commits | First-party tip paths exact / different / absent at main |
| --- | ---: | --- |
| `cybernote-account109-native` | 1 | 9 / 8 / 0 |
| `cybernote-account109-refresh-classification` | 2 | 3 / 0 / 0 |
| `cybernote-account109-relogin-test` | 7 | 2 / 0 / 0 |
| `cybernote-account109-ui` | 7 | 14 / 2 / 0 |
| `cybernote-android-manifest103` | 24 | 230 / 37 / 0 |
| `cybernote-delivery` | 18 | 209 / 54 / 0 |
| `cybernote-interface-settings` | 35 | 227 / 40 / 10 |
| `cybernote-svg104` | 26 | 245 / 30 / 0 |
| `cybernote-sync108` | 1 | 276 / 19 / 0 |
| `cybernote-sync108-android` | 4 | 278 / 20 / 0 |
| `cybernote-sync108-driver` | 1 | 276 / 19 / 0 |

No current uncommitted first-party source candidate was found outside the active exclusion. **One historical committed-code retention flag:** `cybernote-interface-settings` retains 10 first-party diagnostic paths absent from main: eight format102 check/diagnose scripts plus `src-tauri/gen/android/app/src/main/java/com/local/notesclone/FormatDiagnostic102.kt` and `src/editor-session/diagnostic102.ts`. All 10 exact paths and recent unmatched commit IDs are in result.json. They are historical branch code, not newly approved implementation or an automatic merge requirement. Preserve pending the owner's retention/integration decision.

## Scope and preservation

Only this directory's README.md, result.json and SHA256SUMS were written. No delete/prune/reset/stage/commit, build/test, App/ADB/AX/network, target/original store, remote or seal operation occurred. No raw source/file contents, secret/grant/profile/runtime identity, generated payload or runtime stream was copied. Worktree metadata and source-path names identify inventory only. Ignored contents, standalone scratch directories and live02 archive content remain outside scope.

Closing metadata observation: main advanced to `54db8fb47aa8c0642326390cdafe619b8455eebf`; the committed delta after the complete `9f536a5e` status snapshot contains docs paths only. The original 27-row snapshot is retained, not rewritten as an atomic view of all concurrent work.
