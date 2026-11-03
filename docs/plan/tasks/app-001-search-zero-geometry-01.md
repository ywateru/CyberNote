---
id: app-001-search-zero-geometry-01
scope: mac-confirmed-zero-search-local-text-geometry
status: pending-review
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

OCR源接入5b707ae已独审02接受并主cd7c94e整合，故源码owner前置已满足；OCR平台运行任务仍继续，不由此追认完成。现在可从最新主HEAD建立开发worktree，避免同时拥有App/native-menu/CSS交界文件。先源码检查、不运行native构建或占GUI，统一包由root串行排期。

## 开发实现约束（2026-11-04）

已核对 `NotesUIRoot.isFlipped=YES`，其子视图 frame y 自顶向下；root 自身仍按父视图 flipped 状态锚定窗口顶部52pt。本轮只在 `layout=threeColumn && sidebarVisible` 且沿用当前 folderTitle=搜索、folderCount=0、非空 search.value 的零态条件时，将最终 title frame 的 x/y 从 `titleX/9` 改为 `titleX-1/11`、count 从 `titleX/28` 改为 `titleX-1/27`。保留 titleX、titleWidth、隐藏阈值、工具组排布和原字体，不用截图 ink 坐标冒充 AppKit frame。

CSS 在 desktop + native-toolbar + 可见侧栏 + 非画廊 + 非独立窗的现有 `.search-zero-section` 内覆盖 padding-top=9px；40px border-box 高度、左右16px、20px line-height 与0.5px分隔线均保留。使用系统现有600/650/700三个有限字重进行 Chrome headless 的实际专用分组渲染诊断；按数据选择较粗候选并冻结。该诊断仅解释源码候选和 CSS 守卫边界，不是 WKWebView 或原版字体/像素验收。实际新包观察仍 UNKNOWN，后续由root串行排期。

## 开发源码候选01

已冻结两产品文件，聚合 `c421f6b874e1aff7b8096fa0eedb04b32278702f85cc7f8421e968e1a0a5528e`；49保护文件不变。typecheck、前端build、原零态展示16/启动5/选择7/顶部13组与实际CSS差量8组通过。保留600/650/700专用Chrome渲染：三者中文光栅相同，不能证明700改善笔画，700仅待真包校准候选。首轮诊断因遗漏padding逻辑别名而失败，其摘要与修正后原始结果均保留。没有native构建、共享target、GUI、设备或新包像素验收；详见 [源码候选01](../../verification/app-001-search-zero-geometry-01/source-candidate-01/README.md)。等待root冻结提交独审，再串行新包同条件测量。
