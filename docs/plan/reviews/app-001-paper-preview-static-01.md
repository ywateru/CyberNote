# 手机纸张预览候选独立静态复核 01

2026-11-03，独立 verify，冻结 `/private/tmp/apple-notes-paper-preview-01` HEAD `bab82fb4fdfd0af3f0cfd19f1e69e9e146a36a9a`，基线 `2d3bc58`。本轮只读候选及基线、执行有限源码核对和 typecheck；未修改产品、构建、合入、安装或操作 Mac/Android/浏览器。

## 有限结论

本轮实际接线、布局算术及未改动边界内未发现新增的明确阻断问题，**静态复核 ready；不是运行或像素验收放行**。主 App 不由本轮合入，后续按 root 的媒体/纸张串行装包安排进行 Android 实际复验。运行时 mask 可见、七状态选择/保存、取消/Back、FIX07 选区回归、窄屏实际滚动/安全区、主题/字体及像素均未测。

## 接线、资产与几何

- `src/App.tsx:117` 桌面数组顺序为原来的 plain → 三种横线 → 三种网格；`:127` 手机顺序为 plain → lines-small/grid-small → lines-medium/grid-medium → lines-large/grid-large。`paperOptions` 按既有 mobile 状态选择，七个 key/label/data-paper-style 与原模型一致。
- 六个已有 SVG 均有实际 import 和完整类型映射 (`src/App.tsx:145`)，不是仅放置未使用资产；仅 `mobile && p !== "plain"` 创建 `aria-hidden` 图案 span，URL 写入该卡片的自定义 CSS 属性。空白无 SVG，桌面无新 span。
- 独立 XML 解析与基线字节核对：六 SVG 均未改，width/height/viewBox 为 74/60/`0 0 74 60`；透明背景、不透明黑色 0.45 stroke，无 rect 白底或 pattern。横线 small/medium/large 分别 7/3/2 条；网格分别 7H9V、4H5V、3H3V，对应 8×6、4×3、2×2 完整格。逐资产 SHA 保存于 `source-audit.json`，与候选开发记录一致。
- `src/style.css:2480` 手机卡片宽高同时乘 `100vw / 224`，因此保持 74:60；全卡 absolute inset 0 的预览在 `position:relative` 卡片内定位，无额外 7 单位 padding。标准 mask 显式 alpha，标准/前缀均 contain、center、no-repeat，避免把黑色按 luminance 隐去或纵向拉伸；`pointer-events:none` 不接管按钮触摸。这里是 CSS 声明核对，不能证明目标 WebView 已成功绘制遮罩。
- 空白卡片宽度仍为单卡宽，`grid-column:1/-1` 占首行；其后六卡按两列配对。普通 grid 仍在文档流中，没有把七个按钮绝对定位。

水平尺寸严格为 `(25 + 74 + 26 + 74 + 25) × viewportWidth / 224 = viewportWidth`。例如 320 宽卡片约 105.71×85.71、gap 37.14；390 宽卡片约 128.84×104.46、gap 45.27。没有按视口高度拉伸。选中 outline 位于卡片外，但两侧已有 25 单位 padding。

## 窄屏、滚动与安全区的静态边界

`src/style.css:2424` 的改动位于既有 max-width:699px 媒体块、限定 `.mobile .modal-paper`，保持 sheet 顶部 inset 20px，取消 max-width/max-height 上限，`overflow-y:auto`。上 padding 82 单位、四行卡片共 240 单位、三行 gap 共 78 单位，因此正常流的最小内容总高为 `400 × viewportWidth / 224 + 24px + bottomSafeInset`，超过可用高度时有滚动内容；末尾 padding 包含 `env(safe-area-inset-bottom,0px)`。320 宽时不计安全区约 595.43px，较矮窗口应依赖滚动，不能称为所有内容在首屏可见。

标题与说明自身仍是绝对定位：标题独立水平居中、取消在左，说明 top 54 单位、字号 12px/行高 18px。它们不参与 grid 高度计算，因此说明换行、系统字体放大、极窄宽度或宿主 inset 的实际遮挡不能仅由上述算术排除；该部分保留真实设备门槛。本轮没有运行排版引擎或触摸滚动，也没有把录屏 224px 源宽当成已知原设备 CSS 宽度/DPR。

## 交互与桌面未改动边界

独立提取整个选纸 `onClick={async ...}` JSX 属性，与 `2d3bc58` 逐字节相同：仍 await patchNote(paperStyle)，再 closePaper；取消仍直接 closePaper。Back、关闭、Editor 生命周期、授权和保存实现不在候选 diff 中。独立提取范围的 SHA 为 `f703d24364cbd3c032bddeb57f9b092b3a651059e4653950cb390b744772667e`；这是本次属性切片的身份，不以开发记录另一切片的 hash 作为通过依据。

六条 `.paper-context-* .drawing-node` 规则与基线逐字节相同，真实绘画背景步长/纸张模型未改；Editor、editor-schema、types、package.json、pnpm-lock 无 diff。桌面顺序/名称/旧渐变和选中标记保留，新 CSS 限定 mobile paper；被收窄的 `.sheet-top` 手机规则在本源码只有一处对应 markup，即纸张弹层，因此未找到影响其他 sheet 的实例。以上证明源码变更范围，不能替代桌面运行回归。

## 独立执行与身份

| 检查 | 结果 | 范围 |
| --- | --- | --- |
| `pnpm typecheck` | exit 0 | 前端严格类型检查，六 URL import 的类型与映射可接受；不证明 Vite 打包或运行资源可用 |
| `git diff --check 2d3bc58 bab82fb` | exit 0 | 候选空白检查 |
| 资产 XML / SHA、import/mapping、数组顺序、handler 与 drawing 比较 | pass | 实际生产文件与基线的有限源码核对，不是复制实现的运行测试 |

`src/App.tsx` SHA-256 `e188e3e6cc8773a350eca0dc6f98c94b2058421914c5a8149e776aa1221dd758`；`src/style.css` SHA-256 `87b2773eabec06a4a7aff46ca7d7bb9136ddeba2938e6c01ff88515ffa3cbe91`，与候选交付身份一致。typecheck 临时链接主目录已有 node_modules，未下载/安装依赖，结束后已移除，候选 worktree clean。

独立结果、几何算术记录、typecheck 原始日志和 manifest 在主目录 `docs/verification/app-001-paper-preview/independent-static-01/`。报告与证据交 root 统一保存；verify 未执行主工作树 git add/commit。不得将本次静态 ready 升级为七纸张运行 pass、UI 像素 pass 或 APP-001 整体完成。
