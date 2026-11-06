# Android15准确本地构建

构建源码head `2709aa55`（产品最终 `ad3a069f`）。`pnpm android:build --debug`自然退出0，完整28.255s，291项跟踪输入前后相同。旧输出APK移至本轮 prior-android-output.apk保全，目标输出不存在时重新构建，避免把旧包记为新包；这只涉及工作区构建产物，不涉及任何设备。准确manifest、环境、命令、wall、完整原日志与驱动同目录保留。

临时Gradle offline init仅本次创建，结束已删除。APK签名检查自然0/1.023s，前端dist冻结为android-dist供独立核包。未安装、读取或操作原Android设备，原未保存录音现场保持；这是arm64 debug本地构建，不代替WebView/provider/真实OS或原版像素验收。

- [Android构建15 APK](../../../../artifacts/ui-hierarchy8081/备忘录-Android15.apk)
- SHA256：`0e52c5872c9d294808d9afa5752e29cb1d9bdeb7c8a15988f95bb236cfcce9ac`
