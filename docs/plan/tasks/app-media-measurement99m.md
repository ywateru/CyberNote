---
id: app-media-measurement99m
scope: real-media-postmeasurement
status: completed
depends-on: [app-media-baseline99p, app-media-provider99c, app-media-performance99]
---

## objective

复用99P冻结的503原件、SQLite快照与阶段口径，以真实生产MediaRuntime/HTTP/Store/Session测量99优化后行为，形成有局限说明的前后对照。可先开发独立测量transport，正式测量必须使用整合后的99UI/99C源码。

## context

docs/architecture/attachment-media.md；scripts/performance/README.md；docs/verification/modernization101/performance-baseline.md。冻结数据/private/tmp/cybernote-delivery/artifacts/media99-fixture，正式前测同树media99-baseline-run4；不重新生成或改动这些原件。

## path

仅scripts/performance的新真实Rust transport/harness与测量runner、前后报告。不得修改生产功能、现有debug runtime、fixture原件/基准快照或用户库。独立transport使用唯一生产Session与MediaRuntime，注册明确的可信测试窗口，转发真实acquire/release/撤权事件，Node仅转发IPC；浏览器直接访问真实Rust HTTP服务，禁止模拟URL/小图/流媒体成功。

## verification

- 先验证真实命令/tagged receipt/窗口/Origin接线以及release与撤权；line协议分段有界，不能恢复旧平方Buffer拼接问题。
- 分开记录原件HTTP bytes、缩略图HTTP bytes、生成次数/命中、生成逻辑输入量及输出量、active leases/streams、peak block。逻辑输入量不能称decoder实际读盘量或OS物理IO；native解码器内部读取未逐字跟踪时明确限制。
- 保持相同Chrome/viewport/StrictMode/103笔记503原件/快照/滚动节奏和阶段。新增冷cache/暖cache可比较流程，ready/首图/滚动rAF和longtask、heap/Rust/Node/renderer RSS、自然回收/诊断GC均保留。
- 音视频按新UI实际激活播放，等待最新元素metadata，90min WAV与faststart/尾moov MP4实际time推进、90% seek；不手动赋src补齐产品失败。失败如实保留并交作者修正。
- warm滚动不能重新decode原件；离屏/普通文件零原件读取、缩略图待执行请求可撤出，原件不被排队饿死。真实runtime读取中撤权、clear后重取、窗口关闭的释放证据保留。
- 原件503 SHA和manifest/快照hash仍一致，工作store硬链仅限冻结测试库；盘空闲低于2.5GiB停止新增大产物并报告。Chrome/Rust harness不替代101的Mac/Android release/RSS/ATS验证。
- 不同代理独审工具与原始指标，重算关键对比，不以作者summary当直接证据。


## precise tooling source accepted

2026-11-09：作者be61aa0e，独审9bc41475接受并回填root。真实生产metrics、机械提取同源Rust provider与直接生产C、只读observer、503原件hash和13项实际边界通过；独审复算943020B传输、5attempts/194876092逻辑输入/135024产物，最终0租约/流。仅工具阶段；正式10阶段仍待已接受99UI与生成指纹修正源码刷新。视频激活selector必须匹配99UI带文件名标签的真实按钮，不强制src/load。

## 正式测量及独立数据审计

作者1e3d3e39在1507d66a（产品4e143c3d…，434输入）完成正式10阶段，5b15ce1d独立原始数据审计接受并回填root。独立Python直接复算双方20phase的wall/rAF/longtask/独立进程RSS/heap和retention；949call/1898IPC配对、21metrics、逐phase391attempt/178generation/175hit及输入/输出总量一致。冻结503原件与SQLite保持。报告见[后测](../../verification/modernization101/performance-after.md)、[独审](../reviews/app-media-after99m.md)。

原件HTTP68128559B、缩略图HTTP67512903B、最大读取块65536B。90分钟WAV与两MP4实际按钮播放/90%seek成功，metadataMs包含导航和激活过程。仅169/450raster到后端、50文本SVG共213次unsupported、scroll2仍70新生成、final6lease/0stream无逐owner库存、7未映射SVG及6取消encoded未知均保留；接受记录完整性，不宣称等功能全图性能胜利，也不代表99全项或101实包完成。无第二轮正式重跑、native整包或ADB。
