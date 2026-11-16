# Agent MCP 接口契约

设计日期：2026-11-16。状态：111/112模块及真实宿主/窗口装配已独审合入，Codex实际九工具调用已通过，最终安装产物与双端组合仍待116；实际范围见[演进验证状态](../verification/project-evolution/README.md)。适用 Codex、DeepSeek harness 及其他支持 MCP 的 agent，不同 harness 的启动配置以其实际能力为准。本文为统一工具名、CLI、DTO、目录与错误码契约，不能把模块源码视为已安装可用的接口。

## 范围与所有权

首版提供本机搜索、读取、新建、追加和更新备忘录。每个客户端只有一个明确绑定的本地资料库与授权范围；账户登录、设备配对和 MCP 客户端授权分别管理。首版需桌面宿主正在运行；应用未运行返回 `HOST_UNAVAILABLE`，不自动启动第二个 Store。

```text
支持 MCP 的 agent
     │ JSON-RPC / stdio
cybernote-mcp（独立适配进程；stdout 仅协议，日志 stderr）
     │ 私有本机 IPC + client credential + workspace identity
CyberNote desktop / agent_host
     │ AgentGrant 校验 → NotesApplicationService
     ├─查询：Session 授权 → 受限摘要/正文投影
     └─写入：外部写协调 → schema/CAS/事务 → receipt
                                  │
                      notes-metadata → 真实窗口刷新
                                  └─既有同步 dirty/发布机制
```

应用持有资料库 lease、唯一 Session、钥匙和数据库写 owner。MCP 适配进程不持有 SQLite 连接，不读取 attachments 物理路径，也不调用前端 debug runtime。未来无人值守模式由后台宿主持有同一个 lease，桌面切为客户端；不能让桌面与 daemon 各自持有一份 Session。

建议适配器落在 `crates/notes-mcp/`，复用Rust工具链，以成熟MCP SDK处理协议；宿主 `agent_host` 管理IPC和生命周期，`agent_access`管理grant与凭据引用，`application`管理业务。协议DTO可独立为无Tauri依赖的小crate，不让适配器链接整个UI宿主。

stdio适配器与宿主的具体帧/端点/凭据引用约定见[本机IPC实现契约](agent-ipc.md)，业务授权和提交规则仍以本页为准。

优先本机 Unix domain socket；端点放在用户私有 runtime 目录，0600，目录0700，校验 owner，拒绝符号链接替换。端点描述仅含宿主身份和 workspaceId，不把绝对数据目录当客户端授权。首版 macOS，Android 继续经既有同步获得 agent 结果；Android 不默认开启常驻 MCP 服务。

## 协议与传输

以官方 MCP [2025-11-25 transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)、[tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) 与 [authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) 为设计参考，2026-11-16 已读取。实施时固定 SDK 版本与协商协议版本，不把本文参考版本当作永远最新。

- 实现 `initialize` / initialized、`tools/list`、`tools/call` 和协商的能力；仅声明已实现能力。
- 每个工具提供严格 `inputSchema`、`outputSchema`，拒绝未知字段；使用 `structuredContent`，同时提供同内容 JSON text，兼容只消费文本的客户端。
- 输出schema以`oneOf`明确覆盖该工具成功DTO和统一ToolError；业务错误保留`isError: true`，正常和错误结果都需符合声明的结构。
- 业务失败使用 `isError: true` 与统一错误对象；未知工具、非法协议参数等按 MCP/JSON-RPC 错误语义处理。不能用 HTTP 200 或空字符串代替业务成功证据。
- 工具 annotations 仅是提示：查询/读取标注只读；create/update/append 非幂等提示保持保守，因为幂等依赖调用参数。权限在服务端检查。
- 首版不依赖 resources、prompts、sampling 或 elicitation；读取统一走 tool，减少客户端兼容依赖。后续资源 URI 仍须逐次授权。
- 后续需要远程访问时使用 Streamable HTTP，独立服务入口和 OAuth 资源授权/撤销；有 Origin 时必须验证，限制 Host 与监听地址，不能把本机 token 或账户登录 token 原样作为公网访问凭证。旧 HTTP+SSE 不作为新实现首选。

## 授权、锁定与生命周期

`AgentGrant` 至少包含 `clientId`、`workspaceId`、`scopes`、`folderIds`、过期时间与撤销代次。目录范围是显式物理目录集合；父目录授权默认不递归，递归选择在授权时展开并展示，后续新增子目录需重新授予。智能目录查询不能扩大物理目录权限。

grant与凭据是本机设备状态，不进入笔记同步wire、逻辑备份或普通Settings导出；凭据放系统凭据库/私有文件，数据库只存引用或不可逆校验值。幂等表和资料库incarnation属于内部schema，需更新Store严格open校验与版本化迁移，不直接向已验证schema偷偷加表。逻辑恢复生成新的incarnation且不恢复外部授权；备份在另一设备导入不自动授权旧agent。数据库原文件克隆/恢复等维护路径也必须触发incarnation轮换或明确拒绝使用旧端点。

| Scope | 行为 |
| --- | --- |
| `notes:read` | 授权目录内未锁定、未删除笔记的摘要、搜索和正文 |
| `notes:create` | 授权物理目录内新建完整笔记 |
| `notes:update` | 授权目录内追加/替换正文；移动需同时拥有目标目录写权限 |
| `notes:delete` | 第二阶段才提供，仅软删除 |
| `attachments:read` / `attachments:write` | 后续单独实现与授予 |

首版排除所有 `locked == true` 的笔记，即便 UI 进程已经解锁；不返回其标题、摘要、附件名或数量。禁止 MCP 提供密码、移除锁或批量解锁工具。存在但无权与不存在的 noteId 对外均返回 `NOT_FOUND`，不泄露跨范围存在性。查询、正文读取、提交前、响应交付前都复核授权；撤销使未交付响应失效，已经交给 agent 的副本无法追回。

应用关闭、资料库切换、grant 撤销或 IPC 断开后，适配器销毁授权缓存并停止交付旧响应。取消请求在提交前释放操作；提交后不能回滚已提交事实，返回/查询原 operationId 的结果。每个客户端的并发写入串行，跨客户端通过同一应用协调器排队。

UI 入口放入“设置 → Agent 接入”，展示客户端、资料库、目录范围、读写权限、有效期、复制启动配置、撤销和近期操作。全局开关默认关闭；用户主动启用后新建 grant，读取范围仍须明确。操作日志只记录客户端、工具、noteId、时间和结果，不记录正文、密码或 token。

## 通用 DTO 与查询语义

所有时间为 Unix 毫秒；`revision` 是本机笔记版本，仅用于本地 CAS，不是跨设备全局版本。`version` 是宿主生成的不透明读版本，绑定 workspace incarnation、noteId、revision 与内容/元数据摘要；库恢复或切换后旧 version 无效。客户端回传 `expectedVersion`，不自行构造。

```ts
type NoteSummary = {
  id: string; folderId: string; title: string; preview: string;
  createdAt: number; updatedAt: number; pinned: boolean;
  revision: number; version: string; attachmentCount: number;
};
type NoteRead = NoteSummary & {
  format: "text" | "document";
  content: string | Record<string, unknown>;
  truncated: boolean; nextContentCursor: string | null;
};
type MutationResult = {
  operationId: string; noteId: string;
  committedRevision: number; committedVersion: string;
  committed: true; warnings: string[];
};
type ToolError = {
  code: string; message: string; retryable: boolean;
  operationId?: string; committed?: boolean;
  currentVersion?: string; retryAfterMs?: number;
};
```

跨适配器/宿主的成功DTO固定如下，禁止两侧自行推断同义字段：

- capabilities：`apiVersion: 1`、`schemaVersion: 1`（均为整数）、`workspaceId`、`hostSessionId`、`scopes`、`tools`、`formats`和`limits`。limits字段为`maxLimit`、`maxQueryCharacters`、`maxContentBytes`、`maxDocumentBytes`、`maxFrameBytes`、`maxTextPageBytes`、`maxListBytes`、`maxJsonDepth`、`maxNodes`、`idempotencyRetentionDays`、`queryDeadlineMs`、`writeDeadlineMs`、`maxConcurrentReads`、`maxConcurrentWrites`、`maxQueuedWrites`，均为有界非负整数。
- folders：`{items: [{id, name, ancestorLabels: string[]}], nextCursor: string|null}`。
- list：`{items: NoteSummary[], nextCursor: string|null}`。
- search：同list，每个item增加`match: {field: "title"|"content", snippet: string}`；query匹配标题/可读正文，tags是独立的全部匹配过滤，snippet最多240字符。
- operation：已提交时直接返回MutationResult；尚在协调/未找到时分别返回`{status: "pending"|"not_found", operationId}`。

适配器的严格outputSchema与实际宿主必须用同一组成功/错误fixture相互校验，不能以传输fixture各自通过代替契约接通。

列表 DTO 不返回 document、sealed、密钥、相对路径或 Session token。`preview` 最多240个 Unicode 字符且只来自授权正文。attachmentCount 排除内部来源附件；tag/filter 语义与现有 `projectTags`、智能规则保持一致，实施时抽取共享契约用例。

分页使用不透明游标，绑定 grant/过滤条件/排序/快照代次，稳定追加 id 作为排序决胜键。首版不维持长期快照：任一相关内容变更或重启使旧 cursor 返回 `CURSOR_EXPIRED`，客户端从第一页重试；不能靠 offset 漏项或重复项。游标短期有效且不含明文正文。

查询首版为 Unicode NFKC + lowercase 后的 literal substring；不执行 SQL、正则或自然语言查询。中文子串支持有明确用例，不假设 SQLite 默认 FTS 分词能解决中文。范围先授权过滤，再计算摘要和命中片段。未来切换 FTS 必须版本化搜索语义，保留中文兼容测试；锁定正文不得持久写入明文索引。

## 首版工具目录

以下参数共用严格对象 schema；limit 默认20、最大100，cursor 可省略。未明确列出的内容/元数据不可由工具写入。

| 工具 | 输入 | 输出 / 行为 |
| --- | --- | --- |
| `notes_get_capabilities` | `{}` | API/schema 版本、当前 workspaceId、实际 scopes、工具/格式/限制、host session identity；不含凭据 |
| `notes_list_folders` | `{cursor?, limit?}` | 授权物理目录及可见祖先路径标签；祖先不附带内容计数，不返回权限外目录 ID |
| `notes_list` | `{folderId?, sort?: "updated"\|"created"\|"title", cursor?, limit?}` | `{items: NoteSummary[], nextCursor}`；默认 updated 倒序，title 升序；排除锁定/删除 |
| `notes_search` | `{query, folderId?, tags?: string[], cursor?, limit?}` | 同上，额外命中字段与短片段；tags 为全部匹配；首版仍按 updated 倒序 |
| `notes_read` | `{noteId, format?: "text"\|"document", contentCursor?}` | `NoteRead`；默认 text；读取已提交版本，不宣称读取窗口草稿 |
| `notes_create` | `{folderId, format: "text"\|"document", content, idempotencyKey}` | 完整笔记一次事务创建并返回 MutationResult；不允许智能/最近删除/虚拟“全部”目录 |
| `notes_append` | `{noteId, expectedVersion, text, idempotencyKey}` | 末尾追加普通文本段落，保留全部现有节点和附件；不传独立 title |
| `notes_update` | `{noteId, expectedVersion, format: "text"\|"document", content, idempotencyKey}` | 替换正文；JSON 需符合当前应用 schema；含复杂节点时 text 替换受下述保护 |
| `notes_get_operation` | `{operationId}` | 同一 client/grant 的已提交结果或 `pending`/`not_found`；恢复响应丢失场景 |

`query` 1–512字符；正文输入上限1 MiB UTF-8、JSON最大深度64、节点20,000，总 IPC frame 上限2 MiB，以上 MCP 限制须与现有 Store 更严格的限制取交集。`idempotencyKey` 为客户端生成的 UUID。list/search 响应硬上限512 KiB；命中笔记太大不会附带正文。

text 读取每页最多32 KiB UTF-8，在 Unicode 边界截断；contentCursor 绑定 note version，每次返回同一 revision，版本变化返回 `CURSOR_EXPIRED`。document 读取首版不切割 JSON，序列化超过1 MiB则返回 `CONTENT_TOO_LARGE`，提示改读分页 text；不得返回不完整 JSON 冒充可回写文档。

首版 text 是有损可读投影，表格、清单、链接、附件等需明确标记为可读文本，不保证往返。text 新建按首行 heading(level1)、后续 paragraph 生成 schema 合法文档，空内容为应用 blankDoc；标题始终由保存正文派生。`notes_update(format="text")` 只允许原文为纯 heading/paragraph/text 且无 marks/附件/其他节点，其他返回 `LOSSY_REPLACEMENT`；复杂笔记推荐 append 或 document 完整回写。document 写入保留/校验内部导入引用、附件归属与已有 schema，不允许构造文件路径或引入未归属 attachmentId。首版禁止 agent 删除现有附件引用；后续附件 API 再增加显式移除契约。

## 写入一致性：必须增加的共享应用边界

现有 `Session::ordinary` 和窗口 `register_save`/`save` 不能直接充当 MCP 写接口。外部客户端不是 WebviewWindow，不能伪造 `main`、读取 renderer 的 Session token 或自己调用 `Store::action`。

新增 `NotesApplicationService::external_write(context, command)`，context 为宿主验证后的 client/grant/workspace 身份，command 为有界类型。共享的是底层校验/提交与事实事件，不复用窗口专有授权表示。

```text
验证 grant / 工具参数 / 幂等键
 → 查询幂等记录（命中仍重新验证原工具权限与当前目标范围）
 → 协调器预留外部写操作：与同步采纳、锁定屏障互斥
 → 捕获真实窗口参与集合；probe 目标笔记的活动编辑/组字/附件/录音
 → 目标正在活动编辑或受保护：返回 NOTE_BUSY，不强行中断用户
 → 其他持有目标的窗口 prepare，排空已发生的保存并冻结目标写入
 → 窗口集合改变/超时/准备失败：abort 并解冻，保持原内容
 → 重新验证 grant、资料库 incarnation、目标版本、scope 和授权
 → 同一 SQLite 事务：schema校验后的内容变更 + revision + 幂等结果
 → 记录 Store receipt / Session metadata / 同步 dirty
 → 释放数据库锁，发 metadata，窗口刷新确认，释放冻结
 → 返回已提交结果；窗口刷新失败记录 warning 与补偿刷新
```

协调器可参考现有 sync quiet 的 probe/prepare/abort 思路，但 `sync_tick` 会计算并提交同步计划，不能拿一个伪 sync plan 包装 agent 写入。需抽取通用的目标保护、参与者校验与准备/解冻机制，并分别接入 sync 和 external_write。进程 Mutex 只保护内存/DB临界区，不能跨等待窗口 ACK 持锁。

读默认返回当前已提交版本和 version。用户在窗口继续编辑后，外部写先返回 NOTE_BUSY；即使窗口后续排空成功，revision 变化也返回 REVISION_CONFLICT，让 agent 重读并重做修改。客户端不得默默用最新版本重试旧覆盖。create 虽无现有编辑目标，也需与全库恢复/切换和 grant 撤销协调。

原有 createNote 先建空条目、后续 saveNote 写正文的两次动作，不满足 create 的原子性；新增 Store 专用事务方法。现有 action 里正文/置顶等写法也不能笼统承诺天然原子；每个 MCP 命令逐一落到定义明确的提交方法。首版不提供事务性批量接口。

## 幂等、失败与审计

幂等表以 `(workspaceIncarnation, clientId, idempotencyKey)` 唯一，绑定工具名及规范化参数摘要。相同 key/相同参数复用原提交结果；相同 key/不同参数返回 `IDEMPOTENCY_CONFLICT`。正文变更与提交记录必须在同一事务，重启后仍能查询；首版保留30天并在 capabilities 披露，超期重试不保证去重。持久记录不保存正文/标题/preview，只保存 ID、提交revision/version、参数哈希与最小回执。MutationResult不附带NoteSummary，客户端另调notes_read取得当前正文；幂等重放始终返回原提交版本，不能用后来版本冒充原结果。操作查询和重放仍复核grant、原工具scope与目标目录范围；最小回执不额外要求notes:read，正文读取仍需该scope。撤销或目标已离开授权范围时拒绝交付。

| code | 行为与重试 |
| --- | --- |
| `HOST_UNAVAILABLE` / `WORKSPACE_UNAVAILABLE` | 宿主未运行/绑定库不匹配；不自动写到默认库 |
| `UNAUTHORIZED` / `FORBIDDEN` / `NOT_FOUND` | 客户端凭据无效/工具权限不足/对象不可见；不得通过换 noteId 扩权 |
| `NOTE_BUSY` / `BARRIER_BUSY` | 窗口在编辑、录音或协调器忙；可显示 retryAfterMs，有限重试 |
| `REVISION_CONFLICT` | 零写入，返回可见目标的 currentVersion；重读重新编辑 |
| `SCHEMA_INVALID` / `LOSSY_REPLACEMENT` / `CONTENT_TOO_LARGE` | 零写入，修正请求，不截断后强写 |
| `CURSOR_EXPIRED` | 重启、撤权、版本或查询快照变化；重新开始分页 |
| `IDEMPOTENCY_CONFLICT` | 相同 key 参数不一致；客户端纠正，不能自动换 key 重复原操作 |
| `RATE_LIMITED` / `TIMEOUT` | 有界排队；有operationId先查询，无operationId按原幂等键重试，遵循下述恢复规则 |
| `STORAGE_ERROR` | 明确是否已提交；不能把已提交但通知失败报成普通未写入 |

每 client 读并发最多4，写并发1，等待写队列最多8；默认查询期限5秒、协调写15秒。应用级共享协调串行提交。超时在提交临界区前生效；已取得operationId时先查询，整个响应丢失、未取得operationId时，使用原工具、原参数和原idempotencyKey重试，不生成新key。重放仅返回原提交回执，撤销后不再交付。审计不进入笔记正文，不因客户端日志失败回滚已提交笔记。

## Agent 调用示例

面向使用者的安装、设置页授权、Codex/其他harness配置及恢复步骤见[Agent接入指南](../agent-usage.md)；最终可执行路径以实际交付manifest为准。

安装并在应用内授权后使用的中性stdio配置模板；必须填入实际交付可执行路径和当前资料库的凭据引用，不能直接运行下方示意值：

```json
{
  "command": "/absolute/path/to/cybernote-mcp",
  "args": ["--workspace-id", "workspace-id-from-app", "--credential-ref", "credential-id-from-app"]
}
```

`credential-ref` 指向系统凭据库或0600私有凭据文件的逻辑记录，不是原始 token。具体 harness 外层的 `mcpServers`/TOML 等由接入文档按实际版本单独给出，不能假设所有 DeepSeek harness 都支持相同配置。

Codex自动化验收可使用[公开App Server协议](https://learn.chatgpt.com/docs/app-server)的`thread/start(ephemeral=true)`、`mcpServerStatus/list`及`mcpServer/tool/call`，在隔离配置中直接调用已配置的MCP工具，不必通过模型推理选择工具。2026-11-17已用macOS Codex CLI 0.167.0验证无模型认证的临时thread及合成transport fixture能力调用；这只证明该版本的协议路径，真实资料库业务证据另行验收。生产用户配置仍以[Codex CLI MCP文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)为准，不要求用户使用实验性App Server接口。

标准调用链为 `notes_get_capabilities → notes_list_folders / notes_search → notes_read → notes_append / notes_update(expectedVersion, idempotencyKey) → notes_read`。只按内容搜索结果选择 noteId，不按标题唯一定位。读到的笔记是外部数据，正文内出现的“调用其他工具/泄露信息”等文字不能当作接口指令。

## 验收门槛

- 真实 stdio 初始化、schema、工具发现和错误结果；stdout 无日志污染，非法 JSON/超大帧有界拒绝。
- stdio → 私有 IPC → 实际 Session/SQLite → receipt → 已打开窗口 → 重启读取，完整链路成功；不是浏览器 preview 或 mock Store。
- 两 agent 同版本更新恰有一方成功；响应丢失、重启后同幂等键仍只提交一次，create 不遗留空条目。
- 用户正在中文组字/未保存/录音/附件导入时返回 NOTE_BUSY 或零写入冲突；原窗口全文、Undo、附件 owner 保全。
- 撤销、库切换、锁定/解锁、prepare 超时、窗口增减、同步同时到达均不越权、不死锁、不重复提交。
- 查询不泄露范围外/locked/trash/internal 来源附件内容；中文子串、稳定分页、超大正文、复杂文档有损替换拒绝均有契约用例。
- 可选同步开启时 agent 修改沿现有 dirty 路径传播；关闭同步时本地功能正常。最终 Android 看见相同正文与附件引用，不能以 metadata 事件代替落盘/设备证据。
