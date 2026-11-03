fn main() {
    tauri_plugin::Builder::new(&["bind", "update", "unbind", "inspect"]).build();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new()
            .file("macos/toolbar.m")
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .flag("-mmacosx-version-min=12.0")
            .warnings(true)
            .compile("notes_ui_toolbar");
        for framework in ["AppKit", "Foundation", "QuartzCore"] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
        println!("cargo:rerun-if-changed=macos/toolbar.m");
    }
}
