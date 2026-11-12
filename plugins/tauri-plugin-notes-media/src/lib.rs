//! Host-only bounded derivative decoding. No invoke handler or JS permissions.
use std::{
    fs::File,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};
pub struct Frame {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}
pub struct Provider<R: Runtime> {
    busy: Arc<AtomicBool>,
    #[cfg(target_os = "android")]
    handle: tauri::plugin::PluginHandle<R>,
    marker: std::marker::PhantomData<fn() -> R>,
}
impl<R: Runtime> Provider<R> {
    /// Only the host supplies an already verified File. A duplicate is owned
    /// until the native operation ends, including a late timeout completion.
    pub fn thumbnail(
        &self,
        file: &File,
        bytes: u64,
        mime: &str,
        pixels: u32,
        input_pixels: u64,
        cancelled: impl Fn() -> bool,
    ) -> Result<Frame, String> {
        if !(1..=1024).contains(&pixels)
            || bytes == 0
            || bytes > 100 * 1024 * 1024
            || input_pixels == 0
            || input_pixels > 24_000_000
        {
            return Err("invalid".into());
        }
        let file = file.try_clone().map_err(|_| "media_io")?;
        if self.busy.swap(true, Ordering::AcqRel) {
            return Err("media_busy".into());
        }
        let busy = self.busy.clone();
        let mime = mime.to_owned();
        #[cfg(target_os = "android")]
        let handle = self.handle.clone();
        let (tx, rx) = std::sync::mpsc::sync_channel(1);
        let started = std::thread::Builder::new()
            .name("notes-media-decode".into())
            .spawn(move || {
                struct Guard(Arc<AtomicBool>);
                impl Drop for Guard {
                    fn drop(&mut self) {
                        self.0.store(false, Ordering::Release);
                    }
                }
                let _guard = Guard(busy);
                #[cfg(target_os = "macos")]
                let result = macos(&file, bytes, &mime, pixels, input_pixels);
                #[cfg(target_os = "android")]
                let result = android(&handle, &file, bytes, &mime, pixels, input_pixels);
                #[cfg(not(any(target_os = "macos", target_os = "android")))]
                let result = {
                    let _ = (file, bytes, mime, pixels, input_pixels);
                    Err("unsupported_media".into())
                };
                let _ = tx.send(result);
            });
        if started.is_err() {
            self.busy.store(false, Ordering::Release);
            return Err("media_io".into());
        }
        // A timeout never starts another worker while the OS decoder still runs.
        let start = std::time::Instant::now();
        loop {
            if cancelled() || start.elapsed() >= Duration::from_secs(10) {
                return Err("cancelled".into());
            }
            match rx.recv_timeout(Duration::from_millis(50)) {
                Ok(frame) => {
                    if cancelled() {
                        return Err("cancelled".into());
                    }
                    return frame;
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
                Err(_) => return Err("media_io".into()),
            }
        }
    }
}
#[cfg(target_os = "macos")]
fn macos(
    file: &File,
    bytes: u64,
    mime: &str,
    pixels: u32,
    input_pixels: u64,
) -> Result<Frame, String> {
    use std::os::fd::AsRawFd;
    unsafe extern "C" {
        fn notes_media_thumbnail(
            fd: i32,
            bytes: u64,
            video: i32,
            pixels: u32,
            input_pixels: u64,
            out: *mut u8,
            capacity: usize,
            width: *mut u32,
            height: *mut u32,
        ) -> i32;
    }
    let mut rgba = vec![0u8; pixels as usize * pixels as usize * 4];
    let (mut width, mut height) = (0, 0);
    let status = unsafe {
        notes_media_thumbnail(
            file.as_raw_fd(),
            bytes,
            mime.starts_with("video/") as i32,
            pixels,
            input_pixels,
            rgba.as_mut_ptr(),
            rgba.len(),
            &mut width,
            &mut height,
        )
    };
    if status != 0 {
        return Err(if status == 3 {
            "cancelled"
        } else {
            "unsupported_media"
        }
        .into());
    }
    if width == 0 || height == 0 || width > pixels || height > pixels {
        return Err("invalid".into());
    }
    rgba.truncate(width as usize * height as usize * 4);
    // CoreGraphics supplies premultiplied RGBA; the shared PNG encoder expects straight alpha.
    for p in rgba.chunks_exact_mut(4) {
        let a = p[3] as u32;
        if a > 0 && a < 255 {
            for c in &mut p[..3] {
                *c = ((*c as u32 * 255 + a / 2) / a).min(255) as u8;
            }
        }
    }
    Ok(Frame {
        width,
        height,
        rgba,
    })
}
#[cfg(target_os = "android")]
fn android<R: Runtime>(
    handle: &tauri::plugin::PluginHandle<R>,
    file: &File,
    bytes: u64,
    mime: &str,
    pixels: u32,
    input_pixels: u64,
) -> Result<Frame, String> {
    use base64::Engine;
    use std::os::fd::AsRawFd;
    let value:serde_json::Value=handle.run_mobile_plugin("thumbnail",serde_json::json!({"fd":file.as_raw_fd(),"bytes":bytes,"mime":mime,"pixels":pixels,"inputPixels":input_pixels})).map_err(|_|"unsupported_media")?;
    let width = value["width"].as_u64().ok_or("invalid")?;
    let height = value["height"].as_u64().ok_or("invalid")?;
    if width == 0 || height == 0 || width > pixels as u64 || height > pixels as u64 {
        return Err("invalid".into());
    }
    let encoded = value["rgba"].as_str().ok_or("invalid")?;
    let count = width as usize * height as usize * 4;
    if encoded.len() > (count + 2) / 3 * 4 {
        return Err("invalid".into());
    }
    let rgba = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| "invalid")?;
    if rgba.len() != count {
        return Err("invalid".into());
    }
    Ok(Frame {
        width: width as u32,
        height: height as u32,
        rgba,
    })
}
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("notes-media")
        .setup(|app, _api| {
            app.manage(Provider::<R> {
                busy: Arc::new(AtomicBool::new(false)),
                #[cfg(target_os = "android")]
                handle: _api.register_android_plugin("com.local.notesmedia", "NotesMediaPlugin")?,
                marker: std::marker::PhantomData,
            });
            Ok(())
        })
        .build()
}
