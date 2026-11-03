# F07 搜索结果修订：独立静态复核 02

2026-11-03，verify。冻结 `/private/tmp/apple-notes-search-zero-01` 的 `b144c6e`（完整身份见证据 identity.json），在 c072a93 上修正。结果：**source-ready，原 static-01 的 P2 停放恢复和 P1 授权变化后目标串写两项均已在源码边界修正，没有新发现的源码 blocker**。可由 root 整合并冻结统一输入；此结论没有把新代码视为已在 Mac/Android 安装运行通过。

证据目录：`docs/verification/app-001-search-results/independent-static-02/`。未改候选产品源码，未构建、操作 GUI 或继续设备矩阵。独立运行只临时链接主目录现有 node_modules，完成后移除；候选工作树保持干净。主读取身份 `43230ccc1e8cc60d1164c53ec45643713297fe54`，所列前端/依赖输入相对 a2dcde9 没有变化；候选不应单独视为包含主分支 Rust 权限改动的完整包。

## 原 finding 的修正

### 停放实例不会被迟到的 editable 恢复同步启写

`SearchEditorGate` 以实际 Editor 的 WeakMap 保存停放期望值。park 记录一次并同步关闭编辑性；restore 对已停放实例只更新期望值，同时保持 false；activate 在仍 blocked 时继续 park，未 blocked 才取出期望值恢复，并删除停放标记。显式 false 不会被原来的 OR 规则覆盖。只在值变化时 `setEditable(..., false)`，不会因这些恢复主动发正文 onUpdate。

`SearchEditorHost` 的 ready 和 layout 生命周期共用同一个 App gate：活动/停放转换统一接线，移除结果宿主时 layout cleanup 先 park，覆盖真实 NoteEditor 被动清理之前的窗口。原四个恢复调用点全部经过 `restoreEditor`：saveConflictCopy finally、访问 abort、closePaper、noteId 切换时纸张恢复。该函数按实际 owner 和当前 blockedNotes 判定，不依赖闭包中的旧投影 noteId。源码搜索剩余直接 setEditable 均为冻结 false；Editor 未另有 true 恢复。

独立执行新增 7 组检查通过；其中两组直接运行生产 gate 与真实已安装的 headless Tiptap/ProseMirror，覆盖 prepare(false)→park→late restore(true)→仍 false、B 被 park 后 A activate、blocked 保持 false、明确 false，以及完整 document、同一 state 和 Undo/Redo。它们没有挂载 React；layout 接线结论来自源码审查，不能用这组测试证明真实窗口 commit 次序或原生焦点。

### 停放 A 授权变化不再把有效 B 弹层投影到 A

生产 `shouldClearSearchAfterAccessChange` 在 desktopSearch 当前 B 存在且 ids 不含 B 时保留 query，故 hidden A 的 clearSensitive 不再额外制造 B→A；B 仍是投影和弹层的当前目标。当前 B 在 ids 时，原同步分支继续清 modal / draw / record / format / paper，并销毁对应实例，再清 query。session 变化涉及 B 时同样走实际 ids 清理，未获授权或删除 note 不创建宿主。

`nativeAttachmentTarget` 失效时保留原 noteId/scope/stamp/documentVersion，但明确置 editor/bookmark 为 null，不再把已捕获的旧意图清成允许 fallback 的空值。后续 fileSelected 或 RecordingPanel.onDone 会沿原 nativeAssert 拒绝。普通 desktopSearch 的六个文件/照片/相机/文稿/录音入口现在捕获同款上下文；非搜索和手机普通入口保持原路径。现有 native 菜单上下文仍保留。绘画回调仍用当前 editor，而这次修正通过保留有效 B 投影、当前 B 失效时同步关闭绘画，消除了原 finding 的明确授权变化序列；没有把所有其他导航或附件事务边界扩展为已验收。

定向独立 harness 从冻结 App.tsx 的 AST 精确提取原生产 clearSensitive、nativeAssert、captureSearchAttachmentTarget、fileSelected 和 recording onDone，编译后执行，不复制其分支实现。四条有限序列通过：hidden A 变化保留 B query/overlay 且墓碑使 late file 在存储前拒绝；active B 变化同步关 overlay，late recording 在最新 A 上拒绝；file 和 recording 已 await store 时切换 scope，生产 await 后门槛以准确的授权变化错误拒绝正文插入。提取行号与 SHA 保存于 production-boundaries.json。

该 harness 的 lifecycle/owner 是明确的测试 fixture，正文来自真实 headless Editor；storage 是可控制返回的 mock。首次尝试误以为未挂载 Tiptap 的 isDestroyed 为 false，断言失败后已记录并修正 fixture，未把该失败归为产品问题。正向初始 context 校验先通过，负向检查比对确切生产错误，避免缺少 fixture API 造成假通过。这不是 mounted Editor/React 或原生 picker 生命周期测试，也不证明附件已落盘后的 orphan 清理、补偿或重试。

## 独立检查和范围

- `pnpm typecheck`：退出 0。
- `node scripts/check-search-selection.mjs`：7 组通过。
- `production-boundaries.mjs`：4 条原生产源码边界序列通过，限制如上。
- `git diff --check a2dcde9 b144c6e`：退出 0。
- 通过 AST 精确比较 a2dcde9 与候选的 listed、saveDoc、flush、createNote、fileSelected 声明，五块逐字相等。前一轮已有过滤/排序、投影、持久选中、原 note.id 保存归属结论继续成立。

未重新跑无关 IME、媒体或权限矩阵。当前 Android dba83641 的实际纸张/录音证据发生在旧前端上，不能追认为 b144c6e 的手机 smoke。统一包仍需有限 Mac 唯一→零→clear、真实焦点/Undo、挂起原目标回归、必要手机导航/选区 smoke。零结果原版像素、附件保存事务、系统 picker focus 代次及原生媒体来源拒绝仍各按原任务保留。
