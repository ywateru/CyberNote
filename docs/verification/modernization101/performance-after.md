# MEDIA99M 正式后测与冻结前测对照

正式测量记录，经5b15ce1d[独立原始数据审计](../../plan/reviews/app-media-after99m.md)接受并整合。正式后测完成10个阶段，0 legacy `read_attachment`、0 runner/长音视频播放失败、0 pageerror；90min WAV与两种MP4由真实产品按钮激活，自动播放时间推进及90% seek均成功。**这不是450张完整图片等功能下的内存胜利**：本轮只有169/450 raster到达后端，50/50文本SVG全部unsupported，281raster无后端acquire。

## 来源与可复算证据

- 后测候选：`1507d66a152ac2ac9838d2bcd37791449135a370`，产品指纹`4e143c3d8d459ce2f26a699c691ba58b188fc6b58a9e3838b1c8852422e8a904`，434输入；含accepted99UI、99C provider、99M precise工具及101identity。源码dirty只反映本轮工具编辑，产品输入指纹前后相同。
- 冻结前测：`artifacts/media99-baseline-run4`，源码`84f2c896…` / 产品指纹`2f77b076…` /372输入。保留前测WAV60s无src失败，不改旧报告/原工具，不在新源重跑旧identity审计。
- 前后均实际读取Chrome **156.0.8078.80**（`/Applications/Google Chrome.app/...`），1440×1000、StrictMode/debug静态前端、同103笔记/503原件/SQLite、0.8viewport/100ms滚动。当前系统常驻154进程不属于这两个owned浏览器。
- 原始后测：`artifacts/media99m-after-run1/{result.json,configuration.json,phases.json,memory.jsonl,network.json,media.jsonl,media.jsonl.ipc,measured-runner.mjs}`，三份媒体JSON与截图。`result.json`保留原始分类，包括7个未映射image/svg事件；权威受管媒体字节以真实core counters为准。
- 本目录`media99m-after-data.json`由`report-media-after.mjs`从双方raw phases/memory重新计算wall/rAF/longtask/分进程RSS，并逐项核对原result；原始文件SHA256在JSON内，可供另一代理重新核算。完整原始trace保留artifacts，未提交大文件。
- 冻结manifest `3ee2813ccb7de3f7b99cf84e6f1eea7d8658aa14addba6674ee53a75fe516351`、map `7e2e17411a078e0d38b9819ec2c8f2efe41968303d89ed59963100ca5f61f27c`、SQLite `67c89bf58a7fdff7ce1e64b601a2d344cfe8f1d869b9c717b560ac3e407a62bf`。503原件715371216B均在本轮前后流式SHA验证，未修改原件/SQLite；工作库仅SQLite副本+原件硬链，新增原件字节0。

## 各阶段读取与时间

前测列是完整原件IPC响应逻辑字节；后测分原件与派生HTTP实际源读取，不能把两列叫作同一物理IO指标。阶段可能包含前阶段尚未结束的浏览器缓冲；这些数值不是解码器实际pread计数。

| 阶段 | wall ms 前→后 | 前测原件IPC B | 后测原件HTTP B | 后测缩略图HTTP B | attempt / generation / hit | 生成逻辑输入B / 发布输出B |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| startup-cold | 1418→1491 | 3443151 | 0 | 107962 | 17 / 2 / 0 | 3222064 / 107962 |
| startup-hot | 1512→1392 | 3443151 | 0 | 107962 | 15 / 0 / 2 | 662931 / 0 |
| gallery-open | 1323→1458 | 10382129 | 0 | 2696118 | 16 / 5 / 0 | 10382129 / 2696118 |
| gallery-scroll-1 | 13309→13571 | 1030010298 | 0 | 12719138 | 173 / 94 / 43 | 97578533 / 56235938 |
| gallery-scroll-2 | 13862→13516 | 978594981 | 0 | 42610216 | 148 / 70 / 128 | 72813437 / 42359341 |
| gallery-leave | 2253→2045 | 2780044 | 0 | 107962 | 15 / 0 / 2 | 662931 / 0 |
| audio-90min | 61224→1965 | 172800088 | 9109504 | 0 | 0 / 0 / 0 | 0 / 0 |
| video-faststart | 15072→1944 | 193508554 | 29383269 | 0 | 1 / 1 / 0 | 96754277 / 121197 |
| video-tail | 9589→1982 | 193508554 | 29635786 | 0 | 1 / 1 / 0 | 96754277 / 121197 |
| final-leave | 2719→2604 | 19791814 | 0 | 9163545 | 5 / 5 / 0 | 9895907 / 14798561 |

前测合计1917完整原件IPC响应、2608262764B。后测0旧IPC，原件HTTP **68128559B**（1041 reads）、缩略图HTTP **67512903B**（1090 reads）；两类合计135641462B，不与388726486B生成逻辑输入相加冒充盘IO。391 attempts、178成功生成、175cache hits、116440314B发布PNG输出。最终缓存116440314B/178文件（quota256MiB），HTTP最大块65536B。

列表/画廊阶段原件HTTP均为0。原件HTTP只在真实激活媒体阶段出现。第二轮滚动仍有148 attempts、70次成功生成、128hits：第一轮并未生成所有样本，因此这是部分缓存复用，不是完整热缓存、更不证明全画廊零重新解码。暖重载有2hits/0成功生成，但15个文本SVG失败attempt仍记入逻辑输入。

## 覆盖、可见性与功能限制

| 人口 | 注册 | 成功acquire请求 | 唯一成功附件 | 唯一失败-only | 未到后端 |
| --- | ---: | ---: | ---: | ---: | ---: |
| raster | 450 | 351 | 169 | 0 | 281 |
| textSVG | 50 | 0 | 0 | 50 | 0 |
| WAV | 1 | 1 | 1 | 0 | 0 |
| 视频 | 2 | 4（2poster+2original） | 2 | 0 | 0 |

文本SVG共213次thumbnail acquire均返回`unsupported_media`；没有用原图fallback制造成功。前测浏览器原件路径覆盖全部503附件（含SVG），后测覆盖/解码工作显著不同。281个raster没有后端acquire，与前端有界队列及离屏撤出策略一致，但工具没有记录每项撤队原因，不能把281全部断言为已证实的撤队。内存表只描述这次混合工作负载，不换名为450raster-only，也不对等比较图像解码内存收益。

画廊仍502卡（500图+2视频），前测scrollHeight37167、后测37230；两者宽1227/高890。后测gallery-open、两轮滚动的settled snapshot均是10个image节点、5loaded、5visibleLoaded；其余5个节点的可见性/ready状态未逐项采集，故不能据此证明全部可见卡最终ready。source acquire观察记录visible/prefetch，不等于最终解码成功。

## 各阶段帧间隔与长任务

| 阶段 | rAF n 前→后 | p50 / p95 / max ms 前 | p50 / p95 / max ms 后 | >50ms任务次数 / 总ms 前→后 |
| --- | ---: | --- | --- | --- |
| startup-cold | 69→69 | 16.7 / 16.8 / 183.3 | 16.7 / 16.7 / 266.6 | 1 / 199→1 / 282 |
| startup-hot | 65→65 | 16.7 / 16.8 / 350.0 | 16.7 / 16.7 / 249.9 | 1 / 356→1 / 269 |
| gallery-open | 53→68 | 16.7 / 33.3 / 233.3 | 16.7 / 16.8 / 233.3 | 3 / 462→2 / 366 |
| gallery-scroll-1 | 789→812 | 16.7 / 16.8 / 150.0 | 16.7 / 16.7 / 33.3 | 0 / 0→0 / 0 |
| gallery-scroll-2 | 826→811 | 16.7 / 16.8 / 50.1 | 16.7 / 16.8 / 16.8 | 2 / 113→0 / 0 |
| gallery-leave | 123→117 | 16.7 / 16.8 / 116.7 | 16.7 / 16.8 / 100.1 | 1 / 134→1 / 112 |
| audio-90min | 3641→98 | 16.7 / 16.7 / 366.6 | 16.7 / 16.8 / 300.0 | 2 / 426→1 / 301 |
| video-faststart | 832→99 | 16.7 / 16.8 / 350.0 | 16.7 / 16.7 / 266.7 | 8 / 1182→1 / 288 |
| video-tail | 523→102 | 16.7 / 16.8 / 350.0 | 16.7 / 16.8 / 283.4 | 4 / 814→1 / 293 |
| final-leave | 139→137 | 16.7 / 16.8 / 333.3 | 16.7 / 16.8 / 283.3 | 1 / 359→1 / 289 |

单次rAF/longtask不是输入延迟结论，阶段wall包括等待/固定700mssettle与observer成本。冷启动workspace-ready前611.5ms、后699.2ms；warm前720.4ms、后603.3ms。firstVisibleImage原始页面时钟、尺寸在JSON内；其他阶段的readyAt仍是该页面首次ready，不能把它当各阶段加载延时。

## 分进程内存峰值

单位MiB，每格前→后。JS heap、Chrome renderer RSS、Rust host RSS、Node桥RSS各自独立，不相加冒充App RSS。后测Rust包含同源Mac decoder worker；两者都不是Tauri/Android完整应用。

| 阶段 | JS heap | renderer RSS | Chrome总RSS | Rust RSS | Node桥RSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| startup-cold | 19.7→17.9 | 617.2→531.3 | 1195.0→1078.3 | 23.0→27.2 | 162.8→186.0 |
| startup-hot | 28.8→20.0 | 696.8→562.3 | 1308.1→1185.4 | 23.0→27.3 | 166.1→159.8 |
| gallery-open | 81.7→42.9 | 816.6→624.4 | 1393.5→1146.9 | 28.4→30.4 | 172.0→163.8 |
| gallery-scroll-1 | 156.2→71.4 | 1500.1→715.5 | 2055.5→1229.9 | 33.8→55.0 | 188.2→178.0 |
| gallery-scroll-2 | 169.2→60.8 | 1643.8→781.0 | 2237.8→1306.1 | 372.5→56.3 | 1282.7→194.5 |
| gallery-leave | 249.6→47.6 | 1348.3→748.5 | 1941.5→1263.2 | 372.5→34.3 | 1392.2→195.5 |
| audio-90min | 285.5→23.3 | 1823.1→735.8 | 2424.5→1334.6 | 373.0→34.2 | 1507.5→197.4 |
| video-faststart | 371.9→26.1 | 1382.1→855.4 | 1889.8→1472.7 | 372.5→51.4 | 1190.5→199.0 |
| video-tail | 513.1→41.3 | 1728.0→903.7 | 2427.8→1519.5 | 360.7→52.5 | 1232.6→175.3 |
| final-leave | 189.4→37.4 | 1254.9→928.3 | 2013.2→1549.6 | 366.0→68.4 | 1230.6→165.8 |

阶段RSS可能保留前序资源，尤其前测完整Base64/Blob与后测缓存/原生解码器；峰值归属不证明仅由当前阶段请求造成。自然保留与强制GC分开：

| 阶段 / 标签 | JS heap MiB 前→后 | renderer RSS MiB 前→后 |
| --- | ---: | ---: |
| gallery-scroll-1 / natural-retention | 104.8→59.2 | 1500.1→715.5 |
| gallery-scroll-1 / forced-GC-retention | 46.7→35.8 | 1298.2→647.9 |
| gallery-scroll-2 / natural-retention | 167.2→55.3 | 1086.6→773.6 |
| gallery-scroll-2 / forced-GC-retention | 未采集→37.3 | 未采集→706.6 |
| gallery-leave / forced-GC-after-leave | 15.8→11.3 | 887.8→681.2 |
| final-leave / forced-GC-final | 16.2→16.0 | 802.4→807.7 |

未采集标签保持缺失，不补0。强制GC是诊断动作，不代表日常自然回收，也不能证明没有原生泄漏。final phase真实保持open note，测得6 active leases /0 active streams；不能为了归零卸载产品。最终新5个1024px thumbnail请求属于选中`images000`笔记，DOM7图/4loaded/3visibleLoaded。原trace release行没有lease hash，无法精确重建剩余6租约的owner/purpose库存；不能把5个新增owner候选当完整库存，也不据此判定泄漏或全部合法retain。

## 长媒体真实结果

| 样本 | 前测 | 后测metadata ms / 完整duration | 自动初播 | 90% seek目标→推进 / ms |
| --- | --- | ---: | --- | --- |
| audio-90min | WAV无src，60s超时；未初播/seek | 474 / 5400s | 按钮后自动推进，302ms观察窗 | 4860→4860.343 / 416 |
| video-faststart | metadata 13494ms，初播/seek通过 | 426 / 96s | 按钮后自动推进，301ms观察窗 | 86.4→86.734 / 436 |
| video-tail | metadata 8031ms，初播/seek通过 | 416 / 96s | 按钮后自动推进，301ms观察窗 | 86.4→86.768 / 484 |

每个媒体激活前该owner原件acquire数0，点击产品`播放`或`播放视频 <文件名>`后为1；未直接赋src/load，也没有初次programmatic play来补产品失败。后段seek仅设置currentTime并恢复play。后测完整duration分别5400s/96s/96s。`firstPlayMs`是metadata后固定约300ms观察窗口，不是精确首帧时间；音视频原生Mac/Android首帧/RSS/ATS/cleartext仍留101。前测调用旧播放器媒体元素play，后测要求按钮autoPlay，所以初播数值不能解释为同一用户输入延迟。

## 冷暖、磁盘与后续审计

冷定义：新owned Chrome/profile与Rust进程、空派生缓存；未清OS页缓存，样本SHA验证会预热盘缓存。暖定义：同进程reload/缓存保留，Playwright routing禁浏览器HTTP cache且服务no-store。前测最小空闲约18.24GiB，本后测最小5.72GiB，未触发2.5GiB停机；两者系统内存/磁盘压力背景不完全一致，不做统计显著性声明。

旧precise-tooling startup3的22次legacyIPC/3443151B历史保持，和本正式后测0legacy结果分开。activation1为正式前的独立5phase检查，不混入run1统计。准确harness/frontend来源与同源Mac provider摘要均留artifacts；无native App包/ADB/用户库操作。7条未映射image/svg+xml、encoded0事件不能归为受管文件传输；受管network被取消请求的encoded长度未知时留null，不能用0补齐。

独立审计应重新运行下述纯复算命令，核对raw SHA、各阶段累计计数与总体相等、覆盖与失败分布，再审阅本报告；本作者不自审通过。

```sh
node scripts/performance/report-media-after.mjs artifacts/media99-baseline-run4 artifacts/media99m-after-run1 artifacts/media99-fixture artifacts/FRESH-media99m-recomputed.json
```
