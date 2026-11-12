# 表格行列操作与原生图标裁切修复

2026-11-07，接续桌面密度与字号设置。最终本机产物位于 `artifacts/table-controls/release/`。

## 本轮行为

- 进入表格单元格后，在当前列上方和当前行左侧显示省略号标记。
- 点击标记选择整行或整列，显示琥珀色框线、圆形标记及下拉箭头。下拉菜单提供上/下插入行、左/右插入列和删除选中行列。
- 插入、删除使用真实 ProseMirror CellSelection 与表格命令。最后一行/列的删除会移除该表格；支持一次撤销和重做。导入的合并单元格按实际逻辑跨度选择。
- 表格控件位于 contenteditable 外，不参与文档序列化。支持滚动/窗口/字号变化后重新定位、菜单方向键导航、Escape 关闭、点击正文或外部关闭、只读时隐藏。
- 原生 macOS 顶栏与浏览器顶栏的录音、标签按钮只显示图标；保留辅助功能名称、悬停提示及溢出菜单名称。

## 裁切原因与修复

实际 macOS WKWebView 窗口使用 layer backing。之前仅对 NSImage 配置 SF Symbol 点数，而 NSButton 自身缺少对应的 symbolConfiguration，导致 AppKit 依据按钮默认字体度量排布符号，在小字号下裁切。现在每个按钮显式设置同档位字体、symbolConfiguration 与等比例缩放。

此前非 layer-backed 离屏测试未复现该问题。本轮原生渲染测试开启 layer backing，并比较按钮内实际像素范围与直接绘制的 SF Symbol 参考范围，而不只检查按钮外框。

## 验证

- `pnpm test:table-controls`：隔离 Chrome 中挂载生产 NoteEditor，检查四向插入、行列删除、最后一行删除、一次撤销/重做、其他正文与表格保留、合并列跨度、菜单键盘交互、表格切换、滚动、五档编辑字号及只读隐藏。证据在 `artifacts/table-controls/result.json` 与 PNG。
- `pnpm test:editor`：96 个 schema 文档用例及表格转文本、选区、撤销/重做回归通过。
- `pnpm test:native-toolbar`：20 项协议/状态回归通过。
- 原生图标测试：40 个五档字号×四种宽度×双色主题主场景、160 个其他布局场景、64 次保留控件的字号切换通过；主场景提供 1×/2× 渲染，图标像素范围断言覆盖主场景与切换。证据在 `artifacts/icon-clipping/native/`。
- 修复前 layer-backed 基线能复现小档裁切，保留在 `artifacts/icon-clipping/layered-baseline/`；真实应用修复前截图为 `artifacts/icon-clipping/before-small.png`。
- 实际应用中已完成两组各五档的独立界面/编辑字号截图，并恢复到原始中/中设置。证据在 `artifacts/icon-clipping/live-cases.json`。

验证范围区分：浏览器测试使用合成文档，不写用户笔记；原生图标测试使用隔离 AppKit 窗口。真实应用截图另行保存。没有重新生成 Android APK，也不声称已经完成所有原版行为或逐像素认证。

## 最终桌面核对与产物

最新 release 应用在真实 macOS 窗口中完成单元格标记、整列选中、行/列下拉菜单检查；菜单检查仅选择，不执行用户笔记的插入或删除。五档界面字号已在最终应用重新切换并截图，随后确认恢复界面中/编辑器中，见 `artifacts/table-controls/live-cases.json`。

- 工具栏五档实际截图对比：`artifacts/table-controls/toolbar-five-sizes.png`。
- 编辑器五档实际截图对比（图标调整前采集，编辑字号行为未改变）：`artifacts/table-controls/editor-five-sizes.png`。
- 表格实际应用截图：`desktop-table-handles.png`、`desktop-column-selected.png`、`desktop-column-menu.png`、`desktop-row-menu.png`。
- TypeScript/Vite 与 macOS release 构建通过。最终应用副本使用现有 entitlements 进行本机 ad-hoc 签名，通过严格校验；ZIP 解压后签名复检与主程序/Info.plist 哈希比较通过。
- 最终包：`artifacts/table-controls/release/CyberNote.app` / `CyberNote-macOS.zip`；对应源码、前端及包摘要在 `manifest.json`。本机 ad-hoc 包未经 Developer ID 公证。
