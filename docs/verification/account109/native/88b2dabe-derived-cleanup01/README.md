# 88b2dabe重复Android派生产物清理

2026-11-13。按父级授权，在其报告独立静态包身份APPROVE（Erdos `22887e41`，main `927cf1c7`）后，仅移除本次作者checkout的两处重复Gradle派生产物，合计 **759,189,504 allocated bytes（724.02 MiB）**：

- `/private/tmp/cybernote-account109-login-surfaces/src-tauri/gen/android/app/build/intermediates`
- `/private/tmp/cybernote-account109-login-surfaces/src-tauri/gen/android/app/build/outputs/apk`

执行前确认独立归档APK与outputs/apk内APK SHA256均为`2fee1cfbe27dd3b4c537c7051206831daa5c22bb9d08db50cf25f28d6e381870`。构建自然exit0、build-group已退出；排除仅本次执行进程祖先后，无其他checkout路径进程引用。两个目录均canonical、当前用户owned、gitignored、无tracked文件；每处lsof +D均exit1且stdout/stderr为空，确认无打开文件。guard全部通过才移除两处目录。

freeBefore=21400694784 bytes，freeAfter=22160097280 bytes；文件系统空闲变化会受并发写入影响，回收量以删除前du allocated bytes相加记录。result.json含每处实际大小与guard结果，preflight.json为删除前记录。

归档候选APK、全部当前artifact文件和旧72513首失败build.log的前后SHA不变。保留outputs/logs、frontend/dist、source checkout、shared target、依赖、所有历史证据及全部store；未安装、启动App或执行设备操作，也未终止任何进程。后续Gradle构建可能重建这些中间产物。没有清理其他旧运行目录或用户资料。
