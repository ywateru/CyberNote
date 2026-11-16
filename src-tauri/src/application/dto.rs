use super::*;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    Text,
    Document,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Sort {
    #[default]
    Updated,
    Created,
    Title,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ListInput {
    pub folder_id: Option<String>,
    pub sort: Option<Sort>,
    pub cursor: Option<String>,
    pub limit: Option<usize>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchInput {
    pub query: String,
    pub folder_id: Option<String>,
    pub tags: Option<Vec<String>>,
    pub cursor: Option<String>,
    pub limit: Option<usize>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReadInput {
    pub note_id: String,
    pub format: Option<Format>,
    pub content_cursor: Option<String>,
}
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PageInput {
    pub cursor: Option<String>,
    pub limit: Option<usize>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Empty {}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OperationInput {
    pub operation_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "tool", rename_all = "snake_case", deny_unknown_fields)]
pub enum Mutation {
    #[serde(rename = "notes_create", rename_all = "camelCase")]
    Create {
        folder_id: String,
        format: Format,
        content: Value,
        idempotency_key: String,
    },
    #[serde(rename = "notes_append", rename_all = "camelCase")]
    Append {
        note_id: String,
        expected_version: String,
        text: String,
        idempotency_key: String,
    },
    #[serde(rename = "notes_update", rename_all = "camelCase")]
    Update {
        note_id: String,
        expected_version: String,
        format: Format,
        content: Value,
        idempotency_key: String,
    },
}
impl Mutation {
    pub fn parse(tool: &str, arguments: Value) -> ToolResult<Self> {
        if !matches!(tool, "notes_create" | "notes_append" | "notes_update") {
            return Err(ToolError::new("SCHEMA_INVALID", "Unknown mutation tool"));
        }
        let mut args = arguments
            .as_object()
            .cloned()
            .ok_or_else(|| ToolError::new("SCHEMA_INVALID", "Expected object"))?;
        if args.contains_key("tool") {
            return Err(ToolError::new("SCHEMA_INVALID", "Unknown argument tool"));
        }
        args.insert("tool".into(), json!(tool));
        let result: Self = parse(Value::Object(args))?;
        if Uuid::parse_str(result.key()).is_err() {
            return Err(ToolError::new(
                "SCHEMA_INVALID",
                "idempotencyKey must be UUID",
            ));
        }
        if result
            .note_id()
            .is_some_and(|id| !crate::sync::model::valid_id(id))
            || result
                .expected()
                .is_some_and(|v| v.len() != 64 || !v.bytes().all(|b| b.is_ascii_hexdigit()))
            || matches!(&result, Self::Create {folder_id,..} if !crate::sync::model::valid_id(folder_id))
        {
            return Err(ToolError::new(
                "SCHEMA_INVALID",
                "Invalid target identity or expectedVersion",
            ));
        }
        match &result {
            Self::Create {
                content, format, ..
            }
            | Self::Update {
                content, format, ..
            } => {
                input_document(format, content)?;
            }
            Self::Append { text, .. } => {
                check_text(text)?;
            }
        }
        Ok(result)
    }
    pub fn scope(&self) -> &'static str {
        match self {
            Self::Create { .. } => "notes:create",
            _ => "notes:update",
        }
    }
    pub fn tool(&self) -> &'static str {
        match self {
            Self::Create { .. } => "notes_create",
            Self::Append { .. } => "notes_append",
            Self::Update { .. } => "notes_update",
        }
    }
    pub fn key(&self) -> &str {
        match self {
            Self::Create {
                idempotency_key, ..
            }
            | Self::Append {
                idempotency_key, ..
            }
            | Self::Update {
                idempotency_key, ..
            } => idempotency_key,
        }
    }
    pub fn note_id(&self) -> Option<&str> {
        match self {
            Self::Create { .. } => None,
            Self::Append { note_id, .. } | Self::Update { note_id, .. } => Some(note_id),
        }
    }
    pub fn expected(&self) -> Option<&str> {
        match self {
            Self::Create { .. } => None,
            Self::Append {
                expected_version, ..
            }
            | Self::Update {
                expected_version, ..
            } => Some(expected_version),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MutationResult {
    pub operation_id: String,
    pub note_id: String,
    pub committed_revision: i64,
    pub committed_version: String,
    pub committed: bool,
    pub warnings: Vec<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub folder_id: String,
    pub title: String,
    pub preview: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub pinned: bool,
    pub revision: i64,
    pub version: String,
    pub attachment_count: usize,
}
