# account-auth

A standalone Rust library for CyberNote's pinned public Logto Native application.
The library uses **openidconnect 4.1 / oauth2 5**, Tokio and reqwest with rustls.
It owns authorization grants; it does not operate a UI, open a browser, listen
for callbacks, call the coordination service, or expose an IPC token API.

## Frozen API

```rust,ignore
use account_auth::{AuthClient, PinnedConfig};
use std::{path::Path, time::Duration};
use url::Url;

// Public, build-time pins. No client secret.
let config = PinnedConfig {
    issuer: Url::parse("https://auth.x.aixgg.com/oidc")?,
    client_id: "il4abzwbu1ohjwv5mb667".into(),
    resource: Url::parse("https://cybernote.app/api")?,
    redirect_uris: vec![
        Url::parse("http://127.0.0.1:17897/callback")?,
        Url::parse("com.local.notesclone.auth://callback")?,
    ],
};
let auth = AuthClient::new(config, Path::new("/app-private/account-auth/grant.json")).await?;
let (transaction, authorization_url) = auth.begin_authorization(redirect, signup).await?;
let cancel = transaction.cancellation_handle();
// Host opens authorization_url and captures an exact matching callback URL.
let identity = auth.complete_callback(transaction, callback_url).await?;
let access = auth.access_token(Duration::from_secs(60), false).await?;
// Rust-only SDK provider consumes access.secret(); never serialize it to the UI.
let restored = auth.restore().await?;
auth.logout().await?;
```

All listed operations are async and return `Result<_, AuthError>`.
`new(config, owner_path: impl AsRef<Path>) -> Result<AuthClient, AuthError>` does
no network work. `AuthClient` is cloneable and may be held in `Arc`; clones share
one owner, Tokio mutex, connection policy and process-lifetime file lock.

- `begin_authorization(Url, bool) -> (AuthorizationTransaction, Url)` creates
  PKCE S256, state and nonce. Scopes are `openid profile offline_access connect`;
  `profile` can supply `preferred_username`. No unadvertised `username` scope is
  requested. Both code and refresh requests explicitly include pinned `resource`.
  Refresh omits `scope` to inherit the original grant, matching Logto's resource
  refresh request; returned scopes, when present, must still include `connect`.
- `complete_callback(AuthorizationTransaction, Url) -> Identity` consumes the
  transaction. `Identity { issuer, subject, display_name, username: Option<String> }`
  is safe to serialize. `AccessToken` and authorization transactions are not
  serializable; token Debug redacts, and `AccessToken::secret() -> &str` is Rust-only.
- `access_token(Duration, bool) -> AccessToken` serializes refresh and persists
  every returned rotation before exposing the access token. `force_refresh` is
  passed through as an explicit refresh request, rather than coalesced away.
- `restore() -> Option<Identity>` refreshes a persisted active grant, checking
  the original issuer/client/resource/subject binding. If no grant exists it
  does no network work. Refresh ID tokens are verified when supplied; OIDC
  allows omission on refresh, in which case the protected, previously verified
  identity is retained under the same grant.
- `cleanup_required() -> bool` reads local owner state only. It is true for a
  quarantined/unusable grant even when no identity/profile exists, so the host
  can show an explicit cleanup action and fixed `account_cleanup_required` code.
  It performs no network work and returns no credentials.
- `logout() -> ()` first quarantines the grant, then revokes it, then removes
  it durably. Revocation/storage failures keep the sole grant owner for retry;
  quarantined grants cannot return access tokens or restore an active identity.
- Existing grants are never overwritten by another sign-in. `begin` returns
  `Busy` until successful logout has cleared an existing/quarantined grant.

Errors are the public, copyable enum `Configuration`, `Network`, `InvalidCallback`,
`InvalidIdentity`, `Cancelled`, `NoSession`, `OwnershipMismatch`, `Storage`,
`RefreshFailed`, `RevocationFailed`, `Busy`. Display is fixed safe text. Raw
provider error bodies, tokens, codes, paths and request URLs are not included.

## Cancellation and lifecycle boundary

`AuthorizationCancellation` is cloneable. `cancel() -> bool` returns true when
cancellation wins before the commit phase; false means the commit phase already
started. The host must await completion and perform logout when cancellation
loses, before reporting its signed-out terminal state. Dropping an unconsumed
transaction cancels it. Dropping a `complete_callback` waiter also cancels it,
while an internal owned task settles the exchange. A successful late grant is
revoked. If that revocation fails, it remains a **quarantined, non-restorable**
revocation owner; the host must retry logout, never silently replace it.

The caller's generation fence must cover browser opening and callbacks. A
cancelled `begin` future cannot produce a transaction or token owner; if `begin`
returns after the host's generation changed, cancel/drop the transaction and do
not open its URL. Beginning another transaction invalidates the previous one.

Refresh/logout owned tasks continue if a caller drops its await. The application
must keep the Tokio runtime and this owner alive until outstanding operations
settle. No library can make a network-side rotation atomic with a process crash
or a filesystem outage. If persistence fails after rotation, the new sole owner
stays in memory as dirty; the next operation retries persistence before further
network refresh. Do not destroy that owner on an error. It cannot promise crash
recovery until the filesystem accepts its durable write.

## Network and storage policy

Discovery is strictly `{issuer}/.well-known/openid-configuration`. Production
HTTP allows only that URL, `{issuer}/jwks`, `{issuer}/token`, and
`{issuer}/token/revocation`; redirects and proxy environment adoption are disabled.
Metadata must exactly match the issuer's fixed HTTPS authorization/token/JWKS/
revocation endpoints and advertise S256, ES384, code and refresh support. Responses
are bounded to 1 MiB. The openidconnect verifier checks ID signature, issuer,
audience, expiry and nonce; local checks also enforce subject, `azp`, issued-at,
ES384, bearer response, `connect` and optional access-token hash.

The final owner directory must be an existing or creatable **0700 directory**,
owned by the current UID; use a dedicated subdirectory of app data, not a 0755
app-data root. Its parent must already exist. The library holds a directory FD,
uses `openat(O_NOFOLLOW)` and regular-file/UID/link-count checks, and requires
0600 files. Symlinks, hardlinks and unsafe permissions are rejected, not repaired.
A permanent 0600 lock file prevents competing owners. Each save uses a 0600
exclusive temporary file, file fsync, same-directory rename and directory fsync.
Removal is directory-fsynced. This implementation targets macOS and Android Unix.

The final public coordination origin is `https://cybernote-sync.vercel.app`;
the host uses it for profile/CyberGrid. It is separate from the resource identifier.

## Logto registration parameter and verification

Authorization explicitly uses `CoreAuthPrompt::Consent` (`prompt=consent`),
matching the official SDK default. A real hosted PKCE recheck by the main agent
confirmed `prompt=login` omitted the refresh token while `prompt=consent` returned
one for the same Native client, scopes and resource. The crate still rejects a
missing/empty refresh token; it never assumes `offline_access` alone is enough.
If forced reauthentication is added later, the library supports adding both
`CoreAuthPrompt::Login` and `CoreAuthPrompt::Consent` to produce `login consent`;
do not replace consent with login. This release keeps the frozen API and always
requests consent.

Sign-up uses `first_screen=register`, based on Logto's official JS SDK
`packages/js/src/core/sign-in.ts` and `packages/js/src/types/index.ts`:
<https://github.com/logto-io/js/tree/master/packages/js/src>.
It does not accept user credentials, create users, or change tenant login policy.

Checks use the crate-local target directory and do not modify root Cargo files:

```sh
cargo fmt --manifest-path crates/account-auth/Cargo.toml -- --check
cargo check --manifest-path crates/account-auth/Cargo.toml --locked
cargo test --manifest-path crates/account-auth/Cargo.toml --locked
cargo test --manifest-path crates/account-auth/Cargo.toml --locked \
  live_public_logto_discovery_is_compatible -- --ignored
```

The normal suite uses an explicit test-only transport fixture, actual OAuth/OIDC
library requests and independent ring-generated ES384 signed JWTs. It is not a
real user login. The separately ignored live test performs only public discovery
and JWKS GETs using production HTTPS policy, and constructs then drops an
unopened authorization URL. It has passed against the supplied public pins; this crate
author did not perform any user/token grant, browser login, refresh grant or
real revocation. The main agent's separately reported real consent result is
recorded above and is not part of the fixture pass count.
Platform listener/deep-link handling and real hosted login remain integration work.

On 2026-11-13 the main agent separately reported that its independent live
harness obtained a consent grant, refreshed a resource access token, and observed
the same verified profile owner/workspace. Refresh-token rotation occurred;
revocation of the refresh token returned HTTP 200, and a subsequent refresh with
that revoked token returned HTTP 400. These results establish live provider and
service behavior for that harness, **not execution of this product crate**.
Because of a local fake-DNS fault, that test process alone overrode public DNS
resolution while retaining canonical hostnames and TLS certificate verification.
It did not change global DNS. The product has no IP pin, DNS override, TLS bypass,
or fallback to the harness addresses; product runtime/platform integration remains
to be verified under its actual network conditions.
