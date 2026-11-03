# candidate02 Mac 独立实际核验

日期：2026-11-04 Asia/Shanghai。执行者 verify。实际构建源 `fabafcf9723e400c67fd842f870dad9d4ae79d19`。结论：**确切 sealed 包启动和显式搜索焦点下的 F07 有限流程通过；快速快捷键后立即粘贴有真实异常；像素一致 FAIL。** 后续主树的 RecordingPanel 纯抽取不属于此安装包，不追认本次结果到新源码。

证据根：`docs/verification/unified-fabafcf-independent-02/mac/`。原始 AX、PNG、实际运行包身份、完整合成笔记对象、只读对象身份见证、零结果公共区域 overlay/absdiff/metrics 均已保全。旧 candidate01 白窗失败继续有效，本次通过只描述 candidate02。

## 确切包与输入身份

实际运行 PID23532，路径 `/private/tmp/notes-f07-audio-mac-candidate02-sealed.app/Contents/MacOS/notes-clone`。独立重算 exe 15,534,288 B，SHA256 `5e948ad9647a0ff878471dc213b327ca88628608b877b1f38c1ce6d154171e79`；全 bundle 3 个文件清单聚合 `b7c114ee6d0ee91c121536c5e8cf96a98221ab3188263a01f2b7d8189ff1c163`，strict deep codesign exit0。这是本地 adhoc 签名，不是公证或分发验收。开发 Mac 11 项 runtime 清单全部逐项重算匹配；build 19 项清单也匹配。

219 个列明输入中，当前树 218 个与构建清单相同；当前 `src/App.tsx` 已被后续纯抽取修改。独立从 `git show fabafcf:src/App.tsx` 读取冻结正文，SHA256 `fec03860e81af5745b7c2f2eefa1f5544d5abec0302918d56dc2fdb13392df2c`、130,981 B，与该构建输入吻合；以此精确快照重算 219 聚合为 `5ca8801e643c187fe2aa2ddcae3b8ba512331a2103bb436d7731efbffc9cab69`。当前树聚合不同的事实保留于上一级 `identity-inputs-and-devmanifest.json`，不把新树称为旧构建。该清单不宣称完整 SDK/OS/全部传递依赖可复现。

## 有限原生流程

原生真实打开后显示完整三栏、native toolbar 和合成 A。只读 WK 证据 URL `tauri://localhost`、loadingfalse、title备忘录，窗口 backingScale2，JS viewport1088×660/DPR2。

A 为 `7b67dda1-90ff-4eb1-9a20-d49b94bf2bdc`，B 为 `79444c2b-0ffc-41f5-8067-64c083aee922`。在 A 正文原生追加 ` VERIFY02-HISTORY` 后，A revision57。实际唯一搜索 `QA Quote` 显示 B；固定不命中搜索显示零结果、空编辑区，附件/清单/格式/表格/更多/共享禁用；清空搜索恢复 A。随后原生 Undo 仅移除此次 suffix，Redo 恢复。证据03–10保留完整序列，不用浏览器页面结果替代原生 App。

严格对象补证16与显式焦点序列17–20覆盖 A→唯一 B→零→clear。只读有界 async lexical closure 捕获 A 的真实 DOM、Editor、View，严格 `===` 三项全程 true；A 文档和 selection anchor/head73 全程相同。B/零阶段 A 隐藏、editablefalse、未destroy；clear 后原 A 可见、editabletrue、未destroy。真实 owner key 为 `7b67dda1-90ff-4eb1-9a20-d49b94bf2bdc-6f893418-eb14-4db7-8609-c75c18652bf9-0-0`。该观察没有 page global、hook、产品/ref/editor 写入；工具操作完成、`cleanup_error:null`，返回的 normalized state 字段仍写 running，报告不据此虚构额外 detach 状态。

本轮最后 A revision61，正文完整 JSON 等于 after-suffix 的目标内容；B revision14且完整 JSON 不变。A revision 增长包含真实 Undo/Redo及以下异常恢复，不能写成 revision 没变。只读取指定合成两行，没有导出整份私人数据库。

## 保留的快速快捷键异常

第二次补证中，`OptionCmdF` 后未先观察搜索焦点就连续粘贴 `QA Quote`，文本实际落入 A 正文末尾，搜索栏仍为空；12 的原始 AX/PNG明确保留这一异常。其后原生正文点击与 Undo 去掉意外文字，15和最终完整 JSON 确认正确恢复。

原因目前未知，可能涉及快捷键异步焦点或快速工具输入路由边界，未做归因。它不能被显式搜索框点击、AX确认焦点后的正常流程通过覆盖。本轮没有反复刷该快捷路径直到通过。可另设最小焦点时序任务，保留原生事件和目标焦点证据，再判断是否需要产品修复。

## 原版公共区域像素证据

原版当前主窗口 logical1392×903（WindowServer X48/Y29），PNG2784×1806；克隆 logical1088×660（X200/Y90），PNG2176×1320。原版 mapping 由精确 PNG/WindowServer 尺寸比2得到；克隆另有 native backingScale2/JS DPR2证据。未改变窗口几何，因此本次不是相同全窗尺寸的像素验收。

两个窗口都使用同一固定不命中搜索，搜索栏有焦点。先登记固定 window-local logical ROI，再按2倍坐标原样裁剪；无重采样、配准优化、遮罩或亮度修正。RGB任一通道不同即记 changed pixel；MAE为全部 RGB 通道平均绝对差，max为最大单通道差。50% overlay和原值absdiff均输出。下列比例仅属于对应公共 ROI，**不是全页差异比例**。

| 公共 ROI | logical x0/y0/x1/y1 | changed pixels / 总像素 | changed% | MAE | max |
| --- | --- | --- | --- | --- | --- |
| list-common | 228/0/508/660 | 105708 / 739200 | 14.3003% | 1.57374 | 223 |
| editor-common（含toolbar） | 508/0/1088/660 | 150374 / 1531200 | 9.82066% | 1.55363 | 250 |
| empty-editor-body | 508/96/1088/660 | 3384 / 1308480 | 0.258621% | 0.0448276 | 26 |

实际可见主要差异：

- 列表：原版标题“搜索”、副标题“无结果”，并在下方显示“备忘录”分组及横分隔线；克隆标题“搜索结果”、副标题“0 个备忘录”，没有该分组，列表中央另有“未找到备忘录”。这些是文案和布局的明确不一致。
- 编辑区含 toolbar：原版与克隆按钮组和搜索框的横向位置不同，原版搜索焦点轮廓为黄色，克隆为蓝色；克隆截图搜索下方还可见黄色听写浮层。窗口宽度、系统材料及焦点环境不同，因此只记录所见，不断言差异的具体实现原因。
- 空正文区域：双方均为空白且没有旧日期/旧正文；公共 crop 左边缘仍有窄条边界差异，原图中两窗口的列边界位置并不完全相同。该空区域的低差异不能覆盖列表及工具栏的明显不一致，也不能推出整页像素通过。

本地账号 sidebar 与原版 iCloud sidebar 不同，未计入公共 ROI；它们仍在原始截图中，并未隐藏后宣称全窗通过。原始图保留光标和浮层，未调参压低差异。本次整体像素要求继续 FAIL。

## 清理与下一步边界

原版搜索已清空并回到 `Notes Clone UI 对照` / `每日 TODO`，未修改正文和窗口几何；克隆清空搜索恢复 A。自有临时 caffeinate 已停止。Mac surface已正式交回root。本轮未修改产品源码或主git。

最小后续 UI 任务可先处理零结果列表的准确文案、分组、分隔线和中央提示，再在明确相同窗口几何、系统焦点环境下重新取原图。toolbar焦点颜色和横向布局另以同条件证据判断，不能仅根据本次不同窗口宽度的 crop 把全部位置差异写成具体修复结论。
