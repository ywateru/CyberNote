# APP-001-FIX-00 独立验证证据

日期：2026-11-03。审查者 verify_app，独立于实现者。生产源码基准 `9b724a5019627fd025fd0c8bb73ac92a47681263`；测试期间主代理只增加文档取证提交，三个归档相关生产文件与基准无差异。本目录不覆盖原 `qa-001` 失败证据，也不使用开发者自测充当独立结果。

结论：**blocked，仅剩归档文档父子结构校验**。原 QA-01/02/03 已独立确认修复；事务失败、六个真实退出点恢复、设置与冲突副本重映射均通过。正式报告：`docs/plan/reviews/app-001-fix-00-01.md`。此结论仅适用于 FIX-00，未重新构建 Mac/Android 产物，也不代表整个应用或 UI 验收。

| 证据 | 内容 |
|---|---|
| `rust-tests.txt` | 独立 `cargo test --offline --manifest-path src-tauri/Cargo.toml -- --nocapture`，13 passed / 0 failed / 1 worker 默认 ignored；worker 在恢复用例内实际执行 |
| `typecheck.txt`、`clippy.txt` | 独立类型检查、Rust all-targets 静态检查通过 |
| `store-probes/src/main.rs`、`result.json`、`fixtures/` | 原 QA 探针隔离复制，只改新输出位置和源提交标签，原断言/构造保持；QA-01 原附件保留、QA-02 设置相等、QA-03 自环拒绝 |
| `store-probes/src/bin/independent.rs`、`independent-result.json` | 加强版合法首 blob+坏第二 Base64、全部元数据后写设置真实失败、同 ID 冲突/父子/附件/设置映射、旧编辑保留、重开一致 |
| `crash_probe.py`、`crash-result.json` | 独立生成源归档/目标工作区，实际启动已编译生产 test worker 六次；每次明确 exit 77；重开调用真实 Store 恢复，并比较原元数据/设置/附件/输入源归档 |
| `schema_probe.py`、`schema-check.mjs`、`schema-result.json`、`schema-fixtures/` | 三种已知节点组成的非法文档均被 Rust 导入成功并持久化，编辑器实际 ProseMirror schema 均拒绝 |

原探针第一 blob 没有同步声明大小，现被更早的大小校验拒绝；不能单靠它证明第二 blob 失败安全。加强版外部探针将第一 blob 内容和声明大小同步为合法值，明确得到第二 Base64 错误，并确认旧数据与输入归档保持。晚期设置故障使用真实 SQLite `BEFORE UPDATE ON settings` trigger 拒绝，发生在所有 folders/notes/attachments INSERT 之后；完整回滚及重开后不变。

## 重跑

在仓库根目录运行：

```sh
pnpm typecheck
cargo test --offline --manifest-path src-tauri/Cargo.toml -- --nocapture
cargo clippy --offline --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo run --offline --manifest-path docs/verification/qa-fix-00/store-probes/Cargo.toml --bin notes-qa-fix-store
cargo run --offline --manifest-path docs/verification/qa-fix-00/store-probes/Cargo.toml --bin independent
python3 docs/verification/qa-fix-00/crash_probe.py
python3 docs/verification/qa-fix-00/schema_probe.py
```

`crash_probe.py` 中 test worker 文件名记录本机这次构建的确定路径；其他平台重新编译后应指向 `cargo test` 输出中对应的 `notes_clone_lib-*` 可执行文件。`schema-check.mjs` 从已安装的前端依赖生成 schema，复用 Editor.tsx 的扩展与结构属性；React 视图回调不参与节点结构校验，因此未复制。

所有附带归档仅含此轮临时构造的中文测试内容，不含用户原备忘录。测试覆盖真实应用进程退出和 SQLite/文件系统重开恢复，不声称实际断电、硬件故障、全部磁盘文件系统或并发多实例行为已验收。
