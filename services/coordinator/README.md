# CyberNote coordinator

Vendored CyberGrid Node server 0.2.0, frozen at
`f2a3961536e5c69b13c7dbc661953d9243becbae`. `LICENSE` retains the original
CyberGrid rights notice; `notices/` retains the locked npm dependency licenses.
This is the real Redis/Lua coordinator, including device registration, directory,
signals and the upstream console. It does not store notes or attachments.

## Configuration

All configuration is injected into the environment. No real credentials or
deployment configuration are included. The CyberNote entrypoints require:

- `LOGTO_ISSUER`: pinned HTTPS issuer ending in `/oidc`.
- `LOGTO_RESOURCE`: explicit HTTPS API resource with the `connect` user scope.
- `LOGTO_BROWSER_CLIENT_ID`: the console SPA client in the static product policy.
- `CYBERGRID_PRODUCTS`: upstream version 1 static Native/SPA product policy.
  The canonical product ID must itself be a Native client ID; Native aliases
  resolve to that product. SPA tokens cannot obtain an account profile.
- `CYBERNOTE_WORKSPACE_SEED`: persistent, canonical unpadded base64url encoding
  of 32–96 random bytes. Missing or invalid values fail startup. Keep it stable
  across deployments; rotation changes account workspace IDs.
- `CYBERGRID_REDIS_PREFIX`: explicit isolated namespace, with upstream format
  and length restrictions.
- `CYBERGRID_REDIS_TRANSPORT=tcp` and `REDIS_URL=rediss://…` for TLS Redis.
  Upstream transport selection and certificate validation are retained.

`CYBERGRID_PUBLIC_ORIGIN` can pin the public HTTPS origin. Upstream callback,
endpoint-provider, limits, registration-mode and browser-origin options remain
available. Static policy mode does not need Logto Management credentials.

## Entrypoints and profile

Deploy from the repository root using `vercel.json` and `api/index.ts`.
`api/package.json` selects Node 22 for the Function; the coordinator package
also selects Node 22. The Function has a 30 second ceiling and retains the
upstream 25 second request budget, 15 second signal wait, and Redis timeouts.
Static assets resolve from `services/coordinator/public` at repository-root cwd.
The configured build creates `services/coordinator/.vercel-static/robots.txt`.

Function auth-IP rate limits use `x-vercel-forwarded-for` only when the trusted
deployment environment sets `VERCEL=1`. This relies on Vercel's edge overwriting
that header. Exactly one raw header and one matching parsed IPv4/IPv6 value are
required; missing, duplicate, list, whitespace, port or zone values fail with
400. Other forwarded headers are ignored. Outside Vercel, only the socket IP
is used (or the shared `unknown` bucket if unavailable). Do not manually set
`VERCEL=1` on a self-hosted listener where clients can supply this header.
Users behind the same public IP still share the upstream ten-attempt/minute
authentication bucket; different platform IPs no longer share one global bucket.
The trust assumption follows Vercel's
[request-header documentation](https://vercel.com/docs/headers/request-headers).
Additional reverse proxies and Enterprise trusted proxy configurations are
outside this change's verification scope.

`GET /api/v1/account/profile` accepts only an Authorization Bearer resource
access token, with no query parameters or body. It verifies the pinned issuer,
audience, ES384 signature, user subject, issued-at/expiry, `client_id`, optional
`azp`/grant/type constraints, whole-word `connect`, and static Native membership.
Successful JSON contains exactly `schemaVersion: 1`, `subject`, `issuer`,
`productId`, and `workspaceId`. Responses are not cacheable.

Workspace IDs are UUIDv8 values derived from the first 128 bits of HMAC-SHA256
over the JSON array `['cybernote.account.workspace', 1, issuer, subject,
canonicalProductId]`, with the UUID version and RFC variant bits set. Inputs
come from fixed configuration and verified identity, never request authority.

For a standalone listener, run `npm start` from this directory with the same
configuration. For checks, use `npm ci`, `npm run typecheck`,
`npm run build:vercel`, and `REQUIRE_REDIS=1 npm test`; install `redis-server` or
provide its executable in `REDIS_TEST_SERVER`.

## Local changes from the frozen source

- Added account profile and mandatory CyberNote deployment configuration.
- Routed standalone and Function entrypoints through that configuration, and
  corrected the Function public asset location.
- Tightened token expiry tolerance to zero, checked issued-at/lifetime, and
  rejected malformed explicit grant claims in the shared Logto verifier.
- Added profile tests, adapted standalone test environment fixtures to the
  mandatory seed/static policy/resource, and limited upstream deploy-link
  assertions to the vendored website (upstream root README is not vendored).
- Added root deployment adapter, build output helper, Node 22 engine selection
  and adapter typechecking. Dependency versions and integrity locks are retained.

Author verification and remaining gaps are recorded under
`docs/verification/account109/server/` in the repository root. Fixture tests do
not establish a real Logto login, Vercel deployment or native synchronization.
