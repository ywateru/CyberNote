//! u32 big-endian record lengths; the 64KiB budget includes the four-byte header.
use crate::{Error, Result, MAX_RECORD_BODY};
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
pub const RECORD_IDLE_TIMEOUT: Duration = Duration::from_secs(5);
async fn read_progress<R: AsyncRead + Unpin>(reader: &mut R, output: &mut [u8]) -> Result<()> {
    let mut offset = 0;
    while offset < output.len() {
        let n = tokio::time::timeout(RECORD_IDLE_TIMEOUT, reader.read(&mut output[offset..]))
            .await
            .map_err(|_| Error::Timeout)??;
        if n == 0 {
            return Err(std::io::Error::from(std::io::ErrorKind::UnexpectedEof).into());
        }
        offset += n;
    }
    Ok(())
}
/// Returns clean EOF only between records. Partial header/body EOF is an error.
/// Waiting for the first byte has no record timeout; session liveness and the
/// overall handshake deadline belong to the caller. Once started, progress is bounded.
pub async fn read_record<R: AsyncRead + Unpin>(reader: &mut R) -> Result<Option<Vec<u8>>> {
    let mut header = [0u8; 4];
    let n = reader.read(&mut header[..1]).await?;
    if n == 0 {
        return Ok(None);
    }
    read_progress(reader, &mut header[1..]).await?;
    let n = u32::from_be_bytes(header) as usize;
    if n == 0 || n > MAX_RECORD_BODY {
        return Err(Error::Limit("record length"));
    }
    let mut body = vec![0; n];
    read_progress(reader, &mut body).await?;
    Ok(Some(body))
}
pub async fn write_record<W: AsyncWrite + Unpin>(writer: &mut W, body: &[u8]) -> Result<()> {
    if body.is_empty() || body.len() > MAX_RECORD_BODY {
        return Err(Error::Limit("record length"));
    }
    let mut record = Vec::with_capacity(4 + body.len());
    record.extend_from_slice(&(body.len() as u32).to_be_bytes());
    record.extend_from_slice(body);
    let mut offset = 0;
    while offset < record.len() {
        let n = tokio::time::timeout(RECORD_IDLE_TIMEOUT, writer.write(&record[offset..]))
            .await
            .map_err(|_| Error::Timeout)??;
        if n == 0 {
            return Err(std::io::Error::from(std::io::ErrorKind::WriteZero).into());
        }
        offset += n;
    }
    tokio::time::timeout(RECORD_IDLE_TIMEOUT, writer.flush())
        .await
        .map_err(|_| Error::Timeout)??;
    Ok(())
}
