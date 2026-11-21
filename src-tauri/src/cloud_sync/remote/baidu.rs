//! Baidu Netdisk immutable-head adapter. No object is ever overwritten and the
//! service has no usable content CAS; the filename carries writer + seq only
//! as a coordination hint.
use super::*;
use md5::{Digest, Md5};
use reqwest::{
    header::{CONTENT_TYPE, LOCATION},
    multipart, Client, Method, StatusCode,
};
use serde_json::Value;
use std::{collections::HashMap, time::Duration};

const ROOT: &str = "/CyberNote";
const DIR: &str = "/CyberNote/heads";
const BLOCK: usize = 4 * 1024 * 1024;
const SLICE: usize = 256 * 1024;

fn hex(bytes: impl AsRef<[u8]>) -> String {
    bytes.as_ref().iter().map(|b| format!("{b:02x}")).collect()
}

fn api_url(remote: &Remote, segments: &[&str]) -> Result<Url> {
    let mut u = remote.api.clone();
    {
        let mut p = u.path_segments_mut().map_err(|_| error("invalid"))?;
        p.pop_if_empty();
        for s in segments {
            p.push(s);
        }
    }
    Ok(u)
}

fn errno(value: &Value) -> i64 {
    value.get("errno").and_then(Value::as_i64).unwrap_or(0)
}

fn errno_error(code: i64) -> CloudError {
    match code {
        0 => error("state"),
        111 | -6 | 31045 | 20016 | 20017 => error("authentication"),
        -8 | 31061 => error("conflict"),
        -10 => error("limit"),
        _ => error("network"),
    }
}

fn download_client() -> Result<Client> {
    Client::builder()
        // Follow signed download redirects manually so the access token in the
        // query is never sent to a host outside `allowed_download`.
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(90))
        .user_agent("pan.baidu.com")
        .build()
        .map_err(|e| error(if e.is_timeout() { "timeout" } else { "network" }))
}

fn allowed_download(url: &Url) -> bool {
    if url.scheme() == "http" && cfg!(test) && url.host_str() == Some("127.0.0.1") {
        return true;
    }
    if url.scheme() != "https" || url.username() != "" || url.password().is_some() {
        return false;
    }
    let host = url.host_str().unwrap_or("").to_lowercase();
    host == "pan.baidu.com"
        || host == "d.pcs.baidu.com"
        || host.ends_with(".baidu.com")
        || host.ends_with(".baidubce.com")
}

#[derive(Clone, Debug)]
struct Head {
    name: String,
    fs_id: u64,
    size: u64,
    seq: u64,
    writer: String,
}

fn parse_head(name: &str) -> Option<(String, u64)> {
    let body = name.strip_prefix("head-")?.strip_suffix(".enc")?;
    let mut parts = body.rsplitn(3, '-');
    let _rand = parts.next()?;
    let seq = parts.next()?.parse::<u64>().ok()?;
    let writer = parts.next()?.to_string();
    if !crate::sync::model::valid_uuid(&writer) || seq == 0 {
        return None;
    }
    Some((writer, seq))
}

async fn list(remote: &Remote, token: &str) -> Result<Vec<Head>> {
    let mut u = api_url(remote, &["rest", "2.0", "xpan", "file"])?;
    {
        let mut q = u.query_pairs_mut();
        q.append_pair("method", "list")
            .append_pair("dir", DIR)
            .append_pair("web", "web")
            .append_pair("order", "time")
            .append_pair("desc", "1")
            .append_pair("limit", "1000")
            .append_pair("access_token", token);
    }
    let (status, _, value) = remote.bounded_json(Method::GET, u, None).await?;
    if !status.is_success() {
        return Err(error("network"));
    }
    let code = errno(&value);
    if code == -9 {
        return Ok(vec![]);
    }
    if code != 0 {
        return Err(errno_error(code));
    }
    let mut heads = vec![];
    if let Some(items) = value.get("list").and_then(Value::as_array) {
        for item in items {
            let Some(name) = item.get("server_filename").and_then(Value::as_str) else {
                continue;
            };
            if item.get("isdir").and_then(Value::as_i64) == Some(1) {
                continue;
            }
            let Some((writer, seq)) = parse_head(name) else {
                continue;
            };
            let fs_id = item
                .get("fs_id")
                .and_then(Value::as_u64)
                .ok_or_else(|| error("invalid"))?;
            let size = item
                .get("size")
                .and_then(Value::as_u64)
                .ok_or_else(|| error("invalid"))?;
            if size > MAX_REMOTE as u64 {
                return Err(error("limit"));
            }
            heads.push(Head {
                name: name.into(),
                fs_id,
                size,
                seq,
                writer,
            });
        }
    }
    heads.sort_by(|a, b| a.seq.cmp(&b.seq).then(a.name.cmp(&b.name)));
    Ok(heads)
}

/// Return the newest heads for each writer, newest first. A corrupt newest
/// head can fall back to the previous one without hiding a whole writer.
fn recent_per_writer(heads: &[Head], per_writer: usize) -> Vec<Vec<&Head>> {
    let mut groups: HashMap<&str, Vec<&Head>> = HashMap::new();
    for head in heads {
        groups.entry(head.writer.as_str()).or_default().push(head);
    }
    let mut writers = groups.into_iter().collect::<Vec<_>>();
    writers.sort_by(|a, b| a.0.cmp(b.0));
    writers
        .into_iter()
        .map(|(_, mut group)| {
            group.sort_by(|a, b| b.seq.cmp(&a.seq).then(b.name.cmp(&a.name)));
            group.truncate(per_writer.max(1));
            group
        })
        .collect()
}

pub async fn probe(remote: &Remote) -> Result<()> {
    let token = remote.bearer().await?;
    let mut u = api_url(remote, &["rest", "2.0", "xpan", "nas"])?;
    u.query_pairs_mut()
        .append_pair("method", "uinfo")
        .append_pair("access_token", &token);
    let (status, _, value) = remote.bounded_json(Method::GET, u, None).await?;
    if !status.is_success() {
        return Err(error("network"));
    }
    let code = errno(&value);
    if code != 0 {
        return Err(errno_error(code));
    }
    Ok(())
}

async fn download(remote: &Remote, head: &Head, token: &str) -> Result<Vec<u8>> {
    let mut u = api_url(remote, &["rest", "2.0", "xpan", "multimedia"])?;
    {
        let mut q = u.query_pairs_mut();
        q.append_pair("method", "filemetas")
            .append_pair("fsids", &format!("[{}]", head.fs_id))
            .append_pair("dlink", "1")
            .append_pair("access_token", token);
    }
    let (status, _, value) = remote.bounded_json(Method::GET, u, None).await?;
    if !status.is_success() {
        return Err(error("network"));
    }
    let code = errno(&value);
    if code != 0 {
        return Err(errno_error(code));
    }
    let dlink = value
        .pointer("/list/0/dlink")
        .and_then(Value::as_str)
        .ok_or_else(|| error("invalid"))?;
    let url = Url::parse(dlink).map_err(|_| error("invalid"))?;
    if !allowed_download(&url) {
        return Err(error("invalid"));
    }
    let mut url = url;
    // Baidu requires the OAuth token on the signed dlink request. The token is
    // only attached to the initial, validated Baidu URL. Redirect targets are
    // checked before a second request is made.
    url.query_pairs_mut().append_pair("access_token", token);
    let client = download_client()?;
    let mut res = None;
    for _ in 0..=5 {
        if !allowed_download(&url) {
            return Err(error("invalid"));
        }
        let response = client.get(url.clone()).send().await.map_err(network)?;
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get(LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| error("invalid"))?;
            url = url.join(location).map_err(|_| error("invalid"))?;
            continue;
        }
        res = Some(response);
        break;
    }
    let mut res = res.ok_or_else(|| error("network"))?;
    if !allowed_download(res.url()) || !res.status().is_success() {
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
    if bytes.len() as u64 != head.size {
        return Err(error("invalid"));
    }
    Ok(bytes)
}

pub async fn get(remote: &Remote) -> Result<Object> {
    let token = remote.bearer().await?;
    let heads = list(remote, &token).await?;
    let selected = match remote.writer_id.as_deref() {
        Some(writer) => heads
            .iter()
            .filter(|h| h.writer == writer)
            .max_by_key(|h| h.seq)
            .or_else(|| heads.last()),
        None => heads.last(),
    };
    let Some(head) = selected else {
        return Ok(Object {
            bytes: vec![],
            revision: Revision::Missing,
        });
    };
    let bytes = download(remote, head, &token).await?;
    Ok(Object {
        bytes,
        revision: Revision::Head(head.name.clone()),
    })
}

/// Read one independent head per writer. The engine decrypts and merges the
/// returned bundles; this function never overwrites or deletes a head.
pub async fn get_all(remote: &Remote) -> Result<Vec<Object>> {
    let token = remote.bearer().await?;
    let heads = list(remote, &token).await?;
    let budget = MAX_REMOTE.saturating_mul(8);
    let mut total = 0usize;
    let mut objects = Vec::new();
    for candidates in recent_per_writer(&heads, 2) {
        let mut failure = None;
        for head in candidates {
            if total.saturating_add(head.size as usize) > budget {
                return Err(error("limit"));
            }
            match download(remote, head, &token).await {
                Ok(bytes) => {
                    total = total.saturating_add(bytes.len());
                    if total > budget {
                        return Err(error("limit"));
                    }
                    objects.push(Object {
                        bytes,
                        revision: Revision::Head(head.name.clone()),
                    });
                    failure = None;
                    break;
                }
                Err(e) => failure = Some(e),
            }
        }
        if let Some(e) = failure {
            return Err(e);
        }
    }
    Ok(objects)
}

/// Return the previous head for a writer whose newest downloaded head could
/// not be decrypted. Only one fallback is offered: if `get_all` already had to
/// skip a failed download, that older object is terminal and returns `None`.
pub async fn fallback(remote: &Remote, revision: &Revision) -> Result<Option<Object>> {
    let Revision::Head(name) = revision else {
        return Ok(None);
    };
    let Some((writer, seq)) = parse_head(name) else {
        return Ok(None);
    };
    let token = remote.bearer().await?;
    let heads = list(remote, &token).await?;
    let newest = heads
        .iter()
        .filter(|head| head.writer == writer)
        .map(|head| head.seq)
        .max();
    if newest != Some(seq) {
        return Ok(None);
    }
    let Some(previous) = heads
        .iter()
        .filter(|head| head.writer == writer && head.seq < seq && head.name != *name)
        .max_by(|a, b| a.seq.cmp(&b.seq).then(a.name.cmp(&b.name)))
    else {
        return Ok(None);
    };
    let bytes = download(remote, previous, &token).await?;
    Ok(Some(Object {
        bytes,
        revision: Revision::Head(previous.name.clone()),
    }))
}

fn block_hashes(bytes: &[u8]) -> Vec<String> {
    bytes
        .chunks(BLOCK)
        .map(|chunk| {
            let mut digest = Md5::new();
            digest.update(chunk);
            hex(digest.finalize())
        })
        .collect()
}

fn content_hashes(bytes: &[u8]) -> (String, String) {
    let mut whole = Md5::new();
    whole.update(bytes);
    let mut slice = Md5::new();
    slice.update(&bytes[..bytes.len().min(SLICE)]);
    (hex(whole.finalize()), hex(slice.finalize()))
}

async fn form_post(remote: &Remote, url: Url, fields: Vec<(&str, String)>) -> Result<Value> {
    let res = remote
        .client
        .request(Method::POST, url)
        .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
        .form(&fields)
        .send()
        .await
        .map_err(network)?;
    if res.status() == StatusCode::UNAUTHORIZED || res.status() == StatusCode::FORBIDDEN {
        return Err(error("authentication"));
    }
    if !res.status().is_success() {
        return Err(error("network"));
    }
    let bytes = res.bytes().await.map_err(network)?;
    if bytes.len() > 512 * 1024 {
        return Err(error("limit"));
    }
    serde_json::from_slice(&bytes).map_err(|_| error("invalid"))
}

async fn create_dir(remote: &Remote, token: &str, path: &str) -> Result<()> {
    let mut u = api_url(remote, &["rest", "2.0", "xpan", "file"])?;
    {
        let mut q = u.query_pairs_mut();
        q.append_pair("method", "create")
            .append_pair("access_token", token);
    }
    let value = form_post(
        remote,
        u,
        vec![
            ("path", path.to_string()),
            ("size", "0".into()),
            ("isdir", "1".into()),
            ("rtype", "3".into()),
        ],
    )
    .await?;
    let code = errno(&value);
    if code == 0 {
        return Ok(());
    }
    if matches!(code, -8 | 31061) {
        // A create conflict can mean the directory already exists, or that a
        // file occupies the same path. Verify the type before proceeding.
        return if dir_exists(remote, token, path).await? {
            Ok(())
        } else {
            Err(error("conflict"))
        };
    }
    Err(errno_error(code))
}

fn split_path(path: &str) -> Result<(&str, &str)> {
    let trimmed = path.trim_matches('/');
    if trimmed.is_empty() || trimmed.contains(['\r', '\n', '\0']) {
        return Err(error("invalid"));
    }
    let (parent, name) = trimmed.rsplit_once('/').unwrap_or(("", trimmed));
    if name.is_empty() {
        return Err(error("invalid"));
    }
    Ok((if parent.is_empty() { "/" } else { parent }, name))
}

async fn dir_exists(remote: &Remote, token: &str, path: &str) -> Result<bool> {
    let (parent, name) = split_path(path)?;
    let parent = if parent.starts_with('/') {
        parent.to_string()
    } else {
        format!("/{parent}")
    };
    let mut start = 0usize;
    for _ in 0..3 {
        let mut u = api_url(remote, &["rest", "2.0", "xpan", "file"])?;
        {
            let mut q = u.query_pairs_mut();
            q.append_pair("method", "list")
                .append_pair("dir", &parent)
                .append_pair("web", "web")
                .append_pair("order", "name")
                .append_pair("desc", "0")
                .append_pair("start", &start.to_string())
                .append_pair("limit", "1000")
                .append_pair("access_token", token);
        }
        let (status, _, value) = remote.bounded_json(Method::GET, u, None).await?;
        if !status.is_success() {
            return Err(error("network"));
        }
        let code = errno(&value);
        if code == -9 {
            return Ok(false);
        }
        if code != 0 {
            return Err(errno_error(code));
        }
        let list = value
            .get("list")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        for item in &list {
            if item.get("server_filename").and_then(Value::as_str) == Some(name) {
                return Ok(item.get("isdir").and_then(Value::as_i64) == Some(1));
            }
        }
        if list.len() < 1000 {
            return Ok(false);
        }
        start = start.checked_add(1000).ok_or_else(|| error("limit"))?;
    }
    Ok(false)
}

async fn ensure_dirs(remote: &Remote, token: &str) -> Result<()> {
    create_dir(remote, token, ROOT).await?;
    create_dir(remote, token, DIR).await
}

async fn upload_block(
    remote: &Remote,
    token: &str,
    path: &str,
    upload_id: &str,
    part: usize,
    block: Vec<u8>,
) -> Result<()> {
    let base = if cfg!(test) {
        remote.api.clone()
    } else {
        Url::parse("https://d.pcs.baidu.com").map_err(|_| error("invalid"))?
    };
    let mut u = base;
    {
        let mut p = u.path_segments_mut().map_err(|_| error("invalid"))?;
        p.pop_if_empty();
        p.extend(["rest", "2.0", "pcs", "superfile2"]);
    }
    {
        let mut q = u.query_pairs_mut();
        q.append_pair("method", "upload")
            .append_pair("access_token", token)
            .append_pair("type", "tmpfile")
            .append_pair("path", path)
            .append_pair("uploadid", upload_id)
            .append_pair("partseq", &part.to_string());
    }
    let part = multipart::Form::new().part(
        "file",
        multipart::Part::bytes(block)
            .file_name("block")
            .mime_str("application/octet-stream")
            .map_err(|_| error("invalid"))?,
    );
    let res = remote
        .client
        .request(Method::POST, u)
        .multipart(part)
        .send()
        .await
        .map_err(network)?;
    if !res.status().is_success() {
        return Err(error("network"));
    }
    let bytes = res.bytes().await.map_err(network)?;
    if bytes.len() > 512 * 1024 {
        return Err(error("limit"));
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| error("invalid"))?;
    let code = errno(&value);
    if code != 0 {
        return Err(errno_error(code));
    }
    Ok(())
}

pub async fn put(remote: &Remote, bytes: Vec<u8>, _expected: &Revision) -> Result<()> {
    if bytes.is_empty() || bytes.len() > MAX_REMOTE {
        return Err(error("limit"));
    }
    let writer = remote
        .writer_id
        .as_deref()
        .ok_or_else(|| error("permission"))?;
    if !crate::sync::model::valid_uuid(writer) {
        return Err(error("invalid"));
    }
    let token = remote.bearer().await?;
    ensure_dirs(remote, &token).await?;
    let heads = list(remote, &token).await?;
    let seq = heads
        .iter()
        .filter(|h| h.writer == writer)
        .map(|h| h.seq)
        .max()
        .unwrap_or(0)
        .checked_add(1)
        .ok_or_else(|| error("limit"))?;
    let random = uuid::Uuid::new_v4().simple().to_string();
    let name = format!("head-{writer}-{seq:020}-{}.enc", &random[..8]);
    let path = format!("{DIR}/{name}");
    let hashes = block_hashes(&bytes);
    let (content_md5, slice_md5) = content_hashes(&bytes);
    let block_list = serde_json::to_string(&hashes).map_err(|_| error("invalid"))?;
    let mut u = api_url(remote, &["rest", "2.0", "xpan", "file"])?;
    {
        let mut q = u.query_pairs_mut();
        q.append_pair("method", "precreate")
            .append_pair("access_token", &token);
    }
    let pre = form_post(
        remote,
        u,
        vec![
            ("path", path.clone()),
            ("size", bytes.len().to_string()),
            ("isdir", "0".into()),
            ("autoinit", "1".into()),
            ("rtype", "3".into()),
            ("block_list", block_list.clone()),
            ("content-md5", content_md5),
            ("slice-md5", slice_md5),
        ],
    )
    .await?;
    let pre_errno = errno(&pre);
    if pre_errno != 0 {
        return Err(errno_error(pre_errno));
    }
    if pre.get("return_type").and_then(Value::as_i64) == Some(2) {
        // Rapid upload creates the object during precreate and returns no
        // upload id. Verify the exact immutable path before reporting success.
        for _ in 0..5 {
            let after = list(remote, &token).await?;
            if after
                .iter()
                .any(|h| h.name == name && h.size == bytes.len() as u64)
            {
                return Ok(());
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
        return Err(error("state"));
    }
    let upload_id = pre
        .get("uploadid")
        .and_then(Value::as_str)
        .ok_or_else(|| error("invalid"))?;
    let required = pre
        .get("block_list")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(Value::as_u64)
                .filter_map(|n| usize::try_from(n).ok())
                .collect::<Vec<_>>()
        })
        .unwrap_or_else(|| (0..hashes.len()).collect());
    for index in required {
        let start = index
            .checked_mul(BLOCK)
            .ok_or_else(|| error("invalid"))?;
        if start >= bytes.len() {
            return Err(error("invalid"));
        }
        let end = (start + BLOCK).min(bytes.len());
        upload_block(
            remote,
            &token,
            &path,
            upload_id,
            index,
            bytes[start..end].to_vec(),
        )
        .await?;
    }
    let mut u = api_url(remote, &["rest", "2.0", "xpan", "file"])?;
    {
        let mut q = u.query_pairs_mut();
        q.append_pair("method", "create").append_pair("access_token", &token);
    }
    let created = form_post(
        remote,
        u,
        vec![
            ("path", path.clone()),
            ("size", bytes.len().to_string()),
            ("isdir", "0".into()),
            ("rtype", "3".into()),
            ("uploadid", upload_id.into()),
            ("block_list", block_list),
        ],
    )
    .await?;
    let created_errno = errno(&created);
    if created_errno != 0 {
        return Err(errno_error(created_errno));
    }
    for _ in 0..5 {
        let after = list(remote, &token).await?;
        if after
            .iter()
            .any(|h| h.name == name && h.size == bytes.len() as u64)
        {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    Err(error("state"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cloud_sync::{
        auth::{oauth::OAuth, vault::Credential, ISSUER},
        crypto, engine,
        model::Bundle,
        protocol::Remote,
    };
    use serde_json::json;
    use std::{
        collections::BTreeMap,
        io::{Read, Write},
        net::{TcpListener, TcpStream},
        sync::{Arc, Mutex},
        thread,
    };

    #[derive(Clone)]
    struct Request {
        method: String,
        target: String,
        headers: BTreeMap<String, String>,
        body: Vec<u8>,
    }

    struct State {
        heads: Vec<(String, u64, u64)>,
        requests: Vec<Request>,
    }

    fn read_request(stream: &mut TcpStream) -> Request {
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
        let mut words = first.split_whitespace();
        Request {
            method: words.next().unwrap_or("").into(),
            target: words.next().unwrap_or("").into(),
            headers,
            body: data[split + 4..split + 4 + len].to_vec(),
        }
    }

    fn respond(stream: &mut TcpStream, status: u16, body: Vec<u8>) {
        let head = format!(
            "HTTP/1.1 {status} Fixture\r\nContent-Length: {}\r\nConnection: close\r\nContent-Type: application/json\r\n\r\n",
            body.len()
        );
        stream.write_all(head.as_bytes()).unwrap();
        stream.write_all(&body).unwrap();
    }

    fn query(target: &str) -> BTreeMap<String, String> {
        Url::parse(&format!("http://fixture{target}"))
            .unwrap()
            .query_pairs()
            .into_owned()
            .collect()
    }

    fn form(body: &[u8]) -> BTreeMap<String, String> {
        url::form_urlencoded::parse(body).into_owned().collect()
    }

    #[test]
    fn parses_only_valid_heads() {
        let writer = uuid::Uuid::new_v4().to_string();
        assert_eq!(
            parse_head(&format!("head-{writer}-00000000000000000007-abcd1234.enc")),
            Some((writer.clone(), 7))
        );
        assert!(parse_head("head-not-a-uuid-1-abcd.enc").is_none());
        assert!(parse_head("snapshot.enc").is_none());
    }

    #[test]
    fn newest_heads_are_grouped_per_writer() {
        let a = uuid::Uuid::new_v4().to_string();
        let b = uuid::Uuid::new_v4().to_string();
        let head = |writer: &str, seq: u64, suffix: &str| Head {
            name: format!("head-{writer}-{seq:020}-{suffix}.enc"),
            fs_id: seq,
            size: 1,
            seq,
            writer: writer.into(),
        };
        let heads = vec![
            head(&a, 1, "aaaa"),
            head(&b, 1, "bbbb"),
            head(&a, 3, "cccc"),
            head(&a, 2, "dddd"),
        ];
        let groups = recent_per_writer(&heads, 2);
        assert_eq!(groups.len(), 2);
        let group_a = groups
            .iter()
            .find(|group| group.first().is_some_and(|head| head.writer == a))
            .expect("writer a group");
        assert_eq!(group_a[0].seq, 3);
        assert_eq!(group_a[1].seq, 2);
        let group_b = groups
            .iter()
            .find(|group| group.first().is_some_and(|head| head.writer == b))
            .expect("writer b group");
        assert_eq!(group_b[0].seq, 1);
    }

    #[test]
    fn block_hashes_cover_last_partial_block() {
        let bytes = vec![7; BLOCK + 3];
        let hashes = block_hashes(&bytes);
        assert_eq!(hashes.len(), 2);
        let mut d = Md5::new();
        d.update(&bytes[..BLOCK]);
        assert_eq!(hashes[0], hex(d.finalize()));
    }

    #[test]
    fn errno_111_requires_reauthentication() {
        assert_eq!(errno_error(111).code, "authentication");
        assert_eq!(errno_error(20016).code, "authentication");
        assert_eq!(errno_error(31061).code, "conflict");
    }

    #[test]
    fn creates_dirs_uploads_and_downloads_with_token() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let state = Arc::new(Mutex::new(State {
            heads: vec![],
            requests: vec![],
        }));
        let s = state.clone();
        let server_base = base.clone();
        let _worker = thread::spawn(move || {
            for stream in listener.incoming() {
                let mut stream = stream.unwrap();
                let req = read_request(&mut stream);
                s.lock().unwrap().requests.push(req.clone());
                let q = query(&req.target);
                if req.method == "POST" && q.get("method").map(String::as_str) == Some("create") {
                    let f = form(&req.body);
                    let path = f.get("path").cloned().unwrap_or_default();
                    if f.get("isdir").map(String::as_str) == Some("1") {
                        respond(&mut stream, 200, br#"{"errno":-8}"#.to_vec());
                    } else {
                        let name = path.rsplit('/').next().unwrap_or("").to_string();
                        let size = f
                            .get("size")
                            .and_then(|v| v.parse::<u64>().ok())
                            .unwrap_or(0);
                        s.lock()
                            .unwrap()
                            .heads
                            .push((name, 42, size));
                        respond(
                            &mut stream,
                            200,
                            serde_json::to_vec(&json!({
                                "errno": 0, "path": path, "fs_id": 42, "size": size
                            }))
                            .unwrap(),
                        );
                    }
                } else if req.method == "GET"
                    && q.get("method").map(String::as_str) == Some("list")
                {
                    let dir = q.get("dir").map(String::as_str).unwrap_or("");
                    let list = match dir {
                        "/" => vec![json!({"server_filename":"CyberNote","isdir":1,"fs_id":1,"size":0})],
                        "/CyberNote" => vec![json!({"server_filename":"heads","isdir":1,"fs_id":2,"size":0})],
                        _ => s
                            .lock()
                            .unwrap()
                            .heads
                            .iter()
                            .map(|(name, fs_id, size)| {
                                json!({
                                    "server_filename": name,
                                    "fs_id": fs_id,
                                    "size": size,
                                    "isdir": 0
                                })
                            })
                            .collect(),
                    };
                    respond(
                        &mut stream,
                        200,
                        serde_json::to_vec(&json!({"errno": 0, "list": list})).unwrap(),
                    );
                } else if req.method == "POST"
                    && q.get("method").map(String::as_str) == Some("precreate")
                {
                    respond(
                        &mut stream,
                        200,
                        br#"{"errno":0,"uploadid":"upload-1","block_list":[0],"return_type":1}"#
                            .to_vec(),
                    );
                } else if req.method == "POST" && req.target.contains("/pcs/superfile2") {
                    respond(&mut stream, 200, br#"{"errno":0}"#.to_vec());
                } else if req.method == "GET"
                    && q.get("method").map(String::as_str) == Some("filemetas")
                {
                    respond(
                        &mut stream,
                        200,
                        serde_json::to_vec(&json!({
                            "errno": 0,
                            "list": [{"dlink": format!("{server_base}/download")}]
                        }))
                        .unwrap(),
                    );
                } else if req.method == "GET"
                    && req.target.split('?').next() == Some("/download")
                {
                    respond(&mut stream, 200, b"ciphertext".to_vec());
                } else {
                    respond(&mut stream, 404, b"{}".to_vec());
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
                provider: Provider::Baidu,
                issuer: ISSUER.into(),
                driver: "baiduyun_go".into(),
                refresh_token: "refresh".into(),
                access_token: Some("token".into()),
                expires_at: None,
                scope: "basic,netdisk".into(),
                account_id: "account".into(),
                display_name: "Test".into(),
            })
            .unwrap();
        let writer = uuid::Uuid::new_v4().to_string();
        let remote = Remote::oauth_fixture(
            Provider::Baidu,
            ProviderConfig::default(),
            &base,
            oauth,
            id,
            "baiduyun_go".into(),
            DriveMode::SingleWriter,
            Some(writer.clone()),
        )
        .unwrap();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            put(&remote, b"ciphertext".to_vec(), &Revision::Missing)
                .await
                .unwrap();
            let object = get(&remote).await.unwrap();
            assert_eq!(object.bytes, b"ciphertext");
        });

        let requests = state.lock().unwrap().requests.clone();
        let creates = requests
            .iter()
            .filter(|r| r.method == "POST" && query(&r.target).get("method").map(String::as_str) == Some("create"))
            .collect::<Vec<_>>();
        assert!(creates.iter().any(|r| form(&r.body).get("path").map(String::as_str) == Some("/CyberNote")));
        assert!(creates.iter().any(|r| form(&r.body).get("path").map(String::as_str) == Some("/CyberNote/heads")));
        assert!(creates
            .iter()
            .filter(|r| form(&r.body).get("isdir").map(String::as_str) == Some("1"))
            .all(|r| form(&r.body).get("rtype").map(String::as_str) == Some("3")));
        let precreate = requests
            .iter()
            .find(|r| r.method == "POST" && query(&r.target).get("method").map(String::as_str) == Some("precreate"))
            .unwrap();
        let precreate_form = form(&precreate.body);
        assert_eq!(precreate_form.get("rtype").map(String::as_str), Some("3"));
        assert_eq!(
            precreate_form.get("content-md5").map(String::as_str),
            Some("cb54616748fddc2fb607b9eb4312ee3d")
        );
        let upload = requests
            .iter()
            .find(|r| r.method == "POST" && r.target.contains("/pcs/superfile2"))
            .unwrap();
        assert_eq!(query(&upload.target).get("access_token").map(String::as_str), Some("token"));
        assert_eq!(upload.headers.get("user-agent").map(String::as_str), Some("pan.baidu.com"));
        let download = requests
            .iter()
            .find(|r| r.method == "GET" && r.target.starts_with("/download"))
            .unwrap();
        assert_eq!(query(&download.target).get("access_token").map(String::as_str), Some("token"));
        assert_eq!(download.headers.get("user-agent").map(String::as_str), Some("pan.baidu.com"));
        assert!(requests.iter().any(|r| {
            r.method == "POST"
                && query(&r.target).get("method").map(String::as_str) == Some("create")
                && form(&r.body)
                    .get("path")
                    .is_some_and(|p| p.starts_with(&format!("/CyberNote/heads/head-{writer}-")))
        }));
    }

    #[test]
    fn get_all_reads_only_the_newest_head_per_writer() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let writer_a = uuid::Uuid::new_v4().to_string();
        let writer_b = uuid::Uuid::new_v4().to_string();
        let old_a = format!("head-{writer_a}-00000000000000000001-aaaa1111.enc");
        let new_a = format!("head-{writer_a}-00000000000000000002-bbbb2222.enc");
        let new_b = format!("head-{writer_b}-00000000000000000001-cccc3333.enc");
        let server_base = base.clone();
        let names = [old_a.clone(), new_a.clone(), new_b.clone()];
        let _worker = thread::spawn(move || {
            for _ in 0..5 {
                let (mut stream, _) = listener.accept().unwrap();
                let req = read_request(&mut stream);
                let q = query(&req.target);
                if q.get("method").map(String::as_str) == Some("list") {
                    let list = names
                        .iter()
                        .enumerate()
                        .map(|(i, name)| {
                            json!({
                                "server_filename": name,
                                "fs_id": i + 1,
                                "size": 2,
                                "isdir": 0
                            })
                        })
                        .collect::<Vec<_>>();
                    respond(
                        &mut stream,
                        200,
                        serde_json::to_vec(&json!({"errno": 0, "list": list})).unwrap(),
                    );
                } else if q.get("method").map(String::as_str) == Some("filemetas") {
                    let fs_id = q
                        .get("fsids")
                        .and_then(|v| v.trim_matches(|c| c == '[' || c == ']').parse::<u64>().ok())
                        .unwrap();
                    respond(
                        &mut stream,
                        200,
                        serde_json::to_vec(&json!({
                            "errno": 0,
                            "list": [{"dlink": format!("{server_base}/download/{fs_id}")}]
                        }))
                        .unwrap(),
                    );
                } else if let Some(fs_id) = req
                    .target
                    .split('?')
                    .next()
                    .and_then(|path| path.strip_prefix("/download/"))
                    .and_then(|v| v.parse::<u64>().ok())
                {
                    let body = if fs_id == 2 { b"a2" } else { b"b1" };
                    respond(&mut stream, 200, body.to_vec());
                } else {
                    panic!("unexpected request {}", req.target);
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
                provider: Provider::Baidu,
                issuer: ISSUER.into(),
                driver: "baiduyun_go".into(),
                refresh_token: "refresh".into(),
                access_token: Some("token".into()),
                expires_at: None,
                scope: "basic,netdisk".into(),
                account_id: "account".into(),
                display_name: "Test".into(),
            })
            .unwrap();
        let remote = Remote::oauth_fixture(
            Provider::Baidu,
            ProviderConfig::default(),
            &base,
            oauth,
            id,
            "baiduyun_go".into(),
            DriveMode::TwoWay,
            Some(writer_a.clone()),
        )
        .unwrap();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            let objects = get_all(&remote).await.unwrap();
            assert_eq!(objects.len(), 2);
            assert!(objects
                .iter()
                .any(|o| o.revision == Revision::Head(new_a.clone())));
            assert!(objects
                .iter()
                .any(|o| o.revision == Revision::Head(new_b.clone())));
            assert!(!objects
                .iter()
                .any(|o| o.revision == Revision::Head(old_a.clone())));
        });
    }

    #[test]
    fn read_falls_back_when_the_newest_head_does_not_decrypt() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let writer = uuid::Uuid::new_v4().to_string();
        let old_name = format!("head-{writer}-00000000000000000001-aaaa1111.enc");
        let new_name = format!("head-{writer}-00000000000000000002-bbbb2222.enc");
        let workspace = uuid::Uuid::new_v4().to_string();
        let password = "fixture-password";
        let old_bytes = crypto::encrypt(&Bundle::empty(workspace.clone()), password).unwrap();
        let new_bytes = b"not a CyberNote envelope".to_vec();
        let server_base = base.clone();
        let old_size = old_bytes.len();
        let new_size = new_bytes.len();
        let old_body = old_bytes.clone();
        let new_body = new_bytes.clone();
        let listed_old = old_name.clone();
        let listed_new = new_name.clone();
        let _worker = thread::spawn(move || {
            for _ in 0..6 {
                let (mut stream, _) = listener.accept().unwrap();
                let req = read_request(&mut stream);
                let q = query(&req.target);
                if q.get("method").map(String::as_str) == Some("list") {
                    respond(
                        &mut stream,
                        200,
                        serde_json::to_vec(&json!({
                            "errno": 0,
                            "list": [
                                {"server_filename": listed_old, "fs_id": 1, "size": old_size, "isdir": 0},
                                {"server_filename": listed_new, "fs_id": 2, "size": new_size, "isdir": 0}
                            ]
                        }))
                        .unwrap(),
                    );
                } else if q.get("method").map(String::as_str) == Some("filemetas") {
                    let fs_id = q
                        .get("fsids")
                        .and_then(|v| v.trim_matches(|c| c == '[' || c == ']').parse::<u64>().ok())
                        .unwrap();
                    respond(
                        &mut stream,
                        200,
                        serde_json::to_vec(&json!({
                            "errno": 0,
                            "list": [{"dlink": format!("{server_base}/download/{fs_id}")}]
                        }))
                        .unwrap(),
                    );
                } else if req.target.starts_with("/download/1") {
                    respond(&mut stream, 200, old_body.clone());
                } else if req.target.starts_with("/download/2") {
                    respond(&mut stream, 200, new_body.clone());
                } else {
                    panic!("unexpected request {}", req.target);
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
                provider: Provider::Baidu,
                issuer: ISSUER.into(),
                driver: "baiduyun_go".into(),
                refresh_token: "refresh".into(),
                access_token: Some("token".into()),
                expires_at: None,
                scope: "basic,netdisk".into(),
                account_id: "account".into(),
                display_name: "Test".into(),
            })
            .unwrap();
        let remote = Remote::oauth_fixture(
            Provider::Baidu,
            ProviderConfig::default(),
            &base,
            oauth,
            id,
            "baiduyun_go".into(),
            DriveMode::TwoWay,
            Some(writer),
        )
        .unwrap();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            let (bundle, revision, size) = engine::read(&remote, password).await.unwrap();
            assert_eq!(revision, Revision::Head(old_name));
            assert_eq!(bundle.unwrap().workspace_id, workspace);
            assert_eq!(size, old_bytes.len() + new_bytes.len());
        });
    }

    #[test]
    fn download_rejects_a_foreign_redirect_without_following_it() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let server_base = base.clone();
        let worker = thread::spawn(move || {
            for _ in 0..3 {
                let (mut stream, _) = listener.accept().unwrap();
                let req = read_request(&mut stream);
                let q = query(&req.target);
                if q.get("method").map(String::as_str) == Some("list") {
                    respond(
                        &mut stream,
                        200,
                        serde_json::to_vec(&json!({
                            "errno": 0,
                            "list": [{
                                "server_filename": format!(
                                    "head-{}-00000000000000000001-abcd1234.enc",
                                    uuid::Uuid::new_v4()
                                ),
                                "fs_id": 7,
                                "size": 1,
                                "isdir": 0
                            }]
                        }))
                        .unwrap(),
                    );
                } else if q.get("method").map(String::as_str) == Some("filemetas") {
                    respond(
                        &mut stream,
                        200,
                        serde_json::to_vec(&json!({
                            "errno": 0,
                            "list": [{"dlink": format!("{server_base}/redirect")}]
                        }))
                        .unwrap(),
                    );
                } else if req.target.starts_with("/redirect") {
                    let head = "HTTP/1.1 302 Found\r\nLocation: https://evil.example/steal\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                    stream.write_all(head.as_bytes()).unwrap();
                } else {
                    panic!("unexpected request {}", req.target);
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
                provider: Provider::Baidu,
                issuer: ISSUER.into(),
                driver: "baiduyun_go".into(),
                refresh_token: "refresh".into(),
                access_token: Some("token".into()),
                expires_at: None,
                scope: "basic,netdisk".into(),
                account_id: "account".into(),
                display_name: "Test".into(),
            })
            .unwrap();
        let remote = Remote::oauth_fixture(
            Provider::Baidu,
            ProviderConfig::default(),
            &base,
            oauth,
            id,
            "baiduyun_go".into(),
            DriveMode::ReadOnly,
            None,
        )
        .unwrap();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            let error = match get(&remote).await {
                Ok(_) => panic!("foreign redirect must not produce an object"),
                Err(error) => error,
            };
            assert_eq!(error.code, "invalid");
        });
        worker.join().unwrap();
    }
}
