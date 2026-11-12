---
id: app-table-interactions95
scope: editor-table
status: done
depends-on: []
---

## objective

完成 docs/ui/table-editing.md 的表格交互更新：修复鼠标移动导致连续表格区域高亮；所选文字转表格并支持现有转换文本往返；省略号一次点击选中且打开菜单。

## context

- docs/ui/table-editing.md（本轮用户要求）
- docs/architecture.md 的表格转文本、选区、历史与访问边界
- docs/verification/cybernote-desktop/TABLES-AND-ICONS.md（旧交互证据）
- docs/plan/cybernote-modernization-state.md（完整目标，不得将本任务通过视为全目标完成）

## path

src/TableControls.tsx、src/editor-actions.ts、src/Editor.tsx、src/App.tsx 的表格菜单/处理器接线、src/native-toolbar-state.ts、src/native-toolbar.ts 及需要的原生菜单命令类型、表格相关 CSS、scripts/check-table-controls-browser.mjs、scripts/check-editor-actions.mjs 和必要的表格 App 接线测试。只修改必要路径；其他既有功能保留。

## verification

- 从当前生产 DOM/CSS 复现悬停高亮并记录明确原因，再修复。不能只删掉所有选区样式来掩盖问题。
- 使用真实 Editor 的文本/表格命令测试及真实 App Web/原生意图测试。单次 Undo/Redo，转换块周围正文、其他表格、持久保存重载和权限边界。
- `pnpm build`、`pnpm test:editor`、表格专项、原生工具栏相关回归；不在此任务重复 native 打包。
- 提交到隔离分支供独立 verify agent 检查，记录 commit 与测试结论。不得改主工作区或重置用户的既有改动。

## develop handoff — 2026-11-09

- 基线 `00f2847e`，隔离工作区 `/private/tmp/cybernote-modernization`；实现所选文字转表格、刚转换完整块的来源结构往返、一步 Undo/Redo、单击 dots 选中并立即打开统一菜单、Web/Mac 命令与能力投影。
- 菜单操作核对当前文档的 table 节点与 CellSelection 所属表格，过时几何位置不能修改其他表格。增加无段落间隔的相邻表格，以及菜单关闭后鼠标跨单元格/边缘移动回归。
- **hover 范围未宣称修复**：生产 App Chrome 中心/边缘 hover 都没有创建或扩大 CellSelection；无表格祖先 role/button 反馈污染。边缘可见的是既有列宽调整 `.column-resize-handle`（每行一个）的正常黄色边线，不能据此认定用户报告的连续区域选中根因。保留原有 resize/真实选区样式，无未经实证的 pointermove 阻断。最终 Mac WebKit 原生菜单焦点与丢失 mouseup 场景待独立实包复核。
- 可重复检查：`pnpm build`、`pnpm test:editor`、`pnpm test:native-toolbar`、环境变量指定 Chrome/Playwright 的 `pnpm test:table-controls`、`node scripts/check-table-interactions95.mjs`、`node scripts/check-native-menu-browser.mjs`。App 专项覆盖真实 DOM Range、Web/模拟原生意图、菜单能力、前后正文、空单元格、单次 Undo/Redo、保存 ACK 后重载、往返、锁定拒绝与旧原生意图导航后拒绝。
- 证据位于 `artifacts/table95/`（App 结果/截图在 `app/`；生产 hover 采样为 `hover-before.json` / `edge-hover-before.json` 与同名截图）；表格控件截图在 `artifacts/table-controls/`。这些是 Chrome 与隔离模拟 Store/IPC 证据，不能替代真实 Mac AppKit/WebKit/Store 验证。
- 当前为开发交付，待独立 verify；TABLE95 与完整 modernization 目标均未因本说明标记完成。

## F1 develop follow-up — 2026-11-09

- 依据独审 `ea7c56fc`：能力与执行共用转换计划，按 Rust `store/archive/document.rs` 的整文档 100,000 节点、root depth 0 / 最大深度 64 和表格逻辑网格预算判断。使用常量大小占位 table 的真实 PM 替换拟合周围结构，合入生成表格实际 row/cell/paragraph/非空 text 数；原始往返使用来源 table 的真实结构预算。执行还在 dispatch 前核对生成文档预算。
- 能力计划按 immutable doc / from / to 缓存；未变子树预算用 WeakMap 复用。重复 UI 能力查询不构造完整表格。原始 cell 内 Tab 不作为往返结构的新列计数；普通文本仍按 Tab/LF 解析。后端 live validator 对正文 text 的约束为非空，无额外 text 字节上限；本转换不增加正文文字，不引入任意前端文字上限。
- 新增真实 PM 回归：35,000 非空 cell 拒绝、ragged 空格补齐、未选周围节点、恰好 100,000 允许 / 超一个节点拒绝、深度、真实来源超限拒绝、来源格内大量 Tab 精确恢复、拒绝保留整个 EditorState / selection / Undo/Redo；100 次相同能力查询只构造 1 个常量占位 table。
- 作者已执行 `node scripts/verification/check-table95-independent.mjs --expect-fixed`（通过；不作为独立复审结论）、`pnpm test:editor`、`node scripts/check-table-interactions95.mjs`、`pnpm test:native-toolbar`、`pnpm build` 与 `git diff --check`。证据在 `artifacts/table95/{independent,editor,app,native-toolbar,build}-f1.log`。待独立复审 F1；R1 原生 hover 门槛保持开放。
