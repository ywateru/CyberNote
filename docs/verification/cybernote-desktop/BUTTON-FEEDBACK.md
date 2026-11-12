# 按钮反馈与备忘录切换

2026-11-07。macOS 原生工具栏、格式面板和网页按钮统一增加交互反馈，并修复切换备忘录时工具栏整体刷新的原因。

## 最终行为

- 文字按钮与图标按钮使用相同的反馈规则：悬停显示浅色圆角背景，按下加深，触发后保留约 180ms 的确认反馈，打开菜单或选中时显示琥珀色背景，禁用时淡化且不显示可点击反馈。
- 原生下拉菜单在 AppKit 保留 cell.highlighted 的情况下仍优先显示菜单打开状态；持久选中反馈由应用状态单独控制，避免将 AppKit 的瞬时 cell.state 误当成选中。网页选中按钮悬停时保留琥珀色并略微加深。
- 网页按钮保留键盘焦点轮廓并遵循减少动态效果设置。反馈监听只添加视觉标记，不拦截原操作，不改变编辑器焦点或选区。
- 原生格式弹出面板与普通下拉菜单在关闭时释放打开状态；录音、标签继续只显示图标，保留辅助功能名称和提示。

## 刷新原因与重构

原先每次原生状态更新都会重新生成 SF Symbol，重设按钮字体、图像、选中和可用状态，重建菜单并重新布局；布局过程中又先隐藏全部控件再显示。连只读的工具栏信息查询也会触发布局。切换编辑器的短暂中间状态可能先禁用再启用按钮，状态回执还会触发一次无实际展示变化的 React 更新。

现在复用按钮、图像和相同的菜单树，只更新实际发生变化的属性。布局仅在字号、栏宽、动作集合、搜索栏或内容遮罩等几何条件变化时执行，且仅改变需要隐藏或显示的控件。信息查询不再修改布局。React 仅接收实际展示指标变化；普通状态更新合并到下一动画帧，减少切换期间中间状态的重复应用。

切换笔记仍会更新操作所属的笔记和版本校验。待应用的目标上下文立即生效，旧笔记的操作不能在新笔记上执行；受保护内容的遮罩与恢复直接应用，不等待动画帧。真正变化的按钮状态继续更新，例如光标进入表格后更新表格图标。

## 验证范围

- `pnpm test:button-feedback`：实际 App 在隔离 Chrome 合成工作区中验证浅色/深色、文字/图标悬停与按下、菜单打开、选中标签悬停、键盘触发、设置页文字按钮、禁用、减少动态效果。按钮反馈不改变几何位置；多次切换笔记复用同一工具栏 DOM。测试前后笔记正文与版本保持一致，无页面异常。
- `pnpm test:native-toolbar`：22 项通过，包括切换中间状态合并、旧笔记操作拒绝、保护遮罩即时应用及停止后取消排队更新。
- `pnpm test:native-appearance artifacts/button-feedback/native`：生产 AppKit 组件在 layer-backed 隔离窗口中验证五档字号、四种宽度、双色主题共 40 个主场景，另含 160 个布局场景和 64 次保留控件的字号切换。图标像素范围及裁切检查通过。
- 原生控件的真实 setter 调用观察：只更新上下文版本并读取信息时，按钮属性写入为 0；只更新数量时为 0；进入表格时仅 `table.image` 写入一次。悬停状态保留；菜单打开优先于 AppKit 按下状态；瞬时 cell.state 不产生语义选中；触发确认到期恢复。
- `pnpm test:table-controls`：表格行列操作回归通过，包括四向插入、行列删除、撤销重做、合并单元格、键盘菜单、滚动定位、五档编辑字号和只读隐藏。滚动断言按实际滚动差值检查，避免焦点恢复引起的初始滚动影响。
- TypeScript/Vite 与 macOS release 构建通过。
- 最终桌面应用在 QA 文件夹中完成格式弹出面板、附件菜单、两份笔记来回切换检查，并恢复原文件夹视图。没有执行用户笔记的编辑、插入或删除。桌面截图与隔离组件截图分别保存，不将静态截图作为逐帧无闪烁证明。

## 截图与产物

- 反馈状态对照：`artifacts/button-feedback/feedback-comparison.png`，来自生产原生组件的隔离渲染。
- 桌面核对截图：`artifacts/button-feedback/desktop-format-open.png`、`desktop-format-hover.png`、`desktop-attachment-open.png`、`desktop-menu-closed.png`、`desktop-after-note-switch.png`；同名 `-toolbar.png` 是顶部裁图。关闭菜单并移开指针后的截图确认无残留选中背景。
- 浏览器结果：`artifacts/button-feedback/browser/result.json`。
- 原生结果：`artifacts/button-feedback/native/native-check.json`，包括属性写入观察结果、几何与渲染记录。
- 交付：`artifacts/button-feedback/release/CyberNote.app` 与 `CyberNote-macOS.zip`。源码、前端资源与包摘要记录在同目录 `manifest.json`、`SHA256SUMS`。

本机应用使用项目现有 entitlements 做 ad-hoc 签名；应用与 ZIP 解压后的签名严格校验通过，解压主程序及 Info.plist 摘要一致。该包未经 Developer ID 公证。本轮未重新构建 Android APK。
