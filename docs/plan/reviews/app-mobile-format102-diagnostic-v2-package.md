---
id: app-mobile-format102-diagnostic-v2-package-review
scope: isolated-diagnostic-v2-package
status: identity-signature-accepted-full-lint-failed-diagnostic-only
reviewer: media99_research
---

# 102 v2 隔离 Android 诊断包独立审查

2026-11-10 Asia/Shanghai。源码身份、实际APK主入口、嵌入资源、签名、对齐及复用DEX证据通过；本次实际完整lint失败，不能接受为正式release。不得以本报告授予安装、发布或修复验收。Android r2格式面板F1仍为实际失败。

本轮只读取源码和完成后的包，输出仅写入本审查文档与 `artifacts/mobile-format102-package-review-v2/`。未构建、操作设备、清理缓存或发布。可重复字节核验脚本为该目录的 `review.mjs`，详细439项源文件SHA、实际SDK命令输出和嵌入资源定位见 `review.json`。

| 项目 | 独立结果 |
| --- | --- |
| 源码 | `/private/tmp/cybernote-interface-settings`，HEAD `dff5ed501f02ff6fa35a566b5ae8d6f5a4e26716` |
| 产品输入 | 439项；指纹 `e47728b9654af12607d6695a70dbbd90f87f9aa1f8e4e35fc0c3b7a1c27cab25`。准备阶段439项逐字节等于该HEAD Git blob；核包时指纹重算未变 |
| dirty | stamp与当前均如实记录true；未跟踪路径仅notes-media插件Android `.tauri/` 与 `build/` 两个允许的生成根 |
| prepare / builtAt | `2026-11-09T19:48:11.537Z` / `2026-11-09T19:48:19.868Z` |
| 诊断环境 | 独立v2 stamp；`VITE_FORMAT102_DIAGNOSTIC=1`；target=android；source-worktree与origin明确diagnosticOnly |
| APK | `artifacts/mobile-format102-native-diagnostic-v2/CyberNote-Android-DIAGNOSTIC102-arm64.apk`；38,475,914 B；SHA256 `42a561bbff4611738c214c7b924263e8de01f69d79af9211c1ea0053a3da8178` |
| 实际主入口 | `lib/arm64-v8a/libnotes_clone_lib.so`；APK内准确字节、stage主库和origin指向的实际sourceLibrary一致 |
| 主SO SHA256 | `d921c657a4e0ea199aa4d860d3dcc8d35561a7bc9745d4ea95789a7dfd22257e` |
| metadata witness | 实际主SO offset1,615,710；222 B编码SHA256 `a11eb9a9d56be81244676f97fa45bc2c7866cc4c69ddb83f0b5fce65952ac5d8`；解码378 B结构等于本次frontend/build-info.json |
| runtime witness | 实际主SO offset1,615,957；344,089 B编码SHA256 `b70c3ba0b8dd0f91e5b3aa4d2b98310ce392e6a0337e253def14bd743ee8a65a`；解码1,222,534 B逐字节等于本次frontend/assets/index-BQeWRtUE.js |
| codegen来源 | stage与origin所指codegen文件路径、长度、SHA逐项一致；准确metadata/runtime编码字节均存在于实际主SO |
| 签名 | SDK36 apksigner独立退出0；v2/v3=true；Debug证书SHA256 `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`，与v1/r2相同 |
| 对齐 / manifest | zipalign `-c -P 16 -v 4`退出0；versionName=0.1.0、versionCode=1000；最终manifest无android:debuggable属性 |
| lint | 实际 `:app:lintUniversalRelease` 退出1：MissingTvBanner、ImpliedTouchscreenHardware，共2 errors、30 warnings、1 hint；未沿用v1报告 |

## 本次完整lint失败

作者在parent同gate授权下实际执行 `./gradlew :app:lintUniversalRelease -x :app:rustBuildUniversalRelease --max-workers=2`。仅排除已在Tauri RPC中完成并已精确核对的Rust构建任务；完整lint本身未跳过。独立读取本次 `lint-universal-release.log`、`lint-results-universalRelease.txt` 与 `completion.json`，确认BUILD FAILED、退出1及上述2项error/30项warning/1项hint。未把此前release构建完成、签名通过或旧v1 lint报告当成本次lint通过。

两个error均指向默认TV能力声明对应的检查：manifest保留optional leanback feature及LEANBACK_LAUNCHER，但缺少TV banner和显式optional touchscreen声明。这两项TV声明及对应缺项在旧r2基线中已存在，非本次v2诊断修改新增；当前整份源码manifest逐字等于e521306e版本，SHA256 `5e39024be63354d1d0bcbade50a21bc06bf89f4fba81a53a9abb2d5610db56b4`。若与r2 stamp记录的Git revision bf26比较，整文件有networkSecurityConfig那一行差异，不能概括为两份整文件逐字相同。

这些lint错误描述TV启动入口要求，不是当前Samsung/API28手机格式诊断的功能性失败证据；本审查没有操作手机，也不据此推断手机运行安全性或修复情况。parent可单独决定phone-only bounded diagnostic gate；正式release必须先修Task103并重新通过实际lint。

lint后再次读取APK、stage主库及origin指向的sourceLibrary，SHA均与上表准确一致。`source-post-build.json`记录产品指纹仍为e47728…、439项逐Git blob一致。lint产生额外生成输出没有改变已审包字节或源码身份。

## DEX复用与边界

从v2最终签名APK读取的实际 `classes.dex` 为3,304,944 B，SHA256 `86f79d894aa67c0a763e5eb781bb575d91c2beaa62a4354c085fe0fa2a3c9436`，逐字节等于v1已审DEX。因此直接复用 `artifacts/mobile-format102-package-review/dex-sink-excerpts.txt` 中的准确指令事实：MainActivity注册NotesKeyboard对象；trace带runtime JavascriptInterface；AtomicInteger的100预算；固定CYBERNOTE_FORMAT102调用Log.i。没有再次逆向或安装依赖。

本次准确runtime保留诊断trace入口与queueMicrotask；旧metadata-refresh诊断字符串已不在该runtime。源码的关闭后microtask边界由design独审负责；本轮包审只证明该已接受源码身份及准确前端字节嵌入实际主库，不用静态字符串断言替代运行时动作证明。

该包仅用于parent决定的后续诊断，不代表安装授权、日志实际到达、格式面板修复或正式交付。mode=production仅指构建模式，不代表正式发布。不得替换README正式入口。
