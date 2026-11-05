fn main() {
    tauri_plugin::Builder::new(&[
        "bind",
        "update",
        "unbind",
        "inspect",
        "focus_search",
        "keyboard_navigation",
        "recording_access",
    ])
    .build();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new()
            .file("macos/toolbar.m")
            .file("macos/format.m")
            .file("macos/keyboard.m")
            .file("macos/recording_access.m")
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .flag("-mmacosx-version-min=12.0")
            .warnings(true)
            .compile("notes_ui_toolbar");
        for framework in [
            "AppKit",
            "Foundation",
            "QuartzCore",
            "WebKit",
            "AVFoundation",
        ] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
        println!("cargo:rerun-if-changed=macos/toolbar.m");
        println!("cargo:rerun-if-changed=macos/format.m");
        println!("cargo:rerun-if-changed=macos/format.h");
        println!("cargo:rerun-if-changed=macos/keyboard.m");
        println!("cargo:rerun-if-changed=macos/recording_access.m");
    }
}
