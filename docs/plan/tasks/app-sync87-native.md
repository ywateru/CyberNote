# APP-SYNC87 新隔离 Android 原生验收

状态 in-progress（准备工具，执行等待准确新同步APK）。depends-on 86真实生产接线独审、87环境已独审ready、根准确包来源核对。使用docs/plan/tasks/app-sync87-e2e.md与app-android-attachments-native76.md的全部保全约束；不重做手机首页83。

唯一执行设备 `notes-sync87-isolated` / `emulator-5584`，资源 `/private/tmp/apple-notes-sync87-environment-01`，API30 ARM64 Android11。目前stopped。所有ADB明确新serial并核AVD/PID/CDP身份，禁止缺省设备、kill-server、旧5580或任何原设备命令。只用合成新笔记/PNG/TXT/WAV；不启真实mic。准确新APK包hash与manifest由root交付后才安装，不运行旧16包或未经核包文件。

path：仅 `scripts/debug/sync87-native/` 新工具和 `docs/verification/sync87-native/` 证据；不得改生产源码、现有调试runtime/adapter或环境lifecycle工具。可调用已独审lifecycle cycle --serial emulator-5584 --avd notes-sync87-isolated --hold-seconds 600，在bounded owned新进程ready期间操作；其他工具也须相同所有权检查。所有本轮端口转发只绑定该新app PID并仅清自己的转发，不清全局。每次重启重新核新PID与页面URL，不能挑首个target。

先实现严格串号及所有权安全入口、CDP读取HTML/真实输入、原生系统chooser操作与新目录状态恢复，保存自然exit/wall与原始错误。真实执行覆盖：初开两列画廊、黄色＋直入真实编辑器/输入保存；真实系统chooser取消/再选/连续多个附件（PNG/TXT至少）后卡片、图片载入/导出原字节；同新app关闭重开与同data冷启恢复；准确新App通过实际设置UI连接独立桌面合成Store，手机创建→桌面、桌面修改→手机回前台、后台恢复重连；双向图片/合成音频文件hash。邀请secret仅内存传递，截图/HTML/日志避开邀请字段。不能用写数据库/文档赋值/伪metadata证明业务通过；读取真实native IPC/Store仅观测允许。生产无debug全局对象；测试使用真实DOM事件/CDP input及有限本机IPC观测，不新增后门。

发现产品问题先保全最小失败，报root转原作者，工具不改生产以迎合断言。输出先/private/tmp，关闭持有窗口/进程/转发后保全紧凑证据。准确source/package/PID/serial/AVD标识与已验范围全部记录。当前API30结果不外推真实硬件/其他系统或完整苹果像素。工具冻结源码再受影响验证，交不同agent独审；root统合完成目标，不能只工具准备就标全任务done。
