//! No Tauri/native build: exercise the exact production modules and real Store.
#![allow(dead_code)]
#[path = "mod.rs"]
mod attachment_media;
#[path = "../session.rs"]
mod session;
#[path = "../store.rs"]
mod store;
#[path = "../sync.rs"]
mod sync;

#[path = "tests.rs"]
mod media_tests;
pub use media_tests::*;

// Independent review probes; no production entry or behavior changes.
#[path = "harness/review99a.rs"]
mod independent_review;
pub use independent_review::*;

#[path = "platform_tests.rs"]
mod platform_tests;
pub use platform_tests::*;

#[path = "harness/review99b.rs"]
mod independent_platform_review;
pub use independent_platform_review::*;

// Independent SVG104 real Store boundary probes.
#[path = "harness/review104.rs"]
mod independent_svg_review;
pub use independent_svg_review::*;
