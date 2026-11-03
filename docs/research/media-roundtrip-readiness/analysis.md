# APP-002 现有录音与本地播放链准备审计

2026-11-03。按 `app-002-media.md` 和 `offline-media-scanning.md` 做有限只读审计，**先验证现有 WebView 采集路径**。没有 GUI、设备操作、构建、录音或测试，没有修改产品/依赖，也没有新建音频插件。输入字节先冻结至本地临时快照再读取，完整 SHA 及逐文件 working-tree/HEAD 区别见 `inputs.json`。起始 HEAD 为 `bba3c3ba17c22508cb3d7ddd578946f2610191a8`；App.tsx/lib.rs/Cargo.toml/Cargo.lock 与该HEAD不同，包含并行原生顶部候选，不能把这份快照当最终集成提交。21份输入在审计结束时仍与冻结字节一致。本文行号均对应冻结字节。

**现有链路已经是 `getUserMedia → MediaRecorder → File/base64 → Rust受管附件 → 正文节点 → Rust读取 → HTML audio`。** 代码存在不等于目标设备实际可录、可听、可冷启动播放。实际麦克风授权、采集MIME/音轨、设备路由、暂停/完成/中断和重启播放全部未运行、unknown。原版开始录制由自动还是用户点击触发仍unknown；不能把当前自动开始登记为已证差异。

## 当前实现与边界

| 链路 | 冻结代码所见 | 能证明/不能证明 |
| --- | --- | --- |
| 入口 | `App.tsx:1523–1528` 常规媒体菜单打开面板；原生顶部 `:2040–2043` 另保存 note/editor/auth/bookmark 上下文 | 常规入口没有同等录音session目标快照；当前有遮罩，不能仅因此声称已发生跨笔记插入 |
| 准备/录制 | `App.tsx:3720–3743` 请求audio权限，允许后若已取消立即stop返回；依次探测webm+opus、mp4、webm，未命中则浏览器默认；构建recorder并start(250)，即自动开始 | 没有预设原版触发方式。实际平台支持、首chunk、编码与音轨unknown |
| 暂停/继续/结束 | `:3840–3861` 调pause/resume，另有独立stop按钮；onstop组装blob再置stopped | paused尚无最终blob；完成按钮`:3791`要求blob，暂停不能直接完成，属已确认的契约缺口 |
| 计时/波形 | `:3768–3772` recording态每100ms加0.1秒；`:3744–3754` AudioContext/Analyser真实频谱均值，保留90点，最低高度2 | 波形非随机假数据，但不是持久化全程波形；计时不以媒体或单调时间为准，实际漂移未知；暂停不增长由UI状态定时器决定 |
| 结束/取消 | 显式stop同时停tracks；卸载时清波形timer、stop recorder、停tracks、close AudioContext；异步getUserMedia在取消后回包也停tracks | 没有统一try/finally清理；onstop/异步错误回调未解除或校验cancelled；停止后AudioContext/波形timer直到卸载才清。取消或Back卸载后的实际设备释放尚未观察 |
| 权限 | `lib.rs:237–247` 仅可信localhost/tauri.localhost的Camera/Microphone允许；Manifest有RECORD_AUDIO/MODIFY_AUDIO_SETTINGS；Info.plist有麦克风说明 | 锁定Wry0.57.1的RustWebChromeClient.kt`:60–113`真实执行Android requestPermissions，再grant/deny WebView；不能误报缺运行时申请。签名/entitlement、拒绝后重试/永久拒绝/无设备unknown；tauri.conf无显式macOS entitlements配置不等于已证不可录 |
| 保存 | `App.tsx:3198–3228` await storeAttachment，插入audio节点，再关面板、refresh；`bridge.ts:284–302` 整blob读base64后拿note token，传文件名/MIME/数据 | 面板busy阻止正常重复完成；取消按钮仍可点；没有跨await取消/卸载校验。正文insert返回布尔值未检验，父catch只全局fail、未抛回面板 |
| 受管存储 | `lib.rs:185–193` 解码后锁session、校验sensitive；`store.rs:653–704` note存在且未锁、≤100MB，UUID+净化扩展名，写root/attachments再插表；DB插入失败会删文件 | 不依赖录音临时URI。只按MIME前缀分kind，无非零/媒体解码/音轨/时长检查；大小检查在前端base64与Rust解码后。fs::write自身错误/进程崩溃可先有文件后无表；尚未实测 |
| 归属/授权 | `session.rs:61–121` session/note epoch、pending barrier与authorized检查，已删除/未授权拒绝；read_attachment按服务器表查owner后核token；正文校验`archive/document.rs:273–285`要求附件存在且noteId/kind一致 | 后端有真实归属保护，不存在仅凭前端kind任意引用另一笔记的路径。原生顶部还前后nativeAssert，核note/editor/auth/docVersion/bookmark。普通菜单路径无对应前后活性校验；变化后响应可能被bridge拒绝，但永久附件可能已落盘 |
| 冷启动读取 | workspace附件列表重建attachmentOwners；`Editor.tsx:28–40`按ID读Rust，响应仍live才设data URL，读取失败显示错误；AudioPlayer操作真实audio元素 | 文件不依赖原选择源。真实metadata、可听音轨、输出设备、重启读取仍unknown |
| 播放/跳转 | `Editor.tsx:79–84` metadata/timeupdate/ended，`:95–105` play/pause；后退max(0,time-15)，前进min(duration,time+15)，range直接设currentTime | play promise错误被空catch吞掉；没有audio error UI；非有限duration显示0:00并禁用有效范围，未处理流式/损坏编码；实际播放、时长/拖动/±15秒全部unknown |

## 已确认静态缺口与优先级

以下是代码路径和契约缺口，**不是已在设备复现的失败**。首批范围只限现有采集与保存闭环，不扩展扫描、ASR或新存储协议。

1. **P1准备项：失败时立即释放采集资源。** 获取stream后，`MediaRecorder.isTypeSupported`/构造/start或后续AudioContext/连接若抛错，`:3755–3758`只设error/status，不stop recorder/tracks/close ctx；后续错误UI`:3821`又隐藏停止控件。特别是`:3742`已start、`:3744`之后失败的分支，会在错误显示期间继续持有真实采集，直到用户取消或卸载。这条静态失败路径成立，目标平台是否能触发以及实际指示灯/采集状态仍unknown。没有recorder.onerror、track ended、AudioContext状态或系统中断处理；应统一finally释放并保存显式错误/取消状态。
2. **P2：暂停可直接完成。** 目前只有stop后的blob能启用完成，与已采样原版暂停/继续/完成不同。首批让paused→完成结束真实recorder、等最后chunk/onstop、校验结果再保存，不能直接保存尚未完成的chunks。
3. **P2：保存失败须传回面板并保留可重试录音。** 父onDone的catch只fail，不throw；子面板的保存错误catch接不到大多数真实失败。若current/editor缺失还直接成功返回；插入`.run()`为false也不报错。需明确成功/失败，失败保留blob，完成成功后才销毁草稿；busy期间取消语义必须一致。当前busy只禁完成，取消后仍在途的onDone没有取消校验，可继续存储/插入，不能将“点取消”视为已验证没有副作用。
4. **P2：处理两步提交产生的孤儿与重复。** store先永久写文件/表，之后nativeAssert、bookmark resolve、插入、正文保存/flush任何一步失败都无附件回滚；重试同blob会生成新UUID。DB插入失败已有删文件，但没有成功store后未引用的补偿/重试复用；普通正文删除附件节点也没有清附件行，只有purge整篇才清附件。孤儿还会触发store.rs`:589`“含附件不能锁定”，即使正文无卡片。首批定义已有附件的失败补偿或明确保留重试，不需要大改存储协议；检查文件、表、正文三者一致。
5. **P2：计时与有效媒体结果。** 计时应由单调有效录制累计或真实媒体时间校对，暂停不累计；当前tick增加在事件循环延迟/后台时可能偏小。onstop无条件创建Blob，空/损坏/无音轨也可完成；Rust允许0字节且无音频验证。MIME默认回退若非mp4一律命名webm，真实返回类型尚未核；需要记录真实r.mimeType、文件容器及音轨，失败不建假卡片。此项可随首个真实roundtrip决定最小必要适配。
6. **P2/P3：播放错误与预览资源。** 音频play拒绝/解码错误应明确展示并允许重试（P2）。面板`:3866`每次render直接createObjectURL且无revoke，资源生命周期不完整（P3）；可在同一资源清理改动中处理。无需为此替换采集技术栈。

跨笔记/auth变化应纳入同一有限自检：后端拒绝未授权并不自动回滚已经存储的附件，也不证明异步UI不会使用已销毁editor。当前原生顶部候选已有额外上下文检查，不能将其当所有入口均已统一，也不能把未观察到的跨笔记插入写作已发生。

## 最小真实自检方案（待设备交接后执行）

先在当前可用Mac/Android各跑现有路径的基线，记录源码/产物SHA、OS、WebView、麦克风输入/输出设备、实际r.mimeType。无需先写原生录音插件。用自有受控测试口令/节拍声，不录用户私人谈话；没有实际可辨识音轨的静音结果不能算采集通过。

1. **一次完整roundtrip。** 新建无锁测试笔记，走该平台真实录音菜单。录5秒受控音轨→暂停3秒→继续5秒→在暂停态完成；当前无法完成要先记录真实失败。基线可另外走“显式结束→完成”来检验已有采集、存储与播放路径，单列结果，不把它冒称暂停完成通过。保存后记录真实附件ID/noteId/MIME/大小、正文引用、受管文件存在、可解码音轨与媒体时长，计时应约10秒而非13秒。
2. **冷启动可听播放。** 结束应用再启动、断网打开该笔记，听到前后两段口令；核metadata和时长，播放/暂停/进度拖动与起止边界。另一次≥35秒音轨才能有效验±15秒，不能用2秒短片宣称前进15秒通过。确认读的是受管文件而非面板blob URL。
3. **拒绝/取消/Back。** 真实拒绝麦克风、无输入设备（平台可提供时）、授权等待中取消、recording/paused取消和Android Back。每次检查录音指示/track/recorder清理、面板无假卡片、附件表/文件/正文无新增；平台不能提供的中断标unknown。系统退后台/恢复只观察现有实际行为，不预设已支持后台录音。
4. **完成失败与重复。** 有blob后制造可控保存失败（如受控授权状态变化；不要改真实用户存储权限），保存面板应清楚报错且保留可重试录音。重试、快速重复完成、busy时取消后，检查一次逻辑结果最多一个附件与节点，或有明确可清理草稿，无无引用永久副本。不要只看UI通知，要核文件/表/文档。
5. **目标笔记与授权变化。** 录音期间/保存await期间从另一自有窗口锁定/删除目标或切换笔记，分别验证普通菜单及原生顶部入口。失败不插入当前另一篇、不用旧editor，原目标附件不成孤儿；授权边界仍拒绝陈旧token。只用合成测试笔记。

采集/播放未经过上述实证前均保持unknown。UI只记录与原屏同状态差异；原版开始触发仍unknown，不能以当前自动start改写要求。像素、字体、材质、波形形状与动画不因媒体链可用而自动通过。

## 模拟器受控音轨候选（2026-11-03，尚未运行）

为后续Android真实采集避免使用私人谈话，优先检查模拟器自带的音频注入能力，不替换应用的getUserMedia/MediaRecorder。已只读核本机SDK的`/Users/water/Library/Android/sdk/emulator/lib/emulator_controller.proto`，SHA256 `1d62c6bcad5f06621f90ec2bf26c661ba769ccd0f1416b5314d25a68e04eee5f`：`:334–348`定义client-streaming `injectAudio`向Android麦克风送音轨；`:1554–1601`定义PCM U8/S16 little-endian、mono/stereo、采样率、分包和宿主麦克风状态。另有`streamAudio`可观察模拟设备输出。Google官方源码接口也见`https://android.googlesource.com/platform/external/qemu/+/refs/heads/main/android/android-grpc/services/emulator-controller/proto/emulator_controller.proto`；线上版本与本机字节不混同。

本机协议说明注入缓冲约300ms，仅首包格式生效，采样率上限48kHz；默认delivery mode由模拟器需求节流，real-time模式实验性且可能覆盖排队数据。现仅确认接口存在，不证明当前emulator已开放可认证gRPC、能实际注入或本应用能录到；没有连接、配置或设备操作，也未安装额外依赖。后续先做一次有界可用性核查；若可用，以生成的可辨节拍/口令PCM经该真实Android输入路径送入，记录实际权限、非零音轨和输出文件频谱/时长。不能以API存在或JS伪造stream宣称采集通过。不要打印认证token；如需调整宿主麦克风状态须记录原值并恢复。不可用时明确unknown，勿为测试擅自录取私人环境声音或扩建无关平台。
