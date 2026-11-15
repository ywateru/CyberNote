use super::*;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
#[derive(Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub(super) enum Request {
    BeginTransfer {
        version: u8,
        direction: TransferDirection,
    },
    FinishTransfer,
    Inventory {
        after: Option<String>,
        limit: usize,
    },
    Head {
        digest: String,
        offset: usize,
    },
    Blob {
        blob: BlobRef,
        offset: u64,
    },
    PutHead {
        digest: String,
        total: usize,
        offset: usize,
        data: String,
    },
    PutBlob {
        blob: BlobRef,
        offset: u64,
        data: String,
        finish: bool,
    },
    BlobOffset {
        blob: BlobRef,
    },
    CommitHead {
        digest: String,
    },
    Status,
}
#[derive(Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub(super) enum Response {
    TransferReady {
        version: u8,
        direction: TransferDirection,
    },
    TransferComplete,
    Inventory {
        page: InventoryPage,
    },
    Chunk {
        total: u64,
        offset: u64,
        data: String,
    },
    Offset {
        offset: u64,
    },
    Prepared,
    Stored {
        receipt: Receipt,
    },
    Status {
        version: u8,
    },
    Error {
        code: SyncErrorWire,
    },
}
// Deserialize the exact safe error vocabulary, without a remote arbitrary error string.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) enum SyncErrorWire {
    Busy,
    Invalid,
    Backend,
    Limit,
    Workspace,
    Revoked,
}
impl From<SyncError> for SyncErrorWire {
    fn from(e: SyncError) -> Self {
        match e {
            SyncError::Busy => Self::Busy,
            SyncError::Limit => Self::Limit,
            SyncError::WorkspaceMismatch => Self::Workspace,
            SyncError::Revoked => Self::Revoked,
            SyncError::Backend | SyncError::Io => Self::Backend,
            _ => Self::Invalid,
        }
    }
}
pub(super) fn bytes(data: &str) -> Result<Vec<u8>> {
    if data.len() > CHUNK.div_ceil(3) * 4 {
        return Err(SyncError::Limit);
    }
    let b = B64.decode(data).map_err(|_| SyncError::Protocol)?;
    if b.len() > CHUNK {
        return Err(SyncError::Limit);
    }
    Ok(b)
}
pub(super) fn encoded(data: &[u8]) -> String {
    B64.encode(data)
}
pub(super) struct Handler {
    permit: Option<AccountPermit>,
    direction: Option<TransferDirection>,
    finished: bool,
    incoming: Option<(String, usize, Vec<u8>)>,
    outgoing: Option<(String, Vec<u8>)>,
    prepared: Option<(String, Value, Vec<BlobRef>)>,
}
impl Handler {
    pub fn new() -> Self {
        Self {
            permit: None,
            direction: None,
            finished: false,
            incoming: None,
            outgoing: None,
            prepared: None,
        }
    }
    fn allows(&self, b: &BlobRef) -> Result<()> {
        if !self
            .prepared
            .as_ref()
            .is_some_and(|(_, _, refs)| refs.contains(b))
        {
            return Err(SyncError::Protocol);
        }
        Ok(())
    }
    pub fn handle(&mut self, s: &Shared, req: Request) -> Result<Response> {
        // Account capability is fixed for this authenticated socket. Legacy peers
        // without the new handshake cannot issue even inventory/content requests.
        if s.policy.is_some() {
            match &req {
                Request::Status => {}
                Request::BeginTransfer {
                    version: 1,
                    direction,
                } if self.direction.is_none() && !self.finished => {
                    self.permit = s.reserve_account_operation()?;
                    self.direction = Some(*direction);
                    return Ok(Response::TransferReady {
                        version: 1,
                        direction: *direction,
                    });
                }
                Request::BeginTransfer { .. } => return Err(SyncError::Protocol),
                _ => {
                    let direction = self
                        .direction
                        .filter(|_| !self.finished)
                        .ok_or(SyncError::Protocol)?;
                    let allowed = match &req {
                        Request::Inventory { .. } | Request::FinishTransfer => true,
                        Request::Head { .. } | Request::Blob { .. } => direction.receives(),
                        Request::PutHead { .. }
                        | Request::PutBlob { .. }
                        | Request::BlobOffset { .. }
                        | Request::CommitHead { .. } => direction.sends(),
                        _ => false,
                    };
                    if !allowed {
                        return Err(SyncError::Protocol);
                    }
                }
            }
        }
        match req {
            Request::BeginTransfer { .. } => Err(SyncError::Protocol),
            Request::FinishTransfer => {
                if s.policy.is_none() || self.incoming.is_some() || self.prepared.is_some() {
                    return Err(SyncError::Protocol);
                }
                self.finished = true;
                Ok(Response::TransferComplete)
            }
            Request::CommitHead { digest: id } => {
                let (prepared_id, value, refs) =
                    self.prepared.as_ref().ok_or(SyncError::Protocol)?;
                if prepared_id != &id {
                    return Err(SyncError::Protocol);
                }
                for b in refs {
                    if !s.backend.has_blob(b)? {
                        return Err(SyncError::Protocol);
                    }
                }
                let receipt = s.backend.receive_head(value.clone())?;
                if !receipt.durable {
                    return Err(SyncError::Backend);
                }
                self.prepared = None;
                Ok(Response::Stored { receipt })
            }
            Request::Status => Ok(Response::Status { version: 1 }),
            Request::Inventory { after, limit } => {
                if limit == 0 || limit > PAGE_SIZE {
                    return Err(SyncError::Limit);
                }
                if let Some(d) = &after {
                    digest(d)?;
                }
                s.backend.flush()?;
                let page = s.backend.inventory(after.as_deref(), limit)?;
                validate_page(&page, after.as_deref(), limit)?;
                Ok(Response::Inventory { page })
            }
            Request::Head { digest: id, offset } => {
                digest(&id)?;
                if self.outgoing.as_ref().map(|(d, _)| d) != Some(&id) {
                    let v = s.backend.version(&id)?;
                    check_json(&v)?;
                    let bytes = serde_json::to_vec(&v).map_err(|_| SyncError::Protocol)?;
                    if bytes.len() > MAX_HEAD {
                        return Err(SyncError::Limit);
                    }
                    self.outgoing = Some((id.clone(), bytes));
                }
                let data = &self.outgoing.as_ref().unwrap().1;
                if offset > data.len() {
                    return Err(SyncError::Protocol);
                }
                let end = (offset + CHUNK).min(data.len());
                Ok(Response::Chunk {
                    total: data.len() as u64,
                    offset: offset as u64,
                    data: encoded(&data[offset..end]),
                })
            }
            Request::Blob { blob: b, offset } => {
                blob(&b)?;
                if offset > b.size {
                    return Err(SyncError::Protocol);
                }
                let data = s.backend.read_blob_chunk(&b, offset, CHUNK)?;
                let expected = (b.size - offset).min(CHUNK as u64) as usize;
                if data.len() != expected {
                    return Err(SyncError::Backend);
                }
                Ok(Response::Chunk {
                    total: b.size,
                    offset,
                    data: encoded(&data),
                })
            }
            Request::BlobOffset { blob: b } => {
                blob(&b)?;
                self.allows(&b)?;
                Ok(Response::Offset {
                    offset: s.staging.offset(s.backend.as_ref(), &b)?,
                })
            }
            Request::PutBlob {
                blob: b,
                offset,
                data,
                finish,
            } => {
                blob(&b)?;
                self.allows(&b)?;
                let data = bytes(&data)?;
                let offset = s
                    .staging
                    .write(s.backend.as_ref(), &b, offset, &data, finish)?;
                Ok(Response::Offset { offset })
            }
            Request::PutHead {
                digest: id,
                total,
                offset,
                data,
            } => {
                digest(&id)?;
                if total == 0 || total > MAX_HEAD {
                    return Err(SyncError::Limit);
                }
                let data = bytes(&data)?;
                if offset == 0 {
                    self.prepared = None;
                    self.incoming = Some((id.clone(), total, Vec::with_capacity(total)));
                }
                let incoming = self.incoming.as_mut().ok_or(SyncError::Protocol)?;
                if incoming.0 != id
                    || incoming.1 != total
                    || incoming.2.len() != offset
                    || data.is_empty()
                    || offset
                        .checked_add(data.len())
                        .filter(|n| *n <= total)
                        .is_none()
                {
                    return Err(SyncError::Protocol);
                }
                incoming.2.extend(data);
                if incoming.2.len() < total {
                    return Ok(Response::Offset {
                        offset: incoming.2.len() as u64,
                    });
                }
                let (_, _, bytes) = self.incoming.take().unwrap();
                let v: Value = serde_json::from_slice(&bytes).map_err(|_| SyncError::Protocol)?;
                check_json(&v)?;
                if v.get("digest").and_then(Value::as_str) != Some(&id) {
                    return Err(SyncError::Protocol);
                }
                let refs = blobs(s, &v)?;
                self.prepared = Some((id, v, refs));
                Ok(Response::Prepared)
            }
        }
    }
}
pub(super) fn validate_page(page: &InventoryPage, after: Option<&str>, limit: usize) -> Result<()> {
    if page.digests.len() > limit {
        return Err(SyncError::Limit);
    }
    let mut prev = after;
    for d in &page.digests {
        digest(d)?;
        if prev.is_some_and(|p| p >= d.as_str()) {
            return Err(SyncError::Protocol);
        }
        prev = Some(d);
    }
    if let Some(next) = &page.next {
        if page.digests.last() != Some(next) {
            return Err(SyncError::Protocol);
        }
    }
    Ok(())
}
