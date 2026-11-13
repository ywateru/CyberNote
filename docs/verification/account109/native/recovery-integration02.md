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

## 第四轮运行后的人工授权预算整合

上述锁定为当时状态；桌面恢复访问后的 relogin04 实际已执行并以浏览器授权未完成、等待超时失败，见 [独立归档](relogin-live04/README.md)。等待预算增量作者 `711c6d69` 经[独立审阅](authorization-timeout-review01.md)后合入 main `3aa8889a`。父级在该 HEAD（同时存在待提交的结果文档修改，执行器源码均已提交）执行同一整合命令：**161 passed、0 failed、0 skipped、0 cancelled**，146 个顶层项，1,282.279833 ms。TAP 保留私有 `/private/tmp/account109-interactive-budget-integration01.tap`，未连接 App、ADB、原库或服务。

可选 `--authorization-timeout-ms` 只影响三条显式 SignIn 终态等待，默认 120000、范围 120000..600000；连接/数据/启动预算和身份拒绝保持原规则。没有执行 relogin05，也没有取得新 QA 授权。该增量只有被发布边界排除的验证脚本，当前 9010c5ba 净化 DRAFT 不需要因此改变产品字节；真实验收仍待完成。
