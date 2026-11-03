//! Process-owned authorization and the save/ACK boundary shared by real windows.
use crate::store::{AppError, Result, Store};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet};
use uuid::Uuid;

fn denied(message: &str) -> AppError {
    AppError {
        code: "access_changed".into(),
        message: message.into(),
    }
}

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
    pub pending: Option<Pending>,
}
impl Session {
    pub fn new(store: Store) -> Self {
        Self {
            store,
            id: Uuid::new_v4().to_string(),
            epoch: 1,
            note_epochs: HashMap::new(),
            intents: HashMap::new(),
            pending: None,
        }
    }
    fn note_epoch(&self, id: &str) -> u64 {
        *self.note_epochs.get(id).unwrap_or(&0)
    }
    pub fn check(&self, token: &Token, note: Option<&str>) -> Result<()> {
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
    pub fn tagged(&self, mut value: Value) -> Result<Value> {
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
        value["access"] = self.snapshot()?;
        Ok(value)
    }
    pub fn workspace(&self) -> Result<Value> {
        self.tagged(self.store.workspace()?)
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
    pub fn register_save(
        &mut self,
        window: &str,
        note: &str,
        intent: &str,
        token: Token,
    ) -> Result<()> {
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
        match self.store.action(action) {
            Ok(value) => self.tagged(value),
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
        self.check(token, None)?;
        if self.pending.is_some() {
            return Err(denied("锁定状态正在同步，请稍候"));
        }
        if Self::requires_barrier(&action) {
            return Err(denied("此操作需要所有窗口确认保存"));
        }
        let unlock = action["type"] == "unlockNote";
        let id = action["id"].as_str().unwrap_or_default().to_string();
        let value = self.store.action(action)?;
        let event = if unlock {
            self.bump(std::slice::from_ref(&id));
            Some(self.event("commit", "unlock", &[id])?)
        } else {
            None
        };
        Ok((self.tagged(value)?, event))
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
        Ok(
            json!({"phase":phase,"operationId":id,"noteIds":targets,"participantWindows":participants,"access":self.snapshot()?}),
        )
    }
    pub fn begin(
        &mut self,
        action: Value,
        participants: HashSet<String>,
        token: &Token,
    ) -> Result<Value> {
        self.check(token, None)?;
        if self.pending.is_some() {
            return Err(denied("已有锁定操作正在等待保存"));
        }
        if !Self::requires_barrier(&action) {
            return Err(denied("无效锁定操作"));
        }
        let op = action["type"].as_str().unwrap();
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
        let importing = p.action["type"] == "importArchive";
        let result = if importing {
            let path = p.action["path"]
                .as_str()
                .ok_or_else(|| denied("缺少归档路径"))?;
            self.store
                .import_archive(std::path::Path::new(path))
                .and_then(|()| self.store.workspace())
        } else {
            self.store.action(p.action)
        };
        match result {
            Ok(_) => {
                let mut targets = p.targets;
                // Include newly imported IDs in the committed epoch boundary.
                for note in self.store.notes()? {
                    if importing && !targets.contains(&note.id) {
                        targets.push(note.id);
                    }
                }
                self.bump(&targets);
                self.store.revoke_keys(&targets);
                self.intents.retain(|_, i| !targets.contains(&i.note));
                Ok((self.workspace(), self.event("commit", &p.id, &targets)?))
            }
            Err(error) if error.code == "lock_committed" => {
                self.bump(&p.targets);
                self.store.revoke_keys(&p.targets);
                self.intents.retain(|_, i| !p.targets.contains(&i.note));
                Ok((Err(error), self.event("commit", &p.id, &p.targets)?))
            }
            Err(error) => Ok((Err(error), self.event("abort", &p.id, &p.targets)?)),
        }
    }
}
