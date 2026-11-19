use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Preferences {
    pub check_on_startup: bool,
    pub automatic_checks: bool,
    pub interval_minutes: u32,
    pub channel: Channel,
    pub show_badge: bool,
    pub quiet_until: u64,
    #[serde(flatten)]
    pub extra: BTreeMap<String, serde_json::Value>,
}
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Channel {
    #[default]
    Stable,
    Preview,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            check_on_startup: true,
            automatic_checks: true,
            interval_minutes: 360,
            channel: Channel::Stable,
            show_badge: true,
            quiet_until: 0,
            extra: BTreeMap::new(),
        }
    }
}
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreferencePatch {
    pub check_on_startup: Option<bool>,
    pub automatic_checks: Option<bool>,
    pub interval_minutes: Option<u32>,
    pub channel: Option<Channel>,
    pub show_badge: Option<bool>,
    pub quiet_until: Option<u64>,
}
impl Preferences {
    pub fn patch(&self, p: PreferencePatch) -> Result<Self, String> {
        let mut n = self.clone();
        if let Some(v) = p.check_on_startup {
            n.check_on_startup = v;
        }
        if let Some(v) = p.automatic_checks {
            n.automatic_checks = v;
        }
        if let Some(v) = p.interval_minutes {
            n.interval_minutes = v;
        }
        if let Some(v) = p.channel {
            n.channel = v;
        }
        if let Some(v) = p.show_badge {
            n.show_badge = v;
        }
        if let Some(v) = p.quiet_until {
            n.quiet_until = v;
        }
        n.validate()?;
        Ok(n)
    }
    fn validate(&self) -> Result<(), String> {
        if ![15, 30, 60, 360, 720, 1440].contains(&self.interval_minutes) {
            return Err("invalid_interval".into());
        }
        Ok(())
    }
}
pub fn private_dir(path: &Path) -> Result<PathBuf, String> {
    match fs::symlink_metadata(path) {
        Ok(m) if !m.is_dir() || m.file_type().is_symlink() => {
            return Err("unsafe_update_directory".into())
        }
        Ok(_) => (),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir_all(path).map_err(err)?;
        }
        Err(e) => return Err(err(e)),
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        let m = fs::metadata(path).map_err(err)?;
        if m.uid() != unsafe { libc::geteuid() } {
            return Err("update_directory_owner".into());
        }
        fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(err)?;
    }
    fs::canonicalize(path).map_err(err)
}
pub fn read(path: &Path) -> Result<Option<Vec<u8>>, String> {
    match fs::symlink_metadata(path) {
        Ok(m) if !m.is_file() || m.file_type().is_symlink() || m.len() > 1024 * 1024 => {
            return Err("unsafe_update_file".into())
        }
        Ok(_) => (),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(err(e)),
    }
    fs::read(path).map(Some).map_err(err)
}
pub fn atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(old) = read(path)? {
        if old == bytes {
            return Ok(());
        }
    }
    let temp = path.with_extension(format!("tmp-{}", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut f = options.open(&temp).map_err(err)?;
        f.write_all(bytes).map_err(err)?;
        f.sync_all().map_err(err)?;
        fs::rename(&temp, path).map_err(err)?;
        fs::File::open(path.parent().ok_or("invalid_path")?)
            .and_then(|f| f.sync_all())
            .map_err(err)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}
pub struct PreferenceFile {
    path: PathBuf,
    original: Option<Vec<u8>>,
}
impl PreferenceFile {
    pub fn load(dir: &Path) -> Result<(Self, Preferences), String> {
        let path = dir.join("preferences.json");
        let original = read(&path)?;
        let prefs = original
            .as_deref()
            .map(serde_json::from_slice)
            .transpose()
            .map_err(|e| format!("invalid_preferences: {e}"))?
            .unwrap_or_default();
        Preferences::validate(&prefs)?;
        Ok((Self { path, original }, prefs))
    }
    pub fn save(&mut self, p: &Preferences) -> Result<(), String> {
        if read(&self.path)? != self.original {
            return Err("preferences_changed_externally".into());
        }
        let bytes = serde_json::to_vec_pretty(p).map_err(err)?;
        atomic(&self.path, &bytes)?;
        self.original = Some(bytes);
        Ok(())
    }
}
pub fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
