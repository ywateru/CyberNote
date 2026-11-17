# 多主题与呈现架构

日期：2026-11-17。114 已实现 AppearanceV2；115 已接入严格 PresentationV1、唯一呈现解析、专注布局和移动列表。开发定向检查与独立复核已完成；准确产物与命令验证见[116交付](../verification/project-evolution/DELIVERY.md)。2026-11-17用户接手UI验收，实际设备/视觉未测项单列，不冒充通过。

## 职责与关系

配色主题决定表面、文字、选中、边线与强调色；明暗策略决定 light/dark 的实际变体；呈现偏好决定集合视图和导航布局；字号与密度分别决定文字和几何。单篇 `paperStyle` 仍是笔记内容，不迁为应用主题。

```text
ConfirmedSettings → migrate/validate AppearanceV2 + PresentationV1
                          │
OS scheme / contrast ── ThemeResolver ── ThemeRegistry
                          ├─html data-theme-id / data-scheme / CSS token
                          ├─portal / 启动页 / 附件预览
                          └─原生 Appearance + 支持的尺寸/颜色投影

平台身份 / window / safe-area / IME / 字号 / 展现偏好
                          │
                 PresentationResolver
                          ├─稳定 WorkspaceShell + DesktopShell / MobileShell
                          ├─共享音频/菜单/附件组件
                          └─原生工具栏能力与有效几何

正文 / Undo / 保存 / 授权 / 录音 → 保留既有 owner
```

ThemeRegistry 是内置预设的唯一来源；ThemeResolver 只解析和投影，不写内容。PresentationResolver 是纯计算，不创建 Editor、不触发保存，也不重新拥有 navigation 状态。App 的装配仍通过既有 navigation、EditorSession、ConfirmedSettings 和原生控制器。

## 配置模型（AppearanceV2 与 PresentationV1 已实现）

```ts
type AppearanceV2 = {
  version: 2;
  themeId: "classic" | "paper" | "high-contrast"
    | "ocean" | "forest" | "rose" | "lavender" | "graphite";
  schemePreference: "system" | "light" | "dark";
};
type PresentationV1 = {
  version: 1;
  desktop: {
    navigation: "three-pane" | "two-pane" | "focus";
    lastNonFocusNavigation: "three-pane" | "two-pane";
    collectionView: "list" | "gallery";
    density: "compact" | "standard" | "comfortable";
  };
  mobile: {
    collectionView: "list" | "gallery";
    density: "standard" | "comfortable";
  };
};
```

`focus` 的已确认偏好可持久化；临时全屏、打开附件画廊、选区、搜索和当前路由不属于该对象。进入focus前记录lastNonFocusNavigation，选择两/三栏时同步更新该字段；冷启动若默认focus，退出时恢复该已保存值。仅在会话内临时进入专注时保留来源和原布局，退出不隐式修改默认偏好。主题不携带自定义脚本、字体 URL、任意 CSS、层级值或布局代码。

新增 `settings.appearance` / `settings.presentation`；`interfaceFontSize`、`editorFontSize`、`interfaceDetails` 保持既有独立字段，不另起同义圆角/命中区设置。新 density 只映射基础 gap/行距/内边距，不再保存一份 menuSpacing。`interfaceDetails` 继续表示用户覆盖值，文档说明优先级，不能用 compact 缩小工具栏/菜单的44px移动/28px桌面最小命中区。正文内清单属于文字排版：按本轮用户要求紧凑排列，圆圈点击区域可向左扩展至44px宽，高度限制在本行行盒内，不承诺44px正方形，也不覆盖相邻行或正文选字。

## 迁移、保存与设备范围

| 场景 | 规则 |
| --- | --- |
| 老设置只有 theme/view | 内存迁移为 classic + 原明暗；view 仅映射 desktop.collectionView；手机仍默认 gallery；双端density初值均为standard |
| 旧 macSidebarVisible | false映射two-pane，其余映射three-pane，同时初始化lastNonFocusNavigation；不自动进入focus；兼容期新navigation向旧显隐字段投影，focus以lastNonFocusNavigation投影 |
| 用户首次保存新设置 | 单事务写新字段，旧 theme/view 作为兼容投影同步写入；同一 settings owner 发布，不能两次异步写 |
| 新字段存在 | appearance 为真源；同 patch 的旧 theme 不覆盖新对象。旧 theme-only action 保留 themeId、只更新 scheme，原子投影。presentation 按下行规则处理；更旧二进制的任意整对象覆盖无安全保证 |
| 115 新旧呈现patch优先级 | 显式presentation对象为完整严格对象，同patch的view/macSidebarVisible由它重新投影，不反向覆盖。只有view的旧patch基于当前权威设置更新desktop.collectionView，保留navigation、lastNonFocusNavigation及mobile。只有macSidebarVisible的旧patch按true→three-pane、false→two-pane，同时更新lastNonFocusNavigation；若原为focus则退出focus，保证旧目录显隐动作可见生效。两种旧字段同patch时分别合并，单事务落盘。无关patch不携带UI缓存中的完整presentation |
| 非法字段/未知版本 | 更新和导入报错且保留旧状态；不任意抹掉对象 |
| 注册主题被移除 | 114 拒绝未知 ID 并保留旧确认值，不悄悄降级。真正删除注册主题前必须另做显式版本迁移与确认界面 |
| 切换失败 | ConfirmedSettings 保持旧值，显示错误，原页面与焦点不提前切换 |

前端 `Settings` 类型、校验、Rust `archive::validate_settings`、settings action、备份导入/导出和预览默认值须同轮更新；只扩展 Preferences 下拉框会被 Rust 当前枚举校验阻止。保留旧配置用例与非法值拒绝用例。

首版新外观/呈现设置为本地设备偏好，沿现有逻辑备份保存，不新增账户自动同步。桌面栏宽/布局与手机首页各自保存；笔记纸张仍按笔记同步。以后同步外观只显式同步 themeId/明暗等选定字段，不能顺带同步窗口尺寸、选中项和密度；现有同步排除 Settings 的语义保持直至另有规格。

## 主题层次与 token

114 的色板真源为 `src/themes/palettes.json`，`ThemeRegistry` 消费同一数据；`scripts/generate-theme-tokens.mjs` 生成 `src/themes/tokens.css`，在 head 和应用入口使用。`design-tokens.css` 继续拥有语义层级，主题不能更改它。组件 CSS 消费已有语义名称（如 `--paper`、`--ink`、`--secondary`、`--action-ink`、`--selection`、`--focus`、`--menu`、`--recording`），不再在 desktop/mobile 重定义 palette。

| 层 | 所有权 | 示例 |
| --- | --- | --- |
| 基础值 | 设计系统内部 | 灰阶、字号档、spacing、各组件基础圆角 |
| 语义 token | theme × scheme | `--surface-editor`、`--surface-sidebar`、`--surface-list`、`--text-primary`、`--text-muted`、`--border-subtle` |
| 动作/状态 token | theme × scheme | `--action-accent`、`--selection-bg`、`--selection-text`、`--focus-ring`、`--status-danger`、`--status-warning` |
| 组件 token | 组件与平台 | `--note-card-radius-base`、`--menu-surface`、`--toolbar-surface`、`--search-highlight-bg` |
| 字体/密度/命中区 | resolver + 既有设置 | `--font-ui`、`--font-editor`、`--space-control`、`--hit-min` |

实现保留既有 `--paper`、`--ink`、`--accent` 等语义名以减小组件改动；它们的值只在注册色板中定义。平台 CSS 决定几何，不重新定义主题色；不继续添加 `.dark .desktop .某页` 色值补丁。按 reset → theme tokens → platform geometry → components → state 的显式顺序装载；若引入 cascade layers，必须处理旧未分层样式的优先级，不能混用后误以为新 layer 会覆盖旧 CSS。

圆角按“组件基础值 × 既有 radiusScale”计算：画廊18px、菜单10px等保留各自基础；圆形录音/播放/色板保持语义形状。不使用统一 `border-radius: ... !important` 抹平组件。层级、遮挡、锁定与启动覆盖仍引用现有 `--layer-*`，主题无权改变它们。

## 内置主题

2026-11-17 的八套外观实施见[本轮任务](../plan/appearance-mcp-tester-20261117.md)。以下是本轮目标契约；文末 114 历史实现记录仍按其三套主题的版本理解。增加预设不改变 AppearanceV2 版本，原生归档验证与前端注册表同步扩展。

| ID | 方向 | 约束 |
| --- | --- | --- |
| classic | 沿现有 Apple Notes 风格、黄强调、浅灰导航 | 默认预设优先保留现有视觉基线；包含 light/dark |
| paper | 暖白/暖灰、较柔和边线、适合长文阅读 | light/dark 都给出明确 palette；不改变已保存文字颜色、图片、速绘或纸张 |
| high-contrast | 黑白表面、清楚文字、蓝色选中与焦点 | 支持 light/dark；普通分隔线 1px，避免粗框包围所有组件；不用颜色单独表达选中/错误，目标普通文字对比度≥4.5:1 |
| ocean | 海蓝表面和深海色文字、蓝色强调 | 正文、导航、工具栏及弹层采用完整浅/深色板 |
| forest | 苔绿表面和墨绿文字、绿色强调 | 与海洋和经典有明确表面差异；包含 light/dark |
| rose | 玫瑰灰粉表面、深莓色文字与强调 | 不只更改 accent；包含 light/dark |
| lavender | 淡紫表面、紫灰文字与紫色强调 | 包含 light/dark，并保留正文可读性 |
| graphite | 石墨中性表面、冷灰文字层次 | 与黑白高对比和黄强调经典区分；包含 light/dark |

不在第一阶段加入用户可执行主题包。未来自定义主题仅接受版本化有界 token JSON，验证颜色、必填项、对比度、资源限制与来源；导入失败保留旧主题。

实施视觉基线：Classic沿用当前桌面浅色的白正文`#ffffff`、侧栏`#f3f3f6`、正文`#19191c`、次级字`#7d7e88`、强调`#d99300`、选中`#fff1cc`；深色沿当前已定义值。Paper采用笔记纸感的正文`#faf7ef`、侧栏`#eee9dc`、正文`#29271f`、次级字`#6c6659`、强调`#80600f`、选中`#eadba9`，暗变体为暖灰黑表面与浅暖文字。High Contrast浅色采用白底/黑字、清楚的深灰边线、深蓝`#0047ab`动作与淡蓝选中；暗色采用黑底/白字、浅灰边线与浅蓝动作。实现必须逐对检查文字/焦点/选中对比度，必要时微调次级字或强调色而不改文档内容。

字体继续使用现有系统/PingFang/Noto本地fallback，不下载远程字体；Paper的差异主要来自表面与文字层次，不擅自将中文正文换成衬线字体。布局保留左对齐的目录、列表与正文，长文默认阅读宽度有界；主题不增加装饰或自动动画。纸感工具栏与对应导航/正文表面使用一致的暖纸色系，避免顶部灰白与底部暖纸断层。设置页正常桌面宽度为四列两行预设，窄宽/大字体允许降列。

编辑器 marks 的用户指定颜色是内容，切换主题不重写正文；需要为深色背景提供可读性提示或呈现处理，但不把正文全部强制变成同一种文字颜色。搜索高亮、选区和 tag chip 另用语义 token。

## 呈现解析与编辑器稳定性

输入包括稳定 platform identity、窗口可用空间、字体度量、density、用户偏好栏宽、原生最小尺寸与 safe area。输出至少包含 `interactionMode`、`effectiveNavigation`、`collectionView`、`effectiveColumns`、`effectiveWidths`、`toolbarPolicy`、`capabilities`。

- 原生 Android 始终 mobile 交互；横屏/分屏可改变列数和尺寸，不改成 desktop。音频卡、菜单等统一消费解析结果，不能单独 matchMedia 判断 mobile。
- 桌面/Web 保留现有699/700边界作为兼容起点；后续是否切换为按能力/空间降栏需逐场景验收，不随意修改原生 macOS 小窗的行为。
- “用户偏好宽度”和“当前有效宽度”分开：压缩窗口仅暂时 clamp；拖动在有效范围内真实变化，不能保存一个当前不可见的虚假宽度。字号不再整体乘栏宽；各栏依据文字与最小内容空间约束。
- 菜单/格式/绘画/录音/访问屏障状态仍由原控制器管理。选中项、搜索结果与附件画廊路由由 Navigation 派生；不增加一个可任意组合的 parallel UI state。
- 切换主题只改变属性/token，不更改 Editor key、不重建 Editor、不 setContent。布局切换也尽量只移动容器；确需换挂载点时先证明选区/IME/Undo/owner 保全，不能用 flush 后重新打开代替稳定实例。

## 原生与首屏

本轮扩展 NativeToolbarState：除 system/light/dark 明暗策略外投影内置主题 ID，由同一 `palettes.json` 生成 CSS 与 AppKit 色板。typed projection、Rust 枚举校验和 AppKit 绘制同步更新，使窗口/工具栏与其下方区域使用相应主题表面，搜索与图标采用相同语义色。旧调用方省略主题 ID 时保留 Classic。系统 NSMenu 仍由 AppKit 明暗外观控制，不声称支持任意菜单换肤。该项实际原生显示仍由用户验收；文末 114 的“仅明暗”描述属于历史版本。

启动页、主窗、独立笔记窗、portal 菜单、设置、录音栏和原生/浮动预览必须纳入主题覆盖。首屏可缓存最近一次已确认外观作为启动提示，加载权威设置后校正；缓存不含正文，失败不能隐藏恢复入口。无色块闪白/深浅错配需实际冷启动核验。

## 验证与迁移顺序

1. 固定 classic 默认明暗的现有截图、字号与控件行为基线，先迁 token，不改变产品交互。
2. 打通移动字号及共享平台模式，修复可确认的布局/命中区问题。
3. 增加严格 schema 和兼容迁移，接入已确认设置发布机制。
4. 上线 ThemeRegistry 三种皮肤，覆盖全部产品表面和原生限制说明。
5. 接入 PresentationResolver，再扩展专注布局与移动列表；逐项删除旧分支和状态来源。

验证代表组合而非穷举所有笛卡尔积：classic 明暗全核心场景；每个新主题覆盖设置/列表/编辑/菜单/锁屏/预览；极大字号+舒适密度+320px、短桌面窗、Android横屏/IME为边界组。另验重启/备份恢复、未知字段、保存失败、系统明暗变化、主题切换时中文组字/Undo与录音不中断。

## 114 实现边界与可重复检查

- `appearanceOf` / `normalizeAppearanceSettings` 只做内存迁移；现存旧数据库不会因读取而被改写。`ConfirmedSettings` 保留无关 patch 与旧 theme-only patch 的 partial 意图，只对显式 appearance 编辑附带旧 theme 投影；Rust Store / browser-preview 持久层基于当前已存设置原子迁移、合并与投影，不能用 UI 缓存补全外观域。嵌套对象在入队时复制并校验。ACK 成功后确认读取失败，UI 保留旧值，下一笔写入前必须恢复权威读；恢复仍失败则不继续 persist。ACK 边界使此前读票据过期，恢复期间外部采纳使迟到读重试，保持 FIFO。
- Rust `merge_settings` 校验旧值和 patch，再用一次 settings SQL UPDATE 保存；archive 导入和导出验证完整新对象并修正旧投影。仅旧 theme 的 archive 保持旧格式，首写再迁移。扩展设置、字号与 interfaceDetails 保持原 owner；没有新增同步 wire。
- `geometry.json` 集中基础值，生成 `--radius-*`；各组件选自己的基础 token，画廊18、菜单10，radiusScale 在真实 `.recording-layout` 与示例作用域重新求值，上限24px。圆形、胶囊和0圆角边界保留语义形状，不用全局圆角覆盖。
- Classic 保留正文/侧栏/黄色强调与明暗方向；次要文字、动作文字与焦点色为对比度加深，边线更清楚。Paper 同样区分装饰 accent 和可读 action-ink。媒体内容、marks、速绘色板不改色；用户指定正文颜色不保证任意背景均可读，不重写原文解决。
- 启动脚本只缓存已确认的三字段对象 `cybernote.startup-appearance-v2`，兼容旧 `cybernote.startup-theme`；非法缓存退到 Classic/system。权威读取完成之前 App 不覆盖缓存；随后按确认值校正，失败写不更新缓存。缓存只供外观首屏，不证明 workspace 授权或保存。
- 主窗、`?note=` 独立笔记窗、录音栏/浮动录音表面、portal、设置、预览与 access-cover 使用根 token。独立窗初始从同一 workspace 设置读取；已有跨窗刷新/外部协调仍归原宿主，不新增事件或同步服务。
- AppKit 原生 NSMenu/工具栏仅投影 `schemePreference` 与已有受支持字号/命中区；Paper/High Contrast 的 palette、Web 圆角不冒充系统菜单能力。安装包首屏、原生菜单、TCC、实体键盘/手机验收留在 116。
- 114 基线未含后来合入主树的 AgentSettings；只读核对其 `ink/paper/secondary/grouped/line/accent/selection/danger` 均有六份色板映射，局部 `interface-radius-button/card/panel` 兼容别名仍按 6/10/16 × radiusScale 计算。未复制组件，实际 Agent 页验收留待合入后；其 accent 焦点样式不冒充本轮 focus token 对比度证据。

开发检查与当前截图索引见 `docs/verification/evolve114-themes.md`。主题切换仅改 html 属性，不改 Editor key/document，也不重建录音 owner。该段描述 114 的边界，115 新增实现见下节。

## 115 实现边界与可重复检查

- `presentation/model.ts` 严格校验完整对象及嵌套键，缺失时只内存迁移旧 view/sidebar。`ConfirmedSettings` 延续 FIFO、确认后发布和权威读取恢复；显式对象入队时复制并附兼容投影，legacy/unrelated patch 保持部分更新。它也接管 App 原 sidebar 队列的 pending/flush 关闭等待，不新增保存 owner。Rust `archive::merge_settings` 在当前持久设置上迁移、合并、投影，一次 SQL UPDATE 落盘；读取旧库不写回，备份沿用同一校验与投影。
- `presentation/resolver.ts` 是交互身份、有效导航、集合、密度、列数、有效栏宽和工具栏策略的唯一解析位置；旧 `createMobileLayout` 仅委托其身份函数。`useMobileInteraction` 优先消费 PresentationContext，独立表面回退也走同一规则。既有 interfaceMetrics 保留为栏宽几何函数。录音 dock 占用空间使三栏暂时降为两栏，不写回偏好；Web699/700 与 Android 稳定身份保留。
- `WorkspaceShell` 永久承载同一组 sidebar/collection/editor 子槽；DesktopShell 只添加布局控制，MobileShell 只抽取集合表头。没有条件切换两个 Editor 父树，没有修改 Editor key 或为布局 setContent。EditorSession、保存/附件、访问屏障和录音仍归既有 owner。
- Navigation 只新增 `temporaryFocus`，不保存副本路由。临时专注保留当前来源/搜索/集合滚动，退出恢复触发焦点；默认专注持久化，冷开退出用 lastNonFocusNavigation。两栏目录抽屉支持 Tab 环、Escape、遮罩、路由改变关闭和焦点回触发器；内层菜单/对话优先处理 Escape。
- 密度通过 `--presentation-spacing` 和有效画廊列数投影基础几何；字号、interfaceDetails 仍独立。桌面 list/folder 和移动 card 分别消费留白倍率，命中区保持已有 desktop/mobile 下限；圆角仍按组件基础 × radiusScale。手机列表/画廊单独保存，默认手机画廊不跟随旧桌面 view。仅改密度不会退出已打开的桌面画廊正文。
- 录音右栏提供收起/恢复，保留 mounted dock 和同一业务 ticket；跨 Web 断点不因 `!mobile` 条件卸载原桌面录音。原手机录音弹层路径不变。访问覆盖层保持原优先级，新布局控制在 blocked 时 inert。
- 本树固定基线 5be79fce，不复制后来 112 assembly。合并 App/Preferences 时需同时保留主线 AgentSettings props、原生动态 open_note_window/WK 路径及本轮 presentation/context/shell 接线。原生菜单继续旧 view/sidebar 部分更新，不新增菜单 wire。

开发检查和截图见 `docs/verification/evolve115-presentation.md`。真实浏览器 App/Editor 使用隔离模拟 IPC 输入；捕获 patch 再由生产 core harness 的真实 SQLite/归档验证。原生键盘组字、安装包窗口、Android safe-area/IME 与多窗口外部协调留给 116。
