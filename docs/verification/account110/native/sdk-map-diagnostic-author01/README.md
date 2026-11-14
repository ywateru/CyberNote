# 受控真实 App SDK map 诊断：作者定向回执归档

本目录只归档已完成的验证，不运行新的测试或产品操作，不构成独立审阅批准或实际 App 传输通过。

- harness 源码链 `01dbb992` → `a6fecc69`；collector 最终20/20通过，原始TAP在 `collector20.tap`。
- driver15/15通过，来自较早的29项合跑工具输出（当时collector14项）；未单独保存driver原始日志，`harness-receipt.json`如实记录执行摘要，不重建日志、不以最终collector20加旧collector14计数。
- native作者 `c603cab6300b314c087cea2e88df9d25217e30ba` 8/8通过，回执在 `native-author/`。已核作者原SHA256SUMS及五项源码hash匹配该commit；日志含编译warning和子进程输出，最终主测试为8通过，子进程不能另加总。

归档前核定只有四个预期native输入文件、均常规非符号链接。作者receipt/command/原manifest字节未改；log仅对一条编译source warning中固定loopback callback URL做明确遮盖，另存 `focused01.sanitized.log`。`redaction-receipt.json`分别记录原日志与归档副本SHA、字节数和遮盖范围；原日志保留在作者 `/tmp` 证据目录不改写、不归档。`AUTHOR-SHA256SUMS`是原输入的hash，不能对它声称归档的脱敏日志仍匹配原hash；根 `SHA256SUMS`验证所有归档文件（自身除外）。无真实账户/设备身份、raw stderr或运行期SDK原文。原生作者回执base和limitation按原文保留。

相关 [harness作者说明](../sdk-map-diagnostic-harness01.md) 与 [39711首失败](../live02-push-diagnostic05/README.md)。本版本仅 `accountSdkDiagnostic`；未实现跨进程witness/expect，路由匹配未知，无虚构bool。等独审、精确集成与包独核后再由父级授权实际App单次诊断。
