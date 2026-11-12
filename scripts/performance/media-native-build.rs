fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let file = "native/thumbnail.m";
        cc::Build::new().file(file).flag("-fobjc-arc").flag("-fobjc-arc-exceptions")
            .flag("-fblocks").flag("-Wno-deprecated-declarations").flag("-Wno-unused-parameter")
            .compile("notes_media_measurement_native");
        for name in ["Foundation", "AVFoundation", "CoreMedia", "CoreGraphics", "ImageIO"] {
            println!("cargo:rustc-link-lib=framework={name}");
        }
        println!("cargo:rerun-if-changed={file}");
    }
}
