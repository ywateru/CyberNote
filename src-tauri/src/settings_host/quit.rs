//! Single-operation window receipts for an updater-owned install lease.
//! No callback itself exits the application or releases native admission.
use std::collections::HashSet;
pub(super) struct Quit {
    pub(super) id: String,
    pub(super) participants: HashSet<String>,
    sealed: HashSet<String>,
    saved: HashSet<String>,
    pub(super) failed: bool,
}
impl Quit {
    pub(super) fn new(id: String, participants: HashSet<String>) -> Self {
        Self {
            id,
            participants,
            sealed: HashSet::new(),
            saved: HashSet::new(),
            failed: false,
        }
    }
    pub(super) fn ready(&self, live: &HashSet<String>) -> bool {
        !self.failed
            && !self.participants.is_empty()
            && self.participants == *live
            && self.saved == self.participants
    }
    pub(super) fn acknowledge(
        &mut self,
        id: &str,
        window: &str,
        live: &HashSet<String>,
        sealed: bool,
        success: bool,
    ) -> Result<bool, &'static str> {
        if self.id != id
            || !self.participants.contains(window)
            || self.participants != *live
            || self.failed
        {
            return Err("退出确认已失效");
        }
        if !success {
            self.failed = true;
            return Ok(false);
        }
        if sealed {
            self.sealed.insert(window.into());
            return Ok(self.sealed == self.participants);
        }
        if self.sealed != self.participants {
            return Err("正文窗口尚未全部封存");
        }
        self.saved.insert(window.into());
        Ok(false)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn settings121_install_requires_all_seals_and_saves_and_rejects_late_receipts() {
        let live = HashSet::from(["main".into(), "note-fixture".into()]);
        let mut q = Quit::new("install-2".into(), live.clone());
        assert!(q
            .acknowledge("install-2", "main", &live, false, true)
            .is_err());
        assert!(q
            .acknowledge("install-1", "main", &live, true, true)
            .is_err());
        assert!(!q
            .acknowledge("install-2", "main", &live, true, true)
            .unwrap());
        assert!(!q.ready(&live));
        assert!(q
            .acknowledge("install-2", "note-fixture", &live, true, true)
            .unwrap());
        q.acknowledge("install-2", "main", &live, false, true)
            .unwrap();
        assert!(!q.ready(&live));
        q.acknowledge("install-2", "note-fixture", &live, false, true)
            .unwrap();
        assert!(q.ready(&live));
        assert!(!q.ready(&HashSet::from(["main".into()])));
        assert!(q
            .acknowledge(
                "install-2",
                "main",
                &HashSet::from(["main".into()]),
                false,
                true
            )
            .is_err());
        q.acknowledge("install-2", "main", &live, false, false)
            .unwrap();
        assert!(!q.ready(&live));
        assert!(q
            .acknowledge("install-2", "main", &live, false, true)
            .is_err());
    }
}
