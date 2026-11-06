# 86 前端主线整合

2026-11-06。主线合并提交 `85b9e0ebb962becda623f943f212597c43213692`，修复产品 `0c84e589`、独立复审 `092ea058`。本轮根完整受影响整合执行后保全日志；原 blocked 报告与全部反例保持原样。

|运行|自然退出|外层实测秒|
|---|---|---|
|原同步协调34项|0|19.608|
|导航与焦点41项|0|19.077|
|notes9项|0|10.531|
|pnpm build|0|9.598|
|生产调试入口排除|0|3.851|

前四项并行执行，生产排除在build自然结束后执行；不是串行总时长。准确argv、自然退出与时间见各 `*-run.json`；原输出见同名log及子目录report/summary。所有运行时输出仅写 `/private/tmp/sync86-main-frontend-integration`，完成并关闭runtime后复制本目录，避免Vite监视HTML干扰。构建保留既有chunk-size warning。

运行前后133文件指纹始终 `6da26a58d14d02f0e39c3ed7091d7e739820b750a31cd91d2b45325c3dca918e`，`gitDirty=false`，见source-before/after。范围为实际App/Tiptap/Chromium和明确本机事件fixture；不证明真实Rust/socket、Android设备或原版像素。后续真实双App接线继续执行专门整合任务，不以本轮pass完成同步目标。原Android未保存录音现场未操作。
