---
id: app-mobile-recording-wave60
scope: mobile recorder playhead and axis internal geometry against preserved video
status: done
depends-on: [app-mobile-recording-visual59]
---

## objective

2026-11-05源码窄范围已接收：作者b5d008a、证据0db24aa、独审9f63dd8按序合入c61c132/848e0ec/0fc94e5。root typecheck/build通过，[主线接收](../../verification/mobile-recording-wave60-root-integration/README.md)限定SOURCE-READY / PIXEL-OPEN / DESKTOP-RASTER-OPEN；未入新APK，手机现场保持。done只指本任务局部源码和独审完成，不代表录音父目标或设备验收完成。

后续构建补充：准确主线a236b311已生成[Android构建13](../../verification/unified-candidate06/android-recording-wave-build13/README.md)并独立核包通过，含本任务60、未安装；不包含63诊断。上段“未入新APK”保留主线接收当时范围，当前包以此补充及文档索引为准。

缩小已存原暂停帧n0960与准确59手机录音视图的黄色游标底部、轴标签位置和字号差异，推进原版像素目标。原手机现场由用户明确保留，禁止设备/音频操作；本任务只源码与真实共享视图。59已独审并合入，Mac17/Android12为fa21657构建，当前6f37f77仅追加交接记录，产品同59。

## context

阅读docs/INDEX.md、docs/ui/recording-mobile.md的60/59规则、docs/research/mobile-recording-wave60-readiness/README.md、docs/verification/mobile-recording-visual59/README.md及独审。原帧docs/research/mobile-recording-sequence-01/representative/frame-n0960.png为224×480；59基线392×840、DPR2、整幅等比例LANCZOS降至224×480。原图所有动态/系统区域与排除项保持，不遮罩、不拉伸拟合，不伪造原波形。

原游标[111,104,114,268]，59[111,104,114,252]；首标签阈值220原[20,273,36,278]、59[20,260,33,264]。完整wave框已约y104.07..269.01。已有30逻辑px内部预留截短游标，直接给整个wave加高会在窄高侵入提示，因此只校准手机内部playhead/axis/label。

## path

优先且预期唯一产品文件src/RecordingPanel.css的仅mobile局部选择器；必要验证脚本scripts/check-mobile-recording-wave60.mjs与docs/verification/mobile-recording-wave60/作者证据。设计更新仅本任务引用的60节必要最终值。禁止改src/recording-waveform.tsx、RecordingView、Session/Panel/Dock/owner/transport、App/全局style、保存/权限/native或依赖。默认保留sample区域不变，不能凭空反推振幅。超范围报告具体依赖，不能顺便修其他图形。

## contract

保持完整wave top15.9%/height36.9%、100px/s/quarter ticks/seek、59计时/播放/notice/retry位置与44px触达。校准游标内部bottom及axis位置、height、label font/line-height/padding，使参考比例墨迹接近原。允许参数候选实测选择；不增加整个wave高度，不裁剪标签。axis容器、刻度、标签框/溢出完整有效区域不得侵入真实notice/retry或计时区。至少在392×840、320×568、280×600可用；若短高需响应式减小标签留白，先保持清晰与真实命中，披露无原版参考的工程约束。

RecordingView→RecordingWaveform→实际CSS的链由原组件挂载验证；触摸/拖动仍发既有seek，confirmed position不预测变动，滚动notice不应误seek。实际samples输入可做区域/裁剪回归但不称原图振幅一致。桌面同props普通与深色图像/DOM/全部computed/几何保持59基线。

## verification

先保存准确基线同尺寸图/几何，再原/旧/新三方同原比例、叠图/原始diff、固定命名ROI及至少两阈值label墨迹、游标bbox和变化像素/MAE，完整图不遮罩。原系统/真实样本/日期/排除转写/材质动态差异仍报告，不能拿指标下降授整体pixel pass。

受控共享View按真实状态投影核初始/录制/暂停/播放中、dark/忙碌/真实长错误，三窄高实际touch/drag、notice滚动与retry/seek位置请求、disabled动作保持。明确action sink仅视图派发；不以测试替身证明媒体/native链。只对受影响区域做必要回归和typecheck/build，59未触及行为不重复完整矩阵。最终源码先提交，证据可分提交绑定准确源码；不同agent独审后root合入，再决定准确新手机包构建。所有首次失败/旧图/工作树保留，原Android不操作、不备份、不安装、不停止、不重启、不导出或转写。
