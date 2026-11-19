# settings121-ui 独立验证

日期：2026-11-19。验证者仅审查和运行隔离验证，没有修改实现或管理工作树。本提交仅包含本 review。

**UI 模块结论：blocked。** 左栏保留、基础列表 tokens/尺寸、共享样式能力与已测账户边界通过；R1、R2、R4、R5、R6 是模块自身的 P2，交回开发者修复。R3 为 P3 nonblocking。视觉方向接近不等于交互展开态和常规操作已经完全一致。

**App 集成结论：blocked（I1 必须在 UI-host 整合时修复）。** Cloud / backup / update 尚未接入真实 App 是约定的后续工作，不据此阻塞纯 UI 模块；也没有将插槽演示当作云同步、备份或更新功能验收。

## 版本、契约与范围

- 被测源码：`e29a7d8c0c6cec1accf4ee1599be283baa33cb10`，父版本 `f4cc23082a1e013940480b83de32877eb3bce8b0`。验证启动时工作树干净；所有浏览器检查在写入本 review 前完成。
- 工作目录：`/Users/water/work/2026/.cybernote-worktrees/settings121-ui`。Node `v22.16.0`、pnpm `10.15.0`、Google Chrome / Chromium `157.0.8103.79`。
- 先读本树 `agent.md`，以及主目录只读 `/Users/water/work/2026/Apple-Notes-Clone/docs/architecture/settings121.md`、`docs/plan/tasks/settings121-ui.md`。设计判定以 settings121 的“界面”“验证”为准；既有 `docs/ui/preferences.md`、`docs/ui/account-sync.md`、`docs/architecture/theme-presentation.md`、`docs/architecture/account-device-actions.md` 和 `src/presentation/README.md` 用于核对保留职责。
- 独立检查全部 7 文件 diff：`Preferences.tsx/.css`、`AccountSettings.tsx/.css`、`PreferencesInterfaceDetails.tsx`、`presentation/PreferencesPresentation.tsx`、`scripts/check-settings121-ui.mjs`。另追踪 `App.tsx`、`font-size.ts`、`account-client.ts`、`SyncSettings.tsx` 与 debug 分类门禁。
- 读取主目录 `refs/magpie/internal/gui/assets/app.css` 的 palette、list、row 和 `.segs/.opt`；明确的 13px/1.4、48px、分段尺寸按本轮 settings121 契约判定。当前对话未提供可直接逐像素比对的原始“截图1”，故没有声称与原图像素一致。用户另行确认了作者截图的整体视觉方向。
- 用户追加要求检查桌面选择器展开态、灰色常规操作和顶部更新 pill；已重新读取主目录 `settings121.md:27` 的精确规则。参考项目自己的 AGENTS/code-standards 仅作研究材料，其“no native select”不是本仓库独立强制指令；以下 R4–R6 根据用户“UI完全一致”要求和实际参考行为判定。

## 模块发现

### R1 — P2 blocking：更新面板打开后立即 Escape 退出整个设置

- 设计位置：settings121“界面”的内层 Escape 优先、焦点保留要求；模块已声明更新工具栏和可收起面板。
- 代码位置：`src/Preferences.tsx:147` 的 document 键盘监听、`:236` 更新入口、`:239` 更新面板键盘处理。
- 复现：有 `softwareUpdate` 插槽时点击工具栏“更新 1”，焦点保留在 `.preferences-update-action`；立即按 Escape。
- 实际：`dialogCount=0`、宿主 `closed=1`，整个 Preferences 卸载。期待：仅收起更新面板，保留设置和更新入口焦点。面板只处理从其自身子树冒泡的 Escape；入口和搜索栏位于该子树外，document 监听直接执行 `onBack`。没有经过内层收起判断。
- 证据：`independent-result.json` 的 `Escape immediately after update trigger`（false）、`update-trigger-escape.png`。作者脚本先点面板内“重新检查”再 Escape，移动了焦点，因而漏掉入口路径。
- 修复验收：从入口、搜索栏和面板内操作分别按 Escape；先关闭最内层菜单/确认，其次收起更新，最后才返回/退出设置。此处只提出验收条件，未修实现。

### R2 — P2 blocking：跨分类设置搜索丢弃尚未加载的目标与焦点

- 设计位置：settings121“界面/验证”的真实查找、明确加载状态、键盘和焦点要求。
- 代码位置：`src/Preferences.tsx:127` 的 `jumpTo`、`:185` 的目标定位 effect，及 `src/AccountSettings.tsx:251` 起的状态读取/挂载生命周期。
- 复现：从外观页搜索“我的设备”并 Enter。首次挂载的 AccountSettings 还在读取状态，`.account-device-group` 此刻不存在。另用本地 status 回包延迟 250ms 稳定复现。
- 实际：分类跳到账户，但首次 querySelector 失败后仍立即把 `pendingTarget` 清空；effect 仅依赖 `activeTab/searching`，状态返回不会重试。桌面焦点停在“查找设置”，手机停在账户标题，没有滚动/聚焦到设备区域。已同步存在的“排序方式”和“界面细节”目标正常，不能代表异步账户目标。
- 证据：`independent-result.json` 的 `cross-category device search focuses destination`（false）；`negative-result.json` 的 `delayed account search destination focus`（false）；`search-device-focus.png`。
- 修复验收：有界等待正确目标就绪，保留并取消过期导航意图；加载失败或目标不再可用要明确反馈。覆盖延迟、失败、用户再次跳页/再次查找后的旧响应，不能迟到抢焦点。

### R3 — P3 nonblocking：查找结果包含当前平台/登录状态不存在的操作

- 设计位置：settings121 的真实设置查找、手机列表同源及明确状态要求。
- 代码位置：`src/Preferences.tsx:44` 起的账户搜索索引、`:120` 结果过滤；`src/AccountSettings.tsx:415` 的 `!localMobile` 凭据区域条件及 `signedIn` 设备区域条件。
- Android UA + `mobile=true` 下搜索“登录与安全”仍有结果，进入账户页后 `.account-storage-summary` 数量为 0；未登录时搜索“我的设备”同样返回结果，目标设备组数量为 0。当前过滤只判断分类/模块是否存在，没有判断这些操作能否呈现。
- 证据：`negative-result.json` 两项对应负例（false）、`android-security-search-no-target.png`。单设 `mobile` prop 而保留桌面 UA 无法覆盖前者。
- 建议：结果与可用能力/登录状态一致，或给出可执行的前置状态说明；与 R2 的异步等待分别处理，不能无限等待一个永久不存在的目标。

### R4 — P2 blocking：桌面选择器展开为系统菜单，与参考自有菜单不一致

- 设计位置：settings121“界面”及新增精确规则；参考 `app.css:1947` 的 `.sess-pick`、`:4396` 的 `.pref-pick`、`:3416` 的 `.proto-menu`，以及 `app.js:15620` 的 `openProtoMenu`。
- 代码位置：`src/Preferences.tsx:247` 的主题、`:269` 的排序；`src/presentation/PreferencesPresentation.tsx:10` 起导航/显示/密度；`src/PreferencesInterfaceDetails.tsx:193` 的菜单间距，以及 `src/Preferences.css:133`。这些桌面控件仍是原生 `<select appearance=auto>`，不是参考的自有菜单。
- Before（已测实现）：收起态主题是32px高、13px紫色文本；展开后在独立有窗口 Chrome 中出现 OS/浏览器拥有的浮动选择窗口、系统蓝色选中条和系统尺寸/字体。它不随应用右侧暗色 palette 变成参考 menu，弹层还可越出浏览器内容区。主题、排序与桌面显示方式都实际打开并捕获，不能用 headless DOM 截图推断这个弹层。
- After（验收目标）：参考 `pref-pick` 触发器 + 自有 `.pop.proto-menu`，贴锚点、可用空间内定位，浅白/暗灰卡片、11px圆角、应用阴影/边框、7px菜单项圆角、勾选列；文字与选中/悬停色遵循参考 tokens，而非系统蓝条；有方向键、确认、Escape/外点取消和发起控件焦点恢复。
- 证据：`headed-native-theme-open-light.png` 和完整自有窗口裁切 `headed-native-theme-popup-only.png`；`headed-native-sort-popup-only.png`、`headed-native-view-popup-only-dark-ui.png`；`reference-menu-open-{light,dark}.png`；`visual-controls-result.json`。有窗口截图只捕获本次启动的隔离 Chrome 所属窗口/菜单矩形，不含用户其他 App。截图为 Retina 位图，不把位图像素误当 CSS px。
- 参考对照 fixture 运行未修改的参考 CSS 与提取的 `openProtoMenu/holdMenu/placeMenu`，使用最小本地 DOM/翻译/图标 helper 和合成选项；证明菜单样式与交互实现，未冒充完整 magpie App。headless `page.screenshot` 未捕获原生弹层，故另做上述有窗口 OS 裁切，不能将 `native-*-open-*.png` 的 DOM-only 图片作为弹层证据。
- 最小适配：为桌面设置建立一个薄的共享选择器 adapter，优先复用本项目 `MenuSurface/MenuItem` 的定位、关闭、焦点能力，按参考校准触发器和菜单皮肤，并确保该场景走自有 DOM 菜单（注意 NativeMenuContext）。不改 `onSettings`、保存队列或选项业务值；批量替换本模块同族桌面 select。若采用 radio menu 语义，需同时检查共享菜单当前键盘项 selector 的兼容性。手机继续原生 select；弹层若 portal 到 body，须携带 scoped tokens 并纳入 Preferences 焦点/最内层 Escape 管理。回归应覆盖打开/关闭、键盘选取、保存失败旧值、切页卸载和浅暗，不只收起态。

### R5 — P2 blocking：常规行操作和公开 text 原语被统一染成强调紫色

- 设计位置：settings121“界面”新增常规操作规则；参考 `app.css:2456` 的 `.text`，以及 `--ctl-fg` 浅色 `#63636b` / 暗色 `#a1a1aa`。
- 代码位置：`src/Preferences.css:106` 的 workspace button 默认、`:259` 的 `settings121-text`、`:218` 的 data-backup-actions；`src/AccountSettings.css:229` 的普通按钮覆盖；`src/Preferences.tsx:276` 的“全部关闭”。
- Before：公开 `settings121-text` 实测浅色 `rgb(79,70,229)` / 暗色 `rgb(165,180,252)`、13px、padding4px8px；实际“全部关闭”等普通按钮同为紫色（padding6px8px）。与用户明确指出的截图灰色行操作不符，也会把新三个模块的普通操作统一染紫。
- After：常规文字操作12px（保留现有字号缩放）、padding3px7px、圆角6px、浅/暗控制文字分别 `#63636b` / `#a1a1aa`，hover为pill灰底；仅明确强调动作保留 accent。手机触达区继续≥44px。
- 最小适配：补控制文字/pill token，纠正 `settings121-text` 与普通按钮默认规则；审查 account/Agent/data 的高优先级覆盖，显式区分 primary/danger/普通动作，避免靠全局 button 一次染色。无需改变操作 handler。
- 证据：`visual-controls-result.json` 的 actualActionLight/Dark、actualLockDark 和 refAction-light/dark；`actual-ordinary-actions.png`、`reference-actions-{light,dark}.png`。参考的最终值在过渡动画结束后读取；未把紫色 palette token 相等称作文字操作正确。

### R6 — P2 blocking：顶部更新入口缺失参考 pill 视觉和向上图标

- 设计位置：settings121“界面/更新”及新增精确规则；参考 `app.css:330` 的 `.update`。
- 代码位置：`src/Preferences.tsx:236` 的 Download 图标/更新按钮，`src/Preferences.css:106`、`:119` 的普通 link 样式。
- Before：实测高度28.375px、圆角6px、11.7px/400、padding6px8px、背景transparent、box-shadow none，图标为 `lucide-download` 向下箭头。当前截图只有普通紫色链接。
- After：22px高视觉胶囊、999px圆角、11.5px/560、padding `0 9px 0 7px`、4px gap、向上更新图标；浅底 `#eeedfd` / 暗底 `#2b2c47`，accent文字，0.5px accent 35% 内描边。手机可用外层44px触控区包22px视觉pill。
- 最小适配：保留现有 slot/badge 和面板打开逻辑，只修改 header 专用样式与图标，补 accent-soft token；不要依赖模块传入 badge 自行提供外壳。与 R1 的 Escape 修复分别验证。
- 证据：`visual-controls-result.json` 的 actualUpdate 与 refUpdate-light/dark；本轮桌面截图和 `reference-actions-{light,dark}.png`。

P1：本次未发现。R1、R2、R4–R6 需要开发者更改实现后重新验证，本 review 不替代修复。

## 必须在 App 集成修复的回归

### I1 — P2 integration-blocking、非纯 UI 插槽阻塞：实际 App 查看冲突成为空动作

- 设计位置：settings121“设备同步仅移除旧入口，冲突查询与解决迁到账户展开区，旧 sync 意图映射 account 不复活配对”。
- 代码位置：`src/App.tsx:4974` 的 `onConflicts => setPreferencesTab("sync")`、`:4975` 仅传入旧 `synchronization`；`src/Preferences.tsx:116` 的 sync→account 映射和 `:282` 起只渲染 `syncConflicts`；`src/App.tsx:3636` 的旧 debug 门禁；`scripts/debug/preferences.mjs:8`、`:34` 和 `scripts/debug/sync-settings.mjs:27` 的旧分类假设。
- 本次运行的是实际 `src/main.tsx → App → Preferences → AccountSettings`，通过既有 `openRuntime({'account-ui':true})` 注入隔离 JS backend，不是作者组件宿主。桌面 1280×800 和 Android UA 手机 390×844 均从实际设置按钮进入。
- 注入 `conflictCount=2` 后点击真实“查看冲突（2）”：回到 `account`，冲突 disclosure 数量 0、旧同步页数量 0、`sync_command` 次数 0；实际 debug `sync.conflicts` 返回“请先打开设备同步”。单独派发 `settings.tab(sync)` 最终同样回到 account，旧配对界面未复活，后半条兼容要求通过。
- 证据：`actual-app-result.json` 以及 `actual-app-{desktop,mobile}-{before,after-conflicts}.png`，两端无 pageerror。
- 交 UI-host：接入只含冲突查询/解决的组件、controlled disclosure 和账户回调，迁移 Back/dismiss 优先级及 debug 能力/断言。被测树的 `SyncSettings.tsx` 尚无 `conflictsOnly` 接口；作者脚本顶部注释属于整合说明，不能视为已经存在的运行能力。禁止重新挂载旧配对整页解决此问题。

## 已完成的正向与负向检查

独立产物目录：`/tmp/cybernote-settings121-ui-independent-20261119/`。作者原 `/tmp/cybernote-settings121-ui/` 仅作参考，未覆盖。本目录中 `independent.mjs`、`negative.mjs`、`actual-app.mjs` 是本次新增的临时检查脚本，未加入产品或提交。

| 检查 | 完成结果与边界 |
| --- | --- |
| `pnpm version:check` | exit 0，0.1.0 前端/Tauri/Cargo 一致。 |
| `pnpm typecheck` | exit 0，覆盖 `src`；没有运行原生构建。 |
| `node scripts/check-settings121-ui.mjs --typecheck` | exit 0，17 个非声明源码依赖。 |
| `git diff --check HEAD^ HEAD` 和工作树 diff check | exit 0。 |
| 两个账户针对性测试文件 | `node --test scripts/verification/account109-status-dto.test.mjs scripts/verification/account109-login-surfaces.test.mjs`，82/82 pass；这是 DTO/组件逻辑级证据，不能替代原生登录。 |
| 独立复跑作者 UI 脚本 | exit 0，原始结果在本目录 `author-baseline/`；真实 React + 合成账户/数据/Agent ports。不能据此推出实际 App wiring。 |
| 新增浏览器负例 | `independent-result.json` 14 项断言，12 pass、2 false（R1、R2）；`negative-result.json` 7 项断言，4 pass、3 false（R2 延迟补证、R3 两个状态/平台负例）。脚本完成 exit 0 表示收集完成，**不表示全部断言通过**。 |
| 实际 App 局部检查 | 两个平台从真实设置入口进入，真实回调/导航 + 本地 JS IPC fixture，复现 I1；有独立截图与零 pageerror。 |
| 追加展开态与操作视觉对照 | `visual-controls.mjs` 完成参考源码菜单/样式对照与计算值采集；`headed-popup.mjs` 使用新建有窗口 Chrome 打开主题/排序/显示选择，按其 PID 查找所属窗口并裁切，完成后关闭。确认 R4–R6；没有启动用户 CyberNote。 |

### 左栏、基础 tokens/尺寸与共享 CSS 能力：pass；完整视觉一致性：blocked

- 左栏：diff 中桌面侧栏规则和保留图标映射未改变。在相同当前 DOM 上将 Preferences stylesheet 替换为父版本 CSS，逐项比较导航和六个保留按钮的计算样式，完全相等：196px、`76px 12px 26px` padding、8px gap、14px 字体/21px 行高、18px 图标、38px 最小行高、7px 圆角和原浅黄选中态。该比较验证保留元素样式，并非伪称执行了完整父版本 App。移除 sync 后后续条目向上排列符合要求。800px 继续沿原 178px 侧栏断点。
- 右侧：独立实测默认字号 13px、行高 18.2px；行 `min-height:48px`、padding `12px 12px 12px 14px`、gap 14px；列表圆角 12px；segment 轨道 padding 2px/圆角7px，项高22px/padding `0 10px`/圆角5px/字体12px。48px 是最小值，有辅助文字或换行时允许增高。
- 八个浅/暗 palette token 全部符合目标，暗色 card 为 `rgb(35,35,39)`、正文 `rgb(237,237,241)`；设置右侧 scoped vars 没有覆盖左栏 palette。具体值在 `independent-result.json`、`negative-result.json`。
- 共享原语位于 `src/Preferences.css:127`、`:129`、`:135`、`:258`：`settings121-list/row/label/actions/text/segments` 以及 `--settings-*` 可供 Cloud / backup / update 在 `.preferences-workspace` 内复用。用相同公开 class 插入真实 DOM 验证浅/暗配色、行/segment、文字操作；Android 320px 下按钮（含 segment）均为44px。**可复用不等于全部规则正确：text 原语存在 R5。** 未声称三个尚未进入本树的组件已经采用这些 class，整合需检查其 module CSS 不覆盖父级基准。
- 目视检查独立桌面浅色、800px 极大字号暗色、320px 极大字号暗账户、390px 极大字号浅外观和 Android 320px 未登录截图，结构和文字换行可读；追加展开态与操作细查确认 R4–R6，因此不授予完整视觉 pass。

### 字号、窄屏与触控：pass（浏览器边界）

- 作者脚本只手工改一次 `--ui-font-scale=1.1`，且 fixture 的 `onSettings` 未投影真实 fontScales；本次补为 `fontScales(settings)` 投影 `--ui-font-scale/--mobile-ui-font-scale`，与 App 的变量计算相同，未改产品实现。
- 180 个组合：桌面800px、手机320/390px × 浅/暗 × 五档界面字号 × 六个分类。实测字体11.1429/12.0714/13/14.8571/16.7143px；workspace scrollWidth 和子元素右边界检查均通过。此矩阵使用真实生产 React 和本地 ports，结果在 `matrix.json`，不包含真实后端数据或 OS 控件弹窗布局。
- 手机矩阵的可见 button/select/summary 高度均≥44px；另以真正 Android UA 检查320px极大字号未登录布局和两个登录方式 label（各44px），没有横向溢出。桌面 UA 切 mobile prop 的矩阵与 Android UA 补证在结果中分开记录。

### 账户、保存与生命周期：pass（已测部分）

- 真实 AccountSettings + account-client allowlist/DTO 验证 → 本地 invoke port：开启许可先 showModal，初始焦点在取消，Shift+Tab 环回确认；Escape 返回 switch，确认前没有 setEnabled。作者复跑另覆盖目标同步/退出确认取消不发命令。
- 确认开启后注入真实形状的 `account_network` IPC 拒绝：许可保持 off，对话框与固定错误保留，未渲染注入的上游原始消息；没有绕过确认或回退成成功。
- 已选目标对话框打开后撤销许可，随后再恢复许可：确认持续禁用，旧目标不自动补发 syncDevice。例图 `target-revoked.png`。
- 保存故障延迟350ms，发起后切到备忘录：错误可见，焦点仍在新分类，没有迟到抢回；主题失败保留已确认值、细节失败恢复100%、显式false设置仍保存由作者脚本独立复跑补证。
- 退出命令延迟250ms后离开已卸载账户页：结果不复活对话框、不抢走排序控件焦点。关闭设置后等待2200ms跨过一个账户轮询周期，状态调用数保持1→1，未留下轮询。
- 冲突/云/备份/更新插槽的挂载和演示按钮可操作只证明 UI 组合能力。没有证明 Store 保存、跨设备传输、真实云存储、自动备份或下载安装。

## 未运行与交接

- 未运行全套重型测试、Rust/Tauri/Android 构建、安装或发布；没有启动/操控用户原生 CyberNote，没有读取用户账户存储、用户笔记或服务凭据。所有浏览器服务/子进程已由脚本 finally 清理，实际 App fixture 数据位于其新建临时目录并已清理。
- Playwright 返回的 WebKit candidate `/Users/water/Library/Caches/ms-playwright/webkit-2227/pw_run.sh` 不存在，故没有下载浏览器或声称 macOS WebKit 验收。Android UA/触控模拟也不能替代 Android WebView/真机、原生 IME、剪贴板、系统登录窗口与平台返回证据。
- 开发者先修 R1、R2、R4–R6 并复测；R3 可同时收敛。UI-host 必须修 I1、采用纠正后的共享样式、接真实 Cloud / backup / update ports 并补新的组合验证。现有 UI/account 文档仍描述旧设备同步入口，整合完成时应按 owning contract 统一，不能用旧 debug 断言要求配对页面回归。
- 本轮只提交 review 文档，不修实现、不推送、不改变任务状态或既有验收记录。
