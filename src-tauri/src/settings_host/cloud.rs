use super::*;
use crate::cloud_sync::{
    self as cloud,
    engine::{Capture, CommitReport},
    model::{error as cloud_error, Bundle},
    runtime::{CloudFence, Lease},
    CloudHost, Context, LocalInfo,
};
use std::collections::BTreeMap;
fn map(e: AppError) -> cloud::CloudError {
    cloud::CloudError {
        code: e.code,
        message: e.message,
    }
}
fn token(c: &Context) -> cloud::Result<Token> {
    serde_json::from_value(c.token.clone()).map_err(|_| cloud_error("permission"))
}
impl Host {
    fn cloud_check(&self, s: &Session, c: &Context) -> cloud::Result<()> {
        let expected = token(c)?;
        self.check(s, &expected, &c.window).map_err(map)?;
        if c.session != expected.session_id
            || c.store_instance != s.store.sync_store_instance().to_string()
        {
            return Err(cloud_error("stale"));
        }
        Ok(())
    }
    fn fence(
        &self,
        s: &Session,
        c: &Context,
        workspace: &str,
        binding: &CloudFence,
        incoming: Option<&Bundle>,
    ) -> cloud::Result<()> {
        self.cloud_check(s, c)?;
        let identity = s.store.sync_identity().map_err(map)?;
        if binding.context != *c
            || binding.cloud_workspace != workspace
            || identity.as_ref().map(|i| &i.workspace_id) != binding.store_workspace_id.as_ref()
            || identity.as_ref().map(|i| &i.device_id) != binding.store_device_id.as_ref()
        {
            return Err(cloud_error("stale"));
        }
        if let Some(bundle) = incoming {
            if binding.incoming_payload_hash.as_deref() != Some(bundle.digest().as_str()) {
                return Err(cloud_error("stale"));
            }
        }
        Ok(())
    }
    fn cloud_gate<T>(&self, f: impl FnOnce(&mut Session) -> cloud::Result<T>) -> cloud::Result<T> {
        let state = self.app.state::<AppState>();
        let mut s = state.0 .0.lock().map_err(|_| cloud_error("state"))?;
        f(&mut s)
    }
}
impl CloudHost for Host {
    fn check(&self, c: &Context) -> cloud::Result<()> {
        self.cloud_gate(|s| self.cloud_check(s, c))
    }
    fn inspect(&self, c: &Context) -> cloud::Result<LocalInfo> {
        self.cloud_gate(|s| {
            self.cloud_check(s, c)?;
            let identity = s.store.sync_identity().map_err(map)?;
            Ok(LocalInfo {
                store_workspace_id: identity.as_ref().map(|i| i.workspace_id.clone()),
                store_device_id: identity.map(|i| i.device_id),
                generation: s.store.cloud_generation().map_err(map)?,
                notes: s.store.notes().map_err(map)?.len(),
            })
        })
    }
    fn capture(
        &self,
        c: &Context,
        workspace: &str,
        initialize: bool,
        lease: Lease,
    ) -> cloud::Result<Capture> {
        lease.check_workspace(workspace)?;
        let binding = lease.binding()?.clone();
        let held = self.barrier(&token(c)?, &c.window).map_err(map)?;
        let (snapshot, before, identity) = self.cloud_gate(|s| {
            self.fence(s, c, workspace, &binding, None)?;
            held.check(s).map_err(map)?;
            let identity = s.store.sync_identity().map_err(map)?;
            if identity.is_none() && !initialize {
                return Err(cloud_error("disabled"));
            }
            Ok((
                s.store
                    .sync_media_snapshot(&[], identity.is_none())
                    .map_err(map)?,
                s.store.cloud_generation().map_err(map)?,
                identity,
            ))
        })?;
        let media = snapshot.verify().map_err(map)?;
        let (versions, refs, settings, generation, storage) = {
            let gate = lease.enter()?;
            gate.check_workspace(workspace)?;
            let binding = gate.binding()?;
            self.cloud_gate(|s| {
                self.fence(s, c, workspace, binding, None)?;
                held.check(s).map_err(map)?;
                if s.store.cloud_generation().map_err(map)? != before {
                    return Err(cloud_error("stale"));
                }
                s.store.sync_begin_media(media).map_err(map)?;
                let result = (|| {
                    if identity.is_none() {
                        s.store.sync_enable(None).map_err(map)?;
                    }
                    let settings = s.store.cloud_capture_settings().map_err(map)?;
                    let (_, versions, refs) = cloud::store_port::rows(&mut s.store, workspace)?;
                    Ok((
                        versions,
                        refs,
                        settings,
                        s.store.cloud_generation().map_err(map)?,
                        s.store.sync_blob_storage().map_err(map)?,
                    ))
                })();
                s.store.sync_end_media();
                result
            })?
        };
        let mut blobs = BTreeMap::new();
        let mut readers = vec![];
        let mut total = 0usize;
        for reference in refs {
            lease.check()?;
            let reader = storage
                .open_reader(&reference.hash, reference.size)
                .map_err(map)?;
            let mut bytes = vec![];
            while bytes.len() < reference.size as usize {
                let part = reader.read(bytes.len() as u64, 64 * 1024).map_err(map)?;
                if part.is_empty() {
                    return Err(cloud_error("invalid"));
                }
                bytes.extend(part);
            }
            total += bytes.len();
            if total > cloud::model::MAX_PLAIN {
                return Err(cloud_error("limit"));
            }
            blobs.insert(reference.hash, bytes);
            readers.push(reader);
        }
        {
            let gate = lease.enter()?;
            gate.check_workspace(workspace)?;
            let binding = gate.binding()?;
            self.cloud_gate(|s| {
                self.cloud_check(s, c)?;
                if binding.context != *c || binding.cloud_workspace != workspace {
                    return Err(cloud_error("stale"));
                }
                held.check(s).map_err(map)?;
                // Initial capture is the only permitted identity transition; generation
                // and instance bind it, runtime then captures the initialized identity.
                if s.store.cloud_generation().map_err(map)? != generation {
                    return Err(cloud_error("stale"));
                }
                for reader in &readers {
                    reader.read(0, 1).map_err(map)?;
                }
                Ok(())
            })?;
        }
        cloud::store_port::assemble(workspace.into(), versions, settings, blobs, generation)
    }
    fn validate(&self, c: &Context, bundle: &Bundle, lease: Lease) -> cloud::Result<()> {
        bundle.validate()?;
        lease.check_workspace(&bundle.workspace_id)?;
        let binding = lease.binding()?.clone();
        let incoming = self.cloud_gate(|s| {
            self.fence(s, c, &bundle.workspace_id, &binding, Some(bundle))?;
            cloud::store_port::local_versions(&s.store, bundle)
        })?;
        let media = self
            .cloud_gate(|s| {
                s.store
                    .sync_media_snapshot(&incoming, false)
                    .map(|v| v.receipt_only())
                    .map_err(map)
            })?
            .verify()
            .map_err(map)?;
        let gate = lease.enter()?;
        gate.check_workspace(&bundle.workspace_id)?;
        let binding = gate.binding()?;
        self.cloud_gate(|s| {
            self.fence(s, c, &bundle.workspace_id, binding, Some(bundle))?;
            s.store
                .sync_with_media(media, |store| {
                    cloud::store_port::validate(store, bundle).map_err(|e| error(&e.message))?;
                    store.cloud_validate_settings(&bundle.settings)
                })
                .map_err(map)
        })
    }
    fn commit(
        &self,
        c: &Context,
        bundle: Bundle,
        expected_generation: &str,
        lease: Lease,
    ) -> cloud::Result<CommitReport> {
        bundle.validate()?;
        lease.check_workspace(&bundle.workspace_id)?;
        let binding = lease.binding()?.clone();
        let held = self.barrier(&token(c)?, &c.window).map_err(map)?;
        let (storage, incoming) = self.cloud_gate(|s| {
            self.fence(s, c, &bundle.workspace_id, &binding, Some(&bundle))?;
            held.check(s).map_err(map)?;
            if s.store.cloud_generation().map_err(map)? != expected_generation {
                return Err(cloud_error("stale"));
            }
            Ok((
                s.store.sync_blob_storage().map_err(map)?,
                cloud::store_port::local_versions(&s.store, &bundle)?,
            ))
        })?;
        use base64::Engine;
        for (hash, encoded) in &bundle.blobs {
            lease.check()?;
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(encoded)
                .map_err(|_| cloud_error("invalid"))?;
            storage
                .sync_store_blob(hash, bytes.len() as u64, &bytes[..])
                .map_err(map)?;
        }
        let receipt = self
            .cloud_gate(|s| {
                held.check(s).map_err(map)?;
                s.store
                    .sync_media_snapshot(&incoming, false)
                    .map(|v| v.receipt_only())
                    .map_err(map)
            })?
            .verify()
            .map_err(map)?;
        {
            let gate = lease.enter()?;
            gate.check_workspace(&bundle.workspace_id)?;
            let binding = gate.binding()?;
            self.cloud_gate(|s| {
                self.fence(s, c, &bundle.workspace_id, binding, Some(&bundle))?;
                held.check(s).map_err(map)?;
                if s.store.cloud_generation().map_err(map)? != expected_generation {
                    return Err(cloud_error("stale"));
                }
                s.store
                    .sync_with_media(receipt, |store| {
                        cloud::store_port::receive(store, &bundle).map_err(|e| error(&e.message))
                    })
                    .map_err(map)?;
                Ok(())
            })?;
        }
        // Accepted durable inbox is a local fact. A cancelled final lease leaves
        // it for ordinary safe recovery, rather than retracting accepted heads.
        let media = self
            .cloud_gate(|s| s.store.sync_media_snapshot(&[], false).map_err(map))?
            .verify()
            .map_err(map)?;
        let gate = lease.enter()?;
        gate.check_workspace(&bundle.workspace_id)?;
        let binding = gate.binding()?;
        self.cloud_gate(|s| {
            self.fence(s, c, &bundle.workspace_id, binding, Some(&bundle))?;
            held.check(s).map_err(map)?;
            s.store.sync_begin_media(media).map_err(map)?;
            let result =
                s.settings_apply_cloud(&held.id, &self.live(), &token(c)?, bundle.settings.clone());
            s.store.sync_end_media();
            let (event, access) = result.map_err(map)?;
            let committed = event["outcome"] == "commit";
            self.events(s, event, access).map_err(map)?;
            Ok(CommitReport {
                applied: committed,
                pending: s.store.sync_pending_count().map_err(map)?,
                conflicts: s.store.sync_conflict_count().map_err(map)?
                    + s.store.cloud_settings_conflicts().map_err(map)?,
            })
        })
    }
}
