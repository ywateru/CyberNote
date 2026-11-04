//! Persistent real Session transport for controlled browser delivery, not Tauri IPC proof.
#[path = "harness/src/store.rs"] mod store;
#[path = "harness/src/session.rs"] mod session;
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use session::{Session, Token};
use store::{Result, Store};

fn command(session: &mut Session, row: &Value, access: &mut Option<Value>) -> Result<Value> {
    let args = &row["args"];
    let window = row["window"].as_str().unwrap_or("main");
    let token = || serde_json::from_value::<Token>(args["expected"].clone()).map_err(store::AppError::from);
    match row["command"].as_str().unwrap_or("") {
        "load_workspace" => session.workspace(),
        "register_save_intent" => { session.register_save(window,args["noteId"].as_str().unwrap(),args["intent"].as_str().unwrap(),token()?)?; Ok(Value::Null) },
        "workspace_action" => {
            let action = args["action"].clone();
            if action["type"] == "saveNote" { session.save(window,action) }
            else if Session::requires_barrier(&action) {
                let prepare = session.begin(action,Default::default(),&token()?)?;
                let (value,event) = session.finish(prepare["operationId"].as_str().unwrap(),&Default::default(),false)?;
                *access=Some(event); value
            } else {
                let (value,event) = session.ordinary(action,&token()?)?; *access=event; Ok(value)
            }
        },
        "acknowledge_access" => Ok(Value::Null),
        "read_note_text" => { session.sensitive(args["id"].as_str().unwrap(),&token()?)?; session.tagged(session.store.note_text(args["id"].as_str().unwrap())?) },
        _ => Err(store::AppError{code:"transport_unknown".into(),message:"Unsupported controlled transport command".into(),commit:None}),
    }
}
fn main() {
    let root=std::env::args().nth(1).unwrap();
    let mut session=Session::new(Store::open(root).unwrap());
    for line in io::stdin().lock().lines() {
        let row:Value=serde_json::from_str(&line.unwrap()).unwrap();
        let mut access=None;
        let result=command(&mut session,&row,&mut access);
        let mut events=Vec::new();
        if let Some(event)=access { events.push(json!({"name":"notes-access","payload":event})); }
        if let Some(event)=session.take_metadata_event() { events.push(json!({"name":"notes-metadata","payload":event})); }
        let response=match result {
            Ok(value)=>json!({"requestId":row["requestId"],"ok":true,"value":value,"events":events}),
            Err(error)=>json!({"requestId":row["requestId"],"ok":false,"error":error,"events":events}),
        };
        println!("{response}"); io::stdout().flush().unwrap();
    }
}
