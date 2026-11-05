---
id: app-mac-feedback77
scope: mac-sidebar-context-menu-search-highlights
status: in-progress
depends-on: []
---

# objective

实现用户两张截图标注的Mac三处修正：去掉底部新建文件夹、列表右键菜单正确锚点、全局搜索标题与摘要高亮。先复现留证，再修正和独立复核。不扩散Android/录音/Store实现。

# context

- docs/INDEX.md、docs/ui/macos.md“用户截图修正77”、references/macos-feedback77/{README.md,manifest.json,*.png}
- docs/debugging.md、docs/testing.md、src/App.tsx和src/style.css
- docs/plan/tasks/app-001-search-results-01.md、app-001-search-focus-01.md

# path

src/App.tsx、src/style.css、必要最小展示/位置组件；scripts/debug必要Mac回归组或独立runner；docs/verification/mac-feedback77/、docs/debugging.md。不要修改生产Rust、依赖、锁文件、录音算法或手机样式。产品代码和证据提交分开。根保留任务/索引文档所有权。

# contract

严格遵循macos.md修正77。右键必须有真实位置证据（当前onContextMenu只setMenu而.menu-note固定右上角），不能只调用menu.open代替事件验证。约束菜单实际尺寸、resize后位置，保留正确context note及手机长按/工具栏更多。安全字面量高亮，正文内查找独立、锁态不泄漏。摘要命中远处也可见且不污染保存文档。底部移除仅Mac新建按钮，其余布局需对齐并回归合法新建入口。

# verification

开发在隔离分支完成并冻结提交，由另一agent独立审查。真实App命令/DOM事件/HTML/rect/PNG：中部与边缘右键、滚动、分栏与侧栏切换、画廊、目标笔记菜单操作及重开；标题/摘要重复匹配、大小写、中文、regex和HTML特殊字符、空query、正文find不同词、锁态及远处摘要。截图与原版参考只能做有限局部对照，不称整窗像素通过。

最低回归：pnpm build、production排除、桌面完整调试组100及新增项、手机notes9/recording43/attachments43。本次不触Rust边界，不需重编Rust/实机包。记录命令自然exit、完整wall、源码身份、pageErrors、失败原始证据。只操作合成隔离数据，不启动/操作原Android13秒现场，不做原版删除实验。不再询问常规运行许可。
