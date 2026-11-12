# 附件画廊与定位备忘录

2026-11-08，当前源码及前端构建通过验证。本轮没有重新生成 macOS / Android 安装包，没有恢复体积较大的 Rust 构建缓存。

规格见[附件画廊](../../ui/attachment-gallery.md)。主要行为是从文件夹附件画廊选择图片或录音，跳转到所属备忘录中的确切附件，而非仅打开备忘录标题或弹出图片预览。

## 验证结果

- `pnpm build`：TypeScript 和 Vite 生产构建通过。
- `pnpm test:attachment-gallery`：桌面 24 项、macOS 原生投影 5 项、移动浏览器 4 项，共 33 项通过，无未捕获浏览器错误。
- `pnpm test:native-toolbar`：22 项既有控制器回归通过。

覆盖真实 App、编辑器和附件桥接逻辑，使用隔离合成工作区和测试媒体，不读取实际用户笔记。macOS 检查模拟原生 IPC，不等同于本轮重新运行了 AppKit 安装包；移动端为浏览器布局和导航验证。

关键检查包括：SVG 缩略图、单击选中、跨备忘录浮动预览、深处附件选中及滚动、录音试听、离开后实际暂停并清空媒体源、原文件导出、文件名搜索、文件夹范围、内部/孤立/已删除/锁定附件排除、分类键盘导航、Escape 退出、权限 prepare 同步隐藏媒体和关闭旧菜单、原生“查看附件”命令及选中投影。

## 证据

产物位于 `artifacts/attachment-gallery/`：

- `desktop-result.json`、`native-result.json`、`mobile-result.json`
- `photos-desktop.png`、`audio-desktop.png`、`context-menu.png`
- `located-note.png`、`dark-desktop.png`、`photos-mobile.png`

测试过程中修正了两处问题：NodeView 选区更新会覆盖手工 CSS 类，现改用独立属性保留高亮；附件名匹配时原先会列出所属备忘录内的全部附件，现按附件再次过滤。长文中的图片后续加载也会改变目标位置，现对短暂定位窗口内的布局变化重新居中，并在用户开始操作时停止跟随。
