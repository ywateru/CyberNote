//! Fixed CyberNote Releases client. Host registration and guard contract: README.md.
mod archive;
pub mod commands;
mod feed;
mod install;
mod network;
mod service;
mod storage;
mod version;
pub use feed::Release;
pub use install::{DenyInstall, InstallGuard, InstallLease};
pub use service::{SoftwareUpdater, Status, UpdateScheduler};
pub use storage::PreferencePatch;
