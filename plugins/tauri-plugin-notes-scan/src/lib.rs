pub mod session;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime, State,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanError {
    pub code: String,
    pub message: String,
}
impl ScanError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}
impl std::fmt::Display for ScanError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for ScanError {}
impl From<std::io::Error> for ScanError {
    fn from(e: std::io::Error) -> Self {
        Self::new("io", e.to_string())
    }
}
impl From<serde_json::Error> for ScanError {
    fn from(e: serde_json::Error) -> Self {
        Self::new("invalid_manifest", e.to_string())
    }
}
pub type Result<T> = std::result::Result<T, ScanError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Corner {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "operation",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Request {
    Begin {
        mode: session::Mode,
    },
    Get {
        session_id: String,
    },
    IngestImage {
        session_id: String,
        data: String,
    },
    PickImage {
        session_id: String,
    },
    OpenCamera {
        session_id: String,
    },
    CropPage {
        session_id: String,
        file_token: String,
        corners: Vec<Corner>,
        filter: String,
        page_id: Option<String>,
    },
    MovePage {
        session_id: String,
        from: u32,
        to: u32,
    },
    DeletePage {
        session_id: String,
        page_id: String,
    },
    RotatePage {
        session_id: String,
        page_id: String,
    },
    Recognize {
        session_id: String,
        file_token: String,
    },
    Finish {
        session_id: String,
    },
    ReadFile {
        session_id: String,
        file_token: String,
        offset: u64,
        length: u32,
    },
    Acknowledge {
        session_id: String,
    },
    Cancel {
        session_id: String,
    },
    Cleanup,
}

pub struct NotesScan<R: Runtime> {
    #[cfg(target_os = "android")]
    handle: tauri::plugin::PluginHandle<R>,
    #[cfg(not(target_os = "android"))]
    store: std::sync::Arc<std::sync::Mutex<session::SessionStore>>,
    marker: std::marker::PhantomData<fn() -> R>,
}

#[tauri::command]
async fn execute<R: Runtime>(
    _app: tauri::AppHandle<R>,
    state: State<'_, NotesScan<R>>,
    request: Request,
) -> Result<Value> {
    state.execute(request).await
}

impl<R: Runtime> NotesScan<R> {
    /// Trusted host integration uses this directly; file bytes need not pass through the WebView.
    pub async fn execute(&self, request: Request) -> Result<Value> {
        #[cfg(target_os = "android")]
        {
            self.handle
                .run_mobile_plugin_async("execute", request)
                .await
                .map_err(|e| match e {
                    tauri::plugin::mobile::PluginInvokeError::InvokeRejected(response) => {
                        ScanError::new(
                            response.code.as_deref().unwrap_or("native"),
                            response.message.unwrap_or_else(|| "原生扫描失败".into()),
                        )
                    }
                    other => ScanError::new("native", other.to_string()),
                })
        }
        #[cfg(not(target_os = "android"))]
        {
            let store = self.store.clone();
            tauri::async_runtime::spawn_blocking(move || {
                store
                    .lock()
                    .map_err(|_| ScanError::new("state", "扫描会话锁损坏"))?
                    .execute(request)
            })
            .await
            .map_err(|e| ScanError::new("worker", e.to_string()))?
        }
    }

    /// Destination is a host-chosen staging path, NOT a WebView argument. Requires ready state.
    /// Commit all host metadata/attachments first, then acknowledge the native session.
    pub async fn copy_file_to(
        &self,
        session_id: &str,
        file_token: &str,
        destination: &std::path::Path,
    ) -> Result<u64> {
        use base64::Engine;
        use std::io::Write;
        let manifest = self
            .execute(Request::Get {
                session_id: session_id.into(),
            })
            .await?;
        if manifest["state"] != "ready" {
            return Err(ScanError::new("session_state", "请先完成扫描"));
        }
        let expected = manifest["files"]
            .as_array()
            .and_then(|files| files.iter().find(|f| f["token"] == file_token))
            .and_then(|f| f["size"].as_u64())
            .ok_or_else(|| ScanError::new("file_missing", "文件不属于此扫描会话"))?;
        if expected > session::MAX_SESSION_BYTES {
            return Err(ScanError::new("session_limit", "文件超出会话限制"));
        }
        let mut out = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(destination)?;
        let result = async {
            let mut offset = 0;
            loop {
                let chunk = self
                    .execute(Request::ReadFile {
                        session_id: session_id.into(),
                        file_token: file_token.into(),
                        offset,
                        length: session::MAX_READ_BYTES,
                    })
                    .await?;
                let data = base64::engine::general_purpose::STANDARD
                    .decode(
                        chunk["data"]
                            .as_str()
                            .ok_or_else(|| ScanError::new("native", "缺少文件数据"))?,
                    )
                    .map_err(|_| ScanError::new("native", "无效文件数据"))?;
                let next = chunk["nextOffset"]
                    .as_u64()
                    .ok_or_else(|| ScanError::new("native", "缺少文件偏移"))?;
                let eof = chunk["eof"]
                    .as_bool()
                    .ok_or_else(|| ScanError::new("native", "缺少文件结束状态"))?;
                if data.len() > session::MAX_READ_BYTES as usize
                    || next != offset + data.len() as u64
                    || next > expected
                    || (next == offset && next != expected)
                    || eof != (next == expected)
                {
                    return Err(ScanError::new("native", "文件读取长度不一致"));
                }
                out.write_all(&data)?;
                offset = next;
                if eof {
                    if offset != expected {
                        return Err(ScanError::new("native", "文件不完整"));
                    }
                    break;
                }
            }
            out.sync_all()?;
            Ok(expected)
        }
        .await;
        if result.is_err() {
            drop(out);
            let _ = std::fs::remove_file(destination);
        }
        result
    }
}

pub trait NotesScanExt<R: Runtime> {
    fn notes_scan(&self) -> State<'_, NotesScan<R>>;
}
impl<R: Runtime, T: Manager<R>> NotesScanExt<R> for T {
    fn notes_scan(&self) -> State<'_, NotesScan<R>> {
        self.state::<NotesScan<R>>()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("notes-scan")
        .invoke_handler(tauri::generate_handler![execute])
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            let state = NotesScan {
                handle: api.register_android_plugin("com.local.notesscan", "NotesScanPlugin")?,
                marker: std::marker::PhantomData,
            };
            #[cfg(not(target_os = "android"))]
            let state = {
                let _ = api;
                NotesScan::<R> {
                    store: std::sync::Arc::new(std::sync::Mutex::new(session::SessionStore::open(
                        app.path().app_data_dir()?.join("scan-sessions"),
                    )?)),
                    marker: std::marker::PhantomData,
                }
            };
            app.manage(state);
            Ok(())
        })
        .build()
}
