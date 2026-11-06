# 任务79双端独立核包

Mac24 为 **PASS-PACKAGE-IDENTITY**，Android14 为 **PASS-APK-IDENTITY**。最终保全映射复验均自然退出 0，完整 shell wall 分别为 1.67 秒、2.46 秒。机器结果为 [result.json](result.json) 与 [android-result.json](android-result.json)。核包源码基准为 `9afb86b1e18932e59f890d6d6cdb532082ea59b9`；两端各 288 个 tracked 构建输入的 before、after、当前工作区 bytes/SHA 与准确 commit bytes 全部一致。

本报告只证明 supplied artifacts 的身份、资源入包和实际 DEX 静态指令。Android provider / ContentResolver 真机运行、WKWebView / Android WebView 实机呈现、苹果备忘录像素一致性仍为 OPEN。未安装或启动包，未操作已安装 Mac app，未访问真实麦克风或用户笔记，未接触原 Android 约 13 秒未保存录音现场。

## 准确输入与产物

路径均相对于仓库 `/Users/water/work/2026/Apple-Notes-Clone`。

| 输入 | 路径 | bytes / SHA256 |
| --- | --- | --- |
| Mac 构建 manifest | `docs/verification/data-management79/native-build/result.json` | 内含固定 frontendSnapshot、288 输入及完整文件 inventory |
| Mac ZIP | `artifacts/data-management79/备忘录-Mac24.zip` | 5,057,968 / `b6fe404f4f2090cc6c6504a339f56b4d4f6a77bfe312d999a884968a1be8a5be` |
| 原 Mac executable | `artifacts/data-management79/mac-original.app/Contents/MacOS/notes-clone` | 16,981,856 / `4a1d7c0ce36298ee5fd3bd07e65565dbbcd8b775ffd460cb1a969c93c08cce57` |
| 派生 Mac executable | `artifacts/data-management79/备忘录.app/Contents/MacOS/notes-clone` | 16,901,264 / `6fe1f9b7251479d2eb7df6bebd89c7c2209040a24ae90dd40a6ed89408e23fe9` |
| Android 构建 manifest | `docs/verification/data-management79/android-build/result.json` | 内含固定 frontendSnapshot、288 输入及 APK 身份 |
| Android APK | `artifacts/data-management79/备忘录-Android14.apk` | 182,425,850 / `8eeb51ff8b4f95f152d8a48a19b8ef5addf5e0201ac327e6f2aa53931128f6d6` |
| APK 实际 arm64 ELF | APK member `lib/arm64-v8a/libnotes_clone_lib.so` | 157,132,648 / `d9b68d1aff1874b12ebb5526723ccc5526592965ebefff2cbceaea863ae68a1c` |
| APK 策略类实际 DEX | APK member `classes4.dex` | 131,224 / `a2bbccc0204c25874f7156818a55f6487d3bc5b62235446afa951a3d1ebcf29d` |

独立核包没有读取动态根 `dist` 或共享 native target bundle。Mac 使用固定 `artifacts/data-management79/mac-dist`，Android 使用固定 `artifacts/data-management79/android-dist`。

## Mac 文件、签名与嵌入资源

原包、派生包完整文件 inventory 与构建 manifest 一致，审计前后不变。差异仅位于 `Contents/MacOS/notes-clone` 和 `Contents/_CodeSignature/CodeResources`；全部 Mach-O section 内容逐段核对一致。ZIP 校验 CRC、全部正常文件 bytes、mode、无重复或 unsafe 路径，额外内容限合法 AppleDouble metadata。Info.plist 的 bundle ID 为 `com.local.notesclone`、显示名为 `备忘录`，麦克风用途声明存在。

只读 `codesign --verify --deep --strict --verbose=4` 的原始结果全部保留：原包自然 exit 1，错误为 `code has no resources but signature indicates they must be present`；派生交付包自然 exit 0，输出 `valid on disk` 和 `satisfies its Designated Requirement`。原包失败没有抹去或替换为通过。派生为本地 adhoc 签名，无 TeamID；没有 Developer ID 或 notarization 通过结论。准确 argv、每条退出码、wallMs 和日志 SHA 见 `result.json.signatureCommands`。

从原、派生 Mach-O 和 Android 实际 ELF 进行有界、完整 Brotli 解压，对每个资源比完整 bytes/SHA。`extract-assets.mjs` 的每项候选、偏移、压缩长度、完整解压 hash 均在提取 result 中保留，最终 token 对比由 Python 独立进行。

| 实际嵌入资源（三份均相同） | 解压 bytes | SHA256 | 与各自固定 dist 的比较 |
| --- | ---: | --- | --- |
| `assets/index-CRozYZJJ.js` | 1,038,890 | `8b3b66f1a2a01d8c056a81197c20fc1af122a3d02b75351976c76a7c558daf19` | 完整逐字相同 |
| `assets/index-DSx5KCxz.css` | 85,101 | `7bc3e44946fffaa89b11fac029eb10fd8d386f8eea05ffc2880ff1237d37f35c` | 完整逐字相同 |
| `assets/native-recording-access-BXnjOlDB.js` | 1,018 | `e69f86cdf0c57c7f6acf330add5c565f11fc58030dab43b2f2447a8b21942785` | 完整逐字相同 |
| `index.html` | 478 | `f8c1500ae3355dcd57b739335d1020eb6d92e6c16a5ec65ffbe8de634bf9b2d2` | 固定 dist 为 498 bytes，raw bytes 不同；完整有序 HTMLParser tokens 相同 |

HTML 的差异为 Tauri 嵌入时合法排版及空 boolean attribute 序列化规范化；没有声称 raw HTML 一致。完整有序 tokens 包含所有声明、标签、属性和值、非空文本及注释，见 [html-comparison.json](html-comparison.json) 和 `android-result.json.htmlComparison`。

## Android 签名、ELF、实际 DEX 方法

APK CRC、完整 hash/大小、无重复或 unsafe member 路径均核对。实际包仅含 `arm64-v8a`；实际 `.so` 为 ELF64 little endian AArch64（e_machine 183），提取内容逐字等 APK member。生产资源无 `__NOTES_DEBUG__`、`SyntheticMediaRecorder`、`__DEBUG_PLATFORM__` 调试标记。

SDK 36 `apksigner` 自然 exit 0：v2=true，v1/v3/v3.1/v4=false，一名 Android Debug signer，DN 为 `C=US, O=Android, CN=Android Debug`，cert SHA256 为 `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`。`aapt2` 的 badging 和 manifest dump 自然 exit 0，核对 `com.local.notesclone`、`RECORD_AUDIO` 和自身 fileprovider。准确 argv、wallMs、退出码见 `android-result.json.commands`。

通过实际 DEX header/class table 定位 `classes4.dex`，并对 SDK `dexdump -d -f` 的真实方法指令检查。此处没有用文件名或单纯 class 字符串存在代替方法证据：

- `DocumentUris`（class index 5）的 `normalizedAuthority` 含数字 user 前缀 `[0-9]+`、`Locale.ROOT` 小写归一、合法字符及 512 长度限制；`isManagedAuthority` 含自身 package 前缀及 provider 别名 split。
- `NotesScanPlugin`（class index 13）的 `copyDocument$lambda$8` 实际执行 `getAuthority`、`PackageManager.getPackageInfo` 和 `isManagedAuthority`，该保护调用的指令位置在 `openOutputStream` 之前；存在 `protected_target`、`wt`、`DocumentStreams.copy`、`CloseableKt.closeFinally` 指令证据。
- `DocumentStreams`（class index 4）的 `copy` 实际使用 `#00008000`（32 KiB）buffer，包含 bulk read、零字节 read fallback、size 异常、write 及 flush。
- `copyDocument` → class index 8 synthetic lambda → `copyDocument$lambda$8` 调用链实际存在。focused 选段为 `android-class-DocumentUris.txt`、`android-class-DocumentStreams.txt`、`android-class-NotesScanPlugin.txt` 和 `android-class-NotesScanPlugin__ExternalSyntheticLambda0.txt`。

这些结论仅为实际入包与指令顺序的静态证据，不能证明 Android URI/provider 在设备上的运行行为。

本轮应用 `/Users/water/.agents/skills/reverse-engineer-anything/SKILL.md`，实际调用 REA `inspect_android_package` 读取准确 Android14 APK。服务返回 `capability_unavailable / unsupported_provider`：`REA_JADX_MCP_JAR` 未配置，`diagnostics.jar_configured=false`、`failure_kind=jar`、`failure_code=not_configured`。未配置或安装额外工具，按技能 fallback 使用已有 SDK dexdump/aapt2；未伪造 REA EvidenceID。

## 运行记录和可复现参数

[runner-identities.json](runner-identities.json) 记录当前审计脚本 SHA、固定映射 SHA、每项执行程序参数、cwd、完整 time wall、自然退出码和日志 SHA。这里的 argv 是程序复现参数，未伪称原 shell 历史。提取、签名、反汇编及审计均由此前真实执行产生；本次整理文档没有重跑检查。

| 执行 | 自然 exit | 完整 shell wall（秒，time 日志） | 日志前缀 |
| --- | ---: | ---: | --- |
| 原 Mach-O 完整资源提取 | 0 | 0.08 | `extract-original` |
| 派生 Mach-O 完整资源提取 | 0 | 0.08 | `extract-derived` |
| Android ELF 完整资源提取 | 0 | 0.25 | `extract-android` |
| SDK 实际 DEX 反汇编 | 0 | 0.43 | `android-dexdump` |
| Mac 初次完整审计 | 0 | 3.56 | `audit` |
| Mac payload 保全映射后复验 | 0 | 1.67 | `audit-preserved` |
| Android 初次完整审计 | 0 | 2.71 | `android-audit` |
| Android 完整 dump 保全后复验 | 0 | 2.46 | `android-audit-preserved` |

最终机器结果内部 completeWallMs 为 Mac 1613.27 ms、Android 2423.73 ms；表格使用包含进程启动收尾的完整 shell wall。原包 codesign strict exit 1 为单独记录的输入签名状态，核包 runner 按预期识别并保留这一差异，因此自身自然 exit 0。

最终审计复现命令（仓库 cwd）：

```sh
python3 docs/verification/data-management79/native-independent/audit.py docs/verification/data-management79/native-build/result.json
python3 docs/verification/data-management79/native-independent/audit-android.py
```

两条命令顺序执行即可；会改写本目录相应结果/日志，不编译、不签名、不安装。审计脚本源码身份、其它 extraction/dexdump 程序完整参数和日志位置均见 runner-identities。重新执行最初 Mac 提取参数会在 docs 重建 payload；若需要重新提取，应把输出保留在 artifacts 并同步保全映射。

## payload 保全与仓库范围

编译资源、实际提取 ELF/DEX、完整 DEX disassembly 全部在 `artifacts/data-management79/verification-extract/`。docs 只保留审计源码、输入/结果 manifest、日志、少量关键方法选段和本说明。

| 初始输出 | 当前保全位置 |
| --- | --- |
| 本目录 `original-assets/` 下 JS/CSS/HTML | `artifacts/data-management79/verification-extract/mac-original/` |
| 本目录 `derived-assets/` 下 JS/CSS/HTML | `artifacts/data-management79/verification-extract/mac-derived/` |
| 本目录 `android-dexdump.stdout.txt`（1,402,220 bytes） | `artifacts/data-management79/verification-extract/android/dexdump.stdout.txt` |
| Android 实际 ELF / DEX / embedded-assets | `artifacts/data-management79/verification-extract/android/` |

[payload-preservation-map.json](payload-preservation-map.json) 逐文件记录原输出、保全绝对路径、bytes、SHA。Mac/Android 审计脚本均支持映射读取，并已在移动后自然通过。完整 DEX dump 的 SHA256 为 `c01aaf4158f0150021a3ec2f68c443d4b4d7e081db05f22be35d449e327950e3`。`original-assets/result.json`、`derived-assets/result.json` 与 `android-assets-result.json` 保留提取身份；compiled payload 没有留在 docs。

本子任务未 stage/commit、未修改主线产品代码或构建产物。最终只读进程快照未发现本轮 audit、extract-assets、dexdump、apksigner 或 aapt2 遗留进程；不终止其它用户进程。
