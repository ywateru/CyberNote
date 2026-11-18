//! Native-only context preceding bytes delivered to a registered Bootstrap endpoint.
//! Parsing alone establishes no trust: call Bus::claim_bootstrap_context before using it.
use crate::*;
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncReadExt};

pub const BOOTSTRAP_MAGIC: [u8; 8] = *b"NCBBOOT1";
pub const BOOTSTRAP_PRELUDE_LEN: usize = 80;
#[derive(Clone, PartialEq, Eq)]
pub struct BootstrapContext {
    pub peer: PeerId,
    pub stream_id: [u8; 16],
    pub generation: [u8; 16],
    pub account_generation: u64,
}
impl std::fmt::Debug for BootstrapContext {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("BootstrapContext([REDACTED])")
    }
}
impl BootstrapContext {
    pub(crate) fn encode(&self) -> [u8; BOOTSTRAP_PRELUDE_LEN] {
        let mut bytes = [0u8; BOOTSTRAP_PRELUDE_LEN];
        bytes[..8].copy_from_slice(&BOOTSTRAP_MAGIC);
        bytes[8..40].copy_from_slice(&self.peer);
        bytes[40..56].copy_from_slice(&self.stream_id);
        bytes[56..72].copy_from_slice(&self.generation);
        bytes[72..].copy_from_slice(&self.account_generation.to_be_bytes());
        bytes
    }
}
/// Reads exactly 80 bytes with an absolute deadline. Always claim through the Bus afterwards.
pub async fn read_bootstrap_context<R: AsyncRead + Unpin>(
    reader: &mut R,
    timeout: Duration,
) -> Result<BootstrapContext> {
    if timeout.is_zero() || timeout > Duration::from_secs(60) {
        return Err(Error::Protocol);
    }
    let mut bytes = [0u8; BOOTSTRAP_PRELUDE_LEN];
    tokio::time::timeout(timeout, reader.read_exact(&mut bytes))
        .await
        .map_err(|_| Error::Timeout)??;
    if bytes[..8] != BOOTSTRAP_MAGIC {
        return Err(Error::Protocol);
    }
    Ok(BootstrapContext {
        peer: bytes[8..40].try_into().map_err(|_| Error::Protocol)?,
        stream_id: bytes[40..56].try_into().map_err(|_| Error::Protocol)?,
        generation: bytes[56..72].try_into().map_err(|_| Error::Protocol)?,
        account_generation: u64::from_be_bytes(
            bytes[72..].try_into().map_err(|_| Error::Protocol)?,
        ),
    })
}
