//! Pinned native Logto Code + PKCE authorization with one durable grant owner.
//! UI, browser opening and callback listeners are deliberately host responsibilities.
#![forbid(unsafe_op_in_unsafe_fn)]
#[cfg(not(unix))]
compile_error!("account-auth currently supports Unix private storage (macOS and Android)");
mod http;
mod storage;
mod types;
use http::PinnedHttp;
use oauth2::{
    AuthType, AuthorizationCode, CsrfToken, EndpointMaybeSet, EndpointNotSet, EndpointSet,
    PkceCodeChallenge, PkceCodeVerifier, RedirectUrl, RefreshToken, RevocationUrl, Scope,
    TokenResponse as OAuthTokenResponse, TokenUrl,
};
use openidconnect::{
    core::{
        CoreAuthPrompt, CoreAuthenticationFlow, CoreClient, CoreJwsSigningAlgorithm,
        CoreProviderMetadata, CoreRevocableToken, CoreTokenResponse, CoreTokenType,
    },
    AccessTokenHash, ClientId, IssuerUrl, Nonce, TokenResponse,
};
use serde::{Deserialize, Serialize};
use std::{
    path::Path,
    sync::{Arc, Mutex as SyncMutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use storage::PrivateStore;
use subtle::ConstantTimeEq;
use tokio::sync::Mutex;
use types::TransactionStatus;
pub use types::{
    AccessToken, AuthError, AuthorizationCancellation, Identity, IdentityRejection, PinnedConfig,
    TokenOperation, TokenResponseField,
};
use url::Url;
use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};

type OidcClient = CoreClient<
    EndpointSet,
    EndpointNotSet,
    EndpointNotSet,
    EndpointSet,
    EndpointSet,
    EndpointMaybeSet,
>;
const SCOPES: [&str; 4] = ["openid", "profile", "offline_access", "connect"];

pub struct AuthorizationTransaction {
    state: CsrfToken,
    nonce: Nonce,
    verifier: Option<PkceCodeVerifier>,
    redirect: Url,
    started: Instant,
    marker: Arc<()>,
    cancellation: AuthorizationCancellation,
}
impl AuthorizationTransaction {
    pub fn cancellation_handle(&self) -> AuthorizationCancellation {
        self.cancellation.clone()
    }
}
impl Drop for AuthorizationTransaction {
    fn drop(&mut self) {
        self.cancellation.cancel();
    }
}
struct CancelOnDrop(Option<AuthorizationCancellation>);
impl Drop for CancelOnDrop {
    fn drop(&mut self) {
        if let Some(c) = &self.0 {
            c.cancel();
        }
    }
}

#[derive(Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
#[serde(deny_unknown_fields)]
struct Grant {
    schema_version: u32,
    issuer: String,
    client_id: String,
    resource: String,
    #[zeroize(skip)]
    identity: Option<Identity>,
    access: String,
    refresh: Option<String>,
    nonce: String,
    expires_at: u64,
    usable: bool,
}
struct State {
    grant: Option<Grant>,
    client: Option<OidcClient>,
    validated: bool,
    dirty: bool,
    pending: Option<AuthorizationCancellation>,
}
struct Inner {
    config: PinnedConfig,
    http: PinnedHttp,
    store: PrivateStore,
    marker: Arc<()>,
    state: Mutex<State>,
}
#[derive(Clone)]
pub struct AuthClient {
    inner: Arc<Inner>,
}

impl AuthClient {
    /// No network operation. Holds a process-lifetime exclusive owner lock.
    pub async fn new(
        config: PinnedConfig,
        owner_path: impl AsRef<Path>,
    ) -> Result<Self, AuthError> {
        config.validate()?;
        let http = PinnedHttp::new(config.clone())?;
        Self::initialize(config, owner_path.as_ref(), http)
    }
    fn initialize(config: PinnedConfig, path: &Path, http: PinnedHttp) -> Result<Self, AuthError> {
        config.validate()?;
        let store = PrivateStore::open(path)?;
        let grant: Option<Grant> = store
            .load()?
            .map(|b| serde_json::from_slice(&b).map_err(|_| AuthError::Storage))
            .transpose()?;
        if let Some(g) = &grant {
            if g.schema_version != 1
                || g.issuer != config.issuer.as_str()
                || g.client_id != config.client_id
                || g.resource != config.resource.as_str()
                || g.identity
                    .as_ref()
                    .is_some_and(|i| i.issuer != config.issuer.as_str() || i.subject.is_empty())
                || (g.usable && g.identity.is_none())
            {
                return Err(AuthError::OwnershipMismatch);
            }
        }
        Ok(Self {
            inner: Arc::new(Inner {
                config,
                http,
                store,
                marker: Arc::new(()),
                state: Mutex::new(State {
                    grant,
                    client: None,
                    validated: false,
                    dirty: false,
                    pending: None,
                }),
            }),
        })
    }
    pub async fn begin_authorization(
        &self,
        redirect: Url,
        signup: bool,
    ) -> Result<(AuthorizationTransaction, Url), AuthError> {
        if !self.inner.config.redirect_uris.contains(&redirect) {
            return Err(AuthError::Configuration);
        }
        let mut state = self.inner.state.lock().await;
        if state.grant.is_some() {
            return Err(AuthError::Busy);
        }
        let client = self
            .client(&mut state)
            .await?
            .set_redirect_uri(RedirectUrl::from_url(redirect.clone()));
        let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
        let mut authorization = client
            .authorize_url(
                CoreAuthenticationFlow::AuthorizationCode,
                CsrfToken::new_random,
                Nonce::new_random,
            )
            .set_pkce_challenge(challenge)
            .add_prompt(CoreAuthPrompt::Consent)
            .add_extra_param("resource", self.inner.config.resource.as_str());
        for scope in &SCOPES[1..] {
            authorization = authorization.add_scope(Scope::new((*scope).to_owned()));
        }
        if signup {
            authorization = authorization.add_extra_param("first_screen", "register");
        }
        let (url, csrf, nonce) = authorization.url();
        if let Some(old) = state.pending.take() {
            old.cancel();
        }
        let cancellation =
            AuthorizationCancellation(Arc::new(SyncMutex::new(TransactionStatus::Active)));
        state.pending = Some(cancellation.clone());
        Ok((
            AuthorizationTransaction {
                state: csrf,
                nonce,
                verifier: Some(verifier),
                redirect,
                started: Instant::now(),
                marker: self.inner.marker.clone(),
                cancellation,
            },
            url,
        ))
    }
    pub async fn complete_callback(
        &self,
        transaction: AuthorizationTransaction,
        callback: Url,
    ) -> Result<Identity, AuthError> {
        let mut cancel = CancelOnDrop(Some(transaction.cancellation.clone()));
        let client = self.clone();
        // The owned task survives caller cancellation; a dropped waiter cancels its commit.
        let result =
            tokio::spawn(async move { client.complete_owned(transaction, callback).await })
                .await
                .map_err(|_| AuthError::InvalidIdentity)?;
        cancel.0 = None;
        result
    }
    pub async fn access_token(
        &self,
        min_validity: Duration,
        force_refresh: bool,
    ) -> Result<AccessToken, AuthError> {
        let client = self.clone();
        tokio::spawn(async move { client.access_owned(min_validity, force_refresh).await })
            .await
            .map_err(|_| AuthError::TokenResponseInvalid)?
    }
    pub async fn restore(&self) -> Result<Option<Identity>, AuthError> {
        let client = self.clone();
        tokio::spawn(async move {
            let mut state = client.inner.state.lock().await;
            if state.grant.is_none() {
                return Ok(None);
            }
            client.refresh(&mut state).await?;
            Ok(state.grant.as_ref().and_then(|g| g.identity.clone()))
        })
        .await
        .map_err(|_| AuthError::TokenResponseInvalid)?
    }
    /// Read-only local state: the host can offer explicit grant cleanup without a profile.
    /// This does not discover, refresh, revoke, create an identity, or return credentials.
    pub async fn cleanup_required(&self) -> bool {
        self.inner
            .state
            .lock()
            .await
            .grant
            .as_ref()
            .is_some_and(|g| !g.usable)
    }

    pub async fn logout(&self) -> Result<(), AuthError> {
        let client = self.clone();
        tokio::spawn(async move {
            let mut state = client.inner.state.lock().await;
            if let Some(pending) = state.pending.take() {
                pending.cancel();
            }
            if state.grant.is_none() {
                return Ok(());
            }
            // Disable access immediately; failure retains the sole revocation owner.
            state.grant.as_mut().ok_or(AuthError::NoSession)?.usable = false;
            state.validated = false;
            state.dirty = true;
            client.persist(&mut state)?;
            let oidc = client.client(&mut state).await?;
            client
                .revoke(&oidc, state.grant.as_ref().ok_or(AuthError::NoSession)?)
                .await?;
            client.inner.store.remove()?;
            state.grant = None;
            state.dirty = false;
            Ok(())
        })
        .await
        .map_err(|_| AuthError::RevocationFailed)?
    }
    async fn client(&self, state: &mut State) -> Result<OidcClient, AuthError> {
        if let Some(client) = &state.client {
            return Ok(client.clone());
        }
        let metadata = CoreProviderMetadata::discover_async(
            IssuerUrl::from_url(self.inner.config.issuer.clone()),
            &self.inner.http,
        )
        .await
        .map_err(|_| AuthError::Network)?;
        let client = CoreClient::from_provider_metadata(
            metadata,
            ClientId::new(self.inner.config.client_id.clone()),
            None,
        )
        .set_auth_type(AuthType::RequestBody)
        .set_token_uri(
            TokenUrl::new(self.inner.config.endpoint("/token"))
                .map_err(|_| AuthError::Configuration)?,
        )
        .set_revocation_url(
            RevocationUrl::new(self.inner.config.endpoint("/token/revocation"))
                .map_err(|_| AuthError::Configuration)?,
        );
        state.client = Some(client.clone());
        Ok(client)
    }
    fn persist(&self, state: &mut State) -> Result<(), AuthError> {
        if !state.dirty {
            return Ok(());
        }
        if let Some(grant) = &state.grant {
            let bytes = Zeroizing::new(serde_json::to_vec(grant).map_err(|_| AuthError::Storage)?);
            self.inner.store.save(&bytes)?;
        }
        state.dirty = false;
        Ok(())
    }
    async fn complete_owned(
        &self,
        mut transaction: AuthorizationTransaction,
        callback: Url,
    ) -> Result<Identity, AuthError> {
        if !Arc::ptr_eq(&transaction.marker, &self.inner.marker)
            || !transaction.cancellation.active()
        {
            return Err(AuthError::Cancelled);
        }
        let code = validate_callback(&transaction, &callback, self.inner.config.issuer.as_str())?;
        let mut state = self.inner.state.lock().await;
        if state.grant.is_some() {
            return Err(AuthError::Busy);
        }
        if !transaction.cancellation.active() {
            return Err(AuthError::Cancelled);
        }
        let client = self
            .client(&mut state)
            .await?
            .set_redirect_uri(RedirectUrl::from_url(transaction.redirect.clone()));
        let response = client
            .exchange_code(AuthorizationCode::new(code))
            .set_pkce_verifier(transaction.verifier.take().ok_or(AuthError::Cancelled)?)
            .add_extra_param("resource", self.inner.config.resource.as_str())
            .request_async(&self.inner.http)
            .await
            .map_err(|error| match error {
                // An unreachable token endpoint does not establish an invalid
                // identity. Preserve only our fixed safe HTTP error category;
                // never replay an authorization code after an uncertain send.
                oauth2::RequestTokenError::Request(error) => error,
                oauth2::RequestTokenError::ServerResponse(_) => AuthError::CodeExchangeRejected,
                _ => AuthError::TokenResponseInvalid,
            })?;
        let identity = self.verify_response(
            &client,
            &response,
            transaction.nonce.secret(),
            TokenOperation::CodeExchange,
        );
        let mut grant = self.grant(&response, None, transaction.nonce.secret())?;
        grant.identity = identity.as_ref().ok().cloned();
        let outcome = if !transaction.cancellation.active() {
            Err(AuthError::Cancelled)
        } else if grant.refresh.as_ref().is_none_or(|token| token.is_empty()) {
            Err(AuthError::MissingRefreshToken)
        } else {
            identity
        };
        state.grant = Some(grant);
        state.dirty = true;
        if let Err(error) = outcome {
            self.abandon(&mut state, &client).await;
            return Err(error);
        }
        let identity = outcome?;
        let committing = {
            let mut status = transaction
                .cancellation
                .0
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            if *status == TransactionStatus::Active {
                // Point of no return: cancellation is now explicitly too late.
                *status = TransactionStatus::Committed;
                true
            } else {
                false
            }
        };
        if !committing {
            self.abandon(&mut state, &client).await;
            return Err(AuthError::Cancelled);
        }
        state.grant.as_mut().ok_or(AuthError::NoSession)?.usable = true;
        state.validated = true;
        self.persist(&mut state)?;
        state.pending = None;
        Ok(identity)
    }
    fn grant(
        &self,
        response: &CoreTokenResponse,
        previous: Option<&Grant>,
        nonce: &str,
    ) -> Result<Grant, AuthError> {
        let now = now()?;
        // Preserve even malformed/expired rotation responses for revocation, never expose them.
        let expires_at =
            now.saturating_add(response.expires_in().unwrap_or(Duration::ZERO).as_secs());
        Ok(Grant {
            schema_version: 1,
            issuer: self.inner.config.issuer.to_string(),
            client_id: self.inner.config.client_id.clone(),
            resource: self.inner.config.resource.to_string(),
            identity: previous.and_then(|g| g.identity.clone()),
            access: response.access_token().secret().to_owned(),
            refresh: response
                .refresh_token()
                .filter(|token| !token.secret().is_empty())
                .map(|t| t.secret().to_owned())
                .or_else(|| {
                    previous
                        .and_then(|g| g.refresh.as_ref())
                        .filter(|token| !token.is_empty())
                        .cloned()
                }),
            nonce: nonce.to_owned(),
            expires_at,
            usable: false,
        })
    }
    fn verify_response(
        &self,
        client: &OidcClient,
        response: &CoreTokenResponse,
        nonce: &str,
        operation: TokenOperation,
    ) -> Result<Identity, AuthError> {
        validate_response_metadata(response, operation)?;
        let required = operation == TokenOperation::CodeExchange;
        let token = match response.id_token() {
            Some(token) => token,
            None => {
                return Err(if required {
                    AuthError::IdentityRejected(IdentityRejection::MissingIdToken)
                } else {
                    AuthError::NoSession
                })
            }
        };
        let verifier = client
            .id_token_verifier()
            .set_allowed_algs([CoreJwsSigningAlgorithm::EcdsaP384Sha384]);
        let expected_nonce = Nonce::new(nonce.to_owned());
        let claims = token
            .claims(&verifier, |received: Option<&Nonce>| {
                if !required && received.is_none() {
                    return Ok(());
                }
                if received.is_some_and(|n| {
                    bool::from(
                        n.secret()
                            .as_bytes()
                            .ct_eq(expected_nonce.secret().as_bytes()),
                    )
                }) {
                    Ok(())
                } else {
                    Err("nonce mismatch".to_owned())
                }
            })
            .map_err(|error| {
                use openidconnect::{
                    ClaimsVerificationError as C, SignatureVerificationError as S,
                };
                AuthError::IdentityRejected(match error {
                    C::Expired(_) => IdentityRejection::Expired,
                    C::InvalidAudience(_) => IdentityRejection::Audience,
                    C::InvalidIssuer(_) => IdentityRejection::Issuer,
                    C::InvalidNonce(_) => IdentityRejection::Nonce,
                    C::InvalidSubject(_) => IdentityRejection::Subject,
                    C::SignatureVerification(S::NoMatchingKey | S::AmbiguousKeyId(_)) => {
                        IdentityRejection::SigningKey
                    }
                    C::SignatureVerification(S::DisallowedAlg(_)) => IdentityRejection::Algorithm,
                    C::SignatureVerification(_) => IdentityRejection::Signature,
                    _ => IdentityRejection::OtherClaims,
                })
            })?;
        if claims.subject().as_str().is_empty() || claims.subject().as_str().len() > 128 {
            return Err(AuthError::IdentityRejected(IdentityRejection::Subject));
        }
        if claims
            .authorized_party()
            .is_some_and(|azp| azp.as_str() != self.inner.config.client_id)
            || (claims.audiences().len() != 1 && claims.authorized_party().is_none())
        {
            return Err(AuthError::IdentityRejected(
                IdentityRejection::AuthorizedParty,
            ));
        }
        if claims.expiration() <= claims.issue_time()
            || claims.issue_time().timestamp() > now()? as i64 + 5
        {
            return Err(AuthError::IdentityRejected(IdentityRejection::IssuedAt));
        }
        if let Some(expected) = claims.access_token_hash() {
            let actual = AccessTokenHash::from_token(
                response.access_token(),
                token
                    .signing_alg()
                    .map_err(|_| AuthError::IdentityRejected(IdentityRejection::AccessTokenHash))?,
                token
                    .signing_key(&verifier)
                    .map_err(|_| AuthError::IdentityRejected(IdentityRejection::AccessTokenHash))?,
            )
            .map_err(|_| AuthError::IdentityRejected(IdentityRejection::AccessTokenHash))?;
            if actual != *expected {
                return Err(AuthError::IdentityRejected(
                    IdentityRejection::AccessTokenHash,
                ));
            }
        }
        let subject = claims.subject().as_str().to_owned();
        let username = claims.preferred_username().map(|x| x.as_str().to_owned());
        let display_name = claims
            .name()
            .and_then(|n| n.get(None))
            .map(|n| n.as_str().to_owned())
            .or_else(|| username.clone())
            .unwrap_or_else(|| subject.clone());
        Ok(Identity {
            issuer: self.inner.config.issuer.to_string(),
            subject,
            display_name,
            username,
        })
    }
    async fn access_owned(&self, min: Duration, force: bool) -> Result<AccessToken, AuthError> {
        let mut state = self.inner.state.lock().await;
        self.persist(&mut state)?;
        let grant = state.grant.as_ref().ok_or(AuthError::NoSession)?;
        if !grant.usable {
            return Err(AuthError::NoSession);
        }
        if force || !state.validated || grant.expires_at <= now()?.saturating_add(min.as_secs()) {
            self.refresh(&mut state).await?;
        }
        let g = state.grant.as_ref().ok_or(AuthError::NoSession)?;
        if !g.usable || g.expires_at <= now()?.saturating_add(min.as_secs()) {
            return Err(AuthError::TokenResponseInvalid);
        }
        Ok(AccessToken(Zeroizing::new(g.access.clone())))
    }
    async fn refresh(&self, state: &mut State) -> Result<(), AuthError> {
        self.persist(state)?;
        let g = state.grant.as_ref().ok_or(AuthError::NoSession)?;
        if !g.usable {
            return Err(AuthError::NoSession);
        }
        let refresh = RefreshToken::new(
            g.refresh
                .as_ref()
                .filter(|token| !token.is_empty())
                .cloned()
                .ok_or(AuthError::MissingRefreshToken)?,
        );
        let nonce = Zeroizing::new(g.nonce.clone());
        let old_identity = g.identity.clone().ok_or(AuthError::InvalidIdentity)?;
        let client = self.client(state).await?;
        // Omit scope to retain the original grant, matching Logto's resource refresh.
        let request = client
            .exchange_refresh_token(&refresh)
            .add_extra_param("resource", self.inner.config.resource.as_str());
        // RequestTokenError omits the HTTP status. Keep only this per-request
        // number so a 5xx body claiming invalid_grant cannot trigger replacement.
        let status = Arc::new(std::sync::atomic::AtomicU16::new(0));
        let observed = status.clone();
        let pinned_http = self.inner.http.clone();
        let http = move |request| {
            let status = observed.clone();
            let pinned_http = pinned_http.clone();
            async move {
                let response = oauth2::AsyncHttpClient::call(&pinned_http, request).await?;
                status.store(
                    response.status().as_u16(),
                    std::sync::atomic::Ordering::Relaxed,
                );
                Ok::<_, AuthError>(response)
            }
        };
        let response = request.request_async(&http).await.map_err(|error| {
            let status = status.load(std::sync::atomic::Ordering::Relaxed);
            if matches!(status, 429 | 500..=599) {
                return AuthError::Network;
            }
            match error {
                // Transport/configuration failures do not establish grant rejection.
                // Preserve only our finite categories; never replay an uncertain refresh.
                oauth2::RequestTokenError::Request(error) => error,
                oauth2::RequestTokenError::ServerResponse(response) => {
                    use oauth2::basic::BasicErrorResponseType as E;
                    match response.error() {
                        E::InvalidGrant if status == 400 => AuthError::RefreshFailed,
                        E::InvalidClient
                        | E::UnauthorizedClient
                        | E::InvalidRequest
                        | E::UnsupportedGrantType
                        | E::InvalidScope
                            if matches!(status, 400 | 401) =>
                        {
                            AuthError::Configuration
                        }
                        E::Extension(code)
                            if matches!(status, 400 | 401)
                                && matches!(
                                    code.as_str(),
                                    "temporarily_unavailable" | "server_error"
                                ) =>
                        {
                            AuthError::Network
                        }
                        _ => AuthError::TokenResponseInvalid,
                    }
                }
                _ => AuthError::TokenResponseInvalid,
            }
        })?;
        let verified = if response
            .refresh_token()
            .is_some_and(|token| token.secret().is_empty())
        {
            // An explicit empty rotation is malformed, unlike an omitted refresh token.
            // Keep the previous nonempty owner for cleanup; never deliver the new access.
            Err(AuthError::InvalidIdentity)
        } else if response.id_token().is_some() {
            self.verify_response(&client, &response, &nonce, TokenOperation::Refresh)
        } else {
            validate_response_metadata(&response, TokenOperation::Refresh)
                .map(|()| old_identity.clone())
        };
        let mut grant = self.grant(&response, state.grant.as_ref(), &nonce)?;
        let result = verified.and_then(|identity| {
            if identity.issuer != old_identity.issuer || identity.subject != old_identity.subject {
                Err(AuthError::OwnershipMismatch)
            } else {
                grant.identity = Some(identity);
                grant.usable = true;
                Ok(())
            }
        });
        // Rotation is retained before any validation error is returned.
        state.grant = Some(grant);
        state.validated = result.is_ok();
        state.dirty = true;
        self.persist(state)?;
        result
    }
    async fn revoke(&self, client: &OidcClient, grant: &Grant) -> Result<(), AuthError> {
        let token = if let Some(refresh) = grant.refresh.as_ref().filter(|token| !token.is_empty())
        {
            CoreRevocableToken::RefreshToken(RefreshToken::new(refresh.clone()))
        } else if !grant.access.is_empty() {
            CoreRevocableToken::AccessToken(oauth2::AccessToken::new(grant.access.clone()))
        } else {
            return Err(AuthError::RevocationFailed);
        };
        client
            .revoke_token(token)
            .map_err(|_| AuthError::RevocationFailed)?
            .request_async(&self.inner.http)
            .await
            .map_err(|_| AuthError::RevocationFailed)
    }
    async fn abandon(&self, state: &mut State, client: &OidcClient) {
        if let Some(grant) = &mut state.grant {
            grant.usable = false;
        }
        state.validated = false;
        if let Some(grant) = &state.grant {
            if self.revoke(client, grant).await.is_ok() && self.inner.store.remove().is_ok() {
                state.grant = None;
                state.dirty = false;
                return;
            }
        }
        // Failed cleanup remains a quarantined, non-restorable revocation owner.
        let _ = self.persist(state);
    }
}
// A fixed precedence applies on all token paths, including multi-field failures.
// This only classifies existing rejections; it never retains response values.
fn validate_response_metadata(
    response: &CoreTokenResponse,
    operation: TokenOperation,
) -> Result<(), AuthError> {
    let field = if response.token_type() != &CoreTokenType::Bearer {
        TokenResponseField::TokenType
    } else if response.access_token().secret().is_empty() {
        TokenResponseField::AccessToken
    } else if response.expires_in().is_none_or(|d| d.is_zero()) {
        TokenResponseField::ExpiresIn
    } else if response
        .scopes()
        .is_some_and(|scopes| !scopes.iter().any(|s| s.as_str() == "connect"))
    {
        TokenResponseField::Scope
    } else {
        return Ok(());
    };
    Err(AuthError::ResponseMetadata(operation, field))
}

fn now() -> Result<u64, AuthError> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .map_err(|_| AuthError::InvalidIdentity)
}
fn validate_callback(
    transaction: &AuthorizationTransaction,
    callback: &Url,
    issuer: &str,
) -> Result<String, AuthError> {
    if transaction.started.elapsed() > Duration::from_secs(600) || callback.fragment().is_some() {
        return Err(AuthError::InvalidCallback);
    }
    let mut base = callback.clone();
    base.set_query(None);
    if base != transaction.redirect {
        return Err(AuthError::InvalidCallback);
    }
    let mut state = None;
    let mut code = None;
    let mut response_issuer = None;
    for (k, v) in callback.query_pairs() {
        match k.as_ref() {
            "state" if state.is_none() => state = Some(v.into_owned()),
            "code" if code.is_none() => code = Some(v.into_owned()),
            "iss" if response_issuer.is_none() => response_issuer = Some(v.into_owned()),
            // Errors, duplicates and unknown parameters are rejected without reflection.
            _ => return Err(AuthError::InvalidCallback),
        }
    }
    // RFC 9207 authorization-response issuer: compare the decoded value exactly,
    // without URL normalization. Legacy responses may omit it; ID issuer stays pinned.
    if response_issuer
        .as_deref()
        .is_some_and(|value| value != issuer)
    {
        return Err(AuthError::InvalidCallback);
    }
    let state = state.ok_or(AuthError::InvalidCallback)?;
    if !bool::from(
        state
            .as_bytes()
            .ct_eq(transaction.state.secret().as_bytes()),
    ) {
        return Err(AuthError::InvalidCallback);
    }
    code.filter(|c| !c.is_empty() && c.len() <= 4096)
        .ok_or(AuthError::InvalidCallback)
}

#[cfg(test)]
mod tests;
