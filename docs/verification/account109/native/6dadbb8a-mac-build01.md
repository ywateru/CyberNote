# 6dadbb8a Mac debug 静态构建回执

2026-11-14。从主工作区精确 clean main `6dadbb8abbe3a4ec2f3f358fdefb71425ce18e40` 构建。产物：`artifacts/account109/mac-6dadbb8a-debug-01/CyberNote-Account109-6dadbb8a.app`，bundle identifier 为 `com.local.notesclone.account109.debug6dadbb8a`。仅适配 ignored artifacts 下的既有 bb8014ce controller/package/verify 脚本；未修改产品源码、manifest、版本或 lockfile。

| 身份 | SHA256 |
| --- | --- |
| 原始 arm64 debug `notes-clone` | `95eb2fc9692357a613f3a8d14931099785747f15a8f78bbdd233b82a9ad2ded1` |
| 已签名 `.app/Contents/MacOS/notes-clone` | `4db9e97b532909823190bf0e66f4fc4536ce21104983f4294107ae34ba3d0f89` |

源码 fingerprint 为 `f5d5beb346e71afdb35941507eb4f3ba0fe6d0609151359c4f33f1a2c5223959`，1664 个 product inputs；构建前后 source identity、clean 状态及四份 lockfile hashes 一致。

构建与静态验证全部退出 0：

- `pnpm build`：production Vite 资产，沿用既有 debug bridge flags；10.040 秒。
- compiled account capability：24 checks；1.006 秒。未运行额外 native suites 或运行时用例。
- `cargo build --manifest-path src-tauri/Cargo.toml --features sync-e2e,tauri/custom-protocol --locked --offline`：25.073 秒。复用唯一 `/private/tmp/cybernote-account109-mac-ec4348c6-target-01`；jobs2、DEV/TEST debug0、incremental0、Cargo offline，无新 target、依赖安装或下载、HOME override。
- 原始 binary embedded identity：1.008 秒。当前 JS/CSS/JSON/SVG 均找到实际嵌入匹配；HTML 引用、debug runtime/startup diagnostic 与 execute 双 rAF 源码屏障静态检查通过。
- APFS `cp -c -p` 创建独立 inode 的 COW App executable；使用精确源 plist/icon/entitlements 做本地 ad-hoc 签名。plist lint、原 binary 验签、`codesign --verify --deep --strict --verbose=2`、linked libraries 与 signed embedded identity 全部通过。原始 binary 字节、mode、mtime、inode 不变。
- 28 个产物文件的 `SHA256SUMS` 校验全部通过；旧包与证据未覆盖。原生编译 warnings 留在日志，无编译错误或源码修复。

持续空间门槛为 10GiB；构建最低可用 12,171,382,784 bytes（约 11.34GiB），打包后 12,371,238,912 bytes（约 11.52GiB）。完成后确认无 Cargo 进程，共享 target 已释放。

完整证据位于同一产物目录：[说明](../../../../artifacts/account109/mac-6dadbb8a-debug-01/README.md)、[构建记录](../../../../artifacts/account109/mac-6dadbb8a-debug-01/build-record.json)、[资源身份](../../../../artifacts/account109/mac-6dadbb8a-debug-01/resource-identity.json)、[打包记录](../../../../artifacts/account109/mac-6dadbb8a-debug-01/packaging-receipt.json)、[checksum inventory](../../../../artifacts/account109/mac-6dadbb8a-debug-01/SHA256SUMS)。

边界：`packaged-adhoc-signed-static-verified-not-launched` 表示打包验收时点，不能推断父级随后 CUA 测试的状态。本 builder 未启动 App、访问 GUI/default store/私有基线/凭据、执行认证或 ADB。后续 UI-only cancel 验收由父级负责，本报告不声称界面、取消、登录或原库保全已经实测通过。独立 bundle identifier 不改变编译后的默认资料库选择。本文件在独立作者树中作为 docs-only 提交，不改变已捕获的主树构建身份。
