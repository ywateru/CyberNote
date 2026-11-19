use super::*;
use crate::local_backup::{
    self as backup, BackupCaller, BackupIntent, BackupPorts, CheckedAuthority,
};
use serde::Deserialize;
use std::io::Read;
#[cfg(target_os = "android")]
use std::io::Write;
pub(super) struct Prepared {
    authority: CheckedAuthority,
    bytes: Vec<u8>,
    expires: Instant,
    instance: uuid::Uuid,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ArchiveRequest {
    operation: String,
    path: Option<String>,
    passphrase: Option<String>,
    confirmation: Option<String>,
}
impl Host {
    fn archive_authority(self: &Arc<Self>, expected: &Token) -> Result<CheckedAuthority> {
        let caller = BackupCaller::Window {
            label: "main".into(),
            expected: backup::ExpectedSession {
                session_id: expected.session_id.clone(),
                epoch: expected.epoch,
                note_epoch: expected.note_epoch,
            },
        };
        tauri::async_runtime::block_on(self.authorize(&caller, BackupIntent::Restore))
            .map_err(|e| error(&e.message))
    }
    fn read_document(&self, path: &str, token: &Token) -> Result<Vec<u8>> {
        self.with(|s| self.check(s, token, "main"))?;
        #[cfg(target_os = "android")]
        let stage = self.with(|s| s.import_stage(token))?;
        #[cfg(target_os = "android")]
        if path.starts_with("content://") {
            crate::copy_document(
                &self.app,
                path,
                &stage,
                "read",
                backup::MAX_ENCRYPTED_ARCHIVE_BYTES as u64,
                None,
            )?;
            return std::fs::read(stage.path()).map_err(Into::into);
        }
        if path.contains("://") {
            return Err(error("不支持的文档地址"));
        }
        let meta = std::fs::symlink_metadata(path)?;
        if !meta.is_file()
            || meta.file_type().is_symlink()
            || meta.len() > backup::MAX_ENCRYPTED_ARCHIVE_BYTES as u64
        {
            return Err(error("备份文件无效或超过大小限制"));
        }
        let mut bytes = Vec::new();
        let mut options = std::fs::OpenOptions::new();
        options.read(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.custom_flags(libc::O_NOFOLLOW);
        }
        let file = options.open(path)?;
        if !file.metadata()?.is_file() {
            return Err(error("备份必须是普通文件"));
        }
        file.take(backup::MAX_ENCRYPTED_ARCHIVE_BYTES as u64 + 1)
            .read_to_end(&mut bytes)?;
        if bytes.len() > backup::MAX_ENCRYPTED_ARCHIVE_BYTES {
            return Err(error("备份文件超过大小限制"));
        }
        Ok(bytes)
    }
    fn write_document(&self, path: &str, token: &Token, bytes: &[u8]) -> Result<()> {
        #[cfg(target_os = "android")]
        if path.starts_with("content://") {
            let stage = self.with(|s| s.import_stage(token))?;
            let mut file = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(stage.path())?;
            file.write_all(bytes)?;
            file.sync_all()?;
            drop(file);
            return crate::copy_document(
                &self.app,
                path,
                &stage,
                "write",
                backup::MAX_ENCRYPTED_ARCHIVE_BYTES as u64,
                Some(bytes.len() as u64),
            )
            .map(|_| ());
        }
        if path.contains("://") {
            return Err(error("不支持的文档地址"));
        }
        self.with(|s| {
            self.check(s, token, "main")?;
            s.store.publish_export(std::path::Path::new(path), bytes)
        })
    }
    fn archive(self: &Arc<Self>, expected: Token, request: ArchiveRequest) -> Result<Value> {
        let authority = self.archive_authority(&expected)?;
        match request.operation.as_str() {
            "export" => {
                let path = request.path.ok_or_else(|| error("缺少导出位置"))?;
                let snapshot = self.snapshot(&authority)?;
                let bytes = if let Some(pass) = request.passphrase {
                    backup::seal_archive(&snapshot.bytes, &pass).map_err(|e| error(&e.message))?
                } else {
                    snapshot.bytes
                };
                self.write_document(&path, &expected, &bytes)?;
                Ok(json!({"status":"success"}))
            }
            "preview" => {
                let path = request.path.ok_or_else(|| error("缺少导入文件"))?;
                let bytes = self.read_document(&path, &expected)?;
                let bytes = if let Some(pass) = request.passphrase {
                    backup::open_encrypted_archive(&bytes, &pass).map_err(|e| error(&e.message))?
                } else {
                    bytes
                };
                let preview = self.preview(&authority, &bytes)?;
                let confirmation = uuid::Uuid::new_v4().to_string();
                let instance = self.with(|s| Ok(s.store.sync_store_instance()))?;
                let mut prepared = self.prepared.lock().map_err(|_| error("预览状态不可读"))?;
                prepared.retain(|_, p| p.expires > Instant::now());
                if prepared.len() >= 4 {
                    return Err(error("待确认归档过多，请关闭旧预览"));
                }
                let target_store = authority.target_store.clone();
                let payload_sha256 = crate::sync::model::sha256(&bytes);
                prepared.insert(
                    confirmation.clone(),
                    Prepared {
                        authority,
                        bytes,
                        expires: Instant::now() + Duration::from_secs(300),
                        instance,
                    },
                );
                Ok(
                    json!({"confirmation":confirmation,"archive":preview,"expiresAtMs":lifecycle::now()+300000,"targetStore":target_store,"payloadSha256":payload_sha256}),
                )
            }
            "confirm" => {
                let key = request.confirmation.ok_or_else(|| error("缺少预览确认"))?;
                let prepared = self
                    .prepared
                    .lock()
                    .map_err(|_| error("预览状态不可读"))?
                    .remove(&key)
                    .ok_or_else(|| error("预览已失效"))?;
                if prepared.expires <= Instant::now()
                    || prepared.authority.session.session_id != expected.session_id
                    || prepared.authority.session.epoch != expected.epoch
                    || self.with(|s| Ok(s.store.sync_store_instance()))? != prepared.instance
                {
                    return Err(error("预览后资料库或授权已变化"));
                }
                let imported = self.restore_with(prepared.authority, prepared.bytes, |snapshot| {
                    let config_root =
                        backup::files::Directory::open(&self.root.join(".local-backup"), true)
                            .map_err(|e| error(&e.message))?;
                    let (config, _) =
                        backup::files::load_config(&config_root).map_err(|e| error(&e.message))?;
                    let directory = backup::files::Directory::open(
                        &config.directory(&self.root.join("backups")),
                        true,
                    )
                    .map_err(|e| error(&e.message))?;
                    backup::files::publish(
                        &directory,
                        &snapshot.bytes,
                        &snapshot.library_id,
                        env!("CARGO_PKG_VERSION"),
                        lifecycle::now(),
                        backup::BackupReason::BeforeRestore,
                        config.keep,
                    )
                    .map_err(|e| error(&e.message))?;
                    Ok(())
                });
                match imported {
                    Ok(delivery) => Ok(
                        json!({"delivery":delivery,"outcome":"committed","maintenanceError":null}),
                    ),
                    Err(e) if e.commit.is_some() => Ok(
                        json!({"delivery":e.commit,"outcome":"committed","maintenanceError":{"code":e.code,"message":e.message}}),
                    ),
                    Err(e) => Err(e),
                }
            }
            "discard" => {
                if let Some(key) = request.confirmation {
                    self.prepared
                        .lock()
                        .map_err(|_| error("预览状态不可读"))?
                        .remove(&key);
                }
                Ok(json!({}))
            }
            _ => Err(error("未知归档操作")),
        }
    }
}
#[tauri::command]
pub(crate) async fn settings_archive(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    expected: Token,
    request: ArchiveRequest,
) -> Result<Value> {
    if window.label() != "main" {
        return Err(error("请在主窗口操作归档"));
    }
    let host = app.state::<SettingsHost>().0.clone();
    tauri::async_runtime::spawn_blocking(move || host.archive(expected, request))
        .await
        .map_err(|_| error("归档工作失败"))?
}
#[tauri::command]
pub(crate) async fn settings_directory(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    expected: Token,
    directory: String,
) -> Result<()> {
    if window.label() != "main" {
        return Err(error("请在主窗口操作"));
    }
    let host = app.state::<SettingsHost>();
    host.0.with(|s| host.0.check(s, &expected, "main"))?;
    let config_root = backup::files::Directory::open(&host.0.root.join(".local-backup"), true)
        .map_err(|e| error(&e.message))?;
    let (config, _) = backup::files::load_config(&config_root).map_err(|e| error(&e.message))?;
    let target = std::path::PathBuf::from(&directory);
    if !target.is_dir()
        || (target != host.0.root && target != config.directory(&host.0.root.join("backups")))
    {
        return Err(error("只能显示当前数据目录或已配置的备份目录"));
    }
    #[cfg(desktop)]
    {
        use tauri_plugin_opener::OpenerExt;
        app.opener()
            .open_path(directory, None::<&str>)
            .map_err(|_| error("无法显示目录"))
    }
    #[cfg(mobile)]
    {
        let _ = directory;
        Err(error("本平台使用应用私有备份目录"))
    }
}
