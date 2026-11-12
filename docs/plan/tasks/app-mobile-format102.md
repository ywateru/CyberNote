---
id: app-mobile-format102
scope: editor-session-mobile
status: in-progress
depends-on: [app-editor-session96, app-module-extraction98]
---

## objective

修复r2 Samsung真机上格式面板打开后，正文长按选字导致完整面板消失的回归。用户已明确要求仅手动关闭面板；选择、输入、系统文字选区菜单不应关闭。不得仅改报告或让测试适配错误行为。

## evidence

`artifacts/final101-android-r2/07-format-stable.png`显示完整面板；下一次输入仅`swipe 600 670 600 670 800`，随后08-format-selection.png已无面板。拟斜体/拟关闭均在08之后。准确工具时序见同目录format-operation-sequence.json；android-r2.md已撤回原通过结论。r2包身份正确，但此行为不通过。

## implementation boundary

从相同产品指纹1c99f39a…/437、clean e521306e工作树`/private/tmp/cybernote-interface-settings`窄诊断。优先查事件/焦点/Android系统选区菜单、EditorSession失效、MenuSurface生命周期及布局，而非猜测。保留正文选区、手动关闭、Android返回优先级、导航/权限屏障、速绘键盘与录音owner行为。记录可复现因果与修复前后，源码或必要平台修改仅限已证实原因。

普通Chrome触控长按、focus/contextmenu及受控Tauri focus→metadata链均未复现，不能据假设修改权限。允许准备一次隔离诊断源码，先独审再给明确构建gate：最多100条无内容标量（关闭reason、固定事件种类、blocked/authorized/visible、identity变化布尔），不记录正文、标题、noteID、按键值或选区内容；区分真实stateclose和仍formatOpen但布局遮挡。诊断不得改变判断/选区/生命周期，不增加产品调试菜单，不整合root冒充最终fix。串行共享target构建、准确独立stamp、同证书保数据升级后只在自有note重复原路径收日志。诊断包不计最终交付，结果后仍需最小产品修复及不同独审。

2026-11-10：首诊断5158f2da的JS状态/布局区分经不同作者8项边界检查通过，但实际锁定Wry 0.57.1 Logger以BuildConfig.DEBUG过滤console.info，release输出链阻塞，未构建。允许仅隔离补NotesKeyboard.trace固定日志桥：native重建固定事件/布尔/CloseReason白名单，单条最多512字节及100条硬界，固定Log.i；不得改全局Logger或release debuggable。补交后重新独审，仍无build gate、产品fix或新包。

窄桥9e9a4ff8由6f44da39独审接受，诊断APK a9bc7c85/439输入已独立核包并保数据安装。browse、replacement editing、newnote/composition各一次有效长按均未复现，截图均同时完整面板与非空选区，不能撤销r2失败或声称修复。另一次Back已导航却误用旧坐标的case作废并如实记录，后续每个依赖input均先观察。三种有效路径前提与r2仍有差别，v1同步native trace也可能扰动时序。

因此只授权准备更窄v2诊断源码，尚无新build/device gate：恢复所有原pointer/focus/selection/metadata/DOM/订阅/rAF路径，只在原controller.commit已完成真实formatOpen true→false与listeners通知后，以queueMicrotask记录一次固定关闭reason及必要布尔；真正关闭前零console/native调用及额外事件监听。保原默认disabled、native100条/512B完整白名单；不改状态/授权/生命周期。新commit不同代理先独审，通过后才决定单次复用target构建。此举仅减少诊断对时序的影响，不是产品fix。

## verification and delivery

原作者实现；不同代理独审。必要浏览器/真实App回归须验证长按对应contextmenu/选区/焦点链及手动关闭，不只镜像实现。Android原生对准确新包重复原长按路径，保存同时包含选字与完整面板的截图/层级，再点样式并手动关闭。若需构建，先完成源码独审整合，再以新共享stamp构建两端；不得拿旧r2冒充新行为。设备只用自有笔记，保数据安装、前台guard、原IME设置保持。复用已有小样本，不重跑大量附件基准。完整FINAL101 goal在此F1关闭与准确新交付前保持active。
