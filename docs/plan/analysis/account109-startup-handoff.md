# ACCOUNT109：启动 handoff 无界帧等待与有限修复提案

2026-11-13。只读调查基线 `44a9f43f5600174682b1ef7e71eb2649205dcc0e`。**源码缺陷已在 device-free fake host 证明；live01 的精确根因仍未证明。** 本文是交给 parent 的待授权设计，不包含产品实现或新 GUI 执行。

## 观察与因果边界

`/private/tmp/account109-cancel-local-live01-output/result.json` 记录候选源码 `920fa9cf3af6e3b3cc3b99fb1a78d960ab0c7d11`、binary SHA `bea14bbe7fe136578d27d691c49425bc7e6e438097780154406dbde796ca83fd`。45 秒 ready 请求在 prepare/documentProbe 超时，1332 次探测的最后状态为 debug=true、readyState=complete、visibility=hidden、startup=loading、rootInert=true、rootHidden="true"、interactive=false。没有执行 SignIn 或 note edit。随后 cleanup 失败，SIGTERM，naturalExit=false；不得归档成正常关闭通过。

`rootHidden` 来自 `aria-hidden`，并非窗口可见性或 CSS `hidden`。根节点从 index.html 初始即 inert/aria-hidden，所有未完成交接的路径都会留下同一状态。WebView 的 visibility=hidden 是另一独立观察，也不能证明 macOS 锁屏。parent 事后报告 AX 正常、未锁及 owned process 已 gone，但未保留精确观察时间；这些不是本作者复测，也不能反推超时期间的窗口状态。

旧 `gui-access02` 在旧 39c 候选的新 store 成功 ready；同一 920fa9cf 候选的 relogin04 两 GUI 也成功 ready。它们排除“该候选必然启动失败”的推断，不能定位本次初始异步或 WebView 调度状态。[有限证据、原结果 SHA 和 fixture](../../verification/account109/native/startup-handoff-analysis01/README.md) 独立保存。所核对的 14 个启动产品/driver 文件与 920fa9cf 完全相同，不是拿后续源码替代候选行为。

## 实际启动链与源码定位

| 环节 | 基线精确位置 | 可得结论 |
| --- | --- | --- |
| 初始 splash 与 inert root | `index.html:16,33–35` | 独立 startup.js 先于应用模块；初始 ARIA 状态不能反推哪个 gate 未完成。 |
| React / StrictMode | `src/main.tsx:17–21` | React mount，开发 StrictMode 必须支持 setup/cleanup 重放。 |
| 工作区初始化 | `src/App.tsx:963–996` | 等待 access/metadata 监听，再等待 synchronize；finally 才清 loading。任一 pending 都可能阻塞。 |
| 可信 workspace load | `src/App.tsx:450–454,1714–1776`；`src/bridge.ts:222–232`；`src-tauri/src/lib.rs:198–204` | native load_workspace 取得 Session 锁；只有可信 hydrate/selection 成功才清 cover/synchronizing 并置 workspaceLoaded=true。不能绕过。 |
| 原生 toolbar 初次绑定 | `src/platform/native-platform.ts:129–156,617–629`；`src/native-toolbar-controller.ts:71–84,114–139` | loading=false 后异步 listen/bind，返回才发布 nativeInfo；**首次 bind 不依赖 rAF**。后续 update 才可能用 `src/native-toolbar.ts:33–35` 的帧调度。pending bind 尚不能排除。 |
| readiness 真值 | `src/App.tsx:3986–3988` | loading、workspaceLoaded、syncCover、synchronizing、当前 editor/lock/deletion、native/mac/mobile/nativeInfo/error 的既有条件全部保留。 |
| 已 ready 后的 handoff | `src/App.tsx:3989–4000` | 两层 rAF，只有 callback 调 startup.ready；没有 timer 后备。 |
| splash 退出 | `src/startup.ts:11–15`；`public/startup.js:19–24,39–63` | 15 秒 timer 只提示重载，不释放 root；ready 才进入 leaving，再由已有 240ms timer 结束，reduced-motion 可直接 finish。 |
| native 显示 | `src-tauri/src/lib.rs:843–847`；`src-tauri/src/sync_e2e.rs:118–145`；runner `account109-cancel-local.mjs:101–103` | 本 runner 设置 left slot，setup 在启动 stdio serve 前 show/unminimize；这些调用不等待 splash。**没有找到 show 等待 startup.ready 的源码闭环**；show 成功也不保证页面在整个等待期间 visible/获得帧。 |
| Ready 探测 | `src-tauri/src/sync_e2e.rs:269–350` | 先等 main PageLoad Finished，再读真实 DOM；interactive 后才进入 debug idle/handoff 最终确认。本次停在 documentProbe，不能称为 appIdle timeout。 |

## 已证明的独立缺陷

Fake host 直接执行从当前 App 提取的真实 startupReady/effect 和完整 `public/startup.js`，不复制实现另写一个 selector。所有 gate 为 true 时不交付 rAF、但推进 timer 至 45 秒，root 仍 inert/aria-hidden，startup 仍 loading；15 秒 timer 仅使 retry 可见。恢复正常两帧后才进入 leaving 并最终解除 root。减少动态效果也不能绕过 App 的两帧等待。

同一 fixture 同时证明 workspaceLoaded=false、nativeInfo pending、loading=true 或 synchronization cover retained 都可产生相同 loading/inert DOM；因此该反例证明 **存在可修复的无界帧等待**，不能证明 live01 已走到该分支。共 10 个有限用例通过，包括效果 cleanup 取消第二帧、workspace failure/error 保持 gated 及原 nativeInfo 显式错误 fallback。这里没有运行 React renderer、WebKit、AppKit 或设备。

## 最小修复契约（待 parent 授权实现）

1. `startupReady` 的全部条件原样保留；初次可信 load、selection/editor、toolbar 语义及错误路径不放宽。不按 ready 超时、hidden、debug 已注册或 DOM complete 推断业务已 ready。
2. 在既有 `src/startup.ts` 内增加内部调度入口，返回 cancel。**仅在 React 已提交且 startupReady=true 时**安排原有双 rAF，并行设置固定 **250ms paint-wait timer**。不新增 public 文件、runtime 配置、IPC 或账户行为。正常两帧先到即可继续，不引入最短等待时间。
3. 两帧和 timer 争用同一个一次性 finish。胜出时先原子标记完成并取消第一/第二帧及 timer，再调用既有 startup.ready。后备是放弃无限等待装饰性 paint barrier，不能声称发生了两帧绘制；仍使用原 `public/startup.js` 的退出/ARIA 解除逻辑，不从 runner 强行修改 DOM。
4. 每次 setup 有 live 标记/代际身份；所有 callback 执行前检查。false、unmount、旧代际或 cleanup 后的 callback 即使已经入队也不得调用 ready。**失效必须在 commit 时同步发生**：建议将这段调度生命周期放在 `useLayoutEffect`，或等价的 commit 同步 invalidation；不能只依赖异步 passive cleanup 来宣称 false 已绝不会 release。StrictMode 重放必须取消旧 setup，不能跨实例复用旧 timer。
5. 保持 workspace 失败的 startup.fail 和可信恢复路径；不能让后备 timer 在 gate=false 时启动、覆盖失败、自动重试 load、修改 store/session/owner、开启 account sync 或伪造 Native Ready ACK。成功 ACK 仍须通过原真实 DOM、idle 和 startup detached 检查。
6. 250ms 只是已 ready 后的 paint-wait 预算，不是 OS 硬时限。浏览器若同时暂停 JS timers，不能保证该墙钟时间；既有 public ready 的 fade timer 也仍受调度影响。此局部改进不解决 pending load/bind，不承诺修复 live01 或实机通过。

实现阶段需要有意义的 fake-clock 回归：两帧先赢、零帧 timer 赢、只到第一帧后 timer 赢、竞争同 tick 只一次、false/unmount/StrictMode 取消后迟到帧/timer 均不 release；四类 gate 未通过时从不安排后备；原独立 splash failure/reduced-motion 行为保留。产品改动独审后再由 parent 授权新构建/实跑。本轮没有实现或测试这份候选修复。

## 相邻 debug idle 边界（有限追加，不改产品）

`src/debug/runtime.ts:210–211` 的 frame() 也只等待 rAF。waitForIdle 在 `:423–450` 用外层 elapsed guard，但两处 `await frame()`（`:429,448`）无独立唤醒或 abort；如果帧不再到达，循环无法回到 deadline 检查。即使第一次 state 已空闲，也只累积一次 stable 后停住，不能完成要求的三次采样。因此 **只修 startup handoff 不等于整个 Native Ready 已可用**：`sync_e2e.rs:370–371` 随后还调用它。本次 documentProbe 尚未通过，该 idle 等待不是已记录的原始失败阶段。

如 parent 同时授权一个 debug-only 有界采样修复，应仅为 waitForIdle 引入“非 paint 的让出/重采样”等待：每次至多剩余 deadline 与一个固定短 timer 间隔，返回后重新取得真实 state，继续检查 disposed/live、active、busy、save.saving、save.failed、error、save.pending 和原三次 stable。timer 完成只能许可**重读**，不能增加 stable、清除 active/pending/error、直接返回 idle 或声称发生 paint。超时、save/error 的分类和顺序保留；active retry work 未结束时不能提前把历史失败当作 settled。每次调用只拥有自己的 timer，结束/失效后清理，不留悬挂工作。

这应是 waitForIdle 的局部等待函数，不是全局替换 frame()。同文件 `:287–288` 的 execute 命令完成屏障仍为双 rAF，命令如停在那里，active 不会凭 timer 被清零；新的 idle 采样必须正确 TIMEOUT，而不能假装命令完成。其后续行为是另一个明确保留的边界，本轮不扩大处理。更不能替换 `App.tsx:1730–1735` quiet→cover 路径：那里在可信快照出现访问变化后先 flushSync cover 再等帧，具有防止旧正文暴露的安全顺序意图，与装饰性启动等待不同。

未来 idle 验证需要覆盖：无帧且真实 idle 时三次真实采样后通过；busy/active/saving/pending 不结束则到期 TIMEOUT；settled save.failed/error 仍 APP_ERROR；disposed 拒绝；timer 单独完成不会生成 idle；execute 停在帧屏障而 active 非零时绝不通过。本轮只核对该源码，没有运行 debug idle、完整 React 或任何 App；当前 10 个 fake-host 用例不包含该候选修复。

## 最小只读诊断缺口

确定缺口：driver 在 ready 的 TIMEOUT 后用 Eval 采样 rAF/timer（`scripts/verification/sync108-native-driver.mjs:180–205`），但 native `src-tauri/src/sync_e2e.rs:353–355` 在 READY_ACCEPTED=false 时拒绝除 Shutdown 外的一切后续动作。故本次 fallback 得到 DIAGNOSTIC_UNAVAILABLE，不能将它解释为 JS timer 或状态读取真的挂住。不能为诊断开放任意 pre-ready Eval。

建议另一个有限诊断增量：原 documentProbe 在失败前直接附带**只读、固定结构**的 render-committed startup snapshot：loading/workspaceLoaded/syncCover/synchronizing、editorSatisfied、nativeRequired/nativeInfoPresent、errorPresent、startupReady，及有限 handoff phase（notScheduled/frame1/frame2/fallback/ready/cancelled）。未发布时返回 unknown/null，不猜测；不读完整 app.state/workspace、账户、正文、ID 或原错误字符串。Rust 在同一失败回执附带 visible/minimized/focused 的有限 bool/null；这些当前只在 Ready 成功分支保存（`sync_e2e.rs:333–338`）。由此区分依赖 pending 与已排队 paint wait，无需新任意 Eval，也不改变 admission/ready 规则。不要通过 debug.execute('app.state') 取得这个快照：除了 pre-ready admission 问题，该 execute 自身还有上述双帧完成屏障。

本轮只运行 Node device-free fixture 与语法检查；无 App、网络、浏览器、ADB、native build、grant/原库读取、系统变量覆盖。原失败和全部原始结果保持不变。
