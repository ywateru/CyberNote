# APP-SYNC86-FRONTEND 独立复审证据

2026-11-06。修复产品 `0c84e589`，作者证据 `06ec6a0b`；[复审报告](../../../plan/reviews/app-sync86-frontend-recheck.md)结论 pass，仅前端源码和明确本机事件 fixture 层。原 blocked/原独审目录相对 `b4d4cdd3` 没有任何字节变化。

- `navigation41/report.json`：作者新增41项由独审完整独立运行一次，自然0，内部17.784秒。实际 DOM/输入/焦点/selection、可信iframe blur、可信Session/noteEpoch变化与native/mobile边界检查均保留原始观测和HTML。
- `original-replay-runs.json`：原counterexamples派生源码的SHA、精确命令、修改原因、自然0和前后源码指纹。10项全通过，内部6.657秒/外层6.796秒。原始script未改，派生增加终态后原意图断言；移除旧已知quit后idle误等，直接检查blocked。运行时派生在/private/tmp，复制件引用绝对工作树runtime，生成器`replay-original.mjs`可再次生成。
- `original-focus-probe.json`：原focus-probe文件原样执行四阶段；外层6.011秒、自然0。`original-focus-assertions.json`新增明确行为断言通过：同DOM/owner，abort后焦点+editable恢复，相等metadata不取消。
- `audit.json`：原报告/失败字节未改、两产品文件未改、source fingerprint、raw artifact SHA与diff-check自然退出。

全部运行前后为133文件 `6da26a58d14d02f0e39c3ed7091d7e739820b750a31cd91d2b45325c3dca918e`，gitDirty=false/sourceChanged=false。原反例和失败均在`../independent`原样保留；旧自然1不被新pass覆盖。运行时输出均在/private/tmp，runtime结束后复制，未触发Vite重载。

未重复已过且无需再测的全套build/notes/production；作者修复冻结全套结果和原件在`../repair`。未修改产品/原测试，未运行Rust/真实mic/设备，未merge/push/管理worktree。
