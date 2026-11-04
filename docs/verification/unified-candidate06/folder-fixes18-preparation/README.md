# 普通Mac表单与智能编辑/手机交互修复准确包18准备

2026-11-05。此文件只记录下一轮安排，非平台构建授权。geometry15源已独审并整合80b01da；hydration16独审中，mobile17待实现及独审。必须这些窄修全部通过、源提交固定后才生成准确九字段授权和冻结，不从活动工作树出包。

旧Mac09/Android05运行及缺陷记录仍保留。新目录计划Mac `mac-folder-fixes-build10`、Android `android-folder-fixes-build06`，各attempt01；实际空路径确认及sourceHead/productAggregate由最终授权固定。沿用preparation/README.md已独审工具，不改工具/锁/依赖/SDK，不下载、不清共享缓存、不覆盖旧目录。

输入以旧Mac09和Android05全部inputPaths为种子，加入当前全部tracked产品/配置/脚本及docs/fixtures/smart-projection09.json；保留生成/补丁依赖/插件资源全部原条目。root复核冻结实际字节后才START；Mac与Android构建/收集串行并独占共享target/cache，完成STOP后交不同作者包独核。旧输出由既有工具在其新attempt里保全，不把旧字节同一认作来源通过。

## 新包实际验收

| 平台 | 合成数据操作及有限门槛 |
| --- | --- |
| Mac | Computer Use启动准确新包，普通创建弹窗与原版相同状态抓图，核800×414几何及取消/智能切换；false/true规则重开、只改名保存后保持；正文与count保持；侧栏直接按钮和动态菜单隐藏/恢复，实际正文选择、分栏往返、正常退出后新PID恢复。 |
| Android | 用已授权ADB install-r保数据升级；旧普通8篇/旧录音卡可见保留。既有QA-SMART-U09-Android-R1排除置顶当前count1，重开应显示不包含，仅改名保存应仍count1；冷启后重开规则不变。切换合成note置顶/取消置顶时count0/1，不动其他note。空标签确认即时可见错误/保留草稿/可取消或合法重试；长按合成目录不选字且菜单可编辑，正文仍可选择。 |

设备数据不重置、不卸载、不删除实体、不导出音频、不读取DB，不触及原版删除测试。不把模拟重新挂载当进程重启，截图保存当前准确包身份与状态。原录屏在references/mobile/original保留；已知低清不足不宣称整窗像素通过。日期/全部原版状态/IME/跨窗/完整像素仍open。

## 已执行结果（2026-11-05追加，保留上方准备时点）

geometry15、hydration16与mobile17全部源码独审通过后，以准确提交de372d31e0578a7f2619413c0abde6a8439bb3c6、301项产品aggregate5cf86b16c5dc6f122b9789ee1b5181000616a533a211b8f6099881feab9b6a74和320项完整aggregatef8f53954584ba4c7712dc271ddcb515c9faf8be51fcb64838e4ab7236684ad0e生成[Mac授权](mac-authorization.json)/[Android授权](android-authorization.json)，canonical freeze/run/collect串行退出0，离线、输入字节不变。根核每份freeze1336文件身份和25 AAR模型。旧prior-outputs原样留本机，Git只记录本次来源/日志/结果，不纳入旧二进制副本。

[Mac10构建](../mac-folder-fixes-build10/README.md)、[不同作者470项包独核](../../../plan/reviews/mac-folder-fixes-independent10.md)通过；sealed ZIP6961ea84…、exe56742e38…。[Android06构建](../android-folder-fixes-build06/README.md)、[不同作者385项包独核](../../../plan/reviews/android-folder-fixes-independent06.md)通过；APK8609231f…。两者保持各自来源/签名门槛，不外推DeveloperID/公证。

根随后完成[Mac实际18](../../mac-folder-fixes-runtime18/README.md)，其[62项不同作者静态复核](../../../plan/reviews/mac-folder-fixes-runtime18.md)已通过。普通表单800×414、false重开/改名/新进程保持、侧栏按钮/动态菜单两入口恢复和正文选择端点有证据。栏宽不精确复位、重启侧栏回visible、颜色/圆角/焦点差异继续保留。[图像研究19](../../mac-ordinary-form-pixels19-research/README.md)明示剩余差异。

[Android实际18](../../android-folder-fixes-runtime18/README.md)已封存，准确包保数据升级/false改名与新PID回填/错误滚动可见/目录不误选字而正文可选/合成note置顶1→0→1恢复/旧录音卡可见及普通8篇均有保存帧；独立静态复核进行中，结果以其报告为准。原版删除保持暂停，未读用户DB、未导出媒体；整体像素/未覆盖功能继续open。

后续追加：[Android18不同作者99项有限静态复核](../../../plan/reviews/android-folder-fixes-runtime18.md)已pass/STOP，83文件/37PNG及全部动作记录相容。根已接收两端有限结果并复核7索引214条引用，见[根接收](../../folder-fixes-runtime18-root-acceptance.md)。原版侧栏正常重启21另证hidden保持，克隆18回visible是后续待修差异，不能扩张本轮为完整侧栏一致。
