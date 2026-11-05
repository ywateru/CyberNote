# 71 独立验收证据

2026-11-06，最终受审源码 `62e5ed25e1bd2ef7ab5accd46cf58a9738ff5d4e`。本次只增加独审报告和紧凑证据，未修改产品代码、测试实现、任务状态或根文档。结论 [blocked](../../../plan/reviews/app-mobile-debug-recording71.md)。

所有正式CLI运行78输入文件SHA为 `750a06081f2f9d539d49e6053f00cb950c2e7956092b6c7a610146a4ed726999`，start/end相同、gitDirty=false。独立Chrome156.0.8078.80；手机390×844，桌面1280×800；JS协议fixture、440Hz合成流，真实App/Panel/Session/编码/正文ACK，未连接真实麦克风或现有设备。运行时日志取样在cleanup前，所有列出session均再轮询至终态。

| 命令 | 实测结果 | CLI耗时/场景耗时 |
| --- | --- | --- |
| pnpm test:debug | 9组94检查PASS，exit0 | 25.750s / 各组见desktop/suite |
| pnpm debug group notes --mobile | 9检查PASS，exit0 | 10.265s / 2.055s |
| pnpm debug group recording --mobile（01） | 35项后FAIL，exit1 | 16.300s / 7.865s |
| pnpm debug group recording --mobile（02） | 同位置FAIL，exit1 | 14.198s / 见suite |
| pnpm build | TypeScript+Vite PASS，exit0 | 未采总时；Vite3.77s |
| pnpm debug check-production --production dist | API缺失/URL不可启用/marker零匹配PASS，exit0 | 4.058s |
| node scripts/debug/cli.mjs script /private/tmp/mobile71-ownproto.json | **预期拒绝却exit0成功** | 3.012s |
| node /private/tmp/mobile71-independent-probe.mjs | probe完成exit0；3项合同负例暴露问题 | 细项见negative-probe.json |

[negative-probe.json](negative-probe.json)包含null/false/0/空串/普通未知字段拒绝、own __proto__错误成功、false async实际超时、迟到true错误成功、永不settle在250ms仍pending、真实permission故障经idle报APP_ERROR及关闭释放。probe自身exit0表示成功记录观察，不表示所有被测合同通过。设备故障execute可能先成功而随后idle拒绝，依据task合同将二者视为一次命令完成链，不冒称execute本身全等异步终态。

[cli-proto-summary](cli-proto-summary.json)保留显式脚本输入 `[{"waitForIdle":{"__proto__":1}}]` 被错误接受的正式CLI证据。源码[negative-probe.mjs.txt](negative-probe.mjs.txt)为一次性独立探针存档，绝非新产品测试入口。

mobile-failed01/02保留失败suite、准确源身份、失败state和首次媒体proof；01另保留失败HTML/rect/computed style及PNG。首轮普通保存、双段后部真实播放、重新挂载已保存卡、采集中close、设备错误、store失败重试均已有实际断言通过，最终save重试未过。不将保存failures消失前的等待错误推断为数据丢失，也不把前35条替代完整37条成功。

额外[retry-probe-aborted.mjs.txt](retry-probe-aborted.mjs.txt)尝试区分真实重试终态，但在await retry投影时撞到第二次Controlled save failure，state()抛APP_ERROR、exit1；finally清理了runtime。该probe没有生成JSON，未执行后半桌面close检查，无通过结论。保留失败历史，按root要求停止额外同型探测。

本轮没有保存/复制用户音频、ADB操作、安装/编译原生包、操作现有Mac应用。原版没有HTML；Chrome截图仅证明克隆呈现及测试错误，不证明原版像素一致，也不证明Rust持久化/Android WebView/真实设备音质。
