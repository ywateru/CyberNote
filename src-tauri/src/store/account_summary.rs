//! Metadata-only projection: no Note deserialization, unlock or body projection.
use super::*;

pub(crate) struct AccountSummary {
    pub note_count: u64,
    pub last_note_updated_at: Option<u64>,
}
impl Store {
    pub(crate) fn account_summary(&self) -> Result<AccountSummary> {
        // notes contains only ordinary notes; folders/history are separate.
        // SQLite returns just aggregates, never document/plainText/sealed bytes.
        let (count, latest, invalid): (i64, Option<i64>, i64) = self.db.query_row(
            "SELECT count(*), max(json_extract(body,'$.updatedAt')),
             coalesce(sum(CASE WHEN json_type(body,'$.updatedAt') != 'integer'
                OR json_type(body,'$.updatedAt') IS NULL
                OR json_extract(body,'$.updatedAt') < 0
                OR json_extract(body,'$.updatedAt') > 9007199254740991
                THEN 1 ELSE 0 END),0)
             FROM notes WHERE json_extract(body,'$.deletedAt') IS NULL",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )?;
        if invalid != 0 || count < 0 || count > 9_007_199_254_740_991 {
            return Err(err("metadata_invalid", "设备摘要元数据无效"));
        }
        Ok(AccountSummary {
            note_count: count as u64,
            last_note_updated_at: latest.map(|n| n as u64),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn counts_locked_and_plain_but_not_trash_without_deserializing_documents() {
        let root = tempfile::tempdir().unwrap();
        let mut store = Store::open(root.path()).unwrap();
        assert_eq!(store.account_summary().unwrap().note_count, 0);
        assert!(store
            .account_summary()
            .unwrap()
            .last_note_updated_at
            .is_none());
        for (locked, deleted, updated) in
            [(false, None, 100), (true, None, 200), (false, Some(1), 900)]
        {
            let id = store.action(json!({"type":"createNote"})).unwrap()["id"]
                .as_str()
                .unwrap()
                .to_string();
            // Deliberately invalid document/sealed shapes prove summary does not
            // deserialize a Note or attempt decryption, even for locked records.
            store.db.execute("UPDATE notes SET body=?1 WHERE id=?2", params![
                json!({"locked":locked,"deletedAt":deleted,"updatedAt":updated,"document":false,"sealed":7}).to_string(), id
            ]).unwrap();
        }
        let summary = store.account_summary().unwrap();
        assert_eq!(summary.note_count, 2);
        assert_eq!(summary.last_note_updated_at, Some(200));
        for updated in [
            json!(-1),
            json!(9007199254740992_u64),
            json!("200"),
            Value::Null,
        ] {
            store.db.execute("UPDATE notes SET body=json_set(body,'$.updatedAt',json(?1)) WHERE json_extract(body,'$.deletedAt') IS NULL", [updated.to_string()]).unwrap();
            assert!(store.account_summary().is_err());
        }
    }
}
