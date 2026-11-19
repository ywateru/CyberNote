use crate::sync::model::{
    dominates, sha256, valid_hash, valid_uuid, Vector, WireVersion, MAX_HEADS,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

pub const MAX_PLAIN: usize = 32 * 1024 * 1024;
pub const MAX_REMOTE: usize = 48 * 1024 * 1024;
pub const MAX_BLOB: usize = 16 * 1024 * 1024;
pub const MAX_GITHUB: usize = 100 * 1024 * 1024;
pub const GITHUB_INLINE: usize = 1024 * 1024;
pub type Result<T> = std::result::Result<T, CloudError>;
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CloudError {
    pub code: String,
    pub message: String,
}
pub fn error(code: &str) -> CloudError {
    CloudError {
        code: code.into(),
        message: match code {
            "authentication" => "存储服务拒绝了凭据，请检查权限",
            "network" => "无法连接存储服务，请检查网络后重试",
            "timeout" => "云同步超时，请重试",
            "conflict" => "远端已被另一设备修改，已保留本机内容，请重新预览",
            "password" => "加密密码错误或远端密文已损坏，未写入任何内容",
            "limit" => "超过云同步预算：明文 JSON 32 MiB、密文 48 MiB、单附件 16 MiB（编码开销计入总量），或版本/设置头数量超限；未截断内容",
            "github_limit" => {
                "超过 GitHub 文件限制；本客户端仍受明文 32 MiB、密文 48 MiB 与单附件 16 MiB 的更小预算限制"
            }
            "invalid" => "云同步数据或配置格式无效",
            "private_repository" => "请选择已有的 GitHub 私有仓库与分支",
            "missing" => "未找到可恢复的数据",
            "precondition" => "服务未提供可靠的 ETag，不能安全同步",
            "disabled" => "云同步尚未启用",
            "permission" => "当前会话权限已失效，云同步已停止",
            "stale" => "会话、笔记库或预览已改变，请重新预览",
            "busy" => "另一个云同步操作正在进行",
            "state" => "本机云同步状态不可读取或已改变，已保留原文件",
            "workspace" => "远端属于另一个同步空间，不能覆盖当前笔记库",
            "confirmation" => "请先预览并确认此次同步或恢复",
            _ => "云同步未完成，本机内容已保留",
        }
        .into(),
    }
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Webdav,
    S3,
    Github,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderConfig {
    #[serde(default)]
    pub fields: BTreeMap<String, String>,
    #[serde(default)]
    pub secrets: BTreeMap<String, String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Config {
    pub version: u8,
    pub revision: u64,
    pub enabled: bool,
    pub selected: Provider,
    pub minutes: u16,
    pub providers: BTreeMap<Provider, ProviderConfig>,
    pub passphrase: String,
    #[serde(default)]
    pub approved_workspace: Option<String>,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            version: 1,
            revision: 0,
            enabled: false,
            selected: Provider::Webdav,
            minutes: 0,
            providers: BTreeMap::new(),
            passphrase: String::new(),
            approved_workspace: None,
        }
    }
}
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConfigPatch {
    pub expected_revision: u64,
    pub enabled: Option<bool>,
    pub selected: Option<Provider>,
    pub minutes: Option<u16>,
    pub provider: Option<Provider>,
    pub fields: Option<BTreeMap<String, String>>,
    pub secrets: Option<BTreeMap<String, String>>,
    pub passphrase: Option<String>,
}
impl Config {
    pub fn patch(&self, p: ConfigPatch) -> Result<Self> {
        if p.expected_revision != self.revision {
            return Err(error("stale"));
        }
        let mut c = self.clone();
        if let Some(v) = p.enabled {
            c.enabled = v;
        }
        if let Some(v) = p.selected {
            c.selected = v;
        }
        if let Some(v) = p.minutes {
            c.minutes = v;
        }
        if let Some(v) = p.passphrase {
            c.passphrase = v;
        }
        if let Some(k) = p.provider {
            let entry = c.providers.entry(k).or_default();
            for (key, value) in p.fields.unwrap_or_default() {
                entry.fields.insert(key, value);
            }
            for (key, value) in p.secrets.unwrap_or_default() {
                entry.secrets.insert(key, value);
            }
        } else if p.fields.is_some() || p.secrets.is_some() {
            return Err(error("invalid"));
        }
        if c.providers != self.providers
            || c.selected != self.selected
            || c.passphrase != self.passphrase
        {
            c.approved_workspace = None;
        }
        c.revision = c.revision.checked_add(1).ok_or_else(|| error("limit"))?;
        c.validate()?;
        Ok(c)
    }
    pub fn validate(&self) -> Result<()> {
        if self.version != 1
            || ![0, 3, 15, 30, 60].contains(&self.minutes)
            || self.passphrase.len() > 1024
            || self.providers.len() > 3
            || self
                .approved_workspace
                .as_ref()
                .is_some_and(|v| !valid_uuid(v))
        {
            return Err(error("invalid"));
        }
        for (k, p) in &self.providers {
            let (fields, secrets): (&[&str], &[&str]) = match k {
                Provider::Webdav => (&["endpoint", "directory", "username"], &["password"]),
                Provider::S3 => (
                    &["endpoint", "region", "bucket", "prefix"],
                    &["accessKey", "secretKey", "sessionToken"],
                ),
                Provider::Github => (&["owner", "repo", "branch", "prefix"], &["token"]),
            };
            if p.fields.iter().any(|(k, v)| {
                !fields.contains(&k.as_str()) || v.len() > 2048 || v.chars().any(char::is_control)
            }) || p.secrets.iter().any(|(k, v)| {
                !secrets.contains(&k.as_str()) || v.len() > 4096 || v.contains(['\r', '\n'])
            }) {
                return Err(error("invalid"));
            }
        }
        if self.enabled
            && (self.passphrase.len() < 8 || !self.providers.contains_key(&self.selected))
        {
            return Err(error("invalid"));
        }
        Ok(())
    }
}
impl PartialEq for ProviderConfig {
    fn eq(&self, rhs: &Self) -> bool {
        self.fields == rhs.fields && self.secrets == rhs.secrets
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SettingVersion {
    pub key: String,
    pub vector: Vector,
    pub value: Value,
    pub digest: String,
}
impl SettingVersion {
    pub fn seal(mut self) -> Self {
        self.digest = self.computed_digest();
        self
    }
    pub fn computed_digest(&self) -> String {
        sha256(
            &serde_json::to_vec(&crate::sync::model::canonical(
                &serde_json::json!({"key":self.key,"vector":self.vector,"value":self.value}),
            ))
            .unwrap(),
        )
    }
    pub(crate) fn valid_value(key: &str, value: &Value) -> bool {
        match key {
            "theme" => ["system", "light", "dark"].contains(&value.as_str().unwrap_or("")),
            "view" => ["list", "gallery"].contains(&value.as_str().unwrap_or("")),
            "sort" => ["updated", "created", "title"].contains(&value.as_str().unwrap_or("")),
            "groupDates" => value.is_boolean(),
            _ => false,
        }
    }
    pub fn validate(&self) -> Result<()> {
        if !Self::valid_value(&self.key, &self.value)
            || self.vector.is_empty()
            || self.vector.len() > 64
            || self
                .vector
                .iter()
                .any(|(a, c)| !valid_uuid(a) || *c == 0 || *c > i64::MAX as u64)
            || self.computed_digest() != self.digest
        {
            return Err(error("invalid"));
        }
        Ok(())
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Bundle {
    pub version: u8,
    pub workspace_id: String,
    pub versions: Vec<WireVersion>,
    /// Hash -> base64 raw bytes; no local paths or credentials.
    pub blobs: BTreeMap<String, String>,
    pub settings: Vec<SettingVersion>,
}
impl Bundle {
    pub fn empty(workspace_id: String) -> Self {
        Self {
            version: 1,
            workspace_id,
            versions: vec![],
            blobs: BTreeMap::new(),
            settings: vec![],
        }
    }
    pub fn validate(&self) -> Result<()> {
        if self.version != 1
            || !valid_uuid(&self.workspace_id)
            || self.versions.len() > 1024
            || self.blobs.len() > 10_000
            || self.settings.len() > 128
            || serde_json::to_vec(self)
                .map_err(|_| error("invalid"))?
                .len()
                > MAX_PLAIN
        {
            return Err(error("limit"));
        }
        let mut seen = BTreeSet::new();
        let mut refs = BTreeMap::new();
        let mut attachments = BTreeMap::new();
        for v in &self.versions {
            v.validate_envelope().map_err(|_| error("invalid"))?;
            if v.workspace_id != self.workspace_id || !seen.insert(v.digest.clone()) {
                return Err(error("invalid"));
            }
            if let Some(payload) = &v.payload {
                if let Some(a) = payload.get("attachments") {
                    let a: Vec<crate::sync::model::WireAttachment> =
                        serde_json::from_value(a.clone()).map_err(|_| error("invalid"))?;
                    for a in a {
                        let descriptor = serde_json::to_string(&a).map_err(|_| error("invalid"))?;
                        if attachments
                            .insert(a.id.clone(), descriptor.clone())
                            .is_some_and(|old| old != descriptor)
                        {
                            return Err(error("invalid"));
                        }
                        if a.size > MAX_BLOB as u64 || !valid_hash(&a.sha256) {
                            return Err(error("limit"));
                        }
                        if refs
                            .insert(a.sha256.clone(), a.size)
                            .is_some_and(|s| s != a.size)
                        {
                            return Err(error("invalid"));
                        }
                    }
                }
            }
        }
        if refs.len() != self.blobs.len() {
            return Err(error("invalid"));
        }
        for (h, s) in refs {
            let b = self.blobs.get(&h).ok_or_else(|| error("invalid"))?;
            if b.len() > MAX_BLOB.div_ceil(3) * 4 {
                return Err(error("limit"));
            }
            let raw = B64.decode(b).map_err(|_| error("invalid"))?;
            if raw.len() as u64 != s || sha256(&raw) != h {
                return Err(error("invalid"));
            }
        }
        for s in &self.settings {
            s.validate()?;
        }
        // Also reject equivocation and excess concurrent heads inside a single remote.
        validate_heads(&self.versions)?;
        for key in ["theme", "view", "sort", "groupDates"] {
            let items = self
                .settings
                .iter()
                .filter(|s| s.key == key)
                .collect::<Vec<_>>();
            if items.len() > MAX_HEADS {
                return Err(error("limit"));
            }
            for (i, a) in items.iter().enumerate() {
                for b in &items[i + 1..] {
                    if a.vector == b.vector && a.digest != b.digest {
                        return Err(error("invalid"));
                    }
                }
            }
        }
        Ok(())
    }
    pub fn digest(&self) -> String {
        let mut b = self.clone();
        b.versions.sort_by(|a, b| a.digest.cmp(&b.digest));
        b.settings.sort_by(|a, b| a.digest.cmp(&b.digest));
        sha256(&serde_json::to_vec(&b).unwrap())
    }
}
fn validate_heads(versions: &[WireVersion]) -> Result<()> {
    let mut groups: BTreeMap<(String, String), Vec<&WireVersion>> = BTreeMap::new();
    for v in versions {
        groups
            .entry((v.kind.as_str().into(), v.entity_id.clone()))
            .or_default()
            .push(v);
    }
    for group in groups.values() {
        if group
            .iter()
            .flat_map(|v| v.vector.keys())
            .collect::<BTreeSet<_>>()
            .len()
            > 64
        {
            return Err(error("limit"));
        }
        if group.len() > MAX_HEADS {
            return Err(error("limit"));
        }
        for (i, a) in group.iter().enumerate() {
            for b in &group[i + 1..] {
                if a.vector == b.vector && a.digest != b.digest {
                    return Err(error("invalid"));
                }
            }
        }
    }
    Ok(())
}
pub fn merge(local: &Bundle, remote: &Bundle) -> Result<Bundle> {
    local.validate()?;
    remote.validate()?;
    if local.workspace_id != remote.workspace_id {
        return Err(error("workspace"));
    }
    let mut all: BTreeMap<String, WireVersion> = BTreeMap::new();
    for v in local.versions.iter().chain(&remote.versions) {
        all.insert(v.digest.clone(), v.clone());
    }
    let values = all.into_values().collect::<Vec<_>>();
    // Check equivocation BEFORE dropping dominated versions.
    let mut vectors = BTreeMap::new();
    for v in &values {
        let key = (
            v.kind.as_str(),
            &v.entity_id,
            serde_json::to_string(&v.vector).unwrap(),
        );
        if vectors
            .insert(key, &v.digest)
            .is_some_and(|d| d != &v.digest)
        {
            return Err(error("invalid"));
        }
    }
    let versions = values
        .iter()
        .filter(|v| {
            !values.iter().any(|other| {
                other.kind == v.kind
                    && other.entity_id == v.entity_id
                    && dominates(&other.vector, &v.vector)
            })
        })
        .cloned()
        .collect::<Vec<_>>();
    let mut settings = local
        .settings
        .iter()
        .chain(&remote.settings)
        .cloned()
        .map(|v| (v.digest.clone(), v))
        .collect::<BTreeMap<_, _>>()
        .into_values()
        .collect::<Vec<_>>();
    for a in &settings {
        for b in &settings {
            if a.key == b.key && a.vector == b.vector && a.digest != b.digest {
                return Err(error("invalid"));
            }
        }
    }
    let copy = settings.clone();
    settings.retain(|v| {
        !copy
            .iter()
            .any(|o| o.key == v.key && dominates(&o.vector, &v.vector))
    });
    let mut blobs = local.blobs.clone();
    for (h, b) in &remote.blobs {
        blobs.insert(h.clone(), b.clone());
    }
    let referenced = versions
        .iter()
        .filter_map(|v| v.payload.as_ref()?.get("attachments")?.as_array())
        .flatten()
        .filter_map(|a| a.get("sha256")?.as_str())
        .collect::<BTreeSet<_>>();
    blobs.retain(|h, _| referenced.contains(h.as_str()));
    let b = Bundle {
        version: 1,
        workspace_id: local.workspace_id.clone(),
        versions,
        blobs,
        settings,
    };
    b.validate()?;
    Ok(b)
}
