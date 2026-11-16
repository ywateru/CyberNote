use super::*;
pub const MAX_CONTENT: usize = 1024 * 1024;
pub fn check_text(text: &str) -> ToolResult<()> {
    if text.len() > MAX_CONTENT {
        return Err(ToolError::new("CONTENT_TOO_LARGE", "Content exceeds 1 MiB"));
    }
    Ok(())
}
pub fn input_document(format: &Format, content: &Value) -> ToolResult<Value> {
    let doc = match format {
        Format::Text => {
            let text = content
                .as_str()
                .ok_or_else(|| ToolError::new("SCHEMA_INVALID", "Text content must be a string"))?;
            check_text(text)?;
            text_document(text)
        }
        Format::Document => {
            if !content.is_object() {
                return Err(ToolError::new(
                    "SCHEMA_INVALID",
                    "Document content must be an object",
                ));
            }
            if serde_json::to_vec(content)
                .map_err(ToolError::storage)?
                .len()
                > MAX_CONTENT
            {
                return Err(ToolError::new(
                    "CONTENT_TOO_LARGE",
                    "Document exceeds 1 MiB",
                ));
            }
            content.clone()
        }
    };
    let mut stack = vec![(&doc, 0)];
    let mut nodes = 0;
    while let Some((v, depth)) = stack.pop() {
        if depth > 64 {
            return Err(ToolError::new("SCHEMA_INVALID", "JSON exceeds depth 64"));
        }
        if v.get("type").is_some() {
            nodes += 1;
        }
        if nodes > 20_000 {
            return Err(ToolError::new(
                "SCHEMA_INVALID",
                "Document exceeds 20000 nodes",
            ));
        }
        match v {
            Value::Array(a) => stack.extend(a.iter().map(|v| (v, depth + 1))),
            Value::Object(o) => stack.extend(o.values().map(|v| (v, depth + 1))),
            _ => (),
        }
    }
    Ok(doc)
}
pub fn text_document(text: &str) -> Value {
    let blocks: Vec<_> = text
        .split('\n')
        .enumerate()
        .map(|(i, line)| {
            let mut node = if i == 0 {
                json!({"type":"heading","attrs":{"level":1}})
            } else {
                json!({"type":"paragraph"})
            };
            if !line.is_empty() {
                node["content"] = json!([{"type":"text","text":line}]);
            }
            node
        })
        .collect();
    json!({"type":"doc","content":blocks})
}
pub fn plain_document(doc: &Value) -> bool {
    fn walk(v: &Value) -> bool {
        if !matches!(
            v["type"].as_str(),
            Some("doc" | "heading" | "paragraph" | "text")
        ) || v
            .get("marks")
            .is_some_and(|m| m.as_array().is_none_or(|a| !a.is_empty()))
        {
            return false;
        }
        v["content"].as_array().is_none_or(|a| a.iter().all(walk))
    }
    walk(doc)
}
pub fn attachment_ids(doc: &Value) -> BTreeSet<String> {
    let mut ids = BTreeSet::new();
    let mut stack = vec![doc];
    while let Some(v) = stack.pop() {
        if v["type"] == "attachment" {
            if let Some(id) = v["attrs"]["id"].as_str() {
                ids.insert(id.into());
            }
        }
        if let Some(a) = v["content"].as_array() {
            stack.extend(a);
        }
    }
    ids
}
/// A readable, explicitly lossy projection. Internal import nodes are removed by Store first.
pub fn readable_text(doc: &Value) -> String {
    fn walk(v: &Value, out: &mut String) {
        let ty = v["type"].as_str().unwrap_or("");
        match ty {
            "attachment" => {
                out.push_str("[attachment: ");
                out.push_str(v["attrs"]["name"].as_str().unwrap_or("attachment"));
                out.push(']');
            }
            "table" => out.push_str("[table]\n"),
            "taskItem" => out.push_str(if v["attrs"]["checked"] == true {
                "[x] "
            } else {
                "[ ] "
            }),
            "listItem" => out.push_str("• "),
            "hardBreak" => out.push('\n'),
            "horizontalRule" => out.push_str("\n---\n"),
            "drawing" => out.push_str("[drawing]"),
            _ => (),
        }
        if let Some(text) = v["text"].as_str() {
            out.push_str(text);
        }
        if let Some(a) = v["content"].as_array() {
            for n in a {
                walk(n, out);
            }
        }
        if let Some(marks) = v["marks"].as_array() {
            for m in marks {
                if m["type"] == "link" {
                    out.push_str(" [link: ");
                    out.push_str(m["attrs"]["href"].as_str().unwrap_or(""));
                    out.push(']');
                }
            }
        }
        if matches!(ty, "paragraph" | "heading" | "tableRow") {
            out.push('\n');
        }
        if matches!(ty, "tableCell" | "tableHeader") {
            out.push('\t');
        }
    }
    let mut out = String::new();
    walk(doc, &mut out);
    out.trim_end().into()
}
