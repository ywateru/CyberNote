# APP002 · 有限录音时长与播放错误源码候选

日期：2026-11-03。隔离分支：`task/app-002-audio-duration`，基线：`0505534`。范围为 `Editor.tsx` 的 AudioPlayer、新生产helper `audio-playback.ts`、定向检查和本文档。App、Rust、编辑器schema/组合输入、录音面板、依赖均未修改；无包构建，无Android/Mac GUI操作。

## 问题与选择

既有真实Android MediaRecorder附件 `managed-recording.webm` 为429547B、SHA256 `cd7ee9692361fb3502775e8b7efc87ba0957ee22835f10e6d7335b09980fdf4f`。完整受管原文件保留在相邻 `../app-002-media/android-candidate01/`，未改写、重新编码、替换或写回。其初始HTML audio metadata为Infinity，旧实现错误显示0:00。buffered前缀不代表完整长度，不能用于修复。

生产实现保持正常有限metadata路径，仅当实际播放器加载了未知/Infinity metadata才创建独立HTMLAudioElement。探针预加载同一完整本地source、muted=true、永不调用play，最多执行一次有限的 `currentTime=1_000_000_000`；仅接受媒体平台后续提供的有限duration。无循环seek，也不使用seek目标、文件大小、UI tick、buffered/seekable末尾作为时长。平台无法解析、seek完成仍未知、error或15秒截止均保持未知，并显示手动重试。超过探针目标的极端时长或无法通过该方式解析的平台也可能保持未知；这是有界失败路径，不宣称支持任意长/任意格式。

探针不触碰用户播放器的currentTime、paused或play；完成仅更新duration。实际播放器的用户拖动和播放动作无需恢复，因而不会被探针的完成回调重置。实际metadata后来变为有限值时优先采用并取消探针。每个source使用独立React组件/媒体元素与controller生命周期。销毁时先撤销live和play尝试、移除事件，清deadline、停止/卸载探针与实际媒体；晚事件和play Promise无法更新后续source。移除src后显式load以结束旧媒体资源，不撤销调用者拥有的object URL。

未知时长显示“时长未知”并禁用seek；真实0秒仍显示0:00。已知时长的slider及±15s都按实际平台时长夹紧。播放失败、媒体解码/格式/读取错误、时长超时可见。手动重试分别重试播放、重新load媒体或重启独立探针；load/时长重试不自动播放。失败seek的重试只尝试所请求位置。播放重试仅由明确点击触发。

## 平台原始实验与资源考虑

同一完整录音在独立无头Chrome156中的结果保存在 `strategy/`，脚本 `probe-experiment.mjs` 可用已有外部浏览器工具重跑，未引入依赖。

| 来源 | 结果 | 意义 |
| --- | --- | --- |
| 原证据ffprobe packet timeline | 最后pts66.004 + packet0.060 = 66.064秒 | 包时间线，不等于HTML duration |
| Chrome156独立媒体探针 | 初始Infinity，有限seek后duration66.004秒 | 生产UI采用的媒体平台时间线 |
| 同文件Web Audio完整decode | 66.060秒、3170880frames、48kHz、mono | 证明该完整文件可解码；没有被接入生产fallback |

三种值分别保留来源，不宣称精确一致。UI格式化平台66.004为1:06。

完整decode方案会创建内存驻留PCM：本样本仅采样数据约12.7MB；时长/声道增加后增长，另有压缩数据和实现开销。Web Audio的decodeAudioData签名没有AbortSignal，关闭context也不自动释放所有已创建对象，因此未将无界完整decode作为每次附件读取的生产fallback。独立媒体探针避免应用侧全量PCM分配，依然使用浏览器媒体管线和同一data source，不声称浏览器内部内存有固定上界。单次seek与15秒deadline控制尝试次数/生命周期，不会在error状态留下持续context；本方案完全不创建AudioContext。

`Number.MAX_SAFE_INTEGER` 虽是JS有限值，实测probe的seeking事件出现内部currentTime=Infinity；该方案已排除，保留 `strategy/max-safe-integer-rejected.json`。生产仅使用已实测保持有限的1e9秒目标，记录在 `strategy/finite-independent-probe.json`。

研究参考官方原始来源：

- WHATWG HTML，Media elements / Loading the media resource / Offsets into the media resource：<https://html.spec.whatwg.org/multipage/media.html>。核实未知duration与durationchange，以及load重置/中断旧资源的行为。规范不保证对所有缺时长容器进行一次seek一定得到有限duration；该部分以真实Chrome实验为证、以失败未知兜底。
- W3C Web Audio，decodeAudioData、AudioBuffer、AudioContext.close：<https://webaudio.github.io/web-audio-api/>。核实异步decode、内存驻留32-bit PCM及close不自动释放所有对象。生产未使用该解码路径。

内置网页检索不可用；官方网页通过只读HTTPS取得相关前部章节，随后下载超时。未把不完整下载当成全规范审查；上述所用章节文本已实际读取，完整大文件未加入仓库。

## 验证结果

`controller-result.json`：直接转译并调用生产helper的11组检查，覆盖有限metadata/真实0/未知、Infinity→有限、仅一次静音probe、用户已seek/play不重置、实际metadata优先、未知/超时/媒体错误与手动重试、seek失败重试、同步play throw/异步rejection、卸载/换source晚事件、用户pause使晚Promise失效和直接cancel。

`offline-chrome/result.json`：实际导入 `Editor.tsx` 的AudioPlayer、实际React渲染和生产controller，Chrome156.0.8078.80，无头、输出静音、请求限本地源。真实保留文件产生：

- summary“录音 · 1:06”、range max66.004；实际播放器保持currentTime0、paused=true，起始HTML duration仍为Infinity。有限display来自独立probe，未伪改实际duration属性。
- 拖动30s、+15到45、-15回30；起点后退保持0，66s前进夹到66.004。
- 为实际元素注入一次play rejection，生产错误提示可见；恢复原play后，明确点击重试，实际静音播放推进再暂停。此rejection是披露的故障注入，不是设备原生失败记录。
- 实际损坏WAV由浏览器产生DEMUXER错误，UI可见且重试重新load；切换回真实WebM后，旧DOM晚error/timeupdate不污染新播放器。
- 独立合成2秒PCM/WAV只用于正常有限metadata路径，得到0:02/max2且无新增probe；未替换真实录音，也不作为实际采集证据。
- 所有独立probe从未play，完成/卸载后均移除src且paused。page errors与外部请求为空；真实文件SHA前后不变。

浏览器仅观察独立Audio构造器以记录probe事件与play调用计数，生产seek/cleanup/React控制未改；实际播放器play拒绝测试的注入单独披露。脚本使用已有外部playwright-core和Chrome，未添加仓库依赖。Vite缓存写在隔离工作树的忽略目录。

`typecheck.txt` 与 `editor-regression.txt`：`pnpm typecheck`、`pnpm test:editor`通过；后者运行真实schema的65文档用例及真实ProseMirror表格转换/Undo/Redo。`git diff --check`通过。

复跑：

```sh
node scripts/check-audio-playback.mjs
pnpm typecheck
pnpm test:editor
PLAYWRIGHT_CORE_PATH=/absolute/path/to/playwright-core/index.mjs CHROME_PATH=/absolute/path/to/chrome node scripts/check-audio-playback-browser.mjs docs/verification/app-002-audio-duration/offline-chrome
```

## 待独立安装验收

本批为源码候选与离线Chrome证据，Android11/API30/WebView91新包冷启、现有受管66秒文件的有限display/进度、拖动/±15s/起止边界仍为unknown；Mac实际应用正常有限metadata smoke也未运行。没有触碰现有模拟器或宿主麦克风，没有安装、覆盖或构建APK。此修复不证明录音暂停直接完成、父保存失败补偿、可听采集或Apple Notes像素一致性。
