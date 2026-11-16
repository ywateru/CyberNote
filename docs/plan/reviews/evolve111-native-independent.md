# evolve-111 原生阶段独立审查

日期：2026-11-17。结论：**blocked（2 项 P2 原生契约阻塞；未发现已证实的 P1）**。

审查对象为 `/Users/water/work/2026/Apple-Notes-Clone-evolve111` 的 `868c6dcf960cb3c92f3c9330ec22fbaf7431fe91`，基线 `e609586e`。审查时工作树初始干净。本次只新增本文并提交，未修改产品源码、作者测试或 fixture，未管理工作树、合并、启动 App 或接触用户原库。

已读本分支 `docs/architecture/agent-mcp.md`、任务 `docs/plan/tasks/evolve-111-application-service.md`、`docs/verification/evolve111-native.md`；成功 DTO 的新增约定只读主线同名 `agent-mcp.md`。本审查没有修改主线设计文档。

## 阻塞发现

### [P2 / blocking] 拒绝 document 节点及根对象上的额外路径字段

位置：`src-tauri/src/application/document.rs:18`、`:38`，提交入口 `src-tauri/src/store/application.rs:326`、`:338`；其调用的既有 schema 校验 `src-tauri/src/store/archive/document.rs:291` 只校验已知属性和子节点，没有拒绝节点对象的额外键。

`input_document` 限制了字节、深度和节点数，但直接克隆传入对象。Store schema 对 `attrs` 有白名单，对根、node 和 mark 对象自身没有相应键白名单。因此不是只有合法编辑器字段能进入笔记。独立用例通过真实 service 的 probe → prepare → commit 创建下面的 document，得到 `Committed`；随后的 `notes_read(format="document")` 原样返回了两个路径字段：

```json
{
  "type": "doc",
  "relativePath": "../../private-root",
  "content": [{
    "type": "paragraph",
    "content": [{"type": "text", "text": "inert content", "path": "/tmp/private-file"}]
  }]
}
```

独立测试 `independent_document_unknown_path_fields_must_be_rejected` 断言 `SCHEMA_INVALID`，实际失败并打印 `accepted_and_persisted=...`。这违反严格 document schema / 禁止路径字段的原生约定。作者的路径用例把 `relativePath` 放在 attachment 的 `attrs`，能被已有 attrs 校验拒绝，未覆盖此旁路。

影响是外部调用可把 schema 外数据持久化并回传；本次没有证明这些字段会触发文件读取、任意文件访问或附件 owner 越权，不将其夸大成已发生的文件泄露。

建议由原生维护者在应用输入边界严格验证 node/mark 对象允许的键，并让不允许的路径字段在提交前返回 `SCHEMA_INVALID`。验收需覆盖 root、普通 node、mark 额外键，且验证拒绝时 note/operation/dirty/receipt 都未提交。

### [P2 / blocking] release ACK 的持久化错误丢失已提交事实

位置：`src-tauri/src/session/external.rs:255`，特别是 `:260`–`:261` 的 `application_warning(...)?`；UI 实际命令转发位置 `src-tauri/src/lib.rs:156`。

终态 `outcome == "commit"` 收到 `Release { refreshed:false }` 后，若追加 warning 失败，代码直接传播普通 `ToolError::storage`，没有 operationId 或 committed 标记，也未返回终态 receipt。独立用例先通过真实 Session 成功提交，然后只在临时 SQLite 中安装：

```sql
CREATE TRIGGER independent_warning_failure
BEFORE UPDATE ON application_operations
BEGIN SELECT RAISE(ABORT,'independent failure'); END;
```

随后原参与窗口以当前有效 Token 调用 `external_reply(... Release { refreshed:false } ...)`，实际错误是：

```json
{"code":"STORAGE_ERROR","message":"Local storage operation failed","retryable":false}
```

笔记仍为已提交 revision；错误既缺少 `committed:true`，也缺少 `operationId`。独立测试 `independent_release_error_must_preserve_commit_fact` 因 `error.committed == None` 失败。

同一测试还确认，之后调用 `finish_delivery` **能**返回 `committed:true`，并带 `WINDOW_REFRESH_REQUIRED` 与 `WARNING_PERSIST_FAILED`。因此这是已接线 ACK 分支的错误/receipt 契约缺口，不是写事务回滚或重复提交缺陷，也不是所有交付 API 都失去提交事实。`notification_failed` 本身已补充 committed/operationId，不消除此处不同调用路径的缺口。

建议保留该参与者的 commit receipt，将 warning 持久化失败作为补偿状态处理；若必须返回 ToolError，应明确带 `committed:true` 和该 operationId。修复后需保留 warning 写入故障注入用例，证明 UI ACK 与 host finish 两条路径对同一提交事实的描述一致。

## 实际运行证据

所有数据库由 `tempfile` 创建。production harness 直接编译被审提交的 Store、Session、application、agent_access 和 sync model；独立 harness 也以绝对 `#[path]` 引用同一批 production 文件，没有替换 Store、SQLite、Session 或窗口 host 实现。窗口标签/ACK 是协议输入，不是真实 WebView。

| 检查 | 实际命令 / 结果 |
| --- | --- |
| 作者完整原生回归 | `CARGO_TARGET_DIR=/tmp/apple-notes-evolve111-independent-target cargo test --locked --manifest-path src-tauri/src/application/harness/Cargo.toml`：退出 0，**194 passed、0 failed、4 ignored**，测试部分 10.26 秒 |
| 4 ignored 的含义 | 查阅 ignore 标注及父测试；是 subprocess worker，包含父测试实际启动/停止并 SIGKILL 的 application worker，不是跳过的 4 项验收。SIGKILL 的 before 分支在提交前停止、after 分支在完整提交后停止；没有把它描述成任意指令位置的 crash fuzz |
| 新增独立契约测试 | `CARGO_TARGET_DIR=/tmp/apple-notes-evolve111-independent-target cargo test --locked --manifest-path /var/folders/ll/s836stz50mg85d4h0g4xc8jm0000gn/T/evolve111-independent-tp6kvb4y/Cargo.toml independent:: -- --nocapture`：退出 101，**6 passed、2 failed**；失败即上面两项，198 项原测试被过滤 |
| 完整 Tauri 原生检查 | `CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target cargo check --locked --manifest-path src-tauri/Cargo.toml --lib`：退出 0，26 个现有 unused/dead-code 类 warning，1.88 秒；只使用获准独占的共享 target，不运行 App |
| typecheck 原命令 | `pnpm typecheck`：退出 1，本工作树无 node_modules，`tsc: command not found`；不是 TS 源码错误证据 |
| typecheck 临时副本 | 拷贝本分支 `src/`、`package.json`、`tsconfig.json` 到临时目录，plugins 指向被审分支，node_modules 只读借用主目录现有依赖；`node /Users/water/work/2026/Apple-Notes-Clone/node_modules/typescript/bin/tsc --noEmit -p /var/folders/ll/s836stz50mg85d4h0g4xc8jm0000gn/T/evolve111-typecheck-dfk8wbhk/tsconfig.json`：退出 0；没有安装依赖或在工作树创建 symlink |
| 差异检查 | `git diff --check e609586e..868c6dc`：退出 0；提交前再检查本文及最终文件范围 |

临时证据：`/tmp/evolve111-independent-author-tests.log`、`/tmp/evolve111-independent-contract-tests.log`、`/tmp/evolve111-independent-cargo-check.log`、`/tmp/evolve111-independent-typecheck.log`、`/tmp/evolve111-independent-typecheck-temp.log`。临时 harness 路径保存在 `/tmp/evolve111-independent-harness-path`；新增 `src/independent.rs` SHA-256 为 `005ff29155a987849f7ad02d37b2aed78124cad97cd1294b6ada93bcc53a75aa`。临时文件不会随本提交分发；上方保留了两项失败所需的输入、注入 SQL、服务调用阶段和预期/实际结果。

队列测试第一次尝试由测试自身插入第九个短期限 waiter，会抢占名额而使 worker 的启动顺序影响断言；已仅在临时测试中改为让 9 个 worker 同时排队，通过 channel 观察一个 RATE_LIMITED 后释放现有 permit。最终结果采用修正后的测试；未把初版测试的同步错误列为产品缺陷。

## 独立通过项和 source 审查结果

| 主题 | 核对位置与证据 / 结论 |
| --- | --- |
| 真实授权过滤 / locked 隐私 | `store/application.rs:155`、`:163` 在投影前按目录集合及 locked/deleted 过滤；`query.rs:123` 入口/完成授权重验。独立补测先创建可见笔记，再真实 lock 并 UI unlock，notes_read、notes_get_operation、check_delivery 均 NOT_FOUND，search 不返回哨兵标题/正文。原回归同时覆盖范围外、trash、撤销、scope、跨 grant、非递归物理目录和无 ID 的祖先标签。未见已证实的授权扩张 |
| schema、深度、节点、附件 | `document.rs:38` 与 Store schema 取交集。独立补测合法 30 层 blockquote 的 JSON 与 20,000 总节点成功提交，31 层 blockquote / 20,001 总节点在解析阶段拒绝。原回归实跑复杂文档 LOSSY_REPLACEMENT、append 保留链接/附件、禁止删除既有附件、跨 owner、内部导入来源隐藏/保留。额外键路径缺口为阻塞项 1 |
| version / CAS | `store/application.rs:219` 哈希绑定 workspace/incarnation、完整 Note 和按 ID 排序的附件 metadata；`:252` 在 IMMEDIATE 事务中重查身份/version/schema，SQL 用旧 revision 条件。原双客户端线程 CAS 用例通过；独立组合用例在目标 prepare 后让另一个笔记以真实 UI intent 保存成功，再提交目标，且附件 metadata 单独变化足以让旧 version 返回 REVISION_CONFLICT |
| cursor | `query.rs:61`–`:120` 绑定 Session、client/grant/revocation、目录、scopes、过滤/排序/limit、generation；随机 UUID、5 分钟、256 上限。独立补测改变 limit、grant、范围外写入均让旧 cursor 失效。原测试实跑排序决胜、重启、UTF-8 正文分页、version 变化失效。当前范围外业务写也保守失效，与实现说明一致 |
| 原子 create / 持久幂等 | `store/application.rs:252`–`:411` 将 note、revision、dirty trigger 与 operation 一次事务提交，提交后才写 receipt。完整回归实际通过触发器故障零孤儿、零 operation/dirty/receipt、重启重放原 version、恢复/复制库身份轮换、SIGKILL 两侧重启只创建一次。源码另核对打开/提交时的 30 天清理，未独立推进时钟验证过期边界。schema 精确 DDL 校验在 Store 初始化/恢复写前执行；逻辑归档不携带授权/幂等表。不是空 create 加第二次 save |
| external / sync / access / UI save | `session/external.rs:141`、`:397`，`session.rs:464`，`session/synchronization.rs:457`、`:502`；原测试通过互斥、prepare 后登记 intent 取消、已保存产生 CAS 冲突、真实 receipt。独立测试确认其他笔记的 UI save 可完成，不把 external reservation 变成无差别禁止所有保存 |
| 参与集合、迟 ACK、取消、期限 | `external.rs:230`、`:397` 校验 live 原参与者、Token、phase、重复 ACK、15 秒总期限/5 秒 phase 期限。独立补测 prepare negative 后再发 positive 不能复活操作，旧 abort release 不能代替新操作 ACK。原回归实跑集合增减、撤销、库变化、probe/prepare 超时与取消；终态收据有 64 项/5 分钟边界。没有真实窗口 UI 证据 |
| receipt / release refresh / 已提交错误 | `external.rs:344`、`:477` 和 `application/mod.rs:179` 保留已提交事实；原回归通过 metadata、notification_failed、release refresh false 和 warning。独立故障注入确认 finish_delivery 的双 warning 兜底有效，同时发现已接线 external_reply 的错误分支缺失提交标记（阻塞项 2） |
| RequestLimits | `application/admission.rs:23`、`:40`：共享实例读每 client 4，应用级写 1、每 client 等待 8，另有 1024 全局状态上限；permit Drop 唤醒。原限流/超时测试通过。独立 9 worker 在已有 writer 时恰一 RATE_LIMITED、其余 8 个释放后完成，未发生额外 writer 并行。宿主必须在 Session mutex 前取 permit，当前没有宿主端到端排队证据 |
| UI 服务接线 | `lib.rs:218` 的 ui_session、`:250` mutate、`:315` session_command 已经经 NotesApplicationService facade 调用原 Session；workspace、intent、access ACK、ordinary/smart、保存、附件/读取/导出保留既有权威。`agent_window_reply` 取真实 WebviewWindow.label，解锁后 notify Condvar，两个平台 handler 均注册。完整 cargo check 验证编译接线；facade 不是对新外部协调的真实窗口运行验收 |
| 成功 DTO | `query.rs:137` capabilities 的整数版本与完整 limits、folders ancestorLabels、search.match、operation pending/not_found 形状与主线补充对照一致；原真实 fixture 生成用例已实跑。本次没有声称与 113 适配器 outputSchema 完成同组 fixture 互校验 |

## 后续装配边界

本结论仅针对上述 Rust source 模块及编译/production harness 行为。两项 P2 是本阶段内已有实现的契约缺口，应先由维护者修复，再复跑两个独立失败用例及受影响回归，才能把本原生审查改判 pass。

111 仍不能整体宣告完成。credential/grant 生命周期、IPC/适配器 schema 共用 fixture、真实 AppHandle 参与集合、锁外有界驱动/取消、共享 RequestLimits admission、metadata 先于 release 的实际发送、release ACK 补偿刷新、独立前端 parser 与 freeze、中文组字/pendingDocs/录音/附件/Undo、真实窗口增减和与同步同时到达，以及 Android 同步结果，均留给后续宿主与前端集成验收。113 已独审合入或 114 开发启动不替代这些证据；不因缺少这些后续集成而伪造本 source 模块的运行失败。
