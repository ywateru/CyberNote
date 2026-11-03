# F07 搜索结果候选：独立静态复核 01

2026-11-03，verify。冻结 `/private/tmp/apple-notes-search-zero-01`，提交 `c072a93887f0786cbc2fc2853b1f3b1556ceac5e`，基线 `a2dcde9`。未改产品源码，未 GUI、构建、Android 或 Rust 操作。结果为 **blocked：以下两个源码时序问题须先修正再复核**。没有把它们声称为已在设备复现的损坏。

证据目录 `docs/verification/app-001-search-results/independent-static-01/` 保存提交/文件身份、独立检查原始输出、基线与主分支差异、精确生产路径片段及 manifest。root 已授权 native 在同隔离目录修正；本报告只对应原冻结 c072a93，后续提交不得覆盖本轮身份。

## 必须修正

### [P2] 异步恢复可使停放实例重新变为 editable

位置：`src/App.tsx:276`。SearchEditorHost 只在 `!active && parkedEditable.current === null` 时关闭编辑性；一旦已经停放，后续 render 不再维持 `isEditable=false`。既有 `saveConflictCopy` 的 finally（720–721）与访问屏障 abort（852–854）仍可直接对所捕获旧 Editor 执行 `setEditable(true, false)`。

一个有限生产序列为：A 有保存冲突 → 另存副本冻结 A 并 await 后端 → 此时全局搜索仍可用，唯一结果 B 使 A 停放（记录当前 false） → 副本操作失败，在 finally 恢复冻结前 true → A 仍 inactive，但其 parkedEditable 非 null，宿主不再禁写，活动 B 与隐藏 A 可同时 `isEditable=true`。访问 prepare 捕获 A 后，已排队/迟到搜索切换再 abort 也存在同类恢复顺序。隐藏/inert 能阻止通常用户输入，但不等于维护了“停放 Editor 不可编辑”的生命周期不变量，不能以它宣称无重复可写实例。

修复应统一真实实例的停放/恢复所有权，使异步恢复只更新停放实例的期望状态并同步保持 false；重新显示时再按实际 blocked/授权条件恢复。仅在下一次 render 重冻既留下窗口，也可能丢失准备阶段原 editable 的恢复意图。无需 patch 第三方 Editor 方法或改变保存/授权协议。开发已只读确认此边界，并获 root 授权准备最小 SearchEditorGate 与实际 Tiptap 定向序列检查。

### [P1] 停放原目标失效会切换投影，却留下结果目标的操作弹层

位置：`src/App.tsx:761` 的条件清理与 `:776` 无条件清 query。`clearSensitive(ids)` 会销毁 ids 对应实例并清掉 nativeAttachmentTarget，但只有**当前投影 noteId** 在 ids 内才清 modal/draw/record。新双宿主结构中，受影响的可能是停放原目标 A，而当前投影是结果 B；无条件 setQuery("") 随后又会把当前目标从 B 切回 A。

有限可达序列：A 原本已授权（例如已解锁的锁定笔记）→ 搜索唯一 B，A 停放 → 在 B 打开已有绘画编辑或录音弹层 → 另一窗口对 A 执行真实 removeLock 等产生 epoch 变化、最终 A 仍授权的操作 → `clearSensitive([A])` 销毁 A、清 target、清 query，但因当前为 B 而保留其弹层 → clear 恢复/重建 A 后，旧 B 弹层收到最新 current/editor props。DrawingPanel 的 `onDone`（3353–3370）使用最新 editor；RecordingPanel 的 `onDone`（3378–3408）在 target 已空时回落 `current.id`。因此旧 B 操作可能落到 A；A 最终未授权时也可能丢操作或留下无目标弹层。

旧单宿主下，清 query 不改变 noteId；这是新搜索投影与既有失效清理的组合边界，并非要求顺带修媒体整个矩阵。清搜索会改变当前投影时，必须同步取消/失效 B 的 note-specific overlay 和上下文，已在 await 中的旧操作仍须沿原 scope/授权门槛拒绝。不能仅清 target 后允许旧回调走当前目标 fallback，也不能只保留原 `ids.includes(noteId)` 条件。

## 其他有限核对

- `projectSearchNote` 使用真实 resultIds：唯一命中投影该 id，零结果为 null，clear 回到 baseNoteId；不改过滤、排序、引号或模糊语法。current、活动 editor、列表 selected 与 native context 同用投影。零结果无当前宿主/日期/编辑目标，既有 toolbarState 禁用格式、清单、表格、附件、共享、more 及对应菜单，而全局新建和搜索保留。
- 原选择仍留在 baseNoteId，搜索中的点选只改 searchNoteId、不会写 selectedNote 设置。渲染 Set 按 note id 去重；稳定 session/epoch/externalVersion key 保留原宿主。两个宿主各自 NoteEditor 的 onUpdate 仍传其创建时真实 note.id；saveDoc/pending/queues/flush 没有改成临时搜索 id，也没有写空正文。
- 精确逐字比较基线：listed filter/sort、saveDoc、flush、createNote、fileSelected 五块均相等，SHA 见 baseline-and-main.json。所有宿主的 docChanged 仍维护 documentVersion；活动宿主 bookmark 更新保留。clear 没有主动 focus 正文，原生搜索控件/controller 未变；实际 field editor 焦点、Undo 归属仍待运行。
- clearSensitive 新遍历 editorsRef 对 ids 中全部已挂载真实实例 destroy，覆盖停放/当前两个目标；真实 session/epoch/externalVersion key 继续更换，删除/未获授权锁定 note 不建宿主。该正向接线检查不抵消上述投影切换清理问题，也不声称已测试实际事件竞争。
- desktopSearch 受 `!mobile && !separate && !!query` 限制，手机与独立笔记仍直接投影 baseNoteId，渲染通常只有一个宿主；纸张 handler/Editor/schema/styles 未变。共享宿主包装与 onReady map 改动仍需新包有限手机导航/选区 smoke，不能以函数测试当手机运行通过。

## 独立运行和输入差异

临时链接主目录已有 node_modules，离线运行后移除；没有安装依赖。`pnpm typecheck`、`node scripts/check-search-selection.mjs`（5 组）和 `git diff --check a2dcde9 c072a93` 全部退出 0，候选检查后工作树干净。

5 组测试执行实际生产选择函数、toolbarState、schema 和已安装 Tiptap/ProseMirror。第 5 组只验证 setEditable 停放原语、完整文档和 headless history；没有挂载 React 宿主，也没有运行异步 restore/overlay 失效时序，因此不能覆盖两个 finding。它也未通过实际 pending queue——测试的 pending Map 是观察用局部引用，生产保存归属结论来自上述接线阅读与字节比较。

主分支本次读取身份 `729b953a4c785cd49597a943a74a348c90556bbc`。相对候选基线 a2dcde9，主增加权限修复 ff6b93a 与文档/证据；App、Editor、schema、toolbar state/controller、style、package/lock 均无差异。权限的 Rust lib/media_permission/config 属于主的额外输入，不能将候选 c072a93 单独称为包含已合入权限修复的完整主源码。后续须由 root 整合、冻结实际输入后统一构建。

本轮不证明原版零结果像素、真实 Mac 唯一→零→clear、实际保存/冷启、原生菜单快捷键路由或手机 smoke。修订候选应只针对两条生产时序增加必要检查，再由 verify 复核；不重跑旧 IME/媒体/权限完整矩阵。
