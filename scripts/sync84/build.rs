fn main() {
    // Existing production Session tests resolve frozen ciphertext fixtures from
    // this compile-time root. Keep their path contract when using a lean crate.
    let manifest = std::path::PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap());
    let production = manifest.join("../../src-tauri").canonicalize().unwrap();
    println!(
        "cargo:rustc-env=CARGO_MANIFEST_DIR={}",
        production.display()
    );
    println!("cargo:rerun-if-changed=build.rs");
}
