---
id: app-002-audio-duration-01
scope: finite-local-audio-duration-and-player-errors
status: in-progress
depends-on: [app-002-permission-01]
---

## objective

修复新APK dba83641实际录音附件卡片`0:00`的问题。既有真实getUserMedia/MediaRecorder静音流已编码为429547B Opus/WebM，受管附件`cb3fa001-9d73-4580-b959-38481fbba90b`被正文引用，ffprobe有1101 packets、最后pts66.004+0.060秒；真实HTML audio可播放但duration为Infinity。该事实只支持媒体容器与有限播放流程，不能证明可听采集。开发冻结证据在`docs/verification/app-002-media/android-candidate01/`，最终报告为准。

## context

`docs/requirements.md` F09、`docs/architecture.md`录音/播放契约、`docs/research/media-roundtrip-readiness/analysis.md`与上述真实证据。先核当前AudioPlayer与实际metadata/seekable/buffered状态，使用当前受管合成音频，不重复录音或开启宿主麦克风。方案须说明媒体派生的有限时长如何取得，以及是否影响正常有时长媒体。

## path

限`src/Editor.tsx`的AudioPlayer及必要实际生产媒体helper/定向检查，文档与证据。不要改Editor/schema/组合输入、App搜索/附件提交流程、Rust/依赖或录音面板。不存在前端接线的替代播放器不算交付。

## contract

1. 对可解码完整本地媒体取得真实有限时长，正确显示分钟秒、进度范围和前后15秒边界。不得用UI录音tick、文件大小、硬编码66秒或未完整buffer的前缀假装媒体时长；未知时长与0秒须区分。
2. 正常有限metadata路径保持，不自动播放或发出声音，不在完成metadata处理时覆盖用户已发生的进度/播放动作。若使用平台seek解析，必须有界、可取消、错误可见，并恢复正确初始/用户位置；不能无限循环seek、让错误流阻塞正文或设非有限currentTime。
3. 附件切换、授权失效与卸载后晚事件不能更新新附件状态；真实play rejection和媒体decode/error必须显示可理解错误并允许合理重试，不能空catch。URL与资源保持既有归属/清理边界。
4. 不声称解决录音暂停完成、保存失败回传、可听音轨或全页像素。不能为时长问题重新编码或覆盖既有受管原文件；若确需容器持久修正，应先提出实际最小方案再调整任务范围。

## verification

源码候选须穿过真实生产helper/播放器边界覆盖有限metadata、Infinity后有限解析、媒体错误/play拒绝、卸载与晚事件、用户已seek不被回调重置；避免仅复制实现常量。独立静态后统一构建。真实安装使用既有约66秒合成附件，冷启读取、有限duration/显示、播放暂停/中部拖动/±15秒和起止边界分别记录，音轨保持静音。必要Mac smoke核正常路径。未实际跑的行为为unknown，不以ffprobe文件时长冒充HTML播放器已修复。

## source candidate · 2026-11-03

已将独立、静音、一次有限seek、15秒截止的媒体探针接入真实AudioPlayer，正常有限metadata不启用探针。未知时长显示“时长未知”，媒体错误/play拒绝可见并支持手动重试；播放器和探针在src变更/卸载后清理，晚事件/Promise不更新新实例。前端通过生产helper的11组定向检查、真实播放器Chrome156离线检查、typecheck及现有editor回归。记录：`docs/verification/app-002-audio-duration/README.md`。

此状态只表示源码候选。Android91安装/冷启、中部拖动与±15秒、Mac smoke仍待独立统一包验证；不将Chrome离线结果升级为设备验收，不涉及原音频重编码、录音暂停完成、父保存补偿、可听采集或像素一致性。

## independent source and unified build · 2026-11-04

独立审查已通过，报告`../reviews/app-002-audio-duration-static-01.md`，源码ae567ef、身份清单64b59aa、独立报告f4d3a02。独立复跑11组生产helper及真实AudioPlayer离线Chrome156序列；约66秒原WebM由静音探针得到66.004秒，主播放器保持初始0/paused，正常2秒WAV不建立探针。ffprobe packet-end66.064和完整decode66.060不混作平台duration。

统一输入冻结在f4d3a02，216项aggregate `a6b191546c39f2bf1c431e7547228a2714f79e355376a686380c89efd2299939`，Mac与Android构建后均不变，default features，无proof。APK `/private/tmp/notes-f07-audio-android-candidate01-3edc4ad0.apk`，301366970B、SHA256 `3edc4ad07524f630d694c0695cbde34bc4a02aa3c36f1fba0bd44a8de80574bf`。构建证据`../../verification/f07-audio-integration/build-candidate01/`；Mac完整bundle本地adhoc派生包`/private/tmp/notes-f07-audio-mac-candidate01-sealed.app`，strict verify通过、exe SHA256 `11dcbfc41dc28f1917c38804691cdda37c49cbb6022d0c776185fd0ca01fc759`；原始未seal包与失败签名日志保持。安装实际仍待验收，不把该构建状态写作Android91时长或Mac运行通过。
