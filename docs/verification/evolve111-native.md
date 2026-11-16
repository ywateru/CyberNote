# evolve-111 原生阶段验证与接线协议

范围：`codex/evolve-111`，工作区 `/Users/water/work/2026/Apple-Notes-Clone-evolve111`。仅修改 `src-tauri/**` 与本说明；未修改前端、设计契约或 `agent_host/**`。本阶段实现应用服务、可信授权上下文、持久事务、Session 外部写协调及 UI 原生调用入口；credential IPC、真实窗口订阅与端到端验收仍由后续集成完成，不能据此将 evolve-111 整体标为完成。

## 模块与实际调用

- `application::NotesApplicationService<'a>` 只借用现有 `&mut Session`，不打开第二个 Store，不启动宿主或主应用。
- `agent_access::TrustedContext` 不实现 Deserialize；宿主验证凭据后调用 `from_verified_grant(client_id, grant_id, workspace_id, incarnation, scopes: BTreeSet<String>, folder_ids: BTreeSet<String>, expires_at: i64, revocation: u64)`，返回 `(TrustedContext, Revocation)`。Context 可克隆；同一 grant 的请求必须复用同一世代与撤销 handle。重建 context 不等于验证凭据，也不能复活已撤销 grant。
- `Store::application_identity() -> Result<(String, String)>` 返回本机应用 workspace ID 与 incarnation；不采用工具参数指定数据库，不等同于同步配对 workspace ID。
- `query(context, tool: &str, arguments: Value) -> ToolResult<Value>` 严格解析六个查询工具；`external_write(context, tool, arguments, participants)` 严格解析三个写工具。
- UI 的 workspace、注册保存 intent、ACK、普通/智能 action、保存、访问屏障开始/结束、附件写/读与导出入口通过服务 facade 调用原 Session。原 `saveIntent`、Token、Store receipt、metadata、访问屏障和同步 dirty 路径保留；未把 agent 身份转换成 renderer 身份。账户、网络同步、媒体缓存等自身运行时继续保持原所有权。

`application::RequestLimits` 应由宿主持有一个共享实例，在取得 Session mutex **之前**调用：`read(&context)` 或 `write(&context, deadline: Instant)`。Permit 必须覆盖整个请求，包括写协调/交付；释放 permit 唤醒等待者。实际限制为每客户端最多 4 个读取，应用级串行写，每客户端最多 8 个排队写，另有全局 1024 个排队项/读取客户端上限防止无界状态。队列到期返回 TIMEOUT，超额返回 RATE_LIMITED。服务内部仍拒绝重叠的 sync/access/external reservation；此拒绝不能替代宿主的排队 admission。

## 查询和存储

- 范围为明确物理目录集合，不递归扩权。SQL 在反序列化正文/投影前筛除未授权目录、locked 和删除笔记；UI 已解锁 locked 笔记仍不可读。不存在和不可见目标均为 NOT_FOUND。查询完成、提交前及结果交付时重新检查授权。
- 列表/搜索仅返回 NoteSummary，有 240 Unicode 字符 preview 和排除内部导入来源记录的 attachmentCount；搜索附 `match: {field: "title" | "content", snippet: string}`。搜索为 Unicode NFKC 后 lowercase literal substring；tags 使用现有 validated_tags，与智能目录共享实际标记规则，全部匹配且区分 tag 大小写。
- list 默认 updated 降序，created 降序，title 升序；id 升序决胜。limit 默认 20，范围 1–100。扫描只保留最多 limit+1 个候选，输出 512 KiB 封顶。授权目录列表使用 `ancestorLabels: string[]`，祖先不返回 ID/计数。
- cursor 是进程内随机 UUID，不编码正文；绑定 host session、grant、权限/目录、过滤/排序/limit、数据库变更 generation，5 分钟有效，最多 256 个。相关数据写、库变化、重启、请求条件改变使 cursor 返回 CURSOR_EXPIRED。generation 也覆盖范围外写入，因此当前实现会保守使游标过期。
- text 每页最多 32768 UTF-8 字节，在 Unicode 边界截断；含表格/清单/链接/附件等可读标记。contentCursor 同时绑定 note version。document 完整返回，序列化超过 1 MiB 返回 CONTENT_TOO_LARGE，不截断 JSON。
- 文本输入最多 1 MiB；document 最多 1 MiB、JSON 深度 64、节点 20000，并继续交给现有 Store schema/附件归属校验。text create 首行 heading1、其余 paragraph，空内容 blankDoc。text 替换复杂文档返回 LOSSY_REPLACEMENT；append 保留原节点与附件。document 更新自动保留内部导入引用，禁止删除既有附件引用、跨 owner 附件或路径字段。
- version 是 SHA-256 不透明值，绑定应用 workspace/incarnation、完整 Note（含 revision/metadata）及附件 metadata。更新在 SQLite IMMEDIATE 事务内重新验证 version/schema/归属，按旧 revision 更新；内容、revision、同步 dirty 触发器与幂等结果一次提交。创建不经过空条目/第二次 save。
- 应用扩展 schema 自身显式 version=1，包含 application_identity、application_operations 与九个业务变化 generation 触发器，Store open 在任何初始化/恢复写入前验证精确 DDL/完整性。原业务 user_version=2 保持原职责。扩展安装与身份初始化在独立 SQLite 事务内完成。
- 幂等键 `(incarnation, clientId, idempotencyKey)`，绑定 tool 与规范 JSON 参数 SHA-256，保留 30 天；仅持久 ID、tool、grant、哈希、revision/version、时间与最小回执，不保存输入正文/标题/preview。重放返回原提交版本，不冒用当前版本；仍检查原 scope、同 grant 和目标当前授权。过期记录在打开/提交时清理。
- 逻辑导出不包含应用身份、grant 或 operation；逻辑恢复在原归档事务内轮换 incarnation 并清除 operation。原数据库复制/搬迁/更换文件的 canonical-root/device/inode 身份变化也轮换应用 workspace/incarnation，拒绝旧 context/version。任意绕过 Store 的同 inode 原地篡改不属于支持的维护 API。

## 宿主驱动 API

```rust
let start = service.external_write(&context, tool, arguments, real_participants)?;
// ExternalStart::Replay(result): check_delivery(context, result)，直接交付原回执。
// ExternalStart::Probe { operation_id, event }: 锁外发送 notes-agent。

service.external_tick(&operation_id, &current_real_participants)
// Waiting
// Event(prepare_event)
// Committed { result, release }
// Aborted { error, release }

service.external_abort(&operation_id) -> ToolResult<Value> // 对应 abort release
service.external_reply(real_window_label, reply, expected_token, &live)
service.finish_delivery(&context, &operation_id, &live)
    -> ToolResult<Option<MutationResult>> // None=还在等 refresh ACK
service.notification_failed(&operation_id) -> ToolResult<()>
service.check_delivery(&context, &result) -> ToolResult<()>
```

宿主必须从真实 AppHandle/document_participants 捕获集合，所有等待、事件发送和传输均在 Session mutex 外进行。已有 `agent_window_reply` Tauri command 取真实 window.label，并 notify 同一 AppState Condvar；前端不可指定 label。服务无窗口时拒绝 HOST_UNAVAILABLE，不采用 headless 直写。probe/prepare 各 5 秒、提交前总期限 15 秒；Host 必须有界驱动 tick，并在断连/异常/取消时对本 operation abort，不能丢掉 reservation。

`sync_has_operation()` 只检查同步 quiet.current；external reservation 另有 `external_has_operation()`，无自身阻塞。访问屏障、同步开始/采纳与 external reservation 不能重叠。原本已经登记的目标 intent 在 begin 拒绝；后到 intent/附件/活动状态取消准备。已提交的用户保存使 expectedVersion 改变，返回 REVISION_CONFLICT；未提交目标返回 NOTE_BUSY。其他笔记可以继续保存。

收到 Committed 后，在同一短 gate 取 `Session::take_metadata_event()`，释放 mutex，**先通过既有 emit_document_event 发送 notes-metadata，再发送 notes-agent release**。不要发送虚构 metadata。取到的 result 已经提交，即使事件失败也不得转为 committed:false。通知失败调用 notification_failed，或通过 finish_delivery 收集窗口确认；5 秒缺确认、窗口变化、refreshed:false 均持久追加 WINDOW_REFRESH_REQUIRED。若 warning 持久化自身失败，finish_delivery 仍给 committed:true 结果并追加 WARNING_PERSIST_FAILED。宿主负责补偿刷新/重取可信 workspace，最终发送响应前再 check_delivery；撤销或移出范围拒绝交付。

## 独立窗口协议（不能原样复用同步 parser/reply）

事件名 `notes-agent`；命令 `agent_window_reply`，invoke 参数 `{ reply, expected: accessGate.expected() }`。严格拒绝未知字段、未知参与者、错误阶段/operation、过期 Token 和重复正向 ACK；同一原参与者可以重取有限保留的终态收据。最多保留 64 个终态（回复有效期 5 分钟）。

```ts
type AgentWindowEvent =
  | { phase: "probe"; operationId: string; sessionId: string; noteIds: string[] }
  | { phase: "prepare"; operationId: string; sessionId: string; noteIds: string[] }
  | { phase: "release"; operationId: string; sessionId: string;
      noteIds: string[]; outcome: "commit" | "abort" };

type AgentWindowReply =
  | { phase: "probe"; operationId: string; protectedNoteIds: string[];
      unsavedNoteIds: string[]; blocked: boolean }
  | { phase: "prepare"; operationId: string; ready: boolean }
  | { phase: "release"; operationId: string; refreshed: boolean };

type AgentReplyReceipt = {
  operationId: string; outcome: "pending" | "abort" | "commit";
};
```

外部 release **包含 noteIds**，现有 parseSyncWindowEvent 的 release 拒绝此字段，必须使用独立 parser；probe **额外包含 unsavedNoteIds**，不能原样走 replyNetworkSync。外部 probe 的 protectedNoteIds 必须包括活动编辑目标、PM composing/TagComposition、附件/picker/OCR、录音 owner；unsavedNoteIds 必须包括 pendingDocs、登记/在途保存和 saveFailures。创建/退出、访问屏障或未可信就绪为 blocked。create 的 noteIds 为空，但仍有全局窗口/资料库屏障。

prepare 重验外部保护条件，冻结目标全部输入入口并保留实例/DOM/selection/Undo；任何导航、owner/窗口/输入状态变化，保持 freeze 并回复 ready:false，直到原 operation 终态/release。保存仍用真实原 intent；不能发异步取消后立即放开输入。release commit 后走可信 metadata/workspace 刷新，确认完成并安全释放该 operation 后发 refreshed:true；失败发 false 并保持既有授权门禁。旧 release 不得释放新 operation 的 freeze，abort 不刷新伪提交。

## 验证命令与结果

原生轻量 harness 编译真实 production Store、Session、application、agent_access 和同步 model/Store 协调实现，未替换 SQLite/Session，也不编译假 WindowHost。harness build.rs 仅保留既有 Session 加密 fixture 的源路径。窗口参与集合/回复是协议测试输入，不代表已打开真实 WebView。

```sh
CARGO_TARGET_DIR=/tmp/apple-notes-sync85-target \
  cargo test --manifest-path src-tauri/src/application/harness/Cargo.toml

CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target \
  cargo check --manifest-path src-tauri/Cargo.toml --lib
```

最终结果：完整 harness **194 passed、0 failed、4 ignored**；4 个 ignored 项均为由父测试调用的 subprocess worker（包含本阶段实际 SIGKILL 测试）。Tauri `cargo check --lib` **退出码 0**，保留现有插件/未使用项 warning；未将 warning 当作运行验收。`git diff --check` 通过。测试覆盖真实 SQLite 触发器故障回滚（note/dirty/operation/receipt 均不提交）、完整创建、重启与提交两侧 SIGKILL 幂等、原回执版本、create-only scope、当前目录/locked/trash/撤销/跨 grant、NFKC 中文与 literal 搜索、真实 tag marks、稳定分页/Unicode 内容分页/过期、复杂文档/附件保全/内部来源隐藏、严格参数/深度/节点限制、两个线程客户端 CAS 恰一成功、真实保存 intent 和 receipt、同步/锁定互斥、窗口增减、超时、prepare 后取消、刷新失败与已提交 warning。

未运行真实主应用、未读取用户原库、未安装应用或设备包。已有 Cargo target 仅作为编译缓存。真实多窗口 active editing/中文组字/录音/附件 UI 接线、私有 IPC 与 credential/grant 生命周期、宿主限流与事件驱动、真实窗口刷新/Undo/补偿、同步到 Android 均仍须后续集成实测。


## 实际输出 fixture

`src-tauri/src/application/fixtures/service-success.json` 来自实际服务测试，含全部九工具成功输出、text/document read 与 pending/not_found operation 分支。capabilities 采用整数版本 1，limits 包含 `maxDocumentBytes=1048576`、`maxFrameBytes=2097152`，保留其余当前字段；search 使用 `match: {field, snippet}`。UUID/时间是生成时真实临时库值，不是生产用户数据。尚未在此分支运行适配器 schema 互校验，应由集成阶段将各 case 的 result 交给同一输出 schema 验证。

重新生成（只运行此测试时写文件；普通回归不改 fixture）：

```sh
EVOLVE111_OUTPUT_FIXTURE="$PWD/src-tauri/src/application/fixtures/service-success.json" \
CARGO_TARGET_DIR=/tmp/apple-notes-sync85-target \
  cargo test --manifest-path src-tauri/src/application/harness/Cargo.toml \
  actual_service_output_fixture_for_adapter_schema_validation
```

本阶段最终检查结束后已停止使用主目录共享 Tauri target，后续集成可接续使用。
