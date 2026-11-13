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
    refresh_scope: SyncMutex<String>,
    refresh_handle: SyncMutex<String>,
    revoked_tokens: SyncMutex<Vec<(String, String)>>,
    omit_refresh_id: AtomicBool,
    tokens: AtomicUsize,
    revokes: AtomicUsize,
    fail_refresh: AtomicBool,
    fail_revoke: AtomicBool,
    wrong_jwks: AtomicBool,
    wrong_signature: AtomicBool,
    wrong_alg: AtomicBool,
    omit_refresh: AtomicBool,
    empty_refresh: AtomicBool,
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
            refresh_scope: SyncMutex::new("connect".into()),
            refresh_handle: SyncMutex::new(String::new()),
            revoked_tokens: SyncMutex::new(Vec::new()),
            omit_refresh_id: AtomicBool::new(false),
            tokens: AtomicUsize::new(0),
            revokes: AtomicUsize::new(0),
            fail_refresh: AtomicBool::new(false),
            fail_revoke: AtomicBool::new(false),
            wrong_jwks: AtomicBool::new(false),
            wrong_signature: AtomicBool::new(false),
            wrong_alg: AtomicBool::new(false),
            omit_refresh: AtomicBool::new(false),
            empty_refresh: AtomicBool::new(false),
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
            assert!(!form["token"].is_empty());
            self.revoked_tokens
                .lock()
                .unwrap()
                .push((form["token"].clone(), form["token_type_hint"].clone()));
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
        let is_refresh = form.get("grant_type").map(String::as_str) == Some("refresh_token");
        if is_refresh {
            assert_eq!(
                form.get("refresh_token").unwrap(),
                self.refresh_handle.lock().unwrap().as_str()
            );
            // Resource access-token scopes differ from the original OIDC scopes.
            // Refresh must inherit its grant rather than resubmit authorization scopes.
            assert!(!form.contains_key("scope"));
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
        } else if self.empty_refresh.load(Ordering::SeqCst) {
            body["refresh_token"] = json!("");
        }
        if let Some(token) = body
            .get("refresh_token")
            .and_then(Value::as_str)
            .filter(|token| !token.is_empty())
        {
            *self.refresh_handle.lock().unwrap() = token.to_owned();
        }
        if is_refresh {
            body["scope"] = json!(self.refresh_scope.lock().unwrap().clone());
            if self.omit_refresh_id.load(Ordering::SeqCst) {
                body.as_object_mut().unwrap().remove("id_token");
            }
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
async fn code_exchange_transport_failure_stays_network_and_never_replays_code() {
    let f = Fixture::new();
    let dir = private_temp();
    let cfg = config();
    let mut http = f.http(&cfg);
    let responder = http.responder.take().unwrap();
    let calls = Arc::new(AtomicUsize::new(0));
    let observed = calls.clone();
    http.responder = Some(Arc::new(move |request| {
        if request.uri().path() == "/oidc/token" {
            observed.fetch_add(1, Ordering::SeqCst);
            Box::pin(async { Err(AuthError::Network) })
        } else {
            responder(request)
        }
    }));
    let client = AuthClient::initialize(cfg, &dir.path().join("grant.json"), http).unwrap();
    let (transaction, callback) = f.begin(&client, false).await;
    assert_eq!(
        client
            .complete_callback(transaction, callback)
            .await
            .unwrap_err(),
        AuthError::Network
    );
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    assert!(!client.cleanup_required().await);
    assert!(client.restore().await.unwrap().is_none());
    assert!(!dir.path().join("grant.json").exists());
    assert_eq!(f.revokes.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn code_exchange_rejection_and_malformed_response_have_fixed_safe_categories() {
    for (malformed, expected) in [
        (false, AuthError::CodeExchangeRejected),
        (true, AuthError::TokenResponseInvalid),
    ] {
        let f = Fixture::new();
        let dir = private_temp();
        let cfg = config();
        let mut http = f.http(&cfg);
        let responder = http.responder.take().unwrap();
        let calls = Arc::new(AtomicUsize::new(0));
        let observed = calls.clone();
        http.responder = Some(Arc::new(move |request| {
            if request.uri().path() == "/oidc/token" {
                observed.fetch_add(1, Ordering::SeqCst);
                Box::pin(async move {
                    if malformed {
                        Ok(oauth2::http::Response::builder()
                            .status(200)
                            .header("content-type", "application/json")
                            .body(b"fixture-sensitive-not-json".to_vec())
                            .unwrap())
                    } else {
                        Ok(response(
                            400,
                            json!({"error":"invalid_grant","error_description":"fixture-sensitive-response"}),
                        ))
                    }
                })
            } else {
                responder(request)
            }
        }));
        let client = AuthClient::initialize(cfg, &dir.path().join("grant.json"), http).unwrap();
        let (transaction, callback) = f.begin(&client, false).await;
        let error = client
            .complete_callback(transaction, callback)
            .await
            .unwrap_err();
        assert_eq!(error, expected);
        assert!(!error.to_string().contains("fixture-sensitive"));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert!(client.restore().await.unwrap().is_none());
        assert!(!client.cleanup_required().await);
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
async fn logto_callback_issuer_is_optional_exact_and_unique_before_code_exchange() {
    for response_issuer in [None, Some("https://fixture.example/oidc")] {
        let f = Fixture::new();
        let dir = private_temp();
        let client = f.client(&dir).await;
        let (transaction, mut callback) = f.begin(&client, false).await;
        if let Some(issuer) = response_issuer {
            // Actual Logto callback shape: code, state, iss (values are fixtures).
            let state = callback
                .query_pairs()
                .find(|(k, _)| k == "state")
                .unwrap()
                .1
                .into_owned();
            callback.set_query(None);
            callback
                .query_pairs_mut()
                .append_pair("code", "fixture-code")
                .append_pair("state", &state)
                .append_pair("iss", issuer);
        }
        assert_eq!(
            client
                .complete_callback(transaction, callback)
                .await
                .unwrap()
                .subject,
            "fixture-subject"
        );
        assert_eq!(f.tokens.load(Ordering::SeqCst), 1);
    }
    for issuers in [
        vec!["https://attacker.example/oidc"],
        vec!["https://fixture.example/oidc/"],
        vec!["https://FIXTURE.example/oidc"],
        vec![""],
        vec![
            "https://fixture.example/oidc",
            "https://fixture.example/oidc",
        ],
        vec![
            "https://fixture.example/oidc",
            "https://attacker.example/oidc",
        ],
    ] {
        let f = Fixture::new();
        let dir = private_temp();
        let client = f.client(&dir).await;
        let (transaction, mut callback) = f.begin(&client, false).await;
        for issuer in issuers {
            callback.query_pairs_mut().append_pair("iss", issuer);
        }
        assert_eq!(
            client
                .complete_callback(transaction, callback)
                .await
                .unwrap_err(),
            AuthError::InvalidCallback
        );
        assert_eq!(f.tokens.load(Ordering::SeqCst), 0);
        assert!(!dir.path().join("grant.json").exists());
    }
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
        // A correct RFC 9207 iss must not weaken any state/PKCE/ID-token check.
        callback
            .query_pairs_mut()
            .append_pair("iss", config().issuer.as_str());
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
        let rejection = match kind {
            "nonce" => Some(IdentityRejection::Nonce),
            "issuer" => Some(IdentityRejection::Issuer),
            "audience" => Some(IdentityRejection::Audience),
            "subject" => Some(IdentityRejection::Subject),
            "expiry" => Some(IdentityRejection::Expired),
            "azp" => Some(IdentityRejection::AuthorizedParty),
            "issued_at" => Some(IdentityRejection::IssuedAt),
            "signature" => Some(IdentityRejection::Signature),
            "algorithm" => Some(IdentityRejection::Algorithm),
            "at_hash" => Some(IdentityRejection::AccessTokenHash),
            _ => None,
        };
        assert_eq!(
            error,
            rejection
                .map(AuthError::IdentityRejected)
                .unwrap_or(AuthError::InvalidCallback),
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
async fn refresh_request_errors_keep_categories_and_owner_until_explicit_retry() {
    for (mode, expected) in [
        (1, AuthError::Network),
        (2, AuthError::Configuration),
        (3, AuthError::RefreshFailed),
        (4, AuthError::TokenResponseInvalid),
        (5, AuthError::Network),
        (6, AuthError::Network),
        (7, AuthError::Configuration),
        (8, AuthError::TokenResponseInvalid),
        (9, AuthError::Configuration),
        (10, AuthError::TokenResponseInvalid),
        (11, AuthError::Network),
        (12, AuthError::TokenResponseInvalid),
        (13, AuthError::TokenResponseInvalid),
        (14, AuthError::TokenResponseInvalid),
    ] {
        let f = Fixture::new();
        let dir = private_temp();
        let fault = Arc::new(AtomicUsize::new(0));
        let attempts = Arc::new(AtomicUsize::new(0));
        let mut http = f.http(&config());
        let fixture = f.clone();
        let failure = fault.clone();
        let requests = attempts.clone();
        http.responder = Some(Arc::new(move |request: HttpRequest| {
            let f = fixture.clone();
            let failure = failure.clone();
            let requests = requests.clone();
            Box::pin(async move {
                let is_refresh = request.uri().path() == "/oidc/token"
                    && url::form_urlencoded::parse(request.body())
                        .any(|(key, value)| key == "grant_type" && value == "refresh_token");
                if is_refresh {
                    requests.fetch_add(1, Ordering::SeqCst);
                    match failure.load(Ordering::SeqCst) {
                        1 => return Err(AuthError::Network),
                        2 => return Err(AuthError::Configuration),
                        3 => return Ok(response(400, json!({"error":"invalid_grant","error_description":"fixture-sensitive-response"}))),
                        4 => return Ok(response(200, json!({"private":"fixture-sensitive-response"}))),
                        5 => return Ok(response(503, json!({"error":"temporarily_unavailable","error_description":"fixture-sensitive-response"}))),
                        6 => return Ok(response(500, json!({"error":"server_error","error_description":"fixture-sensitive-response"}))),
                        7 => return Ok(response(401, json!({"error":"invalid_client","error_description":"fixture-sensitive-response"}))),
                        8 => return Ok(response(400, json!({"error":"unknown_fixture_rejection","error_description":"fixture-sensitive-response"}))),
                        9 => return Ok(response(400, json!({"error":"invalid_scope","error_description":"fixture-sensitive-response"}))),
                        10 => panic!("synthetic refresh owner failure"),
                        11 => return Ok(response(503, json!({"error":"invalid_grant"}))),
                        12 => return Ok(response(401, json!({"error":"invalid_grant"}))),
                        13 => return Ok(response(302, json!({"error":"invalid_grant"}))),
                        14 => return Ok(response(200, json!({"error":"invalid_grant"}))),
                        _ => {}
                    }
                }
                f.respond(request).await
            })
        }));
        let path = dir.path().join("grant.json");
        let client = AuthClient::initialize(config(), &path, http.clone()).unwrap();
        let identity = f.login(&client).await;
        drop(client);
        let before = fs::read(&path).unwrap();
        let client = AuthClient::initialize(config(), &path, http).unwrap();
        fault.store(mode, Ordering::SeqCst);
        let error = client.restore().await.unwrap_err();
        assert_eq!(error, expected);
        assert!(!error.to_string().contains("fixture-sensitive"));
        assert_eq!(attempts.load(Ordering::SeqCst), 1);
        assert_eq!(fs::read(&path).unwrap(), before);
        assert!(!client.cleanup_required().await);
        assert_eq!(f.revokes.load(Ordering::SeqCst), 0);
        // Only a second explicit operation may retry; successful rotation is durable.
        fault.store(0, Ordering::SeqCst);
        assert_eq!(client.restore().await.unwrap(), Some(identity));
        assert_eq!(attempts.load(Ordering::SeqCst), 2);
        let saved: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(saved["refresh"], "fixture-refresh-2");
    }
}

#[tokio::test]
async fn local_refresh_prerequisites_and_freshness_do_not_claim_server_rejection() {
    let f = Fixture::new();
    let dir = private_temp();
    let client = f.client(&dir).await;
    f.login(&client).await;
    // A successful rotation whose lifetime cannot satisfy this caller is not invalid_grant.
    assert_eq!(client.access_token(Duration::from_secs(7200), true).await.unwrap_err(), AuthError::TokenResponseInvalid);
    let path = dir.path().join("grant.json");
    let mut saved: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    assert_eq!(saved["refresh"], "fixture-refresh-2");
    assert_eq!(client.access_token(Duration::ZERO, false).await.unwrap().secret(), "fixture-access-2");
    drop(client);
    // A malformed local owner must not be described as a response from the server.
    saved["refresh"] = Value::Null;
    fs::write(&path, serde_json::to_vec(&saved).unwrap()).unwrap();
    let before = fs::read(&path).unwrap();
    let client = f.client(&dir).await;
    assert_eq!(client.restore().await.unwrap_err(), AuthError::MissingRefreshToken);
    assert_eq!(f.tokens.load(Ordering::SeqCst), 2);
    assert_eq!(f.revokes.load(Ordering::SeqCst), 0);
    assert_eq!(fs::read(&path).unwrap(), before);
}

#[tokio::test]
async fn rejected_owner_then_interrupted_reauthorization_can_explicitly_exit_and_sign_in_again() {
    let f = Fixture::new();
    let dir = private_temp();
    let client = f.client(&dir).await;
    let identity = f.login(&client).await;
    f.fail_refresh.store(true, Ordering::SeqCst);
    assert_eq!(client.restore().await.unwrap_err(), AuthError::RefreshFailed);
    client.logout().await.unwrap();
    assert!(!dir.path().join("grant.json").exists());
    let (transaction, _) = f.begin(&client, false).await;
    drop(transaction); // The host could not open the browser; no code was exchanged.
    assert!(client.restore().await.unwrap().is_none());
    assert!(!client.cleanup_required().await);
    assert_eq!(f.tokens.load(Ordering::SeqCst), 1);
    client.logout().await.unwrap(); // Explicit UI exit is safe even without a grant.
    assert_eq!(f.revokes.load(Ordering::SeqCst), 1);
    f.fail_refresh.store(false, Ordering::SeqCst);
    assert_eq!(f.login(&client).await, identity);
    assert_eq!(f.tokens.load(Ordering::SeqCst), 2);
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
async fn refresh_inherits_scope_and_requires_connect_with_or_without_an_id_token() {
    for omit_id in [false, true] {
        let f = Fixture::new();
        let dir = private_temp();
        let client = f.client(&dir).await;
        let identity = f.login(&client).await;
        f.omit_refresh_id.store(omit_id, Ordering::SeqCst);
        // The fixture checks resource and rejects any scope in the refresh request.
        assert_eq!(
            client
                .access_token(Duration::ZERO, true)
                .await
                .unwrap()
                .secret(),
            "fixture-access-2"
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
        *f.refresh_scope.lock().unwrap() = "profile".into();
        assert_eq!(
            client.access_token(Duration::ZERO, true).await.unwrap_err(),
            AuthError::ResponseMetadata(TokenOperation::Refresh, TokenResponseField::Scope)
        );
        assert!(client.cleanup_required().await);
        assert!(matches!(
            client.access_token(Duration::ZERO, false).await,
            Err(AuthError::NoSession)
        ));
        let saved: Value =
            serde_json::from_slice(&fs::read(dir.path().join("grant.json")).unwrap()).unwrap();
        assert_eq!(saved["refresh"], "fixture-refresh-3");
        client.logout().await.unwrap();
    }
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
async fn initial_empty_refresh_revokes_issued_access_and_failed_cleanup_survives_restart() {
    for fail_revoke in [false, true] {
        let f = Fixture::new();
        let dir = private_temp();
        let client = f.client(&dir).await;
        let path = dir.path().join("grant.json");
        f.empty_refresh.store(true, Ordering::SeqCst);
        f.fail_revoke.store(fail_revoke, Ordering::SeqCst);
        let (transaction, callback) = f.begin(&client, false).await;
        assert_eq!(
            client
                .complete_callback(transaction, callback)
                .await
                .unwrap_err(),
            AuthError::MissingRefreshToken
        );
        assert_eq!(
            *f.revoked_tokens.lock().unwrap(),
            vec![("fixture-access-1".into(), "access_token".into())]
        );
        assert!(matches!(
            client.access_token(Duration::ZERO, false).await,
            Err(AuthError::NoSession)
        ));
        assert_eq!(path.exists(), fail_revoke);
        assert_eq!(client.cleanup_required().await, fail_revoke);
        if fail_revoke {
            let saved: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
            assert!(saved["refresh"].is_null());
            assert_eq!(saved["access"], "fixture-access-1");
            assert_eq!(saved["usable"], false);
        }
        drop(client);
        let restored = f.client(&dir).await;
        if fail_revoke {
            assert!(restored.cleanup_required().await);
            assert!(matches!(
                restored.restore().await,
                Err(AuthError::NoSession)
            ));
            f.fail_revoke.store(false, Ordering::SeqCst);
            restored.logout().await.unwrap();
            assert_eq!(
                *f.revoked_tokens.lock().unwrap(),
                vec![
                    ("fixture-access-1".into(), "access_token".into()),
                    ("fixture-access-1".into(), "access_token".into()),
                ]
            );
        }
        assert!(!restored.cleanup_required().await);
        assert!(restored.restore().await.unwrap().is_none());
        assert!(!path.exists());
    }
}

#[tokio::test]
async fn empty_refresh_rotation_quarantines_prior_handle_and_logout_retries_after_restart() {
    for omit_id in [false, true] {
        let f = Fixture::new();
        let dir = private_temp();
        let client = f.client(&dir).await;
        f.login(&client).await;
        f.empty_refresh.store(true, Ordering::SeqCst);
        f.omit_refresh_id.store(omit_id, Ordering::SeqCst);
        assert_eq!(
            client.access_token(Duration::ZERO, true).await.unwrap_err(),
            AuthError::InvalidIdentity
        );
        assert!(client.cleanup_required().await);
        assert!(matches!(
            client.access_token(Duration::ZERO, false).await,
            Err(AuthError::NoSession)
        ));
        let path = dir.path().join("grant.json");
        let saved: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(saved["refresh"], "fixture-refresh-1");
        assert_eq!(saved["usable"], false);
        f.fail_revoke.store(true, Ordering::SeqCst);
        assert_eq!(
            client.logout().await.unwrap_err(),
            AuthError::RevocationFailed
        );
        assert_eq!(
            *f.revoked_tokens.lock().unwrap(),
            vec![("fixture-refresh-1".into(), "refresh_token".into())]
        );
        assert!(client.cleanup_required().await);
        drop(client);

        let restored = f.client(&dir).await;
        assert!(restored.cleanup_required().await);
        assert!(matches!(
            restored.restore().await,
            Err(AuthError::NoSession)
        ));
        assert!(matches!(
            restored
                .begin_authorization(config().redirect_uris[0].clone(), false)
                .await,
            Err(AuthError::Busy)
        ));
        assert_eq!(f.tokens.load(Ordering::SeqCst), 2);
        f.fail_revoke.store(false, Ordering::SeqCst);
        restored.logout().await.unwrap();
        assert_eq!(
            *f.revoked_tokens.lock().unwrap(),
            vec![
                ("fixture-refresh-1".into(), "refresh_token".into()),
                ("fixture-refresh-1".into(), "refresh_token".into()),
            ]
        );
        assert!(!path.exists());
        assert!(!restored.cleanup_required().await);
        assert!(restored.restore().await.unwrap().is_none());
    }
}

#[tokio::test]
async fn omitted_refresh_rotation_inherits_prior_handle_across_restart_and_revocation() {
    for omit_id in [false, true] {
        let f = Fixture::new();
        let dir = private_temp();
        let client = f.client(&dir).await;
        let identity = f.login(&client).await;
        f.omit_refresh.store(true, Ordering::SeqCst);
        f.omit_refresh_id.store(omit_id, Ordering::SeqCst);
        assert_eq!(
            client
                .access_token(Duration::ZERO, true)
                .await
                .unwrap()
                .secret(),
            "fixture-access-2"
        );
        let path = dir.path().join("grant.json");
        let saved: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(saved["refresh"], "fixture-refresh-1");
        assert_eq!(saved["usable"], true);
        drop(client);
        let restored = f.client(&dir).await;
        assert_eq!(restored.restore().await.unwrap(), Some(identity));
        assert_eq!(
            restored
                .access_token(Duration::ZERO, false)
                .await
                .unwrap()
                .secret(),
            "fixture-access-3"
        );
        restored.logout().await.unwrap();
        assert_eq!(
            *f.revoked_tokens.lock().unwrap(),
            vec![("fixture-refresh-1".into(), "refresh_token".into())]
        );
        assert!(!path.exists());
    }
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
        AuthError::MissingRefreshToken
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

// relogin02 reports only ResponseMetadata. Exercise its possible token-envelope
// causes without reading a live grant or conflating them with OIDC discovery.
#[tokio::test]
async fn relogin02_response_metadata_rejects_each_envelope_condition_on_all_token_paths() {
    for path in ["code", "refresh-id", "refresh-no-id"] {
        for condition in [
            "type",
            "access",
            "expiry-missing",
            "expiry-zero",
            "scope",
            "all",
            "access-expiry-scope",
            "expiry-scope",
        ] {
            let f = Fixture::new();
            f.omit_refresh_id
                .store(path == "refresh-no-id", Ordering::SeqCst);
            let dir = private_temp();
            let cfg = config();
            let mut http = f.http(&cfg);
            let responder = http.responder.take().unwrap();
            let mutate = Arc::new(AtomicBool::new(path == "code"));
            let enabled = mutate.clone();
            http.responder = Some(Arc::new(move |request| {
                let token = request.uri().path() == "/oidc/token";
                let change = enabled.load(Ordering::SeqCst) && token;
                let result = responder(request);
                Box::pin(async move {
                    let mut reply = result.await?;
                    if change {
                        let mut body: Value = serde_json::from_slice(reply.body()).unwrap();
                        match condition {
                            "type" => body["token_type"] = json!("mac"),
                            "access" => body["access_token"] = json!(""),
                            "expiry-missing" => {
                                body.as_object_mut().unwrap().remove("expires_in");
                            }
                            "expiry-zero" => body["expires_in"] = json!(0),
                            "scope" => body["scope"] = json!("openid profile offline_access"),
                            "all" | "access-expiry-scope" | "expiry-scope" => {
                                body["expires_in"] = json!(0);
                                body["scope"] = json!("profile");
                                if condition != "expiry-scope" {
                                    body["access_token"] = json!("");
                                }
                                if condition == "all" {
                                    body["token_type"] = json!("mac");
                                }
                            }
                            _ => unreachable!(),
                        }
                        *reply.body_mut() = serde_json::to_vec(&body).unwrap();
                    }
                    Ok(reply)
                })
            }));
            let client = AuthClient::initialize(cfg, &dir.path().join("grant.json"), http).unwrap();
            let error = if path == "code" {
                let (transaction, callback) = f.begin(&client, false).await;
                client
                    .complete_callback(transaction, callback)
                    .await
                    .unwrap_err()
            } else {
                f.login(&client).await;
                mutate.store(true, Ordering::SeqCst);
                client.access_token(Duration::ZERO, true).await.unwrap_err()
            };
            let operation = if path == "code" {
                TokenOperation::CodeExchange
            } else {
                TokenOperation::Refresh
            };
            let field = match condition {
                "type" | "all" => TokenResponseField::TokenType,
                "access" | "access-expiry-scope" => TokenResponseField::AccessToken,
                "expiry-missing" | "expiry-zero" | "expiry-scope" => TokenResponseField::ExpiresIn,
                "scope" => TokenResponseField::Scope,
                _ => unreachable!(),
            };
            assert_eq!(
                error,
                AuthError::ResponseMetadata(operation, field),
                "{path}/{condition}"
            );
            // Initial failure revokes the rejected grant; refresh retains the
            // latest rotation quarantined for explicit cleanup. Neither exposes access.
            assert!(matches!(
                client.access_token(Duration::ZERO, false).await,
                Err(AuthError::NoSession)
            ));
            assert_eq!(client.cleanup_required().await, path != "code");
            assert_eq!(
                f.tokens.load(Ordering::SeqCst),
                if path == "code" { 1 } else { 2 }
            );
            if path != "code" {
                let state = client.inner.state.lock().await;
                let grant = state.grant.as_ref().unwrap();
                assert!(!grant.usable);
                assert_eq!(grant.refresh.as_deref(), Some("fixture-refresh-2"));
            }
            client.logout().await.unwrap();
            assert!(!client.cleanup_required().await);
        }
    }
}

#[tokio::test]
async fn relogin02_scope_omission_and_connect_subsets_are_accepted_on_all_token_paths() {
    for path in ["code", "refresh-id", "refresh-no-id"] {
        for scope in [
            None,
            Some("connect"),
            Some("openid profile offline_access connect"),
        ] {
            let f = Fixture::new();
            f.omit_refresh_id
                .store(path == "refresh-no-id", Ordering::SeqCst);
            let dir = private_temp();
            let cfg = config();
            let mut http = f.http(&cfg);
            let responder = http.responder.take().unwrap();
            http.responder = Some(Arc::new(move |request| {
                let change = request.uri().path() == "/oidc/token";
                let result = responder(request);
                Box::pin(async move {
                    let mut reply = result.await?;
                    if change {
                        let mut body: Value = serde_json::from_slice(reply.body()).unwrap();
                        if let Some(scope) = scope {
                            body["scope"] = json!(scope);
                        } else {
                            body.as_object_mut().unwrap().remove("scope");
                        }
                        *reply.body_mut() = serde_json::to_vec(&body).unwrap();
                    }
                    Ok(reply)
                })
            }));
            let client = AuthClient::initialize(cfg, &dir.path().join("grant.json"), http).unwrap();
            let identity = f.login(&client).await;
            if path != "code" {
                client.access_token(Duration::ZERO, true).await.unwrap();
                assert_eq!(
                    client
                        .inner
                        .state
                        .lock()
                        .await
                        .grant
                        .as_ref()
                        .unwrap()
                        .identity
                        .as_ref(),
                    Some(&identity)
                );
            }
            assert!(!client.cleanup_required().await);
            client.logout().await.unwrap();
        }
    }
}

#[tokio::test]
async fn relogin02_replacement_begin_does_not_restore_and_requires_settled_logout() {
    for fail_revoke in [false, true] {
        let f = Fixture::new();
        let dir = private_temp();
        let cfg = config();
        let mut http = f.http(&cfg);
        let responder = http.responder.take().unwrap();
        let operations = Arc::new(SyncMutex::new(Vec::new()));
        let observed = operations.clone();
        http.responder = Some(Arc::new(move |request| {
            let operation = match request.uri().path() {
                "/oidc/.well-known/openid-configuration" => "discovery",
                "/oidc/jwks" => "jwks",
                "/oidc/token/revocation" => "revoke",
                "/oidc/token" => {
                    let form: HashMap<String, String> = url::form_urlencoded::parse(request.body())
                        .into_owned()
                        .collect();
                    if form["grant_type"] == "refresh_token" {
                        "refresh"
                    } else {
                        "code"
                    }
                }
                _ => panic!("unexpected fixture endpoint"),
            };
            observed.lock().unwrap().push(operation);
            responder(request)
        }));
        let client = AuthClient::initialize(cfg, &dir.path().join("grant.json"), http).unwrap();
        f.login(&client).await;
        f.fail_refresh.store(true, Ordering::SeqCst);
        assert_eq!(
            client.restore().await.unwrap_err(),
            AuthError::RefreshFailed
        );
        assert!(matches!(
            client
                .begin_authorization(config().redirect_uris[0].clone(), false)
                .await,
            Err(AuthError::Busy)
        ));
        f.fail_revoke.store(fail_revoke, Ordering::SeqCst);
        let logout = client.logout().await;
        if fail_revoke {
            assert_eq!(logout, Err(AuthError::RevocationFailed));
            assert!(client.cleanup_required().await);
            assert!(matches!(
                client
                    .begin_authorization(config().redirect_uris[0].clone(), false)
                    .await,
                Err(AuthError::Busy)
            ));
        } else {
            logout.unwrap();
            let (transaction, _) = client
                .begin_authorization(config().redirect_uris[0].clone(), false)
                .await
                .unwrap();
            drop(transaction); // no browser or callback; begin sends no token request
            assert!(client.restore().await.unwrap().is_none());
        }
        assert_eq!(
            *operations.lock().unwrap(),
            vec!["discovery", "jwks", "code", "refresh", "revoke"]
        );
        f.fail_revoke.store(false, Ordering::SeqCst);
        client.logout().await.unwrap();
    }
}
