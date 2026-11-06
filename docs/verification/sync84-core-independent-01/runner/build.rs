fn main() {
    let manifest = std::path::PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap());
    let production = manifest.join("../../../../src-tauri").canonicalize().unwrap();
    println!("cargo:rustc-env=CARGO_MANIFEST_DIR={}", production.display());
    println!("cargo:rerun-if-changed=build.rs");
}
