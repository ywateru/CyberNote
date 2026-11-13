# Startup and diagnostic integration

2026-11-13，Asia/Shanghai。父级在干净 main `8acf0621` 执行整合命令：

```sh
node --test scripts/verification/account109-*.test.mjs scripts/verification/sync108-native-driver.test.mjs scripts/publish/export.test.mjs scripts/publish/package-identity.test.mjs
```

结果 **214 passed、0 failed、0 skipped、0 cancelled**，199 个顶层项，5,248.15275 ms，exit 0。完整 TAP 保存在私有 `/private/tmp/account109-startup-debug-integration01.tap`。这次包含新增 handoff、debug idle/固定启动诊断及已有 stdio driver 检查；不能将此前 172 项回执视为已覆盖这些增量。

源码按[独立审阅](startup-debug-review01.md)合入：App/startup 对应作者 `1abadb7b`，native 对应修正后 `bb810833`，runtime/driver 对应 `27271728`。发布 manifest 的既有 App/startup 两项 pin 在 `8acf0621` 更新，无新增运行时资源或 provider pin。独审已在精确集成源码实际运行 Rust 两项 admission/schema/owned-focus 测试并释放共享 target；该结果与父级 Node 整合分别记账。

这些是源码与设备外检查，不是 WebView、登录取消、真实身份或三端同步通过。旧 cancel-local-live01 的 ready/清理失败保留；下一步为相同构建方式的新精确 debug E2E GUI，再运行一次全新临时库用例。
