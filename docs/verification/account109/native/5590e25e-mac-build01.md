# 5590e25e Mac debug 静态构建回执

2026-11-14。从主工作区精确 clean main `5590e25e6607e439cc13a0b852cdc1d16b932ddf` 构建。产物：`artifacts/account109/mac-5590e25e-debug-01/CyberNote-Account109-5590e25e.app`，bundle identifier 为 `com.local.notesclone.account109.debug5590e25e`。仅适配 ignored artifacts 下既有 `6dadbb8a` controller/package/verify 脚本；产品源码、manifest、版本与 lockfile 未修改。

| 身份 | SHA256 |
| --- | --- |
| 原始 arm64 debug executable，204,778,848 bytes | `7d6f0b27f2781f3f6a312d50dfac9e6713dd69c56f1613647d5c2de33144f224` |
| 已签名 App executable，203,606,864 bytes | `23c88b72436e4d3895e7602b46b0e8f584af46e258ccf1d7f4ff88f39eda1361` |
| SHA256SUMS inventory | `09d62a0054b0f5ce39646b6e056f02db2d680f92572734c887ac6bf20fe0bd6c` |

源码 fingerprint：`36df6fe24daac444c2e27b31dbb10c3dabd3154258f250f2e8acdf1b5a7bdc65`，1665 个 product inputs。构建前后 source identity、clean 状态与四份 lockfile hashes 一致。

构建和静态核验全部退出 0：

- `pnpm build`：production Vite 资产，沿用既有 debug bridge flags；10.034 秒。
- compiled account capability：24 项静态检查，1.003 秒；未重复 native suites 或运行时测试。
- `cargo build --manifest-path src-tauri/Cargo.toml --features sync-e2e,tauri/custom-protocol --locked --offline`：73.278 秒。复用唯一既有共享 target；jobs2、DEV/TEST debug0、incremental0、Cargo offline，HOME 继承而未覆盖；无依赖安装、下载或新 target。
- 原始及签名后 binary 的 embedded frontend/native identity 均对照准确 clean source 验证。9 个 dist 文件记录于资源回执；所有要求的当前 JS/CSS/JSON/SVG 均找到实际内嵌匹配，HTML 引用、debug import、startup diagnostic 与 execute 双 rAF 源码屏障静态检查通过。
- APFS `cp -c -p` 创建独立 inode 的 COW App executable；使用精确源 plist/icon/entitlements 做本地 ad-hoc 签名。plist lint、原 binary 验签、`codesign --verify --deep --strict --verbose=2`、linked libraries 与 signed embedded identity 均通过。原始 binary 字节、inode、mode、mtime 不变；不声称分发证书签名或公证。
- 28 个产物文件的 SHA256SUMS 校验通过；旧候选和证据未覆盖。编译 warnings 留在日志，无编译错误或源码修复。

持续空间门槛为 10 GiB；构建最低可用 12,160,471,040 bytes，打包后 12,360,888,320 bytes。完成后确认 Cargo/rustc 进程均为 0，共享 target 已释放。

完整证据位于产物目录：[说明](../../../../artifacts/account109/mac-5590e25e-debug-01/README.md)、[构建记录](../../../../artifacts/account109/mac-5590e25e-debug-01/build-record.json)、[资源身份](../../../../artifacts/account109/mac-5590e25e-debug-01/resource-identity.json)、[打包记录](../../../../artifacts/account109/mac-5590e25e-debug-01/packaging-receipt.json)、[checksums](../../../../artifacts/account109/mac-5590e25e-debug-01/SHA256SUMS)。

此前授权的私有 Store 复现清理已完成：仅删除其独立快照 DB、复现 Store DB/COW 附件及生成的 `.sync`，358 个文件，共 612,415,929 logical bytes。待删路径归属、无符号链接、无打开文件与原库位于子树外均已检查；结果和 snapshot 回执、harness 补丁、重放说明及清理回执继续私有保留，既有证据 SHA 不变。未重读完整原库，原库、旧基线、候选与共享 target 未受清理影响；COW 逻辑大小不等于实际释放空间。

边界：`packaged-adhoc-signed-static-verified-not-launched` 为打包验收时点。本 builder 未启动 App、访问 GUI/default store/私有基线/凭据、发起认证或账户 enable、执行网络或 ADB；父级后续正常退出旧 App、启动新 App 和检查 paused 状态需单独记录。独立 bundle identifier 不改变编译后的默认资料库选择。本文件在独立作者树做 docs-only 提交，不改变已捕获的主树构建身份。
