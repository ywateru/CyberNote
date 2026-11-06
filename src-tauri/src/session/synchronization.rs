//! Local quiet barrier. This state is deliberately separate from access Pending:
//! probe/prepare never suspend authorization or block the final registered save.
use super::*;
use crate::sync::model::{EntityKind, SyncApplyPlan};
use std::{
    collections::VecDeque,
    time::{Duration, Instant},
};
#[derive(Clone, Deserialize)]
#[serde(tag = "phase", rename_all = "camelCase", deny_unknown_fields)]
pub(crate) enum WindowReply {
    #[serde(rename_all = "camelCase")]
    Probe {
        operation_id: String,
        protected_note_ids: Vec<String>,
        blocked: bool,
    },
    #[serde(rename_all = "camelCase")]
    Prepare { operation_id: String, ready: bool },
}
impl WindowReply {
    fn operation(&self) -> &str {
        match self {
            Self::Probe { operation_id, .. } | Self::Prepare { operation_id, .. } => operation_id,
        }
    }
}
#[derive(Clone)]
pub(crate) struct Resolution {
    pub kind: EntityKind,
    pub entity_id: String,
    pub digest: String,
    pub keep_all: bool,
}
#[derive(Default)]
pub(super) struct QuietState {
    current: Option<Quiet>,
    completed: VecDeque<Terminal>,
    retry_after: Option<Instant>,
}
struct Terminal {
    id: String,
    participants: HashSet<String>,
    outcome: &'static str,
}
struct Quiet {
    id: String,
    epoch: u64,
    participants: HashSet<String>,
    replies: HashSet<String>,
    protected: HashSet<String>,
    phase: &'static str,
    aborted: bool,
    started: Instant,
    plan: Option<SyncApplyPlan>,
    resolution: Option<Resolution>,
}
impl Session {
    pub(crate) fn sync_session_id(&self) -> &str {
        &self.id
    }
    pub(crate) fn sync_check_window(
        &self,
        window: &str,
        live: &HashSet<String>,
        expected: &Token,
    ) -> Result<()> {
        if !live.contains(window) {
            return Err(denied("同步请求不属于文档窗口"));
        }
        self.check(expected, None)
    }
    pub(crate) fn sync_begin(
        &mut self,
        participants: HashSet<String>,
        resolution: Option<Resolution>,
    ) -> Result<Value> {
        if self.quiet.current.is_some()
            || self.pending.is_some()
            || participants.is_empty()
            || (resolution.is_none() && self.quiet.retry_after.is_some_and(|t| t > Instant::now()))
        {
            return Err(denied("同步正在等待安全应用时机"));
        }
        let id = Uuid::new_v4().to_string();
        self.quiet.current = Some(Quiet {
            id: id.clone(),
            epoch: self.epoch,
            participants,
            replies: HashSet::new(),
            protected: HashSet::new(),
            phase: "probe",
            aborted: false,
            started: Instant::now(),
            plan: None,
            resolution,
        });
        Ok(json!({"phase":"probe","operationId":id,"sessionId":self.id}))
    }
    pub(crate) fn sync_reply(
        &mut self,
        window: &str,
        reply: WindowReply,
        expected: &Token,
    ) -> Result<Value> {
        self.check(expected, None)?;
        let id = reply.operation();
        if let Some(t) = self.quiet.completed.iter().find(|t| t.id == id) {
            if !t.participants.contains(window) {
                return Err(denied("同步参与窗口无效"));
            }
            return Ok(json!({"operationId":id,"outcome":t.outcome}));
        }
        let q = self
            .quiet
            .current
            .as_mut()
            .ok_or_else(|| denied("同步操作已结束"))?;
        if q.id != id || !q.participants.contains(window) {
            return Err(denied("同步操作或参与窗口无效"));
        }
        if q.epoch != expected.epoch {
            q.aborted = true;
            return Err(denied("同步授权已变化"));
        }
        match reply {
            WindowReply::Probe {
                protected_note_ids,
                blocked,
                ..
            } if q.phase == "probe" => {
                if protected_note_ids.len() > 10_000
                    || protected_note_ids
                        .iter()
                        .any(|id| !crate::sync::model::valid_id(id))
                {
                    q.aborted = true;
                    return Err(denied("同步保护集合无效"));
                }
                if !q.replies.insert(window.into()) {
                    return Err(denied("重复的同步探测回复"));
                }
                q.protected.extend(protected_note_ids);
                q.aborted |= blocked;
            }
            WindowReply::Prepare { ready, .. } if q.phase == "prepare" => {
                // A participant may cancel after its ready ACK. The same Session
                // gate linearizes this cancellation against the Store commit.
                if ready && !q.replies.insert(window.into()) {
                    return Err(denied("重复的同步准备回复"));
                }
                if !ready {
                    q.aborted = true;
                }
            }
            _ => return Err(denied("同步回复阶段无效")),
        }
        Ok(json!({"operationId":q.id,"outcome":if q.aborted {"abort"} else {"pending"}}))
    }
    pub(crate) fn sync_terminal_outcome(&self, id: &str) -> Option<&'static str> {
        self.quiet
            .completed
            .iter()
            .find(|t| t.id == id)
            .map(|t| t.outcome)
    }
    pub(crate) fn sync_abort(&mut self) {
        if let Some(q) = &mut self.quiet.current {
            q.aborted = true;
        }
    }
    pub(crate) fn sync_tick(
        &mut self,
        live: &HashSet<String>,
    ) -> Result<Option<(Value, Option<Value>)>> {
        let Some(q) = self.quiet.current.as_ref() else {
            return Ok(None);
        };
        if q.aborted
            || q.epoch != self.epoch
            || q.participants != *live
            || self.pending.is_some()
            || q.started.elapsed() >= Duration::from_secs(5)
        {
            return self.sync_release("abort", None).map(Some);
        }
        if q.replies != q.participants {
            return Ok(None);
        }
        if q.phase == "probe" {
            let protected: Vec<_> = q.protected.iter().cloned().collect();
            let plan = self.store.sync_plan_apply(&protected)?;
            let mut targets = plan.targets.clone();
            if let Some(r) = &q.resolution {
                // Folder resolution can reparent descendants and restore orphan
                // projections; freeze the complete dependent note closure.
                targets.extend(match r.kind {
                    EntityKind::Note => vec![r.entity_id.clone()],
                    EntityKind::Folder => self.store.notes()?.into_iter().map(|n| n.id).collect(),
                });
                if targets.iter().any(|id| q.protected.contains(id)) {
                    return self.sync_release("abort", None).map(Some);
                }
            } else if plan.eligible_digests.is_empty() {
                return self.sync_release("abort", None).map(Some);
            }
            targets.sort();
            targets.dedup();
            let q = self.quiet.current.as_mut().unwrap();
            q.plan = Some(plan);
            q.phase = "prepare";
            q.replies.clear();
            q.started = Instant::now();
            return Ok(Some((
                json!({"phase":"prepare","operationId":q.id,"sessionId":self.id,"noteIds":targets}),
                None,
            )));
        }
        let q = self.quiet.current.as_ref().unwrap();
        let mut targets = q.plan.as_ref().unwrap().targets.clone();
        if let Some(r) = &q.resolution {
            targets.extend(match r.kind {
                EntityKind::Note => vec![r.entity_id.clone()],
                EntityKind::Folder => self.store.notes()?.into_iter().map(|n| n.id).collect(),
            });
        }
        if self.intents.values().any(|i| targets.contains(&i.note)) {
            return self.sync_release("abort", None).map(Some);
        }
        let plan = q.plan.clone().unwrap();
        let resolution = q.resolution.clone();
        // Flush/recompute under the same final gate as intents and participant
        // validation. A registered save during prepare makes generation stale.
        if self.store.sync_plan_apply(&plan.excluded_note_ids)? != plan {
            return self.sync_release("abort", None).map(Some);
        }
        let before = self
            .store
            .notes()?
            .into_iter()
            .map(|n| (n.id.clone(), (n.locked, n.deleted_at, n.sealed)))
            .collect::<HashMap<_, _>>();
        self.prepare_metadata(true)?;
        let result = self.apply_store(|store| {
            let report = if let Some(r) = resolution {
                store.sync_resolve(r.kind, &r.entity_id, &r.digest, r.keep_all)?
            } else {
                store.sync_apply_plan(&plan)?
            };
            Ok(serde_json::to_value(report)?)
        });
        if let Err(e) = result {
            if self.last_commit.is_none() {
                self.sync_abort();
                if e.code == "sync_plan_stale" {
                    return self.sync_release("abort", None).map(Some);
                };
                return Err(e);
            }
        }
        let after = self
            .store
            .notes()?
            .into_iter()
            .map(|n| (n.id.clone(), (n.locked, n.deleted_at, n.sealed)))
            .collect::<HashMap<_, _>>();
        let mut revoke = before
            .keys()
            .chain(after.keys())
            .filter(|id| match (before.get(*id), after.get(*id)) {
                (Some(a), Some(b)) => a != b,
                (Some(_), None) => true,
                (None, Some((locked, deleted, sealed))) => {
                    *locked || deleted.is_some() || sealed.is_some()
                }
                _ => false,
            })
            .cloned()
            .collect::<Vec<_>>();
        revoke.sort();
        revoke.dedup();
        let access = if revoke.is_empty() {
            None
        } else {
            self.store.revoke_keys(&revoke);
            self.intents.retain(|_, i| !revoke.contains(&i.note));
            self.bump(&revoke);
            Some(self.event("commit", "sync", &revoke)?)
        };
        self.sync_release("commit", access).map(Some)
    }
    fn sync_release(
        &mut self,
        outcome: &'static str,
        access: Option<Value>,
    ) -> Result<(Value, Option<Value>)> {
        let q = self
            .quiet
            .current
            .take()
            .ok_or_else(|| denied("同步操作已结束"))?;
        let event =
            json!({"phase":"release","operationId":q.id,"sessionId":self.id,"outcome":outcome});
        self.quiet.retry_after = if outcome == "abort" {
            Some(Instant::now() + Duration::from_secs(2))
        } else {
            None
        };
        self.quiet.completed.push_back(Terminal {
            id: q.id,
            participants: q.participants,
            outcome,
        });
        while self.quiet.completed.len() > 64 {
            self.quiet.completed.pop_front();
        }
        Ok((event, access))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn token(s: &Session) -> Token {
        Token {
            session_id: s.id.clone(),
            epoch: s.epoch,
            note_epoch: None,
        }
    }
    fn session() -> (tempfile::TempDir, Session) {
        let d = tempfile::tempdir().unwrap();
        let mut s = Session::new(Store::open(d.path()).unwrap());
        s.store.sync_enable(None).unwrap();
        (d, s)
    }
    fn begin(s: &mut Session) -> String {
        s.sync_begin(HashSet::from(["main".into()]), None).unwrap()["operationId"]
            .as_str()
            .unwrap()
            .into()
    }
    #[test]
    fn strict_replies_real_window_phase_token_and_cancellation_receipt() {
        let (_d, mut s) = session();
        let id = begin(&mut s);
        let t = token(&s);
        assert!(s.pending.is_none());
        assert!(serde_json::from_value::<WindowReply>(json!({"phase":"probe","operationId":id,"protectedNoteIds":[],"blocked":false,"private":"extra"})).is_err());
        let reply = || WindowReply::Probe {
            operation_id: id.clone(),
            protected_note_ids: vec![],
            blocked: false,
        };
        assert!(s.sync_reply("forged", reply(), &t).is_err());
        assert!(s
            .sync_reply(
                "main",
                WindowReply::Prepare {
                    operation_id: id.clone(),
                    ready: true
                },
                &t
            )
            .is_err());
        let mut stale = t.clone();
        stale.epoch += 1;
        assert!(s.sync_reply("main", reply(), &stale).is_err());
        s.sync_reply("main", reply(), &t).unwrap();
        assert_eq!(
            s.sync_tick(&HashSet::from(["main".into()]))
                .unwrap()
                .unwrap()
                .0["outcome"],
            "abort"
        );
        assert_eq!(
            s.sync_reply("main", reply(), &t).unwrap()["outcome"],
            "abort"
        );
        assert!(s.sync_reply("forged", reply(), &t).is_err());
    }
    fn incoming(s: &mut Session) -> String {
        let identity = s.store.sync_identity().unwrap().unwrap();
        // New independent real Store with the same workspace.
        let d = tempfile::tempdir().unwrap();
        let mut remote = Store::open(d.path()).unwrap();
        remote.sync_enable(Some(&identity.workspace_id)).unwrap();
        let id = remote.action(json!({"type":"createNote"})).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        remote.sync_flush().unwrap();
        let wire = remote
            .sync_inventory()
            .unwrap()
            .into_iter()
            .find(|v| v.entity_id == id)
            .map(|v| remote.sync_version(&v.digest).unwrap())
            .unwrap();
        s.store.sync_receive(vec![wire]).unwrap();
        id
    }
    fn prepare(s: &mut Session, id: &str) {
        let t = token(s);
        s.sync_reply(
            "main",
            WindowReply::Probe {
                operation_id: id.into(),
                protected_note_ids: vec![],
                blocked: false,
            },
            &t,
        )
        .unwrap();
        assert_eq!(
            s.sync_tick(&HashSet::from(["main".into()]))
                .unwrap()
                .unwrap()
                .0["phase"],
            "prepare"
        );
        assert!(s.pending.is_none());
    }
    #[test]
    fn ready_then_cancel_is_terminal_before_commit_and_inbox_survives() {
        let (_d, mut s) = session();
        let nid = incoming(&mut s);
        let id = begin(&mut s);
        prepare(&mut s, &id);
        let t = token(&s);
        s.sync_reply(
            "main",
            WindowReply::Prepare {
                operation_id: id.clone(),
                ready: true,
            },
            &t,
        )
        .unwrap();
        assert_eq!(
            s.sync_reply(
                "main",
                WindowReply::Prepare {
                    operation_id: id.clone(),
                    ready: false
                },
                &t
            )
            .unwrap()["outcome"],
            "abort"
        );
        assert_eq!(
            s.sync_tick(&HashSet::from(["main".into()]))
                .unwrap()
                .unwrap()
                .0["outcome"],
            "abort"
        );
        assert!(s.store.note(&nid).is_err());
        assert_eq!(s.store.sync_pending_count().unwrap(), 1);
    }
    #[test]
    fn participant_added_or_dirty_save_after_prepare_aborts_without_apply() {
        let (_d, mut s) = session();
        let nid = incoming(&mut s);
        let id = begin(&mut s);
        prepare(&mut s, &id);
        let t = token(&s);
        s.sync_reply(
            "main",
            WindowReply::Prepare {
                operation_id: id.clone(),
                ready: true,
            },
            &t,
        )
        .unwrap();
        assert_eq!(
            s.sync_tick(&HashSet::from(["main".into(), "note-new".into()]))
                .unwrap()
                .unwrap()
                .0["outcome"],
            "abort"
        );
        assert!(s.store.note(&nid).is_err());
        s.quiet.retry_after = None;
        let id = begin(&mut s);
        prepare(&mut s, &id);
        s.sync_reply(
            "main",
            WindowReply::Prepare {
                operation_id: id,
                ready: true,
            },
            &t,
        )
        .unwrap();
        s.store.action(json!({"type":"createNote"})).unwrap();
        assert_eq!(
            s.sync_tick(&HashSet::from(["main".into()]))
                .unwrap()
                .unwrap()
                .0["outcome"],
            "abort"
        );
        assert!(s.store.note(&nid).is_err());
    }
    #[test]
    fn normal_note_apply_has_actual_metadata_without_global_access_bump() {
        let (_d, mut s) = session();
        let nid = incoming(&mut s);
        let id = begin(&mut s);
        prepare(&mut s, &id);
        let t = token(&s);
        let epoch = s.epoch;
        s.sync_reply(
            "main",
            WindowReply::Prepare {
                operation_id: id.clone(),
                ready: true,
            },
            &t,
        )
        .unwrap();
        let (event, access) = s
            .sync_tick(&HashSet::from(["main".into()]))
            .unwrap()
            .unwrap();
        assert_eq!(event["outcome"], "commit");
        assert!(access.is_none());
        assert_eq!(s.epoch, epoch);
        assert!(s.store.note(&nid).is_ok());
        let metadata = s.take_metadata_event().unwrap();
        assert!(metadata["changes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|c| c["id"] == nid));
        assert_eq!(
            s.sync_reply(
                "main",
                WindowReply::Prepare {
                    operation_id: id,
                    ready: false
                },
                &t
            )
            .unwrap()["outcome"],
            "commit"
        );
    }
}

#[cfg(test)]
mod final_gate_tests {
    use super::*;
    fn token(s: &Session, note: Option<&str>) -> Token {
        Token {
            session_id: s.id.clone(),
            epoch: s.epoch,
            note_epoch: note.map(|id| s.note_epoch(id)),
        }
    }
    fn setup() -> (tempfile::TempDir, Session, Store, String) {
        let root = tempfile::tempdir().unwrap();
        let mut s = Session::new(Store::open(root.path().join("local")).unwrap());
        let id = s.store.action(json!({"type":"createNote"})).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        let identity = s.store.sync_enable(None).unwrap();
        let mut remote = Store::open(root.path().join("remote")).unwrap();
        remote.sync_enable(Some(&identity.workspace_id)).unwrap();
        for h in s.store.sync_inventory().unwrap() {
            remote
                .sync_receive(vec![s.store.sync_version(&h.digest).unwrap()])
                .unwrap();
        }
        remote.sync_apply_pending().unwrap();
        remote
            .action(json!({"type":"patchNote","id":id,"pinned":true}))
            .unwrap();
        remote.sync_flush().unwrap();
        for h in remote.sync_inventory().unwrap() {
            s.store
                .sync_receive(vec![remote.sync_version(&h.digest).unwrap()])
                .unwrap();
        }
        (root, s, remote, id)
    }
    fn prepared(s: &mut Session) -> String {
        let id = s.sync_begin(HashSet::from(["main".into()]), None).unwrap()["operationId"]
            .as_str()
            .unwrap()
            .to_string();
        let t = token(s, None);
        s.sync_reply(
            "main",
            WindowReply::Probe {
                operation_id: id.clone(),
                protected_note_ids: vec![],
                blocked: false,
            },
            &t,
        )
        .unwrap();
        assert_eq!(
            s.sync_tick(&HashSet::from(["main".into()]))
                .unwrap()
                .unwrap()
                .0["phase"],
            "prepare"
        );
        s.sync_reply(
            "main",
            WindowReply::Prepare {
                operation_id: id.clone(),
                ready: true,
            },
            &t,
        )
        .unwrap();
        id
    }
    #[test]
    fn final_gate_rechecks_registered_save_intents_and_preserves_authority_for_drain() {
        let (_root, mut s, _remote, id) = setup();
        prepared(&mut s);
        let t = token(&s, Some(&id));
        s.register_save("main", &id, "final-save", t.clone())
            .unwrap();
        assert!(s.pending.is_none());
        assert!(s.sensitive(&id, &t).is_ok());
        assert_eq!(
            s.sync_tick(&HashSet::from(["main".into()]))
                .unwrap()
                .unwrap()
                .0["outcome"],
            "abort"
        );
        assert!(!s.store.note(&id).unwrap().pinned);
        assert_eq!(s.store.sync_pending_count().unwrap(), 1);
    }
    #[test]
    fn access_barrier_and_timeout_abort_quiet_without_touching_business_rows() {
        let (_root, mut s, _remote, id) = setup();
        prepared(&mut s);
        let t = token(&s, None);
        let event = s
            .begin(
                json!({"type":"deleteNote","id":id}),
                HashSet::from(["main".into()]),
                &t,
            )
            .unwrap();
        assert_eq!(
            s.sync_tick(&HashSet::from(["main".into()]))
                .unwrap()
                .unwrap()
                .0["outcome"],
            "abort"
        );
        assert!(s.store.note(&id).unwrap().deleted_at.is_none());
        s.acknowledge(event["operationId"].as_str().unwrap(), "main", false)
            .unwrap();
        let _ = s
            .finish(
                event["operationId"].as_str().unwrap(),
                &HashSet::from(["main".into()]),
                false,
            )
            .unwrap();
        s.quiet.retry_after = None;
        prepared(&mut s);
        s.quiet.current.as_mut().unwrap().started = Instant::now() - Duration::from_secs(6);
        assert_eq!(
            s.sync_tick(&HashSet::from(["main".into()]))
                .unwrap()
                .unwrap()
                .0["outcome"],
            "abort"
        );
        assert!(!s.store.note(&id).unwrap().pinned);
    }
    #[test]
    fn changed_sealed_lock_delete_revoke_only_the_actual_target_note_epoch() {
        let (_root, mut s, mut remote, id) = setup();
        let other = s.store.action(json!({"type":"createNote"})).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        let before = token(&s, Some(&other));
        remote
            .action(json!({"type":"lockNote","id":id,"password":"synthetic"}))
            .unwrap();
        remote.sync_flush().unwrap();
        for h in remote.sync_inventory().unwrap() {
            s.store
                .sync_receive(vec![remote.sync_version(&h.digest).unwrap()])
                .unwrap();
        }
        prepared(&mut s);
        let (release, access) = s
            .sync_tick(&HashSet::from(["main".into()]))
            .unwrap()
            .unwrap();
        assert_eq!(release["outcome"], "commit");
        let access = access.unwrap();
        assert_eq!(access["noteIds"], json!([id]));
        assert!(s.check(&before, Some(&other)).is_ok());
        assert_eq!(s.note_epoch(&other), 0);
        assert!(s.note_epoch(&id) > 0);
        assert!(!s.store.authorized(&id).unwrap());
    }
}

#[cfg(test)]
mod unlocked_key_tests {
    use super::*;
    #[test]
    fn ordinary_remote_metadata_retains_unlocked_key_and_note_epoch() {
        let root = tempfile::tempdir().unwrap();
        let mut local = Store::open(root.path().join("local")).unwrap();
        let id = local.action(json!({"type":"createNote"})).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        local.action(json!({"type":"saveNote","id":id,"revision":0,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"sealed body"}]}]}})).unwrap();
        local
            .action(json!({"type":"lockNote","id":id,"password":"synthetic"}))
            .unwrap();
        let identity = local.sync_enable(None).unwrap();
        local
            .action(json!({"type":"unlockNote","id":id,"password":"synthetic"}))
            .unwrap();
        let mut remote = Store::open(root.path().join("remote")).unwrap();
        remote.sync_enable(Some(&identity.workspace_id)).unwrap();
        for h in local.sync_inventory().unwrap() {
            remote
                .sync_receive(vec![local.sync_version(&h.digest).unwrap()])
                .unwrap();
        }
        remote.sync_apply_pending().unwrap();
        remote
            .action(json!({"type":"patchNote","id":id,"pinned":true}))
            .unwrap();
        remote.sync_flush().unwrap();
        let mut s = Session::new(local);
        for h in remote.sync_inventory().unwrap() {
            s.store
                .sync_receive(vec![remote.sync_version(&h.digest).unwrap()])
                .unwrap();
        }
        let token = Token {
            session_id: s.id.clone(),
            epoch: s.epoch,
            note_epoch: None,
        };
        let participants = HashSet::from(["main".into()]);
        let operation = s.sync_begin(participants.clone(), None).unwrap()["operationId"]
            .as_str()
            .unwrap()
            .to_string();
        s.sync_reply(
            "main",
            WindowReply::Probe {
                operation_id: operation.clone(),
                protected_note_ids: vec![],
                blocked: false,
            },
            &token,
        )
        .unwrap();
        s.sync_tick(&participants).unwrap();
        s.sync_reply(
            "main",
            WindowReply::Prepare {
                operation_id: operation,
                ready: true,
            },
            &token,
        )
        .unwrap();
        let (release, access) = s.sync_tick(&participants).unwrap().unwrap();
        assert_eq!(release["outcome"], "commit");
        assert!(access.is_none());
        assert!(s.store.authorized(&id).unwrap());
        assert_eq!(s.note_epoch(&id), 0);
        assert_eq!(s.epoch, 1);
        assert_eq!(
            s.workspace().unwrap()["notes"][0]["plainText"],
            "sealed body"
        );
    }
}
