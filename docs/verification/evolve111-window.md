# evolve-111：前端外部写窗口协调

工作树：`Apple-Notes-Clone-evolve111-window`；分支：`codex/evolve-111-window`；基线：`89dc171b90a74d8ddc183f9ec90486a2b16c0387`。本次只提交前端协议、App/bridge/导航接线、验证脚本及本记录。没有修改 Rust、主题、Preferences、设计契约、根依赖/锁文件或任务状态；没有修改适配器树、111 原生树或用户配置，没有操作用户资料库、应用或设备。

契约来源为本树 `docs/architecture/agent-mcp.md` 的外部写协调，以及只读的 `Apple-Notes-Clone-evolve111/docs/verification/evolve111-native.md`（读取时该树 HEAD 为 `eb9cee7d3ad1bf90a317ce9c286c653094512f90`）。原生 API 尚待集成；本次不宣称真实 native/host 验收。

## 协议和所有权

`src/agent-window.ts` 独立解析 `notes-agent` 的 probe/prepare/release，三阶段均有 `noteIds`，release 另有 commit/abort。拒绝缺字段、未知字段、无效身份/阶段/布尔值、重复目标和不匹配的 receipt operationId。独立回复类型含 probe 的 `unsavedNoteIds` 和 release 的 `refreshed`。bridge 使用真实 Tauri listen/invoke API：

```ts
invoke("agent_window_reply", { reply, expected: accessGate.expected() })
// receipt: { operationId, outcome: "pending" | "abort" | "commit" }
```

不发送前端指定的 window label，不调用同步 parser/reply，不构造同步计划或保存 intent。Session 不匹配的事件、已结束操作和晚到的旧 ready/release 均不能释放新操作。

App 从实际 EditorSession、ProseMirror/TagComposition、picker、附件批次/提交、OCR 和录音 ticket 收集保护目标；活动编辑、格式/菜单/速绘 owner 也受保护。pendingDocs、登记及排队/在途保存计数、saveFailures 汇总到 unsavedNoteIds。已结束的 queues 历史项不会误报为在途保存。未可信就绪、访问屏障、创建、导航 owner、退出、导入/归档和现有同步屏障报告 blocked；导航新 owner 尚未完成真实 layout commit 的间隙也被阻止；空目标 create 仍重验这些全局条件。

两种协调共享已有 quietHost 的同一个冻结/恢复实现和 editorGate，彼此互斥。source 参数只区分现有同步失效处理与 agent，既有 NetworkSyncCoordinator 状态机没有新增 agent 阶段。metadataGate、可信同步、EditorSession、录音及附件 owner 都沿用已有实例。App 的合并写门禁覆盖原生动作、保存登记前、React Editor admission、直接 PM docChanged transaction、附件/录音/OCR、速绘确认、普通动作、冲突另存、智能文件夹删除、导航/搜索/布局/退出等入口；非目标编辑仍可通过真实保存路径独立进行。

prepare 同步发布操作所有权并安装目标 PM/input/admission 门禁，再重验保护、unsaved、Session、实例/owner、文档、授权、导航 generation 与窗口 scope。冻结保留原 Editor、DOM、bookmark 和 history；abort 不伪刷新。新窗口/导航/输入/owner 变化发送原操作 ready:false，等待原生真实终态收据或事件后才释放；5.5 秒 renderer watchdog 只请求取消，不把超时或 IPC 错误当作 abort。丢失取消回复时按同一个 operation 重取收据；commit 收据仍走提交刷新。可信 Session 替换和窗口卸载结束旧窗口的参与，恢复仍受原授权与实例检查约束。

commit 先复用现有 metadataRefresh owner 获取并应用可信 workspace，检查同 Session、metadata 可发布且已 applied、没有访问/同步屏障，再等待现有父级 React/Editor layout commit ACK，二次检查后释放原操作并发送 refreshed:true。可信读取失败发送 refreshed:false 并保留冻结；重发 terminal 或 watchdog 取消重取终态可重试可信读取。失败不会变成假 abort，也不会重放写入。真实正文变更继续使用现有 externalVersion/Editor 重建路径；prepare/abort 自身不会重建 Editor 或清除 Undo。

## 可复现验证

从本工作树执行；需要已有 Node/pnpm、Chrome 与 Playwright，使用现有 debug runtime 的隔离临时数据和合成 IPC/设备。没有启动安装版用户应用。

```sh
pnpm install --frozen-lockfile
pnpm typecheck
node scripts/check-agent-window.mjs
node scripts/debug/agent-window.mjs artifacts/evolve111-window
node scripts/debug/sync-window.mjs artifacts/evolve111-window-sync-regression
node scripts/debug/sync-window-navigation.mjs artifacts/evolve111-window-navigation-regression
pnpm test:editor
pnpm test:access
pnpm test:evolve113-interaction
pnpm build
git diff --check
```

结果：

| 检查 | 结果 |
| --- | --- |
| typecheck | 退出码 0 |
| agent parser/coordinator | 54 项通过 |
| agent 真实 React/PM/save queue 浏览器集成 | 38 项通过，源指纹前后一致，无 React/browser exception |
| 既有 sync-window | 34 项通过，退出码 0，源指纹前后一致 |
| 既有 sync-window-navigation | 41 项通过，退出码 0，源指纹前后一致 |
| editor | 真实 schema 的 96 个文档 case；table/selection/history/Undo/Redo 通过 |
| access | 16 个 production response boundary case 通过 |
| evolve113 interaction | 90 项通过，串行重跑退出码 0 |
| frontend build | `tsc -b && vite build` 退出码 0 |
| diff whitespace | 通过 |

evolve113 interaction 的 `320px more target fits card and viewport at >=44px` 几何断言在并行及串行运行中出现间歇失败；同一源文件的完整独立运行也有 90 项通过的结果。额外仅打印测量值的诊断运行得到 `{x:118.68345642089844,y:232.59375,width:44,height:44}` 并通过全套。未改主题/布局或该测试，未将此几何时序差异宣称为已修复；通过结果和间歇失败都在此记录。

agent 用例通过 Chromium CDP 驱动真实 PM 中文组字和 TagComposition；使用真实 App handler、Editor 实例/DOM、保存队列、Undo、文件选择器、附件 journal/document ACK 和录音 ticket/final release 生命周期。覆盖 active editing、unsaved/inflight/save failure、空目标 create、OCR、访问屏障、双协调互斥、非目标保存、冻结期间程序化 PM/原生入口写入拒绝、终态前导航等待、window/layout 变化、晚到 ready/旧 release、可信刷新延迟/失败/重试、实例与 selection/history 保全。确定性状态机测试另覆盖 renderer watchdog、丢失取消回复、取消取得 commit 收据、Session 替换和 dispose。

合成边界为 `notes-agent`/`agent_window_reply`、notes-sync 收据、存储/metadata 和设备 IPC；没有替换生产 React、PM、保存队列或 owner 控制器。产物位于上述 `artifacts/` 目录（gitignored），含观测、回复和源指纹；既有回归产物也保留在各自目录。新增脚本正常回归不写 tracked fixture。

## 后续真实宿主接线

原生/host 分支集成后须再确认：真实 document_participants/window label 与 Session token；probe/prepare/terminal 的事件顺序和窗口增减；宿主事务后先真实 notes-metadata、后带原目标 noteIds 的 release；agent_window_reply 对三阶段 ACK、有限终态收据和 refreshed:false 的处理；5 秒刷新交付截止、WINDOW_REFRESH_REQUIRED 持久 warning 与补偿；真实多 WebView/中文输入/录音附件/窗口关闭与访问撤销交错。私有 socket/credential、SQLite 事务和真实宿主提交不在本次前端 fixture 验收范围。此树没有承担 native command 实现或宿主线程/资料库 owner。
