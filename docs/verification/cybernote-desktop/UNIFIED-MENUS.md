# 统一菜单、图片选择与浮动预览验证

2026-11-07。对应本轮桌面版交互修改。

## 交付行为

- 图片单击建立编辑器节点选区，显示强调边框；双击或菜单中的“快速查看附件”打开预览。选中后仍可正常转到文字、表格并继续编辑。
- 顶部、溢出工具、备忘录、文件夹、附件、表格行列菜单统一经过 `MenuSurface` / `MenuItem`。Mac 使用平台适配器，与现有顶部菜单共用 AppKit 条目构建器；其他平台共用 Web 菜单组件。格式控件面板保留其专用布局。
- 附件右键菜单和预览不会隐藏、禁用顶部工具栏。
- 图片预览是主应用窗口内的浮动面板，可拖动、放大和还原，没有遮罩或焦点陷阱。可同时操作主界面、切换备注；预览继续显示原附件，保存和系统打开操作也作用于原附件。
- 列表右侧显示备注首个有效图片附件的缩略图，包括 SVG。缩略图按可见范围加载，沿用附件授权与资源释放规则。
- “置顶”分组标题展开后保持普通状态，仍可正常折叠。备注条目本身的选中样式继续保留。

## 原因与实现

工具栏消失源于附件菜单、预览与需要阻断编辑的模态界面共用 overlay 状态。已拆除该状态耦合；偏好设置等真实模态界面继续保留保护行为。“置顶”标题持续黄色源于统一按钮样式把所有 `aria-expanded=true` 都当成菜单选中态，现将该样式限定为菜单触发按钮。

共用菜单提供材质、圆角、分隔线、行高、图标、禁用态、键盘导航、外部关闭和边缘避让。Web 菜单挂到应用根部，避免父级裁剪。Mac 接口检查窗口归属、请求 UUID、坐标、条目数量和文本范围，只返回选择索引；React 保留原动作及权限检查。目标变化、卸载时取消菜单跟踪，过期回复不能执行。原生条目选中后明确取消 tracking，避免辅助功能触发后菜单仍停留。

图片选择使用真实的 ProseMirror `NodeSelection`，焦点交给编辑器 view，避免附件容器获取焦点后影响后续单元格或文字点击。预览持有独立媒体租约，原节点随备注切换卸载时不会撤销其图片 URL；最后一个租约释放才回收资源。原附件授权失效、删除或引用移除时，预览与缩略图仍会及时清除。

## 自动化证据

本轮输出目录为 `artifacts/unified-menus/`。以下均已通过：

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| 附件与主界面集成 | 14 组；图片选择、SVG 缩略图、拖动、跨备注、预览同时编辑/撤销、原附件动作、剪贴板与异步竞态 | [browser/result.json](../../../artifacts/unified-menus/browser/result.json) |
| 主题及字号 | 明暗两主题 × 五字号 × 四类菜单；材质、行样式相同，视口内可用 | [matrix/result.json](../../../artifacts/unified-menus/matrix/result.json) |
| 原生适配器前端 | 5 组；语义条目、坐标、返回动作、卸载取消、过期回复 | [native-client/result.json](../../../artifacts/unified-menus/native-client/result.json) |
| AppKit 菜单实现 | 8 组；构建、选择自动退出跟踪、取消、跨窗口隔离、资源清理 | [native/result.log](../../../artifacts/unified-menus/native/result.log) |
| 插件 Rust | 28 项通过 | [plugin-tests.log](../../../artifacts/unified-menus/plugin-tests.log) |
| 原生工具栏控制器 | 22 项通过 | [toolbar-tests.log](../../../artifacts/unified-menus/toolbar-tests.log) |
| 编辑器 | 96 个文档用例及状态、历史检查 | [editor-tests.log](../../../artifacts/unified-menus/editor-tests.log) |
| 预览回归 | 26 项；小窗口、长文件名、焦点、导出结果、资源释放与同步保护 | [preview-regression/suite.json](../../../artifacts/unified-menus/preview-regression/suite.json) |
| 媒体生命周期 | 独立控制器、最后租约回收、重复清理、失效租约拒绝 | [media-lifetimes.log](../../../artifacts/unified-menus/media-lifetimes.log) |
| 按钮反馈 | 实际 App 交互检查通过 | [feedback/result.json](../../../artifacts/unified-menus/feedback/result.json) |
| 原生外观 | 40 个主要情况、160 个布局、64 个密度切换，0 失败 | [native-appearance/native-check.json](../../../artifacts/unified-menus/native-appearance/native-check.json) |
| 构建 | TypeScript、Vite、macOS release bundle 成功 | [mac-build.log](../../../artifacts/unified-menus/mac-build.log) |

浏览器测试采用隔离的协议数据与模拟系统边界；AppKit 测试使用独立窗口。没有把它们作为真实存储、系统剪贴板或麦克风的替代证明。本轮没有重新执行主程序完整 Rust 测试套件。

## 最终 Mac 包界面核对

直接运行最终签名交付包，在既有 `QA 独立验证` 合成测试备注中进行只读操作。确认图片单击选中、真实系统右键菜单、顶部按钮保留、菜单选择自动关闭、预览拖动、跨备注保留、顶部菜单与预览共存、列表缩略图和普通置顶标题。没有修改备注、置顶状态或使用系统剪贴板、录音。

- [核对记录](../../../artifacts/unified-menus/native-ui/result.json)
- [图片选中与列表缩略图](../../../artifacts/unified-menus/native-ui/image-selection.png)
- [实际附件系统菜单](../../../artifacts/unified-menus/native-ui/attachment-system-menu.png)
- [拖动后的预览与另一篇备注](../../../artifacts/unified-menus/native-ui/floating-preview-note-switch.png)

本轮证明范围为桌面菜单及上述交互；没有宣称全部页面像素完全一致或覆盖 Android。浮动预览限制在主应用窗口内，不是独立的操作系统窗口。

## 可运行包

- [CyberNote.app](../../../artifacts/unified-menus/release/CyberNote.app)
- [CyberNote-macOS.zip](../../../artifacts/unified-menus/release/CyberNote-macOS.zip)
- [manifest.json](../../../artifacts/unified-menus/release/manifest.json)
- [SHA256SUMS](../../../artifacts/unified-menus/release/SHA256SUMS)

使用现有项目 entitlements 本地 ad-hoc 签名，未做 Developer ID 公证。ZIP 解压后再次检查严格签名及包内文件哈希；来源、前端资产和归档摘要记录在 manifest 中。
