//! Unix fixture tests only. No application Session, Store, database, or user credential.
use notes_mcp::{
    ipc, schema,
    security::{Access, Config},
};
use serde_json::json;
use std::{
    fs,
    os::unix::fs::{PermissionsExt, symlink},
    path::PathBuf,
};
use tempfile::TempDir;
use tokio::{io::AsyncWriteExt, net::UnixListener};
use uuid::Uuid;

struct Fixture {
    _dir: TempDir,
    c: Config,
    path: PathBuf,
    credential: PathBuf,
    _listener: UnixListener,
}
impl Fixture {
    fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let runtime = dir.path().canonicalize().unwrap();
        fs::set_permissions(&runtime, fs::Permissions::from_mode(0o700)).unwrap();
        fs::create_dir(runtime.join("credentials")).unwrap();
        fs::set_permissions(
            runtime.join("credentials"),
            fs::Permissions::from_mode(0o700),
        )
        .unwrap();
        let path = runtime.join("host.sock");
        let listener = UnixListener::bind(&path).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
        let c = Config {
            workspace_id: "fixture-workspace".into(),
            credential_ref: Uuid::new_v4(),
            runtime_dir: runtime,
        };
        let credential = c
            .runtime_dir
            .join(format!("credentials/{}.json", c.credential_ref));
        fs::write(&credential,json!({"version":1,"workspaceId":c.workspace_id,"clientId":"fixture-client","credential":"synthetic-transport-only-token","socketPath":path}).to_string()).unwrap();
        fs::set_permissions(&credential, fs::Permissions::from_mode(0o600)).unwrap();
        Self {
            _dir: dir,
            c,
            path,
            credential,
            _listener: listener,
        }
    }
}
#[tokio::test]
async fn rejects_modes_symlinks_hardlinks_workspace_unknown_fields_and_inode_replacement() {
    let f = Fixture::new();
    assert!(Access::load(&f.c).is_ok());
    for path in [
        &f.c.runtime_dir,
        &f.c.runtime_dir.join("credentials"),
        &f.credential,
        &f.path,
    ] {
        let old = fs::metadata(path).unwrap().permissions();
        fs::set_permissions(path, fs::Permissions::from_mode(0o777)).unwrap();
        assert!(Access::load(&f.c).is_err());
        fs::set_permissions(path, old).unwrap();
    }
    let mut c = f.c.clone();
    c.workspace_id = "other".into();
    assert!(Access::load(&c).is_err());
    let saved = f.credential.with_extension("saved");
    fs::rename(&f.credential, &saved).unwrap();
    symlink(&saved, &f.credential).unwrap();
    assert!(Access::load(&f.c).is_err());
    fs::remove_file(&f.credential).unwrap();
    fs::rename(&saved, &f.credential).unwrap();
    fs::hard_link(&f.credential, &saved).unwrap();
    assert!(Access::load(&f.c).is_err());
    fs::remove_file(&saved).unwrap();
    let mut record: serde_json::Value =
        serde_json::from_slice(&fs::read(&f.credential).unwrap()).unwrap();
    record["extra"] = json!(1);
    fs::write(&f.credential, record.to_string()).unwrap();
    assert!(Access::load(&f.c).is_err());
    record.as_object_mut().unwrap().remove("extra");
    fs::write(&f.credential, record.to_string()).unwrap();
    let access = Access::load(&f.c).unwrap();
    fs::remove_file(&f.path).unwrap();
    let _replacement = UnixListener::bind(&f.path).unwrap();
    fs::set_permissions(&f.path, fs::Permissions::from_mode(0o600)).unwrap();
    assert!(access.recheck(&f.c).is_err());
    fs::remove_file(&f.path).unwrap();
    symlink(&f.credential, &f.path).unwrap();
    assert!(Access::load(&f.c).is_err());
}
#[tokio::test]
async fn rejects_socket_escape_and_ancestor_symlink() {
    let f = Fixture::new();
    let original = fs::read(&f.credential).unwrap();
    let mut record: serde_json::Value = serde_json::from_slice(&original).unwrap();
    for path in [
        "/tmp/outside.sock".to_string(),
        format!("{}/../host.sock", f.c.runtime_dir.display()),
    ] {
        record["socketPath"] = json!(path);
        fs::write(&f.credential, record.to_string()).unwrap();
        assert!(Access::load(&f.c).is_err());
    }
    fs::write(&f.credential, original).unwrap();
    let link = f.c.runtime_dir.join("alias");
    symlink(&f.c.runtime_dir, &link).unwrap();
    let mut c = f.c.clone();
    c.runtime_dir = link;
    assert!(Access::load(&c).is_err());
}
#[tokio::test]
async fn bounds_newline_frames_and_rejects_incomplete_eof() {
    let exact = vec![b' '; schema::FRAME - 1];
    let mut bytes = exact.clone();
    bytes.push(b'\n');
    assert_eq!(
        ipc::read_frame(&bytes[..]).await.unwrap().len(),
        schema::FRAME
    );
    bytes.insert(0, b' ');
    assert!(ipc::read_frame(&bytes[..]).await.is_err());
    assert!(ipc::read_frame(&exact[..]).await.is_err());
    let mut bytes = vec![b'x'; schema::FRAME + 1];
    bytes.extend(b"\n{}");
    assert!(ipc::read_frame(&bytes[..]).await.is_err());
}
#[test]
fn strict_schemas_and_unicode_content_limits() {
    for d in schema::definitions() {
        assert!(d.tool.input_schema.get("additionalProperties") == Some(&json!(false)));
        assert!(
            d.output
                .is_valid(&ipc::error("HOST_UNAVAILABLE", "unavailable", false))
        );
        assert!(!d.input.is_valid(&json!({"unknown":true})));
    }
    let s = jsonschema::validator_for(&schema::input("notes_search")).unwrap();
    assert!(s.is_valid(&json!({"query":"中文"})));
    assert!(!s.is_valid(&json!({"query":""})));
    assert!(!s.is_valid(&json!({"query":"a".repeat(513)})));
    assert!(!s.is_valid(&json!({"query":"a","limit":101})));
    let s = jsonschema::validator_for(&schema::input("notes_create")).unwrap();
    let key = Uuid::new_v4().to_string();
    assert!(!s.is_valid(
        &json!({"folderId":"f","format":"document","content":"wrong type","idempotencyKey":key})
    ));
    assert!(schema::bounded_content(&json!("a".repeat(schema::BODY))));
    assert!(!schema::bounded_content(&json!(
        "中".repeat(schema::BODY / 3 + 1)
    )));
    let mut deep = json!({});
    for _ in 0..64 {
        deep = json!({"child":deep});
    }
    assert!(!schema::bounded_content(&deep));
    assert!(!schema::bounded_content(
        &json!({"content":vec![json!({});20_000]})
    ));
}
#[test]
fn cli_rejects_duplicates_relative_runtime_and_unknown_options() {
    let args = [
        "--workspace-id",
        "ws",
        "--credential-ref",
        "00000000-0000-4000-8000-000000000001",
    ];
    assert!(Config::parse(args.map(str::to_string)).is_ok());
    for tail in [
        vec!["--workspace-id", "other"],
        vec!["--runtime-dir", "relative"],
        vec!["--wat", "x"],
        vec!["--runtime-dir"],
    ] {
        assert!(Config::parse(args.into_iter().chain(tail).map(str::to_string)).is_err());
    }
}
#[tokio::test]
async fn malformed_host_frames_and_no_automatic_retry() {
    for mode in [
        "bad-id",
        "bad-version",
        "extra",
        "incomplete",
        "bad-json",
        "invalid-uuid",
        "missing-field",
        "duplicate",
        "invalid-utf8",
        "echo-secret",
    ] {
        let f = Fixture::new();
        let args = json!({});
        let (value, _) = tokio::join!(ipc::call(&f.c, "notes_list", &args), async {
            let (mut socket, _) = f._listener.accept().await.unwrap();
            let frame = ipc::read_frame(&mut socket).await.unwrap();
            let request: serde_json::Value = serde_json::from_slice(&frame).unwrap();
            let mut r = json!({"version":1,"requestId":request["requestId"],"result":{"items":[],"nextCursor":null},"isError":false});
            match mode {
                "bad-id" => r["requestId"] = json!(Uuid::new_v4().to_string()),
                "bad-version" => r["version"] = json!(2),
                "invalid-uuid" => r["requestId"] = json!("not-a-uuid"),
                "missing-field" => {
                    r.as_object_mut().unwrap().remove("isError");
                }
                "extra" => r["extra"] = json!(1),
                "echo-secret" => r["result"] = json!({"credential":request["credential"]}),
                _ => {}
            }
            let mut bytes = r.to_string();
            if mode != "incomplete" {
                bytes.push('\n');
            }
            if mode == "bad-json" {
                bytes = "not-json\n".into();
            }
            if mode == "duplicate" {
                bytes = bytes.replacen("{", "{\"version\":1,", 1);
            }
            if mode == "invalid-utf8" {
                socket.write_all(&[255, b'\n']).await.unwrap();
            } else {
                socket.write_all(bytes.as_bytes()).await.unwrap();
            }
        });
        assert!(value.is_err(), "{mode}");
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(30), f._listener.accept())
                .await
                .is_err(),
            "no retries"
        );
    }
}
#[test]
fn real_stdio_sdk_fixture_suite() {
    let result = std::process::Command::new("python3")
        .arg(format!(
            "{}/tests/stdio_fixture.py",
            env!("CARGO_MANIFEST_DIR")
        ))
        .arg(env!("CARGO_BIN_EXE_cybernote-mcp"))
        .status()
        .unwrap();
    assert!(result.success());
}

#[test]
fn socket_full_path_byte_limit_includes_trailing_nul() {
    use notes_mcp::security::socket_path_fits;
    let address: libc::sockaddr_un = unsafe { std::mem::zeroed() };
    let capacity = address.sun_path.len();
    assert!(socket_path_fits(std::path::Path::new(&format!(
        "/{}",
        "a".repeat(capacity - 2)
    ))));
    assert!(!socket_path_fits(std::path::Path::new(&format!(
        "/{}",
        "a".repeat(capacity - 1)
    ))));
    assert!(!socket_path_fits(std::path::Path::new(&format!(
        "/{}",
        "中".repeat(capacity / 3 + 1)
    ))));
}
