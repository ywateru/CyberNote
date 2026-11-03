# APP002 附件持久操作 · 源码候选 01

日期：2026-11-04。隔离工作树 `/private/tmp/apple-notes-attachment-store-01`，基线 `0026f5d`。**Rust 源码候选，必要编译和真实 Store/Session 定向检查已通过，等待独立审查；不是前端入口或设备验收通过。** 首次编译无失败，无需编译后修正。统一 Mac→Android 构建释放共享 target 后才串行执行本批检查，完成后已经向 root 正式释放 target；没有应用包构建、GUI、设备或实际用户数据操作。

## 实际命令与返回

三个同步 Tauri 命令都由真实注入的 `WebviewWindow` 取 label；renderer 不能提供 owner、session、window、路径或 attachmentId 作为操作授权。现有 Session/Store mutex 覆盖当前敏感权限检查、owner 派生、保存意图检查、查询/清理决定与实际文件/数据库操作。

| 命令 | renderer 参数（Tauri camelCase） | 成功结果 |
| --- | --- | --- |
| `store_attachment_operation` | `{operationId:string,noteId:string,name:string,mime:string,data:string,expected:Token}`；data 为完整 base64 | `AttachmentOperationResult` |
| `query_attachment_operation` | `{operationId:string,noteId:string,expected:Token}` | `AttachmentOperationResult` |
| `cancel_attachment_operation` | `{operationId:string,noteId:string,expected:Token}` | `AttachmentOperationResult` |

`Token = {sessionId:string,epoch:number,noteEpoch:number}`，沿用现有针对 note 的 Session.sensitive/Token 判定，不新增绕过。结果为 `{operationId,noteId,status,attachment?,reason?,access}`：status 仅 `notPersisted | stored | committed | aborted | deferred`；attachment 只在 stored/committed 返回现有公开 Attachment `{id,noteId,kind,relativePath,mime,displayName,size}`；access 是现有 Session.snapshot，供既有 AccessGate 验收。`relativePath` 只是现有公开 metadata，不是 cancel 参数。错误仍是结构化 `{code,message}`。

新命令对 database/filesystem/document 错误保留实际 code 并显示固定可理解提示，不把私有 journal 序列化内容、SQL 或潜在存储细节传回 renderer；身份冲突固定 `attachment_operation_conflict`，不含另一窗口/会话/笔记、附件字段或状态。其他错误沿用明确的 invalid/too_large/access_changed/attachment_operation_incomplete 等 code。不会把真实文件或数据库失败伪装为 aborted/成功。模块原始错误仍在实际 Store/Session Result 中可由测试核查。

## 归属、代次变化与幂等

owner 是后端生成的 `{真实 Session.id, 真实 window.label, 后端随机 incarnation}`。首次该窗口调用时生成 incarnation；真实 Destroyed 事件删除它，同 label 重新建窗取得新 incarnation。客户端 expected 中自报的 sessionId 只用于既有授权校验，不用于构造 owner。

1. 系统面板期间只有 renderer generation 改变、实际 session/window incarnation/note 没变：前端仍持有首次 IPC 前固定的 operationId；完成可信同步、取得当前真实 token 并重新验证原目标后，可直接 query 同 op。Store 不知道 renderer generation，也不接受以它改变 owner。query 结果仍需通过既有 AccessGate；被拒绝的 query 不能被当成 notPersisted。
2. 锁/closeLocks/删除等屏障中或授权失效时，Session.sensitive 拒绝 query/cancel/store，返回 access_changed，不返回附件。屏障结束后，若同 Session/同窗口 incarnation、原 note 恢复合法授权，使用新的当前 token 可以查询原 op。已删除 note 必须先真实 restore；未解锁 note 拒绝。已经授权但持久正文仍 sealed 的 locked note 无法证明“无引用”，query/cancel 明确 deferred `owner_document_locked`，保留文件。removeLock 后能再次核真正正文。
3. 真实窗口销毁/同 label 重建或新 Session 进程不能认领旧 owner；即使当前 note 有权限，query/cancel/retry 都稳定 identity conflict。新进程在创建 Session 前由 Store.open 内部恢复旧 journal，这不是给新窗口开放旧 owner 查询。恢复仅限非终态 preparing/stored/aborting：真实正文正确引用则 committed；安全无引用则 aborted；sealed/身份不确定则保持记录与文件、deferred。没有旧 renderer pending 编辑会被虚构成可恢复本地待保存内容。
4. 标准小写 UUID v4 operationId，新增历史记录总量上限 10,000（包含终态，达到后明确 limit 错误，不悄悄抹掉幂等历史）；单文件≤100MiB，名称≤1024B/MIME≤255B且无控制字符。completed stored/committed 的同 owner/note/name/MIME/size/完整原字节重试复用同一附件，不再写文件。不同 owner/note、不同名称/MIME/大小、completed 不同字节固定冲突，绝不覆盖。
5. preparing/aborting/aborted/retired 从不恢复写入。先核可比较 metadata；不同 metadata 返回冲突，metadata 相同但 preparing 没有原 payload digest/完整字节可证明时，**无论本次 bytes 是否看似相同，都返回 attachment_operation_incomplete**；不能把不同 payload 当原附件复用。前端先 query/cancel；若确认 aborted，重新发起必须用新 op。成功状态的幂等与未完成状态的保守拒绝分别表达。
6. query 未知有效 op 且当前 note 授权有效，返回 notPersisted。终态 aborted/retired 的 owner 匹配查询/取消重复返回 aborted，不重新清理路径；错误 owner 命中已有任何状态都只有固定 conflict，不返回敏感状态。cancel 的 notPersisted/aborted 重复调用无文件副作用。

## 文件、事务和恢复的顺序

```text
当前真实授权 / owner / 原op
    → SQLite INSERT preparing（文件可能存在前）
    → 独占 create_new 管理文件 → write_all → file+directory sync
    → 同一 SQLite transaction：附件metadata + state=stored
    → 前端插入与实际正文保存（独立阶段）
    → query/cancel 用真实持久节点 id+owner note+kind 核定 committed
```

新路径仅为后端生成 `op-{operationUuid}-{attachmentUuid}.blob`；独占创建若碰到已存在对象立即 retired，绝不将该对象当作本次拥有的新文件。preparing 可表示尚无文件、已有部分/完整文件但 metadata 未提交；查询返回 deferred/storage_incomplete，不假称未持久。stored 状态与附件 metadata 同一事务提交，响应丢失仍可查询真实 stored。

取消先核所有实际持久正文和附件身份：已引用则 committed；身份缺失/冲突或 sealed owner 则 deferred；历史 committed 即使后来删除节点也不退回新建清理。安全无引用时先在同一 SQLite transaction 撤 metadata 并记 aborting，再删自己路径、sync目录，最后记 aborted。删文件失败保留 aborting 和真实错误，重开可恢复；后续新 save 的 schema 验证不能引用已经撤掉的 metadata。冷恢复不扫描或删除没有 operation 身份的旧附件/旧孤儿，不修改归档公开格式或原导入恢复日志。

永久 purge 在删除 note/attachment metadata 的同一事务把其全部 operation 标记 retired；正常清理包含尚处 preparing、未建 metadata 的新文件。若 purge 在 DB 已提交、文件清理前崩溃，可能留下终态遗留文件，但旧 journal 永远不再删除该路径，避免以后同路径新对象被误删。它不是通用历史孤儿清扫方案。

## SaveIntents 与前端责任

cancel 在现有同一 mutex 内检查该 note **所有窗口**已登记且未完成的 SaveIntents；存在时 query 若已真实 committed 则返回 committed，否则 deferred/save_pending。目标访问屏障由 sensitive 直接拒绝。检查和 Store 清理决定串行，不能穿插一个已登记保存。

**renderer pendingDocs 尚未 register_save 的内容对 Rust 不可见。** 正文里已经本地插入附件、save ACK 失败/丢失时，不能仅因数据库暂未引用就调用 cancel。前端必须保留 operationId、已创建 attachment 与本地节点，继续复用身份重试保存；或先确定性回滚本地插入、排空/停止相关保存队列，再取消。没有客户端自报“安全”开关，也不声称 Session 知道全部未登记 pendingDocs。正文已持久、仅后续列表刷新失败时，query 会核真实 ref；保留 committed，不重复插节点或删除文件。

## 已运行的真实边界检查

- Store：SQLite+实际文件验证同 op 重试/响应丢失查询、owner/note/name/MIME/bytes 冲突、未知与无效ID、窄补偿和重复取消、真实已引用/historical committed 保留、错误kind/metadata不确定 deferred、锁定冷恢复 deferred。
- 注入真实 SQLite trigger 失败与真实目录/文件类型错误，核 prepare/aborting 保留与错误；恢复前/后检查目录、metadata和状态；明确保留旧 legacy metadata/file 与无 journal orphan。
- 用当前测试可执行文件派生真实子进程，分别在 after_prepare/after_file/before_store_commit/after_store_commit/after_cancel_metadata/after_cancel_file 以78退出，**恢复前先读真实SQLite/文件**，再 Store.open 核恢复与第二次重开幂等。
- 实际正文保存后冷重开保留全文/附件并 committed；显式purge退休、pending文件清理及后来同路径对象重开保留。
- Session：当前 token/access，异窗/旧session/销毁后同label拒绝，真实目标屏障拒绝，另一窗口SaveIntent存在deferred，保存排空后可取消，真实已引用即便未来intent仍保留committed。

实际命令（都在上述隔离工作树运行，使用已经由 root 释放的主 target，未复制 target）：

```sh
CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target cargo test --manifest-path src-tauri/Cargo.toml attachment -- --nocapture
CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target cargo test --manifest-path src-tauri/Cargo.toml --lib session::tests
CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target cargo check --manifest-path src-tauri/Cargo.toml --features access-boundary-proof
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
git diff --check
```

第一条 **14 passed，0 failed，1 ignored（仅子进程 worker），36 filtered out**，实际执行8个新Store组、2个新Session组、1个新命令错误脱敏组，并命中3个既有附件/归档相关回归。父测试实际派生6次worker，分别命中所有要求的真实进程退出点；ignored只表示worker不作为独立顶层用例自动执行，不能误读为崩溃验证未跑。完整测试阶段输出保存 `rust-attachment-result.txt`（不含前面的逐依赖编译进度）。

第二条完整 Session 模块 **11 passed，0 failed，40 filtered out**，包含原多窗口保存排空、屏障失败/超时/权限、旧revision冲突、原schema验证与2个新增附件边界；完成输出尾部保存 `rust-session-final-output.txt`，它明确只是最终输出片段。proof feature check成功，尾部保存 `rust-proof-final-output.txt`；证明另一命令handler分支也编译，不代表真实Tauri IPC/GUI回放。

fmt/diffcheck通过。`source-manifest.json`记录6个实际Rust候选文件与hash，旧 `store_attachment` 实现字节与基线相同。`precompile-integrity.json`是编译前的历史准备记录，status特意保留prepared-uncompiled，不能替代上述最终测试结果。

这些测试使用实际临时SQLite/受管文件/真实Store/Session及子进程，没有生产测试后门、App/bridge接线或mock数据库。checkpoint仅cfg(test)，普通生产是空函数；仅控制测试进程退出，不改变实际存储算法。此模块之后仍需独立静态审查、前端接线、统一构建及真实系统选择器/正文ACK/冷启预览验证；当前Mac/Android已冻结包尚不包含本Store候选。
