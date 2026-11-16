//! Archive documents must be loadable by the production Editor schema.
//! document-schema.json is generated from its shared extension factory; the
//! frontend crosscheck checks both the manifest and the shared public corpus.
use super::*;
use std::sync::OnceLock;

const MAX_NODES: u64 = 100_000;

#[derive(Deserialize)]
struct AttributeSpec {
    required: bool,
    #[serde(default)]
    default: Value,
}
#[derive(Deserialize)]
struct NodeSpec {
    content: String,
    groups: Vec<String>,
    marks: Vec<String>,
    attrs: HashMap<String, AttributeSpec>,
}
#[derive(Deserialize)]
struct MarkSpec {
    excludes: Vec<String>,
    attrs: HashMap<String, AttributeSpec>,
}
#[derive(Deserialize)]
struct Schema {
    version: u32,
    nodes: HashMap<String, NodeSpec>,
    marks: HashMap<String, MarkSpec>,
}
fn schema() -> &'static Schema {
    static SCHEMA: OnceLock<Schema> = OnceLock::new();
    SCHEMA.get_or_init(|| {
        serde_json::from_str(include_str!("document-schema.json"))
            .expect("bundled Editor schema manifest must be valid")
    })
}
fn kind(node: &Value) -> Result<&str> {
    node.as_object()
        .and_then(|o| o.get("type"))
        .and_then(Value::as_str)
        .ok_or_else(|| invalid("文档节点必须是含 type 的对象"))
}
// ProseMirror's JSON envelopes are closed objects. Attribute names/values are
// validated separately against the generated Editor schema below; arbitrary
// extra envelope fields must not survive a save/read or archive round trip.
fn object_fields(value: &Value, allowed: &[&str]) -> Result<()> {
    let object = value
        .as_object()
        .ok_or_else(|| invalid("文档节点或格式标记必须是对象"))?;
    if object.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err(invalid("文档节点或格式标记含 schema 外字段"));
    }
    Ok(())
}
fn children(node: &Value) -> Result<&[Value]> {
    match node.get("content") {
        None => Ok(&[]),
        Some(value) => value
            .as_array()
            .map(Vec::as_slice)
            .ok_or_else(|| invalid("文档子节点必须是数组")),
    }
}
fn safe_integer(value: &Value) -> bool {
    value
        .as_i64()
        .is_some_and(|n| n.unsigned_abs() <= 9_007_199_254_740_991)
}
fn span(value: &Value) -> bool {
    value.as_u64().is_some_and(|n| (1..=MAX_NODES).contains(&n))
}
fn nullable_string(value: &Value) -> bool {
    value.is_null() || value.is_string()
}
pub(super) fn valid_tag_name(name: &str) -> bool {
    let count = name.chars().count();
    (1..=64).contains(&count)
        && name.chars().all(|c| {
            c.is_ascii_alphanumeric()
                || matches!(c, '_' | '-' | '\u{3400}'..='\u{4dbf}' | '\u{4e00}'..='\u{9fff}')
        })
        && name.chars().any(|c| {
            c.is_ascii_alphabetic()
                || matches!(c, '\u{3400}'..='\u{4dbf}' | '\u{4e00}'..='\u{9fff}')
        })
}
fn valid_strokes(value: &Value) -> bool {
    value.as_array().is_some_and(|strokes| {
        strokes.iter().all(|stroke| {
            stroke.is_object()
                && matches!(stroke["tool"].as_str(), Some("pen" | "marker" | "eraser"))
                && stroke["color"].is_string()
                && stroke["width"]
                    .as_f64()
                    .is_some_and(|n| n.is_finite() && n > 0.0)
                && stroke["points"].as_array().is_some_and(|points| {
                    points.iter().all(|point| {
                        point.as_array().is_some_and(|coordinates| {
                            coordinates.len() == 2
                                && coordinates
                                    .iter()
                                    .all(|n| n.as_f64().is_some_and(f64::is_finite))
                        })
                    })
                })
        })
    })
}
fn valid_attribute(owner: &str, key: &str, value: &Value, default: &Value) -> bool {
    match (owner, key) {
        ("noteTag", "name") => value.as_str().is_some_and(valid_tag_name),
        ("heading", "level") => value.as_u64().is_some_and(|n| (1..=3).contains(&n)),
        ("taskItem", "checked") => value.is_boolean(),
        ("bulletList", "listStyle") => matches!(value.as_str(), Some("bullet" | "dash")),
        ("orderedList", "start") => safe_integer(value),
        ("orderedList", "type") | ("codeBlock", "language") => nullable_string(value),
        ("tableCell" | "tableHeader", "colspan" | "rowspan") => span(value),
        ("tableCell" | "tableHeader", "colwidth") => {
            value.is_null()
                || value.as_array().is_some_and(|widths| {
                    widths
                        .iter()
                        .all(|w| w.as_u64().is_some_and(|n| n <= 9_007_199_254_740_991))
                })
        }
        ("tableCell" | "tableHeader", "align") => {
            value.is_null() || matches!(value.as_str(), Some("left" | "right" | "center"))
        }
        ("attachment", "id" | "name" | "kind") => value.is_string(),
        ("drawing", "strokes") => valid_strokes(value),
        ("link", "href" | "target" | "rel" | "class" | "title")
        | ("highlight" | "textStyle", "color") => nullable_string(value),
        // New schema attributes require an explicit reviewed type policy. The
        // manifest drift check prevents a frontend change silently bypassing it.
        _ => value == default,
    }
}
fn attributes(node: &Value, owner: &str, specs: &HashMap<String, AttributeSpec>) -> Result<()> {
    let attrs = match node.get("attrs") {
        None => None,
        Some(value) => Some(
            value
                .as_object()
                .ok_or_else(|| invalid("文档属性必须是对象"))?,
        ),
    };
    for (key, spec) in specs {
        if spec.required && attrs.is_none_or(|attrs| !attrs.contains_key(key)) {
            return Err(invalid(format!("{owner} 缺少必需属性 {key}")));
        }
    }
    if let Some(attrs) = attrs {
        for (key, value) in attrs {
            let spec = specs
                .get(key)
                .ok_or_else(|| invalid(format!("{owner} 属性 {key} 不在当前 schema 中")))?;
            if !valid_attribute(owner, key, value, &spec.default) {
                return Err(invalid(format!("{owner} 属性 {key} 类型或值无效")));
            }
        }
    }
    if matches!(owner, "tableCell" | "tableHeader") {
        if let Some(widths) = node["attrs"]["colwidth"].as_array() {
            let colspan = node["attrs"]["colspan"].as_u64().unwrap_or(1);
            if widths.len() as u64 != colspan {
                return Err(invalid("单元格 colwidth 数量与 colspan 不符"));
            }
        }
    }
    Ok(())
}
fn marks<'a>(node: &'a Value, schema: &Schema) -> Result<Vec<&'a str>> {
    let Some(marks) = node.get("marks") else {
        return Ok(Vec::new());
    };
    let marks = marks
        .as_array()
        .ok_or_else(|| invalid("文档格式标记必须是数组"))?;
    let mut seen: Vec<&str> = Vec::new();
    for mark in marks {
        object_fields(mark, &["type", "attrs"])?;
        let name = kind(mark)?;
        let spec = schema
            .marks
            .get(name)
            .ok_or_else(|| invalid("未知文档格式标记"))?;
        attributes(mark, name, &spec.attrs)?;
        if mark.get("content").is_some()
            || mark.get("text").is_some()
            || mark.get("marks").is_some()
        {
            return Err(invalid("格式标记不能含文档内容"));
        }
        if seen.iter().any(|old| {
            spec.excludes.iter().any(|x| x == old)
                || schema.marks[*old].excludes.iter().any(|x| x == name)
        }) {
            return Err(invalid("文档格式标记重复或互斥"));
        }
        seen.push(name);
    }
    Ok(seen)
}
fn tag_name(node: &Value) -> Option<&str> {
    node.get("marks")?
        .as_array()?
        .iter()
        .find(|mark| mark["type"] == "noteTag")?["attrs"]["name"]
        .as_str()
}
fn tag_spans(nodes: &[Value]) -> Result<()> {
    let mut name: Option<&str> = None;
    let mut text = String::new();
    let finish = |name: Option<&str>, text: &str| -> Result<()> {
        if let Some(name) = name {
            if text != format!("#{name}") {
                return Err(invalid("标签完整跨度与名称不符"));
            }
        }
        Ok(())
    };
    for node in nodes {
        let next = tag_name(node);
        if kind(node)? != "text" || next != name {
            finish(name, &text)?;
            name = None;
            text.clear();
        }
        if let Some(next) = next {
            if kind(node)? != "text" {
                return Err(invalid("标签只能标记文本"));
            }
            name = Some(next);
            text.push_str(
                node["text"]
                    .as_str()
                    .ok_or_else(|| invalid("标签文本无效"))?,
            );
        }
    }
    finish(name, &text)
}
fn content(node: &Value, spec: &NodeSpec, schema: &Schema) -> Result<()> {
    let children = children(node)?;
    let kinds = children.iter().map(kind).collect::<Result<Vec<_>>>()?;
    let group = |name: &str, group: &str| {
        schema
            .nodes
            .get(name)
            .is_some_and(|s| s.groups.iter().any(|g| g == group))
    };
    let valid = match spec.content.as_str() {
        "" => children.is_empty(),
        "block+" => !children.is_empty() && kinds.iter().all(|name| group(name, "block")),
        "inline*" => kinds.iter().all(|name| group(name, "inline")),
        "text*" => kinds.iter().all(|name| *name == "text"),
        "listItem+" => !children.is_empty() && kinds.iter().all(|name| *name == "listItem"),
        "taskItem+" => !children.is_empty() && kinds.iter().all(|name| *name == "taskItem"),
        "paragraph block*" => {
            kinds.first() == Some(&"paragraph")
                && kinds.iter().skip(1).all(|name| group(name, "block"))
        }
        "tableRow+" => !children.is_empty() && kinds.iter().all(|name| *name == "tableRow"),
        "(tableCell | tableHeader)*" => kinds
            .iter()
            .all(|name| matches!(*name, "tableCell" | "tableHeader")),
        _ => return Err(invalid("当前 schema 内容表达式尚未实现校验")),
    };
    if !valid {
        return Err(invalid(format!(
            "{} 的子节点不符合当前编辑器 schema",
            kind(node)?
        )));
    }
    tag_spans(children)?;
    for child in children {
        for mark in marks(child, schema)? {
            if !spec.marks.iter().any(|name| name == mark) {
                return Err(invalid("当前父节点不允许子节点的格式标记"));
            }
        }
    }
    Ok(())
}
fn table_budget(table: &Value) -> Result<()> {
    let rows = children(table)?;
    let mut width = 0u64;
    for row in rows {
        let mut columns = 0u64;
        for cell in children(row)? {
            columns = columns
                .checked_add(cell["attrs"]["colspan"].as_u64().unwrap_or(1))
                .ok_or_else(|| limit("表格逻辑网格超限"))?;
        }
        width = width.max(columns);
    }
    if width
        .checked_mul(rows.len() as u64)
        .is_none_or(|area| area > MAX_NODES)
    {
        return Err(limit("表格逻辑网格超过 100,000 格上限"));
    }
    Ok(())
}
pub(super) fn validate_document(
    doc: &Value,
    note: &Note,
    attachments: &HashMap<&str, &Attachment>,
) -> Result<()> {
    let schema = schema();
    if schema.version != 1 || kind(doc)? != "doc" {
        return Err(invalid("笔记文档根节点无效"));
    }
    let mut stack = vec![(doc, 0)];
    let mut nodes = 0;
    while let Some((node, depth)) = stack.pop() {
        nodes += 1;
        if depth > 64 || nodes > MAX_NODES {
            return Err(limit("笔记文档层级或节点过多"));
        }
        let name = kind(node)?;
        object_fields(node, &["type", "attrs", "content", "marks", "text"])?;
        let spec = schema
            .nodes
            .get(name)
            .ok_or_else(|| invalid(format!("不支持的文档节点: {name}")))?;
        attributes(node, name, &spec.attrs)?;
        let node_marks = marks(node, schema)?;
        if node_marks.contains(&"noteTag") && node_marks.contains(&"link") {
            return Err(invalid("标签不能同时标记链接"));
        }
        if note.locked && node_marks.contains(&"noteTag") {
            return Err(invalid("锁定的备忘录不能含标签"));
        }
        if name != "text" && node_marks.contains(&"noteTag") {
            return Err(invalid("标签只能标记文本"));
        }
        content(node, spec, schema)?;
        if name == "text" {
            if node["text"].as_str().is_none_or(str::is_empty) {
                return Err(invalid("文本节点必须含非空字符串"));
            }
        } else if node.get("text").is_some() {
            return Err(invalid("非文本节点不能携带 text 字段"));
        }
        if name == "attachment" {
            let aid = node["attrs"]["id"]
                .as_str()
                .ok_or_else(|| invalid("附件节点缺少 ID"))?;
            let attachment = attachments
                .get(aid)
                .ok_or_else(|| invalid("文档引用的附件不存在"))?;
            let attachment_kind = node["attrs"]
                .get("kind")
                .and_then(Value::as_str)
                .unwrap_or("file");
            if attachment.note_id != note.id || attachment_kind != attachment.kind {
                return Err(invalid("文档附件归属或类型不符"));
            }
        }
        if name == "table" {
            table_budget(node)?;
        }
        for child in children(node)? {
            stack.push((child, depth + 1));
        }
    }
    Ok(())
}
