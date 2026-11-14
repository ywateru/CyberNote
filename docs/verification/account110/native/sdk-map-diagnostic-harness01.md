# 真实 App SDK map 采集器作者回执

实现链 `01dbb992` → `a6fecc69`，仅 `scripts/verification/account110-sdk-diagnostic.mjs`、对应 fixture 和现有 `sync108-native-driver.mjs`。原生配套由 Huygens `c603cab6300b314c087cea2e88df9d25217e30ba` 实现，需独立审阅后合入、更新产品 pins 并构建精确包；本回执不是 native 审批。

固定参数为 `--source SHA40 --package-receipt ABS --output /private/tmp/account110-device-actions-NEW`，缺省 prepare；只有显式 `--run` 才打开既有 live02 的 A/B owned data-dir。运行前后检查 exact HEAD/clean、包内身份与 binary hash、旧 live02 首结果 hash。正常 restore，owner 一致、双端 ready/enabled/online 才允许一次 push。不复制凭据，不访问默认库、不重新登录。

显式设置 `NOTES_SYNC_E2E_SDK_DIAGNOSTIC=1`；driver 仅新增无参数的 `accountSdkDiagnostic` 动作。collector 对整个快照/逐记录严格白名单校验，记录有限 SDK variant、静态 timeout、数值 API status、phase/transport 和本地计数，拒绝任何多余字段、原始 message/ID/URL。首次真实 map error 即打印有限记录。账户错误继续锁定失败，但仍等待实际 operation 终态；采集失败、ring 丢失/owner 变化、操作失败及清理失败分别保留，不能诊断失败后宣称通过。SDK future 取消只有 started 时标明 incomplete，不补造 Cancelled。所有 App 按原 helper 正常关闭并确认 exit/pipe close；不保存 raw stderr。

本版本未启用 session witness/expect：架构要求路由一致性仅内存比较且不发送身份；跨进程摘要交换尚待父级明确。报告 `routeComparison.available=false`、`selectedTransportMatchesLiveB=null`，不能把目录自比较当真实 SDK session 一致性证明。

验证仅 device-free Node：新 collector fixtures 最终20/20通过；既有 driver fixtures15/15通过（第一次合跑29项中的14项旧版collector已被最终20项替代，不累加）。覆盖完整16 variant、11静态timeout+unknown、event白名单、敏感/未知字段拒绝、非法半对字段、计数/状态边界、owner退役、重复/逆序/ring溢出、错误后继续等真实终态、有限超时及命令拒绝。`node --check`、`git diff --check` 通过。无 Cargo、App、网络、实际账户调用或本轮设备操作。

最终20项 TAP receipt SHA256：`9e0a8f027ca60a73020ecd9a6449a01b268ebb5cad0d53ed22385b539a451e8a`。实际运行须使用集成后新的精确源码及通过独核的包；prepare/fixture 不代表 App/映射/方向同步通过。
