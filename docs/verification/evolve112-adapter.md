# evolve-112 独立 stdio 适配器验证

日期：2026-11-17。范围仅 `crates/notes-mcp/**`、本验证记录及 crate README。工作树 `/Users/water/work/2026/Apple-Notes-Clone-evolve112-adapter`，分支 `codex/evolve-112-adapter`。

## 结论与边界

交付官方 Rust MCP SDK 驱动的独立 `cybernote-mcp`，固定九工具，经真实 stdio 子进程转发到临时 Unix fixture。**这是传输/SDK 集成验证，不是最终真实宿主验收**。fixture 只返回显式合成 DTO，不持有应用 Session、SQLite 或 Store，也不证明落盘、窗口刷新、CAS、幂等、锁定排除或业务撤销。

没有启动用户应用、读取原凭据、修改 `~/.codex`、创建/删除/管理工作树或合并其他分支；没有改宿主、前端、根包锁或架构契约。只读了指定工作树两份架构文档，以及主线 `docs/architecture/agent-ipc.md` 新增的 macOS socket 路径约束和最新 `agent-mcp.md` 完整成功 DTO。

## SDK/API 与协议

`cargo search rmcp --registry crates-io --limit 3` 返回 `rmcp = "3.10.0"`；官方 [rust-sdk rmcp-v3.10.0](https://github.com/modelcontextprotocol/rust-sdk/releases/tag/rmcp-v3.10.0) 发布于2026-11-12。依赖精确 `=3.10.0`，crate 内独立 `Cargo.lock`；`server`、`transport-io`，无自制 MCP 协议循环。

检索并使用该 tag/安装源码的 `ServerHandler`、`ServerConfig`、`Tool`/annotations、`CallToolRequestParams`/`CallToolResponse`、`CallToolResult::{structured,structured_error}`、`transport::{stdio_pipes,async_rw::AsyncRwTransport}` 和 `ServiceExt::serve`。只协商 `2025-11-25`，仅声明 tools。已知工具非法 envelope 在 SDK custom-request handler 返回 `-32602`，未知工具 `-32601`；工具输入值/严格 schema 校验失败遵循 [官方 tools 错误语义](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) 返回 `SCHEMA_INVALID` + `isError: true`。

SDK stdio 解析对不可解析 JSON/超长行有界丢弃，并恢复下一条合法请求；不会为无法关联 ID 的坏字节强造应答。已将输入行限制设为2 MiB（含换行），没有依赖默认16 MiB。IPC 的2 MiB限制也包含换行，独立检查。

## 初始提交命令与结果

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
2. 适配器 schema/fixture 已按主线完整成功 DTO 对齐：版本均为整数1、15个 canonical limits、search 的严格 `match`。111实际 service fixture 已包含 `maxDocumentBytes` / `maxFrameBytes`，九工具成功 DTO 的跨模块 schema 校验见下节；后续继续验证运行中宿主的实际接通。宿主 limits 必须为实际限制，取应用与适配器上限交集；本次未修改后端或设计契约。
3. 真实 Session/SQLite 验证九工具、范围/locked/trash、中文搜索、cursor/version、document schema/附件归属、有损更新拒绝、并发 CAS、窗口活动保护、原子 create/持久幂等、响应丢失后原 key 恢复、重启读取和撤销后不交付。
4. 验证真实窗口刷新/Undo/附件 owner、同步 dirty 和可选 Android 同步；由实际应用 receipt 和重启后的内容作证，不能用 metadata 事件或 fixture MutationResult 代替。
5. README 提供 [官方 Codex CLI 配置](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) 的静态 TOML：`mcp_servers.<name>` 下 command/args/cwd、startup_timeout_sec/tool_timeout_sec。该页面已实际读取；未写配置，也未将本次 Python stdio 客户端称为 Codex CLI 实测。实际授权配置和 CLI→真实宿主联调留给主线。

写入响应丢失、取消或超时不能证明未提交：有 operationId 先查询；否则仅由调用方以原工具、原参数、原 idempotencyKey 恢复，适配器不生成替代 key 或自动重发。


## 增量契约修订（2026-11-17）

只读主线最新 `agent-mcp.md` 后修订，SDK/IPC/授权边界未变：capabilities 的 `apiVersion` / `schemaVersion` 为整数常量1；limits 精确采用15个 canonical 键，移除 `maxInputBytes` 并使用 `maxContentBytes`；search 为 `NoteSummary & {match:{field:"title"|"content",snippet}}`，tags 仅作为输入 filter。所有层级继续拒绝额外字段，无兼容旧别名或放宽 additionalProperties。

新增共享 `tests/fixtures/query-success.json`，供 Rust outputSchema 契约测试与实际 SDK stdio/Unix fixture 同时消费，也供主线后续宿主互校。覆盖旧字符串版本、版本非1、逐个缺少/非法 limits、旧 limit 别名、旧 matchedFields/顶层 snippet、tags 命中、缺字段/嵌套未知字段及 Unicode snippet 240/241 边界。真实 stdio 校验错误仍为 ToolError + isError，text 与 structuredContent 保持等值。folders/get_operation 契约保持一致。

本轮最终命令与结果（均退出码0）：

```sh
cargo fmt --manifest-path crates/notes-mcp/Cargo.toml -- --check
cargo clippy --manifest-path crates/notes-mcp/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path crates/notes-mcp/Cargo.toml --locked -- --nocapture
cargo build --manifest-path crates/notes-mcp/Cargo.toml --locked --release
python3 crates/notes-mcp/tests/stdio_fixture.py crates/notes-mcp/target/release/cybernote-mcp StdioFixture.test_nine_tools_schemas_annotations_and_real_unix_roundtrip StdioFixture.test_canonical_query_dtos_keep_strict_output_validation
git diff --check
```

新增契约测试3项通过，既有传输 harness 8项通过（其中包含12项 stdio/Unix fixture，29.631秒），0失败；Clippy 无警告。release 重建19.28秒；对该产物的九工具及 canonical DTO 两项 smoke 通过（0.998秒）。当前 arm64 可执行路径不变，SHA-256 更新为：

```text
3f623265f1b675cc7f3d3ea8c0dcb549fb923c9e40e0498f38d66b577a1f19a6
```

上节原有构建时间与指纹为初始提交记录。本轮仍不是最终真实宿主验收，没有访问后端/用户凭据/用户配置；未改 SDK 版本或任何包锁。


## 跨模块实际 service fixture 校验（2026-11-17）

根据111已提交实现，读取并原样复制以下非敏感合成产物，未修改111工作树：

- 来源 commit：`868c6dcf960cb3c92f3c9330ec22fbaf7431fe91`。
- 来源路径：`src-tauri/src/application/fixtures/service-success.json`。
- 来源 Git blob：`c9943b3e096d68c0ce102906397b3bdb2b9d81e4`。
- SHA-256：`62f905dc9de8fc01da3a955f8224ed183b8ecf77d0a149ebf3b33cc1cfef6f32`。
- crate 内副本：`crates/notes-mcp/tests/fixtures/service-success.json`，来源记录为同目录 `service-success.source.json`。

复制前已将111工作树文件与 `git show <sourceCommit>:<sourcePath>` 逐字节比较一致；JSON 未重新序列化。测试运行仅依赖副本，不依赖111工作树或用户凭据。Rust 契约测试逐例校验12个实际 service input、成功 output 和公布的 success/ToolError 联合 schema，确保九工具全覆盖、read 的 text/document 和 operation 的 committed/pending/not_found 均被检查；附加字段仍拒绝。成功不能误命中 ToolError 分支。

stdio/Unix fixture 使用原 arguments 和原结果回放全部12例，校验 structuredContent、等值 JSON text、isError:false 和请求原样传输；并对同一组工具验证 host scope-denied ToolError + isError:true、不重试。宿主 ServerError/scope 实现保持宿主所有，本次没有改动或绕过。原适配器自行构造的边界 fixture 继续用于坏字段/限额回归，但不再作为跨模块成功兼容的唯一证据。

来源 provenance 为 “Actual NotesApplicationService over temporary production Session/SQLite; protocol replies are native test inputs, not real WebViews”。适配器本次回放是跨模块 DTO/SDK/Unix 传输证据，仍不等于实际运行宿主/真实 WebView 接通或授权撤销验收。

本轮命令均退出码0：

```sh
cargo fmt --manifest-path crates/notes-mcp/Cargo.toml -- --check
cargo clippy --manifest-path crates/notes-mcp/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path crates/notes-mcp/Cargo.toml --locked -- --nocapture
cargo build --manifest-path crates/notes-mcp/Cargo.toml --locked --release
python3 crates/notes-mcp/tests/stdio_fixture.py crates/notes-mcp/target/release/cybernote-mcp StdioFixture.test_application_service_fixture_cross_module
git diff --check
```

4项契约测试、8项传输 harness 全部通过，后者包含13项真实 stdio/Unix fixture（30.360秒）。release 构建通过（0.23秒，生产代码未改），对 release 的实际 service fixture 12例成功及12例 scope error 回放通过（0.831秒）。可执行 SHA-256 仍为 `3f623265f1b675cc7f3d3ea8c0dcb549fb923c9e40e0498f38d66b577a1f19a6`。fmt/Clippy/diff 检查通过。无 schema 放宽、无宿主/前端/契约/包锁更改。

## 独审 F1 修复：document 节点与 depth 对齐（2026-11-17）

独审基线为 `a84e36ff0e3509941f1281f14ea5b2e8c1417932` 的报告。此次仅修 adapter 的共享正文资源遍历，增加对应回归/生成器/fixture 并更新作者说明；没有修改独审报告、任务状态、111、host、根依赖或其他工作树。此处是作者修复证据，仍待独立复核。

`schema::bounded_content` 原先把每个 object 都计节点，并以容器深度 `<64` 截断，错误收缩公开契约。现在逐项对照真实 `application/document.rs::input_document`：根深度0，所有 JSON 值（含标量、空容器）深度 `<=64`；只有包含 `type` 字段的对象计入20,000节点（包括 mark）；无 `type` 的 attrs/stroke 等辅助对象不计节点。create/update 输入与 notes_read 输出继续共用此函数。1 MiB UTF-8/紧凑 JSON 正文、2 MiB含换行帧限制、20,000 cap、严格工具 schema 与宿主业务 schema 验证责任均保留。

### 原始独立失败及修复后原样复跑

保持以下独立文件和旧二进制字节不变：

| 文件 | SHA-256 |
| --- | --- |
| `/tmp/evolve112-actual-node-boundary.json` | `5966d0b580c459ba02e814f93853ba870a371674c9100372130bb7f12b1e1396` |
| `/tmp/evolve112-f1-probe.py` | `b4c3585bda2fcedfd2032828b7eb6e6a949183e750fe6781b21122c854a8b6b6` |
| `/tmp/evolve112-independent.py` | `256718a811f6c4b4564adbd4d167e49507e81849fda0970b621c435c7a16a942` |
| `/tmp/evolve112-independent-release.py` | `4ac34e96507d17ab891b846309d42db2c118a6aa39d779224754f982fdde0b9e` |
| `/tmp/evolve112-f1-original-cybernote-mcp` | `3f623265f1b675cc7f3d3ea8c0dcb549fb923c9e40e0498f38d66b577a1f19a6` |

```sh
python3 -B /tmp/evolve112-f1-probe.py --binary /tmp/evolve112-f1-original-cybernote-mcp --expect blocked
python3 -B /tmp/evolve112-f1-probe.py --binary /Users/water/work/2026/Apple-Notes-Clone-evolve112-adapter/crates/notes-mcp/target/release/cybernote-mcp --expect pass
```

两条均退出0。旧二进制 create 在发 IPC 前拒绝、read 在收到一次 IPC 后拒绝，均 CONTENT_TOO_LARGE。修复后 create/read 均成功，与独立真实 service DTO 逐值相等，累计 IPC 请求分别1/2。文档仍为20,000个含 type 对象、39,999个总 object、779,987字节；紧凑有序 JSON SHA-256 为 `cb8343980dda85ab89f1d76c1fb7d8953d78041ee1e6f0c63277d83cc9117475`。

### 正式跨模块回归与来源

新增 `tests/native/document_boundary.rs` 和 `tests/generate_document_boundary.py`：从本仓库只读 Git 对象提取固定111 production commit `eb9cee7d3ad1bf90a317ce9c286c653094512f90` 到临时目录，仅追加作者测试模块，调用真实生产 harness/Session/SQLite。没有运行或修改111工作树，没有替换业务实现，不使用主 Tauri target。目标为 `/tmp/evolve112-adapter-native-boundary-target`。

定向真实 service 测试1 passed（201 filtered，6.50秒），验证：

- 20,000节点/779,987字节原形 heading 文档真实 create、update 至 revision2、document read 完全相等。
- doc→30层 blockquote→drawing 的合法文档，空 strokes 辅助 array 位于 JSON depth64；真实 create/update/read 全部成功。该边界可捕获原 adapter 对 depth64 空容器的误拒绝。
- 20,001节点和标量位于 depth65 的合法 Editor 形状，真实 create/update 均 SCHEMA_INVALID；已有笔记数、版本及完整内容保持不变。
- 单独通过真实 input_document 检查 depth64/65 的 null/object/array 叶值，以及含 type 的 mark 20,000/20,001计数。这些 `resourceCases` 仅证明资源遍历一致，不声称通过完整业务 schema。

生成的6组 create/update/read 原 arguments/result 和单独标注的 resourceCases 写入 `tests/fixtures/document-boundary.json`（紧凑 JSON，3,430,296字节）。fixture SHA-256 `b5dd8d3bbfbb6eea07f17f268d8038918aae18510f134f7f9ace2544156595e1`。同目录 `document-boundary.source.json` 保留固定 source commit、document.rs Git blob `9b5133bef03c50bdc4d38875a906a3ddd0c39401`、生成测试 SHA-256 及 fixture SHA-256。重新生成会更新随机 ID 与 fixture 指纹。

正式 `tests/document_contract.rs` 增加3项测试，逐例检查实际 service 的严格 input/output schemas、正文资源检查和20,001/depth65拒绝。stdio suite 增加3项：6组实际 DTO 原样往返、create/update超界零 IPC及read超界收到一次 IPC后拒绝、与 native resourceCases 对照。成功和错误均检查 structuredContent 与 JSON text 等值；fixture/生成测试指纹也在 suite 验证。

### 本轮实际执行

```sh
python3 -B crates/notes-mcp/tests/generate_document_boundary.py
cargo fmt --manifest-path crates/notes-mcp/Cargo.toml -- --check
rustfmt --edition 2021 --check crates/notes-mcp/tests/native/document_boundary.rs
cargo clippy --manifest-path crates/notes-mcp/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path crates/notes-mcp/Cargo.toml --locked -- --nocapture
cargo build --manifest-path crates/notes-mcp/Cargo.toml --locked --release
python3 -B crates/notes-mcp/tests/stdio_fixture.py crates/notes-mcp/target/release/cybernote-mcp StdioFixture.test_application_service_fixture_cross_module StdioFixture.test_actual_document_boundary_create_update_read StdioFixture.test_document_over_node_and_depth_limits_rejected_both_directions StdioFixture.test_resource_walk_agrees_with_native_without_claiming_schema_validity
git diff --check
```

最终检查均退出0：fmt/Clippy通过；Rust 15项通过（3 document + 4 query + 8 transport），其中 transport 启动的16项 stdio suite 全过（32.893秒）；release 构建16.51秒，4项跨模块/边界回放全过（1.788秒）。native 生成测试仅有2条 production harness 既有 unused-import 警告。首次 fmt check 提示新增测试换行格式，已格式化后通过，未忽略检查失败。

额外使用 importlib 加载两个未改动的 independent 脚本，各运行13项非 F1 旧边界用例：debug 13 passed（2.605秒）、release 13 passed（2.441秒），覆盖准确 bytes/frame、严格 schema、撤销引用/端点替换、取消等。明确排除 `test_ind_exact_depth_and_object_count`：它仍断言旧的容器深度和“任意 object 算节点”，与本次必须修复的公开业务规则冲突；没有修改独立脚本，也不声称其原14项全过。该项由上述实际 native 节点/depth 正反边界替代。

当前 release arm64 可执行 SHA-256：`0d662506f19c51f08ce88637b12a5833812fb2a573cc16324db9edf3fe968f17`。完整原生生成日志在 `/tmp/evolve112-adapter-native-boundary-author.log`。这仍是实际 service 产物的跨模块回放；未运行真实 host→service 连线、真实 WebView/设备或用户资料库，不宣告112/116集成验收通过。
