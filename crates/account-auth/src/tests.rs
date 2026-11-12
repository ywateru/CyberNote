use super::*;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use oauth2::{HttpRequest, HttpResponse};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    os::unix::fs::{symlink, PermissionsExt},
    sync::atomic::{AtomicBool, AtomicUsize, Ordering},
};
use tempfile::TempDir;

fn private_temp() -> TempDir {
    let dir = TempDir::new().unwrap();
    fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o700)).unwrap();
    dir
}

fn config() -> PinnedConfig {
    PinnedConfig {
        issuer: Url::parse("https://fixture.example/oidc").unwrap(),
        client_id: "FixtureNative".into(),
        resource: Url::parse("https://fixture.example/api").unwrap(),
        redirect_uris: vec![
            Url::parse("http://127.0.0.1:17897/callback").unwrap(),
            Url::parse("com.local.notesclone.auth://callback").unwrap(),
        ],
    }
}
fn response(status: u16, value: Value) -> HttpResponse {
    oauth2::http::Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(serde_json::to_vec(&value).unwrap())
        .unwrap()
}
struct Fixture {
    key: jsonwebtoken::EncodingKey,
    jwk: Value,
    nonce: SyncMutex<String>,
    challenge: SyncMutex<String>,
    changes: SyncMutex<Value>,
    tokens: AtomicUsize,
    revokes: AtomicUsize,
    fail_refresh: AtomicBool,
    fail_revoke: AtomicBool,
    wrong_jwks: AtomicBool,
    wrong_signature: AtomicBool,
    wrong_alg: AtomicBool,
    omit_refresh: AtomicBool,
    pause_token: AtomicBool,
    entered: tokio::sync::Notify,
    release: tokio::sync::Notify,
}
impl Fixture {
    fn new() -> Arc<Self> {
        use ring::signature::KeyPair;
        let rng = ring::rand::SystemRandom::new();
        let pkcs8 = ring::signature::EcdsaKeyPair::generate_pkcs8(
            &ring::signature::ECDSA_P384_SHA384_FIXED_SIGNING,
            &rng,
        )
        .unwrap();
        let pair = ring::signature::EcdsaKeyPair::from_pkcs8(
            &ring::signature::ECDSA_P384_SHA384_FIXED_SIGNING,
            pkcs8.as_ref(),
            &rng,
        )
        .unwrap();
        let public = pair.public_key().as_ref();
        assert_eq!(public.len(), 97);
        Arc::new(Self {
            key: jsonwebtoken::EncodingKey::from_ec_der(pkcs8.as_ref()),
            jwk: json!({"kty":"EC","crv":"P-384","x":URL_SAFE_NO_PAD.encode(&public[1..49]),"y":URL_SAFE_NO_PAD.encode(&public[49..]),"alg":"ES384","use":"sig","kid":"fixture-key"}),
            nonce: SyncMutex::new(String::new()),
            challenge: SyncMutex::new(String::new()),
            changes: SyncMutex::new(json!({})),
            tokens: AtomicUsize::new(0),
            revokes: AtomicUsize::new(0),
            fail_refresh: AtomicBool::new(false),
            fail_revoke: AtomicBool::new(false),
            wrong_jwks: AtomicBool::new(false),
            wrong_signature: AtomicBool::new(false),
            wrong_alg: AtomicBool::new(false),
            omit_refresh: AtomicBool::new(false),
            pause_token: AtomicBool::new(false),
            entered: tokio::sync::Notify::new(),
            release: tokio::sync::Notify::new(),
        })
    }
    fn http(self: &Arc<Self>, cfg: &PinnedConfig) -> PinnedHttp {
        let mut http = PinnedHttp::new(cfg.clone()).unwrap();
        let fixture = self.clone();
        http.responder = Some(Arc::new(move |request: HttpRequest| {
            let f = fixture.clone();
            Box::pin(async move { f.respond(request).await })
        }));
        http
    }
    async fn respond(&self, request: HttpRequest) -> Result<HttpResponse, AuthError> {
        let uri = request.uri().to_string();
        if uri.ends_with("/.well-known/openid-configuration") {
            return Ok(response(
                200,
                json!({"issuer":"https://fixture.example/oidc", "authorization_endpoint":"https://fixture.example/oidc/auth",
                "token_endpoint":"https://fixture.example/oidc/token", "revocation_endpoint":"https://fixture.example/oidc/token/revocation",
                "jwks_uri": if self.wrong_jwks.load(Ordering::SeqCst) {"https://attacker.example/jwks"} else {"https://fixture.example/oidc/jwks"},
                "response_types_supported":["code"],"subject_types_supported":["public"],"id_token_signing_alg_values_supported":["ES384"],
                "code_challenge_methods_supported":["S256"],"grant_types_supported":["authorization_code","refresh_token"]}),
            ));
        }
        if uri.ends_with("/jwks") {
            return Ok(response(200, json!({"keys":[self.jwk.clone()]})));
        }
        let form: HashMap<String, String> = url::form_urlencoded::parse(request.body())
            .into_owned()
            .collect();
        assert_eq!(
            form.get("client_id").map(String::as_str),
            Some("FixtureNative")
        );
        if uri.ends_with("/token/revocation") {
            self.revokes.fetch_add(1, Ordering::SeqCst);
            assert!(form.contains_key("token"));
            return Ok(response(
                if self.fail_revoke.load(Ordering::SeqCst) {
                    503
                } else {
                    200
                },
                json!({}),
            ));
        }
        assert!(uri.ends_with("/token"));
        assert_eq!(
            form.get("resource").map(String::as_str),
            Some("https://fixture.example/api")
        );
        if form.get("grant_type").map(String::as_str) == Some("refresh_token") {
            assert_eq!(
                form.get("refresh_token").unwrap(),
                &format!("fixture-refresh-{}", self.tokens.load(Ordering::SeqCst))
            );
            assert_eq!(
                form.get("scope").map(String::as_str),
                Some("openid profile offline_access connect")
            );
            if self.fail_refresh.load(Ordering::SeqCst) {
                return Ok(response(
                    400,
                    json!({"error":"invalid_grant","error_description":"fixture-sensitive-response"}),
                ));
            }
        } else {
            assert_eq!(
                form.get("grant_type").map(String::as_str),
                Some("authorization_code")
            );
            let verifier = PkceCodeVerifier::new(form.get("code_verifier").unwrap().clone());
            assert_eq!(
                PkceCodeChallenge::from_code_verifier_sha256(&verifier).as_str(),
                self.challenge.lock().unwrap().as_str()
            );
            assert!(form.contains_key("redirect_uri"));
        }
        let n = self.tokens.fetch_add(1, Ordering::SeqCst) + 1;
        let now = now().unwrap();
        let mut claims = json!({"iss":"https://fixture.example/oidc","sub":"fixture-subject","aud":"FixtureNative", "exp":now+3600,
            "iat":now,"nonce":self.nonce.lock().unwrap().clone(),"name":"测试用户","preferred_username":"fixture-user"});
        for (key, value) in self.changes.lock().unwrap().as_object().unwrap() {
            claims[key] = value.clone();
        }
        let mut header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::ES384);
        header.kid = Some("fixture-key".into());
        let mut id = if self.wrong_alg.load(Ordering::SeqCst) {
            jsonwebtoken::encode(
                &jsonwebtoken::Header::new(jsonwebtoken::Algorithm::HS256),
                &claims,
                &jsonwebtoken::EncodingKey::from_secret(b"fixture-only-key"),
            )
            .unwrap()
        } else {
            jsonwebtoken::encode(&header, &claims, &self.key).unwrap()
        };
        if self.wrong_signature.load(Ordering::SeqCst) {
            let index = id.rfind('.').unwrap() + 1;
            let replacement = if id.as_bytes()[index] == b'A' {
                "B"
            } else {
                "A"
            };
            id.replace_range(index..index + 1, replacement);
        }
        if self.pause_token.load(Ordering::SeqCst) {
            self.entered.notify_one();
            self.release.notified().await;
        }
        let mut body = json!({"token_type":"Bearer","access_token":format!("fixture-access-{n}"),"refresh_token":format!("fixture-refresh-{n}"),
            "expires_in":3600,"scope":"openid profile offline_access connect","id_token":id});
        if self.omit_refresh.load(Ordering::SeqCst) {
            body.as_object_mut().unwrap().remove("refresh_token");
        }
        Ok(response(200, body))
    }
    async fn client(self: &Arc<Self>, dir: &TempDir) -> AuthClient {
        let cfg = config();
        AuthClient::initialize(cfg.clone(), &dir.path().join("grant.json"), self.http(&cfg))
            .unwrap()
    }
    async fn begin(
        self: &Arc<Self>,
        client: &AuthClient,
        signup: bool,
    ) -> (AuthorizationTransaction, Url) {
        let (txn, url) = client
            .begin_authorization(config().redirect_uris[0].clone(), signup)
            .await
            .unwrap();
        let params: HashMap<String, String> = url.query_pairs().into_owned().collect();
        *self.nonce.lock().unwrap() = params["nonce"].clone();
        *self.challenge.lock().unwrap() = params["code_challenge"].clone();
        let mut callback = config().redirect_uris[0].clone();
        callback
            .query_pairs_mut()
            .append_pair("state", &params["state"])
            .append_pair("code", "fixture-code");
        (txn, callback)
    }
    async fn login(self: &Arc<Self>, client: &AuthClient) -> Identity {
        let (txn, url) = self.begin(client, false).await;
        client.complete_callback(txn, url).await.unwrap()
    }
}

#[tokio::test]
async fn pkce_signup_scopes_and_exact_redirect_are_pinned() {
    let f = Fixture::new();
    let dir = private_temp();
    let client = f.client(&dir).await;
    let (txn, url) = client
        .begin_authorization(config().redirect_uris[0].clone(), true)
        .await
        .unwrap();
    let pairs: HashMap<String, String> = url.query_pairs().into_owned().collect();
    assert_eq!(pairs["response_type"], "code");
    assert_eq!(pairs["code_challenge_method"], "S256");
    assert_eq!(pairs["first_screen"], "register");
    assert_eq!(pairs["prompt"], "consent");
    assert_eq!(pairs["scope"], "openid profile offline_access connect");
    assert_eq!(pairs["resource"], "https://fixture.example/api");
    assert!(!pairs.contains_key("code_verifier"));
    drop(txn);
    assert!(matches!(
        client
            .begin_authorization(
                Url::parse("http://127.0.0.1:19999/callback").unwrap(),
                false
            )
            .await,
        Err(AuthError::Configuration)
    ));
    let (android, _) = client
        .begin_authorization(config().redirect_uris[1].clone(), false)
        .await
        .unwrap();
    drop(android);
    assert!(client.restore().await.unwrap().is_none());
}

#[tokio::test]
async fn callback_state_redirect_duplicates_nonce_issuer_audience_subject_and_expiry_are_verified()
{
    for kind in [
        "state",
        "redirect",
        "duplicate",
        "fragment",
        "unknown",
        "nonce",
        "issuer",
        "audience",
        "subject",
        "expiry",
        "azp",
        "issued_at",
        "at_hash",
        "signature",
        "algorithm",
    ] {
        let f = Fixture::new();
        let dir = private_temp();
        let client = f.client(&dir).await;
        let (txn, mut callback) = f.begin(&client, false).await;
        match kind {
            "state" => {
                callback.set_query(Some("state=wrong&code=fixture"));
            }
            "redirect" => {
                callback.set_path("/wrong");
            }
            "duplicate" => {
                callback.query_pairs_mut().append_pair("state", "duplicate");
            }
            "fragment" => {
                callback.set_fragment(Some("ignored"));
            }
            "unknown" => {
                callback
                    .query_pairs_mut()
                    .append_pair("token", "not-accepted");
            }
            "nonce" => {
                *f.changes.lock().unwrap() = json!({"nonce":"wrong"});
            }
            "issuer" => {
                *f.changes.lock().unwrap() = json!({"iss":"https://attacker.example/oidc"});
            }
            "audience" => {
                *f.changes.lock().unwrap() = json!({"aud":"OtherNative"});
            }
            "subject" => {
                *f.changes.lock().unwrap() = json!({"sub":""});
            }
            "expiry" => {
                *f.changes.lock().unwrap() = json!({"exp":now().unwrap()-1});
            }
            "azp" => {
                *f.changes.lock().unwrap() = json!({"azp":"OtherNative"});
            }
            "issued_at" => {
                *f.changes.lock().unwrap() = json!({"iat":now().unwrap()+60});
            }
            "signature" => {
                f.wrong_signature.store(true, Ordering::SeqCst);
            }
            "algorithm" => {
                f.wrong_alg.store(true, Ordering::SeqCst);
            }
            "at_hash" => {
                *f.changes.lock().unwrap() = json!({"at_hash":"wrong"});
            }
            _ => unreachable!(),
        }
        let error = client.complete_callback(txn, callback).await.unwrap_err();
        assert!(
            matches!(
                error,
                AuthError::InvalidCallback | AuthError::InvalidIdentity
            ),
            "{kind}"
        );
        assert!(client.restore().await.unwrap().is_none());
        assert!(!dir.path().join("grant.json").exists());
    }
}

#[tokio::test]
async fn successful_identity_and_rotation_are_private_persistent_serial_and_restorable() {
    let f = Fixture::new();
    let dir = private_temp();
    let client = f.client(&dir).await;
    let identity = f.login(&client).await;
    assert_eq!(identity.subject, "fixture-subject");
    assert_eq!(identity.display_name, "测试用户");
    assert_eq!(
        fs::metadata(dir.path().join("grant.json"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o600
    );
    assert!(matches!(
        AuthClient::new(config(), dir.path().join("grant.json")).await,
        Err(AuthError::Busy)
    ));
    assert!(matches!(
        client
            .begin_authorization(config().redirect_uris[0].clone(), false)
            .await,
        Err(AuthError::Busy)
    ));
    // Expire the cached token so concurrent readers must share one actual rotation.
    client
        .inner
        .state
        .lock()
        .await
        .grant
        .as_mut()
        .unwrap()
        .expires_at = now().unwrap() - 1;
    let mut tasks = Vec::new();
    for _ in 0..16 {
        let c = client.clone();
        tasks.push(tokio::spawn(async move {
            c.access_token(Duration::from_secs(5), false).await.unwrap()
        }));
    }
    for t in tasks {
        assert_eq!(t.await.unwrap().secret(), "fixture-access-2");
    }
    assert_eq!(f.tokens.load(Ordering::SeqCst), 2);
    assert_eq!(
        client
            .access_token(Duration::ZERO, true)
            .await
            .unwrap()
            .secret(),
        "fixture-access-3"
    );
    let saved: Value =
        serde_json::from_slice(&fs::read(dir.path().join("grant.json")).unwrap()).unwrap();
    assert_eq!(saved["refresh"], "fixture-refresh-3");
    drop(client);
    let restored = f.client(&dir).await;
    assert_eq!(restored.restore().await.unwrap(), Some(identity));
    assert_eq!(f.tokens.load(Ordering::SeqCst), 4);
    restored.logout().await.unwrap();
    assert!(!dir.path().join("grant.json").exists());
}

#[tokio::test]
async fn refresh_and_revocation_failures_preserve_the_only_owner_and_errors_are_redacted() {
    let f = Fixture::new();
    let dir = private_temp();
    let client = f.client(&dir).await;
    f.login(&client).await;
    f.fail_refresh.store(true, Ordering::SeqCst);
    let error = client.access_token(Duration::ZERO, true).await.unwrap_err();
    assert_eq!(error, AuthError::RefreshFailed);
    assert!(!error.to_string().contains("fixture-sensitive"));
    assert!(dir.path().join("grant.json").exists());
    f.fail_refresh.store(false, Ordering::SeqCst);
    assert_eq!(
        client
            .access_token(Duration::ZERO, true)
            .await
            .unwrap()
            .secret(),
        "fixture-access-2"
    );
    f.fail_revoke.store(true, Ordering::SeqCst);
    assert_eq!(
        client.logout().await.unwrap_err(),
        AuthError::RevocationFailed
    );
    assert!(dir.path().join("grant.json").exists());
    assert!(matches!(
        client.access_token(Duration::ZERO, false).await,
        Err(AuthError::NoSession)
    ));
    drop(client);
    let retry = f.client(&dir).await;
    assert!(matches!(retry.restore().await, Err(AuthError::NoSession)));
    f.fail_revoke.store(false, Ordering::SeqCst);
    retry.logout().await.unwrap();
    assert!(!dir.path().join("grant.json").exists());
}

#[tokio::test]
async fn healthy_grant_rejects_begin_without_replacing_its_owner() {
    let f = Fixture::new();
    let dir = private_temp();
    let client = f.client(&dir).await;
    let identity = f.login(&client).await;
    let path = dir.path().join("grant.json");
    let owner = fs::read(&path).unwrap();
    assert!(matches!(
        client
            .begin_authorization(config().redirect_uris[0].clone(), false)
            .await,
        Err(AuthError::Busy)
    ));
    assert_eq!(fs::read(&path).unwrap(), owner);
    assert_eq!(f.tokens.load(Ordering::SeqCst), 1);
    assert_eq!(f.revokes.load(Ordering::SeqCst), 0);
    assert!(!client.cleanup_required().await);
    assert_eq!(
        client
            .access_token(Duration::ZERO, false)
            .await
            .unwrap()
            .secret(),
        "fixture-access-1"
    );
    assert_eq!(
        client
            .inner
            .state
            .lock()
            .await
            .grant
            .as_ref()
            .unwrap()
            .identity,
        Some(identity)
    );
}

#[tokio::test]
async fn expired_invalid_refresh_requires_successful_logout_before_reauthorization() {
    for fail_first_revoke in [false, true] {
        let f = Fixture::new();
        let dir = private_temp();
        let client = f.client(&dir).await;
        let identity = f.login(&client).await;
        let path = dir.path().join("grant.json");
        let owner = fs::read(&path).unwrap();
        client
            .inner
            .state
            .lock()
            .await
            .grant
            .as_mut()
            .unwrap()
            .expires_at = now().unwrap() - 1;
        f.fail_refresh.store(true, Ordering::SeqCst);
        assert_eq!(
            client
                .access_token(Duration::ZERO, false)
                .await
                .unwrap_err(),
            AuthError::RefreshFailed
        );
        assert_eq!(fs::read(&path).unwrap(), owner);
        assert!(matches!(
            client
                .begin_authorization(config().redirect_uris[0].clone(), false)
                .await,
            Err(AuthError::Busy)
        ));

        f.fail_revoke.store(fail_first_revoke, Ordering::SeqCst);
        if fail_first_revoke {
            assert_eq!(
                client.logout().await.unwrap_err(),
                AuthError::RevocationFailed
            );
            assert!(client.cleanup_required().await);
            let quarantined = fs::read(&path).unwrap();
            let saved: Value = serde_json::from_slice(&quarantined).unwrap();
            assert_eq!(saved["refresh"], "fixture-refresh-1");
            assert_eq!(saved["usable"], false);
            assert!(matches!(
                client
                    .begin_authorization(config().redirect_uris[0].clone(), false)
                    .await,
                Err(AuthError::Busy)
            ));
            assert!(matches!(client.restore().await, Err(AuthError::NoSession)));
            assert!(matches!(
                client.access_token(Duration::ZERO, false).await,
                Err(AuthError::NoSession)
            ));
            assert_eq!(fs::read(&path).unwrap(), quarantined);
            assert_eq!(f.tokens.load(Ordering::SeqCst), 1);
            assert_eq!(f.revokes.load(Ordering::SeqCst), 1);
            f.fail_revoke.store(false, Ordering::SeqCst);
        }
        client.logout().await.unwrap();
        assert_eq!(
            f.revokes.load(Ordering::SeqCst),
            if fail_first_revoke { 2 } else { 1 }
        );
        assert!(!path.exists());
        assert!(!client.cleanup_required().await);
        assert!(client.restore().await.unwrap().is_none());

        // This is the host's serialized logout().await? -> begin_authorization sequence.
        f.fail_refresh.store(false, Ordering::SeqCst);
        let (transaction, callback) = f.begin(&client, false).await;
        assert!(!path.exists());
        assert_eq!(
            client
                .complete_callback(transaction, callback)
                .await
                .unwrap(),
            identity
        );
        assert_eq!(f.tokens.load(Ordering::SeqCst), 2);
        assert_eq!(
            client
                .access_token(Duration::ZERO, false)
                .await
                .unwrap()
                .secret(),
            "fixture-access-2"
        );
        let saved: Value = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
        assert_eq!(saved["refresh"], "fixture-refresh-2");
    }
}

#[tokio::test]
async fn cancellation_during_exchange_never_restores_a_late_grant_and_failed_revoke_keeps_quarantine(
) {
    for failed_revoke in [false, true] {
        let f = Fixture::new();
        let dir = private_temp();
        let client = f.client(&dir).await;
        let (txn, callback) = f.begin(&client, false).await;
        let cancel = txn.cancellation_handle();
        f.pause_token.store(true, Ordering::SeqCst);
        f.fail_revoke.store(failed_revoke, Ordering::SeqCst);
        let c = client.clone();
        let task = tokio::spawn(async move { c.complete_callback(txn, callback).await });
        f.entered.notified().await;
        assert!(cancel.cancel());
        f.release.notify_one();
        assert_eq!(task.await.unwrap().unwrap_err(), AuthError::Cancelled);
        assert!(matches!(
            client.access_token(Duration::ZERO, false).await,
            Err(AuthError::NoSession)
        ));
        assert_eq!(dir.path().join("grant.json").exists(), failed_revoke);
        if failed_revoke {
            f.fail_revoke.store(false, Ordering::SeqCst);
            client.logout().await.unwrap();
        }
    }
}

#[tokio::test]
async fn dropping_refresh_waiter_does_not_cancel_rotation_owner() {
    let f = Fixture::new();
    let dir = private_temp();
    let client = f.client(&dir).await;
    f.login(&client).await;
    f.pause_token.store(true, Ordering::SeqCst);
    let c = client.clone();
    let task = tokio::spawn(async move { c.access_token(Duration::ZERO, true).await });
    f.entered.notified().await;
    task.abort();
    let _ = task.await;
    f.release.notify_one();
    let token = client.access_token(Duration::ZERO, false).await.unwrap();
    assert_eq!(token.secret(), "fixture-access-2");
    let saved: Value =
        serde_json::from_slice(&fs::read(dir.path().join("grant.json")).unwrap()).unwrap();
    assert_eq!(saved["refresh"], "fixture-refresh-2");
    assert!(!format!("{token:?}").contains(token.secret()));
}

#[tokio::test]
async fn rotation_persistence_failure_retains_new_owner_in_memory_until_durable_retry() {
    let f = Fixture::new();
    let dir = private_temp();
    let client = f.client(&dir).await;
    f.login(&client).await;
    let path = dir.path().join("grant.json");
    fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();
    assert_eq!(
        client.access_token(Duration::ZERO, true).await.unwrap_err(),
        AuthError::Storage
    );
    fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
    assert_eq!(
        client
            .access_token(Duration::ZERO, false)
            .await
            .unwrap()
            .secret(),
        "fixture-access-2"
    );
    assert_eq!(f.tokens.load(Ordering::SeqCst), 2);
    let saved: Value = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
    assert_eq!(saved["refresh"], "fixture-refresh-2");
}

#[tokio::test]
async fn refresh_cannot_change_verified_subject_and_rotation_remains_revocable() {
    let f = Fixture::new();
    let dir = private_temp();
    let client = f.client(&dir).await;
    f.login(&client).await;
    *f.changes.lock().unwrap() = json!({"sub":"different-subject"});
    assert_eq!(
        client.access_token(Duration::ZERO, true).await.unwrap_err(),
        AuthError::OwnershipMismatch
    );
    assert!(matches!(
        client.access_token(Duration::ZERO, false).await,
        Err(AuthError::NoSession)
    ));
    let saved: Value =
        serde_json::from_slice(&fs::read(dir.path().join("grant.json")).unwrap()).unwrap();
    assert_eq!(saved["refresh"], "fixture-refresh-2");
    client.logout().await.unwrap();
}

#[tokio::test]
async fn unsafe_files_symlinks_hardlinks_and_configuration_mismatch_are_rejected_without_deletion()
{
    let dir = private_temp();
    let outside = private_temp();
    let path = dir.path().join("grant.json");
    fs::write(outside.path().join("target"), b"private-fixture").unwrap();
    symlink(outside.path().join("target"), &path).unwrap();
    assert!(matches!(
        AuthClient::new(config(), &path).await,
        Err(AuthError::Storage)
    ));
    fs::remove_file(&path).unwrap();
    fs::hard_link(outside.path().join("target"), &path).unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
    assert!(matches!(
        AuthClient::new(config(), &path).await,
        Err(AuthError::Storage)
    ));
    fs::remove_file(&path).unwrap();
    assert_eq!(
        fs::read(outside.path().join("target")).unwrap(),
        b"private-fixture"
    );
    let f = Fixture::new();
    let client = f.client(&dir).await;
    f.login(&client).await;
    drop(client);
    let mut changed = config();
    changed.client_id = "DifferentNative".into();
    assert!(matches!(
        AuthClient::new(changed, &path).await,
        Err(AuthError::OwnershipMismatch)
    ));
    assert!(path.exists());
    let linked = outside.path().join("linked");
    symlink(dir.path(), &linked).unwrap();
    assert!(matches!(
        AuthClient::new(config(), linked.join("grant.json")).await,
        Err(AuthError::Storage)
    ));
}

#[tokio::test]
async fn discovery_and_config_cannot_select_other_hosts_or_plaintext_endpoints() {
    let mut invalid = config();
    invalid.issuer = Url::parse("http://fixture.example/oidc").unwrap();
    let dir = private_temp();
    assert!(matches!(
        AuthClient::new(invalid, dir.path().join("grant.json")).await,
        Err(AuthError::Configuration)
    ));
    let f = Fixture::new();
    f.wrong_jwks.store(true, Ordering::SeqCst);
    let client = f.client(&dir).await;
    assert!(matches!(
        client
            .begin_authorization(config().redirect_uris[0].clone(), false)
            .await,
        Err(AuthError::Network)
    ));
    assert_eq!(f.tokens.load(Ordering::SeqCst), 0);
    assert!(client.restore().await.unwrap().is_none());
}

#[tokio::test]
#[ignore = "read-only public Logto discovery/JWKS compatibility; no user or token grant"]
async fn live_public_logto_discovery_is_compatible() {
    let cfg = PinnedConfig {
        issuer: Url::parse("https://auth.x.aixgg.com/oidc").unwrap(),
        client_id: "il4abzwbu1ohjwv5mb667".into(),
        resource: Url::parse("https://cybernote.app/api").unwrap(),
        redirect_uris: config().redirect_uris,
    };
    let dir = private_temp();
    let client = AuthClient::new(cfg.clone(), dir.path().join("grant.json"))
        .await
        .unwrap();
    let (transaction, url) = client
        .begin_authorization(cfg.redirect_uris[0].clone(), true)
        .await
        .unwrap();
    assert_eq!(url.origin(), cfg.issuer.origin());
    assert_eq!(url.path(), "/oidc/auth");
    assert!(url
        .query_pairs()
        .any(|(k, v)| k == "first_screen" && v == "register"));
    drop(transaction);
    assert!(!dir.path().join("grant.json").exists());
}

#[tokio::test]
async fn missing_refresh_and_failed_revocation_offer_safe_explicit_cleanup_without_profile() {
    let f = Fixture::new();
    let dir = private_temp();
    let client = f.client(&dir).await;
    assert!(!client.cleanup_required().await);
    f.omit_refresh.store(true, Ordering::SeqCst);
    f.fail_revoke.store(true, Ordering::SeqCst);
    let (transaction, callback) = f.begin(&client, false).await;
    assert_eq!(
        client
            .complete_callback(transaction, callback)
            .await
            .unwrap_err(),
        AuthError::InvalidIdentity
    );
    let network_before = (
        f.tokens.load(Ordering::SeqCst),
        f.revokes.load(Ordering::SeqCst),
    );
    assert!(client.cleanup_required().await);
    assert_eq!(
        (
            f.tokens.load(Ordering::SeqCst),
            f.revokes.load(Ordering::SeqCst)
        ),
        network_before
    );
    assert!(matches!(client.restore().await, Err(AuthError::NoSession)));
    assert!(matches!(
        client
            .begin_authorization(config().redirect_uris[0].clone(), false)
            .await,
        Err(AuthError::Busy)
    ));
    assert_eq!(
        client.logout().await.unwrap_err(),
        AuthError::RevocationFailed
    );
    assert!(client.cleanup_required().await);
    f.fail_revoke.store(false, Ordering::SeqCst);
    client.logout().await.unwrap();
    assert!(!client.cleanup_required().await);
    assert!(client.restore().await.unwrap().is_none());
    f.omit_refresh.store(false, Ordering::SeqCst);
    f.login(&client).await;
    assert!(!client.cleanup_required().await);
}
