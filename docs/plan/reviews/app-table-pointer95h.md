# TABLE95H 独立审查

2026-11-09。审查人 `/root/table95_verify`，非开发作者。范围 `7979bca9989a284b5144fd7de150bc4bb37eb838..0c11fc0cfe88d5792bfa15b35a874556bc3cf0a7`。审查树 `/private/tmp/cybernote-table-pointer`，开始时 clean。依据 `docs/plan/tasks/app-table-pointer95h.md` 与 `docs/ui/table-editing.md`，阅读开发报告和完整 diff；本轮不修改产品源码、不 native build/ADB。

## Findings

未发现新的 blocking 或需要另行记录的 non-blocking 代码问题。

现有 TABLE95 R1 继续开放：最终 Mac WebKit/AppKit 原生菜单、失焦或触摸板现场是否出现同一鼠标释放丢失，以及实包下的行为，仍由 FINAL101 验证。这不是本次新增代码缺陷；不能把下述 Chrome 受控因果复现称为已确认用户 Mac 现场根因。

## 因果独立复验

审查人在独立基线树 `/private/tmp/cybernote-table-pointer95h-before-review` 检出准确的 `7979bca9` 生产源码，复制开发的浏览器验证脚本作为测试夹具（不是复制修复），与当前修正树分别运行：

- 基线：`TABLE_POINTER_OUTPUT=/private/tmp/cybernote-table-pointer/artifacts/table-pointer95h/independent-before node scripts/verification/check-table-pointer95h.mjs --expect-leak`。
- 修正：`TABLE_POINTER_OUTPUT=artifacts/table-pointer95h/independent-after node scripts/verification/check-table-pointer95h.mjs`。

两者均实际渲染生产 NoteEditor，经真实 createEditorExtensions 使用已安装的 prosemirror-tables；不直接构造 CellSelection。故障注入只在 window capture 吞一次可信 mouseup，后续鼠标移动保持真实浏览器输入。

| 观测 | 基线 | 修正 |
| --- | --- | --- |
| 按住左键跨两格 | 2格，anchor27/head45 | 2格，anchor27/head45 |
| 可信 mouseup 被明确吞掉 | 保持2格，tableDrag27 | 保持2格，tableDrag27 |
| 后续可信 buttons=0 移动 | 扩到9格，head175，tableDrag27 | 保持2格，head45，tableDrag null |
| 相邻表选中数 | 0 | 0 |
| doc / undoDepth | 保持原文档 / 0 | 保持原文档 / 0 |

正常释放对照在两个版本都不扩选。基线结果记录准确 source `7979bca9989a284b5144fd7de150bc4bb37eb838`，修正结果记录 `0c11fc0cfe88d5792bfa15b35a874556bc3cf0a7`。这证明一个明确的上游监听生命周期缺口及修正覆盖它；没有依赖截图颜色判断。

基线首次冷缓存启动遇到 React useRef null，未进入编辑器；同一未改生产源码与脚本的暖缓存重跑通过。首次 `independent-before/failure.json` 保留，不将测试环境失败当产品故障。额外基线树及只读 node_modules symlink 留给父代理统一管理。

## 修复范围与公开接口

- `src/editor-schema.ts:18`、`:135` 将真实插件接入生产 extension factory；不是独立测试专用 factory。`scripts/check-editor-schema.mjs` 的新增手工转译/相对 import 适配只维持既有 DOM-free schema 检查入口，没有替换业务断言。
- `src/table-pointer-lifecycle.ts:16` 仅在当前可编辑且存活 Editor 的表格 cell 左键、非 Ctrl/Meta 开始记录；`:26` 保留列宽调整自己的 active handle 路径。普通无会话 hover 无保护监听及合成事件。
- `:33` 先移除当前会话的 window/root 临时监听并清空 release，`:46` 再向原 root 发公开 mouseup，由上游公开 stop 处理自身的 move/stop 闭包和 plugin state。未读写私有 input 字段，未直接改 selection、doc、history 或样式。
- `:55` 的 window capture 只检查这次已记录会话的左键是否仍按住；没有 preventDefault/stopPropagation，也没有全局屏蔽 move。blur、pointercancel、readonly 和 destroy 取消同一会话；`:72` 明确移除持久 mousedown。
- 上游当前 `prosemirror-tables@1.8.5` 的 mouse selection move 不检查 buttons，而 root mouseup/dragstart 的 stop 会移除闭包并清 plugin state，与上述受控复现和修正机制一致。此为源码及实测对应，不扩展为 Mac 现场断言。

## 针对性独立验证

审查人执行开发的专项脚本，修正后 **13 组通过**：正常拖选与 Shift 扩选、纯移动/相邻表、首格前丢失释放、blur/cancel、readonly、destroy、原生正文文字拖选、实际列宽拖动及 Undo、行列 dots 与统一菜单/Escape、可信右键事件、表内键盘。这里明确是独立运行开发脚本，不称为新编写 13 组。

另编写并运行 `node scripts/verification/check-table-pointer95h-independent.mjs`，使用真实 App、生产 Editor 和隔离 backend，**6 项通过**：

1. 纯移动不注册会话监听，不合成终止事件。
2. 正常释放后 window guard 与 document drag 临时监听归零，无合成 mouseup，doc/undoDepth 不变。
3. 明确丢失可信释放后，后续移动不改原选区，双方临时监听归零，doc/undoDepth 不变。
4. 终止仅产生一次非可信 root-target/buttons=0 mouseup，继续 idle 移动不重复。
5. readonly 转换结束双方临时监听、仅产生一次相应终止事件且不写历史。
6. 通过真实 App 切笔记销毁正在拖动的旧 Editor，旧实例确认 destroyed，双方临时监听全部归零；浏览器无异常。

新增脚本初次读取 history 的 raw node_modules 模块被浏览器拒绝 bare import，改用 Vite 已解析模块入口；另一次误把新 Editor 正常登记的 window dragstart 也纳入本插件所有权，现按插件及上游实际负责的 window/root 事件分别计数。均为测试夹具修正，未改产品代码或放宽应验证的监听集合。

独立证据：`artifacts/table-pointer95h/independent-before/result.json`、`independent-after/result.json` 与对应截图；`artifacts/table-pointer95h/independent-boundaries/result.json`。运行日志 `/private/tmp/table-pointer95h-independent-{before,after,boundaries}.log`。三个有效运行均正常清理、退出 0。

开发者已报告的 schema96/editor/table-controls/build 仅只读核对，本轮没有重复全量或原生构建。新增独立 App 测试的 IPC 为隔离 backend，不能用于宣称 Rust 持久保存或系统输入已通过。

## 结论

**pass（源码整合）**。本修正满足已受控复现的丢失释放生命周期契约，正常编辑/菜单/历史行为没有发现回归，可以整合。TABLE95 R1 的真实 Mac 原生现场门槛继续 FINAL101。
