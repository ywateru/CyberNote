//! Inert HTML tokenization: no browser, scripts, resource loading or source paths.
use super::*;
use html5ever::tokenizer::{
    BufferQueue, TagKind, Token, TokenSink, TokenSinkResult, Tokenizer, TokenizerOpts,
};
use std::cell::RefCell;
#[derive(Default)]
struct Element {
    tag: String,
    attrs: BTreeMap<String, String>,
    text: String,
    children: Vec<Element>,
}
struct Sink {
    stack: RefCell<Vec<Element>>,
    count: std::cell::Cell<usize>,
    exceeded: std::cell::Cell<bool>,
}
impl TokenSink for Sink {
    type Handle = ();
    fn process_token(&self, token: Token, _: u64) -> TokenSinkResult<()> {
        self.count.set(self.count.get() + 1);
        if self.count.get() > 100_000 || self.stack.borrow().len() > 100 {
            self.exceeded.set(true);
            return TokenSinkResult::Continue;
        }
        let mut stack = self.stack.borrow_mut();
        match token {
            Token::CharacterTokens(s) => stack.last_mut().unwrap().children.push(Element {
                text: s.to_string(),
                ..Default::default()
            }),
            Token::TagToken(t) if t.kind == TagKind::StartTag => {
                let tag = t.name.to_string();
                // HTML's commonly omitted paragraph/list/cell end tags.
                if stack.len() > 1
                    && ((tag == "li" && stack.last().unwrap().tag == "li")
                        || (tag == "p" && stack.last().unwrap().tag == "p")
                        || (["td", "th"].contains(&tag.as_str())
                            && ["td", "th"].contains(&stack.last().unwrap().tag.as_str())))
                {
                    let e = stack.pop().unwrap();
                    stack.last_mut().unwrap().children.push(e);
                }
                let e = Element {
                    tag: tag.clone(),
                    attrs: t
                        .attrs
                        .into_iter()
                        .map(|a| (a.name.local.to_string(), a.value.to_string()))
                        .collect(),
                    ..Default::default()
                };
                if t.self_closing
                    || ["br", "hr", "img", "input", "meta", "link", "source", "wbr"]
                        .contains(&tag.as_str())
                {
                    stack.last_mut().unwrap().children.push(e);
                } else {
                    stack.push(e);
                }
            }
            Token::TagToken(t) => {
                if let Some(index) = stack.iter().rposition(|e| e.tag == t.name.as_ref()) {
                    if index > 0 {
                        while stack.len() > index {
                            let e = stack.pop().unwrap();
                            stack.last_mut().unwrap().children.push(e);
                        }
                    }
                }
            }
            _ => {}
        }
        TokenSinkResult::Continue
    }
}
fn text(value: &str, marks: &[Value]) -> Value {
    let mut n = json!({"type":"text","text":value});
    if !marks.is_empty() {
        n["marks"] = json!(marks);
    }
    n
}
fn block(kind: &str, children: Vec<Value>) -> Value {
    json!({"type":kind,"content":children})
}
fn para(children: Vec<Value>) -> Value {
    block("paragraph", children)
}
fn safe_link(href: &str) -> bool {
    !href.chars().any(char::is_control)
        && url::Url::parse(href).is_ok_and(|u| matches!(u.scheme(), "http" | "https" | "mailto"))
}
struct Convert<'a> {
    media: &'a BTreeMap<String, Attachment>,
    used: HashSet<String>,
    warnings: BTreeSet<String>,
}
impl Convert<'_> {
    fn media(&mut self, e: &Element) -> Option<Value> {
        let value = e
            .attrs
            .get("src")
            .or_else(|| e.attrs.get("data"))
            .or_else(|| e.attrs.get("href"))?;
        let cid = value.strip_prefix("cid:")?;
        let a = self.media.get(cid).or_else(|| self.media.get(value));
        match a {
            Some(a) => {
                self.used.insert(a.id.clone());
                Some(
                    json!({"type":"attachment","attrs":{"id":a.id,"kind":a.kind,"name":a.display_name}}),
                )
            }
            None => {
                self.warnings
                    .insert("部分正文内嵌对象未匹配附件，原始记录已保留".into());
                None
            }
        }
    }
    fn nodes(&mut self, e: &Element, marks: &[Value]) -> Vec<Value> {
        if !e.text.is_empty() {
            return vec![text(&e.text, marks)];
        }
        if ["script", "style", "meta", "link", "head", "iframe"].contains(&e.tag.as_str()) {
            self.warnings
                .insert("已移除可执行内容或外部资源，原始记录已保留".into());
            return vec![];
        }
        if ["img", "object", "audio", "video", "a"].contains(&e.tag.as_str()) {
            if let Some(n) = self.media(e) {
                return vec![n];
            }
        }
        let mut next = marks.to_vec();
        let mark = match e.tag.as_str() {
            "b" | "strong" => Some("bold"),
            "i" | "em" => Some("italic"),
            "s" | "strike" | "del" => Some("strike"),
            "code" => Some("code"),
            _ => None,
        };
        if let Some(kind) = mark {
            if !next.iter().any(|m| m["type"] == kind) {
                next.push(json!({"type":kind}));
            }
        }
        if e.tag == "a" {
            if let Some(href) = e.attrs.get("href") {
                if safe_link(href) {
                    next.retain(|m| m["type"] != "link");
                    next.push(json!({"type":"link","attrs":{"href":href}}));
                } else {
                    self.warnings
                        .insert("不受支持的链接保存在原始记录中".into());
                }
            }
        }
        if let Some(style) = e.attrs.get("style") {
            for declaration in style.split(';') {
                let Some((key, value)) = declaration.split_once(':') else {
                    continue;
                };
                let (key, value) = (key.trim(), value.trim());
                let kind = match key {
                    "font-weight"
                        if value == "bold" || value.parse::<u16>().is_ok_and(|n| n >= 600) =>
                    {
                        Some("bold")
                    }
                    "font-style" if value == "italic" => Some("italic"),
                    "text-decoration" if value.contains("line-through") => Some("strike"),
                    _ => None,
                };
                if let Some(kind) = kind {
                    if !next.iter().any(|m| m["type"] == kind) {
                        next.push(json!({"type":kind}));
                    }
                } else if ![
                    "font-family",
                    "font-size",
                    "line-height",
                    "margin",
                    "margin-top",
                    "margin-bottom",
                    "padding",
                    "white-space",
                    "vertical-align",
                ]
                .contains(&key)
                {
                    self.warnings.insert("部分样式仅保存在原始记录中".into());
                }
            }
        }
        let children = if matches!(e.tag.as_str(), "ul" | "ol") {
            Vec::new()
        } else {
            e.children
                .iter()
                .flat_map(|c| self.nodes(c, &next))
                .collect::<Vec<_>>()
        };
        match e.tag.as_str() {
            "br" => vec![json!({"type":"hardBreak"})],
            "hr" => vec![json!({"type":"horizontalRule"})],
            "p" | "div" => self.wrap_blocks(children),
            "h1" | "h2" | "h3" => {
                let mut blocks = self.wrap_blocks(children);
                if blocks.len() == 1 && blocks[0]["type"] == "paragraph" {
                    blocks[0]["type"] = json!("heading");
                    blocks[0]["attrs"] = json!({"level":e.tag[1..].parse::<u8>().unwrap()});
                }
                blocks
            }
            "ul" | "ol" => {
                let task = e.attrs.get("data-type").is_some_and(|v| v == "taskList")
                    || e.children.iter().any(|c| {
                        c.tag == "li"
                            && (c.attrs.contains_key("data-checked")
                                || c.children.iter().any(|i| {
                                    i.tag == "input"
                                        && i.attrs.get("type").is_some_and(|t| t == "checkbox")
                                }))
                    });
                let mut items = vec![];
                for li in e.children.iter().filter(|c| c.tag == "li") {
                    let content = li
                        .children
                        .iter()
                        .filter(|c| c.tag != "input")
                        .flat_map(|c| self.nodes(c, marks))
                        .collect();
                    let mut item = block(
                        if task { "taskItem" } else { "listItem" },
                        self.wrap_blocks(content),
                    );
                    if task {
                        item["attrs"] = json!({"checked":li.attrs.get("data-checked").is_some_and(|v|v=="true")||li.children.iter().any(|c|c.tag=="input"&&c.attrs.contains_key("checked"))});
                    }
                    items.push(item);
                }
                if items.is_empty() {
                    return self.wrap_blocks(children);
                }
                let mut list = block(
                    if task {
                        "taskList"
                    } else if e.tag == "ol" {
                        "orderedList"
                    } else {
                        "bulletList"
                    },
                    items,
                );
                if e.tag == "ol" && !task {
                    list["attrs"] = json!({"start":e.attrs.get("start").and_then(|s|s.parse::<i64>().ok()).unwrap_or(1)});
                }
                vec![list]
            }
            "table" => {
                let rows = children
                    .into_iter()
                    .filter(|c| c["type"] == "tableRow")
                    .collect::<Vec<_>>();
                if rows.is_empty() {
                    self.warnings.insert("空表格保存在原始记录中".into());
                    vec![]
                } else {
                    vec![block("table", rows)]
                }
            }
            "tr" => vec![block(
                "tableRow",
                children
                    .into_iter()
                    .filter(|c| matches!(c["type"].as_str(), Some("tableCell" | "tableHeader")))
                    .collect(),
            )],
            "td" | "th" => {
                let mut n = block(
                    if e.tag == "td" {
                        "tableCell"
                    } else {
                        "tableHeader"
                    },
                    self.wrap_blocks(children),
                );
                n["attrs"] = json!({"colspan":e.attrs.get("colspan").and_then(|s|s.parse::<u64>().ok()).filter(|n|*n>0&&*n<=1000).unwrap_or(1),"rowspan":e.attrs.get("rowspan").and_then(|s|s.parse::<u64>().ok()).filter(|n|*n>0&&*n<=1000).unwrap_or(1)});
                vec![n]
            }
            "blockquote" => vec![block("blockquote", self.wrap_blocks(children))],
            "img" | "object" | "audio" | "video" => {
                self.warnings
                    .insert("部分原生对象仅保存在附件及原始记录中".into());
                children
            }
            "input" => vec![],
            _ => children,
        }
    }
    fn wrap_blocks(&self, nodes: Vec<Value>) -> Vec<Value> {
        let mut out = vec![];
        let mut inline = vec![];
        for n in nodes {
            if matches!(n["type"].as_str(), Some("text" | "hardBreak")) {
                inline.push(n);
            } else {
                if !inline.is_empty() {
                    out.push(para(std::mem::take(&mut inline)));
                }
                out.push(n);
            }
        }
        if !inline.is_empty() {
            out.push(para(inline));
        }
        if out.is_empty() {
            out.push(para(vec![]));
        }
        out
    }
}
pub(super) fn convert(
    html: &str,
    media: &BTreeMap<String, Attachment>,
    ordered: &[Attachment],
) -> Result<(Value, Vec<String>)> {
    if html.len() > 8 * 1024 * 1024 {
        return Err(fail("html_limit", "单条正文超过8MiB"));
    }
    let input = BufferQueue::default();
    input.push_back(html.into());
    let tok = Tokenizer::new(
        Sink {
            stack: RefCell::new(vec![Element::default()]),
            count: std::cell::Cell::new(0),
            exceeded: std::cell::Cell::new(false),
        },
        TokenizerOpts::default(),
    );
    let _ = tok.feed(&input);
    tok.end();
    if tok.sink.exceeded.get() {
        return Err(fail("html_limit", "正文结构过多或过深"));
    }
    let mut stack = tok.sink.stack.into_inner();
    while stack.len() > 1 {
        let e = stack.pop().unwrap();
        stack.last_mut().unwrap().children.push(e);
    }
    let root = stack.pop().unwrap();
    let mut converter = Convert {
        media,
        used: HashSet::new(),
        warnings: BTreeSet::new(),
    };
    let converted = converter.nodes(&root, &[]);
    let mut blocks = converter.wrap_blocks(converted);
    for a in ordered {
        if converter.used.insert(a.id.clone()) {
            blocks.push(json!({"type":"attachment","attrs":{"id":a.id,"kind":a.kind,"name":a.display_name}}));
            converter
                .warnings
                .insert("未定位到原位置的附件已保留在正文末尾".into());
        }
    }
    Ok((
        block("doc", blocks),
        converter.warnings.into_iter().collect(),
    ))
}
