use super::*;
use crate::local_backup::{
    failure, ArchivePreview, BackupCaller, BackupError, BackupIntent, BackupPorts,
    CheckedAuthority, CheckedRestore, CommittedRestore, ExpectedSession, ExportSnapshot,
    PortFuture, RecoveryWriter, TargetStoreFence,
};
fn map(e: AppError) -> BackupError {
    BackupError {
        code: e.code,
        message: e.message,
    }
}
fn token(a: &CheckedAuthority) -> Token {
    Token {
        session_id: a.session.session_id.clone(),
        epoch: a.session.epoch,
        note_epoch: a.session.note_epoch,
    }
}
impl Host {
    fn backup_check(&self, s: &Session, authority: &CheckedAuthority) -> Result<()> {
        self.check(s, &token(authority), "main")?;
        if s.store.application_identity()?.0 != authority.library_id
            || s.store.sync_store_instance().to_string() != authority.target_store.instance
        {
            return Err(error("资料库已变化"));
        }
        Ok(())
    }
    pub(super) fn snapshot(&self, authority: &CheckedAuthority) -> Result<ExportSnapshot> {
        let held = self.barrier(&token(authority), "main")?;
        let (stage, generation, settings) = self.with(|s| {
            self.backup_check(s, authority)?;
            held.check(s)?;
            Ok((
                s.stage_archive(&token(authority))?,
                s.store.cloud_generation()?,
                s.store.settings_hash()?,
            ))
        })?;
        let bytes = std::fs::read(stage.path())?;
        self.with(|s| {
            self.backup_check(s, authority)?;
            held.check(s)?;
            if s.store.cloud_generation()? != generation || s.store.settings_hash()? != settings {
                return Err(error("快照捕获期间资料库已变化，请重试"));
            }
            Ok(())
        })?;
        Ok(ExportSnapshot {
            library_id: authority.library_id.clone(),
            bytes,
        })
    }
    pub(super) fn preview(
        &self,
        authority: &CheckedAuthority,
        bytes: &[u8],
    ) -> Result<ArchivePreview> {
        self.with(|s| {
            self.backup_check(s, authority)?;
            let (notes, folders, attachments) = s.store.settings_preview(bytes)?;
            let key = crate::sync::model::sha256(bytes);
            self.previews.lock().map_err(|_| error("预览状态不可读"))?.insert(key, s.store.cloud_generation()?);
            Ok(ArchivePreview { notes, folders, attachments, summary: "合并导入：保留当前内容；ID 冲突时创建副本，并应用归档设置。不是原位时点回退，不恢复账户/Agent授权或自动任务。".into() })
        })
    }
    pub(super) fn restore_with(
        &self,
        authority: CheckedAuthority,
        bytes: Vec<u8>,
        protection: impl FnOnce(ExportSnapshot) -> Result<()>,
    ) -> Result<Value> {
        let hash = crate::sync::model::sha256(&bytes);
        let generation = self
            .previews
            .lock()
            .map_err(|_| error("预览状态不可读"))?
            .remove(&hash)
            .ok_or_else(|| error("请重新预览此归档"))?;
        let expected = token(&authority);
        self.with(|s| {
            self.backup_check(s, &authority)?;
            if s.store.cloud_generation()? != generation
                || s.store.settings_hash()? != authority.target_store.settings_sha256
                || s.store.sync_store_instance().to_string() != authority.target_store.instance
            {
                return Err(error("预览后资料库已变化，请重新预览"));
            }
            Ok(())
        })?;
        // Quiet owns every renderer freeze through protection and import commit.
        // It drains real preferences before pending is created, so ordinary
        // pending authorization remains strict and unchanged.
        let mut held = self.barrier(&expected, "main")?;
        #[cfg(target_os = "macos")]
        let _maintenance = tauri::async_runtime::block_on(
            self.app
                .state::<crate::AgentState>()
                .0
                .pause(&expected, "main"),
        )
        .map_err(|_| error("Agent维护暂停失败"))?;
        self.with(|s| {
            self.backup_check(s, &authority)?;
            held.check(s)?;
            if s.store.cloud_generation()? != generation
                || s.store.settings_hash()? != authority.target_store.settings_sha256
            {
                return Err(error("保存后的资料库已变化，请重新预览"));
            }
            crate::recording_window::ensure_snapshot_idle(&self.app)
                .map_err(|message| error(&message))?;
            let archive = s.store.settings_prepare_archive(&bytes)?;
            s.settings_begin_import(&held.id, &self.live(), &expected, archive)
        })?;
        let operation = held.id.clone();
        let result = (|| {
            let recovery = self.with(|s| {
                self.backup_check(s, &authority)?;
                s.settings_check_import(&operation, &self.live(), &expected)?;
                s.settings_recovery_stage(&operation, &self.live(), &expected)
            })?;
            let snapshot = ExportSnapshot {
                library_id: authority.library_id.clone(),
                bytes: std::fs::read(recovery.path())?,
            };
            protection(snapshot)?;
            self.with(|s| {
                self.backup_check(s, &authority)?;
                if s.store.cloud_generation()? != authority.target_store.generation
                    || s.store.settings_hash()? != authority.target_store.settings_sha256
                {
                    return Err(error("保护副本写入期间资料库已变化，请重新预览"));
                }
                s.settings_check_import(&operation, &self.live(), &expected)?;
                crate::recording_window::ensure_snapshot_idle(&self.app)
                    .map_err(|message| error(&message))?;
                let (result, event) = s.finish(&operation, &self.live(), false)?;
                let committed = event["phase"] == "commit";
                let release = s.settings_release(&operation, committed)?;
                held.finished = true;
                // A committed import remains committed if delivery fails. The
                // receipt is returned so callers refresh, never replay import.
                let _ = crate::emit_document_event(&self.app, "notes-access", &event);
                if let Some(event) = s.take_metadata_event() {
                    let _ = crate::emit_document_event(&self.app, "notes-metadata", &event);
                }
                let _ = self.emit(&release);
                result
            })
        })();
        if result.is_err() {
            let _ = self.with(|s| {
                if s.pending.as_ref().is_some_and(|p| p.id == operation) {
                    let (_, event) = s.finish(&operation, &self.live(), true)?;
                    crate::emit_document_event(&self.app, "notes-access", &event)?;
                }
                Ok(())
            });
        }
        result
    }
}
impl BackupPorts for Arc<Host> {
    fn authorize<'a>(
        &'a self,
        caller: &'a BackupCaller,
        _intent: BackupIntent,
    ) -> PortFuture<'a, CheckedAuthority> {
        Box::pin(async move {
            self.with(|s| {
                let token = match caller {
                    BackupCaller::Window { label, expected } if label == "main" => Token {
                        session_id: expected.session_id.clone(),
                        epoch: expected.epoch,
                        note_epoch: expected.note_epoch,
                    },
                    BackupCaller::Scheduler => s.sync_media_token(),
                    _ => return Err(error("请在主窗口操作本地备份")),
                };
                self.check(s, &token, "main")?;
                Ok(CheckedAuthority {
                    library_id: s.store.application_identity()?.0,
                    target_store: TargetStoreFence {
                        instance: s.store.sync_store_instance().to_string(),
                        generation: s.store.cloud_generation()?,
                        settings_sha256: s.store.settings_hash()?,
                    },
                    session: ExpectedSession {
                        session_id: token.session_id,
                        epoch: token.epoch,
                        note_epoch: token.note_epoch,
                    },
                })
            })
            .map_err(map)
        })
    }
    fn export_checked<'a>(&'a self, a: &'a CheckedAuthority) -> PortFuture<'a, ExportSnapshot> {
        let host = self.clone();
        let a = a.clone();
        Box::pin(async move {
            tauri::async_runtime::spawn_blocking(move || host.snapshot(&a).map_err(map))
                .await
                .map_err(|_| failure("backup_host", "备份工作失败"))?
        })
    }
    fn preview_checked<'a>(
        &'a self,
        a: &'a CheckedAuthority,
        bytes: &'a [u8],
    ) -> PortFuture<'a, ArchivePreview> {
        let host = self.clone();
        let a = a.clone();
        let bytes = bytes.to_vec();
        Box::pin(async move {
            tauri::async_runtime::spawn_blocking(move || host.preview(&a, &bytes).map_err(map))
                .await
                .map_err(|_| failure("backup_host", "预览工作失败"))?
        })
    }
    fn restore_checked<'a>(
        &'a self,
        request: CheckedRestore,
        protection: RecoveryWriter,
    ) -> PortFuture<'a, CommittedRestore> {
        let host = self.clone();
        Box::pin(async move {
            tauri::async_runtime::spawn_blocking(move || {
                if crate::sync::model::sha256(&request.archive) != request.payload_sha256 {
                    return Err(failure("backup_stale", "归档内容已变化"));
                }
                match host.restore_with(request.authority, request.archive, |snapshot| {
                    protection
                        .write(snapshot)
                        .map(|_| ())
                        .map_err(|e| error(&e.message))
                }) {
                    Ok(delivery) => Ok(CommittedRestore {
                        delivery,
                        maintenance_error: None,
                    }),
                    Err(e) if e.commit.is_some() => Ok(CommittedRestore {
                        delivery: e.commit.clone().unwrap(),
                        maintenance_error: Some(map(e)),
                    }),
                    Err(e) => Err(map(e)),
                }
            })
            .await
            .map_err(|_| failure("backup_host", "恢复工作失败"))?
        })
    }
}
