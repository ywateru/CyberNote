# 系统附件提交前端：独立源码审查 02

2026-11-04，native_ui_research 独审。冻结候选 `d81dd575f967a98535d36a0200b60040e5b49095`，前候选 `607950a57b1a1f01eb59b2e4db5738b66e890c40`，原基线 `72c93b1b34bcfd3a95c331d1da93e187ff5fda14`。分支 `task/app-002-attachment-submit`，隔离目录 `/private/tmp/apple-notes-attachment-submit-01`。

**结论：本候选在本次有界源码及受控边界审查中 SOURCE-READY，前候选的 P1 在新候选中已修复，未发现新增阻断。** 原审查 01 的 BLOCKED 结论和失败证据继续对应 607950a，不追改为成功。本报告不确认真实系统选择器、Rust 数据库、正文持久 ACK、原生包、冷启、媒体播放或像素一致。

证据：[independent-02](../../verification/app-002-attachment-submit-independent-02/)。8 项候选源码 SHA/字节数独立重算，与作者清单逐项相同；聚合 `fbc609e2d777e81dd33b6b84350c40e5598e583772366745db897cac9f3794e1`。精确输入、保护文件清单及原证据校验见 [identity.json](../../verification/app-002-attachment-submit-independent-02/identity.json)，执行记录及清理见 [completion.json](../../verification/app-002-attachment-submit-independent-02/completion.json)。

## P1 的修复及真实 App 路径

相较 607950a，产品仅新增 15 行：`AttachmentSubmission.settleForCancellation()` 同步失效操作，再等待当前 `running` Promise 成功或失败；App 的 `discardUninsertedAttachments` 在封住 batch/operation 后，先等待所有实际 run settle，再重新可信验证原目标，最后沿既有窄 cancel 核定终态。等待包含生产 bridge 中尚未结束的 FileReader 和已派发的 store IPC；错误响应也不能跳过等待。原有 Rust unknown-op `notPersisted` 无 tombstone 的语义未改。

独立运行冻结候选中的新增 8 组脚本，执行真实 App AST 抽取的 `validatePickerTarget`、`submitAttachmentBatch`、`discardUninsertedAttachments`、生产 helper/bridge/AccessGate/TrustedSynchronization 及真实 PM bookmark。仅 FileReader、invoke、编辑器宿主 refs 与后端记录受控，没有复制 App 取消算法。观察结果为：

- **文件读取中取消**：封入场后 cancellation 仍未结束，前端 batch1/submission1、后端调用0；读完后同一 operation 的调用顺序为 `store → cancel`，取消接受终态后前后记录均为0。旧 `cancel → store` 的身份丢失路径没有复现。
- **store IPC 已发出**：取消等待实际 store Promise，未提前派发 cancel 或释放身份；store 完成后再核定取消。
- **已写入但 store 响应丢失/拒绝**：仍等待 run 失败，然后在重新验证的权限下取消原 operation，受控后端无剩余记录。没有把 rejected response 当作无副作用。
- **FileReader 失败**：等真实失败 settle 后才调用 cancel；接受 `notPersisted` 后才释放身份，无 store 调用。
- **deferred/save_pending**：保留后端记录、batch、submission 及 cancelRequested；后续原批次取消取得终态后再释放。
- **后端删除后 cancel 响应被 AccessGate 拒绝**：前端仍保留身份；下一次可信 cancel 返回 `notPersisted` 后才释放。
- **等待时原目标失效**：晚 store 可能已留下记录，但不借其他目标权限取消，原 batch/submission 均保留。该场景不是取消成功，也不保证当前 UI 能立刻恢复；本检查确认没有误报完成或丢失身份。
- **已有 inserted 标记**：取消在封入场和后端调用前拒绝，保留本地正文附件。

完整实际 stdout：[cancellation.stdout.json](../../verification/app-002-attachment-submit-independent-02/cancellation.stdout.json)。后端 map 跟随已有接口状态语义，不能替代 Rust DB 或设备证据。

## 等待、自等待与重复进入

静态追踪中，`settleForCancellation` 仅由独立 App 取消处理器调用；提交 run 的 validate/store/query/insert/ACK/refresh 端口均不等待该取消 Promise。App `flush` 仅等待 save queues，不等待取消或 submission；本次没有发现 run 与 cancel 的相互等待环。新方法先失效再截取 running，run 结束后的 cleanup 只清其自身 Promise；`run` 的原 Promise 仍会向原调用方报告失败。等待不把失败当成成功，也不以 timeout 伪造终态。

另外编写并实际运行 [cancellation-reentrancy.mjs](../../verification/app-002-attachment-submit-independent-02/cancellation-reentrancy.mjs) 的 3 组独立断言。此脚本明确复用冻结作者脚本的模块加载和受控 fixture，新增断言与场景由独审添加，不将它描述为完全独立测试基础设施：

1. FileReader 挂起时第一次取消封入场；实际 App batch retry 被拒绝，保留原 submission 对象；第二次取消同样等待。释放读取后两次取消均完成，只有一次 store，随后两次同 operation 的窄 cancel，末态无后端记录和前端身份。重复取消并未合并成单次请求，但本受控场景无身份丢失或死锁。
2. 两文件批次在第一文件读取时取消，第二文件的 operation 不能在 settle 后继续 store；实际调用只有第一文件的 `store → cancel`。
3. 实际 Editor JSON 已有匹配附件引用而 inserted 标记为 false 时，App 第二道本地引用检查拒绝清理，保留 batch/submission，后端调用0。这补充新增脚本中仅置 inserted 标记的场景。

实际 stdout：[reentrancy.stdout.json](../../verification/app-002-attachment-submit-independent-02/reentrancy.stdout.json)。永不结束的 FileReader/IPC 会使取消继续等待并保留身份；本次没有注入宿主永久挂起，也不宣称完整活性或任意时序证明。

## 实际执行和范围

本次在冻结工作树运行并保存 stdout/stderr：

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | exit0 |
| `node scripts/check-attachment-submission.mjs` | exit0，原23组 |
| `node scripts/check-attachment-cancellation.mjs` | exit0，真实 App 路径8组 |
| 独立 `cancellation-reentrancy.mjs` | exit0，新增3组 |
| `git diff --check 72c93b1..d81dd575` | exit0 |

原23组仍覆盖受控存储恢复、单次插入、队列失败与真实成功 outcome、匹配 note/id/kind 的 ACK、ACK 后仅刷新、目标及权限失效等端口语义；不将这些组数当作真实 mounted App、真实 IPC/保存 ACK 已验收。候选 02 产品增量很小，其余入口、目标身份、实际 Tiptap `.run()` 检查、saveDoc 接线及保存失败保全按独审01的有界静态追踪复核，未发现与新等待过程冲突。

15 项完整保护文件仍与原基线和独审01同字节，包括 AccessGate、Editor/schema、录音组件/Session、Rust 命令/Session/Store/journal/tests、依赖及共享 CSS。此事实仅描述本候选 d81dd575，不覆盖主线后来单独合入的录音状态候选，也不能推导录音父层运行通过。App/saveDoc/bridge 的既有候选改动不伪装为未修改全文件。

开工与结束工作树均 clean，结束 HEAD 仍为 d81dd575；8 源码未变。短暂使用指向主现有依赖的 node_modules 链接，现已删除，无安装和网络。原独审01目录及报告所有哈希前后相同。没有修改产品、主 Git、Rust target，没有构建、GUI、设备或真实数据操作。

源码层可交 root 按精确候选整合；整合录音状态或后续父层 ACK 后应重新核对受影响文件并运行相应检查。新包之后仍须分别验证 Mac/Android 真实文件/图片/PDF选择、受管字节、完整正文持久保存、来源移开后的冷启预览和真实故障/取消。iOS、音轨、IME 与像素差异均不由本报告验收。
