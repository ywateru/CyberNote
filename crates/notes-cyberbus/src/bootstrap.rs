//! Native-only context preceding bytes delivered to a registered Bootstrap endpoint.
//! Parsing alone establishes no trust: call Bus::claim_bootstrap_context before using it.
use crate::*;
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncReadExt};

pub const BOOTSTRAP_MAGIC: [u8; 8] = *b"NCBBOOT2";
pub const BOOTSTRAP_PRELUDE_LEN: usize = 112;
#[derive(Clone, PartialEq, Eq)]
pub struct BootstrapContext {
    pub peer: PeerId,
    pub stream_id: [u8; 16],
    pub generation: [u8; 16],
    pub account_generation: u64,
    /// Receiver-only local ingress capability. Never log or transmit it to a peer.
    pub receiver_nonce: [u8; 32],
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
        bytes[72..80].copy_from_slice(&self.account_generation.to_be_bytes());
        bytes[80..].copy_from_slice(&self.receiver_nonce);
        bytes
    }
}
/// Reads exactly BOOTSTRAP_PRELUDE_LEN bytes with an absolute deadline.
/// Always claim through the Bus afterwards. Legacy preludes are not accepted.
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
            bytes[72..80].try_into().map_err(|_| Error::Protocol)?,
        ),
        receiver_nonce: bytes[80..].try_into().map_err(|_| Error::Protocol)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn nonce_prelude_roundtrip_preserves_payload_and_rejects_legacy() {
        let context = BootstrapContext {
            peer: [1; 32],
            stream_id: [2; 16],
            generation: [3; 16],
            account_generation: 4,
            receiver_nonce: [5; 32],
        };
        let mut bytes = context.encode().to_vec();
        bytes.extend_from_slice(b"bootstrap payload");
        let mut reader = bytes.as_slice();
        assert_eq!(
            read_bootstrap_context(&mut reader, Duration::from_secs(1))
                .await
                .unwrap(),
            context
        );
        assert_eq!(reader, b"bootstrap payload");
        let mut legacy = context.encode();
        legacy[..8].copy_from_slice(b"NCBBOOT1");
        assert!(matches!(
            read_bootstrap_context(&mut legacy.as_slice(), Duration::from_secs(1)).await,
            Err(Error::Protocol)
        ));
        assert!(
            read_bootstrap_context(&mut legacy[..80].as_ref(), Duration::from_secs(1))
                .await
                .is_err()
        );
        assert_eq!(format!("{context:?}"), "BootstrapContext([REDACTED])");
    }
}
