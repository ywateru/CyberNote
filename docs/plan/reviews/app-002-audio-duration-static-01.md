# APP002 AudioPlayer · 独立静态审查 01

日期：2026-11-04（复跑开始于 2026-11-03 跨日会话）。审查者：native_ui_research，未参与本候选 Editor.AudioPlayer 或 audio-playback helper 的实现。

结论：**SOURCE-READY；没有发现阻断源码整合的 finding。** 该结论只允许进入统一构建和安装验证，不代表 Android WebView 91、macOS 实际应用、可听采集或 Apple Notes 像素验收通过。

冻结候选：`/private/tmp/apple-notes-audio-duration-01`，HEAD `9680fdcc344788517f5c6f3efdbbac4cb79439da`；源码提交 `288e6d5`，比较基线 `0505534`。任务：`docs/plan/tasks/app-002-audio-duration-01.md`。原作者记录：`docs/verification/app-002-audio-duration/README.md`。本次独立证据：`docs/verification/app-002-audio-duration-static-01/`。

## 审查范围和结果

| 边界 | 生产实现与独立检查 | 结论 |
| --- | --- | --- |
| 有限 metadata / 真实零时长 | `finiteDuration` 接受非负有限数，有限 metadata 直接采用且不创建 probe；`null` 显示“时长未知”，0 显示 `0:00`。既有 helper 复跑和实际 2 秒有限 WAV 路径均通过。 | 通过 |
| Infinity 时长 | 只有真实播放器 metadata 就绪且仍非有限时，才创建独立媒体元素；仅接受该元素后续给出的有限 duration。没有把 seek 目标、文件字节数、buffered/seekable 前缀或 UI 录音 tick 当成长度。 | 通过 |
| 有界、可取消、无声 probe | probe `muted=true`，没有调用 play；每次尝试只允许一次 `currentTime=1_000_000_000` 有限 seek，有 15 秒截止。成功、失败、主元素有限 metadata、手动重试替换和 dispose 都移除监听/截止、pause、移除 src 并 load。直接 cancel 和晚事件检查通过。 | 通过 |
| 用户进度和播放 | probe 与实际元素独立，完成只更新 duration/error；没有改实际 currentTime/paused/play。helper 的等待期间用户 seek/play 用例通过；实际播放器中部 seek、±15 秒和两端夹紧复跑通过。 | 通过 |
| 主元素错误与重试 | 同步 play throw、异步 play rejection 均可见；decode/error 可见并手动重新 load；时长失败手动重建 probe；seek 失败重试原请求位置。load/时长/seek 重试不会自动 play。 | 通过 |
| src/卸载/晚事件 | `AudioPlayerSession key={src}` 为每个 source 创建独立 DOM 与 controller；dispose 先撤销 live/playAttempt，再清 probe/主监听与媒体资源。异步 play 结果受 live 和 attempt 双重约束。helper 和实际旧 DOM error/timeupdate 复跑不污染新实例。 | 通过 |
| 原编辑器及范围 | 候选仅改 `src/Editor.tsx` 和新增 `src/audio-playback.ts` 两个产品文件；减去 helper import 后 AudioPlayer 之前字节相同，DrawingView/NoteEditor 整段后缀字节相同。App、schema、组合输入、Rust、依赖与锁文件均未改。冻结 manifest 逐文件 hash 核对通过，原保留 WebM hash 未变。 | 通过 |
| 旧 WebView 边界 | 新 helper 使用现有构建可处理的函数/闭包、Promise、基本 Number/Math/String 与 HTMLMediaElement 事件/方法；没有新增 AudioContext、AbortSignal、容器重编码或新的 polyfill 依赖。既有 Vite target 为 chrome90。**这些静态事实不证明 WebView 91 的媒体管线能在一次有限 seek 中取得 duration。** | 等待安装验收 |

## 本次独立验证

- `node scripts/check-audio-playback.mjs`：11 组通过，输出保存为 `controller-result.json`。它直接转译并调用生产 helper，媒体元素为公开披露的 EventTarget fixture，证明控制状态/生命周期；不证明设备解码或 React 实际生命周期。
- `pnpm typecheck`：通过，保存为 `typecheck.txt`。
- 原封不动运行 `scripts/check-audio-playback-browser.mjs`，仅提供已有外部 Playwright 和 Chrome 路径，结果保存为 `offline-chrome/result.json`：真实 React 渲染生产 AudioPlayer、真实 HTML 媒体与保留 429547B WebM，通过。实际浏览器仍为 Chrome `156.0.8078.80`；没有 Android/Mac GUI 操作、安装或包构建。
- 实际 WebM 初始主 duration 为 Infinity；独立 probe 给出 66.004 秒，summary `录音 · 1:06`，range max 66.004，实际元素初始 currentTime 0 且 paused。中部 30 秒、±15 秒、0 与结束边界通过。有限 WAV max 2 且不增加 probe。play rejection 为脚本公开故障注入；损坏 WAV 的媒体错误为浏览器实际产生，两者均显示错误并可重试。probe 全部从未 play、卸载后无 src 且 paused；外部请求及 page errors 均为空。
- `integrity.json` 保存冻结 HEAD、产品 hash、编辑器未修改区域 hash、manifest 核对和原音频 hash。`git diff --check` 通过；复跑后删除临时 node_modules 链接，冻结产品没有改动。

离线 browser 首次运行因本地监听权限返回 EPERM，未生成成功证据；随后以既有授权启动仅本地、独立临时 profile、输出静音的 headless Chrome 复跑成功。没有连接用户浏览器、设备或麦克风。完整 PCM decode 和 ffprobe 结果只作为原作者策略研究的旁证，本次成功断言来自实际生产播放器复跑。

## 合入后的验收门槛

1. 在实际 Android 11/API30/WebView91 安装统一新包，用现有受管约 66 秒附件冷启读取，记录有限 display/range、中部拖动、±15 秒与起止边界。平台若无法完成有限 seek，应保持“时长未知”并显示可重试错误；不能把桌面 Chrome 成功写作 Android 成功。
2. macOS 实际应用跑正常有限 metadata 路径 smoke；本审查没有提供该证据。
3. 录音暂停直接完成、父保存失败补偿、可听音轨和原版全页像素仍是其他任务，不能由本次 SOURCE-READY 推导完成。

有限大 seek 的适用性由平台实现决定，极端超长媒体或不支持此解析方式的格式可能保持未知；生产有明确失败路径和手动重试，当前范围无需扩展为无界完整 PCM decode。该限制已在原候选说明中披露，没有发现需要阻止源码整合的新风险。
