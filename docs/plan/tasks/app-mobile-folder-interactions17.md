---
id: app-mobile-folder-interactions17
scope: Visible mobile smart-form rejection and nonselectable folder controls
status: source-review-pass
priority: P2
depends-on: [app-smart-draft-hydration16]
---

## Objective

修复准确Android05实际运行发现的两处交互缺陷：空标签确认被拒绝后，错误反馈位于长面板末尾，当前视口不可见；长按文件夹显示菜单时，底层名称同时出现系统选字与把手。继续既有明确错误及目录控件不误选文字的契约，不新增业务能力，也不将工程错误呈现认定为iPhone原版已证样式。

## Context

- docs/INDEX.md
- docs/ui/smart-folders-mobile.md（末尾运行缺陷契约）
- docs/verification/android-smart-u-runtime09/RUNTIME.md，第11/12和26截图
- docs/verification/android-smart-u-runtime09-independent/README.md，F2/F3
- docs/plan/tasks/app-smart-draft-hydration16.md

## Path and ownership

仅在task16独审STOP并整合后修改。候选产品路径src/SmartFolderForm.tsx、src/smart-folders.css、src/style.css；若需触及App.tsx事件处理，先给出证据和最小理由再由root确定。保持geometry15、hydration16、编辑器正文选择、保存/CAS/取消语义和查询不变。作者仅写本任务任务状态及docs/verification/app-mobile-folder-interactions17/，root维护公共布局/计划。

## Contract

```text
过滤条件面板
[取消]           过滤条件            [确认]
[可见的错误反馈：至少一个标签…]  ← 非法确认后立即可见
[组合条件 / 已启用 / 其他条件]     ← 草稿仍在

文件夹行长按 → 目录菜单
              底层名称无文字选区/把手
编辑器正文长按 → 保持文字选择能力
```

错误无论面板原在顶部或滚动后，都必须显示在当前视口可读位置，保留当前草稿，无onSave、无隐式确认或关闭。选择合法条件后可再次正常确认；取消仍恢复上层草稿；名字页保存错误也应可见。无错误时不引入多余空占位，不改正常页面几何；短屏/窄屏不遮住取消/确认。只保留一个可访问alert，避免重复播报。可以用实际滚动到可见错误等最小方案，需验证真实渲染。

目录不允许选中名称文字；普通点击导航、长按打开正确目录菜单、点外关闭继续有效。只限定目录控件，不能给整个body或编辑器禁用选字；不添加阻止整个页面触摸/滚动的事件。当前无法证明原版长按时间或完整动画，无像素通过结论。

## Verification

使用生产组件和样式，已有本机依赖与自有隔离夹具，不下载/清理共享缓存。保留修复前实际失败证据，覆盖实际高度长列表、滚动后非法确认、短视口、合法重试/取消、名称页错误；检查alert边界在视口内且控件可点。生产folder-row至少验证选择样式继承和正文仍可选，并复核真实事件链；设备长按最终由root ADB完成。typecheck及受影响契约检查。源码准备后STOP，独立作者审查。不得平台构建/共享target/GUI/ADB/数据库/原版删除/Git。本任务新包实际移动验收完成之前仅source-review-pass，不能done。

## Author handoff

2026-11-05 SOURCE-READY STOP。唯一产品路径为SmartFolderForm.tsx、smart-folders.css、style.css；App.tsx与hydration16适配器未改。作者以生产React、全量CSS及App真实folderRow/touch timer/scrim片段检查71项断言全部通过；同一最终夹具加载归档修复前源时15项失败。长列表、滚动、390×844/390×360/280×240、合法重试取消、名字页、选择样式和受控事件链已覆盖，正常几何前后相同，typecheck通过。详见[作者证据](../../verification/app-mobile-folder-interactions17/README.md)。尚未独审或运行准确新包，不是设备/原版像素通过。

## Source acceptance

root接受作者前71项15失败、后71通过及不同作者独立71通过；独审37固定输入保持，原失败留档。root核13项独立索引全部SHA匹配，索引60d21eacb14a0a8da58264ddb2115c23afe493a03955b79db360232d5a8931f9。仅三个UI文件，App/16保持；准确Android系统长按及新包设备反馈仍待18验收，不将受控样本认定为完整Editor或原版像素。
