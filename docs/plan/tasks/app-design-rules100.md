---
id: app-design-rules100
scope: design-rules
status: done
depends-on: [app-build-delivery97, app-media-performance99, app-design-settings100a]
---

## objective

把字号、图标尺寸、按钮命中区域、菜单间距、圆角、层级整理成共享设计变量，桌面/移动端分别定义布局规则，减少零散覆盖；设置页允许用户自定义这些细节并即时预览、持久保存与恢复默认。

配置契约与设置入口可由100A在不修改App/媒体/全局样式的路径先行。此阶段复用其唯一类型/映射，不另造配置源；必须把变量真正应用到全部产品控件和原生可支持尺寸后，才可验收本任务。

## context

docs/ui/design-rules.md（布局、尺寸上下界、持久校验和系统能力的唯一规则）；docs/ui/preferences.md、docs/ui/drawing-editor.md、docs/ui/table-editing.md、docs/plan/cybernote-modernization-state.md。

## path

共享设计变量/Settings类型与归档校验、Preferences界面、App顶层变量映射、Menu/Button/预览/绘画/表格/设置CSS与必要的原生工具栏尺寸适配；禁止任意CSS字符串写入设置。

## verification

- 每项变量实际作用到对应控件，不是仅在预览卡内改变。原生 Mac 控件能支持的尺寸同步适配，系统菜单固有限制明确显示而非假装自定义。
- 字体两档位配置保留，图标/命中区分开；移动触控下界保证可操作。桌面/移动分开布局，不以整体 transform/zoom 缩小遮掩溢出。
- 提供有界输入、重置、错误反馈和持久恢复。菜单/子菜单/浮窗/编辑面板/访问屏障层级为共享命名变量；可配置层级偏好不能让普通浮窗越过锁定/撤权遮挡。
- 100A设置控件仅在持久ACK后确认。此阶段接入全局变量时，必须同时处理App现有optimistic settings写入失败的回滚：不能让拒绝值继续作用到真实界面，也不能用旧失败回滚覆盖更新的成功配置。外部真实设置更新仍可采纳。
- 小屏320/390、桌面、短屏、五档字号、明暗主题、键盘操作与极值配置；无裁切、菜单越界或不必要横滚。重载与备份导入导出验证设置。


## 作者交付（2026-11-09）

Review baseline `92fba27ca9a380ba481d16f0d884515a245b0085`（包含父级回填的 accepted MEDIA99UI 与101指纹修正；不属于本作者增量）。本任务实现真实全局控件映射、语义层级、菜单响应布局、确认设置 owner、原生图标/命中独立投影。没有媒体生命周期/Store schema 修改。

- `node scripts/check-design-settings100.mjs`：3组所有权/旧失败/外部更新/旧读取/确认读取失败和非法细节检查。
- `node scripts/debug/design100.mjs artifacts/design100-real artifacts/design100-rust`：14项实际 App 检查，生产 Store+Session+SQLite 隔离数据。桌面1280×800/760×500、手机320×640/390×844，五字号、浅色最小值/深色最大值、控件命中和横向裁切。真实 SQLite trigger 拒绝写入、两次实际 App 交错写（旧115失败/新89成功）、外部后台写87及刷新/重载；拒绝值从未进入实际全局 CSS。真实 MenuSurface/嵌套长菜单滚动点击、继承变量、模态和访问层级。
- Rust transport 使用 `scripts/debug/build-rust-attachments.mjs` 从当前实际 Store/Session 源构建并逐文件 SHA256核对，二进制 SHA256 `3c3af4e19565749a6adf73ce30d64c9f889702c59b6b33f609c5bbe2305fae0e`。产物 `artifacts/design100-rust/build.json`；没有沿用源码不匹配的100A旧二进制。
- `node scripts/debug/design100-table.mjs`：桌面760×500/手机320×640，各五字号，最大细节值下实际行列按钮命中/视口/一次点击菜单10项。检查浏览器布局帧完成后的位置；截图在 `artifacts/design100-table/`。
- `node scripts/check-native-toolbar.mjs`：24项控制器/投影检查通过（含本任务独立倍率实际投影）。native plugin `cargo test --lib`：30项（包括新独立倍率默认/上下边界/NaN/Infinity）通过；生产 Objective-C通过实际编译。
- `scripts/design100-native-probe.m` 包含实际生产 toolbar.m，在隐藏 NSWindow 上验证独立图标/文本/frame、hit-only symbol保持、五字号×两窗口命中和边界。编译链接 AppKit/QuartzCore 与生产 format.m/menu.m 后实际执行通过，不显示/操作用户窗口。
- `node scripts/check-editor-session96-browser.mjs`：14项（含无未捕获错误），格式保持、普通/二级菜单关闭顺序、焦点/IME意图/绘画/撤权通过。`node scripts/check-table-interactions95.mjs`：实际 App Web/native intent 转换、Undo/Redo和持久化通过。
- `node scripts/check-note-move-menu.mjs`：21项桌面/手机/模拟原生带图标移动子菜单、键盘导航与原目标移动通过；`node scripts/check-menu-lifetimes.mjs` 原有附件预览/编辑独立租约清理检查通过。
- `pnpm build`、`git diff --check` 通过。原有bundle大小提示保留，没有新增打包错误。

开发验证中的测试修正：菜单 action 会正常关闭菜单，因此几何断言移到点击前，访问屏障断言接受菜单已清除或隐藏；原生测试 NSWindow 显式关闭时设置 releasedWhenClosed=NO 避免测试自身ARC双重释放。均未为测试弱化生产行为。表格初次检查暴露原15px容器容纳44px按钮的问题，已以统一容器/gutter修正；产品逻辑未变。

独立审核与最终双端实包/ADB仍待执行；此状态不代表整个modernization目标完成。

独立审查2026-11-09：真实Store/App14项、附加延迟读/确认失败/速绘portal6项及native投影24项通过；chosen表格16个观察中4个手机行状态失败。F1是旧22px手机chosen行容器未跟随44–52.8px按钮扩展，裁图标并覆盖单元格正文。见 `docs/plan/reviews/app-design-rules100-independent.md`；修复复审前不接受。

## F1 修复（待原独审复核）

独审 `cf39663e33c737a9250ebb92663dcd140ee7d10f` 发现旧 `.mobile .table-axis-handle.row.chosen {width:22px}` 优先级高于新基础行容器，选中后44/52.8px按钮侵入单元格正文。作者原样执行独审工具重现12/16通过、4项手机行失败，保留 `artifacts/design100-f1-before/`，未覆盖历史失败。

修复只修改 `design-controls.css`：选中行容器显式匹配同级优先级；行列容器计入两侧1px边框，让最短边下界对应真实内部命中区，选中双按钮容器也含完整边框。没有修改 TableControls/文档/选择/历史、设置owner、媒体或速绘源。

- 原样 `node scripts/verification/check-design100-chosen-table-independent.mjs artifacts/design100-f1-after`：16/16通过，桌面/320手机、tiny/huge、默认/最大命中、row/column，实际 `elementFromPoint` 可命中单元格正文，文档不变。
- `node scripts/debug/design100-table.mjs artifacts/design100-f1-unselected`：未选中五字号双端10项通过。
- `node scripts/check-editor-session96-browser.mjs`：14项通过；`node scripts/check-table-interactions95.mjs`：真实App转换/历史/持久化通过。
- `pnpm build`、`git diff --check` 通过。日志 `/private/tmp/design100-f1-{before,after,unselected,session,table95,build}.log`。

本修复没有native整包/ADB或Store重新编译；原独审其他已通过项不作重复声明，等待原独审复核F1。

F1原独审复核2026-11-09：修正5093adc7的原样chosen16/16及附加实际行列箭头/完整glyph/容器/正文命中4项全部通过，确认未缩hit或改表格文档逻辑。接受DESIGN100源码阶段整合，native实包/ADB仍归FINAL101；最终结论见 `docs/plan/reviews/app-design-rules100-independent.md`。
