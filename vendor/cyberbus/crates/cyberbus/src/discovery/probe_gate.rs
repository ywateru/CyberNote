//! Probe admission and task ownership have different lifetimes. The JoinSet
//! remains the owner; only the runtime's successful business promotion releases
//! probe admission. Keep metadata until promotion or task completion, once.
use crate::session::BusinessFlag;
use std::{collections::BTreeMap, sync::atomic::Ordering};
use tokio::task::{AbortHandle, Id};

struct Entry<M> {
    business: BusinessFlag,
    pending: Option<M>,
}
pub(crate) struct ProbeGate<M> {
    limit: usize,
    entries: BTreeMap<Id, Entry<M>>,
}
impl<M> ProbeGate<M> {
    pub(crate) fn new(limit: usize) -> Self {
        Self {
            limit,
            entries: BTreeMap::new(),
        }
    }
    pub(crate) fn used(&self) -> usize {
        self.entries
            .values()
            .filter(|e| !e.business.load(Ordering::Acquire))
            .count()
    }
    pub(crate) fn available(&self) -> bool {
        self.used() < self.limit
    }
    pub(crate) fn insert(&mut self, task: &AbortHandle, business: BusinessFlag, metadata: M) {
        assert!(self.available(), "probe admission must precede spawn");
        assert!(self
            .entries
            .insert(
                task.id(),
                Entry {
                    business,
                    pending: Some(metadata)
                }
            )
            .is_none());
    }
    pub(crate) fn promoted(&mut self) -> Vec<M> {
        self.entries
            .values_mut()
            .filter_map(|e| {
                if e.business.load(Ordering::Acquire) {
                    e.pending.take()
                } else {
                    None
                }
            })
            .collect()
    }
    pub(crate) fn finished(&mut self, id: Id) -> Option<(M, bool)> {
        let e = self.entries.remove(&id)?;
        e.pending.map(|m| (m, e.business.load(Ordering::Acquire)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn promotion_completion_abort_and_panic_release_once_without_detaching_owners() {
        let mut owners = tokio::task::JoinSet::new();
        let mut gate = ProbeGate::new(2);
        let flag: BusinessFlag = Default::default();
        let task = owners.spawn(std::future::pending::<()>());
        gate.insert(&task, flag.clone(), 1);
        let failed = owners.spawn(async { panic!("controlled fixture panic") });
        gate.insert(&failed, Default::default(), 2);
        assert!(!gate.available());
        flag.store(true, Ordering::Release);
        assert_eq!(gate.used(), 1);
        assert_eq!(gate.promoted(), vec![1]);
        assert!(gate.promoted().is_empty());
        assert_eq!(owners.len(), 2, "promotion must not detach/abort the owner");
        let panic = owners.join_next_with_id().await.unwrap().unwrap_err();
        assert!(panic.is_panic());
        assert_eq!(gate.finished(panic.id()), Some((2, false)));
        assert_eq!(gate.used(), 0);
        task.abort();
        let cancelled = owners.join_next_with_id().await.unwrap().unwrap_err();
        assert!(cancelled.is_cancelled());
        assert_eq!(
            gate.finished(cancelled.id()),
            None,
            "already settled promotion"
        );
        assert_eq!(gate.finished(cancelled.id()), None);
        assert!(gate.entries.is_empty());
        assert!(owners.is_empty());
    }
}
