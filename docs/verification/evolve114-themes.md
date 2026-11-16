# evolve114 — 主题开发与自检记录

日期：2026-11-17。开发分支 `codex/evolve-114`，基线 `89dc171b`（已合入 113）。这是 develop 自检记录，不是独立 verify 或原生 116 验收。没有实施 115 的布局/密度偏好；没有修改任务状态、111/112 模块、同步 wire 或真实用户资料库。

## 交付范围

- `src/themes/palettes.json` 为 Classic、Paper、High Contrast 三主题 × 明暗的色板真源；registry 和生成的 CSS 共用数据。主题与 system/light/dark 策略分别选择。字体保持本地系统 fallback。
- `AppearanceV2` 是完整、精确的三字段对象，拒绝 null、未知版本/主题、额外/缺失字段。旧 theme 只在新对象缺席时内存迁移；首次任意设置写入原子写 appearance + 旧 theme 投影。旧 theme-only 调用保留新皮肤，只改变明暗。
- 继续使用 ConfirmedSettings 的串行写入、ACK 后权威读取与 ticket；失败不发布候选值。入队时复制/校验嵌套外观对象；独审修订后无关与旧 theme-only 意图保持 partial，由持久层根据当前已存状态原子迁移/投影，ACK 后读取失败另设权威恢复门槛，详见末节。
- Rust 实际 Store 设置写入和 archive 导入/导出采用相同严格规则。只读取旧数据库不落盘迁移；新 archive 纠正过时旧投影，纯旧 archive 保持旧格式，首写迁移。
- 根属性投影覆盖桌面/移动主页面、portal 菜单、设置、图片预览及信息、访问屏障、录音和启动恢复。独立 `?note=` 渲染器初始读取已保存外观；没有新增跨窗实时同步通道。
- `geometry.json` 集中基础几何，组件各用自己的 radius token，再乘既有 radiusScale，上限 24px。菜单 10、画廊 18 等不同基础保留；圆形录音/新增按钮不拉平方形。兼容别名由消费组件局部使用。
- App 改动只含外观派生、根属性 effect、确认后启动缓存及 debug 输入白名单。Editor、Undo、选区、IME、录音控制器仍由原 owner 持有。

## 首次提交的执行与结果（后续修订见末节）

| 检查 | 结果 / 证据边界 |
| --- | --- |
| 修改前 `pnpm typecheck`、`pnpm test:evolve113-interaction` | 通过；113 定向 90 项 |
| 修改后 `pnpm test:evolve113-interaction` | 通过 90 项；之后仅继续调整主题颜色/反馈样式 |
| 最终 `pnpm typecheck` | 通过 |
| `node scripts/generate-theme-tokens.mjs --check` | 通过，提交 CSS 与真源一致 |
| `node scripts/check-evolve114-themes.mjs` | 通过 247 项；真实 React App/Editor/Preferences，隔离 JS IPC 与合成 capture |
| `node scripts/check-evolve114-store.mjs` | 通过 2 个真实 Rust Store/archive 测试；包括旧 interfaceDetails 回归 |
| 最终 `pnpm build` | 通过，1976 modules；仍有已有的 >500kB chunk 提示 |
| `git diff --check` | 通过 |

浏览器脚本使用现有 Chrome 和 Playwright Core：

```sh
PLAYWRIGHT_CORE_PATH=/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs \
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node scripts/check-evolve114-themes.mjs
```

脚本产生 `artifacts/evolve114-themes/results.json`、`rendered-contrast.json` 和原尺寸 PNG；这些运行产物不进入版本库。提交的 [receipt.json](evolve114-themes/receipt.json) 保留全部通过项和采样计数，以下联系图保留本轮截图。baseline 图在修改前从本树实际浏览器运行捕获，不使用历史截图充当当前运行证据。

首次提交的 Rust harness 把当时生产 Store/Session/archive 模块复制到隔离常规 crate；不替换其持久化实现。使用 `artifacts/evolve114-store/target`、offline/locked、jobs=2，未占用主 target。此复制方案在合入 111 后已退役，当前唯一 runner 改为生产 core harness，见本文末节。历史检查均未启动 Tauri GUI、真实 App 或用户 Store，不等于整个原生应用 cargo check。

Rust 新测试对 3 themes × 3 schemePreference 做真实临时数据库导出→导入→关闭重开；验证旧配置首写迁移、非法更新/导入原子拒绝、同 patch 新对象优先、旧 API 保留皮肤、字号/details/扩展字段保留。浏览器 fixture 只证明 UI 与 owner 行为，不替代此落盘证据。

## 交互与稳定性证据

浏览器 247 项中包含：六种配色切换前后相同 Tiptap 实例、EditorView、DOM、文档 JSON 与选区；实际编辑→换肤→Undo；实际 view 在合成 compositionstart/end 之间保留 composing。后者只证明事件与组件连续性，不能替代中文输入法原生验收。

桌面实际录音 owner 在 active/paused 状态换肤，面板节点与 phase 连续；capture 来自隔离适配器。移动录音为模态上下文，测试在进入前选择各主题，再暂停、截图、退出，没有绕过现有设置更新访问守卫。没有宣称移动录音模态内可打开主题设置。

还覆盖：实际主题 radio 的 Home/End；Preferences 保存失败保持已确认勾选与根配色；post-ACK read 失败保持；迟到 ticket、排队期间调用者修改对象、旧 scheme 写入保留新皮肤；740×480 桌面设置、320px 移动 select/滚动；radiusScale=0/150 与圆形控件；reload 和独立笔记页权威读取；六种 access-prepare 覆盖；阻止入口 bundle 后六种缓存主题恢复界面及系统明暗变化。

## 对比度与视觉核对

静态校验 162 对语义文字/背景，均 ≥4.5。真实 DOM 在 48 个页面状态采样 1617 对可见文字，包含选中反馈叠层、设置、菜单、预览、桌面 active/paused 及移动 paused 录音，失败 0。最低观测比值：Classic 4.745、Paper 4.727、High Contrast 5.217。

实际采样会等待颜色过渡结束，合成祖先背景和选中 inset 反馈层；排除隐藏/inert/disabled/低透明度控件及用户自行设置颜色的正文。普通文字目标 4.5，大字按 3；本轮最低观测值仍均高于 4.5。此结果不表示任意用户内容、图标、所有 hover/focus、系统原生控件均已穷举合格。

| 相对本轮 baseline 的可见变化 | 原因 |
| --- | --- |
| Classic 桌面主要白/灰/黄表面、字号和三栏位置保留；浅色次级字 `#7d7e88`→`#666773`，暗色 `#a1a1aa`→`#b5b5be` | 小字在浅底及选中叠层更易读 |
| 浅色黄色装饰 accent 保留 `#d99300`，动作小字改 `#895b00`；focus 使用单独可读色 | 不要求低对比度装饰黄同时承担文字职责 |
| Classic 边线浅色 `#e0e1e8`→`#d1d2da`、暗色 `#3c3c42`→`#64646e`；portal/玻璃面采用当前主题的实色语义表面 | 增强边界并让所有表面共享可测试背景；玻璃透明度较 baseline 减少 |
| Classic 移动原有独立黑底/黄值并入注册表：暗色 grouped `#000`→`#161618`，卡片/文字跟随 Classic 根色板；新增按钮使用深色 accent-ink | 跨平台同主题语义一致，黄色按钮上的加号可读；不是移动逐像素冻结 |
| 去除旧全局统一半径覆盖后，搜索框/卡片/菜单恢复各自基础半径；移动画廊仍为 18px 基础，圆按钮保持圆形 | 遵守组件 base × radiusScale，而非所有控件同一半径 |
| 选中行元信息/目录名/录音徽标使用专门文字角色；暗色录音波形更亮，暂停按钮使用淡录音表面 | 在真实混合反馈背景上满足文字目标，避免暗色波形或红底红字消失 |
| Paper 次级字 `#6c6659`→`#615b4e`，动作文字 `#73550c`；High Contrast 黑白表面与蓝色动作 | 暖纸感保留阅读层次；HC 普通文字达到硬目标，不靠颜色单独显示选中 |

实际查看联系图及原尺寸图：Paper 暖表面贯穿菜单/设置/录音，未替换中文字体；HC 选项具有边框与勾选标识；移动设置可纵向滚动，录音圆形运输控件保留。未重写 marks、图片、速绘颜色或笔记 paperStyle。

- [Classic 同状态前后：桌面/移动 × 明暗](evolve114-themes/classic-before-after.jpg)
- [六种配色：设置、菜单、桌面录音](evolve114-themes/six-themes.jpg)
- [六种配色：移动设置与暂停录音](evolve114-themes/mobile-boundaries.jpg)

## AgentSettings 继承边界与后续验收

只读核对主树 `src/AgentSettings.css`（114 基线没有该组件，未复制或修改）：其 `--ink/--paper/--secondary/--grouped/--line/--accent/--selection/--danger` 在六份 palette 全部存在；ink/selection 的主动作、secondary/paper/grouped 元信息及 danger/paper/grouped 撤销均有静态文字配对覆盖。CSS 从 html 继承，因此合入后的真实表面会随主题/明暗解析。

`--interface-radius-button/card/panel` 仍由 interfaceDetailVariables 按 geometry 的 6/10/16 × radiusScale 生成，`--interface-hit-min` 仍由原 details owner 提供；没有用全局半径规则覆盖 Agent 元素。该确认是源码契约兼容，实际 Agent 页及创建对话框要在合入后重测。Agent CSS 自带 `--accent` focus/checkbox 和固定黑色阴影，本次未把它们假称为 `--focus` 的完整对比度证据。

原生 AppKit NSMenu/工具栏继续只接收 system/light/dark 和已有受支持尺寸投影，不能套用 Paper/HC 的 Web palette 或组件圆角。独立窗口实时更新仍依赖现有宿主刷新；不新增 wire。原生安装包冷启动/闪白、独立原生窗口、系统菜单、真实输入法、TCC/麦克风、实际录音文件、手机/横屏/键盘验收保留给 116。没有操作真实 App、手机、用户资料库或原配置。

## 9ab9698e 独审后的 F1–F5 修订与正式回归

本轮基于独审提交 `9ab9698e` 修复，未修改 review 或 `/tmp/evolve114-independent*` 原脚本/结果/原始失败备份。独审的 BLOCKED 结论等待 Aquinas 复核，本记录不自行改成独审 PASS。

| Finding | 修复与新增证据 |
| --- | --- |
| F1 ACK/read 失败后覆盖已提交外观 | 无关与旧 theme-only patch 保持 partial，显式 appearance 才附带原子旧投影；Store/preview 基于当前持久值合并。ACK 后读取失败标记 recoveryRequired；下一 FIFO 写入前先恢复权威读，失败则阻止 persist，UI 保留最后确认值。ACK 使此前 ticket 失效，恢复期间外部 observe 使迟到结果重读。 |
| F2 智能表单/警告/标签透明及 checkbox 不可见 | 移除未定义的 panel/surface/text/ordinary-* 引用，表单/警告/标签使用 paper+ink，输入使用 grouped；未选普通 checkbox 有 grouped 填充与 line 边框。主按钮改用 accent-ink。六配色实际打开普通→智能→标签候选→不完整条件警告，检查不透明度、控件边框和文字对比度。 |
| F3 非 axis 矩形选区遮字 | 新增 cell-selection-overlay：当前主题 accent 的 12% 透明色；axis 的原透明层与 outline 保留。六配色通过真实 Tiptap setCellSelection 与实际列按钮分别选择，检查透明 alpha/无 axis、axis outline/透明层，审计器将矩形伪元素合成到前景和背景，截图确认正文仍可见。 |
| F4 附件分类标题/计数 | 选中表面改用 selection，标题用 ink、计数用 selection-secondary；移除重复 amber 选中叠层，hover/press 使用局部中性反馈。六配色实际进入附件画廊，分别检查选中、hover、focus 的标题和计数，最低采样 5.015:1。 |
| F5 toast 错误配对 | 新增 notice-surface/notice-ink，不再混用 scrim/accent-ink。六配色实际点击笔记日期触发生产 toast；检查实色表面与文字，最低采样 13.816:1，HC dark 为白底黑字。 |

新增正式脚本 `scripts/check-evolve114-regressions.mjs` 被完整主题脚本调用，单独也可运行；共 **123 项**。其中 F1 包含：sort/旧 theme-only 两种排队后续写入、恢复再次失败阻止写入、后续恢复重试、恢复期间外部采纳和迟到读、persist 期间请求的过期票据；以及真实 App 的 ACK/read 失败和模拟另一窗口已提交但本窗缓存未刷新的两种后续意图，共四条 App 持久路径。实际 persist/read 错误仍通过原边界注入并显示，未吞掉生产失败。

`scripts/debug/platform.mjs` 的隔离 IPC fixture 原先直接 Object.assign 设置，无法表达 native partial merge。现在显式建模 Store 的原子合并/投影，**保留原 fail/delay 边界**。为避免把 fixture 当落盘证明，测试捕获真实 App→bridge→IPC 发出的 patches，写入 `artifacts/evolve114-regressions/app-settings-replays.json`；同时逐项匹配提交的 `src-tauri/tests/evolve114-settings-recovery.json`。

随后 `check-evolve114-store.mjs` **重新复制当前生产 Store/Session 源码**，以环境变量向新增 Rust 测试提供本轮实际 App capture。四条路径每笔 patch 都交给真实 SQLite Store 执行并关闭重开，确认 Paper 和 scheme/旧 theme 配对、sort 均正确；再做 export→import→关闭重开，比较完整设置。普通 cargo 测试可读取提交的 capture；脚本验收必须先跑浏览器以获得当轮实际 capture，不用旧 Store 副本或 fixture 代替持久化。

最终执行结果：

- `pnpm typecheck`、token `--check`、`git diff --check`：通过。
- `node scripts/check-evolve114-themes.mjs`：**376 项通过**（原 247 项按 partial 意图修正一条前端责任断言，另增 6 对 notice 静态配对 + 123 项实际回归；首次写入原子迁移由真实 Store 检查承担）。
- 对比度：**168 对静态配对、102 个 DOM 状态、1911 对实际可见文字，失败 0**。新矩形选区的合成文字最低 10.020:1；主题总体最低仍为 Classic 4.745、Paper 4.727、HC 5.217。
- `pnpm test:evolve113-interaction`：90 项通过，覆盖保存失败、焦点与 Editor 稳定性等既有交互。
- `node scripts/check-evolve114-store.mjs`：**3 passed / 0 failed**，含既有 interfaceDetails、9 种外观归档往返和新增四条真实 App patches 重开/归档回归。
- `pnpm build`：通过，1976 modules；仍只有已有 >500kB chunk 提示。Rust 仍使用 `artifacts/evolve114-store/target`，未使用主 Tauri target。

修订证据：[fix-receipt.json](evolve114-themes/fix-receipt.json)、[六配色修复表面联系图](evolve114-themes/review-fixes.jpg)。原尺寸图及逐文字采样在 `artifacts/evolve114-regressions/`；完整汇总在 `artifacts/evolve114-themes/`，Store 日志/源哈希在 `artifacts/evolve114-store/`。实际查看了 Paper 浅色标签表单、Classic 浅色矩形选区、HC 暗色附件分类与 toast 原图，并检查联系图六配色一致性。

本轮未进入 AgentSettings、主树、其他工作树或 115；原生 116 的边界保持不变。

## main 39662e7d 集成后的 Store runner 补齐

114 已经独审 `7767625d` PASS 并合入 main `39662e7d`。本轮在已由主线程 fast-forward 的干净 114 树上，仅修改 `scripts/check-evolve114-store.mjs` 与作者 evidence；不修改产品源码、生产 harness、独审 report 或任务状态，不进入 115。该补齐仍待 Aquinas 增量独审，不自行更改其结论。

合入 111 后 Store/Session 依赖 application、agent_access，原先复制少量模块并使用 old debug Cargo 的 runner 无法代表当前依赖。现已完全移除复制 crate、生成 wrapper 和 copy fallback，只调用已合入的 `src-tauri/src/application/harness/Cargo.toml`。该生产 harness 的 lib.rs 通过 `#[path]` 直接编译本树 Store、Session、application、agent_access；sync wrapper 指向生产 model。使用其自己的已提交 Cargo.lock，`--locked --offline --features rusqlite/hooks --lib`，真实 bundled SQLite/hooks 保持不变。

runner 保留 `settings_and_archive_are_strict` 过滤，并检查以下三项都实际通过及汇总恰为 `3 passed / 0 failed`，防止仅凭 Cargo exit 0 接受零测试或漏测：

- `interface_details_settings_and_archive_are_strict_and_atomic`
- `appearance_v2_settings_and_archive_are_strict_atomic_and_roundtrip`
- `appearance_recovery_settings_and_archive_are_strict_with_real_app_patches`

`EVOLVE114_SETTINGS_REPLAY` 仍指向实际 App 捕获的 `artifacts/evolve114-regressions/app-settings-replays.json`，必须有四条路径并与提交的 capture 契约一致；缺失/不匹配即失败，不回退 fixture 伪装本轮 App capture。当前捕获文件保留自先前正式 UI 回归，本轮没有重跑主题 376 项；主树合入后的 UI 检查由 Aquinas 并行执行。这里的当前源码证据是生产 core 直接执行四路径 patches 的真实 SQLite 重开/归档测试。

目标目录尊重调用者 `CARGO_TARGET_DIR`；未设置时默认本树 `artifacts/evolve114-store/target`，jobs 默认 2 并保留调用者配置。本轮默认/显式两条调用均顺序复用该独立缓存，没有使用 `/tmp/apple-notes-sync85-target` 或主 Tauri target。已验证指定 `./src-tauri/target` 会在调用 Cargo 前报错退出。

```sh
node --check scripts/check-evolve114-store.mjs
node scripts/check-evolve114-store.mjs
CARGO_TARGET_DIR=./artifacts/evolve114-store/target node scripts/check-evolve114-store.mjs
```

最终结果：默认和 caller-target 两次均 **3 passed / 0 failed / 200 filtered out**；`sourcesUnchanged=true`。运行前后对 runner、生产 harness 的 Cargo/lock/lib/build/sync wrapper、相关生产模块树、schema/fixture 及 actual App capture 共 56 个输入做 SHA256 比对。哈希清单用于标识相关输入，不表示每个文件都被这三项测试执行覆盖。日志中测试二进制为 `notes_application_native_tests`，源码诊断路径为生产 harness 直接引用的 `src/../../../store.rs`；没有读取旧的 artifacts/harness 源副本。

`node --check` 与 `git diff --check` 通过。日志保留生产 core 既有的两条 unused-import warning，未为了 runner 检查修改产品代码；未运行完整 core 全回归或整套 Tauri 检查。

新增证据：[core-harness-receipt.json](evolve114-themes/core-harness-receipt.json)（来源、目标选择、三项名称、四路径 replay、56 个源码哈希及日志 SHA256）、[core-harness-tests.txt](evolve114-themes/core-harness-tests.txt)。运行原件在 `artifacts/evolve114-store/{result.json,tests.log,default-target-result.json,default-target-tests.log,target-guard.json}`。前述复制 harness 的旧 receipt 保留为当时历史证据，不再是当前 runner。
