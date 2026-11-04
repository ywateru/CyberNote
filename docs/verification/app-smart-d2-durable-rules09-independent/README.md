# D2 独立审查证据

固定产品 commit `98fc5b8b25ab34c053ca6de9f3b47ea5f0d5775f`，文档 HEAD `fed359d`。作者 source-identity 十项 hash 与实际/固定提交一致。结论 **blocked**：普通 createFolder/renameFolder 成功写入4097字节名称后，新增 live graph 令冷重开失败 `graph_invalid`。

- `inputs.json`：固定身份、前置空间、真实生产模块输入；`result.json`：前三组完整命令与结果，源文件前后不变。
- `run.py`、`harness/`：离线真实 Store/Session harness，不复制生产行为；Cargo manifest/lock 沿用作者输入。
- `run01.txt`：生产 smart 8通过；`run02.txt`：真实 Session 2通过；`extra.rs` 与 `run03.txt`：独立补充2通过。
- `oversized.rs`、`run04.txt`、`run04-result.json`：独立最小反例1失败，create 与 rename 均实际返回成功，随后重开均拒绝；失败日志原样保留。为编入反例，前三组后给 harness main 加入独立 oversized 模块，产品文件未变。
- 审查报告与全部公开 gate 映射：`docs/plan/reviews/app-smart-d2-durable-rules09.md`。

未重复作者全量回归或宿主 check；不代表 Tauri IPC、设备或像素验收。未改产品、作者目录、用户库，未 stage/commit。**STOP；共享 host target 已释放。**
