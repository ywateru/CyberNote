
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

mod recording_window {
use serde::Serialize; use serde_json::{json,Value}; use std::{collections::{HashMap,HashSet},sync::Mutex}; use crate::State;

#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct Identity {
    session_id: String,
    operation_id: String,
    owner: String,
    child: String,
}

struct Entry {
    identity: Identity,
    owner_alive: bool,
    started: bool,
    terminal: bool,
    revision: Option<(u64, bool)>,
    checkpoint_revision: u64,
    child_destroyed: bool,
    docked: bool,
}

struct Quit {
    sealing: HashSet<String>,
    id: String,
    participants: HashSet<String>,
    waiting: HashSet<String>,
}

#[derive(Default)]
struct Registry {
    entries: HashMap<String, Entry>,
    local: HashMap<String, LocalEntry>,
    completed_local: HashMap<String, (LocalIdentity, bool, u64)>,
    incarnations: HashMap<String, String>,
    used_local_sessions: HashSet<String>,
    used_local_operations: HashSet<String>,
    quit: Option<Quit>,
    exit_allowed: bool,
}

#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct LocalIdentity {
    session_id: String,
    operation_id: String,
    owner: String,
    incarnation: String,
}

struct LocalEntry {
    identity: LocalIdentity,
    owner_alive: bool,
    started: bool,
    acknowledged: u64,
    final_ack: bool,
}

#[derive(Default)] pub struct Recordings(Mutex<Registry>);

fn canonical_uuid(value: &str) -> bool {
    uuid::Uuid::parse_str(value).is_ok_and(|id| id.hyphenated().to_string() == value)
}

fn document_window(label: &str) -> bool {
    label == "main" || label.starts_with("note-")
}

pub fn recording_label(label: &str) -> bool {
    label.strip_prefix("recording-").is_some_and(canonical_uuid)
}

fn register_local(
    registry: &mut Registry,
    session: String,
    operation: String,
    caller: &str,
) -> Result<LocalIdentity, String> {
    if !document_window(caller) || !canonical_uuid(&session) || !canonical_uuid(&operation) {
        return Err("本地录音身份无效".into());
    }
    // A lost registration response must be recoverable only by this original
    // live incarnation, with the same session/operation and before capture.
    // This exact recovery is allowed during Quit so empty cleanup can finish.
    if !registry.exit_allowed {
        if let Some(entry) = registry.local.get(&session) {
            if entry.owner_alive
                && entry.identity.owner == caller
                && entry.identity.operation_id == operation
                && registry.incarnations.get(caller) == Some(&entry.identity.incarnation)
                && !entry.started
                && entry.acknowledged == 0
                && !entry.final_ack
            {
                return Ok(entry.identity.clone());
            }
            return Err("原录音登记身份已失效或采集已开始".into());
        }
    }
    if registry.quit.is_some() || registry.exit_allowed {
        return Err("应用正在退出，请稍候".into());
    }
    if registry.used_local_sessions.contains(&session)
        || registry.used_local_operations.contains(&operation)
        || registry
            .local
            .values()
            .any(|entry| entry.identity.owner == caller)
        || registry
            .entries
            .values()
            .any(|entry| entry.identity.owner == caller)
    {
        return Err("原窗口已有未完成录音或操作身份已使用".into());
    }
    let incarnation = registry
        .incarnations
        .entry(caller.into())
        .or_insert_with(|| uuid::Uuid::new_v4().to_string())
        .clone();
    let identity = LocalIdentity {
        session_id: session.clone(),
        operation_id: operation.clone(),
        owner: caller.into(),
        incarnation,
    };
    registry.used_local_sessions.insert(session.clone());
    registry.used_local_operations.insert(operation);
    registry.local.insert(
        session,
        LocalEntry {
            identity: identity.clone(),
            owner_alive: true,
            started: false,
            acknowledged: 0,
            final_ack: false,
        },
    );
    Ok(identity)
}

fn local_entry<'a>(
    registry: &'a mut Registry,
    session: &str,
    operation: &str,
    incarnation: &str,
    caller: &str,
) -> Result<&'a mut LocalEntry, String> {
    let entry = registry
        .local
        .get_mut(session)
        .ok_or("本地录音会话已失效，音频仍保留")?;
    if !entry.owner_alive
        || entry.identity.owner != caller
        || entry.identity.operation_id != operation
        || entry.identity.incarnation != incarnation
        || registry.incarnations.get(caller).map(String::as_str) != Some(incarnation)
    {
        return Err("原录音窗口或操作身份已失效".into());
    }
    Ok(entry)
}

fn acknowledge_local(
    registry: &mut Registry,
    session: &str,
    operation: &str,
    incarnation: &str,
    caller: &str,
    revision: u64,
    final_intent: bool,
) -> Result<(), String> {
    let entry = local_entry(registry, session, operation, incarnation, caller)?;
    if !entry.started || revision == 0 {
        return Err("录音尚未开始".into());
    }
    if entry.acknowledged == revision && entry.final_ack == final_intent {
        return Ok(());
    }
    if entry.final_ack || revision != entry.acknowledged + 1 {
        return Err("录音确认版本顺序无效".into());
    }
    entry.acknowledged = revision;
    entry.final_ack = final_intent;
    Ok(())
}

fn release_local(
    registry: &mut Registry,
    session: &str,
    operation: &str,
    incarnation: &str,
    caller: &str,
    saved: bool,
    revision: u64,
) -> Result<(), String> {
    if !registry.local.contains_key(session) {
        if let Some((identity, completed_saved, completed_revision)) =
            registry.completed_local.get(session)
        {
            if identity.owner == caller
                && identity.operation_id == operation
                && identity.incarnation == incarnation
                && registry.incarnations.get(caller).map(String::as_str) == Some(incarnation)
                && *completed_saved == saved
                && *completed_revision == revision
                && !registry
                    .local
                    .values()
                    .any(|entry| entry.identity.owner == caller)
            {
                return Ok(()); // Exact cleanup receipt after a lost IPC response.
            }
        }
        return Err("本地录音清理身份已失效".into());
    }
    let entry = local_entry(registry, session, operation, incarnation, caller)?;
    if if saved {
        !entry.final_ack || revision != entry.acknowledged
    } else {
        revision != 0 || entry.acknowledged != 0 || entry.final_ack
    } {
        return Err("录音最终保存尚未确认，不能清理会话".into());
    }
    let completed = registry.local.remove(session).unwrap();
    registry
        .completed_local
        .insert(session.into(), (completed.identity, saved, revision));
    // Removing audio ownership does not acknowledge any document Quit barrier.
    Ok(())
}

pub fn register_recording_local(
    session_id: String,
    operation_id: String,
    window: tauri::WebviewWindow,
    state: State<Recordings>,
) -> Result<LocalIdentity, String> {
    register_local(
        &mut *state.0.lock().map_err(|_| "录音会话锁错误")?,
        session_id,
        operation_id,
        window.label(),
    )
}

pub fn recording_local_validate(
    session_id: String,
    operation_id: String,
    incarnation: String,
    window: tauri::WebviewWindow,
    state: State<Recordings>,
) -> Result<(), String> {
    local_entry(
        &mut *state.0.lock().map_err(|_| "录音会话锁错误")?,
        &session_id,
        &operation_id,
        &incarnation,
        window.label(),
    )?;
    Ok(())
}

pub fn recording_local_started(
    session_id: String,
    operation_id: String,
    incarnation: String,
    window: tauri::WebviewWindow,
    state: State<Recordings>,
) -> Result<(), String> {
    let mut registry = state.0.lock().map_err(|_| "录音会话锁错误")?;
    let entry = local_entry(
        &mut registry,
        &session_id,
        &operation_id,
        &incarnation,
        window.label(),
    )?;
    if entry.started || entry.final_ack {
        return Err("录音会话已经开始".into());
    }
    entry.started = true;
    Ok(())
}

pub fn recording_local_revision(
    session_id: String,
    operation_id: String,
    incarnation: String,
    revision: u64,
    final_intent: bool,
    window: tauri::WebviewWindow,
    state: State<Recordings>,
) -> Result<(), String> {
    acknowledge_local(
        &mut *state.0.lock().map_err(|_| "录音会话锁错误")?,
        &session_id,
        &operation_id,
        &incarnation,
        window.label(),
        revision,
        final_intent,
    )
}

pub fn recording_local_release(
    session_id: String,
    operation_id: String,
    incarnation: String,
    saved: bool,
    revision: u64,
    window: tauri::WebviewWindow,
    state: State<Recordings>,
) -> Result<(), String> {
    release_local(
        &mut *state.0.lock().map_err(|_| "录音会话锁错误")?,
        &session_id,
        &operation_id,
        &incarnation,
        window.label(),
        saved,
        revision,
    )
}

pub fn recording_quit_sealed(
    id: String,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: State<Recordings>,
) -> Result<(), String> {
    let mut registry = state.0.lock().map_err(|_| "录音会话锁错误")?;
    if let Some(cancelled) = cancel_changed_participants(&mut registry, &document_windows(&app)) {
        drop(registry);
        notify_quit_cancelled(&app, &cancelled);
        return Err("文档窗口已改变，退出已取消".into());
    }
    let participants = seal_quit_participant(&mut registry, &id, window.label())?;
    drop(registry);
    if let Some(participants) = participants {
        for label in participants {
            app.emit_to(
                tauri::EventTarget::Window { label },
                "notes-recording-quit-ready",
                json!({"id":id}),
            )
            .map_err(|_| "无法通知正文窗口")?;
        }
    }
    Ok(())
}

fn seal_quit_participant(
    registry: &mut Registry,
    id: &str,
    caller: &str,
) -> Result<Option<HashSet<String>>, String> {
    let quit = registry.quit.as_mut().ok_or("本次退出已取消")?;
    if quit.id != id || !quit.sealing.remove(caller) {
        return Err("退出封存身份已失效".into());
    }
    Ok(quit.sealing.is_empty().then(|| quit.participants.clone()))
}

fn acknowledge_quit_participant(
    registry: &mut Registry,
    id: &str,
    caller: &str,
) -> Result<(), String> {
    let quit = registry.quit.as_mut().ok_or("本次退出已取消")?;
    if quit.id != id || !quit.sealing.is_empty() || !quit.waiting.remove(caller) {
        return Err("退出确认身份已失效或正文尚未全部封存".into());
    }
    Ok(())
}

fn expire_quit(registry: &mut Registry, id: &str) -> bool {
    if registry.quit.as_ref().is_some_and(|quit| quit.id == id) {
        registry.quit = None;
        true
    } else {
        false
    }
}

fn cancel_destroyed_participant(registry: &mut Registry, label: &str) {
    if registry
        .quit
        .as_ref()
        .is_some_and(|quit| quit.participants.contains(label))
    {
        registry.quit = None;
    }
}

fn may_exit(registry: &mut Registry) -> bool {
    if registry
        .quit
        .as_ref()
        .is_some_and(|quit| quit.waiting.is_empty() && quit.sealing.is_empty())
        && registry.entries.is_empty()
        && registry.local.is_empty()
    {
        registry.quit = None;
        registry.exit_allowed = true;
        true
    } else {
        false
    }
}

fn cancel_changed_participants(
    registry: &mut Registry,
    current: &HashSet<String>,
) -> Option<String> {
    if registry
        .quit
        .as_ref()
        .is_some_and(|quit| &quit.participants != current)
    {
        registry.quit.take().map(|quit| quit.id)
    } else {
        None
    }
}

fn document_windows(app: &tauri::AppHandle) -> HashSet<String> {
    app.webview_windows()
        .into_keys()
        .filter(|label| document_window(label))
        .collect()
}

fn notify_quit_cancelled(app: &tauri::AppHandle, id: &str) {
    let _ = app.emit("notes-recording-quit-cancelled", json!({"id":id}));
    let state = app.state::<Recordings>();
    let hidden_children: HashSet<String> = state
        .0
        .lock()
        .map(|registry| {
            registry
                .entries
                .values()
                .filter(|entry| entry.docked && entry.owner_alive)
                .map(|entry| entry.identity.child.clone())
                .collect()
        })
        .unwrap_or_default();
    for window in app.webview_windows().into_values() {
        if !hidden_children.contains(window.label()) {
            let _ = window.show();
        }
    }
}

pub fn recording_quit_ack(
    id: String,
    success: bool,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: State<Recordings>,
) -> Result<(), String> {
    let mut registry = state.0.lock().map_err(|_| "录音会话锁错误")?;
    let quit = registry.quit.as_mut().ok_or("本次退出已取消")?;
    if quit.id != id || !quit.waiting.contains(window.label()) {
        return Err("退出确认身份已失效".into());
    }
    if success && !quit.sealing.is_empty() {
        return Err("正文窗口尚未全部封存".into());
    }
    if !success {
        registry.quit = None;
        drop(registry);
        notify_quit_cancelled(&app, &id);
        return Ok(());
    }
    if let Some(cancelled) = cancel_changed_participants(&mut registry, &document_windows(&app)) {
        drop(registry);
        notify_quit_cancelled(&app, &cancelled);
        return Err("文档窗口已改变，本次退出已取消".into());
    }
    acknowledge_quit_participant(&mut registry, &id, window.label())?;
    let exit = may_exit(&mut registry);
    drop(registry);
    if exit {
        app.exit(0);
    }
    Ok(())
}

pub fn exit_requested(app: &tauri::AppHandle, api: &tauri::ExitRequestApi) {
    let state = app.state::<Recordings>();
    let Ok(mut registry) = state.0.lock() else {
        api.prevent_exit();
        return;
    };
    if registry.exit_allowed
        || (registry.entries.is_empty() && registry.local.is_empty() && registry.quit.is_none())
    {
        return;
    }
    api.prevent_exit();
    if registry.quit.is_some() {
        return;
    }
    let id = uuid::Uuid::new_v4().to_string();
    let waiting = document_windows(app);
    registry.quit = Some(Quit {
        id: id.clone(),
        participants: waiting.clone(),
        sealing: waiting.clone(),
        waiting: waiting.clone(),
    });
    drop(registry);
    for label in waiting {
        let _ = app.emit_to(
            tauri::EventTarget::Window { label },
            "notes-recording-quit",
            json!({"id":id}),
        );
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(45));
        let state = app.state::<Recordings>();
        let Ok(mut registry) = state.0.lock() else {
            return;
        };
        if expire_quit(&mut registry, &id) {
            drop(registry);
            notify_quit_cancelled(&app, &id);
        }
    });
}

pub fn reveal_owner(_: &crate::AppHandle,_: &str) {}

pub fn inspect(app:&crate::AppHandle)->Value { let r=app.inner.recordings.0.lock().unwrap();json!({"localCount":r.local.len(),"childCount":r.entries.len(),"quit":r.quit.as_ref().map(|q|json!({"id":q.id,"sealing":q.sealing,"waiting":q.waiting})),"exitAllowed":r.exit_allowed}) }

pub fn test_expire(app:&crate::AppHandle,id:&str)->bool{expire_quit(&mut app.inner.recordings.0.lock().unwrap(),id)}
}
fn menu_plan(app:&AppHandle)->Result<MenuPlan,String>{let app_menu = SubmenuBuilder::new(app, "备忘录")
                    .about(None)
                    .separator()
                    .hide()
                    .hide_others()
                    .show_all()
                    .separator()
                    .quit()
                    .build()?;
Ok(app_menu)}
fn menu_callback(app:&AppHandle,event:MenuEvent){let callback:fn(&AppHandle,MenuEvent)=|app, event| {
                    use tauri::Emitter;
                    if let Some(window) = app
                        .webview_windows()
                        .into_values()
                        .find(|window| window.is_focused().unwrap_or(false))
                    {
                        if event.id().as_ref() == "show_recording_owner" {
                            if recording_window::recording_label(window.label()) {
                                recording_window::reveal_owner(app, window.label());
                            } else if let Some(main) = app.get_webview_window("main") {
                                let _ = main.show();
                                let _ = main.set_focus();
                            }
                            return;
                        }
                        if window.label() == "main" || window.label().starts_with("note-") {
                            let _ = window.emit_to(
                                tauri::EventTarget::Window {
                                    label: window.label().to_owned(),
                                },
                                "menu-action",
                                event.id().as_ref(),
                            );
                        }
                    }
                };callback(app,event)}
fn run_callback(app:&AppHandle,event:RunEvent){let callback:fn(&AppHandle,RunEvent)=|app, event| match event {
            tauri::RunEvent::ExitRequested { api, .. } => {
                recording_window::exit_requested(app, &api)
            }
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => {
                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.unminimize();
                    let _ = main.set_focus();
                }
            }
            _ => {}
        };callback(app,event)}

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
 "expire"=>{let id=text(a,"id");let changed=recording_window::test_expire(app,&id);if changed{app.emit("notes-recording-quit-cancelled",json!({"id":id}))?;}Ok(Value::Null)},
 _=>Err(format!("unexpected command {c}"))}
}
fn main(){let mut app=AppHandle::new();for line in io::stdin().lock().lines(){let v:Value=serde_json::from_str(&line.unwrap()).unwrap();let result=if v["command"]=="reset"{app=AppHandle::new();Ok(Value::Null)}else{command(&app,&v)};let snapshot=recording_window::inspect(&app);let events=std::mem::take(&mut*app.inner.events.lock().unwrap());let trace=std::mem::take(&mut*app.inner.trace.lock().unwrap());let(result,error)=match result{Ok(x)=>(x,Value::Null),Err(e)=>(Value::Null,json!(e))};println!("{}",json!({"result":result,"error":error,"events":events,"trace":trace,"registry":snapshot,"requests":app.inner.requests.load(Ordering::SeqCst),"terminated":app.inner.terminated.load(Ordering::SeqCst)}));io::stdout().flush().unwrap();}}
