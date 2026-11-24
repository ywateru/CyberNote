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
pub use install::{InstallGuard, InstallLease};
// The standalone verification proof imports the deny guard from this module.
#[allow(unused_imports)]
pub use install::DenyInstall;
pub use service::{SoftwareUpdater, Status, UpdateScheduler};
pub use storage::PreferencePatch;
