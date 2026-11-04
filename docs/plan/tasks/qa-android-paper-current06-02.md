---
id: qa-android-paper-current06-02
scope: installed-android-paper-selector-reference-layout
status: in-progress
depends-on: [app-005-unified-candidate06-01]
---

## 目标

在准确已安装candidate06上复验手机“横线与网格”页，取得与保存录屏86秒对应的当前截图和布局证据。旧纸张页有旧包有限验收，不能追认新APK或全像素。当前任务要推进真实新包应用内容区域与原录屏的几何一致性，不只复述旧报告。

## 边界

用户已明确允许ADB完成验收。只操作现有emulator-5580/com.local.notesclone；不重启模拟器、不换包、不清数据、不下载、不改系统权限/分辨率/输入法。首先只读确认设备在线、包路径/大小/hash与candidate06对应。不导出设备APK、DB或音频。若设备不存在就记录事实并停止设备操作。

通过真实ADB点击/系统键盘导航搜索固定合成标记QA-PAPER-INDEPENDENT-20261103C，只读打开该笔记；进入横线与网格选择页，记录原键盘/可见界面、截图和必要动作，不更改或保存纸张。用取消返回，保留原正文。不得DB/DOM注入制造截图。

新输出仅docs/verification/android-paper-current06-02/，不改产品、文档其他目录、版本或共享target。主机及设备输出前>=2GiB。保留每次原始失败；截图为ADB原生PNG，不把控件树缺语义当内容不存在。不得操作Mac GUI。

## 判别与交付

读取docs/ui/android.md、mobile-paper-calibration及candidate06真实验收。原视频保存在references/mobile/original，原参考86秒已有帧时优先复用。先保留原尺寸，不用缩放掩盖偏差。对比时只可另存明确按224px参考宽度归一化的派生图，标出应用内容与系统栏边界，报告卡片顺序、七项可见、顶部标题/取消/说明、卡片相对位置/宽高/间距和色彩差异；压缩/DPR不明导致精确字形像素仍unknown。

交付准确设备与APK身份、动作、原始截图、回退后截图、有限结果和可供后续几何分析的输入。不要新建大量同构检查或扩大其他功能。设备操作完成立即释放并告知root；root另安排独立图像分析。
