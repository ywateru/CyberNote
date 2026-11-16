use super::*;
use std::{
    cmp::Ordering,
    time::{Duration, Instant},
};
use unicode_normalization::UnicodeNormalization;
#[derive(Clone)]
pub(crate) struct Cursor {
    binding: String,
    generation: i64,
    expires: Instant,
    position: Position,
}
#[derive(Clone)]
enum Position {
    Note(NoteSummaryKey),
    Folder(String),
    Content(usize),
}
#[derive(Clone, PartialEq, Eq)]
struct NoteSummaryKey {
    text: String,
    time: i64,
    id: String,
}
fn normalized(text: &str) -> String {
    text.nfkc().flat_map(char::to_lowercase).collect()
}
fn limit(value: Option<usize>) -> ToolResult<usize> {
    let n = value.unwrap_or(20);
    if n == 0 || n > 100 {
        Err(ToolError::new("SCHEMA_INVALID", "limit must be 1..100"))
    } else {
        Ok(n)
    }
}
fn key(summary: &NoteSummary, sort: &Sort) -> NoteSummaryKey {
    NoteSummaryKey {
        text: if *sort == Sort::Title {
            summary.title.clone()
        } else {
            String::new()
        },
        time: if *sort == Sort::Created {
            summary.created_at
        } else {
            summary.updated_at
        },
        id: summary.id.clone(),
    }
}
fn compare(a: &NoteSummaryKey, b: &NoteSummaryKey, sort: &Sort) -> Ordering {
    let order = if *sort == Sort::Title {
        a.text.cmp(&b.text)
    } else {
        b.time.cmp(&a.time)
    };
    order.then_with(|| a.id.cmp(&b.id))
}
impl NotesApplicationService<'_> {
    fn cursor_binding(&self, ctx: &TrustedContext, query: Value) -> ToolResult<String> {
        hash(&json!([
            self.session.sync_session_id(),
            ctx.client_id,
            ctx.grant_id,
            ctx.revocation,
            ctx.folder_ids,
            ctx.scopes,
            query
        ]))
    }
    fn cursor_position(&self, token: Option<&str>, binding: &str) -> ToolResult<Option<Position>> {
        token
            .map(|t| {
                let c = self
                    .session
                    .application
                    .cursors
                    .get(t)
                    .ok_or_else(|| ToolError::new("CURSOR_EXPIRED", "Cursor expired"))?;
                if c.binding != binding
                    || c.generation
                        != self
                            .session
                            .store
                            .application_generation()
                            .map_err(ToolError::storage)?
                    || Instant::now() > c.expires
                {
                    return Err(ToolError::new("CURSOR_EXPIRED", "Cursor expired"));
                }
                Ok(c.position.clone())
            })
            .transpose()
    }
    fn next_cursor(&mut self, binding: String, position: Position) -> ToolResult<String> {
        self.session
            .application
            .cursors
            .retain(|_, c| c.expires > Instant::now());
        if self.session.application.cursors.len() >= 256 {
            return Err(ToolError::new(
                "RATE_LIMITED",
                "Too many outstanding cursors",
            ));
        }
        let token = Uuid::new_v4().to_string();
        self.session.application.cursors.insert(
            token.clone(),
            Cursor {
                binding,
                generation: self
                    .session
                    .store
                    .application_generation()
                    .map_err(ToolError::storage)?,
                expires: Instant::now() + Duration::from_secs(300),
                position,
            },
        );
        Ok(token)
    }
    pub fn query(
        &mut self,
        context: &TrustedContext,
        tool: &str,
        arguments: Value,
    ) -> ToolResult<Value> {
        let deadline = Instant::now() + Duration::from_secs(5);
        self.authorize(context, None)?;
        let result = match tool {
            "notes_get_capabilities" => {
                let _: Empty = parse(arguments)?;
                let (workspace, _) = self
                    .session
                    .store
                    .application_identity()
                    .map_err(ToolError::storage)?;
                json!({"apiVersion":1,"schemaVersion":1,"workspaceId":workspace,"scopes":context.scopes,"hostSessionId":self.session.sync_session_id(),"tools":["notes_get_capabilities","notes_list_folders","notes_list","notes_search","notes_read","notes_create","notes_append","notes_update","notes_get_operation"],"formats":["text","document"],"limits":{"maxLimit":100,"maxQueryCharacters":512,"maxContentBytes":MAX_CONTENT,"maxDocumentBytes":MAX_CONTENT,"maxFrameBytes":2097152,"maxTextPageBytes":32768,"maxListBytes":524288,"maxJsonDepth":64,"maxNodes":20000,"idempotencyRetentionDays":30,"queryDeadlineMs":5000,"writeDeadlineMs":15000,"maxConcurrentReads":4,"maxConcurrentWrites":1,"maxQueuedWrites":8}})
            }
            "notes_list_folders" => {
                self.authorize(context, Some("notes:read"))?;
                let input: PageInput = parse(arguments)?;
                self.list_folders(context, input)?
            }
            "notes_list" => {
                self.authorize(context, Some("notes:read"))?;
                let input: ListInput = parse(arguments)?;
                self.list(context, input, None, None)?
            }
            "notes_search" => {
                self.authorize(context, Some("notes:read"))?;
                let input: SearchInput = parse(arguments)?;
                let chars = input.query.chars().count();
                if !(1..=512).contains(&chars)
                    || input.tags.as_ref().is_some_and(|t| {
                        t.len() > 100 || t.iter().any(|v| !crate::store::application_valid_tag(v))
                    })
                {
                    return Err(ToolError::new(
                        "SCHEMA_INVALID",
                        "Invalid search query or tags",
                    ));
                }
                self.list(
                    context,
                    ListInput {
                        folder_id: input.folder_id,
                        sort: Some(Sort::Updated),
                        cursor: input.cursor,
                        limit: input.limit,
                    },
                    Some(input.query),
                    input.tags,
                )?
            }
            "notes_read" => {
                self.authorize(context, Some("notes:read"))?;
                let input: ReadInput = parse(arguments)?;
                self.read(context, input)?
            }
            "notes_get_operation" => {
                let input: OperationInput = parse(arguments)?;
                if Uuid::parse_str(&input.operation_id).is_err() {
                    return Err(ToolError::new("SCHEMA_INVALID", "Invalid operationId"));
                }
                if let Some((tool, _, grant, result)) = self.session.store.application_operation(
                    context,
                    None,
                    Some(&input.operation_id),
                )? {
                    self.session
                        .external_authorize_operation(context, &tool, &grant, &result)?;
                    serde_json::to_value(result).map_err(ToolError::storage)?
                } else if self
                    .session
                    .external_pending_for(context, &input.operation_id)?
                {
                    json!({"operationId":input.operation_id,"status":"pending"})
                } else {
                    json!({"operationId":input.operation_id,"status":"not_found"})
                }
            }
            _ => return Err(ToolError::new("SCHEMA_INVALID", "Unknown query tool")),
        };
        if Instant::now() >= deadline {
            return Err(ToolError::new("TIMEOUT", "Query deadline exceeded"));
        }
        // Revoke may happen through its atomic handle while Session is locked.
        self.authorize(context, None)?;
        if serde_json::to_vec(&result)
            .map_err(ToolError::storage)?
            .len()
            > if tool == "notes_read" {
                MAX_CONTENT + 32768
            } else {
                512 * 1024
            }
        {
            return Err(ToolError::new(
                "CONTENT_TOO_LARGE",
                "Response exceeds tool limit",
            ));
        }
        Ok(result)
    }
    fn summary(&self, note: &Note) -> ToolResult<NoteSummary> {
        let (doc, count, _) = self.session.store.application_projection(note)?;
        Ok(NoteSummary {
            id: note.id.clone(),
            folder_id: note.folder_id.clone(),
            title: note.title.clone(),
            preview: readable_text(&doc).chars().take(240).collect(),
            created_at: note.created_at,
            updated_at: note.updated_at,
            pinned: note.pinned,
            revision: note.revision,
            version: self.session.store.application_version(note)?,
            attachment_count: count,
        })
    }
    fn list(
        &mut self,
        ctx: &TrustedContext,
        input: ListInput,
        search: Option<String>,
        tags: Option<Vec<String>>,
    ) -> ToolResult<Value> {
        let n = limit(input.limit)?;
        if input
            .folder_id
            .as_ref()
            .is_some_and(|f| !ctx.folder_ids.contains(f))
        {
            return Err(ToolError::not_found());
        }
        let sort = input.sort.unwrap_or_default();
        let binding =
            self.cursor_binding(ctx, json!(["list", input.folder_id, sort, search, tags, n]))?;
        let after = match self.cursor_position(input.cursor.as_deref(), &binding)? {
            Some(Position::Note(k)) => Some(k),
            None => None,
            _ => {
                return Err(ToolError::new(
                    "CURSOR_EXPIRED",
                    "Cursor belongs to another tool",
                ))
            }
        };
        let needle = search.as_ref().map(|s| normalized(s));
        let mut items: Vec<(NoteSummary, Option<Value>)> = Vec::new();
        self.session.store.application_scan(ctx,input.folder_id.as_deref(),|note| {
            let (doc,_,found_tags)=self.session.store.application_projection(&note)?;
            if tags.as_ref().is_some_and(|tags|tags.iter().any(|t|!found_tags.contains(t))) {return Ok(());}
            let text=readable_text(&doc);
            let hit=if let Some(needle)=&needle {
                let title=normalized(&note.title);let body=normalized(&text);
                let field=if title.contains(needle) {"title"} else if body.contains(needle) {"content"} else {return Ok(());};
                let source=if field=="title" {title} else {body};let offset=source.find(needle).unwrap();
                let start=source[..offset].char_indices().rev().nth(60).map(|(i,_)|i).unwrap_or(0);
                Some(json!({"field":field,"snippet":source[start..].chars().take(240).collect::<String>()}))
            } else {None};
            let summary=self.summary(&note)?;
            if after.as_ref().is_some_and(|k|compare(&key(&summary,&sort),k,&sort)!=Ordering::Greater) {return Ok(());}
            let pos=items.binary_search_by(|(s,_)|compare(&key(s,&sort),&key(&summary,&sort),&sort)).unwrap_or_else(|i|i);
            if pos<=n {items.insert(pos,(summary,hit));items.truncate(n+1);}
            Ok(())
        })?;
        let mut more = items.len() > n;
        items.truncate(n);
        // Keep summaries bounded even for maximal titles/ids and escaped text.
        let mut response = Vec::new();
        let mut bytes = 128usize;
        let mut last = None;
        for (summary, hit) in items {
            let mut value = serde_json::to_value(&summary).map_err(ToolError::storage)?;
            if let Some(hit) = hit {
                value["match"] = hit;
            }
            let size = serde_json::to_vec(&value)
                .map_err(ToolError::storage)?
                .len()
                + 1;
            if bytes + size > 512 * 1024 - 128 {
                more = true;
                break;
            }
            bytes += size;
            last = Some(key(&summary, &sort));
            response.push(value);
        }
        let next = if more {
            Some(self.next_cursor(
                binding,
                Position::Note(last.ok_or_else(|| {
                    ToolError::new("CONTENT_TOO_LARGE", "Summary exceeds response limit")
                })?),
            )?)
        } else {
            None
        };
        Ok(json!({"items":response,"nextCursor":next}))
    }
    fn list_folders(&mut self, ctx: &TrustedContext, input: PageInput) -> ToolResult<Value> {
        let n = limit(input.limit)?;
        let binding = self.cursor_binding(ctx, json!(["folders", n]))?;
        let after = match self.cursor_position(input.cursor.as_deref(), &binding)? {
            Some(Position::Folder(id)) => Some(id),
            None => None,
            _ => {
                return Err(ToolError::new(
                    "CURSOR_EXPIRED",
                    "Cursor belongs to another tool",
                ))
            }
        };
        let folders = self
            .session
            .store
            .application_folders()
            .map_err(ToolError::storage)?;
        let mut visible: Vec<_> = folders
            .iter()
            .filter(|f| {
                ctx.folder_ids.contains(&f.id)
                    && matches!(f.kind.as_str(), "default" | "quick" | "normal")
                    && after.as_ref().is_none_or(|id| f.id > *id)
            })
            .collect();
        visible.sort_by(|a, b| a.id.cmp(&b.id));
        let more = visible.len() > n;
        visible.truncate(n);
        let items: Vec<_> = visible
            .iter()
            .map(|f| {
                let mut path = vec![];
                let mut parent = f.parent_id.clone();
                let mut seen = HashSet::new();
                while let Some(id) = parent {
                    if !seen.insert(id.clone()) {
                        break;
                    }
                    let Some(p) = folders.iter().find(|f| f.id == id) else {
                        break;
                    };
                    path.push(p.name.clone());
                    parent = p.parent_id.clone();
                }
                path.reverse();
                json!({"id":f.id,"name":f.name,"ancestorLabels":path})
            })
            .collect();
        let next = if more {
            Some(self.next_cursor(
                binding,
                Position::Folder(visible.last().unwrap().id.clone()),
            )?)
        } else {
            None
        };
        Ok(json!({"items":items,"nextCursor":next}))
    }
    fn read(&mut self, ctx: &TrustedContext, input: ReadInput) -> ToolResult<Value> {
        let note = self.session.store.application_note(ctx, &input.note_id)?;
        let summary = self.summary(&note)?;
        let format = input.format.unwrap_or(Format::Text);
        let binding =
            self.cursor_binding(ctx, json!(["read", input.note_id, summary.version, format]))?;
        let position = match self.cursor_position(input.content_cursor.as_deref(), &binding)? {
            Some(Position::Content(offset)) => offset,
            None => 0,
            _ => {
                return Err(ToolError::new(
                    "CURSOR_EXPIRED",
                    "Cursor belongs to another tool",
                ))
            }
        };
        let (doc, _, _) = self.session.store.application_projection(&note)?;
        let mut result = serde_json::to_value(summary).map_err(ToolError::storage)?;
        result["format"] = json!(format);
        let mut next = None;
        result["content"] = match format {
            Format::Document => {
                if input.content_cursor.is_some() {
                    return Err(ToolError::new(
                        "SCHEMA_INVALID",
                        "Document content cannot be paged",
                    ));
                }
                if serde_json::to_vec(&doc).map_err(ToolError::storage)?.len() > MAX_CONTENT {
                    return Err(ToolError::new(
                        "CONTENT_TOO_LARGE",
                        "Document exceeds 1 MiB; read text instead",
                    ));
                }
                doc
            }
            Format::Text => {
                let text = readable_text(&doc);
                if position > text.len() || !text.is_char_boundary(position) {
                    return Err(ToolError::new("CURSOR_EXPIRED", "Invalid content cursor"));
                }
                let mut end = (position + 32768).min(text.len());
                while !text.is_char_boundary(end) {
                    end -= 1;
                }
                if end < text.len() {
                    next = Some(self.next_cursor(binding, Position::Content(end))?);
                }
                json!(&text[position..end])
            }
        };
        result["truncated"] = json!(next.is_some());
        result["nextContentCursor"] = json!(next);
        Ok(result)
    }
}
