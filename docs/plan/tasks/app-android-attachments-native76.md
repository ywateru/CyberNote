---
id: app-android-attachments-native76
scope: isolated-android-attachment-chooser-and-display
status: pending
depends-on: [app-android-attachments75]
---

# objective

把75的源码修复带入准确新APK，在全新独立Android环境验收原生系统文件选择、附件保存/预览/重开和显示。保持原设备约13秒未保存录音现场完全不动。不能把75浏览器/真实Session通过当成已安装Android通过。

# context

- docs/requirements.md、docs/testing.md、docs/debugging.md、docs/ui/android.md
- docs/plan/analysis/android-quality75.md、docs/plan/tasks/app-android-attachments75.md及独审/整合证据
- scripts/android.mjs与既有准确包冻结/来源核对机制
- 原录屏references/mobile/original/及已有手机附件/显示基线

# contract

1. 从75已独审并合入的准确源码冻结当前产品/构建输入，生成新APK并记录source、嵌入frontend、native library和APK的实际身份。不运行未经身份核对的旧APK；不自动安装新SDK/依赖。明确debug构建与生产包边界，生产不得启用调试全局对象。若需调试构建，使用现有开发方式并标识，不新增生产后门。
2. 使用全新AVD名、独立ANDROID_AVD_HOME和显式新data目录，只读复用缓存API30 ARM64镜像，不复制任何旧AVD、userdata、snapshot或恢复媒体。启动前核磁盘与端口，cold/no-snapshot/no-audio。现有API30只证明Android11，不外推新系统版本。
3. 所有ADB操作必须显式新serial，先验证AVD名称/新app身份；禁止默认serial/首个WebView target，禁止kill-server、重启或操作旧AVD/emulator-5580及其他既有设备。CDP仅绑定新进程/新页面对应转发，清理也只针对本轮owned资源。旧硬编码脚本不可直接运行。
4. 仅合成新笔记和PNG/PDF/TXT等文件放入新设备，不读取用户数据/音频。通过实际系统chooser选择文件，至少验证空笔记多选和连续选择不替换、图片成功加载、取消后再选、正常重开及该新设备冷启正文/附件保持。选中旧卡主动替换和撤销单独检查。读取HTML/rect/实际媒体状态和截图，不把DOM直接赋值文档或写库当功能通过。
5. 显示覆盖手机编辑器/附件菜单/卡片和至少窄屏、浅深色、长文件名；有相应原帧的状态按同内容/比例比较，系统栏单独标记，缺乏原图的PDF预览不编造像素评分。实际原生失败先保留最小原始证据，再针对原因拆修复，不通过隐藏错误或跳过系统chooser凑通过。

# path

必要的显式serial验收脚本与独立AVD生命周期工具、准确新APK构建/身份记录、docs/verification/android-attachments-native76/及相关交付说明。生产修复须有实际证据并单独冻结复核；不扩散Mac或录音交互。

# verification

75正式独审/主线整合后才能启动。由不同agent验证新APK来源、独立AVD/serial/CDP身份、原生chooser与新设备重启恢复结果。保存源/包hash、原始命令、自然退出/wall、HTML/截图及失败记录；原设备不访问作为约束持续核对。完成后清理本轮新模拟器进程、转发和无用中间文件，保留准确APK与紧凑证据、共享SDK/Cargo缓存不清。当前仅只读准备，尚未创建AVD/构建/安装/运行。
