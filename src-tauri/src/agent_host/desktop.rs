//! Desktop ownership/commands. File IO and listener lifecycle never hold Session.
use crate::agent_host::*;
use crate::{
    agent_service::{Service, WindowHost},
    application::{ToolError, ToolResult},
    session::Token,
};
use std::{path::PathBuf, sync::Arc};
use tauri::Manager;

struct Windows(tauri::AppHandle);
impl WindowHost for Windows {
    fn participants(&self) -> std::collections::HashSet<String> {
        crate::recording_window::document_participants(self.0.webview_windows().into_keys())
    }
    fn emit(&self, name: &str, payload: &serde_json::Value) -> ToolResult<()> {
        crate::emit_document_event(&self.0, name, payload).map_err(ToolError::storage)
    }
}
pub struct Desktop {
    pub testers: Arc<crate::agent_tester::Registry>,
    service: Service,
    runtime: PathBuf,
    host: tokio::sync::Mutex<Option<AgentHost>>,
    paused: std::sync::atomic::AtomicU8,
}
/// Owned before the first await and transferred into the barrier worker. Dropping
/// a cancelled command or failed barrier always releases maintenance ownership.
pub struct Maintenance(Arc<Desktop>);
impl Drop for Maintenance {
    fn drop(&mut self) {
        let manager = self.0.clone();
        tauri::async_runtime::spawn(async move {
            let _ = manager.resume().await;
        });
    }
}
impl Desktop {
    pub fn new(
        app: tauri::AppHandle,
        shared: crate::agent_service::SharedSession,
        runtime: Option<PathBuf>,
    ) -> Arc<Self> {
        // No fallback on an explicitly selected path; validation happens on open
        // and is reported by the Agent page, never fatal to notes startup.
        let runtime = runtime.unwrap_or_else(|| {
            std::env::var_os("HOME")
                .map(PathBuf::from)
                .unwrap_or_default()
                .join("Library/Application Support/com.local.notesclone/agent-runtime")
        });
        Arc::new(Self {
            testers: Arc::new(crate::agent_tester::Registry::default()),
            service: Service::new(shared, Arc::new(Windows(app))),
            runtime,
            host: tokio::sync::Mutex::new(None),
            paused: std::sync::atomic::AtomicU8::new(0),
        })
    }
    fn identity(&self, expected: Option<(&Token, &str)>) -> ToolResult<(String, String)> {
        if let Some((_, label)) = expected {
            if !self.service.windows.participants().contains(label) {
                return Err(ToolError::new(
                    "UNAUTHORIZED",
                    "A live document window is required",
                ));
            }
        }
        let s = self.service.shared.0.lock().map_err(ToolError::storage)?;
        if let Some((token, _)) = expected {
            s.check(token, None)
                .map_err(|_| ToolError::new("UNAUTHORIZED", "Window authority changed"))?;
        }
        s.store.application_identity().map_err(ToolError::storage)
    }
    async fn ensure(
        &self,
        slot: &mut Option<AgentHost>,
        expected: Option<(&Token, &str)>,
    ) -> ToolResult<()> {
        if self.paused.load(std::sync::atomic::Ordering::SeqCst) != 0 {
            return Err(ToolError::new(
                "HOST_UNAVAILABLE",
                "Agent host is paused for maintenance",
            ));
        }
        let (workspace_id, incarnation) = self.identity(expected)?;
        if let Some(host) = slot {
            let settings = host.settings()?;
            if settings.workspace_id != workspace_id || settings.incarnation != incarnation {
                host.retire().await?;
                let driver = self.service.clone();
                tokio::task::spawn_blocking(move || driver.wait_idle())
                    .await
                    .map_err(ToolError::storage)??;
                *slot = None;
            }
        }
        if slot.is_none() {
            *slot = Some(AgentHost::open_for_application(
                HostConfig {
                    runtime_dir: self.runtime.clone(),
                    workspace_id,
                    incarnation,
                },
                Arc::new(self.service.clone()),
            )?);
        }
        Ok(())
    }
    pub async fn restore(&self) -> ToolResult<HostSettings> {
        let mut slot = self.host.lock().await;
        self.ensure(&mut slot, None).await?;
        slot.as_mut().unwrap().restore_enabled().await
    }
    pub async fn settings(&self, expected: &Token, label: &str) -> ToolResult<HostSettings> {
        let mut slot = self.host.lock().await;
        self.ensure(&mut slot, Some((expected, label))).await?;
        let result = slot.as_mut().unwrap().restore_enabled().await?;
        self.identity(Some((expected, label)))?;
        Ok(result)
    }
    pub async fn set_enabled(
        &self,
        enabled: bool,
        expected: &Token,
        label: &str,
    ) -> ToolResult<HostSettings> {
        self.identity(Some((expected, label)))?;
        if !enabled {
            self.testers.close_all().await;
        }
        let mut slot = self.host.lock().await;
        self.ensure(&mut slot, Some((expected, label))).await?;
        let host = slot.as_mut().unwrap();
        let result = host.set_enabled(enabled).await?;
        if let Err(e) = self.identity(Some((expected, label))) {
            host.stop().await?;
            return Err(e);
        }
        Ok(result)
    }
    pub async fn create(
        &self,
        input: CreateGrant,
        expected: &Token,
        label: &str,
    ) -> ToolResult<CreatedGrant> {
        let mut slot = self.host.lock().await;
        self.ensure(&mut slot, Some((expected, label))).await?;
        self.validate_folders(expected, label, &input.folder_ids)?;
        let host = slot.as_ref().unwrap();
        // Keep validation inputs for the post-IO check without ever returning a secret.
        let ids = input.folder_ids.clone();
        let result = host.create_grant(input)?;
        let checked = self.validate_folders(expected, label, &ids);
        if let Err(e) = checked {
            host.revoke_grant(&result.grant.grant_id)?;
            return Err(e);
        }
        Ok(result)
    }
    fn validate_folders(
        &self,
        expected: &Token,
        label: &str,
        ids: &std::collections::BTreeSet<String>,
    ) -> ToolResult<()> {
        if !self.service.windows.participants().contains(label) {
            return Err(ToolError::new(
                "UNAUTHORIZED",
                "A live document window is required",
            ));
        }
        // Expected authority and physical folders are checked in the same gate,
        // both before and after private grant IO (which never holds Session).
        let s = self.service.shared.0.lock().map_err(ToolError::storage)?;
        s.check(expected, None)
            .map_err(|_| ToolError::new("UNAUTHORIZED", "Window authority changed"))?;
        let folders = s.store.application_folders().map_err(ToolError::storage)?;
        if ids.is_empty()
            || ids.len() > 10_000
            || ids.iter().any(|id| {
                !folders.iter().any(|f| {
                    f.id == *id && matches!(f.kind.as_str(), "default" | "quick" | "normal")
                })
            })
        {
            return Err(ToolError::new(
                "SCHEMA_INVALID",
                "Grant requires current physical directories",
            ));
        }
        Ok(())
    }
    pub async fn revoke(
        &self,
        id: &str,
        expected: &Token,
        label: &str,
    ) -> ToolResult<HostSettings> {
        let mut slot = self.host.lock().await;
        self.ensure(&mut slot, Some((expected, label))).await?;
        let result = slot.as_ref().unwrap().revoke_grant(id)?;
        self.identity(Some((expected, label)))?;
        drop(slot);
        self.testers.close_all().await;
        Ok(result)
    }
    /// Stop before a maintenance operation; no preference change. The barrier
    /// worker calls restore afterwards, retiring a changed incarnation as needed.
    pub async fn pause(self: &Arc<Self>, expected: &Token, label: &str) -> ToolResult<Maintenance> {
        self.identity(Some((expected, label)))?;
        self.paused
            .compare_exchange(
                0,
                1,
                std::sync::atomic::Ordering::SeqCst,
                std::sync::atomic::Ordering::SeqCst,
            )
            .map_err(|_| ToolError::new("HOST_UNAVAILABLE", "Agent host is already paused"))?;
        let owner = Maintenance(self.clone());
        self.shutdown().await?;
        Ok(owner)
    }
    async fn resume(&self) -> ToolResult<HostSettings> {
        self.paused
            .compare_exchange(
                1,
                0,
                std::sync::atomic::Ordering::SeqCst,
                std::sync::atomic::Ordering::SeqCst,
            )
            .map_err(|_| ToolError::new("HOST_UNAVAILABLE", "Agent host is shutting down"))?;
        self.restore().await
    }
    pub async fn quit(&self) -> ToolResult<()> {
        self.paused.store(2, std::sync::atomic::Ordering::SeqCst);
        self.shutdown().await
    }
    pub async fn shutdown(&self) -> ToolResult<()> {
        self.testers.close_all().await;
        let mut slot = self.host.lock().await;
        if let Some(host) = slot.as_mut() {
            host.stop().await?;
        }
        let driver = self.service.clone();
        tokio::task::spawn_blocking(move || driver.wait_idle())
            .await
            .map_err(ToolError::storage)?
    }
}
