//! RPC lifecycle and bounded, transactional flow accounting. Calls retain their original
//! handler registration; tombstones survive reconnects within one authenticated boot.
use crate::{error, pb};
use cyberbus_protocol::{reassembly, validation};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, VecDeque},
    time::Duration,
};
use tokio::time::Instant;
type Key = (Vec<u8>, Vec<u8>);
type Result<T> = std::result::Result<T, pb::ProtocolError>;
const MIB: usize = 1024 * 1024;
const TTL: Duration = Duration::from_secs(600);
/// Shared data/RPC reservation ledger. The last clone of a reservation releases
/// its bytes, including rollback checkpoints and completed items awaiting consumption.
#[derive(Clone, Default)]
pub(crate) struct ReassemblyBudget(std::sync::Arc<std::sync::atomic::AtomicUsize>);
#[derive(Clone)]
pub(crate) struct ReassemblyReservation(std::sync::Arc<Reservation>);
struct Reservation {
    budget: ReassemblyBudget,
    size: usize,
}
impl Drop for Reservation {
    fn drop(&mut self) {
        self.budget
            .0
            .fetch_sub(self.size, std::sync::atomic::Ordering::AcqRel);
    }
}
impl ReassemblyBudget {
    pub fn reserve(&self, size: usize) -> Result<ReassemblyReservation> {
        self.0
            .fetch_update(
                std::sync::atomic::Ordering::AcqRel,
                std::sync::atomic::Ordering::Acquire,
                |n| n.checked_add(size).filter(|n| *n <= 32 * MIB),
            )
            .map_err(|_| {
                error(
                    pb::ErrorCode::ResourceExhausted,
                    "shared data/RPC reassembly budget",
                )
            })?;
        Ok(ReassemblyReservation(std::sync::Arc::new(Reservation {
            budget: self.clone(),
            size,
        })))
    }
    pub fn used(&self) -> usize {
        self.0.load(std::sync::atomic::Ordering::Acquire)
    }
}
impl ReassemblyReservation {
    pub fn size(&self) -> usize {
        self.0.size
    }
}
#[derive(Clone)]
struct Limits {
    message: usize,
    fragment: usize,
    concurrent: usize,
    bytes: u32,
    items: u32,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            message: MIB,
            fragment: 16384,
            concurrent: 16,
            bytes: 65536,
            items: 4,
        }
    }
}
impl Limits {
    fn negotiated(l: &pb::ReceiveLimits) -> Result<Self> {
        if l.max_message_bytes == 0
            || l.max_fragment_bytes == 0
            || l.max_rpc_in_flight == 0
            || l.rpc_byte_window == 0
            || l.rpc_item_window == 0
        {
            return Err(error(
                pb::ErrorCode::ProtocolError,
                "zero RPC receive limit",
            ));
        }
        Ok(Self {
            message: (l.max_message_bytes as usize).min(MIB),
            fragment: (l.max_fragment_bytes as usize).min(16384),
            concurrent: (l.max_rpc_in_flight as usize).min(16),
            bytes: l.rpc_byte_window.min(65536),
            items: l.rpc_item_window.min(4),
        })
    }
}
#[derive(Clone)]
struct Scope {
    generation: u64,
    boot: Vec<u8>,
    remote: Limits,
}
#[derive(Clone)]
struct Item {
    header: pb::PayloadFragment,
    received: usize,
    chunks: Vec<std::sync::Arc<pb::RpcChunk>>,
    reservation: ReassemblyReservation,
}
#[derive(Clone)]
struct Consumed {
    reservation: ReassemblyReservation,
    local: bool,
}
#[derive(Clone)]
struct Direction {
    next: u64,
    ended: bool,
    bytes: u32,
    items: u32,
    limits: Limits,
    assembling: Option<Item>,
    consumed: VecDeque<Consumed>,
}
impl Direction {
    fn new(limits: Limits) -> Self {
        Self {
            next: 0,
            ended: false,
            bytes: limits.bytes,
            items: limits.items,
            limits,
            assembling: None,
            consumed: VecDeque::new(),
        }
    }
    fn reserved(&self) -> usize {
        self.consumed
            .iter()
            .map(|item| item.reservation.size())
            .sum::<usize>()
            + self
                .assembling
                .as_ref()
                .map_or(0, |i| i.header.total_size as usize)
    }
}
#[derive(Clone)]
struct Call {
    outbound: bool,
    request: pb::RpcRequest,
    deadline: Instant,
    directions: [Direction; 2],
    handler: Option<pb::RegisterHandler>,
}
impl Call {
    fn reserved(&self) -> usize {
        self.directions.iter().map(Direction::reserved).sum()
    }
}
#[derive(Clone)]
struct Terminal {
    digest: [u8; 32],
    at: Instant,
    order: u64,
    violations: u8,
    outbound: bool,
    response_count: u64,
    notified: bool,
    handler_id: Vec<u8>,
}
/// A single-call checkpoint, used only until the corresponding output reservation commits.
pub(crate) struct Checkpoint {
    key: Key,
    call: Option<Call>,
    terminal: Option<Terminal>,
}
#[derive(Default)]
pub(crate) struct Calls {
    calls: BTreeMap<Key, Call>,
    terminals: BTreeMap<Key, Terminal>,
    scopes: BTreeMap<Vec<u8>, Scope>,
    order: u64,
    budget: ReassemblyBudget,
}
impl Calls {
    pub fn with_budget(budget: ReassemblyBudget) -> Self {
        Self {
            budget,
            ..Default::default()
        }
    }
    pub fn configure(
        &mut self,
        peer: &[u8],
        generation: u64,
        boot: &[u8],
        remote: &pb::ReceiveLimits,
    ) -> Result<()> {
        let remote = Limits::negotiated(remote)?;
        if self
            .scopes
            .get(peer)
            .is_some_and(|s| s.generation != generation || s.boot != boot)
        {
            self.calls.retain(|(p, _), _| p != peer);
            self.terminals.retain(|(p, _), _| p != peer);
        }
        self.scopes.insert(
            peer.to_vec(),
            Scope {
                generation,
                boot: boot.to_vec(),
                remote,
            },
        );
        self.prune();
        Ok(())
    }
    pub fn reserved(&self) -> usize {
        self.calls.values().map(Call::reserved).sum()
    }
    pub fn checkpoint(&self, peer: &[u8], id: &[u8]) -> Checkpoint {
        let key = (peer.to_vec(), id.to_vec());
        Checkpoint {
            call: self.calls.get(&key).cloned(),
            terminal: self.terminals.get(&key).cloned(),
            key,
        }
    }
    pub fn rollback(&mut self, checkpoint: Checkpoint) {
        self.calls.remove(&checkpoint.key);
        self.terminals.remove(&checkpoint.key);
        if let Some(c) = checkpoint.call {
            self.calls.insert(checkpoint.key.clone(), c);
        }
        if let Some(t) = checkpoint.terminal {
            self.terminals.insert(checkpoint.key, t);
        }
    }
    fn prune(&mut self) {
        let now = Instant::now();
        self.terminals.retain(|_, t| now.duration_since(t.at) < TTL);
        while self.terminals.len() > 8192 {
            self.evict(None);
        }
    }
    fn evict(&mut self, peer: Option<&[u8]>) {
        if let Some(k) = self
            .terminals
            .iter()
            .filter(|((p, _), _)| peer.is_none_or(|peer| peer == p))
            .min_by_key(|(_, t)| t.order)
            .map(|(k, _)| k.clone())
        {
            self.terminals.remove(&k);
        }
    }
    fn terminal(&mut self, key: &Key) -> bool {
        let Some(c) = self.calls.remove(key) else {
            return false;
        };
        self.order += 1;
        self.terminals.insert(
            key.clone(),
            Terminal {
                digest: Self::declaration_digest(&c.request),
                at: Instant::now(),
                order: self.order,
                violations: 0,
                outbound: c.outbound,
                response_count: c.directions[1].next,
                notified: false,
                handler_id: if c.outbound {
                    vec![]
                } else {
                    c.handler
                        .as_ref()
                        .map(|h| h.handler_id.clone())
                        .unwrap_or_default()
                },
            },
        );
        self.prune();
        while self.terminals.keys().filter(|(p, _)| p == &key.0).count() > 1024 {
            self.evict(Some(&key.0));
        }
        true
    }
    pub fn has_peer(&self, peer: &[u8]) -> bool {
        self.calls.keys().any(|(p, _)| p == peer)
    }
    pub fn claim_terminal(&mut self, peer: &[u8], id: &[u8]) -> bool {
        if let Some(t) = self.terminals.get_mut(&(peer.to_vec(), id.to_vec())) {
            if !t.notified {
                t.notified = true;
                return true;
            }
        }
        false
    }
    pub fn active(&self, peer: &[u8], id: &[u8]) -> bool {
        self.calls.contains_key(&(peer.to_vec(), id.to_vec()))
    }
    pub fn finished(&self, peer: &[u8], id: &[u8]) -> bool {
        self.terminals.contains_key(&(peer.to_vec(), id.to_vec()))
    }
    pub fn late_frame(&mut self, peer: &[u8], id: &[u8]) -> bool {
        if let Some(t) = self.terminals.get_mut(&(peer.to_vec(), id.to_vec())) {
            t.violations = t.violations.saturating_add(1);
            return t.violations >= 8;
        }
        false
    }
    pub fn terminal_info(&self, peer: &[u8], id: &[u8]) -> Option<(bool, u64)> {
        self.terminals
            .get(&(peer.to_vec(), id.to_vec()))
            .map(|t| (t.outbound, t.response_count))
    }
    fn declaration_digest(r: &pb::RpcRequest) -> [u8; 32] {
        use prost::Message;
        let mut declaration = r.clone();
        declaration.timeout = None;
        Sha256::digest(declaration.encode_to_vec()).into()
    }
    fn same(a: &pb::RpcRequest, b: &pb::RpcRequest) -> bool {
        a.method_id == b.method_id
            && a.request_type_url == b.request_type_url
            && a.response_type_url == b.response_type_url
            && a.streaming == b.streaming
            && a.semantic_version == b.semantic_version
    }
    pub fn begin(&mut self, peer: &[u8], request: &pb::RpcRequest, outbound: bool) -> Result<()> {
        self.begin_at(peer, request, outbound, Instant::now())
    }
    pub fn begin_at(
        &mut self,
        peer: &[u8],
        request: &pb::RpcRequest,
        outbound: bool,
        submitted: Instant,
    ) -> Result<()> {
        self.prune();
        let key = (peer.to_vec(), request.call_id.clone());
        if let Some(t) = self.terminals.get(&key) {
            let _same_declaration = t.digest == Self::declaration_digest(request);
            return Err(error(
                pb::ErrorCode::Conflict,
                "RPC call already terminated",
            ));
        }
        if let Some(c) = self.calls.get(&key) {
            if c.deadline <= Instant::now() {
                return Err(error(
                    pb::ErrorCode::DeadlineExceeded,
                    "RPC deadline expired",
                ));
            }
            return if !outbound && !c.outbound && Self::same(&c.request, request) {
                Ok(())
            } else {
                Err(error(pb::ErrorCode::Conflict, "duplicate RPC declaration"))
            };
        }
        if !matches!(
            pb::RpcStreaming::try_from(request.streaming),
            Ok(pb::RpcStreaming::Unary | pb::RpcStreaming::Bidi)
        ) {
            return Err(error(
                pb::ErrorCode::Unsupported,
                "only unary and bidi RPC supported",
            ));
        }
        let remote = self
            .scopes
            .get(peer)
            .map(|s| s.remote.clone())
            .unwrap_or_default();
        let max = if outbound { remote.concurrent } else { 16 };
        if self
            .calls
            .iter()
            .filter(|((p, _), c)| p == peer && c.outbound == outbound)
            .count()
            >= max
        {
            return Err(error(
                pb::ErrorCode::ResourceExhausted,
                "RPC session direction concurrency exhausted",
            ));
        }
        let budget = match &request.timeout {
            None => Duration::from_secs(30),
            Some(d) if d.seconds >= 0 && (0..1_000_000_000).contains(&d.nanos) => {
                Duration::new(d.seconds as u64, d.nanos as u32).min(Duration::from_secs(300))
            }
            _ => return Err(error(pb::ErrorCode::InvalidArgument, "invalid RPC timeout")),
        };
        let deadline = submitted + budget;
        if budget.is_zero() || deadline <= Instant::now() {
            return Err(error(
                pb::ErrorCode::DeadlineExceeded,
                "RPC deadline expired before admission",
            ));
        }
        let local = Limits::default();
        let directions = if outbound {
            [Direction::new(remote), Direction::new(local)]
        } else {
            [Direction::new(local), Direction::new(remote)]
        };
        self.calls.insert(
            key,
            Call {
                outbound,
                request: request.clone(),
                deadline,
                directions,
                handler: None,
            },
        );
        Ok(())
    }
    pub fn bind_handler(&mut self, peer: &[u8], id: &[u8], h: pb::RegisterHandler) {
        if let Some(c) = self.calls.get_mut(&(peer.to_vec(), id.to_vec())) {
            c.handler = Some(h);
        }
    }
    pub fn handler_id(&self, peer: &[u8], id: &[u8]) -> Vec<u8> {
        let key = (peer.to_vec(), id.to_vec());
        if let Some(c) = self.calls.get(&key) {
            return if c.outbound {
                vec![]
            } else {
                c.handler
                    .as_ref()
                    .map(|h| h.handler_id.clone())
                    .unwrap_or_default()
            };
        }
        self.terminals
            .get(&key)
            .map(|t| t.handler_id.clone())
            .unwrap_or_default()
    }
    pub fn handler(&self, peer: &[u8], id: &[u8]) -> Option<&pb::RegisterHandler> {
        self.calls
            .get(&(peer.to_vec(), id.to_vec()))
            .and_then(|c| c.handler.as_ref())
    }
    pub fn remaining(&self, peer: &[u8], id: &[u8]) -> Result<Duration> {
        let c = self.get(peer, id)?;
        Ok(c.deadline.saturating_duration_since(Instant::now()))
    }
    pub fn deadline(&self, peer: &[u8], id: &[u8]) -> Result<Instant> {
        Ok(self.get(peer, id)?.deadline)
    }
    fn get(&self, peer: &[u8], id: &[u8]) -> Result<&Call> {
        let c = self
            .calls
            .get(&(peer.to_vec(), id.to_vec()))
            .ok_or_else(|| error(pb::ErrorCode::ProtocolError, "unknown RPC call"))?;
        if c.deadline <= Instant::now() {
            return Err(error(
                pb::ErrorCode::DeadlineExceeded,
                "RPC deadline expired",
            ));
        }
        Ok(c)
    }
    fn direction(call: &Call, direction: i32, local: bool) -> Result<usize> {
        let index = match pb::RpcDirection::try_from(direction) {
            Ok(pb::RpcDirection::Request) => 0,
            Ok(pb::RpcDirection::Response) => 1,
            _ => return Err(error(pb::ErrorCode::ProtocolError, "invalid RPC direction")),
        };
        if (index == 0) != if local { call.outbound } else { !call.outbound } {
            return Err(error(
                pb::ErrorCode::ProtocolError,
                "wrong RPC sender direction",
            ));
        }
        Ok(index)
    }
    pub fn chunk(
        &mut self,
        peer: &[u8],
        chunk: &pb::RpcChunk,
        local: bool,
    ) -> Result<Option<(pb::PayloadFragment, Vec<pb::RpcChunk>)>> {
        let c = self.get(peer, &chunk.call_id)?;
        let index = Self::direction(c, chunk.direction, local)?;
        let f = chunk
            .fragment
            .as_ref()
            .ok_or_else(|| error(pb::ErrorCode::InvalidArgument, "missing RPC fragment"))?;
        let ty = if index == 0 {
            &c.request.request_type_url
        } else {
            &c.request.response_type_url
        };
        let d = &c.directions[index];
        if d.ended || chunk.item_sequence != d.next {
            return Err(error(
                pb::ErrorCode::ProtocolError,
                "RPC item sequence or half-close mismatch",
            ));
        }
        if &f.application_type_url != ty {
            return Err(error(pb::ErrorCode::TypeMismatch, "RPC item type mismatch"));
        }
        let n = f.protobuf_bytes.len();
        if n > d.limits.fragment || f.total_size as usize > d.limits.message {
            return Err(error(
                pb::ErrorCode::ResourceExhausted,
                "RPC negotiated fragment/item limit",
            ));
        }
        if n as u32 > d.bytes {
            return Err(error(
                pb::ErrorCode::ResourceExhausted,
                "RPC byte window exhausted",
            ));
        }
        if let Some(i) = &d.assembling {
            if f.offset as usize != i.received
                || f.total_size != i.header.total_size
                || f.encoding != i.header.encoding
            {
                return Err(error(
                    pb::ErrorCode::ProtocolError,
                    "noncontiguous RPC fragment",
                ));
            }
        } else {
            if f.offset != 0 {
                return Err(error(pb::ErrorCode::ProtocolError, "initial RPC offset"));
            }
            if d.items == 0
                || (c.request.streaming == pb::RpcStreaming::Unary as i32 && d.next != 0)
            {
                return Err(error(
                    pb::ErrorCode::ResourceExhausted,
                    "RPC item credit/cardinality exhausted",
                ));
            }
            if c.directions
                .iter()
                .map(|d| {
                    d.consumed.iter().filter(|i| !i.local).count()
                        + usize::from(d.assembling.is_some())
                })
                .sum::<usize>()
                >= 4
                || c.reserved() + f.total_size as usize > 4 * MIB
                || self.reserved() + f.total_size as usize > 32 * MIB
            {
                return Err(error(
                    pb::ErrorCode::ResourceExhausted,
                    "RPC shared reassembly reservation exhausted",
                ));
            }
            validation::validate_type_url(&f.application_type_url)
                .map_err(|e| e.to_protocol_error())?;
            if !matches!(
                pb::PayloadEncoding::try_from(f.encoding),
                Ok(pb::PayloadEncoding::ProtobufMessage | pb::PayloadEncoding::ProtobufAny)
            ) {
                return Err(error(pb::ErrorCode::ProtocolError, "RPC encoding"));
            }
        }
        if n == 0 && f.total_size != 0 || f.offset as usize + n > f.total_size as usize {
            return Err(error(pb::ErrorCode::ProtocolError, "RPC fragment size"));
        }
        let reservation = if d.assembling.is_none() {
            Some(self.budget.reserve(f.total_size as usize)?)
        } else {
            None
        };
        let c = self
            .calls
            .get_mut(&(peer.to_vec(), chunk.call_id.clone()))
            .unwrap();
        let d = &mut c.directions[index];
        if d.assembling.is_none() {
            let mut header = f.clone();
            header.protobuf_bytes.clear();
            d.assembling = Some(Item {
                header,
                received: 0,
                chunks: vec![],
                reservation: reservation.unwrap(),
            });
            d.items -= 1;
        }
        let i = d.assembling.as_mut().unwrap();
        i.received += n;
        i.chunks.push(std::sync::Arc::new(chunk.clone()));
        d.bytes -= n as u32;
        if i.received != f.total_size as usize {
            return Ok(None);
        }
        let i = d.assembling.take().unwrap();
        let mut full = i.header;
        full.protobuf_bytes = Vec::with_capacity(full.total_size as usize);
        for chunk in &i.chunks {
            full.protobuf_bytes
                .extend_from_slice(&chunk.fragment.as_ref().unwrap().protobuf_bytes);
        }
        d.next += 1;
        // Outbound bytes have moved to the bounded session outbox. Track the
        // remote item-credit debt without retaining a receive-buffer reservation.
        d.consumed.push_back(Consumed {
            reservation: if local {
                self.budget.reserve(0)?
            } else {
                i.reservation
            },
            local,
        });
        Ok(Some((
            full,
            if local {
                vec![]
            } else {
                i.chunks
                    .into_iter()
                    .map(|c| std::sync::Arc::try_unwrap(c).unwrap_or_else(|c| (*c).clone()))
                    .collect()
            },
        )))
    }
    pub fn window(&mut self, peer: &[u8], w: &pb::RpcWindow, local: bool) -> Result<()> {
        let c = self.get(peer, &w.call_id)?;
        let index = Self::direction(c, w.direction, !local)?;
        let d = &c.directions[index];
        let bytes = d
            .bytes
            .checked_add(w.byte_credit)
            .filter(|b| *b <= d.limits.bytes)
            .ok_or_else(|| error(pb::ErrorCode::ProtocolError, "RPC byte credit overflow"))?;
        let items = d
            .items
            .checked_add(w.item_credit)
            .filter(|i| *i <= d.limits.items && w.item_credit as usize <= d.consumed.len())
            .ok_or_else(|| {
                error(
                    pb::ErrorCode::ProtocolError,
                    "RPC item credit before consumption or overflow",
                )
            })?;
        if w.byte_credit == 0 && w.item_credit == 0 {
            return Err(error(pb::ErrorCode::ProtocolError, "empty RPC credit"));
        }
        let c = self
            .calls
            .get_mut(&(peer.to_vec(), w.call_id.clone()))
            .unwrap();
        let d = &mut c.directions[index];
        d.bytes = bytes;
        d.items = items;
        for _ in 0..w.item_credit {
            d.consumed.pop_front();
        }
        Ok(())
    }
    pub fn end(&mut self, peer: &[u8], end: &pb::RpcEnd, local: bool) -> Result<()> {
        if self.finished(peer, &end.call_id) {
            return Ok(());
        }
        let c = self.get(peer, &end.call_id)?;
        let index = Self::direction(c, end.direction, local)?;
        let d = &c.directions[index];
        if d.ended {
            return if end.error.is_none() && end.item_count == d.next {
                Ok(())
            } else {
                Err(error(
                    pb::ErrorCode::ProtocolError,
                    "changed duplicate half-close",
                ))
            };
        }
        if index == 0 && end.error.is_some()
            || end.item_count != d.next
            || end.error.is_none()
                && (d.assembling.is_some()
                    || c.request.streaming == pb::RpcStreaming::Unary as i32
                        && (d.next != 1 || index == 1 && !c.directions[0].ended))
        {
            return Err(error(
                pb::ErrorCode::ProtocolError,
                "RPC end cardinality/count mismatch",
            ));
        }
        let key = (peer.to_vec(), end.call_id.clone());
        self.calls.get_mut(&key).unwrap().directions[index].ended = true;
        if index == 1 {
            self.terminal(&key);
        }
        Ok(())
    }
    pub fn cancel(&mut self, peer: &[u8], id: &[u8]) -> bool {
        self.terminal(&(peer.to_vec(), id.to_vec()))
    }
    pub fn remove_peer(&mut self, peer: &[u8]) -> Vec<Vec<u8>> {
        let ids = self
            .calls
            .keys()
            .filter(|(p, _)| p == peer)
            .map(|(_, id)| id.clone())
            .collect::<Vec<_>>();
        for id in &ids {
            self.cancel(peer, id);
        }
        ids
    }
    pub fn expired(&mut self) -> Vec<Key> {
        let keys = self
            .calls
            .iter()
            .filter(|(_, c)| c.deadline <= Instant::now())
            .map(|(k, _)| k.clone())
            .collect::<Vec<_>>();
        for k in &keys {
            self.terminal(k);
        }
        self.prune();
        keys
    }
    pub fn clear(&mut self) -> Vec<Key> {
        let keys = self.calls.keys().cloned().collect::<Vec<_>>();
        for k in &keys {
            self.terminal(k);
        }
        keys
    }
}

/// Verify the exact declared service method and its input/output/cardinality in the
/// descriptor closure. Merely finding two message names is insufficient.
pub(crate) fn validate_handler(h: &pb::RegisterHandler) -> Result<()> {
    let c = h
        .capability
        .as_ref()
        .ok_or_else(|| error(pb::ErrorCode::InvalidArgument, "missing handler capability"))?;
    let digest: [u8; 32] = Sha256::digest(&h.descriptor_set).into();
    let pool = if h.descriptor_set.is_empty() {
        validation::descriptor_pool().clone()
    } else {
        reassembly::finish_descriptor(&h.descriptor_set, &digest)
            .map_err(|e| e.to_protocol_error())?
    };
    if h.descriptor_set.is_empty()
        && !c.descriptor_digest.is_empty()
        && c.descriptor_digest != Sha256::digest(cyberbus_protocol::FILE_DESCRIPTOR_SET).as_slice()
    {
        return Err(error(
            pb::ErrorCode::TypeMismatch,
            "builtin descriptor digest mismatch",
        ));
    }
    if !h.descriptor_set.is_empty() && c.descriptor_digest != digest {
        return Err(error(
            pb::ErrorCode::TypeMismatch,
            "handler descriptor digest mismatch",
        ));
    }
    let (service, method) = c
        .method_id
        .rsplit_once('/')
        .ok_or_else(|| error(pb::ErrorCode::TypeMismatch, "invalid service/method ID"))?;
    let m = pool
        .get_service_by_name(service)
        .and_then(|s| s.methods().find(|m| m.name() == method))
        .ok_or_else(|| {
            error(
                pb::ErrorCode::TypeMismatch,
                "descriptor does not declare method",
            )
        })?;
    if c.request_type_url.rsplit('/').next() != Some(m.input().full_name())
        || c.response_type_url.rsplit('/').next() != Some(m.output().full_name())
    {
        return Err(error(
            pb::ErrorCode::TypeMismatch,
            "descriptor method input/output mismatch",
        ));
    }
    let kind = match (m.is_client_streaming(), m.is_server_streaming()) {
        (false, false) => pb::RpcStreaming::Unary,
        (true, true) => pb::RpcStreaming::Bidi,
        (true, false) => pb::RpcStreaming::ClientStreaming,
        (false, true) => pb::RpcStreaming::ServerStreaming,
    };
    if c.streaming != kind as i32 {
        return Err(error(
            pb::ErrorCode::TypeMismatch,
            "descriptor streaming mismatch",
        ));
    }
    if !matches!(kind, pb::RpcStreaming::Unary | pb::RpcStreaming::Bidi) {
        return Err(error(pb::ErrorCode::Unsupported, "streaming mode reserved"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    pub(super) fn request(n: u8, bidi: bool) -> pb::RpcRequest {
        pb::RpcRequest {
            call_id: vec![n; 16],
            method_id: if bidi {
                "cyberbus.example.v1.Echo/Chat"
            } else {
                "cyberbus.example.v1.Echo/Unary"
            }
            .into(),
            request_type_url: "type.googleapis.com/cyberbus.example.v1.EchoRequest".into(),
            response_type_url: "type.googleapis.com/cyberbus.example.v1.EchoReply".into(),
            streaming: if bidi { 2 } else { 1 },
            semantic_version: "1.0.0".into(),
            timeout: Some(prost_types::Duration {
                seconds: 30,
                nanos: 0,
            }),
        }
    }
    pub(super) fn fragment(
        r: &pb::RpcRequest,
        direction: i32,
        seq: u64,
        total: u32,
        offset: u32,
        n: usize,
    ) -> pb::RpcChunk {
        pb::RpcChunk {
            call_id: r.call_id.clone(),
            direction,
            item_sequence: seq,
            fragment: Some(pb::PayloadFragment {
                application_type_url: if direction == 1 {
                    r.request_type_url.clone()
                } else {
                    r.response_type_url.clone()
                },
                encoding: 1,
                total_size: total,
                offset,
                protobuf_bytes: vec![0; n],
            }),
        }
    }
    fn limits() -> pb::ReceiveLimits {
        pb::ReceiveLimits {
            max_message_bytes: MIB as u32,
            max_fragment_bytes: 16384,
            max_rpc_in_flight: 16,
            rpc_byte_window: 65536,
            rpc_item_window: 4,
            ..Default::default()
        }
    }
    pub(super) fn window(r: &pb::RpcRequest, d: i32, b: u32, i: u32) -> pb::RpcWindow {
        pb::RpcWindow {
            call_id: r.call_id.clone(),
            direction: d,
            byte_credit: b,
            item_credit: i,
        }
    }
    fn end(r: &pb::RpcRequest, d: i32, n: u64, err: bool) -> pb::RpcEnd {
        pb::RpcEnd {
            call_id: r.call_id.clone(),
            direction: d,
            item_count: n,
            error: err.then(|| error(pb::ErrorCode::Cancelled, "application stopped")),
        }
    }
    #[test]
    fn duplicate_tombstone_first_terminal_and_boot_generation() {
        let mut c = Calls::default();
        let p = [1; 32];
        let r = request(1, true);
        c.configure(&p, 1, &[3; 16], &limits()).unwrap();
        c.begin(&p, &r, false).unwrap();
        c.begin(&p, &r, false).unwrap();
        assert_eq!(c.calls.len(), 1);
        let mut conflict = r.clone();
        conflict.method_id.push('x');
        assert!(c.begin(&p, &conflict, false).is_err());
        c.end(&p, &end(&r, 2, 0, false), true).unwrap();
        assert!(!c.cancel(&p, &r.call_id));
        assert!(c.claim_terminal(&p, &r.call_id));
        assert!(!c.claim_terminal(&p, &r.call_id));
        c.end(&p, &end(&r, 1, 900, false), false).unwrap();
        assert!(c.begin(&p, &r, false).is_err());
        c.configure(&p, 1, &[3; 16], &limits()).unwrap();
        assert!(c.begin(&p, &r, false).is_err());
        c.configure(&p, 1, &[4; 16], &limits()).unwrap();
        c.begin(&p, &r, false).unwrap();
        c.cancel(&p, &r.call_id);
        c.configure(&p, 2, &[4; 16], &limits()).unwrap();
        c.begin(&p, &r, false).unwrap();
    }
    #[test]
    fn per_peer_direction_concurrency_and_low_negotiated_limits() {
        let mut c = Calls::default();
        let p = [1; 32];
        let mut l = limits();
        l.max_rpc_in_flight = 2;
        l.rpc_byte_window = 2;
        l.rpc_item_window = 1;
        l.max_fragment_bytes = 2;
        l.max_message_bytes = 8;
        c.configure(&p, 1, &[3; 16], &l).unwrap();
        for n in 0..2 {
            c.begin(&p, &request(n, true), true).unwrap();
        }
        assert!(c.begin(&p, &request(2, true), true).is_err());
        for n in 10..26 {
            c.begin(&p, &request(n, true), false).unwrap();
        }
        assert!(c.begin(&p, &request(26, true), false).is_err());
        c.begin(&[2; 32], &request(2, true), true).unwrap();
        let r = request(0, true);
        assert!(c.chunk(&p, &fragment(&r, 1, 0, 3, 0, 3), true).is_err());
        c.chunk(&p, &fragment(&r, 1, 0, 3, 0, 2), true).unwrap();
        assert!(c.window(&p, &window(&r, 1, 0, 1), false).is_err());
        assert!(c.chunk(&p, &fragment(&r, 1, 0, 3, 2, 1), true).is_err());
        c.window(&p, &window(&r, 1, 2, 0), false).unwrap();
        c.chunk(&p, &fragment(&r, 1, 0, 3, 2, 1), true).unwrap();
        assert!(c.chunk(&p, &fragment(&r, 1, 1, 0, 0, 0), true).is_err());
        c.window(&p, &window(&r, 1, 1, 1), false).unwrap();
        assert!(c.window(&p, &window(&r, 1, 1, 0), false).is_err());
        c.chunk(&p, &fragment(&r, 1, 1, 0, 0, 0), true).unwrap();
    }
    #[test]
    fn all_entries_check_deadline_and_rollback_restores_credit_sequence_terminal() {
        let p = [1; 32];
        let r = request(1, true);
        let mut c = Calls::default();
        c.begin(&p, &r, true).unwrap();
        let cp = c.checkpoint(&p, &r.call_id);
        c.chunk(&p, &fragment(&r, 1, 0, 2, 0, 2), true).unwrap();
        c.rollback(cp);
        assert_eq!(c.reserved(), 0);
        c.chunk(&p, &fragment(&r, 1, 0, 2, 0, 2), true).unwrap();
        let cp = c.checkpoint(&p, &r.call_id);
        c.end(&p, &end(&r, 2, 0, false), false).unwrap();
        c.rollback(cp);
        assert!(c.active(&p, &r.call_id));
        c.calls
            .get_mut(&(p.to_vec(), r.call_id.clone()))
            .unwrap()
            .deadline = Instant::now() - Duration::from_secs(1);
        for e in [
            c.chunk(&p, &fragment(&r, 1, 1, 0, 0, 0), true).map(|_| ()),
            c.window(&p, &window(&r, 1, 2, 1), false),
            c.end(&p, &end(&r, 2, 0, false), false),
            c.begin(&p, &r, false),
            c.remaining(&p, &r.call_id).map(|_| ()),
        ] {
            assert_eq!(e.unwrap_err().code, pb::ErrorCode::DeadlineExceeded as i32);
        }
        assert_eq!(c.expired().len(), 1);
        assert!(c.expired().is_empty());
        assert!(c.finished(&p, &r.call_id));
        assert!(c.claim_terminal(&p, &r.call_id));
    }
    #[test]
    fn bidi_five_megabyte_items_returns_credit_and_bounded_reservations() {
        let p = [1; 32];
        let r = request(1, true);
        let mut c = Calls::default();
        c.begin(&p, &r, false).unwrap();
        for seq in 0..5 {
            for offset in (0..MIB).step_by(16384) {
                let complete = c
                    .chunk(
                        &p,
                        &fragment(&r, 1, seq, MIB as u32, offset as u32, 16384),
                        false,
                    )
                    .unwrap();
                assert_eq!(complete.is_some(), offset + 16384 == MIB);
                c.window(&p, &window(&r, 1, 16384, 0), true).unwrap();
            }
            assert_eq!(c.reserved(), MIB);
            c.window(&p, &window(&r, 1, 0, 1), true).unwrap();
            assert_eq!(c.reserved(), 0);
        }
        c.end(&p, &end(&r, 1, 5, false), false).unwrap();
        c.end(&p, &end(&r, 2, 0, false), true).unwrap();
        assert_eq!(c.reserved(), 0);
    }
    #[test]
    fn shared_32mib_and_call_four_item_budget_before_allocation() {
        let p = [1; 32];
        let r = request(1, true);
        let mut c = Calls::default();
        c.begin(&p, &r, false).unwrap();
        let budget = c.budget.reserve(32 * MIB).unwrap();
        assert!(c
            .chunk(&p, &fragment(&r, 1, 0, MIB as u32, 0, 1), false)
            .is_err());
        assert_eq!(c.reserved(), 0);
        drop(budget);
        for seq in 0..4 {
            c.chunk(&p, &fragment(&r, 1, seq, 0, 0, 0), false).unwrap();
        }
        assert!(c.chunk(&p, &fragment(&r, 2, 0, 0, 0, 0), true).is_err());
        c.window(&p, &window(&r, 1, 0, 1), true).unwrap();
        c.chunk(&p, &fragment(&r, 2, 0, 0, 0, 0), true).unwrap();
    }
    #[test]
    fn unary_success_error_and_direction_count_rules() {
        let p = [1; 32];
        let r = request(1, false);
        let mut c = Calls::default();
        c.begin(&p, &r, true).unwrap();
        assert!(c.chunk(&p, &fragment(&r, 1, 0, 0, 0, 0), false).is_err());
        c.chunk(&p, &fragment(&r, 1, 0, 0, 0, 0), true).unwrap();
        assert!(c.end(&p, &end(&r, 1, 1, true), true).is_err());
        assert!(c.end(&p, &end(&r, 2, 0, false), false).is_err());
        c.end(&p, &end(&r, 1, 1, false), true).unwrap();
        c.chunk(&p, &fragment(&r, 2, 0, 2, 0, 1), false).unwrap();
        assert!(c.end(&p, &end(&r, 2, 1, true), false).is_err());
        c.end(&p, &end(&r, 2, 0, true), false).unwrap();
        assert!(c.finished(&p, &r.call_id));
    }
    #[test]
    fn descriptor_requires_real_method_types_and_cardinality() {
        let r = request(1, true);
        let mut h = pb::RegisterHandler {
            handler_id: vec![1; 16],
            capability: Some(pb::Capability {
                method_id: r.method_id,
                request_type_url: r.request_type_url,
                response_type_url: r.response_type_url,
                streaming: r.streaming,
                semantic_version: r.semantic_version,
                descriptor_digest: Sha256::digest(cyberbus_protocol::FILE_DESCRIPTOR_SET).to_vec(),
            }),
            descriptor_set: cyberbus_protocol::FILE_DESCRIPTOR_SET.to_vec(),
        };
        validate_handler(&h).unwrap();
        h.capability.as_mut().unwrap().streaming = 1;
        assert!(validate_handler(&h).is_err());
        h.capability.as_mut().unwrap().streaming = 2;
        h.capability.as_mut().unwrap().method_id.push('x');
        assert!(validate_handler(&h).is_err());
    }
}

#[cfg(test)]
mod budget_tests {
    use super::*;
    #[test]
    fn shared_reservation_survives_checkpoints_and_releases_at_last_owner() {
        let budget = ReassemblyBudget::default();
        let data = budget.reserve(31 * MIB).unwrap();
        let mut calls = Calls::with_budget(budget.clone());
        let p = [1; 32];
        let r = super::tests::request(8, true);
        calls.begin(&p, &r, false).unwrap();
        let chunk = super::tests::fragment(&r, 1, 0, MIB as u32, 0, 1);
        calls.chunk(&p, &chunk, false).unwrap();
        assert_eq!(budget.used(), 32 * MIB);
        assert!(budget.reserve(1).is_err());
        let cp = calls.checkpoint(&p, &r.call_id);
        calls.cancel(&p, &r.call_id);
        assert_eq!(budget.used(), 32 * MIB);
        drop(cp);
        assert_eq!(budget.used(), 31 * MIB);
        drop(data);
        assert_eq!(budget.used(), 0);
    }
}

#[cfg(test)]
mod duplex_credit_tests {
    use super::*;
    #[test]
    fn outbound_item_debt_does_not_occupy_receive_slots_or_reassembly_bytes() {
        let mut c = Calls::default();
        let p = [1; 32];
        let r = super::tests::request(5, true);
        c.begin(&p, &r, true).unwrap();
        for seq in 0..4 {
            c.chunk(&p, &super::tests::fragment(&r, 1, seq, 0, 0, 0), true)
                .unwrap();
        }
        assert_eq!(c.reserved(), 0);
        c.chunk(&p, &super::tests::fragment(&r, 2, 0, 0, 0, 0), false)
            .unwrap();
        assert!(c
            .chunk(&p, &super::tests::fragment(&r, 1, 4, 0, 0, 0), true)
            .is_err());
        c.window(&p, &super::tests::window(&r, 1, 0, 1), false)
            .unwrap();
        c.chunk(&p, &super::tests::fragment(&r, 1, 4, 0, 0, 0), true)
            .unwrap();
    }
}
