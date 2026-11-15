//! Native-only presentation, never a grant owner. No invoke handler, JS API,
//! capability, injected script, custom protocol, or caller-selected endpoint.
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, OnceLock},
};
use tauri::{plugin::TauriPlugin, Manager, Runtime};

pub enum Event {
    Opened,
    Closed,
    Destroyed,
    Continue,
    Callback(String),
    Failed,
}
pub type Handler = Arc<dyn Fn(Event) + Send + Sync>;
fn handlers() -> &'static Mutex<HashMap<String, (u64, Handler)>> {
    static HANDLERS: OnceLock<Mutex<HashMap<String, (u64, Handler)>>> = OnceLock::new();
    HANDLERS.get_or_init(Default::default)
}
#[cfg(target_os = "android")]
fn mobile_events() -> tauri::ipc::Channel {
    #[derive(serde::Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Message {
        instance: String,
        generation: String,
        kind: String,
        #[serde(default)]
        url: Option<String>,
    }
    // Exactly one native channel per plugin lifetime. The locked Tauri mobile
    // channel table retains channels; never allocate one per authorization.
    tauri::ipc::Channel::new(move |body| {
        let Ok(message) = body.deserialize::<Message>() else {
            return Ok(());
        };
        let handler = handlers()
            .lock()
            .ok()
            .and_then(|map| map.get(&message.instance).cloned());
        if let Some((generation, handler)) = handler {
            if message.generation.parse::<u64>().ok() != Some(generation) {
                return Ok(());
            }
            let event = match (message.kind.as_str(), message.url) {
                ("opened", None) => Event::Opened,
                ("closed", None) => Event::Closed,
                ("destroyed", None) => Event::Destroyed,
                ("continue", None) => Event::Continue,
                ("callback", Some(url)) => Event::Callback(url),
                _ => Event::Failed,
            };
            handler(event);
        }
        Ok(())
    })
}

pub struct NativeAuth<R: Runtime> {
    #[cfg(target_os = "android")]
    handle: tauri::plugin::PluginHandle<R>,
    #[cfg(target_os = "android")]
    events: tauri::ipc::Channel,
    marker: std::marker::PhantomData<fn() -> R>,
}
pub trait NativeAuthExt<R: Runtime> {
    fn native_auth(&self) -> tauri::State<'_, NativeAuth<R>>;
}
impl<R: Runtime, T: Manager<R>> NativeAuthExt<R> for T {
    fn native_auth(&self) -> tauri::State<'_, NativeAuth<R>> {
        self.state()
    }
}
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("notes-auth")
        .setup(|app, api| {
            #[cfg(not(target_os = "android"))]
            let _ = api;
            app.manage(NativeAuth::<R> {
                #[cfg(target_os = "android")]
                handle: api.register_android_plugin("com.local.notesauth", "NotesAuthPlugin")?,
                #[cfg(target_os = "android")]
                events: mobile_events(),
                marker: std::marker::PhantomData,
            });
            Ok(())
        })
        .build()
}
impl<R: Runtime> NativeAuth<R> {
    /// `instance` and generation are created by the Rust owner. URL is RAM-only.
    pub async fn open(
        &self,
        app: &tauri::AppHandle<R>,
        instance: &str,
        generation: u64,
        url: &str,
        handler: Handler,
    ) -> Result<(), ()> {
        #[cfg(target_os = "android")]
        {
            handlers()
                .lock()
                .map_err(|_| ())?
                .insert(instance.to_owned(), (generation, handler));
            let _: serde_json::Value = self.handle.run_mobile_plugin_async("open", serde_json::json!({
                "instance": instance, "generation": generation.to_string(), "url": url, "events": self.events
            })).await.map_err(|_| ())?;
            let _ = app;
            return Ok(());
        }
        #[cfg(target_os = "macos")]
        {
            return macos::open(app, instance, generation, url, handler);
        }
        #[cfg(not(any(target_os = "macos", target_os = "android")))]
        {
            let _ = (app, instance, generation, url, handler);
            Err(())
        }
    }
    /// Disarm owner callbacks before queuing native teardown. A native high-water
    /// mark also prevents a late queued open from resurrecting a retired attempt.
    pub fn close(&self, app: &tauri::AppHandle<R>, instance: &str, generation: u64) {
        if let Ok(mut map) = handlers().lock() {
            map.remove(instance);
        }
        #[cfg(target_os = "android")]
        {
            let handle = self.handle.clone();
            let instance = instance.to_owned();
            tauri::async_runtime::spawn(async move {
                let _: Result<serde_json::Value, _> = handle
                    .run_mobile_plugin_async(
                        "close",
                        serde_json::json!({
                            "instance": instance, "generation": generation.to_string()
                        }),
                    )
                    .await;
            });
        }
        #[cfg(target_os = "macos")]
        macos::close(app, instance, generation);
        let _ = (app, instance, generation);
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::*;
    use std::ffi::{c_char, CStr, CString};
    extern "C" {
        fn notes_auth_open(instance: *const c_char, generation: u64, url: *const c_char) -> i32;
        fn notes_auth_close(instance: *const c_char, generation: u64);
    }
    #[no_mangle]
    extern "C" fn notes_auth_event(instance: *const c_char, kind: i32, url: *const c_char) {
        if instance.is_null() {
            return;
        }
        let Ok(id) = (unsafe { CStr::from_ptr(instance) }).to_str() else {
            return;
        };
        let handler = handlers().lock().ok().and_then(|map| map.get(id).cloned());
        if let Some((_generation, handler)) = handler {
            let event = match kind {
                0 => Event::Opened,
                1 => Event::Closed,
                2 => Event::Continue,
                // Callback URLs never cross IPC or get formatted into logs.
                3 if !url.is_null() => match unsafe { CStr::from_ptr(url) }.to_str() {
                    Ok(url) => Event::Callback(url.to_owned()),
                    Err(_) => Event::Failed,
                },
                _ => Event::Failed,
            };
            handler(event);
        }
    }
    pub fn open<R: Runtime>(
        app: &tauri::AppHandle<R>,
        instance: &str,
        generation: u64,
        url: &str,
        handler: Handler,
    ) -> Result<(), ()> {
        let id = CString::new(instance).map_err(|_| ())?;
        let url = CString::new(url).map_err(|_| ())?;
        handlers()
            .lock()
            .map_err(|_| ())?
            .insert(instance.to_owned(), (generation, handler.clone()));
        let key = instance.to_owned();
        if app
            .run_on_main_thread(move || {
                // close() may already have disarmed this queued creation.
                if !handlers().lock().is_ok_and(|map| map.contains_key(&key)) {
                    return;
                }
                if unsafe { notes_auth_open(id.as_ptr(), generation, url.as_ptr()) } != 0 {
                    handler(Event::Failed);
                }
            })
            .is_err()
        {
            if let Ok(mut map) = handlers().lock() {
                map.remove(instance);
            }
            return Err(());
        }
        Ok(())
    }
    pub fn close<R: Runtime>(app: &tauri::AppHandle<R>, instance: &str, generation: u64) {
        if let Ok(mut map) = handlers().lock() {
            map.remove(instance);
        }
        if let Ok(id) = CString::new(instance) {
            let _ = app
                .run_on_main_thread(move || unsafe { notes_auth_close(id.as_ptr(), generation) });
        }
    }
}
