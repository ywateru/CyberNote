use super::*;

const MAX_SEQUENCE: u64 = 9_007_199_254_740_991;
impl Session {
    pub(crate) fn metadata(&self) -> Value {
        json!({"sessionId":self.id,"sequence":self.metadata_sequence})
    }
    pub(super) fn prepare_metadata(&mut self, changes_facts: bool) -> Result<()> {
        if self.settings_exit {
            return Err(denied("更新安装已封存编辑，请等待退出或取消安装"));
        }
        self.metadata_event = None;
        self.last_commit = None;
        if changes_facts && self.metadata_sequence >= MAX_SEQUENCE {
            return Err(AppError {
                code: "metadata_overflow".into(),
                message: "本地会话变更序号已达上限，请重新启动应用后重试".into(),
                commit: None,
            });
        }
        Ok(())
    }
    pub(super) fn changes_facts(action: &Value) -> bool {
        !matches!(
            action["type"].as_str(),
            Some("settings" | "unlockNote" | "closeLocks")
        )
    }
    pub(super) fn apply_store(
        &mut self,
        operation: impl FnOnce(&mut Store) -> Result<Value>,
    ) -> Result<Value> {
        let (mut result, receipt) = self.store.capture_commit(operation);
        if receipt.committed() {
            // Capacity was checked before any Store/file/intent mutation.
            self.metadata_sequence += 1;
            self.last_commit = Some(json!({"metadata":self.metadata(),"receipt":receipt}));
            self.metadata_event =
                Some(json!({"metadata":self.metadata(),"changes":receipt.changes}));
        }
        if let Ok(value) = &mut result {
            value["receipt"] = json!(receipt);
        }
        result
    }
    pub(super) fn finish_value(&self, result: Result<Value>) -> Result<Value> {
        result
            .and_then(|value| self.tagged(value))
            .map_err(|mut error| {
                error.commit = self.last_commit.clone();
                error
            })
    }
    pub(crate) fn take_metadata_event(&mut self) -> Option<Value> {
        self.metadata_event.take()
    }
    pub(crate) fn store_attachment(
        &mut self,
        note: &str,
        name: &str,
        mime: &str,
        bytes: Vec<u8>,
        token: &Token,
    ) -> Result<Value> {
        self.prepare_metadata(true)?;
        self.sensitive(note, token)?;
        self.external_local_write(note);
        let result = self.apply_store(|store| {
            Ok(serde_json::to_value(
                store.store_attachment(note, name, mime, bytes)?,
            )?)
        });
        self.finish_value(result)
    }
    /// Production smart actions share the ordinary Session metadata/access boundary.
    pub(crate) fn smart_action(&mut self, action: Value, token: &Token) -> Result<Value> {
        self.prepare_metadata(true)?;
        self.check_core(token, None)?;
        if self.pending.is_some() {
            return Err(denied("锁定状态正在同步，请稍候"));
        }
        let result = self.apply_store(|store| match action["type"].as_str() {
            Some("createSmartFolder") => {
                Ok(json!(store.create_smart_folder(action["input"].clone())?))
            }
            Some("updateSmartFolder") => {
                Ok(json!(store.update_smart_folder(action["input"].clone())?))
            }
            Some("deleteSmartFolder") => {
                store.delete_smart_folder(action["input"].clone())?;
                Ok(json!({}))
            }
            _ => Err(denied("无效智能文件夹操作")),
        });
        result
            .and_then(|value| self.tagged_core(value))
            .map_err(|mut error| {
                error.commit = self.last_commit.clone();
                error
            })
    }
    #[cfg(test)]
    pub(crate) fn smart_projection(&self, id: &str, token: &Token) -> Result<Value> {
        self.check_core(token, None)?;
        if self.pending.is_some() {
            return Err(denied("锁定状态正在同步，请稍候"));
        }
        let members = self.store.evaluate_smart_folder(id, &HashSet::new())?;
        self.tagged_core(json!({"definitionRevision":members.definition_revision,"count":members.ids.len(),"ids":members.ids}))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn token(session: &Session, note: Option<&str>) -> Token {
        Token {
            session_id: session.id.clone(),
            epoch: session.epoch,
            note_epoch: note.map(|id| session.note_epoch(id)),
        }
    }
    fn note(session: &mut Session) -> String {
        let token = token(session, None);
        session
            .ordinary(json!({"type":"createNote"}), &token)
            .unwrap()
            .0["id"]
            .as_str()
            .unwrap()
            .into()
    }
    #[test]
    fn actual_receipts_sequence_noops_and_event_privacy() {
        let temp = tempfile::tempdir().unwrap();
        let mut session = Session::new(Store::open(temp.path()).unwrap());
        let id = note(&mut session);
        assert_eq!(session.metadata()["sequence"], 1);
        let event = session.take_metadata_event().unwrap();
        assert_eq!(
            event
                .as_object()
                .unwrap()
                .keys()
                .cloned()
                .collect::<HashSet<_>>(),
            HashSet::from(["metadata".into(), "changes".into()])
        );
        assert_eq!(event["changes"][0]["id"], id);
        assert!(session.take_metadata_event().is_none());
        let t = token(&session, None);
        let folder = session
            .ordinary(
                json!({"type":"createFolder","name":"PRIVATE name #秘密"}),
                &t,
            )
            .unwrap()
            .0;
        assert_eq!(folder["receipt"]["createdId"], folder["id"]);
        assert_eq!(folder["metadata"]["sequence"], 2);
        assert!(!session
            .take_metadata_event()
            .unwrap()
            .to_string()
            .contains("PRIVATE"));
        session
            .ordinary(
                json!({"type":"renameFolder","id":folder["id"],"name":"PRIVATE name #秘密"}),
                &t,
            )
            .unwrap();
        assert_eq!(session.metadata()["sequence"], 2);
        assert!(session.take_metadata_event().is_none());
        session
            .ordinary(
                json!({"type":"settings","settings":{"selectedNote":id}}),
                &t,
            )
            .unwrap();
        assert_eq!(session.metadata()["sequence"], 2);
        assert!(session
            .ordinary(json!({"type":"createFolder","name":""}), &t)
            .is_err());
        assert!(session.take_metadata_event().is_none());
        drop(session);
        let restarted = Session::new(Store::open(temp.path()).unwrap());
        assert_eq!(restarted.metadata()["sequence"], 0);
        assert_ne!(restarted.id, t.session_id);
        assert!(restarted.check(&t, None).is_err());
    }
    #[test]
    fn two_window_smart_cas_projection_and_public_workspace() {
        let temp = tempfile::tempdir().unwrap();
        let mut session = Session::new(Store::open(temp.path()).unwrap());
        let id = note(&mut session);
        let a = token(&session, None);
        session
            .ordinary(json!({"type":"patchNote","id":id,"pinned":true}), &a)
            .unwrap();
        let b = a.clone();
        let query = json!({"version":1,"combine":"all","rules":[{"type":"pinned","value":true}]});
        let folder = session
            .smart_action(
                json!({"type":"createSmartFolder","input":{"name":"PRIVATE smart","query":query}}),
                &a,
            )
            .unwrap();
        let fid = folder["id"].as_str().unwrap();
        let before = session.metadata_sequence;
        session.smart_action(json!({"type":"updateSmartFolder","input":{"id":fid,"name":"winner","query":query,"expectedDefinitionRevision":1}}), &a).unwrap();
        assert_eq!(session.metadata_sequence, before + 1);
        let loser = session.smart_action(json!({"type":"updateSmartFolder","input":{"id":fid,"name":"loser","query":query,"expectedDefinitionRevision":1}}), &b).unwrap_err();
        assert_eq!(loser.code, "smart_conflict");
        assert_eq!(session.metadata_sequence, before + 1);
        assert!(session.take_metadata_event().is_none());
        let projection = session.smart_projection(fid, &a).unwrap();
        assert_eq!(projection["definitionRevision"], 2);
        assert_eq!(projection["ids"], json!([id]));
        assert_eq!(projection["count"], 1);
        assert_eq!(projection["metadata"], session.metadata());
        assert!(session.workspace().unwrap()["folders"]
            .as_array()
            .unwrap()
            .iter()
            .any(|f| f["id"] == fid));
        assert!(session.ordinary(json!({"type":"createNote"}), &a).is_ok());
    }
    #[test]
    fn safe_integer_overflow_precedes_intents_files_and_public_writes() {
        let temp = tempfile::tempdir().unwrap();
        let mut session = Session::new(Store::open(temp.path()).unwrap());
        let id = note(&mut session);
        let t = token(&session, Some(&id));
        session
            .register_save("main", &id, "held", t.clone())
            .unwrap();
        session.metadata_sequence = MAX_SEQUENCE;
        let before = session.workspace().unwrap();
        let save = json!({"type":"saveNote","id":id,"saveIntent":"held","revision":0,"document":{"type":"doc","content":[]}});
        assert_eq!(
            session.save("main", save).unwrap_err().code,
            "metadata_overflow"
        );
        assert!(session.intents.contains_key("held"));
        assert_eq!(
            session
                .register_save("main", &id, "new", t.clone())
                .unwrap_err()
                .code,
            "metadata_overflow"
        );
        assert!(!session.intents.contains_key("new"));
        assert_eq!(
            session
                .store_attachment_operation(
                    "main",
                    &Uuid::new_v4().to_string(),
                    &id,
                    "kept",
                    "text/plain",
                    b"bytes",
                    &t,
                    None
                )
                .unwrap_err()
                .code,
            "metadata_overflow"
        );
        assert!(session.attachment_windows.is_empty());
        assert_eq!(
            std::fs::read_dir(temp.path().join("attachments"))
                .unwrap()
                .count(),
            0
        );
        assert_eq!(session.workspace().unwrap(), before);
        assert_eq!(session.metadata_sequence, MAX_SEQUENCE);
        assert!(session.take_metadata_event().is_none());
    }
    #[test]
    fn attachment_public_insert_cancel_and_idempotent_journal_confirmations() {
        let temp = tempfile::tempdir().unwrap();
        let mut session = Session::new(Store::open(temp.path()).unwrap());
        let id = note(&mut session);
        let t = token(&session, Some(&id));
        let op = Uuid::new_v4().to_string();
        let stored = session
            .store_attachment_operation(
                "main",
                &op,
                &id,
                "PRIVATE.txt",
                "text/plain",
                b"PRIVATE bytes",
                &t,
                None,
            )
            .unwrap();
        assert_eq!(stored["metadata"]["sequence"], 2);
        assert!(!session
            .take_metadata_event()
            .unwrap()
            .to_string()
            .contains("PRIVATE"));
        session
            .store_attachment_operation(
                "main",
                &op,
                &id,
                "PRIVATE.txt",
                "text/plain",
                b"PRIVATE bytes",
                &t,
                None,
            )
            .unwrap();
        assert_eq!(session.metadata_sequence, 2);
        session
            .query_attachment_operation("main", &op, &id, &t)
            .unwrap();
        assert!(session.take_metadata_event().is_none());
        session
            .cancel_attachment_operation("main", &op, &id, &t)
            .unwrap();
        assert_eq!(session.metadata_sequence, 3);
        session
            .cancel_attachment_operation("main", &op, &id, &t)
            .unwrap();
        assert_eq!(session.metadata_sequence, 3);
        assert!(session.take_metadata_event().is_none());
    }
    #[test]
    fn draining_last_sequence_aborts_barrier_before_its_commit() {
        let temp = tempfile::tempdir().unwrap();
        let mut session = Session::new(Store::open(temp.path()).unwrap());
        let id = note(&mut session);
        let t = token(&session, Some(&id));
        session.metadata_sequence = MAX_SEQUENCE - 1;
        session
            .register_save("main", &id, "drain-last", t.clone())
            .unwrap();
        let prepare = session
            .begin(json!({"type":"deleteNote","id":id}), HashSet::new(), &t)
            .unwrap();
        session.save("main",json!({"type":"saveNote","id":id,"saveIntent":"drain-last","revision":0,"document":{"type":"doc","content":[{"type":"paragraph"}]}})).unwrap();
        assert_eq!(
            session.take_metadata_event().unwrap()["metadata"]["sequence"],
            MAX_SEQUENCE
        );
        let (result, event) = session
            .finish(
                prepare["operationId"].as_str().unwrap(),
                &HashSet::new(),
                false,
            )
            .unwrap();
        assert_eq!(result.unwrap_err().code, "metadata_overflow");
        assert_eq!(event["phase"], "abort");
        assert!(session.pending.is_none());
        assert!(session.store.note(&id).unwrap().deleted_at.is_none());
        assert_eq!(session.store.note(&id).unwrap().revision, 1);
        assert!(session.take_metadata_event().is_none());
    }
}
