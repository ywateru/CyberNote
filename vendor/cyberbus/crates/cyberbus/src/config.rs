use crate::{error, pb};
use serde::Deserialize;
use std::collections::BTreeMap;

/// Public deployment pins and explicit host storage policy. Secrets are obtained
/// exclusively by the auth owner; this configuration never accepts token material.
#[derive(Clone, Debug, Deserialize)]
pub struct ClientConfig {
    pub issuer: String,
    pub client_id: String,
    pub resource: String,
    pub product_id: String,
    pub native_clients: BTreeMap<String, String>,
    pub redirect_uri: String,
    #[serde(default)]
    pub bootstrap_peers: Vec<String>,
    #[serde(default)]
    pub listeners: Vec<String>,
    #[serde(default = "yes")]
    pub offline_access: bool,
    /// Host opt-in to storing the auth owner's refresh grant in the selected store.
    /// Defaults to memory-only authorization, including all deployment samples.
    #[serde(default)]
    pub persist_grant: bool,
    #[serde(default = "yes")]
    pub enable_p2p: bool,
    /// Omit to disable anonymous WSS relay fallback.
    #[serde(default)]
    pub cloudflare_fallback: Option<CloudflareFallbackConfig>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CloudflareFallbackConfig {
    pub peers: Vec<String>,
    #[serde(default = "fallback_delay")]
    pub after_ms: u64,
}
fn fallback_delay() -> u64 {
    10_000
}
impl CloudflareFallbackConfig {
    pub(crate) fn transport(&self) -> cyberbus_transport::CloudflareFallback {
        cyberbus_transport::CloudflareFallback {
            peers: self.peers.clone(),
            after: std::time::Duration::from_millis(self.after_ms),
        }
    }
}
fn yes() -> bool {
    true
}
impl ClientConfig {
    pub fn from_json(json: &str) -> Result<Self, pb::ProtocolError> {
        if json.len() > 65536 {
            return Err(error(
                pb::ErrorCode::InvalidArgument,
                "configuration too large",
            ));
        }
        let mut v: serde_json::Value = serde_json::from_str(json).map_err(|_| {
            error(
                pb::ErrorCode::InvalidArgument,
                "invalid public configuration",
            )
        })?;
        // Deployment manifests may contain nonsecret informational fields. Reject secret entrypoints.
        for key in [
            "token",
            "access_token",
            "refresh_token",
            "seed",
            "account_seed_secret_hex",
            "client_secret",
            "password",
            "network_secret",
            "app_psk",
        ] {
            if v.get(key).is_some() {
                return Err(error(
                    pb::ErrorCode::InvalidArgument,
                    "secret configuration entrypoint rejected",
                ));
            }
        }
        if v.get("redirect_uri").is_none() {
            let wanted = if cfg!(target_os = "android") {
                "cyberbus://auth/callback"
            } else {
                "http://127.0.0.1:18765/callback"
            };
            if !v["redirect_uris"]
                .as_array()
                .is_some_and(|uris| uris.iter().any(|u| u.as_str() == Some(wanted)))
            {
                return Err(error(
                    pb::ErrorCode::InvalidArgument,
                    "no supported platform redirect",
                ));
            }
            v["redirect_uri"] = wanted.into();
        }
        if v.get("native_clients").is_none() {
            let client = v["client_id"]
                .as_str()
                .ok_or_else(|| error(pb::ErrorCode::InvalidArgument, "missing native client"))?
                .to_owned();
            let product = v["product_id"].clone();
            v["native_clients"] = serde_json::json!({client:product});
        }
        if v.get("bootstrap_peers").is_none() {
            v["bootstrap_peers"] = v["bootstrap"]["peers"]
                .as_array()
                .map(|a| serde_json::Value::Array(a.clone()))
                .unwrap_or_else(|| serde_json::json!([]));
        }
        let config: Self = serde_json::from_value(v).map_err(|_| {
            error(
                pb::ErrorCode::InvalidArgument,
                "missing or invalid public configuration fields",
            )
        })?;
        config.validate()?;
        Ok(config)
    }
    pub(crate) fn validate(&self) -> Result<(), pb::ProtocolError> {
        if let Some(policy) = &self.cloudflare_fallback {
            policy.transport().validate().map_err(|_| {
                error(
                    pb::ErrorCode::InvalidArgument,
                    "invalid Cloudflare fallback configuration",
                )
            })?;
        }
        Ok(())
    }
    pub(crate) fn auth(&self) -> cyberbus_auth::AuthConfig {
        cyberbus_auth::AuthConfig {
            issuer: self.issuer.clone(),
            client_id: self.client_id.clone(),
            resource: self.resource.clone(),
            product_id: self.product_id.clone(),
            redirect_uri: self.redirect_uri.clone(),
            native_clients: self.native_clients.clone(),
            offline_access: self.offline_access,
            persist_grant: self.persist_grant,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn config(extra: serde_json::Value) -> String {
        let mut v = serde_json::json!({"issuer":"https://example.com/oidc","client_id":"public","resource":"https://example.com/api","product_id":"test","redirect_uri":"http://127.0.0.1:18765/callback"});
        v.as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        v.to_string()
    }
    #[test]
    fn fallback_is_default_off_and_opt_in_is_strict() {
        assert!(ClientConfig::from_json(&config(serde_json::json!({})))
            .unwrap()
            .cloudflare_fallback
            .is_none());
        let c = ClientConfig::from_json(&config(serde_json::json!({"cloudflare_fallback":{"peers":["wss://shared-relay.trycloudflare.com/"]}}))).unwrap();
        assert_eq!(c.cloudflare_fallback.unwrap().after_ms, 10_000);
        for value in [
            serde_json::json!({"peers":[]}),
            serde_json::json!({"peers":["wss://shared-relay.trycloudflare.com/"],"after_ms":0}),
            serde_json::json!({"peers":["wss://shared-relay.trycloudflare.com/"],"after_ms":300001}),
            serde_json::json!({"peers":["wss://example.com/"]}),
            serde_json::json!({"peers":["wss://shared-relay.trycloudflare.com/"],"token":"secret"}),
        ] {
            assert!(ClientConfig::from_json(&config(
                serde_json::json!({"cloudflare_fallback":value})
            ))
            .is_err());
        }
    }
}
