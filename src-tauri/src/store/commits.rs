//! Call-scoped public-fact receipts. Only explicit successful write boundaries mark these.
use super::*;

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CommitReceipt {
    pub changes: Vec<CommittedChange>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_id: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
pub(crate) struct CommittedChange {
    pub kind: &'static str,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revision: Option<i64>,
}
impl CommitReceipt {
    pub fn committed(&self) -> bool {
        !self.changes.is_empty()
    }
}
impl Store {
    pub(crate) fn capture_commit<T>(
        &mut self,
        operation: impl FnOnce(&mut Self) -> Result<T>,
    ) -> (Result<T>, CommitReceipt) {
        assert!(self.receipt.is_none(), "nested Store commit capture");
        self.receipt = Some(CommitReceipt::default());
        let result = operation(self);
        let receipt = self.receipt.take().unwrap();
        (result, receipt)
    }
    pub(super) fn committed(&mut self, kind: &'static str, id: &str, revision: Option<i64>) {
        if let Some(receipt) = &mut self.receipt {
            receipt.changes.push(CommittedChange {
                kind,
                id: id.into(),
                revision,
            });
        }
    }
    pub(super) fn created(&mut self, id: &str) {
        if let Some(receipt) = &mut self.receipt {
            receipt.created_id = Some(id.into());
        }
    }
}
