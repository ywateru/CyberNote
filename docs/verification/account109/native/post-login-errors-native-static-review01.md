# Post-login errors — independent native static review 01

2026-11-14. **APPROVE for native source integration on static review. No blocking finding identified.** This does not approve the separate frontend implementation or establish build/runtime success.

Reviewed exact commit `982d669a18df91eb602eea6079105220ba052b74` against base `38300df6ca79ce4d3fe94a2c0797106bb73bf818`. The diff is confined to `src-tauri/src/account/{config,types,enrollment,mod,transport}.rs`. The author worktree `/private/tmp/cybernote-account109-login-surfaces-ui` was clean at that exact commit when inspected. Contract: the main worktree's then-uncommitted `docs/plan/tasks/app-account109-post-login-errors.md`, including its explicit HTTP/classification and immediate authorization-fence requirements.

## Error construction and public shape

`Enrollment::json` classifies request-send timeout/connect/other errors, response-body timeout/read errors, actual non-success HTTP statuses, response size over 65,536 bytes and JSON/schema decoding failures. The profile/enrollment semantic schema checks retain their operation stage. It does not serialize reqwest errors, addresses, headers, tokens or response bodies. Existing proof/signature/owner rejection remains rejection; it is not converted to success or attributed to token exchange.

`SafeError` emits request diagnostics only for coordinator profile/enrollment/JWKS stages. The reason enum is finite. HTTP status details are paired only with `requestReason=httpStatus`, with StatusCode's minimum 100 and an explicit maximum 599 excluding 2xx. Only actual 401/403 rejection maps to `account_authentication`; the other new request failures map to `account_network`. Request errors do not acquire identity/provider/token diagnostics.

The internal `HttpStatus` variant uses reqwest's broader 100..999 type. Its public normalization and terminal control flow agree:

| Internal classification | Public request details | Network cycle behavior |
| --- | --- | --- |
| HTTP 401/403 | `httpStatus`, exact status, authentication code | Close gate and exit |
| Other non-2xx HTTP 100..599 | `httpStatus`, exact status, network code | Existing retry/backoff |
| Internal 2xx or >599 HttpStatus | `invalidResponse`, no status, network code | Close gate and exit |
| Oversized/invalid JSON or schema | `invalidResponse`, no status, network code | Close gate and exit |
| Timeout/connect/request/body-read transient | Corresponding finite reason, no status, network code | Existing retry/backoff under signed lease |

Production HTTP parsing constructs HttpStatus only from a non-success response. The defensive internal 2xx/>599 cases were nevertheless traced through both `RequestFailure::details` and `fence_authorization`, rather than inferred from the displayed code alone.

## Authorization fences and retry scope

The actual transport cycle calls `fence_authorization` before publish/break. It preserves all old terminal classes and adds RequestAt InvalidResponse, 401/403, and the defensive normalized-invalid statuses. Terminal classification calls `gate.close()` before publishing the failure and leaving the loop. Timeout/body-read transients preserve prior behavior; existing signed-lease expiration and closed-gate non-revival rules are unchanged. Initial setup errors still propagate to the existing outer task close path. The earlier draft risk of falling through the old enum-only matcher is closed in this exact source.

The new initial retry is restricted by `authorization_mode` to error state without profile, with coordinatorProfile network/authentication failure. It returns `Ok(false)`, so explicit SignIn enters normal begin authorization without replacement logout. An existing profile does not gain this new retry permission. Existing refresh recovery remains separate. Lifecycle/pending checks, retained-grant Busy-to-cleanup conversion and cleanup-required handling remain intact. Failed bind still settles its existing grant revocation path; it is not a new replacement operation. Binding retains the previous enabled flag, and `start_network` exits paused when binding is disabled. No automatic SignIn or hidden enable was added.

`account_command` now returns typed SafeError rejection. The main label plus existing application-origin/debug-dev-origin checks remain unchanged; URL lookup or window denial returns fixed `account_window_invalid`. The checks still precede runtime command dispatch.

All platforms now use the fixed approved `https://cybernote-sync.aixgg.com` transport. Enrollment issuer remains `https://cybernote-sync.vercel.app`; Logto configuration, callback identities, issuer/signature/owner validation, disabled redirects and normal TLS policy are unchanged. No endpoint override, fallback or trust exception was introduced. The existing old-issuer proof/alias-issuer rejection fixture remains in source.

## Unexecuted verification and integration limits

The new/updated fixture text covers finite error/status shapes, request/body/schema failures, retry-mode restrictions, IPC shape and real Gate close/non-revival expectations. **No new or existing fixture/test was run. No module, syntax checker, compiler, formatter, build, App, login, network or device/ADB action was executed.** Only Git/source/diff inspection and review-document editing were performed; no private snapshot/body, database, grant or credential contents were read. Static review does not establish that the code compiles or the fixtures pass.

Frontend strict DTO/local message/immediate-rejection behavior and exact manifest refresh belong to their separate integration review. Preserve old candidate identities and historical failures: this change does not diagnose the user's precise live error or disprove the retained token-scope branch. No candidate was rebuilt and no manual test was performed here. User handoff remains manual; this approval does not resume paused automatic verification.

This docs-only review is committed in the existing reviewer worktree `/private/tmp/cybernote-account109-login-surfaces`, clean before the review at `a00e877493cedd5de4850b11f3bb7685dadffb78`, for parent cherry-pick.
