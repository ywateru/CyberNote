# cybernote-mcp stdio sidecar

独立 Rust 可执行程序，固定九个工具，转发到**正在运行**的桌面宿主私有 Unix protocol。它不打开 SQLite、不链接 Tauri/Store、不启动应用或第二个 Store，不持久保存工具结果或正文，也不自动重试写入。

此阶段通过的是临时 Unix fixture 的传输和真实 SDK stdio 进程测试。尚未完成实际 Session/SQLite、窗口、撤销和幂等的宿主验收；fixture 没有 Store，不能证明业务提交。

## 构建和运行

```sh
cargo build --release --locked --manifest-path crates/notes-mcp/Cargo.toml
cargo test --locked --manifest-path crates/notes-mcp/Cargo.toml
cargo clippy --locked --all-targets --manifest-path crates/notes-mcp/Cargo.toml -- -D warnings
```

以上命令从项目根目录执行，不依赖已经清理的开发worktree。独立 crate 自带 `Cargo.lock`，不会更新根或宿主的包锁。测试需要 Python 3 标准库；不需要用户凭据或运行桌面应用。设置`CARGO_TARGET_DIR`时，后续二进制位置以该目录为准；发布配置使用最终交付路径，不直接依赖开发缓存。

```text
/absolute/path/to/cybernote-mcp --workspace-id <id-from-app> --credential-ref <uuid-from-app> [--runtime-dir <absolute-private-directory>]
```

CLI 拒绝未知选项、重复选项、缺少值、非法引用 UUID 和相对 runtime 路径。`--help` 写 stderr；运行期间 stdout 只由 SDK 输出 MCP 消息。CLI 不接受原始 credential。

macOS 默认 runtime 为 OS 账户数据库中当前有效用户 home 下的 `Library/Application Support/com.local.notesclone/agent-runtime`；其他 Unix 使用绝对 `XDG_DATA_HOME`，否则账户 home 下 `.local/share`，再追加 `com.local.notesclone/agent-runtime`。不创建目录、文件或 socket；它们由授权 UI/宿主提供。不会在启动阶段访问凭据：发现工具不需要权限，实际调用每次加载并复核引用。

## SDK 与 MCP 版本

使用官方维护的 [modelcontextprotocol/rust-sdk](https://github.com/modelcontextprotocol/rust-sdk)，`rmcp = "=3.10.0"`，关闭默认 features，仅启用 `server` 和 `transport-io`。2026-11-17 经 `cargo search rmcp --registry crates-io` 和 [官方发布](https://github.com/modelcontextprotocol/rust-sdk/releases/tag/rmcp-v3.10.0) 核实该版本，发布日期 2026-11-12。

实际使用的固定版本 API：

- `ServerHandler::{get_info,supported_protocol_versions,list_tools,get_tool,call_tool,on_custom_request}`，`CallToolRequestParams` / `CallToolResponse`。
- `ServerConfig::new(ServerCapabilities::builder().enable_tools().build())`；仅支持 `ProtocolVersion::V_2025_11_25`，显式限制协商版本，不跟随 SDK 的默认最新协议。
- `transport::stdio_pipes()`、`transport::async_rw::AsyncRwTransport::new_server(...).with_max_line_length(...)`、`ServiceExt::serve` 和 `waiting`。初始化、通知、JSON-RPC、请求路由和 stdio 解析全部由 SDK 处理，没有自制 MCP 事件循环。
- `Tool::new` / `with_raw_output_schema` / `ToolAnnotations`；`CallToolResult::structured` 与 `structured_error` 同时生成 `structuredContent` 和等值 JSON text。

[官方 Tools 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) 将工具输入校验失败列为 Tool Execution Errors：因此缺字段、未知工具参数、格式或范围错误返回符合 ToolError schema 的 `SCHEMA_INVALID` + `isError: true`。超过 UTF-8/深度/节点限制返回 `CONTENT_TOO_LARGE`。未知工具是 JSON-RPC `-32601`，不合法的 `tools/call` envelope 由 SDK 路由到 handler，已知工具方法返回 `-32602` invalid-params，未知方法返回 `-32601`。SDK 对无法解析的 JSON/超长 stdio 行有界丢弃，继续处理下一行；不伪造可关联请求 ID 的应答。测试验证丢弃后的会话恢复。此 SDK 行为不等同于每个坏字节输入都返回 JSON-RPC Parse Error。

## 工具与严格边界

九工具：`notes_get_capabilities`、`notes_list_folders`、`notes_list`、`notes_search`、`notes_read`、`notes_create`、`notes_append`、`notes_update`、`notes_get_operation`。

每个 input 是 `additionalProperties: false` 的 object；output 是 `type: object`、`oneOf: [成功 DTO, ToolError]`，在运行时校验，`isError` 必须与 ToolError 分支一致。成功 DTO 和 ToolError 的元数据对象均拒绝额外字段。唯一开放的业务对象是契约定义的 `document` 正文，由真实宿主的应用 schema 完整验证。适配器检查 document/text 格式与类型对应、1 MiB UTF-8 或紧凑 JSON 字节，并与原生 `input_document` 逐项对齐资源遍历：根深度0，所有 JSON 值（包括标量）深度最多64；仅含 `type` 字段的对象计入20,000节点（含 mark），无 `type` 的 attrs/stroke 等辅助对象不计节点，仍受 bytes/depth/frame 限制。create/update 输入与 document read 输出使用同一检查。

`limit` 为 1–100（默认20），query 为 1–512 Unicode 字符。适配器额外约束：ID 1–1024 字符、不透明版本/cursor 1–8192 字符、最多100个 tag（各1–512字符）。不插入默认值、不改写正文或幂等键，验证后 arguments 原样转发；省略默认值由宿主执行。正文超限不截断。预览/片段最大240字符；text 响应最多32 KiB UTF-8；document 不允许分页或截断；list/search/folders 的结果 JSON 最大512 KiB。宿主仍需执行更严格的 Store/业务限制、正文投影及授权。

读工具标记 `readOnlyHint: true`，写工具 `readOnlyHint: false`、`idempotentHint: false`，update 标记 destructive。全部 `openWorldHint: false`。annotations 只作提示，不表示 grant 或替代宿主鉴权。

读并发最多4；写并发1、等待最多8；超额立即 `RATE_LIMITED`。读总期限5秒，写总期限20秒，包含本地排队和 IPC；不对写入自动重试。SDK cancellation 会丢弃当前 IPC future 并关闭连接；断开、取消、超时和协议异常都不能证明零提交，不添加虚假的 `committed: false`。保留宿主返回的 operationId/committed/currentVersion/retryAfterMs。已知 operationId 时查询原操作，否则由调用方使用原工具、原参数、原 idempotencyKey 恢复，不能换 key 重发。

## 私有凭据与 IPC

只打开 `runtime/credentials/<canonical-uuid>.json`。记录为严格 object：`version: 1, workspaceId, clientId, credential, socketPath`，未知/重复字段、版本不符、库绑定不符均拒绝。记录上限64 KiB；clientId 最多1024字节，credential 1–8192字节。只有文件和单次认证请求持有原始凭据；读取缓冲、请求帧及 record 中 credential 退出作用域时清零。不记录 token、正文、文件内容或实际 socket 路径，拒绝宿主在结果字符串/键中意外回显原始 credential。

使用 `openat(O_NOFOLLOW|O_CLOEXEC|O_NONBLOCK)` 从 `/` 逐层遍历，拒绝路径任一组成部分的符号链接。runtime、credentials 及 runtime 内的 socket 父目录要求 owner 为有效 UID、mode 精确0700；凭据为普通文件，owner 当前有效 UID、mode0600、硬链接数1；socket 必须处于 runtime 内，类型为 socket、owner 当前有效 UID、mode0600。连接后检查 peer UID，并在发送前、收到响应后重载引用、复核目录 dev/inode、socket dev/inode 和凭据身份变化。跨 UID 或无 peer credential 不能继续。宿主必须再次检查 grant/撤销、session/workspace incarnation 和授权范围；文件/UID 检查不证明业务授权。

遵循主线补充的 macOS socket 路径约束：宿主应采用短 basename，例如12位摘要加 `.sock`，不把完整 UUID 重复拼进长 runtime 路径。适配器在连接前检查**完整路径的文件系统字节数严格小于本平台 `sockaddr_un.sun_path` 容量**（macOS104，含 NUL 后实际最多103字节；Linux108，实际最多107字节）。超限返回不含实际路径的 `HOST_UNAVAILABLE`，提示选择较短私有 `--runtime-dir`；不截断、不寻找替代端点。basename 由宿主生成，不强制将文档示例的12位摘要当固定命名正则。

每次 tools/call 生成 UUID requestId，使用一个 Unix 连接、一个请求和一个响应。严格 wire 字段与 `docs/architecture/agent-ipc.md` 相同：

```text
request  = {version:1, requestId, workspaceId, clientId, credential, tool, arguments}
response = {version:1, requestId, result:object, isError:boolean}
```

UTF-8 JSON + `\n`，完整帧（包括换行）最多2 MiB；读循环受此硬界限约束，EOF 没有换行拒绝，不使用无界 `read_to_end` 读取 IPC。requestId、版本、必需字段、额外/重复字段及 DTO 结构均检查。连接失败/不完整帧/无效响应映射 `HOST_UNAVAILABLE`，本地身份失败为 `UNAUTHORIZED`，记录绑定库不匹配为 `WORKSPACE_UNAVAILABLE`。没有后台重连或结果缓存。

## 成功 DTO 契约

按2026-11-17只读的主线 `docs/architecture/agent-mcp.md` 完整成功 DTO 对齐。根对象、limits、NoteSummary 扩展和 match 均保持 `additionalProperties: false`，所有 canonical limits 字段均必需：

| 工具 | 成功 DTO |
| --- | --- |
| capabilities | `{apiVersion:1, schemaVersion:1, workspaceId:string, scopes:string[], tools:string[], formats:("text"\|"document")[], hostSessionId:string, limits:{maxLimit,maxQueryCharacters,maxContentBytes,maxDocumentBytes,maxFrameBytes,maxTextPageBytes,maxListBytes,maxJsonDepth,maxNodes,idempotencyRetentionDays,queryDeadlineMs,writeDeadlineMs,maxConcurrentReads,maxConcurrentWrites,maxQueuedWrites}}`，两个版本字段为整数常量1，limits 均为非负安全整数 |
| folders | `{items:[{id,name,ancestorLabels:string[]}], nextCursor:string\|null}`；祖先只暴露标签，无范围外 ID 或计数 |
| search | `{items:[NoteSummary & {match:{field:"title"\|"content", snippet:string}}], nextCursor:string\|null}`；snippet 最多240个 Unicode 字符，tags 仅作为输入过滤 |
| get_operation | 已提交时为原 MutationResult；否则 `{status:"pending"\|"not_found", operationId:string}` |

契约测试和真实 stdio 临时 Unix fixture 共用 `tests/fixtures/query-success.json` 中的 capabilities、search 与 ToolError；该文件可供主线宿主互校。旧字符串版本、`maxInputBytes`、缺少任何 canonical limit、旧 `matchedFields`/顶层 snippet、`match.field="tags"` 和额外字段均拒绝。`writeDeadlineMs` 披露宿主业务协调期限（fixture 为15000），适配器 IPC 写期限仍为20000毫秒。111实际 service fixture 已包含 `maxDocumentBytes` / `maxFrameBytes`；运行中宿主的完整接通仍需另行验证。

跨模块兼容证据来自 `tests/fixtures/service-success.json`：从 evolve-111 commit `868c6dcf960cb3c92f3c9330ec22fbaf7431fe91` 的 `src-tauri/src/application/fixtures/service-success.json` 原样复制，共12个实际 NotesApplicationService 合成输出，覆盖九工具、text/document read 和 committed/pending/not_found operation。复制时与该 commit 的 Git blob 逐字节比较；`service-success.source.json` 保留来源 commit、路径、Git blob 与 SHA-256。Rust 测试检查全部 input/output schemas 和严格额外字段拒绝；真实 stdio/Unix fixture 原样回放这些输出，同时对九工具保留宿主 ServerError/scope-denied 对应的 ToolError + `isError: true` 分支。

以下检查无需存在111工作树；fixture 指纹也由 stdio 测试校验：

```sh
cargo test --locked --manifest-path crates/notes-mcp/Cargo.toml --test query_contract actual_application_service_fixture_validates_all_nine_tool_schemas
python3 crates/notes-mcp/tests/stdio_fixture.py crates/notes-mcp/target/release/cybernote-mcp StdioFixture.test_application_service_fixture_cross_module
```

若要从来源 commit 复核副本字节，可执行只读比较：

```sh
git show 868c6dcf960cb3c92f3c9330ec22fbaf7431fe91:src-tauri/src/application/fixtures/service-success.json | cmp - crates/notes-mcp/tests/fixtures/service-success.json
```

111的 provenance 表明源 fixture 由真实 NotesApplicationService 经临时 production Session/SQLite 生成，但窗口回复是 native test inputs。适配器本轮仅回放该 fixture，不将其称为运行中真实宿主、WebView 或业务授权验收；本轮没有修改111或宿主 scope/ServerError 实现。

`tests/fixtures/document-boundary.json` 增补节点/depth 边界：在固定 production commit `eb9cee7d3ad1bf90a317ce9c286c653094512f90` 的隔离归档内运行真实 Session/SQLite，取得20,000节点/779,987字节文档及合法 depth 64 drawing 文档的 create/update/read 六组实际 DTO。另行标注的 resourceCases 只对照原生资源遍历，不能当作合法业务文档。来源、生成测试和 fixture 的 SHA-256 记录在 `document-boundary.source.json`。正式 Rust 与 stdio suite 原样消费该 fixture，同时拒绝20,001节点和 depth 65 的输入/输出。

可复跑生成检查（仅提取 Git 对象到新临时目录，使用 `/tmp/evolve112-adapter-native-boundary-target`，不操作111工作树或主 Tauri target；重新生成会更新带随机 ID 的 fixture 及其来源指纹）：

```sh
python3 -B crates/notes-mcp/tests/generate_document_boundary.py
cargo test --locked --manifest-path crates/notes-mcp/Cargo.toml --test document_contract
python3 -B crates/notes-mcp/tests/stdio_fixture.py crates/notes-mcp/target/release/cybernote-mcp StdioFixture.test_actual_document_boundary_create_update_read StdioFixture.test_document_over_node_and_depth_limits_rejected_both_directions StdioFixture.test_resource_walk_agrees_with_native_without_claiming_schema_validity
```

宿主负责所有工具权限、locked/trash/范围过滤、search 语义、分页与版本、文档节点/附件归属、有损覆盖保护、CAS/窗口协调、原子提交、持久幂等及重新交付前撤销复核。适配器不将 fixture 的模拟回执解释为真实提交。

## Codex CLI 静态配置示例

字段依据 [官方 MCP 配置文档（CLI）](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)，2026-11-17 读取。以下为**静态模板**，workspace 和 credential-ref 必须替换为宿主授权 UI 提供的值。本次没有修改用户配置，也没有运行 Codex CLI 对真实宿主的集成验收。

```toml
[mcp_servers.cybernote]
command = "/absolute/path/to/cybernote-mcp"
args = ["--workspace-id", "workspace-id-from-agent-access", "--credential-ref", "credential-ref-uuid-from-agent-access"]
startup_timeout_sec = 10
tool_timeout_sec = 30
```

如使用短私有 runtime，显式在 args 增加 `--runtime-dir` 及相应绝对路径，且须与该宿主实例一致。MCP 客户端30秒工具期限大于适配器20秒写期限，便于接收结构化超时结果；仍不代表写入可以自动重试。实际安装配置、host 启用和 CLI 联调由主线完成。
