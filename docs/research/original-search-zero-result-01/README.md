# 原版F07：唯一结果→零结果→清空，一次有界取证

2026-11-03；原版Apple Notes 4.13（3146.101.28），macOS26.4（25E246），中文/浅色。本轮只用公开AX和CUA原生按键/粘贴/点击，未改产品、原版设置、数学内容或任何笔记正文，没有读原版数据库。Mac GUI结束后已交回root。

**实见原版从唯一结果切换到零结果时，列表和正文都清空，编辑/媒体操作禁用；clear会恢复进入搜索前的合成文件夹和原选中笔记。** 这提供F07原版对照事实；克隆“零结果仍保留旧正文”的观察需由root/verify与既有克隆证据对应，不把本轮原版取证升级为克隆修复或像素通过。

## 起点与动作

初始窗口已经位于已知合成文件夹“Notes Clone UI 对照”（6项），选中“每日 TODO”。先保全`01-initial.ax.txt/png`。没有调整窗口位置/尺寸或分栏，四张原始PNG均2782×1806；本轮未独立测逻辑窗口bounds/DPR，不能据PNG强推逻辑pt，也未缩放或进行像素diff。

1. Option+Command+F实际聚焦全局搜索。初次typeText中文未显示输入，随后改用粘贴。预备普通中文合成正文查询产生宽泛搜索，未点击非合成结果，也没有将该临时结果的AX/PNG保存到本目录。立即收窄为带引号精确合成标题`"Title Reference"`。
2. 精确查询显示“找到1个备忘录”，唯一结果位于“Notes Clone UI 对照”，原版自动选中该结果并展示其已有正文。`02-unique-match.ax.txt/png`只保留该合成结果。
3. 保持搜索框焦点，Command+A后粘贴无匹配长词：`QA-NO-MATCH-20261103-2301-ABCDEFGHIJKLMNOPQRSTUVWXYZ-NEVER-EXISTS-7f62c83e9d4a`。观察AX后保存`03-zero-match.ax.txt/png`。
4. 点击搜索框内原生clear（AX标签“取消”）。原版自动回到“Notes Clone UI 对照”6项和原选中“每日 TODO”，正文恢复进入搜索前内容，保存`04-clear-restores-original.ax.txt/png`。无需重新点击文件夹或笔记；搜索框已空，焦点仍在搜索框。

## 三种状态

| 状态 | 列表/选择 | 正文 | 操作状态 |
| --- | --- | --- | --- |
| 唯一匹配 | “找到1个备忘录”，合成Title Reference被选中 | 正常显示该合成笔记，AX可编辑 | 格式/清单/表格/媒体/共享可用 |
| 无匹配长词 | “搜索—无结果”；只有“备忘录”分组标题，没有note行或旧note选中 | PNG白色空区；AX仍有Note Body Text View但没有Value，也没有settable | 格式、清单、表格、媒体、共享均AX disabled；日期无Value |
| 点击clear | 自动恢复原合成folder与“每日 TODO”选中，不保留最后搜索结果Title Reference为选中 | 原有正文恢复 | 上述笔记操作恢复可用 |

`evidence.json`记录所有8份原始证据的SHA、PNG尺寸、查询及有限断言。初始与clear后的AX正文Value逐字相等，SHA256均`4feb37fe47307425d4928be5dc69ba5af63a4ce010cd00d9483453be843c5b52`。这是AX可见正文一致性，不是数据库/富文本完整结构比对。

## 范围和限制

全局搜索会将侧栏显示为账户全部范围；本轮只保全唯一合成命中、零命中及原合成folder状态，不保全其他笔记内容。没有打开或修改私人笔记，没有继续其他菜单或查询矩阵。合成Title Reference已有数学结果和链接仅被显示，未点击/编辑；“Math Mode Reference”没有被选中。

本轮只确认一个原版唯一→零→clear序列，不覆盖混合结果、中文分词、多个账户、不同视图/主题、键盘/IME或更多菜单，不声称全量搜索语义或像素一致。原版当前query空、folder/selected note已恢复、尺寸未变。
