pub struct Error {pub code:String,pub message:String,pub stage:Option<String>,pub request_id:Option<String>}
#[path = "../../../plugins/tauri-plugin-notes-ui/src/recording_diagnostics.rs"] mod recording_diagnostics;
#[no_mangle] pub extern "C" fn diagnostics63_initialize(){let _=recording_diagnostics::Request::new();}
#[no_mangle] pub extern "C" fn diagnostics63_event(request:u64,stage:u32,code:i32,status:std::ffi::c_long){if let Some(cb)=recording_diagnostics::Request(request).callback(){cb(request,stage,code,status);}}
