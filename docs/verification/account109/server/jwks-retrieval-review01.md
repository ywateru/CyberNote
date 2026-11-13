# account109 remote JWKS independent review 01

2026-11-13. **APPROVE scoped change; no blocking findings.** Reviewed committed
`d3c0ea8e28536e2284ce5957610815e628d04955` in
`/private/tmp/cybernote-account109-jwks-errors`, against parent
`9263ea87b5f6112bbd23d4b57d6d7a8b21c9fee3`. Scope: coordinator `src/identity.ts`,
`test/identity.test.ts`, and the added `docs/architecture/account-sync.md` bullet.
This approves the server error distinction for parent integration; it is not
deployment acceptance or proof of a live failure's root cause.

## Independent evidence

- Node `v22.16.0`, jose `6.2.15`, tsx `4.23.15`, TypeScript `5.9.3`.
  From `services/coordinator`, `node --import tsx --test test/identity.test.ts`:
  **18 passed, 0 failed, 0 skipped** (7 top-level tests plus 11 subtests;
  5.285 seconds). `npm run typecheck`: **exit 0**, including root API types.
- **Red → green:** an in-memory harness loaded the parent's identity source
  through TypeScript transpilation, alongside the committed implementation,
  without modifying either. Identical signed ES384 tokens and simulated network
  rejection, HTTP 503, and interrupted response bodies returned
  `401 INVALID_IDENTITY` on the parent and `503 IDENTITY_UNAVAILABLE` on the commit.
  Thus the desired 503 assertion fails on the parent and passes on this commit.
- **Production fetch body timeout:** the same harness used Node's actual fetch
  against a disposable loopback HTTP server returning HTTP 200 and an unfinished
  JSON body. Only the destination was redirected locally by the fetch interceptor;
  jose's actual options and five-second abort signal were retained. Headers had
  arrived before timeout. Parent: **401 at 5004 ms**. Commit: **503 at 5002 ms**,
  with the actual `response.text()` rejecting `TimeoutError` and the signal
  aborted. The committed code handles this production transport behavior correctly;
  the committed test suite itself covers pre-response timeout and immediate body
  interruption, not this delayed real-fetch body case. This local HTTP check does
  not prove public HTTPS/TLS connectivity.
- Additional independent probes: missing, numeric, `disconnect`, and
  `connect:read` scopes all returned **401**; whitespace-delimited whole-word
  `connect` succeeded. Injected resolver errors with nested fetch/timeout causes
  remained **401**. Returned errors had no exposed `cause`; transport errors used
  the fixed safe 503 message.

## Classification and pins

Only the private `JWKSRetrievalError`, created at the pinned remote fetch boundary,
maps to 503. Network rejection, non-200 status and body-read rejection cross that
boundary; JSON/JWKS parsing and key validation remain with jose and map to 401.
An unrelated error's name, text, code, status or nested cause cannot promote it to
503. Generic injected resolver failures remain 401.

The diff preserves HTTPS issuer/resource restrictions, the issuer-derived JWKS
URL, manual redirects, ES384-only verification, exact issuer/audience checks,
required claims, lifetime/user/client/party/machine-token/type checks and
whole-word `connect`. JWT `jku` does not select the source. Focused tests also
verify fresh-cache use, expiry/outage/recovery, forged signatures, malformed JWTs,
bad claims, malformed JSON/JWKS, invalid/unknown/ambiguous keys and upstream status
302/401/404/429/500/503. No authentication bypass or pin weakening found. The new
architecture bullet accurately describes the implementation and explicitly
avoids claiming a native failure's root cause is established.

## Limits and workspace integrity

- No Redis tests were run in this independent focused review. The pre-existing
  author log `/private/tmp/cybernote-account109-jwks-service-tests.log`, inspected
  but not reproduced here, reports **172 tests: 143 passed, 0 failed, 29 skipped**;
  all 29 skips request `redis-server` or `REDIS_TEST_SERVER`. They provide no fresh
  evidence for shared Redis budgets, atomic admission/session/publication,
  cross-handler isolation, restart/recovery or the Redis-backed root entrypoint.
  Redis TLS behavior was not validated here.
- **Live root remains unproven:** neither the deployed root/API chain through real
  Logto HTTPS JWKS and Redis nor the cause of a particular native/runtime failure
  was established by this review. No real service endpoints, deployment, ADB,
  browser or native build were used. Loopback server and connections were closed.
- Used the checkout's existing per-package dependency symlinks targeting
  `/private/tmp/cybernote-account109-jwks-deps/node_modules`; created no new symlink
  and left those pre-existing links intact. Reviewed checkout stayed clean;
  `git diff --check` passed. No product code or commits changed. This review note
  is the only authored repository file; unrelated main-worktree artifacts were
  left untouched.
