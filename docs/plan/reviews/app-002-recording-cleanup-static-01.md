# APP-002 录音采集清理候选独立静态复核 01

2026-11-03，独立 verify；冻结候选 `/private/tmp/apple-notes-media-roundtrip-02`，HEAD `0b29cc0f3f79bb473f38dcfa578f88af787178ff`，产品基线 `67ce948`。本轮没有修改实现、构建、安装或操作 Mac/Android。Android 已交给 develop 继续旧 `5dd6dfc8d31812c2bafcff5115d9946456ff6d37028f2caed174585c91ca0ca2` 包的真实媒体基线；原 emulator 前台会话保持，不清 data。

## 结论与合入门槛

在本报告列出的实际接线与受控失败/晚事件范围内，未发现本候选新增的明确阻断问题，静态复核 ready。**这不是合入放行：必须先完成冻结旧 `5dd6dfc8…` 包的现有 getUserMedia/MediaRecorder 真实媒体基线，再由 root 决定合入及候选构建，随后独立复验候选。** 本轮不能证明麦克风可用、音频编码有效、可辨识音轨、系统采集指示、重启播放、系统中断或 UI/像素一致，也不能将 APP-002 标为完成。

## 实际接线和边界

- `src/App.tsx:3726` 的挂载 effect 实际构造生产 `RecordingSession` 并调用 `start()`；录制、停止、波形和错误回调更新面板。清理闭包持有本次 `capture`，先 `dispose()`，只在 ref 仍指向该实例时清空，旧权限请求不会复用新实例。不是只新增未接入的辅助类。
- `src/App.tsx:3763` 的取消先同步 dispose，再调用父级取消；父级清 `nativeAttachmentTarget` 并 `setRecord(false)`。Android Back (`:924`) 和敏感内容清理 (`:586`) 通过条件渲染卸载触发同一 effect 清理。此处是源码链路核对，没有挂载 React 或实际按 Back 的运行结果。
- `src/recording-session.ts:72` 在清理前取走并置空 timer、source/analyser、tracks、context 的所有权；每项同步释放单独尝试，一个 track.stop 抛错不阻止其余资源释放。`dispose` 先将 live 置 false，`fail` 先将 failed 置 true，然后解除 recorder 回调、丢弃未交付 chunks 并释放；旧 data/stop/error/ended/timer 不再回写面板。
- `src/recording-session.ts:135` 权限晚 resolve 后只释放该旧 stream 的 tracks；晚 reject 经 accepting 门禁静默。构造 recorder、start、AudioContext/analyser/source/connect/timer 准备失败及 pause/resume 异常进入同一失败路径。App 仅在 pause/resume 返回 true 后更新正常状态，错误回调不会再被正常状态覆盖。
- 正常 stop (`src/recording-session.ts:222`) 先设置 stopping，立即释放采集资源，保留最终 recorder dataavailable/onstop；自己的 track.stop 不作为断开错误。onstop 解除 handler、再次幂等清理，组装原 recorder.mimeType 的 blob，finished 后抑制重复最终事件。取消路径则不发布 blob。
- 浏览器生产绑定仍为 audio-only getUserMedia，MIME 顺序 webm/opus → mp4 → webm → 默认，`MediaRecorder.start(250)` 与实际 Analyser API；本批没有替换原生插件。录音挂载仍自动开始，时间累计算法未变。
- `src/App.tsx:3747` 在 blob effect 创建预览 URL，替换/卸载时回收同一 URL；移除了 render 内每次创建。独立测试核对创建一次、重复 dispose 只 revoke 一次；没有以此推导实际播放器可播。

`AudioContext.close()` 是异步调用。代码捕获 rejection；仍有效且未完成的会话可转入失败，已 dispose/finished 的会话不再回写 UI。受控测试证明调用与晚回调门禁，**不证明浏览器已物理关闭资源或异步关闭成功**。权限或最终 stop 事件永久不返回也没有新增超时恢复，本轮未将这一点当作已解决。

## 保留的原有缺口

本次 App diff 限于 RecordingPanel 接线与预览 URL，父级 `onDone` (`src/App.tsx:3209`) 未修改：先 storeAttachment，再插入正文、关闭面板及 refresh；父级 catch 调用全局 fail 后吞掉 rejection。因此面板自己的保存 catch 仍不能可靠收到父级保存失败。完成仍要求 blob (`:3781`)，暂停态不能直接完成；在途保存取消、附件写入后正文插入失败的补偿、重复重试去重也未改动。这些是 `docs/plan/tasks/app-002-media.md` 已列的后续工作，不属于本候选清理通过所覆盖的行为。

## 独立执行结果

| 检查 | 本轮结果 | 证明范围 |
| --- | --- | --- |
| `node scripts/check-recording-session.mjs` | 26 项 pass，exit 0 | 转译并执行真实生产模块，平台录音/轨道/音频节点/URL/时钟均为受控替身；包括准备失败、权限晚到、单项清理失败、最终块、旧事件、会话隔离及生产 MIME/audio-only 绑定 |
| `pnpm typecheck` | pass，exit 0 | 当前前端源码类型检查 |
| `pnpm test:native-toolbar` | 12 项 pass，exit 0 | 既有顶部生命周期/事件门禁；不是 React 挂载、IPC 或录音设备验收 |
| `git diff --check 0b29cc0^ 0b29cc0` | pass，exit 0 | 候选提交空白检查 |

日志内“real analyser samples”指生产模块读取受控 analyser 返回值，不是实际声源或硬件采样。没有新增镜像实现的测试，没有运行 Rust/全量构建：本批没有修改 Rust、IPC 或持久化接口。

临时借用主工作树现有 node_modules 的符号链接完成上述检查，未安装/下载依赖，结束后已移除。检查起始 HEAD 为 `0b29cc0`，结束时并发 develop 将两份旧包端点观察文档保存为 `f1114a02b4aa2dd660304606246e293b5f070560`；`git diff 0b29cc0 HEAD -- src/App.tsx src/recording-session.ts scripts/check-recording-session.mjs` 为空，三项生产/测试输入身份未变，最终 worktree clean。该并发媒体观察报告不属于本次静态结论，未将其内容当作本轮独立设备证据。本轮记录与日志存于 `docs/verification/app-002-media/cleanup-independent-01/`。

## 源码身份

| 文件 | SHA-256 |
| --- | --- |
| `src/App.tsx` | `5c81e6d532d70c89c966a9c275406f1998421d83a898ca74b708d4b8b7352226` |
| `src/recording-session.ts` | `38a83851b3ee0234e7662f32cf9fed8e7019492b42e7c32bfd74af707eae11c0` |
| `scripts/check-recording-session.mjs` | `eb2148765f988d28841de89407a66e22e2ed4fbda07f1428c8136fb6c51f425a` |

三项均与候选开发者交付身份一致。独立报告和日志交 root 统一保存；verify 未执行主工作树 git add/commit。
