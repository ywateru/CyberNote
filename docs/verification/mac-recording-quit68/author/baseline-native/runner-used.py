#!/usr/bin/env python3
"""Build a headless boundary for exact production menu/run callbacks and commands.

No AppKit application/window is created. Only Tauri runtime transport is replaced;
menu declaration/callback, RunEvent callback, registry and command bodies are copied
byte-for-byte from the requested revision (command proc attributes are omitted).
The browser supplies registration and ACKs through real production command bodies.
"""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument("output")
p.add_argument("--source", required=True)
p.add_argument("--deps", required=True)
a = p.parse_args()
out = Path(a.output).resolve()
out.mkdir(parents=True, exist_ok=True)
source = Path("src-tauri/src/recording_window.rs").read_text()
lib = Path("src-tauri/src/lib.rs").read_text()
if a.source != "working":
    for path, text in [("src-tauri/src/recording_window.rs", source), ("src-tauri/src/lib.rs", lib)]:
        assert text == subprocess.check_output(["git", "show", a.source + ":" + path], text=True)

def block(text, start):
    begin = text.index("{", start)
    depth = 0
    for i in range(begin, len(text)):
        if text[i] == "{": depth += 1
        elif text[i] == "}":
            depth -= 1
            if not depth: return text[start:i + 1]
    raise AssertionError("unclosed production block")

def item(kind, name):
    m = re.search(r"(?m)^(?:pub )?" + kind + " " + name + r"(?:\b|<)", source)
    assert m, name
    return block(source, m.start())

selected = {}
parts = ["use serde::Serialize; use serde_json::{json,Value}; use std::{collections::{HashMap,HashSet},sync::Mutex}; use crate::State;"]
structs = ["Identity", "Entry", "Quit", "Registry", "LocalIdentity", "LocalEntry"]
for name in structs:
    selected[name] = item("struct", name)
    derive = "#[derive(Clone,Serialize)]\n#[serde(rename_all=\"camelCase\")]\n" if name in ["Identity", "LocalIdentity"] else "#[derive(Default)]\n" if name == "Registry" else ""
    parts.append(derive + selected[name])
parts.append("#[derive(Default)] pub struct Recordings(pub Mutex<Registry>);")
functions = ["canonical_uuid", "document_window", "recording_label", "register_local", "local_entry", "acknowledge_local", "release_local", "register_recording_local", "recording_local_validate", "recording_local_started", "recording_local_revision", "recording_local_release", "recording_quit_sealed", "seal_quit_participant", "acknowledge_quit_participant", "expire_quit", "cancel_destroyed_participant", "may_exit", "cancel_changed_participants", "document_windows", "notify_quit_cancelled", "recording_quit_ack", "exit_requested"]
for name in functions:
    selected[name] = item("fn", name)
    parts.append(selected[name])
parts.append('pub fn reveal_owner(_: &crate::AppHandle,_: &str) {}')
parts.append('pub fn inspect(app:&crate::AppHandle)->Value { let r=app.inner.recordings.0.lock().unwrap();json!({"localCount":r.local.len(),"childCount":r.entries.len(),"quit":r.quit.as_ref().map(|q|json!({"id":q.id,"sealing":q.sealing,"waiting":q.waiting})),"exitAllowed":r.exit_allowed}) }')

menu_start = lib.index('let app_menu = SubmenuBuilder::new(app, "备忘录")')
menu = lib[menu_start:lib.index(".build()?;", menu_start) + len(".build()?;")]
menu_callback = block(lib, lib.index("|app, event| {", lib.index("app.on_menu_event(")))
run_callback = block(lib, lib.index("|app, event| match event {"))
selected.update(menu_declaration=menu, menu_callback=menu_callback, run_callback=run_callback)

facade = r'''
#![allow(dead_code,unused_imports)]
extern crate self as tauri;
use serde_json::{json,Value};
use std::{any::Any,collections::HashMap,io::{self,BufRead,Write},ops::Deref,sync::{Arc,Mutex,atomic::{AtomicBool,AtomicUsize,Ordering}}};
pub trait Manager {} pub trait Emitter {}
pub struct State<'a,T>{inner:&'a T} impl<T>Deref for State<'_,T>{type Target=T;fn deref(&self)->&T{self.inner}}
#[derive(Clone)] pub struct AppHandle{inner:Arc<Inner>}
struct Inner{recordings:recording_window::Recordings,windows:Mutex<HashMap<String,WebviewWindow>>,events:Mutex<Vec<Value>>,trace:Mutex<Vec<Value>>,requests:AtomicUsize,terminated:AtomicBool}
impl Manager for AppHandle {} impl Emitter for AppHandle {}
#[derive(Clone)] pub struct WebviewWindow{label:String,focused:bool}
impl WebviewWindow {pub fn label(&self)->&str{&self.label} pub fn is_focused(&self)->Result<bool,String>{Ok(self.focused)} pub fn show(&self)->Result<(),String>{Ok(())} pub fn unminimize(&self)->Result<(),String>{Ok(())} pub fn set_focus(&self)->Result<(),String>{Ok(())} pub fn emit_to<T:serde::Serialize>(&self,_:EventTarget,_:&str,_:T)->Result<(),String>{Ok(())}}
pub enum EventTarget{Window{label:String}}
#[derive(Clone)] pub struct ExitRequestApi{prevented:Arc<AtomicBool>} impl ExitRequestApi{pub fn prevent_exit(&self){self.prevented.store(true,Ordering::SeqCst)}}
pub enum RunEvent{ExitRequested{api:ExitRequestApi,code:Option<i32>},Reopen{},Other}
impl AppHandle {
 fn new()->Self {Self{inner:Arc::new(Inner{recordings:Default::default(),windows:Mutex::new(HashMap::from([("main".into(),WebviewWindow{label:"main".into(),focused:true})])),events:Mutex::new(vec![]),trace:Mutex::new(vec![]),requests:AtomicUsize::new(0),terminated:AtomicBool::new(false)})}}
 fn state<T:'static>(&self)->State<'_,T>{State{inner:(&self.inner.recordings as &dyn Any).downcast_ref::<T>().unwrap()}}
 fn webview_windows(&self)->HashMap<String,WebviewWindow>{self.inner.windows.lock().unwrap().clone()}
 fn get_webview_window(&self,label:&str)->Option<WebviewWindow>{self.inner.windows.lock().unwrap().get(label).cloned()}
 fn emit_to<T:serde::Serialize>(&self,target:EventTarget,name:&str,payload:T)->Result<(),String>{let EventTarget::Window{label}=target;self.inner.events.lock().unwrap().push(json!({"label":label,"name":name,"payload":payload}));Ok(())}
 fn emit<T:serde::Serialize>(&self,name:&str,payload:T)->Result<(),String>{self.inner.events.lock().unwrap().push(json!({"name":name,"payload":payload}));Ok(())}
 fn exit(&self,code:i32){self.inner.requests.fetch_add(1,Ordering::SeqCst);let api=ExitRequestApi{prevented:Arc::new(AtomicBool::new(false))};run_callback(self,RunEvent::ExitRequested{api:api.clone(),code:Some(code)});let prevented=api.prevented.load(Ordering::SeqCst);self.inner.trace.lock().unwrap().push(json!({"stage":"app.exit->production-run-callback","prevented":prevented}));if !prevented{self.inner.terminated.store(true,Ordering::SeqCst);}}
}
#[derive(Clone)] struct MenuId(String);impl AsRef<str> for MenuId{fn as_ref(&self)->&str{&self.0}}
struct MenuEvent{item:MenuId} impl MenuEvent{fn id(&self)->&MenuId{&self.item}}
#[derive(Default,Clone,serde::Serialize)] struct MenuPlan{kind:String,id:String,text:String,accelerator:String}
struct MenuItemBuilder{plan:MenuPlan}impl MenuItemBuilder{fn with_id(id:&str,text:&str)->Self{Self{plan:MenuPlan{kind:"custom".into(),id:id.into(),text:text.into(),..Default::default()}}}fn accelerator(mut self,s:&str)->Self{self.plan.accelerator=s.into();self}fn build(self,_:&AppHandle)->Result<MenuPlan,String>{Ok(self.plan)}}
struct SubmenuBuilder{plan:MenuPlan}impl SubmenuBuilder{fn new(_:&AppHandle,_:&str)->Self{Self{plan:Default::default()}}fn about(self,_:Option<&str>)->Self{self}fn separator(self)->Self{self}fn hide(self)->Self{self}fn hide_others(self)->Self{self}fn show_all(self)->Self{self}fn quit(mut self)->Self{self.plan=MenuPlan{kind:"predefined-terminate".into(),id:"predefined-quit".into(),text:"Quit".into(),accelerator:"Cmd+Q".into()};self}fn item(mut self,p:&MenuPlan)->Self{self.plan=p.clone();self}fn build(self)->Result<MenuPlan,String>{Ok(self.plan)}}
'''
driver = r'''
fn text(v:&Value,k:&str)->String{v[k].as_str().unwrap().into()}
fn command(app:&AppHandle,v:&Value)->Result<Value,String>{
 let c=text(v,"command");let a=&v["args"];let owner=a["owner"].as_str().unwrap_or("main");let w=app.get_webview_window(owner).ok_or("owner unavailable")?;let s=app.state::<recording_window::Recordings>();
 macro_rules! identity{($f:ident)=>{recording_window::$f(text(a,"sessionId"),text(a,"operationId"),text(a,"incarnation"),w,s).map(|_|Value::Null)}}
 match c.as_str(){
 "register_recording_local"=>recording_window::register_recording_local(text(a,"sessionId"),text(a,"operationId"),w,s).map(|x|serde_json::to_value(x).unwrap()),
 "recording_local_validate"=>identity!(recording_local_validate),"recording_local_started"=>identity!(recording_local_started),
 "recording_local_revision"=>recording_window::recording_local_revision(text(a,"sessionId"),text(a,"operationId"),text(a,"incarnation"),a["revision"].as_u64().unwrap(),a["finalIntent"].as_bool().unwrap(),w,s).map(|_|Value::Null),
 "recording_local_release"=>recording_window::recording_local_release(text(a,"sessionId"),text(a,"operationId"),text(a,"incarnation"),a["saved"].as_bool().unwrap(),a["revision"].as_u64().unwrap(),w,s).map(|_|Value::Null),
 "recording_quit_sealed"=>recording_window::recording_quit_sealed(text(a,"id"),w,app.clone(),s).map(|_|Value::Null),
 "recording_quit_ack"=>recording_window::recording_quit_ack(text(a,"id"),a["success"].as_bool().unwrap(),w,app.clone(),s).map(|_|Value::Null),
 "menu"=>{let plan=menu_plan(app)?;if plan.kind=="custom"{menu_callback(app,MenuEvent{item:MenuId(plan.id.clone())});}else{app.inner.trace.lock().unwrap().push(json!({"stage":"locked-muda-quit-selector","selector":"terminate:","note":"source-bound bypass; not executed against NSApplication"}));}Ok(serde_json::to_value(plan).unwrap())},
 "exit_requested"=>{app.exit(0);Ok(Value::Null)},
 "focus"=>{for w in app.inner.windows.lock().unwrap().values_mut(){w.focused=a["label"].as_str()==Some(&w.label)}Ok(Value::Null)},
 "add_document"=>{let label=text(a,"label");app.inner.windows.lock().unwrap().insert(label.clone(),WebviewWindow{label,focused:false});Ok(Value::Null)},
 "expire"=>{let id=text(a,"id");let changed={let mut r=app.inner.recordings.0.lock().unwrap();recording_window::test_expire(&mut r,&id)};if changed{app.emit("notes-recording-quit-cancelled",json!({"id":id}))?;}Ok(Value::Null)},
 _=>Err(format!("unexpected command {c}"))}
}
fn main(){let mut app=AppHandle::new();for line in io::stdin().lock().lines(){let v:Value=serde_json::from_str(&line.unwrap()).unwrap();let result=if v["command"]=="reset"{app=AppHandle::new();Ok(Value::Null)}else{command(&app,&v)};let snapshot=recording_window::inspect(&app);let events=std::mem::take(&mut*app.inner.events.lock().unwrap());let trace=std::mem::take(&mut*app.inner.trace.lock().unwrap());let(result,error)=match result{Ok(x)=>(x,Value::Null),Err(e)=>(Value::Null,json!(e))};println!("{}",json!({"result":result,"error":error,"events":events,"trace":trace,"registry":snapshot,"requests":app.inner.requests.load(Ordering::SeqCst),"terminated":app.inner.terminated.load(Ordering::SeqCst)}));io::stdout().flush().unwrap();}}
'''
parts.append('pub fn test_expire(r:&mut Registry,id:&str)->bool{expire_quit(r,id)}')
generated = facade + '\nmod recording_window {\n' + '\n\n'.join(parts) + '\n}\n'
generated += 'fn menu_plan(app:&AppHandle)->Result<MenuPlan,String>{' + menu + '\nOk(app_menu)}\n'
generated += 'fn menu_callback(app:&AppHandle,event:MenuEvent){(' + menu_callback + ')(app,event)}\n'
generated += 'fn run_callback(app:&AppHandle,event:RunEvent){(' + run_callback + ')(app,event)}\n' + driver
path = out / "production-boundary.rs"
path.write_text(generated)
deps = Path(a.deps)
args = ["rustc", "--edition=2021", "--crate-name", "quit68_boundary", str(path), "-L", "dependency=" + str(deps)]
dep_manifest = {}
for name in ["serde", "serde_json", "uuid"]:
    candidates = sorted(deps.glob("lib" + name + "-*.rlib"))
    assert candidates, name
    chosen = candidates[-1]
    args += ["--extern", name + "=" + str(chosen)]
    dep_manifest[name] = {"path":str(chosen),"sha256":hashlib.sha256(chosen.read_bytes()).hexdigest()}
args += ["-o", str(out / "native-boundary")]
(out / "compile-command.json").write_text(json.dumps(args, indent=2) + "\n")
with (out / "compile.stdout").open("w") as log:
    result = subprocess.run(args, stdout=log, stderr=subprocess.STDOUT)
(out / "bindings.json").write_text(json.dumps({"source":a.source,"head":subprocess.check_output(["git","rev-parse","HEAD"],text=True).strip(),"selectedSha256":{n:hashlib.sha256(s.encode()).hexdigest() for n,s in selected.items()},"sourceSha256":hashlib.sha256(source.encode()).hexdigest(),"libSha256":hashlib.sha256(lib.encode()).hexdigest(),"generatedSha256":hashlib.sha256(generated.encode()).hexdigest(),"dependencies":dep_manifest,"compileExit":result.returncode,"limits":"Exact production command, menu and RunEvent bodies; Tauri runtime/menu construction transports are headless facades. No OS terminate, GUI, device or real audio. Dependency selector audit distinguishes predefined bypass; runtime effects are bounded observations, not an OS integration claim."}, indent=2) + "\n")
(out / "runner-used.py").write_bytes(Path(__file__).read_bytes())
raise SystemExit(result.returncode)
