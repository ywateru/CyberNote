fn main() {
    if std::env::var_os("CARGO_FEATURE_NATIVE_PROVIDER_PROBE").is_some()
        && std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos")
    {
        let file = "../../../../plugins/tauri-plugin-notes-media/macos/thumbnail.m";
        cc::Build::new()
            .file(file)
            .flag("-fobjc-arc")
            .flag("-fobjc-arc-exceptions")
            .flag("-fblocks")
            .flag("-Wno-deprecated-declarations")
            .flag("-Wno-unused-parameter")
            .compile("notes_media_native_probe");
        for name in [
            "Foundation",
            "AVFoundation",
            "CoreMedia",
            "CoreGraphics",
            "ImageIO",
        ] {
            println!("cargo:rustc-link-lib=framework={name}");
        }
        println!("cargo:rerun-if-changed={file}");
    }
}
