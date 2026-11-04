# APP-SMART-D2 独立审查

**结论：blocked。** 固定产品源码 `98fc5b8b25ab34c053ca6de9f3b47ea5f0d5775f`；审查时当前 HEAD 为 `fed359d`，其新增文档不改变产品输入。作者 source-identity 的十项产品/测试 hash 与固定提交及实际文件逐项一致，独立实测前后生产输入不变。审查依据为 `docs/plan/tasks/app-smart-d2-durable-rules09.md` 的有限批准契约。

## Findings

**[P2] blocking — 普通文件夹的成功写入可以使数据库下次无法打开。**

- 契约位置：任务的“统一物理能力”“DB目标2”及“包含smart活库…现有普通数据不受影响”。D2 新增的启动整图检查必须与实际公开写入保持一致，不能让成功保存的普通数据在正常重开时被拒绝。
- 代码位置：`src-tauri/src/store/open.rs:218` 新调用 `validate_live_graph`，该调用进入 `store/archive.rs:227`，拒绝 `name.len() > 4096`。但 `store.rs:539–558` 的 `createFolder` 与 `store.rs:561–571` 的 `renameFolder` 仍只拒绝空名称；它们可通过既有 Session/`workspace_action` 公开路径写入。`src/App.tsx:4252` 附近实际名称输入也没有长度限制。
- 独立真实复现：分别使用全新临时 Store，执行创建 4097 个 ASCII 字符的名称，以及将正常文件夹重命名为同样长度。两次 action 都返回成功；drop 后重新 `Store::open` 均返回 `graph_invalid`。这里没有智能定义，也没有修改数据库伪造异常行。
- 影响：普通输入可能使整个本地库下次启动失败；这由 D2 将归档图检查接入 live open 引入。
- 最窄修复契约：普通创建/重命名应在任何写入前，与 live graph 使用相同的 trim、非空与 UTF-8 字节上限；有效边界写入后可重开，超限拒绝且不改变原数据。补 4096/4097 字节及中文多字节边界，核对拒绝前后不变和冷重开。无需扩大一般重构或改动 UI。
- 证据：`docs/verification/app-smart-d2-durable-rules09-independent/oversized.rs`、`run04.txt`、`run04-result.json`。该真实契约测试 exit101，完整失败日志保留。

无其他已确认的 P1/P2/P3 finding；以下已核对内容不抵消上述 blocker。

## 已核对的实现与实际接缝

- `store/smart.rs:114–206`：物理/智能闭合分支共用生产解码。物理 query/revision 连显式 null 也拒绝；smart 必须有 null parent、query/revision，保留身份受限。`open.rs:190–193` 额外隔离旧0/1完整八字段 smart，不能仅靠分支解码当作旧格式。
- `smart.rs:19–112/210–317`：query 规则闭合、四种标签模式、唯一类型/名称、规范 JSON UTF-8 预算；严格动作输入。名称+规则同 CAS，更新/删除在实际 SQLite 事务内重读比较；缺失 `not_found`、旧版本 `smart_conflict`、上限明确失败，非 UPSERT。通用 rename/move/delete 不能对 smart 旁路 CAS，`folder_note_ids` 拒绝 smart。
- `smart.rs:318–379`、`archive.rs:19–39`：只用真实验证后的 noteTag spans；locked（即使临时解锁）的标签为 unavailable，pinned 使用元数据，deleted/suspended 排除。布尔 all/any 满足三值契约，定义 revision 与成员来自同一 SQLite 读快照。生产竞态测试实际使用第二连接提交新定义/置顶行，读者仍返回旧定义与旧成员。
- `store.rs:340/374/467/487/539/573`、`archive.rs:213–249/286–385`：create、move、restore、conflict copy 及 parent 链使用同一物理能力；缺失原位置回 default，存在但非法明确失败。归档和 live open 的 owner/parent 整图检查一致。上面的 finding 是名称检查新接入 live open 后，旧写入端缺少对应边界。
- `open.rs:164–243`：旧0/1严格物理与整图校验、补系统行/设置、版本2在同一初始化事务，合法 JSON 不重写；未来/坏图拒绝在恢复前。既有六检查点 rollback 机制保持原事务边界，本轮没有重复作者完整回归。
- `archive.rs:415–572/573–675`：1/2严格物理，1禁止非空 recordedAt，含 smart 才导出3；所有自定义 normal/smart 先映射，再映射层级、owner/original owner、选择、附件与正文引用，smart revision 保留。准备与文件 journal/SQLite 发布仍是同一生产链。独立新增嵌套 parent + 已删除 originalFolderId 双次冲突导入，恢复笔记后 owner 正确、冷重开成功。

## 所有已注册公开入口与 gate

| lib/Session 入口 | 实际 gate 及其后才可执行的操作 |
|---|---|
| `load_workspace` → `Session.workspace` | 显式 `ensure_legacy_capability` 在 Store.workspace 前；tagged/snapshot 再检查 |
| `register_save_intent` → `register_save` | sensitive → check → capability；之后才注册 intent |
| `workspace_action` 的 save | Session.save 首先 capability，之后才消费 intent/写正文 |
| `workspace_action` 的普通动作 | ordinary → check → capability，在 Store.action 前 |
| barrier 动作及公开 `import_archive` | begin → check → capability；smart 归档另经 preflight，在建立 Pending/发 prepare 前拒绝；finish 首先检查 live capability |
| 归档 begin/finish | preflight 与 import_legacy_archive 共用 read_archive 的格式/预算/版本解析；finish 按实际文件字节重新解析一次，在恢复/暂存/写入前拒绝替换为 smart 的文件 |
| `store_attachment` | 本地 Base64 解码后 sensitive/check/capability，之后才调用 Store 写文件 |
| store/query/cancel attachment operation | Session.sensitive/check/capability，之后才分配窗口 owner、读取日志或写文件 |
| `read_attachment` | 先查附件 owner ID（不读正文/文件），再 sensitive/check/capability，之后才读取附件内容；未知 ID 可以更早 not_found，但不能取得数据或绕过 gate |
| `read_note_text` | sensitive/check/capability，之后才读正文 |
| `export_archive` | lib 显式 capability + Session.export_archive/check；在目标文件任何改写前 |
| tagged/snapshot/event | snapshot 本身检查 capability，不能以附带快照返回 smart 内容 |
| ACK / forget window / ready | 仅清理或协调现有状态，按任务允许不设数据 capability gate |

`lib.rs:427–453` 两种编译配置的注册表没有注册内部 smart CRUD/求值。测试证明真实 Session 门禁；对 lib 的连接逐个阅读源码并复核作者同 hash 的宿主 check exit0。没有把静态接缝核对或作者编译结果写成实际 Tauri IPC/设备运行通过。

## 独立实测与交付边界

新建 harness 的符号链接直接引用生产 Store/Session 与其真实测试模块，沿用作者 Cargo.toml/Cargo.lock，无镜像求值器。offline、jobs2、共享 host target 独占、每次至少2GiB、600秒有界：

| 实测 | 结果 |
|---|---|
| `smart::tests::` | 8通过：严格分支、真实三值规则/冷重开、快照竞态、CAS、物理能力、旧0/1迁移及隔离、归档3双导入/rollback |
| `session::smart_tests::` | 2通过：全部 Session 接缝与无副作用、导入 preflight/finish 防换档 |
| 独立 `extra::` | 2通过：精确大小写/无笔记引用的 selected name、嵌套 parent/已删除 original owner 双次导入映射和恢复 |
| 独立 `oversized::` | 1失败，确认上述 blocker；两种普通成功写入后均不能重开 |

合计12通过、1失败。前三组总命令耗时6.881秒；第四组3.805秒。最低记录可用空间约70.6GB。前后源身份、命令、日志见 `docs/verification/app-smart-d2-durable-rules09-independent/`。没有重跑作者完整67项或宿主 check，没有 GUI/ADB/用户库、平台包、依赖下载、缓存清理、stage/commit；没有修改产品与作者封存目录。

**共享 host target 已释放；本轮 STOP。** root 可将上述单一 blocker 交作者最窄修复；D2 修复及独立复核通过前不进入本批交付完成，更不代表智能功能、两端新包或像素一致验收通过。
