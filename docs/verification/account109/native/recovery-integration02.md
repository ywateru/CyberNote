# Recovery and phone-file integration checks

2026-11-13。父级在 main `30813aec`（产品及执行器输入与 `20d62c11` 相同）执行一次整合检查：

```sh
node --test scripts/verification/account109-*.test.mjs scripts/publish/export.test.mjs scripts/publish/package-identity.test.mjs
```

实际终端结果为 **138 tests passed、0 failed、0 skipped、0 cancelled**，123 个顶层项，1,384.593042 ms，exit 0。未另存完整 TAP 文件；此为本次终端运行摘要。它包含新手机固定附件和新 GUI 分类恢复策略的设备外反例，以及原基线、清理和发布身份检查。

此次未连接 App、ADB、原库或外部认证服务，不能替代已经失败的 relogin02，也不构成真实三端同步通过。实际 relogin02 是另一独立运行，见 [最新结果](../RESULT-LATEST.md)。

## Token 诊断整合后的运行

在 main `d1a6eadf` 合入有限 token 诊断与已独审 signedOut B 续验后，同一命令再次执行：**148 passed、0 failed、0 skipped、0 cancelled**，133 个顶层项，1,231.547708 ms，exit 0。原始终端 TAP 保存在私有 `/private/tmp/account109-token-integration01.tap`，不伪称首次 138 项已包含后续修改。此次仍为设备外 fixture；新的真实 GUI 诊断运行另行记录。


## 显式登录与实时路径观测整合

main `920fa9cf` 合入已审 Login+Consent、Mapping 缓存及退役 sampler 修正后，同一命令 **156 passed、0 failed、0 skipped、0 cancelled**，141 个顶层项，1,046.023458 ms，exit 0。TAP 保留在私有 `/private/tmp/account109-login-relay-integration01.tap`。同一精确提交的 manifest dry run 为 `changes: []`。仍为离线 fixture；新 GUI 的真实 relogin04 因系统锁定未启动，不推导为登录或 4G 已通过。后续 pin 仅六行常量/文字/回执路径替换，经静态哈希与限定 diff 核对，未重跑同一套行为测试。
