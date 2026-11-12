# MEDIA99P 前测工具与证据独立核验

2026-11-09。审查人 `/root/media99a_verify`，非开发作者。范围 `84f2c896a4bfb6a4e3d48a8d51aff7a2471dbfa3..7a9ced6c289c8ce06c558ae90a4f22b87864a402`；工作树 `/private/tmp/cybernote-delivery`。正式前测限定 `artifacts/media99-baseline-run4`。

## 结论

**pass；未发现阻塞 MEDIA99P 工具/基准复用的缺陷。** 本次独立重算和小探针支持前测报告的限定结论；不表示生产媒体优化、原生 release 或长媒体全部通过。

## 实际独立核验

- 新增可复现 `scripts/performance/review-baseline99p.mjs`：只读审计既有数据及一个真实 SVG transport 请求，没有重跑大量浏览器全轮。独立流式重新计算全部503原件 SHA，与清单/附件 mapping 逐一比对；503个唯一哈希、总715,371,216B全部一致。fixture原件、seeded受管文件和run4受管文件逐项 stat 的 dev/inode/size 三处一致；不存在原件的大型复制或替代字节。
- 核验清单 hash `3ee2813ccb7de3f7b99cf84e6f1eea7d8658aa14addba6674ee53a75fe516351`、SQLite快照 hash `67c89bf58a7fdff7ce1e64b601a2d344cfe8f1d869b9c717b560ac3e407a62bf`，真实Rust input hashes、owned transport/seeder binaries和10个测量工具hash均匹配。保留的 `measured-runner.mjs` 与提交runner仅尾空格不同；通过规范化行尾空格后的逐字相等检查。产品指纹仍与正式run配置一致。
- 从 `transport.jsonl` 独立配对全部start/end（ID唯一且数量相等），重算 **1917次read、2,608,262,764B、503附件ID、0 SHA差异**；每次read均成功，原字节长度/SHA与对应冻结清单一致。不是从聚合result反抄这些总数。
- 从 `phases.json` 的rAF/longtask原记录和 `memory.jsonl` 的259条采样，重算全部10阶段的read/bytes、p50/p95/max/count、longtask数量/总时长/max、JS heap及Chrome renderer/进程树、真实Rust、Node桥各自峰值、离屏/120px外请求数；与result逐项一致。冷/热启动各22 read、**3,443,151B**；整轮2.61GB不能被用作启动读取量。
- 独立调用 `tracedTransport`→owned真实Rust→run4真实Store：load_workspace返回103notes/503attachments，再以真实Session Token读取一份SVG；返回MIME、完整bytes、SHA及观察器记录全部一致。没有fake Base64/延迟/图片/播放器，也没有调用设置src或load来使媒体成功。
- 再运行作者 `check-tools.mjs`：**8项通过**，覆盖四种分块的UTF8/多响应、行大小上限、截断EOF、真实Store数量及真实SVG SHA；独立另加约120KB UTF8大行/127字节不规则分块探针通过。分段reader每完整行才合并一次，避免原探索轮的逐stdout块平方复制；180MiB行限/120s超时在正式配置中有记录。
- `git diff --check` 通过。日志在 `artifacts/media99p-independent/{audit.json,audit.stderr,tools.log,probe-transport.jsonl}`；审查提交包含相邻结构化结果与可复现审计脚本，不提交大原件/binary。不编译、不native打包、不ADB、不访问用户库。

复现：

```sh
node scripts/performance/check-tools.mjs artifacts/media99-fixture artifacts/media99-baseline-harness
node scripts/performance/review-baseline99p.mjs artifacts/media99-fixture artifacts/media99-baseline-run4 artifacts/media99-baseline-harness artifacts/media99p-independent/probe-transport.jsonl
```

## 测量口径与失败保留

代码源头确认为真实App/React/Tiptap静态debug bundle和production Store/Session源码；Tauri窗口/事件壳是明确的替身，Linux platform选择web桌面工具栏，StrictMode与JSON/Base64 stdin/HTTP桥为该模式的一部分。Chrome renderer和进程树RSS、Rust transport RSS、Node桥RSS分别记录，均不能直接声称为Tauri原生RSS。CDP/500ms采样可能漏短峰值；系统文件缓存没有清理。冷启动指新进程/profile，热启动是reload，不是OS冷盘。此限制在报告中清楚表述。

workspace-ready与首个可见loaded DOM图片有明确判据；首图先于ready合理。播放/seek延迟包含固定观察等待，报告表述为观察到时间推进。rAF分位数不是输入延迟，GC后保留不是日常内存或原生泄漏证明。读取字节为实际成功返回原字节，未声称等于OS物理盘IO；网络JSON/Base64量另计。滚动末端的大媒体请求可跨阶段延续，阶段峰值不被当作单阶段因果。

正式run4的WAV结果仍为 **60s metadata超时、当前AUDIO无src/readyState0**；它的两次完整原字节读取成功不能变成播放器成功，未独断文件坏或浏览器不支持。两个MP4本轮初播/90%seek结果真实，但报告明确保留faststart跨轮无src不稳定。run1的Node平方Buffer拼接和磁盘保护是探索仪器故障；run2捕获过时元素、run3起点未规范化也与run4区分。runner exit0只说明阶段完成，不会把 `ok:false` 媒体改成成功。

后测必须冻结相同原件、SQLite快照和口径，重建候选源码的真实transport/frontend，并真实适配生产lease/HTTP接口；当前line transport不支持新命令时不得伪造成功或降回Base64以宣称流式收益。本次核验没有证明Mac/Android release首帧、长媒体后段seek/读取中撤权/原生RSS；这些继续是MEDIA99/FINAL101门槛。
