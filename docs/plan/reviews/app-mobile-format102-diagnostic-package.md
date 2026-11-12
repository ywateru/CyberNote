---
id: app-mobile-format102-diagnostic-package-review
scope: isolated-diagnostic-package
status: accepted-diagnostic-only-no-install-or-repair-acceptance
reviewer: media99_research
---

# 102 隔离 Android 诊断包独立审查

2026-11-10 Asia/Shanghai。接受该诊断包的源码身份、准确主入口、内嵌资源、签名、对齐、lint及实际DEX诊断sink。此结论不是安装授权、日志实际到达、故障修复或正式交付验收。Android r2 长按正文导致格式面板消失的F1仍为实际失败。

本 reviewer 只读取隔离源码与完成后的包，未构建、安装、操作设备/CUA、清理活跃缓存或发布。独立证据：`artifacts/mobile-format102-package-review/review.json`、`review.mjs`、`dex-sink-excerpts.txt`、签名/对齐/manifest/badging原始结果；JSON另保完整439项源文件长度/SHA256清单。

| 检查 | 独立结果 |
| --- | --- |
| 独立源码目录 | `/private/tmp/cybernote-interface-settings`；作者manifest的相对路径按该目录解析，准确指向root下本次诊断stage，不按root r2误解 |
| revision / 产品输入 | `6f44da39b09f15e667ee542fba5c49d68d22473a`；439项；指纹 `883d862d8d09464affdcc39ba74620c4a91c298ac01f6ca99a7cc3ce0e43a8c6`，当前独立重算等于stamp和包内信息 |
| dirty边界 | prepare记录sourceDirty=false；构建后当前true，仅有未跟踪`plugins/tauri-plugin-notes-media/android/.tauri/`、`android/build/`工具输出。两路径不属于产品输入；逐产品SHA与指纹未变，如实保留，不伪称当前工作树clean |
| 诊断环境 | `VITE_FORMAT102_DIAGNOSTIC=1`、target=android、准确独立stamp路径；source-worktree和origin标记diagnosticOnly=true、尚未install/publish；实际JS中诊断trace路径存在且未被正常env条件剔除 |
| prepare / builtAt | `2026-11-09T17:50:36.200Z` / `2026-11-09T17:50:44.332Z`；版本0.1.0、versionCode1000、Android目标 |
| APK | `artifacts/mobile-format102-native-diagnostic/CyberNote-Android-DIAGNOSTIC102-arm64.apk`；SHA256 `a9bc7c8588253bb3ef166e6e1010559ffe0cce51f9ef00fddac327ed79a31088` |
| 实际入口 | Cargo主库的唯一APK entry `lib/arm64-v8a/libnotes_clone_lib.so`；APK内字节、stage库与sourceLibrary一致，非辅助库替代 |
| 主SO SHA256 | `17308abef6a0b383576f1964214fda8caf597ed94561b22975c3c269aeeb01fa` |
| codegen | 保存目录与origin的全部文件路径/长度/SHA逐项一致；准确metadata/runtime两份编码字节另定位于真实主SO |
| metadata witness | offset1642712，222 B，编码SHA256 `65a0c11846da1493641db251b36b62de5873b52116b7c6afd23f685b1c906ed4`；解码379 B，结构准确等于本次frontend/build-info.json |
| runtime witness | offset1644463，344543 B，编码SHA256 `1918a0420cad8e1cc79354267a2f24be6a5e2f88113838e4fd2c7b46f251128c`；解码1224321 B逐字节等于android-frontend/assets/index-Bd-hHOJA.js |
| 签名 | SDK36 apksigner独立verify=0，v2/v3=true；Debug证书SHA256 `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`，与已核r2相同 |
| 对齐 / lint | zipalign `-c -P 16 -v 4`退出0；保存release lint为`No issues found.`；构建日志记录Finished 1 APK，未重跑build |

## 实际DEX固定sink

从最终签名APK提取实际`classes.dex`（3304944 B，SHA256 `86f79d894aa67c0a763e5eb781bb575d91c2beaa62a4354c085fe0fa2a3c9436`），用既有SDK dexdump静态读取，保留目标类/方法与注解摘录：

- `com.local.notesclone.MainActivity$onWebViewCreate$2.trace(String)`为public final，并保留runtime `android.webkit.JavascriptInterface`注解。
- 实际指令含AtomicInteger计数读取、100预算及incrementAndGet后的限制，再以固定`CYBERNOTE_FORMAT102`调用`android.util.Log.i`。不依赖Wry debug Logger过滤，不仅是JS console字符串。
- 实际MainActivity创建该对象，以`NotesKeyboard`名称调用`WebView.addJavascriptInterface`；嵌入的准确JS亦有对应receiver的trace调用。
- 最终manifest没有android:debuggable属性，未靠打开release debuggable实现sink。

本次曾按REA静态APK入口查询，但provider缺少已配置的JADX MCP JAR，返回capability_unavailable。未安装依赖或修配置；以现成SDK对实际APK DEX的静态指令/注解作为直接证据，非源代码推测。未运行目标程序，不能据此声称native sink已在真机收到日志。

## 处置

诊断包可交parent决定后续单次保数据安装与诊断gate；本审查不自行授予或执行安装。该包是临时诊断分支，包内mode=production只表示生产构建，不表示正式发布或修复完成。不得替换README正式入口，不与r2包指纹混用。待实际关闭链定位、窄修及不同代理独审后，正式交付仍需新的共享prepare和同源双包。
