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
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
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
