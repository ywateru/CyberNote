use super::{
    config,
    private::Binding,
    types::{Error, NetworkStage, Result},
};
use crate::sync::{
    identity::{now, SyncError},
    network::ReplicationPolicy,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use jsonwebtoken::{decode, decode_header, jwk::JwkSet, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Mutex};
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Profile {
    pub schema_version: u8,
    pub subject: String,
    pub issuer: String,
    pub product_id: String,
    pub workspace_id: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Claims {
    pub iss: String,
    pub aud: String,
    pub sub: String,
    pub account_issuer: String,
    pub product_id: String,
    pub workspace_id: String,
    pub device_id: String,
    pub noise_public_key: String,
    pub purpose: String,
    pub iat: u64,
    pub exp: u64,
    pub jti: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Envelope {
    schema_version: u8,
    token: String,
    expires_at: u64,
}
/// Constructed only after a signed local enrollment is verified against the
/// fixed coordinator and authenticated owner. Cannot deserialize from IPC/disk.
pub(crate) struct VerifiedWorkspace {
    workspace: String,
    device: String,
    noise_key: String,
}
impl VerifiedWorkspace {
    pub(crate) fn workspace(&self) -> &str {
        &self.workspace
    }
    pub(crate) fn matches(&self, identity: &crate::sync::identity::IdentityStore) -> bool {
        identity.device_id().is_ok_and(|id| id == self.device)
            && identity.public_key().is_ok_and(|key| key == self.noise_key)
    }
}
pub(crate) struct Enrollment {
    http: reqwest::Client,
    transport_origin: String,
}
impl Enrollment {
    pub fn new(transport_origin: String) -> Result<Self> {
        Ok(Self {
            transport_origin,
            http: reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(std::time::Duration::from_secs(15))
                .build()?,
        })
    }
    async fn json<T: serde::de::DeserializeOwned>(
        &self,
        request: reqwest::RequestBuilder,
        stage: NetworkStage,
    ) -> Result<T> {
        let network = |_| Error::NetworkAt(stage);
        let mut response = request.send().await.map_err(network)?;
        if !response.status().is_success() {
            return Err(
                if response.status().as_u16() == 401 || response.status().as_u16() == 403 {
                    Error::AuthenticationAt(stage)
                } else {
                    Error::NetworkAt(stage)
                },
            );
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(network)? {
            if bytes.len() + chunk.len() > 65536 {
                return Err(Error::InvalidProof);
            }
            bytes.extend_from_slice(&chunk)
        }
        serde_json::from_slice(&bytes).map_err(|_| Error::InvalidProof)
    }
    pub async fn profile(&self, token: &str) -> Result<Profile> {
        let profile: Profile = self
            .json(
                self.http
                    .get(format!("{}/api/v1/account/profile", self.transport_origin))
                    .bearer_auth(token),
                NetworkStage::CoordinatorProfile,
            )
            .await?;
        if profile.schema_version != 1
            || profile.issuer != config::ISSUER
            || profile.product_id.is_empty()
        {
            return Err(Error::InvalidProof);
        }
        uuid::Uuid::parse_str(&profile.workspace_id).map_err(|_| Error::InvalidProof)?;
        Ok(profile)
    }
    pub async fn issue(
        &self,
        access: &str,
        binding: &Binding,
    ) -> Result<(String, Claims, VerifiedWorkspace)> {
        let envelope: Envelope = self
            .json(
                self.http
                    .post(format!("{}/api/v1/account/enrollment", self.transport_origin))
                    .bearer_auth(access)
                    .json(&serde_json::json!({"deviceId":binding.device_id,"noisePublicKey":binding.noise_public_key})),
                NetworkStage::CoordinatorEnrollment,
            )
            .await?;
        if envelope.schema_version != 1 {
            return Err(Error::InvalidProof);
        }
        let claims = self.verify(&envelope.token, binding).await?;
        if claims.device_id != binding.device_id
            || claims.noise_public_key != binding.noise_public_key
            || claims.exp != envelope.expires_at
        {
            return Err(Error::InvalidProof);
        }
        let verified = VerifiedWorkspace {
            workspace: claims.workspace_id.clone(),
            device: claims.device_id.clone(),
            noise_key: claims.noise_public_key.clone(),
        };
        Ok((envelope.token, claims, verified))
    }
    pub async fn verify(&self, token: &str, binding: &Binding) -> Result<Claims> {
        // Fixed transport; never follow a JWT jku/x5u or a peer-supplied key URL.
        let jwks: JwkSet = self
            .json(
                self.http
                    .get(format!("{}/api/v1/account/jwks", self.transport_origin)),
                NetworkStage::CoordinatorJwks,
            )
            .await?;
        verify(token, &jwks, config::ENROLLMENT_ISSUER, binding)
    }
}
fn canonical_key(value: &str) -> bool {
    B64.decode(value)
        .is_ok_and(|bytes| bytes.len() == 32 && B64.encode(bytes) == value)
}
pub(crate) fn verify(
    token: &str,
    jwks: &JwkSet,
    enrollment_issuer: &str,
    binding: &Binding,
) -> Result<Claims> {
    if token.len() > 8192 || jwks.keys.len() > 8 {
        return Err(Error::InvalidProof);
    }
    let header = decode_header(token).map_err(|_| Error::InvalidProof)?;
    if header.alg != Algorithm::ES384 || header.typ.as_deref().is_some_and(|v| v != "JWT") {
        return Err(Error::InvalidProof);
    }
    let kid = header.kid.ok_or(Error::InvalidProof)?;
    let keys = jwks
        .keys
        .iter()
        .filter(|key| key.common.key_id.as_deref() == Some(&kid))
        .collect::<Vec<_>>();
    if keys.len() != 1 {
        return Err(Error::InvalidProof);
    }
    let key = DecodingKey::from_jwk(keys[0]).map_err(|_| Error::InvalidProof)?;
    let mut validation = Validation::new(Algorithm::ES384);
    validation.set_issuer(&[enrollment_issuer]);
    validation.set_audience(&["cybernote-enrollment-v1"]);
    validation.leeway = 0;
    validation.set_required_spec_claims(&["exp", "iat", "iss", "aud", "sub"]);
    let c = decode::<Claims>(token, &key, &validation)
        .map_err(|_| Error::InvalidProof)?
        .claims;
    if c.iss != enrollment_issuer
        || c.aud != "cybernote-enrollment-v1"
        || c.sub != binding.subject
        || c.account_issuer != binding.issuer
        || c.product_id != binding.product_id
        || c.workspace_id != binding.workspace_id
        || c.purpose != "pair"
        || c.exp <= now()
        || c.iat > now() + 30
        || c.exp <= c.iat
        || c.exp - c.iat > 300
        || !canonical_key(&c.noise_public_key)
    {
        return Err(Error::InvalidProof);
    }
    uuid::Uuid::parse_str(&c.device_id).map_err(|_| Error::InvalidProof)?;
    uuid::Uuid::parse_str(&c.jti).map_err(|_| Error::InvalidProof)?;
    Ok(c)
}
#[derive(Default)]
struct GateState {
    closed: bool,
    lifecycle: Option<std::sync::Arc<dyn Fn() -> bool + Send + Sync>>,
    sdk: Option<std::sync::Weak<cybergrid_sdk::Client>>,
    local_until: u64,
    peers: HashMap<String, (String, u64)>,
    routes: HashMap<String, String>,
}
#[derive(Default)]
pub(crate) struct Gate(Mutex<GateState>);
impl Gate {
    pub fn bind_lifecycle(&self, active: std::sync::Arc<dyn Fn() -> bool + Send + Sync>) {
        if let Ok(mut state) = self.0.lock() {
            state.lifecycle = Some(active);
        }
    }
    pub fn attach(&self, client: &std::sync::Arc<cybergrid_sdk::Client>) {
        if let Ok(mut state) = self.0.lock() {
            state.sdk = Some(std::sync::Arc::downgrade(client));
        }
    }
    pub fn renew_local(&self, until: u64) {
        if let Ok(mut s) = self.0.lock() {
            if !s.closed {
                s.local_until = until;
            }
        }
    }
    pub fn admit(&self, proof: &Claims) {
        if let Ok(mut s) = self.0.lock() {
            if s.closed {
                return;
            }
            s.peers.insert(
                proof.device_id.clone(),
                (proof.noise_public_key.clone(), proof.exp),
            );
        }
    }
    pub fn route(&self, device: &str, endpoint: String) {
        if let Ok(mut s) = self.0.lock() {
            if !s.closed {
                s.routes.insert(device.into(), endpoint);
            }
        }
    }
    pub fn close(&self) {
        if let Ok(mut s) = self.0.lock() {
            s.closed = true;
            s.local_until = 0;
            s.peers.clear();
            s.routes.clear();
        }
    }
}
impl ReplicationPolicy for Gate {
    fn authorize(&self, device: &str, key: &str) -> crate::sync::identity::Result<()> {
        let s = self.0.lock().map_err(|_| SyncError::Revoked)?;
        if s.closed || s.lifecycle.as_ref().is_some_and(|active| !active()) {
            return Err(SyncError::Revoked);
        }
        if let Some(sdk) = &s.sdk {
            let sdk = sdk.upgrade().ok_or(SyncError::Revoked)?;
            let snapshot = sdk.snapshot();
            if !snapshot.remote_enabled
                || snapshot.coordination.phase != cybergrid_sdk::StatePhase::Ready
            {
                return Err(SyncError::Revoked);
            }
        }
        if s.local_until <= now()
            || !s
                .peers
                .get(device)
                .is_some_and(|(k, exp)| k == key && *exp > now())
        {
            return Err(SyncError::Revoked);
        }
        Ok(())
    }
    fn endpoint(&self, device: &str) -> crate::sync::identity::Result<String> {
        self.0
            .lock()
            .map_err(|_| SyncError::Revoked)?
            .routes
            .get(device)
            .cloned()
            .ok_or(SyncError::Transport)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn http_transport_is_independent_of_pinned_signed_enrollment_issuer() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        tokio::time::timeout(std::time::Duration::from_secs(5), async {
            assert_eq!(config::origin().unwrap(), "https://cybernote-sync.vercel.app");
            let (binding, jwks, key) = fixture();
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let transport_origin = format!("http://{}", listener.local_addr().unwrap());
            assert_ne!(transport_origin, config::ENROLLMENT_ISSUER);
            let enrollment = Enrollment::new(transport_origin.clone()).unwrap();
            let claims = Claims {
                iss: "https://cybernote-sync.vercel.app".into(),
                aud: "cybernote-enrollment-v1".into(),
                sub: binding.subject.clone(),
                account_issuer: binding.issuer.clone(),
                product_id: binding.product_id.clone(),
                workspace_id: binding.workspace_id.clone(),
                device_id: binding.device_id.clone(),
                noise_public_key: binding.noise_public_key.clone(),
                purpose: "pair".into(),
                iat: now(),
                exp: now() + 300,
                jti: uuid::Uuid::new_v4().to_string(),
            };
            let sign = |claims: &Claims| {
                let mut header = jsonwebtoken::Header::new(Algorithm::ES384);
                header.kid = Some("synthetic-fixture".into());
                jsonwebtoken::encode(&header, claims, &key).unwrap()
            };
            let proof = sign(&claims);
            let profile = serde_json::json!({
                "schemaVersion":1,"subject":binding.subject,"issuer":binding.issuer,
                "productId":binding.product_id,"workspaceId":binding.workspace_id
            });
            let envelope = serde_json::json!({"schemaVersion":1,"token":proof,"expiresAt":claims.exp});
            let public_keys = serde_json::to_value(&jwks).unwrap();
            let server = tokio::spawn(async move {
                for (target, body) in [
                    ("GET /api/v1/account/profile HTTP/1.1", profile),
                    ("POST /api/v1/account/enrollment HTTP/1.1", envelope),
                    ("GET /api/v1/account/jwks HTTP/1.1", public_keys.clone()),
                    ("GET /api/v1/account/jwks HTTP/1.1", public_keys.clone()),
                    ("GET /api/v1/account/jwks HTTP/1.1", public_keys),
                ] {
                    let (mut socket, _) = listener.accept().await.unwrap();
                    let mut request = Vec::new();
                    while !request.windows(4).any(|v| v == b"\r\n\r\n") {
                        let mut bytes = [0; 1024];
                        let n = socket.read(&mut bytes).await.unwrap();
                        assert!(n > 0 && request.len() < 8192);
                        request.extend_from_slice(&bytes[..n]);
                    }
                    assert_eq!(String::from_utf8(request).unwrap().lines().next(), Some(target));
                    let body = body.to_string();
                    socket.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes()).await.unwrap();
                }
            });
            assert_eq!(enrollment.profile("synthetic-access").await.unwrap().workspace_id, binding.workspace_id);
            let (_, verified_claims, workspace) = enrollment.issue("synthetic-access", &binding).await.unwrap();
            assert_eq!(verified_claims.iss, config::ENROLLMENT_ISSUER);
            assert_eq!(workspace.workspace(), binding.workspace_id);
            assert_eq!(workspace.device, binding.device_id);
            assert_eq!(workspace.noise_key, binding.noise_public_key);
            for alias in [transport_origin.as_str(), "https://cybernote-sync.aixgg.com"] {
                let alias_proof = sign(&Claims { iss: alias.into(), ..claims.clone() });
                assert!(matches!(enrollment.verify(&alias_proof, &binding).await, Err(Error::InvalidProof)));
            }
            server.await.unwrap();
        }).await.expect("bounded loopback enrollment fixture");
    }

    #[tokio::test]
    async fn http_rejections_keep_endpoint_stage_and_never_return_response_details() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let (binding, _, _) = fixture();
        for (stage, path) in [
            (NetworkStage::CoordinatorProfile, "/api/v1/account/profile"),
            (
                NetworkStage::CoordinatorEnrollment,
                "/api/v1/account/enrollment",
            ),
            (NetworkStage::CoordinatorJwks, "/api/v1/account/jwks"),
        ] {
            for status in [401, 403, 302, 503, 200] {
                let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
                let enrollment =
                    Enrollment::new(format!("http://{}", listener.local_addr().unwrap())).unwrap();
                let server = tokio::spawn(async move {
                    let (mut socket, _) = listener.accept().await.unwrap();
                    let mut request = Vec::new();
                    while !request.windows(4).any(|v| v == b"\r\n\r\n") {
                        let mut bytes = [0; 1024];
                        let n = socket.read(&mut bytes).await.unwrap();
                        assert!(n > 0 && request.len() < 8192);
                        request.extend_from_slice(&bytes[..n]);
                    }
                    assert!(String::from_utf8(request)
                        .unwrap()
                        .lines()
                        .next()
                        .unwrap()
                        .contains(path));
                    let body = "private-response-sentinel";
                    socket.write_all(format!("HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes()).await.unwrap();
                });
                let error = match stage {
                    NetworkStage::CoordinatorProfile => {
                        enrollment.profile("synthetic-access").await.err()
                    }
                    NetworkStage::CoordinatorEnrollment => {
                        enrollment.issue("synthetic-access", &binding).await.err()
                    }
                    _ => enrollment.verify("synthetic-proof", &binding).await.err(),
                }
                .unwrap();
                server.await.unwrap();
                assert_eq!(
                    error,
                    match status {
                        401 | 403 => Error::AuthenticationAt(stage),
                        200 => Error::InvalidProof,
                        _ => Error::NetworkAt(stage),
                    }
                );
                assert!(!serde_json::to_string(&error.safe())
                    .unwrap()
                    .contains("private-response-sentinel"));
            }
        }
    }

    fn fixture() -> (Binding, JwkSet, jsonwebtoken::EncodingKey) {
        use p384::{
            elliptic_curve::sec1::ToEncodedPoint,
            pkcs8::{EncodePrivateKey, LineEnding},
            SecretKey,
        };
        let secret = SecretKey::random(&mut rand::rngs::OsRng);
        let point = secret.public_key().to_encoded_point(false);
        let jwks=serde_json::from_value(serde_json::json!({"keys":[{"kty":"EC","crv":"P-384","kid":"synthetic-fixture","alg":"ES384","use":"sig","x":B64.encode(point.x().unwrap()),"y":B64.encode(point.y().unwrap())}]})).unwrap();
        let pem = secret.to_pkcs8_pem(LineEnding::LF).unwrap();
        let key = jsonwebtoken::EncodingKey::from_ec_pem(pem.as_bytes()).unwrap();
        let binding = Binding {
            issuer: config::ISSUER.into(),
            subject: "synthetic-owner".into(),
            product_id: "cybernote".into(),
            workspace_id: uuid::Uuid::new_v4().to_string(),
            device_id: uuid::Uuid::new_v4().to_string(),
            noise_public_key: B64.encode([1; 32]),
            enabled: true,
        };
        (binding, jwks, key)
    }
    struct Windows;
    impl crate::sync::adapter::WindowHost for Windows {
        fn participants(&self) -> std::collections::HashSet<String> {
            std::collections::HashSet::new()
        }
        fn emit(&self, _: &str, _: &serde_json::Value) -> crate::store::Result<()> {
            Ok(())
        }
    }
    #[test]
    fn fresh_account_status_metrics_do_not_require_or_enable_sync() {
        use crate::{session::Session, store::Store, sync::adapter::Runtime};
        use std::sync::{Arc, Condvar, Mutex};
        let directory = tempfile::tempdir().unwrap();
        let mut store = Store::open(directory.path()).unwrap();
        store
            .action(serde_json::json!({"type":"createNote"}))
            .unwrap();
        let shared = Arc::new((Mutex::new(Session::new(store)), Condvar::new()));
        let before = shared.0.lock().unwrap().workspace().unwrap();
        let runtime =
            Runtime::new(shared.clone(), directory.path().into(), Arc::new(Windows)).unwrap();
        assert_eq!(runtime.account_metrics().unwrap(), (0, 0));
        assert_eq!(runtime.account_metrics().unwrap(), (0, 0));
        assert!(shared
            .0
            .lock()
            .unwrap()
            .store
            .sync_identity()
            .unwrap()
            .is_none());
        assert_eq!(
            shared.0.lock().unwrap().workspace().unwrap()["notes"],
            before["notes"]
        );
        assert!(!directory.path().join(".account/noise").exists());
        assert!(!directory.path().join(".sync/identity-v1.json").exists());
        runtime.shutdown().unwrap();
    }
    #[test]
    fn account_foreground_does_not_construct_manual_identity_or_policy_free_service() {
        use crate::{session::Session, store::Store, sync::adapter::Runtime};
        use std::sync::{Arc, Condvar, Mutex};
        let dir = tempfile::tempdir().unwrap();
        super::super::private::directory(&dir.path().join(".account")).unwrap();
        let shared = Arc::new((
            Mutex::new(Session::new(Store::open(dir.path()).unwrap())),
            Condvar::new(),
        ));
        let runtime = Runtime::new(shared.clone(), dir.path().into(), Arc::new(Windows)).unwrap();
        let identity = runtime.account_identity().unwrap();
        let device = identity.device_id().unwrap();
        let key = identity.public_key().unwrap();
        let verified = VerifiedWorkspace {
            workspace: uuid::Uuid::new_v4().to_string(),
            device: device.clone(),
            noise_key: key.clone(),
        };
        super::super::private::write(
            &dir.path().join(".account/binding.json"),
            &Binding {
                issuer: config::ISSUER.into(),
                subject: "synthetic-owner".into(),
                product_id: "cybernote".into(),
                workspace_id: verified.workspace.clone(),
                device_id: device.clone(),
                noise_public_key: key.clone(),
                enabled: true,
            },
        )
        .unwrap();
        let mut service = runtime
            .activate_account(&verified, identity, Arc::new(Gate::default()))
            .unwrap();
        let manual_identity = || {
            crate::sync::identity::IdentityStore::existing_device_id(&dir.path().join(".sync"))
                .unwrap()
        };
        // Store owns shared .sync/blob directories independently of a manual
        // Noise service. Check the actual identity, not directory existence.
        assert_eq!(manual_identity(), None);
        runtime.foreground();
        assert_eq!(
            manual_identity(),
            None,
            "account foreground created a manual Noise identity"
        );
        runtime.pause_account();
        runtime.foreground();
        assert_eq!(manual_identity(), None);
        // Logout/pause preserves the account binding. An explicit manual start
        // cannot open a policy-free service over the account credentials.
        let token = serde_json::from_value(serde_json::json!({
            "sessionId": shared.0.lock().unwrap().sync_session_id(), "epoch": 1
        }))
        .unwrap();
        let denied = runtime
            .command(
                crate::sync::adapter::Command::StartHost {
                    device_name: "Synthetic manual".into(),
                    port: 0,
                },
                "main",
                &token,
            )
            .unwrap_err();
        assert_eq!(denied.code, "sync_workspace_mismatch");
        assert_eq!(manual_identity(), None);
        let restored = runtime.account_identity().unwrap();
        assert_eq!(restored.device_id().unwrap(), device);
        assert_eq!(restored.public_key().unwrap(), key);
        service.shutdown().unwrap();
        runtime.shutdown().unwrap();
    }
    #[test]
    fn real_store_activation_preserves_documents_and_restart_identity_and_rejects_legacy_workspace()
    {
        use crate::{session::Session, store::Store, sync::adapter::Runtime};
        use std::sync::{Arc, Condvar, Mutex};
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(dir.path()).unwrap();
        store
            .action(serde_json::json!({"type":"createNote"}))
            .unwrap();
        let shared = Arc::new((Mutex::new(Session::new(store)), Condvar::new()));
        let original = shared.0.lock().unwrap().workspace().unwrap();
        let runtime = Runtime::new(shared.clone(), dir.path().into(), Arc::new(Windows)).unwrap();
        let noise = runtime.account_identity().unwrap();
        let device = noise.device_id().unwrap();
        let key = noise.public_key().unwrap();
        let workspace = uuid::Uuid::new_v4().to_string();
        runtime.check_account_workspace(&workspace, false).unwrap();
        let verified = VerifiedWorkspace {
            workspace: workspace.clone(),
            device: device.clone(),
            noise_key: key.clone(),
        };
        let mut service = runtime
            .activate_account(&verified, noise, Arc::new(Gate::default()))
            .unwrap();
        assert_eq!(
            shared.0.lock().unwrap().workspace().unwrap()["notes"],
            original["notes"]
        );
        runtime.pause_account();
        service.shutdown().unwrap();
        runtime.shutdown().unwrap();
        drop(service);
        drop(runtime);
        let runtime = Runtime::new(shared.clone(), dir.path().into(), Arc::new(Windows)).unwrap();
        let noise = runtime.account_identity().unwrap();
        assert_eq!(noise.device_id().unwrap(), device);
        assert_eq!(noise.public_key().unwrap(), key);
        runtime.check_account_workspace(&workspace, true).unwrap();
        assert!(runtime
            .check_account_workspace(&uuid::Uuid::new_v4().to_string(), true)
            .is_err());
        assert!(runtime.check_account_workspace(&workspace, false).is_err());
        let identity = shared
            .0
            .lock()
            .unwrap()
            .store
            .sync_identity()
            .unwrap()
            .unwrap();
        assert_eq!(identity.workspace_id, workspace);
        assert_eq!(identity.device_id, device);
        assert_eq!(
            shared.0.lock().unwrap().workspace().unwrap()["notes"],
            original["notes"]
        );
        runtime.shutdown().unwrap();
    }
    #[test]
    fn signed_proof_rejects_cross_owner_workspace_and_unbound_keys_not_just_jwt_decode() {
        let (binding, jwks, key) = fixture();
        let original = Claims {
            iss: "https://fixed.test".into(),
            aud: "cybernote-enrollment-v1".into(),
            sub: binding.subject.clone(),
            account_issuer: binding.issuer.clone(),
            product_id: binding.product_id.clone(),
            workspace_id: binding.workspace_id.clone(),
            device_id: binding.device_id.clone(),
            noise_public_key: binding.noise_public_key.clone(),
            purpose: "pair".into(),
            iat: now(),
            exp: now() + 300,
            jti: uuid::Uuid::new_v4().to_string(),
        };
        let sign = |claims: &Claims| {
            let mut header = jsonwebtoken::Header::new(Algorithm::ES384);
            header.kid = Some("synthetic-fixture".into());
            jsonwebtoken::encode(&header, claims, &key).unwrap()
        };
        assert!(verify(&sign(&original), &jwks, "https://fixed.test", &binding).is_ok());
        for field in [
            "iss",
            "aud",
            "sub",
            "accountIssuer",
            "productId",
            "workspaceId",
            "purpose",
            "noisePublicKey",
            "deviceId",
            "jti",
        ] {
            let mut value = serde_json::to_value(&original).unwrap();
            value[field] = serde_json::json!("wrong");
            let claims: Claims = serde_json::from_value(value).unwrap();
            assert!(
                verify(&sign(&claims), &jwks, "https://fixed.test", &binding).is_err(),
                "{field}"
            );
        }
        for claims in [
            Claims {
                exp: now() - 1,
                ..original.clone()
            },
            Claims {
                exp: now() + 301,
                ..original.clone()
            },
            Claims {
                iat: now() + 60,
                exp: now() + 300,
                ..original.clone()
            },
        ] {
            assert!(verify(&sign(&claims), &jwks, "https://fixed.test", &binding).is_err());
        }
        let (_, other, _) = fixture();
        assert!(verify(&sign(&original), &other, "https://fixed.test", &binding).is_err());
        let mut jwt = sign(&original);
        let index = jwt.len() - 8;
        let byte = jwt.as_bytes()[index];
        jwt.replace_range(index..index + 1, if byte == b'A' { "B" } else { "A" });
        assert!(verify(&jwt, &jwks, "https://fixed.test", &binding).is_err());
    }
    #[test]
    fn close_and_expiry_fail_closed_for_both_directions_and_routes_are_ephemeral() {
        let gate = Gate::default();
        let device = uuid::Uuid::new_v4().to_string();
        let key = B64.encode([1; 32]);
        let proof = Claims {
            iss: "https://fixed.test".into(),
            aud: "cybernote-enrollment-v1".into(),
            sub: "owner".into(),
            account_issuer: config::ISSUER.into(),
            product_id: "p".into(),
            workspace_id: uuid::Uuid::new_v4().to_string(),
            device_id: device.clone(),
            noise_public_key: key.clone(),
            purpose: "pair".into(),
            iat: now(),
            exp: now() + 200,
            jti: uuid::Uuid::new_v4().to_string(),
        };
        gate.admit(&proof);
        assert!(gate.authorize(&device, &key).is_err());
        gate.renew_local(now() + 200);
        assert!(gate.authorize(&device, &key).is_ok());
        assert!(gate.authorize(&device, &B64.encode([2; 32])).is_err());
        gate.route(&device, "ws://127.0.0.1:2222/".into());
        assert!(gate.endpoint(&device).is_ok());
        gate.close();
        assert!(gate.authorize(&device, &key).is_err());
        assert!(gate.endpoint(&device).is_err());
        gate.renew_local(now() + 200);
        gate.admit(&Claims {
            exp: now() - 1,
            ..proof
        });
        assert!(gate.authorize(&device, &key).is_err());
    }
}
