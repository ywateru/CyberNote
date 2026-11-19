//! Bounded HTTP protocol implementations. Redirects never forward credentials.
use super::model::*;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue},
    Client, Method, StatusCode, Url,
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, time::Duration};
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Revision {
    Missing,
    Etag(String),
    Sha(String),
}
pub struct Object {
    pub bytes: Vec<u8>,
    pub revision: Revision,
}
pub struct Remote {
    kind: Provider,
    config: ProviderConfig,
    client: Client,
    api: Url,
}
fn network(e: reqwest::Error) -> CloudError {
    error(if e.is_timeout() { "timeout" } else { "network" })
}
fn field<'a>(c: &'a ProviderConfig, k: &str) -> &'a str {
    c.fields.get(k).map(String::as_str).unwrap_or("")
}
fn secret<'a>(c: &'a ProviderConfig, k: &str) -> &'a str {
    c.secrets.get(k).map(String::as_str).unwrap_or("")
}
fn components(path: &str) -> Result<Vec<&str>> {
    if path.len() > 2048 || path.contains(['\\', '?', '#', '%']) {
        return Err(error("invalid"));
    }
    let parts = path
        .trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>();
    if parts.len() > 16
        || parts
            .iter()
            .any(|s| *s == "." || *s == ".." || s.chars().any(char::is_control))
    {
        return Err(error("invalid"));
    }
    Ok(parts)
}
fn append(mut url: Url, parts: &[&str]) -> Result<Url> {
    {
        let mut p = url.path_segments_mut().map_err(|_| error("invalid"))?;
        p.pop_if_empty();
        for s in parts {
            p.push(s);
        }
    }
    Ok(url)
}
fn endpoint(s: &str, fixture: bool) -> Result<Url> {
    let u = Url::parse(s).map_err(|_| error("invalid"))?;
    if (u.scheme() != "https"
        && !(fixture && u.scheme() == "http" && u.host_str() == Some("127.0.0.1")))
        || u.host_str().is_none()
        || !u.username().is_empty()
        || u.password().is_some()
        || u.query().is_some()
        || u.fragment().is_some()
    {
        return Err(error("invalid"));
    }
    Ok(u)
}
impl Remote {
    pub fn new(kind: Provider, config: ProviderConfig) -> Result<Self> {
        Self::build(kind, config, None)
    }
    #[cfg(test)]
    pub fn fixture(kind: Provider, config: ProviderConfig, api: &str) -> Result<Self> {
        Self::build(kind, config, Some(api))
    }
    fn build(kind: Provider, config: ProviderConfig, fixture: Option<&str>) -> Result<Self> {
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(8))
            .timeout(Duration::from_secs(30))
            .user_agent("CyberNote-cloud/1")
            .build()
            .map_err(network)?;
        let api = if kind == Provider::Github {
            endpoint(
                fixture.unwrap_or("https://api.github.com"),
                fixture.is_some(),
            )?
        } else {
            endpoint(field(&config, "endpoint"), fixture.is_some())?
        };
        let required: &[&str] = match kind {
            Provider::Webdav => &[],
            Provider::S3 => &["region", "bucket"],
            Provider::Github => &["owner", "repo", "branch"],
        };
        if required.iter().any(|k| field(&config, k).is_empty()) {
            return Err(error("invalid"));
        }
        for k in ["owner", "repo", "bucket"] {
            let s = field(&config, k);
            if !s.is_empty() && (s.contains('/') || components(s)?.len() != 1) {
                return Err(error("invalid"));
            }
        }
        for k in ["prefix", "directory"] {
            components(field(&config, k))?;
        }
        if kind == Provider::S3
            && (field(&config, "region").len() > 64
                || !field(&config, "region")
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-'))
        {
            return Err(error("invalid"));
        }
        let credentials: &[&str] = match kind {
            Provider::Webdav => &["password"],
            Provider::S3 => &["accessKey", "secretKey"],
            Provider::Github => &["token"],
        };
        if credentials.iter().any(|k| secret(&config, k).is_empty()) {
            return Err(error("authentication"));
        }
        Ok(Self {
            kind,
            config,
            client,
            api,
        })
    }
    fn repo(&self) -> Result<Url> {
        append(
            self.api.clone(),
            &[
                "repos",
                field(&self.config, "owner"),
                field(&self.config, "repo"),
            ],
        )
    }
    fn object_url(&self) -> Result<Url> {
        let c = &self.config;
        let mut u = match self.kind {
            Provider::Webdav => self.api.clone(),
            Provider::S3 => append(self.api.clone(), &[field(c, "bucket")])?,
            Provider::Github => append(self.repo()?, &["contents"])?,
        };
        let path = components(field(
            c,
            if self.kind == Provider::Webdav {
                "directory"
            } else {
                "prefix"
            },
        ))?;
        u = append(u, &path)?;
        u = append(u, &["cybernote", "snapshot-v1.enc"])?;
        if self.kind == Provider::Github {
            u.query_pairs_mut().append_pair("ref", field(c, "branch"));
        }
        Ok(u)
    }
    async fn request(
        &self,
        method: Method,
        mut url: Url,
        body: Vec<u8>,
        mut headers: HeaderMap,
        limit: usize,
    ) -> Result<(StatusCode, HeaderMap, Vec<u8>)> {
        if body.len() > MAX_REMOTE * 2 {
            return Err(error("limit"));
        }
        if self.kind == Provider::S3 {
            url.set_path(&s3_path(url.path())?);
        }
        let mut req = self.client.request(method.clone(), url.clone());
        match self.kind {
            Provider::Webdav => {
                req = req.basic_auth(
                    field(&self.config, "username"),
                    Some(secret(&self.config, "password")),
                );
            }
            Provider::Github => {
                req = req
                    .bearer_auth(secret(&self.config, "token"))
                    .header(
                        "Accept",
                        headers
                            .get("accept")
                            .cloned()
                            .unwrap_or(HeaderValue::from_static("application/vnd.github+json")),
                    )
                    .header("X-GitHub-Api-Version", "2022-11-28");
            }
            Provider::S3 => {
                let date = utc_now()?;
                sign_s3(&method, &url, &body, &self.config, &date, &mut headers)?;
            }
        }
        let mut res = req
            .headers(headers)
            .body(body)
            .send()
            .await
            .map_err(network)?;
        let status = res.status();
        let headers = res.headers().clone();
        if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
            return Err(error("authentication"));
        }
        if status == StatusCode::PRECONDITION_FAILED || status == StatusCode::CONFLICT {
            return Err(error("conflict"));
        }
        if res.content_length().is_some_and(|n| n > limit as u64) {
            return Err(error("limit"));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = res.chunk().await.map_err(network)? {
            if bytes.len() + chunk.len() > limit {
                return Err(error("limit"));
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok((status, headers, bytes))
    }
    /// Read-only authentication/existence probe. An object 404 is not by itself a valid empty library.
    async fn probe(&self) -> Result<()> {
        let (method, url, headers) = match self.kind {
            Provider::Webdav => {
                let mut h = HeaderMap::new();
                h.insert("depth", HeaderValue::from_static("0"));
                (
                    Method::from_bytes(b"PROPFIND").unwrap(),
                    self.api.clone(),
                    h,
                )
            }
            Provider::S3 => {
                let mut u = append(self.api.clone(), &[field(&self.config, "bucket")])?;
                u.query_pairs_mut()
                    .append_pair("list-type", "2")
                    .append_pair("max-keys", "1")
                    .append_pair("prefix", field(&self.config, "prefix"));
                (Method::GET, u, HeaderMap::new())
            }
            Provider::Github => (Method::GET, self.repo()?, HeaderMap::new()),
        };
        let (s, _, bytes) = self
            .request(method, url, vec![], headers, 128 * 1024)
            .await?;
        if !s.is_success() {
            return Err(error(if self.kind == Provider::Github {
                "private_repository"
            } else {
                "network"
            }));
        }
        if self.kind == Provider::Github {
            let v: Value = serde_json::from_slice(&bytes).map_err(|_| error("invalid"))?;
            if v["private"] != true {
                return Err(error("private_repository"));
            }
            let u = append(self.repo()?, &["branches", field(&self.config, "branch")])?;
            let (s, _, _) = self
                .request(Method::GET, u, vec![], HeaderMap::new(), 128 * 1024)
                .await?;
            if !s.is_success() {
                return Err(error("private_repository"));
            }
        } else {
            // Reject successful HTML/login pages instead of treating them as empty cloud storage.
            let xml = std::str::from_utf8(&bytes).map_err(|_| error("invalid"))?;
            let doc = roxmltree::Document::parse(xml).map_err(|_| error("invalid"))?;
            let expected = if self.kind == Provider::S3 {
                "ListBucketResult"
            } else {
                "multistatus"
            };
            if doc.root_element().tag_name().name() != expected {
                return Err(error("invalid"));
            }
        }
        Ok(())
    }
    pub async fn get(&self) -> Result<Object> {
        self.probe().await?;
        let (s, h, b) = self
            .request(
                Method::GET,
                self.object_url()?,
                vec![],
                HeaderMap::new(),
                if self.kind == Provider::Github {
                    GITHUB_INLINE * 2
                } else {
                    MAX_REMOTE
                },
            )
            .await?;
        if s == StatusCode::NOT_FOUND {
            if self.kind == Provider::S3 {
                let xml = std::str::from_utf8(&b).map_err(|_| error("invalid"))?;
                let d = roxmltree::Document::parse(xml).map_err(|_| error("invalid"))?;
                if !d
                    .descendants()
                    .any(|n| n.has_tag_name("Code") && n.text() == Some("NoSuchKey"))
                {
                    return Err(error("network"));
                }
            }
            return Ok(Object {
                bytes: vec![],
                revision: Revision::Missing,
            });
        }
        if !s.is_success() {
            return Err(error("network"));
        }
        if self.kind == Provider::Github {
            let v: Value = serde_json::from_slice(&b).map_err(|_| error("invalid"))?;
            if v["type"] != "file" || v["size"].as_u64().is_none_or(|n| n > MAX_GITHUB as u64) {
                return Err(error("github_limit"));
            }
            if v["size"].as_u64().is_some_and(|n| n > MAX_REMOTE as u64) {
                return Err(error("limit"));
            }
            let sha = v["sha"]
                .as_str()
                .filter(|s| valid_sha(s))
                .ok_or_else(|| error("invalid"))?
                .to_string();
            let bytes =
                if v["size"].as_u64().unwrap() > GITHUB_INLINE as u64 || v["encoding"] == "none" {
                    let mut headers = HeaderMap::new();
                    headers.insert(
                        "accept",
                        HeaderValue::from_static("application/vnd.github.raw+json"),
                    );
                    let (s, _, raw) = self
                        .request(Method::GET, self.object_url()?, vec![], headers, MAX_REMOTE)
                        .await?;
                    if !s.is_success() {
                        return Err(error("network"));
                    }
                    raw
                } else {
                    if v["encoding"] != "base64" {
                        return Err(error("invalid"));
                    }
                    let content = v["content"]
                        .as_str()
                        .ok_or_else(|| error("invalid"))?
                        .replace(['\r', '\n'], "");
                    B64.decode(content).map_err(|_| error("invalid"))?
                };
            if bytes.len() > MAX_GITHUB || Some(bytes.len() as u64) != v["size"].as_u64() {
                return Err(error("invalid"));
            }
            // Contents SHA is Git's blob hash; don't accept unbound body/version metadata.
            if git_blob_sha(&bytes) != sha {
                return Err(error("invalid"));
            }
            Ok(Object {
                bytes,
                revision: Revision::Sha(sha),
            })
        } else {
            Ok(Object {
                bytes: b,
                revision: Revision::Etag(etag(&h)?),
            })
        }
    }
    async fn mkdir(&self) -> Result<()> {
        let mut parts = components(field(&self.config, "directory"))?;
        parts.push("cybernote");
        let mut u = self.api.clone();
        for part in parts {
            u = append(u, &[part])?;
            let (s, _, _) = self
                .request(
                    Method::from_bytes(b"MKCOL").unwrap(),
                    u.clone(),
                    vec![],
                    HeaderMap::new(),
                    64 * 1024,
                )
                .await?;
            if s != StatusCode::CREATED && s != StatusCode::METHOD_NOT_ALLOWED {
                return Err(error("network"));
            }
        }
        Ok(())
    }
    pub async fn put(&self, bytes: Vec<u8>, expected: &Revision) -> Result<()> {
        if bytes.len() > MAX_REMOTE {
            return Err(error("limit"));
        }
        if self.kind == Provider::Webdav {
            self.mkdir().await?;
        }
        let mut h = HeaderMap::new();
        let mut url = self.object_url()?;
        let body = if self.kind == Provider::Github {
            if bytes.len() > MAX_GITHUB {
                return Err(error("github_limit"));
            }
            url.set_query(None);
            let mut v = json!({"message":"CyberNote encrypted sync","branch":field(&self.config,"branch"),"content":B64.encode(bytes)});
            match expected {
                Revision::Missing => {}
                Revision::Sha(sha) if valid_sha(sha) => v["sha"] = json!(sha),
                _ => return Err(error("invalid")),
            };
            serde_json::to_vec(&v).map_err(|_| error("invalid"))?
        } else {
            match expected {
                Revision::Missing => {
                    h.insert("if-none-match", HeaderValue::from_static("*"));
                }
                Revision::Etag(e) => {
                    h.insert(
                        "if-match",
                        HeaderValue::from_str(e).map_err(|_| error("invalid"))?,
                    );
                }
                _ => return Err(error("invalid")),
            };
            bytes
        };
        h.insert(
            "content-type",
            HeaderValue::from_static(if self.kind == Provider::Github {
                "application/json"
            } else {
                "application/octet-stream"
            }),
        );
        let (s, _, b) = self.request(Method::PUT, url, body, h, 128 * 1024).await?;
        if self.kind == Provider::Github && s == StatusCode::UNPROCESSABLE_ENTITY {
            return Err(error("conflict"));
        }
        if !s.is_success() {
            return Err(error("network"));
        }
        if self.kind == Provider::Github {
            let v: Value = serde_json::from_slice(&b).map_err(|_| error("invalid"))?;
            if !v["content"]["sha"].as_str().is_some_and(valid_sha) {
                return Err(error("invalid"));
            }
        }
        Ok(())
    }
}
fn etag(h: &HeaderMap) -> Result<String> {
    let e = h
        .get("etag")
        .and_then(|s| s.to_str().ok())
        .ok_or_else(|| error("precondition"))?;
    if e.len() < 2
        || e.len() > 256
        || !e.starts_with('"')
        || !e.ends_with('"')
        || e.contains(['\r', '\n'])
    {
        return Err(error("precondition"));
    }
    Ok(e.into())
}
fn valid_sha(s: &str) -> bool {
    s.len() == 40
        && s.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
// GitHub validates blob SHAs; SHA-1 is used only as the required Git object identity.
pub(crate) fn git_blob_sha(bytes: &[u8]) -> String {
    let mut digest = sha1::Sha1::new();
    digest.update(format!("blob {}\0", bytes.len()).as_bytes());
    digest.update(bytes);
    format!("{:x}", digest.finalize())
}
fn hex(bytes: impl AsRef<[u8]>) -> String {
    bytes.as_ref().iter().map(|b| format!("{b:02x}")).collect()
}
pub fn hmac(key: &[u8], message: &[u8]) -> Vec<u8> {
    use hmac::Mac;
    let mut mac =
        <hmac::Hmac<Sha256> as Mac>::new_from_slice(key).expect("HMAC accepts all key sizes");
    mac.update(message);
    mac.finalize().into_bytes().to_vec()
}
fn encode(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|b| {
            if b.is_ascii_alphanumeric() || b"-_.~".contains(b) {
                (*b as char).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect()
}
fn s3_path(path: &str) -> Result<String> {
    path.split('/')
        .map(|segment| {
            let bytes = segment.as_bytes();
            let mut raw = vec![];
            let mut i = 0;
            while i < bytes.len() {
                if bytes[i] == b'%' {
                    if i + 2 >= bytes.len() {
                        return Err(error("invalid"));
                    }
                    let text =
                        std::str::from_utf8(&bytes[i + 1..i + 3]).map_err(|_| error("invalid"))?;
                    raw.push(u8::from_str_radix(text, 16).map_err(|_| error("invalid"))?);
                    i += 3;
                } else {
                    raw.push(bytes[i]);
                    i += 1;
                }
            }
            Ok(encode(&raw))
        })
        .collect::<Result<Vec<_>>>()
        .map(|parts| parts.join("/"))
}
pub fn sign_s3(
    method: &Method,
    url: &Url,
    body: &[u8],
    config: &ProviderConfig,
    date: &str,
    headers: &mut HeaderMap,
) -> Result<()> {
    if date.len() != 16 || !date.ends_with('Z') || !date[..8].bytes().all(|b| b.is_ascii_digit()) {
        return Err(error("invalid"));
    }
    let host = match url.port() {
        Some(p) => format!("{}:{p}", url.host_str().unwrap_or("")),
        None => url.host_str().unwrap_or("").into(),
    };
    for (k, v) in [
        ("host", host),
        ("x-amz-date", date.into()),
        ("x-amz-content-sha256", hex(Sha256::digest(body))),
    ] {
        headers.insert(
            HeaderName::from_bytes(k.as_bytes()).unwrap(),
            HeaderValue::from_str(&v).map_err(|_| error("invalid"))?,
        );
    }
    if !secret(config, "sessionToken").is_empty() {
        headers.insert(
            "x-amz-security-token",
            HeaderValue::from_str(secret(config, "sessionToken")).map_err(|_| error("invalid"))?,
        );
    }
    let mut signed = BTreeMap::new();
    for (k, v) in headers.iter() {
        if k != "authorization" {
            signed.insert(
                k.as_str(),
                v.to_str()
                    .map_err(|_| error("invalid"))?
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" "),
            );
        }
    }
    let canonical_headers = signed
        .iter()
        .map(|(k, v)| format!("{k}:{v}\n"))
        .collect::<String>();
    let names = signed.keys().copied().collect::<Vec<_>>().join(";");
    let mut query = url
        .query_pairs()
        .map(|(k, v)| (encode(k.as_bytes()), encode(v.as_bytes())))
        .collect::<Vec<_>>();
    query.sort();
    let query = query
        .into_iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("&");
    let canonical = format!(
        "{}\n{}\n{}\n{}\n{}\n{}",
        method.as_str(),
        s3_path(url.path())?,
        query,
        canonical_headers,
        names,
        hex(Sha256::digest(body))
    );
    let scope = format!("{}/{}/s3/aws4_request", &date[..8], field(config, "region"));
    let text = format!(
        "AWS4-HMAC-SHA256\n{date}\n{scope}\n{}",
        hex(Sha256::digest(canonical.as_bytes()))
    );
    let kd = hmac(
        format!("AWS4{}", secret(config, "secretKey")).as_bytes(),
        date[..8].as_bytes(),
    );
    let kr = hmac(&kd, field(config, "region").as_bytes());
    let ks = hmac(&kr, b"s3");
    let signing = hmac(&ks, b"aws4_request");
    let signature = hex(hmac(&signing, text.as_bytes()));
    headers.insert(
        "authorization",
        HeaderValue::from_str(&format!(
            "AWS4-HMAC-SHA256 Credential={}/{scope}, SignedHeaders={names}, Signature={signature}",
            secret(config, "accessKey")
        ))
        .map_err(|_| error("invalid"))?,
    );
    Ok(())
}
fn utc_now() -> Result<String> {
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| error("invalid"))?
        .as_secs() as libc::time_t;
    let mut tm = std::mem::MaybeUninit::<libc::tm>::uninit();
    if unsafe { libc::gmtime_r(&t, tm.as_mut_ptr()) }.is_null() {
        return Err(error("invalid"));
    }
    let tm = unsafe { tm.assume_init() };
    Ok(format!(
        "{:04}{:02}{:02}T{:02}{:02}{:02}Z",
        tm.tm_year + 1900,
        tm.tm_mon + 1,
        tm.tm_mday,
        tm.tm_hour,
        tm.tm_min,
        tm.tm_sec
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hashes() {
        assert_eq!(
            hex(hmac(&[0x0b; 20], b"Hi There")),
            "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
        );
        assert_eq!(
            git_blob_sha(b"test content\n"),
            "d670460b4b4aece5915caf5c68d12f560a9fe3e4"
        );
    }
}
