# Android录音验收准备

2026-11-05 09:21上海，只读ADB检查emulator-5580（sdk_gphone_arm64）在线。首次受限ADB无法监听5037、exit1；使用已授权的ADB在允许本机服务环境下重试exit0。没有重启/卸载/重置/安装或启动应用。

pm path显示既有base.apk：`/data/app/~~ovwe2YUNECiFtL46UayGoA==/com.local.notesclone-y_KtKCyyaUmH5fUdaXo4bQ==/base.apk`。dumpsys package显示versionName0.1.0/versionCode1000、minSdk26/targetSdk36、lastUpdateTime2026-11-05 07:00:48，RECORD_AUDIO granted=true；没有复制APK或读取用户数据库/媒体。该观察不代替包SHA或新50运行验证；既有Android08来源按主README保持。

后续新包只做保数据覆盖安装与自有QA录音基本流程，不清理既有空笔记、不导出麦克风文件。
