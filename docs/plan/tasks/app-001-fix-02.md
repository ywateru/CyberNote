---
id: app-001-fix-02
scope: mac-toolbar-symbols-and-native-controls
status: ready-for-review
depends-on: [app-001-fix-01, app-001-fix-03]
---

## objective

修正首轮QA-05工具栏图形、分组、材质与菜单差异；本任务只针对Mac主窗与独立窗的顶部，不将Android换成Mac风格。原版为本机Notes4.13/macOS26.4，不能用当前在线手册较新版本覆盖实采基准。

1. Mac系统符号在运行时通过公开NSImage API生成或由原生按钮直接绘制。采用已校准候选作为起点，保留字形比例与留白，按真实窗口截图继续调字号/字重/scale/物理像素位置。普通表格与表格内编辑状态独立选符号，来源是当前真实选区。图标单色mask只能称图标接入，不能称原生玻璃已完成。
2. 使用公开AppKit控件制作小范围顶部工具栏原型，并在真实主窗验证。26+玻璃控件需运行时检查；只使用公开regular/clear类型。沿用同一编辑/保存命令，保留编辑器选区。若确实改善匹配，纳入正式Mac窗口；不能留下两套同时响应的可见工具栏。原生顶栏/网页内容布局需要共同驱动，不能叠加顶部空白或挡住点击。
3. 顶部按钮分组、间距、前景颜色、激活/失活、菜单锚点与原版对应；分栏拖动/隐藏/画廊展开/小窗宽度时保持对齐。不要通过固定1088宽度截图专用位置隐藏布局错误。
   画廊打开笔记时，返回圆按钮右侧仍显示文件夹名与计数，编辑工具组靠右排列（`macos26-gallery-open-note.png`）；不能省略标题后让整组工具从返回按钮起铺满。FIX-01的同窗导航行为只关闭行为缺口，顶部几何仍由本任务验收。
4. Mac格式面板首行标记与颜色、随后样式与列表/引用；媒体菜单、更多菜单按实采平台文字和顺序。数学/最近笔记等真实功能属于相应后续模块；未实现动作不能放一个仅成功提示的假按钮，整体范围仍保持未完成。
5. 接入遵循原生模块独立静态补审`app-001-native-toolbar-plugin-01.md`的绑定契约；快捷键以新增原版证据更正：全局搜索菜单/Option+Cmd+F使用当前绑定的focusSearch，Cmd+F仍为笔记内查找，Cmd+Shift+F原版为替换栏、不得映射全局搜索。444f03b已最小修正菜单映射，实际新包待验，旧报告不追溯改写。不留隐藏DOM输入框接受焦点。宿主串行合并最新原生搜索value与sequence再提交revision/ack，忽略旧绑定/重复/过期意图，处理bind响应前事件与组字冲突，销毁失败也在finally解除事件监听。按native reservedTop替换现有顶部占位而非相加，真实分栏宽度与原生状态同源。
6. 原生搜索获焦时也须响应菜单快捷键，不能只在WebView keydown处理Option+Cmd+F/Cmd+N/Cmd+F；由原生菜单入口定向到实际聚焦的所属窗口。事件监听先于bind并暂存响应前事件，取得绑定身份后仅重放本窗当前bindingId的事件。原生状态只提交实际语义变化；不能由每次保存/无关渲染打断正在追踪的菜单。格式菜单意图须关联对应state revision的noteId、实时授权、Editor实例与selection bookmark，确认仍有效后恢复选区执行共用命令；切笔记或授权失效时拒绝旧意图，不能对新笔记套用旧选区。
7. 正式接入允许修正`plugins/tauri-plugin-notes-ui/`的产品能力缺口：格式弹层首行横排控件、公开原生层与原版锚点/尺寸，以及画廊浏览和打开笔记的几何区分。画廊浏览没有真实返回按钮时不得保留虚拟返回按钮占位；标题起点以已有`macos26-gallery.png`与`macos26-gallery-open-note.png`实采分别对齐。修正后重新记录插件/主应用最终源码与产物身份，不沿用b735961旧模块结论替代新实现验收。

## context

- docs/INDEX.md、docs/requirements.md F04/F11/F13/F15
- docs/ui/macos.md、docs/ui/local-features.md
- docs/research/macos-native-ui.md
- docs/research/macos-symbol-calibration.md 与 assets/macos-symbols/rankings.json
- docs/research/macos-toolbar-geometry/analysis.md 与 measurements.json（649c24e；离线可见面/文字边界，不是原生frame或像素通过）
- docs/plan/reviews/qa-001-01.md QA-05
- references/desktop/macos26-format.png、macos26-media.png、macos26-note-menu.png、macos26-table.png

## path

Mac条件Rust桥接模块、src-tauri/Cargo.toml与lock、src-tauri/src/lib.rs、仅Mac且限定本应用窗口的capability、src中的图标/顶栏/菜单组件和样式、原生顶部插件的上述产品缺口、README/architecture必要契约。研究资产保持只读，不把探针位图打包进Android。不要改导入恢复或无关媒体模块。

## verification

开发者构建正式Mac产物，记录源码/产物hash。独立verify在同尺寸/同内容/同主题/同焦点状态采集顶部原图与克隆，对定义区域输出原图/叠图/差分/精确指标。比较参数与系统叠层位置明确记录，不能以二值图标IoU替代整工具栏RGB像素验收。

功能回归：新建/格式选区/清单/表格/媒体/菜单/搜索真实结果、中文composition、Undo/Redo、分栏缩放、失活再激活、窗口关闭重开、独立窗。Android类型/构建回归确保Mac条件代码未污染。原生材质若仍有差异或未测，明确fail/unknown，不能以“使用了系统API”判像素pass。

## delivery

2026-11-03：正式宿主接入、原生菜单定向、搜索 ACK/生命周期、有效选区与授权目标守卫、单一顶部预留、画廊/独立窗投影已经实现。插件只增加保留搜索祖先可见性的运行时修正，并将构建依赖锁定到宿主现有 tauri-plugin 2.7.2，主应用 dialog/fs/rfd 未降级。

开发者自检、最终源码/产物身份和真实截图见 `docs/verification/app-001-fix-02/selfcheck.md`。控制器 12 项、Rust 29 项及插件 10 项测试通过，Mac 与 Android 真实构建完成。实际公共顶部 RGB 比较为 **fail**，格式文字/图形内部位置/材质等仍有差异；本任务只交付可审查候选，未完成像素验收。中文 marked composition、全部菜单/媒体与授权竞争完整设备矩阵仍 unknown。Android 已知长时间组词 P1 归属 FIX-04，本候选未修复，不能以构建通过推定输入通过。
