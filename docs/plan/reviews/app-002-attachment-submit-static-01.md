# 系统附件提交前端：独立源码审查 01

2026-11-04，native_ui_research 独审。冻结候选 `607950a57b1a1f01eb59b2e4db5738b66e890c40`，基线 `72c93b1b34bcfd3a95c331d1da93e187ff5fda14`，分支 `task/app-002-attachment-submit`，隔离目录 `/private/tmp/apple-notes-attachment-submit-01`。

**结论：BLOCKED / NOT SOURCE-READY，暂不合入。发现1项 P1 阻断，已用真实 App 取消接线和生产模块受控复现并交作者。** 本审查不修改产品。其余有界静态关键链暂未发现第二项阻断；不是完整运行验收。

证据：[app-002-attachment-submit-independent-01](../../verification/app-002-attachment-submit-independent-01/)，包含冻结输入身份、保护文件逐字节核对、原始复现脚本和结果。7源码 SHA 与候选清单逐项吻合，聚合 `6b74daab6c15b3ef642fd0651193c2960a9ceb4d16e253de7d6d2f6d0fdc3757` 独立重算相同。开始检查时 worktree clean；审查结束释放给作者修复，后续报告读取固定 Git blob，不将可变工作树当607950a。

## P1：取消早于真实 store 完成时，notPersisted 被当成终态并丢弃恢复身份

冻结 `src/App.tsx:1563–1601` 的 `discardUninsertedAttachments` 会在 `storageAttempted` 为 true 时调用 Rust cancel，并把 `notPersisted` 与 `aborted` 都视为可释放；随后删除 submission/batch、失效 target、清错误。**它没有等待该 submission 的真实 store/FileReader promise settle。** `storageAttempted` 在 helper开始调用 `ports.storage.store()` 之前置 true（`src/attachment-submission.ts:135–137`），实际生产 bridge 在 FileReader完成后才 invoke store（`src/bridge.ts:325–351`）。

确定复现顺序：

1. 实际 App `submitAttachmentBatch` 已建立操作，`AttachmentSubmission.storageAttempted=true`，生产 bridge 等文件读取；此时后端还未收到 store。
2. 实际 App `discardUninsertedAttachments` 可信复核后先封入场，调用实际 bridge cancel。受控平台按已有 Rust Store未知op语义返回 `notPersisted`。Rust `attachment_operations.rs:320–328` 对未知op只返回此值，没有持久取消 tombstone；Session mutex不能阻止尚未派发的未来store。
3. App 删除所有该操作的 batch/submission，target失效。这里取消请求已 resolve，被当作处理完成。
4. FileReader随后完成，生产 bridge仍调用 `store_attachment_operation`；实际后端身份未变，所以后端允许新建本操作。响应会因 renderer generation变化被生产AccessGate拒绝，或由helper失效门禁挡住插入。
5. 实际 helper catch再验证时报告原目标失效；晚插入被阻止，但前端恢复身份已被步骤3删除。结果是新stored附件没有正文引用、前端没有可恢复批次。不能将“没有晚插入”当作“取消已无剩余副作用”。冷启动可能清理 journal不等于本次取消已核定，也不能让同进程的恢复身份丢失成为成功。

实际受控结果：[cancel-before-read.json](../../verification/app-002-attachment-submit-independent-01/cancel-before-read.json)：调用序为同operation的 `cancel_attachment_operation → store_attachment_operation`；末态受控后端stored操作1，前端batch0/submission0，targetInvalidatedtrue，晚submit失败为“原附件目标已失效，请保持窗口打开”。

复现脚本 [cancel-before-read.mjs](../../verification/app-002-attachment-submit-independent-01/cancel-before-read.mjs) 用 TypeScript AST从冻结的 App抽取未改的 `validatePickerTarget`、`submitAttachmentBatch`、`discardUninsertedAttachments` 原函数，实际执行生产 AttachmentSubmission、TrustedSynchronization、目标guard、完整bridge、AccessGate，以及真实PM bookmark；仅FileReader/invoke平台和宿主refs受控。后端状态取值跟随已有Rust源语义，**不是本次真实Rust DB/GUI/用户点击实证**。与只测helper不同，这里实际运行App的删除batch路径；没有复制取消状态机。

按钮在错误栏内（App2787–2803）。已有错误在新选择/存储期间未自动清除，或期间出现其他错误时，该按钮可达；复现直接调用真实处理函数，不宣称已在设备上点过。此函数自己明确处理晚存储竞态，不能依靠当前某一无错误画面中按钮暂未显示来证明取消安全。

最小修复要求：先同步封住批次/操作新入口，但保留操作身份；等待已开始的真实 store/run settle（包括FileReader、在途invoke和拒绝响应），再以当前可信授权查询/窄取消同一op核定结果。未知响应、deferred、committed、当前授权无法核定时保留恢复身份和明确原因，不删本地pending节点。必须保证后续没有尚可派发的同op store后，才可把notPersisted当作该次取消完成。无需放宽AccessGate，不建议修改Rust为通用删除接口。作者应修独立后续提交；保留607950a及原失败证据。

## 已核真实接线及有限通过部分

- **真实入口与原目标**：普通文件、照片/视频、相机/扫描照片及原生顶部命令都使用 capturePickerTarget/openAttachmentPicker；初始operationId在input.click前固定，其余多文件ID在首次IPC前固定。file与camera各有显式目标，无目标change报错，不回落当前笔记。普通文件入口清accept过滤；scanInfo仅允许该说明页例外。系统cancel/空files无存储，旧宿主cancel事件支持仍需实际验证。
- **稳定归属与同步**：capture保存原scope（含page）、note、Editor实例与owner、doc/external版本、原bookmark、原编辑器JSON和原存储JSON、后端session/epoch/noteEpoch。validate先flush，再等显式成功且仍current的TrustedSynchronization snapshot，用两种表示各自完整比较，resolve原bookmark；只有renderer generation可重绑定。真实切目标、Editor销毁、doc/external版本、session/epoch、锁/删除/屏障继续拒绝。clearSensitive失效原目标与在途submission。
- **真实存储恢复**：native store/query/cancel沿现有AccessGate。store在文件读取前捕获stamp/token，generation改变不伪装为无副作用；helper在响应拒绝后重新可信验证、query同operation，明确notPersisted才允许同ID重试。deferred/aborted、错误身份不会取得附件；浏览器分支明确preview，不冒充journal。此条不抵消上面的App取消丢身份。
- **实际命令与一次插入**：App1499–1535恢复原PM bookmark并运行真实Tiptap链，检查`.run()` boolean；finally查真实Editor JSON，即使dispatch后throw也保留inserted。更新本次目标bookmark/documentVersion/document以容纳自己的插入，后续不能随便接受外部变化。helper重试以已保存attachment和inserted阶段防重复。这里是静态接线结论；本次没有在真实DOM/Tiptap mounted App中操作插入。
- **正文ACK**：App670–740实际saveDoc使用生产enqueueSave返回成功/失败；saveNote成功且实际返回n.document含匹配note/id/kind attachment节点时才acknowledge（709–714），队列排空本身不当成功。插入时保存task的Promise continuation晚于同步inserted赋值；awaitDocumentAck先等原note队列，再在无ACK且pending确实引用时重新saveDoc并检查outcome。与原有失败队列、revision基线和pendingDocs保留契约相容。
- **pending与刷新分账**：保存失败保留文件/attachment/local node；错误重试先处理pending再run原批次。documentAck后helper只刷新，不再依赖旧光标、不再store/insert；刷新失败保留该身份，不能补偿已引用附件。saveDoc同步更新wsRef以避免自身快速ACK前后hydrate误判外部修改。本次未做真实App ACK/刷新故障注入；23组生产模块检查覆盖相应端口语义。
- **取消pending保全的已有保护**：操作inserted为true先拒绝取消；再次检查本地JSON引用，未登记pendingDocs不能被Rust看见这一事实未被隐藏。异常/失效响应不伪造安全删除；需修正的是尚未settle store时误把notPersisted当最终结果并删身份。

以上是有界审查范围，不给出“所有竞态已证明不存在”的保证，也不以原helper23通过覆盖实际App中已复现问题。

## 独立实际检查与完整性

在冻结worktree、作者开始修改前实际运行：

```text
pnpm typecheck                                  exit0
node scripts/check-attachment-submission.mjs     exit0 / 23 groups
node <独立证据目录>/cancel-before-read.mjs       exit0 / 明确要求重现上述失败
```

第一组严格TS通过。第二组编译并运行实际生产helper、queue、同步、target、AccessGate和bridge模块，真实PM bookmark，平台边界受控；不是实际App系统选择器或DOM。该23组没有运行App取消实现，因此能够通过而遗漏本次P1。第三组补上实际App函数路径并复现阻断；具体命令、执行身份及source hashes见 [identity.json](../../verification/app-002-attachment-submit-independent-01/identity.json)。首两组终端完整输出在本审查tool transcript中；本目录JSON是执行记录，不伪装为另一次重跑stdout。作者已有access/native-toolbar/editor检查此次只读报告，没有冒称独立复跑。

[protected-files.json](../../verification/app-002-attachment-submit-independent-01/protected-files.json) 从Git冻结blob独立重算15个完整文件，与基线同字节：AccessGate/document-equality/secure-id、Editor/schema、RecordingPanel/Session、Rust命令/Session/Store/journal/tests、共享CSS和依赖。App全局nativeAssert、录音旧capture/父回调、旧storeAttachment的未改范围由冻结diff与源码核对；不把App/bridge全文件列为未修改。saveDoc与可信同步确实被本候选修改，不能据录音组件字节相同推导录音运行不受影响。

审查仅短暂创建指向主现有依赖的node_modules link，无下载，已移除并向作者释放worktree。没有Rust编译/target、应用构建、GUI、设备、真实数据或主Git操作，未自行修产品。作者在收到P1后已暂停其他工作、回原worktree串行修复；其新修改不属于本报告607950a。

## 后续门槛

先提交修复后的精确新候选与更新证据，独立复跑保全的失败（必须改变断言为身份保留/真正终态核定），同时保留晚store响应被拒、在途invoke、取消deferred、已有local节点/ACK等边界。源码审查通过后再统一新包验证Mac/Android真实图片/PDF系统选择、受管字节、完整正文/保存ACK、移开来源后的冷启与预览；真实取消、目标失效、插入/保存失败和ACK后刷新失败分别记账。旧56d7失败与孤儿不能升级为成功，iOS、录音音轨、IME、像素均不由本报告验收。
