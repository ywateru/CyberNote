# APP-004 扫描插件独立验证

日期：2026-11-03。验证基线：`9340dba` 的 `plugins/tauri-plugin-notes-scan/`。本轮没有修改插件生产代码，也没有读取正在修改的主应用作为验收基线。独立验证仅覆盖扫描模块；没有操作 GUI、Android 设备、相机或原版备忘录。

## 实际执行

| 检查 | 结果 | 证据 |
|---|---|---|
| Rust 现有会话测试 | 2/2 通过，实际重新运行 | `rust-tests.txt` |
| Android Rust 目标 | `aarch64-linux-android` 离线 check 通过 | `android-rust-check.txt` |
| 前端接口类型 | strict/noEmit 通过 | `api-types.txt`（成功无输出） |
| Mac 三行中文 | 真实 ImageIO→Vision accurate，逐行精确匹配；ready 后重开、读取、ack 删除通过 | `chinese-fixture.png`、`macos-chinese-result.json`、对应 log |
| Mac 空白图 | 真实识别返回 `empty`、空字符串；重开、读取、ack 删除通过 | `blank-fixture.png`、`macos-blank-result.json`、对应 log |
| 独立会话边界探针 | 10 类检查通过，含实际文件/会话、真实 OCR 后 ready 不可变、过期删除 | `boundary-probe/`、`boundary-result.json`、`boundary-log.txt` |
| Android 库/APK | 离线强制重跑，39s，109/109 tasks 实际执行 | `android-build.txt` |
| Android JVM 局部测试 | 几何/token 2/2 通过，无跳过 | `android-unit-tests.xml` |
| APK 模型与原生库 | 独立打开 ZIP，25 个模型共 2,490,310 字节，Hani 模型及四种 ABI 的 OCR 库存在；逐文件 SHA 与开发证据一致 | `artifact-inventory.json`、`independent-zip-audit.json` |

边界探针实际检查：A 会话图像 token 不能在 B 读取；路径/绝对路径 token 拒绝；符号链接文件拒绝；0/超 256 KiB 读取拒绝；越界 offset 拒绝而文件末尾允许空 EOF；137 字节分块重组与磁盘原文件字节一致；真实 OCR/finish 后拒绝再导入和再识别；ack 后 token 失效；修改测试会话时间后返回 expired 并清理；最多 8 会话；请求的未知 path 字段被反序列化拒绝。

首次边界探针把符号链接拒绝码预期写成 `file_missing`，模块实际按代码返回 `invalid_token`。修正独立探针预期后在另一个全新目录重跑通过。初次日志保留在 `boundary-first-log.txt`；没有修改生产代码适配探针。

图片由插件自带 Swift 脚本在新证据目录无窗口生成。首次 Swift 默认模块缓存写入受限，改用 `/private/tmp/qa-scan-swift-cache` 后完成。Vision 探针经授权无窗口进程运行；本轮没有强制断开网络，不能称为断网实测。首次 Gradle 受本地 socket 限制，授权后运行；缓存命中的构建没有作为最终证据，最终使用 `--rerun-tasks`。

## 当前重建产物

- APK：`plugins/tauri-plugin-notes-scan/android/harness/build/outputs/apk/debug/harness-debug.apk`，54,016,095 字节，SHA-256 `6c0ec0c3b90f0dec4b2389d2f4fd510ddc1f818fdeb983e211ee30f57d310939`。
- AAR：`plugins/tauri-plugin-notes-scan/android/build/outputs/aar/notes-scan-standalone-debug.aar`，75,487 字节，SHA-256 `df8784c0940efd85ed76a53393b601b02d0060de788c589ee7e0116742c3da3c`。

重建 APK 的整体大小/hash 与开发者旧产物不同；本轮清单记录当前真实产物。独立比较确认源码、模型及原生库逐文件 hash 与开发者清单一致，AAR 字节 hash 也一致。不宣称整个 APK 可逐字节复现。AAR 不包含全部传递模型依赖，集成方必须保留 Gradle 依赖。

## 复现

在仓库根执行，Mac Vision 命令需要能访问系统识别服务。`FRESH_PRIVATE_ROOT` 必须是不存在的新测试目录；边界探针会主动拒绝复用目录。

```sh
cargo test --manifest-path plugins/tauri-plugin-notes-scan/Cargo.toml --locked --offline --target-dir plugins/tauri-plugin-notes-scan/target
cargo check --manifest-path plugins/tauri-plugin-notes-scan/Cargo.toml --locked --offline --target aarch64-linux-android --target-dir plugins/tauri-plugin-notes-scan/target
./node_modules/.bin/tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler --skipLibCheck plugins/tauri-plugin-notes-scan/guest-js/index.ts
swift -module-cache-path /private/tmp/qa-scan-swift-cache plugins/tauri-plugin-notes-scan/scripts/generate-fixture.swift docs/verification/qa-scan-plugin/chinese-fixture.png
swift -module-cache-path /private/tmp/qa-scan-swift-cache plugins/tauri-plugin-notes-scan/scripts/generate-fixture.swift docs/verification/qa-scan-plugin/blank-fixture.png --blank
cargo run --manifest-path plugins/tauri-plugin-notes-scan/Cargo.toml --locked --offline --target-dir plugins/tauri-plugin-notes-scan/target --example macos_probe -- IMAGE PRIVATE_SESSION_ROOT
cargo run --manifest-path docs/verification/qa-scan-plugin/boundary-probe/Cargo.toml --locked --offline --target-dir plugins/tauri-plugin-notes-scan/target -- ABSOLUTE_IMAGE FRESH_PRIVATE_ROOT
```

Android 实际执行环境：Java17 `/opt/zerobrew/Cellar/openjdk@17/17.0.19/libexec/openjdk.jdk/Contents/Home`；SDK `/Users/water/Library/Android/sdk`；Gradle9.6.1 `/Users/water/.gradle/wrapper/dists/gradle-9.6.1-bin/4ticwg1pgcbps2hj28r8so764/gradle-9.6.1/bin/gradle`；Tauri Android `/Users/water/.cargo/registry/src/mirrors.ustc.edu.cn-38d0e5eb5da2abae/tauri-2.12.5/mobile/android`。设置 README 所述 `NOTES_SCAN_*` 后调用 `check-android.sh --offline --rerun-tasks assembleDebug testDebugUnitTest`。

## 未覆盖

Android 首次安装断网/无 GMS OCR、选图及权限/取消、真实相机与自动四角检测、实际透视/滤镜/多页 PDF 内容和页序、进程重启与晚到 OCR 的竞态，均未运行。JVM 的几何测试不能替代这些运行结果。Tauri WebView invoke、宿主 `copy_file_to` 实际运行、宿主管理附件与笔记事务、冷启动及归档闭环、任何主应用入口、像素对比均未验证。结论仅允许继续主应用集成与设备验收。
