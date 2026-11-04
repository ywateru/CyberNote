# 保存后录音日期：最小调用链与元数据准备审计

2026-11-04，只读准备分析。精确主线对象 **`d9194971f69d5b434662fa164b6b8640d31c0b2c`**；下列行号/hash均来自该对象 `git show/git grep`，不读取标签作者工作树，不修改产品、契约或独审证据。未操作GUI/ADB、构建、测试、依赖或提交。建议不等于已批准契约或已实现功能。

结论：不能从现有旧附件恢复真实录制日期。新增日期应只从**本次应用录音首次成功开始**的明确事件产生，独立于File与文件系统mtime，随同一目标/operation/最终File一起冻结。未带可信来源的历史附件和外部导入音频保持unknown，不以笔记创建/修改时间、保存时间或导入时间补齐。现有持久operation已提供保存失败后的身份保全接缝，需要把新元数据纳入它的同一份身份，而不是另写一个日期表或文档属性。

## 1. 当前真实调用链

```text
App openRecording → 固定原目标/operationId的RecordingTicket
  → RecordingPanel → RecordingSession.start → getUserMedia
  → recorder.start(250)成功返回 → onRecording → 活动计时开始
  → pause / resume（累计活动时长，不产生新录音身份）
  → paused完成 → stop → 最后data/onstop → Blob → recordingFile(blob)
  → onDone(File) → App submitRecording(ticket, File)
  → 同一batch.files / AttachmentSubmission(operationId, noteId, target, File)
  → bridge storeAttachmentOperation → Tauri真实window → Session owner/访问检查
  → Store preparing记录 → 文件 → attachments元数据+stored同事务
  → 原目标插入attachment节点 → 正文ACK → refresh
  → 重开/冷启 MediaView → readAttachment(id) → AudioPlayer
```

| 接缝（冻结对象文件:行） | 实际事实 | 日期必须接通的位置 |
| --- | --- | --- |
| `src/App.tsx:28–42/2107–2115` | PickerBatch含recording票据；RecordingTicket仅file/running等；打开面板前已捕获原目标和operationId | 录音来源可由这个专用票据表达，不能以通用File的MIME或名字识别“本次录音” |
| `src/recording-session.ts:151–169/211–229` | 权限获取后建recorder，onstop完整收尾再回Blob；`recorder.start(250)`成功后调用onRecording；目前回调无时间 | 最接近现有真实“开始”的接缝是onRecording；它仍是API接受开始后的应用观察，不是设备首个有效采样的精确时刻 |
| `src/RecordingPanel.tsx:83–88/217–248` | createdAt是面板mount时格式化的时:分字符串；onRecording才开始clock | 面板显示的createdAt既无完整日期也不是录制开始，不能直接持久化为recordedAt |
| `src/recording-clock.ts:1–19` | performance.now累加活动区间；暂停不累计，继续接续 | 活动时长和UTC墙钟日期是两类数据；不能用performance.now当Unix日期，也不能用保存时间减活动时长反推开始（暂停/权限等待会失真） |
| `src/RecordingPanel.tsx:29–48/226–236/268–282` | 暂停完成调用stop；onStopped后才new File，options只有type；finalFile保留，retry再传同一个File | 目前没有录制开始时间进入File；即使读取lastModified也没有已建立的开始来源。新日期应跟随一个明确完成结果，不在每次submit中Date.now重算 |
| `src/RecordingPanel.tsx:117–130` | onDone失败进入retry，保留finalFile与试听数据 | 日期来源对象/值须与finalFile共同保留；失败不能创建新时间、新File或新operation |
| `src/App.tsx:2063–2097/4170–4174` | ticket.file用引用相等拒绝换File；原operation插入后先重试正文ACK；ACK成功而refresh失败另报 | 可把完成结果扩为 `{file, captureMetadata}`，或给ticket增加只写一次的metadata；不要放宽既有file/target/ACK相等要求 |
| `src/App.tsx:1584–1655` | 通用submitAttachmentBatch既处理录音也处理外部文件；native走journal，preview走旧store；文档节点仅id/name/kind | 只给batch.recording的那一项传明确capture来源；通用文件默认无时间。日期是附件事实，不必加入ProseMirror attachment attrs或正文schema |
| `src/attachment-submission.ts:43–58/89–106/135–180` | 同File/operation跨重试；失败响应后先query权威结果；有attachment后不再store；插入/ACK/refresh分开 | 元数据在submission构造时冻结；accept除id一致外需保证已确认日期不漂移，不能从晚响应回写新日期或把known降unknown |
| `src/bridge.ts:325–349` | 序列化operationId/note/name/MIME/data/expected，未传lastModified或recordedAt | 显式增加capture元数据/凭据输入，仍在FileReader前固定access stamp；不能在此给所有audio File自动读lastModified |
| `src-tauri/src/lib.rs:211–246` / `session.rs:127–160` | 真实window注入owner(session/window/incarnation)，实时sensitive检查后转Store | 来源/时间的权威边界必须在此明确，不能新增一个客户端自报owner、绕过expected或访问屏障 |
| `src-tauri/src/store/attachment_operations.rs:153–268` | 已有operation比较名字/MIME/大小/完整字节；新Attachment先写preparing日记，再文件、元数据/stored事务；response直接序列化该Attachment | 新字段进入同一Attachment快照和重复请求相等检查；不能另一次UPDATE日期，让日记和公开metadata产生不同身份 |
| `src-tauri/src/store.rs:669–736` | 旧store直接生成附件；read_attachment只返回data/mime/name | 旧store保持无来源→None；read路径需要返回可选日期，依旧经真实归属权限检查。不能在read时生成日期 |
| `src/Editor.tsx:29–75` | MediaView只接read返回的data生成src；AudioPlayer只得src/name | 从同一次受权read接收日期并传给播放器，旧ID切换/卸载清状态；未读到日期时不能沿用上个附件日期。避免另建明文全局日期缓存 |

## 2. recordedAt最小建议与时间含义

建议公开附件增加可选 `recordedAt: number`（UTC Unix毫秒；Rust为受校验Option整数）。缺失代表unknown，序列化None建议省略；不增加“保存时间充当录制时间”的fallback。不存预格式化“今天10:26”，显示端按设备本地时区格式化；录屏只证明有日期行，精确时区、午夜/跨时区显示、旧音频unknown行外观仍需另定。

新字段可直接进入attachments.body与operation.attachment现有JSON，无需新增公开SQL列、索引或修改媒体字节。Rust建议 `#[serde(default, skip_serializing_if="Option::is_none")]`，TS可选字段；旧None对象不主动UPDATE、不改mtime、不对原附件回填日期。非法小数/负值/超出声明日历范围/非audio上的recordedAt拒绝；范围为可表示的真实时间域，**不要按导入时now拒绝所有未来值**，设备时钟误差/归档环境可能不同。范围及null接受策略须落契约，不静默把非法值改成None。

| 时刻 | 是否作为recordedAt | 理由 |
| --- | --- | --- |
| 打开面板 / 打开权限框 | 否 | 用户可能等待很久、取消或拒绝，尚无录制 |
| 首次recorder.start成功、onRecording | 建议的应用开始观察点，固定一次 | 有真实录制API路径，最小改动可绑定现有票据；不声称首个采样的精确物理时刻 |
| 暂停 / 继续 | 不重置 | 同一段录音；继续不是新文件的首次开始 |
| 完成 / stop / File构造 | 否 | 收尾可能晚于开始很久，暂停时长不在活动计时内 |
| 文件落盘 / 正文ACK / refresh / 重试 | 否 | 是不同提交阶段；失败重试不得改变录制身份 |
| 导入旧备份 | 有旧合法值则保全；无则unknown | 不以本次导入时间重新定年/月/日 |
| 从文件选择器导入音频 | 默认unknown | 目前没有已验证的原始录制时间来源；音频MIME、文件名、File.lastModified、容器或文件系统日期都不是本任务已建立的来源 |

### File.lastModified能否复用

当前 `recordingFile`在完成收尾后构造File，未显式传lastModified，且之后bridge完全不读取它，因此**当前字段没有被绑定到录制开始的源码证据**。不能把“同一File能跨重试保留”误认为其时间就是开始。

技术上可在新录音File构造时显式给lastModified赋已捕获的开始毫秒，作为内部载体；但这既没有增加来源可信度，也很容易被通用附件入口误用：外部File、脚本new File和平台选择器都有同名属性。建议不用它充当唯一元数据协议，直接传有类型完成结果/票据。即使为了文件导出附带设置lastModified，后端仍只认显式recording来源，禁止 `file.type.startsWith("audio/") ? file.lastModified : ...`。mtime、复制时间、原Note时间均不作为回填途径。

### “不可伪造旧日期”的边界需要明确

最小**工程防误填**方案是onRecording读取一次墙钟→专用结果/RecordingTicket→仅recording batch传入→Rust校验且冻结，不接受通用文件自动提升。这能保证现有应用路径不会伪造旧日期，但客户端自报数字及可编辑本地归档不是真实性证明；不能宣称防恶意renderer或证明外部文件的真实历史。

若要求IPC也不允许renderer提交任意旧日期，建议增加一个窄的**Rust开始印记**接口：输入只有原operationId/note/expected，真实window照旧注入，不接客户端时间；Session首次收到此录音开始通知时用Rust now生成记录并绑定真实owner+operation+note，重复通知返回同值。完成提交只引用此印记，由Session取时间后传Store；通用store不接任意recordedAt。这样“开始日期”准确含义是**后端首次观察到开始通知的设备墙钟**，不是硬件采样时刻；IPC延迟/系统时钟错误仍存在。此接口也不能证明恶意renderer实际开过麦克风，不能把“后端盖章”写成媒体真实性鉴定。

该较强方案的最小生命周期要求：在首次onRecording发起同一请求；响应丢失重试同operation只取原印记，不重新now；暂停/继续不再发新开始；印记pending时完成须等待确定结果；如果第一次通知根本未到后端，之后的晚请求不能冒称原先时刻，应明确unknown/失败保留，不能静默生成伪早日期。Session印记数量有界，取消/目标失效/真实窗口销毁清理；存储后日期以持久operation为准。它增加调用链和失败面，应由root先选定实际可信度要求，不能在纯外观修复中暗加。要求精确原始采集时间或可鉴真归档则还需更大采集/签名设计，超出最小日期字段。

## 3. operation、旧store与归档必须一致

| 边界 | 同时变更建议 / 不变量 |
| --- | --- |
| 初次store | 同一Attachment含recordedAt后再写preparing；文件和attachments正文仍沿现有顺序及事务，禁止“先成功附件后补日期” |
| 重复store | 在原display/MIME/size/full-bytes比较之外比较可选日期/来源；known↔None或值变化视为operation内容冲突，不能更新旧操作。若采用Rust印记，先由Session解析原值，再比较Store；不要在Store每次调用now |
| query/cancel/recovery | response返回原operation.attachment。`operation_reference:102–117`以派生Attachment的完整Eq比较日记与公开元数据；新增字段必须两处一起写，否则会产生managed_identity_changed/deferred，不能为规避此问题放宽比较。旧两处均None应继续相等 |
| AttachmentSubmission | query恢复已有元数据后不使用当前File时间覆盖；正文已ACK而refresh失败只重试refresh，不发新附件/新日期。元数据失败与音频/正文保存成功分开显示，不误称整体成功 |
| 旧store_attachment | 新签名若保留无capture来源，固定None，不从now/mtime推断；当前native录音走operation，preview才会走旧store，不能为省一次桥接让正式录音退回无journal旧入口 |
| SQLite旧数据 | serde缺省None，既有行与旧operation日记无须整库回写。只为新附件写新字段；旧孤儿清理边界保持，不扫描旧音频猜日期 |
| 归档校验 | `archive.rs:258–284`在真实附件kind/MIME校验旁验证可选时间；新字段进入typed Attachment，不放宽未知值。新程序读旧归档缺省None，旧值不补；不对归档声明的来源真实性作超过文件校验的承诺 |
| 归档复制/碰撞 | `archive.rs:447–450`只重映射附件id/noteId/relativePath，recordedAt作为实例原元数据原值保全；两次导入不改为两次导入时间。`archive.rs:629`提交同一序列化Attachment，媒体字节不动 |
| 归档版本 / 旧程序 | 当前归档version1，Rust Attachment没有deny_unknown_fields。若仍导出version1+新字段，旧程序可读但可能在再导出时丢recordedAt；不能同时承诺旧程序往返保全。可把新元数据作为明确允许降级丢失的可选信息，或提升归档版本使旧包拒绝；须先选兼容策略，不借本字段自动重写其他格式 |
| read_attachment→MediaView | 返回可选recordedAt，不从节点attrs传客户端日期；同一sensitive归属检查后返回，晚到响应、ID变化及错误清除显示。未知时间不渲染伪日期；具体unknown占位外观不是原视频已证状态 |
| schema与文档ACK | 日期不写attachment node attrs；无必要改共享文档schema、文本投影或正文引用判定。日期与ID同后端元数据，不应让Renderer不同日期表示破坏现有正文ACK等式 |

## 4. 隐私、同时改动的消费者与未来审查点

日期是新增附件元数据，能透露活动时间。沿用现有附件访问边界：lib.rs read_attachment先查真实note归属再Session.sensitive；不为日期增加无权限查询接口、日志、明文派生索引或全局缓存。已有含附件笔记不支持锁定的限制保持；本任务不顺带声称附件加密。归档本就包含附件元数据，新增日期属于新增可见信息，须在契约中说明。prepare/撤权须清理日期和src对应的可见状态，不能只清音频URL留下上个附件的日期。

最小实现必须一起核对：RecordingSession开始观察→Panel完成结果与retry→App票据/batch→Submission冻结→bridge IPC输入→lib/Session来源授权→Store两个Attachment构造点及operation一致性→TS/Rust Attachment类型→read响应→MediaView/AudioPlayer日期显示→归档校验/复制/版本。若采用Rust印记，还需其幂等查询及取消/窗口/访问生命周期；不能把此新增协议埋在UI任务中。

未来应审查的有界路径（本次未执行）：

1. 面板等待、权限等待后才开始；跨暂停/继续、跨日、暂停很久再完成，日期始终来自第一次已声明的开始点，活动时长独立。
2. 第一次store响应丢失、文件已写而正文ACK失败、refresh失败三类重试，同一attachment/operation/日期；修改日期或来源的重复请求拒绝，不产生第二附件。
3. 旧附件/旧operation/旧归档/外部导入音频均None，原行/字节不变；即使File.lastModified恰好等于今天或历史日期也不自动填入。
4. 新日期归档导入两次，ID正确映射而原日期不变；非法时间拒绝且旧工作区/资源保持；明确所选旧包往返兼容范围。
5. 两附件切换、晚read响应、访问prepare/撤权、取消和窗口销毁不串日期/目标；未知日期和读失败不继承前一个known值。
6. 若使用印记，丢开始响应可同ID恢复；未到达后端的开始不能晚补成过去；重复通知不刷新日期，越窗口/旧session/失效note拒绝。记录时钟精度与原版显示语义仍unknown。

原版录屏只确认保存卡片有日期行，尚未证明该行究竟采用录制开始、结束或其他实例时间。因此本建议“首次开始”是可解释的工程选择，不能写成原版精确日期语义。详见 `mobile-saved-audio-card-20261104-01/README.md`。

## 5. 冻结源码SHA-256

以下均为读取对象字节的SHA-256，无源码执行：

| 文件 | SHA-256 |
| --- | --- |
| src/recording-session.ts | `59b4520d7ba6b90a305e1ebd61e0fedba800df031ac55f2eb6f5e6fee51472d8` |
| src/recording-clock.ts | `4982340b02af9210bdf0e1055c677aac94fc0e4bb191ed38ce1f0c88a5bfb658` |
| src/RecordingPanel.tsx | `076ae3879234915a0aa1ddf604338a2b254b50ff9bd7885f5df968ef93ffd46c` |
| src/App.tsx | `13eb73ceb9f8c2c8a55d67367f9633d470e9e301f8c75b52ee698f8884091057` |
| src/attachment-submission.ts | `68a412cd73f2303e7c4251933fc79c123a2655472296a6999fba5687107857f3` |
| src/bridge.ts | `693de27d6780e6b1059732df66c0bf9cf37ca438b9176765565593c3d290c9f1` |
| src/types.ts | `108c97dcc8879b36830226631c8c590d2be98ba33b148c11699adf694092bcd6` |
| src/Editor.tsx | `49ee50032becb30ab92e5c93d7f9b3ce8cc6a738260bcb2d5a03cd38c44f7497` |
| src-tauri/src/lib.rs | `3ac6550f01e2cf73415031560e6318f0412e32216fcd3c62dfaac81d508ab9be` |
| src-tauri/src/session.rs | `85b588403147aaeb98e68cc8060edb057fa979dcdf9775cd872765aef7bc4ded` |
| src-tauri/src/store.rs | `651b6f278644b10748f7f81e96cd94a92a1ca0b7f13f4989fd2aa40872f06259` |
| src-tauri/src/store/attachment_operations.rs | `a00304fb939207938d02ae71e0d436191200430a71db38c872bb1adf5b8f8e00` |
| src-tauri/src/store/archive.rs | `960ad7d72de6ba85214d773876b00778384087a605d847511bee9685a55f1cd1` |
| src-tauri/src/store/archive/document.rs | `ec1f8c79f56d0d871a5bd57be7307833b13b49ef604555cace4ebc993d347e3b` |
