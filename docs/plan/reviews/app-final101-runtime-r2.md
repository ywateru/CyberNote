---
id: app-final101-runtime-review-r2
scope: bounded-native-report-evidence
status: bounded-acceptance-with-blocker-android-format-actual-failure
reviewer: media99_research
---

# FINAL101 r2 原生运行报告有限证据复核

2026-11-10 Asia/Shanghai。此为另两位验证代理的报告与保存证据的只读复核，不是再次运行 Mac 或 Android。未操作应用/设备、未构建或修改产品，未修改原运行报告/截图。已收到 macos-r2.md、android-r2.md 的完成 gate。总体结论为有限范围验收存在阻塞项：Android 格式面板在没有手动关闭的情况下因正文长按选择而消失，F1已由原作者核对既有操作顺序确认为真实失败，不再仅记未证。不据此推断具体产品根因。

## Mac 身份与可接受范围

报告：`docs/verification/modernization101/macos-r2.md`。原始证据：`artifacts/final101-mac-r2/`。独立复核 JSON、27 个证据文件的长度/SHA256 清单、网格像素分析及复核脚本：`artifacts/final101-package-review/r2/mac-runtime-review.json`、`review-mac-runtime.py`。两张 contact sheet 仅作现有截图的查看辅助，不替代原文件。

settings-runtime-version.ax.txt 的完整 revision、指纹、版本 0.1.0 和实际构建时间 `2026-11-09 14:41:51.600 UTC` 与已接受 Mac 包一致。RSS 中的精确 executable 命令也绑定同一个 r2 bundle。截图/AX 可直接支持设置分类与字号控件、设置打开时原生工具栏仍存在但 disabled、手绘保存后重开与上下文菜单界面、小型附件显示和媒体控制、画廊返回附件选中状态、选中列与原生操作菜单可见状态。

这些静态文件不能独立重建点击次数、动作时序或连续播放进展；报告中的实际操作顺序仍依据首位 CUA 验证者的现场观察。本复核不将静态截图扩张为对每一步输入事件的第二次实测。无破坏性剪切/删除/导出、文字↔表格完整往返或所有五档字号矩阵通过的结论。

## 重点边界

| 场景 | 保存证据与独立复核 | 接受结论 |
| --- | --- | --- |
| 纵向 scroll | 六张原始 2770×1806 速绘截图，PIL 灰度/行列均值检测网格中心；笔迹前网格 y=304+120n，纵向后 y=332+120n，笔迹离开视区；报告写边缘303/331，检测中心相差1px属同一变化 | 支持本次 CUA native scroll 的纵向位移，不代表实体双指 |
| 横向 scroll | vertical 与 both 两组网格 x 中心均为121+120n；纵向后与横向后 y 相位也一致，笔迹已出视区 | 无可区分横向位移，结论 inconclusive；不称双轴通过 |
| 缩放 / physical pinch | 已查看截图的比例一直为231%；无物理触摸板接口证据 | 不能证明 zoom，不能声称实体 pinch 已测 |
| WAV slider | audio-seek.png 已查看，卡片为0:03终点；报告明确 setValue(1.5) 恰逢3秒 clip结束 | 文件名不是 seek 通过证据，seek 未证；激活/控制可见与 seek 分开 |
| 麦克风 / finish | timeout screenshot 与 AX 明确“系统麦克风授权等待超时”，时间00:00，完成录音按钮 disabled | 本次未捕获录音、未验证完成保存或完成时刷新；不从超时推断根因 |
| RSS | 原 normal JSON 记录修正排除采样 shell PID53217；精确 executable PID49451 的三次 RSS 为92512/129520/104432 KiB | 只接受 native PID 点采样；不合计7个未归属 WebKit，不称 app总内存/峰值/泄漏/性能改善 |

permission-surface-inventory.json 保留的系统表面盘点只能支持“未观察到可操作权限界面”，不能排除隐藏或后台权限提示。报告已明确这一限制。final-audit.md 已将 Mac wheel 措辞收窄为纵向变化，横向证据不足，未冒充物理捏合；与本复核一致。

## 当前结论

接受 Mac 报告在上述有限范围的证据边界，没有发现需要产品修正的新增阻塞项。明确未证场景继续开放：横向 wheel、scale变化/physical pinch、audio seek、Mac 录音完成及刷新行为、总应用内存。不把现有包身份或 README 发布结果替代真机验收。

## Android 身份与现场证据

报告：`docs/verification/modernization101/android-r2.md`。证据：`artifacts/final101-android-r2/`。独立摘要、55 文件长度/SHA256 清单与系统状态/XML复核脚本：`artifacts/final101-package-review/r2/android-runtime-review.json`、`review-android-runtime.py`。

24-version.xml 和截图显示 Android builtAt `2026-11-09 14:47:14.179 UTC`、完整指纹 `1c99…`、版本0.1.0，与已核验 r2 APK 一致。证书比较中的旧包/候选证书 SHA256 均为 `e71ec0b1…`，对应独立核包的 Android Debug 证书。升级过程的 install-r/现场安全操作为首位验证者记录，本复核不重新安装或读取设备。

| 场景 | 保存证据复核 | 有限结论 |
| --- | --- | --- |
| 新建 IME | 03截图完整显示 WeType；02系统 dump 为 mInputShown=true 且 mServedView=RustWebView | 支持本次新建实际输入法显示，不推广到所有输入法 |
| 正文 tap IME | 20系统 dump 为 mInputShown=true；20截图有正文 caret，但未绘出完整键盘 | 接受系统 shown 状态；不能将该截图单独称完整键盘稳定可见，也不额外推断原因 |
| 实际自有标题 | 截图与XML均为 `IFNAL－1AndroidIMEr` | 保留 WeType 输入后的实际文本；不伪称原计划字面标题成功输入 |
| 速绘 no IME | 09截图为完整画布，09系统状态 mInputShown=false | 支持本次进入速绘未显示输入法 |
| OS 双触点 | CanvasGesture.java 使用 UiAutomator performTwoPointerGesture 并检查前台；10日志记录 r2-pan dispatch accepted。直接前后截图显示60%→150%，pan前后仍150%且线条端点变化 | 同时依据事件路径与可见效果；不以dispatch返回值单独判UI成功，不称物理手指或Mac触摸板 |
| 速绘保存/重开/菜单 | 网格与斜线保存在笔记；18重开截图/XML、19长按菜单XML可见 | 支持保存/编辑/菜单界面。次数与长按时序依现场验证者记录，静态文件不构造第二次输入实测 |
| 短录音 | 14截图计时3.87秒及红波形；录像contact sheet含计时推进、停止、保存提示、返回笔记；16保存卡可见 | 支持此次短录音 capture/stop/save。未激活卡显示“时长未知”及占位波形，不隐藏此行为 |
| 播放 | 17 XML为暂停、0:01进度、0:04及音频·4秒；截图对应有进度波形；后续20恢复播放 | 支持本次短录音播放状态变化；未验证扬声器音质 |
| 画廊 | 26 XML为音频4，包含自有标题及原3条用户音频；27菜单含在备忘录中显示/保存/拷贝 | 只接受归属显示及菜单可见，未执行跳转；Mac对应定位有独立现场观察，不能互相替代 |

original-device-settings.json 与 final-device-settings.json 的 default_input_method、enabled_input_methods、accelerometer_rotation、user_rotation 四项逐字段相同，独立重算与 comparison JSON 一致。仅这四项计为恢复/不变，安装更新时间变化为预期，不称所有系统状态完全相同。

已查看14秒录音录像的现有3fps contact sheet。采样画面只见一次保存提示后卡片/工具栏稳定；不构造 React render 数量、不排除采样间短闪烁，更不能据此判 Mac 完成刷新问题通过。Android 两份 meminfo 为小型自有笔记/短音频/画廊快照，不是503固定样本基准，不用于原生大样本内存改善结论。

## F1：Android 正文长按导致格式面板消失——实际失败

初版 android-r2.md 表格称“长按自己笔记正文选择文字，面板保持；点击斜体，再手动关闭”。本复核发现07-format-stable.png确有完整格式面板，08-format-selection.png选中文字时底部却为普通编辑工具栏，完整格式面板不在画面，向 parent 提出冲突。原作者已撤回通过结论、将报告改为失败，并追加 format-operation-sequence.json 的既有工具记录摘录。

已读原作者澄清和操作摘录：15:21:09Z为07截图；下一次15:23:25Z输入仅为 `swipe 600 670 600 670 800`，紧接08截图；拟斜体的 `tap 395 2368` 与拟关闭的 `tap 1286 1924` 均发生在截图08之后。原作者明确两图之间没有X、Android Back、格式toggle等手动关闭。由此前后界面与动作顺序，确认“选择正文时不主动关闭格式面板”的真机要求本次失败；不能把它降格为文档局限。后续斜体/关闭操作缺正确目标证据，也不计通过。根因尚未定位，不在本次只读审查中猜测。追加动作摘录已纳入独立摘要55项文件清单，未新增设备操作。

parent 已安排任务102由 modules 作者在独立树窄诊断修复，并由 design 不同代理独审。此为完整运行验收的阻塞项，root完整goal继续active。新源码接受后需新的共享prepare和同源双包，不能继续以r2旧包的部分通过宣称修复已交付。本 reviewer 不重跑设备或安排构建，当前审查任务到此收尾。

## 总体处置

双包身份与 README 唯一入口此前的核验仍准确说明r2源码/产物，不因本次功能失败改写历史包身份。Mac 报告范围接受；Android 除F1真实失败外，其余上述有限观察与保存证据一致。整体有限验收为with-blocker，不能计完整功能通过。格式选择期间持续面板计失败；Android画廊跳转、Mac录音完成/seek/横向wheel/physical pinch、503原生基准等保持未证，不混成失败或通过。当前只读有限审查已完成，后续交102开发/独审及新批次交付。
