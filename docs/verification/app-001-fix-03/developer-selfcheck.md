# FIX03 开发自查与构建交接

最终源码候选：`20c3014`（授权/保存基线行为修复 `b5dcfa8`，`d9a5be5` 固定 proof 早期暂停点，`20c3014` 统一安全随机 UUID 兼容）。旧候选 `fe10c3a` 经独立静态审查确认 P1 保存基线竞态，不能作为本项通过候选。本文件是开发证据，不能替代独立验收，也不表示 F12/F13 或整体像素一致性完成。只操作克隆中的合成文件夹 `FIX03 Session Proof`，未读取用户原版 Notes 的私人正文，未向第三方发送分享，也未检查或清空系统剪贴板。

## 实现范围

Rust `Session` 统一拥有进程 UUID、全局 epoch、逐笔记 epoch、真实窗口登记的保存 intent 与保存屏障；Store 的密钥集合是唯一解锁授权。设置锁、移除锁、关闭锁、删除、永久删除、文件夹删除和导入在目标范围内先 prepare，真实窗口排空已登记保存并明确 ACK，全部成功才变更、撤销钥匙、更新 epoch、重新生成返回工作区并 commit。目标新读/新 intent 在等待期间拒绝，旧合法 intent 可以排空；失败、超时或参与窗口消失 abort，保留授权与未确认编辑。

实际 Tauri 命令是 async；屏障等待位于 `spawn_blocking`，Condvar 等待释放 Store mutex。前端先登记保存再入队，严格 flush 同时核对 pending 文档及失败集合。commit 销毁目标 Editor/历史并清除派生正文与媒体目标；响应必须通过 session/epoch/renderer generation 检查。启动、重新聚焦和可见恢复先遮挡缓存，再接受可信快照；失败继续遮挡并提供重试。

正确密码解密后、发布钥匙前复用真实 Editor schema 与属性验证。首次锁、普通/加密保存也验证文档。冻结的两份合法及两份非法密文不重新生成。真实 SQLite 在密文已持久写入后拒绝 WAL checkpoint 时，返回 `lock_committed` 并维持已提交的授权边界，不能假装 abort。

真实双窗发现的两个邻接缺陷同批修复：macOS Window 菜单注册系统窗口角色；无 pending 的可信外部文档更新才递增 Editor 外部版本。自身保存 revision 不重建 Editor，避免清除选择及 Undo。

## 构建身份

`source-20c3014.json` 是最终候选共享前端、Rust 与所列 macOS 配置的有序 SHA256 清单，aggregate 为 `36da576c291a16a91742b4297b49f85efce1f268f8543cfcf8e72d92960ee117`。`proof-mac/source-final.json` 保留实际有限真窗运行的 d9 身份，不覆盖其历史。

- `production-mac/identity.json`：实际 Q1 运行的历史正式包（新增只读 verdict 日志之前），无 proof 开关。`identity-d9a5be5.json` 保留上一个默认包身份；`identity-final.json` 是最终20默认正式包。
- `proof-mac/identity.json`、`source-before-verdict.json`：实际 Q2/Q3/Q4 运行的额外测试包及源清单。
- `proof-mac/identity-verdict-unrun-fe10c3a.json`、`source-fe10c3a.json`：只读 verdict 日志新增包，仅启动后锁屏，未运行最终 Q4。`identity-b5dcfa8-unrun.json`、`source-b5dcfa8.json` 同样为未运行中间候选，不能混入旧运行结果。
- `proof-mac/identity-final.json`、`source-final.json`：`d9a5be5` 最终额外测试包。包含真实 gate verdict、漏 commit cover，以及真实保存登记完成后交付前的固定暂停点。完整包保存在 `/private/tmp/notes-fix03-proof-d9a5be5.app`，已在用户解锁后完成有限 P1/Q4 真窗运行，见 `proof-mac/final-d9a5be5/`；不再以之前锁屏的 not-run 状态覆盖真实结果。
- `proof-mac/identity-20c3014.json`：最终同源额外测试包（独立复验用，未冒充d9运行），完整包 `/private/tmp/notes-fix03-proof-20c3014.app`。
- `android-identity-d9a5be5.json`：独立 Android 运行发现 WebView91 缺 randomUUID 的旧默认包；`android-identity.json` 是 `20c3014` 默认开关 Android arm64 debug APK。首次构建因本地临时 WebSocket 权限被系统拒绝，授权重跑成功；该身份另列全部已跟踪 Android 原生平台文件的 SHA256。未安装或操作设备，不把构建成功写作 Android 功能验收。

测试包仅通过 Cargo `access-boundary-proof` 与 `VITE_ACCESS_BOUNDARY_PROOF=1` 双重显式选择。固定面板只能暂停真实 save 执行、保存登记原样响应交付、真实 workspace/text 结果交付、丢弃下一次 commit 通知和读取 DOM 状态。它不写 React/Editor、不改请求或结果、不提供任意执行入口。事件由真实 prepare/commit 驱动释放；日志经 Rust 注入实际调用窗口，只允许固定元数据字段，写入固定本地测试日志。默认构建不注册 Rust 日志命令，Vite 消除模块。`production-no-proof.json` 记录默认 JS、macOS 可执行文件与 Android 原生库中四个 proof 标记均不存在。

## 已执行检查

原始日志在 `checks/`。Rust、类型、access 基线与带 proof feature 的 clippy 已针对 `b5dcfa8` 重新执行；`d9a5be5` 仅新增固定 proof 元数据与暂停点，类型与专用构建再次通过。schema/editor 代码未在本次基线修复改变，保留此前检查身份。

| 检查 | 结果与边界 |
|---|---|
| Rust lib tests，offline | 29 passed，0 failed，1 ignored；ignored 是已有进程中断子进程辅助入口 |
| 真实冻结密文解锁 | 合法富文档/绘画精确保存重开；非法结构/绘画属性正确密码拒绝，未发布 key，密文与旧状态保持 |
| 真实 SQLite checkpoint 故障 | 密文写入后 authorizer 拒绝 checkpoint；边界仍 commit，重新打开保持锁态 |
| 生产 AccessGate | 16 个用例通过：12 个旧 generation/session/epoch、排空保存及连续操作边界，4 个真实生产 SaveRevisions 基线检查；纯类检查不能替代真窗竞态复现 |
| 真实 Editor schema | 65 个文档用例匹配共享 schema |
| 真实 Editor state/history | 表格转正文、选择、单次 Undo/Redo、表格外边界通过 |
| TypeScript | 通过 |
| 安全UUID兼容 | 原生路径、版本/variant边界、真实CSPRNG fallback、无安全源拒绝通过；独立015d148复核通过 |
| cargo fmt / clippy all-targets + proof feature | 通过，warnings denied |
| macOS 默认与专用构建 | 20同源专用/默认包身份单列；d9有限真窗证据通过，20最终独立GUI未测 |
| Android 默认 arm64 debug 构建 | 20包成功待独立设备复验；旧d9实际输入/保存失败，独立报告aa6280a |

## 实际 macOS 双窗开发证据

Q1 正式包与 Q2–Q4 专用包是不同身份，不能混作同一包的全量通过。窗口来自真实 Tauri WebviewWindow。操作用原生 AX/键盘输入；截图与 AX 留存。专用日志不包含正文，AX 仅包含合成标记。

Q1：W2 保存 `PRIVATE-Q1-FINAL-SAVED` 后切回 W1，实际编辑器已显示外部新正文；W1 关闭所有锁定笔记后，两窗均无正文编辑器。W2 Cmd+Z 不能恢复正文；共享入口返回真实后端“备忘录已锁定或删除，请重新解锁”，没有系统分享输出。证据为 `production-mac/q1-final-*`。此前较早快照保留用于追溯，不以其覆盖最终断言。

Q2：`proof-mac/run-before-verdict.jsonl` 中，真实 W2 `note-1793694990294` 保存请求 `db5e5ce4-4171-4f42-8a3d-0e0263370cf6` 在 seq38 执行前暂停。operation `f4d7dbb4-8e7f-42e9-9e3a-ec67d8425fb9` 在 seq45/47 向 main 与 W2 prepare，seq50 释放、seq53 真正执行，seq55 保存成功 revision47，seq57–60 W2 ACK，seq61/62 commit。重新正确解锁后 GUI 包含已持久的 Q2 标记。它也证明主窗等待锁命令时，另一真实窗口的保存与 ACK 可以进入后端，GUI 线程和 Store mutex 未被等待占住。

Q3：W2 保存请求 `dbcf935e-2633-4675-9254-e1bf04e185e4` 暂停时，W1 实际保存同笔记，随后 prepare 释放 W2 引发真实 revision 冲突。operation `d375e044-a3ae-40bd-9124-37414c3c68cd` seq128/129 abort；两窗授权保留，W2 的未确认标记与 editor 保留并显示错误。当时普通“重试”后成功，但独立审查指出这会用新 revision 覆盖另一窗已确认内容，因此该恢复行为判定为缺陷并被 `b5dcfa8` 取代；不得把此段旧恢复结果写作安全通过。另加 `PRIVATE-SELF-UNDO-CHECK` 后 Cmd+Z/Redo 的自身保存历史证据保留。新候选普通重试坚持旧基线，普通无附件内容只能通过显式独立副本恢复。

Q4 原包：真实 workspace 读取 `fc7616cc-adb2-48ab-b3c9-711b90b375ab` 结果已执行后 seq184 暂停交付；operation `16ecffd8-592e-425d-a01b-d2d6fc050dd5` seq191/193 prepare、seq203/204 commit，seq206 才释放旧结果。最终 `q4-late-read-rejected.*` 与 seq221 DOM 为 editorCount0、hasPrivate false。该原包未记录 AccessGate verdict，因此此处结论是实际晚到交付顺序和最终界面未复活，不声称已有逐请求 gate-rejected 日志。

Q4 漏 commit 原包：seq257 确实丢弃了 W2 下一次 commit，但尚未留下未聚焦 cover 元数据及最终 focus 恢复的完整证据。随后用户解锁后，`d9a5be5` 的有限 P1 与 Q4 已实际运行，原始日志、AX、截图和断言见 `proof-mac/final-d9a5be5/`。P1 seq46 登记结果暂停→主窗 seq62 保存 X revision2→W2可信 focus→A/B seq89/92 和普通重试 seq121 都以旧 revision1 返回 conflict，source X 保持；seq134 原子副本成功 revision1，含A/B。退出进程后 SQLite 只读重开确认源 id `8ae60447-20ef-416e-9323-b54c3c9f04ef` 保持 X/revision2、副本 id `6b87cc68-1a44-496b-b5dd-9c52faa00880` 保持 A/B/revision1。应用冷启动后逐份 GUI 复核仍留独立验收。

最终 d9 Q4：同一真实 request `fb3df310-17bd-44e8-bdf3-98bc49c65390` seq193 暂停→commit→seq215释放→seq219真实 gate-rejected(access_changed)；seq236 DOM editor0/privatefalse。漏 commit operation `dc4fd16b-ba7e-4a71-b1ef-2f9166bf090d` seq277 在未聚焦 W2 记录 covered true；聚焦后可信快照完成，seq290 editor0/privatefalse。它们是开发真窗证据，不能替代最终20包独立验收。

## 独立复验与保留限制

独立方从最终 `20c3014` 重新构建，按 `docs/verification/qa-fix-03/test-plan.md` 执行。合成冻结密码和四份归档见 fixtures 的既有说明；不要重新生成非法文档。额外 timing 包构建：`VITE_ACCESS_BOUNDARY_PROOF=1 pnpm tauri build --features access-boundary-proof --bundles app`；默认交付包恢复：`pnpm mac:build`。每轮应先退出测试进程再归档固定日志，避免不同进程 seq 从1重启后混在同文件。

新增真实 SQLite 副本写失败测试确认源不改/不创建新笔记；合法副本冷重开保持两份文档，非法 schema/锁定/附件源拒绝且状态保持。新增 Session 测试确认错误全局/源 epoch、prepare 和删除后请求不能创建副本。

独立 Android 默认 d9 包发现 WebView91 在安全上下文仍缺 randomUUID，所有保存登记失败并保留 pending。`20c3014` 集中使用 secureId：原生 API 或 getRandomValues 的 RFC4122 v4，缺强随机源明确拒绝。原生/版本位/variant位/真实随机 fallback/缺源拒绝与类型和16个access检查通过；此变化没有改 Rust 授权/revision。新版双端和同源专用包身份单列，最终 Android 原生输入/保存/冷启动待独立设备复验。最终20默认macOS正式包已干净启动，无proof面板；`startup-20c3014.*` 显示源X与独立副本A/B两个列表摘要。恢复时第一次getApp命中旧保留PID70272的过期界面，因此使用真实系统Quit菜单退出、确认无克隆进程后再启动最终包，记录唯一PID73159及正式可执行路径，不把首次旧窗口算作最终冷启动证据。

未覆盖的运行矩阵仍 unknown，尤其最终20包独立真窗/Android复验、全部删除/附件/导入中途窗口变化和完整像素交互一致性。当前含附件笔记仍不支持锁定，标题按既有契约可见；不引入 iCloud，不更改这些产品约束。本文不是完整安全审计。
