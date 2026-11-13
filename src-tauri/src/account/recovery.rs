//! Explicit retained-owner recovery. No browser, logout, enable or polling hook.
use super::types::{Error, Result};
use std::future::Future;

pub(super) trait Host: Sync {
    fn current(&self, generation: u64) -> bool;
    fn restore(&self) -> impl Future<Output = Result<account_auth::Identity>> + Send;
    /// Strict binding returns the persisted user intent, never a new enable decision.
    fn bind(
        &self,
        identity: account_auth::Identity,
        generation: u64,
    ) -> impl Future<Output = Result<bool>> + Send;
    fn start(&self) -> impl Future<Output = Result<()>> + Send;
}

pub(super) async fn run(host: &impl Host, generation: u64) -> Result<()> {
    if !host.current(generation) {
        return Err(Error::Cancelled);
    }
    let identity = host.restore().await?;
    if !host.current(generation) {
        return Err(Error::Cancelled);
    }
    let enabled = host.bind(identity, generation).await?;
    if !host.current(generation) {
        return Err(Error::Cancelled);
    }
    if enabled {
        host.start().await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::account::{
        config, private,
        types::{Phase, Status},
    };
    use std::{
        path::PathBuf,
        sync::{
            atomic::{AtomicU64, Ordering},
            Mutex,
        },
    };
    use tokio::sync::Notify;

    struct Fixture {
        path: PathBuf,
        generation: AtomicU64,
        status: Mutex<Status>,
        effects: Mutex<Vec<&'static str>>,
        pause: u8,
        entered: Notify,
        release: Notify,
    }
    impl Fixture {
        fn new(root: &std::path::Path, enabled: bool, pause: u8) -> Self {
            let path = root.join("binding.json");
            private::write(
                &path,
                &private::Binding {
                    issuer: config::ISSUER.into(),
                    subject: "fixture-owner".into(),
                    product_id: "fixture-product".into(),
                    workspace_id: uuid::Uuid::new_v4().to_string(),
                    device_id: uuid::Uuid::new_v4().to_string(),
                    noise_public_key: "fixture-key".into(),
                    enabled,
                },
            )
            .unwrap();
            Self {
                path,
                generation: AtomicU64::new(1),
                status: Mutex::new(Status {
                    state: Phase::Error,
                    ..Status::default()
                }),
                effects: Mutex::new(Vec::new()),
                pause,
                entered: Notify::new(),
                release: Notify::new(),
            }
        }
        async fn checkpoint(&self, phase: u8) {
            if self.pause == phase {
                self.entered.notify_one();
                self.release.notified().await;
            }
        }
    }
    impl Host for Fixture {
        fn current(&self, generation: u64) -> bool {
            self.generation.load(Ordering::Acquire) == generation
        }
        async fn restore(&self) -> Result<account_auth::Identity> {
            self.effects.lock().unwrap().push("restore");
            self.checkpoint(1).await;
            Ok(account_auth::Identity {
                issuer: config::ISSUER.into(),
                subject: "fixture-owner".into(),
                display_name: "Fixture".into(),
                username: None,
            })
        }
        async fn bind(&self, identity: account_auth::Identity, generation: u64) -> Result<bool> {
            self.effects.lock().unwrap().push("profile");
            self.checkpoint(2).await;
            if !self.current(generation) {
                return Err(Error::Cancelled);
            }
            let binding = private::read(&self.path)?.ok_or(Error::Authentication)?;
            if identity.issuer != binding.issuer || identity.subject != binding.subject {
                return Err(Error::OwnershipMismatch);
            }
            let mut status = self.status.lock().unwrap();
            status.enabled = binding.enabled;
            status.state = Phase::Paused;
            self.effects.lock().unwrap().push("bound");
            Ok(binding.enabled)
        }
        async fn start(&self) -> Result<()> {
            self.effects.lock().unwrap().push("network");
            self.status.lock().unwrap().state = Phase::Connecting;
            Ok(())
        }
    }

    #[tokio::test]
    async fn explicit_recovery_restores_persisted_pause_and_enable_without_rewriting_binding() {
        for enabled in [false, true] {
            let root = tempfile::tempdir().unwrap();
            let host = Fixture::new(root.path(), enabled, 0);
            let before = std::fs::read(&host.path).unwrap();
            run(&host, 1).await.unwrap();
            let status = host.status.lock().unwrap();
            assert_eq!(status.enabled, enabled);
            assert!(
                status.state
                    == if enabled {
                        Phase::Connecting
                    } else {
                        Phase::Paused
                    }
            );
            assert_eq!(
                *host.effects.lock().unwrap(),
                if enabled {
                    vec!["restore", "profile", "bound", "network"]
                } else {
                    vec!["restore", "profile", "bound"]
                }
            );
            assert_eq!(std::fs::read(&host.path).unwrap(), before);
        }
    }

    #[tokio::test]
    async fn generation_change_during_refresh_or_profile_prevents_binding_and_network_resurrection()
    {
        for enabled in [false, true] {
            for phase in [1, 2] {
                let root = tempfile::tempdir().unwrap();
                let host = std::sync::Arc::new(Fixture::new(root.path(), enabled, phase));
                let before = std::fs::read(&host.path).unwrap();
                let worker = host.clone();
                let task = tokio::spawn(async move { run(worker.as_ref(), 1).await });
                tokio::time::timeout(std::time::Duration::from_secs(5), host.entered.notified())
                    .await
                    .unwrap();
                // Cancel/sign-out/exit invalidates the generation while its owner drains.
                host.generation.fetch_add(1, Ordering::AcqRel);
                host.release.notify_one();
                assert_eq!(
                    tokio::time::timeout(std::time::Duration::from_secs(5), task)
                        .await
                        .unwrap()
                        .unwrap(),
                    Err(Error::Cancelled)
                );
                assert!(!host.effects.lock().unwrap().contains(&"bound"));
                assert!(!host.effects.lock().unwrap().contains(&"network"));
                assert!(host.status.lock().unwrap().state == Phase::Error);
                assert_eq!(std::fs::read(&host.path).unwrap(), before);
                assert_eq!(run(host.as_ref(), 1).await, Err(Error::Cancelled));
            }
        }
    }
}
