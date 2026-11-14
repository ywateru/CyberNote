# 原库开启同步：Store 私有副本诊断

2026-11-14。针对 `6dadbb8a` Mac 原库开启同步时的 `account_sync_adoption_blocked`，实际 Store 私有副本复现全部通过，未复现持久 Store 拒绝。本报告基于 `b8a6d846c6f6db39f1b97ae733c387a1b34c2f4a` 整理；不代表后续阶段修复已验证。补充设计见[大资料库准备期限契约](../../../plan/tasks/app-account109-adoption-large-library.md)。

原库仅使用 SQLite `mode=ro`、`query_only` 与拒绝写操作的 authorizer 检查；未对原库调用 Store/adopter。汇总如下，不记录实体标识、标题、正文、账户材料或私有路径：

| 原库检查 | 结果 |
| --- | --- |
| 业务实体 | 184 notes、18 folders（15 个非系统）、189 attachments |
| 旧协议状态 | identity 1、dirty 135、heads/projection/seen/branches 各 69、inbox 0、附件 descriptor 23 |
| 完整覆盖 | 69 heads + 135 dirty − 5 个重叠 = 199 个本地可同步实体 |
| 并发与投影 | 无重复实体 head、未解决并发 head、缺失或失配 projection、孤立 projection、未覆盖本地实体 |
| 非 dirty 完整内容 | 57 notes 与 7 folders 的 payload 精确匹配当前序列化语义，包含键存在性检查；摘要及向量匹配 |
| 附件元数据 | 13 个非 dirty note 的 23 个 descriptor 均存在且有限字段一致 |
| folder 可选字段 | 7 个 wire 中 query 缺失 5、对象 2、null 0；definitionRevision 全部缺失，无 missing/null 差异 |

实际复现使用原库的只读 SQLite backup，大小 2,064,384 bytes；189 个托管附件以 COW 复制，逻辑大小 317,349,937 bytes，并逐文件验证 SHA256。未复制账户凭据目录、Noise/config 或旧 `.sync` blob 缓存。仅私有副本允许 Store 写入，workspace/device 使用新随机 UUID，未调用网络、GUI、认证或原库账户启用。

| 私有副本实际生产调用 | 结果 | 耗时 |
| --- | --- | ---: |
| `Store::open` | PASS | 62 ms |
| `sync_adoption_preflight` | PASS | 45 ms |
| `sync_media_snapshot([], true)` 与 `verify` | PASS | 25,766 ms |
| `sync_with_media` 中的 `sync_adopt_workspace` | PASS | 8,671 ms |

迁移后 dirty 为 0、heads 为 199、inbox 为 0，新 identity 匹配请求的随机 workspace/device。notes/folders/attachments 完整业务 SQL 行在迁移前后逐项相等；全部 189 个私有副本托管附件仍与原文件 SHA256 相同。原库 DB/WAL 的运行前后文件大小及 SHA256 均相同；原托管附件集合的聚合 SHA256 也未变化。

## 准确源码与执行边界

- 实际复现生产源码：`aa6eba574416de9b79b00aa444b28ecb94a4c2ab`。其 Store、Session、adapter 与账户错误映射相关源码，经 diff 确认与候选完整源码 `6dadbb8abbe3a4ec2f3f358fdefb71425ce18e40` 一致。
- 临时定向 harness 仅加入 Store 同模块测试，运行后已从工作树移除，补丁仅保留于私有证据。调用顺序包含真实媒体准备及真实事务迁移，没有替换 validator 或放宽校验。
- 复用既有唯一共享 Cargo target；`CARGO_BUILD_JOBS=2`、`CARGO_PROFILE_DEV_DEBUG=0`、`CARGO_PROFILE_TEST_DEBUG=0`、`CARGO_INCREMENTAL=0`；`cargo test --manifest-path src-tauri/Cargo.toml --lib --locked --offline account109_private_copy_actual_store_adoption_diagnosis -- --nocapture --test-threads=1`，未启用额外 feature。
- 首次编译因 sparse checkout 缺少既有 `docs/fixtures/smart-projection09.json` 的 `include_str!` 输入而失败，未执行 Store。仅恢复该文件的准确 HEAD 版本后，定向运行 **1 passed、300 filtered out**，用例耗时 34.60 秒。首次失败与恢复原因保留在私有回执。
- 未运行 Session/renderer 屏障、真实账户启用或其他测试。私有副本未复制旧 `.sync` blob 缓存，媒体耗时不能当作现场准确计时；尚未证明现场究竟命中哪一拒绝分支，也不能凭此断言现场唯一原因是 5 秒期限。

实际结果排除了本快照在 Store 持久检查及事务迁移中的确定性拒绝，没有据此修改 Store。后续原生阶段与前端协议修复由补充契约约束，需另行审阅、验证和出包。

## 私有证据摘要

小型 SQLite 快照、COW 附件、临时 harness 与有限结果回执继续私有保留，等待父级审阅；不在 Git 中记录私有路径或内容。以下仅为证据文件 SHA256：

| 证据 | SHA256 |
| --- | --- |
| 有限实际 Store 结果回执 | `dcd492684fc602ee077cfe302f881b3f31fc94822dd541e0b25b187a3d6e4950` |
| 快照及保全执行回执 | `5f01412cdab750f5a60cc3264b1c50ae1e469f02ef58715ea084305616d074a5` |
| 临时 harness 补丁 | `75d6c9363ab0f403f960ef0e377a91d740e107256808adecc798f77878d09d48` |

运行后临时源码已移除，工作树恢复干净，无 Cargo/rustc 进程，共享 target 已释放。本报告整理阶段未再次使用 Cargo。
