//! Real production SQLite Store backend; no alternate merge or projection algorithm.
use crate::{
    identity::{Result, SyncError},
    model::WireVersion,
    network::{BlobRef, InventoryPage, Receipt, SyncBackend},
    store::{self, Store},
};
use serde_json::Value;
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::Path,
    sync::Mutex,
};
#[track_caller]
fn mapped<T>(result: store::Result<T>) -> Result<T> {
    mapped_at("backend.store_api", result)
}
fn mapped_at<T>(phase: &'static str, result: store::Result<T>) -> Result<T> {
    result.map_err(|e| {
        crate::record_store_failure(phase, e);
        SyncError::Backend
    })
}
pub(crate) struct Backend(pub Mutex<Store>, pub store::NetworkStaging);
impl Backend {
    pub(crate) fn prepared<T>(
        &self,
        incoming: &[WireVersion],
        f: impl FnOnce(&mut Store) -> store::Result<T>,
    ) -> Result<T> {
        let mut store = self.0.lock().unwrap();
        let media = mapped_at(
            "backend.media.snapshot",
            store.sync_media_snapshot(incoming, false),
        )?;
        let media = mapped_at("backend.media.verify", media.verify())?;
        mapped_at("backend.media.transaction", store.sync_with_media(media, f))
    }
}
impl SyncBackend for Backend {
    fn device_id(&self) -> Result<String> {
        Ok(mapped(self.0.lock().unwrap().sync_identity())?
            .unwrap()
            .device_id)
    }
    fn workspace_id(&self) -> Result<String> {
        Ok(mapped(self.0.lock().unwrap().sync_identity())?
            .unwrap()
            .workspace_id)
    }
    fn prepare_pairing(&self, workspace: &str) -> Result<()> {
        if self.workspace_id()? != workspace {
            return Err(SyncError::WorkspaceMismatch);
        }
        Ok(())
    }
    fn adopt_workspace(&self, workspace: &str) -> Result<()> {
        self.prepare_pairing(workspace)
    }
    fn flush(&self) -> Result<()> {
        self.prepared(&[], |s| s.sync_flush())
    }
    fn inventory(&self, after: Option<&str>, limit: usize) -> Result<InventoryPage> {
        let mut ids: Vec<_> =
            mapped_at("backend.inventory", self.0.lock().unwrap().sync_inventory())?
                .into_iter()
                .map(|v| v.digest)
                .filter(|d| after.is_none_or(|a| d.as_str() > a))
                .collect();
        ids.sort();
        let next = if ids.len() > limit {
            ids.get(limit - 1).cloned()
        } else {
            None
        };
        ids.truncate(limit);
        Ok(InventoryPage { digests: ids, next })
    }
    fn version(&self, digest: &str) -> Result<Value> {
        serde_json::to_value(mapped_at(
            "backend.version",
            self.0.lock().unwrap().sync_version(digest),
        )?)
        .map_err(|_| SyncError::Backend)
    }
    fn required_blobs(&self, value: &Value) -> Result<Vec<BlobRef>> {
        let wire: WireVersion =
            serde_json::from_value(value.clone()).map_err(|_| SyncError::Protocol)?;
        let refs = self.prepared(std::slice::from_ref(&wire), |s| {
            s.sync_validate_receive(std::slice::from_ref(&wire))?;
            s.sync_required_blobs(&wire)
        })?;
        Ok(refs
            .into_iter()
            .map(|b| BlobRef {
                sha256: b.hash,
                size: b.size,
            })
            .collect())
    }
    fn has_blob(&self, blob: &BlobRef) -> Result<bool> {
        mapped_at(
            "backend.has_blob",
            mapped(self.0.lock().unwrap().sync_blob_storage())?.contains(&blob.sha256, blob.size),
        )
    }
    fn read_blob_chunk(&self, blob: &BlobRef, offset: u64, max: usize) -> Result<Vec<u8>> {
        if offset > blob.size || max > crate::network::CHUNK {
            return Err(SyncError::Protocol);
        }
        let path = mapped(self.0.lock().unwrap().sync_blob_path(&blob.sha256))?;
        let mut file = File::open(path).map_err(|_| SyncError::Io)?;
        file.seek(SeekFrom::Start(offset))
            .map_err(|_| SyncError::Io)?;
        let mut bytes = vec![0; (blob.size - offset).min(max as u64) as usize];
        file.read_exact(&mut bytes).map_err(|_| SyncError::Io)?;
        Ok(bytes)
    }
    fn store_blob(&self, blob: &BlobRef, source: &Path) -> Result<()> {
        mapped_at(
            "backend.publish_staged",
            mapped(self.0.lock().unwrap().sync_blob_storage())?.publish_staged(
                &self.1,
                &blob.sha256,
                blob.size,
                source,
            ),
        )
    }
    fn receive_head(&self, value: Value) -> Result<Receipt> {
        let wire: WireVersion = serde_json::from_value(value).map_err(|_| SyncError::Protocol)?;
        let report = self.prepared(std::slice::from_ref(&wire), |s| {
            s.sync_receive(vec![wire.clone()])
        })?;
        Ok(Receipt {
            durable: report.durable,
            applied: false,
        })
    }
}
