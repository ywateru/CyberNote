//! Reusable production Store boundary; does not acquire Session locks or own a Store.
use super::{engine::Capture, model::*};
use crate::{
    store::Store,
    sync::model::{BlobRef, WireVersion},
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use std::collections::BTreeMap;
fn store_error(e: crate::store::AppError) -> CloudError {
    error(match e.code.as_str() {
        "sync_workspace_mismatch" => "workspace",
        "sync_plan_stale" | "stale" => "stale",
        "sync_limit" => "limit",
        _ => "invalid",
    })
}
/// Call ONLY in a verified media scope, after the quiet save barrier and authority recheck.
/// Returned rows carry raw sealed notes; never use workspace() or export_archive().
pub fn rows(
    store: &mut Store,
    cloud_workspace: &str,
) -> Result<(String, Vec<WireVersion>, Vec<BlobRef>)> {
    store.sync_flush().map_err(store_error)?;
    let identity = store
        .sync_identity()
        .map_err(store_error)?
        .ok_or_else(|| error("disabled"))?;
    let inventory = store.sync_inventory().map_err(store_error)?;
    if inventory.len() > 1024 {
        return Err(error("limit"));
    }
    let mut versions = Vec::with_capacity(inventory.len());
    let mut bytes = 0usize;
    for summary in inventory {
        let version = store.sync_version(&summary.digest).map_err(store_error)?;
        bytes += serde_json::to_vec(&version)
            .map_err(|_| error("invalid"))?
            .len();
        if bytes > MAX_PLAIN {
            return Err(error("limit"));
        }
        versions.push(version);
    }
    let mut refs = BTreeMap::new();
    for v in &versions {
        for b in store.sync_required_blobs(v).map_err(store_error)? {
            if b.size > MAX_BLOB as u64 {
                return Err(error("limit"));
            }
            if refs
                .insert(b.hash.clone(), b.size)
                .is_some_and(|n| n != b.size)
            {
                return Err(error("invalid"));
            }
        }
    }
    let versions = versions
        .iter()
        .map(|v| rebind(v, cloud_workspace))
        .collect::<Result<Vec<_>>>()?;
    let _ = identity;
    Ok((
        cloud_workspace.into(),
        versions,
        refs.into_iter()
            .map(|(hash, size)| BlobRef { hash, size })
            .collect(),
    ))
}
/// Run outside Session lock. `storage` is the existing Store::sync_blob_storage() capability.
/// The host keeps its capture generation and pinned readers, and revalidates before publishing capture.
pub fn assemble(
    workspace_id: String,
    versions: Vec<WireVersion>,
    settings: Vec<SettingVersion>,
    blobs: BTreeMap<String, Vec<u8>>,
    generation: String,
) -> Result<Capture> {
    let raw_size = blobs.values().try_fold(0usize, |total, bytes| {
        if bytes.len() > MAX_BLOB {
            return Err(error("limit"));
        }
        total
            .checked_add(bytes.len())
            .filter(|n| *n <= MAX_PLAIN)
            .ok_or_else(|| error("limit"))
    })?;
    if raw_size > MAX_PLAIN {
        return Err(error("limit"));
    }
    let bundle = Bundle {
        version: 1,
        workspace_id,
        versions,
        settings,
        blobs: blobs.into_iter().map(|(h, b)| (h, B64.encode(b))).collect(),
    };
    bundle.validate()?;
    Ok(Capture { bundle, generation })
}
/// Must precede ALL incoming blob publication and remote upload. Applies production note/document rules.
pub fn validate(store: &Store, bundle: &Bundle) -> Result<()> {
    bundle.validate()?;
    let identity = store
        .sync_identity()
        .map_err(store_error)?
        .ok_or_else(|| error("disabled"))?;
    let versions = bundle
        .versions
        .iter()
        .map(|v| rebind(v, &identity.workspace_id))
        .collect::<Result<Vec<_>>>()?;
    if store.sync_pending_count().map_err(store_error)? + bundle.versions.len() > 1024 {
        return Err(error("limit"));
    }
    for batch in batches(&versions)? {
        store.sync_validate_receive(batch).map_err(store_error)?;
    }
    Ok(())
}
/// Receive is a durable inbox ACK, never an applied success. Host follows with its quiet plan/apply.
/// Invoke with prepared media receipt scope installed and all blobs independently validated/published.
pub fn receive(store: &mut Store, bundle: &Bundle) -> Result<crate::sync::model::SyncApplyReport> {
    validate(store, bundle)?;
    let identity = store
        .sync_identity()
        .map_err(store_error)?
        .ok_or_else(|| error("disabled"))?;
    let versions = bundle
        .versions
        .iter()
        .map(|v| rebind(v, &identity.workspace_id))
        .collect::<Result<Vec<_>>>()?;
    let mut report = None;
    for batch in batches(&versions)? {
        report = Some(store.sync_receive(batch.to_vec()).map_err(store_error)?);
    }
    Ok(report.unwrap_or_default())
}

fn batches(versions: &[WireVersion]) -> Result<Vec<&[WireVersion]>> {
    let mut batches = vec![];
    let mut start = 0;
    let mut bytes = 2;
    for (i, v) in versions.iter().enumerate() {
        let size = serde_json::to_vec(v).map_err(|_| error("invalid"))?.len() + 1;
        if size + 2 > crate::sync::model::MAX_MESSAGE {
            return Err(error("limit"));
        }
        if i - start >= 128 || bytes + size > crate::sync::model::MAX_MESSAGE {
            batches.push(&versions[start..i]);
            start = i;
            bytes = 2;
        }
        bytes += size;
    }
    if start < versions.len() {
        batches.push(&versions[start..]);
    }
    Ok(batches)
}

/// Wire digests bind their namespace. Validate the source before recomputing for the target.
/// This is a transport normalization, never workspace adoption or a grant/actor change.
pub fn rebind(version: &WireVersion, target: &str) -> Result<WireVersion> {
    version.validate_envelope().map_err(|_| error("invalid"))?;
    if !crate::sync::model::valid_uuid(target) {
        return Err(error("workspace"));
    }
    let mut v = version.clone();
    v.workspace_id = target.into();
    Ok(v.seal())
}
/// Media preparation MUST receive local-bound versions, not the cloud namespace.
pub fn local_versions(store: &Store, bundle: &Bundle) -> Result<Vec<WireVersion>> {
    bundle.validate()?;
    let identity = store
        .sync_identity()
        .map_err(store_error)?
        .ok_or_else(|| error("disabled"))?;
    bundle
        .versions
        .iter()
        .map(|v| rebind(v, &identity.workspace_id))
        .collect()
}
