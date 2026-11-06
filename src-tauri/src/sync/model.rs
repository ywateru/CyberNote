//! V1 envelopes contain raw persisted entities, never a visible/unlocked workspace.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

pub const MAX_MESSAGE: usize = 16 * 1024 * 1024;
pub const MAX_BLOB: u64 = 256 * 1024 * 1024;
pub const MAX_HEADS: usize = 32;
pub const MAX_DEVICES: usize = 64;
pub const MAX_COUNTER: u64 = i64::MAX as u64;
pub const MAX_ENTITIES: usize = 10_000;
pub type Vector = BTreeMap<String, u64>;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum EntityKind {
    Note,
    Folder,
}
impl EntityKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Note => "note",
            Self::Folder => "folder",
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireVersion {
    pub version: u32,
    pub workspace_id: String,
    pub kind: EntityKind,
    pub entity_id: String,
    pub vector: Vector,
    #[serde(deserialize_with = "required_payload")]
    pub payload: Option<Value>,
    pub digest: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SyncIdentity {
    pub version: u32,
    pub workspace_id: String,
    pub device_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VersionSummary {
    pub kind: EntityKind,
    pub entity_id: String,
    pub digest: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BlobRef {
    pub hash: String,
    pub size: u64,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SyncApplyReport {
    pub durable: bool,
    pub applied: bool,
    pub pending: usize,
    pub missing_blobs: Vec<BlobRef>,
    pub changes: Vec<VersionSummary>,
    pub conflicts: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SyncConflict {
    pub kind: EntityKind,
    pub entity_id: String,
    pub projected_digest: String,
    pub versions: Vec<ConflictVersion>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConflictVersion {
    pub digest: String,
    pub tombstone: bool,
    pub locked: bool,
    pub title: Option<String>,
    pub updated_at: Option<i64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WireAttachment {
    pub id: String,
    pub note_id: String,
    pub kind: String,
    pub mime: String,
    pub display_name: String,
    pub size: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recorded_at: Option<u64>,
    pub sha256: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NotePayload {
    pub note: Value,
    pub attachments: Vec<WireAttachment>,
}

fn required_payload<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<Option<Value>, D::Error> {
    Option::<Value>::deserialize(deserializer)
}
pub fn canonical(value: &Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(k, v)| (k.clone(), canonical(v)))
                .collect::<BTreeMap<_, _>>()
                .into_iter()
                .collect(),
        ),
        Value::Array(values) => Value::Array(values.iter().map(canonical).collect()),
        other => other.clone(),
    }
}
pub fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub fn valid_hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
pub fn valid_uuid(value: &str) -> bool {
    uuid::Uuid::parse_str(value).is_ok_and(|id| id.hyphenated().to_string() == value)
}
pub fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value.trim() == value
        && !value.chars().any(char::is_control)
}
pub fn dominates(a: &Vector, b: &Vector) -> bool {
    a != b && b.iter().all(|(d, c)| a.get(d).copied().unwrap_or(0) >= *c)
}
pub fn join<'a>(vectors: impl IntoIterator<Item = &'a Vector>) -> Vector {
    let mut result = Vector::new();
    for vector in vectors {
        for (d, c) in vector {
            let old = result.entry(d.clone()).or_default();
            *old = (*old).max(*c);
        }
    }
    result
}
pub fn json_budget(value: &Value) -> bool {
    fn walk(value: &Value, depth: usize, count: &mut usize) -> bool {
        *count += 1;
        if depth > 64 || *count > 500_000 {
            return false;
        }
        match value {
            Value::Object(map) => map
                .iter()
                .all(|(k, v)| k.len() <= 4096 && walk(v, depth + 1, count)),
            Value::Array(list) => list.iter().all(|v| walk(v, depth + 1, count)),
            _ => true,
        }
    }
    walk(value, 0, &mut 0)
}
impl WireVersion {
    pub fn computed_digest(&self) -> String {
        sha256(&serde_json::to_vec(&canonical(&json!({"version":self.version,"workspaceId":self.workspace_id,"kind":self.kind,"entityId":self.entity_id,"vector":self.vector,"payload":self.payload}))).expect("bounded JSON serialization"))
    }
    pub fn seal(mut self) -> Self {
        self.digest = self.computed_digest();
        self
    }
    pub fn validate_envelope(&self) -> std::result::Result<(), &'static str> {
        if self.version != 1 || !valid_uuid(&self.workspace_id) || !valid_id(&self.entity_id) {
            return Err("协议、workspace或实体身份无效");
        }
        if self.vector.is_empty()
            || self.vector.len() > MAX_DEVICES
            || self
                .vector
                .iter()
                .any(|(d, c)| !valid_uuid(d) || *c == 0 || *c > MAX_COUNTER)
        {
            return Err("版本向量无效或超限");
        }
        let budget_value = serde_json::to_value(self).map_err(|_| "版本编码失败")?;
        if !json_budget(&budget_value) {
            return Err("实体JSON层级超限");
        }
        if !valid_hash(&self.digest) || self.computed_digest() != self.digest {
            return Err("版本摘要不符");
        }
        let value = serde_json::to_value(self).map_err(|_| "版本编码失败")?;
        if !json_budget(&value)
            || serde_json::to_vec(&value)
                .map_err(|_| "版本编码失败")?
                .len()
                > MAX_MESSAGE
        {
            return Err("实体消息大小或JSON层级超限");
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SyncApplyPlan {
    pub generation: String,
    pub excluded_note_ids: Vec<String>,
    pub eligible_digests: Vec<String>,
    pub targets: Vec<String>,
    pub changes: Vec<VersionSummary>,
}
