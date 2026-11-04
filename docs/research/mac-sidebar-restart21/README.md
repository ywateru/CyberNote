# 原版 Mac 侧栏隐藏偏好正常重启补证21

2026-11-05，root仅用Computer Use正常隐藏/退出/重开/恢复，shell只读精确Notes进程。原版com.apple.Notes，/System/Applications/Notes.app/Contents/MacOS/Notes；未删除、新建或编辑笔记。当前为Notes Clone UI 对照合成文件夹及QA-TYPE-20261104-01合成正文。

00侧栏可见，01点击文件夹按钮后隐藏（无AX文件夹树，工具栏按钮仍在）；01紧接动作的工具栏Help尚报隐藏文件夹，不以该临时tooltip作为状态判断，实际树/截图为准。02旧PID86322；正常super+q后03matchingRows为空；显式重新打开com.apple.Notes后04仍没有文件夹树，按钮Help明确显示文件夹；05新PID40579。06点击文件夹按钮恢复侧栏可见，Notes Clone UI 对照11篇、合成正文和QA目录计数保持。日期分组从旧进程缓存今天变为新进程昨天/过去7天，未以分组文字逐字相同作为保全门槛。

本轮可支持原版这一主窗的隐藏偏好跨正常新进程保持。与Mac10 runtime18第32隐藏/34重启实际visible不同，构成克隆后续应修差异；不证明原版全部窗口、异常退出、画廊、窄窗或宽度策略。截图为CUA JPEG，无像素PASS。shell未读任何DB，仅记录精确进程行。原版恢复可见终态；原版删除实验仍暂停。全部记录由evidence-index.json封存，后续复核另建目录。
