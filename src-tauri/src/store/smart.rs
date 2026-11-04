//! Durable smart definitions. Membership is derived from a single read snapshot.
use super::*;
use std::collections::HashSet;

const MAX_REVISION: u64 = 9_007_199_254_740_991;
const MAX_QUERY_BYTES: usize = 64 * 1024;

#[cfg(test)]
#[path = "smart_tests.rs"]
mod tests;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Combine {
    All,
    Any,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum TagMode {
    AllSelected,
    AnySelected,
    AnyTag,
    NoTags,
}
fn names<'de, D: serde::Deserializer<'de>>(
    de: D,
) -> std::result::Result<Option<Vec<String>>, D::Error> {
    // Missing is allowed for presence modes; an explicit null is never allowed.
    Vec::<String>::deserialize(de).map(Some)
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
enum Rule {
    Tags {
        mode: TagMode,
        #[serde(
            default,
            deserialize_with = "names",
            skip_serializing_if = "Option::is_none"
        )]
        names: Option<Vec<String>>,
    },
    Pinned {
        value: bool,
    },
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(try_from = "QueryRecord")]
pub(crate) struct SmartQuery {
    version: u32,
    combine: Combine,
    rules: Vec<Rule>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct QueryRecord {
    version: u32,
    combine: Combine,
    rules: Vec<Rule>,
}
impl TryFrom<QueryRecord> for SmartQuery {
    type Error = &'static str;
    fn try_from(raw: QueryRecord) -> std::result::Result<Self, Self::Error> {
        if raw.version != 1 || raw.rules.is_empty() || raw.rules.len() > 2 {
            return Err("智能规则版本或数量无效");
        }
        let mut seen = HashSet::new();
        for rule in &raw.rules {
            let kind = match rule {
                Rule::Pinned { .. } => "pinned",
                Rule::Tags { mode, names } => {
                    match mode {
                        TagMode::AllSelected | TagMode::AnySelected => {
                            let list = names.as_ref().ok_or("已选标签缺失")?;
                            let unique: HashSet<_> = list.iter().collect();
                            if list.is_empty()
                                || list.len() > 128
                                || unique.len() != list.len()
                                || list.iter().any(|n| !archive::valid_tag_name(n))
                            {
                                return Err("已选标签无效");
                            }
                        }
                        TagMode::AnyTag | TagMode::NoTags if names.is_some() => {
                            return Err("此标签模式不能带名称")
                        }
                        _ => {}
                    }
                    "tags"
                }
            };
            if !seen.insert(kind) {
                return Err("智能规则类型重复");
            }
        }
        let query = Self {
            version: raw.version,
            combine: raw.combine,
            rules: raw.rules,
        };
        if serde_json::to_vec(&query)
            .map_err(|_| "智能规则无法编码")?
            .len()
            > MAX_QUERY_BYTES
        {
            return Err("智能规则超过64KiB");
        }
        Ok(query)
    }
}

// Each branch has its own closed field set. In particular, physical null query
// or revision fields cannot be mistaken for omitted optional fields.
#[derive(Deserialize)]
#[serde(untagged)]
pub(super) enum FolderRecord {
    Physical(PhysicalFolder),
    Smart(SmartFolder),
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct PhysicalFolder {
    id: String,
    name: String,
    parent_id: Option<String>,
    kind: String,
    sort_order: i64,
    created_at: i64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct SmartFolder {
    id: String,
    name: String,
    #[serde(deserialize_with = "nullable_parent")]
    parent_id: Option<String>,
    kind: String,
    sort_order: i64,
    created_at: i64,
    query: SmartQuery,
    definition_revision: u64,
}
fn nullable_parent<'de, D: serde::Deserializer<'de>>(
    de: D,
) -> std::result::Result<Option<String>, D::Error> {
    Option::<String>::deserialize(de)
}
impl TryFrom<FolderRecord> for Folder {
    type Error = &'static str;
    fn try_from(raw: FolderRecord) -> std::result::Result<Self, Self::Error> {
        let folder = match raw {
            FolderRecord::Physical(f) => {
                match f.id.as_str() {
                    "default" | "quick" | "trash" if f.kind == f.id && f.parent_id.is_none() => {}
                    "default" | "quick" | "trash" | "all" => return Err("保留文件夹身份无效"),
                    _ if f.kind == "normal" => {}
                    _ => return Err("物理文件夹类型无效"),
                }
                Folder {
                    id: f.id,
                    name: f.name,
                    parent_id: f.parent_id,
                    kind: f.kind,
                    sort_order: f.sort_order,
                    created_at: f.created_at,
                    query: None,
                    definition_revision: None,
                }
            }
            FolderRecord::Smart(f) => {
                if f.kind != "smart"
                    || ["default", "quick", "trash", "all"].contains(&f.id.as_str())
                    || f.parent_id.is_some()
                    || !(1..=MAX_REVISION).contains(&f.definition_revision)
                {
                    return Err("智能文件夹身份、层级或版本无效");
                }
                Folder {
                    id: f.id,
                    name: f.name,
                    parent_id: None,
                    kind: f.kind,
                    sort_order: f.sort_order,
                    created_at: f.created_at,
                    query: Some(f.query),
                    definition_revision: Some(f.definition_revision),
                }
            }
        };
        Ok(folder)
    }
}

pub(super) fn is_live_owner(folder: &Folder) -> bool {
    matches!(folder.kind.as_str(), "default" | "quick" | "normal")
}
pub(super) fn require_live_owner(folder: &Folder) -> Result<()> {
    if !is_live_owner(folder) {
        return Err(err("folder_capability", "此文件夹不能作为备忘录的物理位置"));
    }
    Ok(())
}
pub(super) fn require_parent(folder: &Folder) -> Result<()> {
    if !is_live_owner(folder) {
        return Err(err("folder_capability", "此文件夹不能作为父文件夹"));
    }
    Ok(())
}
fn invalid_input() -> AppError {
    err("smart_invalid", "智能文件夹输入、名称、规则或版本无效")
}
fn parse<T: serde::de::DeserializeOwned>(value: Value) -> Result<T> {
    serde_json::from_value(value).map_err(|_| invalid_input())
}
fn name(value: &str) -> Result<String> {
    let name = value.trim();
    if name.is_empty() || name.len() > 4096 {
        return Err(invalid_input());
    }
    Ok(name.into())
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Create {
    name: String,
    query: SmartQuery,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Update {
    id: String,
    name: String,
    query: SmartQuery,
    expected_definition_revision: u64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Delete {
    id: String,
    expected_definition_revision: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SmartMembership {
    pub definition_revision: u64,
    pub ids: Vec<String>,
}

impl Store {
    /// Temporary boundary until the real UI and ordering protocol understand smart definitions.
    pub(crate) fn ensure_legacy_capability(&self) -> Result<()> {
        if self.folders()?.iter().any(|f| f.kind == "smart") {
            return Err(err(
                "capability_unavailable",
                "此界面尚未支持智能文件夹，请使用支持该功能的版本",
            ));
        }
        Ok(())
    }
    pub(crate) fn create_smart_folder(&mut self, input: Value) -> Result<Folder> {
        let input: Create = parse(input)?;
        let folder = Folder {
            id: id(),
            name: name(&input.name)?,
            parent_id: None,
            kind: "smart".into(),
            sort_order: now(),
            created_at: now(),
            query: Some(input.query),
            definition_revision: Some(1),
        };
        self.db.execute(
            "INSERT INTO folders(id,body)VALUES(?1,?2)",
            params![folder.id, serde_json::to_string(&folder)?],
        )?;
        self.committed("folder", &folder.id, None);
        self.created(&folder.id);
        Ok(folder)
    }
    pub(crate) fn update_smart_folder(&mut self, input: Value) -> Result<Folder> {
        let input: Update = parse(input)?;
        let name = name(&input.name)?;
        let tx = self.db.unchecked_transaction()?;
        let mut folder = self.smart_for_cas(&input.id, input.expected_definition_revision)?;
        let next = input
            .expected_definition_revision
            .checked_add(1)
            .filter(|v| *v <= MAX_REVISION)
            .ok_or_else(|| err("smart_revision_overflow", "智能文件夹版本已达上限"))?;
        folder.name = name;
        folder.query = Some(input.query);
        folder.definition_revision = Some(next);
        tx.execute(
            "UPDATE folders SET body=?1 WHERE id=?2",
            params![serde_json::to_string(&folder)?, folder.id],
        )?;
        tx.commit()?;
        self.committed("folder", &folder.id, None);
        Ok(folder)
    }
    pub(crate) fn delete_smart_folder(&mut self, input: Value) -> Result<()> {
        let input: Delete = parse(input)?;
        let tx = self.db.unchecked_transaction()?;
        self.smart_for_cas(&input.id, input.expected_definition_revision)?;
        tx.execute("DELETE FROM folders WHERE id=?1", [&input.id])?;
        tx.commit()?;
        self.committed("folder", &input.id, None);
        Ok(())
    }
    fn smart_for_cas(&self, id: &str, expected: u64) -> Result<Folder> {
        if !(1..=MAX_REVISION).contains(&expected) {
            return Err(invalid_input());
        }
        let folder = self.folder(id)?;
        if folder.kind != "smart" {
            return Err(err("folder_capability", "此操作只接受智能文件夹"));
        }
        if folder.definition_revision != Some(expected) {
            return Err(err("smart_conflict", "智能文件夹已改变，请重新载入"));
        }
        Ok(folder)
    }
    pub(crate) fn evaluate_smart_folder(
        &self,
        id: &str,
        suspended: &HashSet<String>,
    ) -> Result<super::SmartMembership> {
        let tx = self.db.unchecked_transaction()?;
        let folder = self.folder(id)?;
        if folder.kind != "smart" {
            return Err(err("folder_capability", "此操作只接受智能文件夹"));
        }
        let query = folder.query.as_ref().ok_or_else(invalid_input)?;
        let attachments = self.attachments()?;
        let mut ids = Vec::new();
        for note in self.notes()? {
            if note.deleted_at.is_some() || suspended.contains(&note.id) {
                continue;
            }
            let tags = if query.rules.iter().any(|r| matches!(r, Rule::Tags { .. })) && !note.locked
            {
                Some(archive::validated_tags(&note, &attachments)?)
            } else {
                None
            };
            let mut unavailable = false;
            let mut any_true = false;
            let mut any_false = false;
            for rule in &query.rules {
                let value = match rule {
                    Rule::Pinned { value } => Some(note.pinned == *value),
                    Rule::Tags { mode, names } => tags.as_ref().map(|tags| match mode {
                        TagMode::AllSelected => {
                            names.as_ref().unwrap().iter().all(|n| tags.contains(n))
                        }
                        TagMode::AnySelected => {
                            names.as_ref().unwrap().iter().any(|n| tags.contains(n))
                        }
                        TagMode::AnyTag => !tags.is_empty(),
                        TagMode::NoTags => tags.is_empty(),
                    }),
                };
                match value {
                    Some(true) => any_true = true,
                    Some(false) => any_false = true,
                    None => unavailable = true,
                }
            }
            let included = match query.combine {
                Combine::All => !any_false && !unavailable,
                Combine::Any => any_true,
            };
            if included {
                ids.push(note.id);
            }
        }
        tx.commit()?;
        Ok(SmartMembership {
            definition_revision: folder.definition_revision.ok_or_else(invalid_input)?,
            ids,
        })
    }
}
