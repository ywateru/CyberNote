//! Separate control capacity and byte-accounted business output. Queued deadlines are
//! absolute locally and are rewritten to remaining wire budgets immediately before send.
use super::Body;
use crate::pb;
use prost::Message;
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tokio::{sync::mpsc, time::Instant};
const CONTROL_BYTES: usize = 64 * 1024;
const BUSINESS_BYTES: usize = 4 * 1024 * 1024;
const GLOBAL_BYTES: usize = 32 * 1024 * 1024;
#[derive(Clone, Default)]
pub(crate) struct OutputBudget(Arc<AtomicUsize>);
impl OutputBudget {
    fn reserve(&self, size: usize, limit: usize) -> bool {
        self.0
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |n| {
                n.checked_add(size).filter(|total| *total <= limit)
            })
            .is_ok()
    }
    fn release(&self, size: usize) {
        self.0.fetch_sub(size, Ordering::AcqRel);
    }
}
#[derive(Clone)]
pub(crate) struct PeerSender {
    control: mpsc::Sender<Queued>,
    business: mpsc::Sender<Queued>,
    control_bytes: OutputBudget,
    business_bytes: OutputBudget,
    global: OutputBudget,
    rpc_fences: Arc<Mutex<BTreeMap<Vec<u8>, Arc<AtomicBool>>>>,
    data_timings: Arc<Mutex<BTreeMap<Vec<u8>, Arc<DataTiming>>>>,
}
struct DataTiming {
    timeout: Mutex<Option<prost_types::Duration>>,
    complete: AtomicBool,
    cancelled: AtomicBool,
    deadline: Instant,
}
pub(crate) struct PeerOutput {
    control: mpsc::Receiver<Queued>,
    business: mpsc::Receiver<Queued>,
}
pub(crate) struct Queued {
    body: Option<Body>,
    deadline: Option<Instant>,
    cost: usize,
    budgets: Vec<OutputBudget>,
    revoked: Option<Arc<AtomicBool>>,
    data_timing: Option<(Arc<DataTiming>, bool)>,
}
impl Drop for Queued {
    fn drop(&mut self) {
        for b in &self.budgets {
            b.release(self.cost);
        }
    }
}
fn timeout(body: &Body) -> Option<Duration> {
    let d = match body {
        Body::Data(m) => m.timeout.as_ref(),
        Body::RpcRequest(m) => m.timeout.as_ref(),
        Body::DescriptorQuery(m) => m.timeout.as_ref(),
        _ => None,
    }?;
    Some(Duration::new(
        d.seconds.max(0) as u64,
        d.nanos.max(0) as u32,
    ))
}
fn control(body: &Body) -> bool {
    matches!(
        body,
        Body::Ping(_)
            | Body::Pong(_)
            | Body::Close(_)
            | Body::DataAck(_)
            | Body::DataError(_)
            | Body::DataCancel(_)
            | Body::RpcCancel(_)
            | Body::RpcWindow(_)
            | Body::DescriptorError(_)
    )
}
pub(crate) fn channel(global: OutputBudget) -> (PeerSender, PeerOutput) {
    let (c, cr) = mpsc::channel(128);
    let (b, br) = mpsc::channel(128);
    (
        PeerSender {
            control: c,
            business: b,
            control_bytes: OutputBudget::default(),
            business_bytes: OutputBudget::default(),
            global,
            rpc_fences: Arc::new(Mutex::new(BTreeMap::new())),
            data_timings: Arc::new(Mutex::new(BTreeMap::new())),
        },
        PeerOutput {
            control: cr,
            business: br,
        },
    )
}
impl PeerSender {
    /// Revoke only queued work. Selected terminal End/Cancel frames stay ordered
    /// and deliverable. Entries exist only while an actual queued frame holds them.
    pub fn fence_rpc(&self, call_id: &[u8]) {
        if let Some(flag) = self.rpc_fences.lock().unwrap().get(call_id) {
            flag.store(true, Ordering::Release);
        }
    }
    pub fn cancel_rpc(&self, call_id: &[u8]) {
        self.fence_rpc(call_id);
    }
    pub fn capacity(&self) -> usize {
        self.business.capacity()
    }
    pub fn is_idle(&self) -> bool {
        // Queued retains these reservations while the writer sends the frame,
        // so empty channels alone cannot make a selected terminal ACK idle.
        self.control_bytes.0.load(Ordering::Acquire) == 0
            && self.business_bytes.0.load(Ordering::Acquire) == 0
    }
    pub fn try_send(&self, body: Body) -> Result<(), mpsc::error::TrySendError<Body>> {
        let deadline = timeout(&body).map(|d| Instant::now() + d);
        self.enqueue(body, deadline)
    }
    pub fn try_send_with_deadline(
        &self,
        body: Body,
        deadline: Instant,
    ) -> Result<(), mpsc::error::TrySendError<Body>> {
        self.enqueue(body, Some(deadline))
    }
    fn enqueue(
        &self,
        body: Body,
        deadline: Option<Instant>,
    ) -> Result<(), mpsc::error::TrySendError<Body>> {
        if let Body::RpcCancel(c) = &body {
            self.fence_rpc(&c.call_id);
        }
        if let Body::DataCancel(c) = &body {
            if let Some(timing) = self.data_timings.lock().unwrap().get(&c.message_id) {
                timing.cancelled.store(true, Ordering::Release);
            }
        }
        let data_timing = if let Body::Data(m) = &body {
            let mut timings = self.data_timings.lock().unwrap();
            timings.retain(|_, t| {
                t.deadline > Instant::now()
                    && !(t.complete.load(Ordering::Acquire) && Arc::strong_count(t) == 1)
            });
            if timings.len() >= 128 && !timings.contains_key(&m.message_id) {
                return Err(mpsc::error::TrySendError::Full(body));
            }
            let timing = timings
                .entry(m.message_id.clone())
                .or_insert_with(|| {
                    Arc::new(DataTiming {
                        timeout: Mutex::new(None),
                        complete: AtomicBool::new(false),
                        cancelled: AtomicBool::new(false),
                        deadline: deadline
                            .unwrap_or_else(|| Instant::now() + Duration::from_secs(30)),
                    })
                })
                .clone();
            let last = m.fragment.as_ref().is_some_and(|f| {
                f.offset as usize + f.protobuf_bytes.len() == f.total_size as usize
            });
            Some((timing, last))
        } else {
            None
        };
        let call_id = match &body {
            Body::RpcRequest(r) => Some(&r.call_id),
            Body::RpcChunk(r) => Some(&r.call_id),
            Body::RpcWindow(r) => Some(&r.call_id),
            _ => None,
        };
        let revoked = call_id.map(|id| {
            let mut fences = self.rpc_fences.lock().unwrap();
            fences.retain(|_, flag| Arc::strong_count(flag) > 1);
            fences
                .entry(id.clone())
                .or_insert_with(|| Arc::new(AtomicBool::new(false)))
                .clone()
        });
        let cost = pb::WireEnvelope {
            session_id: vec![0; 32],
            sequence: u64::MAX,
            body: Some(body.clone()),
        }
        .encoded_len()
            + 20;
        let is_control = control(&body);
        let budget = if is_control {
            &self.control_bytes
        } else {
            &self.business_bytes
        };
        let limit = if is_control {
            CONTROL_BYTES
        } else {
            BUSINESS_BYTES
        };
        if !budget.reserve(cost, limit) {
            return Err(mpsc::error::TrySendError::Full(body));
        }
        let mut budgets = vec![budget.clone()];
        if !is_control {
            if !self.global.reserve(cost, GLOBAL_BYTES) {
                budget.release(cost);
                return Err(mpsc::error::TrySendError::Full(body));
            }
            budgets.push(self.global.clone());
        }
        let q = Queued {
            body: Some(body),
            deadline,
            cost,
            budgets,
            revoked,
            data_timing,
        };
        (if is_control {
            &self.control
        } else {
            &self.business
        })
        .try_send(q)
        .map_err(|e| match e {
            mpsc::error::TrySendError::Full(mut q) => {
                mpsc::error::TrySendError::Full(q.body.take().unwrap())
            }
            mpsc::error::TrySendError::Closed(mut q) => {
                mpsc::error::TrySendError::Closed(q.body.take().unwrap())
            }
        })
    }
}
impl Queued {
    pub fn is_revoked(&self) -> bool {
        self.revoked
            .as_ref()
            .is_some_and(|flag| flag.load(Ordering::Acquire))
            || self
                .data_timing
                .as_ref()
                .is_some_and(|(timing, _)| timing.cancelled.load(Ordering::Acquire))
    }
    pub fn prepare(&mut self) -> Result<Body, Body> {
        let mut body = self.body.take().unwrap();
        if let Some(deadline) = self.deadline {
            let Some(remaining) = deadline
                .checked_duration_since(Instant::now())
                .filter(|d| !d.is_zero())
            else {
                return Err(body);
            };
            let timeout = Some(prost_types::Duration {
                seconds: remaining.as_secs() as i64,
                nanos: remaining.subsec_nanos() as i32,
            });
            match &mut body {
                Body::Data(m) => {
                    // Fragment headers are immutable for one logical Data message.
                    // Choose its remaining wire timeout exactly once, at first write.
                    m.timeout = if let Some((timing, last)) = &self.data_timing {
                        let mut canonical = timing.timeout.lock().unwrap();
                        let value = canonical
                            .get_or_insert_with(|| timeout.clone().unwrap())
                            .clone();
                        if *last {
                            timing.complete.store(true, Ordering::Release);
                        }
                        Some(value)
                    } else {
                        timeout
                    };
                }
                Body::RpcRequest(m) => m.timeout = timeout,
                Body::DescriptorQuery(m) => m.timeout = timeout,
                _ => {}
            }
        }
        Ok(body)
    }
}
impl PeerOutput {
    pub fn is_empty(&self) -> bool {
        self.control.is_empty() && self.business.is_empty()
    }
    pub async fn recv_queued(&mut self) -> Option<Queued> {
        tokio::select! {biased;v=self.control.recv()=>match v{Some(v)=>Some(v),None=>self.business.recv().await},v=self.business.recv()=>match v{Some(v)=>Some(v),None=>self.control.recv().await}}
    }
    pub fn try_recv_queued(&mut self) -> Result<Queued, mpsc::error::TryRecvError> {
        match self.control.try_recv() {
            Ok(v) => Ok(v),
            Err(mpsc::error::TryRecvError::Empty) => self.business.try_recv(),
            Err(mpsc::error::TryRecvError::Disconnected) => self.business.try_recv(),
        }
    }
    #[cfg(test)]
    pub fn try_recv(&mut self) -> Result<Body, mpsc::error::TryRecvError> {
        let mut q = self.try_recv_queued()?;
        Ok(q.body.take().unwrap())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn idle_includes_control_business_and_selected_writer_reservations() {
        let (send, mut output) = channel(OutputBudget::default());
        assert!(send.is_idle());
        for body in [
            Body::DataAck(pb::DataAck {
                message_id: vec![1; 16],
                stage: pb::AckStage::Processed as i32,
            }),
            Body::Metadata(pb::PeerMetadata::default()),
        ] {
            send.try_send(body).unwrap();
            assert!(!send.is_idle());
            let mut queued = output.recv_queued().await.unwrap();
            assert!(!send.is_idle(), "dequeue does not finish a pending write");
            let _body = queued.prepare().unwrap();
            assert!(
                !send.is_idle(),
                "reservation lasts through the selected write"
            );
            drop(queued);
            assert!(send.is_idle());
        }
    }
    fn data() -> Body {
        Body::Data(pb::DataMessage {
            timeout: Some(prost_types::Duration {
                seconds: 1,
                nanos: 0,
            }),
            fragment: Some(pb::PayloadFragment {
                protobuf_bytes: vec![0; 16384],
                ..Default::default()
            }),
            ..Default::default()
        })
    }
    #[tokio::test]
    async fn control_is_reserved_and_preempts_full_business_queue() {
        let (tx, mut rx) = channel(OutputBudget::default());
        for _ in 0..128 {
            tx.try_send(data()).unwrap();
        }
        assert!(tx.try_send(data()).is_err());
        tx.try_send(Body::Pong(pb::Pong { nonce: vec![1; 16] }))
            .unwrap();
        assert!(matches!(
            rx.recv_queued().await.unwrap().prepare(),
            Ok(Body::Pong(_))
        ));
    }
    #[tokio::test]
    async fn fragments_share_first_wire_timeout_and_cancel_fences_remaining_fragments() {
        let (tx, mut rx) = channel(OutputBudget::default());
        let deadline = Instant::now() + Duration::from_secs(3);
        let fragment = |offset| {
            Body::Data(pb::DataMessage {
                message_id: vec![1; 16],
                fragment: Some(pb::PayloadFragment {
                    offset,
                    total_size: 2,
                    protobuf_bytes: vec![1],
                    ..Default::default()
                }),
                ..Default::default()
            })
        };
        tx.try_send_with_deadline(fragment(0), deadline).unwrap();
        tx.try_send_with_deadline(fragment(1), deadline).unwrap();
        let first = rx.recv_queued().await.unwrap().prepare().unwrap();
        tokio::time::sleep(Duration::from_millis(2)).await;
        let second = rx.recv_queued().await.unwrap().prepare().unwrap();
        let (Body::Data(first), Body::Data(second)) = (first, second) else {
            panic!()
        };
        assert_eq!(first.timeout, second.timeout);
        tx.try_send_with_deadline(fragment(0), deadline).unwrap();
        tx.try_send(Body::DataCancel(pb::DataCancel {
            message_id: vec![1; 16],
        }))
        .unwrap();
        assert!(matches!(
            rx.recv_queued().await.unwrap().prepare(),
            Ok(Body::DataCancel(_))
        ));
        assert!(rx.recv_queued().await.unwrap().is_revoked());
    }
    #[tokio::test]
    async fn rpc_cancel_fences_queued_work_but_preserves_terminal_end() {
        let (tx, mut rx) = channel(OutputBudget::default());
        tx.try_send(Body::RpcChunk(pb::RpcChunk {
            call_id: vec![1; 16],
            ..Default::default()
        }))
        .unwrap();
        tx.try_send(Body::RpcEnd(pb::RpcEnd {
            call_id: vec![1; 16],
            ..Default::default()
        }))
        .unwrap();
        tx.try_send(Body::RpcCancel(pb::RpcCancel {
            call_id: vec![1; 16],
            ..Default::default()
        }))
        .unwrap();
        let mut cancel = rx.recv_queued().await.unwrap();
        assert!(matches!(cancel.prepare(), Ok(Body::RpcCancel(_))));
        let chunk = rx.recv_queued().await.unwrap();
        assert!(chunk.is_revoked());
        let mut end = rx.recv_queued().await.unwrap();
        assert!(!end.is_revoked());
        assert!(matches!(end.prepare(), Ok(Body::RpcEnd(_))));
    }
    #[tokio::test]
    async fn writer_drops_expired_output_and_releases_byte_reservations() {
        let global = OutputBudget::default();
        let (tx, mut rx) = channel(global.clone());
        tx.try_send_with_deadline(data(), Instant::now() - Duration::from_secs(1))
            .unwrap();
        assert!(rx.recv_queued().await.unwrap().prepare().is_err());
        assert_eq!(global.0.load(Ordering::Acquire), 0);
    }
}
