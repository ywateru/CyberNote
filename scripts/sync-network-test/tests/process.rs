use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Write},
    process::{Child, Command, Stdio},
    sync::mpsc,
    time::{Duration, Instant},
};
struct Peer {
    child: Child,
    rx: mpsc::Receiver<Value>,
}
impl Peer {
    fn start(path: &std::path::Path, workspace: &str) -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_sync-peer"))
            .arg(path)
            .arg(workspace)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .unwrap();
        let out = child.stdout.take().unwrap();
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(out).lines() {
                let Ok(l) = line else {
                    break;
                };
                if tx.send(serde_json::from_str(&l).unwrap()).is_err() {
                    break;
                }
            }
        });
        let p = Self { child, rx };
        assert_eq!(
            p.rx.recv_timeout(Duration::from_secs(5)).unwrap()["ready"],
            true
        );
        p
    }
    fn call(&mut self, v: Value) -> Value {
        writeln!(self.child.stdin.as_mut().unwrap(), "{}", v).unwrap();
        self.child.stdin.as_mut().unwrap().flush().unwrap();
        let r = self.rx.recv_timeout(Duration::from_secs(32)).unwrap();
        assert!(r.get("error").is_none(), "child error");
        r["ok"].clone()
    }
    fn wait_count(&mut self, n: usize) {
        let deadline = Instant::now() + Duration::from_secs(15);
        loop {
            let v = self.call(json!({"op":"list"}));
            if v.as_array().unwrap().len() == n {
                return;
            }
            assert!(Instant::now() < deadline, "convergence deadline");
            std::thread::sleep(Duration::from_millis(50));
        }
    }
}
impl Drop for Peer {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
#[test]
fn two_processes_bidirectional_persisted_reconnect_and_multi_device_forwarding() {
    let a_dir = tempfile::tempdir().unwrap();
    let b_dir = tempfile::tempdir().unwrap();
    let c_dir = tempfile::tempdir().unwrap();
    let workspace = uuid::Uuid::new_v4().to_string();
    let mut a = Peer::start(a_dir.path(), &workspace);
    let mut b = Peer::start(b_dir.path(), &workspace);
    assert_ne!(a.child.id(), b.child.id());
    a.call(json!({"op":"insert","text":"A before pairing"}));
    b.call(json!({"op":"insert","text":"B before pairing"}));
    let address = a.call(json!({"op":"listen"}))["address"]
        .as_str()
        .unwrap()
        .to_owned();
    let endpoint = format!("ws://{address}/");
    let token = a.call(json!({"op":"invite","address":endpoint}))["token"]
        .as_str()
        .unwrap()
        .to_owned();
    let pairing = b.call(json!({"op":"pair","token":token}));
    let id = pairing["peerId"].as_str().unwrap().to_owned();
    a.wait_count(2);
    b.wait_count(2);
    let mut c = Peer::start(c_dir.path(), &workspace);
    let token = a.call(json!({"op":"invite","address":endpoint}))["token"]
        .as_str()
        .unwrap()
        .to_owned();
    c.call(json!({"op":"pair","token":token}));
    c.wait_count(2);
    c.call(json!({"op":"insert","text":"C forwarded through A"}));
    a.wait_count(3);
    b.wait_count(3);
    b.call(json!({"op":"stop"}));
    assert!(b.child.wait().unwrap().success());
    a.call(json!({"op":"insert","text":"A while B offline"}));
    let mut b2 = Peer::start(b_dir.path(), &workspace);
    b2.call(json!({"op":"connect","id":id}));
    b2.wait_count(4);
    b2.call(json!({"op":"insert","text":"B after durable reconnect"}));
    a.wait_count(5);
    c.wait_count(5);
    let digests = a.call(json!({"op":"list"}));
    assert_eq!(digests, b2.call(json!({"op":"list"})));
    assert_eq!(digests, c.call(json!({"op":"list"})));
    for p in [&mut a, &mut b2, &mut c] {
        p.call(json!({"op":"stop"}));
        assert!(p.child.wait().unwrap().success());
    }
}
