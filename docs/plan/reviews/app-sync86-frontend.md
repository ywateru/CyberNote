# APP-SYNC86-FRONTEND 独立审查

2026-11-06。结论 **blocked**，两项 P2 blocking。审查产品冻结提交 `5950bd3074e4335d4a863b2194012d0173b0dc63`，作者纯证据提交 `2518edd9d758d9225d65db1bc43823dc108901f3`。唯一工作树 `/private/tmp/apple-notes-sync86-frontend`、分支 `codex/sync86-frontend`。开发与独审分离；独审未修改产品、原有测试、Rust、设备或用户库，未 merge/push/管理 worktree。

## Findings

1. **P2 / blocking — HTML 搜索输入与 Escape 在取消终态前改变 editor owner。**
   - 契约：[窗口协议](../../architecture/sync-coordinator.md)第 27 行要求导航等目标变化先等待对应 release 或终态收据，再继续原动作。
   - 代码：`src/App.tsx:3327` 的 HTML 搜索 `onFocus/onChange` 直接改变搜索投影，`src/App.tsx:2653` 的 Escape 分支直接清除查询。`src/App.tsx:1306` 仅捕获 click；`useLayoutEffect` 中 `networkSync.check()` 发现 scope 变化时 owner 已改变。
   - 独立真实 React DOM 重现：预先聚焦搜索框，prepare A 且 ready 后，输入 `Fixture B`；fixture 挂起 `ready:false` 的终态收据，实际 selection 已 `note-a → note-b`，同时 `frozen=true`、`replyPending=true`。再从搜索 B prepare B 后按真实键盘 Escape，同一挂起窗口内已 `note-b → note-a`。两条均自然复现，不是调试命令直接改 selection。
   - [反例 JSON](../../verification/sync86-frontend/independent/counterexamples.json)、[输入 HTML](../../verification/sync86-frontend/independent/search-typing.html)、[Escape HTML](../../verification/sync86-frontend/independent/search-escape.html)、[可复用 runner](../../verification/sync86-frontend/independent/counterexamples.mjs)。第一个发现及后续 Vite reload 原失败完整留在 [attempt01](../../verification/sync86-frontend/independent/attempt01/report.json)。
   - 修复验收：HTML 输入、搜索清除/退出及所有导致实际 owner/scope 改变的用户入口都必须先等终态，保留原操作意图后重放；相等 metadata、无关 editor 正文继续工作。现有清除搜索 click、folder/tag click 已观察到等待，不应因此回退。

2. **P2 / blocking — 短 freeze 丢失聚焦 editor，release 未恢复。**
   - 契约：[窗口协议](../../architecture/sync-coordinator.md)第 29 行要求只恢复当前 operation 保存的旧 editable/焦点且不抢其他页面焦点；[同步架构](../../architecture/sync.md)第 55 行要求保持当前编辑焦点和 Undo。
   - 代码：`src/App.tsx:1248` 捕获 editable/stamp/document，但没有焦点或 selection 归属；`src/App.tsx:1258` 调 `editorGate.park(instance)`，实际 Chromium 将正在聚焦的 contenteditable editor 焦点移至 BODY；`src/App.tsx:1272` release 仅恢复 editable 与 activate，没有恢复原焦点。
   - 最小独立四阶段观测：before-prepare 为同一 `.tiptap` 且 `activeSame=true`；prepared 为同一 DOM、`editable=false`、`activeSame=false/BODY`；相等正文 metadata 后仍同 DOM/owner/externalVersion=0，没有 ready:false；abort released 为 `editable=true` 但仍 `activeSame=false/BODY`。用户未主动转移焦点，说明不是 metadata 重挂或用户选择新焦点。
   - [四阶段原始观测](../../verification/sync86-frontend/independent/focus-probe.json)、[runner](../../verification/sync86-frontend/independent/focus-probe.mjs)。这是观测 runner，自然 exit 0 不表示焦点契约通过。
   - 修复验收：在同一 operation/owner/授权/DOM 仍有效且用户未主动转移焦点时，恢复原 editor 焦点及 selection；用户转移到其他页面或无关 editor 时不得抢回。

## 独立验证与边界

- 原作者定向脚本由独审在提交后的源码独立执行：**34 项通过**，内部计时 **16.782 秒**，命令进程自然 exit 0；包含真实 App listener、PM filterTransaction、真实 Chromium CDP IME/TagComposition settle、目标 save queue ACK、picker/附件 ACK、录音 ticket 至 release ACK、create/access、取消待终态/丢收据重取/5.5 秒 watchdog、迟到事件、可信 commit metadata 后解冻、授权撤销及严格 epoch rebind。
- notes **9 项**、`pnpm build`、生产调试入口排除、`git diff --check` 均独审自然 exit 0。外层进程计时依次 17.046 / 4.499 / 3.842 / 4.131 / 0.062 秒，见 [runs.json](../../verification/sync86-frontend/independent/runs.json)。没有重复已通过全套。
- 补充真实 DOM/键盘观测：搜索清除 click、folder click、tag click 等待取消终态；ArrowDown 没有列表选择路由，实测不切 owner；冻结目标的真实键盘输入不改变正文；quit 先等待取消终态，admit 后 snapshot blocked；普通相等正文 metadata 不取消、DOM/owner/外部版本保持，真实 Undo 可用。相等 metadata 组合断言因上述焦点 P2 自然失败，不追认为全部通过。
- 远端真实改变目标正文允许走既有 hydrate/externalVersion；补测提交后的 B 正文不再匹配查询时 selection 投影为 null，真实 owner/scope 改变产生 ready:false，等待终态时仍保持 freeze。这与用户输入/键盘先导航的 P2 分开解释；不新增“远端正文 Undo 合并”要求。
- 原始失败完整保留：首次反例 runner 运行中写 HTML 触发 Vite reload，使后续场景 context destroyed；确认重跑将运行时输出移至内存及 `/private/tmp`。重跑已确认两条导航 P2，但末尾在已 admit quit 态调用 `idle()` 自然 timeout 10 秒；该项是 runner 等待条件错误，不声称 quit 最终 snapshot 通过。另一个窄 runner 无 idle 等待已单独观察 quit blocked。所有自然 1、失败堆栈与原始日志均保留。
- 所有独审运行前后源码指纹均 **`f516189f46a71e8a1bbeb76722ca1a278e2b97953ac855068804c9abffc1c209`**（132 文件），`gitDirty=false`。产品六文件与 `5950bd30` 字节保持一致，独审只增加报告和证据。
- 证明范围是生产 React/Tiptap/App handlers 与浏览器 DOM/CDP IME，`notes-sync`/`sync_window_reply`、磁盘/设备 IPC 是明确 JS fixture。StrictMode/dispose/session 替换部分是生产 coordinator 的单独受控 host 观测，不冒充真实 Tauri 窗口销毁。真实 Rust transport、双页面真实数据库、peer 网络、原生窗口系统、真实 mic/设备、完整同步 86/87 仍由对应任务验证。

作者修复两项 blocking 后，沿用原反例复审。本轮不修复源码。
