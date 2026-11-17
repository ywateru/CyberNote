//! Desktop-owned tester sessions: window/token/host/grant bound, never arbitrary args.
pub mod process;
use self::process::{Failure, Process, Result, Tool};
use crate::{
    agent_desktop::Desktop,
    agent_host::{GrantInfo, HostSettings},
    session::Token,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::{
    collections::{HashMap, VecDeque},
    path::Path,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::{mpsc, oneshot, watch};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Start {
    pub connection_id: String,
    pub binary: String,
    pub workspace_id: String,
    pub grant_id: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Call {
    pub connection_id: String,
    pub tool: String,
    pub arguments: Map<String, Value>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Connected {
    pub connection_id: String,
    pub tools: Vec<Tool>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Called {
    pub result: Value,
    pub elapsed_ms: u64,
}
struct Request {
    tool: String,
    arguments: Map<String, Value>,
    reply: oneshot::Sender<Result<Called>>,
}
struct Connection {
    label: String,
    token: Token,
    stop: watch::Sender<bool>,
    done: watch::Receiver<bool>,
    requests: mpsc::Sender<Request>,
}
#[derive(Default)]
struct Slots {
    live: HashMap<String, Arc<Connection>>,
    stopped: VecDeque<String>,
}
#[derive(Default)]
pub struct Registry(Mutex<Slots>);
fn same_token(a: &Token, b: &Token) -> bool {
    a.session_id == b.session_id && a.epoch == b.epoch && a.note_epoch == b.note_epoch
}
fn grant<'a>(settings: &'a HostSettings, input: &Start) -> Result<&'a GrantInfo> {
    if !settings.enabled || settings.workspace_id != input.workspace_id {
        return Err(Failure::Authority);
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    settings
        .grants
        .iter()
        .find(|g| {
            g.grant_id == input.grant_id
                && !g.revoked
                && g.expires_at > now
                && g.workspace_id == settings.workspace_id
                && g.incarnation == settings.incarnation
        })
        .ok_or(Failure::Authority)
}
fn unchanged(initial: &HostSettings, current: &HostSettings, input: &Start) -> bool {
    initial.host_session_id == current.host_session_id
        && initial.incarnation == current.incarnation
        && matches!((grant(initial, input), grant(current, input)), (Ok(a), Ok(b)) if a.revocation == b.revocation && a.credential_ref == b.credential_ref && a.scopes == b.scopes && a.folder_ids == b.folder_ids)
}
impl Registry {
    fn reserve(
        &self,
        id: &str,
        label: &str,
        token: &Token,
    ) -> Result<(
        Arc<Connection>,
        mpsc::Receiver<Request>,
        watch::Sender<bool>,
    )> {
        if uuid::Uuid::parse_str(id).is_err() {
            return Err(Failure::Input);
        }
        let mut slots = self.0.lock().map_err(|_| Failure::Unavailable)?;
        if slots.live.len() >= 2
            || slots.live.contains_key(id)
            || slots.stopped.iter().any(|v| v == id)
            || slots.live.values().any(|c| c.label == label)
        {
            return Err(Failure::Busy);
        }
        let (stop, _) = watch::channel(false);
        let (done_tx, done) = watch::channel(false);
        let (requests, rx) = mpsc::channel(1);
        let connection = Arc::new(Connection {
            label: label.into(),
            token: token.clone(),
            stop,
            done,
            requests,
        });
        slots.live.insert(id.into(), connection.clone());
        Ok((connection, rx, done_tx))
    }
    fn own(&self, id: &str, label: &str, token: &Token) -> Result<Arc<Connection>> {
        self.0
            .lock()
            .map_err(|_| Failure::Unavailable)?
            .live
            .get(id)
            .filter(|c| c.label == label && same_token(&c.token, token) && !*c.stop.borrow())
            .cloned()
            .ok_or(Failure::Authority)
    }
    pub fn close_window(&self, label: &str) {
        if let Ok(slots) = self.0.lock() {
            for c in slots.live.values().filter(|c| c.label == label) {
                c.stop.send_replace(true);
            }
        }
    }
    pub async fn close_all(&self) {
        let live = self
            .0
            .lock()
            .map(|s| s.live.values().cloned().collect::<Vec<_>>())
            .unwrap_or_default();
        for c in &live {
            c.stop.send_replace(true);
        }
        for c in live {
            let mut done = c.done.clone();
            let _ = done.wait_for(|v| *v).await;
        }
    }
    pub async fn stop(&self, id: &str, label: &str, token: &Token) -> Result<()> {
        if uuid::Uuid::parse_str(id).is_err() {
            return Err(Failure::Input);
        }
        let connection = {
            let mut slots = self.0.lock().map_err(|_| Failure::Unavailable)?;
            if let Some(c) = slots.live.get(id) {
                if c.label != label || !same_token(&c.token, token) {
                    return Err(Failure::Authority);
                }
                c.stop.send_replace(true);
                Some(c.clone())
            } else {
                // A close can arrive before start is dispatched. Never resurrect its UUID.
                if slots.stopped.len() == 64 {
                    slots.stopped.pop_front();
                }
                slots.stopped.push_back(id.into());
                None
            }
        };
        if let Some(c) = connection {
            let mut done = c.done.clone();
            let _ = done.wait_for(|v| *v).await;
        }
        Ok(())
    }
    pub async fn start(
        self: &Arc<Self>,
        desktop: &Arc<Desktop>,
        input: Start,
        expected: Token,
        label: String,
    ) -> Result<Connected> {
        let (connection, mut requests, done) =
            self.reserve(&input.connection_id, &label, &expected)?;
        let registry = self.clone();
        let weak = Arc::downgrade(desktop);
        let (reply, response) = oneshot::channel();
        tokio::spawn(async move {
            let mut stop = connection.stop.subscribe();
            let mut process = None;
            let mut initial_reply = Some(reply);
            let run = async {
                let desktop = weak.upgrade().ok_or(Failure::Unavailable)?;
                let initial = desktop
                    .settings(&expected, &label)
                    .await
                    .map_err(|_| Failure::Authority)?;
                let selected = grant(&initial, &input)?;
                let args = vec![
                    "--workspace-id".into(),
                    initial.workspace_id.clone(),
                    "--credential-ref".into(),
                    selected.credential_ref.clone(),
                    "--runtime-dir".into(),
                    initial.runtime_dir.clone(),
                ];
                process = Some(Process::spawn(Path::new(&input.binary), &args)?);
                let p = process.as_mut().unwrap();
                let guard = async {
                    loop {
                        tokio::time::sleep(Duration::from_millis(250)).await;
                        let current = desktop
                            .settings(&expected, &label)
                            .await
                            .map_err(|_| Failure::Authority)?;
                        if !unchanged(&initial, &current, &input) {
                            return Err::<(), _>(Failure::Authority);
                        }
                    }
                };
                let work = async {
                    let tools = tokio::time::timeout(Duration::from_secs(12), p.initialize())
                        .await
                        .map_err(|_| Failure::Timeout)??;
                    let current = desktop
                        .settings(&expected, &label)
                        .await
                        .map_err(|_| Failure::Authority)?;
                    if !unchanged(&initial, &current, &input) {
                        return Err(Failure::Authority);
                    }
                    if initial_reply
                        .take()
                        .unwrap()
                        .send(Ok(Connected {
                            connection_id: input.connection_id.clone(),
                            tools: tools.clone(),
                        }))
                        .is_err()
                    {
                        return Err(Failure::Cancelled);
                    }
                    while let Some(request) = requests.recv().await {
                        let current = desktop
                            .settings(&expected, &label)
                            .await
                            .map_err(|_| Failure::Authority)?;
                        if !unchanged(&initial, &current, &input) {
                            return Err(Failure::Authority);
                        }
                        if !tools.iter().any(|t| t.name == request.tool) {
                            let _ = request.reply.send(Err(Failure::Input));
                            continue;
                        }
                        let started = std::time::Instant::now();
                        let deadline = if matches!(
                            request.tool.as_str(),
                            "notes_create" | "notes_append" | "notes_update"
                        ) {
                            22
                        } else {
                            7
                        };
                        let result = p
                            .request(
                                "tools/call",
                                json!({"name":request.tool,"arguments":request.arguments}),
                                Duration::from_secs(deadline),
                            )
                            .await;
                        let failed = result.is_err();
                        let current = desktop
                            .settings(&expected, &label)
                            .await
                            .map_err(|_| Failure::Authority)?;
                        if !unchanged(&initial, &current, &input) {
                            return Err(Failure::Authority);
                        }
                        let result = result.and_then(|value| {
                            if !value.is_object()
                                || !value.get("structuredContent").is_some_and(Value::is_object)
                                || value.get("isError").is_some_and(|v| !v.is_boolean())
                            {
                                return Err(Failure::Protocol);
                            }
                            Ok(Called {
                                result: value,
                                elapsed_ms: started.elapsed().as_millis() as u64,
                            })
                        });
                        let invalid = result.is_err();
                        let _ = request.reply.send(result);
                        if failed || invalid {
                            return Err(Failure::Protocol);
                        }
                    }
                    Ok(())
                };
                tokio::select! { biased; result = guard => result, result = work => result }
            };
            let outcome: Result<()> = tokio::select! {
                biased;
                _ = stop.wait_for(|v| *v) => Err(Failure::Cancelled),
                result = run => result,
            };
            if let Some(reply) = initial_reply {
                let _ = reply.send(Err(outcome.err().unwrap_or(Failure::Unavailable)));
            }
            // No raw child errors or stderr are ever returned.
            if let Some(p) = process.as_mut() {
                p.close().await;
            }
            if let Ok(mut slots) = registry.0.lock() {
                slots.live.remove(&input.connection_id);
            }
            done.send_replace(true);
        });
        response.await.unwrap_or(Err(Failure::Unavailable))
    }
    pub async fn call(&self, input: Call, expected: &Token, label: &str) -> Result<Called> {
        if input.tool.len() > 128
            || serde_json::to_vec(&input.arguments)
                .map_err(|_| Failure::Input)?
                .len()
                > process::MAX_FRAME - 512
        {
            return Err(Failure::Input);
        }
        let c = self.own(&input.connection_id, label, expected)?;
        let (reply, response) = oneshot::channel();
        c.requests
            .try_send(Request {
                tool: input.tool,
                arguments: input.arguments,
                reply,
            })
            .map_err(|_| Failure::Busy)?;
        let value = response.await.unwrap_or(Err(Failure::Cancelled))?;
        self.own(&input.connection_id, label, expected)?;
        Ok(value)
    }
}
