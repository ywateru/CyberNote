use super::types::{Error, Result};
pub const ISSUER: &str = "https://auth.x.aixgg.com/oidc";
pub const CLIENT_ID: &str = "il4abzwbu1ohjwv5mb667";
pub const RESOURCE: &str = "https://cybernote.app/api";
pub const MAC_REDIRECT: &str = "http://127.0.0.1:17897/callback";
pub const ANDROID_REDIRECT: &str = "com.local.notesclone.auth://callback";
pub const SYNC_PORT: &str = "cybernote-sync-v1";
pub const ENROLL_PORT: &str = "cybernote-enroll-v1";
#[cfg(target_os = "android")]
pub const COORDINATOR_TRANSPORT_ORIGIN: &str = "https://cybernote-sync.aixgg.com";
#[cfg(not(target_os = "android"))]
pub const COORDINATOR_TRANSPORT_ORIGIN: &str = "https://cybernote-sync.vercel.app";
// Stable proof identity, independent of the HTTP transport hostname.
pub const ENROLLMENT_ISSUER: &str = "https://cybernote-sync.vercel.app";
pub fn origin() -> Result<String> {
    let raw = COORDINATOR_TRANSPORT_ORIGIN;
    let url = url::Url::parse(raw).map_err(|_| Error::Configuration)?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || url[..url::Position::BeforeHost].contains('@')
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        return Err(Error::Configuration);
    }
    Ok(url.origin().ascii_serialization())
}
pub fn pinned() -> account_auth::PinnedConfig {
    account_auth::PinnedConfig {
        issuer: ISSUER.parse().expect("fixed issuer"),
        client_id: CLIENT_ID.into(),
        resource: RESOURCE.parse().expect("fixed resource"),
        redirect_uris: vec![
            MAC_REDIRECT.parse().expect("fixed callback"),
            ANDROID_REDIRECT.parse().expect("fixed callback"),
        ],
    }
}
pub fn redirect() -> url::Url {
    if cfg!(target_os = "android") {
        ANDROID_REDIRECT
    } else {
        MAC_REDIRECT
    }
    .parse()
    .expect("fixed callback")
}
