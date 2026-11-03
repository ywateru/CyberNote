---
id: app-001-fix-02-visual-01
scope: native-toolbar-public-content-calibration
status: in-progress
depends-on: [app-001-fix-02]
---

## objective

基于34223af已冻结宿主的实际差异，先在隔离worktree准备最小原生内容修正；当前FIX02功能复验和FIX04的Editor/依赖修改继续各自进行。此任务前置候选已冻结，但完整FIX02像素仍fail，不能以源码准备替代宿主接入与独立像素验收。

1. 按`macos-toolbar-host-deltas/analysis.md`把Aa改为真实中文“格式”，校准新建/清单/表格/附件/共享/更多的内部可见内容位置。公共胶囊外锚点、161/80pt组宽与18/18/16pt间距近似已齐，先保持；墨迹中心不是点击框，不直接缩改按钮命中区。
2. 校准真实NSSearchField内的图标与文字位置。放大镜纵向已齐，当前占位字需单独向下；不能整体下移field，也不能用静态文本/截图盖在输入控件上。仅公开AppKit API，保留真实field editor、marked composition、搜索回调与ACK/focusSearch契约；输入、占位、清除按钮均须后续实采。
3. 固定动作身份、popover/menu关联、窗口/UUID/revision/sequence及授权守卫、52pt预留、窄窗/画廊/分栏布局语义，不修改颜色/blur常量推断材质。失活两图背景位置不同，材质因果仍unknown。
4. 第一阶段只提交隔离源码和有限原生编译检查，明确runtime/pixel未测。root待FIX04源码冻结、当前Mac复验释放后合入并构建实际宿主，接着同屏幕位置/尺寸/焦点/背景采集及独立回归；此阶段之前任务不标done或pixel pass。

## context

- docs/INDEX.md、docs/ui/macos.md、docs/verification/README.md
- docs/plan/tasks/app-001-fix-02.md、docs/plan/tasks/parity-001.md
- docs/research/macos-toolbar-geometry/analysis.md
- docs/research/macos-toolbar-host-deltas/analysis.md、inputs.json、top-ink-deltas.png
- docs/verification/app-001-fix-02/selfcheck.md、source-inputs.json、runtime/roi-metrics.json

## path

隔离worktree内仅`plugins/tauri-plugin-notes-ui/macos/toolbar.m`，必要的该任务说明与独立证据目录。不得改App/Editor/依赖/lock/授权协议，也不修改主工作目录或其target。root管理worktree生命周期，基于当前交付分支中本任务文档的提交创建；固定Mac4118包在独立verify明确交还前不可覆盖或操作。

## verification

先在隔离目录对真实Objective-C输入执行与build.rs一致的ARC/blocks/minimum12编译检查，避免额外完整Rust/前端构建占用磁盘。记录源码SHA、公开API依据和检查范围。只有原生语法/编译通过不等于运行通过。

宿主接入后必须实际检查原生搜索占位/连续输入/清除/focusSearch/ACK/Undo归属、真实格式选区/Undo、聚焦窗口路由、分栏与画廊状态。新旧源/产物身份清晰分开；同条件公共ROI输出原图/叠图/差分与raw exact/mean/max指标，改善不等于零差异。其他侧栏/正文/菜单/完整材料状态仍按PARITY继续。

## first-stage delivery

2026-11-03：隔离基线09393a3中toolbar SHA与离线delta冻结输入一致。已准备真实中文“格式”标题、按钮内容绘制偏移及公开NSSearchFieldCell内部分别布局，保持原控件frame、胶囊、颜色材质与所有动作/搜索生命周期接口。两个真实Objective-C翻译单元使用ARC/blocks/minimum12与Wall/Wextra编译exit0且无警告，未做完整构建/GUI/设备运行。

第一阶段证据与源码SHA见`docs/verification/app-001-fix-02-visual-01/README.md`及`compile-results.json`。状态仍in-progress：实际field editor/marked、菜单/选区/Undo、窗口路由/布局与所有runtime/pixel均unknown，须root合入正式宿主后独立复验。当前提交只交付可审查候选，不关闭FIX02或像素缺口。
