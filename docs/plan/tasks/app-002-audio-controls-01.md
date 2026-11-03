---
id: app-002-audio-controls-01
scope: mobile-local-audio-transport-touch-reachability
status: in-progress
depends-on: []
---

## objective

修复11/4新APK3edc4ad0实际发现的移动音频卡片展开不可达。既有66秒媒体真实显示1:06、audio初始0/paused，主metadata仍Infinity；但移动CSS隐藏audio-expand，开发一次原生summary双击未展开range，正文反而获焦并出现键盘。该冻结失败在`../../verification/f07-audio-integration/android-developer01/`，不把时长成功写成±15/拖动通过。

本任务以已合入的AudioPlayer源码为起点，独立修复其安装验收暴露的既有控件可达问题；不等待尚受本问题阻塞的父播放器全项验收，也不倒写父任务已通过。

提供手机触摸可达且有可理解无障碍语义的现有播放进度/前后15秒入口。原录屏36–38秒仅显示紧凑卡片与播放胶囊，没有展示展开手势，精确单/双击原版规则未知；本任务不宣称补证不存在的原版手势或完成完整播放器像素校准。紧凑卡片保留已证标题/时长/播放的可见结构，优先让文字/卡片自身承载可达操作，不为修可达性添加录屏没有的永久额外图标或技术说明。

## context

`docs/requirements.md` F09/F14/F15、`docs/architecture.md`播放器与授权边界；`app-002-audio-duration-01.md`及独立source报告；上述新包真实失败。已保全原录屏和mobile-recording-sequence-01有限补证只作为参考，不把无法观察的动作当既定事实。

## path

仅`src/Editor.tsx` AudioPlayer/AudioPlayerSession、必要的音频卡片CSS段与生产helper/定向检查。不得改Editor/schema/组字、App/bridge/附件操作、Rust/依赖、录音或绘画；不得改package.json，与附件前端任务保持文件分离。基线必须含主42b2631和现有AudioPlayer修订。先隔离源码候选/独立审查，再统一包实测。

## contract

1. 真实手机触摸能展开/收回现有进度和±15按钮；不依赖浏览器合成dblclick才能操作。卡片控件处理事件时不误触正文编辑、选区变更或唤起IME；播放按钮只执行播放/暂停，不同时展开两次或误触正文。
2. 控件支持其语义对应的键盘/无障碍操作，展开状态可识别。窄屏不横溢/重叠，触摸目标可用；紧凑卡片几何/文字和已证播放胶囊保持，未知原版展开外观/手势继续注明限制。
3. 沿用真实createAudioPlayback controller、有限时长与可见错误/重试；不另造媒体、改currentTime初始化或通过假时长启用控件。展开/收回不自动播放，不覆盖用户seek，不改正文/附件/存储。
4. 非移动既有双击/箭头和播放器生命周期保全，src变更/卸载释放及晚结果拒绝保持。不要只在独立演示组件接线，真实MediaView/NodeView触摸必须可达。

## verification

候选typecheck与必要生产事件边界检查；独立复核真实NodeView/React接线，避免只测CSS常量。统一新APK上使用既有66秒受管附件，原生触摸展开→播放暂停→拖动约30秒→±15→两端→收回，核实际main currentTime/paused/range和未自动跳转。完整JSON/revision/原字节SHA保持、IME不误起；不得DOM click/state写入替代触摸。保留原失败及确切新包身份，独立实测前不标done；非移动smoke和pixel结果分别记录。

## source delivery · 2026-11-04

源8a8f995/8893bed由独立审查判SOURCE-READY，无产品blocking；主ae35bc3/41131ae整合后四项输入hash与冻结blob/manifest均相同，见`../../verification/app-002-audio-controls/main-integration.json`。独立typecheck、11组生产helper、真实NoteEditor→ReactNodeView→MediaView→AudioPlayer的Chrome156可信触摸/range/±15/键盘与原WebM/WAV错误/生命周期回归通过。报告`../reviews/app-002-audio-controls-static-01.md`，证据`../../verification/app-002-audio-controls-independent-01/`。

标题/时长区域为真实button，展开状态可读，无永久新增图标；播放、箭头、双击与range事件保持各自语义，触摸不落入正文。该源码及离线浏览器结果不替代Android91/系统IME或Mac安装包，旧3edc4ad0失败保持，统一新包实际尚待。

## source candidate 01

基线6fd3bf8的隔离源码候选已完成标题原生按钮/NodeView事件边界/44px移动触摸区修复，保留紧凑文字与播放胶囊，无新增永久图标。typecheck、11组播放helper、真实NoteEditor→NodeView离线触摸/键盘与既有真实媒体浏览器回归通过；JSON/选区/revision未变。报告及确切限制见`../../verification/app-002-audio-controls/README.md`。尚待独立审查和统一新APK原生触摸/IME实测，status保持ready，不宣称Android、macOS或像素验收已通过。

## candidate02 developer runtime

2026-11-04：fabafcf冻结219输入一致，新APK a50dded8实际保数据安装并读回hash同；开发原生触摸标题展开/播放暂停/range29→44→29、4.6→0、61.3→66.004及收回通过，IME未误起。媒体完整正文/revision30、纸张正文/revision58、附件metadata/429547B原SHA前后精确一致。主audio初始duration仍Infinity，末端seek后平台变66.004；HTML step0.05使value66、实际time66.004，分别记录。54项manifest与原始动作/截图见`../../verification/f07-audio-integration/android-developer02/`。设备已交独立实际，任务仍in-progress，原版展开语义/完整像素与Mac未追认。
