# MEDIA105 formal run2：作者结果，待独立核验

本轮顺序执行唯一 baseline→after，未修改工具、产品、阈值，未重建或追加实验。**after 完整通过；baseline 在冷访问接近底部时触发30秒当前视口超时。本轮不是双方完整同阶段成功的性能比较。** 作者不承担独审。

证据根目录为 `artifacts/media105-formal-run2/`。`author-summary.json` 是从实际 raw 派生的摘要；`raw-sha256.json` 冻结133个原始/PNG证据文件，共30,409,177逻辑字节。两侧逐项复算入口为 `ledger.json`、`coverage.jsonl`、`source-links.json`、`network.json`、原 transport/media JSONL、`phases.json`、`result.json`。没有清理当前缓存或证据。

## 身份及执行

- `preflight.json`：产品 fingerprint `a5b783239e3a2372a013a50ed73b72d4751d134c5e3285579095edafa91c9bb9` /445输入；最终3工具及补丁 `af3774bf…` SHA通过。Chrome157.0.8103.40 executable/framework 精确SHA两侧前后通过。baseline沿用九文件/binary pins，历史dirty源码绑定限制不变，没有重建。
- 冻结503原件715,371,216B；manifest `3ee2813c…`、SQLite `67c89bf5…`，逐原件SHA前后通过。Store仅复制SQLite、hardlink原件；没有fixture/font副本。
- 固定1440×1000、≤0.5H、500ms dwell、100ms采样、30s viewport、45min/side，预算均未放宽。开始free25,405,091,840B。此前其他项目的短build已结束；常驻dev Vite及idle Gradle daemon未终止。
- session21239 exit1、47513 exit0；host42505/49785、Chrome42506/49787、companion70418全部退出。定向进程检查无owned runner/transport/companion，见摘要teardown。

## baseline失败的准确范围

startup完成；冷图像历史ledger为450/450 raster、50/50 textSVG decoded，无图像显式错误或图像timeout。完整gallery屏障仍失败：`last-viewport.json` 的scrollTop36045、clientHeight890、scrollHeight37167，处于**向下接近底部**，不是回程。

未settled两卡为冻结样本501/502：`48499677-3087-43c5-87ad-5eb52ef08a4e`、`4014e99e-e641-4819-8ee1-ac3cbf1c1b11`，visible=true、image=null、productError=null；实际read IPC526/527均成功，各96,754,277B。现有 `settle105` terminal统一要求img decode或明确错误，原生video card没有img时持续等待。这是交独审确认的工具kind兼容阻塞候选，不能据此称产品图片加载失败，不能因500历史decoded撤销失败。

失败栈、`failure.png`、最后视口及实际IPC全部保留。未进入warm、baseline媒体激活/seek或ROI。baseline实际legacy IPC524calls/651,763,963B，含视频原件预取；after激活前zero门槛没有强加给旧版。baseline runtime计数不可用，保持null。

## after覆盖及长媒体

- 冷首访500/500、warm500/500，分别450raster及50textSVG。没有never目标，因此无补访/warm-position阶段；cold/warm各174步完整down/up。无product pageerror、显式图片错误、timeout或source-join失败。
- 50个实际480px gallery HTTP PNG，经当次DOM/source/实际IPC/wrapper/grant/HTTP绑定后分析，全部RGBA等于同生产带字参考；同源去字对照397–424像素变化，ROI外变化0。逐项PNG/source/reference SHA见 `after/svg-roi.json`，原始响应在 `after/svg-http/`。分析16,865.886ms在主测及产品进程关闭后执行，不计产品覆盖/IO。
- WAV及两MP4均真实product-button点击，各自激活前original acquire=0；无初次脚本play/src/load。完整duration及实际时间推进、90%seek全部成功：

| 样本 | duration s | metadata ms | rear seek ms | seek后推进到 s |
|---|---:|---:|---:|---:|
| 90min WAV | 5400 | 1074 | 429 | 4860.351323 |
| faststart MP4 | 96 | 851 | 493 | 86.72723 |
| tail-moov MP4 | 96 | 855 | 464 | 86.73001 |

## 阶段、滚动和内存

| after阶段 | wall ms | rAF p95/max ms | long tasks 次/ms | JS heap峰 MiB | renderer RSS峰 MiB | Rust RSS峰 MiB | Node RSS峰 MiB |
|---|---:|---:|---:|---:|---:|---:|---:|
| startup-cold | 1571 | 16.8/400.0 | 2/469 | 16.5 | 392.5 | 39.3 | 135.3 |
| gallery-cold-first-pass | 202720 | 16.8/366.6 | 3/596 | 83.5 | 723.5 | 71.9 | 392.0 |
| gallery-warm-pass | 147291 | 16.8/183.3 | 0/0 | 92.1 | 1160.8 | 80.1 | 671.0 |
| gallery-leave | 1797 | 16.8/166.7 | 2/233 | 81.1 | 1074.7 | 83.2 | 683.8 |
| audio-90min | 2511 | 16.7/800.0 | 2/803 | 81.2 | 1126.9 | 90.8 | 694.0 |
| video-faststart | 2821 | 16.8/566.7 | 1/575 | 57.9 | 1037.1 | 85.5 | 700.1 |
| video-tail | 2494 | 16.7/599.9 | 1/598 | 48.7 | 1054.2 | 78.5 | 706.0 |
| final-leave | 2450 | 16.7/483.3 | 1/494 | 61.8 | 1082.1 | 89.5 | 738.3 |

baseline startup wall1061ms、readyAt843.1ms；after startup wall1571ms、readyAt881.1ms。首次可见图片均落gallery phase，尺寸/时间见摘要，不能当startup thumbnail速度。baseline冷阶段未关闭，phase wall=null；partial rAF/longtasks/采样RSS单列 `author-summary.incompletePhaseObservations`，没有补造完整阶段。

RSS每500ms采样、进程范围分开，JS heap不是renderer全部内存。未强制GC、未清OS页缓存，fixture校验可能预热OS页。没有完整baseline同覆盖同phase结果，不计算百分比性能收益。

## 三类字节分开

以下来自真实生产runtime counter。HTTP派生文件读取可重复传输同一PNG；登记logical input是每次生成attempt登记的源大小，不是decoder实际pread或物理IO；output是实际发布encoded PNG字节。

| after阶段 | HTTP original读取B | HTTP thumbnail读取B | attempts/successes/hits | 登记源logical input B | 发布encoded PNG output B |
|---|---:|---:|---:|---:|---:|
| startup-cold | 0 | 0 | 1/1/0 | 44,222 | 17,526 |
| gallery-cold-first-pass | 0 | 541,207,502 | 567/567/428 | 644,656,504 | 281,105,210 |
| gallery-warm-pass | 0 | 538,106,686 | 74/74/900 | 233,014,325 | 13,714,123 |
| gallery-leave | 0 | 148,124 | 8/8/0 | 2,195,649 | 164,809 |
| audio-90min | 9,830,400 | 80,067 | 2/2/0 | 2,712,859 | 2,818,567 |
| video-faststart | 29,383,269 | 0 | 1/1/0 | 96,754,277 | 121,197 |
| video-tail | 29,635,786 | 0 | 1/1/0 | 96,754,277 | 121,197 |
| final-leave | 0 | 2,879,764 | 2/2/0 | 4,006,283 | 5,878,396 |

真实起终点总量包括phase之间的自然异步工作，故不要求等于phase delta之和：HTTP original68,849,455B/1052ops；HTTP thumbnail1,082,490,252B/17610ops；attempts/successes/hits660/660/1328；logical source1,082,157,225B；encoded output304,036,322B。HTTP total1,151,339,707B/18662ops，最大单块65,536B。

cold end cache491files/267,943,315B，quota268,435,456B；warm end同值。warm74次真实再生成、900hits，不能称全cache命中。生产cache quota eviction路径、实际gauge及新增发布支持容量替换，但没有独立eviction事件计数；不能仅凭HTTP大字节推断淘汰。

after最后自然gauges13leases/0streams、cache489files/267,903,465B；metrics不暴露active owner/purpose清单，不凭历史acquire列表伪造当前归属。随后所有owned进程正常关闭，未通过强制卸载制造测量末端zero。Blob创建/存活均0。

## 限制及冻结

本轮是混合450raster/50textSVG及三长媒体的实际App、生产Rust/Mac provider和Chrome结果，不是独立450-only内存实验，不替代Tauri ATS、Android/WebView或真机。单轮冷暖无统计重复；新Chrome157协议不能直接与历史Chrome156/99M169覆盖当相同协议比较。可见性是100ms采样区间，queue撤销原因仍unknown。

raw与作者摘要已冻结交不同代理复算。本轮未修baseline工具边界，未追加实验。父级根据独审决定后续gate。
