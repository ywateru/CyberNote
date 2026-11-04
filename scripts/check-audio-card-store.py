#!/usr/bin/env python3
"""Compile this tree's Store/Session offline, preserving each attempt and provenance.

Requires an existing CARGO_TARGET_DIR exclusively allocated by the coordinator.
The line-oriented CLI substitutes host IPC only, retaining actual Session authority.
"""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
output = root / (sys.argv[1] if len(sys.argv) > 1 else "artifacts/audio-card-rust/run01")
if output.exists():
    raise SystemExit("Choose a fresh output directory; failed evidence is retained.")
if shutil.disk_usage(root).free < 2 * 1024**3:
    raise SystemExit("Less than 2 GiB available.")
target = os.environ.get("CARGO_TARGET_DIR")
if not target or not Path(target).is_dir():
    raise SystemExit("Set CARGO_TARGET_DIR to an existing exclusively allocated cache.")
harness = output / "harness"
(harness / "src").mkdir(parents=True)
for name in ("Cargo.toml", "Cargo.lock"):
    data = subprocess.check_output(["git", "show", f"HEAD:docs/verification/qa-fix-00/store-probes/{name}"], cwd=root)
    (harness / name).write_bytes(data.replace(b"notes-qa-fix-store", b"notes-audio-card-store"))
for name in ("store.rs", "store", "session.rs", "session"):
    source = root / "src-tauri/src" / name
    if source.is_dir(): shutil.copytree(source, harness / "src" / name)
    else: shutil.copyfile(source, harness / "src" / name)
for fixture in [
    "qa-fix-00/schema-fixtures/inline-at-doc-root.notesbackup",
    "qa-fix-00/schema-fixtures/block-inside-paragraph.notesbackup",
    "qa-fix-00/schema-fixtures/paragraph-inside-table.notesbackup",
    "qa-001/store-probes/fixtures/valid.notesbackup",
    *[f"app-001-fix-03/fixtures/{name}.{suffix}" for name in ["valid-rich","valid-drawing","invalid-structure","invalid-drawing-attribute"] for suffix in ["notesbackup","document.json"]],
]:
    path = output / "docs/verification" / fixture
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(subprocess.check_output(["git", "show", "HEAD:docs/verification/" + fixture], cwd=root))
(harness / "src/main.rs").write_text(r'''
mod store;
mod session;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use store::{AppError, Result, Store};
use session::{Session, Token};
fn invalid(message: &str) -> AppError { AppError {code:"invalid".into(),message:message.into()} }
fn string<'a>(p: &'a Value, key: &str) -> Result<&'a str> {p[key].as_str().ok_or_else(||invalid(key))}
fn token(p: &Value) -> Result<Token> { Ok(serde_json::from_value(p["expected"].clone())?) }
fn dispatch(s: &mut Session, request: Value) -> Result<Value> {
 let p=&request["params"];
 match string(&request,"command")? {
  "load_workspace"=>s.workspace(),
  "register_save_intent"=>{s.register_save("main",string(p,"noteId")?,string(p,"intent")?,token(p)?)?;Ok(Value::Null)},
  "workspace_action"=>{let a=p["action"].clone();if a["type"]=="saveNote" {s.save("main",a)}else{s.ordinary(a,&token(p)?).map(|v|v.0)}},
  "store_attachment_operation"=>{
   let bytes=B64.decode(string(p,"data")?).map_err(|_|invalid("base64"))?;
   let date:Option<u64>=serde_json::from_value(p.get("recordedAt").cloned().unwrap_or(Value::Null))?;
   s.store_attachment_operation("main",string(p,"operationId")?,string(p,"noteId")?,string(p,"name")?,string(p,"mime")?,&bytes,&token(p)?,date)
  },
  "query_attachment_operation"=>s.query_attachment_operation("main",string(p,"operationId")?,string(p,"noteId")?,&token(p)?),
  "cancel_attachment_operation"=>s.cancel_attachment_operation("main",string(p,"operationId")?,string(p,"noteId")?,&token(p)?),
  "read_attachment"=>{let id=string(p,"id")?;let note=s.store.attachment_note(id)?;s.sensitive(&note,&token(p)?)?;s.tagged(s.store.read_attachment(id)?)},
  _=>Err(invalid("unknown command"))
 }
}
fn main() {
 let root=std::env::args().nth(1).expect("isolated temporary root required");
 let mut s=Session::new(Store::open(root).unwrap());
 for line in io::stdin().lock().lines() {
  let result=serde_json::from_str::<Value>(&line.unwrap()).map_err(AppError::from).and_then(|r|dispatch(&mut s,r));
  let reply=match result {Ok(v)=>json!({"ok":v}),Err(e)=>json!({"error":{"code":e.code,"message":e.message}})};
  println!("{}",reply);io::stdout().flush().unwrap();
 }
}
''')
sources = sorted((root / "src-tauri/src").rglob("*.rs"))
meta = {"sourceRoot": str(root), "target": target, "freeBefore": shutil.disk_usage(root).free,
        "sources": {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sources},
        "harness": {str(p.relative_to(output)): hashlib.sha256(p.read_bytes()).hexdigest() for p in [harness/"Cargo.toml",harness/"Cargo.lock",harness/"src/main.rs"]}, "commands": []}
for action in ("test", "build"):
    if shutil.disk_usage(root).free < 2 * 1024**3:
        raise SystemExit("Less than 2 GiB available before Rust command.")
    command = ["cargo", action, "--locked", "--offline", "--features", "rusqlite/hooks", "--manifest-path", str(harness/"Cargo.toml")]
    if action == "test": command += ([os.environ.get("AUDIO_CARD_RUST_FILTER", "recorded_at")] if os.environ.get("AUDIO_CARD_RUST_FILTER", "recorded_at") else []) + ["--", "--nocapture"]
    with (output / (action+".txt")).open("wb") as log:
        run=subprocess.run(command,cwd=root,stdout=log,stderr=subprocess.STDOUT)
    meta["commands"].append({"command":command,"exitCode":run.returncode,"freeAfter":shutil.disk_usage(root).free})
    (output/"metadata.json").write_text(json.dumps(meta,indent=2)+"\n")
    print(f"{action}: {run.returncode}; {output/action}.txt",flush=True)
    if run.returncode: sys.exit(run.returncode)
binary=Path(target)/"debug/notes-audio-card-store"
meta["binary"]={"path":str(binary),"sha256":hashlib.sha256(binary.read_bytes()).hexdigest(),"size":binary.stat().st_size}
(output/"metadata.json").write_text(json.dumps(meta,indent=2)+"\n")
