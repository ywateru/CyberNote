# 已保存录音重新命名72：原版补证与持久化准备

2026-11-06（Asia/Shanghai）。结论为 **SOURCE-READY / ORIGINAL-OPEN**：本轮已核对原版二进制、运行实例及窗口，完成克隆真实读写链分析；原版辅助功能访问被系统拒绝，因此没有打开重新命名对话框、没有输入名称、没有改动原版笔记。原版名称编辑、确认/取消、扩展名、Undo 和重新打开后的行为仍待真实观察。不能将以下工程候选写成原版已证交互。

## 原版实际结果与证据

任务限定目标是既有合成笔记 `QA-TYPE-20261104-01` 内任务62观察的5秒“新录音”。本轮只重新核对进程和窗口；没有拿旧AX路径操作。

| 问题 | 本轮实际证据 | 结论 |
|---|---|---|
| 本机原版身份 | `/System/Applications/Notes.app/Contents/MacOS/Notes`，SHA-256 `9e20c23a979367362c50edf8fb28bb1988be7e7384254cc3dce38a4a8373df02` | 与研究目标绑定 |
| 运行实例 | 重新 `pgrep -x Notes` 为40579，`ps`保存启动时间和路径 | 该时点实例存在，不沿用历史PID |
| 窗口 | CGWindow列表中40579的可见主窗口83173，标题“Notes Clone UI 对照”，bounds x53/y29/w1387/h903 | 只是窗口身份，不证明目标笔记选中 |
| REA原生AX | 正常open后，`observe_native_ui({pid:40579,window_id:83173,accessibility:true,screenshot:false,max_nodes:220})` | `capability_unavailable / unsupported_provider / accessibility-denied` |
| 系统精确AX枚举 | `System Events → process Notes → every window` | exit1，osascript不允许辅助访问，-1728 |
| 目标笔记/卡片 | 本轮没有获得可读AX，未能重新确认目标卡片 | 不操作任何笔记 |
| 重新命名/取消/确认/恢复 | 均未执行 | 不能声称通过或“已恢复原名”；本轮从未更名 |
| 截图 | 未请求本轮截图，REA明确请求screenshot:false | 没有像素证据；AX失败不能当截图失败或成功 |

完整工具响应保存于[证据目录](evidence/)，没有裁掉错误：

- [本机时间、HEAD、二进制、进程、窗口、AX拒绝](evidence/00-local-identity.json)。
- [REA起始session](evidence/00-session-before.json)：实际closed；故本轮正常open，没有假定父任务的会话仍可用。
- [open原始响应](evidence/01-open.json)和[observe拒绝原始响应](evidence/02-original-observe-denied.json)。
- [导出响应](evidence/03-export.json)、[bundle](evidence/rea-evidence.json)、[close响应](evidence/04-close.json)。bundle准确为0个Evidence record：拒绝发生在生成观察证据之前；原始失败另行完整保存，不能把空bundle当运行证据。

任务62的[既有菜单观察](../saved-audio-menu62/README.md)仍只证明菜单存在“重新命名…”和selector `renameAttachment:`。本轮没有扩展其行为覆盖。未启动/停止原版，未播放、读取、复制或导出音频，未调用麦克风，未读取Notes数据库，未操作Android，未修改权限或认证设置。REA已close。

## 克隆当前真实名称与媒体链

以下为当前源码静态事实，不是运行验收。证据基线是本分支研究提交之前的源HEAD，见00-local-identity。产品代码在本研究中没有改动。

1. `src/Editor.tsx:33` 的MediaView取得node.attrs的id/name/kind，随后调用 `useAttachmentMedia(id,kind)`。音频的实际props为 `name={media?.name ?? name}`（约54行）。**真实附件响应的name优先于正文node.attrs.name**。
2. `src/use-attachment-media.ts:10` 以id/kind/version管理加载生命周期，`readAttachment(id)`成功后缓存name和source。相同id/kind下改node.attrs.name不会触发重新加载；即使强制retry，后端原名仍会重新覆盖。失败时只展示错误，有限重试MetadataStale；禁止把被拒绝的字节发成URL。
3. `src/bridge.ts:574` 从已应用workspace的attachmentOwners取noteId，生成AccessGate stamp和expected，调用 `read_attachment`，由accept同时校验授权与metadata后才能发布。不得为了改名绕过此读取门。
4. `src-tauri/src/lib.rs:291` 从真实attachment_note确定归属，调用Session.sensitive，再tagged Store.read_attachment结果。Session.sensitive（`session.rs:146`）检查token、转换屏障、锁定/删除授权。`store.rs:818` 读取真实Attachment记录与本地字节，返回 `name=a.display_name`、mime、recordedAt及data。
5. `store.rs:117` Attachment以完整 `PartialEq, Eq` 比较，display_name与id/note_id/kind/relative_path/mime/size/recorded_at同属一个记录。`recording-metadata.ts`只是日期校验/格式，不保存标题。
6. `Editor.tsx:173` 的标题渲染对name使用 `replace(/\.[^.]+$/, "")` 去最后一个点之后的部分。这只适合作文件名fallback；若新标题是“会议.纪要”，照用该逻辑会误显示为“会议”。命名文本与物理文件名必须分别定义，不能凭现有regex假设原版扩展名规则。
7. 保存卡目前只有播放/暂停、展开、定位等入口；`src/debug/catalog.ts`、`protocol.ts`无已保存录音重命名语义命令。新增按钮还必须接同一真实动作，不能调试入口另造假状态。

## 不可直接修改Attachment.display_name的原因

`src-tauri/src/store/attachment_operations.rs:102` 的operation_reference把journal内的完整Attachment与live attachments内同id记录比较；任何字段不同，返回 `Uncertain("managed_identity_changed")`。`query_attachment_operation:283` 对此返回deferred，无法获得正常committed确认。取消、恢复及purge也复用身份校验或完整记录比较。

journal store重放（约193行）还验证display_name/mime/size/recorded_at及原字节相等。直接改live display_name而不处理journal，会破坏这些不变量；直接改journal则改变了原操作的不可变输入身份，不能作为简化修复。全局忽略display_name的Eq、伪造committed、清journal记录、为重命名复制一次音频，都不属于正确接线。

现有不可变附件版本用于录音checkpoint及Undo历史，本轮不能借重命名清理旧版本。`recording-replacement.ts` 更新同逻辑卡时保留node.attrs并替换id/name/kind，独立标题若存在须明确能随合法新revision保留；rename不能把正在录制中的临时卡当成已保存卡。

## 两种持久模型比较

| 方案 | 真实持久链与成本 | 对原版一致性的未知 |
|---|---|---|
| A. 附件全局元数据名 | 新建独立可变展示元数据层或显式变更协议；按note归属授权，CAS/版本，commit receipt/metadata event，多窗口刷新；加载缓存需单独失效，不能重读音频掩盖名称状态；必须与不可变journal身份分离并定义归档/恢复 | 是否原版所有引用共享名称、导出文件名也变化、撤销属于何处均未知。直接更新现有display_name不成立 |
| B. 正文录音展示标题 | 正文attachment节点新增可选 `audioTitle`（暂定名），经真实PM transaction → onUpdate → saveDoc → saveNote/revision持久；AudioPlayer优先用已保存audioTitle作完整显示，媒体仍由受门禁的readAttachment提供；原metadata文件名、bytes、journal完全不变 | 可自然继承正文Undo、逐引用名称；这些是工程模型性质，原版逐引用/Undo语义未证，导出/共享也不能据此声称完成 |

**最小候选是B，但暂不能以它结束原版交互验收。** 现有attrs.name可被保存，却同时承担上传文件名fallback并被媒体名覆盖；简单改优先级会重新解释所有历史文档。本轮建议显式可选字段，使旧文档仍按原媒体名显示，避免隐式迁移；最终字段与菜单/弹窗交互合同待原版补证后决定。

### B若获行为证据支持，需要的完整接线

```text
已保存卡确定 owner note + attachment id + 原Editor + 原节点
   ↓ 正常菜单/对话框编辑草稿（取消不生成transaction）
提交时重新验证归属、编辑权限、未切换/未删除及当前节点
   ↓ 对最新节点做一次PM transaction，只修改audioTitle
Editor.onUpdate → editorSaveSnapshot → App.saveEditorDoc/saveDoc
   ↓ registerSaveIntent → 单note SaveQueue → revision CAS
bridge.action(mode save) → Rust saveNote → strict document validator
   ↓ 原note commit receipt/metadata → revision确认 → 合法hydrate
重开/多窗口/Undo/Redo仍由正文文档真实持久化
```

- `Editor.tsx:349` onUpdate传 `editorSaveSnapshot(e.getJSON())`；snapshot只处理非法IME标签mark，不主动删除其他合法attrs。不得用React localState替代正文，或修改ws快照绕过PM历史。
- `App.tsx:1138` saveDoc登记saveIntent、保留pendingDocs、排队、传expected revision，要求真实receipt revision后confirmed；失败保留pending及错误。不能在点击确认时就报告持久保存成功。
- `bridge.ts:210`附近的mutation delivery保留已commit receipt，即使后续响应/maintenance失败；save响应只作revision ACK，不发布其旧document。新标题必须遵守这条规则。
- `App.tsx:889` hydrate先检查metadataGate.canPublish，授权变化清敏感状态；pending覆盖与externalVersions不允许因标题动作重建Editor、损坏IME/Undo/其他正文。跨窗口旧保存仍须CAS拒绝，不能自动覆盖新正文。
- `session/metadata.rs` apply_store从真实Store capture_commit推进metadata sequence和changes；observed/applied各有含义（`metadata-client.ts`），不能收到事件就假装workspace已应用。
- `store.rs:415` saveNote检查deleted、revision和validate_document，锁定时使用已授权key加密正文，更新revision并put_note。标题若放正文，可沿用正文加密、归档及访问边界。
- `src/editor-schema.ts:48` 的attachment attrs当前只有id/name/kind；Rust `archive/document.rs:114` 对新attrs默认只接受schema default，并非任意字符串。因此新增字段必须同步TipTap schema、Rust显式类型/长度/仅audio规则、`document-schema.json`与corpus；仅改前端会被真实Rust拒绝。
- `scripts/check-editor-schema.mjs:97` 对共享schema manifest做精确crosscheck，必须先审查属性政策再显式生成；不能为过测试放宽unknown attrs。
- `archive.rs`导入/导出经完整graph/document验证，附件display_name非空且≤4096 bytes；正文新字段要定义最大值、空/空白、换行、null与缺省政策及归档版本兼容。这里的工程边界不能冒称原版输入限制。
- 正文attrs新增会让旧应用拒绝新归档；不得宣称旧版完全兼容。应明确是否升级归档version、支持旧文档默认值和新version拒绝策略，并用真实export/import roundtrip验证。
- 目标必须绑定原卡片和原Editor，提交前重新找当前节点；在编辑草稿期间节点删除/换id/重复、锁定/删除、窗口销毁等都应拒绝并保留输入。不能回退到当前光标插卡或把名称写到另一笔记。
- 重命名不应换音频src/MediaSource、中断正在播放或触发readAttachment重读大字节；展示标题更新与播放控制器寿命要分开验证。
- 调试协议需要真实open/commit/cancel路径并保留严格参数校验，提供HTML dialog/input/卡片文本及state snapshot。用已有合成录音fixture，无需真实麦克风/Android设备。

## 下一步最小观察和验证

原版需要在AX恢复可用后只对已确认合成卡做一次：上下文菜单→重新命名→记录标题/输入值/选区/按钮/Return及Escape→取消→再次打开→暂改QA名称→关闭重开核对→恢复“新录音”→再打开确认恢复。Undo要单独观察菜单可用性及实际结果，不能猜测等价于正文编辑；每次操作前重新读取目标，不复用旧路径。原版追加/导出不在本任务，仍不做。

若原版依旧不可观察，适合继续其他已有充分证据的功能；本报告只让后续开发避免错误的metadata/journal改法。不能用自选弹窗和工程标题模型填补原版未知行为，再将其称为完全一致。

后续实现测试至少应覆盖：真实保存与重开、一次Undo/Redo及真实ACK、同id显示更新且音频source不变、重复引用政策、带点/Unicode/空白/超长政策、取消零transaction、旧文档fallback、两窗口revision冲突、锁/删除/归属变化、录音checkpoint前后标题保留、operation query仍committed、media bytes/recordedAt不变、Rust归档roundtrip与非法attrs拒绝、生产调试入口排除。Mock/DOM通过仍不证明原版像素、真实Rust运行或硬件录音通过。

