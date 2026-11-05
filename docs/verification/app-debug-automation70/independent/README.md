# 任务70独立复核

2026-11-05。结论 **PASS，允许整合**；只针对显式开发命令、隔离浏览器和合成设备合同，不授予原生设备、Rust Store或原版像素通过。

最终作者提交 `59ecfb6cef0c749b6d338fa43794a9491c36b645`；独立 cherry-pick 源码提交 `875714a93f60f4cbfc22011347788da2634aae45`，双方树均为 `4b1ef9e37c07980d2db3d9e52cfb87e05991b089`。审查产物随后提交，因此 evidence commit 的树不再等于产品树。完整结构化结果见 [summary.json](summary.json)。

## 运行结果

| 检查 | 准确范围与结果 | 证据 |
| --- | --- | --- |
| 67项目录 | 54 semantic、3 DOM原语、10明确unsupported。源码反查导航/CRUD/格式/表格/锁/设置/菜单/附件/OCR/绘画/归档/录音/退出；目录存在不等于逐项已执行 | [catalog](final-suite/catalog-coverage.json)、`docs/debugging.md` |
| 最后一次独立全九组（修断言前） | 作者9c72等价树，38.301s；前八组77 checks通过；录音前12 checks通过，末项错误要求物理attachment数1而失败。不能记成一次全九组通过 | [suite](final-suite/suite.json)、[failure](final-suite/failure.json) |
| 修断言后受影响录音组 | 作者9310等价树：14 checks全通过，17.070s含启动、6.688s场景；页面异常0；77输入起止hash同，gitDirty=false | [summary](final-recording/summary.json)、[suite](final-recording/suite.json) |
| 迟到checkpoint失败与恢复 | 命令及idle均APP_ERROR；失败0媒体、owner保留；恢复后2个不可变历史版本、正文/DOM一张卡引用最新版本、2 journal committed、完成saved/revision2、owner释放 | [定向结果](final-probe.json) |
| 附件/OCR原目标 | 六项通过：真实filechooser/semantic附件/同步中换笔记/同步中撤权/OCR失败/OCR同步中换笔记。换目标压力测试调用实际note-row DOM handler；不是可信真人点击证明 | [结果](target-probe-attempt02.json) |
| 比较与实际卸载 | HTML/文本/rect/像素正反例；纯快照的text/order/style/rect反例；实际React unmount后global消失、held四接口UNAVAILABLE、track停止、2 URL全释放、root空 | [cleanup](cleanup-probe-attempt04.json)、[contract](final-suite/suite.json) |
| CLI非法参数 | execute/script `__proto__`，script显式null/false/0/空串共6项，全部真实exit1、INVALID_ARGUMENT、notes仍2、attachments0；不是仅浏览器API测试 | [CLI](final-cli/results.json) |
| 正式构建 | 9c72产品源码构建通过（Vite4.59s）；production检查5.261s：API不存在、URL无法启用、3个脚本文件4个debug/mock标记命中0。之后9310与59ec仅改测试脚本/说明，`src`逐字不变 | [production](final-production/summary.json) |
| 最后手机平台小改 | 对照安装Tauri官方`app.js:279`和`core.js:213/251`；实际模块注册→有序false/true payload→unregister后不再回调，非法Channel拒绝；390×844、异常0，明确simulated | [back](mobile-back.json) |

全九组最后成功的一次命令，由 root 在整合后的准确主树补跑并独立记账。本复核没有把各次分组拼成一次成功运行。手机notes小组的作者结果见development报告，不扩张为完整手机矩阵或Android设备通过。

## 历史失败与修复

[history.json](history.json)逐项保留：旧settings吞错、继承参数名绕过及空sort菜单、旧录音checkpoint假idle是真实旧源码缺陷，后续对应提交修复；早期filechooser自动取消、mount404/未就绪、inert动作未改变目标以及物理媒体计数1是测试夹具或断言问题。旧结果不追认为新版通过。

保留必要JSON与可读探针脚本；未将失败PNG、全页面HTML、浏览器/Vite缓存或合成音频复制进提交。探针是证据脚本，部分刻意固定当时SHA以防误对新代码重放；常规复现使用`pnpm debug group recording`及文档中的公共CLI。

默认后端 `isolated-js-protocol-fixture`；固定440Hz PCM/WAV进入实际AudioContext解码、RecordingPcm、Panel/Session及正文ACK链。IPC、系统菜单/对话框、OCR识别、窗口关闭和退出均模拟。未用GUI、真实麦克风或设备，未读取用户音频，未编译原生包。Apple Notes没有HTML；这些检查不能证明原版整体像素一致或真实音质。
