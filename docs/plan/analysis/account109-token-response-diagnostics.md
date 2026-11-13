# ACCOUNT109 token response diagnostics author receipt

2026-11-13. Implements the [parent contract](../tasks/app-account109-token-response-diagnostics.md), imported from parent `54db8fb4` as `529a4ded` after investigation/test commit `a40185ab`. This increment changes diagnostic classification and presentation only. Independent review and any new GUI build/run remain separate.

## Behavior

The auth owner returns `ResponseMetadata(TokenOperation, TokenResponseField)` for the same pre-existing envelope rejections. A shared classifier covers initial code response, refresh with an ID token and refresh without one. Fixed precedence is tokenType → accessToken → expiresIn → scope, including simultaneous faults. Bearer/nonempty access/positive expiry/optional-scope-connect requirements, ID/JWT checks, pinned endpoints, TLS, rotation persistence and quarantine/revocation/removal remain intact.

Native mapping keeps `account_auth_identity_invalid` and `reason=responseMetadata`, adding only `tokenOperation` and `tokenField`. TypeScript requires the complete finite pair in this branch, without stage/providerReason, and accepts legacy generic errors without inferring details. UI explanations use fixed local labels. Runner `safeStatus` retains a complete valid pair before terminal failure; it omits invalid/partial/cross-branch details. No runner binary pin or recovery policy changes. SDK provider continues its existing coarse `identityRejected` handoff; this increment does not extend vendor interfaces.

## Predicted failure aftermath (source only)

| Failure path | Current-run result | Possible next startup |
| --- | --- | --- |
| Code response rejected; `abandon` successfully revokes and removes grant | Original responseMetadata plus finite details, unless another error supersedes it; old bound profile may remain in runtime status | No grant: `Runtime::restore` returns None and default status stays signedOut with no profile, even though the separate binding remains |
| Code response rejected; cleanup cannot remove/revoke the quarantined grant | `cleanup_status` replaces the original error with account_cleanup_required | Unusable grant produces NoSession, then cleanup_status replaces it with account_cleanup_required |
| Refresh response rejected | Rotation retained unusable and persisted; direct runtime cleanup_status supersedes the original error with account_cleanup_required | Retained unusable grant follows the same cleanup-required startup path |
| Refresh rejects during login's bind | login attempts logout before returning the bind error | Successful cleanup can leave no grant/signedOut at next startup; retained quarantine yields cleanup-required |

Successful removal does not erase the separately persisted issuer/subject/workspace binding or notes. Startup can therefore expose signedOut without an account profile while still enforcing the original binding on future login. Local storage/corruption or other later errors can produce additional finite failures; these rows do not exhaust unrelated faults. No current grant/store has been read, so no row is asserted as the actual post-relogin02 state. The existing runner's wait for B profile/error cannot handle every listed case and must be adapted separately by its owner. No such runner adaptation is included here.

## Checks

Auth tests cover 24 failing path/condition combinations (15 single-condition and 9 simultaneous-field cases), nine accepted-scope combinations and two replacement/logout sequences. Tests assert exact operation/field, rejection without access delivery, retained refresh rotation ownership and successful cleanup. DTO tests cover all eight finite pairs, legacy absence, safe UI text, partial/unknown/null/undefined fields and cross-branch injection. Runner helper tests verify capture before terminal rejection and absence of raw sentinel data.

Author checks:

- `cargo test --manifest-path crates/account-auth/Cargo.toml --locked --offline`: **26 passed, 0 failed, 1 ignored** (public-network test); doc-tests 0.
- `node --test scripts/verification/account109-status-dto.test.mjs scripts/verification/account109-desktop-helpers.test.mjs scripts/verification/account109-desktop-relogin.test.mjs scripts/verification/account109-headless-recovery.test.mjs`: **65 passed, 0 failed/skipped**.
- `node_modules/.bin/tsc --noEmit`: exit 0.
- `cargo check --manifest-path crates/account-auth/Cargo.toml --locked --offline --features live-smoke --example live_smoke`: exit 0, compilation only.
- Lightweight mapping harness: **4 passed, 0 failed**, compiling the actual native `types.rs`, actual vendor SDK error definitions, and the exact `provider_error` function plus its existing category test. It imports current auth crate code. Only unrelated Store/Sync error payload types are placeholders; no full native Runtime, Tauri trait wiring or App is compiled/executed. The temporary harness is at `tmp/token-diagnostics-mapping-check`, ignored by Git. Its initial lockfile was resolved offline and the final run used `--locked --offline`.
- `git diff --check`: exit 0. Source changes are committed before refreshing the existing export pins from exact committed blobs, per publish README; no inventory paths added.

All Rust commands use author-owned `CARGO_TARGET_DIR=/private/tmp/cybernote-account109-response-metadata-target-02`, 2 jobs, incremental off and dev/test debug info off. The shared native target was never acquired and remains available to the reviewer/build owner. No live login, public GET, browser/App/ADB operation, existing-grant read or native binary build is part of this increment. Full native account tests and independent review remain separate; the lightweight harness is not a substitute for them.
