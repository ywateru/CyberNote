fn main() {
    tauri_plugin::Builder::new(&[
        "bind",
        "update",
        "unbind",
        "inspect",
        "focus_search",
        "keyboard_navigation",
        "recording_access",
        "popup_menu",
        "cancel_popup_menu",
    ])
    .build();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new()
            .file("macos/toolbar.m")
            .file("macos/format.m")
            .file("macos/keyboard.m")
            .file("macos/attachments.m")
            .file("macos/menu.m")
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .flag("-mmacosx-version-min=12.0")
            .warnings(true)
            .compile("notes_ui_toolbar");
        // Permission callbacks may escape before an Objective-C exception.
        // Unwind this unit's strong owner/block references on the caught path.
        cc::Build::new()
            .file("macos/recording_access.m")
            .file("macos/termination.m")
            .flag("-fobjc-arc")
            .flag("-fobjc-arc-exceptions")
            .flag("-fblocks")
            .flag("-mmacosx-version-min=12.0")
            .warnings(true)
            .compile("notes_ui_recording_access");
        for framework in [
            "AppKit",
            "Foundation",
            "QuartzCore",
            "WebKit",
            "AVFoundation",
            "UniformTypeIdentifiers",
        ] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
        println!("cargo:rerun-if-changed=macos/toolbar.m");
        println!("cargo:rerun-if-changed=macos/theme-palettes.h");
        println!("cargo:rerun-if-changed=macos/format.m");
        println!("cargo:rerun-if-changed=macos/format.h");
        println!("cargo:rerun-if-changed=macos/keyboard.m");
        println!("cargo:rerun-if-changed=macos/attachments.m");
        println!("cargo:rerun-if-changed=macos/menu.m");
        println!("cargo:rerun-if-changed=macos/menu.h");
        println!("cargo:rerun-if-changed=macos/termination.m");
        println!("cargo:rerun-if-changed=macos/recording_access.m");
    }
}
