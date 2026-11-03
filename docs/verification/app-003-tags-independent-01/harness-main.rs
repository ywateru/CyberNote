mod store;
mod session;
use std::io::{self,Read};
fn main() {
 let path=std::env::args().nth(1).expect("isolated store path");
 let mut raw=String::new();io::stdin().read_to_string(&mut raw).unwrap();
 let action:serde_json::Value=serde_json::from_str(&raw).unwrap();
 let mut store=store::Store::open(path).unwrap();
 let result=if action["type"]=="__workspace" {store.workspace()} else {store.action(action)};
 let out=match result {Ok(value)=>serde_json::json!({"ok":true,"value":value}),Err(error)=>serde_json::json!({"ok":false,"error":error})};
 println!("{}",out);
}
