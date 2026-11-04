
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
  "register_save_intent"=>{s.register_save("main",string(p,"noteId")?,string(p,"saveIntent")?,token(p)?)?;Ok(Value::Null)},
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
