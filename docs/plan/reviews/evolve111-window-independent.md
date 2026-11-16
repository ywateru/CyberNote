# evolve-111 window 独立审查

日期：2026-11-17。审查者未参与本模块实现。

- 工作树：`/Users/water/work/2026/Apple-Notes-Clone-evolve111-window`，分支 `codex/evolve-111-window`。
- 被审提交：`5e10f6148af431038e15a4d108b969340b3cb87e`；基线：`89dc171b90a74d8ddc183f9ec90486a2b16c0387`。
- 结论：**MODULE_SOURCE_PASS / native-open**。P1 blocking 0，P2 blocking 0；P2 nonblocking 1 项，为已有 113 几何断言的动画测量时序问题，证据与建议见下文。
- 本次只新增本审查文件；未修改实现、作者脚本、任务或作者验证记录。没有启动安装版用户应用、连接手机或打开用户资料库，也没有运行产品构建。

## 范围与契约核对

已读 [111 任务](../tasks/evolve-111-application-service.md)、[agent MCP 契约](../../architecture/agent-mcp.md)、[作者 window 验证](../../verification/evolve111-window.md)，核对目标提交全部 8 个变更文件及相关现有 owner。真实原生协议依据主树 `/Users/water/work/2026/Apple-Notes-Clone/docs/verification/evolve111-native.md` 只读核对；没有使用已清理的旧 111/113 工作树，没有操作 114。

以下代码位置均为被审提交的行号。

| 契约 | 位置 | 独审结果 |
| --- | --- | --- |
| 独立协议与真实 bridge 边界 | `src/agent-window.ts:52,69,95`；`src/bridge.ts:53,59` | notes-agent 独立解析，精确字段/目标集合/阶段/布尔值校验；receipt 必须匹配 operationId。真实 listen/invoke 使用 `agent_window_reply` 和当前 access expected，不传调用方指定的 window label，不复用 sync parser 或伪造同步计划。 |
| 活动编辑、PM/Tag IME、未保存保护 | `src/App.tsx:1073,1175,1306` | 实际 Editor 焦点及会话 body editing、PM composing 与 Tag pending 均保护目标；pendingDocs、saveFailures、登记及排队/在途计数构成 unsaved，已完成队列历史不误报。作者真实 CDP 组字通过；独立延迟 register_save_intent，在无活动编辑的 browsing 状态确认仍报告 unsaved 并拒绝 prepare，保存确认后清除。 |
| recording/picker/OCR 的完整 owner 生命周期 | `src/App.tsx:1078,3010,3162,3415` | picker、附件批次/提交、OCR operation、录音 ticket 到最终 release 均取实际目标，未只看面板或 recording 布尔值。作者组件检查覆盖 picker、OCR 和录音最终释放延迟，独立补验冻结时入口拒绝。 |
| prepare 全写入口冻结 | `src/agent-window.ts:280`；`src/App.tsx:538,794,840,1090,1225,1239,1306,5154`；`src/platform/native-platform.ts:197` | active 先同步发布，再安装 PM transaction/input/admission 门禁并重验 snapshot/lease。共享 facade 覆盖保存登记前、普通动作、原生命令、速绘、附件/OCR/录音与导航。真实 Undo/Redo、格式、picker/OCR/recording 均拒绝；直接 PM docChanged 被过滤并请求取消。非目标保存仍可工作。 |
| 只以真实 terminal 结束取消 | `src/agent-window.ts:174,231,299,341` | 5.5 秒 watchdog 只请求 ready:false；取消 IPC 失败继续按原 operation 重取终态，不把超时当 abort。release 匹配 Session、operation 和完整目标集合；commit 收据进入可信刷新。 |
| 旧 release、迟 ACK 和替换 Session | `src/agent-window.ts:154,180,231,319,370` | 操作实例身份、completed 集合和 terminal promise 阻止旧回复改变后继操作。额外验证挂起旧终态 ACK、旧取消 invoke、旧 refresh、捕获旧 watchdog 回调、dispose/remount，后继 gate 均保持；目标集合不匹配的 release 拒绝。 |
| metadata 可信刷新、真实 layout commit 后 ACK | `src/App.tsx:946,1192`；`src/use-editor-commit.ts:4`；`src/agent-window.ts:180` | 复用现有 metadataRefresh owner，检查 Session、metadata 可发布/已应用/无欠刷新及访问屏障，再等待父级真实 layout effect，随后二次检查。独立在 refreshed:true IPC 调用的当刻读取真实 DOM 与 PM JSON，正文已是提交后的内容；延迟可信读取期间不 ACK。 |
| failure freeze | `src/agent-window.ts:191,341`；`src/App.tsx:1192` | 可信读取失败发送 refreshed:false 并保留冻结，重复 terminal 可重试；独立补验读取失败且负 ACK 也失败，仍冻结，后续 cancel 按已知 commit 重试刷新成功。没有重放写入或伪 abort。 |
| 与 sync/navigation 单 owner 互斥 | `src/App.tsx:521,538,1090,1187`；`src/navigation/use-navigation.ts:166`；`src/network-sync.ts` | 两个 coordinator 使用同一个 quietHost/editorGate，互相报告 blocked；合并 cancel 等待两者 terminal，Navigation 保持既有 owner 与请求序号，pending 和未 layout commit 投影阻止 prepare。既有 sync 34 项、导航/焦点 41 项均通过，未新增另一个同步、导航或编辑器 owner。 |

## P2 nonblocking：113 几何断言在页面动画中严格比较浮点数

位置：`scripts/check-evolve113-interaction.mjs:126`、`:127`；关联 `src/style.css:1891`、`:3058`、`:3655`。

原始 `pnpm test:evolve113-interaction` 本次串行运行两次均 exit 1，失败都是 `320px more target fits card and viewport at >=44px`。没有将原脚本记录成通过，也没有修改该脚本。

独立诊断副本保留原断言及原先捕获的 box，仅追加几何/祖先动画打印；两次均完整 90 项通过。另以真实 mobile App 连续 8 次从 editor 返回 collection，逐帧采样共 160 帧：19 帧严格断言不成立，典型值为 `x=124.95771026611328, width=43.99999237060547, height=44`，按钮 computed width/height 均为 `44px`，祖先仍运行 `page-in` 平移。8 次动画结束后的值均为 `x=106, width=44, height=44`，位于 320px 视口内；无浏览器异常。诊断也捕获动画中的 `44.00000762939453`，符合平移后的浮点舍入。

`git diff 89dc171b -- src/style.css scripts/check-evolve113-interaction.mjs` 无输出，相关布局与测量脚本均与基线一致。结合实际逐帧结果，判定本次失败为既有测试未等页面动画结束而严格比较浮点尺寸，没有确认本提交引入真实按钮缩小/不可达退化；不阻塞 111 window 源码模块交付。它仍是应修复的回归可靠性问题。

最小修正建议：由开发者在测量前等待目标 `.notes-pane` 上实际运行的 `page-in` 动画结束，再测两个卡片的稳定 box，保留最小尺寸和视口可达性断言；如仍需动画中采样，对浏览器几何舍入使用极小容差，同时单独校验 computed 最小尺寸。不要用任意长 sleep 或删掉断言替代。此独审未实施修正。

## 实际验证命令与结果

使用既有 Node/pnpm/依赖。浏览器检查运行现有隔离 headless runtime、真实 React/PM/保存队列，IPC、存储、事件和设备为合成边界；没有传入真实 Rust transport 或用户库路径。临时探针仅导入/转译本提交生产模块，不替换生产 coordinator 或 App。

| 命令 | 实际结果 |
| --- | --- |
| `pnpm typecheck` | exit 0 |
| `node scripts/check-agent-window.mjs` | exit 0，54 项 |
| `node scripts/debug/agent-window.mjs artifacts/evolve111-window-independent-author` | exit 0，38 项；源指纹未变 |
| `node scripts/debug/sync-window.mjs artifacts/evolve111-window-independent-sync` | exit 0，34 项；源指纹未变，无浏览器异常 |
| `node scripts/debug/sync-window-navigation.mjs artifacts/evolve111-window-independent-navigation` | exit 0，41 项；源指纹未变，无浏览器异常 |
| `node /tmp/evolve111-window-independent-coordinator.mjs` | exit 0，8 个额外竞态/终态边界 |
| `node /tmp/evolve111-window-independent-browser.mjs` | exit 0，10 个额外真实组件检查；ACK 当刻 DOM/PM 正文正确，无浏览器异常 |
| `pnpm test:evolve113-interaction`，两次串行运行 | 两次 exit 1，同一 320px 几何断言失败；原脚本未获通过 |
| `node /tmp/evolve111-window-independent-113-diagnostic.mjs`，两次串行运行 | 两次 exit 0，各 90 项；仅诊断副本，不能代替原命令通过记录 |
| `node /tmp/evolve111-window-independent-geometry.mjs` | exit 0；8 次真实返回导航、160 帧，19 帧浮点严格失败，8 次稳定尺寸均正确 |
| `git diff 89dc171b -- src/style.css scripts/check-evolve113-interaction.mjs` | exit 0，无输出 |
| `git diff --check 89dc171b HEAD`、`git diff --check`、`git diff --cached --check` | exit 0，无 whitespace 错误 |

独立 browser 探针调试时曾因自己先等待会 flush 的 editor.done 而与挂起 registration 互相等待，随后一次因假定存在 HTML search 输入而 locator 超时；这两次是探针前置条件错误，不是产品失败。最终探针先完成 browsing，再通过无焦点的实际 PM transaction 触发保存，并兼容无 HTML search 的布局；最终 10 项 exit 0。挂起运行仅终止了该探针自建的 headless Chrome，未操作用户浏览器。

检查前后 249 个生产/运行脚本文件的 SHA-256 均为 `187f05da3275dd4bed98f419cc2ca0a63b4bd4aea61b1ef41df019be09797213`，sourceChanged=false，gitDirty=false。报告和 ignored artifacts 不参与此源码指纹。作者组件和回归证据位于上表 `artifacts/` 目录；额外探针、结果和 113 日志保留于本树 `artifacts/evolve111-window-independent-extra/`（本地 ignored 产物，未纳入提交）。

## 交付边界

本次通过的是前端模块源码与隔离真实组件门槛，允许主线后续装配；不是 task 111 全部完成或真实宿主端到端通过。真实 `agent_window_reply` command 与 WebView 身份/Session、document_participants、实际 probe/prepare/terminal 事件顺序、多窗口增减/关闭、事务后 notes-metadata 与 release 顺序、5 秒刷新截止及 WINDOW_REFRESH_REQUIRED warning/补偿、原生输入与访问撤销交错仍为 **native-open**。这些真实装配结果须单独验证，不用 Chrome fixture 或本报告替代。

## 补充复核：刷新失败后的实际恢复路径

按用户补充的 task 112“失败能恢复”门槛，进一步区分安全冻结中间态与最终可恢复性。被审实现仍为 `5e10f614`，此次未改代码。**补充结论仍为 MODULE_SOURCE_PASS / native-open，无新增 P1/P2 blocking**；恢复不依赖重启、手动重发 release 或重新执行 mutation。

实际入口及约束：

- `src/agent-window.ts:297`：prepare 安装的真实 5.5 秒 watchdog 在刷新失败后仍有效，调用 cancel。`:350` 在已知 outcome=commit 时直接重试 `finish(commit)`；`:357` 失败后以 100ms 起、最多 2 秒的间隔继续退避重试。重试必须经过 App 的可信 metadataRefresh 与真实 layout commit，不以计时器本身证明刷新成功。
- `src/App.tsx:1017`、`:794`：迟到 notes-metadata 经既有 metadataGate/可信读取进入 hydration；若正文变化导致实际 Editor 注册，注册门禁 park Editor 并调用合并 cancel，因此可提前触发同一 commit 的可信重试。没有 Editor 注册变化时也保留 watchdog 兜底；不能把“迟到 metadata 必须立即解冻”当成契约。
- `src/App.tsx:1225`：实际卡片等入口的点击先等待合并 cancel，只有可信 commit 刷新完成、原操作 terminal 后才重放点击。冻结期间写入口仍拒绝，不能靠写入操作绕过刷新。
- 原 release 完全丢失时，watchdog 发送原 operation 的 ready:false，从对应终态 receipt 得到 commit 后进入同一可信刷新。旧 receipt/release、不同目标集合与后继 operation 仍受原身份校验，不把提交恢复变成新的写事务。

额外命令 `node /tmp/evolve111-window-independent-recovery.mjs` 最终 **exit 0，12 项真实组件检查通过，无浏览器异常**。未缩短或替换生产计时器，运行真实 App/PM/metadata owner，synthetic transport 仅注入存储错误与原生收据。

| 场景 | 实际观测 |
| --- | --- |
| 只发送一次 commit release，首次可信读取失败，不发 metadata/导航/手动 cancel | 先 refreshed:false 且保持 freeze；prepare 后约 **5611ms** 自动 ACK true 并解冻，ACK 当刻真实 DOM/PM 是已提交正文，revision 未再次改变。 |
| 首次失败后迟到 metadata，可信读取延迟 240ms | 读取挂起期间无 true ACK、仍冻结；约 **694ms** 经实际 Editor 注册及同一可信完成路径恢复，ACK 当刻正文正确。探针初稿错误地要求迟到 metadata 投影后仍冻结；追踪确认是上述安全重试提前完成，已纠正探针前提，没有改产品。 |
| native 已 commit，但不发送 release 或 metadata | 约 **5631ms**，原 operation 的 ready:false 获取 commit receipt，可信强制读回后 ACK/解冻，没有伪 abort。 |
| 持续可信读取失败，且 refreshed:false 回复返回带 committed:true/operationId 的 STORAGE_ERROR | 至少 3 次负 ACK 尝试期间没有正 ACK，保持冻结；仅恢复 synthetic 存储可用性后，已有循环在约 **5923ms** 正 ACK 并解冻，无需新 release/用户动作。 |
| 一次失败后真实点击另一笔记卡片 | 点击经实际 capture/cancel 路径，在 watchdog 到期前完成可信重试，随后才切换 owner。 |
| 恢复后 prepare 新 operation，再送旧 release 和迟到 metadata | 新 operation 保持冻结；没有旧回复解新操作。全部场景均未重放 saveNote。 |

原生 warning/幂等边界只读核对主树 `src-tauri/src/session/external.rs:157,245,352` 及 `application/tests/native_review.rs:119`：release false 记录 refresh_failed，即使 warning 写入失败也保留 commit 终态；原参与者可重取同 operation 的 commit receipt；后续 true ACK 不抹除已观察的失败。finish_delivery 在刷新失败/窗口变化/截止时交付 committed:true + WINDOW_REFRESH_REQUIRED，warning 持久化失败另加 WARNING_PERSIST_FAILED。相同 key 的 mutation replay 返回原结果，不重新执行写入，也不会自动重发 release；因此不能拿“工具可重放”代替窗口恢复调度。本次已验证前端自己的 watchdog/退避/实际 UI 入口承担恢复，synthetic warning 状态不会因后续 true ACK 被清除。

这次没有重跑 Rust 原生测试，也未调用真实 finish_delivery 或证明 warning 实际落盘；上述 Rust 部分为源码/既有原生契约核对。真实宿主补偿装配、有限终态收据的 64 条/5 分钟保留以及多 WebView 交错仍需后续 native 门槛验证。

新增探针与结果保留在 `artifacts/evolve111-window-independent-extra/evolve111-window-independent-recovery.{mjs,log}` 和 `evolve111-window-independent-recovery-results.json`。生产源码指纹继续为 `187f05da3275dd4bed98f419cc2ca0a63b4bd4aea61b1ef41df019be09797213`；补充只修改本报告，`git diff --check` 和暂存检查通过。
