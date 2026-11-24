//! OpenList APIPages compatibility client. Fixed issuer, no redirects, bounded
//! bodies and fixed error codes. Authorization URLs and tokens are RAM-only.
use super::{super::model::*, ISSUER};
use base64::{
    engine::general_purpose::{STANDARD, STANDARD_NO_PAD, URL_SAFE, URL_SAFE_NO_PAD},
    Engine,
};
use reqwest::{
    header::{ACCEPT, SET_COOKIE},
    Client, StatusCode, Url,
};
use serde::Serialize;
use serde_json::Value;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const MAX_JSON: usize = 256 * 1024;
const MAX_FRAGMENT: usize = 64 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthCookie {
    pub name: String,
    pub value: String,
    pub domain: String,
    pub path: String,
    pub secure: bool,
    pub http_only: bool,
    pub same_site: Option<String>,
}

#[derive(Clone, Debug)]
pub struct RequestStart {
    pub authorization_url: String,
    pub cookies: Vec<AuthCookie>,
}

#[derive(Clone, Debug)]
pub struct TokenPayload {
    pub access_token: Option<String>,
    pub refresh_token: String,
    pub expires_at: Option<i64>,
}

#[derive(Clone, Debug)]
pub struct Renewed {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<i64>,
}

#[derive(Clone, Debug)]
pub struct AccountInfo {
    pub account_id: String,
    pub display_name: String,
    pub drive_type: Option<String>,
    pub quota_total: Option<u64>,
    pub quota_used: Option<u64>,
}

#[derive(Clone)]
pub struct OpenList {
    client: Client,
    issuer: Url,
    graph: Url,
    baidu: Url,
}

fn network(e: reqwest::Error) -> CloudError {
    error(if e.is_timeout() { "timeout" } else { "network" })
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn integer(value: &Value, key: &str) -> Option<i64> {
    value.get(key).and_then(|v| {
        v.as_i64()
            .or_else(|| v.as_str().and_then(|s| s.parse::<i64>().ok()))
    })
}

fn host_matches(host: &str, allowed: &[&str]) -> bool {
    allowed.iter().any(|suffix| {
        if let Some(root) = suffix.strip_prefix('.') {
            host == root || host.ends_with(suffix)
        } else {
            host == *suffix
        }
    })
}

pub fn authorization_hosts(driver: &str) -> Vec<String> {
    if driver.starts_with("onedrive_") {
        [
            "login.microsoftonline.com",
            "login.live.com",
            "login.microsoft.com",
            "account.live.com",
            "login.windows.net",
            "logincdn.msauth.net",
            "aadcdn.msauth.net",
            "api.oplist.org",
            ".microsoftonline.com",
            ".live.com",
            ".microsoft.com",
            ".msauth.net",
            ".msftauth.net",
            ".msftidentity.com",
            ".msidentity.com",
            ".msocdn.com",
            ".office.com",
            ".office.net",
            ".onedrive.com",
            ".sharepoint.com",
            ".live.net",
            ".windows.net",
            ".azureedge.net",
        ]
        .into_iter()
        .map(str::to_string)
        .collect()
    } else {
        [
            "openapi.baidu.com",
            "passport.baidu.com",
            "wappass.baidu.com",
            "pan.baidu.com",
            "api.oplist.org",
            ".baidu.com",
            ".bdimg.com",
            ".bdstatic.com",
            ".bcebos.com",
        ]
        .into_iter()
        .map(str::to_string)
        .collect()
    }
}

impl OpenList {
    pub fn new() -> Result<Self> {
        Self::build(ISSUER, "https://graph.microsoft.com/v1.0", "https://pan.baidu.com")
    }
    #[cfg(test)]
    pub fn fixture(issuer: &str, graph: &str, baidu: &str) -> Result<Self> {
        Self::build(issuer, graph, baidu)
    }
    fn build(issuer: &str, graph: &str, baidu: &str) -> Result<Self> {
        let issuer = Url::parse(issuer).map_err(|_| error("invalid"))?;
        let graph = Url::parse(graph).map_err(|_| error("invalid"))?;
        let baidu = Url::parse(baidu).map_err(|_| error("invalid"))?;
        for u in [&issuer, &graph, &baidu] {
            let local = cfg!(test)
                && u.scheme() == "http"
                && u.host_str() == Some("127.0.0.1");
            if (u.scheme() != "https" && !local)
                || u.host_str().is_none()
                || !u.username().is_empty()
                || u.password().is_some()
                || u.query().is_some()
                || u.fragment().is_some()
            {
                return Err(error("invalid"));
            }
        }
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30))
            .user_agent("CyberNote-cloud-auth/1")
            .build()
            .map_err(network)?;
        Ok(Self {
            client,
            issuer,
            graph,
            baidu,
        })
    }
    fn route(driver: &str) -> Result<(&'static str, Provider)> {
        match driver {
            "onedrive_pr" | "onedrive_go" => Ok(("onedrive", Provider::Onedrive)),
            "baiduyun_go" => Ok(("baiduyun", Provider::Baidu)),
            _ => Err(error("invalid")),
        }
    }
    fn url(&self, route: &str, endpoint: &str) -> Result<Url> {
        let mut u = self.issuer.clone();
        {
            let mut p = u.path_segments_mut().map_err(|_| error("invalid"))?;
            p.pop_if_empty();
            p.push(route);
            p.push(endpoint);
        }
        Ok(u)
    }
    async fn bounded_json(
        &self,
        method: reqwest::Method,
        url: Url,
        bearer: Option<&str>,
    ) -> Result<(StatusCode, reqwest::header::HeaderMap, Value)> {
        let mut req = self.client.request(method, url).header(ACCEPT, "application/json");
        if let Some(token) = bearer {
            req = req.bearer_auth(token);
        }
        let mut res = req.send().await.map_err(network)?;
        let status = res.status();
        let headers = res.headers().clone();
        if res.content_length().is_some_and(|n| n > MAX_JSON as u64) {
            return Err(error("limit"));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = res.chunk().await.map_err(network)? {
            if bytes.len() + chunk.len() > MAX_JSON {
                return Err(error("limit"));
            }
            bytes.extend_from_slice(&chunk);
        }
        if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
            return Err(error("authentication"));
        }
        let value = if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).map_err(|_| error("invalid"))?
        };
        Ok((status, headers, value))
    }
    fn parse_cookies(
        headers: &reqwest::header::HeaderMap,
        driver: &str,
        domain: &str,
    ) -> Result<Vec<AuthCookie>> {
        let mut driver_cookie = None;
        let mut server_cookie = None;
        for raw in headers.get_all(SET_COOKIE).iter() {
            let Ok(text) = raw.to_str() else { continue };
            let first = text.split(';').next().unwrap_or("");
            let Some((name, value)) = first.split_once('=') else {
                continue;
            };
            let name = name.trim();
            let value = value.trim();
            match name {
                "driver_txt" => driver_cookie = Some(value.to_string()),
                "server_use" => server_cookie = Some(value.to_string()),
                _ => {}
            }
        }
        if driver_cookie.as_deref() != Some(driver)
            || !matches!(server_cookie.as_deref(), Some("true") | Some("1"))
        {
            return Err(error("authentication"));
        }
        Ok(vec![
            AuthCookie {
                name: "driver_txt".into(),
                value: driver.into(),
                domain: domain.into(),
                path: "/".into(),
                secure: true,
                http_only: false,
                same_site: Some("Lax".into()),
            },
            AuthCookie {
                name: "server_use".into(),
                value: "true".into(),
                domain: domain.into(),
                path: "/".into(),
                secure: true,
                http_only: false,
                same_site: Some("Lax".into()),
            },
        ])
    }
    pub async fn requests(&self, driver: &str) -> Result<RequestStart> {
        let (route, _) = Self::route(driver)?;
        let mut url = self.url(route, "requests")?;
        url.query_pairs_mut()
            .append_pair("server_use", "true")
            .append_pair("driver_txt", driver);
        let (status, headers, value) = self
            .bounded_json(reqwest::Method::GET, url, None)
            .await?;
        if !status.is_success() {
            return Err(error("network"));
        }
        let raw = value
            .get("text")
            .or_else(|| value.get("url"))
            .and_then(Value::as_str)
            .ok_or_else(|| error("invalid"))?;
        let auth = Url::parse(raw).map_err(|_| error("invalid"))?;
        let host = auth.host_str().ok_or_else(|| error("invalid"))?;
        let allowed = authorization_hosts(driver);
        let allowed_refs = allowed.iter().map(String::as_str).collect::<Vec<_>>();
        if auth.scheme() != "https"
            || !auth.username().is_empty()
            || auth.password().is_some()
            || auth.fragment().is_some()
            || !host_matches(host, &allowed_refs)
        {
            return Err(error("invalid"));
        }
        Ok(RequestStart {
            authorization_url: auth.into(),
            cookies: Self::parse_cookies(
                &headers,
                driver,
                self.issuer.host_str().ok_or_else(|| error("invalid"))?,
            )?,
        })
    }
    pub fn parse_callback(&self, raw: &str, driver: &str) -> Result<TokenPayload> {
        let u = Url::parse(raw).map_err(|_| error("invalid"))?;
        if u.scheme() != "https"
            || u.host_str() != self.issuer.host_str()
            || !u.username().is_empty()
            || u.password().is_some()
            || u.query().is_some()
            || !matches!(u.path(), "/" | "")
        {
            return Err(error("authentication"));
        }
        let fragment = u.fragment().ok_or_else(|| error("authentication"))?;
        if fragment.is_empty() || fragment.len() > MAX_FRAGMENT {
            return Err(error("authentication"));
        }
        let decoded = [STANDARD, STANDARD_NO_PAD, URL_SAFE, URL_SAFE_NO_PAD]
            .iter()
            .find_map(|e| e.decode(fragment).ok())
            .ok_or_else(|| error("authentication"))?;
        let value: Value =
            serde_json::from_slice(&decoded).map_err(|_| error("authentication"))?;
        if value
            .get("message_err")
            .and_then(Value::as_str)
            .is_some_and(|s| !s.trim().is_empty())
        {
            return Err(error("authentication"));
        }
        let returned_driver = value
            .get("driver_txt")
            .and_then(Value::as_str)
            .ok_or_else(|| error("authentication"))?;
        let server_use = value.get("server_use").is_some_and(|v| {
            v.as_bool() == Some(true) || v.as_str() == Some("true") || v.as_u64() == Some(1)
        });
        // OpenList's OneDrive callback echoes server_use. Its Baidu callback
        // does not include that field, so the driver binding is the reliable
        // check for baiduyun_go.
        let server_use_required = driver.starts_with("onedrive_");
        if returned_driver != driver || (server_use_required && !server_use) {
            return Err(error("authentication"));
        }
        let refresh_token = value
            .get("refresh_token")
            .and_then(Value::as_str)
            .filter(|t| !t.is_empty() && t.len() <= 16_384 && !t.chars().any(char::is_control))
            .ok_or_else(|| error("authentication"))?
            .to_string();
        let access_token = value
            .get("access_token")
            .and_then(Value::as_str)
            .filter(|t| !t.is_empty() && t.len() <= 16_384 && !t.chars().any(char::is_control))
            .map(str::to_string);
        let expires_at = integer(&value, "expires_at")
            .or_else(|| integer(&value, "expires_in").map(|s| now() + s));
        Ok(TokenPayload {
            access_token,
            refresh_token,
            expires_at,
        })
    }
    pub async fn renew(&self, _provider: Provider, driver: &str, refresh: &str) -> Result<Renewed> {
        if refresh.is_empty() || refresh.len() > 16_384 || refresh.chars().any(char::is_control) {
            return Err(error("authentication"));
        }
        let (route, _) = Self::route(driver)?;
        let mut url = self.url(route, "renewapi")?;
        {
            let mut q = url.query_pairs_mut();
            q.append_pair("server_use", "true");
            q.append_pair("driver_txt", driver);
            q.append_pair("refresh_ui", refresh);
        }
        let (status, _, mut value) = self
            .bounded_json(reqwest::Method::GET, url, None)
            .await?;
        if !status.is_success() {
            return Err(error(if status == StatusCode::UNAUTHORIZED {
                "authentication"
            } else {
                "network"
            }));
        }
        if let Some(text) = value.get("text").and_then(Value::as_str) {
            if let Ok(parsed) = serde_json::from_str::<Value>(text) {
                value = parsed;
            }
        }
        if let Some(data) = value.get("data").filter(|v| v.is_object()) {
            value = data.clone();
        }
        if value
            .get("message_err")
            .and_then(Value::as_str)
            .is_some_and(|s| !s.trim().is_empty())
        {
            return Err(error("authentication"));
        }
        let access_token = value
            .get("access_token")
            .and_then(Value::as_str)
            .filter(|t| !t.is_empty() && t.len() <= 16_384 && !t.chars().any(char::is_control))
            .ok_or_else(|| error("authentication"))?
            .to_string();
        let refresh_token = value
            .get("refresh_token")
            .and_then(Value::as_str)
            .filter(|t| !t.is_empty() && t.len() <= 16_384 && !t.chars().any(char::is_control))
            .map(str::to_string);
        let expires_at = integer(&value, "expires_at")
            .or_else(|| integer(&value, "expires_in").map(|s| now() + s))
            .or_else(|| Some(now() + 3000));
        Ok(Renewed {
            access_token,
            refresh_token,
            expires_at,
        })
    }
    pub async fn account(&self, provider: Provider, token: &str) -> Result<AccountInfo> {
        if token.is_empty() || token.len() > 16_384 {
            return Err(error("authentication"));
        }
        match provider {
            Provider::Onedrive => self.onedrive_account(token).await,
            Provider::Baidu => self.baidu_account(token).await,
            _ => Err(error("invalid")),
        }
    }
    async fn onedrive_account(&self, token: &str) -> Result<AccountInfo> {
        let mut me = self.graph.clone();
        me.path_segments_mut()
            .map_err(|_| error("invalid"))?
            .extend(["me"]);
        let (status, _, value) = self
            .bounded_json(reqwest::Method::GET, me, Some(token))
            .await?;
        if !status.is_success() {
            return Err(error("authentication"));
        }
        let account_id = value
            .get("id")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| error("invalid"))?
            .to_string();
        let display_name = value
            .get("displayName")
            .or_else(|| value.get("userPrincipalName"))
            .and_then(Value::as_str)
            .unwrap_or("OneDrive")
            .to_string();
        let mut drive = self.graph.clone();
        drive
            .path_segments_mut()
            .map_err(|_| error("invalid"))?
            .extend(["me", "drive"]);
        let (status, _, value) = self
            .bounded_json(reqwest::Method::GET, drive, Some(token))
            .await?;
        let (drive_type, quota_total, quota_used) = if status.is_success() {
            (
                value.get("driveType").and_then(Value::as_str).map(str::to_string),
                value.pointer("/quota/total").and_then(Value::as_u64),
                value.pointer("/quota/used").and_then(Value::as_u64),
            )
        } else {
            (None, None, None)
        };
        Ok(AccountInfo {
            account_id,
            display_name,
            drive_type,
            quota_total,
            quota_used,
        })
    }
    async fn baidu_account(&self, token: &str) -> Result<AccountInfo> {
        let mut u = self.baidu.clone();
        u.path_segments_mut()
            .map_err(|_| error("invalid"))?
            .extend(["rest", "2.0", "xpan", "nas"]);
        u.query_pairs_mut()
            .append_pair("method", "uinfo")
            .append_pair("access_token", token);
        let (status, _, value) = self
            .bounded_json(reqwest::Method::GET, u, None)
            .await?;
        if !status.is_success() {
            return Err(error("authentication"));
        }
        if value.get("errno").and_then(Value::as_i64).is_some_and(|n| n != 0) {
            return Err(error("authentication"));
        }
        let account_id = value
            .get("uk")
            .and_then(|v| {
                v.as_i64()
                    .map(|n| n.to_string())
                    .or_else(|| v.as_u64().map(|n| n.to_string()))
                    .or_else(|| v.as_str().map(str::to_string))
            })
            .filter(|s| !s.is_empty())
            .ok_or_else(|| error("invalid"))?;
        let display_name = value
            .get("netdisk_name")
            .or_else(|| value.get("baidu_name"))
            .and_then(Value::as_str)
            .unwrap_or("百度网盘")
            .to_string();
        let mut q = self.baidu.clone();
        q.path_segments_mut()
            .map_err(|_| error("invalid"))?
            .extend(["api", "quota"]);
        q.query_pairs_mut()
            .append_pair("access_token", token)
            .append_pair("checkfree", "1")
            .append_pair("checkexpire", "1");
        let (status, _, value) = self
            .bounded_json(reqwest::Method::GET, q, None)
            .await?;
        let (quota_total, quota_used) = if status.is_success() {
            (
                value.get("total").and_then(Value::as_u64),
                value.get("used").and_then(Value::as_u64),
            )
        } else {
            (None, None)
        };
        Ok(AccountInfo {
            account_id,
            display_name,
            drive_type: Some("baidu".into()),
            quota_total,
            quota_used,
        })
    }
}

pub fn callback_prefix() -> &'static str {
    "https://api.oplist.org/"
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };

    fn serve(listener: TcpListener, responses: Vec<(String, Vec<u8>)>) {
        for (headers, body) in responses {
            let (mut stream, _) = listener.accept().unwrap();
            let mut data = vec![0; 8192];
            let _ = stream.read(&mut data);
            let head = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n{}\r\n",
                body.len(),
                headers
            );
            stream.write_all(head.as_bytes()).unwrap();
            stream.write_all(&body).unwrap();
        }
    }

    #[test]
    fn callback_requires_matching_driver_and_refresh_token() {
        let client = OpenList::fixture(
            "https://api.oplist.org",
            "https://graph.microsoft.com/v1.0",
            "https://pan.baidu.com",
        )
        .unwrap();
        let payload = serde_json::json!({
            "access_token": "a",
            "refresh_token": "r",
            "driver_txt": "onedrive_pr",
            "server_use": true,
            "expires_in": "3600"
        });
        let url = format!(
            "https://api.oplist.org/#{}",
            STANDARD.encode(serde_json::to_vec(&payload).unwrap())
        );
        let t = client.parse_callback(&url, "onedrive_pr").unwrap();
        assert_eq!(t.refresh_token, "r");
        assert!(t.expires_at.is_some());
        assert_eq!(
            client.parse_callback(&url, "onedrive_go").unwrap_err().code,
            "authentication"
        );
        let bad = serde_json::json!({"refresh_token":"r","driver_txt":"onedrive_pr","server_use":true,"message_err":"denied"});
        let url = format!(
            "https://api.oplist.org/#{}",
            STANDARD.encode(serde_json::to_vec(&bad).unwrap())
        );
        assert_eq!(
            client.parse_callback(&url, "onedrive_pr").unwrap_err().code,
            "authentication"
        );
        let missing = serde_json::json!({"driver_txt":"onedrive_pr","server_use":true});
        let url = format!(
            "https://api.oplist.org/#{}",
            STANDARD.encode(serde_json::to_vec(&missing).unwrap())
        );
        assert_eq!(
            client.parse_callback(&url, "onedrive_pr").unwrap_err().code,
            "authentication"
        );
    }

    #[test]
    fn callback_rejects_other_hosts() {
        let client = OpenList::fixture(
            "https://api.oplist.org",
            "https://graph.microsoft.com/v1.0",
            "https://pan.baidu.com",
        )
        .unwrap();
        let payload = serde_json::json!({"refresh_token":"r","driver_txt":"onedrive_pr","server_use":true});
        let url = format!(
            "https://evil.example/#{}",
            STANDARD.encode(serde_json::to_vec(&payload).unwrap())
        );
        assert_eq!(
            client.parse_callback(&url, "onedrive_pr").unwrap_err().code,
            "authentication"
        );
    }

    #[test]
    fn baidu_callback_does_not_require_server_use() {
        let client = OpenList::fixture(
            "https://api.oplist.org",
            "https://graph.microsoft.com/v1.0",
            "https://pan.baidu.com",
        )
        .unwrap();
        let payload = serde_json::json!({
            "access_token": "a",
            "refresh_token": "r",
            "driver_txt": "baiduyun_go"
        });
        let url = format!(
            "https://api.oplist.org/#{}",
            STANDARD.encode(serde_json::to_vec(&payload).unwrap())
        );
        let token = client.parse_callback(&url, "baiduyun_go").unwrap();
        assert_eq!(token.refresh_token, "r");
        assert_eq!(
            client.parse_callback(&url, "onedrive_pr").unwrap_err().code,
            "authentication"
        );
    }

    #[test]
    fn requests_captures_only_auth_cookies_and_renews() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let auth = serde_json::to_vec(&serde_json::json!({
            "text": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=x"
        }))
        .unwrap();
        let renew = serde_json::to_vec(&serde_json::json!({
            "access_token": "new-access",
            "refresh_token": "new-refresh",
            "expires_in": 3600
        }))
        .unwrap();
        thread::spawn(move || {
            serve(
                listener,
                vec![
                    (
                        "Set-Cookie: driver_txt=onedrive_pr; Path=/; Secure; HttpOnly\r\nSet-Cookie: server_use=true; Path=/; Secure\r\nSet-Cookie: cf_clearance=no; Path=/; Secure\r\nContent-Type: application/json\r\n".into(),
                        auth,
                    ),
                    ("Content-Type: application/json\r\n".into(), renew),
                ],
            )
        });
        let client = OpenList::fixture(
            &format!("http://127.0.0.1:{port}"),
            "https://graph.microsoft.com/v1.0",
            "https://pan.baidu.com",
        )
        .unwrap();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            let start = client.requests("onedrive_pr").await.unwrap();
            assert!(start.authorization_url.starts_with("https://login.microsoftonline.com/"));
            assert_eq!(start.cookies.len(), 2);
            assert!(start.cookies.iter().all(|c| c.name != "cf_clearance"));
            assert_eq!(start.cookies[0].name, "driver_txt");
            let renewed = client
                .renew(Provider::Onedrive, "onedrive_pr", "old-refresh")
                .await
                .unwrap();
            assert_eq!(renewed.access_token, "new-access");
            assert_eq!(renewed.refresh_token.as_deref(), Some("new-refresh"));
            assert!(renewed.expires_at.is_some());
        });
    }
}
