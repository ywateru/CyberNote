//! Persistent synchronization wire contract; transport is a separate module.
#[path = "sync/model.rs"]
pub(crate) mod model;

#[path = "sync/adapter.rs"]
pub(crate) mod adapter;
#[path = "sync/identity.rs"]
pub(crate) mod identity;
#[path = "sync/network.rs"]
pub(crate) mod network;
