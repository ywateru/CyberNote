---
id: app-mac-feedback77
scope: mac-sidebar-context-menu-search-highlights
status: done
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

# 独审首轮门槛 / 2026-11-06

冻结806d3432的首轮独审确认两项blocking：snippet-text的flex/gap在拆分高亮span后人为增加两处4px空隙（「甲乙搜索丙丁」78→86px）；220px列表远中文摘要首命中「索」落在clip外。要求保持连续文字排版并在最窄合法列表宽度展示首命中，不能只检textContent或节点存在。

完整all另连续两次止于旧contract100ms超时断言，尚未执行产品组。真实state读取在截止前未返回时，TIMEOUT可以不含lastState；不允许制造状态或移除deadline以刷绿。准许在本任务一并修正测试假设：分别验证真实App异步false及已取得状态的保留、慢首次transport的无状态超时，并保留late true/never/stalled transport截止验证。旧失败按身份保留，重新冻结后独审与主线完整回归。

# completion / 2026-11-06

三处修正限定范围已完成。首版806d3432经独审发现两项真实布局blocking，修复产品e760ece7、最终runner f7b3c944，经[独立复审](../reviews/app-mac-feedback77-recheck.md)a09bb916为PASS/SOURCE-READY。独立51项真实App/DOM/字符Range/PNG与6项截止场景自然exit0；原blocked和失败证据全部保留。

主线c0b368ae合入后[六命令串行整合](../../verification/mac-feedback77/integration/README.md)全部自然exit0：桌面148、手机笔记9/录音43/附件43、build及production排除；89输入指纹b4d046b7…521182a前后不变、pageErrors空。修复Flex字距与220px命中裁切，未修改runtime超时算法/生产Rust/依赖/锁文件。

[Mac22本地开发包](../../verification/mac-feedback77/native-build/README.md)已生成，准确当前主线离线构建、279输入不变，派生本地adhoc严格签名通过。真实WKWebView/整体像素仍开放；Android原生76继续ready，原13秒录音现场不动。此done仅关闭用户本次三处修正及命令验收，不关闭跨端全目标。

Mac22独立核包`7d179a40`为PASS-PACKAGE-IDENTITY，三份实际内嵌JS/CSS资源逐字节等dist，HTML序列化token等价；严格签名/ZIP/279源码身份核对通过。当前任务worktree/分支已清理，正式证据和原始失败保留。
