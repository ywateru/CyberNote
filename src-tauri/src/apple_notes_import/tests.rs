use super::*;
fn scan() -> Scan {
    serde_json::from_value(json!({"version":1,"status":"ok","reason":null,"accounts":[{"id":"account","name":"合成账户"}],"folders":[{"id":"root","name":"合成根","parentId":"account"},{"id":"child","name":"合成子","parentId":"root"}],"notes":[{"id":"note-id","title":"合成笔记","folderId":"child","status":"ok","reason":null},{"id":"locked-id","title":"锁定","folderId":"child","status":"locked","reason":"locked"}],"truncated":false})).unwrap()
}
#[test]
fn scan_resolves_ancestry_and_hides_source_identifiers() {
    let (scan, preview, _) = validate_scan(scan()).unwrap();
    assert_eq!(scan.items.len(), 1);
    let item = scan.items.values().next().unwrap();
    assert_eq!(
        item.folders
            .iter()
            .map(|f| f.id.as_str())
            .collect::<Vec<_>>(),
        vec!["account", "root", "child"]
    );
    let serialized = serde_json::to_string(&preview).unwrap();
    assert!(!serialized.contains("note-id") && !serialized.contains("locked-id"));
    assert_eq!(preview[1].status, "locked");
}
#[test]
fn bad_ancestry_is_not_guessed() {
    let mut s = scan();
    s.folders[0].parent_id = "missing".into();
    let (scan, preview, _) = validate_scan(s).unwrap();
    assert!(scan.items.is_empty());
    assert!(preview.iter().all(|p| p.status != "ok"));
}
#[test]
fn duplicate_source_identity_and_folder_cycles_are_rejected() {
    let mut s = scan();
    s.notes.push(Metadata {
        id: Some("note-id".into()),
        title: "duplicate".into(),
        folder_id: Some("child".into()),
        status: "ok".into(),
        reason: None,
    });
    assert!(validate_scan(s).is_err());
    let mut s = scan();
    s.folders[0].parent_id = "child".into();
    assert!(validate_scan(s).unwrap().0.items.is_empty());
}
#[test]
fn finite_failure_has_no_source_error_text() {
    let s:Scan=serde_json::from_value(json!({"version":1,"status":"automation_denied","reason":"automation_denied","accounts":[],"folders":[],"notes":[]})).unwrap();
    let e = validate_scan(s).err().unwrap();
    assert!(e.message.contains("自动化"));
    assert_ne!(
        reason("untrusted private title or error message"),
        "untrusted private title or error message"
    );
}
#[test]
fn owned_export_rejects_links_and_reads_exact_owned_regular_bytes() {
    let stage = OwnedStage::new().unwrap();
    std::fs::write(&stage.exports[0], b"synthetic").unwrap();
    assert_eq!(stage.read_export(0).unwrap(), b"synthetic");
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(&stage.exports[0], &stage.exports[1]).unwrap();
        assert!(stage.read_export(1).is_err());
    }
    assert!(stage.read_export(1000).is_err());
}
#[test]
fn stale_job_identity_is_rejected() {
    let token = Token {
        session_id: "session".into(),
        epoch: 1,
        note_epoch: None,
    };
    let job = Job {
        id: "job".into(),
        owner: "main".into(),
        token: token.clone(),
        cancelled: AtomicBool::new(false),
        publish: Mutex::new(()),
        data: Mutex::new(JobData {
            snapshot: Snapshot {
                id: "job".into(),
                phase: "preview".into(),
                completed: 0,
                total: 0,
                items: Vec::new(),
                results: Vec::new(),
                error: String::new(),
                truncated: false,
                commit: None,
            },
            scan: None,
        }),
    };
    assert!(current(&job, &token, "other").is_err());
    let mut stale = token.clone();
    stale.epoch = 2;
    assert!(current(&job, &stale, "main").is_err());
    assert!(current(&job, &token, "main").is_ok());
}
#[cfg(target_os = "macos")]
#[test]
fn owned_process_cancel_and_timeout_reap_only_the_owned_child() {
    use std::process::{Command, Stdio};
    let stage = OwnedStage::new().unwrap();
    let mut child = Command::new("/bin/sleep")
        .arg("20")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let cancel = AtomicBool::new(true);
    assert_eq!(
        wait_source(
            &mut child,
            &stage,
            &cancel,
            std::time::Duration::from_secs(1)
        )
        .unwrap_err()
        .code,
        "cancelled"
    );
    assert!(child.try_wait().unwrap().is_some());
    let mut child = Command::new("/bin/sleep").arg("20").spawn().unwrap();
    let cancel = AtomicBool::new(false);
    assert_eq!(
        wait_source(
            &mut child,
            &stage,
            &cancel,
            std::time::Duration::from_millis(30)
        )
        .unwrap_err()
        .code,
        "source_timeout"
    );
    assert!(child.try_wait().unwrap().is_some());
}
#[test]
fn read_validates_stability_and_incomplete_media_never_becomes_source_note() {
    let (s, _, _) = validate_scan(scan()).unwrap();
    let item = s.items.values().next().unwrap();
    let stage = OwnedStage::new().unwrap();
    let body = || Body {
        id: item.id.clone(),
        title: item.title.clone(),
        folder_id: item.folder_id.clone(),
        html: "<p>合成正文</p>".into(),
        plain_text: "合成正文".into(),
        created_at_ms: 1000,
        updated_at_ms: 2000,
        attachments: vec![],
        stable: true,
    };
    let mut changed = body();
    changed.stable = false;
    assert_eq!(
        source_note(
            Read {
                version: 1,
                status: "ok".into(),
                reason: None,
                note: Some(changed)
            },
            item,
            &stage
        )
        .err()
        .unwrap()
        .code,
        "source_changed"
    );
    let mut media = body();
    media.attachments.push(Media {
        id: "media".into(),
        cid: None,
        name: None,
        status: "export_failed".into(),
        reason: Some("export_failed".into()),
        export_index: 0,
    });
    assert_eq!(
        source_note(
            Read {
                version: 1,
                status: "ok".into(),
                reason: None,
                note: Some(media)
            },
            item,
            &stage
        )
        .err()
        .unwrap()
        .code,
        "source_attachment"
    );
    let source = source_note(
        Read {
            version: 1,
            status: "ok".into(),
            reason: None,
            note: Some(body()),
        },
        item,
        &stage,
    )
    .unwrap();
    assert_eq!(source.id, "account\0note-id");
}
struct RealHost {
    session: Mutex<crate::session::Session>,
    alive: AtomicBool,
    hold_commit: AtomicBool,
    committing: AtomicBool,
}
impl RealHost {
    fn new(root: &std::path::Path) -> Self {
        Self {
            session: Mutex::new(crate::session::Session::new(
                crate::store::Store::open(root).unwrap(),
            )),
            alive: AtomicBool::new(true),
            hold_commit: AtomicBool::new(false),
            committing: AtomicBool::new(false),
        }
    }
    fn token(&self) -> Token {
        let value = self.session.lock().unwrap().workspace().unwrap();
        serde_json::from_value(json!({"sessionId":value["access"]["sessionId"],"epoch":value["access"]["epoch"],"noteEpoch":null})).unwrap()
    }
}
impl Host for RealHost {
    fn authorize(&self, t: &Token) -> Result<()> {
        self.session.lock().unwrap().apple_import_access(t)
    }
    fn append(&self, b: apple_import::PreparedBatch, t: &Token) -> Result<Value> {
        self.committing.store(true, Ordering::Release);
        while self.hold_commit.load(Ordering::Acquire) {
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        self.session.lock().unwrap().append_apple_notes(b, t)
    }
    fn alive(&self, _: &str) -> bool {
        self.alive.load(Ordering::Acquire)
    }
}
#[derive(Default)]
struct FixtureSource {
    reading: AtomicBool,
    hold_read: AtomicBool,
}
impl Source for FixtureSource {
    fn execute(&self, request: Value, stage: &OwnedStage, cancel: &AtomicBool) -> Result<Value> {
        if request["mode"] == "scan" {
            return Ok(
                json!({"version":1,"status":"ok","reason":null,"accounts":[{"id":"account","name":"合成账户"}],"folders":[{"id":"folder","name":"合成目录","parentId":"account"}],"notes":[{"id":"note","title":"合成正文","folderId":"folder","status":"ok","reason":null}],"truncated":false}),
            );
        }
        self.reading.store(true, Ordering::Release);
        while self.hold_read.load(Ordering::Acquire) {
            if cancel.load(Ordering::Acquire) {
                return Err(error("cancelled", reason("cancelled")));
            }
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        if cancel.load(Ordering::Acquire) {
            return Err(error("cancelled", reason("cancelled")));
        }
        std::fs::write(stage.export_path(0)?, b"\x89PNG\r\n\x1a\nsynthetic").unwrap();
        Ok(
            json!({"version":1,"status":"ok","reason":null,"note":{"id":"note","title":"合成正文","folderId":"folder","html":"<p>合成正文</p><img src='cid:image'>","plainText":"合成正文","createdAtMs":1000,"updatedAtMs":2000,"attachments":[{"id":"attachment","cid":"image","name":"合成.png","status":"ok","reason":null,"exportIndex":0}],"stable":true}}),
        )
    }
}
fn wait_for(mut f: impl FnMut() -> bool) {
    let start = std::time::Instant::now();
    while !f() {
        assert!(
            start.elapsed() < std::time::Duration::from_secs(5),
            "bounded synthetic state wait"
        );
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
}
fn preview_job(
    host: Arc<RealHost>,
    source: Arc<FixtureSource>,
    imports: &Imports,
) -> (String, Token, String) {
    let token = host.token();
    let first = scan_job(token.clone(), "main", imports, host.clone(), source).unwrap();
    let id = first["id"].as_str().unwrap().to_owned();
    wait_for(|| {
        status_job(&id, &token, "main", imports, host.as_ref()).unwrap()["phase"] == "preview"
    });
    let state = status_job(&id, &token, "main", imports, host.as_ref()).unwrap();
    (
        id,
        token,
        state["items"][0]["key"].as_str().unwrap().to_owned(),
    )
}
#[test]
fn same_core_worker_runs_preview_read_stage_session_store_and_duplicate_retry() {
    let temp = tempfile::tempdir().unwrap();
    let host = Arc::new(RealHost::new(temp.path()));
    let source = Arc::new(FixtureSource::default());
    let imports = Imports::default();
    for index in 0..2 {
        let (id, token, key) = preview_job(host.clone(), source.clone(), &imports);
        start_job(
            &id,
            vec![key],
            &token,
            "main",
            &imports,
            host.clone(),
            source.clone(),
        )
        .unwrap();
        wait_for(|| {
            status_job(&id, &token, "main", &imports, host.as_ref()).unwrap()["phase"] == "complete"
        });
        let result = status_job(&id, &token, "main", &imports, host.as_ref()).unwrap();
        assert_eq!(
            result["results"][0]["status"],
            if index == 0 { "imported" } else { "existing" }
        );
    }
    let value = host.session.lock().unwrap().workspace().unwrap();
    assert_eq!(value["metadata"]["sequence"], 1);
    assert_eq!(value["notes"].as_array().unwrap().len(), 1);
    assert_eq!(value["attachments"].as_array().unwrap().len(), 2);
    assert_eq!(value["notes"][0]["createdAt"], 1000);
}
#[test]
fn cancel_and_window_disappearance_during_read_prevent_real_store_commit() {
    for disappear in [false, true] {
        let temp = tempfile::tempdir().unwrap();
        let host = Arc::new(RealHost::new(temp.path()));
        let source = Arc::new(FixtureSource::default());
        source.hold_read.store(true, Ordering::Release);
        let imports = Imports::default();
        let (id, token, key) = preview_job(host.clone(), source.clone(), &imports);
        start_job(
            &id,
            vec![key],
            &token,
            "main",
            &imports,
            host.clone(),
            source.clone(),
        )
        .unwrap();
        wait_for(|| source.reading.load(Ordering::Acquire));
        if disappear {
            host.alive.store(false, Ordering::Release);
        } else {
            cancel_job(&id, &token, "main", &imports).unwrap();
        }
        source.hold_read.store(false, Ordering::Release);
        wait_for(|| {
            let phase = status_job(&id, &token, "main", &imports, host.as_ref()).unwrap()["phase"]
                .as_str()
                .unwrap()
                .to_owned();
            ["cancelled", "error"].contains(&phase.as_str())
        });
        assert!(host.session.lock().unwrap().workspace().unwrap()["notes"]
            .as_array()
            .unwrap()
            .is_empty());
    }
}
#[test]
fn cancel_after_publication_started_reports_committed_outcome() {
    let temp = tempfile::tempdir().unwrap();
    let host = Arc::new(RealHost::new(temp.path()));
    host.hold_commit.store(true, Ordering::Release);
    let source = Arc::new(FixtureSource::default());
    let imports = Imports::default();
    let (id, token, key) = preview_job(host.clone(), source.clone(), &imports);
    start_job(
        &id,
        vec![key],
        &token,
        "main",
        &imports,
        host.clone(),
        source,
    )
    .unwrap();
    wait_for(|| host.committing.load(Ordering::Acquire));
    let cloned = imports.clone();
    let cancel_token = token.clone();
    let cancel_id = id.clone();
    let cancel =
        std::thread::spawn(move || cancel_job(&cancel_id, &cancel_token, "main", &cloned).unwrap());
    host.hold_commit.store(false, Ordering::Release);
    let outcome = cancel.join().unwrap();
    assert_eq!(outcome["phase"], "complete");
    assert_eq!(
        host.session.lock().unwrap().workspace().unwrap()["notes"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}
#[test]
fn changed_access_during_read_and_foreign_owner_cannot_publish() {
    let temp = tempfile::tempdir().unwrap();
    let host = Arc::new(RealHost::new(temp.path()));
    let source = Arc::new(FixtureSource::default());
    source.hold_read.store(true, Ordering::Release);
    let imports = Imports::default();
    let (id, token, key) = preview_job(host.clone(), source.clone(), &imports);
    assert!(start_job(
        &id,
        vec![key.clone()],
        &token,
        "foreign",
        &imports,
        host.clone(),
        source.clone()
    )
    .is_err());
    start_job(
        &id,
        vec![key],
        &token,
        "main",
        &imports,
        host.clone(),
        source.clone(),
    )
    .unwrap();
    wait_for(|| source.reading.load(Ordering::Acquire));
    host.session
        .lock()
        .unwrap()
        .begin(
            json!({"type":"closeLocks"}),
            HashSet::from(["main".into()]),
            &token,
        )
        .unwrap();
    source.hold_read.store(false, Ordering::Release);
    let job = job_for(&imports, &id, &token, "main").unwrap();
    wait_for(|| job.data.lock().unwrap().snapshot.phase == "error");
    assert!(host
        .session
        .lock()
        .unwrap()
        .store
        .notes()
        .unwrap()
        .is_empty());
}
/// Opt-in only: source privacy and source before/after checks are retained in a
/// caller-owned private directory. Normal cargo tests never touch Apple Notes.
#[cfg(target_os = "macos")]
#[test]
#[ignore = "requires explicitly supplied private readonly source fixture and new output directory"]
fn actual_readonly_source_worker_to_isolated_store() {
    use std::os::unix::fs::PermissionsExt;
    let input =
        std::env::var_os("APPLE_IMPORT92_PRIVATE_INPUT").expect("private input path required");
    let output = std::path::PathBuf::from(
        std::env::var_os("APPLE_IMPORT92_PRIVATE_OUTPUT")
            .expect("new private output path required"),
    );
    let input_meta = std::fs::symlink_metadata(&input).unwrap();
    assert!(
        input_meta.is_file()
            && !input_meta.file_type().is_symlink()
            && input_meta.permissions().mode() & 0o077 == 0
    );
    let request: Value = serde_json::from_slice(&std::fs::read(input).unwrap()).unwrap();
    let note_id = request["noteId"]
        .as_str()
        .expect("private noteId required")
        .to_owned();
    assert!(!note_id.is_empty());
    assert!(!output.exists());
    std::fs::create_dir(&output).unwrap();
    std::fs::set_permissions(&output, std::fs::Permissions::from_mode(0o700)).unwrap();
    let source = Arc::new(SystemSource);
    let read_once = || {
        let stage = OwnedStage::new().unwrap();
        let paths = stage
            .exports
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        source
            .execute(
                json!({"version":1,"mode":"read","noteId":note_id,"exportPaths":paths}),
                &stage,
                &AtomicBool::new(false),
            )
            .unwrap()
    };
    let before = read_once();
    assert!(before["status"] == "ok" && before["note"]["stable"] == true);
    assert!(before["note"]["attachments"].as_array().unwrap().is_empty());
    let target = output.join("target");
    let mut host = Arc::new(RealHost::new(&target));
    let token = host.token();
    let baseline = host
        .session
        .lock()
        .unwrap()
        .ordinary(json!({"type":"createNote"}), &token)
        .unwrap()
        .0;
    host.session
        .lock()
        .unwrap()
        .ordinary(
            json!({"type":"settings","settings":{"theme":"dark","customAppleImport92":"preserve"}}),
            &token,
        )
        .unwrap();
    let settings = host.session.lock().unwrap().workspace().unwrap()["settings"].clone();
    for round in 0..2 {
        let imports = Imports::default();
        let token = host.token();
        let first = scan_job(
            token.clone(),
            "main",
            &imports,
            host.clone(),
            source.clone(),
        )
        .unwrap();
        let id = first["id"].as_str().unwrap().to_owned();
        let start = std::time::Instant::now();
        loop {
            let state = status_job(&id, &token, "main", &imports, host.as_ref()).unwrap();
            if state["phase"] == "preview" {
                break;
            }
            assert!(
                state["phase"] != "error" && start.elapsed() < std::time::Duration::from_secs(150),
                "bounded actual source scan"
            );
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        let job = job_for(&imports, &id, &token, "main").unwrap();
        let key = job
            .data
            .lock()
            .unwrap()
            .scan
            .as_ref()
            .unwrap()
            .items
            .values()
            .find(|n| n.id == note_id)
            .expect("selected source present in complete readable scan")
            .key
            .clone();
        start_job(
            &id,
            vec![key],
            &token,
            "main",
            &imports,
            host.clone(),
            source.clone(),
        )
        .unwrap();
        let start = std::time::Instant::now();
        let terminal = loop {
            let state = status_job(&id, &token, "main", &imports, host.as_ref()).unwrap();
            if state["phase"] == "complete" {
                break state;
            }
            assert!(
                state["phase"] != "error" && start.elapsed() < std::time::Duration::from_secs(150),
                "bounded actual source copy"
            );
            std::thread::sleep(std::time::Duration::from_millis(50));
        };
        assert!(terminal["results"].as_array().unwrap().len() == 1);
        assert!(if round == 0 {
            matches!(
                terminal["results"][0]["status"].as_str(),
                Some("imported" | "imported_with_warnings")
            )
        } else {
            terminal["results"][0]["status"] == "existing"
        });
        let workspace = host.session.lock().unwrap().workspace().unwrap();
        assert!(
            workspace["notes"].as_array().unwrap().len() == 2 && workspace["settings"] == settings
        );
        let imported = workspace["notes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|n| n["id"] != baseline["id"])
            .unwrap();
        assert!(
            imported["title"] == before["note"]["title"]
                && imported["plainText"] == before["note"]["plainText"]
                && imported["createdAt"] == before["note"]["createdAtMs"]
                && imported["updatedAt"] == before["note"]["updatedAtMs"]
        );
        let raw = workspace["attachments"]
            .as_array()
            .unwrap()
            .iter()
            .find(|a| a["mime"] == "application/vnd.local-notes.apple-import+json")
            .unwrap();
        let bytes = std::fs::read(
            target
                .join("attachments")
                .join(raw["relativePath"].as_str().unwrap()),
        )
        .unwrap();
        let record: Value = serde_json::from_slice(&bytes).unwrap();
        assert!(
            record["snapshot"]["html"] == before["note"]["html"]
                && record["snapshot"]["plainText"] == before["note"]["plainText"]
        );
        // Construct a new Store/Session on the exact on-disk workspace. Source
        // identity retry is attached to restored managed owners, not RAM state.
        host = Arc::new(RealHost::new(&target));
    }
    let after = read_once();
    assert!(
        before["note"] == after["note"],
        "source retained exactly before and after target copies"
    );
    let report = json!({"version":1,"method":"same production core/SystemSource/Session/Store","copied":1,"repeatSkipped":1,"syntheticBaselinePreserved":true,"settingsPreserved":true,"originalBodyPlainDatesRetained":true,"managedRawRetained":true,"reopen":true,"sourceBeforeAfterEqual":true,"sourceAttachments":0,"limits":"one already-known readable attachment-free note; no true attachment export acceptance"});
    let path = output.join("safe-report.json");
    std::fs::write(&path, serde_json::to_vec_pretty(&report).unwrap()).unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
}
#[test]
fn oversized_combined_metadata_is_rejected_before_loading_any_attachment() {
    let (scan, _, _) = validate_scan(scan()).unwrap();
    let item = scan.items.values().next().unwrap();
    let stage = OwnedStage::new().unwrap();
    for index in 0..2 {
        let file = std::fs::File::create(stage.export_path(index).unwrap()).unwrap();
        file.set_len(65 * 1024 * 1024).unwrap();
    }
    let read = Read {
        version: 1,
        status: "ok".into(),
        reason: None,
        note: Some(Body {
            id: item.id.clone(),
            title: item.title.clone(),
            folder_id: item.folder_id.clone(),
            html: "<p>合成</p>".into(),
            plain_text: "合成".into(),
            created_at_ms: 1,
            updated_at_ms: 2,
            attachments: (0..2)
                .map(|index| Media {
                    id: format!("synthetic-{index}"),
                    cid: None,
                    name: None,
                    status: "ok".into(),
                    reason: None,
                    export_index: index,
                })
                .collect(),
            stable: true,
        }),
    };
    assert_eq!(
        source_note(read, item, &stage).err().unwrap().code,
        "source_limit"
    );
}
#[cfg(target_os = "macos")]
#[test]
fn stage_export_budget_stops_only_owned_process_before_timeout() {
    let stage = OwnedStage::new().unwrap();
    std::fs::File::create(stage.export_path(0).unwrap())
        .unwrap()
        .set_len(100 * 1024 * 1024 + 1)
        .unwrap();
    let mut child = std::process::Command::new("/bin/sleep")
        .arg("20")
        .spawn()
        .unwrap();
    let start = std::time::Instant::now();
    assert_eq!(
        wait_source(
            &mut child,
            &stage,
            &AtomicBool::new(false),
            std::time::Duration::from_secs(2)
        )
        .unwrap_err()
        .code,
        "source_limit"
    );
    assert!(start.elapsed() < std::time::Duration::from_secs(1));
    assert!(child.try_wait().unwrap().is_some());
}
