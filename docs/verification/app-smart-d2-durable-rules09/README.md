# APP-SMART-D2 作者交付

状态：**SOURCE-READY STOP**。基线 `d7e6c72ae928bf5a346c462a46e1cf29c1c596d2`（D1产品提交 `de3c07f`）。准确的十个变更源文件 SHA-256 见 `source-identity.json`；每轮结果另含真实命令和编译前后源码身份。root 同时维护的其他文档未由本作者修改。作者未 stage/commit，停止源码/证据写入，交 root 固定提交后独立审查。

## 已实现

真实 Store 内持久化严格物理/智能分支；query v1 支持标签四模式、置顶、all/any，拒绝未知/重复/不完整形状与越界输入。更新和删除都在同 SQLite 事务中检查 expectedDefinitionRevision；定义从1开始、上限JS安全整数，缺实体不复活。规范 JSON UTF-8 字节限制64KiB。物理 Folder 仍只接受原六字段，旧缺省 parentId 可读；smart 必须带 null parentId、query、definitionRevision。

真实求值只从校验后的 noteTag 完整跨度提取，不扫描 plainText；排除 deleted/suspended，locked（包括临时解锁）标签为 unavailable。返回同一 SQLite 读快照的 definitionRevision 和 ids，不持久化成员，不为定义删除修改匹配笔记、附件、密钥或 note revision。

0空库/完整旧0库直接原子到2；1原子到2；2只校验。旧0/1即使藏完整合法的八字段 smart 也在补写/恢复前拒绝；旧物理藏 query/revision（含null）继续拒绝。统一物理能力用于创建、移动、恢复、冲突副本、parent、活库与归档整图；deleted笔记必须先restore再通过folderId移动，缺失旧 originalFolderId 仍可回default。既有合法 JSON 不因迁移重写，异常图拒绝不自动修正。

归档1/2保持旧物理格式和 recordedAt 语义；含smart才导出3。normal/smart自定义ID先统一冲突映射，再映射parent、owner/original owner、选中实体及既有正文附件引用；智能revision保留。沿既有文件journal v1和SQLite原子流程导入，无第二套导入器。

首批只有tags+pinned，不表示永久取消其他离线规则。没有新增UI入口、TS边界、依赖或lock改动；物理目录删除联动和其他规则仍由后续任务接入。

## 公开能力闭合

Store 的内部真实创建/替换更新/删除/求值及archive3保留；generic action不分发smart CRUD。旧界面遇含smart活库统一 capability_unavailable，避免把它当物理目录。

| lib/Session接入链 | 实际gate位置 |
| --- | --- |
| load_workspace → Session.workspace → Store.workspace | workspace读取/解密前检查；snapshot也检查 |
| workspace_action save → Session.save → Store.action | save移除intent前检查，原授权检查继续 |
| 普通workspace_action → ordinary | Session.check在Store动作前检查 |
| 屏障workspace_action → begin/finish | check在Pending创建前；finish在取出Pending/提交前检查 |
| import_archive → mutate → begin/finish | begin调用共用生产Archive只读解析/预算/版本检查，含smart在prepare前拒绝；finish实际解析一次并以相同策略复核后才进入原恢复/文件发布/SQL事务，防源文件换档 |
| register_save_intent | sensitive → check，在登记intent前检查 |
| store_attachment | sensitive → check，在真实Store写文件前检查 |
| store/query/cancel_attachment_operation | sensitive → check，在owner incarnation/操作日志/文件动作前检查 |
| read_note_text/read_attachment | sensitive → check，在返回正文/读取文件前检查 |
| export_archive | lib显式gate → Session.export_archive → check，在写目标文件前检查；原pending错误类别保留 |
| acknowledge_access、forget_attachment_window、ready | 仅会话ACK/清理/状态判断，按批准策略允许收尾，不访问智能内容或新增数据写入 |

## 实际验证

所有Rust运行 locked/offline、jobs2、现有共享host target，运行前空间至少2GiB。`run-rust.py`直接链接生产 Store/Session 模块，复用仓库既有harness manifest/lock；测试没有复制求值器。各run日志和result.json均保留。

| 记录 | 实际结果 |
| --- | --- |
| run01，过滤smart | 8通过，0失败，61过滤；首轮新增场景 |
| run02，完整回归 | 67通过，0失败，3既有忽略；含双连接真实SQLite快照检查 |
| run03，完整最终产品回归 | **67通过，0失败，3既有忽略**；9.853秒；修复deleted直接移动后，生产源码前后相同 |
| run04，新增旧版本隔离区别case | **1通过，0失败，70过滤**；5.806秒；旧0/1完整8字段smart拒绝，DB字节/附件/journal不变；仅测试文件变化，产品实现与run03完全相同 |
| host-check01 | **exit0**，8.712秒，未超时；`cargo check --locked --offline --lib --manifest-path src-tauri/Cargo.toml`，600秒上限；源码前后相同，真实Tauri适配器编译通过 |

共新增10个测试（其中部分含多组fixture），覆盖四标签模式、精确名称/未引用名称、plainText伪标签、未锁空文档、locked/unavailable的all/any、suspended/deleted、重开持久化、真实双SQLite连接中途提交仍保持同快照、严格输入/实体、CAS/旧稿/删除后请求/溢出、删除无成员副作用、owner/parent/restore/conflict-copy拒绝不变、0/1迁移与坏图回滚、智能归档双导入及日期/正文/选择映射、导入SQL失败清理、公开Session入口与保存intent不消耗、prepare前拒绝和finish换档复核。既有归档crash/recovery、日期、附件和Session回归一并通过。

host check有10条dead_code警告，均来自按本批设计暂不接旧UI的内部智能CRUD/求值、内部完整导入及相应帮助函数；没有隐藏或压制警告。

边界：这是Store/Session真实临时库测试和宿主Rust库编译，不是Tauri IPC现场运行、平台打包或UI验收。没有运行GUI/ADB/用户DB、前端build、Mac/Android打包或安装，也未下载、升级或清理缓存。host target已释放。剩余空间70673928192字节。智能端到端交互与像素一致仍须O/U和准确双端新包验收。
