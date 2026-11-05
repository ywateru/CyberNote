# 61：Mac录音Start授权链与下一项有限诊断

2026-11-05，Asia/Shanghai。只读源码快照为主线 `46e45e4f85c4c0d95720ea1e3e40ca5440aded03`。**现有证据足以把Mac16旧失败定位到AVFoundation原生授权预检阶段，但不足以定位“系统迟迟未回”的具体代码bug。可以直接推进的下一项是源码级、有界的分阶段诊断和伪环境验证；不以再次Start、用户重新授权、延长等待或重签作为下一步。** 本报告没有实施该诊断，也没有新建候选包。

本次只新增本文；未修改产品、既有证据或task60，未执行原生构建／测试、GUI、设备、音频、权限、签名或用户数据操作，未查询TCC或系统日志。Apple／Tauri行为仅核对官方公开文档，普通源码仓库分析未使用REA。Mac17当前可运行范围仍见root的 [有限运行记录](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/recording-visual5859-mac17-runtime/README.md)，不能把其未点击Start的会话当成已测授权。

## 调用链：宿主呈现、原生预检与WebKit媒体是连续的不同阶段

| 层 | 当前源码与行为 |
| --- | --- |
| App原owner | [App.openRecording](/Users/water/work/2026/Apple-Notes-Clone/src/App.tsx:3045) 固定保存目标并注册session／operation，创建独立录音child；打开或切换呈现本身不开始采集。 |
| 独立窗 | [RecordingWindow](/Users/water/work/2026/Apple-Notes-Clone/src/RecordingWindow.tsx:51) 验证context、接入notes-recording消息、挂载原RecordingPanel；独立窗按钮直接派发Panel动作。 |
| 右栏按钮 | [RecordingDock](/Users/water/work/2026/Apple-Notes-Clone/src/RecordingDock.tsx:38) 只展示投影，动作经 [RecordingOwner.action](/Users/water/work/2026/Apple-Notes-Clone/src/recording-coordinator.ts:302) → [recordingSend](/Users/water/work/2026/Apple-Notes-Clone/src/recording-window-transport.ts:10) → Rust [route_message](/Users/water/work/2026/Apple-Notes-Clone/src-tauri/src/recording_window.rs:158) 认证真实caller和固定session／operation，转到child。child收到action后仍调用同一个Panel handle；右栏没有另建Session。 |
| Panel显式Start | [begin](/Users/water/work/2026/Apple-Notes-Clone/src/RecordingPanel.tsx:249) 只允许idle→requesting，创建一个RecordingSession；toggle在canToggle时进入primary/begin。仅onRecording后填写recordedAt并启动活动时钟，onError会dispose并进入error。 |
| Session第一阶段 | [start](/Users/water/work/2026/Apple-Notes-Clone/src/recording-session.ts:169) 先await environment.authorize。Mac Tauri门控动态载入 [authorizeNativeRecording](/Users/water/work/2026/Apple-Notes-Clone/src/native-recording-access.ts:5)，再调用guest [recordingAccess](/Users/water/work/2026/Apple-Notes-Clone/plugins/tauri-plugin-notes-ui/guest-js/index.ts:51) 的 `plugin:notes-ui|recording_access`。只有明确authorized才继续。 |
| IPC与实际窗口 | 插件核对注入Window与windowLabel、许可的main／note-*／精确recording-UUID，再到 [macos::recording_access](/Users/water/work/2026/Apple-Notes-Clone/plugins/tauri-plugin-notes-ui/src/macos.rs:105)。它在主线程取得真实NSWindow，经with_webview比对视图所属物理窗口，交给ObjC；成功后再次主线程核对实际Window，避免同标签替换。recording capability仅授予这一命令，见 [capability](/Users/water/work/2026/Apple-Notes-Clone/src-tauri/capabilities/macos-recording-access.json)。 |
| AV公开API | [NotesRecordingAccess.start](/Users/water/work/2026/Apple-Notes-Clone/plugins/tauri-plugin-notes-ui/macos/recording_access.m:98) 验证window/view生命周期；有pending则busy；没有pending时查询音频AVAuthorizationStatus，authorized立即返回，denied／restricted分别拒绝，只有NotDetermined安装pending并调用AVCaptureDevice requestAccess。系统completion先dispatch到main，再读公开status并核对granted和原窗口。 |
| Session第二阶段 | 只有authorize兑现且Session仍accepting，才调用 `getUserMedia({audio:true})`；得到流后登记每个轨道并建立MediaRecorder。`recorder.start(250)`成功后才触发onRecording；取消／超时后的迟到流逐轨停止，不复活旧Session。 |
| WK媒体决定 | [应用permission hook](/Users/water/work/2026/Apple-Notes-Clone/src-tauri/src/lib.rs:339) 接 [media_permission::response](/Users/water/work/2026/Apple-Notes-Clone/src-tauri/src/media_permission.rs:217)。该同步handler只检查真实Webview资源中的可信已完成入口页与Microphone／Camera类型，返回Allow或Deny；不查询AV、不等待UI、不把Allow当成系统授权成功。 |

上述native helper、Session、Rust桥、ObjC实现、媒体policy、Info.plist及recording capability，从Mac16固定源 `9167db94908ac635b026220e782878447c9e16a7` 到本次快照的git diff为空。58／59／60波形或样式调整不能作为授权修复。源码Info.plist有NSMicrophoneUsageDescription，旧Mac15准确包记录也证实说明存在；现有资料不支持先按“缺说明字符串”修改。

Apple将AVCaptureDevice requestAccess定义为应用的音视频采集授权请求，以completion Boolean返回选择，并要求回main更新UI，见[A1]；authorizationStatus是另一公开查询，见[A2]。WKUIDelegate方法则判断某个origin／frame的网页媒体访问，见[A3]。Tauri 2.12.5文档明确macOS permission hook经WKUIDelegate媒体请求接入，且已保存的Webview决定可能使新hook不触发，见[T1]。因此WK Allow、AV authorized、TCC内部authValue、设置页开关、实际音轨／录音开始不能相互代替；尤其本次旧AV预检未成功时，后续WK／getUserMedia路径没有由此自动获得已执行证据。锁文件为Tauri2.12.5、Wry0.57.1；本文只引用公开API契约，没有逆向其源码。

## 截止与无callback：已有保护，不是授权拒绝判断

| 边界 | 代码中的截止／交付 | 能说明什么 |
| --- | --- | --- |
| ObjC系统等待 | request发起前安排main queue上30秒计时；`finish:7 status:-1`至多交付一次 | 用户看到“系统麦克风授权等待超时；可取消后检查是否仍有系统提示。”可定位这个分支，不能判denied。主队列不获调度时30秒回调本身也可能延后。 |
| Rust第一等候 | blocking receiver最多35秒，超时为“麦克风授权桥接等待超时”；live=false会阻止还没执行的迟到主线程任务新发系统请求 | 能与原生code7文案区分，但当前无分阶段时间记录，不能由超时独自判是main dispatch还是native callback。 |
| Rust成功后窗口复核 | 再派发main并单独最多35秒 | 这是另一等候。不是整个native invoke总共35秒；极端情况下两个等待累计可超过JS授权45秒边界。没有现有记录证明本故障走过这个极端。 |
| Session authorize | 每阶段45秒，超时“系统麦克风授权等待超时，录音未开始。” | fail→dispose；授权迟到不进入getUserMedia。 |
| Session getStream | 另45秒，超时“麦克风准备超时，录音未开始；请检查系统提示后重试。” | 这是后续媒体准备阶段，不能与AV预检超时混写。 |
| busy | `pendingRecordingAccess`存在时code8，且该判断在再次查询公开status之前 | 支持进程内原生owner尚未清除；不能据此称系统仍在提示、公开status仍未决定，或已拒绝。 |

`finish`设置delivered并回一次Rust，不清pending、不释放仍可能被系统block引用的Rust context。关窗也只finish；系统block仍持有ObjC owner。真正completion的main处理会在已delivered时忽略旧结果并清pending；dealloc才释放context。异常路径也清自己的pending。这里没有调用系统取消请求的API，UI截止不会撤回已经发出的请求。

若真实callback一直不来，当前进程的pending会保留，后续Start都会busy；这是源码可确定的可用性边界，同时是现有单一请求／迟到context安全策略。不能为了消busy就在30秒时清pending或释放context，那会允许重入并破坏仍可能到来的callback所有权。52独审曾发现的微任务流泄漏和ARC异常释放问题已经修复并有受控验证，见 [52固定源码独审](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/mac-recording-access52-independent/review-final.md)；它只证明受控源码路径，不证明本机OS请求会怎样结算。

## 既有证据实际到哪里

| 准确旧事务／包 | 有限事实 | 不支持的推断 |
| --- | --- | --- |
| Mac15，33095.6 | 2026-11-05 10:44:51.58请求，10:47:48.483明确TCC RESULT／REPLY，约176.901秒；根AX已显示原生30秒超时，见 [54记录](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/runtime-readiness54/README.md) | 不知道AV completion是否／何时进入应用或main处理；不能复活旧Session，也不能把176.901秒当固定等待时长。 |
| Mac16，71272.6 | 12:11:05.280请求、12:11:05.287 PROMPTING；原快照至12:14:31未返回该事务RESULT／REPLY，见 [55快照](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/runtime-readiness55/README.md) | PROMPTING不证明提示可见；无结果日志不是拒绝或永久pending。 |
| 同Mac16重启后74528.6 | 12:22:10.241显式Start、12:22:10.246 PROMPTING；至12:23:05无结果。74528.2是独立startup preflight，不是Start成功，见 [重启补充](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/runtime-readiness55/reopened-state.md) | 不把系统内部authValue映射成实测AVAuthorizationStatus；旧进程内pending不会据此被描述为跨进程继承。 |
| 固定晚查区间12:23:05～13:11:04 | 只返回12:34:54.745的code requirement mismatch，两个已知msgID无RESULT／REPLY／cancel记录，见 [58有限晚查](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/runtime-readiness55/late-followup58/README.md) | 这是受谓词／保留日志／时间窗约束的缺失，不是当前Mac17授权结论。无msgID的mismatch不能强归到某个旧请求。 |
| Mac17 sealed | CDHash `9a7b3ca895811fda5cdf2ceca9b5a8ab881e8cf7`；root有限运行明确未点击Start，只验未采集呈现、编辑和保存卡播放 | 不能从它运行或播放已有音频推导当前AV许可或新采集。 |

Mac16日志比较的是旧 `0a258674ff1844f9fe57fc9d3619c5cd22fa7cad` 与Mac16 `469ea16128121596a2875236e9c69ef6ffa5d06b`；Mac17又是不同adhoc CDHash。已有封存记录证明这些实际磁盘签名身份不同，不能把同一个bundle ID或设置页同名开关视作同一designated requirement已获许可。**mismatch是事实，唯一根因仍未证实**：Mac15相似mismatch后实际有迟到结果，说明单一条件行不足以证明后续路径。当前不改签名、不请求重新授权；稳定签名／DeveloperID属于另一个需具体方案和验收的发行决策，不能以重签新hash循环冒充诊断。

现有证据中缺少：native请求前公开status、真实AV completion入口时间及Boolean、main处理时间、pending清除事件、Rust接收／JS兑现阶段、getUserMedia是否真正发起及settle原因。当前ObjC不输出这些事件，Rust仅回最终结果；JS helper把含message的结构化错误重建为普通Error，code随之丢失。只靠TCC日志和可见文案，无法区分“系统未回completion”“completion已到但main未处理”“bridge／IPC交付未完成”等分叉。

## 可执行的下一项：诊断源码与伪环境验证，保持现有包现场

建议单独任务实现一个默认关闭、数量有界的录音授权诊断层，先只做源码和伪OS／假时钟验证，不启动、安装或更换当前Mac17包。目标是为以后**已决定进行的正常验证**留下因果记录，不是为了制造新的权限请求。

1. **保留阶段与错误code。** 每次begin生成不含笔记内容的attempt ID，串起owner动作入站、child dispatch、Session authorize开始／结束、getStream发起／settle。native错误保留 `code` 和 `stage`，用户界面仍用原文案，禁止把timeout/busy转译成denied。
2. **原生最少事件。** 记录main dispatch入场、window验证结果、pending存在／delivered及年龄、发请求前公开AV status、request-issued、30秒finish、OS completion刚进入、main中的systemCompleted、pending-cleared、Rust收包和最终窗口复核。completion入口的记录必须在dispatch main之前，使用线程安全的最小数据；AppKit访问仍限main，不保留裸指针或用户内容。以同一request ID区分“回调已进来”与“main已处理”。
3. **可选被动快照接口。** 单独读取已维护的pending／delivered／阶段；如需要当前公开AV status，由明确的诊断调用只读一次，绝不调用requestAccess、getUserMedia、MediaRecorder或清pending。不得在挂载／启动自动触发授权或自动重试。当前Mac17没有这个接口，不能假称已经读到其状态；本任务也未调用status。
4. **受控分叉而非重复完整矩阵。** 用已有52的替代OS边界和假时钟检查no-callback、timeout后late-completion、close、异常、busy、延迟main／receiver、迟到getStream清理及诊断容量。断言一次交付／context仅最终释放／不额外request／不复活Session／不记录音频或笔记正文。此报告没有运行这些检查；以后若原生编译需要共享target，应另由root串行安排，不能与task60或正式构建竞争。

有了这些事件，判读可收敛：native未入场且Rust超时→派发段；request-issued后无completion-entry→AV／系统边界尚未返回、原因仍未定；completion-entry有而main-processed无→主队列段；main已处理但Rust／JS未结算→桥接交付段；AV已明确成功后getStream才超时→转查WK媒体／流准备；recorder.start失败→再查录音器。仍须以实际事件判读，不能将某条未记录视作对应系统拒绝。

目前不支持直接改动30／35／45秒预算、pending门控、WK Allow策略、AV预检顺序或录音器实现来“修复”旧超时。下一项可独立推进的成果是有界诊断源码及受控验证；真实根因和Mac17新采集能力继续标记 **EVIDENCE-INCOMPLETE / ACTIVE-CAPTURE OPEN**。无需为开展这一源码工作让用户重复授权，也无需新一轮完整TCC扫描。

## 官方契约与本次读取身份

- [A1：Apple AVCaptureDevice requestAccess](https://developer.apple.com/documentation/avfoundation/avcapturedevice/requestaccess%28for%3Acompletionhandler%3A%29)：应用采集授权、completion Boolean、异步与main UI边界、usage description。
- [A2：Apple AVCaptureDevice authorizationStatus](https://developer.apple.com/documentation/avfoundation/avcapturedevice/authorizationstatus%28for%3A%29)：查询应用对指定媒体的公开授权状态。
- [A3：Apple WKUIDelegate media capture permission](https://developer.apple.com/documentation/webkit/wkuidelegate/webview%28_%3Arequestmediacapturepermissionfor%3Ainitiatedbyframe%3Atype%3Adecisionhandler%3A%29)：网页origin／frame与WKPermissionDecision。
- [T1：Tauri Builder::on_permission_request](https://docs.rs/tauri/latest/tauri/struct.Builder.html#method.on_permission_request)：2026-11-05读取时页面标为2.12.5，与本库锁定版本一致；macOS WKUIDelegate接入与已保存网页决定的限制。官方行为核对只限这些契约，不承诺任何提示必定可见或固定秒数返回。

以下SHA256仅固定本次读取源码身份，不是新构建或动态执行证明：

| 路径（工作树根 `/Users/water/work/2026/Apple-Notes-Clone`） | SHA256 |
| --- | --- |
| `src/recording-session.ts` | `f3dfdb38bc61fe906bcb2cc9c793a22a39388c97aede2c26f35451cbd8b31fa2` |
| `src/native-recording-access.ts` | `dbebafa4fee26f735e81f5f1eb802b793528a0e9f837a551a0ee494b1ddd808c` |
| `plugins/tauri-plugin-notes-ui/guest-js/index.ts` | `14669f522105fe14738ba29b997142d615fe837c09109b9c154f5877f4faed98` |
| `plugins/tauri-plugin-notes-ui/src/macos.rs` | `747a45fb678bfee90d429fb598bd29e9038c3bbb062a61b6211d87cfd2b61019` |
| `plugins/tauri-plugin-notes-ui/macos/recording_access.m` | `9ca242bc30202680f9898dc5c44c46ca2d76823774c669e4ae30059eba810a23` |
| `src-tauri/src/media_permission.rs` | `0008e0f343c15e0019bdb86c44b6423d07b477ca1206bd38ed40be1487bb7ad6` |
| `src-tauri/Info.plist` | `e18a1bbdded73783f5dc7a7c4cc46d96c39240575132c226e50f09fffd63617d` |
| `src-tauri/capabilities/macos-recording-access.json` | `4387271bd891609b3afa7b4298d26f4db88b657b8d182474061defd47a667587` |
