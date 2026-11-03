# 暂停回放候选 01：独立源码审查

2026-11-04。候选 `dc3315208cbfa40049639f7748189376ad2763b6`，基线 `48120ab2aa4831f03fcb04cf5478e666a1b09492`。结论：**BLOCKED／P2，等待重载后就绪门禁修复。** 结论限此冻结候选；不是 candidate03、WK／Android 真实前缀或可听回放验收。

## 阻塞发现

**[P2] 媒体重试沿用旧 ready，使未重新就绪的播放器提前开放播放。** `src/recording-playback.ts:167` 的 `retry()` 只清 seek 错误并调用共享 `player.retry()`，没有清内部 `ready`。实际生产共享控制器在 mediaError 分支发布初始状态（清 mediaError），随后 `audio.load()`；adapter 的 publish 却仍组合旧 `ready=true`。已发生“首次加载 ready → 媒体错误 → 点击重试”时，在尚未出现新 loadeddata／canplay 且 `audio.readyState=0` 的阶段，对外仍 `ready=true`。实际 Panel 以 `!previewState.ready` 控制播放按钮，`toggle()` 也仅检查这个旧内部 ready，因此新一轮加载前允许发起播放，违背本任务“未就绪保持不可用”的门禁。

独立最小复现为 [`retry-readiness.mjs`](../../verification/app-002-recording-preview-independent-01/retry-readiness.mjs)：直接加载冻结生产 adapter、Session URL helper 和未改共享控制器，媒体平台受控。原始 `retry-readiness.stdout.txt` 观察 `mediaReadyStateAfterRetry=0`、`adapterReadyAfterRetry=true`、`playCallsBeforeDataEvent=1`；`retry-readiness.stderr.txt` 保存期望 ready=false 的失败断言。stdout 同时保存三个生产源 SHA，与冻结身份一致。不是浏览器实际解码、硬件或可听证据。

修复应局限录音 adapter：开始新的媒体加载时清除原就绪／定位能力与旧定位等待，只能由该加载的真实媒体事件重新取得能力；覆盖错误重试后到新就绪事件前不可播放，以及重新就绪后正常恢复。无需放宽共享正文播放器或借假 duration 提前开放。

## 已检查的实际接缝与边界

静态沿实际 Panel.primary／preparePausedPreview／effect／finish／cancel／submit，Session.pause／snapshot／dataavailable／resume／stop，以及 production adapter → unchanged createAudioPlayback 审查。快照不 stop 主录音、不清累计 chunks；继续／完成／取消先失效代次，播放器与 probe dispose 后才 revoke URL；最终 File 仍由原 onstop 链生成。±15 使用媒体 seekable 范围，忽略共享控制器乐观 time，并等待 seeked／非 seeking／实际 currentTime 容差确认。上述正确局部不抵消 P2。

dataavailable 无请求 ID、timeslice 可能充当下一个事件，因此旧 issued slot 只能排除已知旧占位，不能证明某 requestData 的编码排空或尾部完整；候选已准确披露该限定。非终态前缀没有标准可播放保证，未获得设备证据前不能升级为 WK MP4／WebView91 WebM 可播或可定位通过。

独立重跑时源码仍为冻结 candidate：snapshot／adapter 15、原 Session 26、共享播放 11 及 typecheck 均 exit0。这里只回归受影响模块，未重跑广域旧矩阵。实际 Panel headless 检查首次因本机服务 listen EPERM 失败，保留原日志；必要权限下重试 exit0，但**执行期间作者已在同一工作树开始 candidate02 窄修**，没有逐请求源身份，故该 24 项结果与截图归属 **INVALID／不计本候选通过证据**。所有原始输出保留于 independent-01/browser，详见 `headless-attribution.json`，没有追补旧候选 headless。

冻结六项源码身份与作者清单匹配；在作者开始新 WIP 后，额外保护边界只用 `git show <exact-commit>:<path>` 读取冻结内容，未读产品 WIP。13 个完整保护文件与基线逐字相同，包含 App、Editor、bridge、SaveQueue、共享播放器、附件 helper、时钟、Rust 和依赖，见 `frozen-boundaries.json`。

另有非阻塞文档定位错误：作者 README 将普通 AudioPlayer 定义写在 App，实际位于未改 `src/Editor.tsx`；作者已确认，应在后续更正中注明，不改写 01 历史证据。`src/AudioPlayer.tsx` 不存在的身份记录本身是事实。

## 交接与限制

独立证据位于 [`docs/verification/app-002-recording-preview-independent-01`](../../verification/app-002-recording-preview-independent-01/)，manifest 排除自身。P2 已及时通知 root／作者。临时 node_modules 链接已移除，原工作树已释放供作者冻结修复；下一候选由 root 另建审查树，避免共源。没有改产品、构建、target、可见 GUI、设备或下载；无原生编码、可听、父 ACK 或原版像素结论。候选 02 必须单独复核此复现、实际新加载能力与受影响生命周期，不能以 01 的跨变更 headless 输出补足。
