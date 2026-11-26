//! Product plugin registry. Tauri plugins remain platform bridges; this module
//! owns user-visible, disableable contributions and their local state.
//!
//! External packages are declarative only. The host validates and extracts
//! ZIP/GitHub packages into a private directory, but never executes package
//! files, loads scripts, or exposes Bluetooth/model/agent capabilities. Those
//! capabilities stay reserved until a separately reviewed native adapter exists.
use crate::store::{AppError, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::{Cursor, Read, Write},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use url::Url;
use zip::ZipArchive;

const STATE_VERSION: u32 = 1;
const PLUGIN_API_VERSION: &str = "1.0.0";
const CATALOG: &str = include_str!("../../src/plugins/catalog.json");

pub(crate) const MAX_ARCHIVE_BYTES: u64 = 16 * 1024 * 1024;
const MAX_EXPANDED_BYTES: u64 = 32 * 1024 * 1024;
const MAX_PACKAGE_ENTRY_BYTES: u64 = 8 * 1024 * 1024;
const MAX_MANIFEST_BYTES: u64 = 128 * 1024;
const MAX_ARCHIVE_ENTRIES: usize = 256;
const MAX_PATH_DEPTH: usize = 8;
const MAX_PATH_COMPONENT: usize = 64;
const MAX_UI_SECTIONS: usize = 8;
const MAX_UI_BODY: usize = 2000;
const MAX_GITHUB_DOWNLOAD_BYTES: usize = 16 * 1024 * 1024;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Catalog {
    version: u32,
    api_version: String,
    plugins: Vec<Manifest>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Manifest {
    id: String,
    name: String,
    description: String,
    version: String,
    builtin: bool,
    default_enabled: bool,
    platforms: Vec<String>,
    #[serde(default)]
    permissions: Vec<String>,
    contributes: Contributions,
    #[serde(default)]
    config: Vec<ConfigField>,
    #[serde(default)]
    ui: UiContribution,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ExternalManifest {
    manifest_version: u32,
    api_version: String,
    id: String,
    name: String,
    description: String,
    version: String,
    platforms: Vec<String>,
    #[serde(default)]
    permissions: Vec<String>,
    contributes: Contributions,
    #[serde(default)]
    config: Vec<ConfigField>,
    #[serde(default)]
    ui: UiContribution,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Contributions {
    #[serde(default)]
    commands: Vec<String>,
    #[serde(default)]
    panels: Vec<String>,
    #[serde(default)]
    themes: Vec<String>,
    #[serde(default)]
    devices: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UiContribution {
    #[serde(default)]
    sections: Vec<UiSection>,
    #[serde(default)]
    visibility_config: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UiSection {
    slot: String,
    title: String,
    body: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConfigField {
    key: String,
    #[serde(rename = "type")]
    kind: String,
    title: String,
    #[serde(default)]
    description: String,
    default: Value,
    #[serde(default)]
    options: Vec<ConfigOption>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConfigOption {
    value: String,
    label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StoredState {
    #[serde(default = "state_version")]
    version: u32,
    #[serde(default)]
    plugins: BTreeMap<String, StoredPlugin>,
    #[serde(default)]
    installed: BTreeMap<String, InstalledPlugin>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StoredPlugin {
    #[serde(default)]
    enabled: Option<bool>,
    #[serde(default)]
    config: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InstalledPlugin {
    version: String,
    source: String,
    source_ref: String,
    archive_sha256: String,
    manifest_sha256: String,
    installed_at: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct UpdateRequest {
    pub id: String,
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub config: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ArchiveRequest {
    pub path: String,
    #[serde(default)]
    pub expected_id: Option<String>,
    #[serde(default)]
    pub expected_version: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct GithubRequest {
    pub url: String,
    #[serde(default)]
    pub expected_id: Option<String>,
    #[serde(default)]
    pub expected_version: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct UninstallRequest {
    pub id: String,
}

#[derive(Debug, Clone)]
struct LoadedExternal {
    manifest: Manifest,
    installed: InstalledPlugin,
}

struct Inner {
    state: Option<StoredState>,
    error: Option<String>,
    revision: u64,
    external: BTreeMap<String, LoadedExternal>,
    install_errors: Vec<Value>,
}

pub(crate) struct PluginRuntime {
    path: PathBuf,
    plugins_dir: PathBuf,
    client: Option<reqwest::Client>,
    inner: Mutex<Inner>,
}

struct Package {
    manifest: Manifest,
    manifest_sha256: String,
    files: BTreeMap<String, Vec<u8>>,
}

#[derive(Debug, Clone)]
struct GithubTarget {
    owner: String,
    repo: String,
    git_ref: Option<String>,
    subdir: Option<String>,
    display: String,
}

struct EntryMeta {
    index: usize,
    path: String,
    directory: bool,
    size: u64,
}

fn state_version() -> u32 {
    STATE_VERSION
}

fn catalog() -> &'static Catalog {
    static VALUE: OnceLock<Catalog> = OnceLock::new();
    VALUE.get_or_init(|| {
        let catalog: Catalog =
            serde_json::from_str(CATALOG).expect("built-in plugin catalog must be valid JSON");
        validate_catalog(&catalog).expect("built-in plugin catalog must satisfy its schema");
        catalog
    })
}

fn current_platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "android") {
        "android"
    } else if cfg!(target_os = "ios") {
        "ios"
    } else if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    }
}

fn validate_catalog(catalog: &Catalog) -> std::result::Result<(), String> {
    if catalog.version != STATE_VERSION {
        return Err("unsupported plugin catalog version".into());
    }
    if semver_major(&catalog.api_version) != semver_major(PLUGIN_API_VERSION) {
        return Err("plugin API major version mismatch".into());
    }
    let mut ids = BTreeSet::new();
    for manifest in &catalog.plugins {
        validate_manifest_common(manifest)?;
        if !manifest.builtin {
            return Err("built-in plugin catalog entries must be built in".into());
        }
        if !ids.insert(manifest.id.as_str()) {
            return Err(format!("duplicate plugin id {}", manifest.id));
        }
    }
    Ok(())
}

fn validate_manifest_common(manifest: &Manifest) -> std::result::Result<(), String> {
    if !valid_plugin_id(&manifest.id) {
        return Err("插件 ID 必须使用反向域名格式".into());
    }
    if manifest.name.trim().is_empty() || manifest.name.chars().count() > 80 {
        return Err("插件名称无效".into());
    }
    if manifest.description.chars().count() > 500 {
        return Err("插件说明过长".into());
    }
    if !valid_version(&manifest.version) {
        return Err("插件版本必须是 x.y.z 格式".into());
    }
    if manifest.platforms.is_empty() {
        return Err(format!("插件 {} 未声明平台", manifest.id));
    }
    let mut platforms = BTreeSet::new();
    for platform in &manifest.platforms {
        if !matches!(
            platform.as_str(),
            "macos" | "android" | "ios" | "windows" | "linux" | "web"
        ) {
            return Err(format!("插件 {} 声明了未知平台", manifest.id));
        }
        if !platforms.insert(platform.as_str()) {
            return Err(format!("插件 {} 重复声明平台", manifest.id));
        }
    }
    let mut keys = BTreeSet::new();
    if manifest.config.len() > 16 {
        return Err("插件设置项过多".into());
    }
    for field in &manifest.config {
        if !valid_config_key(&field.key) || !keys.insert(field.key.as_str()) {
            return Err(format!("插件 {} 的设置键无效", manifest.id));
        }
        if field.title.trim().is_empty() || field.title.chars().count() > 80 {
            return Err(format!("插件 {} 的设置标题无效", manifest.id));
        }
        validate_field_schema(field)?;
    }
    validate_contributions(manifest)?;
    validate_ui(&manifest.ui, &manifest.config)?;
    Ok(())
}

fn validate_contributions(manifest: &Manifest) -> std::result::Result<(), String> {
    let total = manifest.contributes.commands.len()
        + manifest.contributes.panels.len()
        + manifest.contributes.themes.len()
        + manifest.contributes.devices.len();
    if total > 32 {
        return Err("插件声明的贡献过多".into());
    }
    for command in &manifest.contributes.commands {
        if !valid_contribution_id(command) {
            return Err(format!("插件 {} 的命令无效", manifest.id));
        }
    }
    for panel in &manifest.contributes.panels {
        if !valid_contribution_id(panel) {
            return Err(format!("插件 {} 的面板无效", manifest.id));
        }
    }
    for theme in &manifest.contributes.themes {
        if !valid_contribution_id(theme) {
            return Err(format!("插件 {} 的主题无效", manifest.id));
        }
    }
    for device in &manifest.contributes.devices {
        if !valid_contribution_id(device) {
            return Err(format!("插件 {} 的设备适配器无效", manifest.id));
        }
    }
    Ok(())
}

fn validate_ui(ui: &UiContribution, config: &[ConfigField]) -> std::result::Result<(), String> {
    if ui.sections.len() > MAX_UI_SECTIONS {
        return Err("插件界面区块过多".into());
    }
    for section in &ui.sections {
        if section.slot != "plugin.detail" {
            return Err("插件界面槽位不受支持".into());
        }
        if section.title.trim().is_empty() || section.title.chars().count() > 80 {
            return Err("插件界面区块标题无效".into());
        }
        if section.body.trim().is_empty() || section.body.chars().count() > MAX_UI_BODY {
            return Err("插件界面区块内容无效".into());
        }
    }
    if let Some(key) = ui.visibility_config.as_deref() {
        let Some(field) = config.iter().find(|field| field.key == key) else {
            return Err("插件界面可见性设置不存在".into());
        };
        if field.kind != "boolean" {
            return Err("插件界面可见性设置必须是布尔项".into());
        }
    }
    Ok(())
}

fn validate_external_manifest(external: ExternalManifest) -> std::result::Result<Manifest, String> {
    if external.manifest_version != 1 {
        return Err("插件清单版本不受支持".into());
    }
    if semver_major(&external.api_version) != semver_major(PLUGIN_API_VERSION) {
        return Err("插件 API 版本不兼容".into());
    }
    if !external.permissions.is_empty() {
        return Err("此版本的外部插件不能申请权限".into());
    }
    let manifest = Manifest {
        id: external.id,
        name: external.name,
        description: external.description,
        version: external.version,
        builtin: false,
        default_enabled: false,
        platforms: external.platforms,
        permissions: external.permissions,
        contributes: external.contributes,
        config: external.config,
        ui: external.ui,
    };
    validate_manifest_common(&manifest)?;
    Ok(manifest)
}

fn semver_major(version: &str) -> Option<&str> {
    version
        .split(['-', '+'])
        .next()
        .and_then(|core| core.split_once('.'))
        .map(|(major, _)| major)
}

fn valid_version(version: &str) -> bool {
    let core = version.split(['-', '+']).next().unwrap_or_default();
    let parts = core.split('.').collect::<Vec<_>>();
    parts.len() == 3
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_digit()))
}

fn compare_versions(left: &str, right: &str) -> std::cmp::Ordering {
    fn core(version: &str) -> [u64; 3] {
        let mut values = [0; 3];
        for (index, part) in version
            .split(['-', '+'])
            .next()
            .unwrap_or_default()
            .split('.')
            .take(3)
            .enumerate()
        {
            values[index] = part.parse().unwrap_or(0);
        }
        values
    }
    core(left).cmp(&core(right))
}

fn valid_plugin_id(id: &str) -> bool {
    id.split('.').count() >= 2
        && id.len() <= 128
        && id.split('.').all(|part| {
            !part.is_empty()
                && part
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        })
}

fn valid_contribution_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id.chars().all(|c| {
            c.is_ascii_lowercase()
                || c.is_ascii_digit()
                || c == '-'
                || c == '.'
                || c == ':'
                || c == '_'
        })
}

fn valid_config_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 64
        && key.starts_with(|c: char| c.is_ascii_lowercase())
        && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn validate_field_schema(field: &ConfigField) -> std::result::Result<(), String> {
    match field.kind.as_str() {
        "boolean" if field.default.is_boolean() && field.options.is_empty() => Ok(()),
        "select" => {
            let Some(value) = field.default.as_str() else {
                return Err(format!(
                    "config {} select default must be a string",
                    field.key
                ));
            };
            if field.options.is_empty()
                || !field
                    .options
                    .iter()
                    .any(|option| option.value == value && !option.label.is_empty())
            {
                return Err(format!(
                    "config {} select default is not an option",
                    field.key
                ));
            }
            Ok(())
        }
        _ => Err(format!("config {} has an unsupported type", field.key)),
    }
}

fn validate_value(field: &ConfigField, value: &Value) -> std::result::Result<(), String> {
    match field.kind.as_str() {
        "boolean" if value.is_boolean() => Ok(()),
        "select" => {
            let Some(value) = value.as_str() else {
                return Err(format!("设置 {} 必须是文本选项", field.key));
            };
            if field.options.iter().any(|option| option.value == value) {
                Ok(())
            } else {
                Err(format!("设置 {} 不是有效选项", field.key))
            }
        }
        "boolean" => Err(format!("设置 {} 必须是布尔值", field.key)),
        _ => Err(format!("设置 {} 的类型不受支持", field.key)),
    }
}

fn read_state(path: &Path) -> (Option<StoredState>, Option<String>) {
    match fs::read(path) {
        Ok(bytes) => match serde_json::from_slice::<StoredState>(&bytes) {
            Ok(state) if state.version == STATE_VERSION => (Some(state), None),
            Ok(_) => (
                None,
                Some("插件状态版本不受支持；插件已暂时关闭，原有状态未改写。".into()),
            ),
            Err(_) => (
                None,
                Some("插件状态无法读取；插件已暂时关闭，原有状态未改写。".into()),
            ),
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => (
            Some(StoredState {
                version: STATE_VERSION,
                plugins: BTreeMap::new(),
                installed: BTreeMap::new(),
            }),
            None,
        ),
        Err(_) => (
            None,
            Some("插件状态无法访问；插件已暂时关闭，原有状态未改写。".into()),
        ),
    }
}

fn write_atomic(path: &Path, bytes: &[u8]) -> std::result::Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "插件状态目录无效".to_string())?;
    fs::create_dir_all(parent).map_err(|_| "无法创建插件状态目录".to_string())?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or_default();
    let temporary = parent.join(format!(".plugins-{}-{stamp}.tmp", std::process::id()));
    let result = (|| {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&temporary)
            .map_err(|_| "无法写入插件状态".to_string())?;
        file.write_all(bytes)
            .and_then(|_| file.sync_all())
            .map_err(|_| "无法写入插件状态".to_string())?;
        drop(file);
        fs::rename(&temporary, path).map_err(|_| "无法替换插件状态".to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn write_state(path: &Path, state: &StoredState) -> std::result::Result<(), String> {
    let bytes = serde_json::to_vec_pretty(state).map_err(|_| "无法序列化插件状态".to_string())?;
    let previous = match fs::read(path) {
        Ok(previous) => Some(previous),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(_) => return Err("插件状态无法读取".into()),
    };
    // The first successful write also seeds a last-good copy. Later writes keep
    // the immediately preceding verified state instead.
    write_atomic(
        &path.with_extension("json.bak"),
        previous.as_deref().unwrap_or(&bytes),
    )?;
    write_atomic(path, &bytes)
}

fn config_values(manifest: &Manifest, stored: Option<&StoredPlugin>) -> Map<String, Value> {
    let mut values = Map::new();
    for field in &manifest.config {
        let candidate = stored
            .and_then(|plugin| plugin.config.as_ref())
            .and_then(Value::as_object)
            .and_then(|object| object.get(&field.key));
        values.insert(
            field.key.clone(),
            candidate
                .filter(|value| validate_value(field, value).is_ok())
                .cloned()
                .unwrap_or_else(|| field.default.clone()),
        );
    }
    values
}

fn plugin_projection(
    manifest: &Manifest,
    source: Value,
    stored: Option<&StoredPlugin>,
    enabled: bool,
) -> Value {
    json!({
        "id": manifest.id,
        "name": manifest.name,
        "description": manifest.description,
        "version": manifest.version,
        "builtin": manifest.builtin,
        "defaultEnabled": manifest.default_enabled,
        "platforms": manifest.platforms,
        "available": manifest.platforms.iter().any(|platform| platform == current_platform()),
        "enabled": enabled,
        "permissions": manifest.permissions,
        "contributes": manifest.contributes,
        "config": manifest.config,
        "configValues": config_values(manifest, stored),
        "source": source,
        "removable": !manifest.builtin,
        "ui": manifest.ui,
    })
}

fn snapshot(inner: &Inner) -> Value {
    let state_error = inner.error.as_deref();
    let mut plugins = Vec::new();
    for manifest in &catalog().plugins {
        let stored = inner
            .state
            .as_ref()
            .and_then(|state| state.plugins.get(&manifest.id));
        let enabled = state_error.is_none()
            && stored
                .and_then(|plugin| plugin.enabled)
                .unwrap_or(manifest.default_enabled);
        plugins.push(plugin_projection(
            manifest,
            json!({"kind": "builtin", "reference": "CyberNote", "installedAt": null}),
            stored,
            enabled,
        ));
    }
    for (id, loaded) in &inner.external {
        let stored = inner.state.as_ref().and_then(|state| state.plugins.get(id));
        let enabled =
            state_error.is_none() && stored.and_then(|plugin| plugin.enabled).unwrap_or(false);
        plugins.push(plugin_projection(
            &loaded.manifest,
            json!({
                "kind": loaded.installed.source.clone(),
                "reference": loaded.installed.source_ref.clone(),
                "installedAt": loaded.installed.installed_at,
            }),
            stored,
            enabled,
        ));
    }
    plugins.sort_by(|left, right| {
        left["id"]
            .as_str()
            .unwrap_or_default()
            .cmp(right["id"].as_str().unwrap_or_default())
    });
    json!({
        "version": STATE_VERSION,
        "apiVersion": PLUGIN_API_VERSION,
        "revision": inner.revision,
        "stateError": state_error,
        "installErrors": inner.install_errors,
        "plugins": plugins,
        "devices": {
            "bluetooth": false,
            "smartPen": false,
            "recordingDevice": false
        }
    })
}

fn unavailable_snapshot(message: &str) -> Value {
    json!({
        "version": STATE_VERSION,
        "apiVersion": PLUGIN_API_VERSION,
        "revision": 0,
        "stateError": message,
        "installErrors": [],
        "plugins": [],
        "devices": {"bluetooth": false, "smartPen": false, "recordingDevice": false}
    })
}

fn state_error(message: &str) -> AppError {
    AppError {
        code: "plugin_state".into(),
        message: message.into(),
        commit: None,
    }
}

fn install_error(message: &str) -> AppError {
    AppError {
        code: "plugin_install".into(),
        message: message.into(),
        commit: None,
    }
}

fn network_error(message: &str) -> AppError {
    AppError {
        code: "plugin_network".into(),
        message: message.into(),
        commit: None,
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or_default()
}

fn private_dir(path: &Path) -> std::result::Result<(), String> {
    fs::create_dir_all(path).map_err(|_| "无法创建插件目录".to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o700));
    }
    Ok(())
}

fn read_regular_file(path: &Path, max: u64) -> std::result::Result<Vec<u8>, String> {
    let meta = fs::symlink_metadata(path).map_err(|_| "无法读取插件文件".to_string())?;
    if !meta.file_type().is_file() || meta.file_type().is_symlink() || meta.len() > max {
        return Err("插件文件无效或超过大小限制".into());
    }
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW);
    }
    let file = options
        .open(path)
        .map_err(|_| "无法读取插件文件".to_string())?;
    let mut bytes = Vec::new();
    file.take(max + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "无法读取插件文件".to_string())?;
    if bytes.len() as u64 > max {
        return Err("插件文件超过大小限制".into());
    }
    Ok(bytes)
}

fn write_new_file(path: &Path, bytes: &[u8]) -> std::result::Result<(), String> {
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(path)
        .map_err(|_| "无法写入插件文件".to_string())?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "无法写入插件文件".to_string())
}

fn remove_tree(path: &Path) {
    if path.is_dir() {
        let _ = fs::remove_dir_all(path);
    }
}

fn load_external(
    root: &Path,
    state: &StoredState,
) -> (BTreeMap<String, LoadedExternal>, Vec<Value>) {
    let mut loaded = BTreeMap::new();
    let mut errors = Vec::new();
    for (id, installed) in &state.installed {
        let result = (|| {
            if catalog().plugins.iter().any(|manifest| manifest.id == *id) {
                return Err("外部插件不能覆盖内置插件".to_string());
            }
            let dir = root.join("plugins").join(id);
            let manifest_path = dir.join("manifest.json");
            let bytes = read_regular_file(&manifest_path, MAX_MANIFEST_BYTES)?;
            let manifest_sha = sha256_hex(&bytes);
            if manifest_sha != installed.manifest_sha256 {
                return Err("插件清单在安装后被修改".to_string());
            }
            let external: ExternalManifest =
                serde_json::from_slice(&bytes).map_err(|_| "插件清单无法解析".to_string())?;
            let manifest = validate_external_manifest(external)?;
            if manifest.id != *id {
                return Err("插件目录与清单 ID 不一致".into());
            }
            if manifest.version != installed.version {
                return Err("插件清单版本与安装记录不一致".into());
            }
            Ok(LoadedExternal {
                manifest,
                installed: installed.clone(),
            })
        })();
        match result {
            Ok(value) => {
                loaded.insert(id.clone(), value);
            }
            Err(message) => errors.push(json!({"id": id, "message": message})),
        }
    }
    (loaded, errors)
}

impl PluginRuntime {
    pub(crate) fn new(root: &Path) -> Self {
        let path = root.join("plugins.json");
        let plugins_dir = root.join("plugins");
        let (state, error) = read_state(&path);
        let (external, install_errors) = match (&state, &error) {
            (Some(state), None) => load_external(root, state),
            _ => (BTreeMap::new(), Vec::new()),
        };
        let client = reqwest::Client::builder()
            .user_agent(concat!("CyberNote/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(120))
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() >= 5 || !trusted_github_redirect(attempt.url()) {
                    attempt.error("untrusted_plugin_redirect")
                } else {
                    attempt.follow()
                }
            }))
            .build()
            .ok();
        Self {
            path,
            plugins_dir,
            client,
            inner: Mutex::new(Inner {
                state,
                error,
                revision: 1,
                external,
                install_errors,
            }),
        }
    }

    pub(crate) fn snapshot(&self) -> Value {
        self.inner
            .lock()
            .map(|inner| snapshot(&inner))
            .unwrap_or_else(|_| unavailable_snapshot("插件运行时不可用"))
    }

    #[cfg(target_os = "android")]
    pub(crate) fn staging_path(&self, extension: &str) -> Result<PathBuf> {
        let directory = self.plugins_dir.join(".incoming");
        private_dir(&directory).map_err(|message| install_error(&message))?;
        Ok(directory.join(format!("{}.{}", uuid::Uuid::new_v4(), extension)))
    }

    pub(crate) fn update(&self, request: UpdateRequest) -> Result<Value> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| state_error("插件运行时不可用"))?;
        if let Some(error) = inner.error.as_deref() {
            return Err(state_error(error));
        }
        let manifest = catalog()
            .plugins
            .iter()
            .find(|manifest| manifest.id == request.id)
            .or_else(|| {
                inner
                    .external
                    .get(&request.id)
                    .map(|loaded| &loaded.manifest)
            })
            .ok_or_else(|| state_error("未知插件"))?;
        let previous_state = inner
            .state
            .clone()
            .ok_or_else(|| state_error("插件状态不可用"))?;
        let previous = previous_state.plugins.get(&manifest.id).cloned();
        let mut entry = previous.clone().unwrap_or_default();
        let mut next_state = previous_state.clone();
        if let Some(enabled) = request.enabled {
            entry.enabled = Some(enabled);
        }
        if let Some(config) = request.config {
            let patch = config
                .as_object()
                .ok_or_else(|| state_error("插件设置必须是对象"))?;
            let mut merged = previous
                .as_ref()
                .and_then(|plugin| plugin.config.as_ref())
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default();
            for (key, value) in patch {
                let field = manifest
                    .config
                    .iter()
                    .find(|field| field.key == *key)
                    .ok_or_else(|| state_error("插件设置包含未知项"))?;
                validate_value(field, value).map_err(|message| state_error(&message))?;
                merged.insert(key.clone(), value.clone());
            }
            entry.config = Some(Value::Object(merged));
        }
        if entry.enabled.is_none() && entry.config.is_none() {
            next_state.plugins.remove(&manifest.id);
        } else {
            next_state.plugins.insert(manifest.id.clone(), entry);
        }
        if next_state == previous_state {
            return Ok(snapshot(&inner));
        }
        if let Err(message) = write_state(&self.path, &next_state) {
            return Err(state_error(&message));
        }
        inner.state = Some(next_state);
        inner.revision = inner.revision.saturating_add(1);
        Ok(snapshot(&inner))
    }

    pub(crate) fn preview_archive(&self, path: &str) -> Result<Value> {
        let source_ref = Path::new(path)
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.is_empty())
            .unwrap_or("插件包.zip")
            .to_string();
        let bytes = read_regular_file(Path::new(path), MAX_ARCHIVE_BYTES)
            .map_err(|message| install_error(&message))?;
        let package = inspect_package(&bytes, None).map_err(|message| install_error(&message))?;
        Ok(self.preview_value(&package, &bytes, "zip", &source_ref))
    }

    pub(crate) fn install_archive(&self, request: ArchiveRequest) -> Result<Value> {
        let source_ref = Path::new(&request.path)
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.is_empty())
            .unwrap_or("插件包.zip")
            .to_string();
        let bytes = read_regular_file(Path::new(&request.path), MAX_ARCHIVE_BYTES)
            .map_err(|message| install_error(&message))?;
        self.install_bytes(
            bytes,
            "zip",
            &source_ref,
            request.expected_id.as_deref(),
            request.expected_version.as_deref(),
        )
    }

    pub(crate) fn uninstall(&self, request: UninstallRequest) -> Result<Value> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| state_error("插件运行时不可用"))?;
        if let Some(error) = inner.error.as_deref() {
            return Err(state_error(error));
        }
        let mut next_state = inner
            .state
            .clone()
            .ok_or_else(|| state_error("插件状态不可用"))?;
        if next_state.installed.remove(&request.id).is_none() {
            return Err(state_error("只能卸载从文件或 GitHub 安装的插件"));
        }
        next_state.plugins.remove(&request.id);
        let final_dir = self.plugins_dir.join(&request.id);
        let trash =
            self.plugins_dir
                .join(format!(".removed-{}-{}", request.id, uuid::Uuid::new_v4()));
        let moved = if final_dir.exists() {
            fs::rename(&final_dir, &trash).map_err(|_| install_error("无法移除插件目录"))?;
            true
        } else {
            false
        };
        if let Err(message) = write_state(&self.path, &next_state) {
            if moved {
                let _ = fs::rename(&trash, &final_dir);
            }
            return Err(state_error(&message));
        }
        if moved {
            remove_tree(&trash);
        }
        inner.external.remove(&request.id);
        inner
            .install_errors
            .retain(|error| error["id"] != request.id);
        inner.state = Some(next_state);
        inner.revision = inner.revision.saturating_add(1);
        Ok(snapshot(&inner))
    }

    fn preview_value(&self, package: &Package, bytes: &[u8], kind: &str, reference: &str) -> Value {
        let manifest = &package.manifest;
        let inner = self.inner.lock().ok();
        let conflict = inner
            .as_ref()
            .map(|inner| install_conflict(&inner.state, manifest))
            .unwrap_or(Value::Null);
        json!({
            "id": manifest.id,
            "name": manifest.name,
            "description": manifest.description,
            "version": manifest.version,
            "platforms": manifest.platforms,
            "available": manifest.platforms.iter().any(|platform| platform == current_platform()),
            "permissions": manifest.permissions,
            "contributes": manifest.contributes,
            "config": manifest.config,
            "ui": manifest.ui,
            "source": {"kind": kind, "reference": reference},
            "manifestSha256": package.manifest_sha256,
            "archiveSha256": sha256_hex(bytes),
            "conflict": conflict,
        })
    }

    fn install_bytes(
        &self,
        bytes: Vec<u8>,
        source: &str,
        source_ref: &str,
        expected_id: Option<&str>,
        expected_version: Option<&str>,
    ) -> Result<Value> {
        let package = inspect_package(&bytes, None).map_err(|message| install_error(&message))?;
        self.commit_package(
            package,
            &bytes,
            source,
            source_ref,
            expected_id,
            expected_version,
        )
    }

    fn commit_package(
        &self,
        package: Package,
        bytes: &[u8],
        source: &str,
        source_ref: &str,
        expected_id: Option<&str>,
        expected_version: Option<&str>,
    ) -> Result<Value> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| state_error("插件运行时不可用"))?;
        if let Some(error) = inner.error.as_deref() {
            return Err(state_error(error));
        }
        let manifest = &package.manifest;
        if expected_id.is_some_and(|id| id != manifest.id)
            || expected_version.is_some_and(|version| version != manifest.version)
        {
            return Err(install_error("插件包在确认后发生变化，请重新检查"));
        }
        if catalog().plugins.iter().any(|item| item.id == manifest.id) {
            return Err(install_error("此 ID 属于内置插件，不能覆盖"));
        }
        let previous_state = inner
            .state
            .clone()
            .ok_or_else(|| state_error("插件状态不可用"))?;
        let previous_install = previous_state.installed.get(&manifest.id);
        if let Some(installed) = previous_install {
            match compare_versions(&manifest.version, &installed.version) {
                std::cmp::Ordering::Greater => {}
                std::cmp::Ordering::Equal => {
                    return Err(install_error("此版本已经安装"));
                }
                std::cmp::Ordering::Less => {
                    return Err(install_error("不能安装低于当前版本的插件"));
                }
            }
        }
        let final_dir = self.plugins_dir.join(&manifest.id);
        if final_dir.exists() && previous_install.is_none() {
            return Err(install_error("同名插件目录已存在，请先清理"));
        }
        private_dir(&self.plugins_dir).map_err(|message| install_error(&message))?;
        let staging =
            self.plugins_dir
                .join(format!(".staging-{}-{}", manifest.id, uuid::Uuid::new_v4()));
        private_dir(&staging).map_err(|message| install_error(&message))?;
        let write_result = (|| {
            for (relative, contents) in &package.files {
                let target = staging.join(relative);
                if let Some(parent) = target.parent() {
                    private_dir(parent)?;
                }
                write_new_file(&target, contents)?;
            }
            Ok::<(), String>(())
        })();
        if let Err(message) = write_result {
            remove_tree(&staging);
            return Err(install_error(&message));
        }
        let backup = self.plugins_dir.join(format!(
            ".previous-{}-{}",
            manifest.id,
            uuid::Uuid::new_v4()
        ));
        let had_previous = final_dir.exists();
        if had_previous {
            fs::rename(&final_dir, &backup).map_err(|_| install_error("无法暂存上一版插件"))?;
        }
        if fs::rename(&staging, &final_dir).is_err() {
            if had_previous {
                let _ = fs::rename(&backup, &final_dir);
            }
            remove_tree(&staging);
            return Err(install_error("无法发布插件目录"));
        }
        let installed = InstalledPlugin {
            version: manifest.version.clone(),
            source: source.into(),
            source_ref: source_ref.into(),
            archive_sha256: sha256_hex(bytes),
            manifest_sha256: package.manifest_sha256.clone(),
            installed_at: now_epoch(),
        };
        let mut next_state = previous_state.clone();
        next_state
            .installed
            .insert(manifest.id.clone(), installed.clone());
        if previous_install.is_none() {
            next_state.plugins.insert(
                manifest.id.clone(),
                StoredPlugin {
                    enabled: Some(false),
                    config: None,
                },
            );
        } else if let Some(entry) = next_state.plugins.get_mut(&manifest.id) {
            entry.enabled = Some(false);
        }
        if let Err(message) = write_state(&self.path, &next_state) {
            remove_tree(&final_dir);
            if had_previous {
                let _ = fs::rename(&backup, &final_dir);
            }
            return Err(state_error(&message));
        }
        remove_tree(&backup);
        inner.external.insert(
            manifest.id.clone(),
            LoadedExternal {
                manifest: manifest.clone(),
                installed,
            },
        );
        inner
            .install_errors
            .retain(|error| error["id"] != manifest.id);
        inner.state = Some(next_state);
        inner.revision = inner.revision.saturating_add(1);
        Ok(snapshot(&inner))
    }

    pub(crate) async fn preview_github(&self, url: &str) -> Result<Value> {
        let target = parse_github_target(url).map_err(|message| install_error(&message))?;
        let bytes = self.download_github(&target).await?;
        let package = inspect_package(&bytes, target.subdir.as_deref())
            .map_err(|message| install_error(&message))?;
        Ok(self.preview_value(&package, &bytes, "github", &target.display))
    }

    pub(crate) async fn install_github(&self, request: GithubRequest) -> Result<Value> {
        let target =
            parse_github_target(&request.url).map_err(|message| install_error(&message))?;
        let bytes = self.download_github(&target).await?;
        let package = inspect_package(&bytes, target.subdir.as_deref())
            .map_err(|message| install_error(&message))?;
        self.commit_package(
            package,
            &bytes,
            "github",
            &target.display,
            request.expected_id.as_deref(),
            request.expected_version.as_deref(),
        )
    }

    async fn download_github(&self, target: &GithubTarget) -> Result<Vec<u8>> {
        let client = self
            .client
            .as_ref()
            .ok_or_else(|| network_error("插件网络客户端不可用"))?;
        let mut url =
            Url::parse("https://api.github.com/").map_err(|_| network_error("GitHub 地址无效"))?;
        {
            let mut segments = url
                .path_segments_mut()
                .map_err(|_| network_error("GitHub 地址无效"))?;
            segments.pop_if_empty();
            segments.push("repos");
            segments.push(&target.owner);
            segments.push(&target.repo);
            segments.push("zipball");
            if let Some(git_ref) = target.git_ref.as_deref() {
                segments.push(git_ref);
            }
        }
        let task = async {
            let response = client
                .get(url)
                .header("Accept", "application/vnd.github+json")
                .send()
                .await
                .map_err(|_| "无法连接 GitHub".to_string())?;
            if !response.status().is_success() {
                return Err(match response.status().as_u16() {
                    404 => "GitHub 仓库或分支不存在，或仓库不是公开仓库".to_string(),
                    403 | 429 => "GitHub 暂时限制下载，请稍后重试".to_string(),
                    status => format!("GitHub 下载失败（HTTP {status}）"),
                });
            }
            if response
                .content_length()
                .is_some_and(|length| length > MAX_GITHUB_DOWNLOAD_BYTES as u64)
            {
                return Err("GitHub 插件包超过大小限制".to_string());
            }
            let mut bytes = Vec::new();
            let mut body = response;
            while let Some(chunk) = body
                .chunk()
                .await
                .map_err(|_| "GitHub 下载中断".to_string())?
            {
                if bytes.len() + chunk.len() > MAX_GITHUB_DOWNLOAD_BYTES {
                    return Err("GitHub 插件包超过大小限制".to_string());
                }
                bytes.extend_from_slice(&chunk);
            }
            Ok(bytes)
        };
        tokio::time::timeout(Duration::from_secs(90), task)
            .await
            .map_err(|_| network_error("GitHub 下载超时"))?
            .map_err(|message| network_error(&message))
    }
}

fn install_conflict(state: &Option<StoredState>, manifest: &Manifest) -> Value {
    if let Some(builtin) = catalog().plugins.iter().find(|item| item.id == manifest.id) {
        return json!({"kind": "builtin", "version": builtin.version});
    }
    let Some(installed) = state
        .as_ref()
        .and_then(|state| state.installed.get(&manifest.id))
    else {
        return Value::Null;
    };
    let kind = match compare_versions(&manifest.version, &installed.version) {
        std::cmp::Ordering::Greater => "upgrade",
        std::cmp::Ordering::Equal => "same",
        std::cmp::Ordering::Less => "downgrade",
    };
    json!({"kind": kind, "version": installed.version})
}

fn normalize_entry(name: &str) -> std::result::Result<(String, bool), String> {
    if name.is_empty()
        || name.len() > 1024
        || name.contains(['\\', '\0', ':'])
        || name.starts_with('/')
    {
        return Err("插件包包含不安全的路径".into());
    }
    let directory = name.ends_with('/');
    let raw = name.trim_end_matches('/');
    let parts = raw.split('/').collect::<Vec<_>>();
    if parts.is_empty() || parts.len() > MAX_PATH_DEPTH {
        return Err("插件包路径层级过深".into());
    }
    for part in &parts {
        if part.is_empty()
            || *part == "."
            || *part == ".."
            || part.len() > MAX_PATH_COMPONENT
            || part.starts_with('.')
            || *part == "__MACOSX"
        {
            return Err("插件包包含不安全的路径".into());
        }
    }
    Ok((parts.join("/"), directory))
}

fn forbidden_file(path: &str) -> bool {
    let extension = path
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase())
        .unwrap_or_default();
    matches!(
        extension.as_str(),
        "exe"
            | "dll"
            | "dylib"
            | "so"
            | "js"
            | "mjs"
            | "cjs"
            | "ts"
            | "tsx"
            | "jsx"
            | "sh"
            | "bash"
            | "zsh"
            | "bat"
            | "cmd"
            | "ps1"
            | "jar"
            | "class"
            | "wasm"
            | "py"
            | "rb"
            | "php"
            | "pl"
            | "app"
            | "apk"
            | "aab"
            | "bin"
            | "o"
            | "a"
            | "node"
            | "command"
            | "html"
            | "htm"
            | "xhtml"
            | "svg"
            | "lnk"
            | "url"
    )
}

fn inspect_package(
    bytes: &[u8],
    expected_subdir: Option<&str>,
) -> std::result::Result<Package, String> {
    if bytes.len() as u64 > MAX_ARCHIVE_BYTES {
        return Err("插件包超过大小限制".into());
    }
    let mut archive =
        ZipArchive::new(Cursor::new(bytes)).map_err(|_| "插件包不是有效的 ZIP 文件".to_string())?;
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err("插件包文件数量过多".into());
    }
    let mut entries = Vec::new();
    let mut names = BTreeSet::new();
    let mut total = 0u64;
    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|_| "无法读取插件包目录".to_string())?;
        if file.encrypted() {
            return Err("不支持加密的插件包".into());
        }
        if file.is_symlink() {
            return Err("插件包不能包含符号链接".into());
        }
        if let Some(mode) = file.unix_mode() {
            let kind = mode & 0o170000;
            let directory = file.is_dir();
            if ![0, 0o100000, 0o040000].contains(&kind)
                || (kind == 0o040000 && !directory)
                || (kind == 0o100000 && directory)
                || (kind == 0o100000 && mode & 0o111 != 0)
            {
                return Err("插件包包含链接、设备或可执行文件".into());
            }
        }
        let (path, directory) = normalize_entry(file.name())?;
        let key = path.to_lowercase();
        if !names.insert(key) {
            return Err("插件包包含重复或大小写冲突的路径".into());
        }
        if !directory && forbidden_file(&path) {
            return Err(format!("插件包不能包含可执行或页面文件：{path}"));
        }
        let size = file.size();
        if size > MAX_PACKAGE_ENTRY_BYTES {
            return Err("插件包单个文件超过大小限制".into());
        }
        total = total
            .checked_add(size)
            .ok_or_else(|| "插件包展开后过大".to_string())?;
        if total > MAX_EXPANDED_BYTES {
            return Err("插件包展开后超过大小限制".into());
        }
        entries.push(EntryMeta {
            index,
            path,
            directory,
            size,
        });
    }
    let mut candidates = entries
        .iter()
        .filter(|entry| {
            !entry.directory
                && (entry.path == "manifest.json" || entry.path.ends_with("/manifest.json"))
        })
        .collect::<Vec<_>>();
    if let Some(subdir) = expected_subdir {
        let expected = format!("{subdir}/manifest.json");
        candidates.retain(|entry| {
            let Some((_top, relative)) = entry.path.split_once('/') else {
                return false;
            };
            relative == expected
        });
    }
    if candidates.len() != 1 {
        return Err(if candidates.is_empty() {
            "插件包中没有 manifest.json，或 GitHub 子目录不正确".into()
        } else {
            "插件包包含多个 manifest.json；请使用子目录安装地址".into()
        });
    }
    let manifest_entry = candidates[0];
    let root = manifest_entry
        .path
        .strip_suffix("/manifest.json")
        .unwrap_or_default()
        .to_string();
    if manifest_entry.size > MAX_MANIFEST_BYTES {
        return Err("manifest.json 超过大小限制".into());
    }
    let manifest_bytes = {
        let file = archive
            .by_index(manifest_entry.index)
            .map_err(|_| "无法读取插件清单".to_string())?;
        let mut bytes = Vec::new();
        file.take(MAX_MANIFEST_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "无法读取插件清单".to_string())?;
        if bytes.len() as u64 > MAX_MANIFEST_BYTES {
            return Err("manifest.json 超过大小限制".into());
        }
        bytes
    };
    let external: ExternalManifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|_| "manifest.json 格式无效".to_string())?;
    let manifest = validate_external_manifest(external)?;
    let mut files = BTreeMap::new();
    let mut file_paths = BTreeSet::new();
    for entry in &entries {
        if !in_package_root(&entry.path, &root) {
            continue;
        }
        let relative = relative_to_root(&entry.path, &root);
        if relative.is_empty() || entry.directory {
            continue;
        }
        file_paths.insert(relative.to_string());
        if entry.index == manifest_entry.index {
            files.insert(relative.to_string(), manifest_bytes.clone());
            continue;
        }
        let file = archive
            .by_index(entry.index)
            .map_err(|_| "无法读取插件文件".to_string())?;
        let mut contents = Vec::new();
        file.take(MAX_PACKAGE_ENTRY_BYTES + 1)
            .read_to_end(&mut contents)
            .map_err(|_| "无法读取插件文件".to_string())?;
        if contents.len() as u64 > MAX_PACKAGE_ENTRY_BYTES || contents.len() as u64 != entry.size {
            return Err(format!("插件文件大小不一致：{relative}"));
        }
        files.insert(relative.to_string(), contents);
    }
    for file in &file_paths {
        let mut cursor = file.as_str();
        while let Some((parent, _)) = cursor.rsplit_once('/') {
            if file_paths.contains(parent) {
                return Err("插件包同时把同一路径声明为文件和目录".into());
            }
            cursor = parent;
        }
    }
    if !files.contains_key("manifest.json") {
        return Err("插件清单不在所选目录根目录".into());
    }
    Ok(Package {
        manifest,
        manifest_sha256: sha256_hex(&manifest_bytes),
        files,
    })
}

fn in_package_root(path: &str, root: &str) -> bool {
    root.is_empty() || path == root || path.starts_with(&format!("{root}/"))
}

fn relative_to_root<'a>(path: &'a str, root: &str) -> &'a str {
    if root.is_empty() {
        path
    } else if path == root {
        ""
    } else {
        path.strip_prefix(root)
            .and_then(|value| value.strip_prefix('/'))
            .unwrap_or("")
    }
}

fn trusted_github_redirect(url: &Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port_or_known_default() == Some(443)
        && matches!(
            url.host_str(),
            Some(
                "github.com"
                    | "api.github.com"
                    | "codeload.github.com"
                    | "objects.githubusercontent.com"
            )
        )
}

fn valid_github_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 100
        && value != "."
        && value != ".."
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

fn valid_relative_subdir(value: &str) -> bool {
    if value.is_empty() || value.len() > 512 {
        return false;
    }
    value.split('/').all(|part| {
        !part.is_empty()
            && part != "."
            && part != ".."
            && !part.starts_with('.')
            && part.len() <= MAX_PATH_COMPONENT
            && part
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    })
}

fn valid_git_ref(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && !value.starts_with('-')
        && !value.contains("..")
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '/'))
}

fn parse_github_target(input: &str) -> std::result::Result<GithubTarget, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("请输入 GitHub 仓库地址".into());
    }
    let normalized = if trimmed.contains("://") {
        trimmed.to_string()
    } else if trimmed.starts_with("github.com/") {
        format!("https://{trimmed}")
    } else {
        format!("https://github.com/{trimmed}")
    };
    let mut url = Url::parse(&normalized).map_err(|_| "GitHub 地址无效".to_string())?;
    if url.scheme() != "https"
        || url.host_str() != Some("github.com")
        || url.port_or_known_default() != Some(443)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
    {
        return Err("只支持 https://github.com/owner/repo 地址".into());
    }
    let segments = url
        .path_segments()
        .ok_or_else(|| "GitHub 地址无效".to_string())?
        .filter(|part| !part.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    if segments.len() < 2 || !valid_github_name(&segments[0]) || !valid_github_name(&segments[1]) {
        return Err("GitHub 地址必须包含 owner/repo".into());
    }
    let owner = segments[0].clone();
    let repo = segments[1].clone().trim_end_matches(".git").to_string();
    if !valid_github_name(&repo) {
        return Err("GitHub 仓库名称无效".into());
    }
    let mut git_ref = None;
    let mut subdir = url.fragment().map(str::to_string);
    if segments.len() > 2 {
        if segments[2] != "tree" || segments.len() < 4 {
            return Err("只支持仓库根地址或 /tree/<分支>/<子目录> 地址".into());
        }
        if url.fragment().is_some() {
            return Err("GitHub 地址不能同时包含子目录和片段".into());
        }
        let branch = segments[3].clone();
        if !valid_git_ref(&branch) {
            return Err("GitHub 分支名称无效".into());
        }
        git_ref = Some(branch);
        if segments.len() > 4 {
            subdir = Some(segments[4..].join("/"));
        }
    }
    if let Some(value) = subdir.as_deref() {
        if !valid_relative_subdir(value) {
            return Err("GitHub 插件子目录无效".into());
        }
    }
    url.set_fragment(None);
    let display = if let Some(value) = subdir.as_deref() {
        if let Some(branch) = git_ref.as_deref() {
            format!(
                "{}/tree/{branch}/{value}",
                url.as_str().trim_end_matches('/')
            )
        } else {
            format!("{}#{value}", url.as_str().trim_end_matches('/'))
        }
    } else {
        url.to_string()
    };
    Ok(GithubTarget {
        owner,
        repo,
        git_ref,
        subdir,
        display,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    fn runtime() -> (tempfile::TempDir, PluginRuntime) {
        let directory = tempfile::tempdir().unwrap();
        let runtime = PluginRuntime::new(directory.path());
        (directory, runtime)
    }

    fn plugin(snapshot: &Value) -> &Value {
        snapshot["plugins"]
            .as_array()
            .unwrap()
            .iter()
            .find(|plugin| plugin["id"] == "cybernote.attachments.inspector")
            .unwrap()
    }

    fn manifest(version: &str) -> String {
        format!(
            r#"{{
                "manifestVersion": 1,
                "apiVersion": "1.0.0",
                "id": "example.hello",
                "name": "Hello",
                "description": "A declarative sample.",
                "version": "{version}",
                "platforms": ["macos", "android"],
                "permissions": [],
                "contributes": {{"commands": ["hello.show"], "panels": [], "themes": [], "devices": []}},
                "ui": {{
                    "visibilityConfig": "showPanel",
                    "sections": [{{"slot": "plugin.detail", "title": "Hello", "body": "Rendered by the host."}}]
                }},
                "config": [{{
                    "key": "showPanel",
                    "type": "boolean",
                    "title": "Show panel",
                    "default": true
                }}]
            }}"#
        )
    }

    fn archive(files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut bytes = Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut bytes);
            let options = SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated)
                .unix_permissions(0o600);
            for (path, contents) in files {
                writer.start_file(*path, options).unwrap();
                writer.write_all(contents).unwrap();
            }
            writer.finish().unwrap();
        }
        bytes.into_inner()
    }

    fn sample_archive(version: &str) -> Vec<u8> {
        let manifest = manifest(version);
        archive(&[
            ("manifest.json", manifest.as_bytes()),
            ("README.md", b"# Hello\n"),
        ])
    }

    #[test]
    fn checked_in_sample_manifest_matches_the_external_schema() {
        let external: ExternalManifest = serde_json::from_str(include_str!(
            "../../examples/plugins/cybernote.sample/manifest.json"
        ))
        .unwrap();
        let manifest = validate_external_manifest(external).unwrap();
        assert_eq!(manifest.id, "cybernote.sample");
        assert_eq!(manifest.version, "1.0.0");
        assert!(manifest.permissions.is_empty());
        assert_eq!(manifest.ui.visibility_config.as_deref(), Some("showPanel"));
        assert_eq!(manifest.ui.sections.len(), 1);
    }

    #[test]
    fn github_subdir_archive_selects_only_the_plugin_directory() {
        let manifest = manifest("1.0.0");
        let bytes = archive(&[
            ("CyberNote-main/README.md", b"# Repository\n"),
            (
                "CyberNote-main/examples/plugins/cybernote.sample/manifest.json",
                manifest.as_bytes(),
            ),
            (
                "CyberNote-main/examples/plugins/cybernote.sample/README.md",
                b"# Sample\n",
            ),
        ]);
        let package = inspect_package(&bytes, Some("examples/plugins/cybernote.sample")).unwrap();
        assert_eq!(package.manifest.id, "example.hello");
        assert!(package.files.contains_key("manifest.json"));
        assert!(package.files.contains_key("README.md"));
        assert_eq!(package.files.len(), 2);
    }

    #[test]
    fn defaults_preserve_the_existing_attachment_feature() {
        let (_directory, runtime) = runtime();
        let current = runtime.snapshot();
        assert_eq!(current["version"], 1);
        assert_eq!(current["apiVersion"], "1.0.0");
        assert_eq!(plugin(&current)["id"], "cybernote.attachments.inspector");
        assert_eq!(plugin(&current)["enabled"], true);
        assert_eq!(plugin(&current)["configValues"]["showByteCount"], true);
        assert_eq!(current["devices"]["bluetooth"], false);
        assert_eq!(current["installErrors"], json!([]));
    }

    #[test]
    fn updates_are_atomic_confirmed_and_survive_reload() {
        let (directory, runtime) = runtime();
        let updated = runtime
            .update(UpdateRequest {
                id: "cybernote.attachments.inspector".into(),
                enabled: Some(false),
                config: Some(json!({"showRecordedAt": false})),
            })
            .unwrap();
        assert_eq!(plugin(&updated)["enabled"], false);
        assert_eq!(plugin(&updated)["configValues"]["showRecordedAt"], false);
        assert!(directory.path().join("plugins.json").is_file());
        assert!(directory.path().join("plugins.json.bak").is_file());
        let reloaded = PluginRuntime::new(directory.path()).snapshot();
        assert_eq!(plugin(&reloaded)["enabled"], false);
        assert_eq!(reloaded["revision"], 1);
    }

    #[test]
    fn partial_config_and_unknown_entries_are_preserved() {
        let (directory, _runtime) = runtime();
        fs::write(
            directory.path().join("plugins.json"),
            r#"{"version":1,"plugins":{"future.plugin":{"enabled":true}}}"#,
        )
        .unwrap();
        let reloaded = PluginRuntime::new(directory.path());
        reloaded
            .update(UpdateRequest {
                id: "cybernote.attachments.inspector".into(),
                enabled: None,
                config: Some(json!({"showByteCount": false})),
            })
            .unwrap();
        let state: StoredState =
            serde_json::from_slice(&fs::read(directory.path().join("plugins.json")).unwrap())
                .unwrap();
        assert!(state.plugins.contains_key("future.plugin"));
        assert_eq!(
            state.plugins["cybernote.attachments.inspector"]
                .config
                .as_ref()
                .unwrap()["showByteCount"],
            false
        );
    }

    #[test]
    fn invalid_updates_do_not_change_the_state() {
        let (directory, runtime) = runtime();
        let before = fs::read(directory.path().join("plugins.json")).ok();
        assert!(runtime
            .update(UpdateRequest {
                id: "unknown.plugin".into(),
                enabled: Some(false),
                config: None,
            })
            .is_err());
        assert!(runtime
            .update(UpdateRequest {
                id: "cybernote.attachments.inspector".into(),
                enabled: None,
                config: Some(json!({"unknown": true})),
            })
            .is_err());
        assert!(runtime
            .update(UpdateRequest {
                id: "cybernote.attachments.inspector".into(),
                enabled: None,
                config: Some(json!({"showByteCount": "yes"})),
            })
            .is_err());
        assert_eq!(fs::read(directory.path().join("plugins.json")).ok(), before);
    }

    #[test]
    fn identical_updates_do_not_rewrite_or_advance_revision() {
        let (directory, runtime) = runtime();
        let first = runtime
            .update(UpdateRequest {
                id: "cybernote.attachments.inspector".into(),
                enabled: Some(false),
                config: None,
            })
            .unwrap();
        let revision = first["revision"].clone();
        let state = fs::read(directory.path().join("plugins.json")).unwrap();
        let backup = fs::read(directory.path().join("plugins.json.bak")).unwrap();
        let second = runtime
            .update(UpdateRequest {
                id: "cybernote.attachments.inspector".into(),
                enabled: Some(false),
                config: None,
            })
            .unwrap();
        assert_eq!(second["revision"], revision);
        assert_eq!(
            fs::read(directory.path().join("plugins.json")).unwrap(),
            state
        );
        assert_eq!(
            fs::read(directory.path().join("plugins.json.bak")).unwrap(),
            backup
        );
    }

    #[test]
    fn corrupt_state_is_reported_and_never_overwritten() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("plugins.json");
        fs::write(&path, b"{not json").unwrap();
        let runtime = PluginRuntime::new(directory.path());
        let current = runtime.snapshot();
        assert!(current["stateError"].as_str().is_some());
        assert_eq!(plugin(&current)["enabled"], false);
        assert!(runtime
            .update(UpdateRequest {
                id: "cybernote.attachments.inspector".into(),
                enabled: Some(true),
                config: None,
            })
            .is_err());
        assert_eq!(fs::read(path).unwrap(), b"{not json");
    }

    #[test]
    fn zip_package_installs_disabled_and_reloads() {
        let (directory, runtime) = runtime();
        let path = directory.path().join("hello.zip");
        fs::write(&path, sample_archive("1.0.0")).unwrap();
        let preview = runtime.preview_archive(path.to_str().unwrap()).unwrap();
        assert_eq!(preview["id"], "example.hello");
        assert_eq!(preview["conflict"], Value::Null);
        let installed = runtime
            .install_archive(ArchiveRequest {
                path: path.to_str().unwrap().into(),
                expected_id: Some("example.hello".into()),
                expected_version: Some("1.0.0".into()),
            })
            .unwrap();
        let external = installed["plugins"]
            .as_array()
            .unwrap()
            .iter()
            .find(|plugin| plugin["id"] == "example.hello")
            .unwrap();
        assert_eq!(external["enabled"], false);
        assert_eq!(external["source"]["kind"], "zip");
        assert_eq!(external["ui"]["sections"][0]["title"], "Hello");
        let reloaded = PluginRuntime::new(directory.path()).snapshot();
        let external = reloaded["plugins"]
            .as_array()
            .unwrap()
            .iter()
            .find(|plugin| plugin["id"] == "example.hello")
            .unwrap();
        assert_eq!(external["version"], "1.0.0");
        assert_eq!(reloaded["installErrors"], json!([]));
    }

    #[test]
    fn upgrades_keep_config_and_uninstall_removes_the_package() {
        let (directory, runtime) = runtime();
        let first = directory.path().join("first.zip");
        fs::write(&first, sample_archive("1.0.0")).unwrap();
        runtime
            .install_archive(ArchiveRequest {
                path: first.to_str().unwrap().into(),
                expected_id: None,
                expected_version: None,
            })
            .unwrap();
        runtime
            .update(UpdateRequest {
                id: "example.hello".into(),
                enabled: Some(true),
                config: Some(json!({"showPanel": false})),
            })
            .unwrap();
        let second = directory.path().join("second.zip");
        fs::write(&second, sample_archive("1.1.0")).unwrap();
        let preview = runtime.preview_archive(second.to_str().unwrap()).unwrap();
        assert_eq!(preview["conflict"]["kind"], "upgrade");
        let upgraded = runtime
            .install_archive(ArchiveRequest {
                path: second.to_str().unwrap().into(),
                expected_id: Some("example.hello".into()),
                expected_version: Some("1.1.0".into()),
            })
            .unwrap();
        let external = upgraded["plugins"]
            .as_array()
            .unwrap()
            .iter()
            .find(|plugin| plugin["id"] == "example.hello")
            .unwrap();
        assert_eq!(external["version"], "1.1.0");
        assert_eq!(external["enabled"], false);
        assert_eq!(external["configValues"]["showPanel"], false);
        let removed = runtime
            .uninstall(UninstallRequest {
                id: "example.hello".into(),
            })
            .unwrap();
        assert!(removed["plugins"]
            .as_array()
            .unwrap()
            .iter()
            .all(|plugin| plugin["id"] != "example.hello"));
        assert!(!directory.path().join("plugins/example.hello").exists());
    }

    #[test]
    fn unsafe_and_ambiguous_archives_are_rejected() {
        let cases = [
            archive(&[("../manifest.json", b"{}")]),
            archive(&[("/manifest.json", b"{}")]),
            archive(&[("manifest.json", br#"{"manifestVersion":1}"#)]),
            archive(&[
                ("a/manifest.json", manifest("1.0.0").as_bytes()),
                ("b/manifest.json", manifest("1.0.0").as_bytes()),
            ]),
            archive(&[
                ("manifest.json", manifest("1.0.0").as_bytes()),
                ("run.js", b"console.log(1)"),
            ]),
        ];
        for bytes in cases {
            assert!(inspect_package(&bytes, None).is_err());
        }
    }

    #[test]
    fn builtin_ids_and_downgrades_are_refused() {
        let (directory, runtime) = runtime();
        let builtin = archive(&[(
            "manifest.json",
            manifest("1.0.0")
                .replace("example.hello", "cybernote.attachments.inspector")
                .as_bytes(),
        )]);
        let path = directory.path().join("builtin.zip");
        fs::write(&path, builtin).unwrap();
        assert!(runtime
            .install_archive(ArchiveRequest {
                path: path.to_str().unwrap().into(),
                expected_id: None,
                expected_version: None,
            })
            .is_err());
        let first = directory.path().join("first.zip");
        fs::write(&first, sample_archive("1.1.0")).unwrap();
        runtime
            .install_archive(ArchiveRequest {
                path: first.to_str().unwrap().into(),
                expected_id: None,
                expected_version: None,
            })
            .unwrap();
        let old = directory.path().join("old.zip");
        fs::write(&old, sample_archive("1.0.0")).unwrap();
        assert!(runtime
            .install_archive(ArchiveRequest {
                path: old.to_str().unwrap().into(),
                expected_id: None,
                expected_version: None,
            })
            .is_err());
    }

    #[test]
    fn github_addresses_are_strict_and_support_tree_paths() {
        let target = parse_github_target("https://github.com/ywateru/CyberNote").unwrap();
        assert_eq!(target.owner, "ywateru");
        assert_eq!(target.repo, "CyberNote");
        assert_eq!(target.git_ref, None);
        let target = parse_github_target(
            "https://github.com/ywateru/CyberNote/tree/main/examples/plugins/cybernote.sample",
        )
        .unwrap();
        assert_eq!(target.git_ref.as_deref(), Some("main"));
        assert_eq!(
            target.subdir.as_deref(),
            Some("examples/plugins/cybernote.sample")
        );
        for invalid in [
            "http://github.com/a/b",
            "https://evil.example/a/b",
            "https://github.com/a",
            "https://github.com/a/b/issues",
            "https://user@github.com/a/b",
            "https://github.com/a/b/tree/main/../../etc",
        ] {
            assert!(parse_github_target(invalid).is_err(), "{invalid}");
        }
    }

    #[test]
    fn github_download_redirects_are_limited_to_github_hosts() {
        assert!(trusted_github_redirect(
            &Url::parse("https://codeload.github.com/a/b/zip/refs/heads/main").unwrap()
        ));
        assert!(!trusted_github_redirect(
            &Url::parse("https://github.com.evil.example/a").unwrap()
        ));
        assert!(!trusted_github_redirect(
            &Url::parse("http://api.github.com/a").unwrap()
        ));
    }

    #[test]
    fn missing_external_package_is_reported_not_hidden() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(
            directory.path().join("plugins.json"),
            r#"{"version":1,"plugins":{},"installed":{"example.hello":{"version":"1.0.0","source":"zip","sourceRef":"hello.zip","archiveSha256":"00","manifestSha256":"00","installedAt":1}}}"#,
        )
        .unwrap();
        let runtime = PluginRuntime::new(directory.path());
        let snapshot = runtime.snapshot();
        assert_eq!(snapshot["installErrors"][0]["id"], "example.hello");
        runtime
            .uninstall(UninstallRequest {
                id: "example.hello".into(),
            })
            .unwrap();
        assert_eq!(runtime.snapshot()["installErrors"], json!([]));
    }
}
