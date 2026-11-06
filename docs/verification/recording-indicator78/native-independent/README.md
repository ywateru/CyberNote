# Mac23 独立只读核包

结论：**PASS-PACKAGE-IDENTITY**。本次检查读取构建记录及实际 Mach-O、完整解码其中的前端资源，并逐文件核对归档。它不依赖包名、大小或构建日志判断是否包含新 UI。

执行日期：2026-11-06。源码提交：`52056b4a0af01a7ddead657c2df36da59cdf71c6`。本次构建记录为 `../native-build/result.json`，交付归档为项目根目录下 `artifacts/recording-indicator78/备忘录-Mac23.zip`。

## 执行与时间

`commands.json` 保留三个实际命令、自然退出码和 `/usr/bin/time -p` 完整进程时间；stdout/stderr 同目录保留。两个提取进程独立并行运行，各自然退出 0、real 0.06 秒。随后独立审计自然退出 0、real 2.10 秒，内部 wall 2037.13 ms。没有重跑或被忽略的失败。

两个参数化脚本不固定输入数量、构建资源名、文件大小、压缩流偏移或原包 strict 结果。提取器按照本次 manifest 的资源 basename 查找候选，在后续 0..32 字节内有界 Brotli 完整解码；输出与输入上界按实际资源大小设置。审计器独立核对完整解码输出、当前 dist、本次记录和源提交。

## 实际资源身份

279 个构建输入全部逐字等于上述源提交，构建前、后和本次核验时 SHA/字节数相同，无额外生成输入。原始 .app、派生 .app 和 ZIP 在核验前后也未变化。原包与派生包的下列资源完整解码后分别与当前 dist 及构建 SHA 完全一致：

| 资源 | 解码字节 | SHA-256 |
| --- | ---: | --- |
| `assets/index-CCe0bfBw.js` | 1,023,758 | `6b91b0aa52ef1b93f5ec54bcfcb163ea2fd60fdeee29d1089ffb96b616fa2b9a` |
| `assets/index-DY8u7lO1.css` | 80,971 | `674cef6e975dbc31740576e8984e6d3a1ff423fa0cfb932629cea3ec51da5a10` |
| `assets/native-recording-access-CHwsSY6L.js` | 1,018 | `7bd18f94a418f7c02d9e0e2f1b93a091a3a2956e9580fdc952b66f3558577a80` |

HTML 原始字节不同：dist 为 498 字节，原/派生 Mach-O 解码后均 478 字节，属于 Tauri HTML 序列化。完整有序 HTML token 相同，包括声明、全部标签、所有属性与值、正文和注释，只归一声明大小写、空布尔属性以及纯排版空白，不删除属性或变更节点顺序。`html-comparison.json` 保留完整 token。HTML 引用本轮 JS/CSS，没有旧资源引用；不能将其描述为 raw 字节完全相同。

本次实际原始 exe 大小为 16,826,112 字节，SHA `067da61e53925832e9a8737892e8769346e526129730f1e2ec43fe210ca480f4`；派生 exe 为 16,746,416 字节，SHA `21f47cc9efbebd9ae928b27ff0900cdffedcbd2b761d7e31910964aa7ffd9335`。与旧包大小接近不表示资源陈旧，本次完整解码已证明包含当前资源。

## 签名、归档及限制

原包 strict 自然退出 **1**，stderr 原样保留：`code has no resources but signature indicates they must be present`。派生包 strict 自然退出 **0**，本地 ad-hoc，标识 `com.local.notesclone`，CDHash `129403b2d711992df28859c3ae9f8f8c588e2c3e`。本核验没有修包或签名。原/派生 Info.plist 逐字一致，显示名、执行文件、版本及麦克风/相机用途说明保留。两包唯一文件变化为 `Contents/MacOS/notes-clone` 和 `Contents/_CodeSignature/CodeResources`；37 个 Mach-O section 内容、长度和 SHA 全部一致。

ZIP 共核对 7 个文件条目，CRC 全通过，所有应用文件的完整内容及权限均等派生 .app；路径无绝对路径、`..` 或反斜杠。允许的额外资源条目仅限具有 AppleDouble magic 的 `__MACOSX/.../._*`。兼容 ditto 以 UTF-8 写入但未设置 bit11 的文件名。归档 5,014,535 字节，SHA-256：

`9c28504a718e7924834a98ff941e718c385de9cfe42b8586b67b98e94d57a6ec`

这是文件、资源与签名身份验证；未构建、签名、启动或安装应用，未访问用户笔记/音频，也未接触 Android 现场或使用麦克风。派生包是本地 ad-hoc 签名，未证明 Developer ID/公证。包内资源身份通过不代表 WKWebView 运行、真实硬件录音或整窗像素一致验收通过；本轮交互独审另见 `../../recording-indicator78-independent/README.md` 及正式审查报告。
