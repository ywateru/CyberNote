# Mac正文尺寸候选实际运行记录（进行中）

2026-11-04，root通过CUA进行。corpus.json记录了实际传入纯文本及原版创建动作：原版Notes Clone UI 对照文件夹中CmdN，明确paste format=text。01为新建QA-TYPE-20261104-01的完整AX和原始CUA JPEG，正文焦点、拉丁/中文、空行、重复行和长段可见。没有修改既有原版笔记。

旧克隆准确包仍是b5063fd的mac-menu-build02 sealed（exe731695ca…），只读ps确认PID86273/准确完整可执行路径。在同名测试文件夹通过原生新建按钮创建一个空测试笔记，计数3→4；随后paste format=text没有改变AX，正文点击与既有QA行点击也没有改变。原生侧栏按钮仍可隐藏。02保存隐藏侧栏、空测试笔记及未取得正文焦点的实际状态，不把它登记为新候选的输入失败。没有在失败后通过写DB或DOM注入伪造同样本。

首次复用之前的app绑定进行pressKey，CUA要求重新读state；已重新读取再操作。一次尝试按bundle ID重新绑定，工具报告同ID多个包，未启动其他包；后续继续完整路径绑定。对照原版AX仍为单份corpus，没有把粘贴误送到原版的可见证据。

原生窗口菜单makeKeyAndOrderFront后仍未建立HTML点击生效的证据。源码只读审计未找到明确的全窗原生遮挡层：NotesUIRoot布局52高；新建仅延迟100ms全局第一.tiptap.focus是脆弱点，但不能充分解释列表也无响应，不据此未经证据修复。仍需实际输入链复验。

旧包正常CmdQ后，只读`ps -p 86273 -o pid=,comm=`返回exit1、空stdout/stderr，证明该PID已退出。新候选尚未运行。全部图片为JPEG，不能支持无损像素认证；字体面板没有取得精确值，见research/mac-body-original-font-panel-01。
