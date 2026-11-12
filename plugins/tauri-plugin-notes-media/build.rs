fn main() {
    // No renderer commands or permissions. FD decoding is trusted host-only.
    tauri_plugin::Builder::new(&[])
        .android_path("android")
        .build();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new()
            .file("macos/thumbnail.m")
            .flag("-fobjc-arc")
            .flag("-fobjc-arc-exceptions")
            .flag("-fblocks")
            .flag("-Wno-deprecated-declarations")
            .compile("notes_media_thumbnail");
        for framework in [
            "Foundation",
            "AVFoundation",
            "CoreMedia",
            "CoreGraphics",
            "ImageIO",
        ] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
        println!("cargo:rerun-if-changed=macos/thumbnail.m");
    }
}
