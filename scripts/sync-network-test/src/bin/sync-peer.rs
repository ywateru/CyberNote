use notes_sync_network_tests::{
    fixture::Fixture,
    identity::IdentityStore,
    network::{SyncBackend, SyncService},
};
use serde_json::{json, Value};
use std::{
    io::{self, BufRead, Write},
    path::PathBuf,
    sync::Arc,
};
fn main() {
    let args: Vec<_> = std::env::args().collect();
    let root = PathBuf::from(&args[1]);
    let backend = Arc::new(Fixture::open(&root, &args[2]).unwrap());
    let identity =
        Arc::new(IdentityStore::open(&root.join(".sync"), &backend.device_id().unwrap()).unwrap());
    let mut service =
        SyncService::new(backend.clone(), identity, root.join(".sync/staging")).unwrap();
    println!("{}", json!({"ready":true,"pid":std::process::id()}));
    for line in io::stdin().lock().lines() {
        let line = line.unwrap();
        let v: Value = serde_json::from_str(&line).unwrap();
        let r: Result<Value, Box<dyn std::error::Error>> = (|| {
            Ok(match v["op"].as_str().unwrap() {
                "listen" => {
                    json!({"address":service.start_listener("127.0.0.1:0".parse()?)?.to_string()})
                }
                "invite" => json!({"token":service.invitation(v["address"].as_str().unwrap())?}),
                "pair" => serde_json::to_value(service.pair(v["token"].as_str().unwrap())?)?,
                "insert" => json!({"digest":backend.insert(v["text"].as_str().unwrap(),None)?}),
                "list" => json!(backend.digests()?),
                "status" => serde_json::to_value(service.status()?)?,
                "connect" => {
                    service.connect(v["id"].as_str().unwrap())?;
                    json!(true)
                }
                "sync" => {
                    service.sync_now()?;
                    json!(true)
                }
                "stopListener" => {
                    service.stop_listener()?;
                    json!(true)
                }
                "stop" => {
                    service.shutdown()?;
                    json!(true)
                }
                _ => return Err("unknown command".into()),
            })
        })();
        match r {
            Ok(r) => println!("{}", json!({"ok":r})),
            Err(_) => println!("{}", json!({"error":"operation_failed"})),
        }
        io::stdout().flush().unwrap();
        if v["op"] == "stop" {
            break;
        }
    }
}
