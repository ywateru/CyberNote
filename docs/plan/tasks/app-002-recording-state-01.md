---
id: app-002-recording-state-01
scope: production-recording-panel-initial-pause-finish-and-clock
status: pending
depends-on: [app-002-recording-extract-01]
---

## objective

依原视频已观察的初始、录制中、暂停继续与暂停直接完成，修复真实RecordingPanel的局部状态和活动计时。原录屏26.767–27.933秒稳定为00:00.00/红圆/灰完成，30.767秒起为固定00:02.60/红继续/金完成，35.100秒直接收起；当前组件挂载自动开始、暂停不能完成、额外StopCircle是明确差距。原物理触点仍unknown；本任务采用显式点击红圆开始实际采集作为实现选择，不宣称录屏已证明该tap。

此任务仅局部状态SOURCE-READY。正文持久ACK、原目标operation与取消晚IPC由attachment-submit及后续录音父接线负责；不能用onDone resolve冒称现有App已完成这些语义。

## context

docs/INDEX.md、docs/ui/android.md、docs/architecture.md录音契约、docs/research/mobile-recording-sequence-01/README.md与docs/research/mobile-recording-next-01/analysis.md；app-002-media.md、app-002-recording-extract-01.md与app-002-attachment-submit-01.md。基线须为纯抽取已独立通过并主合入后的HEAD。

## state and layout

```text
┌────────────── 新录音 ──────────────┐
│取消          当天/时间         完成│
│            真实采集波形           │
│              00:00.00             │
│                 ●                 │ 初始：红圆，完成灰且disabled
└───────────────────────────────────┘
       ↓ 显式开始（原触点未知）
录制中：活动计时 / 红暂停 / 完成disabled
       ↔ 暂停：计时冻结 / 红“继续” / 完成enabled
       → 完成：内部真实stop，等末块/onstop → 保存中
       → onDone reject：同一最终File保留，可见错误，可重试
```

1. 挂载idle，不自动请求权限/开始采集；开始动作一次进入requesting，经production RecordingSession实际开始后才录制。多次开始/暂停/继续/完成不能生成并行session或重复父调用。
2. 使用单调时钟累计实际recording区间，pause冻结、resume接续，tick仅重绘。采集尚未开始不计时；setInterval晚调度不丢失活动时间。该UI计时不能写为文件duration或音轨有效证明。
3. 暂停态Done内部调用真实stop并等待最后dataavailable/onstop，非空且实际MIME有效后构造一次最终File，再await既有onDone。录制中Done维持disabled，不额外要求用户先点stop。finalizing/saving禁止重复提交，失败保留可重试File及实际错误；重试复用同一File，不重录或再stop。
4. 保留production采集释放、preview URL清理、错误/取消/卸载和晚权限/onstop门禁。cancel/Back局部只负责自身资源与晚组件回调；对父已发送的IPC不能宣称已撤销，父接线仍单列。失败不得提交空Blob/假音频卡片。
5. props维持onCancel:()=>void和onDone:(File)=>Promise<void>，组件不接note/access/Editor/store。App当前吞错/提前关闭缺口不在此偷修；完整保存语义须后续父ACK接线。暂停回放/±15/转写与完整材料/动画仍另列，不能添加无功能可点按钮或假转写凑图。

## path

只改src/RecordingPanel.tsx、必要src/recording-session.ts及局部计时helper、录音专用CSS与定向检查/任务证据。不得改App/bridge/Rust/Store/依赖、audio-card/Editor/绘画样式；共享样式仅限明确录音选择器，优先专用组件样式。与附件提交候选保持文件边界。不独自构建、占GUI/设备或target。

## verification

typecheck与受影响的既有26项资源清理回归。定向检查必须挂载实际生产组件并使用production RecordingSession，受控媒体/时钟替身边界明确：idle零采集、一次start、pause/resume、暂停时间冻结与延迟tick、Done等待末块且恰好一次父调用、reject保留同File重试、空/异常最终事件、重复Done、取消/卸载/晚权限/晚onstop。不复制状态机写镜像测试。

提交冻结后独立审查与必要复跑。SOURCE-READY后仍需与父附件ACK接线在同一新包串行实际验证，原生进入初始/开始/暂停/继续/完成、资源状态/同附件/完整正文与冷启分别记账。模拟静音不计可听采集，224×480压缩参考不计高清像素通过。
