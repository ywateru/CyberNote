# APP-SYNC86-FRONTEND 两项 P2 独立复审

2026-11-06。结论 **pass（前端源码和明确本机事件 fixture 范围）**。修复源码 `0c84e589398f90a403f0db7665cb6bebb9db37bb`，作者证据 `06ec6a0bb59f29b290cf733c000a9655541044fd`；唯一工作树 `/private/tmp/apple-notes-sync86-frontend`、分支 `codex/sync86-frontend`。同一独审者执行，未参与修复。产品变化仅 `src/App.tsx` 与新增 `scripts/debug/sync-window-navigation.mjs`；独审只增加本报告与复审证据。

[原 blocked 报告](app-sync86-frontend.md)、产品 `5950bd30` 的原始反例、Vite reload/context destroyed 与 quit idle timeout 均原样保留。原 34 项未覆盖两缺陷的历史事实不变；以下为修复后的新结果。

## Findings

无新增 blocking。原两项 P2 已关闭：

1. **原 P2 搜索/键盘导航：closed。** `src/App.tsx:722` 的 `afterQuiet` 在每次取消终态返回后重新检查 active operation，才执行用户动作；`src/App.tsx:726` 的 `changeSearch` 将输入 draft 与实际 query 分离，保留最新连续输入及清除/退出意图。HTML focus/input/clear、Escape/global search shortcut、native search（包括原 context owner 与冻结目标无关时）、debug search/tag/folder/note/settings 与移动 search suggestion/cancel、标签清除均在等待路径上。已有 `chooseFolder/chooseTag/chooseNote/back/androidBack` 继续在递归执行前重验 freeze；通用 click 捕获继续保护 DOM 按钮。授权敏感清除与已提交远端正文 hydrate 的既有投影变化单独保留，不强行延迟安全屏障。
   - 独审从[原 counterexamples.mjs](../../verification/sync86-frontend/independent/counterexamples.mjs)派生运行，原文件一字未改：输入 `Fixture B` 时实际 owner 仍 A，Escape 时实际 owner 仍 B，且都观察到 `frozen=true/replyPending=true`；终态后分别转 B/应用准确 query 和回 A/退出搜索。共 10 项观察全部通过，自然 exit 0，内部 6.657 秒、外层 6.796 秒。
   - 派生仅调整绝对 import/输出路径、增加终态后原意图断言、去掉已知的 quit admitted 后错误 idle 等待；直接读取 quit blocked snapshot。原失败没有被覆盖或改写。
2. **原 P2 焦点未恢复：closed。** `src/App.tsx:1261` 捕获原聚焦目标的 DOM、selection bookmark 与用户转焦状态；release `src/App.tsx:1323` 在同一 owner/editor/Session/noteEpoch、授权、scope、DOM 连通、document 相等、实际 editable、document 有焦点且用户未转焦时才恢复 selection/focus。pointer、Tab、其他输入 focus、window blur、document hidden 会撤销恢复资格；session/noteEpoch 改变、远端锁删或 editor 重建不满足恢复门槛。旧写事务 filter 和 beforeinput gate 保持。
   - [原 focus-probe.mjs](../../verification/sync86-frontend/independent/focus-probe.mjs)原样独立运行自然 exit 0，外层 6.011 秒；复审额外检查明确断言：四阶段始终同 DOM/owner、相等正文 metadata 不发 cancel、abort 后原 DOM `activeSame=true` 且 editable。该断言通过，不能仅因观测 runner exit 0 推断 pass。
   - 新增 41 项完整独立运行同时验证准确 selection、实际键盘 Undo、用户转入搜索/pointer/Tab 不抢焦点、真实 iframe browsing context 触发 `isTrusted=true` 的 window blur 及返回 BODY 后不夺回焦点、可信 noteEpoch/Session 变化不恢复旧焦点、无关 A editor 的焦点与真实输入保持。

## 本轮验证

| 独审运行 | 自然退出及计时 | 证据 |
| --- | --- | --- |
| `node scripts/debug/sync-window-navigation.mjs /private/tmp/sync86-frontend-recheck/navigation41` | **0，41 项**，内部 **17.784 秒** | [report](../../verification/sync86-frontend/recheck/navigation41/report.json)、[原始 log](../../verification/sync86-frontend/recheck/navigation41.log) |
| 原反例派生重放 | **0，10 项**，内部 6.657 秒/外层 6.796 秒 | [结果](../../verification/sync86-frontend/recheck/replayed-counterexamples.json)、[运行和派生来源](../../verification/sync86-frontend/recheck/original-replay-runs.json) |
| 原焦点 probe 原样运行 + 有效行为断言 | **0**，外层 6.011 秒，断言通过 | [四阶段](../../verification/sync86-frontend/recheck/original-focus-probe.json)、[明确断言](../../verification/sync86-frontend/recheck/original-focus-assertions.json) |

所有运行的源码前后均为 **133 文件 `6da26a58d14d02f0e39c3ed7091d7e739820b750a31cd91d2b45325c3dca918e`**，`gitDirty=false/sourceChanged=false`。41 项 sourceHead 是作者证据提交 `06ec6a0b`；两产品文件与修复产品提交字节一致。原 blocked 报告及整个原独审目录相对 `b4d4cdd3` 字节差异为零。检查和原件 SHA256 见 [audit.json](../../verification/sync86-frontend/recheck/audit.json)。运行中所有新输出仅写 `/private/tmp`，runtime teardown 后复制证据。

本轮不无理由重复作者已对修复产品冻结提交执行的原 34、notes9、build/production 全套；这些最终作者结果均自然 0，准确范围见 [repair README](../../verification/sync86-frontend/repair/README.md)。原 34 在旧产品的独审自然 0 也仍是历史记录，不能混写为本轮独审重跑。新增 41 与原反例实际运行是本轮独立依据。

本轮证明为生产 React/Tiptap、真实 Chromium DOM/input/keyboard/focus/selection 与明确本机事件/IPC fixture。iframe 可信 blur 不证明操作系统原生窗口激活；notes-sync、sync_window_reply、metadata、native toolbar/mobile/device 仍为 fixture。未执行真实 Rust transport/双页面真实数据库/peer 网络；原生设备、真实 mic/用户库和原 Android 约13秒录音现场完全未触碰。完整 86 adapter/87 仍需对应集成任务独立验证。
