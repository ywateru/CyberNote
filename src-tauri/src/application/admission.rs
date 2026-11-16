//! Request admission happens before acquiring Session: never wait on this gate
//! while holding the database mutex. agent_host retains one instance per host.
use super::*;
use std::{
    collections::VecDeque,
    sync::{Arc, Condvar, Mutex},
    time::Instant,
};
#[derive(Default)]
struct State {
    reads: HashMap<String, usize>,
    writer: bool,
    queue: VecDeque<(String, String)>,
}
#[derive(Clone, Default)]
pub struct RequestLimits(Arc<(Mutex<State>, Condvar)>);
pub struct RequestPermit {
    limits: RequestLimits,
    client: String,
    write: bool,
}
impl RequestLimits {
    pub fn read(&self, context: &TrustedContext) -> ToolResult<RequestPermit> {
        let mut state = self.0 .0.lock().map_err(ToolError::storage)?;
        if state.reads.len() >= 1024 && !state.reads.contains_key(&context.client_id)
            || state.reads.get(&context.client_id).copied().unwrap_or(0) >= 4
        {
            return Err(ToolError::new(
                "RATE_LIMITED",
                "Client read concurrency exceeded",
            ));
        }
        *state.reads.entry(context.client_id.clone()).or_default() += 1;
        Ok(RequestPermit {
            limits: self.clone(),
            client: context.client_id.clone(),
            write: false,
        })
    }
    pub fn write(&self, context: &TrustedContext, deadline: Instant) -> ToolResult<RequestPermit> {
        self.write_cancellable(context, deadline, || false)
    }
    pub fn write_cancellable(
        &self,
        context: &TrustedContext,
        deadline: Instant,
        cancelled: impl Fn() -> bool,
    ) -> ToolResult<RequestPermit> {
        let mut state = self.0 .0.lock().map_err(ToolError::storage)?;
        if state.queue.len() >= 1024
            || state
                .queue
                .iter()
                .filter(|(_, c)| c == &context.client_id)
                .count()
                >= 8
        {
            return Err(ToolError::new(
                "RATE_LIMITED",
                "Client write queue exceeded",
            ));
        }
        let ticket = Uuid::new_v4().to_string();
        state
            .queue
            .push_back((ticket.clone(), context.client_id.clone()));
        loop {
            let authority = context.check(&context.workspace_id, &context.incarnation, None);
            if Instant::now() >= deadline || cancelled() || authority.is_err() {
                state.queue.retain(|(id, _)| id != &ticket);
                self.0 .1.notify_all();
                authority?;
                return Err(ToolError::new(
                    "TIMEOUT",
                    "Write admission deadline exceeded",
                ));
            }
            // Atomic revocation is checked again at service entry and commit.
            if !state.writer && state.queue.front().is_some_and(|(id, _)| id == &ticket) {
                state.queue.pop_front();
                state.writer = true;
                return Ok(RequestPermit {
                    limits: self.clone(),
                    client: context.client_id.clone(),
                    write: true,
                });
            }
            let (next, _) = self
                .0
                 .1
                .wait_timeout(
                    state,
                    deadline
                        .saturating_duration_since(Instant::now())
                        .min(std::time::Duration::from_millis(20)),
                )
                .map_err(ToolError::storage)?;
            state = next;
        }
    }
}
impl Drop for RequestPermit {
    fn drop(&mut self) {
        if let Ok(mut state) = self.limits.0 .0.lock() {
            if self.write {
                state.writer = false;
            } else if let Some(n) = state.reads.get_mut(&self.client) {
                *n -= 1;
                if *n == 0 {
                    state.reads.remove(&self.client);
                }
            }
            self.limits.0 .1.notify_all();
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn read_limit_and_write_deadline_release_real_waiters() {
        let (_, _, c, _) = super::super::tests::setup();
        let limits = RequestLimits::default();
        let permits: Vec<_> = (0..4).map(|_| limits.read(&c).unwrap()).collect();
        assert!(matches!(limits.read(&c),Err(e) if e.code=="RATE_LIMITED"));
        drop(permits);
        assert!(limits.read(&c).is_ok());
        let first = limits
            .write(&c, Instant::now() + std::time::Duration::from_secs(1))
            .unwrap();
        let gate = limits.clone();
        let waiter_context = c.clone();
        let waiter = std::thread::spawn(move || {
            gate.write(
                &waiter_context,
                Instant::now() + std::time::Duration::from_millis(20),
            )
            .err()
            .unwrap()
            .code
        });
        assert_eq!(waiter.join().unwrap(), "TIMEOUT");
        drop(first);
        assert!(limits
            .write(&c, Instant::now() + std::time::Duration::from_secs(1))
            .is_ok());
    }
}
