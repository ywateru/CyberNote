# Sync86 frontend 独立审查证据

2026-11-06，冻结产品 `5950bd30`、作者证据 `2518edd9`。结论 blocked：两项 P2，详见 [正式审查](../../../plan/reviews/app-sync86-frontend.md)。所有 shell cwd `/private/tmp/apple-notes-sync86-frontend`。

- [runs.json](runs.json)：独立重跑原34项 fixture（报告16.782秒、外层17.046秒）、notes9、build、production、diff-check，均自然0。各命令精确参数和源码前后指纹在此，raw `.log` 随附。
- [counterexamples.json](counterexamples.json)：真实HTML搜索输入 A→B、真实 Escape B→A，都发生于取消收据挂起、freeze仍在时；两项实际契约失败。清搜索/folder click、ArrowDown及target键盘写保护观测也在此。末尾quit后idle自然10s timeout是runner边界，不算新产品缺陷。
- [attempt01/report.json](attempt01/report.json)：最初HTML输入反例已经失败；随后运行时写HTML导致Vite reload/context destroyed，完整保留。`runner-source.mjs` 是当时源码快照，引用保持原运行时写法，当前不作可直接执行入口。
- [metadata-quit.json](metadata-quit.json)：相等正文metadata/焦点组合检查自然失败，随后focus-probe拆解为第二P2；真实Undo、tag click、已提交远端正文搜索fallback发取消、quit待终态及admit后blocked观测。该runner自然1，不把余下通过项目冒充整份PASS。
- [focus-probe.json](focus-probe.json)：四阶段真实DOM观测，当前editor从prepare起失焦到BODY且abort release后不恢复；同DOM/owner/externalVersion保持，无metadata取消。观测runner自然0，不代表焦点PASS。

定向runner都在本目录，运行时输出只写 `/private/tmp/sync86-review-*`，browser cleanup后才复制入该证据目录，避免Vite watch。原始失败不覆盖，后续修复复审沿用。全部源码前后指纹相同 `f516189f46a71e8a1bbeb76722ca1a278e2b97953ac855068804c9abffc1c209`。未修改产品或原测试，未运行真实Rust/网络/麦克风，未操作设备或真实用户库。
