# Mac11 侧栏与普通表单有限实际验收23

2026-11-05，Asia/Shanghai。使用 Computer Use 操作准确本地 Mac11，原版删除/恢复实验继续暂停。本目录已封存；不同作者仅静态复核此记录，不冒称再次操作。

## 准确包

来源提交 `94fbbb36fe94a7f291edf34e618091a0cec8da63`，运行 `artifacts/unified-candidate06/mac-ordinary-sidebar-build11/mac-attempt01/mac-sealed.app`。exe SHA256 `3cc7188dff3213fdf1e7ca7c85373d3fe937ff8de8158fb187cb8679614e200d`，封存ZIP `d09aab449229a517b78302ac22ba6794a451abb2679441dc8035b7eeef660d9d`。包已独立核查486项；本目录不替代核包。

## 已见结果

- 工具栏隐藏→菜单显示恢复，菜单隐藏→工具栏显示恢复。隐藏时直接恢复按钮保留；动态菜单文字为“显示文件夹”/“隐藏文件夹”。对应06–11；07/09仅AX，截图限制见下。
- 普通新建表单12/13真实运行，默认名称全选、未勾选智能。14–17仅合成未保存草稿：普通→智能→普通保留 `QA-SURFACE-23-CANCEL`，取消后总数41/智能0/已选1及三行合成正文保持。
- 隐藏后观察界面再Cmd+Q，准确旧进程结束，新PID45907仍隐藏；显示后同流程，新PID45957仍显示。18–25完整AX/图片/进程记录串联。
- 两次单调用“最后点击→立即Cmd+Q”之间无截图、AX或人为等待：隐藏重开PID46007仍隐藏，显示重开最终PID46056仍显示。26–33保存动作工具时间和准确进程记录。仅为本机有限实际结果，不承诺未交付事件或所有退出竞争。
- 05a与各重启/最终记录exe相同SHA，四次旧进程均为空。最终显示侧栏、all41/smart0/selected1及 `QA-SMART-U09-Mac-Tag / 本地智能文件夹验收。 / #QASmartU09` 可见正文保持。

## 图像结论与限制

实际表单有限量图见 [研究25](../../research/mac-ordinary-surface25-runtime-analysis/analysis.md)。800×414与主要控件位置保持，平坦颜色、角部、未选中框改善；名称仍右4图像px、智能标签右2px、蓝色选区与灰内边/焦点及字形细差未解决。不是整体像素PASS。

00原版失焦；01激活图字节与18原参考相同，只算一张参考。03旧包保存AX为无变化diff，不将其当完整正文记录。07菜单截图报Screenshot unavailable；重试没有图片，09因此只保存AX。实际端点用完整AX和JPEG，JPEG有损且非PNG；量图统一ICC→sRGB，不能反推原生参数。13指针光晕不用于被污染区域测量。

窗口close等待pending/dirty为源码与隔离链路结果，Cmd+Q仍走原生terminate，无新增退出握手；本机两次快速操作通过不保证所有时序。正文只核可见三行与有限计数，没有读用户DB/内部ACK。无原版删除、数据提交、音频导出、ADB或媒体/归档重跑。Android06继续保持旧准确来源，未重建。

完整动作及限制见 [actions.json](actions.json)，所有文件身份见 [evidence-index.json](evidence-index.json)。所有截图由Computer Use获得，process-probe.py仅核准确exeSHA和该路径进程；UI不经脚本模拟。
