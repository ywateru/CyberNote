---
id: app-recording-playback56
scope: saved local audio media URL lifecycle
status: source-ready-runtime-pending
depends-on: [app-recording-presentation55]
---

## objective

Mac15真实录音暂停前缀Blob可实际播放，但最终保存卡MediaError4、时长未知，正常重开仍复现。先修正主窗音频资源边界并以真实新包证实；不得据候选推断根因已确定。现有录音、A/B、数据库均保留，不读取或导出新录音来分析。

## contract

主窗已保存音频从现有readAttachment base64返回构造保留原MIME和字节的Blob object URL，供现有createAudioPlayback使用；图片等非音频边界保持原行为。只允许可信附件返回值，不接收任意路径。资源归属随附件加载代次，换附件、卸载、迟到读回和失败均必须释放已建URL，不让旧结果替换新附件；播放控制器先停播清理再释放URL。失败使用现有可见重试，不假造时长或可播放状态，不做转写、转码、数据库/权限改动。子窗capture/唯一Session和55双呈现不改。

## evidence and limits

证据为docs/verification/recording-window54-mac-runtime/14—20，准确源5a147d2、Mac15；Editor现有readAttachment转data URL，child用Blob URL，二者最终/暂停字节不同，因此仍有终止容器等其他可能。有限受控检查要求字节/MIME一致、代次失效与URL释放、真实Audio原错误/重试路径；保留首次失败。独立审查后root精确同源双端构建，CUA实际录制/保存/重开/播放确认；未通过前不称已修复。证据限制在docs/verification/recording-playback56及-independent。

独审4ca29a8 SOURCE-READY，八组实际组件与额外两组独立资源边界、构建通过，证据e24540f。主线源身份/独审重核/整合Notes并行与音频资源检查见docs/verification/recording-playback56-main-integration。真实包验收仍待完成。

准确Mac16/9167db9上，保留的A54长录音44:58卡片实际播放位置0.55→15.05秒且正常暂停，原主窗SecurityOrigin失败路径有限通过，见verification/recording-presentation55-runtime/01—02。没有导出或认定可听性。新Mac录音仍遇原生权限等待；Android构建10预览实际推进通过，保存被目标校验拦截，57修复前无法验保存后/冷启播放。本任务保持部分设备通过，不以源码或旧包全盘追认。

同准确Mac16正常退出（只读pgrep确认旧进程无匹配）→按封存路径重开PID80059，A54文字与单卡保持，真实播放0.25→29.60并暂停29.95，±15至14.95再回29.95，见runtime/11—13。这条冷启播放范围通过；未据此扩大为新录音保存链或所有编码/可听性通过。
