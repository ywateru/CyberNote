#[derive(Debug)]
pub struct Error {pub code:String,pub message:String,pub stage:Option<String>,pub request_id:Option<String>}
#[path = "../../../plugins/tauri-plugin-notes-ui/src/recording_diagnostics.rs"]
mod recording_diagnostics;
use recording_diagnostics::{Request,Stage};
use std::{sync::{Arc,Barrier,mpsc},time::{Duration,Instant}};
fn metadata(r:Request,on:bool) {let e=r.error(Error{code:"microphone_timeout".into(),message:"synthetic unchanged".into(),stage:None,request_id:None},Stage::RustWaitDeadline);assert_eq!(e.code,"microphone_timeout");assert_eq!(e.message,"synthetic unchanged");assert_eq!(e.stage.as_deref(),on.then_some("rust_wait_deadline"));assert_eq!(e.request_id,on.then(||r.0.to_string()));}
fn wait_written(n:u64){let end=Instant::now()+Duration::from_secs(3);while recording_diagnostics::test_output().0<n{assert!(Instant::now()<end);std::thread::sleep(Duration::from_millis(1));}}
fn main(){let mode=std::env::args().nth(1).unwrap();let on=std::env::var("NOTES_RECORDING_DIAGNOSTICS").as_deref()==Ok("1");let r=Request::new();assert_eq!(r.0!=0,on);metadata(r,on);
 if mode=="quiet" {r.emit(Stage::RustDispatch,0,-1);if on{wait_written(1);}println!("PASS quiet enabled={on}");return;}
 if mode=="late-budget" {assert!(on);for n in 1..=255{r.emit(Stage::RustDispatch,0,-1);wait_written(n);}for _ in 0..10{r.emit(Stage::RustDelivery,0,-1);}let end=Instant::now()+Duration::from_secs(3);while !recording_diagnostics::test_output().1{assert!(Instant::now()<end);std::thread::sleep(Duration::from_millis(1));}metadata(r,true);println!("PASS late-budget metadata-independent");return;}
 let lock=mode=="locked";let (ready_tx,ready_rx)=mpsc::channel();let (release_tx,release_rx)=mpsc::channel();let holder=lock.then(||std::thread::spawn(move||{let _guard=std::io::stderr().lock();ready_tx.send(()).unwrap();release_rx.recv().unwrap();}));if lock{ready_rx.recv().unwrap();}
 let b=Arc::new(Barrier::new(5));let mut ts=vec![];let start=Instant::now();for _ in 0..4{let b=b.clone();ts.push(std::thread::spawn(move||{b.wait();for _ in 0..2500{r.emit(Stage::RustDispatch,0,-1);}metadata(r,true);}));}b.wait();for t in ts{t.join().unwrap();}let ms=start.elapsed().as_secs_f64()*1000.;assert!(ms<1000.,"producer wait: {ms}ms");metadata(r,true);
 if lock {release_tx.send(()).unwrap();holder.unwrap().join().unwrap();let end=Instant::now()+Duration::from_secs(3);while !recording_diagnostics::test_output().1{assert!(Instant::now()<end);std::thread::sleep(Duration::from_millis(1));}}
 println!("PASS {mode} enabled={on} producer_calls=10000 producer_ms={ms:.3} metadata-independent no-writer-join");
}
