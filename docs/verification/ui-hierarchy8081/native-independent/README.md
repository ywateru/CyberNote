# Mac25 / Android15 独立只读核包

2026-11-06，**PASS-BOTH-PACKAGE-IDENTITY**。独立驱动自然 exit 0，完整外层 wall **7.930828s**（内部 7.878345s）。准确构建输入 commit `2709aa558d0bc6dc453ceb49b10ba4b896e96e27`；两个 manifest 均为291项输入，before/after/current/commit 逐字一致。产品源码沿用已独审的 `ad3a069f`，没有在核包期间修改。

| 产物 | 大小 | SHA256 |
| --- | ---: | --- |
| `artifacts/ui-hierarchy8081/备忘录-Mac25.zip` | 5,063,448 bytes | `a097dfcd27bddac55af23d31f4a79065c3a4f4ebe840f5116689780fe7ef60a2` |
| `artifacts/ui-hierarchy8081/备忘录-Android15.apk` | 182,425,850 bytes | `0e52c5872c9d294808d9afa5752e29cb1d9bdeb7c8a15988f95bb236cfcce9ac` |

Mac25 使用 `../native-build/result.json`，APK 使用 `../android-build/result.json`。Mac 原构建 app 与派生 app 的所有文件逐项等构建记录；差异只限主可执行文件签名和 `_CodeSignature/CodeResources`，Mach-O 所有 section 的内容不变。ZIP CRC、唯一/安全路径、全部 app 文件字节和文件权限均通过。原构建 app 的严格签名检查自然 exit 1，与构建时原始失败相同且日志保留；实际交付的派生本地 adhoc app 严格签名自然 exit 0，不能将原失败追认为通过。

Android15 的 APK CRC、唯一/安全路径、包名 `com.local.notesclone`、arm64-v8a ABI、ELF64 little-endian AArch64、麦克风 permission 与 FileProvider manifest 均核对通过。`apksigner verify` 自然 exit 0，v2 signature true。此次未安装、启动或操作设备，也没有重跑或新声称旧79的 DEX/provider/OCR 功能审计。

从原/派生 Mac Mach-O 与 APK 内真正的 ELF 分别有界解压出前端资源。三份 JS/CSS 资源均逐字等各自冻结前端 snapshot，两个平台资源内容相同；HTML 因构建序列化原始字节不同，以完整有序 tokens 核对等价，未声称 HTML 原字节相同。实际内嵌资源中不含 `__NOTES_DEBUG__`、`SyntheticMediaRecorder`、`__DEBUG_PLATFORM__` 调试标记。

- `result.json`：完整双端结论、准确 manifest、源码、产物、资源和签名记录。
- `audit-command.json` / `audit.stdout.txt` / `audit.stderr.txt`：准确 argv、完整 wall、自然 exit 和实际驱动 SHA；`commands.json` 与各子命令日志保留所有原始退出，包含 Mac 原签名失败。
- `audit-packages.py` / `extract-assets.mjs`：此次真实执行的精简独立核包驱动；extractor 适配已验证79先例的 Mac/Android manifest 字段，无额外依赖。
- `*-assets-result.json` / `extracted-payload-map.json`：三次实际解压的 offsets、bytes、SHA 与大提取物位置。大 binary 和资源只在 `artifacts/ui-hierarchy8081/verification-extract/`，没有写进 docs。

此结论证明提供的本地产物、源码身份、嵌入资源、签名与归档完整性。没有构建、重新签名、安装、启动已装应用、操作 GUI、真实麦克风或用户数据；原 Android 约13秒未保存录音现场保持。它不证明真实 WKWebView/Android运行效果或 Apple Notes 整窗像素一致。根已清理本轮3个干净且已合并的 worktree/分支，旧历史 worktree、主依赖与本次持久证据保留。
