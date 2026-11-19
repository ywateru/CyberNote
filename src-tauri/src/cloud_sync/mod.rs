//! User-owned encrypted cloud transport. Does not own account grants or a Store.
pub mod crypto;
pub mod engine;
pub mod model;
pub mod persistence;
pub mod protocol;
pub mod runtime;
mod settings_owner;
pub mod settings_port;
pub mod store_port;
pub use engine::{CloudHost, Context, LocalInfo};
pub use model::{CloudError, Result};
pub use runtime::{CloudCommand, CloudRuntime};
