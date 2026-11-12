# Final106 Mac 原生运行作者记录

2026-11-10。**部分完成，附件验收被系统文件选择器的CUA操控阻碍中断。** 本文是106源码作者的实际运行记录，须由不同reviewer独核；没有宣称完整native验收通过。原始安全证据及SHA见`artifacts/final106-mac-runtime/evidence-manifest.json`。

## 已实际观察

- 首先读取[正式独审核包接受](../../plan/reviews/app-final106-packages-independent.md)，确认本批446输入/`74c0a8bbe365664d3100f66165ac4bf28427c34cf1650170865d6d40ceb8d55a`，才操作UI。
- CUA读取旧r2主界面并看截图：正常历史测试备注，无可见录音侧栏、保存/权限弹窗或活动任务。普通Cmd+Q后CUA返回App quit，首次进程检查尚在；随后CUA应用清单显示未运行、`ps -p 49451` exit1确认自然退出，之后才启动准确106路径。未强退、未双开Store。
- 新进程PID22150，`ps`精确入口为`artifacts/releases/20261110-modernization106/CyberNote.app/Contents/MacOS/notes-clone`，是当时唯一CyberNote原生进程。
- 真实设置页AX显示CyberNote0.1.0、`2026-11-10 08:05:59.823 UTC`、revision `bf26dae17f972fc09276deb456b4599e1ebe5d67 +modified`及完整上述指纹。安全过滤AX保存在`01-settings-identity.txt`。`01-settings.png`保存的是设置顶部外观区；版本位于下方AX，不声称该截图直接展示完整版本。
- 关闭设置后经新建按钮建立自有`FINAL106-Mac-runtime`备注，正文“中文SVG与长媒体验收。”；真实AX后续显示完整标题。未编辑用户备注、未改变设置/同步/权限/TCC。

## 阻碍与停止点

从106真实“添加附件→附加文件…”打开系统Open选择器。GoTo字段经AX `setValue`能显示批准的完整557B SVG路径；提交`app.pressKey('Return')`后却出现新的GoTo sheet、字段回到`/`。正常paste、路径建议条目的open动作未完成选择。父级允许的最后有区别尝试只填父目录`/Users/water/work/2026/Apple-Notes-Clone/artifacts/final106-runtime-fixtures/`，确认字段实际完整值后提交，仍回到`/`，因此停止导入尝试。

`02-chooser-blocker.png/.txt`保存最后目录尝试后的GoTo`/`。随后尝试正常取消：可见X实际清空路径文本，`app.pressKey('Escape')`仍显示GoTo`/`，未确认chooser关闭。最终当前系统chooser仍开着，父级已接管另行有界恢复；后续恢复不属于本作者冻结证据。CUA completion_summary已经发送，作者不再输入。

这是**文件选择器自动化阻碍，尚未证明产品导入或SVG失败**。未通过其他路径导入、未页面注入、未直接改Store。未观察到产品报错，不猜CUA/系统路径状态异常的实现根因。

## 未执行与数据范围

SVG尚未导入，所以真实缩略图、画廊定位未测；三长媒体未导入/激活/播放，时长、推进、90%seek也未测，不用短文件替代。零本轮受管附件副本、零媒体播放。唯一新持久数据为上述自有备注；保留该备注，若后续清理只经产品精确操作，不直接删除附件目录或垃圾箱。共享557B SVG原文件及冻结三媒体未改。

麦克风权限/完成录音刷新、实体触摸板捏合未测。原FORMAT102失败仍开放，106平台宽度修复与本次身份核对不撤销它。安全截图未公开用户正文；初次应用自动AX/截图可能含已有界面内容，未将其写入本报告或本轮证据文件。整个流程没有构建、安装、设备操作、TCC变化、forcequit或新增大fixture。
