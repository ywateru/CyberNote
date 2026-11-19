//! Compile the exact production core without Tauri, sidecars or app data.
#![allow(dead_code, unused_imports)]
#[path = "../mod.rs"]
pub mod local_backup;

#[cfg(all(test, feature = "real-store-proof"))]
#[path = "../../agent_access/mod.rs"]
pub mod agent_access;
#[cfg(all(test, feature = "real-store-proof"))]
#[path = "../../application/mod.rs"]
pub mod application;
#[cfg(all(test, feature = "real-store-proof"))]
mod local_backup_store;
#[cfg(all(test, feature = "real-store-proof"))]
#[path = "../../session.rs"]
mod session;
#[cfg(all(test, feature = "real-store-proof"))]
#[path = "../../store.rs"]
mod store;
#[cfg(all(test, feature = "real-store-proof"))]
mod sync;
