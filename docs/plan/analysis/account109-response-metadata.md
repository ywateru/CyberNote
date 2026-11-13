# ACCOUNT109 relogin02 responseMetadata investigation

2026-11-13. Delegated author investigation at base `20d62c11fcfead606680928ec5f4f83297a72969`, isolated branch `codex/account109-response-metadata`. Scope: source analysis and offline regression coverage under [refresh recovery](../tasks/app-account109-refresh-recovery.md), [account architecture](../../architecture/account-sync.md) and the [auth crate contract](../../../crates/account-auth/README.md). Production behavior changes are not justified by the currently retained evidence.

## Observed evidence and limits

The classified `/private/tmp/account109-desktop-relogin02/result.json` identifies candidate source `10814415ca088273bacc311d192b9605bda16775`, executable SHA-256 `b981400529f36cb698616d3871cc83b9a5d7cc4c10fb75009276697daba9ee6f`. Both GUI readiness checks passed. B's initial error is `account_authentication / identityRefresh`, classified `serverInvalidGrant400`. The runner recorded the visible recovery action and actual `account.signIn` UI handler, then `error → authorizing → error`, with final `account_auth_identity_invalid / responseMetadata`. The run failed during B recovery; both processes exited naturally. No subsequent account, data-transfer or recovery success is established.

The parent's browser observation reports 34 tabs before and after. This does not establish that the opener was never invoked, that a tab never existed transiently, or that an existing tab was not reused. The entire run lasted about 14 seconds; the retained transitions have no individual timestamps. Short elapsed time is not evidence of a pre-browser failure. This investigation reads no credentials, grant, original DB, raw provider body or browser state and sends no network requests.

Relevant auth/native/UI source has no diff between the pinned candidate and the investigation base. The candidate's checked-in build record agrees with the classified result. This is source/provenance analysis, not a new binary execution or independent runtime measurement.

## Exact error paths

| Boundary | Current rejection | Can produce the observed reason? |
| --- | --- | --- |
| `PinnedHttp::validate_metadata` | Malformed discovery JSON, mismatched pinned endpoints or required capabilities → `Configuration`; `AuthClient::client` maps discovery errors to `Network` | No; native reports `account_network / identityProvider` |
| OIDC discovery/JWKS parser or request | Discovery fails → `Network` | No |
| Code exchange response parse | OAuth error → `CodeExchangeRejected`; malformed response → `TokenResponseInvalid`; request error retains finite transport category | No |
| `verify_response` (initial code response, or refresh with ID token) | Non-Bearer type, empty access token, absent/zero expiry, or present scope without `connect` → `IdentityRejected(ResponseMetadata)` | Yes, before ID-token verification |
| `refresh`, response without ID token | Same four metadata conditions → same error | Yes, before retaining the prior verified identity |
| ID-token/JWT verification | Missing ID token or issuer/audience/expiry/nonce/key/signature/algorithm/subject/azp/iat/hash failure → other finite identity errors | No `responseMetadata` |

`responseMetadata` therefore indicates a successfully parsed token response failing the crate's response-envelope contract, not an OIDC discovery document or JWT signature diagnosis. An omitted `scope` is permitted; a present scope lacking `connect` is rejected. Missing required token JSON fields can fail parsing earlier, so an empty access token is distinct from an omitted one. The receipt does not select among the four conditions and cannot prove a provider defect or a scope mismatch specifically.

## Restore and replacement authorization precedence

```text
startup: Runtime::restore [lifecycle lock]
  → auth() [OnceCell: construct/load owner only, no network]
  → AuthClient::restore → refresh → initial HTTP400 invalid_grant
  → fail(identityRefresh); finish lifecycle operation

explicit UI signIn → Runtime::command(SignIn)
  → lifecycle.try_lock; authorization_mode(error=identityRefresh) = replacement
  → stop network; advance generation; publish authorizing
  → async login [same lifecycle lock]
    → auth() [cached owner, no restore]
    → bind callback listener
    → logout [quarantine → revoke → remove; failure stops authorization]
    → check generation/cancel
    → begin_authorization [cached OIDC client or discovery; no token request]
    → check generation/cancel → opener → await callback
    → complete_callback [code exchange → verify_response]
    → bind [same-owner check → access_token; possible refresh if too short-lived]
    → optional enabled network start
```

Only explicit `syncNow` on a bound network error selects `recovery::run → restore`; the classified runner selected SignIn. Status polling has no recovery side effects. The UI/debug handler sends SignIn unchanged. Startup restore and SignIn serialize on the lifecycle mutex; SignIn advances generation after stopping the old network. The source does not show a pre-login restore taking precedence in this accepted replacement path. A blocked mutex or cleanup failure would have different behavior/error codes.

For the recorded SignIn path, a code-response envelope rejection is the earliest reachable producer of the final reason. A later refresh (for example a positive code-response lifetime under the binding request's 60-second minimum) can also produce it. Both require reaching token handling; a browser/callback round trip with existing hosted session or tab reuse remains possible. Without a finite operation marker, this distinction cannot be resolved from the safe receipt. A source/runtime mismatch or unexpected concurrent operation should only be alleged with additional evidence.

## Minimal proposal; trust checks preserved

Do not loosen validation, synthesize scope/expiry, infer missing fields from JWT payloads, retry token requests, clear grants, change endpoints, or substitute JWKS. Public discovery/JWKS GETs cannot reveal the token-response envelope that failed, so none are needed here.

The justified next runtime patch is diagnostic only, pending a doc/API contract and independent review: classify the existing four rejection conditions into fixed labels (`tokenType`, `accessToken`, `expiresIn`, `scope`) and attach a fixed operation (`codeExchange` or `refresh`) at the native/auth boundary. Preserve the existing rejection and quarantine/revocation behavior, including the existing `responseMetadata` compatibility if retained. Use only enums/booleans; expose no token, scope string, duration, provider body, subject or endpoint. Update the strict native/TypeScript/runner allowlists atomically if these fields cross IPC. Other JWT/owner checks and original enabled-state handling remain unchanged.

A behavior patch is justified only after the specific condition is established and the provider/API contract reviewed. In particular, removing the `connect` check would contradict the current auth README; discovery compatibility cannot authorize it. There is no evidence supporting such a behavior patch today.

## Offline verification contract and results

Add tests using the existing test-only transport and independent signed ES384 fixtures:

1. For code exchange, refresh with ID token, and refresh without ID token, exercise all four metadata rejection conditions (including absent and zero expiry); verify the exact existing error and that rejected access is unavailable. Refresh rotations remain owned for cleanup.
2. Accept omitted scope, `connect` alone and normal OIDC-plus-connect scopes through all three paths; this prevents an invented requirement for the full original scope list.
3. Initial success → refresh HTTP400 `invalid_grant` → explicit logout → begin replacement. Assert exact request order, no refresh/code request during begin, retained owner blocks begin before logout, and failed revocation never clears the owner or reaches begin successfully.

These tests reproduce the possible classes and source ordering, not the historical provider payload. Author execution: focused `relogin02` group **3 passed, 0 failed** (15 rejection cases, 9 accepted-scope cases, 2 replacement/logout sequences); full auth suite **26 passed, 0 failed, 1 ignored**, doc-tests 0. Command: `cargo test --manifest-path crates/account-auth/Cargo.toml --locked --offline` with isolated `CARGO_TARGET_DIR=/private/tmp/cybernote-account109-response-metadata/.task-target`, 2 jobs, incremental off and dev/test debug info off. The ignored public-network test was not run. `git diff --check` passed. No live login, public GET, App/Store/device access, credential read or shared target was used. This author does not supply independent verification approval. Runtime diagnostics remain a proposal for the parent to contract before implementation.
