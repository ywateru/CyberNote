# APP-004 实际宿主复制开发者证据与设备夹具

2026-11-03。补充基线 `9340dba`，该基线已由 `2358901` 独立检查模块。本文为开发者补证，新的宿主探针与 Android 夹具尚待独立复跑，不修改独立 review。本轮只修改插件目录和此验证目录，未访问 GUI、Android 设备、主 App 或原版备忘录数据。

## 已运行：原有宿主复制方法

`examples/host_copy_probe.rs` 使用 Tauri 官方 `tauri::test::MockRuntime` 替代窗口运行时；实际加载原 `init()`，通过 Tauri 官方 appDirectoriesOverride 将数据根限制在新建 `/private/tmp/notes-scan-host-copy-20261103-02/app`。无 WebView 或系统窗口。**插件 setup、`NotesScanExt::notes_scan()`、托管 NotesScan 状态、SessionStore、ImageIO/Vision 和生产 `copy_file_to()` 均是真实调用，没有重写复制器，没有修改生产复制函数。** 测试支持只增加 dev-dependency 的 tauri/test feature。

真实路径：受控图片 → `app.notes_scan().execute(Begin/IngestImage/Recognize/Finish)` → `app.notes_scan().copy_file_to` → 宿主管理的测试暂存路径 → 逐字节比较 → `execute(Acknowledge)`。

| 检查 | 实际结果 |
|---|---|
| 中文 OCR | Vision accurate revision3，三行精确匹配，真实 ready 会话 |
| 完整复制 | 605,425 字节，单块上限 262,144，至少 3 块；内存中独立读取的源文件与目标逐字节一致 |
| draft 拒绝 | session_state，目标不存在 |
| 已有目标 | io / File exists，哨兵内容完整保留 |
| 中途资源异常 | ready 后将本探针私有资源缩短 17 字节，真实 copy_file_to 新建目标后在分块 EOF 检查失败，返回 native；新目标被删除 |
| 失败后的会话 | 保持 ready；恢复完整原资源并 fsync 后正常重试成功 |
| ack 顺序 | 成功复制后仍可 get/read；显式 ack 才删除源会话；ack 后 read 返回 session_missing；宿主副本仍完整 |

原始成功输出是 `result.json`；最终格式化源码构建后的重跑为 `result-final.json`（新建 `-03` 根），两次检查全部通过。完整复制产物保存在 `copied-image.png`；输入为 `chinese-multichunk-fixture.png`，两者不同的 PNG 编码字节数来自实际 ImageIO 归一化。身份与大小在 `identities.json`。fixture 由原有 Swift 生成器增加可选确定性噪点边框，保证跨块读取，不改中文内容。Mac 此次没有强制断网，不能称作网络关闭实测。

复现（工作目录为项目根）：

```sh
swift -module-cache-path /private/tmp/notes-scan-swiftcache plugins/tauri-plugin-notes-scan/scripts/generate-fixture.swift /private/tmp/notes-scan-host-image.png --noise-border
cargo build --manifest-path plugins/tauri-plugin-notes-scan/Cargo.toml --locked --offline --example host_copy_probe --target-dir plugins/tauri-plugin-notes-scan/target
plugins/tauri-plugin-notes-scan/target/debug/examples/host_copy_probe /private/tmp/notes-scan-host-image.png /private/tmp/notes-scan-host-copy-INDEPENDENT-NEW
```

最后一个目录必须不存在，探针拒绝复用目录，避免破坏其他数据。系统 Vision 服务需要正常的进程访问；此前受限进程调用失败，故本次授权无窗口合成图进程运行。首次尝试在 Swift 图片生成尚未完成时启动，因输入不存在退出；没有获得 OCR 或复制结果，不计成功。上面的 `-02` 是生成完成后的完整成功运行。Rust 会话测试仍为 2/2，日志 `rust-tests.txt`。

此证据不包含真实 Wry GUI runtime、WebView invoke、主 App Store 的附件/笔记事务、目标选区漂移或崩溃恢复；不把它写作正式 App 集成验收。

## 已准备、未运行：Android 设备夹具

新增源码仅在**独立项目 debug 构建**加入 Kotlin source set。生产宿主 include 插件时不包含此目录，生产插件 Manifest 未添加导出 Activity。harness Manifest 独立声明 DeviceFixtureActivity，资产包含已保全的中文与空图。编译日志在 `android-fixture-build.txt`；最终 APK/AAR、模型字节和源文件身份见 `android-fixture-artifact-inventory.json`。这只是构建，Android runtime 结果仍 unknown。

最终 `--offline assembleDebug testDebugUnitTest` 成功（18s，109 tasks，10 executed/99 up-to-date），现有 JVM 局部测试 2/2，XML 为 `android-unit-tests.xml`。实际读取 APK dex 确认 DeviceFixtureActivity/SessionStore/Images 类存在，PNG 资产 hash 与原基线一致，见 `identities.json`；不是仅凭 Manifest 或源码宣称已打包。

```text
APK plugins/tauri-plugin-notes-scan/android/harness/build/outputs/apk/debug/harness-debug.apk
54,216,225 bytes; SHA-256 6734d4b22f9d1395759e73a4136f2d53ffa4c5a487b164e993ad419dfe90e0ed
AAR plugins/tauri-plugin-notes-scan/android/build/outputs/aar/notes-scan-standalone-debug.aar
89,023 bytes; SHA-256 36eb8b23aea4ae149bc44c25d29d105dbb175ff59dae7a4e46dd65a998d81f9b
25 bundled model assets; 2,490,310 uncompressed bytes
```

该 AAR 是带夹具的独立 debug 产物，不能将其大小与旧基线生产插件源码等同；正常宿主 include 路径不会加入夹具源集。依赖版本和锁未改变，主 App 构建目录未修改。

设备必须先从 root 取得交接再操作。本轮未执行 adb，未安装 APK、切换网络、启动相机或改变设备设置。下列为后续运行说明，执行者应记录实际设备序列号、系统与 GMS 状态、首次安装/清空时间和网络状态。

1. 在指定测试设备启用飞行模式，关闭 Wi-Fi/移动网络，记录断网前提。安装此独立 `com.local.notesscan.harness` APK；如果该包已运行过，**只清空 harness 包数据**，不要清空主应用。保留安装/清空命令的输出。主应用与该 harness 的包名不同。
2. 首次启动直接指定此夹具，不先点 Probe 的 OCR 按钮：

```sh
adb -s SERIAL shell am start -W -n com.local.notesscan.harness/com.local.notesscan.DeviceFixtureActivity --es scenario ocr-first-offline
adb -s SERIAL shell run-as com.local.notesscan.harness cat files/device-fixture-latest.txt
```

夹具检查飞行模式=1、activeNetwork=null，拒绝重复执行已尝试过的首次 OCR；开始标记不能代替外部清空数据证据。每次实际识别后再检查离线条件。真实 bundled ML Kit 必须返回三行中文（忽略空白后精确匹配）和空图 empty；同时保存模型实际输出、原图 hash、耗时、原始字节保全、ready 重开和 ack。测试生成结果目录的 result.json 出现 finishedAt 后才可读取判定；不得把 Activity 启动成功当作测试通过。原始中文/空图已在 APK 内，运行时不下载测试资产。

3. 运行 `perspective-pdf`：

```sh
adb -s SERIAL shell am start -W -n com.local.notesscan.harness/com.local.notesscan.DeviceFixtureActivity --es scenario perspective-pdf
adb -s SERIAL shell run-as com.local.notesscan.harness cat files/device-fixture-latest.txt
```

这是实际 Bitmap/SessionStore/Images.correct/PdfDocument/PdfRenderer，包含 JPEG 中间产物；不是 Android JVM 的默认返回值，也不靠成功 toast。已知非矩形四角校正后四点真实像素须与预期色误差每通道小于 60；两个 PDF 页面实际解码后验证页序、90°旋转的四色位置和横竖向。夹具保存原始透视 PNG、校正 PNG、PDF、各页渲染 PNG、ready manifest 和检查 JSON，以供独立解码复核。失败也写 status=failed/error，不伪装空成功。

4. 将输出中最新目录名替换 `RUN_DIRECTORY` 后用 run-as 导出：

```sh
adb -s SERIAL exec-out run-as com.local.notesscan.harness tar -C files/device-fixture -cf - RUN_DIRECTORY > /private/tmp/notes-scan-device-fixture.tar
```

确认本地 tar 完整后按原始目录归档并记录 APK hash；不要只复制截图。上述输出尚未生成；无 GMS、相机、权限/取消、自动检测、裁角手势和主 App invoke/宿主提交仍需另外验收。
