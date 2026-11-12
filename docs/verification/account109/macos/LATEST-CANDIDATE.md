# macOS 最新账户验收候选

2026-11-13。候选来自干净主线 `ad18a872356e7140f73d1e0a936f8bd579cd74c3`，包含 bootstrap 取消代际检查、首次 signedOut 状态读取及最新 Rust 授权修复。

## 实际构建

```sh
NODE_ENV=development VITE_NOTES_DEBUG=1 VITE_NOTES_ACCOUNT_NATIVE=1 pnpm build
CARGO_TARGET_DIR=/private/tmp/cybernote-account109-target CARGO_BUILD_JOBS=2 \
  CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 CARGO_INCREMENTAL=0 \
  cargo build --manifest-path src-tauri/Cargo.toml \
  --features sync-e2e,tauri/custom-protocol --locked --offline
```

两条命令均退出 0。前端 build-info 记录 sourceDirty=false、1,652 个输入，fingerprint 为 `aa04ef659fa6dcf6e930ea336596c2a5d34fedb8a508a763c1a0c10b768c6e84`。其 mode=production 来自 Vite build，不代表本次显式启用的 debug API 被排除。

原生可执行文件已单独保存到被忽略的 `artifacts/account109/mac-ad18a872/notes-clone`，大小 203,020,976 bytes，SHA256 为 `8a585334b2ee634f151fa84c8017920981dacd79425afc74303d3185af0d5422`。同目录的 receipt 保存源码身份、命令和构建日志指纹。

## 验收边界

本次桌面交互前置检查仍明确返回 Mac 锁定且自动解锁失败，因此没有再次启动两个桌面进程、输入凭据或报告同步通过。该候选是显式启用原生账户与 sync-e2e 驱动的 debug 可执行文件，不是正式发布包。

解锁后按 [账户与多端测试用例](../ACCOUNT-TEST-CASES.md) 使用两个独立数据根验收。不得用旧 `c7b18541` 二进制代替当前修复版本，也不得用此前独立 Rust owner 的成功结果替代产品 Runtime/UI 与数据收敛结果。
