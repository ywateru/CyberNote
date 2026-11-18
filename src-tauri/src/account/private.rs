//! App-private binding; independent of user backup/settings. Reject unsafe paths.
use super::types::{Error, Result};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::Path,
};
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Binding {
    pub issuer: String,
    pub subject: String,
    pub product_id: String,
    pub workspace_id: String,
    pub device_id: String,
    pub noise_public_key: String,
    pub enabled: bool,
}
pub fn directory(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(m) if m.is_dir() && !m.file_type().is_symlink() => (),
        Ok(_) => return Err(Error::Storage),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => fs::create_dir(path)?,
        Err(_) => return Err(Error::Storage),
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}
pub(super) fn read_bytes(path: &Path, limit: usize) -> Result<Option<Vec<u8>>> {
    let m = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(Error::Storage),
    };
    if !m.is_file() || m.file_type().is_symlink() || m.len() > limit as u64 {
        return Err(Error::Storage);
    }
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
        if m.mode() & 0o777 != 0o600 || m.uid() != unsafe { libc::geteuid() } || m.nlink() != 1 {
            return Err(Error::Storage);
        }
        options.custom_flags(libc::O_NOFOLLOW);
    }
    let mut bytes = Vec::new();
    options
        .open(path)?
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > limit {
        return Err(Error::Storage);
    }
    Ok(Some(bytes))
}
pub fn read(path: &Path) -> Result<Option<Binding>> {
    let m = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(Error::Storage),
    };
    if !m.is_file() || m.file_type().is_symlink() || m.len() > 8192 {
        return Err(Error::Storage);
    }
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
        if m.mode() & 0o777 != 0o600 || m.uid() != unsafe { libc::geteuid() } {
            return Err(Error::Storage);
        }
        options.custom_flags(libc::O_NOFOLLOW);
    }
    let mut bytes = Vec::new();
    options.open(path)?.take(8193).read_to_end(&mut bytes)?;
    let binding: Binding = serde_json::from_slice(&bytes).map_err(|_| Error::Storage)?;
    uuid::Uuid::parse_str(&binding.workspace_id).map_err(|_| Error::Storage)?;
    uuid::Uuid::parse_str(&binding.device_id).map_err(|_| Error::Storage)?;
    Ok(Some(binding))
}
pub fn write(path: &Path, binding: &Binding) -> Result<()> {
    atomic_write(
        path,
        &serde_json::to_vec(binding).map_err(|_| Error::Storage)?,
    )
}
pub(super) fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let dir = path.parent().ok_or(Error::Storage)?;
    directory(dir)?;
    let temp = dir.join(format!(".binding-{}", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        fs::rename(&temp, path)?;
        File::open(dir)?.sync_all()?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result
}

/// Installation metadata, independent of account/enrollment and never removed
/// by logout. Contains no credential, protocol key or transport association.
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Registry {
    pub registry_device_id: String,
    pub registry_key: String,
    pub revision: u64,
    pub name: String,
}
pub(crate) fn device_name(input: &str) -> Result<String> {
    let name = input.trim();
    if name.is_empty() || name.chars().count() > 96 || input.chars().any(char::is_control) {
        return Err(Error::Configuration);
    }
    Ok(name.into())
}
pub(crate) fn registry(root: &Path) -> Result<Registry> {
    let path = root.join("registry.json");
    match fs::symlink_metadata(&path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
            use rand::RngCore;
            let id = uuid::Uuid::new_v4().to_string();
            let mut key = [0_u8; 32];
            rand::rngs::OsRng.fill_bytes(&mut key);
            let value = Registry {
                name: format!(
                    "CyberNote {} {}",
                    if cfg!(target_os = "android") {
                        "Android"
                    } else {
                        "Mac"
                    },
                    &id[..8]
                ),
                registry_device_id: id,
                registry_key: URL_SAFE_NO_PAD.encode(key),
                revision: 0,
            };
            write_registry(root, &value)?;
            Ok(value)
        }
        Ok(m) if m.is_file() && !m.file_type().is_symlink() && m.len() <= 8192 => {
            let mut options = OpenOptions::new();
            options.read(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
                if m.mode() & 0o777 != 0o600 || m.uid() != unsafe { libc::geteuid() } {
                    return Err(Error::Storage);
                }
                options.custom_flags(libc::O_NOFOLLOW);
            }
            let mut bytes = Vec::new();
            options.open(path)?.take(8193).read_to_end(&mut bytes)?;
            let value: Registry = serde_json::from_slice(&bytes).map_err(|_| Error::Storage)?;
            if !valid_registry(&value) {
                return Err(Error::Storage);
            }
            Ok(value)
        }
        _ => Err(Error::Storage),
    }
}
pub(crate) fn registry_id(input: &str) -> bool {
    uuid::Uuid::parse_str(input).is_ok_and(|id| {
        id.get_version_num() == 4
            && id.get_variant() == uuid::Variant::RFC4122
            && id.to_string() == input
    })
}
pub(crate) fn write_registry(root: &Path, value: &Registry) -> Result<()> {
    if !valid_registry(value) {
        return Err(Error::Configuration);
    }
    atomic_write(
        &root.join("registry.json"),
        &serde_json::to_vec(value).map_err(|_| Error::Storage)?,
    )
}
fn valid_registry(value: &Registry) -> bool {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
    registry_id(&value.registry_device_id)
        && device_name(&value.name).is_ok_and(|name| name == value.name)
        && value.revision <= super::types::MAX_SAFE_INTEGER
        && B64
            .decode(&value.registry_key)
            .is_ok_and(|key| key.len() == 32 && B64.encode(&key) == value.registry_key)
}
pub(crate) fn next_registration(root: &Path, registry: &mut Registry) -> Result<Registry> {
    let mut next = registry.clone();
    next.revision = next
        .revision
        .checked_add(1)
        .filter(|n| *n <= super::types::MAX_SAFE_INTEGER)
        .ok_or(Error::Storage)?;
    write_registry(root, &next)?;
    *registry = next.clone();
    Ok(next)
}

// Public session metadata, separate from the current login. It permits return
// to a paused old account workspace without relabeling its device/causal history.
// No grant, enrollment proof, peer secret or Noise private key is copied here.
pub(crate) fn remember_session(root: &Path, binding: &Binding) -> Result<()> {
    let device = uuid::Uuid::parse_str(&binding.device_id).map_err(|_| Error::Storage)?;
    if device.to_string() != binding.device_id {
        return Err(Error::Storage);
    }
    directory(root)?;
    let records = root.join("sessions");
    directory(&records)?;
    let mut paused = binding.clone();
    paused.enabled = false;
    write(&records.join(format!("{device}.json")), &paused)
}
pub(crate) fn remembered_session(root: &Path, device: &str) -> Result<Option<Binding>> {
    let id = uuid::Uuid::parse_str(device).map_err(|_| Error::Storage)?;
    if id.to_string() != device {
        return Err(Error::Storage);
    }
    let records = root.join("sessions");
    match fs::symlink_metadata(&records) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Ok(m) if m.is_dir() && !m.file_type().is_symlink() => (),
        _ => return Err(Error::Storage),
    }
    read(&records.join(format!("{id}.json")))
}
pub(crate) fn clear_session(root: &Path) -> Result<()> {
    let path = root.join("binding.json");
    if let Some(binding) = read(&path)? {
        // Remember first, so interruption never strands the old account history.
        remember_session(root, &binding)?;
        fs::remove_file(path)?;
        File::open(root)?.sync_all()?;
    }
    // With no retained login this marker must not prevent manual recovery.
    complete_adoption(root)
}

// This marker contains no identity or grant. It is written before explicit
// adoption and prevents an interrupted attempt from becoming automatic opt-in
// on restart. The SQLite transaction is the authority for the actual workspace.
pub(crate) fn adoption_pending(root: &Path) -> Result<bool> {
    let path = root.join("adoption-pending");
    match fs::symlink_metadata(&path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Ok(m) if m.is_file() && !m.file_type().is_symlink() && m.len() == 1 => {
            let mut options = OpenOptions::new();
            options.read(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.custom_flags(libc::O_NOFOLLOW);
            }
            let mut byte = [0];
            options.open(path)?.read_exact(&mut byte)?;
            if byte != [1] {
                return Err(Error::Storage);
            }
            Ok(true)
        }
        _ => Err(Error::Storage),
    }
}
pub(crate) fn begin_adoption(root: &Path) -> Result<()> {
    if adoption_pending(root)? {
        return Ok(());
    }
    atomic_write(&root.join("adoption-pending"), &[1])
}
pub(crate) fn complete_adoption(root: &Path) -> Result<()> {
    if adoption_pending(root)? {
        fs::remove_file(root.join("adoption-pending"))?;
        File::open(root)?.sync_all()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn registry_key_id_and_revision_survive_signout_and_rejected_late_publications() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join(".account");
        directory(&root).unwrap();
        let mut first = registry(&root).unwrap();
        assert!(registry_id(&first.registry_device_id));
        let key = first.registry_key.clone();
        let id = first.registry_device_id.clone();
        assert_eq!(first.revision, 0);
        let put = next_registration(&root, &mut first).unwrap();
        assert_eq!(put.revision, 1);
        // Simulate a failed/ambiguous HTTP PUT, restart, rename and logout.
        let mut restored = registry(&root).unwrap();
        assert_eq!(restored.revision, 1);
        restored.name = device_name("  Work Mac  ").unwrap();
        write_registry(&root, &restored).unwrap();
        write(&root.join("binding.json"), &binding()).unwrap();
        clear_session(&root).unwrap();
        let mut restored = registry(&root).unwrap();
        assert_eq!(restored.registry_device_id, id);
        assert!(restored.registry_key == key);
        assert_eq!(restored.name, "Work Mac");
        assert_eq!(next_registration(&root, &mut restored).unwrap().revision, 2);
        restored.revision = super::super::types::MAX_SAFE_INTEGER;
        write_registry(&root, &restored).unwrap();
        let bytes = fs::read(root.join("registry.json")).unwrap();
        assert_eq!(
            next_registration(&root, &mut restored).err(),
            Some(Error::Storage)
        );
        assert_eq!(fs::read(root.join("registry.json")).unwrap(), bytes);
        for name in ["", "   ", "bad\nname", &"x".repeat(97)] {
            assert!(device_name(name).is_err());
        }
        #[cfg(unix)]
        {
            fs::remove_file(root.join("registry.json")).unwrap();
            std::os::unix::fs::symlink(root.join("binding.json"), root.join("registry.json"))
                .unwrap();
            assert!(registry(&root).is_err());
        }
    }
    fn binding() -> Binding {
        Binding {
            issuer: super::super::config::ISSUER.into(),
            subject: "synthetic-owner".into(),
            product_id: "cybernote".into(),
            workspace_id: uuid::Uuid::new_v4().to_string(),
            device_id: uuid::Uuid::new_v4().to_string(),
            noise_public_key: "synthetic-test-only".into(),
            enabled: true,
        }
    }
    #[test]
    fn durable_binding_survives_pause_without_changing_workspace_or_device() {
        let dir = tempfile::tempdir().unwrap();
        let private = dir.path().join(".account");
        directory(&private).unwrap();
        let path = private.join("binding.json");
        let original = binding();
        write(&path, &original).unwrap();
        assert!(read(&path).unwrap().unwrap() == original);
        let mut paused = original.clone();
        paused.enabled = false;
        write(&path, &paused).unwrap();
        assert!(read(&path).unwrap().unwrap() == paused);
        assert_eq!(original.workspace_id, paused.workspace_id);
        assert_eq!(original.device_id, paused.device_id);
        assert!(std::fs::read_dir(&private)
            .unwrap()
            .all(|p| p.unwrap().file_name() == "binding.json"));
    }
    #[test]
    fn signout_remembers_paused_device_without_retaining_current_binding_or_touching_grant() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join(".account");
        directory(&root).unwrap();
        let original = binding();
        write(&root.join("binding.json"), &original).unwrap();
        fs::write(root.join("grant.json"), b"synthetic untouched bytes").unwrap();
        begin_adoption(&root).unwrap();
        clear_session(&root).unwrap();
        clear_session(&root).unwrap();
        assert!(read(&root.join("binding.json")).unwrap().is_none());
        assert!(!adoption_pending(&root).unwrap());
        let saved = remembered_session(&root, &original.device_id)
            .unwrap()
            .unwrap();
        let mut expected = original;
        expected.enabled = false;
        assert!(saved == expected);
        assert_eq!(
            fs::read(root.join("grant.json")).unwrap(),
            b"synthetic untouched bytes"
        );
        assert!(remembered_session(&root, "../binding").is_err());
        #[cfg(unix)]
        {
            let records = root.join("sessions");
            fs::rename(&records, root.join("saved-sessions")).unwrap();
            std::os::unix::fs::symlink(root.join("saved-sessions"), &records).unwrap();
            assert!(remembered_session(&root, &expected.device_id).is_err());
            assert!(remember_session(&root, &expected).is_err());
        }
    }
    #[test]
    fn adoption_marker_survives_restart_and_does_not_rewrite_binding() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join(".account");
        directory(&root).unwrap();
        let path = root.join("binding.json");
        write(&path, &binding()).unwrap();
        let before = fs::read(&path).unwrap();
        assert!(!adoption_pending(&root).unwrap());
        begin_adoption(&root).unwrap();
        begin_adoption(&root).unwrap();
        assert!(adoption_pending(&root).unwrap());
        assert_eq!(fs::read(&path).unwrap(), before);
        complete_adoption(&root).unwrap();
        complete_adoption(&root).unwrap();
        assert!(!adoption_pending(&root).unwrap());
        fs::write(root.join("adoption-pending"), [2]).unwrap();
        assert_eq!(adoption_pending(&root), Err(Error::Storage));
        assert_eq!(complete_adoption(&root), Err(Error::Storage));
    }
    #[cfg(unix)]
    #[test]
    fn binding_symlink_and_unsafe_modes_fail_closed() {
        use std::os::unix::fs::{symlink, PermissionsExt};
        let dir = tempfile::tempdir().unwrap();
        let other = dir.path().join("other");
        std::fs::write(&other, b"unrelated user content").unwrap();
        let link = dir.path().join("binding.json");
        symlink(&other, &link).unwrap();
        assert!(read(&link).is_err());
        assert_eq!(std::fs::read(&other).unwrap(), b"unrelated user content");
        let path = dir.path().join("valid.json");
        write(&path, &binding()).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert!(read(&path).is_err());
    }
}
