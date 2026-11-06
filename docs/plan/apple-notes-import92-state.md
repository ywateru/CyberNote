# APP92 恢复状态

目标：Mac客户端从系统自带备忘录复制导入，保持源笔记、目录和附件不变。状态in-progress；上一轮同步已交付，不再启动Android或旧模拟器。

基线4c597db6，契约b3de664d及后续47068bba/46581ba0，见[导入契约](../architecture/apple-notes-import.md)和[任务](tasks/app-apple-notes-import92.md)。[只读研究](../research/apple-notes-import92/README.md)已合入aed3dff1/be3ac66e：实际有限元数据/6正文读取成功，所采样源字段前后相同；3附件的副本导出失败-10000且无文件，CID未在HTML出现，不冒称附件成功或推断对象类型。原超时/-1728调用错误保留。设计独审9eff65f6/541f0483已合入，仅预审而非产品验收。

| 工作 | 分支/工作树 | 当前门槛 |
| --- | --- | --- |
| 只读能力/固定JXA | codex/apple-notes-import92-research；/private/tmp/apple-notes-import92-research | 源脚本bc558511精确重复归一化窄修待独审；原b33来源脚本独审及真实API通过，实际sourceStore首轮失败未导入 |
| 产品开发 | codex/apple-notes-import92-develop；/private/tmp/apple-notes-import92-develop | Store/host及资源修复均已独审合入；UI/debug c5c8c72d及作者DOM17尚未准入，长取消轮询blocker窄修中，未出包 |
| 独立审查 | codex/apple-notes-import92-review；/private/tmp/apple-notes-import92-review | 当前UI取消竞争与source重复归一化审查；原Store、host及其修复已通过，详见下方当前进展 |

## 后续当前进展

- Host独审原2资源反例失败（1daf48c6，主线c6ea0b76），bb1aff7f窄修后原样2+预算差异1通过，独证5b672813已合main d18e8bde。host本体和修复已合main93dcb2b9/0ab345bd；磁盘监测为soft-watch，不宣称能强制终止Notes内部save。
- 实际来源验收使用新tree/private/tmp/apple-notes-import92-real，branchcodex/apple-notes-import92-real，base cfa14fe1。首轮自然101/29.176秒，before单条SystemSource成功，但worker scan phaseerror，未到目标导入；安全证据257058e5已合main60cd55c0，补充ee483e93待合。既有真实扫描有3个完全一致的重复ID行；当前失败未输出错误码，不能据此宣称本轮根因日志已实证。
- 固定源脚本窄修bc558511在研究tree冻结：精确一致重复行合并，同ID任何metadata冲突拒绝source_changed，host重复ID拒绝不放宽。34VM/静态语法通过，当前独审新增反例；准入前不重跑真实来源。
- UI/debug冻结c5c8c72d在开发tree，尚未合主线。作者实际React→同core/realStore的DOM矩阵已17通过，原备份命令遮挡失败保留；不涵盖长取消竞争。独审已实际React/browser复现取消350ms仍cancelling后停止轮询（1450ms仅1poll、未finish），原作者正在窄修，未准入UI。
- 共享target84现在无构建占用；作者lean build03完成后复制binary供DOM，不占target。之后真实source重跑须先独审准入和明确排他交接；原Android及所有设备继续不操作。尚无Mac30包。

研究私有状态/private/tmp/apple-notes-import92-research-status.md；开发私有状态/private/tmp/apple-notes-import92-develop-status.md。真实源标题、正文、ID和附件不进入仓库或日志，只留私有临时目录。不得执行Notes源make/set/delete/move/import或修改源DB，不创建/删除真实源测试数据；附件save仅指新建自有目录的副本导出。

完成链：只读研究→协议冻结→目标Store与UI实现→不同代理独审→主线整合→实际源到隔离目标与实际App DOM→Mac30准确构建/独立核包。各层结果分别记账。保留旧Mac29/Android21及原Android13秒未保存录音现场，当前不进行任何Android操作。

已确认实现选择：原始HTML/元数据作为明确标注的受管JSON文件附件，纳入现有统计、完整备份与受管文件生命周期；去重由来源/内容hash及真实owner重建，不另留漂移成功表。有新内容的批次创建独立根与来源层次，全部已存在时不建目录，避免误复用用户已移动或改名的旧层次。

固定JXA与Rust host接口已提交9a7e079d及093f20fa [来源协议v1](../architecture/apple-notes-source-protocol.md)，私有旧文件不再作为独立契约；源码产物需独立审查。共享target84是唯一现阶段Rust测试缓存，必须明确释放/接手，不并发修改。真实source、App DOM、host所有权/取消/输出限额与准确包各自独立记账，不能以已通过Store或VM替代。

真实source待执行入口：apple_notes_import::core::tests::actual_readonly_source_worker_to_isolated_store，默认ignored，仅测试编译。APPLE_IMPORT92_PRIVATE_INPUT为0600私有JSON路径，内容仅研究者私下定位的noteId；APPLE_IMPORT92_PRIVATE_OUTPUT为新私有目录。生产同core/SystemSource/OwnedStage与真实SessionStore，不另写append。完整stdout/stderr/target数据留私有目录；只提交safe-report.json中的固定安全聚合字段并检查无源信息。具体准备见/private/tmp/apple-notes-import92-real-integration-plan.md，未执行不能算通过。
