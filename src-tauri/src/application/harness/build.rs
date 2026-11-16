fn main() {
    // Existing production Session fixture tests resolve ../docs from src-tauri.
    // Preserve that path when compiling the very same modules in a lean harness.
    let manifest = std::path::PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap());
    let native = manifest.ancestors().nth(3).unwrap();
    println!("cargo:rustc-env=CARGO_MANIFEST_DIR={}", native.display());
}
