---
id: app-mac-recording-autosave64
scope: Mac finalized pause checkpoints and safe automatic close save
status: in-progress
depends-on: [app-recording-presentation55, app-mac-recording-diagnostics63]
---

## objective

按2026-11-05用户要求，Mac暂停自动保存完整可播放音频，保留窗口可继续累计；关闭录音窗口完成最新音频与原A正文保存，再关闭。同逻辑录音、一张可见卡、无听写。用户明确请求是本契约变更依据，不另等确认。

## context

docs/INDEX.md、docs/ui/recording-desktop.md“暂停/关闭自动保存64”、docs/plan/analysis/mac-recording-autosave64.md、docs/architecture.md、50/55/57/63任务及独审。准确源提交后再独审，开发/验证分离。

## path

src/recording-session.ts或新的桌面分段/PCM helper、RecordingPanel.tsx、RecordingWindow.tsx、recording-coordinator.ts、recording-window-transport.ts、recording-metadata.ts、recording-live-card.ts、App.tsx，必要RecordingView.tsx与桥接类型；src-tauri/src/recording_window.rs仅版本final路由保护。新增64 scripts、作者证据docs/verification/mac-recording-autosave64/、必要文档。backend实质变更先向root说明，默认复用immutable journal，不改DB/schema/通用附件字节身份。旧证据、63诊断、CSS、手机设备与旧trees保持。

## contract

1. Mac暂停先终结当前MediaRecorder分段，等真实最后dataavailable/onstop；完整分段解码后累计合法WAV。继续复用原stream和session开新分段，不重新授权、不计暂停/保存间隔。不得拼接独立MP4/WebM、以非终结prefix冒充可靠媒体或丢片段。固定声道/采样率、明确内存/100MB文件上限；越界/解码/收尾失败保留已ACK版本和可重试原音频，错误可见。手机保留现链，不改既有行为。
2. 暂停→累计File→checkpoint revision N自动提交。成功须音频落盘及A正文真实ACK，窗口保留。checkpoint/final确认分开，带准确revision；旧ACK/hello不回退、不销毁、不混淆File。关闭同步封住新录音操作，排在在途checkpoint后，准确final ACK后唯一destroy；失败保留视图与音频重试。
3. 固定session/开始日期，revision单调，每版固定File和独立operation UUID；同版重试不换字节/ID。首次映射bookmark插入，后续在A最新正文中精确定位上一ACK音频节点原位替换。缺失/重复/Undo删除或真实权限、归属、editor、外部版本失效须失败保留，不回退插入、不改B、不抢焦点、不回写旧快照。保留原SaveQueue/AccessGate真实ACK。该版替换已派发但ACK失败时识别本版已在正文，重试只等自己的ACK。
4. 旧版在被替换前须query确认committed（JS ACK不会更新journal），保留旧文件供Undo/历史。候选无正文ACK不宣称已保存；checkpoint不finishRecording或seal ticket。live decoration与持久卡不重复显示，final后撤投影显示最新正常音频卡。内部保留多版本的磁盘/归档空间代价必须如实记录。
5. Close包括系统红色关闭、×、Escape、owner转发/退出屏障。未开始/权限等待关闭无空卡、迟到流释放。录音中Close终结保存最新分段，暂停保存中Close不丢意图、不被旧ACK终结。后台/失焦/切笔记/切呈现不暂停或重采集；owner关闭仍保活，quit等真实final。owner-loss、ACK不确定、重复提交/Close、destroy失败可重试且不重复卡。
6. 63、授权次序和30/35/45秒既有边界保持，无TCC重置、签名放宽或请求循环。受控测试不冒充真实麦克风/像素，设备仅root后续协调。

## verification

冻结准确source。覆盖真实分段终结和PCM/WAV字节/顺序/时长/声道采样率，无暂停间隙；暂停A正文ACK不关窗；多次续录最终一张最新卡；编码/传输/stored/等ACK中Close、重复Close、旧ACK、丢回执；A编辑停放切B与后续替换不改B/焦点；节点删除/Undo不重插；文件/正文/解码/零数据/100MB/收尾超时失败不丢原音频；权限等待取消、迟到清理、float↔dock不重录。挂载生产Window/Panel/Owner及实际App闭包/PM/SaveQueue，注明受控边界。

真实SQLite/附件测试证明：前版ACK+query committed后，新候选未ACK/中断再open保留前版；最新版ACK后重开正文仅一张新卡且媒体正确；同旧op换字节继续拒绝。只用合成临时库/音频。pnpm typecheck/build及必要50/55/57/60回归。原生编译与root协调串行。独审绑定准确源，独立重跑竞态和持久化。
