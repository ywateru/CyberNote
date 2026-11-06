# sync87 Mac27 / Android17 独立核包

结论：**PASS-BOTH-PACKAGE-IDENTITY，无 blocking package-identity findings。** 本收据是原生安装前的只读包身份门禁，不替代原生运行、系统权限、真实输入法、音频硬件、系统备份/恢复或原版像素验收。

## 运行与来源

工具先冻结为 `53f00505590659d7b066bb89a4e3add3b6992724`，随后只运行一次审计；脚本在写收据前仍与该 git 对象逐字节一致。工具来源、模板 SHA、源码 HEAD 和只读范围见 `provenance.json`。

```text
python3 docs/verification/sync87/native-independent/audit-packages.py \
  /Users/water/work/2026/Apple-Notes-Clone/docs/verification/sync87/native-build/result.json \
  /Users/water/work/2026/Apple-Notes-Clone/docs/verification/sync87/android-build/result.json \
  run01
```

- 真实工作树 `/private/tmp/apple-notes-sync87-package-review`，分支 `codex/sync87-package-review`，基线 `5e552c563bf63364943d1cc41efec9ba8caf3cec`。
- 外层自然退出 **0**，完整墙钟 **18.847822 秒**，见 `process.json` 和对应 stdout/stderr；审计脚本内层 **18.757885 秒**。
- Mac builder 源码 HEAD `8b855420ef7f97bc618ee6b1fdf83caf7156e468`；Android builder 源码 HEAD `5e552c563bf63364943d1cc41efec9ba8caf3cec`。两个 HEAD 的受审构建输入列表及内容完全相同，各 **321** 项；逐项核对构建前/后、现有源文件以及准确 HEAD 的 git 对象，审计结束再次复核输入。
- 原件及派生 app 完整文件清单、ZIP/APK 的审计前后 SHA 不变。大型提取副本仅在 `/private/tmp/sync87-package-review-extract-run01`，未写入产品目录或加入 git。
- `run01/result.json` 保存逐项结果；`run01/commands.json` 保存全部 12 个子命令的真实 argv、自然退出、耗时及 stdout/stderr SHA。所有原始文本均保留，未把预期原签名失败改记为成功。

## 交付包身份

| 包 | 实际文件 | 字节 | SHA-256 |
|---|---|---:|---|
| Mac27 ZIP | `/Users/water/work/2026/Apple-Notes-Clone/artifacts/sync87/备忘录-Mac27.zip` | 6,694,032 | `7d86122f52c904ecc6a24f3407913de4c2e352b936b6937056094d4edf04fc7f` |
| Android17 APK | `/Users/water/work/2026/Apple-Notes-Clone/artifacts/sync87/备忘录-Android17.apk` | 236,444,967 | `e54b7da52b95a65d23f308214ff8e2fa6a93079935f617b6603828e435c68173` |

文件名中的 Mac27 / Android17 是产物代号。真实 Mac `CFBundleVersion` 和 `CFBundleShortVersionString` 均为 `0.1.0`；真实 Android `versionCode=1000`、`versionName=0.1.0`。

## Mac 原件、派生与 ZIP

原始 app 位于 `artifacts/sync87/mac-original.app`，派生 app 位于 `artifacts/sync87/备忘录.app`。两者仅 `Contents/MacOS/notes-clone` 和 `Contents/_CodeSignature/CodeResources` 不同，Info.plist 与其余文件未改变。

- 原件 strict codesign 自然退出 **1**：`code has no resources but signature indicates they must be present`。与 builder 的原始失败一致；原件失败得到保留。
- 派生 strict codesign 自然退出 **0**，`Identifier=com.local.notesclone`、`Signature=adhoc`、`TeamIdentifier=not set`。这是本地 ad-hoc 签名，未声称已公证。
- 完整比较签名区之前 **20,775,104** 字节，只屏蔽 `__LINKEDIT.vmsize`（3312/8）、`__LINKEDIT.filesize`（3328/8）、`LC_CODE_SIGNATURE.datasize`（5276/4）三个载入字段。其余字节相等，规范化 SHA `7eb806169239f4a8e4708f3f565c569a3a4aaad017228ef3c87a4b8437e5799e`。全部 Mach-O section 内容另行逐节相等。
- 签名偏移 20,775,104 不变；原签名 162,480 字节，派生签名 58,880 字节，均准确到达文件末尾；LINKEDIT 文件长度与 16KiB 对齐规则成立。
- 派生可执行文件 **20,833,984** 字节，SHA `de14e5cb62f5d071f2d30a5a590670c00ce8abd589c6eea9fd6d35ad79337187`。
- ZIP 的 7 个文件 entry 无重复或路径穿越，CRC 均通过；所有 app 文件内容及权限匹配派生 app，额外 AppleDouble 元数据有合法头。
- 实际名称为“备忘录”，identifier `com.local.notesclone`，最低 macOS `12.0`，麦克风和相机用途描述存在。

## Android 签名、清单与真实编译资源

`apksigner verify --verbose --print-certs` 自然退出 **0**，APK Signature Scheme v2 为 true；v1/v3/v3.1/v4 为 false。证书 DN `C=US, O=Android, CN=Android Debug`，证书 SHA-256 `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`。

实际包为 `com.local.notesclone`，`debuggable=true`，minSdk **26**，target/compileSdk **36**，仅含 `arm64-v8a`。这是开发签名的原生测试包，不声称商店分发签名。1068 个 APK entry 无重复/路径穿越，全部 ZIP CRC 通过。ELF 检查为 64 位、小端、AArch64（machine 183）；`libnotes_clone_lib.so` **211,140,864** 字节，SHA `a43def5144d3144665236f2a5d45cdc5f0f5ada13466697fdeb84c7007ee0578`。

真实 manifest 中 RECORD_AUDIO、MODIFY_AUDIO_SETTINGS、CAMERA、INTERNET 和 ACCESS_NETWORK_STATE 权限及 `com.local.notesclone.fileprovider` 存在。实际 `allowBackup=false`；不仅检查源 XML，还用 aapt2 验证了 manifest 的真实资源 ID 和编译 XML 完整元素/属性树：

| manifest 属性 | 实际 resource ID | 实际 APK XML | 与冻结源 XML |
|---|---|---|---|
| `fullBackupContent` | `0x7f120000` | `res/xml/backup_rules.xml` | 完整树一致 |
| `dataExtractionRules` | `0x7f120001` | `res/xml/data_extraction_rules.xml` | 完整树一致 |

`backup_rules.xml` 排除 root/file/database/sharedpref/external 的 `.`；`data_extraction_rules.xml` 在 cloud-backup 与 device-transfer 下各包含相同五项排除。该结论限定为包内编译资源身份，没有进行操作系统备份/恢复实验。

## 实际内嵌前端

从 Mac 原件、Mac 派生 Mach-O 和 Android ELF 各自扫描有界 Brotli 资源并解压，记录完整命中；原件与派生记录相同，两端提取的完整资源内容也相同。三个 JS/CSS 逐字节等于各自冻结 frontend snapshot：

| 内嵌路径 | 字节 | SHA-256 | snapshot 比较 |
|---|---:|---|---|
| `assets/index-B1d66sCb.css` | 98,408 | `050663c2c82d40b1c560916855acb162579f0a064e69621aa40941e7559c8f15` | 原始字节一致 |
| `assets/index-CTqYAiCM.js` | 1,085,373 | `1f897242ac476ae77e98a0d15c315291dea03e30ff2f34550cc49465d456b987` | 原始字节一致 |
| `assets/native-recording-access-BwbKtUOw.js` | 1,018 | `bc2b09fcde5dfcb7e9c93bc2423208fd5efc1b0e8ea8d24974c90066872b9dbf` | 原始字节一致 |
| `index.html` | 478 | `1b35a37c2e01591d6f856ac3a9aa80cb992e37552a9a69cea7a8736577d19c9e` | 完整有序 HTML tokens 一致 |

snapshot HTML 为 498 字节，内嵌 HTML 为 478 字节；原始字节有差异，完整有序 parser tokens（元素、属性、文本、声明、注释，忽略纯空白文本）一致。未将 token 等价冒认为原始 HTML 字节相等。完整 token 列表保留在 `run01/result.json`，三个提取结果的紧凑原件分别为 `run01/*-extraction.result.json`。

内嵌前端不含 `__NOTES_DEBUG__`、`SyntheticMediaRecorder`、`__DEBUG_PLATFORM__`。此结论只是上述生产资源检查，不覆盖 Rust 二进制内因开发构建而存在的其他调试设施。

## 独立性与边界

本次无构建、签名、下载、安装、app 启动、ADB/设备操作、真实麦克风、用户数据访问或主线写入。工具与证据仅在 owned review 树；大型提取副本仅在 owned `/private/tmp`。旧 Android 未保存录音现场不受影响。

上下文恢复时发生额外只读操作：检查主线 git/package/既有 gallery 文档和源文件名，阅读本地 skills，查询 agent 状态；没有产品变更或产品运行。此项记录在 provenance，不计为额外测试。

本审计不重复或新增声称 data79 的 DEX/provider/OCR 行为审核，不证明原生运行、输入法、chooser、录音硬件、跨设备同步或原版整窗像素。父任务应另以限定范围的真实原生验收结果决定功能交付。包审计无需重复运行；若这些准确包改变，须以新 run 重新建立身份门禁。

`artifacts-manifest.json` 对本目录的工具、报告、原始输出和结果 JSON 逐文件列出大小与 SHA；只排除清单本身，避免自引用。
