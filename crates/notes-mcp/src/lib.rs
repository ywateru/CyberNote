#![cfg(unix)]
pub mod ipc;
pub mod schema;
pub mod security;
use rmcp::{ErrorData as McpError, RoleServer, ServerHandler, model::*, service::RequestContext};
use serde_json::{Value, json};
use std::{borrow::Cow, sync::Arc};
use tokio::sync::Semaphore;

#[derive(Clone)]
pub struct Adapter {
    config: security::Config,
    definitions: Arc<Vec<schema::Definition>>,
    reads: Arc<Semaphore>,
    write_slots: Arc<Semaphore>,
    writer: Arc<Semaphore>,
}
impl Adapter {
    pub fn new(config: security::Config) -> Self {
        Self {
            config,
            definitions: Arc::new(schema::definitions()),
            reads: Arc::new(Semaphore::new(4)),
            write_slots: Arc::new(Semaphore::new(9)),
            writer: Arc::new(Semaphore::new(1)),
        }
    }
    async fn execute(&self, name: &str, args: &Value) -> (Value, bool) {
        let busy = || {
            (
                ipc::error("RATE_LIMITED", "Adapter concurrency limit reached", true),
                true,
            )
        };
        let _slot = match if schema::write(name) {
            self.write_slots.try_acquire()
        } else {
            self.reads.try_acquire()
        } {
            Ok(p) => p,
            Err(_) => return busy(),
        };
        let deadline = std::time::Duration::from_secs(if schema::write(name) { 20 } else { 5 });
        let result = tokio::time::timeout(deadline, async {
            let _writer = if schema::write(name) {
                Some(self.writer.acquire().await.expect("writer semaphore stays open"))
            } else {
                None
            };
            ipc::call(&self.config, name, args).await
        })
        .await
        .unwrap_or_else(|_| {
            Err(ipc::error(
                "TIMEOUT",
                "Adapter deadline exceeded; a write may have committed; recover using original key and parameters",
                false,
            ))
        });
        result.unwrap_or_else(|e| (e, true))
    }
}
impl ServerHandler for Adapter {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_protocol_version(ProtocolVersion::V_2025_11_25)
            .with_server_info(Implementation::new(
                "cybernote-mcp",
                env!("CARGO_PKG_VERSION"),
            ))
    }
    fn supported_protocol_versions(&self) -> Cow<'static, [ProtocolVersion]> {
        Cow::Owned(vec![ProtocolVersion::V_2025_11_25])
    }
    async fn list_tools(
        &self,
        request: Option<PaginatedRequestParams>,
        _: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, McpError> {
        if request.is_some_and(|r| r.cursor.is_some()) {
            return Err(McpError::invalid_params(
                "Tool catalog has no pagination cursor",
                None,
            ));
        }
        Ok(ListToolsResult::with_all_items(
            self.definitions.iter().map(|d| d.tool.clone()).collect(),
        ))
    }
    fn get_tool(&self, name: &str) -> Option<Tool> {
        self.definitions
            .iter()
            .find(|d| d.tool.name == name)
            .map(|d| d.tool.clone())
    }
    async fn on_custom_request(
        &self,
        request: CustomRequest,
        _: RequestContext<RoleServer>,
    ) -> Result<CustomResult, McpError> {
        // rmcp's extensible request decoder falls back here for malformed known requests.
        // Keep parsing/routing in the SDK while distinguishing bad params from unknown methods.
        if matches!(request.method.as_str(), "tools/call" | "tools/list") {
            Err(McpError::invalid_params(
                "Malformed tool request parameters",
                None,
            ))
        } else {
            Err(McpError::new(
                ErrorCode::METHOD_NOT_FOUND,
                "Unknown method",
                None,
            ))
        }
    }
    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, McpError> {
        let Some(d) = self
            .definitions
            .iter()
            .find(|d| d.tool.name == request.name)
        else {
            return Err(McpError::new(
                ErrorCode::METHOD_NOT_FOUND,
                "Unknown tool",
                None,
            ));
        };
        let args = request
            .arguments
            .map(Value::Object)
            .unwrap_or_else(|| json!({}));
        // MCP distinguishes tool input validation from malformed tools/call envelopes.
        if !d.input.is_valid(&args) {
            return Ok(CallToolResult::structured_error(ipc::error(
                "SCHEMA_INVALID",
                "Arguments do not match the strict tool input schema",
                false,
            ))
            .into());
        }
        if args
            .get("idempotencyKey")
            .is_some_and(|k| uuid::Uuid::parse_str(k.as_str().unwrap_or_default()).is_err())
        {
            return Ok(CallToolResult::structured_error(ipc::error(
                "SCHEMA_INVALID",
                "Invalid UUID idempotencyKey",
                false,
            ))
            .into());
        }
        if args
            .get("content")
            .or_else(|| args.get("text"))
            .is_some_and(|v| !schema::bounded_content(v))
        {
            return Ok(CallToolResult::structured_error(ipc::error(
                "CONTENT_TOO_LARGE",
                "Input exceeds UTF-8 byte, depth or node limit",
                false,
            ))
            .into());
        }
        let (mut value, mut failed) = tokio::select! {
            result=self.execute(&request.name,&args)=>result,
            _=context.ct.cancelled()=> (ipc::error("TIMEOUT","Call cancelled; a write may have committed; recover with original key and parameters",false),true),
        };
        let is_error_shape = jsonschema::is_valid(&schema::error_schema(), &value);
        if !d.output.is_valid(&value) || failed != is_error_shape {
            value = ipc::error(
                "HOST_UNAVAILABLE",
                "Host returned a DTO or isError inconsistent with the declared schema; a write may have committed",
                false,
            );
            failed = true;
        }
        Ok(if failed {
            CallToolResult::structured_error(value)
        } else {
            CallToolResult::structured(value)
        }
        .into())
    }
}
