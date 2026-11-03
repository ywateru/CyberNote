# APP002 系统附件提交 · 前端源码候选 01

日期：2026-11-04。隔离工作树 `/private/tmp/apple-notes-attachment-submit-01`，分支 `task/app-002-attachment-submit`，基线 `72c93b1b34bcfd3a95c331d1da93e187ff5fda14`。**候选已完成开发侧源码检查，等待独立审查；没有构建或设备、系统文件选择器、冷启、像素验收。** 原有 56d7 附件失败和孤儿证据保持原结论。

## 实际接线

普通文件、照片/视频、相机/扫描照片、扫描说明页的拍摄按钮和 Mac 原生顶部文件/照片入口都使用 `capturePickerTarget → openAttachmentPicker → fileSelected → submitAttachmentBatch`。打开面板前生成首个 operationId，记录原 note、scope（另含移动 page）、实际 Editor 和 owner、原 SelectionBookmark、文档/外部版本以及后端 session/global epoch/noteEpoch。选择多文件后、第一次 IPC 前固定其余 operationId。文件与相机输入各自保存目标；没有目标的返回明确失败，失效目标不回落当前笔记。普通附加文件会复位先前照片入口留下的 accept 过滤。

文件选择取消或空 files 不发存储请求。支持 `cancel` 事件的宿主会清理该输入的未发起上下文；旧宿主没有此事件时，未发起上下文不产生文件副作用，下一次显式打开会作废同输入的旧目标。具体宿主事件时序仍待真实选择器检查。扫描说明页的例外只允许该页的遮层，其他 loading、锁定、访问屏障、Editor 或移动页面条件继续生效。

```text
显式原目标 + operationId
    → flush（失败保持待保存内容）
    → 当前可信同步 success/sequence/snapshot
    → 原授权身份/目标/Editor/owner/全文/版本/书签复核
    → store 同 operationId
       响应被拒绝 → 重新可信复核 → query 同 operationId
    → 再次可信复核 → 真实 insertContent boolean / throw / 当前节点检查
    → 实际 saveNote 队列 ACK，且返回正文包含本附件节点
    → refresh → 释放已完成批次
```

`TrustedSynchronization` 将成功与失败显式返回，只有当前序号的成功 snapshot 可作为目标复核依据；重叠请求仍合并，但旧 load 结果被丢弃并重新读取。失败保持内容遮挡。`rebindAttachmentTarget` 只允许 renderer generation 改变；后端身份、note/scope/Editor/owner、文档与外部版本不能改变。原 Editor JSON 与原存储 JSON 分别逐字段完整比较，不经 schema 归一化；这样默认字段不会掩盖真实变化，也不会把未变的原始导入文档误判为变化。真实 PM bookmark 必须能在原 Editor 文档中 resolve。

`saveDoc` 使用实际生产 `enqueueSave` 返回 `{saved:true}` 或 `{saved:false,error}`；队列排空不等于保存成功。`saveNote` 真正成功后，才按返回的 `n.document` 向已插入操作确认 ACK；matching note、attachment node 类型、id 和 kind 都必须一致。原有 revision/intent/冲突保留规则继续生效。自己的待保存正文同步写入 `wsRef`，防止快速 ACK 早于 React render 时被 hydrate 误判为外部修改。

`AttachmentSubmission` 分别保存 storageAttempted、attachment、inserted、documentAck 和 refreshed。实际插入命令返回 false 或抛错都会失败；即便抛错发生在 dispatch 后，也检查真实本地 JSON 并保留 inserted，避免重试重复插入。保存失败保留原文件、身份及本地节点；错误栏“重试”先重试实际 pending 保存，再恢复同批次。正文 ACK 后，失败重试仅刷新列表，光标或后续正文变化不能让它回到插入阶段。

只有未插入的批次可点“取消未插入的附件”。前端先完成原目标校验，拒绝有本地节点的操作，再同步封住批次及操作入场，之后才等待 Rust 的窄取消结果；晚存储结果不能在后端安全取消后继续插入。Rust 返回 deferred、committed 或查询/取消响应失效时仍保留明确待恢复状态，不能当成功删除。取消不接受任意附件路径；Rust 原 owner、持久正文、SaveIntents 和访问屏障检查保持不变。

`clearSensitive` 作废匹配笔记的未发起目标和在途操作；原 Editor 被销毁后不能继续写入。已成功批次才释放文件/Editor 引用。浏览器演示继续用原 `storeAttachment`，共享原目标、insert 和 ACK 阶段，但走显式 preview storage 分支，不伪造 Rust journal 查询或持久提交结果。

## 边界与未改内容

`boundary-integrity.json` 核对 19 个原文件/片段：全局 `nativeAssert`、`AccessGate`、原 `storeAttachment`、RecordingPanel/RecordingSession/录音父回调/录音旧目标捕获、Editor/schema、样式、Rust 命令/Session/Store/journal及其测试、依赖文件都与基线逐字节相同。共享 `saveDoc` 和同步接线确实改变，不能以录音组件字节相同推导录音运行行为已验收。本任务没有把录音父保存改接新 journal，没有修改绘画、归档、Rust 或依赖。

## 已执行检查

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `pnpm typecheck` | exit 0 | `typecheck-result.json` |
| `node scripts/check-attachment-submission.mjs` | 23 组通过 | `attachment-submission-result.json` |
| `pnpm test:access` | 16 组通过 | `access-boundary-result.json` |
| `pnpm test:native-toolbar` | 12 组通过 | `native-toolbar-result.json` |
| `pnpm test:editor` | 65 schema 文档及真实 PM table/selection/history 检查通过 | `editor-actions-result.json` |
| `git diff --check` | exit 0 | `diffcheck-result.json` |

新脚本直接编译执行实际生产 AttachmentSubmission、SaveQueue、TrustedSynchronization、原目标 guard、document-equality、AccessGate 和完整 bridge 模块。仅平台 invoke、FileReader、存储/编辑器命令端口受控；覆盖丢失响应后同身份 query、query 被拒不能当未落盘、明确 notPersisted 才重试、真实目标变化、晚结果失效、插入 false/throw、dispatch 后抛错的本地节点保留、保存失败、实际异步队列 ACK、错误节点不能 ACK、ACK 后刷新失败、并发重试合并、deferred/aborted、身份不匹配、浏览器边界、同步失败/合并/过期，以及 bridge 在读取文件前捕获 token、既有 gate 拒绝旧响应、当前 query 恢复身份与取消参数。实际 PM bookmark/state 检查使用已安装 ProseMirror。插入端口的受控 JSON 更新不冒称真实 Tiptap 命令或 DOM 插入验收。

开发中首次 typecheck 发现 React input 不支持 `onCancel` 类型，改为标准 DOM `cancel` listener 后通过；增加原存储文档字段时，旧测试 fixture 未同步而失败，补齐 fixture 和两种表示各自完整比较场景后通过。没有产品测试后门或依赖升级。

## 待独立检查与设备实证

当前只证明源码与受控平台边界。需要独立审查实际 App 目标 capture/复核/真实命令/ACK/取消接线，再构建统一 Mac 与 Android 包。真实系统 Open 选择图片/PDF，受管字节、全文节点、revision、保存 ACK、来源移开后的冷启和实际预览仍待新包验证；还要真实取消、目标失效、受控插入/保存失败重试及一个 ACK 后刷新失败。原系统面板的精确失败 throw 点仍须按新运行证据核定，不能把 focus/generation 推断写成已经实测的最终归因。

录音、声音可听、完整 IME/纸张矩阵、iOS 与像素一致性不由本候选测试证明。未启动应用、未使用 GUI/REA/Android/共享 Rust target，也没有应用包构建。

`source-manifest.json` 冻结 7 个实际候选源码，aggregate `6b74daab6c15b3ef642fd0651193c2960a9ceb4d16e253de7d6d2f6d0fdc3757`。聚合方法为按路径排序的 `path + NUL + sha256 + LF` 的 UTF-8 SHA256。本目录的文件清单另见 `manifest.json`。
