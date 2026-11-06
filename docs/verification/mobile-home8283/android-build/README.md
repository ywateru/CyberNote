# Android构建16准确本地构建

冻结构建HEAD `1f735ebe4881399699b6ba769e29f82a52278e7c`，293项跟踪输入before/after逐项一致。`pnpm android:build --debug`自然exit0，完整该命令wall 19.789s。使用现有SDK/NDK/JDK17、离线Gradle缓存及临时maxWorkerCount=2配置；临时init已在finally删除，未手工修改依赖缓存。

旧输出移到本轮prior-android-output.apk，构建前确认正式输出不存在，随后复制本次新生成APK。apksigner验证自然0。构建16是本项目包编号，不是Android系统版本。

[Android构建16 APK](../../../../artifacts/mobile-home8283/备忘录-Android16.apk)，182442234字节，SHA256 `26a9d3a9fcd42cd89d9e5e43117b67e2fbf3ff2c20e684322d8cb31488e3dc60`。android-dist保留准确前端快照。完整环境、命令、输入、签名与退出值见[result.json](result.json)及日志，[独立核包](../native-independent/README.md)另行记录。

没有调用ADB、安装/启动/停止应用或读取原设备；原约13秒未保存录音现场继续完全不动。包构建不替代Android WebView/IME、OS picker/provider、真实硬件录音或原版整窗像素验收。
