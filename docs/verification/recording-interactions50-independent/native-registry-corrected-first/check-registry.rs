// Production recording_window.rs functions execute unchanged. Only Tauri's
// window/state/event/exit boundary is controlled. Command attributes are removed
// from the included source, and inner doc comments are made ordinary comments.
extern crate self as tauri;
use serde::Serialize;
use std::{any::TypeId,collections::HashMap,ops::Deref,sync::{Arc,Mutex,atomic::{AtomicBool,AtomicUsize,Ordering}}};
pub trait Emitter {} pub trait Manager {}
pub struct State<'a,T>{inner:&'a T}
impl<'a,T> Deref for State<'a,T>{type Target=T;fn deref(&self)->&T{self.inner}}
#[derive(Clone)]pub struct WebviewWindow{label:String}
impl WebviewWindow {pub fn label(&self)->&str{&self.label}pub fn show(&self)->Result<(),String>{Ok(())}pub fn unminimize(&self)->Result<(),String>{Ok(())}pub fn set_focus(&self)->Result<(),String>{Ok(())}}
#[derive(Clone)]pub struct AppHandle{data:Arc<Boundary>}
struct Boundary{recordings:recording_window::Recordings,windows:Mutex<HashMap<String,WebviewWindow>>,events:Mutex<Vec<(String,String,serde_json::Value)>>,exits:AtomicUsize}
pub enum EventTarget{Window{label:String}}
impl AppHandle{
 fn new()->Self{Self{data:Arc::new(Boundary{recordings:Default::default(),windows:Mutex::new(HashMap::new()),events:Mutex::new(vec![]),exits:AtomicUsize::new(0)})}}
 pub fn state<T:'static>(&self)->State<'_,T>{assert_eq!(TypeId::of::<T>(),TypeId::of::<recording_window::Recordings>());State{inner:unsafe{&*(&self.data.recordings as *const recording_window::Recordings as *const T)}}}
 pub fn try_state<T:'static>(&self)->Option<State<'_,T>>{Some(self.state())}
 pub fn get_webview_window(&self,label:&str)->Option<WebviewWindow>{self.data.windows.lock().unwrap().get(label).cloned()}
 pub fn webview_windows(&self)->HashMap<String,WebviewWindow>{self.data.windows.lock().unwrap().clone()}
 pub fn emit_to<T:Serialize>(&self,target:EventTarget,name:&str,value:T)->Result<(),String>{let EventTarget::Window{label}=target;self.data.events.lock().unwrap().push((label,name.into(),serde_json::to_value(value).unwrap()));Ok(())}
 pub fn emit<T:Serialize>(&self,name:&str,value:T)->Result<(),String>{self.data.events.lock().unwrap().push(("*".into(),name.into(),serde_json::to_value(value).unwrap()));Ok(())}
 pub fn exit(&self,_:i32){self.data.exits.fetch_add(1,Ordering::SeqCst);}
 fn add(&self,label:&str)->WebviewWindow{let w=WebviewWindow{label:label.into()};self.data.windows.lock().unwrap().insert(label.into(),w.clone());w}
}
pub struct ExitRequestApi{prevented:AtomicBool}
impl ExitRequestApi{pub fn prevent_exit(&self){self.prevented.store(true,Ordering::SeqCst);}}
mod recording_window{include!("production-recording-window.rs");}
fn main(){
 use recording_window::*;use serde_json::json;
 let app=AppHandle::new();let owner=app.add("main");
 let session="123e4567-e89b-42d3-a456-426614174000".to_string();let operation="123e4567-e89b-42d3-a456-426614174001".to_string();
 register_recording_window(session.clone(),operation.clone(),owner.clone(),app.state()).unwrap();
 let child_label=format!("recording-{session}");let child=app.add(&child_label);
 recording_window_message(session.clone(),operation.clone(),json!({"kind":"state","state":{"recordedAt":1793743199123_u64}}),child.clone(),app.clone(),app.state()).unwrap();
 recording_window_message(session.clone(),operation.clone(),json!({"kind":"submit","transfer":{"data":"YQ=="}}),child,app.clone(),app.state()).unwrap();
 // The real save is pending when an abnormal child destruction arrives.
 app.data.windows.lock().unwrap().remove(&child_label);destroyed(&app,&child_label);
 // Original owner later sends its genuine completed A document ACK status.
 recording_window_message(session.clone(),operation.clone(),json!({"kind":"owner-status","status":"saved","fileAccepted":true}),owner.clone(),app.clone(),app.state()).unwrap();
 let api=ExitRequestApi{prevented:AtomicBool::new(false)};exit_requested(&app,&api);
 let quit=app.data.events.lock().unwrap().iter().find(|(_,name,_)|name=="notes-recording-quit").map(|(_,_,v)|v["id"].as_str().unwrap().to_string());
 if let Some(id)=quit{recording_quit_ack(id,true,owner.clone(),app.clone(),app.state()).unwrap();}
 let replacement=register_recording_window("123e4567-e89b-42d3-a456-426614174002".into(),"123e4567-e89b-42d3-a456-426614174003".into(),owner,app.clone().state());
 let result=json!({"quitPrevented":api.prevented.load(Ordering::SeqCst),"exitCalls":app.data.exits.load(Ordering::SeqCst),"nextRegistrationAccepted":replacement.is_ok(),"nextRegistrationError":replacement.err()});
 println!("{result}");assert!(!api.prevented.load(Ordering::SeqCst) || app.data.exits.load(Ordering::SeqCst)==1,"original saved ACK plus original document Quit ACK must release the destroyed-child guard");
}
