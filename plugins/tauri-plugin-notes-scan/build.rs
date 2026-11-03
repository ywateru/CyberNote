fn main() {
    tauri_plugin::Builder::new(&["execute"])
        .android_path("android")
        .build();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new()
            .file("macos/vision.m")
            .flag("-fobjc-arc")
            .flag("-mmacosx-version-min=12.0")
            .compile("notes_scan_vision");
        for framework in [
            "Foundation",
            "Vision",
            "ImageIO",
            "CoreImage",
            "CoreGraphics",
        ] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
        println!("cargo:rerun-if-changed=macos/vision.m");
    }
}
