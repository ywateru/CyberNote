//! Module tests ONLY. No final desktop/Session/SQLite integration is claimed.
#![allow(dead_code)]
pub mod application {
    include!(concat!(env!("OUT_DIR"), "/application.rs"));
}
pub mod sync {
    pub mod model {
        include!(concat!(env!("OUT_DIR"), "/model.rs"));
    }
}
include!(concat!(env!("OUT_DIR"), "/access.rs"));
#[path = "../mod.rs"]
pub mod agent_host;
#[cfg(test)]
mod tests;
