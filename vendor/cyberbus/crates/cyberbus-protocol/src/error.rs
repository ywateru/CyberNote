use crate::pb;
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("I/O failure: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid protobuf: {0}")]
    Decode(#[from] prost::DecodeError),
    #[error("protocol violation: {0}")]
    Invalid(String),
    #[error("resource limit exceeded: {0}")]
    Limit(&'static str),
    #[error("Noise authentication failed")]
    Noise(#[from] snow::Error),
    #[error("deadline exceeded")]
    Timeout,
    #[error("session closed")]
    Closed,
}
pub type Result<T> = std::result::Result<T, Error>;
impl Error {
    pub fn code(&self) -> pb::ErrorCode {
        match self {
            Self::Io(_) => pb::ErrorCode::Unavailable,
            Self::Decode(_) | Self::Invalid(_) => pb::ErrorCode::ProtocolError,
            Self::Limit(_) => pb::ErrorCode::ResourceExhausted,
            Self::Noise(_) => pb::ErrorCode::Unauthenticated,
            Self::Timeout => pb::ErrorCode::DeadlineExceeded,
            Self::Closed => pb::ErrorCode::Closed,
        }
    }
    /// Bounded, fixed text safe to cross the peer boundary. Never exposes an I/O or crypto detail.
    pub fn to_protocol_error(&self) -> pb::ProtocolError {
        pb::ProtocolError {
            code: self.code() as i32,
            message: match self {
                Self::Io(_) => "transport unavailable",
                Self::Decode(_) | Self::Invalid(_) => "invalid protocol message",
                Self::Limit(_) => "resource limit exceeded",
                Self::Noise(_) => "authentication failed",
                Self::Timeout => "deadline exceeded",
                Self::Closed => "session closed",
            }
            .into(),
            retryable: false,
            retry_after: None,
        }
    }
}
pub(crate) fn invalid(message: impl Into<String>) -> Error {
    Error::Invalid(message.into())
}
