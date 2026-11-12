use crate::{AuthError, PinnedConfig};
use oauth2::{AsyncHttpClient, HttpRequest, HttpResponse};
use std::{future::Future, pin::Pin, time::Duration};

pub(crate) type HttpFuture<'a> =
    Pin<Box<dyn Future<Output = Result<HttpResponse, AuthError>> + Send + 'a>>;
#[derive(Clone)]
pub(crate) struct PinnedHttp {
    config: PinnedConfig,
    client: reqwest::Client,
    #[cfg(test)]
    pub responder: Option<std::sync::Arc<dyn Fn(HttpRequest) -> HttpFuture<'static> + Send + Sync>>,
}
impl PinnedHttp {
    pub fn new(config: PinnedConfig) -> Result<Self, AuthError> {
        let client = reqwest::Client::builder()
            .https_only(true)
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(15))
            .connect_timeout(Duration::from_secs(5))
            .build()
            .map_err(|_| AuthError::Configuration)?;
        Ok(Self {
            config,
            client,
            #[cfg(test)]
            responder: None,
        })
    }
    async fn execute(&self, request: HttpRequest) -> Result<HttpResponse, AuthError> {
        let url = request.uri().to_string();
        let allowed = [
            "/.well-known/openid-configuration",
            "/jwks",
            "/token",
            "/token/revocation",
        ];
        if !allowed.iter().any(|p| self.config.endpoint(p) == url) {
            return Err(AuthError::Configuration);
        }
        let discovery = url == self.config.endpoint("/.well-known/openid-configuration");
        #[cfg(test)]
        if let Some(responder) = &self.responder {
            let response = responder(request).await?;
            if discovery {
                self.validate_metadata(response.body())?;
            }
            return Ok(response);
        }
        let (parts, body) = request.into_parts();
        let mut response = self
            .client
            .request(parts.method, &url)
            .headers(parts.headers)
            .body(body)
            .send()
            .await
            .map_err(|_| AuthError::Network)?;
        if response.content_length().is_some_and(|n| n > 1024 * 1024) {
            return Err(AuthError::Network);
        }
        let mut builder = oauth2::http::Response::builder().status(response.status());
        *builder.headers_mut().ok_or(AuthError::Network)? = response.headers().clone();
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| AuthError::Network)? {
            if body.len() + chunk.len() > 1024 * 1024 {
                return Err(AuthError::Network);
            }
            body.extend_from_slice(&chunk);
        }
        if discovery {
            self.validate_metadata(&body)?;
        }
        builder.body(body).map_err(|_| AuthError::Network)
    }
    fn validate_metadata(&self, bytes: &[u8]) -> Result<(), AuthError> {
        let v: serde_json::Value =
            serde_json::from_slice(bytes).map_err(|_| AuthError::Configuration)?;
        for (field, expected) in [
            ("issuer", self.config.issuer.to_string()),
            ("authorization_endpoint", self.config.endpoint("/auth")),
            ("token_endpoint", self.config.endpoint("/token")),
            ("jwks_uri", self.config.endpoint("/jwks")),
            (
                "revocation_endpoint",
                self.config.endpoint("/token/revocation"),
            ),
        ] {
            if v.get(field).and_then(|x| x.as_str()) != Some(expected.as_str()) {
                return Err(AuthError::Configuration);
            }
        }
        for (field, required) in [
            ("code_challenge_methods_supported", "S256"),
            ("id_token_signing_alg_values_supported", "ES384"),
            ("grant_types_supported", "authorization_code"),
            ("grant_types_supported", "refresh_token"),
        ] {
            if !v
                .get(field)
                .and_then(|x| x.as_array())
                .is_some_and(|a| a.iter().any(|x| x.as_str() == Some(required)))
            {
                return Err(AuthError::Configuration);
            }
        }
        Ok(())
    }
}
impl<'a> AsyncHttpClient<'a> for PinnedHttp {
    type Error = AuthError;
    type Future = HttpFuture<'a>;
    fn call(&'a self, request: HttpRequest) -> Self::Future {
        Box::pin(self.execute(request))
    }
}
