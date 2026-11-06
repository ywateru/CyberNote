# APP-SYNC86-FRONTEND 独审 P2 修复证据

2026-11-06。修复源码冻结提交 **`0c84e589398f90a403f0db7665cb6bebb9db37bb`**，唯一工作树 `/private/tmp/apple-notes-sync86-frontend`、分支 `codex/sync86-frontend`。本目录是开发者回归证据，不代替独审。原源码 `5950bd30`、原纯证据 `2518edd9`、[blocked 独审报告](../../../plan/reviews/app-sync86-frontend.md)与[独审原反例](../independent/counterexamples.json)全部保留；原作者 34 项通过未覆盖这两个 P2 的事实不变。由 root 安排原独审者复审，开发者未修改独审结论。

## 源码修复

`src/App.tsx` 新增同一个 `afterQuiet` 等待入口，每次等待返回后重新检查是否又有新 operation；所有会改变搜索投影的 HTML focus/input、Escape、全局搜索快捷键、原生搜索、程序化 search/tag/folder/note/view/sort 入口，以及移动端搜索建议/取消和标签清除，都在对应 release 或终态收据后执行。HTML 搜索框使用即时 draft 显示用户连续输入，实际 query 和 editor owner 在终态前保持；最后输入或清除/退出意图在终态后继续。授权/删除导致的既有可信敏感内容清除仍按原访问屏障执行。

目标 freeze 保存原 editor 的实际 DOM、可信 Session/noteEpoch、owner、document 与 selection bookmark，仅在 prepare 时真实聚焦目标的情况下保留恢复资格。release 重验同一授权/owner/DOM/scope/document/当前激活 editor 且实际 editable 后才同步恢复选区和焦点；转焦其他输入框、pointer 交互、Tab、真实 window blur 或页面隐藏都会放弃旧焦点，不抢其他浏览文档。PM 写事务阻挡、beforeinput 阻挡、原本的目标 write freeze 一并保留。相等正文 metadata 不换 editor/DOM/Undo；远端真正改变正文仍走既有 hydrate/externalVersion。

新增可复用作者回归 [scripts/debug/sync-window-navigation.mjs](../../../../scripts/debug/sync-window-navigation.mjs)。旧 [sync-window.mjs](../../../../scripts/debug/sync-window.mjs) 原 34 项未修改。

## 冻结提交的最终验证

所有运行发生于源码提交后且证据写回仓库前，`sourceHead=0c84e589398f90a403f0db7665cb6bebb9db37bb`、`gitDirty=false`。两个定向脚本的 before/after、notes 与 production 的 sourceInputsAtStart/sourceInputs 均为相同 **133 文件**指纹：

`6da26a58d14d02f0e39c3ed7091d7e739820b750a31cd91d2b45325c3dca918e`

运行前后 `sourceChanged=false`。冻结标识、精确命令、外层耗时和自然 exit 汇总见 [frozen-source.json](final/frozen-source.json)。四个独立运行（build、原定向、新定向、notes）并发，production 在 build 结束后执行；耗时是实测并发执行耗时，不与旧串行数据混同。

| 命令 | 自然结果 | 原件 |
| --- | --- | --- |
| `node scripts/debug/sync-window.mjs /private/tmp/sync86-repair-final/original34` | **0，34 项**；内部 19.701 秒，外层 20.093 秒；`pageErrors=[]` | [report](final/original34/report.json)、[log](final/original34.log) |
| `node scripts/debug/sync-window-navigation.mjs /private/tmp/sync86-repair-final/navigation41` | **0，41 项**；内部 20.348 秒，外层 20.552 秒 | [report](final/navigation41/report.json)、[log](final/navigation41.log) |
| `pnpm build` | **0**，外层 9.087 秒；保留 Vite 既有 chunk size warning | [log](final/build.log) |
| `node scripts/debug/cli.mjs group notes --out /private/tmp/sync86-repair-final/notes` | **0，9 项**；外层 10.897 秒；`pageErrors=[]` | [summary](final/notes/summary.json)、[log](final/notes.log) |
| `node scripts/debug/cli.mjs check-production --production dist --out /private/tmp/sync86-repair-final/production` | **0**，外层 4.013 秒；`pageErrors=[]` | [summary](final/production/summary.json)、[log](final/production.log) |
| `git diff --check` | **0**，外层 0.073 秒 | [run](final/diff-check-run.json)、[log](final/diff-check.log) |

41 项新增断言覆盖原独审两条真实 DOM 反例、连续真实 HTML 输入的可见 draft/最终 query、Escape 退出、debug search/tag/view 等待、原清除/文件夹 click 等待、HTML focus 与快捷键、原 editor DOM/选区/相等正文 metadata/真实键盘 Undo、用户转入搜索/页面 pointer/Tab 不抢焦点、跨文档真实可信 blur 与返回 BODY 不夺回焦点、无关目标冻结时当前 editor 实际键盘输入、可信 noteEpoch/Session 变化后不恢复旧焦点、native toolbar 搜索从无关 owner 发起时仍等待、移动端搜索建议与取消。三个 runtime 均有页面错误为空的明确断言。[输入挂起 HTML](final/navigation41/search-typing-held.html)和[Escape 挂起 HTML](final/navigation41/search-escape-held.html)保留了终态前的实际 DOM。

原 34 项继续覆盖真实 PM/TagComposition/Chromium CDP IME、保存 ACK、picker/附件 ACK、录音 ticket 至 release ACK、创建/退出/access、5.5 秒 watchdog、取消收据丢失重取、旧事件、commit 等待可信 metadata host、授权撤销以及严格 epoch 重绑。本次不重写旧测试，也不把本轮 P2 修复扩为同步架构或 Rust 改造。

## 预冻结运行与原始失败

全部原件保留，不将 harness 失败计为产品通过，不把预冻结报告的旧 HEAD 冒充最终冻结提交。

| 目录 | 自然结果 | 原因和后续 |
| --- | --- | --- |
| [attempt01](attempt01/report.json) | **1**，已过 24 项 | 测试试图点击仅移动布局显示的 `.folder-large-title`，真实桌面 DOM 无可见布局，Playwright 明确 `Element is not visible`。改点实际可见页面文字；保留 [run.log](attempt01/run.log) 与 failure HTML。 |
| [attempt02](attempt02/report.json) | **1**，已过 26 项 | headless Chromium 的 `newPage/bringToFront` 不产生实际原页失焦，`document.hasFocus()` 仍 true，等待真实失焦自然 timeout。没有拿该路径假称页面失焦已验证。保留 [run.log](attempt02/run.log) 与 failure HTML。 |
| [attempt03](attempt03/report.json) | **0**，39 项 | 改为实际 iframe 浏览文档的原生 input focus，Chromium 产生 `isTrusted=true` 的 window blur；覆盖另一文档持焦及返回 BODY 两种场景。随后补充 noteEpoch/Session 两条断言。 |
| [attempt04](attempt04/report.json) | **0**，41 项 | 最终预冻结定向通过；随后冻结源码并完整重跑，最终依据为上表 final。 |
| [preliminary](preliminary) | 原 34 项与 build 均 **0** | 首次修复后运行原旧测试；旧独审 [focus probe](preliminary/focus-probe.json) 同样显示 before/prepare/metadata/release 四阶段，release 已恢复原 DOM 焦点。该 probe 本身自然 0 是观测 runner，成功依据来自最终新增的明确断言。 |

[诊断探针源码](preliminary/focus-context-probe.mjs)保留 headless 标签页限制的复现实验与 iframe 原生转焦的观测方法；其绝对临时路径 import 是原件，不作为最终可复用测试入口。最终新增 runner 采用相对正式 runtime import，并在浏览器 teardown 后才写 HTML，避免 Vite HTML reload 破坏在途用例。

## 证据边界

证明层是实际 React App/Tiptap、真实 Chromium DOM、键盘、input、selection 与焦点事件。`notes-sync`、`sync_window_reply`、可信 metadata、native toolbar IPC、移动设备和媒体边界仍是明确 fixture；跨文档失焦使用实际 iframe browsing context 与可信浏览器 blur，**不证明真实原生窗口激活或操作系统焦点行为**。未伪造 compositionend、未访问真实 mic、未触碰原 Android/旧 AVD/真实笔记或约 13 秒未保存录音。

未修改 Rust/Session/lib/网络/identity/Rust runner，未创建或删除 worktree，未 merge/push。源码与本目录纯证据分开提交；独审反例及原 blocked 报告保持原样供同一审查者复审。
