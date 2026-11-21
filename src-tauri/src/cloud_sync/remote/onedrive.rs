//! OneDrive personal/business adapter. The final commit, not session creation,
//! is the concurrency decision point.
use super::*;
use reqwest::{
    header::{HeaderValue, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE},
    Client, Method, StatusCode,
};
use serde_json::{json, Value};
use std::time::Duration;

const CHUNK: usize = 10 * 1024 * 1024;
const ALIGN: usize = 320 * 1024;
const FILE: &str = "notes.bundle";
const FOLDER: &str = "CyberNote";

fn meta_url(remote: &Remote) -> Result<Url> {
    let base = remote.api.as_str().trim_end_matches('/');
    Url::parse(&format!("{base}/me/drive/root:/{FOLDER}/{FILE}"))
        .map_err(|_| error("invalid"))
}

fn content_url(remote: &Remote, suffix: &str) -> Result<Url> {
    let base = remote.api.as_str().trim_end_matches('/');
    Url::parse(&format!("{base}/me/drive/root:/{FOLDER}/{FILE}:{suffix}"))
        .map_err(|_| error("invalid"))
}

fn folder_url(remote: &Remote) -> Result<Url> {
    let base = remote.api.as_str().trim_end_matches('/');
    Url::parse(&format!("{base}/me/drive/root:/{FOLDER}")).map_err(|_| error("invalid"))
}

fn download_client() -> Result<Client> {
    Client::builder()
        .redirect(reqwest::redirect::Policy::limited(5))
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(60))
        .user_agent("CyberNote-cloud-auth/1")
        .build()
        .map_err(|e| error(if e.is_timeout() { "timeout" } else { "network" }))
}

fn etag(value: &Value) -> Result<String> {
    let raw = value
        .get("eTag")
        .and_then(Value::as_str)
        .ok_or_else(|| error("precondition"))?;
    if raw.len() < 2 || raw.len() > 256 || !raw.starts_with('"') || !raw.ends_with('"') {
        return Err(error("precondition"));
    }
    Ok(raw.into())
}

pub async fn probe(remote: &Remote) -> Result<()> {
    let token = remote.bearer().await?;
    let mut u = remote.api.clone();
    u.path_segments_mut()
        .map_err(|_| error("invalid"))?
        .extend(["me", "drive"]);
    let (status, _, value) = remote
        .bounded_json(Method::GET, u, Some(&token))
        .await?;
    if !status.is_success() {
        return Err(error("authentication"));
    }
    if value.get("id").and_then(Value::as_str).is_none() {
        return Err(error("invalid"));
    }
    if let Some(t) = value.get("driveType").and_then(Value::as_str) {
        let _ = remote.drive_type.set(t.into());
    }
    Ok(())
}

pub async fn get(remote: &Remote) -> Result<Object> {
    let token = remote.bearer().await?;
    let (status, _, value) = remote
        .bounded_json(Method::GET, meta_url(remote)?, Some(&token))
        .await?;
    if status == StatusCode::NOT_FOUND {
        return Ok(Object {
            bytes: vec![],
            revision: Revision::Missing,
        });
    }
    if !status.is_success() {
        return Err(error("network"));
    }
    if value.get("folder").is_some() || value.get("file").is_none() {
        return Err(error("invalid"));
    }
    let size = value
        .get("size")
        .and_then(Value::as_u64)
        .ok_or_else(|| error("invalid"))?;
    if size > MAX_REMOTE as u64 {
        return Err(error("limit"));
    }
    let revision = Revision::Etag(etag(&value)?);
    let download = value
        .get("@microsoft.graph.downloadUrl")
        .and_then(Value::as_str)
        .ok_or_else(|| error("invalid"))?;
    let url = Url::parse(download).map_err(|_| error("invalid"))?;
    let local = cfg!(test) && url.scheme() == "http" && url.host_str() == Some("127.0.0.1");
    if (url.scheme() != "https" && !local)
        || url.username() != ""
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err(error("invalid"));
    }
    let client = download_client()?;
    let mut res = client.get(url).send().await.map_err(network)?;
    let final_url = res.url().clone();
    let local_final = cfg!(test)
        && final_url.scheme() == "http"
        && final_url.host_str() == Some("127.0.0.1");
    if (final_url.scheme() != "https" && !local_final) || final_url.host_str().is_none() {
        return Err(error("invalid"));
    }
    if !res.status().is_success() {
        return Err(error("network"));
    }
    if res.content_length().is_some_and(|n| n > MAX_REMOTE as u64) {
        return Err(error("limit"));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = res.chunk().await.map_err(network)? {
        if bytes.len() + chunk.len() > MAX_REMOTE {
            return Err(error("limit"));
        }
        bytes.extend_from_slice(&chunk);
    }
    if bytes.len() as u64 != size {
        return Err(error("invalid"));
    }
    Ok(Object { bytes, revision })
}

async fn ensure_folder(remote: &Remote, token: &str) -> Result<()> {
    let mut u = remote.api.clone();
    u.path_segments_mut()
        .map_err(|_| error("invalid"))?
        .extend(["me", "drive", "root", "children"]);
    let body = serde_json::to_vec(&json!({
        "name": FOLDER,
        "folder": {},
        "@microsoft.graph.conflictBehavior": "fail"
    }))
    .map_err(|_| error("invalid"))?;
    let req = remote
        .client
        .request(Method::POST, u)
        .bearer_auth(token)
        .header(CONTENT_TYPE, "application/json")
        .body(body);
    let res = req.send().await.map_err(network)?;
    if res.status() == StatusCode::CONFLICT {
        let base = remote.api.as_str().trim_end_matches('/');
        let u = Url::parse(&format!("{base}/me/drive/root:/{FOLDER}"))
            .map_err(|_| error("invalid"))?;
        let (status, _, value) = remote
            .bounded_json(Method::GET, u, Some(token))
            .await?;
        if status.is_success() && value.get("folder").is_some() {
            return Ok(());
        }
        return Err(error("conflict"));
    }
    if !res.status().is_success() {
        return Err(error("network"));
    }
    Ok(())
}

async fn create_session(remote: &Remote, token: &str, expected: &Revision) -> Result<String> {
    let url = content_url(remote, "/createUploadSession")?;
    let conflict = match expected {
        Revision::Missing => "fail",
        Revision::Etag(_) => "replace",
        _ => return Err(error("invalid")),
    };
    let body = serde_json::to_vec(&json!({
        "item": {"@microsoft.graph.conflictBehavior": conflict, "name": FILE},
        "deferCommit": true
    }))
    .map_err(|_| error("invalid"))?;
    let mut req = remote
        .client
        .request(Method::POST, url)
        .bearer_auth(token)
        .header(CONTENT_TYPE, "application/json")
        .body(body);
    match expected {
        Revision::Missing => {
            req = req.header("if-none-match", "*");
        }
        Revision::Etag(e) => {
            req = req.header("if-match", HeaderValue::from_str(e).map_err(|_| error("invalid"))?);
        }
        _ => return Err(error("invalid")),
    }
    let res = req.send().await.map_err(network)?;
    if res.status() == StatusCode::PRECONDITION_FAILED || res.status() == StatusCode::CONFLICT {
        return Err(error("conflict"));
    }
    if !res.status().is_success() {
        return Err(error("network"));
    }
    let value: Value = res.json().await.map_err(|_| error("invalid"))?;
    let upload = value
        .get("uploadUrl")
        .and_then(Value::as_str)
        .ok_or_else(|| error("invalid"))?;
    let u = Url::parse(upload).map_err(|_| error("invalid"))?;
    let local = cfg!(test) && u.scheme() == "http" && u.host_str() == Some("127.0.0.1");
    if (u.scheme() != "https" && !local) || u.host_str().is_none() {
        return Err(error("invalid"));
    }
    Ok(upload.into())
}

async fn upload_chunks(remote: &Remote, upload: &str, bytes: &[u8]) -> Result<()> {
    let total = bytes.len();
    if total == 0 {
        return Err(error("invalid"));
    }
    let mut start = 0;
    while start < total {
        let mut end = (start + CHUNK).min(total);
        // Graph requires 320 KiB alignment for every non-final chunk.
        if end < total {
            end = start + ((end - start) / ALIGN) * ALIGN;
            if end <= start {
                return Err(error("invalid"));
            }
        }
        let range = format!("bytes {start}-{}-{total}", end - 1);
        let res = remote
            .client
            .request(Method::PUT, Url::parse(upload).map_err(|_| error("invalid"))?)
            .header(CONTENT_RANGE, HeaderValue::from_str(&range).map_err(|_| error("invalid"))?)
            .header(CONTENT_LENGTH, (end - start).to_string())
            .body(bytes[start..end].to_vec())
            .send()
            .await
            .map_err(network)?;
        let status = res.status();
        if status == StatusCode::PRECONDITION_FAILED || status == StatusCode::CONFLICT {
            return Err(error("conflict"));
        }
        if !status.is_success() {
            return Err(error("network"));
        }
        start = end;
    }
    Ok(())
}

async fn commit_once(
    remote: &Remote,
    upload: &str,
    expected: &Revision,
    conditional: bool,
) -> Result<StatusCode> {
    let upload_url = Url::parse(upload).map_err(|_| error("invalid"))?;
    let drive_type = remote.drive_type().await?;
    let business = drive_type.eq_ignore_ascii_case("business")
        || drive_type.eq_ignore_ascii_case("documentLibrary");
    let conflict = match expected {
        Revision::Missing => "fail",
        Revision::Etag(_) => "replace",
        _ => return Err(error("invalid")),
    };
    let mut req = if business {
        remote
            .client
            .request(Method::POST, upload_url)
            .header(CONTENT_LENGTH, "0")
    } else {
        // OneDrive Personal completes a deferred upload by PUTting the new
        // driveItem to the parent path. The upload session URL is carried in
        // sourceUrl; it is not the request target.
        remote
            .client
            .request(Method::PUT, folder_url(remote)?)
            .header(CONTENT_TYPE, "application/json")
            .body(
                serde_json::to_vec(&json!({
                    "name": FILE,
                    "@microsoft.graph.conflictBehavior": conflict,
                    "@microsoft.graph.sourceUrl": upload
                }))
                .map_err(|_| error("invalid"))?,
            )
    };
    if conditional {
        match expected {
            Revision::Missing => {
                req = req.header("if-none-match", "*");
            }
            Revision::Etag(e) => {
                req = req
                    .header("if-match", HeaderValue::from_str(e).map_err(|_| error("invalid"))?);
            }
            _ => return Err(error("invalid")),
        }
    }
    let res = req.send().await.map_err(|e| {
        if e.is_timeout() {
            error("timeout")
        } else {
            error("network")
        }
    })?;
    Ok(res.status())
}

async fn commit(remote: &Remote, upload: &str, expected: &Revision) -> Result<()> {
    let status = commit_once(remote, upload, expected, true).await?;
    if status == StatusCode::PRECONDITION_FAILED || status == StatusCode::CONFLICT {
        // Some tenants reject a final `If-None-Match` even when the item does
        // not exist. Only for creation, verify absence and retry with the
        // server-side `conflictBehavior: fail` still in the body.
        if matches!(expected, Revision::Missing)
            && get(remote).await?.revision == Revision::Missing
        {
            let retry = commit_once(remote, upload, expected, false).await?;
            if retry.is_success() {
                return Ok(());
            }
            return Err(error("conflict"));
        }
        return Err(error("conflict"));
    }
    if !status.is_success() {
        return Err(error("network"));
    }
    Ok(())
}

pub async fn put(remote: &Remote, bytes: Vec<u8>, expected: &Revision) -> Result<()> {
    if bytes.len() > MAX_REMOTE || bytes.is_empty() {
        return Err(error("limit"));
    }
    let token = remote.bearer().await?;
    ensure_folder(remote, &token).await?;
    let upload = create_session(remote, &token, expected).await?;
    upload_chunks(remote, &upload, &bytes).await?;
    match commit(remote, &upload, expected).await {
        Ok(()) => Ok(()),
        Err(e) if e.code == "timeout" || e.code == "network" => {
            // A timed-out final commit is ambiguous. Re-read and accept only
            // when the exact ciphertext is present.
            let current = get(remote).await?;
            if current.bytes == bytes {
                Ok(())
            } else {
                Err(e)
            }
        }
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cloud_sync::{
        auth::{oauth::OAuth, vault::Credential, ISSUER},
        protocol::Remote,
    };
    use std::{
        collections::BTreeMap,
        io::{Read, Write},
        net::{TcpListener, TcpStream},
        sync::{Arc, Mutex},
        thread,
    };

    struct State {
        object: Option<Vec<u8>>,
        uploaded: Vec<u8>,
        etag: u64,
        conflict_next_final: bool,
    }

    fn read_request(stream: &mut TcpStream) -> (String, BTreeMap<String, String>, Vec<u8>) {
        let mut data = vec![];
        let mut buf = [0; 8192];
        let split = loop {
            let n = stream.read(&mut buf).unwrap();
            data.extend_from_slice(&buf[..n]);
            if let Some(i) = data.windows(4).position(|b| b == b"\r\n\r\n") {
                break i;
            }
        };
        let head = String::from_utf8(data[..split].to_vec()).unwrap();
        let mut lines = head.split("\r\n");
        let first = lines.next().unwrap().to_string();
        let mut headers = BTreeMap::new();
        for line in lines {
            if let Some((k, v)) = line.split_once(':') {
                headers.insert(k.to_ascii_lowercase(), v.trim().to_string());
            }
        }
        let len = headers
            .get("content-length")
            .and_then(|v| v.parse::<usize>().ok())
            .unwrap_or(0);
        while data.len() < split + 4 + len {
            let n = stream.read(&mut buf).unwrap();
            data.extend_from_slice(&buf[..n]);
        }
        (
            first,
            headers,
            data[split + 4..split + 4 + len].to_vec(),
        )
    }

    fn respond(stream: &mut TcpStream, status: u16, body: Vec<u8>, extra: &str) {
        let head = format!(
            "HTTP/1.1 {status} Fixture\r\nContent-Length: {}\r\nConnection: close\r\n{extra}\r\n",
            body.len()
        );
        stream.write_all(head.as_bytes()).unwrap();
        stream.write_all(&body).unwrap();
    }

    #[test]
    fn final_commit_rejects_a_stale_etag() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let state = Arc::new(Mutex::new(State {
            object: None,
            uploaded: vec![],
            etag: 0,
            conflict_next_final: false,
        }));
        let s = state.clone();
        let server_base = base.clone();
        let _worker = thread::spawn(move || {
            for stream in listener.incoming() {
                let mut stream = stream.unwrap();
                let (line, headers, body) = read_request(&mut stream);
                let target = line.split_whitespace().nth(1).unwrap_or("");
                let method = line.split_whitespace().next().unwrap_or("");
                let mut s = s.lock().unwrap();
                if method == "GET" && target.ends_with("/me/drive") {
                    respond(
                        &mut stream,
                        200,
                        b"{\"id\":\"drive\",\"driveType\":\"personal\"}".to_vec(),
                        "Content-Type: application/json\r\n",
                    );
                } else if method == "POST" && target.ends_with("/root/children") {
                    respond(&mut stream, 201, b"{\"id\":\"folder\"}".to_vec(), "");
                } else if method == "POST" && target.contains("createUploadSession") {
                    s.uploaded.clear();
                    respond(
                        &mut stream,
                        200,
                        format!("{{\"uploadUrl\":\"{server_base}/upload/session\"}}").into_bytes(),
                        "Content-Type: application/json\r\n",
                    );
                } else if method == "PUT" && target == "/upload/session" {
                    if headers.contains_key("content-range") {
                        s.uploaded.extend_from_slice(&body);
                        respond(&mut stream, 202, b"{}".to_vec(), "");
                    } else {
                        respond(&mut stream, 400, b"{}".to_vec(), "");
                    }
                } else if method == "PUT" && target.ends_with("/root:/CyberNote") {
                    let body: serde_json::Value = serde_json::from_slice(&body).unwrap();
                    assert_eq!(body["name"], "notes.bundle");
                    assert_eq!(
                        body["@microsoft.graph.sourceUrl"],
                        format!("{server_base}/upload/session")
                    );
                    let condition = headers
                        .get("if-match")
                        .cloned()
                        .or_else(|| headers.get("if-none-match").cloned());
                    let ok = match condition.as_deref() {
                        Some("*") => s.object.is_none(),
                        Some(e) => e == format!("\"{}\"", s.etag),
                        None => true,
                    };
                    if s.conflict_next_final || !ok {
                        s.conflict_next_final = false;
                        respond(&mut stream, 412, b"{}".to_vec(), "");
                    } else {
                        s.etag += 1;
                        s.object = Some(std::mem::take(&mut s.uploaded));
                        respond(&mut stream, 201, b"{\"id\":\"file\"}".to_vec(), "");
                    }
                } else if method == "GET" && target.contains("root:/CyberNote/notes.bundle") {
                    if let Some(bytes) = &s.object {
                        let json = serde_json::json!({
                            "id": "file",
                            "eTag": format!("\"{}\"", s.etag),
                            "cTag": format!("\"{}\"", s.etag),
                            "size": bytes.len(),
                            "file": {},
                            "@microsoft.graph.downloadUrl": format!("{server_base}/download")
                        });
                        respond(
                            &mut stream,
                            200,
                            serde_json::to_vec(&json).unwrap(),
                            "Content-Type: application/json\r\n",
                        );
                    } else {
                        respond(&mut stream, 404, b"{}".to_vec(), "");
                    }
                } else if method == "GET" && target == "/download" {
                    respond(&mut stream, 200, s.object.clone().unwrap(), "");
                } else {
                    respond(&mut stream, 404, b"{}".to_vec(), "");
                }
            }
        });

        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let oauth = Arc::new(OAuth::new(&root).unwrap());
        let id = uuid::Uuid::new_v4().to_string();
        oauth
            .save(Credential {
                version: 1,
                connection_id: id.clone(),
                provider: Provider::Onedrive,
                issuer: ISSUER.into(),
                driver: "onedrive_pr".into(),
                refresh_token: "refresh".into(),
                access_token: Some("token".into()),
                expires_at: None,
                scope: "Files.ReadWrite.All".into(),
                account_id: "account".into(),
                display_name: "Test".into(),
            })
            .unwrap();
        let remote = Remote::oauth_fixture(
            Provider::Onedrive,
            ProviderConfig::default(),
            &base,
            oauth,
            id,
            "onedrive_pr".into(),
            DriveMode::TwoWay,
            None,
        )
        .unwrap();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            let first = b"first ciphertext".to_vec();
            put(&remote, first.clone(), &Revision::Missing).await.unwrap();
            let object = get(&remote).await.unwrap();
            assert_eq!(object.bytes, first);
            assert_eq!(object.revision, Revision::Etag("\"1\"".into()));
            put(&remote, b"second".to_vec(), &Revision::Etag("\"1\"".into()))
                .await
                .unwrap();
            let conflict = put(
                &remote,
                b"third".to_vec(),
                &Revision::Etag("\"1\"".into()),
            )
            .await
            .unwrap_err();
            assert_eq!(conflict.code, "conflict");
        });
    }
}
