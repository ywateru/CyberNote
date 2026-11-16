//! Private local transport. The application owns Session/Store and supplies `ApplicationHandler`.
//! This module never opens a Store. Keep this boundary unavailable on Android.
#[cfg(all(unix, not(target_os = "android")))]
mod files;
#[cfg(all(unix, not(target_os = "android")))]
mod runtime;
mod types;
#[cfg(all(unix, not(target_os = "android")))]
pub use runtime::{
    AgentHost, ApplicationHandler, DeliveryGuard, HandlerFuture, HandlerReply, HostConfig,
    RequestFuture,
};
pub use types::*;
