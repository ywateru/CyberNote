---
id: app-001-sidebar-drag-selection08
scope: resize-handle-pointer-default-selection
status: in-progress
---

## 问题与契约

用户要求桌面侧栏与原版相同。Mac07已实际通过隐藏/直接恢复/动态菜单/正常冷启，但准确包运行19拖动产生footer文字选区、20回拖产生日期和列表文字选区。原始失败保持在verification/mac-list-heading07-runtime-01，176项独核与runtime-analysis分别记录；不能以宽度移动成功冒充完整拖动体验。

当前src/App.tsx的ResizeHandle起始事件只设置drag及pointer capture，未阻止默认鼠标文字选择。依据ui/macos.md末节，仅在该起始事件抑制默认选择，保留原drag/clientX/min/max/change/end与对象/正文选区。不要改其他鼠标入口、全局user-select、正文数据、导航、原生工具栏或依赖；本批只允许产品src/App.tsx最小变更。不要附带重写cancel/capture/多指生命周期。

## 验证与交付

作者复用已有真实生产ResizeHandle/App组件检查：起始事件的默认选择被取消，原宽度变化与上下限/结束回调仍准确；不得只grep一行源码宣称运行通过。必要pnpm build；不写镜像实现的测试，不扩张大套件。作者STOP后另一作者独审，随后准确commit/freeze/Mac-only build/核包，再root Computer Use实际拖动往返，确认无新增界面文字选择、正文保持且按钮/菜单恢复仍在。若只能受控事件证明defaultPrevented，应明确真实浏览器默认选字仍待正式新包。Android不重建。

root负责GUI和文档，agent不GUI/ADB/共享target构建/stage/commit；正式平台build另行明确授权。源fixture与准确包证据分开；失败原样保存。

## 源码交付门槛

作者唯一App.tsx SHA fc5a7eba1c5a43e4f05b99142c6fc5deb35554b2e71a9b243127ba1020967894；不同作者只读重放baseline/candidate完整生产组件与两个真实App JSX入口，输出同作者，SOURCE-READY。CSS/native逐字节同HEAD。作者pnpm build exit0；受控事件未宣称真实浏览器选字或正文既有选区。独审封存后进入准确commit/freeze/Mac-only build，最后root Computer Use验收。
