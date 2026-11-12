# MEDIA99M 工具阶段交付

2026-11-09。工作树 `/private/tmp/cybernote-delivery`，基线 `f11d6e8e151b541e96158830d81363e11cfa5fbb`。仅工具准备可审查；正式后测等待accepted99UI/99C全源码，未给出优化效果结论。99P冻结样本、run4、SQLite快照、前测脚本和原报告未修改。

## 实际接线

新增独立Rust transport与builder，复制当前生产Store/Session/sync/MediaRuntime原模块；唯一共享Session同时交给同步与媒体运行时。可信host固定main并注册真实runtime窗口incarnation，renderer不能提交身份或调用perf生命周期控制。静态server先绑定，再把精确Origin交Rust HTTP服务。acquire/release/tag来自生产runtime；事件在Session锁释放后先过runtime撤权，再排队给页面。Node转发IPC、不代理媒体响应，Chrome原件/PNG直连Rust随机本地端口。

沿用99P的分段有界line reader（180MiB兼容上限、单次拼接、120s），Rust请求在完整行分配前另限4MiB，最多32并行worker。原件JSON/Base64路径如由旧产品调用仍透明记录真实字节/SHA，绝不转成假HTTP成功。新trace只记capability/lease哈希，不写URL、token或媒体正文。

## 已运行证据

- `artifacts/media99m-tooling-harness3/performance-build.json`：生产输入/transport哈希、共享Cargo target、jobs2/incremental0/debug0。原生包未构建。owned binary SHA256 `b3194c61e245d8948d4e5f927a424b09bbbd119d1c21df532ce345a5f480f039`。
- `artifacts/media99m-tools-final/result.json`：10项工具边界检查通过；503原件逐一前后流式SHA一致，715,371,216B，无新增原件拷贝；工作库503硬链接。manifest SHA `3ee2813ccb7de3f7b99cf84e6f1eea7d8658aa14addba6674ee53a75fe516351`，SQLite快照SHA `67c89bf58a7fdff7ce1e64b601a2d344cfe8f1d869b9c717b560ac3e407a62bf`。
- 同一证据验证：真实JPEG200响应661,678B及原件SHA；Chrome156直接206读1024B校验、真实生成PNG63,438B/160×115解码；外来Origin403；renderer路由实际拒绝host-only命令；release失效；warm hit1次、clear后generation1→2；96,754,277B MP4 noRange读取64KiB后真实Session prepare撤权，中断且新grant被access_changed拒绝；abort后恢复、window close失效/reopen可重新签发。最终activeStreams0、peakReadBlock65,536B，边界测试没有read_attachment IPC。
- 当前抽查一个冻结text-SVG明确返回unsupported_media。首次工具探针选择它作为成功thumbnail断言而失败，原始 `artifacts/media99m-tools1`、`/private/tmp/cybernote-media99m-tools.log` 保留。后续把它作为独立失败观察保留，另用JPEG测试已支持的真实生成；未制造SVG替代图。
- `artifacts/media99m-startup-tooling-final/result.json`：真实App/Chrome/唯一Rust运行时启动smoke，只有1个启动阶段，非10phase正式测量。旧产品仍调用legacy read_attachment，逐项真实SHA核验、无页面错误；该结果不作为流式优化数据。
- `artifacts/media99m-formal-gate1/result.json`：formal入口在浏览器启动前因缺少生产purpose/logical指标明确拒绝（exit1预期）。这证明未把null当zero、未提前测正式产品。当前metrics中activeLeases/purposeBytes/generationLogicalBytes显式null；总读取量不能伪称精确分用途。

命令详见 `scripts/performance/README99M.md`；日志 `/private/tmp/cybernote-media99m-{build3,tools-final,startup-final,formal-gate}.log`。源/工具语法及diff检查完成。第一次不支持SVG断言是工具校正，不能隐去为产品通过。

## 正式后测边界

新runner保留99P十阶段、1440×1000/StrictMode、滚动节奏、rAF/longtask、500ms分进程RSS、自然回收与诊断GC，记录真实runtime阶段快照与HTTP流量。音视频必须按实际UI激活，不手动赋src/load；新UI控件选择器尚需accepted源码核对。正式数据必须升级到99C生产精确purpose/ops/generation逻辑量/leases指标，并链接其接受后的同C Mac provider（当前基线无该接口，工具尚未复制或伪造provider）。logical input/output不等于native decoder实际读取或物理IO。

450raster与50SVG的成功/失败/未尝试及HTTP分组独立报告。当前SVG子集支持限制可能使10%图片未解码，整体RSS/bytes比较必须披露；混合run的450raster请求分组不称独立450raster内存，不能因功能降级宣称全量性能提升。额外相同450子集内存对照如实施须两端同子集，不能改写原99P报告。

后续整合源改变会被harness/frontend SHA检查拒绝，必须重新构建独立工具和静态App。不同代理需审查工具、真实trace并重算正式指标。Mac/Android原生包、ATS/cleartext、同平台解码能力与真实RSS仍属于FINAL101。本阶段没有ADB、用户库或系统清理操作。
