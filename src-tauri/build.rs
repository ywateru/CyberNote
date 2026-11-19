fn main() {
    use std::{env, path::PathBuf, process::Command};
    let root = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").expect("Cargo manifest directory"))
        .parent()
        .expect("CyberNote checkout root")
        .to_path_buf();
    for name in [
        "GITHUB_ACTIONS",
        "GITHUB_REF_TYPE",
        "GITHUB_REF_NAME",
        "GITHUB_SHA",
        "CYBERNOTE_DEPLOY_METADATA",
        "CYBERNOTE_RELEASE_STAMP",
        "CYBERNOTE_RELEASE_VERSION",
    ] {
        println!("cargo:rerun-if-env-changed={name}");
    }
    let mut command = Command::new("node");
    command
        .current_dir(&root)
        .arg(root.join("scripts/build-info.mjs"))
        .arg("--native-release-identity");
    if env::var("PROFILE").expect("Cargo build profile") != "release" {
        command.arg("--development");
    }
    let output = command
        .output()
        .expect("Node is required to validate CyberNote release identity");
    assert!(
        output.status.success(),
        "CyberNote release identity rejected: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let directives = String::from_utf8(output.stdout).expect("UTF-8 build identity directives");
    for line in directives.lines() {
        assert!(
            line.starts_with("cargo:rustc-env=CYBERNOTE_RELEASE_VERSION=")
                || line.starts_with("cargo:rerun-if-changed="),
            "Unexpected release identity directive"
        );
        println!("{line}");
    }
    tauri_build::build()
}
