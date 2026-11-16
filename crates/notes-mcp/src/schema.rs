//! Adapter wire schemas. Open document payloads are validated by the host's application schema.
use rmcp::model::{Tool, ToolAnnotations};
use serde_json::{Value, json};
use std::sync::Arc;

pub const BODY: usize = 1024 * 1024;
pub const FRAME: usize = 2 * BODY;
pub const NAMES: [&str; 9] = [
    "notes_get_capabilities",
    "notes_list_folders",
    "notes_list",
    "notes_search",
    "notes_read",
    "notes_create",
    "notes_append",
    "notes_update",
    "notes_get_operation",
];

fn string(max: usize) -> Value {
    json!({"type":"string","minLength":1,"maxLength":max})
}
fn nullable_string() -> Value {
    json!({"type":["string","null"],"minLength":1,"maxLength":8192})
}
fn integer() -> Value {
    json!({"type":"integer","minimum":0,"maximum":9007199254740991u64})
}
fn boolean() -> Value {
    json!({"type":"boolean"})
}
fn array(items: Value, max: usize) -> Value {
    json!({"type":"array","items":items,"maxItems":max})
}
fn object(props: Value, required: &[&str]) -> Value {
    json!({"type":"object","properties":props,"required":required,"additionalProperties":false})
}
fn format() -> Value {
    json!({"type":"string","enum":["text","document"],"default":"text"})
}
fn uuid() -> Value {
    json!({"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"})
}
fn content() -> Value {
    json!({"oneOf":[{"type":"string","maxLength":BODY},{"type":"object"}]})
}
fn content_relation(s: &mut Value) {
    s["allOf"] = json!([
        {"if":{"properties":{"format":{"const":"text"}},"required":["format"]},"then":{"properties":{"content":{"type":"string"}}}},
        {"if":{"properties":{"format":{"const":"document"}},"required":["format"]},"then":{"properties":{"content":{"type":"object"}}}}
    ]);
}
pub fn input(name: &str) -> Value {
    let mut p = json!({});
    let required: &[&str] = match name {
        "notes_get_capabilities" => &[],
        "notes_list_folders" | "notes_list" | "notes_search" => {
            p["cursor"] = string(8192);
            p["limit"] = json!({"type":"integer","minimum":1,"maximum":100,"default":20});
            if name != "notes_list_folders" {
                p["folderId"] = string(1024);
            }
            if name == "notes_list" {
                p["sort"] = json!({"type":"string","enum":["updated","created","title"],"default":"updated"});
            }
            if name == "notes_search" {
                p["query"] = string(512);
                p["tags"] = array(string(512), 100);
                &["query"]
            } else {
                &[]
            }
        }
        "notes_read" => {
            p = json!({"noteId":string(1024),"format":format(),"contentCursor":string(8192)});
            &["noteId"]
        }
        "notes_create" | "notes_update" => {
            p = json!({"format":format(),"content":content(),"idempotencyKey":uuid()});
            if name == "notes_create" {
                p["folderId"] = string(1024);
                &["folderId", "format", "content", "idempotencyKey"]
            } else {
                p["noteId"] = string(1024);
                p["expectedVersion"] = string(8192);
                &[
                    "noteId",
                    "expectedVersion",
                    "format",
                    "content",
                    "idempotencyKey",
                ]
            }
        }
        "notes_append" => {
            p = json!({"noteId":string(1024),"expectedVersion":string(8192),"text":{"type":"string","maxLength":BODY},"idempotencyKey":uuid()});
            &["noteId", "expectedVersion", "text", "idempotencyKey"]
        }
        "notes_get_operation" => {
            p["operationId"] = string(1024);
            &["operationId"]
        }
        _ => unreachable!(),
    };
    let mut s = object(p, required);
    if name == "notes_create" || name == "notes_update" {
        content_relation(&mut s);
    }
    s
}
pub fn error_schema() -> Value {
    object(
        json!({"code":string(128),"message":string(4096),"retryable":boolean(),"operationId":string(1024),"committed":boolean(),"currentVersion":string(8192),"retryAfterMs":integer()}),
        &["code", "message", "retryable"],
    )
}
fn summary_props() -> Value {
    json!({"id":string(1024),"folderId":string(1024),"title":{"type":"string","maxLength":BODY},"preview":{"type":"string","maxLength":240},"createdAt":integer(),"updatedAt":integer(),"pinned":boolean(),"revision":integer(),"version":string(8192),"attachmentCount":integer()})
}
const SUMMARY: &[&str] = &[
    "id",
    "folderId",
    "title",
    "preview",
    "createdAt",
    "updatedAt",
    "pinned",
    "revision",
    "version",
    "attachmentCount",
];
fn mutation() -> Value {
    object(
        json!({"operationId":string(1024),"noteId":string(1024),"committedRevision":integer(),"committedVersion":string(8192),"committed":{"const":true},"warnings":array(string(4096),100)}),
        &[
            "operationId",
            "noteId",
            "committedRevision",
            "committedVersion",
            "committed",
            "warnings",
        ],
    )
}
pub fn success(name: &str) -> Value {
    match name {
        "notes_get_capabilities" => object(
            json!({
                "apiVersion":{"type":"integer","const":1},"schemaVersion":{"type":"integer","const":1},"workspaceId":string(1024),
                "scopes":array(json!({"enum":["notes:read","notes:create","notes:update"]}),3),
                "tools":array(json!({"enum":NAMES}),9),"formats":array(json!({"enum":["text","document"]}),2),
                "hostSessionId":string(1024),
                "limits":object(json!({
                    "maxLimit":integer(),"maxQueryCharacters":integer(),"maxContentBytes":integer(),
                    "maxDocumentBytes":integer(),"maxFrameBytes":integer(),"maxTextPageBytes":integer(),
                    "maxListBytes":integer(),"maxJsonDepth":integer(),"maxNodes":integer(),
                    "idempotencyRetentionDays":integer(),"queryDeadlineMs":integer(),"writeDeadlineMs":integer(),
                    "maxConcurrentReads":integer(),"maxConcurrentWrites":integer(),"maxQueuedWrites":integer()
                }), &["maxLimit","maxQueryCharacters","maxContentBytes","maxDocumentBytes","maxFrameBytes",
                    "maxTextPageBytes","maxListBytes","maxJsonDepth","maxNodes","idempotencyRetentionDays",
                    "queryDeadlineMs","writeDeadlineMs","maxConcurrentReads","maxConcurrentWrites","maxQueuedWrites"])
            }),
            &[
                "apiVersion",
                "schemaVersion",
                "workspaceId",
                "scopes",
                "tools",
                "formats",
                "hostSessionId",
                "limits",
            ],
        ),
        "notes_list_folders" => object(
            json!({"items":array(object(json!({"id":string(1024),"name":{"type":"string","maxLength":4096},"ancestorLabels":array(string(4096),128)}), &["id","name","ancestorLabels"]),100),"nextCursor":nullable_string()}),
            &["items", "nextCursor"],
        ),
        "notes_list" | "notes_search" => {
            let mut p = summary_props();
            let mut req = SUMMARY.to_vec();
            if name == "notes_search" {
                p["match"] = object(
                    json!({"field":{"type":"string","enum":["title","content"]},"snippet":{"type":"string","maxLength":240}}),
                    &["field", "snippet"],
                );
                req.push("match");
            }
            object(
                json!({"items":array(object(p,&req),100),"nextCursor":nullable_string()}),
                &["items", "nextCursor"],
            )
        }
        "notes_read" => {
            let mut p = summary_props();
            p["format"] = format();
            p["content"] = content();
            p["truncated"] = boolean();
            p["nextContentCursor"] = nullable_string();
            let mut req = SUMMARY.to_vec();
            req.extend(["format", "content", "truncated", "nextContentCursor"]);
            let mut s = object(p, &req);
            content_relation(&mut s);
            s
        }
        "notes_create" | "notes_append" | "notes_update" => mutation(),
        "notes_get_operation" => {
            json!({"oneOf":[mutation(),object(json!({"status":{"enum":["pending","not_found"]},"operationId":string(1024)}), &["status","operationId"])]})
        }
        _ => unreachable!(),
    }
}
pub fn write(name: &str) -> bool {
    matches!(name, "notes_create" | "notes_append" | "notes_update")
}
pub struct Definition {
    pub tool: Tool,
    pub input: jsonschema::Validator,
    pub output: jsonschema::Validator,
}
pub fn definitions() -> Vec<Definition> {
    NAMES
        .into_iter()
        .map(|name| {
            let i = input(name);
            let o = json!({"type":"object","oneOf":[success(name),error_schema()]});
            let tool = Tool::new(
                name,
                format!("{} via the running authorized workspace host", name),
                i.as_object().unwrap().clone(),
            )
            .with_raw_output_schema(Arc::new(o.as_object().unwrap().clone()))
            .with_annotations(
                ToolAnnotations::new()
                    .read_only(!write(name))
                    .destructive(name == "notes_update")
                    .idempotent(!write(name))
                    .open_world(false),
            );
            Definition {
                tool,
                input: jsonschema::validator_for(&i).expect("static input schema"),
                output: jsonschema::validator_for(&o).expect("static output schema"),
            }
        })
        .collect()
}
/// Match application::document::input_document: root depth zero, every JSON value
/// at depth <= 64, and only objects containing `type` count toward maxNodes.
/// Attribute/stroke objects without `type` still consume byte/depth/frame budgets.
/// The host remains responsible for validating the actual document schema.
pub fn bounded_content(value: &Value) -> bool {
    let bytes = if let Some(s) = value.as_str() {
        s.len()
    } else {
        serde_json::to_vec(value).map_or(usize::MAX, |v| v.len())
    };
    if bytes > BODY {
        return false;
    }
    let mut stack = vec![(value, 0usize)];
    let mut nodes = 0;
    while let Some((v, depth)) = stack.pop() {
        if depth > 64 {
            return false;
        }
        if v.get("type").is_some() {
            nodes += 1;
            if nodes > 20_000 {
                return false;
            }
        }
        match v {
            Value::Object(o) => stack.extend(o.values().map(|v| (v, depth + 1))),
            Value::Array(a) => stack.extend(a.iter().map(|v| (v, depth + 1))),
            _ => (),
        }
    }
    true
}
