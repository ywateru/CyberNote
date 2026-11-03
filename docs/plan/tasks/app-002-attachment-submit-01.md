---
id: app-002-attachment-submit-01
scope: file-picker-return-target-and-attachment-document-commit
status: ready
depends-on: [app-002-permission-01, app-002-attachment-store-01]
---

## objective

解决APP002在真实Mac系统文件选择后已观察到的入口失败与未引用受管附件。验证包为`/private/tmp/notes-search-scroll-56d7e05.app`，合成note `2df8f45b-2c30-467e-b389-e36065e9ca52`。PNG选择后显示状态变化错误，正文/revision69保持，note附件0。PDF选择后同样报错，正文仍保持，却已有受管附件`754a70e3-7590-44be-8bd6-0da9501279f0`（30956B，SHA256 `288ca922ac0e452e20e71428a5fb1c34233acb66eb5ec1cb83dc77871153eeeb`）且正文未引用。证据由verify冻结至`docs/verification/app-002-media/mac-attachment-baseline-56d7-01/`，完整冷启结论以该最终报告为准。

当前精确throw点未经trace确认。native只读分析提示focus→同步/AccessGate generation变化可能使系统面板返回后的旧目标失效；bridge accept和后续nativeAssert的异步顺序须按源码与实际记录区分。不能把该推断直接当最终修复，也不能因修复来源安全而放宽真实授权边界。

## contract

沿用`docs/architecture.md`附件提交与授权契约。系统文件面板正常返回且目标笔记/Editor/文档/会话权限实质未变时，应等待已有可信同步完成并重新验证该次操作的原目标，再继续；不能在遮挡/未同步状态直接插入，也不能捕获错误后无条件改写目标stamp。实际切笔记、旧Editor销毁、正文版本变化、锁定/删除、session或epoch变化仍拒绝；不把任意当前页面当原目标。

附件文件/元数据成功与正文引用/持久确认分别记账。失败不能既显示未完成、又永久留下无引用附件；重试复用这次已确认的附件身份或执行安全补偿，避免重复。若写入成功而响应因授权代次被拒绝，仍须有可核定的本次操作身份和真实后端结果，不能假定没有副作用。补偿只由Rust核权威正文、实际owner与本次新建身份后执行，不接受任意路径、不删除已经引用或别的操作的附件；无法安全清理时显式保留待恢复状态与原因。

只有正文保存ACK后才能关闭为成功；列表刷新随后失败不能误删已引用附件或重试再插一个节点。取消、系统面板取消、在途保存退出的结果确定，不能让晚结果插到另一篇。普通入口与原生顶部入口使用同一归属语义，避免只修Mac分支。录音父保存可随后复用此边界，不在首个文件修复中同时重写录音暂停/计时或绘画。

## implementation

在权限P1候选冻结并交接后由develop串行实施；native的一轮只读源码审计仅提供归因/观察边界，verify不写产品。允许修改必要App/bridge提交边界、实际生产辅助模块及Rust受管附件检查/补偿接口；不升级依赖、不重写归档、不顺带清理所有旧附件。旧合成孤儿保留为证据，不盲删生产存储。

先确定真实首次/返回后校验与已有focus同步的时序，再做最小候选。定向检查穿过实际生产边界，覆盖正常相同目标、真实目标变化、写成功后插入失败、响应过期、保存失败重试、正文已持久后刷新失败及引用附件不可补偿。避免复制实现或只测状态常量。

### 已完成只读接入准备（2026-11-03）

普通菜单、照片入口与Mac原生顶部统一捕获一次附件操作：第一次IPC前确定operationId，记录原scope/note、Editor实例和owner、文档版本、SelectionBookmark，以及后端session/global epoch/noteEpoch。未发起、进行中与已失效必须可区分；失效原目标不得以null回落当前笔记。`clearSensitive`作废操作，晚到的系统面板或存储结果不能恢复其写入权。

系统面板返回后的可信同步须提供明确成功结果、同步序号和当前可信snapshot。不能把现有同步promise的resolve或异步React状态当完成证明。只允许原后端授权身份、目标、Editor、文档和书签均一致而renderer generation单独变化时，为本次操作重绑定当前稳定代次；不改变AccessGate/nativeAssert的全局语义。重验证在存储后、正文插入前再次执行。

后端应以实际注入的窗口、授权session、原note与operationId建立可核查的持久提交身份；附件元数据与操作记录同事务提交。相同操作重试复用原附件，响应因bridge.accept失效而拒绝时仍可在新授权下查询真实结果。可使用独立operation表或journal，不改变公开Attachment/归档字段；只有内存map不足以覆盖响应丢失和冷启。文件写入或数据库失败只清理本次创建路径。

前端分别记录stored、inserted、documentAck与refreshed。处理真实insertContent返回false/throw，正文成功以现有saveDoc/flush ACK为准；ACK后刷新失败保留成功身份，不能重复插入或补偿删除。补偿为窄的“取消本次附件操作”接口，Rust检查owner、权威持久正文、尚未完成的SaveIntents与访问屏障；已引用则保留并标记committed，不能安全判定则返回deferred。冷启恢复仅处理有本次journal身份的未引用新文件，保留旧56d7 PDF孤儿作为历史证据。

实施按实际边界分步提交：先持久操作与安全补偿，再前端捕获/重验证/ACK接线；完整候选交独立审查后统一构建。期间不混入录音暂停/计时、绘画或搜索结果修复，也不以模块测试代替系统选择器实际链路。

2026-11-04：Store模块源4d5898f独立SOURCE-READY并主整合42b2631，实际store/query/cancel_attachment_operation接口和责任见`../../verification/app-002-attachment-store/source-candidate-01.md`。前端接线可在包含该模块、F07与AudioPlayer的主基线创建隔离分支继续。当前3edc4ad0 APK/sealed11dcbfc4 Mac包不包含新模块，不用于声称该修复通过。

2026-11-04：基线72c93b1上的前端源码候选01已完成开发侧接线与定向检查，待独立审查，详见`../../verification/app-002-attachment-submit/source-candidate-01/README.md`。普通/原生文件与照片/相机显式原目标、可信同步结果、同operationId真实query恢复、插入结果与实际saveNote队列ACK、仅刷新重试及未插入窄取消已接入App/bridge。typecheck、新23组生产边界、原16组授权/12组原生工具栏及schema/实际PM回归通过。没有构建或系统选择器、设备、冷启、像素验收；录音父保存仍用原路径，原56d7失败/孤儿结论不变。

## context

- `docs/architecture.md`：附件提交、实时授权、保存intent与归档兼容契约。
- `docs/research/app-002-attachment-entry-01/`：实际App/bridge路径及归因限制。
- `docs/plan/reviews/app-002-mac-attachment-baseline-01.md`与对应冻结证据：真实失败和冷启孤儿，不能改写为成功。
- `docs/requirements.md` F08/F15/F19与`docs/plan/tasks/app-002-media.md`：完整离线媒体范围。

## path

允许必要的`src/App.tsx`、`src/bridge.ts`、实际生产附件操作辅助模块，以及`src-tauri/src/lib.rs`、`session.rs`、`store.rs`/Store辅助模块。持久记录与归档公开结构分离，已有导入恢复、永久删除与旧附件应保持一致；冷启恢复不清扫缺少新操作记录的既有文件。相关真实边界检查与任务证据可同行，不改依赖或既有归档格式。搜索结果App候选须先合入或冻结交接后再串行实施前端接线，避免并行改同一文件。

## verification

独立静态审查后统一构建冻结包。Mac真实菜单→系统Open选图片/PDF→受管字节→正文节点→自身保存→只移开临时来源→冷启→实际图片/PDF预览或明确未实现结果。取消及一个受控插入/保存失败分别核完整正文、附件表与实际文件，重试不得重复；真实目标失效继续拒绝。Android真实文件选择同链有限复验，不能用DOM注入文件替代用户选择。新包未实测前不得把旧PDF复制成功升级为完整附件通过，像素/系统预览差异与功能结果分别记录。
