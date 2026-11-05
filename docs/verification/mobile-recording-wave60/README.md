# 手机录音游标与时间轴60作者证据

2026-11-05。准确源码 **`b5d008a25a9424f14f2e995cfd2557400cdb4614`**，隔离树 `/private/tmp/apple-notes-mobile-recording-wave60-01`，base `46e45e4f85c4c0d95720ea1e3e40ca5440aded03`。产品仅修改 `src/RecordingPanel.css` 手机局部；另有真实共享View检查脚本和60规格更新。作者状态：**VIEW-PASS / DESKTOP-RASTER-OPEN / PIXEL-OPEN**，待不同代理独立审查。没有设备、GUI、麦克风、音频、TCC、签名、Rust/Cargo或Gradle操作；原Android现场完全未触及。

## 准确基线与最终参数

首次产品修改前，检查脚本通过Git直接加载准确59 `99dbb95ed0d4f796a71fcb40d5179ed6d90eeaa6` 的 RecordingView/CSS，其他产品文件来自base。`baseline-attempt02/` 保存完整旧图、DOM、全部computed及真实状态/动作检查，随后才生成pad5/7/8候选；没有编辑旧树。三个候选在最终源码外用浏览器临时style渲染，canonical基线先保存。

最终参数为手机playhead bottom2px、axis height20px/bottom−18px、label font11px/line-height13px/padding-top6px。pad5墨迹比参考高1视频px，pad7/8低1px，pad6在两个主要阈值下接近参考。完整wave仍top15.9%/height36.9%，slider触达框不动；samples原bottom30及映射不动。轴在wave底缘上方2px开始，下方装饰可见；axis pointer-events:none，完整标签行框容纳于明确高度，不靠裁掉文字降低重叠数值。

短高≤650px时，仅axis改height17px/bottom−15px、label padding-top3px，保留11px字体、13px行高和完整16px标签框。它是三窄高可用性的工程约束，没有同尺寸原版错误态参考。59计时、播放、56%提示/重试、44px触达均不移动。

## 三方量图

[三方全图](comparison/three-way.png)由原n0960、准确59、新60组成。原图224×480；旧/新真实组件以392×840逻辑尺寸、DPR2渲染784×1680，再整幅等比例LANCZOS缩为224×480。没有裁剪拟合、遮罩、位置微移或伪造波形；系统栏、日期、真实波形、转写排除项和材料差异均留在全图与原始diff中。原DPR/高清字体未知，有损边缘约±1–2视频px。

下列墨迹bbox统一半开区间；不是原生frame或触达区域。

| 元素 | 原n0960 | 旧59 | 新60 |
| --- | --- | --- | --- |
| 黄色核心bbox | `[112,104,114,268]` | `[111,104,114,252]` | `[111,104,114,268]` |
| 00:01，maxRGB<220 | `[20,273,36,278]` | `[20,260,33,264]` | `[20,273,36,278]` |
| 00:01，maxRGB<235 | `[19,273,36,278]` | `[19,260,34,264]` | `[19,273,36,278]` |

黄色核心采用较强颜色阈值；较宽颜色阈值会把原视频低饱和压缩边缘扩到269，旧/新仍为252/268。两种定义与像素数均保存在[metrics](comparison/metrics.json)，不为凑一致隐藏阈值差。标签原/旧/新阈值220像素数为36/20/37，235为52/37/48，bbox接近不等于字形相同。另存阈值200结果；旧字在该阈值下为0像素，不据此推原生字体。

标签文字几何按原帧显式文字行带与旧/新真实DOM Range行带提取；完整固定ROI另保留所有刻度。新图阈值235下，原始固定ROI `[15,255,40,282]` 还含新位置的3个刻度像素，raw bbox为`[19,268,36,278]`；文字行带才是273..278。此区分只用于命名元素的几何解释，不修改图像或任一ROI误差。

| 固定ROI | MAE 旧→新 | 任一通道差>16像素比例 旧→新 |
| --- | --- | --- |
| timeline-full `[0,100,224,283]` | 3.852207→3.552010 | 2.59075%→1.99551% |
| first-label-all-positions `[15,255,40,282]` | 7.902222→3.551111 | 14.22222%→1.33333% |
| axis-label-band `[0,255,224,283]` | 4.626276→2.838170 | 7.23852%→3.65115% |
| full-no-mask `[0,0,224,480]` | 14.334753→14.220303 | 12.76600%→12.53906% |

完整图、50%叠图、未增强逐通道绝对diff、旧新diff、固定ROI、变化像素数、MAE和最大差值均单列。所有指标只是描述局部改善，不能授整体原版像素PASS。

## 有效区域及真实输入

`RecordingView → RecordingWaveform → 实际CSS` 直接挂载；没有复制组件或CSS自画验证图。受控有效props与action sink只证明View派发，不创建媒体，也不证明收音、播放声音、文件保存或native链。

| 尺寸 | axis完整底缘 | notice/retry顶部 | 净空（逻辑px） |
| --- | --- | --- | --- |
| 392×840 | 488.765625 | 495.796875 | 7.031250 |
| 320×568 | 333.312500 | 335.250000 | 1.937500 |
| 280×600 | 351.250000 | 354.140625 | 2.890625 |

最终检查核axis、major/minor刻度、label盒和文字Range均在完整有效轴框内，轴框低于计时且不侵入提示/重试；没有仅测wave名义框而漏算下方装饰。亮/暗三个尺寸的真实长错误（重复18次）都产生overflow，wheel滚动到160px不派发seek，重试实际tap仅派发preview-retry。notice/retry/wave的3×3内部点均命中真实元素。额外无retry长提示在三尺寸也滚动且不派发动作；轴在slider之外的装饰区实际tap不派发seek。

真实touch tap位于中心左20逻辑px，请求2400ms；浏览器原生touch拖动再向左50px，请求1900ms，均匹配未改100px/s。确认投影aria-valuenow仍为2.6，无预测推进。初始/录制/保存忙碌禁用投影的touch和transport均不派发动作；playing图形按受控真实状态显示暂停。旧59七态/窄高的必要受影响回归也通过，未重跑会话/owner/保存完整矩阵。

三尺寸的样本输入区域、sample元素几何及红色样本像素位置与59相同，分别4148/2640/2828红色样本像素。只证明给定样本输入的区域/裁剪回归，不把空样本或测试输入称为原视频振幅一致。manifest核RecordingView、waveform、Session、coordinator、Panel、Dock、transport、App、全局style共9个保护文件与base逐字节一致。

## 桌面、构建及首次记录

桌面普通280×467的PNG字节完全相同。桌面深色playing320×600的DOM、所有元素全部computed、测量区域、标签共同字段、buttons均相同；PNG仍有9像素最多1通道值的残差，坐标包络`[314,794,604,1147]`（2×图像），MAE约0.000007。首次新图与最终新图都保留，最终status仍为`VIEW_PASS_DESKTOP_RASTER_OPEN`，不写“桌面截图全部相同”，不为残差更改桌面。baseline未记录后来新增的minorTicks几何字段，报告明确字段缺席；minor元素全computed与源码保持不变。

`pnpm typecheck` exit0（4.403秒），`pnpm build` exit0（7.365秒），保留既有Vite大chunk提示，见[build/execution.json](build/execution.json)。最终源提交前通过检查；manifest再次逐字节绑定检查/构建时源到准确提交b5d008a。

所有首次失败与中间证据保留，不覆盖或改写结果：

- `baseline-first/`：环境禁止本机listen，未进入产品检查；原stdout/stderr及exit1保留。审核后按同源重试到`baseline-attempt02/`，exit0/PASS。
- `baseline-attempt02/`：完整准确59基线、三候选与初始版检查脚本原件。后续脚本增加无retry提示、minor几何和溢出区tap，不改基线图。
- `new-attempt01/`：首个产品候选检查exit0，状态VIEW_PASS_DESKTOP_RASTER_OPEN；全部截图、DOM、原检查脚本、dark原始diff保留。
- `final/`：补必要边界后exit0，仍为VIEW_PASS_DESKTOP_RASTER_OPEN；没有重跑挑选字节相同的dark图。
- Git源码提交首次因索引写入权限被拒，失败摘要另存`source-commit-first-failure.json`；审核后准确提交b5d008a成功。未发生产品测试失败或设备动作。

完整computed结果原始JSON本地保留，提交精确原字节的gzip（mtime0）；`raw-results-archive.json`记录原/归档大小与SHA并验证解压逐字节一致。result-summary只便于阅读，不替代原件。缓存与本地未压缩result按本目录精确忽略；所有原始截图、DOM、执行命令和错误单独提交。

结论只覆盖手机局部可见几何改善及受影响共享视图输入。活动录音、真实回放/保存、原生材质与完整像素目标继续开放；原Android现场按用户要求保持不动。
