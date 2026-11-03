---
id: app-001-search-zero-geometry-01
scope: mac-confirmed-zero-search-local-text-geometry
status: pending
depends-on: [app-004-ocr-host-01, app-001-search-zero-ui-01]
---

## objective

根据已保存原版与candidate03截图的局部测量，窄修Mac三栏列表、可信已加载零搜索结果态的两行原生标题位置与列表“备忘录”分组的垂直位置/笔画。先完成源码与受影响边界独审，随后统一包实测。不得把这次局部修正称作整窗或整应用像素一致。

## context

- docs/INDEX.md、docs/ui/macos.md、docs/verification/README.md
- docs/research/mac-zero-roi-candidate03-01/README.md、measurements.json及原生裁剪
- docs/plan/tasks/app-001-search-zero-ui-01.md及独审02
- plugins/tauri-plugin-notes-ui/macos/toolbar.m、src/style.css的search-zero-section

## layout and measured target

```text
仅可信三栏零结果态（不改查询/焦点/Editor）
列表左边界 x=228pt
  搜索      现字形左249.5pt/上11.5pt → 目标248.5pt/13.5pt
  无结果    现字形左249.5pt/上30pt   → 目标248.5pt/29pt
  备忘录    左边界保持244.5pt；现字形上66pt → 目标65pt
  ─────     分隔线位置不作无证据调整
```

上述坐标只为2×保存图内文字边界，不是AppKit frame。标题与副标题需分别调整，不能整体平移。当前原生titleX在有侧栏三栏为side+19，title/count frame y分别9/28；开发须按真实flipped/字体基线核对再调整。只有已确认零结果态应用此测量，不扩展到普通文件夹、非零结果、画廊、独立窗、侧栏隐藏或不同布局的未知状态。沿用当前可信展示语义，不新增宽泛状态或改变动作协议。

“备忘录”字形宽相近但前景覆盖约为原版79%，已证笔画偏细，未证具体字体族/weight数值。可在该专用类内选取系统已有字重作有限候选；必须保留候选渲染/测量依据，无法同条件实测则标待校准，不能单凭CSS数值宣布匹配。分隔线主要深色行y183px两图一致；列表边界1pt差和搜索宽度因不等窗条件留待新pair，不在本次猜测调整。

## path

仅plugins/tauri-plugin-notes-ui/macos/toolbar.m对应零态title/count layout、src/style.css的search-zero-section和必要定向检查/任务文档。若要改App/state协议或插件其他层，先向root提供实际阻塞与最小差异。禁止改搜索输入/焦点/激活、菜单路由、持久化、Editor、录音、OCR、窗口尺寸与分栏默认值、强调色资源或共享字体。

## verification

typecheck及现有受影响原生顶部/零结果展示检查；检查零态外frame与样式保持原契约，当前布局可见/隐藏边界没有变化。静态检查不作为像素验收。独立审查在冻结的单独review worktree进行。

新包再取同窗口逻辑尺寸、分栏、主题、系统比例、激活/焦点、查询/滚动位置原版与克隆PNG；保留原图、字形边界、裁剪、叠图和差分。若GUI不可用或条件不齐，明确UNKNOWN并保留局部观察，不缩放、不以背景材质解释文字误差。蓝/金焦点、marked输入和全窗口像素仍为独立未关闭项目。

## scheduling

OCR源接入冻结/独审/主合入之后才从最新主HEAD建立开发worktree，避免同时拥有App/native-menu/CSS交界文件。先源码检查、不运行native构建或占GUI，统一包由root串行排期。当前仅规划，未实施。
