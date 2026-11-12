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

本次桌面交互前置检查仍明确返回 Mac 锁定且自动解锁失败。随后针对新候选只启动一个全新独立数据根，进行一次有界 ready 检查，确认最新修复版本能否进入可交互状态；未启动第二端或发起授权。

实际 45 秒检查返回 TIMEOUT，phase=documentProbe。原生探测已加载 debug API 且 document.readyState=complete，但 visibility=hidden、root inert/aria-hidden=true、startup=loading，未满足可交互门槛。驱动没有解除门槛或强制修改页面状态。自然关闭未成功，随后只对本次持有的 PID 40847 发送 SIGTERM，并观察到该进程与管道关闭；不能记为自然退出通过。脱敏结果保留在同目录的 ready-attempt.json，数据根原地保留。

没有输入凭据或报告同步通过。该候选是显式启用原生账户与 sync-e2e 驱动的 debug 可执行文件，不是正式发布包。

解锁后按 [账户与多端测试用例](../ACCOUNT-TEST-CASES.md) 使用两个独立数据根验收。不得用旧 `c7b18541` 二进制代替当前修复版本，也不得用此前独立 Rust owner 的成功结果替代产品 Runtime/UI 与数据收敛结果。

## 净化源码的完整 production 候选

另从 `ad18a872` 加清单维护 `6d7cf4aa` 导出独立新历史，root commit 为 `59dea8281711e40142de84784d24fb093deba8ee`。在该干净源码树完成完整 arm64 Tauri release app bundle 构建及候选包 staging，两者退出 0；没有运行应用。

前端使用 production 与 `VITE_NOTES_ACCOUNT_NATIVE=1`，没有 debug/UI fixture、dotenv 或继承的构建覆盖。实际原生编译使用 `--locked --offline --release --target aarch64-apple-darwin` 与 `tauri/custom-protocol`；独立 target 的产品 library/binary feature 集合均为空，Tauri 没有 devtools，未启用 sync-e2e 或 access-boundary-proof。

实际 ZIP 为 51,958,488 bytes，SHA256 `f618e3984af299febba5e8636807291ca98b2057d5e1ca962f997bd7b860abe6`，包内主程序 SHA256 `728c942f12b2491d378c86b944659090e0a19efcbf546398fc37ad0533ac8e23`。从实际包内 arm64 Mach-O 验证 Brotli build-info，其 revision 与上述 root commit 一致，fingerprint=`de40a8b8256288c4d4f900fbb52bd47f7f38345c843f4ee074333637159ac26d`，1,619 个输入，sourceDirty=false。四份锁文件构建前后字节保持一致。

独立审阅者逐项复核了实际 ZIP、编译 feature、包内身份及全部 1,200 项 notices 字节，接受范围限于本地构建和静态核验。包、notices、receipt 与完整构建记录已复制到被忽略的 `artifacts/account109/macos-sourcead18-release-candidate/`。这不是 GitHub Actions 产物，也不证明启动、登录、同步、签名、公证或发布验收通过。
