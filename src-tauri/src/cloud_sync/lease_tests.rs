use super::*;
use crate::cloud_sync::engine::{Capture, LocalInfo};
use serde_json::json;
use std::{
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    thread,
};

struct CheckOnly;
impl CloudHost for CheckOnly {
    fn check(&self, _: &Context) -> Result<()> {
        Ok(())
    }
    fn inspect(&self, _: &Context) -> Result<LocalInfo> {
        panic!("read-only Save fixture must not inspect")
    }
    fn capture(&self, _: &Context, _: &str, _: bool, _: Lease) -> Result<Capture> {
        panic!("Save must not capture")
    }
    fn validate(&self, _: &Context, _: &Bundle, _: Lease) -> Result<()> {
        panic!("Save must not validate content")
    }
    fn commit(&self, _: &Context, _: Bundle, _: &str, _: Lease) -> Result<CommitReport> {
        panic!("Save must not commit content")
    }
}
#[test]
fn cloud_final_gate_with_save_writer_is_bounded_and_linearized() {
    const CHILD: &str = "CYBERNOTE_CLOUD_LEASE_CHILD";
    if std::env::var_os(CHILD).is_none() {
        let mut child = Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "cloud_sync::runtime::lease_tests::cloud_final_gate_with_save_writer_is_bounded_and_linearized", "--nocapture"])
            .env(CHILD, "1").stdout(Stdio::null()).stderr(Stdio::inherit()).spawn().unwrap();
        let deadline = Instant::now() + Duration::from_secs(8);
        loop {
            if let Some(status) = child.try_wait().unwrap() {
                assert!(status.success());
                return;
            }
            if Instant::now() > deadline {
                child.kill().unwrap();
                child.wait().unwrap();
                panic!("lease final gate deadlocked with queued Save writer");
            }
            thread::sleep(Duration::from_millis(10));
        }
    }
    let directory = tempfile::tempdir().unwrap();
    let runtime = CloudRuntime::new(
        &directory.path().canonicalize().unwrap(),
        Arc::new(CheckOnly),
    )
    .unwrap();
    let context = Context {
        window: "main".into(),
        session: "isolated-session".into(),
        token: json!({"epoch":1}),
        store_instance: "isolated-store".into(),
    };
    let workspace = uuid::Uuid::new_v4().to_string();
    let mut lease = Lease {
        epoch: runtime.epoch.clone(),
        expected: 0,
        cancel: CancellationToken::new(),
        workspace: Some(workspace.clone()),
        fence: None,
    };
    lease.fence = Some(CloudFence {
        context: context.clone(),
        config_revision: 0,
        cloud_workspace: workspace.clone(),
        store_workspace_id: None,
        store_device_id: None,
        remote_revision: Revision::Missing,
        confirmed_remote_payload_hash: None,
        incoming_payload_hash: None,
    });
    let guard = lease.enter().unwrap();
    let (sent, result) = mpsc::channel();
    let writer_done = Arc::new(AtomicBool::new(false));
    let saved = writer_done.clone();
    let other = runtime.clone();
    let writer = thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let answer = rt.block_on(other.command(
            context,
            CloudCommand::Save {
                patch: ConfigPatch {
                    expected_revision: 0,
                    minutes: Some(3),
                    ..Default::default()
                },
            },
        ));
        saved.store(true, Ordering::SeqCst);
        sent.send(answer.map(|r| r.status.minutes)).unwrap();
    });
    let deadline = Instant::now() + Duration::from_secs(2);
    while runtime.state.try_lock().is_ok() {
        assert!(
            Instant::now() < deadline,
            "Save must reach state->epoch write gate"
        );
        thread::sleep(Duration::from_millis(1));
    }
    // Ensure the writer queues behind the held read. Bounded child owns failure.
    thread::sleep(Duration::from_millis(20));
    guard.check_workspace(&workspace).unwrap();
    assert_eq!(guard.binding().unwrap().cloud_workspace, workspace);
    assert!(
        !writer_done.load(Ordering::SeqCst),
        "Save cannot cross the final gate"
    );
    // The legacy accessors used by the old example may succeed on a reader-
    // preferring OS or return busy, but must NEVER block behind that writer.
    let _ = lease.binding();
    let _ = lease.check_workspace(&workspace);
    drop(guard);
    assert_eq!(
        result
            .recv_timeout(Duration::from_secs(2))
            .unwrap()
            .unwrap(),
        3
    );
    writer.join().unwrap();
    assert_eq!(lease.check().unwrap_err().code, "permission");
}
