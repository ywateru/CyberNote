---
id: app-001-fix-01
scope: core-interaction-parity
status: in-progress
depends-on: [qa-001, app-001-fix-00]
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

2026-11-03独立安装版发现：08f2776的真实IME显示后WebView布局高度未缩小，格式工具栏被键盘遮住，原生触摸不能打开面板；Back收键盘后可触摸，X恢复IME后再次遮挡。P1证据见 `docs/verification/qa-fix-01/run-08f2776/finding-android-ime.md`。修复必须用原生触摸/系统键盘走完整入口，DOM `.click()` 或编辑器内部命令只能用于分离的程序边界检查，不能替代可触达性。Android修复中，Mac已提交产物继续独立复验。

后续独立复验：7c2d103原生IME高度修复通过真实触摸入口；8124911移除格式面板上重复附加栏后，格式选择→加粗→X恢复同选区与键盘通过。8124911仍发现纸张页P2：系统Back收键盘→更多→横线与网格会重新唤起IME，遮住底部三项；证据位于 `docs/verification/qa-fix-01/run-8124911/`。本项阻塞FIX-01，须按android.md纸张浮层契约修复完整入口/取消/返回并复验；已完成的纹理/持久化测试可注明候选与复用理由，不必重复无关矩阵。上述结果均不等于整体像素一致。

最终0d8b245已独立复验关闭纸张P2：真实选区入口/7项可达/底部选择/取消及Back同选区/恢复输入/一次冷启正文+笔迹+纸张保持，14项断言通过。见 `docs/plan/reviews/app-001-fix-01-01.md` 与 `docs/verification/qa-fix-01/run-0d8b245/`。本轮发现的P1/P2阻塞关闭，允许FIX-03优先推进；本任务仍保留完整预定矩阵的partial/not-run，不能标整项全功能或像素verified。余项（如手机完整清单/表格/列表路径、中文候选composition、Mac全样式/滚动恢复/快捷键等）随后续接入和PARITY-001实际复核，已通过不受影响用例直接引用。
