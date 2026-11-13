# account109 coordination diagnostics independent review 01

2026-11-13. **APPROVE scoped commit; no blocking findings.** Independently reviewed
`c6a8a1eec7529be82187e00739b064b20a99d80a` in
`/private/tmp/cybernote-account109-coordination-diagnostics`, against parent
`9263ea87b5f6112bbd23d4b57d6d7a8b21c9fee3`. Scope: native account
types/enrollment/provider/transport; vendor SDK error/client/lib/tests;
`src/account-client.ts` and status DTO tests. Adjacent unchanged owner/gate code
was read only to trace shutdown and fencing.

## Verification

- `node --test scripts/verification/account109-status-dto.test.mjs`:
  **4 passed, 0 failed, 0 skipped**. Covers legacy DTOs, finite auth stages,
  all 15 provider reasons, wrong types/unknown fields/raw URLs, and rejection of
  provider reasons outside `account_authentication` + `authorizationProvider`.
- `npm run typecheck`: **exit 0**. Used the existing root dependency symlink.
- `git diff --check`: passed; reviewed checkout remained clean at the requested
  commit. No native compilation/test rerun was needed for this bounded review.
  The author's reported **20 native tests passed** is supplied evidence, not an
  independently reproduced result. SDK Rust test additions and existing
  cancellation tests were inspected, not executed here.

## Findings

**Finite diagnostics, no new upstream leakage.** Native stages and SDK provider
reasons are payload-free enums with camelCase serialization; the TypeScript
allowlists match their 15 labels each. `provider_error` exhaustively maps every
current `AuthError` and discards the nested identity-rejection detail at this
boundary. `SafeError` emits fixed messages and error codes, optional enum stage,
and optional enum reason fields. It does not forward API codes, response bodies,
URLs, credentials or exception text. The SDK's new provider-error display
contains only the finite category. Existing unclassified provider errors remain
normalized to `AuthorizationUnavailable`. Enrollment rejects HTTP errors before
reading their bodies, keeps the 64 KiB success-body cap, and maps malformed data
to `InvalidProof`; redirect policy, timeout and cryptographic/binding checks are
unchanged. Profile, enrollment and JWKS failures now retain their exact stage.

**Fatal auth fencing covers both new variants.** The active native cycle's
immediate `gate.close()` / publish / break branch now explicitly includes
`AuthenticationAt(_)` and `ProviderAuthentication(_)`, as well as legacy auth,
proof and ownership failures. Wildcards cover every stage/provider reason,
including future values within those enums. A missing SDK session now receives
the scoped auth variant and reaches that same branch. Initial failures also
unwind through the unchanged owner task, which closes the gate and SDK client.
No old auth-only comparison was left behind for the new variants.

**Retries and ownership remain bounded.** Both SDK sites that previously checked
`AuthorizationUnavailable` now use the helper covering that error and every
`AuthorizationProvider(_)`: initial login still marks RequiresLogin with
`retryable=false`, and recovery still exits instead of backing off on provider
failure. Native `transient_sdk` still excludes all provider categories, including
`Network` and `Busy`; its three-attempt limit and uncertain-registration rules
are unchanged. No client replacement, fresh registration, refresh policy,
owner/workspace binding, lifecycle or authorization pin was broadened.

**Cancellation semantics remain unchanged by inspection.** Native and SDK
provider futures are still directly awaited after dispatch so the auth owner can
checkpoint rotation. The SDK's closed check still overrides the result with
top-level `Cancelled`; close still cancels lifetime, stops runtime and waits on
the mutation lock. Request cancellation checks remain in place. A provider's
finite `Cancelled` reason remains an authorization failure, as the previous
normalization did; it is not reinterpreted as SDK operation cancellation. The
existing checkpoint-on-disable test is unchanged.

This approval permits parent integration and the planned real desktop rerun; it
does not establish a deployed/runtime failure's root cause or desktop success.
Only this review note was authored. No product edits, commits, apps, ADB,
deployment or external endpoint calls were performed; shared native targets
were not touched.
