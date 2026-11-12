# Android106 live08/09 有限独核

**2026-11-11 更正复核：下方首次审查结论保留为历史记录；其中“设置尚未打开/没有观察响应”的接受结论已撤回。当前更正记录接受，设置实际已经出现。详见本文末尾更正复核。**

2026-11-11。只读冻结小型记录及安全按键/候选ROI，不运行UI、设备、构建或原件hash，不公开既有备注正文，不纳入进行中Maclive12。**live08有限入口记录可接受；live09新建显示键盘的有限观察可接受，但存在F1：点击前候选ROI精确匹配的声明与实际截图矛盾，需原作者修正文档/状态，不能按该guard通过接受整轮。**

live08清单20文件、live09清单30文件（2105900B）长度与SHA全部匹配，详情见`artifacts/final106-android-live0809-independent/manifest-check.json`。live08真实记录两次gear坐标点击；第二次相邻同exec记录Awake、isStatusBarKeyguard=false、showing=false，随后列表仍在。另有showingAndNotOccluded=true保留不归因；物理和input logical均1440×2960、orientation0。仅接受设置尚未打开/没有观察响应，不推断坐标转换、系统认证、异常根因或全部UI故障。启动身份与先前04包字节确认分开，尚无设置UI版本身份。

live09的01-after-plus实际按键安全裁图显示完整WeType九宫格，系统同时保留RustWebView、非空active input connection、showRequested/inputShown/InputViewStarted=true，支持新建空备注自动显示键盘的本次有限观察。后续输入被WeType组合为不同标题与绿色候选，不证明 intended正文独立提交；不能称永久keyboard fix。屏幕与flag不一致时只按实际可见状态记账，不凭show=true证明完整键盘一直存在。

F1精确证据：作者报告与stopped-status称05点击前ROI(80,1010,960,1130)与04候选场景精确匹配；对manifest所列原始04/05 PNG同坐标RGB比较，105600像素中92696不同，relative diff bbox=(10,0,880,120)。04为绿色候选，05该区域已是灰/白且无候选。安全裁图和复算在`candidate-guard-f1.json`及`04-owned-candidate-only.png`/`05-before-candidate-only.png`，未展示旧正文。因此不能声称03:50:25点击是在已确认的候选上，候选场景的可见变化至少已出现在05；仅凭该ROI不能判断05具体是哪篇备注，也不能确定完整文档/进程切换时点。

04系统采样03:45:38.941774UTC确认为PID26451/task1293；唯一后续点击为03:50:25.406800UTC (520,1068)，06于03:50:28.228987UTC为PID31424/task1294。即时点击前没有fresh PID/task；两个系统采样之间未记录launch/restart/Back/追加typing，但这不证明变化由候选点击引起，不排除并发/系统恢复或其他原因。提交目的地及是否改变旧备注内容未知；停止且未undo是正确数据保护边界，不可宣称用户内容未变。原作者应撤回exactROI guard通过、保留点击目标不明及修正可见场景时序，不修改冻结原图或补造历史采样。本审不自改作者证据。

两个1500行followup bounded log均exit0但eligible事件空：main/tag范围完全晚于目标时窗，events范围部分重叠却无匹配结构事件；没有raw消息用于重建完整过程。此前PID26451小slice亦无异常条目但保留未知retention。因此均只能unknown，不能排除crash/kill/activity/user navigation或认定产品根因。hide/bodytap、格式面板、菜单、旋转和原102路径均未完成，不撤销原102历史失败或声明完整106原生通过。已报告F1并释放作者窄修，全部设备/UI保持停止。

## 更正复核（2026-11-11）

接受作者本次有限更正，不接受旧guard或“gear无响应”结论。当前live08清单24项、live09清单37项逐项长度/SHA匹配；与保留的旧清单相比，原11张/13张PNG均未改。独立复算记录见`artifacts/final106-android-live0809-independent/correction-check.json`，旧派生/首次F1保留。

三处RGB复算分别为：候选ROI 92696/105600像素不同；plus前列表ROI 0/4032000不同；gear前后ROI 2686947/4032000不同。均与更正值相等。旧RGBA差值的alpha通道恒零，使getbbox返回None；独立复现三例均如此。它是比图工具错误，不是产品故障原因。候选前截图确实已与候选场景不同，不能追认点击前guard。

安全header图清楚显示“设置 / 完成”，证明第二次所谓gear点击之前设置已出现；该次坐标位于完成区域，不能继续当作第二次有效gear尝试。我此前接受“设置尚未打开/没有观察响应”同样依赖错误派生，现明确撤回。设置出现的精确响应时刻与设置版本身份未采到，仍未知；不能据此推出全部设置功能通过。

live09新建时完整键盘的有限观察保留。候选失配、两个系统采样之间PID/task变化、点击目标/提交目的地与原始转换时刻未知的边界不变；此次更正没有补造即时进程样本，也没有证明用户内容未变。原102及未完成格式/旋转路径继续开放。无UI、设备、构建或原件hash复测。
