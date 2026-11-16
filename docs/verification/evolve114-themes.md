# evolve114 — 主题开发与自检记录

日期：2026-11-17。开发分支 `codex/evolve-114`，基线 `89dc171b`（已合入 113）。这是 develop 自检记录，不是独立 verify 或原生 116 验收。没有实施 115 的布局/密度偏好；没有修改任务状态、111/112 模块、同步 wire 或真实用户资料库。

## 交付范围

- `src/themes/palettes.json` 为 Classic、Paper、High Contrast 三主题 × 明暗的色板真源；registry 和生成的 CSS 共用数据。主题与 system/light/dark 策略分别选择。字体保持本地系统 fallback。
- `AppearanceV2` 是完整、精确的三字段对象，拒绝 null、未知版本/主题、额外/缺失字段。旧 theme 只在新对象缺席时内存迁移；首次任意设置写入原子写 appearance + 旧 theme 投影。旧 theme-only 调用保留新皮肤，只改变明暗。
- 继续使用 ConfirmedSettings 的串行写入、ACK 后权威读取与 ticket；失败不发布候选值。入队时复制/校验嵌套外观对象，执行时基于最后确认值计算兼容投影。
- Rust 实际 Store 设置写入和 archive 导入/导出采用相同严格规则。只读取旧数据库不落盘迁移；新 archive 纠正过时旧投影，纯旧 archive 保持旧格式，首写迁移。
- 根属性投影覆盖桌面/移动主页面、portal 菜单、设置、图片预览及信息、访问屏障、录音和启动恢复。独立 `?note=` 渲染器初始读取已保存外观；没有新增跨窗实时同步通道。
- `geometry.json` 集中基础几何，组件各用自己的 radius token，再乘既有 radiusScale，上限 24px。菜单 10、画廊 18 等不同基础保留；圆形录音/新增按钮不拉平方形。兼容别名由消费组件局部使用。
- App 改动只含外观派生、根属性 effect、确认后启动缓存及 debug 输入白名单。Editor、Undo、选区、IME、录音控制器仍由原 owner 持有。

## 执行与结果

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

Rust harness 把当前生产 Store/Session/archive 模块复制到隔离常规 crate；不替换其持久化实现。使用 `artifacts/evolve114-store/target`、offline/locked、jobs=2，未占用主 target。`result.json` 记录被测试源文件哈希；未启动 Tauri GUI、真实 App 或用户 Store。该 harness 不等于整个原生应用 cargo check。

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
