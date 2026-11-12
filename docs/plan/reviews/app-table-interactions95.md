# TABLE95 独立审查

2026-11-09。审查人：`/root/table95_verify`（非开发作者）。基线 `00f2847e`，开发提交 `7e047e08`，工作区 `/private/tmp/cybernote-modernization`。本次只新增审查脚本与报告，未修改产品源码，未做 native build/ADB。

## Findings

### F1 — P1 / blocking：文字转表格未检查整篇文档节点预算，生成无法保存的文档

- 设计：`docs/ui/table-editing.md:25` 要求超出文档表格容量不执行，并在能力/UI禁用或明确报错；转换须走真实保存流程。
- 代码：`src/editor-actions.ts:33`–`40` 只检查行数和逻辑网格面积 ≤100,000；`canConvertTextToTable` 直接复用该判断，`convertTextToTable:78`–`82` 未检查转换后整文档节点数就 dispatch。Rust `src-tauri/src/store/archive/document.rs:288` 明确拒绝整篇节点数超过 `MAX_NODES=100_000`。
- 真实 ProseMirror 复现：单段约 70KB、35,000 个 `x` 用 Tab 分隔，原文仅 3 节点；能力返回 true，转换返回 true，结果含 **105,003** 节点（doc/table/row + cell/paragraph/text）。这不是网格超限，当前 35,000 格检查允许，但后端节点预算必拒绝保存。
- 影响：普通粘贴的大表文本可在界面转换成功后进入保存错误，违背容量前置检查与可持久化契约。
- 修正要求：能力与执行共用真实目标文档预算检查；计算周围未选内容、补齐空格子、实际 paragraph/text/row 等结构，不能只降低单表固定格数。拒绝时不得修改 doc/history/selection，仍保留原文本。即时原始结构往返也应走同样可保存边界。
- 证据：`scripts/verification/check-table95-independent.mjs`；`artifacts/table95-independent/module.log`（原始复现）。当前默认模式记录已知复现，修正后使用 `node scripts/verification/check-table95-independent.mjs --expect-fixed` 检查拒绝及原文/选区/历史不变。

### R1 — P2 / non-blocking（本次源码合入范围；最终交付仍开放）：Mac 悬停连续高亮未复现

- 设计：`docs/ui/table-editing.md:17`、任务 verification 要求真实悬停根因与修复。
- 开发未修改 pointer/selection CSS，Chrome 中心/边缘移动与相邻表格没有出现连续 CellSelection；边缘黄色 resize handle 不是被证明的用户故障。
- 当前不得宣布 hover 已修复。保留开发证据 `artifacts/table95/hover-before.json`、`edge-hover-before.json` 及截图，在 FINAL101 使用真实 Mac WebKit、菜单焦点切换和丢失 mouseup 场景核对。若复现，需要另行修复并独审；不能靠阻断所有 pointermove 或删除真实选择样式关闭。

## 本次验证

- 阅读全部开发 diff（14 文件），核对文本/表格选区限制、精确来源范围及 doc 内容比较、单步 history 隔离、TableControls table/cell ownership、Web/原生命令类型与能力投影接线。
- 独立运行 `node scripts/verification/check-table95-independent.mjs`：真实生产 schema/commands，96 schema cases通过；额外通过 hardBreak 部分选区及精确 Undo、已有表格内文字拒绝、周围文档变化后不复用过时原结构；容量故障如 F1 实际复现。此脚本为真实 ProseMirror，非浏览器模拟编辑器。
- 独立运行 `node scripts/verification/check-table95-menu-independent.mjs`：真实 App/Chrome，4 项通过：dots 一次点击即选中行并开共享菜单、Escape 聚焦回 dots、箭头重开后添加行仅影响目标表格、导航清理旧菜单且原正文保存保持。证据 `artifacts/table95-independent/menu-result.json`、`menu.log`、`menu-navigation.png`。
- 初次独立菜单断言错误地将有 schema 默认 attrs 的实际文档与未归一化 fixture 比较，改为与转换前真实文档比较后通过；未改产品代码。
- 开发者 build/editor/native-toolbar/table-controls/native-menu-client/App日志只做只读核对，没有重复全套执行；不把作者证据记为独立运行。
- 浏览器 App 使用隔离模拟 Store/IPC，不证明 AppKit/WebKit/真实 Store/实体设备。容量后端拒绝结论来自真实命令节点计数及权威 Rust validator 的明确边界；本轮未另行编译 Rust。

## 结论

**blocked**。F1 修正并独立复验后才可接受此次源码整合。R1 的原生悬停门槛转入 FINAL101，不能据本报告关闭用户报告或完整 modernization 目标。


## F1 独立复审 — 2026-11-09

复审提交 `c0a6dd52862380a6a6176d2b6eca3e23b9d63e4b`（父 `ea7c56fc`），产品工作树开始时干净。本次未改产品源码，未运行 native build/ADB。此前 **blocked** 结论由本节取代，仅限源码整合门槛。

### Findings 复核

- **F1：closed**。`conversionPlan` 被能力和执行共用；完整文档拟合使用真实 `replaceRangeWith` 和常量大小占位表格，以实际 row/cell/paragraph/text 数替代占位预算；执行在 dispatch 前再次核对真实结果文档。`nodeBudget` 覆盖整篇节点、root depth 0 的深度以及表格逻辑网格。精确来源往返按真实来源表格计量，不把格内 Tab 错算成新列。拒绝分支没有 dispatch，保留整个 EditorState。
- **缓存：通过**。计划由不可变 doc 身份和 from/to 绑定，readonly/destroyed/非文字选区在缓存前拒绝；文档换成新对象但 from/to 不变会重算，过大拒绝后换回小文档也可恢复。子树预算为 WeakMap，不改变节点或正文；占位拟合只构造临时 Transaction，没有写入状态或 history。
- **R1：保持开放**。Mac WebKit 原生菜单焦点与丢失 mouseup 场景仍须 FINAL101 核对；本轮没有新 hover 根因或修复证据。
- **本轮无新增 blocking findings**。

### 独立运行与证据

1. `node scripts/verification/check-table95-independent.mjs --expect-fixed`：原 35,000 非空 cell 故障现在 capability=false、conversion=false，节点仍为 3，doc/selection/undo 不变；原有 hardBreak、表内拒绝、过时原结构保护继续通过。当前提交元数据和结果见 `artifacts/table95-independent/recheck-result.json` / `recheck-module.log`。审查脚本修正为读取真实 Git 提交，并将复审结果单独输出，防止继续标成旧 `7e047e08`。
2. 新增并运行 `node scripts/verification/check-table95-budget-independent.mjs`：5 项边界通过——同选区偏移文档变更使缓存失效、过大拒绝后缩小恢复、列表内真实 PM 拟合保留外部文字及单次 Undo/Redo、深度恰好64允许/65无状态变化拒绝、readonly 不复用旧允许计划。见 `budget-recheck-result.json` / `budget-recheck.log`。初次脚本用新构建 doc 而非 Transaction.doc 创建选区，被 PM 正确拒绝；修正测试选区所属文档后通过，产品未改。
3. 独立执行 `node scripts/check-editor-actions.mjs` 通过：实际 schema 96 项与现有生产命令测试，含作者新增恰好100,000节点允许、100,001拒绝、未选周围节点、ragged padding、真实来源结构/格内 Tab、拒绝 EditorState/history 不变、100次能力查询仅1次常量占位创建。见 `editor-recheck.log`。这些容量断言作者已编写，本轮独立运行；额外5项为审查人另写。
4. `git diff --check` 通过。未重跑全套浏览器/构建；本次修正仅 editor-actions 的预算与缓存，上一节真实 App 菜单证据仍按其原范围保存。

### 复审结论

**pass（源码整合）**。F1 已关闭，可以合入 TABLE95 的源码改动并开始 SESSION96。R1 与最终真实双端/保存/原生 hover 验证仍在 FINAL101；不据此宣称用户连续悬停高亮已修复或完整 modernization 目标完成。
