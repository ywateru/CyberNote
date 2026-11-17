use serde::Deserialize;
use std::{
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
};

/// Only the sidecar shipped beside this application may be launched by the UI.
pub fn beside(executable: &Path) -> Result<PathBuf, String> {
    let path = executable
        .parent()
        .ok_or("Unavailable")?
        .join("cybernote-mcp");
    let metadata = std::fs::symlink_metadata(&path).map_err(|_| "Unavailable")?;
    if !metadata.is_file() || metadata.permissions().mode() & 0o111 == 0 {
        return Err("Unavailable".into());
    }
    Ok(path)
}
pub fn bundled() -> Result<String, String> {
    beside(&std::env::current_exe().map_err(|_| "Unavailable")?)?
        .into_os_string()
        .into_string()
        .map_err(|_| "Unavailable".into())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TesterRequest {
    pub connection_id: String,
    pub workspace_id: String,
    pub grant_id: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_executable_sibling_is_accepted() {
        let root = tempfile::tempdir().unwrap();
        let app = root.path().join("notes-clone");
        let adapter = root.path().join("cybernote-mcp");
        assert!(beside(&app).is_err());
        std::fs::write(&adapter, b"fixture").unwrap();
        std::fs::set_permissions(&adapter, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert!(beside(&app).is_err());
        std::fs::set_permissions(&adapter, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert_eq!(beside(&app).unwrap(), adapter);
        std::fs::remove_file(&adapter).unwrap();
        std::os::unix::fs::symlink("/usr/bin/true", &adapter).unwrap();
        assert!(beside(&app).is_err());
    }
    #[test]
    fn caller_cannot_select_a_binary() {
        assert!(serde_json::from_value::<TesterRequest>(serde_json::json!({
            "connectionId":"id", "workspaceId":"workspace", "grantId":"grant", "binary":"/usr/bin/true"
        })).is_err());
    }
}
