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
            let token = self
                .0
                .access_token(
                    Duration::from_secs(request.min_validity),
                    request.force_refresh,
                )
                .await
                .map_err(|_| cybergrid_sdk::Error::AuthorizationUnavailable)?;
            if request.cancel.is_cancelled() {
                return Err(cybergrid_sdk::Error::Cancelled);
            }
            Ok(token.secret().into())
        })
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
