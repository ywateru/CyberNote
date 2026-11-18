//! Public deployment pins. Populated only from the server audit, never IPC/env.
use super::types::Result;
pub const ISSUER: &str = "https://auth.x.aixgg.com/oidc";
pub const CLIENT_ID: &str = "il4abzwbu1ohjwv5mb667";
pub const RESOURCE: &str = "https://cyberbus.x.aixgg.com/api";
pub const PRODUCT_ID: &str = "cybernote";
pub const MAC_REDIRECT: &str = "http://127.0.0.1:17897/callback";
pub const ANDROID_REDIRECT: &str = "com.local.notesclone.auth://callback";
pub fn redirect() -> url::Url {
    if cfg!(target_os = "android") {
        ANDROID_REDIRECT
    } else {
        MAC_REDIRECT
    }
    .parse()
    .expect("fixed callback")
}
pub fn pinned() -> Result<notes_cyberbus::ClientConfig> {
    Ok(notes_cyberbus::ClientConfig {
        issuer: ISSUER.into(),
        client_id: CLIENT_ID.into(),
        resource: RESOURCE.into(),
        product_id: PRODUCT_ID.into(),
        native_clients: std::collections::BTreeMap::from([(CLIENT_ID.into(), PRODUCT_ID.into())]),
        redirect_uri: redirect().to_string(),
        bootstrap_peers: vec![
            "tcp://43.155.169.102:11010".into(),
            "udp://43.155.169.102:11010".into(),
        ],
        listeners: vec![],
        offline_access: true,
        persist_grant: true,
        enable_p2p: true,
        cloudflare_fallback: None,
    })
}
