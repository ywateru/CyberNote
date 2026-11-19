//! Local HTTP only. No environment credentials, user directories or external service access.
use crate::cloud_sync::{model::*, protocol::git_blob_sha};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::json;
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};
#[derive(Clone)]
pub struct Request {
    pub method: String,
    pub target: String,
    pub headers: BTreeMap<String, String>,
    pub body: Vec<u8>,
}
pub struct State {
    pub object: Option<Vec<u8>>,
    pub revision: u64,
    pub requests: Vec<Request>,
    pub fail: Option<u16>,
    pub conflict: bool,
    pub weak: bool,
    pub malformed: bool,
    pub public_repo: bool,
    pub delay_ms: u64,
    pub oversized: bool,
}
pub struct Fixture {
    pub url: String,
    pub state: Arc<Mutex<State>>,
    stop: Arc<AtomicBool>,
    worker: Option<thread::JoinHandle<()>>,
}
impl Fixture {
    pub fn new(kind: Provider) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let state = Arc::new(Mutex::new(State {
            object: None,
            revision: 0,
            requests: vec![],
            fail: None,
            conflict: false,
            weak: false,
            malformed: false,
            public_repo: false,
            delay_ms: 0,
            oversized: false,
        }));
        let stop = Arc::new(AtomicBool::new(false));
        let s = state.clone();
        let stopped = stop.clone();
        let worker = thread::spawn(move || {
            while !stopped.load(Ordering::SeqCst) {
                match listener.accept() {
                    Ok((stream, _)) => serve(stream, kind, &s),
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(2))
                    }
                    Err(e) => panic!("fixture accept: {e}"),
                }
            }
        });
        Self {
            url,
            state,
            stop,
            worker: Some(worker),
        }
    }
    pub fn config(&self, kind: Provider) -> ProviderConfig {
        let mut c = ProviderConfig::default();
        c.fields.insert("endpoint".into(), self.url.clone());
        match kind {
            Provider::Webdav => {
                c.fields.insert("directory".into(), "one/two".into());
                c.fields.insert("username".into(), "fixture-user".into());
                c.secrets
                    .insert("password".into(), "fixture-webdav-password".into());
            }
            Provider::S3 => {
                c.fields.insert("bucket".into(), "fixture-bucket".into());
                c.fields.insert("region".into(), "us-east-1".into());
                c.fields.insert("prefix".into(), "空 格/plus+".into());
                c.secrets
                    .insert("accessKey".into(), "fixture-access".into());
                c.secrets
                    .insert("secretKey".into(), "fixture-secret".into());
                c.secrets
                    .insert("sessionToken".into(), "fixture-session-token".into());
            }
            Provider::Github => {
                c.fields.remove("endpoint");
                c.fields.insert("owner".into(), "fixture-owner".into());
                c.fields.insert("repo".into(), "fixture-repo".into());
                c.fields.insert("branch".into(), "feature/branch".into());
                c.secrets
                    .insert("token".into(), "fixture-github-token".into());
            }
        }
        c
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        let result = self.worker.take().unwrap().join();
        if !thread::panicking() {
            result.unwrap();
        }
    }
}
fn serve(mut stream: TcpStream, kind: Provider, state: &Arc<Mutex<State>>) {
    stream.set_nonblocking(false).unwrap();
    stream
        .set_read_timeout(Some(Duration::from_secs(3)))
        .unwrap();
    stream
        .set_write_timeout(Some(Duration::from_secs(3)))
        .unwrap();
    let mut data = vec![];
    let mut buf = [0; 8192];
    let split = loop {
        let n = stream.read(&mut buf).unwrap();
        if n == 0 {
            return;
        }
        data.extend_from_slice(&buf[..n]);
        if let Some(i) = data.windows(4).position(|b| b == b"\r\n\r\n") {
            break i;
        }
        assert!(data.len() < 65536);
    };
    let head = String::from_utf8(data[..split].to_vec()).unwrap();
    let mut lines = head.split("\r\n");
    let first = lines.next().unwrap().split_whitespace().collect::<Vec<_>>();
    let mut headers = BTreeMap::new();
    for l in lines {
        let (k, v) = l.split_once(':').unwrap();
        headers.insert(k.to_ascii_lowercase(), v.trim().into());
    }
    let len = headers
        .get("content-length")
        .map(|v: &String| v.parse::<usize>().unwrap())
        .unwrap_or(0);
    assert!(len < 100 * 1024 * 1024);
    while data.len() - split - 4 < len {
        let n = stream.read(&mut buf).unwrap();
        if n == 0 {
            return;
        }
        data.extend_from_slice(&buf[..n]);
    }
    let req = Request {
        method: first[0].into(),
        target: first[1].into(),
        headers,
        body: data[split + 4..split + 4 + len].to_vec(),
    };
    let delay = state.lock().unwrap().delay_ms;
    if delay > 0 {
        thread::sleep(Duration::from_millis(delay));
    }
    let mut s = state.lock().unwrap();
    s.requests.push(req.clone());
    let mut status = 200;
    let mut extra = String::new();
    let mut out = vec![];
    if let Some(code) = s.fail {
        status = code;
        out = b"fixture failure".to_vec();
    } else if s.malformed {
        out = b"<html>log in</html>".to_vec();
    } else if req.method == "PROPFIND" {
        status = 207;
        out = b"<d:multistatus xmlns:d='DAV:'/>".to_vec();
    } else if req.method == "MKCOL" {
        status = 201;
    } else if kind == Provider::S3 && req.target.contains("list-type=") {
        out = b"<ListBucketResult/>".to_vec();
    } else if kind == Provider::Github && !req.target.contains("/contents/") {
        out = if req.target.contains("/branches/") {
            b"{}".to_vec()
        } else {
            serde_json::to_vec(&json!({"private":!s.public_repo})).unwrap()
        };
    } else if req.method == "GET" {
        if let Some(bytes) = &s.object {
            if kind == Provider::Github {
                if req.headers.get("accept").is_some_and(|h| h.contains("raw")) {
                    out = bytes.clone();
                } else {
                    let large = bytes.len() > GITHUB_INLINE;
                    out=serde_json::to_vec(&json!({"type":"file","sha":git_blob_sha(bytes),"size":bytes.len(),"encoding":if large{"none"}else{"base64"},"content":if large{String::new()}else{B64.encode(bytes)}})).unwrap();
                }
            } else {
                out = bytes.clone();
                extra = format!(
                    "ETag: {}\r\n",
                    if s.weak {
                        format!("W/\"{}\"", s.revision)
                    } else {
                        format!("\"{}\"", s.revision)
                    }
                );
            }
        } else {
            status = 404;
            out = if kind == Provider::S3 {
                b"<Error><Code>NoSuchKey</Code></Error>".to_vec()
            } else {
                b"{}".to_vec()
            };
        }
    } else if req.method == "PUT" {
        let (payload, condition) = if kind == Provider::Github {
            let v: serde_json::Value = serde_json::from_slice(&req.body).unwrap();
            (
                B64.decode(v["content"].as_str().unwrap()).unwrap(),
                match &s.object {
                    Some(b) => v["sha"].as_str() == Some(&git_blob_sha(b)),
                    None => v.get("sha").is_none(),
                },
            )
        } else {
            (
                req.body.clone(),
                match &s.object {
                    Some(_) => req.headers.get("if-match") == Some(&format!("\"{}\"", s.revision)),
                    None => req.headers.get("if-none-match").is_some_and(|s| s == "*"),
                },
            )
        };
        if s.conflict || !condition {
            status = if kind == Provider::Github { 409 } else { 412 };
        } else {
            s.revision += 1;
            s.object = Some(payload);
            status = 201;
            if kind == Provider::Github {
                out = serde_json::to_vec(
                    &json!({"content":{"sha":git_blob_sha(s.object.as_ref().unwrap())}}),
                )
                .unwrap();
            }
        }
    } else {
        panic!("unexpected fixture request");
    }
    let oversized = s.oversized;
    drop(s);
    let head = format!(
        "HTTP/1.1 {status} Fixture\r\nContent-Length: {}\r\nConnection: close\r\n{extra}\r\n",
        if oversized { MAX_REMOTE + 1 } else { out.len() }
    );
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(&out);
}
