//! CyberBus v1 Protobuf contracts and authenticated, bounded byte streams.
//! See the crate README for integration and ownership boundaries.
pub mod pb {
    include!(concat!(env!("OUT_DIR"), "/cyberbus.easytier.v1.rs"));
}
pub mod example {
    include!(concat!(env!("OUT_DIR"), "/cyberbus.example.v1.rs"));
}
pub mod codec;
mod error;
pub mod framing;
pub mod noise;
pub mod reassembly;
pub mod validation;
pub use error::{Error, Result};
pub const FILE_DESCRIPTOR_SET: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/cyberbus.bin"));
pub const MAX_RECORD_BODY: usize = 65_532;
pub const MAX_PLAINTEXT: usize = MAX_RECORD_BODY - 16;
pub const MAX_LOCAL_OBJECT: usize = 5 * 1024 * 1024;
pub const MAX_MESSAGE: usize = 1024 * 1024;
pub const MAX_FRAGMENT: usize = 16 * 1024;
pub const MAX_DESCRIPTOR: usize = 256 * 1024;
