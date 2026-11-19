use super::{
    feed::{Asset, FEED, MAX_PACKAGE},
    storage::err,
};
use reqwest::{Client, Response, Url};
use std::time::Duration;

pub struct Network {
    client: Client,
    feed: String,
    #[cfg(test)]
    local: bool,
}
fn trusted_redirect(url: &Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port_or_known_default() == Some(443)
        && matches!(
            url.host_str(),
            Some(
                "github.com"
                    | "api.github.com"
                    | "release-assets.githubusercontent.com"
                    | "objects.githubusercontent.com"
            )
        )
}
impl Network {
    pub fn production() -> Result<Self, String> {
        let client = Client::builder()
            .user_agent(concat!("CyberNote/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(20))
            .timeout(Duration::from_secs(900))
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() >= 5 || !trusted_redirect(attempt.url()) {
                    attempt.error("untrusted_update_redirect")
                } else {
                    attempt.follow()
                }
            }))
            .build()
            .map_err(err)?;
        Ok(Self {
            client,
            feed: FEED.into(),
            #[cfg(test)]
            local: false,
        })
    }
    #[cfg(test)]
    pub fn local(feed: String) -> Self {
        Self {
            client: Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(5))
                .build()
                .unwrap(),
            feed,
            local: true,
        }
    }
    pub fn page(&self, page: u32) -> String {
        format!("{}?per_page=100&page={page}", self.feed)
    }
    pub async fn get(&self, url: &str) -> Result<Response, String> {
        let response = self
            .client
            .get(url)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| format!("network: {e}"))?;
        if !response.status().is_success() {
            return Err(format!("http_{}", response.status().as_u16()));
        }
        Ok(response)
    }
    pub async fn small(&self, url: &str, limit: usize) -> Result<Vec<u8>, String> {
        let task = async {
            let mut r = self.get(url).await?;
            if r.content_length().is_some_and(|n| n > limit as u64) {
                return Err("response_too_large".into());
            }
            let mut bytes = Vec::new();
            while let Some(chunk) = r.chunk().await.map_err(err)? {
                if bytes.len() + chunk.len() > limit {
                    return Err("response_too_large".into());
                }
                bytes.extend_from_slice(&chunk);
            }
            Ok(bytes)
        };
        tokio::time::timeout(Duration::from_secs(60), task)
            .await
            .map_err(|_| "metadata_timeout".to_string())?
    }
    pub fn asset_url(&self, a: &Asset, version: &str) -> Result<String, String> {
        #[cfg(test)]
        if self.local {
            let u = Url::parse(&a.browser_download_url).map_err(err)?;
            let f = Url::parse(&self.feed).map_err(err)?;
            if u.origin() == f.origin() && u.scheme() == "http" && u.host_str() == Some("127.0.0.1")
            {
                return Ok(a.browser_download_url.clone());
            }
            return Err("unsafe_fixture_url".into());
        }
        let u = Url::parse(&a.browser_download_url).map_err(err)?;
        // Reconstruct the tag/name path as URL segments, including correct escaping.
        let mut expected =
            Url::parse("https://github.com/ywateru/CyberNote/releases/download/").map_err(err)?;
        expected
            .path_segments_mut()
            .map_err(|_| "invalid_asset_url")?
            .pop_if_empty()
            .push(&format!("v{version}"))
            .push(&a.name);
        if u != expected || a.size > MAX_PACKAGE {
            return Err("untrusted_asset_url".into());
        }
        Ok(u.to_string())
    }
}
