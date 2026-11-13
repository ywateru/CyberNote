# Recovery source integration checks

2026-11-13。合入精确 main `10814415ca088273bacc311d192b9605bda16775` 后，父级执行一次相关 Node 整合组：

```sh
node --test scripts/verification/account109-*.test.mjs scripts/publish/export.test.mjs scripts/publish/package-identity.test.mjs
```

实际终端结果：**124 tests passed、0 failed、0 skipped、0 cancelled**，109 个顶层项，1,055.96125 ms，process exit 0。终端 TAP 输出没有单独保存原始文件；本记录是该次运行摘要，不伪称带有完整 raw log。Node 现有 MockTimers experimental 提示不影响退出码。

覆盖账户安全 DTO、固定命令/执行器、基线与完整正文/附件校验、明确恢复策略、清理失败不能转绿，以及发布/实际嵌入身份的合成边界。测试仅用设备外临时 fixture；没有启动实际 App、原库、ADB 或访问外部服务。它们不构成新 GUI 的真实登录恢复、手机中转或三端验收。

独立源码验证另有明确归属：auth crate [review02](auth-refresh-crate-review02/README.md) 的 22 pass/1 opt-in ignored，以及 [review03](auth-refresh-crate-review03/README.md) 的 3 项增量全过；native/UI [review01](auth-recovery-review01.md) 的 account 25 pass、Node policy 6 pass、TypeScript exit 0。这些计数不合并成单一全量 Rust 运行。manifest [独立复核](../publish/manifest-recovery-review01/README.md)仅验证导出策略与精确 pin，1772 文件，不重新封存旧 root。
