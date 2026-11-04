# APP-SMART-D1 独立审查

**结论：pass。** 未发现阻塞交付的 finding。固定产品源码 `de3c07ff2787819aefae33767865bb45594dc2a3`，对照基线 `ca92b9ee82dc2b9cd8e5ac05f499e2305aeeb41c`。审查依据为任务 `app-smart-d1-storage-open09.md` 与 `docs/architecture.md` 的 D1 契约；不是智能文件夹功能、Tauri IPC 或平台验收。

**Findings：** 无 P1/P2/P3 blocking finding，也无需要登记的 non-blocking finding。核对结果如下：

- `store.rs:188–205`、`store/open.rs:165–229`：先读取版本，再在同一事务重读版本、识别结构及严格检查全部已有 folder，之后才初始化可选操作表、补真正缺失的系统/设置行与提交版本。事务成功后才设置写入PRAGMA、创建附件目录并执行既有恢复。版本1不反复赋值；未来版本、坏结构和坏行不会借恢复先清文件。
- `store.rs:66–109/213–231`、`store/open.rs:132–163`：Folder六字段共用严格解码，未知字段/类型、保留身份、系统parent及SQL行键不符明确拒绝；缺省parent仍兼容None。缺失行与读取/解析错误已分开，不再覆盖坏系统行。未增加旧normal parent或note owner能力限制。
- `store/open.rs:174–229` 与 `open_tests.rs`：schema、可选表、缺失系统行/设置及版本在一个实际SQLite事务中；六阶段SQL错误覆盖rollback及重试。结构识别保守限定项目已知DDL及实际列约束，作者已说明不支持任意引号/约束重排的外部等价DDL；符合本批识别旧结构的范围。
- archive实现未另改版本、映射或恢复语义，Folder严格入口同时作用于归档1/2；旧合法originalFolderId缺引用fallback、旧格式内容及recordedAt双导入路径保留。

**独立实际验证：** 使用作者已封存 `harness02`，其符号链接直接引用当前生产Store/Session；先核对作者封存的20个常规文件、5个链接及3项产品身份。离线、jobs=2，使用已释放共享host target，执行以下4条窄Cargo测试：

| 过滤器 | 实际结果 |
|---|---|
| `store::open::tests::` | 11通过，0失败，50过滤；包括版本/坏库无损拒绝、逐行保真、严格读取、缺失行补建、六阶段rollback及归档隐藏字段 |
| `stale_selection_defaults_without_losing_other_settings` | 1通过，0失败 |
| `independent_schema_fixtures_are_rejected_and_legacy_archive_still_loads` | 1通过，0失败 |
| `recorded_at_archive_v2_twice_remaps_ids_and_preserves_date_and_bytes` | 1通过，0失败 |

合计14通过，0失败；没有重跑作者完整58项或扩大测试套件。完整命令、日志、源文件前后身份见 `docs/verification/app-smart-d1-storage-open09-independent/{inputs.json,result.json,run01.txt–run04.txt}`。13个生产/测试输入在全部命令前后保持一致，最低记录空间约70.7GB，超过2GiB。

初次准备检查将HEAD必须等于固定提交作为前提，因root仅推进文档到 `f3e565d` 而在Cargo运行前停止；已改按固定产品blob/完整src-tauri/src差异及作者产品SHA核对，实际测试源码仍准确为de3c07f。此为审阅前置条件修正，不是产品编译/测试失败；过程记录在inputs.json。

本轮没有新反例需要另造测试。未修改产品或作者封存目录，未运行前端/平台build、GUI/ADB、用户数据库或缓存清理，未stage/commit。Cargo复用现有target的正确源码缓存结果，不宣称重新编译全平台。**共享host target已释放；审查STOP，后续不再运行测试，可进入D2。**
