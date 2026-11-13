fn main() {
    // No JS commands or generated command permissions. Kotlin methods are invoked
    // only by the trusted Rust host via its registered mobile plugin handle.
    tauri_plugin::Builder::new(&[])
        .android_path("android")
        .build();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new()
            .file("macos/login.m")
            .flag("-fobjc-arc")
            .flag("-mmacosx-version-min=12.0")
            .compile("notes_auth");
        for framework in ["Foundation", "AppKit", "WebKit"] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
        println!("cargo:rerun-if-changed=macos/login.m");
    }
}
