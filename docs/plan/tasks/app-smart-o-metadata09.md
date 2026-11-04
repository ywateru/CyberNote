---
id: app-smart-o-metadata09
scope: Session metadata ordering and editor ownership
status: pending
depends-on: [app-smart-d2-durable-rules09]
---

## Objective and context

把D2真实智能查询接到现有Session/bridge保存链，确保多窗更新和异步回包不会倒退定义/列表或破坏未保存正文。读architecture、smart-folder-contract09-proposal.md 的C5/C6、D2任务及现有AccessGate/TrustedSynchronization/SaveRevisions和标签停车契约。此任务不先开放旧UI的smart能力；U完成实体导航与表单后才移除D2临时gate。

## Contract

元数据序号与定义revision、Note.revision、access epoch分开。Session在同mutex拥有进程sessionId及单调metadata sequence；真实内容/定义/目录/附件facts变更成功持久化后推进并形成权威响应/无正文通知，失败/取消/冲突不推进。设置等不影响查询的纯UI状态可不发变更通知，但必须清晰列明分类。已持久提交但维护失败（lock_committed等）按已提交处理。不得为更新查询重置匹配笔记key/epoch、保存intent或Editor；真实lock/delete/import仍沿原prepare→真实窗口排空→ACK→commit/abort。

workspace、动作和内部智能投影携带 `{metadata:{sessionId,sequence}}`。发送端持锁内先commit/定序/形成值，释放mutex后发metadata事件再返回；允许消息送达乱序，由序号判旧。事件只传身份、序号、变化种类/ID，不传正文、标签名称或key。读取/投影取得与其声明序号同一快照，智能列表/count同一投影而非独立计数查询。

renderer先订阅access与metadata再读初始workspace；metadata门独立于AccessGate。区分“已观察变更序号”和“已应用工作区序号”，避免收到save ACK seq5后把同seq5通知丢弃、导致工作区一直停4。旧workspace/投影不能发布；有效旧save ACK仍先过原AccessGate.save并确认其原note revision，不能因metadata落后吞掉ACK、留pending或错误重基线。任何已持久成功动作也要保留其成功收据/新ID，不把旧快照拒绝误报成动作失败后重复创建。

元数据刷新用不重建Editor的现hydrate路径并保留原pending正文/revision基线；不要调用会遮挡/冻结/flush的完整权限重新同步来处理普通定义变化。活动组字、Undo/Redo、媒体/格式书签和原Editor owner不变；只有真实外部正文变化或访问失效沿原契约处理。事件丢失可通过focus/重连权威读取恢复；新session必须原可信授权同步，不能只因metadata session变了接纳旧内容。出错保留未保存内容，并提供可重试的真实状态。

接入真实Session定义CAS和SmartProjection，受现token/pending门禁约束；定义删除不按匹配成员设置保存屏障。公开UI开关未启用时继续D2能力gate；不得通过新命令绕过。普通元数据动作不强制别窗导航、关闭草稿或清搜索；当前目录失效在U的导航契约处理。

## Path and verification

预计session.rs/lib.rs、bridge.ts/types.ts、新metadata-client及App窄订阅/hydrate接入；必要真实生产测试与固定corpus。不要另造Store/保存队列，保留访问协议和已有unknown边界。实现前按D2最终源码复核具体接缝，root明确START后才编码。

需用真实Store/Session和真实bridge/挂载App接缝验证：两个窗口定义CAS；先新通知后旧workspace；原note有效save ACK落后于新metadata仍正确排空pending且无旧正文发布；ACK先到但同seq事件仍刷新；定义变化期间同Editor/Undo/活动组字保持；lock/delete/import真实屏障回归；新进程/旧token/通知丢失恢复。可控制实际回包交付次序，不能把测试自造模型当生产协议。只执行有区分力的必要测试和typecheck/build；作者STOP、固定commit、不同作者独审后再U，不宣称设备/像素已通过。
