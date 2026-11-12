---
id: app-table-pointer95h
scope: table-pointer-lifecycle
status: done
depends-on: [app-table-interactions95]
---

## objective

调查 TABLE95 未复现的悬停连续高亮：在真实生产 Editor 中有控制地丢失 mouseup，确认后续 `buttons=0` 的普通移动是否仍创建/扩展 CellSelection。仅在复现后实施窄范围拖动生命周期修复；不能据源码假设称用户故障已定位。最终 Mac WebKit 实际路径仍由 FINAL101 核对。

## context

docs/ui/table-editing.md；docs/plan/reviews/app-table-interactions95.md 的 R1；当前安装的 prosemirror-tables mouse-selection `handleMouseDown/move/stop`（mousemove未检查buttons）与 column-resize（检查which）对照。该差异是调查线索，不是已证实根因。

## path

新增 src/table-pointer-lifecycle.ts（如复现才需要）、src/editor-schema.ts 的非文档插件接线、scripts/verification/check-table-pointer95h.mjs、任务与报告。不得修改 App.tsx、Editor.tsx、SESSION96模块、TableControls/editor-actions、共享CSS/选中样式或依赖包；仅操作独立工作树。

## verification

- 先留下修复前真实 Editor/DOM 证据：正常释放不延伸；一次明确拦截的mouseup后，物理输入已释放但真实mousemove buttons=0是否扩选。记录PM selection、tableEditing plugin状态和selectedCell，仅截图黄色线不算复现。
- 若复现，修复只在确切表格左键拖动会话已失效时终止上游监听/拖动状态；可复用上游公开DOM终止事件，不能访问私有input字段、抑制全部pointermove或删除CellSelection样式。窗口blur/cancel/卸载不留幽灵监听。
- 正常按住左键跨格选择、Shift选择、列宽resize、文本拖选、row/column dots菜单、上下文菜单与键盘均保留；无按键纯移动不创建/扩展CellSelection；相邻表格隔离；readonly与销毁安全，不写正文/history。
- 使用生产createEditorExtensions真实接线；有界独立浏览器测试与相关table/editor回归、build。未复现就交调查结果，不编写猜测性guard。
- 提交后不同代理独审；最终Mac WebKit/native菜单吞mouseup路径仍开放，不以Chrome受控失事件等同原设备实际复现。

## delivery

开发0c11fc0c，独立复审81b7ab83接受，按7979bca9..81b7ab83差异回填主目录。准确基线的受控可信mouseup丢失导致2格扩9格，修复后保持2格并清拖动状态；独立13组及6个监听/历史边界通过。主目录13组、editor/schema96和build通过。证据保存在artifacts/table-pointer95h；两个本阶段隔离工作树已清理，源码审查历史分支保留。Mac原设备路径仍由101核对。
