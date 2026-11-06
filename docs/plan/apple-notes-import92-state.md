# APP92 恢复状态

目标：Mac客户端从系统自带备忘录复制导入，保持源笔记、目录和附件不变。状态in-progress；上一轮同步已交付，不再启动Android或旧模拟器。

基线4c597db6，契约b3de664d，见[导入契约](../architecture/apple-notes-import.md)和[任务](tasks/app-apple-notes-import92.md)。当前Notes.sdef已确认HTML、纯文本、稳定ID、层级、日期、锁定标志及附件CID/native save能力；真实读取和附件导出研究仍待结果，不等同实际功能成功。

| 工作 | 分支/工作树 | 当前门槛 |
| --- | --- | --- |
| 只读能力研究 | codex/apple-notes-import92-research；/private/tmp/apple-notes-import92-research | 有界真实读取、附件副本和源前后摘要；安全聚合证据 |
| 产品开发 | codex/apple-notes-import92-develop；/private/tmp/apple-notes-import92-develop | 源无关UI/Store先行；源协议依实际研究冻结 |
| 独立审查 | codex/apple-notes-import92-review；/private/tmp/apple-notes-import92-review | 先审契约/边界；开发提交后审代码和针对性实证 |

研究私有状态/private/tmp/apple-notes-import92-research-status.md；开发私有状态/private/tmp/apple-notes-import92-develop-status.md。真实源标题、正文、ID和附件不进入仓库或日志，只留私有临时目录。不得执行Notes源make/set/delete/move/import或修改源DB，不创建/删除真实源测试数据；附件save仅指新建自有目录的副本导出。

完成链：只读研究→协议冻结→目标Store与UI实现→不同代理独审→主线整合→实际源到隔离目标与实际App DOM→Mac30准确构建/独立核包。各层结果分别记账。保留旧Mac29/Android21及原Android13秒未保存录音现场，当前不进行任何Android操作。
