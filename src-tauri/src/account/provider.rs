//! Rust-only adapter: SDK recovery obtains tokens from the single grant owner.
use super::{
    config,
    types::{Error, Result},
};
use cybergrid_sdk::{AuthFuture, AuthProvider, AuthTokenRequest, Client, CloudflaredConfig};
use std::{path::Path, sync::Arc, time::Duration};
pub struct Provider(pub Arc<account_auth::AuthClient>);
impl AuthProvider for Provider {
    fn access_token_for<'a>(
        &'a self,
        _client: &'a Client,
        request: &'a AuthTokenRequest,
    ) -> AuthFuture<'a> {
        Box::pin(async move {
            if request.issuer != config::ISSUER
                || request.client_id != config::CLIENT_ID
                || request.resource != config::RESOURCE
                || !request.scopes.iter().any(|s| s == "connect")
                || request.scopes.iter().any(|s| {
                    !["openid", "profile", "offline_access", "connect"].contains(&s.as_str())
                })
                || request.cancel.is_cancelled()
            {
                return Err(cybergrid_sdk::Error::AuthorizationUnavailable);
            }
            // Do not select/drop an already dispatched refresh operation. The auth
            // crate checkpoints rotation even if this consumer has been cancelled.
            // Only finite categories cross the SDK boundary. Rotation and
            // recovery ownership remain with the auth client.
            let token = self
                .0
                .access_token(
                    Duration::from_secs(request.min_validity),
                    request.force_refresh,
                )
                .await
                .map_err(provider_error)?;
            if request.cancel.is_cancelled() {
                return Err(cybergrid_sdk::Error::Cancelled);
            }
            Ok(token.secret().into())
        })
    }
}

fn provider_error(error: account_auth::AuthError) -> cybergrid_sdk::Error {
    use account_auth::AuthError as A;
    use cybergrid_sdk::AuthProviderFailure as P;
    cybergrid_sdk::Error::AuthorizationProvider(match error {
        A::Configuration => P::Configuration,
        A::Network => P::Network,
        A::InvalidCallback => P::InvalidCallback,
        A::InvalidIdentity => P::InvalidIdentity,
        A::IdentityRejected(_) => P::IdentityRejected,
        A::CodeExchangeRejected => P::CodeExchangeRejected,
        A::TokenResponseInvalid => P::TokenResponseInvalid,
        A::MissingRefreshToken => P::MissingRefreshToken,
        A::Cancelled => P::Cancelled,
        A::NoSession => P::NoSession,
        A::OwnershipMismatch => P::OwnershipMismatch,
        A::Storage => P::Storage,
        A::RefreshFailed => P::RefreshFailed,
        A::RevocationFailed => P::RevocationFailed,
        A::Busy => P::Busy,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn every_auth_error_category_survives_the_safe_sdk_handoff() {
        use account_auth::AuthError as A;
        for (error, label) in [
            (A::Configuration, "configuration"),
            (A::Network, "network"),
            (A::InvalidCallback, "invalidCallback"),
            (A::InvalidIdentity, "invalidIdentity"),
            (
                A::IdentityRejected(account_auth::IdentityRejection::Signature),
                "identityRejected",
            ),
            (A::CodeExchangeRejected, "codeExchangeRejected"),
            (A::TokenResponseInvalid, "tokenResponseInvalid"),
            (A::MissingRefreshToken, "missingRefreshToken"),
            (A::Cancelled, "cancelled"),
            (A::NoSession, "noSession"),
            (A::OwnershipMismatch, "ownershipMismatch"),
            (A::Storage, "storage"),
            (A::RefreshFailed, "refreshFailed"),
            (A::RevocationFailed, "revocationFailed"),
            (A::Busy, "busy"),
        ] {
            let safe = serde_json::to_value(
                Error::sdk_at(
                    provider_error(error),
                    super::super::types::NetworkStage::CoordinatorRegistration,
                )
                .safe(),
            )
            .unwrap();
            assert_eq!(safe["code"], "account_authentication");
            assert_eq!(safe["stage"], "authorizationProvider");
            assert_eq!(safe["providerReason"], label);
            assert_eq!(safe.as_object().unwrap().len(), 4);
        }
    }

    #[tokio::test]
    async fn missing_grant_is_reported_at_provider_boundary_without_network_or_details() {
        let directory = tempfile::tempdir().unwrap();
        super::super::private::directory(directory.path()).unwrap();
        let auth =
            account_auth::AuthClient::new(config::pinned(), directory.path().join("grant.json"))
                .await
                .unwrap();
        let provider = Provider(Arc::new(auth));
        let client = Client::new(cybergrid_sdk::Config {
            base_url: config::origin().unwrap(),
            app_id: config::CLIENT_ID.into(),
            ..Default::default()
        })
        .unwrap();
        let request = AuthTokenRequest {
            issuer: config::ISSUER.into(),
            client_id: config::CLIENT_ID.into(),
            resource: config::RESOURCE.into(),
            scopes: vec!["connect".into()],
            min_validity: 60,
            force_refresh: false,
            reason: cybergrid_sdk::AuthRequestReason::CoordinationRecovery,
            generation: 1,
            cancel: cybergrid_sdk::CancellationToken::new(),
        };
        let sdk_error = provider
            .access_token_for(&client, &request)
            .await
            .unwrap_err();
        assert!(matches!(
            sdk_error,
            cybergrid_sdk::Error::AuthorizationProvider(
                cybergrid_sdk::AuthProviderFailure::NoSession
            )
        ));
        let error = Error::sdk_at(
            sdk_error,
            super::super::types::NetworkStage::CoordinatorRegistration,
        );
        let safe = serde_json::to_value(error.safe()).unwrap();
        assert_eq!(safe["code"], "account_authentication");
        assert_eq!(safe["stage"], "authorizationProvider");
        assert_eq!(safe["providerReason"], "noSession");
        assert_eq!(safe.as_object().unwrap().len(), 4);
        client.close().await.unwrap();
    }
}
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
pub fn configuration(cache: &Path) -> Result<CloudflaredConfig> {
    CloudflaredConfig::bundled(cache).map_err(|_| Error::Configuration)
}
#[cfg(not(any(
    all(target_os = "macos", target_arch = "aarch64"),
    all(target_os = "android", target_arch = "aarch64")
)))]
pub fn configuration(_: &Path) -> Result<CloudflaredConfig> {
    Err(Error::Unsupported)
}
#[cfg(all(target_os = "android", target_arch = "aarch64"))]
pub fn configuration(cache: &Path) -> Result<CloudflaredConfig> {
    let (directory, _) = android_state()?;
    let mut provider =
        CloudflaredConfig::android_native(directory, cache).map_err(|_| Error::Configuration)?;
    let cache = cache.to_path_buf();
    provider.env_provider = Some(Arc::new(move || {
        let (_, dns) =
            android_state().map_err(|_| cybergrid_sdk::Error::AuthorizationUnavailable)?;
        Ok(std::collections::HashMap::from([
            ("TMPDIR".into(), cache.to_string_lossy().into_owned()),
            ("CLOUDFLARED_DNS_SERVER".into(), dns),
        ]))
    }));
    Ok(provider)
}
#[cfg(all(target_os = "android", target_arch = "aarch64"))]
fn android_state() -> Result<(String, String)> {
    use jni::{
        objects::{JObject, JString, JValue},
        JavaVM,
    };
    let context = ndk_context::android_context();
    let vm = unsafe { JavaVM::from_raw(context.vm().cast()) }.map_err(|_| Error::Unsupported)?;
    let mut env = vm.attach_current_thread().map_err(|_| Error::Unsupported)?;
    let sdk = env
        .get_static_field("android/os/Build$VERSION", "SDK_INT", "I")
        .and_then(|v| v.i())
        .map_err(|_| Error::Unsupported)?;
    if sdk < 28 {
        return Err(Error::Unsupported);
    }
    // NDK context is Application, appropriate for ApplicationInfo/DNS, not UI.
    let application = unsafe { JObject::from_raw(context.context().cast()) };
    let result = (|| -> jni::errors::Result<(String, String)> {
        let info = env
            .call_method(
                &application,
                "getApplicationInfo",
                "()Landroid/content/pm/ApplicationInfo;",
                &[],
            )?
            .l()?;
        let dir = env
            .get_field(&info, "nativeLibraryDir", "Ljava/lang/String;")?
            .l()?;
        let dir: String = env.get_string(&JString::from(dir))?.into();
        let service = JObject::from(env.new_string("connectivity")?);
        let manager = env
            .call_method(
                &application,
                "getSystemService",
                "(Ljava/lang/String;)Ljava/lang/Object;",
                &[JValue::Object(&service)],
            )?
            .l()?;
        let network = env
            .call_method(&manager, "getActiveNetwork", "()Landroid/net/Network;", &[])?
            .l()?;
        let properties = env
            .call_method(
                &manager,
                "getLinkProperties",
                "(Landroid/net/Network;)Landroid/net/LinkProperties;",
                &[JValue::Object(&network)],
            )?
            .l()?;
        let servers = env
            .call_method(&properties, "getDnsServers", "()Ljava/util/List;", &[])?
            .l()?;
        let server = env
            .call_method(&servers, "get", "(I)Ljava/lang/Object;", &[JValue::Int(0)])?
            .l()?;
        let address = env
            .call_method(&server, "getHostAddress", "()Ljava/lang/String;", &[])?
            .l()?;
        let address: String = env.get_string(&JString::from(address))?.into();
        Ok((dir, address))
    })();
    match result {
        Ok((directory, dns)) => {
            let ip: std::net::IpAddr = dns.parse().map_err(|_| Error::Network)?;
            Ok((directory, std::net::SocketAddr::new(ip, 53).to_string()))
        }
        Err(_) => {
            let _ = env.exception_clear();
            Err(Error::Network)
        }
    }
}
