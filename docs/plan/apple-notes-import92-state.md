# APP92 恢复状态

目标：Mac客户端从系统自带备忘录复制导入，保持源笔记、目录和附件不变。状态in-progress；上一轮同步已交付，不再启动Android或旧模拟器。

基线4c597db6，契约b3de664d及后续47068bba/46581ba0，见[导入契约](../architecture/apple-notes-import.md)和[任务](tasks/app-apple-notes-import92.md)。[只读研究](../research/apple-notes-import92/README.md)已合入aed3dff1/be3ac66e：实际有限元数据/6正文读取成功，所采样源字段前后相同；3附件的副本导出失败-10000且无文件，CID未在HTML出现，不冒称附件成功或推断对象类型。原超时/-1728调用错误保留。设计独审9eff65f6/541f0483已合入，仅预审而非产品验收。

| 工作 | 分支/工作树 | 当前门槛 |
| --- | --- | --- |
| 只读能力/固定JXA | codex/apple-notes-import92-research；/private/tmp/apple-notes-import92-research | 研究冻结，现负责src-tauri/src/apple_notes_source.js固定适配器；接口与主开发先冻结，无Rust/UI改动 |
| 产品开发 | codex/apple-notes-import92-develop；/private/tmp/apple-notes-import92-develop | 第一阶段9bd6cc0f冻结，作者真实Store10通过、archive13通过/1既有ignored，证据f041536b未合；Rust host/Session/UI继续 |
| 独立审查 | codex/apple-notes-import92-review；/private/tmp/apple-notes-import92-review | Store独审原SVG与下划线格式损失无警告反例失败，blocking P2交原作者窄修；SQLabort、commit前后子进程恢复及源名路径边界3项独立通过；未准入Store |

研究私有状态/private/tmp/apple-notes-import92-research-status.md；开发私有状态/private/tmp/apple-notes-import92-develop-status.md。真实源标题、正文、ID和附件不进入仓库或日志，只留私有临时目录。不得执行Notes源make/set/delete/move/import或修改源DB，不创建/删除真实源测试数据；附件save仅指新建自有目录的副本导出。

完成链：只读研究→协议冻结→目标Store与UI实现→不同代理独审→主线整合→实际源到隔离目标与实际App DOM→Mac30准确构建/独立核包。各层结果分别记账。保留旧Mac29/Android21及原Android13秒未保存录音现场，当前不进行任何Android操作。

已确认实现选择：原始HTML/元数据作为明确标注的受管JSON文件附件，纳入现有统计、完整备份与受管文件生命周期；去重由来源/内容hash及真实owner重建，不另留漂移成功表。有新内容的批次创建独立根与来源层次，全部已存在时不建目录，避免误复用用户已移动或改名的旧层次。

固定JXA与Rust host接口已提交9a7e079d [来源协议v1](../architecture/apple-notes-source-protocol.md)，私有旧文件不再作为独立契约；源码产物需独立审查。允许为folder容器形状做最小只读验证，保持私有捕获，不追加无关真实正文扫描。共享target84是唯一现阶段Rust测试缓存，必须明确释放/接手，不并发修改；当前独审已释放供原作者修复P2。
