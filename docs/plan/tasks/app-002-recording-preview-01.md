---
id: app-002-recording-preview-01
scope: paused-recording-preview-and-skip-controls
status: pending-review
depends-on: [app-002-recording-state-01]
---

## objective

把手机原录屏暂停态已显示的播放、前后15秒操作接到真实录音快照，不放空按钮。继续和完成保持当前真实采集与最终File语义；父保存仍由app-002-recording-submit-01负责。参考docs/ui/recording-mobile.md及docs/research/mobile-recording-next-01/analysis.md第7节，不重复取帧。

## scheduling and path

独立worktree实施，仅RecordingPanel、RecordingSession、录音专用CSS及必要的小型预览接缝/定向检查。不得改App/bridge/SaveQueue/附件协议/Rust/依赖，不改正文AudioPlayer外观或普通播放契约。当前父候选8ee0111已冻结独审，若出现blocking优先回原分支修父候选，本任务暂停在自己工作树。candidate03只包含其已排定来源，本预览候选独审后进入下一安装包，不让本任务推迟candidate03构建。

## layout and behavior

```text
初始/录制                 暂停
大计时                   大计时/真实回放位置
灰 ↶15  ▶  15↷           就绪后 ↶15  ▶/暂停  15↷
红圆/暂停       完成灰     红继续                完成金
```

保持已证三态的中轴和区域位置；小屏采用实际安全区和足够触摸区域。自定义可访问按钮接真实audio，不展示浏览器默认controls冒充原版。未就绪或不支持的快照保持不可用并显示实际错误，不能只把按钮变黑。首次暂停仍显示录音活动计时；播放期间若显示位置必须来自实际媒体事件，停止播放后恢复录音活动计时。这个播放期间显示选择是工程决定，原视频未操作播放，不能声称原版已实证。

## recording and preview boundary

MediaRecorder非终态前缀没有标准可播放保证。本任务只能先实现最小可验证快照：等待真实暂停状态，串行requestData/实际数据事件，复制实际MIME和截至该次的累计chunks；保留主chunks，不把快照送onStopped/onDone，不为回放stop主录音，不直接拼多个完整MP4/WebM容器。若所测目标不能实际播放/定位前缀，明确失败并交回重新选择完整快照方案，不能用计时值或假音轨补齐。

每次暂停快照有独立代次，重复请求去重或明确串行。继续、完成、取消、卸载、采集错误先封旧回放入场；停止播放、dispose播放器/探测，再revoke URL。晚数据、play Promise、seek/metadata不能复活旧音频或写新代次。快照失败不销毁仍能继续/完成的主录音；主录音真正失败仍走既有释放路径。最终stop仍等末块且只生成/提交一次同一File。

复用现有生产播放控制器与预览URL能力；避免复制时长探测/清理逻辑。duration、按钮可用性与定位能力来自真实媒体，不填RecordingClock作媒体时长。前后15秒按实际可定位范围约束并在seeked/实际currentTime确认后表达结果；控制器乐观发布time或有限duration本身不算定位成功。若必须改变共享控制器，先明确影响并覆盖其原边界，不让正文卡片行为无依据变化。

## verification

定向检查穿过实际Panel/Session与生产播放控制器，覆盖暂停快照不终止采集、不丢/重复最终块、重复请求、继续后再暂停、无数据/不支持前缀、快照与完成/取消交错、晚play Promise、URL及所有资源释放。原Panel17与Session26只对受影响边界回归，另做typecheck。受控媒体与时钟用于错误竞态必须披露；不能以受控结果证明设备可听。

独审通过后新包在确切Mac WK和Android WebView版本分别验证：首个短暂停从头播至尾、继续后累计快照、超过15秒的真实前后定位并继续推进、完成后正文音频与冷启保持、取消时无晚播放。记录实际MIME、文件身份、实际媒体事件与位置。生成音轨只可用于模块测试，不代替真实硬件音轨验收。可听性、原版精确回放显示/手势与逐像素继续分别记账。

## source candidate 01

开发自检已冻结，待独立审查；[源码、边界和原始验证记录](../../verification/app-002-recording-preview/source-candidate-01/README.md)。snapshot/adapter15、既有Session26、共享播放11、实际Panel24及typecheck通过，合计76项定向检查。仅受控平台事件，未验真实编码前缀/WK/Android/可听性/原版像素。candidate03不包含本候选，独审后进入下一包。

## candidate01 review

dc33152独审01为BLOCKED/P2：媒体错误重试沿用旧ready，尚未重新loadeddata/canplay便开放播放。15+26+11/typecheck在冻结时通过；同树跨源修改期间headless24归属INVALID不计通过，原日志保留。下一候选窄修此门禁，root另建独立review树复核。01证据与报告已保全主docs，不合入其产品代码。

## source candidate 02

候选01独审P2指出媒体错误重载沿用旧ready，01结果BLOCKED保留；候选02仅在录音adapter重载前关ready/清定位等待，并新增真实Panel和模块回归。模块16、Panel25、独审P2原复现及typecheck通过，待新的独立工作树审查。详见[候选02](../../verification/app-002-recording-preview/source-candidate-02/README.md)。候选01 README关于普通AudioPlayer位于App的文字更正为Editor，旧证据保全。
