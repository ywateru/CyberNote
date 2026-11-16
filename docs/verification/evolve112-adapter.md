# evolve-112 独立 stdio 适配器验证

日期：2026-11-17。范围仅 `crates/notes-mcp/**`、本验证记录及 crate README。工作树 `/Users/water/work/2026/Apple-Notes-Clone-evolve112-adapter`，分支 `codex/evolve-112-adapter`。

## 结论与边界

交付官方 Rust MCP SDK 驱动的独立 `cybernote-mcp`，固定九工具，经真实 stdio 子进程转发到临时 Unix fixture。**这是传输/SDK 集成验证，不是最终真实宿主验收**。fixture 只返回显式合成 DTO，不持有应用 Session、SQLite 或 Store，也不证明落盘、窗口刷新、CAS、幂等、锁定排除或业务撤销。

没有启动用户应用、读取原凭据、修改 `~/.codex`、创建/删除/管理工作树或合并其他分支；没有改宿主、前端、根包锁或架构契约。只读了指定工作树两份架构文档，以及主线 `docs/architecture/agent-ipc.md` 新增的 macOS socket 路径约束。

## SDK/API 与协议

`cargo search rmcp --registry crates-io --limit 3` 返回 `rmcp = "3.10.0"`；官方 [rust-sdk rmcp-v3.10.0](https://github.com/modelcontextprotocol/rust-sdk/releases/tag/rmcp-v3.10.0) 发布于2026-11-12。依赖精确 `=3.10.0`，crate 内独立 `Cargo.lock`；`server`、`transport-io`，无自制 MCP 协议循环。

检索并使用该 tag/安装源码的 `ServerHandler`、`ServerConfig`、`Tool`/annotations、`CallToolRequestParams`/`CallToolResponse`、`CallToolResult::{structured,structured_error}`、`transport::{stdio_pipes,async_rw::AsyncRwTransport}` 和 `ServiceExt::serve`。只协商 `2025-11-25`，仅声明 tools。已知工具非法 envelope 在 SDK custom-request handler 返回 `-32602`，未知工具 `-32601`；工具输入值/严格 schema 校验失败遵循 [官方 tools 错误语义](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) 返回 `SCHEMA_INVALID` + `isError: true`。

SDK stdio 解析对不可解析 JSON/超长行有界丢弃，并恢复下一条合法请求；不会为无法关联 ID 的坏字节强造应答。已将输入行限制设为2 MiB（含换行），没有依赖默认16 MiB。IPC 的2 MiB限制也包含换行，独立检查。

## 命令与结果

环境：macOS Darwin 25.4.0 arm64，`rustc 1.97.1 (8bab26f4f 2026-07-14)`，`cargo 1.97.1 (c980f4866 2026-06-30)`。

从指定适配器工作树执行：

```sh
cargo fmt --manifest-path crates/notes-mcp/Cargo.toml -- --check
cargo clippy --manifest-path crates/notes-mcp/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path crates/notes-mcp/Cargo.toml --locked -- --nocapture
cargo build --manifest-path crates/notes-mcp/Cargo.toml --locked --release
crates/notes-mcp/target/release/cybernote-mcp --help
git diff --check
```

结果：所有上述命令退出码0；fmt 和 diff 无错误，Clippy 在 `-D warnings` 下通过。`cargo test` 为8个 Rust harness 测试通过，其中1个测试启动 Python 标准库 suite，11个真实 stdio/Unix fixture 用例全部通过（29.410秒）；0失败。随后增强写并发观测，单独重跑 `StdioFixture.test_read_limit_write_serialization_and_bounded_queue` 通过，观测最大同时处理写请求数为1。

release 构建成功（1m06s），产物为 Mach-O arm64：

```text
/Users/water/work/2026/Apple-Notes-Clone-evolve112-adapter/crates/notes-mcp/target/release/cybernote-mcp
SHA-256: 3ff8c53333bfc51d34c0d99ca00a1760123cd121b0bb9df013765a4c0df2ec03
```

`--help` 退出码0，仅 stderr 输出用法。对 release 产物额外运行以下两项真实 stdio fixture smoke，2项均通过（0.229秒），仍属于临时 Unix fixture 验证：

```sh
python3 crates/notes-mcp/tests/stdio_fixture.py crates/notes-mcp/target/release/cybernote-mcp StdioFixture.test_nine_tools_schemas_annotations_and_real_unix_roundtrip StdioFixture.test_official_tool_input_errors_and_unknown_tool_protocol_error
```

`cargo tree --locked --depth 1` 仅列出 jsonschema/libc/rmcp/serde/serde_json/tokio/uuid/zeroize 和开发依赖 tempfile；无 SQLite/Store/Tauri 依赖。

## 已覆盖的 fixture 用例

| 层 | 证据 |
| --- | --- |
| 真实 SDK stdio | 子进程 initialize/initialized、固定协议、仅 tools 能力、九工具发现、严格 schemas/annotations、九工具各一次真实 Unix 往返、请求 UUID 唯一、参数原样转发、JSON text 与 structuredContent 等值、EOF 退出 |
| 官方错误语义 | 未知工具协议错误；非法 envelope invalid-params；字段/枚举/范围/UUID/类型非法为 ToolError；host 业务错误、已提交的错误回执保持 committed/operationId；DTO/isError 不一致拒绝 |
| IPC framing | 精确2 MiB含换行接受，多1字节拒绝；无换行 EOF、超大未换行帧、错 requestId/UUID/版本、未知/缺少/重复字段、坏 JSON、无效 UTF-8、原始凭据回显拒绝；每次失败至多连接一次 |
| 私有路径 | runtime/credentials/socket/凭据 mode 不符拒绝；凭据 symlink/hardlink、runtime 祖先 symlink、socket symlink、库绑定不符、socket 逃逸和 `..` 拒绝；socket dev/inode 替换拒绝 |
| socket 长度 | 基于平台 sockaddr_un.sun_path，验证完整路径字节容量减1允许、达到容量拒绝；中文多字节不可用字符数代替字节数；macOS 上限103字节含路径、不含结尾 NUL |
| 输出及正文界限 | query/limit 边界、中文 UTF-8 1 MiB 输入、深度64和对象节点20,000、text 响应32 KiB、列表512 KiB、document 截断拒绝、响应 workspace/note 绑定拒绝 |
| 生命周期/凭据 | 每次重读合成 credential/clientId；等待响应时删除凭据则不交付旧正文；宿主 socket 不存在返回 HOST_UNAVAILABLE；全程不启动宿主 |
| 有界执行 | 读并发4、写并发1/等待8；超额 RATE_LIMITED；真实5秒读/20秒写超时；取消后保持会话可用；写入无自动重试 |

跨 UID 的文件/peer 负例没有用另一个真实用户运行；代码在文件 metadata 和 Unix peer credential 两层检查有效 UID，fixture 验证正常当前 UID 路径。没有把同 UID 的路径检查称为业务授权，也没有把 fixture 文件删除称为真实宿主 grant 撤销验收。

## 宿主集成点与剩余验收

1. 凭据和端点由真实 `agent_access/agent_host` 创建：严格 record v1、当前用户0700/0600、短 socket basename、完整路径字节校验；host 每连接重新认证，绑定 workspace/incarnation/client/grant。适配器不创建端点。
2. 对齐 README 中 capabilities、folders、search 命中及 get_operation 的具体成功 DTO；架构原文未完整指定这些字段，当前严格 schema 以 crate `src/schema.rs` 为准，不把适配器字段选择写回设计契约。宿主 limits 必须为实际限制，取应用与适配器上限交集。
3. 真实 Session/SQLite 验证九工具、范围/locked/trash、中文搜索、cursor/version、document schema/附件归属、有损更新拒绝、并发 CAS、窗口活动保护、原子 create/持久幂等、响应丢失后原 key 恢复、重启读取和撤销后不交付。
4. 验证真实窗口刷新/Undo/附件 owner、同步 dirty 和可选 Android 同步；由实际应用 receipt 和重启后的内容作证，不能用 metadata 事件或 fixture MutationResult 代替。
5. README 提供 [官方 Codex CLI 配置](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) 的静态 TOML：`mcp_servers.<name>` 下 command/args/cwd、startup_timeout_sec/tool_timeout_sec。该页面已实际读取；未写配置，也未将本次 Python stdio 客户端称为 Codex CLI 实测。实际授权配置和 CLI→真实宿主联调留给主线。

写入响应丢失、取消或超时不能证明未提交：有 operationId 先查询；否则仅由调用方以原工具、原参数、原 idempotencyKey 恢复，适配器不生成替代 key 或自动重发。
