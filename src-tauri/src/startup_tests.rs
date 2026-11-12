use super::*;

fn parse(args: &[&str]) -> io::Result<Options> {
    Options::parse(args.iter().map(OsString::from))
}

#[test]
fn validates_all_arguments_before_opening_any_directory() {
    assert_eq!(parse(&[]).unwrap(), Options::default());
    assert_eq!(
        parse(&["--data-dir", "/somewhere/中文 path"])
            .unwrap()
            .data_dir,
        Some(PathBuf::from("/somewhere/中文 path"))
    );
    for args in [
        vec!["--data-dir"],
        vec!["--data-dir", ""],
        vec!["--data-dir", "relative"],
        vec!["--data-dir", "~/notes"],
        vec!["--unknown"],
        vec!["/positional"],
        vec!["--data-dir", "/one", "--data-dir", "/two"],
        vec!["--data-dir", "/one", "--unknown"],
        vec!["--data-dir=/one"],
    ] {
        assert_eq!(
            parse(&args).unwrap_err().kind(),
            io::ErrorKind::InvalidInput,
            "{args:?}"
        );
    }
}

#[test]
fn defaults_keep_platform_paths_and_custom_cache_stays_outside_data() {
    let temp = tempfile::tempdir().unwrap();
    let data = temp.path().join("default-data");
    let cache = temp.path().join("default-cache");
    let custom = temp.path().join("custom 中文");
    let options = Options {
        data_dir: Some(custom.clone()),
    };
    let workspace = Workspace::open(&options, &data, &cache).unwrap();
    assert_eq!(workspace.root, custom.canonicalize().unwrap());
    assert_eq!(
        workspace.media_cache,
        custom_cache_directory(&workspace.root, &cache.canonicalize().unwrap())
            .join("attachment-thumbnails-v1")
    );
    assert!(!data.exists());
    assert!(!workspace.media_cache.starts_with(&workspace.root));
    assert!(!workspace.root.join(".cache").exists());
    let default = Workspace::open(&Options::default(), &data, &cache).unwrap();
    assert_eq!(default.root, data.canonicalize().unwrap());
    assert_eq!(default.media_cache, cache.join("attachment-thumbnails-v1"));
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        for path in [
            &workspace.root,
            &workspace.media_cache,
            &workspace.root.join("attachments"),
        ] {
            assert_eq!(
                fs::metadata(path).unwrap().permissions().mode() & 0o777,
                0o700
            );
        }
    }
}

#[test]
fn same_directory_is_exclusive_aliases_cannot_bypass_and_drop_releases() {
    let temp = tempfile::tempdir().unwrap();
    let options = Options {
        data_dir: Some(temp.path().join("a")),
    };
    let first = Workspace::open(&options, temp.path(), temp.path()).unwrap();
    assert!(Workspace::open(&options, temp.path(), temp.path())
        .unwrap_err()
        .to_string()
        .contains("already in use"));
    let second = Workspace::open(
        &Options {
            data_dir: Some(temp.path().join("b")),
        },
        temp.path(),
        temp.path(),
    )
    .unwrap();
    assert_ne!(first.media_cache, second.media_cache);
    #[cfg(unix)]
    {
        let alias = temp.path().join("alias");
        std::os::unix::fs::symlink(&first.root, &alias).unwrap();
        assert!(Workspace::open(
            &Options {
                data_dir: Some(alias)
            },
            temp.path(),
            temp.path()
        )
        .is_err());
    }
    let cache = first.media_cache.clone();
    fs::write(cache.join("retained"), b"cache survives restart").unwrap();
    drop(first);
    let reopened = Workspace::open(&options, temp.path(), temp.path()).unwrap();
    assert_eq!(reopened.media_cache, cache);
    assert_eq!(
        fs::read(reopened.media_cache.join("retained")).unwrap(),
        b"cache survives restart"
    );
    #[cfg(unix)]
    {
        drop(reopened);
        let alias = Workspace::open(
            &Options {
                data_dir: Some(temp.path().join("alias")),
            },
            temp.path(),
            temp.path(),
        )
        .unwrap();
        assert_eq!(alias.media_cache, cache);
    }
}

#[test]
fn rejects_unusable_directories_before_sqlite_is_created() {
    let temp = tempfile::tempdir().unwrap();
    let file = temp.path().join("file");
    fs::write(&file, "not a directory").unwrap();
    for root in [file.clone(), file.join("child")] {
        assert!(Workspace::open(
            &Options {
                data_dir: Some(root)
            },
            temp.path(),
            temp.path()
        )
        .is_err());
    }
    for blocked in ["attachments", ".app.lock"] {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(blocked);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        if blocked == ".app.lock" {
            fs::create_dir(&path).unwrap();
        } else {
            fs::write(&path, b"blocked").unwrap();
        }
        assert!(Workspace::open(
            &Options {
                data_dir: Some(dir.path().to_path_buf())
            },
            temp.path(),
            temp.path()
        )
        .is_err());
        assert!(!dir.path().join("notes.sqlite3").exists());
    }
    let root = temp.path().join("bad-cache-root");
    assert!(Workspace::open(
        &Options {
            data_dir: Some(root.clone())
        },
        temp.path(),
        &file
    )
    .is_err());
    assert!(!root.join("notes.sqlite3").exists());
    let root = temp.path().join("overlapping-cache");
    assert!(Workspace::open(
        &Options {
            data_dir: Some(root.clone())
        },
        temp.path(),
        &root.join("cache")
    )
    .is_err());
    assert!(!root.join("notes.sqlite3").exists());
}

#[cfg(unix)]
#[test]
fn rejects_redirected_lock_cache_and_attachments() {
    for name in [".app.lock", "attachments", "cache"] {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let target = if name == ".app.lock" {
            let file = outside.path().join("lock");
            fs::write(&file, b"do not touch").unwrap();
            file
        } else {
            outside.path().to_path_buf()
        };
        let cache = dir.path().join("platform-cache");
        let root = dir.path().join("data");
        fs::create_dir(&root).unwrap();
        let redirected = if name == "cache" {
            let selected = custom_cache_directory(&root.canonicalize().unwrap(), &cache);
            fs::create_dir_all(selected.parent().unwrap()).unwrap();
            selected
        } else {
            root.join(name)
        };
        std::os::unix::fs::symlink(&target, redirected).unwrap();
        assert!(Workspace::open(
            &Options {
                data_dir: Some(root.clone())
            },
            dir.path(),
            &cache
        )
        .is_err());
        assert!(!root.join("notes.sqlite3").exists());
    }
}

#[test]
fn existing_dot_cache_is_not_reused_or_changed() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("workspace");
    fs::create_dir(&root).unwrap();
    fs::write(root.join(".cache"), b"existing user file").unwrap();
    let selected = Workspace::open(
        &Options {
            data_dir: Some(root.clone()),
        },
        temp.path(),
        &temp.path().join("platform-cache"),
    )
    .unwrap();
    assert_eq!(
        fs::read(root.join(".cache")).unwrap(),
        b"existing user file"
    );
    assert!(!selected.media_cache.starts_with(&selected.root));
}

#[cfg(unix)]
#[test]
fn distinct_non_utf8_roots_do_not_share_a_lossy_cache_key() {
    use std::os::unix::ffi::OsStringExt;
    // APFS refuses invalid UTF-8 names (EILSEQ); test the native-byte mapping
    // without claiming such directories can be created on every Unix filesystem.
    let a = PathBuf::from(OsString::from_vec(vec![b'/', b'a', 0x80]));
    let b = PathBuf::from(OsString::from_vec(vec![b'/', b'a', 0x81]));
    assert_eq!(a.to_string_lossy(), b.to_string_lossy());
    assert_ne!(
        custom_cache_directory(&a, Path::new("/cache")),
        custom_cache_directory(&b, Path::new("/cache"))
    );
}

#[cfg(unix)]
#[test]
fn unwritable_parent_is_rejected_without_opening_sqlite() {
    use std::os::unix::fs::PermissionsExt;
    let temp = tempfile::tempdir().unwrap();
    let parent = temp.path().join("read-only");
    fs::create_dir(&parent).unwrap();
    fs::set_permissions(&parent, fs::Permissions::from_mode(0o500)).unwrap();
    let root = parent.join("new-workspace");
    let result = Workspace::open(
        &Options {
            data_dir: Some(root.clone()),
        },
        temp.path(),
        temp.path(),
    );
    fs::set_permissions(&parent, fs::Permissions::from_mode(0o700)).unwrap();
    assert!(result.is_err());
    assert!(!root.join("notes.sqlite3").exists());
}

// This exercises the production managed HTTP service, not asset URLs or a fake
// renderer. Both selected directories remain leased while serving distinct bytes.
#[tokio::test]
async fn custom_workspaces_serve_real_registered_media_and_isolate_caches() {
    use crate::{
        attachment_media::runtime::{MediaRuntime, Purpose},
        session::{Session, Token},
        store::Store,
    };
    use serde_json::json;
    use std::{
        collections::HashSet,
        sync::{Arc, Condvar, Mutex},
    };
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpStream,
    };

    struct Running(Arc<MediaRuntime>);
    impl Drop for Running {
        fn drop(&mut self) {
            self.0.stop();
        }
    }
    let temp = tempfile::tempdir().unwrap();
    let mut workspaces = Vec::new();
    let mut runtimes = Vec::new();
    for (name, pixel) in [
        ("desktop-a", [255, 0, 0, 255]),
        ("desktop-b", [0, 0, 255, 255]),
    ] {
        let selected = Workspace::open(
            &Options {
                data_dir: Some(temp.path().join(name)),
            },
            &temp.path().join("unused-default"),
            &temp.path().join("platform-cache"),
        )
        .unwrap();
        let mut bytes = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(2, 2, image::Rgba(pixel)))
            .write_to(&mut bytes, image::ImageFormat::Png)
            .unwrap();
        let bytes = bytes.into_inner();
        let mut session = Session::new(Store::open(&selected.root).unwrap());
        let snapshot = session.snapshot().unwrap();
        let global = Token {
            session_id: snapshot["sessionId"].as_str().unwrap().into(),
            epoch: snapshot["epoch"].as_u64().unwrap(),
            note_epoch: None,
        };
        let note = session
            .ordinary(json!({"type":"createNote"}), &global)
            .unwrap()
            .0["id"]
            .as_str()
            .unwrap()
            .to_owned();
        let snapshot = session.snapshot().unwrap();
        let token = Token {
            note_epoch: snapshot["notes"][&note]["epoch"].as_u64(),
            ..global
        };
        let id = session
            .store_attachment(&note, "fixture.png", "image/png", bytes.clone(), &token)
            .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_owned();
        let runtime = Running(
            MediaRuntime::start(
                Arc::new((Mutex::new(session), Condvar::new())),
                selected.media_cache.clone(),
                HashSet::from(["tauri://localhost".into()]),
            )
            .await
            .unwrap(),
        );
        runtime.0.opened("main").unwrap();
        let grant = runtime
            .0
            .acquire(
                runtime.0.window("main").unwrap(),
                id.clone(),
                token.clone(),
                Purpose::Original,
                None,
            )
            .await
            .unwrap();
        let url = url::Url::parse(grant["url"].as_str().unwrap()).unwrap();
        let host = format!("127.0.0.1:{}", url.port().unwrap());
        let mut socket = TcpStream::connect(&host).await.unwrap();
        socket
            .write_all(
                format!(
                    "GET {} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n",
                    url.path()
                )
                .as_bytes(),
            )
            .await
            .unwrap();
        let mut response = Vec::new();
        tokio::time::timeout(
            std::time::Duration::from_secs(5),
            socket.read_to_end(&mut response),
        )
        .await
        .unwrap()
        .unwrap();
        assert!(response.starts_with(b"HTTP/1.1 200"));
        let offset = response.windows(4).position(|w| w == b"\r\n\r\n").unwrap() + 4;
        assert_eq!(&response[offset..], bytes);
        runtime
            .0
            .acquire(
                runtime.0.window("main").unwrap(),
                id,
                token,
                Purpose::Thumbnail,
                Some(160),
            )
            .await
            .unwrap();
        assert!(fs::read_dir(&selected.media_cache)
            .unwrap()
            .any(|entry| entry
                .unwrap()
                .path()
                .extension()
                .is_some_and(|e| e == "png")));
        workspaces.push(selected);
        runtimes.push(runtime);
    }
    assert_ne!(workspaces[0].media_cache, workspaces[1].media_cache);
    assert!(!temp.path().join("unused-default").exists());
    assert!(!workspaces[0].media_cache.starts_with(&workspaces[0].root));
    assert!(!workspaces[1].media_cache.starts_with(&workspaces[1].root));
    drop(runtimes);
    // Restart under the same lease rules and confirm real business data persists.
    for selected in &workspaces {
        let store = Store::open(&selected.root).unwrap();
        assert_eq!(store.notes().unwrap().len(), 1);
    }
}
