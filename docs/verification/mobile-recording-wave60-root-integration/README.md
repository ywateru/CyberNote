# 手机录音时间轴60主线接收

2026-11-05。接收范围仅手机游标与标签内部几何及受影响共享View输入，状态 **SOURCE-READY / PIXEL-OPEN / DESKTOP-RASTER-OPEN**。未生成包含60的新APK，未操作原Android现场，不追认Mac17/Android12包含60。

准确作者源`b5d008a25a9424f14f2e995cfd2557400cdb4614`、作者证据`0db24aa9434649f2ccd011daeecd9ebbb0ff2484`、独审证据`9f63dd85a1f2a1b84c76e9a1a25b15af946dbda6`依次合为主线`c61c132`、`848e0ec`、`0fc94e5`。root在0fc94e5运行`pnpm typecheck`、`pnpm build`，均exit0；完整输出保存在本目录。build保留原有大chunk提示，没有原生构建、安装或设备动作。

root逐路径Git比较确认：主线所有src和plugins及60检查脚本与冻结作者源完全相同；作者证据目录与0db24aa完全相同，独审目录与9f63dd8完全相同。代码/脚本/UI文档差异检查无空白错误。未改已封存原图、旧包、失败或缓存。并行63只有文档进入主线，其诊断产品实现仍隔离开发。

独审确认三尺寸392×840、320×568、280×600的标签完整padding/line box/文字Range/刻度均容于轴框，距notice/retry仍有7.03125/1.9375/2.890625逻辑px；九组解除裁切的完整轴内容带均零像素差。原slider下缘触摸、跨出wave拖动capture、确认位置不预测、长错误有/无retry滚动、44px重试及禁用投影通过。这些只证明真实共享组件View派发，不证明媒体或设备链。

新标签在220/235两阈值bbox分别[20,273,36,278]/[19,273,36,278]，与保全原暂停帧相符。游标强核心下缘由252到268，原强核心268、宽阈值压缩边缘269继续披露。独立完整timeline ROI MAE3.852207→3.552035、完整图14.334753→14.220319，只作局部改善描述。桌面本次独立normal/dark均0差；作者历史dark仍9像素、最大通道差1，独审重算保留，不授所有栅格完全相同。

详见[独立结论](../mobile-recording-wave60-independent/review-final.md)、[三方全图](../mobile-recording-wave60-independent/comparison/three-way.png)与[作者原件](../mobile-recording-wave60/README.md)。底部继续胶囊、部分图标/标题菜单、材质及完整像素仍有差异；已保存音频的改名/追加等交互仅有菜单观察，另见[62](../../research/saved-audio-menu62/README.md)。Mac新采集与采集中浮窗/右栏切换仍开放，用户保留手机约13秒未保存音频现场及暂停设备验收的决定继续有效。
