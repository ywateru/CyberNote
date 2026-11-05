# task58 录音可见几何独立复核

结论：准确产品源 `8a30547514588d1ba6f35eb3c9d2564eb1ee637d` 为 **SOURCE-READY**；Apple Notes 完整像素验收保持 **PIXEL-OPEN**。本轮没有发现阻断该几何改善的源码回归。基线为 `50144def5e99e2eb2df20f90dd8aa60596d92769`。独立分支 `verify/recording-visual58`，独立目录 `/private/tmp/apple-notes-recording-visual58-independent-01`。作者证据从 `569de68355e85e7367d057c4d9b0a54b546d2bdf` 导入为本树 `d249b39`，只作为复核依据，不当作独立执行。

本轮只读取源文件、已有参考截图/录像抽帧、作者证据，并在 Chrome 中实际渲染共享 `RecordingView`。未操作原生 GUI、设备、麦克风、用户音频文件、数据库、安装包或 Rust/native 构建。用户已明确暂缓手机设备验收，原有 13 秒录音现场保持不动；本结论不构成手机设备、原生窗口、音轨可听性或 WebKit 验收。

## 独立实际执行

`baseline-first/result.json` 与 `candidate-first/result.json` 首次执行均 PASS，`errors=[]`、`external=[]`；空 stdout/stderr 日志保留。基线通过 Git 中三个原视图文件在同一 fixture 实际加载。候选使用证据目录内 `check-recording-visual58-independent.mjs`，在作者冻结检查之上增加下列边界，不修改产品文件。

- 同一真实视图中点击可见 `00:03` 请求 3000ms；点击、拖动、ArrowRight、Home/End 和真实 touchscreen tap 的请求与绘制比例一致。保持投影位置 2700ms，未因发出 seek 请求就预测确认。
- 100 CSS px/s 同时用于样本、主刻度、小刻度和指针定位。2700ms、280 CSS px 宽时，三个 2/2.5/3 秒样本中心为 `[70,120,170]`；主刻度为 70、170、270；可见四分之一秒刻度为 `[20,45,95,120,145,195,220,245]`。主轴 border 为 0px，标签刻线距文字起点 2px。亮/暗投影均无继承的灰色渐变。
- 新 ±15 图形仍触发且仅触发原后退、播放、前进、继续、完成动作；保存忙碌时关闭/播放/跳转/主动作/完成的程序点击不会发出动作。这里只证明视图回调，实际媒体与保存 ACK 契约另审作者证据。
- 280×360 CSS px 长错误与重试投影实际截图保存；计时、播放行、重试、底部动作矩形互不相交，6 个动作中心均在面板内且 `elementFromPoint` 命中真实按钮。长错误是既有 36px 可滚动窗口，截图只显示开头；未以此声称整段错误同时可见或已验证滚动操作。
- 手机 idle/recording/paused 的 header、waveform、timer、playback、footer 的实际矩形完全相同；共享时间比例改变后未重排这些已有区域。该检查不证明其与原视频位置相同。

复现时设置 `PLAYWRIGHT_CORE_PATH=/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs`、`CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`。基线用 `node scripts/check-recording-visual58.mjs <独立输出目录> --baseline`，候选用 `node docs/verification/recording-visual58-independent/check-recording-visual58-independent.mjs <独立输出目录>`。需串行运行浏览器检查，避免共享 Vite WebSocket 端口冲突。不得覆盖本目录保存的首次执行。

## 原版、旧版、新版图像证据

桌面原图使用已跟踪截图精确裁剪 `(1999,164,2559,1098)`，得到 560×934 图像像素；独立旧/新实际渲染为 280×467 CSS px、DPR2，输出同样 560×934，无尺寸拟合。这里的 DPR2 是明确工程条件，不证明参考原图 DPR。`comparison/desktop-three-way-independent.png` 每列保持原尺寸，仅增加 30px 顶部文字。叠图各占 50%，差分图为逐通道绝对差；无遮罩、无差异增强。

相同黑色阈值 `max(R,G,B)<80` 及固定局部搜索区域得到以下图像像素墨迹 bounds；右/下边界为 exclusive。金色阈值及全部 ROI 见 `measure-images.py`，结果见 `comparison/metrics-independent.json`。

| 项目 | 原版 | 旧版 | 新版 |
| --- | --- | --- | --- |
| 标题墨迹 | `[34,48,120,75]` | `[33,38,126,67]` | `[33,46,117,73]` |
| 计时墨迹 | `[185,670,376,702]` | `[181,618,380,652]` | `[186,672,375,704]` |
| 中央播放三角 | `[267,745,299,781]` | `[267,735,297,773]` | `[267,743,297,781]` |
| 黄色游标 | `[274,130,288,542]` | `[276,152,286,490]` | `[274,132,288,542]` |
| 完成金色圆 | `[449,822,529,902]` | `[448,822,528,902]` | `[448,822,528,902]` |

计时顶缘误差由 52 降至 2 图像像素，游标高度接近原版，时间轴整秒距离从 80 改为 200 图像像素，与参考 200 相符；四分之一秒为 50。完成圆仍左偏 1 图像像素，播放三角顶缘和形状仍不同。完整桌面图的平均绝对通道误差（0–255）从 12.6594 降至 4.6475；任一通道差值大于 16 的像素比例从 6.7242% 降至 3.9760%。这是描述性改善，不能用作像素相同的通过阈值；大面积底色、不同样本和状态也影响指标。

手机参考为224×480有损录像抽帧 n0960。受控392×840 CSS px、DPR2输出784×1680，再等比例 LANCZOS 缩至224×480；只作粗几何对照。`comparison/mobile-three-way-independent.png` 保留系统状态栏、Home、不同日期、转写等真实差异。时间比例在视频坐标从22.857改为57.143 px/s，接近参考约57.5。特意选择覆盖原/旧/新轴位置的 union ROI `[0,245,224,285]`，其 MAE 从5.2629降至4.3080，差值>16比例从9.3862%降至5.6138%。黄色游标 bounds 原 `[111,104,114,268]`、旧 `[109,104,114,252]`、新 `[111,104,114,252]`：横向改善，底端仍比原图高16视频像素，为未改变的纵向残差。

所有主比较均使用普通 paused、Continue 可用的真实红色投影；原图 Continue 为灰，其精确媒体状态无法由截图证明。作者额外 playing+不可继续投影已审阅，但与原版播放三角状态不一致，不计为同态通过。三个 fixture 样本仅为明确受控幅值，不代表原音频，未作波形幅值相同声明。原生材料/底角、字体与日期间距、播放三角与±15箭头圆弧、手机播放图形大小/位置、转写及系统区域差异均保持 PIXEL-OPEN。

## 源码及既有矩阵复核

准确 diff 只有3个产品文件和2个检查：`RecordingPanel.css`、`RecordingView.tsx`、`recording-waveform.tsx`、`check-recording-visual58.mjs`、`check-recording-interactions50.mjs`。视图日期拆分与局部图形、录音作用域 CSS、统一时间比例未改变 Session/Owner 协议。指针测试手势40/80改100/200 px，仍保持原1秒到2秒的媒体语义与确认后再提交下一个 seek 断言。

`source-unchanged.json` 独立核对五个输入与执行前清单、准确8a305475源码逐字节相同；Session、coordinator、Dock、Panel、window transport、App 六个关键文件与基线及当前树逐字节相同。已有源图 SHA 也相同，审阅者未修改产品。

审阅作者最终12组 Panel/Session、8组 Presentation 结果、准确manifest和构建执行：均 PASS、无记录错误/外部请求，`pnpm build` exit0（7.39秒，已有大 chunk 提示）。覆盖真实媒体确认、pending/playing禁用继续、±15边界、关闭同File等待ACK、浮窗/右栏同Session/stream/media、错误身份与过期ACK拒绝、目标可见失败保留源等。按照根任务指令复用作者充分证据，未重复这些矩阵或构建；不冒称独立执行20组或重新构建。

## 首次失败和分析修正保留

独立浏览器检查没有失败。第一次图像分析失败于当前环境缺少 numpy，保留 `measure-images-attempt01.py` 与 `analysis-first-failure.log`；没有安装依赖。改用现有 Pillow/标准库后第二次完成，保存 `measure-images-attempt02.py`、`analysis-second.log`、`comparison/metrics-independent-attempt02.json`。随后发现计时几何搜索区域从y650起会截掉旧版y618顶缘，第三次仅把墨迹搜索区域扩为y590–716并重新生成最终结果，保存 `analysis-third.log`。图像误差ROI仍使用固定y650–716，未借修正改变其评分区域；原截图、实际执行及全部首次结果未覆盖。作者的首轮端口冲突、首次缺numpy、后续串行通过记录亦已阅读，仍保留于作者目录。

最终结论范围仅为本次可见几何改善和受影响受控交互：SOURCE-READY。完整原版像素一致、原生材料和用户暂缓的手机设备验收保持 PIXEL-OPEN。

证据封存首次暂存因仓库全局 `*.log` 忽略规则退出1，具体范围与处理保留于 `staging-first-failure.txt`；仅在本证据目录显式重新包含根层日志，仍排除缓存和二进制。未更改产品或省略首次日志。
