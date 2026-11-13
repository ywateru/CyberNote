use std::time::{Duration,Instant};
async fn probe(direct:bool,label:&str,url:&str)->serde_json::Value {
 let mut builder=reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(15)).connect_timeout(Duration::from_secs(5));
 if direct {builder=builder.no_proxy();}
 let client=builder.build().unwrap();let began=Instant::now();
 let result=client.get(url).send().await;
 match result {
  Ok(r)=>serde_json::json!({"mode":if direct{"direct"}else{"inherited"},"endpoint":label,"status":r.status().as_u16(),"ms":began.elapsed().as_millis()}),
  Err(e)=>{
   let mut source=std::error::Error::source(&e);let mut io_kind=None;let mut os_code=None;
   while let Some(s)=source {if let Some(e)=s.downcast_ref::<std::io::Error>(){io_kind=Some(format!("{:?}",e.kind()));os_code=e.raw_os_error();}source=s.source();}
   serde_json::json!({"mode":if direct{"direct"}else{"inherited"},"endpoint":label,"ms":began.elapsed().as_millis(),"timeout":e.is_timeout(),"connect":e.is_connect(),"request":e.is_request(),"ioKind":io_kind,"osCode":os_code})
  }
 }
}
#[tokio::main(flavor="current_thread")]
async fn main(){
 let rows=tokio::join!(
  probe(false,"coordinatorHealth","https://cybernote-sync.vercel.app/healthz"),
  probe(true,"coordinatorHealth","https://cybernote-sync.vercel.app/healthz"),
  probe(false,"coordinatorConfig","https://cybernote-sync.vercel.app/api/v1/auth/config?appId=il4abzwbu1ohjwv5mb667"),
  probe(true,"coordinatorConfig","https://cybernote-sync.vercel.app/api/v1/auth/config?appId=il4abzwbu1ohjwv5mb667"),
  probe(false,"coordinatorAnonymousProfile","https://cybernote-sync.vercel.app/api/v1/account/profile"),
  probe(true,"coordinatorAnonymousProfile","https://cybernote-sync.vercel.app/api/v1/account/profile"),
  probe(true,"identityDiscovery","https://auth.x.aixgg.com/oidc/.well-known/openid-configuration")
 );
 println!("{}",serde_json::json!({"schema":1,"kind":"public-native-connectivity","reqwest":"0.12.28","hasLowercaseProxy":std::env::var("https_proxy").is_ok(),"rows":[rows.0,rows.1,rows.2,rows.3,rows.4,rows.5,rows.6],"credentialsSent":false,"networkSettingsChanged":false}));
}
