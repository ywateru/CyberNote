---
id: app-004-scan-plugin-02
task: app-004-scan-plugin
baseline: e6cc378
result: blocked-android-session-runtime-host-copy-pass
date: 2026-11-03
---

# APP-004 独立运行补审 02

**Android 首次真实设备运行发现 P1：创建会话即失败，两条 native 夹具均未到 OCR/透视/PDF 检查。扫描 Android runtime 当前 blocked。** Mac 无窗口宿主复制补充实测通过；不构成主应用集成通过。此前 `app-004-scan-plugin-01.md` 的模块构建/静态/桌面路径结果仍保留，但其“Android设备运行unknown”现在由本报告的明确失败替代，不能以JVM和打包通过抵销。

证据 `docs/verification/qa-scan-plugin/host-copy-device-20261103/`。本轮没有修改插件生产源码；使用已提交e6cc378夹具及APK，当前共享主App FIX03未提交代码不作为扫描测试基线。

## P1 真实 Android 会话创建拒绝

设备 emulator-5580，Android11/API30、arm64、GMS已装。独立安装前 `pm list packages com.local.notesscan.harness` 为空，首次安装此独立包，不清主App数据；先启飞行模式、关闭Wi-Fi/移动网络，再安装和第一次启动受控OCR Activity。安装内base.apk读回与交接APK完全匹配：54,216,225字节，SHA256 `6734d4b22f9d1395759e73a4136f2d53ffa4c5a487b164e993ad419dfe90e0ed`。

`ocr-first-offline-1793692256377/result.json`：airplaneMode=1、activeNetwork=null、GMS=true，status=failed，checks=[]，ScanFailure“无效会话目录”，started/finished差34ms。中文fixture已从assets复制，SessionStore.begin→save→dir先失败，未调用实际ML Kit，**OCR结果/首次离线模型可用性仍未得到验证**。不能把飞行模式或Activity启动成功当OCR通过，也不能在保留此started标记后重试就称新首次。

随后启动 perspective-pdf 时首次am start输出“intent delivered to running top-most instance”，其Activity未重建，该次不是执行证据。独立force-stop仅harness并冷启动正确scenario后，`perspective-pdf-1793692399511/result.json`在425ms同样ScanFailure“无效会话目录”。生成了expected-flat和perspective-source PNG；SessionStore.begin失败，未到correct/PdfDocument/PdfRenderer。两次原始tar和解压内容均保全。

源码失败点 `plugins/tauri-plugin-notes-scan/android/src/main/java/com/local/notesscan/SessionStore.kt:34`：`f.canonicalFile != f.absoluteFile`。该检查由真实begin→save调用触发，表示正常系统私有目录被拒绝。只读run-as pwd及readlink均返回`/data/user/0/com.local.notesscan.harness`前缀，尚未获得同一Java File对象的两个路径，**具体差异原因未证实**，不把系统别名假设写作确定根因。修复须保留UUID/受管根/符号链接逃逸检查，处理正常Context私有目录，不能简单删除所有canonical边界。

本轮后模拟器网络恢复原值airplane=0、wifi=1、mobile_data=1，逐项匹配`device-before.json`；harness已force-stop，数据/失败证据保留，设备交native实现者最小修复。修复后新候选需再核源与安装内hash，仅清harness或记录新独立包的干净状态，在首次启动前断网，保存失败史，分别完成真实OCR与PDF内容断言。

## Mac 真实宿主复制通过

重新以`--locked --offline`构建原有`host_copy_probe`。使用原受控多块中文图，通过真实plugin init、NotesScanExt、SessionStore、Vision、生产copy_file_to调用；Tauri MockRuntime仅替代窗口运行时。私有新根`/private/tmp/qa-scan-host-copy-20261103-verify-01`完整通过；为保全完整stdout在另一新根`-02`重复一次，保存`host-copy-result.json`。两次根均新建，未接触主App附件或笔记目录。

- 中文真实Vision三行精确匹配；605,425字节复制，chunk上限262,144，至少3块。
- draft复制拒绝且无目标；已有目标拒绝并保留哨兵。
- 本探针私有资源在ready后缩短17字节，真实复制发现长度不一致，清理新目标，ready会话仍可重试；恢复并fsync后完整逐字节相等。
- 成功复制后源仍可get/read；显式Acknowledge后源会话删除、read为session_missing；宿主副本仍完整。
- 宿主副本SHA256 `fa697d61552b4e33122c6b471c214c8593d9c4ce97a8abc0b8aff2255f0be2e4`，原probe源码SHA256 `76ad7a6951e81886bbc355bbe2d320c8732af4c3e5e90de2934650d34923628c`，均独立读取。

Mac此次未强制断网；没有实际Wry窗口、WebView invoke、主App Store事务、崩溃恢复或目标选区漂移。Android首次运行前已断网只适用于其夹具，不替代Mac断网结论。
