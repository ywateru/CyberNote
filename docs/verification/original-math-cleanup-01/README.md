# 原版合成数学模式：单次恢复尝试

2026-11-03，verify，仅通过 CUA 操作原版 com.apple.Notes 中明确合成的 Notes Clone UI 对照 / Math Mode Reference。未搜索其他笔记、未修改正文、未启动克隆或使用 Android/build。

已在正文聚焦状态下打开“格式 → 数学结果”，对实际可用“建议结果”菜单项执行一次点击。随后重新打开同菜单检查。**恢复动作已经执行；恢复勾选状态仍未能独立确认。** CUA 返回的菜单 AX 没有 checked 值，不能把 selected（键盘高亮）当作模式勾选。

01-before-menu.ax.txt 与 02-after-menu.ax.txt 保存前后菜单；活动菜单的 getAXStateAndScreenshot 仅返回 state，无 screenshot 字段，随后一次 getScreenshot 返回 Screenshot unavailable for /System/Applications/Notes.app，因此没有勾选截图。按 root 指示未继续截图或模式探针，也未再次点击模式。03-math-body-after.ax.txt 保留动作后合成正文，列表时间仍14:33。

最后已关闭菜单，恢复已知 Notes Clone UI 对照 文件夹 / 每日 TODO 笔记，搜索为空；04-restored-original.ax.txt 及 PNG 证明最终状态。Mac GUI已释放。未创建防休眠 assertion，未更改系统设置。

此记录只关闭本轮有限操作，不可将数学模式恢复勾选标记 pass；backlog 应保留“单次建议结果点击已执行、勾选确认 unknown”。
