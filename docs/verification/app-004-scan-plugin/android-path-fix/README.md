# Android 扫描私有目录 P1 修复与开发者实测

2026-11-03。旧独立复验失败保持在 docs/verification/qa-scan-plugin/host-copy-device-20261103/，没有覆盖两个原 tar。本轮只改扫描插件独占路径与自己的验证目录，未修改主 App/安全功能/原独立 review；Mac GUI 持续释放。

## 根因：修生产代码前取得同一 Java File 实证

先仅添加独立 debug 的 path-diagnostic 夹具，生产 SessionStore 与 e6cc378 相同。diagnostic-install.json 记录 APK SHA 8f311ac0…；old-production-java-paths.json 由真实 emulator-5580 Java 保存：Context.filesDir absolute=/data/user/0/com.local.notesscan.harness/files，而 canonical=/data/data/com.local.notesscan.harness/files。同一 session File 也呈现相同前缀差异，begin 返回 invalid_token“无效会话目录”。shell readlink 的不同结果不能代替 Java 实证；此处直接记录 Java absoluteFile 与 canonicalFile。

## 最小生产改动

仅先 canonicalize 可信 Context.filesDir，再以该 File 构造固定 notes-scan-sessions 根。没有 canonicalize 并放行不可信 token 路径。初始化/每次目录访问/cleanup 验证根仍是预期的规范直接子目录；会话 UUID、规范路径等值、直接 parent 检查继续保留；manifest/resource 原有严格路径检查继续保留。根被改成 symlink 时，已存在 Store 和新 Store 都拒绝。

## 已实际运行

- path-boundary 原生夹具 10 项通过：合法 OS 别名创建重开、traversal 拒绝、session symlink 读/删拒绝、cleanup 跳过 symlink 且不动外部哨兵、manifest symlink 拒绝、已注册 resource symlink 拒绝、现有/新 Store 与 cleanup 拒绝替换的 root symlink。文件夹中保留 result.json、原 tar 与外部哨兵，真实路径值也在其中。
- 原始失败史及上述边界结果导出后，只执行 pm clear com.local.notesscan.harness；记录 Success 与 files 目录不存在。未清主应用数据。设置 airplane1/wifi0/mobile_data0，再直接首次启动 ocr-first-offline。fresh-offline-preconditions.json 记录所有时间、命令结果、安装 base.apk 全字节与本地 APK 一致。
- 首次 native MLKit bundled16.0.1：airplane1、activeNetwork=null、GMS存在；中文精确三行“离线文字识别 / 备忘录扫描测试 / 本地保存2026”，识别阶段459ms；空图 empty、text空/lines空，68ms。每次识别后重新检查离线条件；原始选择字节相同、ready重新打开相同、ack后session_missing均实际执行。
- force-stop 后新生命周期运行 perspective-pdf，使用真实 Bitmap/Images.correct/PdfDocument/PdfRenderer。透视非矩形四角的4像素误差0..1，2页PDF重排、90°旋转、横竖向与8像素误差0..1；PDF118502字节，SHA 9c0f23061ee20df12d15665e1448847422666c0f198fbae619e38bb1d2021b07；ready重开和ack实际执行。原始透视图、校正图、两页渲染图、PDF、ready manifest和原tar完整保留。
- Gradle --offline assembleDebug testDebugUnitTest 成功，109任务，11执行；原JVM测试2/2通过。JVM测试不替代上述设备夹具。
- 结束后 force-stop harness，恢复开始时网络 airplane0/wifi1/data1；逐项核对与 network-restored.json。设备现交回独立verify，无其他驱动。

## 复现与交接

构建使用 Java17、现有 Gradle9.6.1/缓存及 SDK；fixed-build.txt 为最终日志，manifest.json 为最终源码/APK/AAR SHA。debug-only 夹具只有 standalone 项目加入；主宿主不包含这些导出 Activity。

```sh
JAVA_HOME=/opt/zerobrew/Cellar/openjdk@17/17.0.19/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=/Users/water/Library/Android/sdk GRADLE_USER_HOME=/private/tmp/notes-scan-gradle-home /Users/water/.gradle/wrapper/dists/gradle-9.6.1-bin/4ticwg1pgcbps2hj28r8so764/gradle-9.6.1/bin/gradle --offline --no-daemon -p plugins/tauri-plugin-notes-scan/android -PtauriAndroidPath=/Users/water/.cargo/registry/src/mirrors.ustc.edu.cn-38d0e5eb5da2abae/tauri-2.12.5/mobile/android :harness:assembleDebug assembleDebug testDebugUnitTest
adb -s emulator-5580 shell am start -W -n com.local.notesscan.harness/com.local.notesscan.DeviceFixtureActivity --es scenario path-boundary
```

其他 scenario：path-diagnostic、ocr-first-offline、perspective-pdf。首次OCR必须先保全既有结果，只清harness数据，设置离线，再首次进入ocr-first-offline；不可先运行OCR或把本开发者运行当独立复验。启动成功不代表测试通过，读取 files/device-fixture-latest.txt 指向目录里的 finishedAt/status/checks，再导出整个目录。path-boundary 会临时替换本测试包扫描根后finally恢复，勿在有真实数据的宿主App中加入此夹具。现存harness已经运行过首OCR，verify首次试验必须再次单独记录干净状态。

本证据仅为原生模块路径/OCR/透视/PDF开发自测。相机权限/取消、无GMS、自动检测/裁角触摸、Tauri invoke、主App事务/选区、像素一致性均未据此声明通过；主App正式接入和独立复验仍需另行完成。
