# MEDIA99P 大量附件性能前测

2026-11-09。状态：前测完成，经6aa4805c独立核验接受；[独审报告](../../plan/reviews/app-media-baseline99p.md)重新计算原始读取、全部503原件SHA和阶段指标。MEDIA99 生产优化和 FINAL101 双端原生验证尚未完成。只新增测量工具与报告，未修改生产代码、既有 debug runtime 或用户库，未执行 native 打包、ADB 或安装。

## 固定样本与可追溯性

- 测量产品基线：`84f2c896a4bfb6a4e3d48a8d51aff7a2471dbfa3`。产品输入指纹：`2f77b076c00cc67416d7cdcbad08d85e2e4dded3cee056d987a9c001b3d687d2`（372 输入）；运行时 dirty=true 来自新增测量工具，测量结束产品指纹未变。
- 冻结清单：`artifacts/media99-fixture/manifest.json`，SHA256 `3ee2813ccb7de3f7b99cf84e6f1eea7d8658aa14addba6674ee53a75fe516351`。500 张不同大图：100 PNG、350 JPEG（1600×1200 至 1728×1248）、50 SVG（2000×1500）。清单逐文件记录大小、尺寸、SHA。
- 90 分钟 WAV：86,400,044 B，8kHz/mono/PCM16；两份 H264/AAC 1280×720/24fps/96s MP4 各 96,754,277 B（92.27MiB）。一份 moov 在 mdat 前，一份在尾部；清单包含 atom 偏移和 codec。二者内容同源但容器字节/哈希不同。
- 共503原件，**715,371,216 B（682.23MiB）**，低于900MiB预算；真实生产 Store API 建立103笔记与503附件登记。原件、隔离Store和每轮Store文件503/503同inode，新增每轮仅约368KiB SQLite，无大型原件复制。冻结fixture整体约684.5MiB，harness约35.9MiB。
- 标准化运行使用只读基准SQLite快照的独立副本，SHA256 `67c89bf58a7fdff7ce1e64b601a2d344cfe8f1d869b9c717b560ac3e407a62bf`。快照在探索运行后关闭Store时冻结；每轮通过真实settings action固定起始笔记、文件夹、视图和主题。清单原件始终未改。

生成器/种子脚本见 `scripts/performance/README.md`。Rust Store/Session原源码哈希、独立真实transport二进制哈希和 seeder 哈希在 `artifacts/media99-baseline-harness/performance-build.json`。使用授权共享Cargo target、jobs2，只有native-free harness编译；后续复用了owned二进制，不依赖目标目录不被其他任务改写。

## 测量边界

有效标准化数据是 **`artifacts/media99-baseline-run4/`**，开始于 `2026-11-09T05:26:09.135Z`。macOS26.4/arm64/32GiB，Chrome156.0.8078.80 headless，1440×1000。源码为真实App/React/Tiptap与Rust Store/Session；静态debug前端启用现有React StrictMode，允许语义化调试导航，无HMR。窗口/事件壳使用最小Tauri替身，Linux平台标识选择真实web桌面工具栏。图片、音视频解码、读取原字节及权限核验均真实。

**此处不是Mac Tauri/Android release实包性能。** StrictMode可导致双effect读取，不能把本报告次数直接视为原生release次数。Node JSON/Base64 stdin+HTTP桥有额外分配；独立记录Node、真实Rust进程、Chrome进程树/renderer RSS，不把桥开销归为原生App RSS。透明观察器逐实际响应计原字节并计算SHA，没有模拟Base64、延迟、播放器或成功结果。

冷启动指新Chrome profile/process与Rust process、冷HTTP/browser缓存；未清系统文件缓存（前置校验已读过样本）。热启动是相同进程reload，页面Blob重建。单次运行样本，不是多次统计分布。每500ms采样RSS/heap，短尖峰可能遗漏；rAF和longtask均由页面Performance API记录。测量阶段有700ms收尾，wall时间不能当作首屏时间。

## 启动、读取与内存

冷启动workspace-ready **611.5ms**，首张可见图片**458.4ms**；热启动ready **720.4ms**，首图**593.6ms**，均从各自navigation的performance.now计。ready要求.app、至少一笔记行、startup已移除，首图要求真实loaded DOM图像与viewport相交。首图可以早于ready（列表先显示图片）。两次启动分别22次read、3.28MiB原字节，**不能把整轮2.61GB总量写成启动量**。

下表内存和字节均为MiB，内存列是阶段采样峰值。

| 阶段 | read次数 | 原字节MiB | JS heap | Chrome renderer RSS | Chrome总RSS | Rust RSS | Node桥RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| startup-cold | 22 | 3.3 | 19.7 | 617.2 | 1195.0 | 23.0 | 162.8 |
| startup-hot | 22 | 3.3 | 28.8 | 696.8 | 1308.1 | 23.0 | 166.1 |
| gallery-open | 16 | 9.9 | 81.7 | 816.6 | 1393.5 | 28.4 | 172.0 |
| gallery-scroll-1 | 974 | 982.3 | 156.2 | 1500.1 | 2055.5 | 33.8 | 188.2 |
| gallery-scroll-2 | 860 | 933.3 | 169.2 | 1643.8 | 2237.8 | 372.5 | 1282.7 |
| gallery-leave | 7 | 2.7 | 249.6 | 1348.3 | 1941.5 | 372.5 | 1392.2 |
| audio-90min | 2 | 164.8 | 285.5 | 1823.1 | 2424.5 | 373.0 | 1507.5 |
| video-faststart | 2 | 184.5 | 371.9 | 1382.1 | 1889.8 | 372.5 | 1190.5 |
| video-tail | 2 | 184.5 | 513.1 | 1728.0 | 2427.8 | 360.7 | 1232.6 |
| final-leave | 10 | 18.9 | 189.4 | 1254.9 | 2013.2 | 366.0 | 1230.6 |

完整各阶段合计**1917次成功原件读取，2,608,262,764 B（2.43GiB）**，503唯一附件，**0 SHA不一致、0 pageerror、0 transport读取错误**。观察器哈希累计约1398ms。原字节量是跨启动/重载/多次滚动/媒体切换的累积；网络Base64/JSON编码量另在network.json，不混作文件IO。read计完整响应字节，不能证明OS物理盘读量（系统缓存未清）。

## 画廊滚动与保留资源

默认照片/视频画廊有502卡（500图+2视频），滚动区域1227×890、scrollHeight37167。每轮以0.8viewport/100ms滚到底再回顶，末尾等2s。第二轮仍读取933.3MiB，说明当前测量模式下回收/重新进入可见区会重复加载原件；这不是缩略图读取。

| 阶段 | wall ms | rAF样本 | rAF p50 / p95 / max ms | >50ms longtask次数 / 总ms / max ms | 离屏read / 超过120px预取read |
| --- | ---: | ---: | --- | --- | --- |
| gallery-open | 1323 | 53 | 16.7 / 33.3 / 233.3 | 3 / 462 / 232 | 4 / 0 |
| gallery-scroll-1 | 13309 | 789 | 16.7 / 16.8 / 150.0 | 0 / 0 / 0 | 164 / 0 |
| gallery-scroll-2 | 13862 | 826 | 16.7 / 16.8 / 50.1 | 2 / 113 / 63 | 148 / 0 |

离屏read按发起时DOM和所在scroll容器交集判断，未越过120px预取范围。大多数rAF约16.7ms，但gallery-open p95=33.3ms且有长任务，滚动1仍有150ms最大间隔；rAF不是输入延迟或完整流畅度结论。滚到底会接近两个大视频卡，当前组件的预加载可把原件读取/大响应分配延续到之后阶段；峰值按当时采样阶段归属，不声称它只由该阶段新请求造成。

| 保留观察点 | JS heap MiB | Chrome renderer RSS MiB | Chrome总RSS MiB | Rust RSS MiB | Node桥RSS MiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| 第一轮滚动自然收尾 | 104.8 | 1500.1 | 2055.5 | 33.8 | 172.8 |
| 第一轮后额外强制GC | 46.7 | 1298.2 | 1853.6 | 33.8 | 173.0 |
| 第二轮自然收尾 | 167.2 | 1086.6 | 1674.2 | 372.5 | 1282.7 |
| 离开画廊后额外强制GC | 15.8 | 887.8 | 1481.2 | 372.5 | 1374.0 |
| 最后离开媒体后额外强制GC | 16.2 | 802.4 | 1414.6 | 366.0 | 863.3 |

第二轮强制GC的独立采样在500ms观察器忙时被跳过，无该标签数据，不补造数字。自然保留与强制GC是不同观察口径；强制GC不能代表日常内存，也不足以证明原生泄漏。第二轮末5个live Blob、约0.2MiB；最终12个约12.1MiB。Blob计数是页面create/revoke账本，不是浏览器已释放解码/GPU资源的证明。

## 长媒体结果与真实失败

| 原件 | 首次metadata | 实际初播 | 90%后段seek | 结论 |
| --- | --- | --- | --- | --- |
| 90min WAV | 60s超时；当前AUDIO无src、readyState0、无MediaError | 未到达可播放状态，未声称通过 | 未执行 | 失败保留 |
| faststart MP4 | 13,494ms，duration96s | play后317ms观察到时间推进 | 目标86.4s，424ms后86.728s | 本轮通过 |
| 尾部metadata MP4 | 8,031ms，duration96s | play后307ms观察到时间推进 | 目标86.4s，424ms后86.718s | 本轮通过 |

WAV两次完整read均成功（每次86,400,044B、SHA匹配，Rust响应约3.25s/6.81s），network证据中HTTP IPC响应正常；60s后最新元素仍无src，不能归为文件损坏或直接称浏览器不支持WAV。此次范围不修生产播放器，也未确证绑定失败根因。两个MP4本轮均先整件读取两次后才具备播放源；Blob媒体GET/Range不构成原生增量IO证明。跨轮faststart也曾完整字节返回而无src超时，应保留不稳定性，不能只挑成功轮称产品长媒体稳定。

## 探索运行、仪器修正与磁盘

- `media99-baseline-run1`：旧debug客户端每stdout块重复Buffer.concat，对约120MiB回复产生平方复制；Node桥RSS峰约4.30GiB，WAV阶段超时并触发空闲低于2.5GiB保护，停止Owned Chrome/Rust。仅保留探索证据，不当作产品长媒体OOM/失败结论。未证明系统或原生App OOM。首轮Vite同进程构建也污染Node基线。
- 新增独立分段客户端，一行只concat一次；未改已有debugruntime。明确180MiB行上限、120s请求超时，配置入证据。Vite改为子进程静态构建，测量时无编译器内存。
- `run2`：字节与哈希正确，但metadata等待绑定了捕获元素，可能在空src session重建后等待旧元素，超时结论有限。视频播放/seek实际成功保留。
- `run3`：改为轮询当前DOM，不设置src/load，WAV及faststart仍出现无src超时；source/bytes不变，说明不能把此前超时都归为旧监听器。其Store起点未固定，不作为标准对照。
- `run4`：独立SQLite/原件硬链，固定启动settings并记录Chrome版本，作为正式前测。所有阶段走完，唯一失败是上述WAVmetadata；未触发磁盘保护。开始18.62GiB空闲，采样最小18.24GiB，结束18.25GiB。其他任务清理使磁盘空间变化，不归为本工具回收。

## 验证与复用

`check-tools.mjs`八项通过：四种分块下UTF8/多JSON行、行上限、截断EOF、真实Store103notes/503attachments、真实SVG精确bytes+SHA；最终运行后重新验证全部503原件SHA以及三处硬链inode一致。`integrity-check.json`保存结果。工具语法检查通过，不新增生产单元测试。

主要证据（均保留在本隔离worktree的artifacts，不提交大二进制）：

- `artifacts/media99-baseline-run4/result.json`、`configuration.json`、`memory.jsonl`、`transport.jsonl`、`network.json`、`phases.json`、截图和三份媒体结果。
- `artifacts/media99-fixture/manifest.json`、`store-map.json`、`store-baseline.sqlite3`及逐文件原件。
- `artifacts/media99-baseline-harness/performance-build.json`、`measurement-client-check.json`、owned transport/seeder。
- 三轮探索证据与 `/private/tmp/cybernote-media99-run1.log` 至 `run4.log`。

后测复用最终工具、503原件清单与SQLite快照，重建候选源码的真实harness/frontend；比较相同模式的字节、首图、帧间隔、heap/RSS和媒体失败。MEDIA99若引入新租约/HTTP命令，需真实适配transport并保留同一测量指标，不能用模拟响应补齐。**原生Mac/Android首帧、后段seek、读取中撤权和原生进程RSS全部未测，留FINAL101实包验证。**
