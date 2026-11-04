# APP-SMART-O 独立审查

**结论：pass。** 固定产品源码 `08d220664c28a7bd8647e27d3bf1e73f823c4c89`，审查差异 `6a31e9d..08d2206`。root 在审查期间另有文档提交，最终记录 HEAD 为 `51b2cdf`；以固定产品 blob/作者 source-identity 核对输入，不将文档 HEAD 推进当成产品变化。

**Findings：** 无已确认的 P1/P2/P3 blocking 或 non-blocking finding。本结论依据 `app-smart-o-metadata09.md` 全部 Contract/Implementation decisions、architecture 的访问及保存边界和 proposal C5 接收/通知顺序；不把提案内未批准的完整规则、原版删除联动或 U 界面提前算入 O。

## 提交事实、序号与真实发送链

- `store/commits.rs:24–47` 用调用隔离的 capture 保存显式 public changes，结束即 take，收据不取决于 Result；没有用 total_changes 推断提交。收据只含 kind、ID、必要 revision 和 createdId。`store.rs:198/249/387/551–553/664–667/815`、`smart.rs:277–308`、`archive.rs:738–740`、`attachment_operations.rs:278–280/368–371` 均在成功 autocommit/tx.commit 后、后续维护或响应读取前标记。事务 SQL 失败不提前标记，附件 preparing/committed/aborted 等私有日志状态不冒充 public facts。
- 普通 rename/move 相同值不写；删除已删 note、附件重复 store/query/幂等 cancel 不形成新 public 收据。patch/save 即使正文事实类似，真实持久 revision 仍增加，计为一次提交。settings 为 UI 偏好，unlock/closeLocks 为纯 access，按批准分类不推进 metadata；有 public 附件 insert/delete、实体/定义/归档实际变化才推进。
- `session/metadata.rs:8–49` 每次变更调用先清本次事件/旧收据，容量检查上限为 JS 安全整数；真实收据非空才增加一次 sequence。save/register、普通动作、barrier begin/finish、两种附件存储/cancel 与内部 smart action 都在文件或 intent 变更前检查。query 用 false 分类，仅修改私有日志不推进。begin 后的排空保存可能占用最后一个序号，finish 再检查，安全 abort 而不溢出。
- 提交后 response/tagged 失败通过 `last_commit` 保留新 ID/revision 与 sequence，保留原 error。purge、cancel 的文件清理失败、lock checkpoint 失败都不会变成假 rollback。`Session.finish:498–565` 对实际提交或成功纯 access 动作先 bump/revoke/清 intent，再重读 Store.workspace，最后 tagged；独立收据重附到新工作区。提交后读取失败仍给 access commit；snapshot 读取失败的保守事件仅包含未经授权的 ID/epoch，没有正文。

| 生产入口 | 锁内定序及锁外发送 |
|---|---|
| save、legacy store_attachment、store/query/cancel attachment operation | `lib.rs:108–111/166–181/197–205/233–290` 经 session_command；操作结束无论 Ok/Err 都先 take metadata，drop mutex 后 emit，再返回原结果 |
| 普通 workspace_action | `lib.rs:113–129` 锁内 ordinary + take；drop 后先发可用 access event，再 metadata，再返回 |
| lock/delete/purge/folder delete/import/closeLocks/removeLock 屏障 | 真实 begin/prepare 与 Condvar 排空机制保留；`lib.rs:148–163` finish/take 在锁内，drop 后 access commit/abort 先于 metadata。commit 后维护错误仍走该发送链 |
| workspace/read_note_text/read_attachment/export | 只读/外部备份，不形成 public metadata 提交；权威值在同 Session mutex 内读取和标记 |
| 内部 smart CRUD/CAS/projection | `session/metadata.rs:72–106` 是可供 U 复用的生产方法，token/pending 检查有效；projection 一次返回 revision/ids/count 与 stamp，没有第二套求值器或独立计数查询 |

真实 IPC 的 AppHandle emit 顺序由源码逐个复核，作者准确宿主 check 已成功；本轮没有把受控 transport 的事件次序当成实际 Tauri IPC 验收。

## 接收、保存 ACK 与编辑器所有权

- `bridge.ts:62–96` 先用 `AccessGate.accept(..., false)` 无副作用验证，再观察/判 metadata，最后才发布 access state。旧低序 workspace 不会先删新 note 授权。`markWorkspaceApplied` 只在 App 真正 hydrate 发布后更新 applied 并替换 attachment owner cache；附件读取/存储返回也先 accept，再进入缓存。
- `metadata-client.ts:12–44` 明确分开 observed/applied：ACK、通知只观察；hydrate 完成才 markApplied。同 seq 通知在 workspace 未应用时仍 needsRefresh。未知 session 不能仅凭 metadata 换进程；AccessGate 的进程/epoch/generation/逐 note 保存约束未放宽，仅增加无副作用校验参数。
- `bridge.ts:197–244` 将动作收据与可发布值分开。旧 metadata snapshot 被拒也保留持久动作 ID；失效 access 的正文不发布。维护错误的 commit 保留 createdId/revision，save 仍核原 note access。
- `App.tsx:954–993` 有效旧 save ACK 按自身收据确认原 revision；附件 ACK 使用本窗原提交文档，不能把旧服务器正文回填。仅清对应最新 pending，随后强制 metadata 权威读取，即使 applied 已经是相同 sequence；新 hydrate 曾被 pending overlay 覆盖的正文因此能恢复。待保存旧基线在普通 hydrate 中不变。
- `App.tsx:724–819` passive hydrate 保留本窗设置，不强迫导航/搜索、flush 或权限重同步；同 access/正文的目录变化不触发 externalVersions。实际旧 Editor/DOM、Undo、组字、格式书签和 pending 所有者均已在最终源码挂载验证。访问失效或真实外部正文变化继续走现有失效/更新路径。
- `App.tsx:827–850/1238–1277/1354–1378` 先订阅两类事件再初始可信读取。新进程事件触发覆盖并 TrustedSynchronization，旧 token 被真实 Rust 拒绝；普通 focus/online 可被动权威重读以恢复丢失的通知。create 使用唯一 createdId，再权威读取才激活；原响应失效不会再次创建。
- 内部 `*_core` 方法均是私有接缝，renderer 没有布尔开关或 smart invoke 注册。check/snapshot/tagged/workspace/sensitive、公开导入 preflight/finish 等保留 D2 smart capability gate；generic action 仍不分发内部 smart 动作。旧 smart gate 测试源码未改，内部真实双窗 CAS/projection 与公开拒绝在本轮窄测试再次通过。

## 最终源码独立实测

31项固定输入与作者 SHA、固定提交以及实际文件逐项一致；所有实际测试前后均不变。复核作者最终完整 Rust、宿主 check、前端 build、transport build 和 AccessGate 记录的封存 hash 与准确源身份，不重跑完整78项或 host-check。使用生产 binary：

`src-tauri/target/debug/notes-o-session-transport`

SHA-256：`036d509015f9dfde7f2fd0a82826da6e02857785a92b6bc7752d721b788e906c`。

本轮实际 **10项 Rust + 8个不同 browser 场景通过**：

| 证据 | 窄实测结果 |
|---|---|
| `rust01` | Session metadata 5通过：收据/no-op/隐私、内部双窗 CAS/projection+公开 gate、overflow、附件幂等、排空用完最后序号 |
| `rust02` | Store metadata 4通过：实际 SQL rollback 不出收据；purge/cancel 清理错误；提交后读错误仍保留 createdId/revision/sequence；lock checkpoint error 仍 access commit |
| `rust03` | 最终曾失败的锁定删除正文屏障1通过：closeLocks 拒绝旧命令，解锁后 delete 响应不能携带解密正文 |
| `browser01` 前七项 | 最终准确源码与 binary 上3个 bridge + 4个挂载场景均通过：ACK observed≠applied、旧 workspace 不污染授权、新建 ID 不重复、Editor/组字/Undo/书签/pending/prefs、旧 ACK 后同 seq 权威重读、focus 恢复、新进程可信同步。整体进程因后述新增 fixture 断言 exit1，未把整体伪报 exit0 |
| `browser03` | 独立新增乱序场景1通过：持久 save 响应暂扣，随后真实 Store/Session lock commit，再送 access/metadata；旧 Editor 销毁、授权 false、权威正文空。释放迟到 ACK 后 `access_changed`，无正文回填、无重发保存、applied 不倒退，原私有 pending 身份不被旧响应替换 |

受控 runner 经逐条审读，只替换 Tauri transport 交付并观测实际 App refs；生产 App/Editor 挂载，数据库请求进入同一真实 Rust Session 进程。为独立场景添加断言，未改产品。新增场景故意不交付 prepare、使用真实无参与者屏障以施压接收门，因此它证明迟到响应边界，**不能证明真实多原生窗口 prepare 排空**；真实 Session 既有屏障测试另行覆盖。组字为 DOM composition 事件，不是设备输入法实测。

## 保留的独立测试修正记录

`browser01` 第八项最初把 PRIVATE marker 作为文档首行，导致它同时成为工程中保留的公开 title；锁后 document/plainText 已空，断言对整个返回值搜 marker 过宽。保留该脚本为 `check-final-metadata.fixture01.mjs` 与完整日志，改为独立 PUBLIC heading + PRIVATE paragraph。

`browser02` 随后在要求 commit 后 pending 必须清空处停下。该受控场景未交付 prepare，且 ACK 因 access 已失效而不属于“有效旧 ACK 排空”契约；原私有未确认编辑应保留，不能用此虚构条件要求产品清除。保留 `fixture02`，将断言限定为旧 pending 身份不变、失效 ACK 被拒且不发布正文。`browser03` 仅重跑新增场景通过；前七条已在相同最终产品输入上通过，没有重复整套。

以上两项是独立测试数据/预期修正，不是隐藏的产品修复或被忽略的产品 failure。所有尝试的源身份、准确 binary、命令、退出码和完整结果均保留；没有用最终1通过覆盖先前 exit1。

offline/locked、jobs2、每条600秒上限、共享 host target 独占，最低记录空间约70.1GB。浏览器仅访问临时本地监听与临时 Store，runner finally 关闭 context/browser/Vite/listener 和 Rust stdin。没有 GUI/ADB/用户库、平台打包、下载/升级依赖或清缓存，未改产品/作者证据，未 stage/commit。

**STOP；共享 host target 已释放。** O 通过不开放 renderer smart 能力；U 与最终两端准确包、原版交互和像素验收仍待后续交付。
