---
id: app-001-fix-01
scope: core-interaction-parity
status: pending
depends-on: [qa-001]
---

## objective

修正 APP-001 首轮独立审查中可用原版直接证据验证的编辑与导航差异。属于 APP-001 的阻塞修复，在同一隔离分支上实施；不把整体任务提前标完成。

1. Mac 画廊双击在同一主窗进入笔记，保留侧栏，显示返回按钮；返回恢复画廊上下文。独立窗口保持显式入口，不能与双击混用。
2. 手机格式面板替代键盘，布局为原帧20s的横排样式、标记分组、列表/缩进分组，正确命名“标题/小标题/副标题/正文/等宽样式”。点击格式时保留编辑选区，关闭后可继续编辑，Android Back先关闭面板。
3. 纸张选择：空白独占第一行，下方2列3行，共7项（3横线+3网格），选择持久化并用于纸张/绘画背景。
4. 富文本样式命名与顺序对齐原版；短划线列表、块引用、表格转文本等已要求入口均有真实文档行为。纯文本粘贴须覆盖本次原版“所有段落正文”的对应路径，不能仅凭标题来源将首段强制放大；区分原生默认新输入样式与粘贴内容格式。
5. 清单已勾选样式按原版黄色白勾，无自动删除线；空项回车退出和撤销/重做保持正确。

原版补证：表格转换列Tab/行LF、单元格内部LF保留、末尾空格保留Tab，一次Undo恢复表格，见macos.md与table-boundary参考。纯文本特判限定已取证的空白新笔记首次text/plain路径，富HTML/已有文档粘贴不做全局降格。手机格式X恢复键盘、Android Back先收面板且键盘隐藏，是当前明确实现策略；视频只确认格式后回键盘，未捕获触点，不能标X原版实采。

## context

- docs/INDEX.md
- docs/requirements.md F03–F06、F13–F14
- docs/ui/macos.md
- docs/ui/android.md
- docs/ui/interaction-matrix.md
- docs/plan/reviews/qa-001-01.md
- references/desktop/macos26-gallery.png
- references/desktop/macos26-gallery-open-note.png
- references/desktop/macos26-paste-plain.png
- references/desktop/macos26-table.png
- references/mobile/frames-2s/frame-011.png
- references/mobile/frames-2s/frame-044.png

## path

src/App.tsx、src/Editor.tsx、src/style.css、src/types.ts、src-tauri/src/store.rs（纸张枚举及验证）、相关真实回归脚本。实现者需先读独立报告并等待设备交接。不要改写原版参考。

## verification

开发者完成类型/构建验证并提交；由独立 verify 走 Mac画廊进出、手机格式选择→继续输入→关闭重开、7种纸张逐项保存恢复、表格转文本与撤销、清单勾选重启。生成与原版对应状态截图。布局未精确测量则不能标像素pass。构建产物与源码hash重新记录。
