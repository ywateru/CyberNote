# TABLE95H 受控丢失 mouseup 调查与修复

2026-11-09。开发基线 `7979bca9989a284b5144fd7de150bc4bb37eb838`，隔离目录 `/private/tmp/cybernote-table-pointer`。此项仅完成 Chrome 中真实生产 Editor 的受控事件丢失复现与窄范围生命周期修复，等待不同代理独审。TABLE95 R1 的最终 Mac WebKit/AppKit 原生菜单/焦点现场仍由 FINAL101 验证；未宣称用户实际设备故障的根因已定位。

## 先复现，再改代码

测试直接渲染生产 `NoteEditor`，通过它的真实 `createEditorExtensions` 接线使用当前安装的 prosemirror-tables。没有复制选择算法、改选中CSS、直接设置 CellSelection 或模拟编辑器。只有鼠标松开传播故障是有意注入：window capture 拦截一次 Playwright 实际鼠标输入产生的 `mouseup`，记录 `isTrusted=true`、`buttons=0`，再让后续真实鼠标移动正常传播。

修复前命令：`node scripts/verification/check-table-pointer95h.mjs --expect-leak`。当时生产源码仍为基线，结果保存在 `artifacts/table-pointer95h/before/result.json` 与 `lost-mouseup.png`。

| 阶段 | PM Selection | tableEditingKey state | 当前表 selectedCell | 相邻表 selectedCell |
| --- | --- | --- | ---: | ---: |
| 按住左键拖过两格 | CellSelection anchor27/head45 | 27 | 2 | 0 |
| 一次明确丢失的 mouseup 后 | CellSelection anchor27/head45 | 27 | 2 | 0 |
| 后续可信 mousemove，buttons=0 | CellSelection anchor27/head175 | 27 | 9 | 0 |
| 对照：正常 mouseup 后移动 | 选区不变 | null | 选中格不增加 | 0 |

文档与 undoDepth 均未变化。证据记录 selection JSON、插件状态、各表 selectedCell、原始鼠标事件，而不只依赖黄色边框截图。上游 `handleMouseDown` 的 `move` 不检查 `buttons`；`stop` 由root的 `mouseup/dragstart` 触发。因此这次受控丢失会留下表格自己的 move 闭包，之后无键移动仍扩选。列宽调整是不同的上游监听流程，已有释放检查。

## 修复边界

新增 `src/table-pointer-lifecycle.ts`，仅通过 `editor-schema.ts` 的非文档插件接线。插件在可编辑、非Ctrl/Meta、左键按下的真实表格cell中记录一次鼠标会话；列宽resize handle使用自己的流程，不接管。仅在该会话后续移动已不再按住左键，或窗口blur、pointercancel、readonly切换、销毁时，向原root发送公开 `mouseup` 终止事件，让上游自行移除闭包并清空拖动插件状态。

终止事件的target是root而非cell，避免制造单元格点击。插件不直接改 selection、不写doc/history、不触碰 ProseMirror 私有input字段，也不preventDefault/stopPropagation鼠标移动。正常mouseup/dragstart在冒泡阶段清理插件自己的临时监听；若原始mouseup在此前被吞，保护仍保持有效。销毁时移除持久mousedown和全部临时监听。保留正常CellSelection与增强边框；修复的是失效会话继续扩选。

修复后相同输入下，可信 `buttons=0` 移动后仍为 anchor27/head45、2格；tableEditingKey已null。相邻表保持0格，doc/history不变。

`scripts/check-editor-schema.mjs` 仅追加新模块的手工转译与本地 `.mjs` import重写，确保既有DOM-free schema/commands脚本仍使用真实生产factory；未改原有业务断言。

## 针对性验证

最终 `node scripts/verification/check-table-pointer95h.mjs` **13组检查通过**，证据 `artifacts/table-pointer95h/after/result.json` 与 `lost-mouseup.png`：

1. 正常mouseup后移动不扩选；明确丢失mouseup后 `buttons=0` 不扩选。
2. 移动到相邻表不串选；未跨首格前丢失mouseup不会在之后hover创建CellSelection。
3. 正常按住左键跨格与Shift扩选仍可用。
4. blur/pointercancel结束上游拖动，document mousemove/mouseup/dragstart监听数回到起点，doc/history不变。事件取消后先真实松开，再验证纯移动；合成blur本身不冒充操作系统已释放鼠标。
5. readonly切换结束已有手势；销毁中取消手势，后续真实输入安全且上游root监听数归零。
6. 原生正文文本拖选仍产生非空TextSelection。
7. 真实列宽拖动保留，改变colwidth且可Undo恢复原文档。
8. 行/列dots一次选择并打开统一菜单，Escape键盘退出保留。
9. 右键仍产生可信contextmenu事件，不宣称headless浏览器系统菜单已被可视化或原生菜单已验。
10. 表内ArrowRight导航不修改文档。

开发角色另行运行的既有回归（不作为独立审查）：

- `scripts/check-table-controls-browser.mjs artifacts/table-pointer95h/controls-regression` 通过，覆盖插删行列、相邻表、merge、readonly控件、字体/scroll几何、菜单键盘、Undo/Redo。
- `scripts/check-editor-actions.mjs` 通过，真实schema96cases一致；生产命令/预算/转换/历史检查通过。非文档插件没有改变归档schema。
- `pnpm build` 通过，TypeScript及Vite生产构建完成；已有bundle>500kB提示保留，不扩大此次范围。
- `git diff --check` 通过。没有nativebuild、ADB、用户Store或依赖包修改。

日志位于 `/private/tmp/cybernote-table-pointer-before.log`、`-after.log`、`-controls.log`、`-editor.log`、`-build.log`。探索脚本的失败保留在各证据目录 `instrument-failures/`：初次fixture未处理onReady(null)、销毁后定位已移除DOM、把浏览器contextmenu误当ARIA menu，以及取消后物理左键仍按住的错误断言；均修正测量步骤，没有借此扩大生产改动或伪造通过。

## 剩余边界

真实Mac WebKit是否通过系统菜单/焦点切换丢失mouseup、原生触控板或菜单tracking的确切事件顺序，尚未现场复现。Chrome受控复现证明当前上游行为与本修复所覆盖的生命周期缺口，不能替代FINAL101实包现场。生产改动仅一个新插件和factory接线；未改App、Editor、TableControls、editor-actions、CSS、Session或native-toolbar。
