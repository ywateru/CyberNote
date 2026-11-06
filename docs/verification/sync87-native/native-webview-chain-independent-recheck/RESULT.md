# Native WebView 祖先链修复独立定向复核

2026-11-06。**PASS，原两类 blocking 已消除，可恢复原定 nativeTap 验收。** 只复核作者冻结 `d27e18ca7ac46520acdd96fcf9b1bbc80007dad4`，本树为其 cherry-pick `847e2eec`；两个实际工具文件逐字节等于作者 git 对象，见 [source.json](source.json)。没有产品或设备通过的扩张结论。

原 [BLOCKED 证据](../native-webview-chain-independent/RESULT.md)、精确反例、自然 exit1 和源码摘要仍保留在 `b1ee0efa`，未重写。本次 [check.mjs](check.mjs) 与原独立脚本仅输出目录不同，所有 10 个样本和期望完全相同。

| 本轮实际 host 检查 | 结果 | 完整进程耗时 |
| --- | --- | --- |
| 修复后的作者 client 组 | 21 项，自然 exit0 | 27ms |
| 原 10 项独立反例及真实 UIA | 全部符合期望，自然 exit0 | 25ms |

准确命令／退出／时间和原始 stdout/stderr 见 [processes.json](processes.json) 及同目录文件；真实 UIA 摘要、node/parentIndex、逐样本结果和源码前后相同 hash 见 [result.json](result.json)。ADB 调用0、主线写入0，未执行其他套件、构建、同步网络或设备操作。

窄源码复核确认：

- 开标签正则现包括无属性 `<node>`，记录其 nodeIndex/parentIndex 并入栈。原未闭合无属性外层样本现在拒绝；闭合中间 wrapper 仍不能被折叠成直接 WebView 父子。
- 先枚举全部 WebView，再逐项验证 exact package、有效 rect，之后验证全等 bounds／直接父子链。原 foreign parent→own child 及 own+foreign sibling 两样本现在拒绝，不再通过丢弃 foreign 得出唯一 host。作者额外 malformed WebView 样本也保留在21项组中。
- 保全实际 UIA 的两个 `com.local.notesclone` WebView 仍被接受：完全相同 `[0,48][720,1184]`，内层 parentIndex 等于外层 nodeIndex。单 own host 仍接受，同包兄弟、不同 bounds、闭合 wrapper、仅 foreign 和未闭合 attributed host 均继续拒绝。

既有 `99a23a00` 比例实验未接受为修复，本轮也未触及比例或触摸动作。installed-byte hash 的其他实际异常与本 parser 修复分开定位，没有混入本通过结论。

按根授权在此独立树启用 sparse-checkout，仅检出工具与本轮原／新证据路径，检出体积由约945MB降到2.4MB；git 对象、库与缓存未删除。这是工作树空间收敛，未操作用户数据、原设备或约13秒录音现场。此 PASS 仅释放工具宿主规范化门禁，后续实际 Android 验收继续由根整合。
