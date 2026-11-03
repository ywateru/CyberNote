---
id: app-001-fix-02
scope: mac-toolbar-symbols-and-native-controls
status: pending
depends-on: [app-001-fix-01, app-001-fix-03]
---

## objective

修正首轮QA-05工具栏图形、分组、材质与菜单差异；本任务只针对Mac主窗与独立窗的顶部，不将Android换成Mac风格。原版为本机Notes4.13/macOS26.4，不能用当前在线手册较新版本覆盖实采基准。

1. Mac系统符号在运行时通过公开NSImage API生成或由原生按钮直接绘制。采用已校准候选作为起点，保留字形比例与留白，按真实窗口截图继续调字号/字重/scale/物理像素位置。普通表格与表格内编辑状态独立选符号，来源是当前真实选区。图标单色mask只能称图标接入，不能称原生玻璃已完成。
2. 使用公开AppKit控件制作小范围顶部工具栏原型，并在真实主窗验证。26+玻璃控件需运行时检查；只使用公开regular/clear类型。沿用同一编辑/保存命令，保留编辑器选区。若确实改善匹配，纳入正式Mac窗口；不能留下两套同时响应的可见工具栏。原生顶栏/网页内容布局需要共同驱动，不能叠加顶部空白或挡住点击。
3. 顶部按钮分组、间距、前景颜色、激活/失活、菜单锚点与原版对应；分栏拖动/隐藏/画廊展开/小窗宽度时保持对齐。不要通过固定1088宽度截图专用位置隐藏布局错误。
   画廊打开笔记时，返回圆按钮右侧仍显示文件夹名与计数，编辑工具组靠右排列（`macos26-gallery-open-note.png`）；不能省略标题后让整组工具从返回按钮起铺满。FIX-01的同窗导航行为只关闭行为缺口，顶部几何仍由本任务验收。
4. Mac格式面板首行标记与颜色、随后样式与列表/引用；媒体菜单、更多菜单按实采平台文字和顺序。数学/最近笔记等真实功能属于相应后续模块；未实现动作不能放一个仅成功提示的假按钮，整体范围仍保持未完成。

## context

- docs/INDEX.md、docs/requirements.md F04/F11/F13/F15
- docs/ui/macos.md、docs/ui/local-features.md
- docs/research/macos-native-ui.md
- docs/research/macos-symbol-calibration.md 与 assets/macos-symbols/rankings.json
- docs/plan/reviews/qa-001-01.md QA-05
- references/desktop/macos26-format.png、macos26-media.png、macos26-note-menu.png、macos26-table.png

## path

Mac条件Rust桥接模块、src-tauri/Cargo.toml与lock、src-tauri/src/lib.rs、src中的图标/顶栏/菜单组件和样式、README/architecture必要契约。研究资产保持只读，不把探针位图打包进Android。不要改导入恢复或无关媒体模块。

## verification

开发者构建正式Mac产物，记录源码/产物hash。独立verify在同尺寸/同内容/同主题/同焦点状态采集顶部原图与克隆，对定义区域输出原图/叠图/差分/精确指标。比较参数与系统叠层位置明确记录，不能以二值图标IoU替代整工具栏RGB像素验收。

功能回归：新建/格式选区/清单/表格/媒体/菜单/搜索真实结果、中文composition、Undo/Redo、分栏缩放、失活再激活、窗口关闭重开、独立窗。Android类型/构建回归确保Mac条件代码未污染。原生材质若仍有差异或未测，明确fail/unknown，不能以“使用了系统API”判像素pass。
