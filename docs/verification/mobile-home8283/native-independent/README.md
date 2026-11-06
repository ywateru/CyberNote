# 82+83组合双端独立核包

状态：**PASS-BOTH-PACKAGE-IDENTITY**。2026-11-06，准确来源commit `1f735ebe4881399699b6ba769e29f82a52278e7c`。在合入后4张截图生成、runtime cleanup并确认index/dist逐字节恢复之后，串行运行只读核包。**完整外层自然exit0 / 6.911609542秒**，核包脚本内部6.860393秒；完整自然进程见 `process.json`，逐命令退出及stdout/stderr SHA见 `commands.json`，实际核包结果见 `result.json`。

实际执行命令使用根准确交付的两个manifest：

```text
python3 docs/verification/mobile-home8283/native-independent/audit-packages.py \
  docs/verification/mobile-home8283/native-build/result.json \
  docs/verification/mobile-home8283/android-build/result.json
```

| 实际核验产物 | 字节数 | SHA256 |
| --- | ---: | --- |
| `artifacts/mobile-home8283/备忘录-Mac26.zip` | 5,066,010 | `799ff1907dc5c692e29fc6d72bd08898a3e6dd7010a3fa364717265bada2e903` |
| `artifacts/mobile-home8283/备忘录-Android16.apk` | 182,442,234 | `26a9d3a9fcd42cd89d9e5e43117b67e2fbf3ff2c20e684322d8cb31488e3dc60` |

两个manifest各293项产品/原生/配置输入，均逐项核对构建before、after、当前工作树及准确来源commit的bytes/SHA完全一致；核包结束再次检查。ZIP/APK实际大小、SHA与manifest一致且前后不变。驱动拒绝覆盖原result或提取目录，提取大文件仅写 `artifacts/mobile-home8283/verification-extract/`，没有构建、重签、安装、启动或读取用户数据。

Mac原始app strict自然exit1，原始stderr保留于 `original-strict.stderr.txt`：`code has no resources but signature indicates they must be present`。派生交付app strict自然exit0，Identifier为com.local.notesclone、ad-hoc签名、未设TeamIdentifier。原/派生只改变可执行文件签名及CodeResources路径，Info.plist字节和全部实际Mach-O section内容一致；原始app保留且前后未变。ZIP内条目唯一、CRC可读、文件内容与权限均与派生app一致，没有路径穿越条目。

Android签名工具自然exit0，APK v2签名验证通过；包名com.local.notesclone，唯一ABI arm64-v8a，实际so为ELF64 little-endian AArch64。Manifest保留RECORD_AUDIO及FileProvider。APK条目唯一、CRC可读、无路径穿越，实际ELF从提供APK提取，未读设备或已装应用。

从Mac原/派生Mach-O和Android实际ELF提取出4个嵌入前端资源。3个JS/CSS资源与准确构建snapshot逐字节一致，两个平台资源相同且不含调试fixture入口标记。嵌入index.html为478字节、构建snapshot为498字节，raw bytes不同；完整有序HTML parser tokens全部相同，差异为构建嵌入HTML序列化的空白、doctype大小写、空元素及空属性写法，未将raw等字节冒称成立。提取资源记录及其完整tokens见 `result.json`，原/派生的提取记录一致。

`preparation.json`保留运行前准备历史及模板SHA；本次实际执行与通过结论以上述自然进程及原始结果为准。本次只读核包没有重跑79完整DEX/provider/OCR审计，不替代真实设备/IME/系统chooser/完整WKWebView运行或原版整窗像素验收。Mac为本机ad-hoc包，Android为开发构建，不声明公开分发认证。原Android约13秒未保存录音现场保留，未操作已装应用或真实麦克风。
