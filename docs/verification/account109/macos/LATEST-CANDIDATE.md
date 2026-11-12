# macOS 最新账户验收候选

## 当前源码 debug/e2e 候选：ec4348c6

2026-11-13。在独立 detached worktree `/private/tmp/cybernote-account109-mac-ec4348c6-01` 从精确主线 `ec4348c6df15c2b0dbd20af3c05f5a0cc7f75497` 构建，构建前后均干净；包含 `5d30f16c` 的默认原生账户入口。依赖通过 symlink 复用主目录 node_modules，未安装或更新依赖；Cargo 旧 mac 缓存经 APFS clone 复制到独立 `/private/tmp/cybernote-account109-mac-ec4348c6-target-01`，构建并发固定为 2，不与 Android 共用 target。开始复制前未见其他 Cargo/rustc/tauri 构建进程。

沿用既有 debug/e2e 路径的两条构建命令，均退出 **0**；环境采用白名单，不继承 VITE/TAURI/RUSTFLAGS 或账户覆盖，且快照没有 dotenv 文件。前端 **未设置** `VITE_NOTES_ACCOUNT_NATIVE`、`VITE_NOTES_ACCOUNT_UI`；只按既有 e2e 路径设置 development/debug。完整 flags、命令、日志 SHA、锁文件 SHA 和身份见 [最小回执](ec4348c6-debug-e2e.json)。

```sh
NODE_ENV=development VITE_NOTES_DEBUG=1 CYBERNOTE_BUILD_TARGET=macos pnpm build
CARGO_TARGET_DIR=/private/tmp/cybernote-account109-mac-ec4348c6-target-01 CARGO_BUILD_JOBS=2 \
  CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 CARGO_INCREMENTAL=0 CARGO_NET_OFFLINE=true \
  cargo build --manifest-path src-tauri/Cargo.toml \
  --features sync-e2e,tauri/custom-protocol --locked --offline
```

候选是 arm64 Mach-O debug/e2e 可执行文件，保存在被忽略的 `artifacts/account109/mac-ec4348c6-debug-e2e-01/notes-clone`：**203,019,104 bytes**，SHA256 **`a55fe20c462ee372183e4dc5d66b4feaeaca66e483213c121a63d3021ebaa3e8`**。内嵌 Brotli build-info 与当前干净源码一致，fingerprint 为 `a08d37caaac205f689ed0f2b2707dc93f122d72557ba4dd0b8f554e3d0e6fb19`，1,652 个输入。

同一二进制内的实际主 JS 与 dist 字节一致，账户门控缩减为 `isTauri() || false`；静态表达式核对为 native=true/browser=false，fixture 未启用。compiled capability **24/24** 通过；既有 e2e debug API 所在懒加载 chunk 亦验证实际嵌入，产品 library/binary 的编译 feature 为 `sync-e2e`。build-info 的 `mode=production` 是 Vite build 标签，不能据此声称 debug API 已排除。

四份锁文件未变，旧 ad18 候选、receipt、ready 失败记录及缓存原二进制字节均未覆盖。所有持有的构建/检查子进程均退出 0、已 wait 回收，进程组为空；没有发终止信号。完整日志和 helper 留在 ignored 同目录。静态后验脚本首轮错误地要求 debug API 位于主 JS，实际是懒加载 chunk；已修正检查，失败 `static-postcheck-01.log` 与通过 `static-postcheck-02.log` 均保留，未改产品代码。

**验收边界：本轮未启动 App、未操作 UI、未 auth、未修改 startup gate，也未发布/部署。** Mac 锁屏是尚未解除的交互验收前置条件；上述静态门控和构建结果不能写成可见账户页、真实登录或双桌面同步通过。这是解锁后按既有驱动验收的当前源码 debug/e2e 候选；下文 production 包和旧 debug 失败属于各自历史基线，继续保留。

## 历史 ad18 debug/e2e 候选

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

## 当前默认入口候选（替代上述 opt-in 候选）

`5d30f16c` 将原生账户入口改为默认可用，普通浏览器默认关闭，并保留显式 native opt-out。清单维护 `7b97f721` 仅更新该源码文件哈希；独立净化 root 为 `6906f10d842b011d7476d26e4af6570722ce8793`，共 1,770 文件。默认 production 前端、完整 arm64 release app bundle 和 staging 均通过，构建环境未设置 ACCOUNT_NATIVE、DEBUG、ACCOUNT_UI，也没有 dotenv 输入。产品测试 feature 未启用。

当前 ZIP 大小 51,959,083 bytes，SHA256 `a79a3fa077d9ed8b828c1c2309140ac16f8c31035c8af699ba9e9a2ea6d18895`；主程序 SHA256 `2e3fdb3b364eb0fb3f209a7344cd15673742d62085eec33f1f35f11adc196f94`。包内 clean build-info 的 fingerprint 为 `bedc35bf7875de54a9e1183a48a92858d00591acfbaa9af462d660a1c369c61a`，1,619 个输入。实际包内 Brotli 主 JS 的账户门控为 isTauri() 判断，未依赖测试环境标志。

Pauli 独立核对新 root、精确源码、实际包内门控、身份、feature、四份锁文件及 1,200 项 notices 后有限接受；未运行 App。旧 ad18 包和主程序字节保持不变。新包及全部记录单独保留于被忽略的 `artifacts/account109/macos-source5d30-default-candidate/`。它是当前本地构建候选，仍需完成真实产品登录和多端数据验收，不能将静态门控检查写成可见 UI 或同步成功。
