---
id: app-001-sidebar-drag-selection08
scope: resize-handle-pointer-default-selection
status: done-limited-sidebar-fix
---

## 问题与契约

用户要求桌面侧栏与原版相同。Mac07已实际通过隐藏/直接恢复/动态菜单/正常冷启，但准确包运行19拖动产生footer文字选区、20回拖产生日期和列表文字选区。原始失败保持在verification/mac-list-heading07-runtime-01，176项独核与runtime-analysis分别记录；不能以宽度移动成功冒充完整拖动体验。

当前src/App.tsx的ResizeHandle起始事件只设置drag及pointer capture，未阻止默认鼠标文字选择。依据ui/macos.md末节，仅在该起始事件抑制默认选择，保留原drag/clientX/min/max/change/end与对象/正文选区。不要改其他鼠标入口、全局user-select、正文数据、导航、原生工具栏或依赖；本批只允许产品src/App.tsx最小变更。不要附带重写cancel/capture/多指生命周期。

## 验证与交付

作者复用已有真实生产ResizeHandle/App组件检查：起始事件的默认选择被取消，原宽度变化与上下限/结束回调仍准确；不得只grep一行源码宣称运行通过。必要pnpm build；不写镜像实现的测试，不扩张大套件。作者STOP后另一作者独审，随后准确commit/freeze/Mac-only build/核包，再root Computer Use实际拖动往返，确认无新增界面文字选择、正文保持且按钮/菜单恢复仍在。若只能受控事件证明defaultPrevented，应明确真实浏览器默认选字仍待正式新包。Android不重建。

root负责GUI和文档，agent不GUI/ADB/共享target构建/stage/commit；正式平台build另行明确授权。源fixture与准确包证据分开；失败原样保存。

## 源码交付门槛

作者唯一App.tsx SHA fc5a7eba1c5a43e4f05b99142c6fc5deb35554b2e71a9b243127ba1020967894；不同作者只读重放baseline/candidate完整生产组件与两个真实App JSX入口，输出同作者，SOURCE-READY。CSS/native逐字节同HEAD。作者pnpm build exit0；受控事件未宣称真实浏览器选字或正文既有选区。独审封存后进入准确commit/freeze/Mac-only build，最后root Computer Use验收。

## 准确Mac08与实际运行

源码提交845f123ada626ef3fe3f8d78db6c2627c72f26ac；238产品聚合950788b2adc200aa17dc1c8f19de3b59deee1b8a413ad5e339fe68ea57162399，302输入聚合e813ca54e8a46b981db04d5b54eb344966d522c4761165cdda4fb6a3260355cc。freeze77a774c613cb2c2906b1e63f66166e32312c658136498112139529b19c3f8bd1；相对07仅App.tsx变化，工具/版本/环境/OCR/补充输入同。canonical Mac-only build exit0/60.623s、collect ready、15输入对照true；原strict失败保留，派生本地签名包strict通过。不同作者1004项产物检查PASS，manifest b44742511ef0acf8c2e222987d1b46972b305c5c55c5924c09b035ee5e7defd9。

新应用[mac-sealed.app](../../../artifacts/unified-candidate06/mac-sidebar-drag-build08/mac-attempt01/mac-sealed.app)，[ZIP](../../../artifacts/unified-candidate06/mac-sidebar-drag-build08/mac-attempt01/mac-sealed.zip)。exe SHA9de0996603eaa91d4185a85f462ae73e3adaa6c22b8320de339208622143b65b，ZIP SHAae9292fb4b1c9a1749e26005c84513823c2fdd16612608e332678cd7c7e5e21f。

root Computer Use准确PID4556→正常退出→4772同路径/同SHA。侧栏边界456→416→456px无07旧footer/list蓝选；正文ABCDE选区在侧栏及列表分隔线各往返保持；按钮/动态菜单两条恢复在初次和冷启后都成功，QA正文/7计数/14:19可见保持。45原始文件在[运行记录](../../verification/mac-sidebar-drag08-runtime-01/README.md)已STOP封存，不同作者独核有限PASS：45raw和5旧07参考/准确exe共51输入开关不变，18正常AX全文257码点/547B/SHA69fc53a7926291444f2a846074f92f625c945d997fa8e33c7c957038ff90cd82相同；07–11正文ABCDE选区精确保持，两条分隔线40px往返、无新增UI/footer蓝选，与旧07有蓝选正控分开。三份菜单仅AX的边界保持。见[实际记录独立复核](../../verification/mac-sidebar-drag08-runtime-independent-01/README.md)。本任务只关闭侧栏拖动误选范围。没有新编辑/DB导出/Android重建。本地签名非DeveloperID/公证；截图实际JPEG，标题笔画/灰度及总体功能/全像素目标仍open。

不同作者运行独核已STOP：18输出aggregate a6b781645e7735be38158d9dbd6b194c35173ffe5350b27898af9affe4114d1e；manifest SHA52e45de7b4d9d21dc7e605d2a73dab10ea1f8c11f81926c2e1715602c0dd8bbc。初始检查器误纳菜单.ax及探索语法失败均原样保留，只修检查器，不改原始记录或产品。该有限功能问题关闭，父级像素目标保持active。
