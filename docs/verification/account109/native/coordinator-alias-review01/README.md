# Native coordinator alias preparation — independent review 01

**APPROVE — 无阻塞项。** 独审精确 commit `72b397a334494acf2fb12f1d12c6325c4f602f32`，相对父提交 `8417e23db1b71f7d32b3132d5fbfe015a4593330`；作者 worktree `/private/tmp/cybernote-account109-headless-native`（branch `codex/account109-coordinator-alias`）运行前后 clean。已核对作者 commit receipt、父提交、3 个变更文件集合以及逐文件 committed/worktree SHA-256。审查与复验未修改作者源码。

## 结论与安全边界

改动将固定 HTTP transport origin 和固定 enrollment proof issuer 显式分开。`COORDINATOR_TRANSPORT_ORIGIN`、`ENROLLMENT_ISSUER` 当前都仍是 `https://cybernote-sync.vercel.app`，因此此提交不切换生产 token/JWKS 目的地，也不更换 proof 身份。

| 检查 | 独立结论 |
| --- | --- |
| 生产调用来源 | `account/mod.rs` 的两个 Enrollment 构造路径仍来自 `config::origin()`；SDK base_url 也来自同一固定配置。没有新增 env/IPC/CLI/目录或 peer 指定 endpoint。 |
| 请求与验签分离 | profile/enrollment/JWKS 请求使用 `transport_origin`；生产 `Enrollment::verify` 只向 verifier 传固定 `config::ENROLLMENT_ISSUER`，不从响应 claims、alias URL 或 JWT header 推导信任。 |
| URL/TLS/JWKS | HTTPS-only origin 校验保持，HTTP client 仍禁用 redirects、timeout 15s、响应上限 64KiB；仍只取固定 transport 下的 JWKS，不跟随 JWT jku/x5u。 |
| JWT | ES384、kid 唯一匹配、验签、精确 iss/aud、leeway 0、required claims、过期/iat/最大300s寿命、purpose、UUID 和 canonical 32-byte Noise key 检查均保留；低层 issuer 参数在原实现已存在，本次不是新增 runtime 输入。 |
| Owner/product/workspace | 签名 sub、account_issuer、product_id、workspace_id 仍与 binding 精确匹配；profile 与认证身份/原绑定以及 workspace 检查不变。 |
| Device/Noise | 本地 issue 后的 device_id、noise_public_key、expiresAt 绑定不变；peer 验证、nonce、invitation workspace/host_key、已有 credential key pin、owner lifecycle 与 SDK-ready/lease gate 均未改。 |
| 生产 transport 文件 | `transport.rs` 的唯一改动在 `#[cfg(test)]` fixture 中，将测试 proof 的 iss 从 loopback origin 改为固定 issuer；生产 transport 代码无变化。 |

关键位置（作者 commit 中）：`config.rs:9–24`；`enrollment.rs:150–159`、`:166–214`；本地 issue 的 `:136–142`；新增测试 `:311–380`。这里只是定位说明，完整差异保存为 `source.diff`。

新增 loopback 测试在 5s 外层 deadline 内，用 synthetic ES384 proof 经过实际 HTTP profile→enrollment→JWKS 路径：请求 origin 与固定 issuer 不同，固定旧 issuer 验证通过并保留 workspace/device/Noise；将同一签名 claims 的 iss 分别改为 loopback transport 或提议的 HTTPS alias 时均拒绝。该测试不访问提议域名，其 HTTP loopback 属于测试代码，未放宽生产 HTTPS。

## 独立 focused 复验

在作者精确 commit 上复验，复用已释放的共享 target `/private/tmp/cybernote-account109-mac-ec4348c6-target-01`。命令分别为：

```sh
cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --lib account::enrollment::tests -- --test-threads=2
cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --lib account::transport::tests -- --test-threads=2
```

**Enrollment 7 passed + transport 5 passed = 12 passed；0 failed、0 ignored。** 2026-11-13 05:41:19–05:41:25 UTC；两命令均 exit 0，无超时。复验覆盖新 issuer/transport 用例、已有错误 issuer/aud/归属/workspace/签名/tamper/时限/非法 key 拒绝，以及 gate 关闭、owner 取消、nonce/Noise pin 和有界 coordination retry/cancellation。

Cargo 设置与作者一致：jobs=2，dev/test debug=0，incremental=0。精确参数、时间、filtered counts、源码 SHA 和目标归属见 `test-receipt.json`；输出保留为可普通 Git 收录的 `.stdout.txt` / `.stderr.txt`。仅离线依赖与合成本地 loopback/临时 store 测试，未运行 live SDK 测试或 app。

**共享 Mac target 已释放。** 所有测试进程已结束，作者 worktree 仍 clean，3 个源码文件 SHA 未变。没有操作桌面、ADB、原账户 store、手机网络、域名/DNS 或部署，也没有重新请求 canonical health。Parent 原库 GUI relogin 与本次审查完全独立。

此批准范围是本地 native compatibility preparation；不构成 alias 所有权、上线、手机网络恢复、登录或真实同步通过的证明。两个生产常量仍旧 origin，尚无 production switch。本 reviewer 仅写本归档，未提交、cherry-pick 或更改 manifest。

`author-commit-receipt.json` 为作者 receipt 的精确副本；`result.json` 为审查结果，`SHA256SUMS` 绑定全部归档文件（除自身）。
