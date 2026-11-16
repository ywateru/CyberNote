# 多主题与呈现架构

日期：2026-11-16。状态：待实现方案。当前已有 system/light/dark、列表/画廊、字号与界面细节；本文新增主题注册、双端呈现偏好及统一 resolver，不能视为现有产品能力。

## 职责与关系

配色主题决定表面、文字、选中、边线与强调色；明暗策略决定 light/dark 的实际变体；呈现偏好决定集合视图和导航布局；字号与密度分别决定文字和几何。单篇 `paperStyle` 仍是笔记内容，不迁为应用主题。

```text
ConfirmedSettings → migrate/validate AppearanceV2 + PresentationV1
                          │
OS scheme / contrast ── ThemeResolver ── ThemeRegistry
                          ├─html data-theme-id / data-color-scheme / CSS token
                          ├─portal / 启动页 / 附件预览
                          └─原生 Appearance + 支持的尺寸/颜色投影

平台身份 / window / safe-area / IME / 字号 / 展现偏好
                          │
                 PresentationResolver
                          ├─DesktopShell / MobileShell
                          ├─共享音频/菜单/附件组件
                          └─原生工具栏能力与有效几何

正文 / Undo / 保存 / 授权 / 录音 → 保留既有 owner
```

ThemeRegistry 是内置预设的唯一来源；ThemeResolver 只解析和投影，不写内容。PresentationResolver 是纯计算，不创建 Editor、不触发保存，也不重新拥有 navigation 状态。App 的装配仍通过既有 navigation、EditorSession、ConfirmedSettings 和原生控制器。

## 配置模型（拟议）

```ts
type AppearanceV2 = {
  version: 2;
  themeId: "classic" | "paper" | "high-contrast";
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

新增 `settings.appearance` / `settings.presentation`；`interfaceFontSize`、`editorFontSize`、`interfaceDetails` 保持既有独立字段，不另起同义圆角/命中区设置。新 density 只映射基础 gap/行距/内边距，不再保存一份 menuSpacing。`interfaceDetails` 继续表示用户覆盖值，文档说明优先级，不能用 compact 绕过44px移动/28px桌面最小命中区。

## 迁移、保存与设备范围

| 场景 | 规则 |
| --- | --- |
| 老设置只有 theme/view | 内存迁移为 classic + 原明暗；view 仅映射 desktop.collectionView；手机仍默认 gallery；双端density初值均为standard |
| 旧 macSidebarVisible | false映射two-pane，其余映射three-pane，同时初始化lastNonFocusNavigation；不自动进入focus；兼容期新navigation向旧显隐字段投影，focus以lastNonFocusNavigation投影 |
| 用户首次保存新设置 | 单事务写新字段，旧 theme/view 作为兼容投影同步写入；同一 settings owner 发布，不能两次异步写 |
| 新字段存在 | 新字段为真源；旧字段只有兼容作用；旧客户端写回不支持安全合并，跨版本降级需显式说明 |
| 非法字段/未知版本 | 更新和导入报错且保留旧状态；不任意抹掉对象 |
| 注册主题被移除 | 需显式迁移主题 ID；界面显示暂用 Classic 并允许用户确认，不能无提示覆盖原偏好 |
| 切换失败 | ConfirmedSettings 保持旧值，显示错误，原页面与焦点不提前切换 |

前端 `Settings` 类型、校验、Rust `archive::validate_settings`、settings action、备份导入/导出和预览默认值须同轮更新；只扩展 Preferences 下拉框会被 Rust 当前枚举校验阻止。保留旧配置用例与非法值拒绝用例。

首版新外观/呈现设置为本地设备偏好，沿现有逻辑备份保存，不新增账户自动同步。桌面栏宽/布局与手机首页各自保存；笔记纸张仍按笔记同步。以后同步外观只显式同步 themeId/明暗等选定字段，不能顺带同步窗口尺寸、选中项和密度；现有同步排除 Settings 的语义保持直至另有规格。

## 主题层次与 token

当前 `design-tokens.css` 仅集中 z-index；颜色主要在 style、desktop、Preferences 等 CSS，几何还被 design-controls 的通用覆盖修改。先统一语义 token，再做新皮肤。

| 层 | 所有权 | 示例 |
| --- | --- | --- |
| 基础值 | 设计系统内部 | 灰阶、字号档、spacing、各组件基础圆角 |
| 语义 token | theme × scheme | `--surface-editor`、`--surface-sidebar`、`--surface-list`、`--text-primary`、`--text-muted`、`--border-subtle` |
| 动作/状态 token | theme × scheme | `--action-accent`、`--selection-bg`、`--selection-text`、`--focus-ring`、`--status-danger`、`--status-warning` |
| 组件 token | 组件与平台 | `--note-card-radius-base`、`--menu-surface`、`--toolbar-surface`、`--search-highlight-bg` |
| 字体/密度/命中区 | resolver + 既有设置 | `--font-ui`、`--font-editor`、`--space-control`、`--hit-min` |

旧 `--paper`、`--ink`、`--accent` 等暂时映射到新 token，迁移完成后移除重复定义。平台 CSS 决定几何，不重新定义主题色；不继续添加 `.dark .desktop .某页` 色值补丁。按 reset → theme tokens → platform geometry → components → state 的显式顺序装载；若引入 cascade layers，必须处理旧未分层样式的优先级，不能混用后误以为新 layer 会覆盖旧 CSS。

圆角按“组件基础值 × 既有 radiusScale”计算：画廊18px、菜单10px等保留各自基础；圆形录音/播放/色板保持语义形状。不使用统一 `border-radius: ... !important` 抹平组件。层级、遮挡、锁定与启动覆盖仍引用现有 `--layer-*`，主题无权改变它们。

## 首批主题

| ID | 方向 | 约束 |
| --- | --- | --- |
| classic | 沿现有 Apple Notes 风格、黄强调、浅灰导航 | 默认预设优先保留现有视觉基线；包含 light/dark |
| paper | 暖白/暖灰、较柔和边线、适合长文阅读 | light/dark 都给出明确 palette；不改变已保存文字颜色、图片、速绘或纸张 |
| high-contrast | 更清楚的边线、文字、选中与焦点 | 支持 light/dark；不用颜色单独表达选中/错误，目标普通文字对比度≥4.5:1 |

不在第一阶段加入用户可执行主题包。未来自定义主题仅接受版本化有界 token JSON，验证颜色、必填项、对比度、资源限制与来源；导入失败保留旧主题。

实施视觉基线：Classic沿用当前桌面浅色的白正文`#ffffff`、侧栏`#f3f3f6`、正文`#19191c`、次级字`#7d7e88`、强调`#d99300`、选中`#fff1cc`；深色沿当前已定义值。Paper采用笔记纸感的正文`#faf7ef`、侧栏`#eee9dc`、正文`#29271f`、次级字`#6c6659`、强调`#80600f`、选中`#eadba9`，暗变体为暖灰黑表面与浅暖文字。High Contrast浅色采用白底/黑字、清楚的深灰边线、深蓝`#0047ab`动作与淡蓝选中；暗色采用黑底/白字、浅灰边线与浅蓝动作。实现必须逐对检查文字/焦点/选中对比度，必要时微调次级字或强调色而不改文档内容。

字体继续使用现有系统/PingFang/Noto本地fallback，不下载远程字体；Paper的差异主要来自表面与文字层次，不擅自将中文正文换成衬线字体。布局保留左对齐的目录、列表与正文，长文默认阅读宽度有界；三个主题不增加营销式装饰或自动动画。样式实现前后对照Classic同尺寸基线，再看Paper/High Contrast是否覆盖所有真实表面。

编辑器 marks 的用户指定颜色是内容，切换主题不重写正文；需要为深色背景提供可读性提示或呈现处理，但不把正文全部强制变成同一种文字颜色。搜索高亮、选区和 tag chip 另用语义 token。

## 呈现解析与编辑器稳定性

输入包括稳定 platform identity、窗口可用空间、字体度量、density、用户偏好栏宽、原生最小尺寸与 safe area。输出至少包含 `interactionMode`、`effectiveNavigation`、`collectionView`、`effectiveColumns`、`effectiveWidths`、`toolbarPolicy`、`capabilities`。

- 原生 Android 始终 mobile 交互；横屏/分屏可改变列数和尺寸，不改成 desktop。音频卡、菜单等统一消费解析结果，不能单独 matchMedia 判断 mobile。
- 桌面/Web 保留现有699/700边界作为兼容起点；后续是否切换为按能力/空间降栏需逐场景验收，不随意修改原生 macOS 小窗的行为。
- “用户偏好宽度”和“当前有效宽度”分开：压缩窗口仅暂时 clamp；拖动在有效范围内真实变化，不能保存一个当前不可见的虚假宽度。字号不再整体乘栏宽；各栏依据文字与最小内容空间约束。
- 菜单/格式/绘画/录音/访问屏障状态仍由原控制器管理。选中项、搜索结果与附件画廊路由由 Navigation 派生；不增加一个可任意组合的 parallel UI state。
- 切换主题只改变属性/token，不更改 Editor key、不重建 Editor、不 setContent。布局切换也尽量只移动容器；确需换挂载点时先证明选区/IME/Undo/owner 保全，不能用 flush 后重新打开代替稳定实例。

## 原生与首屏

现有 NativeToolbarState 只含 system/light/dark 等有限投影；新增 ThemeRegistry 不意味着 AppKit NSMenu 可任意换肤。首版原生继续使用系统明暗外观和已支持字号/命中区；Web 内容使用主题 palette，系统菜单保留系统样式。若后续需要 accent 或背景扩展，必须更新 typed projection、Rust 校验和 AppKit 实现，声明降级行为。

启动页、主窗、独立笔记窗、portal 菜单、设置、录音栏和原生/浮动预览必须纳入主题覆盖。首屏可缓存最近一次已确认外观作为启动提示，加载权威设置后校正；缓存不含正文，失败不能隐藏恢复入口。无色块闪白/深浅错配需实际冷启动核验。

## 验证与迁移顺序

1. 固定 classic 默认明暗的现有截图、字号与控件行为基线，先迁 token，不改变产品交互。
2. 打通移动字号及共享平台模式，修复可确认的布局/命中区问题。
3. 增加严格 schema 和兼容迁移，接入已确认设置发布机制。
4. 上线 ThemeRegistry 三种皮肤，覆盖全部产品表面和原生限制说明。
5. 接入 PresentationResolver，再扩展专注布局与移动列表；逐项删除旧分支和状态来源。

验证代表组合而非穷举所有笛卡尔积：classic 明暗全核心场景；每个新主题覆盖设置/列表/编辑/菜单/锁屏/预览；极大字号+舒适密度+320px、短桌面窗、Android横屏/IME为边界组。另验重启/备份恢复、未知字段、保存失败、系统明暗变化、主题切换时中文组字/Undo与录音不中断。
