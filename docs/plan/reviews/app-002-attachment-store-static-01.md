# 附件持久操作模块：独立源码审查 01

2026-11-04，verify。冻结提交 `4d5898f51fa500af4ae3f94ac88b7df86c743fa0`，基线 `0026f5da73e387ba903798831ef189c8a9329c77`，工作树 `/private/tmp/apple-notes-attachment-store-01`。

**结论：SOURCE-READY，没有发现阻断本模块源码整合的 finding。** 六个已提交 Rust 文件与候选 manifest 逐字节 hash 匹配；独立真实 Store/Session 检查通过，允许 root 整合并让父附件提交任务继续接线。此结论不代表系统图片/PDF选择、前端正文ACK、失败UI、冷启预览或默认安装包已修复。

证据：`docs/verification/app-002-attachment-store-independent-01/`，包含 identity、生产接线/摘录、独立命令及完整 stdout、manifest。本轮未改产品、依赖、测试源码或主工作区 git，未构建应用包、操作 GUI/设备或实际用户数据。共享 target 在明确空闲后短暂独占，并已在两次必要 Rust 检查完成后正式释放。

## Findings

无 blocking / non-blocking finding。以下说明的是已核边界及明确限制，不能以模块通过覆盖父任务未完成部分。

## 实际授权、接线与可调用接口

`lib.rs:214–282` 的三个生产命令 `store_attachment_operation`、`query_attachment_operation`、`cancel_attachment_operation` 接收真实注入的 WebviewWindow，并只将其 label 传入 Session。renderer 无 owner/window/session/path/attachmentId 的替代授权参数。默认和 access-boundary-proof 两个 handler 分支均注册这三个命令；旧 store_attachment 命令及 Store 实现与基线逐字比较相同。

Session `:124–200` 先按实际 note 执行原 sensitive(token)，再从自身随机 session id、真实窗口 label 和后端随机 incarnation 构造 owner。incarnation 只由 Session 产生；lib 全局 WindowEvent::Destroyed 回调在同 mutex 下删除对应窗口 incarnation，同label重建/新Session不能认领旧op。客户端 expected 只参与原 Token 检查，不用于生成 owner。持锁调用涵盖敏感检查、owner、SaveIntents与实际 Store 决定，未把锁外检查当作删除许可。

结果是 `{operationId,noteId,status,attachment?,reason?,access}`，status 为 notPersisted / stored / committed / aborted / deferred；attachment 仅 stored/committed 返回。Session.tagged 添加实际 snapshot，仍由未来 bridge 沿原 AccessGate 验收，不是绕过 stale response。新命令 database/filesystem/document 错误保留类别而去除内部 SQL/journal/path 细节；foreign owner/note 的固定 conflict 不返回别人的附件或状态。命令错误脱敏检查真实运行通过。

## 持久身份、重试与确认

`attachment_operations.rs:27–31,153–268` 严格 UUID v4/标准小写形状、文件100MiB、name/MIME长度及控制字符、历史总数10000上限。相同操作身份检查 owner/note/name/MIME/size，完成状态再读实际受管原 bytes 比较；同内容重试返回同一attachment，不新建文件。preparing/aborting/aborted/retired 不被假定可复写；未完成且无法证明原payload时明确 incomplete，前端先query/cancel，确认取消后新操作须新ID。

SQLite preparing 身份先于可能写文件，目标路径只由后端两个UUID生成。文件 create_new、write_all、file sync、目录sync，再在同一SQL事务写附件metadata与stored。exclusive create碰撞路径退休，不覆盖既有对象。已存储但响应未送达时，同owner当前合法token能query真实stored；旧session、旧window incarnation或错误owner不能查询。query未知有效op仅在Session当前原note授权通过后返回notPersisted，不等于调用者可以将尚在途请求视为已取消。

`operation_reference :102–145` 先核journal的受管身份、真实附件metadata及path冲突，再遍历权威持久正文节点；必须id、owner note、kind一致且metadata存在才确认引用。被锁/sealed owner、metadata缺失或不一致、跨note/kind异常都保守deferred，不把不能证明当作无引用。客户端没有“已保存=true”标志；committed由Rust实际正文决定。历史committed即使以后删除节点也不重新成为本次临时文件清理对象。

## 安全补偿、SaveIntent与冷恢复

cancel仅按operationId定位可信记录，不接受任意路径或附件ID。存在权威引用则返回committed并保留；身份不确定则deferred。Session检查**所有窗口**针对该note的未完成SaveIntent；有intent时只允许已真实committed/终态结果，否则deferred/save_pending。目标访问屏障沿sensitive直接拒绝。Session不能知道尚未注册的renderer pendingDocs，这一点未被测试或实现虚构成后端已知。

对可安全取消的新建未引用文件，Store先在同一SQL事务撤metadata并记aborting，再删除自身路径、sync目录，最后aborted。撤metadata使后续新登记的正文保存不能合法引用已取消附件；真实文件错误会返回并保留aborting恢复身份，没有吞掉失败当作aborted。重复取消终态幂等。

Store.open 先初始化私表、保留原recover_imports，再只恢复本模块preparing/stored/aborting。真实已引用的持久正文保留并committed；安全无引用则清理；locked/身份不确定保留并deferred；原metadata/旧孤儿无新op记录不扫。journal不进入公开Attachment或archive字段；Cargo/lock和archive模块均无改动。

purge在与note/attachment删除同一SQL事务退休该note所有operation，也收集preparing阶段尚无metadata的新文件。退休/aborted记录不再由冷恢复删path，测试确认purge后同路径后来对象被保留。purge在DB提交后、文件清理前中断仍可能留下终态遗留文件，候选明确披露并采用不再误删的保守选择；本模块不是历史孤儿清扫器，旧56d7 PDF证据仍须保留。

## 独立真实检查

在冻结隔离目录、使用主target、离线实际执行：

```text
cargo test --manifest-path src-tauri/Cargo.toml --offline --lib attachment --target-dir /Users/water/work/2026/Apple-Notes-Clone/src-tauri/target -- --nocapture
cargo test --manifest-path src-tauri/Cargo.toml --offline --lib session::tests --target-dir /Users/water/work/2026/Apple-Notes-Clone/src-tauri/target
```

第一组退出0，**14 passed / 0 failed / 1 ignored / 36 filtered**。实际穿过生产Store/Session、临时SQLite/真实受管文件，包括响应丢弃再查、同ID冲突、未引用取消、真实持久引用/历史committed保留、全窗口SaveIntent与屏障、SQL trigger和真实目录/文件错误、locked保留、旧附件/旧孤儿保留、冷重开和purge路径退休。部分错误身份fixture明确绕过save校验破坏测试数据库，只用于证明未知身份deferred；不将其说成正常用户输入已造成损坏。

父测试真实派生测试可执行文件六次，分别 after_prepare / after_file / before_store_commit / after_store_commit / after_cancel_metadata / after_cancel_file，要求子进程退出78；恢复前读真实SQLite state、attachment count和文件存在，再Store.open及二次重开核恢复。独立stdout中的六次 running 1 test 来自这些真实子进程。ignored的是该worker的单独顶层运行，不是跳过中断验证。

第二组退出0，**11 passed / 0 failed / 40 filtered**，覆盖实际Session新边界及原保存/多窗屏障/授权/冲突/schema。`cargo fmt --check`、已提交差异 `git diff --check 0026f5d 4d5898f` 均退出0。native已有proof feature check输出的hash本轮核匹配；未无理由重跑相同proof编译，不将其写为本轮独立执行。真实Tauri window注入和Destroyed hook的结论来自已编译默认分支与静态接线，未做GUI销毁时序回放。

检查开始candidate工作树clean；末次status出现 `?? docs/research/mobile-recording-sequence-01/`，native确认是root另派的原录屏研究文档，不是verify写入，也不影响冻结六Rust。独立再次逐文件hash核已提交代码，不把随后研究docs提交当本次产品身份。

## 仍由父任务负责

系统面板打开前operationId和原目标捕获、返回后的可信同步成功/序号/snapshot、仅renderer generation变化时的有限重绑定、真实目标变化继续拒绝；stored/inserted/documentAck/refreshed分账；insert false/throw；ACK后刷新失败不重插/不补偿；本地pending文档尚未登记或ACK失败时保留attachment与operation，或先确定回滚/排空再取消。后端未新增客户“可安全删除”开关。

旧store_attachment仍供未接入录音等路径使用，没有获得新模块的自动幂等/补偿。当前统一F07+Audio安装包不包含本提交。source-ready允许模块整合和前端接线，不能把实际旧图片失败、PDF持久孤儿、后续真实系统选择器/冷启预览或像素状态改成通过。
