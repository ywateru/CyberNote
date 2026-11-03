# APP002：Mac附件入口，一轮只读源码审计

2026-11-03；native研究。只读当前主源码、56d7构建输入清单及verify已保存证据，没有操作GUI/设备、改生产代码、放宽guard、构建或重试附件入口。本报告与Android权限P1分批；develop先处理权限，附件修复另立候选。

**源码成立的直接问题链是：原生命令保存的NativeContext含旧AccessStamp；焦点恢复/页面可见触发同步时无条件增加AccessGate.generation，刷新成功且后端授权完全不变也不会更新该附件context。这样旧context之后会被nativeAssert拒绝。** 本轮没有具体guard快照或IPC时序，不能仅凭该源码把PNG/PDF每次实际失败分支当作已测定。

## 输入与现有运行事实

原始证据由verify拥有：`docs/verification/app-002-media/mac-attachment-baseline-56d7-01/`。56d7包输入清单为`docs/verification/app-001-fix-02-visual-01/runtime-search-scroll-01/source-inputs.json`；本轮各源码SHA及与该清单的比对结果见`source-and-evidence.json`。

- PNG的`07-system-image-selected.ax.txt`记录系统面板选中文件；`08-image-import-return.ax.txt`显示“备忘录或授权状态已改变，请重新执行操作”。`05-before-success-storage.json`与`09-after-image-error-storage.json`完整note相同，revision69，附件表0。只证明该次未留下附件/正文变化，不证明具体throw点。
- PDF的`13-after-pdf-error-storage.json`仍是同一完整doc/revision69，但已经有受管附件`754a70e3-7590-44be-8bd6-0da9501279f0`。`16-managed-attachment-after-error.json`记录30956字节、SHA256 `288ca922ac0e452e20e71428a5fb1c34233acb66eb5ec1cb83dc77871153eeeb`，与master相同，正文未引用。**写入副作用和孤立附件已证实；精确throw点尚未记录。**
- 最终banner不是带阶段标签的新异常日志，可能延续此前状态。不能仅凭最终文本把PDF认定为“第二次nativeAssert运行失败”；需结合后述不同错误文本与阶段记录。也不能把附件表已有1项当作附件正文成功。

## 实际调用链

1. `src/App.tsx:2041–2049`，choosePhotoVideo/attachFile命令先调用`nativeSelection(context)`；它执行`nativeAssert(context,true)`并恢复原bookmark。再浅拷贝context至`nativeAttachmentTarget.current`，设置accept并点击隐藏file input。`stamp`仍指向原快照，不随工具栏新投影更新。
2. 隐藏input的onChange（2319/2327）调用`fileSelected(e.target.files)`（1142）。该函数先取出并清空nativeAttachmentTarget；若缺files/current/editor则返回。native路径有target时，在任何storeAttachment之前执行第一处`nativeAssert(target,true)`。
3. 每文件进入`bridge.storeAttachment`（bridge.ts:284）：先读取文件base64，再捕获该时刻新stamp，调用真实`store_attachment`并传`accessGate.expected(noteId)`。后端lib.rs:177–194先Session.sensitive核token/锁定状态，再写受管文件和附件表并返回tagged access。
4. `bridge.accept`在RPC完成后再次核读响应的stamp。即便磁盘写入已成功，刷新导致的generation变化仍可使响应被拒绝；这个前端拒绝不会回滚已经完成的后端附件写入。
5. 若storeAttachment正常返回，fileSelected执行第二处`nativeAssert(target,true)`，随后恢复bookmark、insertContent附件、更新target bookmark/documentVersion；最后refresh。第二处assert沿用选择前的旧target stamp。任何catch只调用fail显示错误；当前路径没有针对已存但未插入附件的补偿。

由此PDF表项证明该文件确实经过真实store并写入成功；它兼容“bridge响应accept被拒绝”或“返回后第二guard拒绝”等候选。哪个候选与该次banner对应仍需阶段观测，不能从DB倒推出唯一异常点。

## 两组nativeAssert与错误文本

以下是`src/App.tsx:1898–1929`的全部精确判定。文件选择路径参数是editing=true、overlay=false。

| 分组/错误 | 触发条件 |
| --- | --- |
| “备忘录或授权状态已改变，请重新执行操作” | context.scope与nativeScope不同；context.noteId与noteId不同；`JSON.stringify(accessGate.stamp(noteId)) !== JSON.stringify(context.stamp)`；loading；synchronizing；任意accessSuspended；正在operationId；目标在blockedNotes或access.suspended；存在modal/draw/record且overlay=false |
| “编辑内容或选区已改变，请重新选择后执行操作” | editing=true且current不存在/已删除；context.editor缺失或不等当前editor；owner不等目标note；editor已毁/不可编辑；bookmark缺失；当前locked且未授权；nativeDocumentVersions计数与context.documentVersion不同 |
| bridge的AccessChanged：“授权状态已改变，请同步后重试” | src/access-client.ts:40–66：响应session不同/epoch回退，或读响应stamp.generation与当前generation不同；另有获取expected时state缺失等路径 |

第一组scope为`[folderId,noteId,view,galleryEditor,separate]`。stamp包含generation/sessionId/global epoch/noteId/noteEpoch；其中generation是前端读响应失效代次，**不是笔记revision、编辑器doc版本或后端noteEpoch**。JSON字符串比较使仅generation变化也足以拒绝。全仓精确长错误文本只在nativeAssert第一组；bridge的文本不同，但若最终banner不是新throw记录仍不能据此排除旧banner/其他异步动作。

## 系统面板、刷新与版本：事实和推断分开

- `App.tsx:590–630`的synchronizeRef每次调用先syncSequence++、invalidateAccessRequests、setSynchronizing(true)，即使已存在同步promise，也先失效。bridge.ts:21转AccessGate.invalidate，access-client.ts:28每次generation++。没有“后端epoch相同就还原generation”的路径。
- `App.tsx:685–708`的visibility visible和Tauri onFocusChanged(payload=true)都会调用synchronizeRef。**若系统Open面板返回导致其中一次事件发生，旧attachment stamp必与新generation不同**；若onChange发生在同步中，synchronizing也可能拒绝。事件顺序和实际哪一分支缺运行记录，保留为候选。
- 原生toolbar的windowActivity通知（macos/toolbar.m:234–240）只在controller.receive里更新active展示信息，不调用synchronizeRef，不直接变更AccessGate。不能把原生失活事件本身当授权撤销。
- 普通同源refresh只loadWorkspace/hydrate；hydrate仅在session/noteEpoch变化时clearSensitive，在非pending真实document变化时增加externalVersions。NoteEditor key包含noteId/session/noteEpoch/externalVersion；无变化刷新不必更换editor。重复JSON对象本身不表示文档变化（已有documentsEqual）。
- 编辑器nativeDocumentVersions只在transaction.docChanged时增加（App.tsx:795–801）；纯选区/焦点事务不会增加。笔记revision69未变不能直接证明editor实例/本地doc计数相同，但观察到的长错误也不是该第二组错误。
- clearSensitive会清空nativeAttachmentTarget并销毁相关editor。当前fileSelected把target=null同时用于普通无原生context入口，因此“原生目标已失效”不能被未来修复误当作“可向当前笔记普通导入”。这是源码边界提醒，本轮未测跨笔记/锁定复现。

## 后续最小观察点

一次候选诊断应记录不含正文/文件内容的有限阶段数据，避免继续盲点失败入口：

1. 原生命令被接受及input打开：操作ID、scope/note、原stamp各字段、editor实例/owner、documentVersion、bookmark是否存在。
2. focus/visibility事件、sync开始/结束：syncSequence、旧/新generation、实际session/global epoch/noteEpoch、operation/suspended；区分面板失活与授权事件。
3. input onChange前第一guard：target是否存在、files数量、第一组各失败条件名、第二组失败条件名。
4. store RPC阶段：发送/后端写入返回/bridge accept结果；附件ID、响应stamp与live stamp、结构化错误code与精确message。区分“后端没写”与“前端拒绝已写响应”。
5. 第二guard、insert dispatch、正文save确认/refresh：同一操作ID与附件ID，是否正文已引用；失败补偿是否完成。不要把全局最后一个banner当阶段证据。

## 最小修复的验收边界（非本轮实现）

保留现有AccessGate读响应失效规则、nativeAssert安全检查和后端Session.sensitive。不要全局忽略generation、跳过第二guard、用窗口label替代来源/目标或盲目改写target.stamp。

附件操作若允许经过纯焦点刷新继续，须在完成可信同步后显式重新确认：原笔记/导航scope、原session与授权epoch/noteEpoch、无pending/suspended/失败、同editor/owner/doc版本、原bookmark仍有效。只有这些与原意图一致，才能把该附件操作绑定到当前稳定代次；授权转移、内容改变、换笔记或旧操作失效必须拒绝。原授权关系不同不能自动重选“当前”对象继续。

异步存储期间同样可能失效，因此恢复入口成功不能单独关闭PDF孤立附件问题。候选应明确“写入与正文关联”的一致性或已写失败补偿边界，且补偿不能误删其他已引用附件；不能先吞异常并展示假附件卡。

真实验收至少覆盖PNG/PDF各一次正常选择→正确原选区插入→保存→源文件移走→冷启读取；取消不新增；纯失活/恢复可继续；面板期间真正换笔记/锁定/编辑变化继续拒绝；await store期间失效不留未引用附件或有明确已验补偿。文档/表/受管文件三个层次分别核对。权限P1、录音资源清理与纸张视觉不得凭该批附件结果继承通过。
