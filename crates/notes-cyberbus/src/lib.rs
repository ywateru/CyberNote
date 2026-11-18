//! Notes' bounded CyberBus adapter. The SDK receiver has exactly one owner.
//! Raw auth events contain sensitive authorization state; never log or forward them to UI.
mod bootstrap;
mod bridge;
mod bus;
mod protocol;
pub mod store;

pub use bootstrap::{
    read_bootstrap_context, BootstrapContext, BOOTSTRAP_MAGIC, BOOTSTRAP_PRELUDE_LEN,
};
pub use bridge::{Limits, MappingLease, PeerId, Service, MAX_STREAM_LIFETIME};
pub use bus::{Bus, BusEvent, Snapshot};
pub use cyberbus::{pb, ClientConfig, SecureStore, StoreMode};
#[cfg(target_os = "macos")]
pub use cyberbus_auth::KeyringStore;
pub use cyberbus_auth::{CallbackStore, SecretBytes};
pub use prost_types::Any;
pub use protocol::{CloseCode, Envelope, FrameKind, MAX_CHUNK, TYPE_URL};

pub type Result<T> = std::result::Result<T, Error>;
#[derive(Clone, Debug, thiserror::Error)]
pub enum Error {
    #[error("SDK error code {0}")]
    Sdk(i32),
    #[error("adapter is closed")]
    Closed,
    #[error("operation cancelled")]
    Cancelled,
    #[error("deadline exceeded; remote effects may exist")]
    Timeout,
    #[error("resource limit exceeded")]
    Capacity,
    #[error("invalid protocol frame")]
    Protocol,
    #[error("peer is not authenticated and online in the current directory")]
    PeerUnavailable,
    #[error("only concrete loopback endpoints with nonzero ports are allowed")]
    InvalidEndpoint,
    #[error("service has no host endpoint")]
    NoEndpoint,
    #[error("I/O error ({0:?})")]
    Io(std::io::ErrorKind),
    #[error("SDK event directory requires reset")]
    DirectoryReset,
    #[error("reserved adapter command")]
    ReservedCommand,
}
impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e.kind())
    }
}
