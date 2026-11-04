//! Process-owned authorization and the save/ACK boundary shared by real windows.
use crate::store::{AppError, AttachmentOwner, Result, Store};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet};
use uuid::Uuid;

fn denied(message: &str) -> AppError {
    AppError {
        code: "access_changed".into(),
        message: message.into(),
        commit: None,
    }
}

#[path = "session/metadata.rs"]
mod metadata;
#[cfg(test)]
#[path = "session/smart_tests.rs"]
mod smart_tests;
#[cfg(test)]
mod tests;
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Token {
    pub session_id: String,
    pub epoch: u64,
    pub note_epoch: Option<u64>,
}
#[derive(Clone)]
struct SaveIntent {
    window: String,
    note: String,
    token: Token,
}
pub struct Pending {
    pub id: String,
    pub targets: Vec<String>,
    participants: HashSet<String>,
    acknowledged: HashSet<String>,
    allowed_saves: HashSet<String>,
    pub failure: Option<String>,
    action: Value,
}
pub struct Session {
    pub store: Store,
    id: String,
    epoch: u64,
    note_epochs: HashMap<String, u64>,
    intents: HashMap<String, SaveIntent>,
    attachment_windows: HashMap<String, String>,
    pub pending: Option<Pending>,
    metadata_sequence: u64,
    metadata_event: Option<Value>,
    last_commit: Option<Value>,
}
impl Session {
    pub fn new(store: Store) -> Self {
        Self {
            store,
            id: Uuid::new_v4().to_string(),
            epoch: 1,
            note_epochs: HashMap::new(),
            intents: HashMap::new(),
            attachment_windows: HashMap::new(),
            pending: None,
            metadata_sequence: 0,
            metadata_event: None,
            last_commit: None,
        }
    }
    fn note_epoch(&self, id: &str) -> u64 {
        *self.note_epochs.get(id).unwrap_or(&0)
    }
    pub fn check(&self, token: &Token, note: Option<&str>) -> Result<()> {
        self.check_core(token, note)
    }
    fn check_core(&self, token: &Token, note: Option<&str>) -> Result<()> {
        if token.session_id != self.id
            || match note {
                Some(id) => token.note_epoch != Some(self.note_epoch(id)),
                None => token.epoch != self.epoch,
            }
        {
            return Err(denied("授权状态已改变，请同步后重试"));
        }
        Ok(())
    }
    pub fn snapshot(&self) -> Result<Value> {
        self.snapshot_core()
    }
    fn snapshot_core(&self) -> Result<Value> {
        let mut notes = BTreeMap::new();
        for n in self.store.notes()? {
            notes.insert(
                n.id.clone(),
                json!({"epoch":self.note_epoch(&n.id),"authorized":self.store.authorized(&n.id)?}),
            );
        }
        Ok(
            json!({"sessionId":self.id,"epoch":self.epoch,"notes":notes,"suspended":self.pending.as_ref().map(|p|p.targets.clone()).unwrap_or_default(),"operationId":self.pending.as_ref().map(|p|p.id.clone())}),
        )
    }
    pub fn tagged(&self, value: Value) -> Result<Value> {
        self.tagged_core(value)
    }
    fn tagged_core(&self, mut value: Value) -> Result<Value> {
        if let Some(pending) = &self.pending {
            let redact = |n: &mut Value| {
                if n["id"]
                    .as_str()
                    .is_some_and(|id| pending.targets.iter().any(|x| x == id))
                {
                    n["document"] =
                        json!({"type":"doc","content":[{"type":"heading","attrs":{"level":1}}]});
                    n["plainText"] = json!("");
                }
            };
            if let Some(notes) = value["notes"].as_array_mut() {
                for n in notes {
                    redact(n);
                }
            }
            if value.get("document").is_some() {
                redact(&mut value);
            }
        }
        value["access"] = self.snapshot_core()?;
        value["metadata"] = self.metadata();
        Ok(value)
    }
    pub fn workspace(&self) -> Result<Value> {
        self.tagged(self.store.workspace()?)
    }
    pub fn export_archive(&self, path: &std::path::Path, token: &Token) -> Result<()> {
        self.check(token, None)?;
        if self.pending.is_some() {
            return Err(AppError {
                code: "internal".into(),
                message: "锁定状态正在同步，请稍后导出".into(),
                commit: None,
            });
        }
        self.store.export_archive(path)
    }
    pub fn sensitive(&self, note: &str, token: &Token) -> Result<()> {
        self.check(token, Some(note))?;
        if self
            .pending
            .as_ref()
            .is_some_and(|p| p.targets.iter().any(|id| id == note))
        {
            return Err(denied("备忘录正在同步锁定状态，请稍候"));
        }
        if !self.store.authorized(note)? {
            return Err(denied("备忘录已锁定或删除，请重新解锁"));
        }
        Ok(())
    }
    fn attachment_owner(&mut self, window: &str) -> Result<AttachmentOwner> {
        if window.is_empty() || window.len() > 128 || window.chars().any(char::is_control) {
            return Err(denied("真实窗口身份无效"));
        }
        let incarnation = self
            .attachment_windows
            .entry(window.into())
            .or_insert_with(|| Uuid::new_v4().to_string())
            .clone();
        Ok(AttachmentOwner {
            session: self.id.clone(),
            window: window.into(),
            incarnation,
        })
    }
    pub fn forget_attachment_window(&mut self, window: &str) {
        self.attachment_windows.remove(window);
    }
    pub fn store_attachment_operation(
        &mut self,
        window: &str,
        operation: &str,
        note: &str,
        name: &str,
        mime: &str,
        bytes: &[u8],
        token: &Token,
        recorded_at: Option<u64>,
    ) -> Result<Value> {
        self.prepare_metadata(true)?;
        self.sensitive(note, token)?;
        let owner = self.attachment_owner(window)?;
        let result = self.apply_store(|store| {
            store.store_attachment_operation(
                operation,
                note,
                &owner,
                name,
                mime,
                bytes,
                recorded_at,
            )
        });
        self.finish_value(result)
    }
    pub fn query_attachment_operation(
        &mut self,
        window: &str,
        operation: &str,
        note: &str,
        token: &Token,
    ) -> Result<Value> {
        self.prepare_metadata(false)?;
        self.sensitive(note, token)?;
        let owner = self.attachment_owner(window)?;
        let value = self
            .store
            .query_attachment_operation(operation, note, &owner)?;
        self.tagged(value)
    }
    pub fn cancel_attachment_operation(
        &mut self,
        window: &str,
        operation: &str,
        note: &str,
        token: &Token,
    ) -> Result<Value> {
        self.prepare_metadata(true)?;
        self.sensitive(note, token)?;
        let owner = self.attachment_owner(window)?;
        // Every registered save from every real window is checked while the
        // caller holds the same Session/Store mutex as the cleanup decision.
        // Renderer pendingDocs that have not registered an intent are not
        // visible here: the frontend must roll back/drain before cancelling.
        let pending = self.intents.values().any(|intent| intent.note == note);
        let result = self.apply_store(|store| {
            if pending {
                store.defer_attachment_operation(operation, note, &owner, "save_pending")
            } else {
                store.cancel_attachment_operation(operation, note, &owner)
            }
        });
        self.finish_value(result)
    }
    pub fn register_save(
        &mut self,
        window: &str,
        note: &str,
        intent: &str,
        token: Token,
    ) -> Result<()> {
        self.prepare_metadata(true)?;
        self.sensitive(note, &token)?;
        if self.intents.len() >= 10000 || self.intents.contains_key(intent) {
            return Err(denied("保存请求无效或过多"));
        }
        self.intents.insert(
            intent.into(),
            SaveIntent {
                window: window.into(),
                note: note.into(),
                token,
            },
        );
        Ok(())
    }
    pub fn save(&mut self, window: &str, mut action: Value) -> Result<Value> {
        self.prepare_metadata(true)?;
        let id = action["id"]
            .as_str()
            .ok_or_else(|| denied("缺少笔记ID"))?
            .to_string();
        let intent = action["saveIntent"]
            .as_str()
            .ok_or_else(|| denied("缺少保存授权"))?
            .to_string();
        let permit = self
            .intents
            .get(&intent)
            .ok_or_else(|| denied("保存授权已失效"))?
            .clone();
        if permit.window != window || permit.note != id {
            return Err(denied("保存请求不属于当前窗口"));
        }
        self.intents.remove(&intent);
        self.check(&permit.token, Some(&id))?;
        if !self.store.authorized(&id)? {
            return Err(denied("备忘录已锁定或删除"));
        }
        if let Some(p) = &self.pending {
            if p.targets.contains(&id)
                && (!p.allowed_saves.contains(&intent) || p.acknowledged.contains(window))
            {
                return Err(denied("该保存不在锁定前的排空范围内"));
            }
        }
        action.as_object_mut().unwrap().remove("saveIntent");
        let result = self.apply_store(|store| store.action(action));
        match self.finish_value(result) {
            Ok(value) => Ok(value),
            Err(error) => {
                if let Some(p) = self.pending.as_mut() {
                    if p.targets.contains(&id) {
                        p.failure =
                            Some("锁定前的保存失败，锁定未执行；请保留窗口并重试保存".into());
                    }
                }
                Err(error)
            }
        }
    }
    pub fn requires_barrier(action: &Value) -> bool {
        matches!(
            action["type"].as_str(),
            Some(
                "lockNote"
                    | "removeLock"
                    | "closeLocks"
                    | "deleteNote"
                    | "purgeNote"
                    | "deleteFolder"
                    | "importArchive"
            )
        )
    }
    pub fn ordinary(&mut self, action: Value, token: &Token) -> Result<(Value, Option<Value>)> {
        if matches!(
            action["type"].as_str(),
            Some("createSmartFolder" | "updateSmartFolder" | "deleteSmartFolder")
        ) {
            return self.smart_action(action, token).map(|value| (value, None));
        }
        self.prepare_metadata(Self::changes_facts(&action))?;
        self.check(token, None)?;
        if self.pending.is_some() {
            return Err(denied("锁定状态正在同步，请稍候"));
        }
        if Self::requires_barrier(&action) {
            return Err(denied("此操作需要所有窗口确认保存"));
        }
        let unlock = action["type"] == "unlockNote";
        let id = action["id"].as_str().unwrap_or_default().to_string();
        if action["type"] == "recoverConflictCopy" {
            self.sensitive(&id, token)?;
        }
        let result = self.apply_store(|store| store.action(action));
        let value = self.finish_value(result)?;
        if !unlock {
            return Ok((value, None));
        }
        let event = if unlock {
            self.bump(std::slice::from_ref(&id));
            Some(self.event("commit", "unlock", &[id])?)
        } else {
            None
        };
        Ok((self.finish_value(Ok(value))?, event))
    }
    fn bump(&mut self, targets: &[String]) {
        self.epoch += 1;
        for id in targets {
            self.note_epochs.insert(id.clone(), self.epoch);
        }
    }
    pub fn event(&self, phase: &str, id: &str, targets: &[String]) -> Result<Value> {
        let mut participants: Vec<_> = self
            .pending
            .as_ref()
            .map(|p| p.participants.iter().cloned().collect())
            .unwrap_or_default();
        participants.sort();
        let access = match self.snapshot() {
            Ok(access) => access,
            Err(_) => {
                // If response reads fail after commit, publish a conservative access
                // boundary. Unknown/missing notes remain unauthorized until trusted read.
                let notes: BTreeMap<_, _> = self
                    .note_epochs
                    .iter()
                    .map(|(id, epoch)| (id.clone(), json!({"epoch":epoch,"authorized":false})))
                    .collect();
                json!({"sessionId":self.id,"epoch":self.epoch,"notes":notes,"suspended":[],"operationId":null})
            }
        };
        Ok(
            json!({"phase":phase,"operationId":id,"noteIds":targets,"participantWindows":participants,"access":access}),
        )
    }
    pub fn begin(
        &mut self,
        action: Value,
        participants: HashSet<String>,
        token: &Token,
    ) -> Result<Value> {
        self.prepare_metadata(Self::changes_facts(&action))?;
        self.check(token, None)?;
        if self.pending.is_some() {
            return Err(denied("已有锁定操作正在等待保存"));
        }
        if !Self::requires_barrier(&action) {
            return Err(denied("无效锁定操作"));
        }
        let op = action["type"].as_str().unwrap();
        if op == "importArchive" {
            let path = action["path"]
                .as_str()
                .ok_or_else(|| denied("缺少归档路径"))?;
            self.store.preflight_archive(std::path::Path::new(path))?;
        }
        let targets = match op {
            "lockNote" | "removeLock" | "deleteNote" | "purgeNote" => vec![action["id"]
                .as_str()
                .ok_or_else(|| denied("缺少笔记ID"))?
                .to_string()],
            "closeLocks" => self
                .store
                .notes()?
                .into_iter()
                .filter(|n| n.locked)
                .map(|n| n.id)
                .collect(),
            "deleteFolder" => self.store.folder_note_ids(
                action["id"]
                    .as_str()
                    .ok_or_else(|| denied("缺少文件夹ID"))?,
            )?,
            _ => self.store.notes()?.into_iter().map(|n| n.id).collect(),
        };
        let allowed_saves = self
            .intents
            .iter()
            .filter(|(_, v)| targets.contains(&v.note))
            .map(|(id, _)| id.clone())
            .collect();
        let id = Uuid::new_v4().to_string();
        self.pending = Some(Pending {
            id: id.clone(),
            targets: targets.clone(),
            participants,
            acknowledged: HashSet::new(),
            allowed_saves,
            failure: None,
            action,
        });
        self.event("prepare", &id, &targets)
    }
    pub fn acknowledge(&mut self, operation: &str, window: &str, success: bool) -> Result<()> {
        let p = self
            .pending
            .as_mut()
            .ok_or_else(|| denied("锁定操作已结束"))?;
        if p.id != operation || !p.participants.contains(window) {
            return Err(denied("锁定操作或参与窗口无效"));
        }
        let has_pending = self
            .intents
            .values()
            .any(|i| i.window == window && p.targets.contains(&i.note));
        if !success || has_pending {
            p.failure = Some("其他窗口仍有未确认保存的更改，锁定未执行".into());
        } else {
            p.acknowledged.insert(window.into());
        }
        Ok(())
    }
    pub fn ready(&self) -> bool {
        self.pending
            .as_ref()
            .is_some_and(|p| p.failure.is_some() || p.participants == p.acknowledged)
    }
    pub fn finish(
        &mut self,
        operation: &str,
        live_windows: &HashSet<String>,
        timeout: bool,
    ) -> Result<(Result<Value>, Value)> {
        if self.pending.as_ref().is_none_or(|p| p.id != operation) {
            return Err(denied("锁定操作已结束"));
        }
        let p = self.pending.take().unwrap();
        let failure = p.failure.or_else(|| {
            if timeout
                || !p.participants.is_subset(live_windows)
                || p.participants != p.acknowledged
            {
                Some("未收到所有窗口的保存确认，锁定未执行，请重试".into())
            } else {
                None
            }
        });
        if let Some(message) = failure {
            return Ok((
                Err(denied(&message)),
                self.event("abort", &p.id, &p.targets)?,
            ));
        }
        if let Err(error) = self.prepare_metadata(Self::changes_facts(&p.action)) {
            return Ok((Err(error), self.event("abort", &p.id, &p.targets)?));
        }
        let importing = p.action["type"] == "importArchive";
        let result = self.apply_store(|store| {
            if importing {
                let path = p.action["path"]
                    .as_str()
                    .ok_or_else(|| denied("缺少归档路径"))?;
                store.import_archive(std::path::Path::new(path))?;
                store.workspace()
            } else {
                store.action(p.action)
            }
        });
        if result.is_ok() || self.last_commit.is_some() {
            let mut targets = p.targets;
            // The receipt survives workspace/maintenance failures after import.
            if importing {
                if let Some(changes) = self
                    .last_commit
                    .as_ref()
                    .and_then(|c| c["receipt"]["changes"].as_array())
                {
                    for change in changes {
                        if change["kind"] == "note" {
                            if let Some(id) = change["id"].as_str() {
                                if !targets.iter().any(|target| target == id) {
                                    targets.push(id.into());
                                }
                            }
                        }
                    }
                }
            }
            self.bump(&targets);
            self.store.revoke_keys(&targets);
            self.intents.retain(|_, i| !targets.contains(&i.note));
            // Store.action may have read/decrypted a workspace before keys were
            // revoked. Never publish that pre-boundary body. Rebuild only after
            // the committed access transition, retaining its independent receipt.
            let result = result.and_then(|value| {
                let receipt = value["receipt"].clone();
                self.store.workspace().map(|mut workspace| {
                    workspace["receipt"] = receipt;
                    workspace
                })
            });
            Ok((
                self.finish_value(result),
                self.event("commit", &p.id, &targets)?,
            ))
        } else {
            Ok((result, self.event("abort", &p.id, &p.targets)?))
        }
    }
}
