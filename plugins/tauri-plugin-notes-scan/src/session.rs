//! Headless desktop session backend. Android uses the same wire contract in SessionStore.kt.
use crate::{Request, Result, ScanError};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs::{self, File},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

pub const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;
pub const MAX_READ_BYTES: u32 = 256 * 1024;
pub const MAX_SESSION_BYTES: u64 = 128 * 1024 * 1024;
pub const SESSION_TTL_MS: u64 = 24 * 60 * 60 * 1000;
const MAX_SESSIONS: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Text,
    Document,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScanFile {
    pub token: String,
    pub mime: String,
    pub size: u64,
    pub width: u32,
    pub height: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    pub version: u32,
    pub session_id: String,
    pub mode: Mode,
    pub state: String,
    pub created_at: u64,
    pub updated_at: u64,
    pub files: Vec<ScanFile>,
    pub pages: Vec<Value>,
    pub ocr: Option<Value>,
    pub pdf_token: Option<String>,
}
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}
fn token() -> String {
    Uuid::new_v4().to_string()
}
fn validate_id(s: &str) -> Result<()> {
    if Uuid::parse_str(s).is_err() || s.len() != 36 {
        return Err(ScanError::new("invalid_token", "无效扫描 token"));
    }
    Ok(())
}
pub struct SessionStore {
    root: PathBuf,
}
impl SessionStore {
    /// Trusted host-only root. Never expose this constructor as a path-taking IPC command.
    pub fn open(root: PathBuf) -> Result<Self> {
        fs::create_dir_all(&root)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&root, fs::Permissions::from_mode(0o700))?;
        }
        let store = Self {
            root: root.canonicalize()?,
        };
        store.cleanup()?;
        Ok(store)
    }
    fn dir(&self, id: &str) -> Result<PathBuf> {
        validate_id(id)?;
        let p = self.root.join(id);
        let meta = fs::symlink_metadata(&p).map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                ScanError::new("session_missing", "扫描会话已过期或不存在")
            } else {
                e.into()
            }
        })?;
        if !meta.is_dir() || meta.file_type().is_symlink() {
            return Err(ScanError::new("invalid_token", "无效会话目录"));
        }
        Ok(p)
    }
    fn load(&self, id: &str) -> Result<Manifest> {
        let path = self.dir(id)?.join("manifest.json");
        if fs::symlink_metadata(&path)?.file_type().is_symlink()
            || fs::metadata(&path)?.len() > 1024 * 1024
        {
            return Err(ScanError::new("invalid_manifest", "无效会话清单"));
        }
        let m: Manifest = serde_json::from_slice(&fs::read(path)?)?;
        if m.version != 1 || m.session_id != id {
            return Err(ScanError::new("invalid_manifest", "扫描版本或身份不符"));
        }
        if now().saturating_sub(m.updated_at) > SESSION_TTL_MS {
            return Err(ScanError::new("session_expired", "扫描会话已过期"));
        }
        Ok(m)
    }
    fn save(&self, m: &Manifest) -> Result<()> {
        let dir = self.dir(&m.session_id)?;
        let bytes = serde_json::to_vec(m)?;
        if bytes.len() > 1024 * 1024 {
            return Err(ScanError::new("result_limit", "扫描元数据超过1 MiB"));
        }
        let temp = dir.join("manifest.new");
        let mut f = File::create(&temp)?;
        f.write_all(&bytes)?;
        f.sync_all()?;
        fs::rename(temp, dir.join("manifest.json"))?;
        File::open(dir)?.sync_all()?;
        Ok(())
    }
    fn require_draft(m: &Manifest) -> Result<()> {
        if m.state != "draft" {
            return Err(ScanError::new(
                "session_state",
                "扫描已经完成，不能继续修改",
            ));
        }
        Ok(())
    }
    fn file_path(&self, m: &Manifest, id: &str) -> Result<PathBuf> {
        validate_id(id)?;
        if !m.files.iter().any(|f| f.token == id) {
            return Err(ScanError::new("file_missing", "文件不属于此扫描会话"));
        }
        let p = self.dir(&m.session_id)?.join(id);
        let meta = fs::symlink_metadata(&p)?;
        if !meta.is_file() || meta.file_type().is_symlink() {
            return Err(ScanError::new("invalid_token", "无效扫描文件"));
        }
        Ok(p)
    }
    pub fn execute(&mut self, request: Request) -> Result<Value> {
        match request {
            Request::Begin { mode } => {
                if mode != Mode::Text {
                    return Err(ScanError::new(
                        "unsupported",
                        "此桌面模块只支持本地图片文字识别",
                    ));
                }
                self.cleanup()?;
                if fs::read_dir(&self.root)?.count() >= MAX_SESSIONS {
                    return Err(ScanError::new("session_limit", "扫描会话数量已达上限"));
                }
                let id = token();
                fs::create_dir(self.root.join(&id))?;
                let m = Manifest {
                    version: 1,
                    session_id: id,
                    mode,
                    state: "draft".into(),
                    created_at: now(),
                    updated_at: now(),
                    files: vec![],
                    pages: vec![],
                    ocr: None,
                    pdf_token: None,
                };
                self.save(&m)?;
                Ok(json!(m))
            }
            Request::Get { session_id } => Ok(json!(self.load(&session_id)?)),
            Request::IngestImage { session_id, data } => {
                let mut m = self.load(&session_id)?;
                Self::require_draft(&m)?;
                if data.len() > MAX_IMAGE_BYTES.div_ceil(3) * 4 {
                    return Err(ScanError::new("image_limit", "图片超过20 MiB"));
                }
                let bytes = B64
                    .decode(data)
                    .map_err(|_| ScanError::new("invalid_image", "图像编码无效"))?;
                if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES {
                    return Err(ScanError::new("image_limit", "图片为空或超过20 MiB"));
                }
                if m.files.len() >= 32 {
                    return Err(ScanError::new("page_limit", "文件数量已达上限"));
                }
                let dir = self.dir(&session_id)?;
                let id = token();
                let input = dir.join(format!("{id}.input"));
                let output = dir.join(&id);
                fs::write(&input, bytes)?;
                let result = normalize(&input, &output);
                let _ = fs::remove_file(input);
                let dims = match result {
                    Ok(v) => v,
                    Err(e) => {
                        let _ = fs::remove_file(output);
                        return Err(e);
                    }
                };
                let size = fs::metadata(&output)?.len();
                if size + m.files.iter().map(|f| f.size).sum::<u64>() > MAX_SESSION_BYTES {
                    fs::remove_file(output)?;
                    return Err(ScanError::new("session_limit", "扫描会话超过128 MiB"));
                }
                m.files.push(ScanFile {
                    token: id,
                    mime: "image/png".into(),
                    size,
                    width: dims.0,
                    height: dims.1,
                });
                m.updated_at = now();
                self.save(&m)?;
                Ok(json!(m))
            }
            Request::Recognize {
                session_id,
                file_token,
            } => {
                let mut m = self.load(&session_id)?;
                Self::require_draft(&m)?;
                let file = self.file_path(&m, &file_token)?;
                let result = recognize(&file);
                m.ocr = Some(match &result {
                    Ok(value) => {
                        let mut value = value.clone();
                        value["fileToken"] = json!(file_token);
                        value
                    }
                    Err(error) => json!({"status":"failed","fileToken":file_token,"error":error}),
                });
                m.updated_at = now();
                self.save(&m)?;
                result?;
                Ok(json!(m))
            }
            Request::Finish { session_id } => {
                let mut m = self.load(&session_id)?;
                Self::require_draft(&m)?;
                if m.mode != Mode::Text {
                    return Err(ScanError::new(
                        "unsupported",
                        "此桌面模块仅提供本地图片文字识别",
                    ));
                }
                if !m
                    .ocr
                    .as_ref()
                    .and_then(|o| o["status"].as_str())
                    .is_some_and(|s| ["recognized", "empty"].contains(&s))
                {
                    return Err(ScanError::new(
                        "not_recognized",
                        "请先成功识别文字（可为空结果）",
                    ));
                }
                m.state = "ready".into();
                m.updated_at = now();
                self.save(&m)?;
                Ok(json!(m))
            }
            Request::ReadFile {
                session_id,
                file_token,
                offset,
                length,
            } => {
                if length == 0 || length > MAX_READ_BYTES {
                    return Err(ScanError::new("read_limit", "单次读取应为1至256 KiB"));
                }
                let m = self.load(&session_id)?;
                let path = self.file_path(&m, &file_token)?;
                let mut f = File::open(path)?;
                let size = f.metadata()?.len();
                if offset > size {
                    return Err(ScanError::new("invalid_offset", "读取位置超出文件"));
                }
                f.seek(SeekFrom::Start(offset))?;
                let mut data = vec![0; (size - offset).min(length as u64) as usize];
                f.read_exact(&mut data)?;
                Ok(
                    json!({"data":B64.encode(&data),"offset":offset,"nextOffset":offset+data.len() as u64,"eof":offset+data.len() as u64==size}),
                )
            }
            Request::Acknowledge { session_id } => {
                let m = self.load(&session_id)?;
                if m.state != "ready" {
                    return Err(ScanError::new("session_state", "只能确认已经完成的扫描"));
                }
                fs::remove_dir_all(self.dir(&session_id)?)?;
                Ok(json!({"removed":true}))
            }
            Request::Cancel { session_id } => {
                let dir = self.dir(&session_id)?;
                fs::remove_dir_all(dir)?;
                Ok(json!({"removed":true}))
            }
            Request::Cleanup => Ok(json!({"removedSessions":self.cleanup()?})),
            Request::PickImage { .. }
            | Request::OpenCamera { .. }
            | Request::CropPage { .. }
            | Request::MovePage { .. }
            | Request::DeletePage { .. }
            | Request::RotatePage { .. } => Err(ScanError::new(
                "unsupported",
                "此操作只在 Android 原生模块可用；Mac通过受控图片字节识别",
            )),
        }
    }
    pub fn cleanup(&self) -> Result<usize> {
        let mut count = 0;
        for entry in fs::read_dir(&self.root)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if validate_id(&name).is_err()
                || !entry.file_type()?.is_dir()
                || entry.file_type()?.is_symlink()
            {
                continue;
            }
            // Malformed/incomplete sessions are removed only after their directory TTL, never on parse error alone.
            let modified = entry
                .metadata()?
                .modified()?
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;
            let manifest = entry.path().join("manifest.json");
            let updated = fs::symlink_metadata(&manifest)
                .ok()
                .filter(|m| m.is_file() && !m.file_type().is_symlink() && m.len() <= 1024 * 1024)
                .and_then(|_| fs::read(&manifest).ok())
                .and_then(|v| serde_json::from_slice::<Manifest>(&v).ok())
                .map(|m| m.updated_at)
                .unwrap_or(modified);
            if now().saturating_sub(updated) > SESSION_TTL_MS {
                fs::remove_dir_all(entry.path())?;
                count += 1;
            }
        }
        Ok(count)
    }
}

#[cfg(target_os = "macos")]
fn native_call(input: &Path, output: Option<&Path>) -> Result<Value> {
    use std::ffi::{CStr, CString};
    unsafe extern "C" {
        fn notes_scan_normalize(
            input: *const std::ffi::c_char,
            output: *const std::ffi::c_char,
        ) -> *mut std::ffi::c_char;
        fn notes_scan_recognize(input: *const std::ffi::c_char) -> *mut std::ffi::c_char;
        fn notes_scan_free(value: *mut std::ffi::c_char);
    }
    let input = CString::new(input.to_string_lossy().as_bytes())
        .map_err(|_| ScanError::new("io", "无效私有路径"))?;
    let output = output
        .map(|p| CString::new(p.to_string_lossy().as_bytes()))
        .transpose()
        .map_err(|_| ScanError::new("io", "无效私有路径"))?;
    let ptr = unsafe {
        match output {
            Some(ref out) => notes_scan_normalize(input.as_ptr(), out.as_ptr()),
            None => notes_scan_recognize(input.as_ptr()),
        }
    };
    if ptr.is_null() {
        return Err(ScanError::new("native", "Vision未返回结果"));
    }
    let bytes = unsafe { CStr::from_ptr(ptr).to_bytes().to_vec() };
    unsafe {
        notes_scan_free(ptr);
    }
    let v: Value = serde_json::from_slice(&bytes)?;
    if let Some(e) = v.get("error") {
        return Err(serde_json::from_value(e.clone())?);
    }
    Ok(v)
}
#[cfg(target_os = "macos")]
fn normalize(input: &Path, output: &Path) -> Result<(u32, u32)> {
    let v = native_call(input, Some(output))?;
    let w = v["width"]
        .as_u64()
        .ok_or_else(|| ScanError::new("native", "缺少图像宽度"))?;
    let h = v["height"]
        .as_u64()
        .ok_or_else(|| ScanError::new("native", "缺少图像高度"))?;
    Ok((w as u32, h as u32))
}
#[cfg(target_os = "macos")]
fn recognize(input: &Path) -> Result<Value> {
    native_call(input, None)
}
#[cfg(not(target_os = "macos"))]
fn normalize(_: &Path, _: &Path) -> Result<(u32, u32)> {
    Err(ScanError::new("unsupported", "桌面OCR仅支持macOS"))
}
#[cfg(not(target_os = "macos"))]
fn recognize(_: &Path) -> Result<Value> {
    Err(ScanError::new("unsupported", "桌面OCR仅支持macOS"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sessions_reopen_and_tokens_cannot_cross_or_escape() {
        let root = tempfile::tempdir().unwrap();
        let mut store = SessionStore::open(root.path().into()).unwrap();
        let m = store.execute(Request::Begin { mode: Mode::Text }).unwrap();
        let id = m["sessionId"].as_str().unwrap().to_string();
        drop(store);
        let mut store = SessionStore::open(root.path().into()).unwrap();
        assert_eq!(
            store
                .execute(Request::Get {
                    session_id: id.clone()
                })
                .unwrap()["state"],
            "draft"
        );
        assert_eq!(
            store
                .execute(Request::Get {
                    session_id: "../secret".into()
                })
                .unwrap_err()
                .code,
            "invalid_token"
        );
        assert_eq!(
            store
                .execute(Request::ReadFile {
                    session_id: id.clone(),
                    file_token: token(),
                    offset: 0,
                    length: 10
                })
                .unwrap_err()
                .code,
            "file_missing"
        );
        assert_eq!(
            store
                .execute(Request::Acknowledge {
                    session_id: id.clone()
                })
                .unwrap_err()
                .code,
            "session_state"
        );
        assert_eq!(
            store
                .execute(Request::Finish {
                    session_id: id.clone()
                })
                .unwrap_err()
                .code,
            "not_recognized"
        );
        store
            .execute(Request::Cancel {
                session_id: id.clone(),
            })
            .unwrap();
        assert_eq!(
            store
                .execute(Request::Get { session_id: id })
                .unwrap_err()
                .code,
            "session_missing"
        );
    }
    #[test]
    fn expired_sessions_removed_and_symlink_files_denied() {
        let root = tempfile::tempdir().unwrap();
        let mut store = SessionStore::open(root.path().into()).unwrap();
        let v = store.execute(Request::Begin { mode: Mode::Text }).unwrap();
        let id = v["sessionId"].as_str().unwrap();
        let mut m = store.load(id).unwrap();
        m.updated_at = 0;
        store.save(&m).unwrap();
        assert_eq!(
            store
                .execute(Request::Get {
                    session_id: id.into()
                })
                .unwrap_err()
                .code,
            "session_expired"
        );
        assert_eq!(store.cleanup().unwrap(), 1);
        #[cfg(unix)]
        {
            let id = token();
            std::os::unix::fs::symlink(root.path(), root.path().join(&id)).unwrap();
            assert_eq!(
                store
                    .execute(Request::Get { session_id: id })
                    .unwrap_err()
                    .code,
                "invalid_token"
            );
        }
    }
}
