# APP92 恢复状态

目标：Mac客户端从系统自带备忘录复制导入，保持源笔记、目录和附件不变。状态in-progress；上一轮同步已交付，不再启动Android或旧模拟器。

基线4c597db6，契约b3de664d及后续47068bba/46581ba0，见[导入契约](../architecture/apple-notes-import.md)和[任务](tasks/app-apple-notes-import92.md)。[只读研究](../research/apple-notes-import92/README.md)已合入aed3dff1/be3ac66e：实际有限元数据/6正文读取成功，所采样源字段前后相同；3附件的副本导出失败-10000且无文件，CID未在HTML出现，不冒称附件成功或推断对象类型。原超时/-1728调用错误保留。设计独审9eff65f6/541f0483已合入，仅预审而非产品验收。

| 工作 | 分支/工作树 | 当前门槛 |
| --- | --- | --- |
| 只读能力/固定JXA | codex/apple-notes-import92-research；/private/tmp/apple-notes-import92-research | b33a5838固定脚本独审14VM与真实scan/单条read均通过，main43170cf9/25fcc79c/0f589070；下一关实际来源→隔离Store计划已准备，等host准入才执行 |
| 产品开发 | codex/apple-notes-import92-develop；/private/tmp/apple-notes-import92-develop | Store9bd+修复9f已合；host/Session冻结0d91e184，作者同core12通过/1实际source显式ignored，纯证据35aa5821；UI/debug/typecheck初接继续，未完整DOM或出包 |
| 独立审查 | codex/apple-notes-import92-review；/private/tmp/apple-notes-import92-review | Store/转换和JXA已独审准入；当前独审0d91e184同core状态机、NativeHost、进程/文件/取消/权限边界；target84交给独审，不能与开发/真实source并发 |

研究私有状态/private/tmp/apple-notes-import92-research-status.md；开发私有状态/private/tmp/apple-notes-import92-develop-status.md。真实源标题、正文、ID和附件不进入仓库或日志，只留私有临时目录。不得执行Notes源make/set/delete/move/import或修改源DB，不创建/删除真实源测试数据；附件save仅指新建自有目录的副本导出。

完成链：只读研究→协议冻结→目标Store与UI实现→不同代理独审→主线整合→实际源到隔离目标与实际App DOM→Mac30准确构建/独立核包。各层结果分别记账。保留旧Mac29/Android21及原Android13秒未保存录音现场，当前不进行任何Android操作。

已确认实现选择：原始HTML/元数据作为明确标注的受管JSON文件附件，纳入现有统计、完整备份与受管文件生命周期；去重由来源/内容hash及真实owner重建，不另留漂移成功表。有新内容的批次创建独立根与来源层次，全部已存在时不建目录，避免误复用用户已移动或改名的旧层次。

固定JXA与Rust host接口已提交9a7e079d [来源协议v1](../architecture/apple-notes-source-protocol.md)，私有旧文件不再作为独立契约；源码产物需独立审查。共享target84是唯一现阶段Rust测试缓存，必须明确释放/接手，不并发修改；目前交给host独审，暂未Mac出包。真实source、App DOM、host所有权/取消/输出限额与准确包各自独立记账，不能以已通过Store或VM替代。

真实source待执行入口：apple_notes_import::core::tests::actual_readonly_source_worker_to_isolated_store，默认ignored，仅测试编译。APPLE_IMPORT92_PRIVATE_INPUT为0600私有JSON路径，内容仅研究者私下定位的noteId；APPLE_IMPORT92_PRIVATE_OUTPUT为新私有目录。生产同core/SystemSource/OwnedStage与真实SessionStore，不另写append。完整stdout/stderr/target数据留私有目录；只提交safe-report.json中的固定安全聚合字段并检查无源信息。具体准备见/private/tmp/apple-notes-import92-real-integration-plan.md，未执行不能算通过。
