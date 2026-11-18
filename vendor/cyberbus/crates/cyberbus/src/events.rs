//! Single consumer with independent, bounded directory mailboxes. Cancellation and reset
//! happen under the same lock as dequeue, so a cancelled watch cannot start another delivery.
use crate::pb;
use prost::Message;
use std::{
    collections::{BTreeMap, VecDeque},
    sync::{Arc, Mutex},
};
use tokio::sync::{mpsc::error::TryRecvError, Notify};
const COUNT: usize = 256;
const BYTES: usize = 8 * 1024 * 1024;
#[derive(Default)]
struct Watch {
    queue: VecDeque<pb::SdkEvent>,
    bytes: usize,
    delivered: u64,
}
#[derive(Default)]
struct State {
    general: VecDeque<pb::SdkEvent>,
    data: VecDeque<pb::SdkEvent>,
    data_bytes: usize,
    bytes: usize,
    watches: BTreeMap<Vec<u8>, Watch>,
    closed: bool,
    receiver_gone: bool,
    queries: BTreeMap<Vec<u8>, bool>,
    seen: std::collections::BTreeSet<Vec<u8>>,
    terminals: VecDeque<pb::SdkEvent>,
    terminal_bytes: usize,
}
struct Shared {
    state: Mutex<State>,
    ready: Notify,
}
pub(crate) struct EventSender(Arc<Shared>);
/// Owned single event consumer. `recv` is cancellation safe; dropping it closes delivery.
pub struct EventReceiver(Arc<Shared>);
pub(crate) fn channel() -> (EventSender, EventReceiver) {
    let shared = Arc::new(Shared {
        state: Mutex::new(State::default()),
        ready: Notify::new(),
    });
    (EventSender(shared.clone()), EventReceiver(shared))
}
// Only business callbacks are revocable. Status, cancellation and query terminals
// remain deliverable, so revocation never erases settlement of an accepted operation.
fn callback_peer(event: &pb::SdkEvent) -> Option<&[u8]> {
    match event.body.as_ref()? {
        pb::sdk_event::Body::DataReceived(d) => Some(&d.peer_device_id),
        pb::sdk_event::Body::Rpc(r)
            if matches!(
                r.body,
                Some(
                    pb::rpc_event::Body::Request(_)
                        | pb::rpc_event::Body::Chunk(_)
                        | pb::rpc_event::Body::Window(_)
                )
            ) =>
        {
            Some(&r.peer_device_id)
        }
        _ => None,
    }
}
impl State {
    fn purge_callbacks(&mut self, mut predicate: impl FnMut(&pb::SdkEvent) -> bool) {
        self.general.retain(|e| !predicate(e));
        self.data.retain(|e| !predicate(e));
        self.data_bytes = self.data.iter().map(Message::encoded_len).sum();
        self.bytes = self.general.iter().map(Message::encoded_len).sum();
    }
}
impl EventSender {
    pub fn send_data(&self, event: pb::SdkEvent) -> Result<(), pb::ProtocolError> {
        let Some(pb::sdk_event::Body::DataReceived(d)) = event.body.as_ref() else {
            return Err(crate::error(
                pb::ErrorCode::Internal,
                "data mailbox requires DataReceived",
            ));
        };
        let mut s = self.0.state.lock().unwrap();
        if s.closed || s.receiver_gone {
            return Err(crate::error(
                pb::ErrorCode::Cancelled,
                "event receiver closed",
            ));
        }
        let size = event.encoded_len();
        let mut count = 0;
        let mut bytes = 0;
        for e in &s.data {
            if matches!(e.body.as_ref(), Some(pb::sdk_event::Body::DataReceived(old)) if old.subscription_id == d.subscription_id)
            {
                count += 1;
                bytes += e.encoded_len();
            }
        }
        if count >= 64 || bytes + size > 4 * 1024 * 1024 || s.data_bytes + size > 16 * 1024 * 1024 {
            return Err(crate::error(
                pb::ErrorCode::QueueFull,
                "data subscription event budget is full",
            ));
        }
        s.data_bytes += size;
        s.data.push_back(event);
        drop(s);
        self.0.ready.notify_one();
        Ok(())
    }
    pub fn cancel_data(&self, peer: &[u8], id: &[u8]) -> bool {
        let mut s = self.0.state.lock().unwrap();
        let before = s.data.len();
        s.purge_callbacks(|e| matches!(e.body.as_ref(), Some(pb::sdk_event::Body::DataReceived(d)) if d.peer_device_id == peer && d.message.as_ref().is_some_and(|m| m.message_id == id)));
        s.data.len() != before
    }
    pub fn business_revoker(&self) -> Arc<dyn Fn() + Send + Sync> {
        let shared = Arc::downgrade(&self.0);
        Arc::new(move || {
            if let Some(shared) = shared.upgrade() {
                shared
                    .state
                    .lock()
                    .unwrap()
                    .purge_callbacks(|e| callback_peer(e).is_some());
            }
        })
    }
    pub fn revoke_peer(&self, peer: &[u8]) {
        self.0
            .state
            .lock()
            .unwrap()
            .purge_callbacks(|e| callback_peer(e) == Some(peer));
    }
    pub fn cancel_subscription(&self, subscription: &[u8]) {
        self.0.state.lock().unwrap().purge_callbacks(|e| matches!(e.body.as_ref(), Some(pb::sdk_event::Body::DataReceived(d)) if d.subscription_id == subscription));
    }
    pub fn revoke_business(&self) {
        self.0
            .state
            .lock()
            .unwrap()
            .purge_callbacks(|e| callback_peer(e).is_some());
    }
    pub fn reserve_query(&self, id: &[u8]) -> Result<(), pb::ProtocolError> {
        let mut s = self.0.state.lock().unwrap();
        if s.seen.contains(id) {
            return Err(crate::error(
                pb::ErrorCode::Conflict,
                "query ID already active",
            ));
        }
        if s.queries.len() >= crate::queries::SLOTS {
            return Err(crate::error(
                pb::ErrorCode::ResourceExhausted,
                "four query terminal reservations are in use",
            ));
        }
        if s.seen.len() >= 65536 {
            return Err(crate::error(
                pb::ErrorCode::ResourceExhausted,
                "adapter query ID history is full",
            ));
        }
        s.seen.insert(id.to_vec());
        s.queries.insert(id.to_vec(), false);
        Ok(())
    }
    pub fn release_query(&self, id: &[u8]) {
        let mut s = self.0.state.lock().unwrap();
        s.queries.remove(id);
        s.seen.remove(id);
    }
    pub fn register(&self, id: Vec<u8>) {
        self.0
            .state
            .lock()
            .unwrap()
            .watches
            .insert(id, Watch::default());
    }
    pub fn cancel(&self, id: &[u8]) {
        self.0.state.lock().unwrap().watches.remove(id);
    }
    pub fn send(
        &self,
        mut event: pb::SdkEvent,
        snapshot: Option<pb::DevicesSnapshot>,
    ) -> Result<(), ()> {
        if matches!(event.body, Some(pb::sdk_event::Body::DataReceived(_))) {
            return self.send_data(event).map_err(|_| ());
        }
        let mut s = self.0.state.lock().unwrap();
        if s.closed || s.receiver_gone {
            return Err(());
        }
        let size = event.encoded_len();
        if let Some(pb::sdk_event::Body::Devices(d)) = event.body.as_mut() {
            let Some(w) = s.watches.get_mut(&d.watch_id) else {
                return Ok(());
            };
            let runtime_change = matches!(&d.body, Some(pb::devices_event::Body::Reset(r)) if r.reason == pb::ResetReason::RuntimeChanged as i32);
            let overflow = w.queue.len() >= COUNT || w.bytes + size > BYTES;
            if runtime_change || overflow {
                // Preserve the initial snapshot contract even when the first consumer is slow.
                let initial = if !runtime_change
                    && w.delivered == 0
                    && matches!(w.queue.front().and_then(|e| e.body.as_ref()), Some(pb::sdk_event::Body::Devices(d)) if matches!(d.body, Some(pb::devices_event::Body::Snapshot(_))))
                {
                    w.queue.pop_front()
                } else {
                    None
                };
                w.queue.clear();
                w.bytes = 0;
                if let Some(initial) = initial {
                    w.bytes = initial.encoded_len();
                    w.queue.push_back(initial);
                }
                if runtime_change && w.delivered == 0 {
                    // Never deliver old-account metadata, and never let a reset become
                    // a watch's first callback. Start with the newest runtime snapshot.
                    let snap = match d.body.as_ref() {
                        Some(pb::devices_event::Body::Reset(r)) => r.snapshot.clone(),
                        _ => None,
                    }
                    .or(snapshot.clone())
                    .ok_or(())?;
                    d.body = Some(pb::devices_event::Body::Snapshot(snap));
                    d.previous_revision = 0;
                } else if overflow {
                    let snap = snapshot.ok_or(())?;
                    if snap.encoded_len() > 5 * 1024 * 1024 {
                        return Err(());
                    }
                    if let Some(pb::sdk_event::Body::Devices(d)) = event.body.as_mut() {
                        d.body = Some(pb::devices_event::Body::Reset(pb::DevicesReset {
                            snapshot: Some(snap),
                            reason: pb::ResetReason::Overflow as i32,
                        }));
                    }
                }
            }
            w.bytes += event.encoded_len();
            w.queue.push_back(event);
        } else {
            match event.body.as_ref() {
                Some(pb::sdk_event::Body::Rpc(r)) => {
                    let revoked_call = match r.body.as_ref() {
                        Some(pb::rpc_event::Body::Cancel(cancel)) => Some(&cancel.call_id),
                        Some(pb::rpc_event::Body::End(end))
                            if end.direction == pb::RpcDirection::Response as i32
                                && end.error.is_some() =>
                        {
                            Some(&end.call_id)
                        }
                        _ => None,
                    };
                    // Revoke pending work atomically with terminal enqueue and dequeue.
                    // Half-close and successful response End retain preceding chunks.
                    if let Some(call_id) = revoked_call {
                        s.purge_callbacks(|e| matches!(e.body.as_ref(), Some(pb::sdk_event::Body::Rpc(old)) if old.peer_device_id == r.peer_device_id && match old.body.as_ref() {
                            Some(pb::rpc_event::Body::Request(v)) => &v.call_id == call_id,
                            Some(pb::rpc_event::Body::Chunk(v)) => &v.call_id == call_id,
                            Some(pb::rpc_event::Body::Window(v)) => &v.call_id == call_id,
                            _ => false,
                        }));
                    }
                }
                Some(pb::sdk_event::Body::PeerDataCancel(c)) => s.purge_callbacks(|e| matches!(e.body.as_ref(), Some(pb::sdk_event::Body::DataReceived(d)) if d.peer_device_id == c.peer_device_id && d.message.as_ref().is_some_and(|m| m.message_id == c.message_id))),
                _ => {},
            }
            let n = event.encoded_len();
            if let Some(id) = crate::queries::event_id(&event).map(<[u8]>::to_vec) {
                if s.terminal_bytes + n > crate::queries::TERMINAL_BYTES {
                    return Err(());
                }
                let Some(terminal) = s.queries.get_mut(&id) else {
                    return Err(());
                };
                if *terminal {
                    return Err(());
                }
                *terminal = true;
                s.terminal_bytes += n;
                s.terminals.push_back(event);
            } else {
                if s.general.len() >= COUNT || s.bytes + n > BYTES {
                    return Err(());
                }
                s.bytes += n;
                s.general.push_back(event);
            }
        }
        drop(s);
        self.0.ready.notify_one();
        Ok(())
    }
}
impl Drop for EventSender {
    fn drop(&mut self) {
        self.0.state.lock().unwrap().closed = true;
        self.0.ready.notify_one();
    }
}
impl EventReceiver {
    pub fn try_recv(&mut self) -> Result<pb::SdkEvent, TryRecvError> {
        let mut s = self.0.state.lock().unwrap();
        let watch = s
            .watches
            .iter()
            .filter_map(|(id, w)| w.queue.front().map(|e| (id.clone(), e.event_sequence)))
            .min_by_key(|(_, seq)| *seq);
        let general = s
            .general
            .front()
            .into_iter()
            .chain(s.terminals.front())
            .chain(s.data.front())
            .map(|e| e.event_sequence)
            .min();
        if let Some((id, seq)) = watch.filter(|(_, seq)| general.is_none_or(|g| *seq < g)) {
            let w = s.watches.get_mut(&id).unwrap();
            let mut e = w.queue.pop_front().unwrap();
            w.bytes -= e.encoded_len();
            if let Some(pb::sdk_event::Body::Devices(d)) = e.body.as_mut() {
                if matches!(d.body, Some(pb::devices_event::Body::Reset(_))) {
                    d.previous_revision = w.delivered;
                }
                w.delivered = d.revision;
            }
            let _ = seq;
            return Ok(e);
        }
        if s.data.front().is_some_and(|e| {
            s.general
                .front()
                .into_iter()
                .chain(s.terminals.front())
                .all(|other| e.event_sequence < other.event_sequence)
        }) {
            let e = s.data.pop_front().unwrap();
            s.data_bytes -= e.encoded_len();
            return Ok(e);
        }
        if s.terminals.front().is_some_and(|e| {
            s.general
                .front()
                .is_none_or(|g| e.event_sequence < g.event_sequence)
        }) {
            let e = s.terminals.pop_front().unwrap();
            s.terminal_bytes -= e.encoded_len();
            if let Some(id) = crate::queries::event_id(&e) {
                s.queries.remove(id);
            }
            return Ok(e);
        }
        if let Some(e) = s.general.pop_front() {
            s.bytes -= e.encoded_len();
            return Ok(e);
        }
        Err(if s.closed {
            TryRecvError::Disconnected
        } else {
            TryRecvError::Empty
        })
    }
    pub async fn recv(&mut self) -> Option<pb::SdkEvent> {
        loop {
            let shared = self.0.clone();
            let notified = shared.ready.notified();
            match self.try_recv() {
                Ok(e) => return Some(e),
                Err(TryRecvError::Disconnected) => return None,
                Err(TryRecvError::Empty) => notified.await,
            }
        }
    }
}
impl Drop for EventReceiver {
    fn drop(&mut self) {
        let mut s = self.0.state.lock().unwrap();
        s.receiver_gone = true;
        s.general.clear();
        s.data.clear();
        s.data_bytes = 0;
        s.terminals.clear();
        s.queries.clear();
        s.watches.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn snapshot(revision: u64) -> pb::DevicesSnapshot {
        pb::DevicesSnapshot {
            runtime_id: vec![1; 16],
            revision,
            devices: vec![],
        }
    }
    fn event(seq: u64, watch: u8, revision: u64, initial: bool) -> pb::SdkEvent {
        pb::SdkEvent {
            event_sequence: seq,
            runtime_id: vec![1; 16],
            body: Some(pb::sdk_event::Body::Devices(pb::DevicesEvent {
                watch_id: vec![watch; 16],
                runtime_id: vec![1; 16],
                revision,
                previous_revision: revision - 1,
                body: Some(if initial {
                    pb::devices_event::Body::Snapshot(snapshot(revision))
                } else {
                    pb::devices_event::Body::Removed(pb::DeviceRemoved::default())
                }),
            })),
        }
    }
    #[tokio::test]
    async fn slow_watch_resets_from_delivered_revision_and_cancel_purges() {
        let (tx, mut rx) = channel();
        tx.register(vec![1; 16]);
        tx.register(vec![2; 16]);
        tx.send(event(1, 1, 1, true), Some(snapshot(1))).unwrap();
        rx.recv().await.unwrap();
        for n in 2..=600 {
            tx.send(event(n, 1, n, false), Some(snapshot(n))).unwrap();
        }
        tx.send(event(601, 2, 1, true), Some(snapshot(1))).unwrap();
        let e = rx.recv().await.unwrap();
        let Some(pb::sdk_event::Body::Devices(d)) = e.body else {
            panic!()
        };
        assert_eq!(d.previous_revision, 1);
        assert!(matches!(d.body, Some(pb::devices_event::Body::Reset(_))));
        tx.cancel(&vec![1; 16]);
        let e = rx.recv().await.unwrap();
        assert_eq!(e.event_sequence, 601);
        assert_eq!(rx.try_recv(), Err(TryRecvError::Empty));
        drop(tx);
        assert!(rx.recv().await.is_none());
    }
    #[test]
    fn first_snapshot_survives_overflow_and_generation_reset_purges_old_metadata() {
        let (tx, mut rx) = channel();
        tx.register(vec![1; 16]);
        for n in 1..=300 {
            tx.send(event(n, 1, n, n == 1), Some(snapshot(n))).unwrap();
        }
        assert!(
            matches!(rx.try_recv().unwrap().body,Some(pb::sdk_event::Body::Devices(d)) if matches!(d.body,Some(pb::devices_event::Body::Snapshot(_))))
        );
        let mut reset = event(301, 1, 301, false);
        if let Some(pb::sdk_event::Body::Devices(d)) = reset.body.as_mut() {
            d.body = Some(pb::devices_event::Body::Reset(pb::DevicesReset {
                snapshot: Some(snapshot(301)),
                reason: pb::ResetReason::RuntimeChanged as i32,
            }));
        }
        tx.send(reset, Some(snapshot(301))).unwrap();
        assert_eq!(rx.try_recv().unwrap().event_sequence, 301);
        assert_eq!(rx.try_recv(), Err(TryRecvError::Empty));
    }
    #[test]
    fn undelivered_watch_starts_with_new_runtime_snapshot() {
        let (tx, mut rx) = channel();
        tx.register(vec![1; 16]);
        tx.send(event(1, 1, 1, true), Some(snapshot(1))).unwrap();
        let mut reset = event(2, 1, 2, false);
        reset.runtime_id = vec![2; 16];
        let mut current = snapshot(2);
        current.runtime_id = vec![2; 16];
        if let Some(pb::sdk_event::Body::Devices(d)) = reset.body.as_mut() {
            d.runtime_id = current.runtime_id.clone();
            d.body = Some(pb::devices_event::Body::Reset(pb::DevicesReset {
                snapshot: Some(current.clone()),
                reason: pb::ResetReason::RuntimeChanged as i32,
            }));
        }
        tx.send(reset, Some(current)).unwrap();
        let first = rx.try_recv().unwrap();
        assert_eq!(first.runtime_id, vec![2; 16]);
        let Some(pb::sdk_event::Body::Devices(d)) = first.body else {
            panic!()
        };
        assert_eq!(d.previous_revision, 0);
        assert!(
            matches!(d.body, Some(pb::devices_event::Body::Snapshot(s)) if s.runtime_id == vec![2;16])
        );
        assert_eq!(rx.try_recv(), Err(TryRecvError::Empty));
    }
    #[test]
    fn revoked_callbacks_are_purged_but_terminals_survive() {
        let (tx, mut rx) = channel();
        for n in 1..=2 {
            tx.send(
                pb::SdkEvent {
                    event_sequence: n,
                    body: Some(pb::sdk_event::Body::DataReceived(pb::DataReceived {
                        subscription_id: vec![n as u8; 16],
                        peer_device_id: vec![7; 32],
                        ..Default::default()
                    })),
                    ..Default::default()
                },
                None,
            )
            .unwrap();
        }
        tx.send(
            pb::SdkEvent {
                event_sequence: 3,
                body: Some(pb::sdk_event::Body::DataStatus(pb::DataStatus::default())),
                ..Default::default()
            },
            None,
        )
        .unwrap();
        tx.cancel_subscription(&[1; 16]);
        assert_eq!(tx.0.state.lock().unwrap().data.len(), 1);
        tx.revoke_peer(&[7; 32]);
        assert_eq!(rx.try_recv().unwrap().event_sequence, 3);
        assert_eq!(rx.try_recv(), Err(TryRecvError::Empty));
    }
    #[test]
    fn rpc_failure_purges_only_matching_work_and_reclaims_queue_budget() {
        let (tx, mut rx) = channel();
        let rpc = |seq, peer: u8, body| pb::SdkEvent {
            event_sequence: seq,
            body: Some(pb::sdk_event::Body::Rpc(pb::RpcEvent {
                peer_device_id: vec![peer; 32],
                handler_id: vec![9; 16],
                body: Some(body),
            })),
            ..Default::default()
        };
        let request = |id| {
            pb::rpc_event::Body::Request(pb::RpcRequest {
                call_id: vec![id; 16],
                ..Default::default()
            })
        };
        tx.send(rpc(1, 7, request(1)), None).unwrap();
        tx.send(
            rpc(
                2,
                7,
                pb::rpc_event::Body::Chunk(pb::RpcChunk {
                    call_id: vec![1; 16],
                    ..Default::default()
                }),
            ),
            None,
        )
        .unwrap();
        tx.send(
            rpc(
                3,
                7,
                pb::rpc_event::Body::Window(pb::RpcWindow {
                    call_id: vec![1; 16],
                    ..Default::default()
                }),
            ),
            None,
        )
        .unwrap();
        tx.send(rpc(4, 7, request(2)), None).unwrap();
        tx.send(rpc(5, 8, request(1)), None).unwrap();
        let terminal = rpc(
            6,
            7,
            pb::rpc_event::Body::End(pb::RpcEnd {
                call_id: vec![1; 16],
                direction: pb::RpcDirection::Response as i32,
                error: Some(crate::error(pb::ErrorCode::DeadlineExceeded, "expired")),
                ..Default::default()
            }),
        );
        tx.send(terminal.clone(), None).unwrap();
        {
            let s = tx.0.state.lock().unwrap();
            assert_eq!(s.general.len(), 3);
            assert_eq!(
                s.bytes,
                s.general.iter().map(Message::encoded_len).sum::<usize>()
            );
        }
        assert_eq!(rx.try_recv().unwrap().event_sequence, 4);
        assert_eq!(rx.try_recv().unwrap().event_sequence, 5);
        assert_eq!(rx.try_recv().unwrap(), terminal);
        assert_eq!(rx.try_recv(), Err(TryRecvError::Empty));
        assert_eq!(tx.0.state.lock().unwrap().bytes, 0);
    }
    #[test]
    fn rpc_half_close_and_success_preserve_preceding_chunks() {
        for direction in [pb::RpcDirection::Request, pb::RpcDirection::Response] {
            let (tx, mut rx) = channel();
            for (seq, body) in [
                pb::rpc_event::Body::Chunk(pb::RpcChunk {
                    call_id: vec![1; 16],
                    direction: direction as i32,
                    ..Default::default()
                }),
                pb::rpc_event::Body::End(pb::RpcEnd {
                    call_id: vec![1; 16],
                    direction: direction as i32,
                    error: None,
                    ..Default::default()
                }),
            ]
            .into_iter()
            .enumerate()
            {
                tx.send(
                    pb::SdkEvent {
                        event_sequence: seq as u64,
                        body: Some(pb::sdk_event::Body::Rpc(pb::RpcEvent {
                            peer_device_id: vec![7; 32],
                            body: Some(body),
                            ..Default::default()
                        })),
                        ..Default::default()
                    },
                    None,
                )
                .unwrap();
            }
            assert_eq!(rx.try_recv().unwrap().event_sequence, 0);
            assert_eq!(rx.try_recv().unwrap().event_sequence, 1);
            assert_eq!(rx.try_recv(), Err(TryRecvError::Empty));
        }
    }
    #[test]
    fn data_mailbox_is_bounded_independent_and_cancel_is_atomic_with_dequeue() {
        let (tx, mut rx) = channel();
        let event = |n| pb::SdkEvent {
            event_sequence: n,
            body: Some(pb::sdk_event::Body::DataReceived(pb::DataReceived {
                subscription_id: vec![1; 16],
                peer_device_id: vec![7; 32],
                message: Some(pb::DataMessage {
                    message_id: vec![n as u8; 16],
                    ..Default::default()
                }),
            })),
            ..Default::default()
        };
        for n in 1..=64 {
            tx.send_data(event(n)).unwrap();
        }
        assert_eq!(
            tx.send_data(event(65)).unwrap_err().code,
            pb::ErrorCode::QueueFull as i32
        );
        assert!(tx.cancel_data(&[7; 32], &[64; 16]));
        assert!(!tx.cancel_data(&[7; 32], &[64; 16]));
        assert_eq!(rx.try_recv().unwrap().event_sequence, 1);
        assert!(!tx.cancel_data(&[7; 32], &[1; 16]));
        tx.send_data(event(65)).unwrap();
        tx.revoke_business();
        assert_eq!(rx.try_recv(), Err(TryRecvError::Empty));
    }
    #[test]
    fn query_reservations_survive_enqueue_until_delivery_and_ids_stay_unique() {
        let (tx, mut rx) = channel();
        for n in 1..=4u8 {
            tx.reserve_query(&[n; 16]).unwrap();
            tx.send(
                pb::SdkEvent {
                    event_sequence: n as u64,
                    runtime_id: vec![1; 16],
                    body: Some(pb::sdk_event::Body::DevicesQuery(pb::DevicesQueryResult {
                        query_id: vec![n; 16],
                        result: Some(pb::devices_query_result::Result::Snapshot(snapshot(1))),
                    })),
                },
                None,
            )
            .unwrap();
        }
        assert_eq!(
            tx.reserve_query(&[1; 16]).unwrap_err().code,
            pb::ErrorCode::Conflict as i32
        );
        assert_eq!(
            tx.reserve_query(&[5; 16]).unwrap_err().code,
            pb::ErrorCode::ResourceExhausted as i32
        );
        rx.try_recv().unwrap();
        tx.reserve_query(&[5; 16]).unwrap();
        assert_eq!(
            tx.reserve_query(&[1; 16]).unwrap_err().code,
            pb::ErrorCode::Conflict as i32
        );
        tx.release_query(&[5; 16]);
        tx.reserve_query(&[5; 16]).unwrap();
    }
}
