# evolve115 呈现开发证据

日期：2026-11-17。角色：develop；本记录是作者定向检查，等待 Parfit 独立审查，不替代独审或 116 原生验收。工作树 `Apple-Notes-Clone-evolve115`，分支 `codex/evolve-115`，固定基线 `5be79fce`，未中途合并主线。

## 实现范围

- 新增 `src/presentation/`：严格完整 PresentationV1、只读嵌套复制、旧 view/sidebar 迁移与投影、唯一空间/交互解析、共享 context、Preferences 控件。
- 新增 `src/shells/`：永久 WorkspaceShell 子槽，DesktopShell 布局控制与两栏目录抽屉，MobileShell 集合表头。三栏/两栏/专注与密度不换 Editor 父树、key、View、Session 或正文；不以重载文档实现切换。
- 默认专注与临时专注分别归 Settings 和 Navigation；退出保留来源、搜索、集合滚动并恢复焦点，冷开默认专注用 lastNonFocusNavigation 返回。目录抽屉支持 Tab、Escape、遮罩、路由改变关闭。
- 手机列表/画廊与桌面集合独立，Android 横屏/分屏仍为移动交互；Web699/700 和独立笔记窗口规则保留。桌面画廊真实消费 resolver 列数，标准密度沿用 184px 卡片基础和 20px 列距，密度只缩放留白/卡片几何；圆角、字号和 interfaceDetails 保留原职责。
- 录音 dock 收起/恢复保留挂载与原 ticket，Web 断点不卸载已打开的桌面录音。空间不足暂时折叠导航，不写回持久偏好。访问屏障优先级保持，新布局控制被 blocked/inert 约束。
- 沿用 ConfirmedSettings；原 App SidebarPreference 调用已归并到这一队列，关闭等待使用它的 pending/flush。ACK 成功但读取失败保持旧确认 UI，下一写入前恢复权威读；晚到读取、外部 adopt、FIFO 和失败恢复保留。无关/旧字段 patch 保持部分更新。
- Rust 只扩展 Store/archive 的设置验证、原子合并和备份往返；不改 112 host/access/protocol，不新增同步 wire。

## 定向检查与复跑

使用既有共享 node_modules 与已安装 Chrome runtime，没有安装依赖、启动真实 Notes App 或读取用户资料库。浏览器检查运行真实 App、Preferences、Editor/ProseMirror；IPC、平台身份、录音输入与 IME 事件由隔离 fixture 提供，不能宣称是 WK/原生录音或原生中文键盘验收。

```sh
node scripts/check-evolve115-presentation.mjs
node scripts/check-evolve115-store.mjs
CARGO_TARGET_DIR=/tmp/apple-notes-sync85-target cargo test --locked --offline --manifest-path src-tauri/src/application/harness/Cargo.toml --lib settings_and_archive_are_strict -- --nocapture
npm run typecheck
node scripts/generate-theme-tokens.mjs --check
npm run build
git diff --check
```

Store runner 只用生产 `src-tauri/src/application/harness/Cargo.toml`，没有复制 crate 或第二套 fallback。尊重 CARGO_TARGET_DIR；默认复用获准的纯 core `/tmp/apple-notes-sync85-target`，不使用共享 Tauri target。执行前解析最近已存在祖先 realpath 再附回缺失后缀，拒绝 Tauri/main target。必须提供实际 App 的九路径捕获，且与提交的 `src-tauri/tests/evolve115-presentation-replays.json` 完全一致；缺失时不伪造输入。

| 检查 | 结果与证据 |
| --- | --- |
| 115 App/组件定向组 | 108 passed。结果见 [app-results.json](evolve115-presentation/app-results.json)：严格对象/迁移；失败确认恢复与旧字段部分更新；同一 Editor/DOM/View、JSON/选区/Undo/合成组字；两栏/专注/抽屉焦点；画廊密度；录音；附件；失败保存队列；访问屏障；边界/旋转；冷开与独立笔记窗 |
| 实际 App 写入 | 9 路径：sort、view、sidebar true/false、两种旧字段、显式对象优先；ACK/read 失败后 sort/view/sidebar 恢复。提交的 replay 原样供真实 Store 使用，另有 owner 级 FIFO/晚票据/外部 adopt 回归 |
| 真实 Store | 2 passed：完整对象严格拒绝、旧库读取不落盘、权威部分合并、36 种导航×双端集合×桌面密度备份往返；SQLite 临时 trigger 失败保持完整状态/重开；九个 App 捕获路径逐写重开、导出/导入重开。见 [store-receipt.json](evolve115-presentation/store-receipt.json) 与 [store-tests.txt](evolve115-presentation/store-tests.txt) |
| 既有严格设置回归 | 3 passed：interfaceDetails、AppearanceV2、114 实际 App 恢复路径。见 [settings-regression.txt](evolve115-presentation/settings-regression.txt) |
| 113 受影响交互回归 | 90 passed，含栏宽/键盘与取消拖动、字号五档、真实画廊 Enter/Space、失败保全、移动长按/侧滑与音频身份。见 [evolve113-results.json](evolve115-presentation/evolve113-results.json)。原脚本未修改；执行临时副本仅将两处 openRuntime 加 ownedBrowser:true，断言保持原样，结束删除副本 |
| 六份主题的新 Shell 文字 | 每份最终态文字对比度 13.81–21:1，没有放宽 4.5 阈值。见 [shell-contrasts.json](evolve115-presentation/shell-contrasts.json)。只声明新增 Shell 标签范围，不重报 114 全表面通过 |
| 320px 极大字/舒适列表 | 页面 scrollWidth=320，卡片 x16…304，四操作命中区均44×44；见 [mobile-bounds.json](evolve115-presentation/mobile-bounds.json) |
| 类型/token/build/diff | 最终执行回执见 [final-checks.json](evolve115-presentation/final-checks.json)。build 仅有既有大 chunk 提示；core 有两项既有 unused-import 警告 |

Store 回执记录 base HEAD 和执行输入 SHA256，运行前后相同；HEAD 为提交前基线是预期，准确执行源码由哈希识别，哈希不代表逐行执行覆盖。最终检查回执同样区分源码摘要与运行范围。

## 视觉核对与开发中发现

- [三栏](evolve115-presentation/desktop-three-pane.png)、[两栏](evolve115-presentation/desktop-two-pane.png)、[专注](evolve115-presentation/desktop-focus.png)：保留既有侧栏/集合/正文主题，专注保留底部退出入口和正文底部空间。
- [桌面画廊](evolve115-presentation/desktop-gallery-standard.png)：额外隔离 App 创建六篇笔记后截取，1100px 下四列；标准卡片尺寸沿用基线，新增 [密度几何](evolve115-presentation/gallery-density.json) 断言卡片与纵向留白随 compact/standard/comfortable 单调变化。
- [窄窗录音](evolve115-presentation/narrow-recording.png)：700×480 下保留同一正文和录音 dock，收起按钮有独立顶部空间，避免被录音表头截获。
- [手机列表](evolve115-presentation/mobile-list-huge.png)、[手机设置](evolve115-presentation/mobile-preferences.png)：320px、极大字、舒适列表下按钮可达；设置表单可滚动。早先截图截到 page-in 的24px位移，几何检查和最终截图均等待动画结束，没有隐藏溢出。
- 新增焦点断言发现目录触发器在专注时卸载导致返回旧 DOM 引用无效；现保持同一按钮实例并隐藏，退出后实际断言恢复原触发器焦点。Preferences 禁用保存控件导致失焦也已处理，只在用户未转移焦点且仍在原页时恢复。
- 对比度检查曾截到颜色过渡；现等待180ms再检查并逐份落盘，不降低阈值。桌面画廊列数、CSS 优先级与密度纵向间距均有新增真实几何断言。
- Store 初次 replay 的选中笔记未存在于测试库，archive 正确清除该选择导致完整比较失败；现实际写入相同 ID 笔记后保持完整往返比较，没有放宽断言或更改产品行为。

## 集成与保留验收

本树没有复制随后合入主线的 112 AgentSettings assembly。最终整合 `src/App.tsx` 时需同时保留主线 AgentSettings props、动态 `open_note_window`/WK 隔离路径，以及本轮 settings/context/WorkspaceShell/录音 dock 接线；`src/Preferences.tsx` 保留主线 Agent 页及本轮 Presentation 控件和保存焦点恢复。未改 host/access/protocol，也未自行 merge。

原生系统菜单仍只使用既有能力与旧 view/sidebar 部分更新；没有新增 AppKit 专注菜单 wire。准确安装包冷开、WK 动态窗口、跨窗设置协调、原生中文 IME/实体键盘、真实录音、Android safe-area/系统 IME/手势均留给 116。浏览器页面 reload 仅用于冷开偏好测试，布局路径本身不 reload、不重开正文。没有更改 task 状态或独审报告。

## 4c889900 独审三项 P2 修复（等待 Parfit 增量复核）

本节是作者修复与定向检查记录，不改写独审 BLOCKED 结论。父提交为 `4c889900`，产品基线仍为 `7e53af80` / `5be79fce`；没有合入后续 112/main 接线。上文及原证据目录保留为首版历史结果，以下增量单独存入 `evolve115-review-fixes/`。独审报告与 `/tmp/evolve115-independent-8fNhI4/` 原始失败文件均未修改。

- **F1**：App 只在已确认的 **desktop.collectionView** 变化时清除桌面 galleryEditor，resolver 选择另一端偏好不再触发路由重置。真实 App 以桌面 gallery＋手机 gallery/list 两组经过 1280→699→700→1100→1280，均断言同一 DOM/View、原 JSON/选区/路由、正文可见及桌面 gallery-edit。另有对照确认主动修改桌面 view 仍退出原画廊正文，单改手机 view 不退出。
- **F2**：真实 preview bridge 的 settings 分支先验证、构造独立候选，localStorage 写入成功后才发布给内存 preview；settings 不再经过末尾第二次 persist。失败保留整份旧 settings，而非仅遮住 UI；下一笔部分意图仍基于旧权威设置合并。原生分支与其他业务 owner 不改。
- **F3**：抽屉 routeKey 使用来源对象，包括 folder/tag、base/search note、page、query、searching、filter、attachmentBrowser 和 galleryEditor。对象键可区分 tag undefined/null；不把菜单/模态或未提交 searchDraft 纳入关闭条件。真实点击覆盖同 folder/note 的“清搜索＋换页面”和仅换页面，并断言遮罩移除、抽屉关闭、焦点返回原触发器；内层菜单先处理 Escape 的对照仍通过。

复跑命令：

```sh
node scripts/check-evolve115-review-fixes.mjs
node scripts/check-evolve115-presentation.mjs
node scripts/check-evolve115-store.mjs
npm run typecheck
npm run build
git diff --check
```

| 检查 | 增量结果 |
| --- | --- |
| 三项修复正式回归 | **9 场景 passed / 0 failed**，见 [fixed-results.json](evolve115-review-fixes/fixed-results.json) 和新脚本。包括两端集合不同时的真实正文可见性，搜索/页面来源与菜单对照，以及三种真实 preview 部分更新 |
| 真实 preview 失败原子性 | 无 Tauri 注入页面，断言 bridge.native=false。连续两次实际 Storage.setItem Quota 失败后，每次比较 loadWorkspace、完整 localStorage 工作区、确认 UI 和实际 focus 布局。随后分别执行 sort-only、旧 view-only、旧 sidebar-only，比较完整结果、实际提交候选以及 reload 后结果。三份 [sort](evolve115-review-fixes/preview-sort.json) / [view](evolve115-review-fixes/preview-view.json) / [sidebar](evolve115-review-fixes/preview-macSidebarVisible.json) 记录包含拒绝与成功候选；该路径不使用 FakeBackend settings 实现 |
| 原正式 App 回归 | **108 项 passed，9 条实际 App 写入捕获**；原脚本及提交 replay 未修改，捕获仍完全相同。见 [app108-results.json](evolve115-review-fixes/app108-results.json) |
| 生产 SQLite/core | **2 passed / 203 filtered out**。扩展现有 strict/atomic 用例：明确失败候选与旧 presentation 不同，SQLite 临时 trigger 拒绝后保持完整 workspace；随后 sort-only 写入、重开、导出/导入重开仍比较完整设置。既有九路径实际 App replay 继续通过。见 [store-receipt.json](evolve115-review-fixes/store-receipt.json) 与 [store-tests.txt](evolve115-review-fixes/store-tests.txt) |
| typecheck / build / diff | 通过；build 只有既有大 chunk 提示，core 只有两项既有 unused-import 提示。见 [checks.json](evolve115-review-fixes/checks.json) |

新增脚本在修复前实际运行得到 **3 passed / 6 failed**，分别命中 F1 的 mobile-list 边界、F3 的搜索/页面两场景、F2 的三种后续部分更新。红测结果、旧脚本快照及关键状态见 `evolve115-review-fixes/baseline/`。首轮修复后测试器直接读取 debug 响应，漏取 value，导致 UI 快照 undefined；已改用既有 state() 解包，保留全部断言及 [首轮结果](evolve115-review-fixes/first-fixed-probe.json)。旧源码的 preview 红测先失败于权威 loaded 值断言，该测试器修正不改变原故障事实。

本轮只运行新增九场景、相关原108、生产core两项及类型/build/diff；没有重跑376/400或未变113原90，也不重报原生通过。Store runner 仍直编生产 harness，使用获准的 `/tmp/apple-notes-sync85-target` 纯core缓存，运行后已释放；未使用 Tauri target。新增 App 场景的 IPC/平台仍为受控输入，preview 则为生产浏览器桥接与真实 localStorage；SQLite 为生产 Store，三者证据范围分别记录。116 原生门槛与主线112组合复验继续保留。
