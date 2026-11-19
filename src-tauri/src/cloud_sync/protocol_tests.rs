use super::fixture::Fixture;
use crate::cloud_sync::{model::*, protocol::*};
use reqwest::{header::HeaderMap, Method, Url};
#[tokio::test]
async fn real_protocol_roundtrips_and_cas_refusals() {
    for kind in [Provider::Webdav, Provider::S3, Provider::Github] {
        let f = Fixture::new(kind);
        let r = Remote::fixture(kind, f.config(kind), &f.url).unwrap();
        assert_eq!(r.get().await.unwrap().revision, Revision::Missing);
        assert!(f
            .state
            .lock()
            .unwrap()
            .requests
            .iter()
            .all(|r| r.method != "PUT" && r.method != "MKCOL"));
        r.put(b"encrypted fixture".to_vec(), &Revision::Missing)
            .await
            .unwrap();
        let got = r.get().await.unwrap();
        assert_eq!(got.bytes, b"encrypted fixture");
        assert_eq!(
            r.put(b"new".to_vec(), &Revision::Missing)
                .await
                .err()
                .unwrap()
                .code,
            "conflict"
        );
        r.put(b"new".to_vec(), &got.revision).await.unwrap();
        assert_eq!(
            r.put(b"lost".to_vec(), &got.revision)
                .await
                .err()
                .unwrap()
                .code,
            "conflict"
        );
        assert_eq!(f.state.lock().unwrap().object.as_deref(), Some(&b"new"[..]));
        let s = f.state.lock().unwrap();
        if kind == Provider::Webdav {
            assert_eq!(
                s.requests.iter().filter(|r| r.method == "MKCOL").count(),
                12
            );
            assert!(s
                .requests
                .iter()
                .any(|r| r.target == "/one/two/cybernote/snapshot-v1.enc"));
        }
        if kind == Provider::S3 {
            for r in &s.requests {
                assert!(r.headers["authorization"]
                    .starts_with("AWS4-HMAC-SHA256 Credential=fixture-access/"));
                assert_eq!(r.headers["x-amz-security-token"], "fixture-session-token");
            }
            assert!(s
                .requests
                .iter()
                .any(|r| r.target.contains("%E7%A9%BA%20%E6%A0%BC/plus%2B")));
        }
        if kind == Provider::Github {
            assert!(s
                .requests
                .iter()
                .any(|r| r.target.contains("ref=feature%2Fbranch")));
            assert!(s
                .requests
                .iter()
                .all(|r| r.headers["authorization"] == "Bearer fixture-github-token"));
        }
    }
}
#[tokio::test]
async fn github_large_files_use_raw_same_origin_and_verify_sha() {
    let f = Fixture::new(Provider::Github);
    let r = Remote::fixture(Provider::Github, f.config(Provider::Github), &f.url).unwrap();
    let bytes = vec![42; GITHUB_INLINE + 123];
    r.put(bytes.clone(), &Revision::Missing).await.unwrap();
    let o = r.get().await.unwrap();
    assert_eq!(o.bytes, bytes);
    assert!(f.state.lock().unwrap().requests.iter().any(|r| r
        .headers
        .get("accept")
        .is_some_and(|s| s == "application/vnd.github.raw+json")));
}
#[tokio::test]
async fn status_and_parse_errors_never_become_missing() {
    for kind in [Provider::Webdav, Provider::S3, Provider::Github] {
        let f = Fixture::new(kind);
        let r = Remote::fixture(kind, f.config(kind), &f.url).unwrap();
        for status in [401, 403, 404, 500] {
            f.state.lock().unwrap().fail = Some(status);
            let e = r.get().await.err().unwrap();
            assert_ne!(e.code, "missing");
            if status == 401 || status == 403 {
                assert_eq!(e.code, "authentication");
            }
        }
        f.state.lock().unwrap().fail = None;
        f.state.lock().unwrap().malformed = true;
        assert_eq!(r.get().await.err().unwrap().code, "invalid");
        assert!(f
            .state
            .lock()
            .unwrap()
            .requests
            .iter()
            .all(|r| r.method == "GET" || r.method == "PROPFIND"));
    }
    let f = Fixture::new(Provider::Webdav);
    let r = Remote::fixture(Provider::Webdav, f.config(Provider::Webdav), &f.url).unwrap();
    f.state.lock().unwrap().object = Some(vec![1]);
    f.state.lock().unwrap().weak = true;
    assert_eq!(r.get().await.err().unwrap().code, "precondition");
    let f = Fixture::new(Provider::Github);
    let r = Remote::fixture(Provider::Github, f.config(Provider::Github), &f.url).unwrap();
    f.state.lock().unwrap().public_repo = true;
    assert_eq!(r.get().await.err().unwrap().code, "private_repository");
}
#[test]
fn aws_documentation_sigv4_vector() {
    let mut c = ProviderConfig::default();
    c.fields.insert("region".into(), "us-east-1".into());
    c.secrets
        .insert("accessKey".into(), "AKIAIOSFODNN7EXAMPLE".into());
    c.secrets.insert(
        "secretKey".into(),
        "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY".into(),
    );
    let mut h = HeaderMap::new();
    sign_s3(
        &Method::GET,
        &Url::parse("https://examplebucket.s3.amazonaws.com/?lifecycle").unwrap(),
        &[],
        &c,
        "20130524T000000Z",
        &mut h,
    )
    .unwrap();
    assert!(h["authorization"]
        .to_str()
        .unwrap()
        .ends_with("Signature=fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543"));
}
#[tokio::test]
async fn oversized_responses_and_uploads_fail_before_overwrite() {
    let f = Fixture::new(Provider::Webdav);
    let r = Remote::fixture(Provider::Webdav, f.config(Provider::Webdav), &f.url).unwrap();
    f.state.lock().unwrap().oversized = true;
    assert_eq!(r.get().await.err().unwrap().code, "limit");
    let requests = f.state.lock().unwrap().requests.len();
    assert_eq!(
        r.put(vec![0; MAX_REMOTE + 1], &Revision::Missing)
            .await
            .err()
            .unwrap()
            .code,
        "limit"
    );
    assert_eq!(f.state.lock().unwrap().requests.len(), requests);
    assert!(f.state.lock().unwrap().object.is_none());
}
