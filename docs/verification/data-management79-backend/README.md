# 本地数据管理79后端开发验收

2026-11-06。仅操作 `/private/tmp/data79-*` 新建合成数据；原 Android 约13秒未保存录音现场、原数据库及原录音完全未读取或操作。没有设备安装、启动、停止、重启，也未操作原版Notes删除实验。

## 冻结与实现

产品首次冻结 `e9635f3a`，独审反馈的自身 ContentProvider 目标保护修复冻结 `2420faa8`，测试源码冻结 `d74d76f486b69fe2b27da533b84be4e341a25bc4`。最终原始命令均以测试冻结为HEAD；`source-manifest.json`逐文件比较工作区与冻结commit，包含真实Rust源、Cargo锁、插件Kotlin/Rust/Gradle与runner。产品没有为测试修改存储或Session逻辑。

- `get_data_management { expected }` 使用真实Session全局token/pending检查，typed快照直接顶层version/files/totals/counts/warnings，带现有access/metadata envelope。逐路径 `symlink_metadata/read_dir`，列DB/WAL/SHM、已登记/缺失附件、未归属文件、目录、symlink、runtime与导入残留，不checkpoint/vacuum/清理，不读取附件payload。不返回笔记正文/标题；无权owner的displayName为null，referenced未知为null，禁止导出。
- 真实媒体继续位于 `attachments/`，SQLite和附件operation journal只保存元数据/引用，本轮不迁移或重新编码已有文件。物理大小为普通文件逐路径 `metadata.len()` 的逻辑长度之和，目录、缺失及symlink不计字节；不是allocated disk blocks，hardlink按路径计数。修改时间来自实际filesystem mtime，取不到为null并警告，不填采样时间冒充mtime。扫描期间可见变化/读取失败有warning。
- `export_attachment { id, path, expected }` 重新按ID查原owner，经 `Session.sensitive`，拒symlink、缺失或大小不符的受管原件，返回普通 `{ name, bytes, mime }`。桌面在目标同目录唯一temp写入、sync、再次验证、rename、sync目录；失败仅清自身temp。所有数据root（含canonical alias）禁止作为用户导出目录，已有symlink/目录目标拒绝。整包导出亦使用相同保护，附件读取亦拒受管symlink。
- Android system picker `content://` 走现notes-scan插件的host-only `copy_document`。Rust未新增通用JS文件命令；Rust `invoke_handler`/权限仍仅execute，Request不包含文档复制。native仅接受 `.document-io/<host UUID>/payload` 私有stage，不接受任意路径；32KiB有界流，归档256MiB、单件100MiB，检查原字节数，双方stream flush/close全部成功才返回。输出URI不支持桌面原子替换；失败明确返回，不删除provider既有文档。
- 输出URI在任何openOutputStream前按真实 `activity.packageName`、其所有PackageManager声明provider authority拒自身FileProvider、应用包名前缀与自定义别名。使用 `Uri.authority` 已解码值、Locale.ROOT标准化并识别Android数字userId前缀，拒歧义authority。附件与归档复用同一路径。
- Android导出在blocking worker持Session锁至native stream关闭，撤权不能插在授权/写出中间；导入只把URI有界复制至唯一stage，再走原preflight/真实参与窗口prepare-ACK/合并事务。stage移交真实barrier worker持有，command future取消不提前删除pending import文件；结束仅删除自身payload与空操作目录。异常退出残留只显示统计，不自动清理未知内容。

## 最终结果

| 范围 | 完整进程wall | 自然exit | 结果 |
|---|---:|---:|---|
| Mac `cargo check --locked --offline` | 16.275s | 0 | 通过，保留原始warn |
| Android aarch64 cfg同锁离线cargo check | 59.276s | 0 | 通过，实际编译新增Android Rust路径 |
| Android Kotlin compile + JVM tests | 48.234s | 0 | 14 tests，0 failure/error/skip（新增流8+authority4、既有geometry2） |
| 当前Session/Store fresh transport构建及依赖来源采样 | 3.653s | 0 | source未变，输出binary SHA256如下 |
| 真实Rust多进程79场景 | 0.756s | 0 | 74 PASS / 0 FAIL，内部场景725ms |

最终transport PID `19561 / 19566 / 19567 / 19568` 均正常stdin EOF后自然exit0，无kill/timeout/遗留请求。binary：

```
/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target/debug/notes-current-attachment-transport
sha256 6ec3b9ecc31a075a75d17d8518e4199c1b5216262b0022682a7ae0b03eda7a17
size 8092080
```

真实Rust覆盖：图片PNG、录音WAV、视频、普通文件的独立原件逐字比对；SQLite表类型/元数据无payload/BLOB；DB/WAL/SHM实际大小与mtime；missing、大小不符、未登记附件、runtime/cache、空目录、外部symlink不跟随；OS撤写权限与不存在目录写失败；全部app-root/alias/symlink目标保护；未知ID、pending barrier、旧PID token、已删除owner拒绝；读取数据管理不删除外来.imports fixture；三个host stage成功/空载清理；完整四媒体备份→fresh目录真实Session preflight/prepare/ACK/finish导入→重复导入冲突副本→新PID再逐件原字节导出。transport的import只模拟一个合成参与窗口，执行真实Session方法；不宣称其证明真实多窗口OS通信。

JVM流测试覆盖chunk边界逐字、未知长度超限、短读/长读不符、零长度及provider返回0不忙等、读失败、写失败、flush失败、晚close失败。authority测试覆盖自身FileProvider、包名前缀、大小写、数字userId、自声明别名及非法authority、外部provider保留。它们是纯流与策略测试，未运行真实ContentResolver provider。

## 精确命令与缓存

所有完整参数及环境在 `native/report.json`、`kotlin/report.json`、`rust-commands/report.json`；完整stdout/stderr在同目录。wrapper原件位于 `runners/`。cargo共享缓存独占使用：

```
CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target
```

没有增加依赖、变更Cargo.lock或修改本机registry源码。真实Rust harness由 `scripts/debug/build-rust-attachments.mjs` 复制当前Session/Store至fresh输出，使用locked/offline Cargo，记录source SHA、Cargo实际依赖图与逐包来源digest（registry缺checksum侧文件时明确记录，不隐瞒）。来源在 `rust-build/build.json` 和 `rust-build/dependencies.json`，实际payload fixture继续留在 `/private/tmp/data79-rust-validation-04`。

Android Rust NDK为 `27.2.12479018/toolchains/llvm/prebuilt/darwin-x86_64/bin`，CC/CXX/AR与linker精确值在native report，API26；目标 `aarch64-linux-android`。Android Kotlin使用：

```
ANDROID_HOME=/Users/water/Library/Android/sdk
NOTES_SCAN_TAURI_ANDROID=/Users/water/.cargo/registry/src/mirrors.ustc.edu.cn-38d0e5eb5da2abae/tauri-2.12.5/mobile/android
NOTES_SCAN_GRADLE=/Users/water/.gradle/wrapper/dists/gradle-9.6.1-bin/4ticwg1pgcbps2hj28r8so764/gradle-9.6.1/bin/gradle
NOTES_SCAN_GRADLE_HOME=/private/tmp/notes-scan-gradle-home
bash plugins/tauri-plugin-notes-scan/scripts/check-android.sh --offline testDebugUnitTest compileDebugKotlin
```

SDK compile36、min26、Gradle9.6.1及现有离线依赖锁。没有生成/交付含旧UI的APK；最终应用双模块整合打包由根任务处理。

## 探索失败原件与边界

`exploratory/report-01.json`：46项后，runner自建未知 `.imports/foreign79` 未在重开前收尾，触发现有保全恢复拒启（EOF错误）；测试修正仅清理这个明确自建fixture。`report-02.json`：60项后，runner误以为fresh无冲突导入一定重映射所有附件ID，而实际契约是遇冲突才建副本；断言修正并增加第二次冲突导入验证。均未修改产品来使runner通过；原report完整保留。`report-03.json`是第一次74项通过探索记录。最后冻结重跑以 `rust-final/report.json` 为准。

P1自身provider目标保护来自独审，产品已另提交2420faa8并通过最终Kotlin构建/authority测试。真实ContentResolver provider选取/取消、撤授权与磁盘故障运行仍 **OPEN**；Android全设备界面、真实麦克风及原版完整像素亦不在本后端证据范围内。主线前端真实Rust→bridge→App集成、前端全集和最终包由根继续完成，不能用这些JVM/编译结果替代设备验收。
