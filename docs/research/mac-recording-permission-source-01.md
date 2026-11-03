# Mac 录音 preparing：锁定源码有界定位 01

日期：2026-11-04，Asia/Shanghai。执行范围：只读当前主源码、candidate03冻结Git对象、现有Cargo registry缓存和已有构建/独立实测证据；仅新增本文，不构建、不下载、不运行GUI、不请求麦克风、不改权限/产品/签名，不查询TCC私库。OCR候选及独审树未修改。

当前主HEAD为 `0863fd49fd49538fc210448ab9a4f32c65c85d62`；实际安装candidate03源为 `c6594dbdfe8ee0313205a4b14bcdfeb37b819088`，不可把已主合入的暂停回放源码追认进candidate03。源码能定位等待边界，但不能单凭源码或历史签名不匹配判定系统请求为何没有完成。

本次逐字节比较candidate03 Git对象与当前文件：src-tauri/Cargo.lock、Cargo.toml、Info.plist、tauri.conf.json及src/media_permission.rs五项完全相同。当前lock SHA256为 `99d9e9cd49367cd850d0362f2d9cb38b58e8356aa9cdd9127fb90441a56c666b`，media_permission.rs为 `0008e0f343c15e0019bdb86c44b6423d07b477ca1206bd38ed40be1487bb7ad6`。RecordingPanel/Session则分别按当前与冻结对象列行号，不声称整文件相同。

## 1. preparing在何处等待

当前源码的真实链路：

1. [RecordingPanel.tsx:217](/Users/water/work/2026/Apple-Notes-Clone/src/RecordingPanel.tsx:217) `begin()` 同步 `transition("requesting")`，创建RecordingSession，248行 `void capture.start()`。312行将requesting显示为“正在准备麦克风…”。此处没有await，也没有为权限请求设置deadline。
2. [recording-session.ts:17](/Users/water/work/2026/Apple-Notes-Clone/src/recording-session.ts:17) `getStream()` 检查API存在后直接返回 `navigator.mediaDevices.getUserMedia({audio:true})`。没有Tauri invoke/原生requestAccess中间层。
3. [recording-session.ts:151](/Users/water/work/2026/Apple-Notes-Clone/src/recording-session.ts:151) `start()` 的第一个await为155行 `await this.environment.getStream()`。若一直pending，就尚未运行169行createRecorder、225行recorder.start或227行onRecording；不会进入recording状态和活动计时。
4. 这不是足以证明当前请求一定停在155行的运行证据：resolve后同步createRecorder/recorder.start如阻塞，也可能尚未送出onRecording；reject/throw正常会在248行catch进入fail并显示错误。已有WebKit/TCC日志支持请求进入系统权限路径，尚不能区分全部后续步骤。

candidate03的同类位置通过只读 `git show c6594db:... | nl -ba` 核对：RecordingPanel begin/requesting在133–135行、start调用165行、notice213–214行；RecordingSession getStream仍17–20行，第一个await在135行，createRecorder149行。后续主线暂停快照增加了行号和功能，权限请求语义在此边界一致。

## 2. 超时、取消和晚返回

当前和candidate03的getStream均无Promise.race、AbortSignal、独立定时器或原生取消调用。当前Panel的15秒deadline只在[RecordingPanel.tsx:268](/Users/water/work/2026/Apple-Notes-Clone/src/RecordingPanel.tsx:268) `finish()` 已暂停→finalizing后设置；candidate03同逻辑在181–194行，不能覆盖requesting。当前[recording-session.ts:346](/Users/water/work/2026/Apple-Notes-Clone/src/recording-session.ts:346)的5秒定时器只用于暂停快照，candidate03不含此新增快照功能，也不能称为权限超时。

取消并非取消浏览器的授权Promise：当前[RecordingPanel.tsx:284](/Users/water/work/2026/Apple-Notes-Clone/src/RecordingPanel.tsx:284)先设live=false、dispose再回父onCancel；卸载132–143行也dispose。当前Session [375行](/Users/water/work/2026/Apple-Notes-Clone/src/recording-session.ts:375)先live=false再discard，accepting条件72–73行因此关闭。若权限Promise以后resolve，156–161行只收取stream tracks后releaseCapture，不创建新录音器；releaseCapture的108–112行逐条stop。晚reject进入fail后因accepting=false而忽略，不对新面板回调。candidate03对应dispose235–239、accepting56–57、晚resolve136–141、track.stop93行。

这支持“取消后的晚到音轨有明确清理代码”，不等于已实测系统请求被取消、系统提示消失或硬件实际释放。一直pending时没有音轨可stop；系统权限状态不会被此取消重置。

## 3. 精确锁定依赖及权限delegate

锁见当前和candidate03 `src-tauri/Cargo.lock`：tauri **2.12.5**（3359行）、tauri-runtime-wry **2.12.3**（3570行）、wry **0.57.1**（4584行）、tao **0.37.2**（3302行）。缓存里另有wry0.55.1，但它不是本项目锁定版本，未据其Grant实现推导当前行为。

下表registry路径都以 `/Users/water/.cargo/registry/src/mirrors.ustc.edu.cn-38d0e5eb5da2abae/` 为根；相对文件和行号为本次实际读取位置。

| 层 | 精确源码位置 | 实际行为 |
| --- | --- | --- |
| App注册 | `/Users/water/work/2026/Apple-Notes-Clone/src-tauri/src/lib.rs:331` | Builder注册media_permission::response及lifecycle |
| App本地策略 | `/Users/water/work/2026/Apple-Notes-Clone/src-tauri/src/media_permission.rs:217`，121、148、187行 | 从实际Webview资源取已完成可信主页面状态；只对Camera/Microphone返回Allow，否则Deny；try_lock失败保守拒绝；无dispatcher/UI/OS授权等待 |
| Tauri路由 | `tauri-2.12.5/src/manager/webview.rs:314` | 单Webview handler非Default先返回，否则查当前Webview后调用全局handler，均为同步返回值 |
| Runtime接Wry | `tauri-runtime-wry-2.12.3/src/lib.rs:4891`，`src/webview_permissions.rs:7`和29 | with_permission_handler将kind/response直接映射，未增加异步授权队列或定时器 |
| 安装delegate | `wry-0.57.1/src/wkwebview/mod.rs:652` | 创建WryWebViewUIDelegate并传入permission_handler，658行setUIDelegate |
| WK媒体请求 | `wry-0.57.1/src/wkwebview/class/wry_web_view_ui_delegate.rs:128` | 接收WKMediaCaptureType，忽略_origin/_frame；Microphone在147行调用handler；Allow→Grant、Deny→Deny、Default→Prompt（139–143）；166行立即call decision_handler；无handler才163行Grant |

WKUIDelegate方法在`#[cfg(not(macos_12_unavailable))]`下，不由某个media feature控制。`wry-0.57.1/build.rs:15`仅在debug_assertions且构建宿主macOS<12时设置该unavailable；本项目macOS最小12。代码路径只说明WebKit层的决策，不代替AVCaptureDevice系统授权。当前源码没有直接 `AVCaptureDevice.requestAccess` 的Mac录音接线。

Tauri自己的锁定源码 `tauri-2.12.5/src/app.rs:1864`还注明：持久保存过的WebView权限可能直接使用已存偏好而不再调用handler。因此没有本次handler运行记录时，不能断言此次一定走Allow或Deny，也不能把WebKit日志的action:Prompt直接等同本项目返回Default。

## 4. plist和真实default features

[src-tauri/Cargo.toml:14](/Users/water/work/2026/Apple-Notes-Clone/src-tauri/Cargo.toml:14)保留Tauri默认features并加protocol-asset；没有配置macos-private-api、额外media feature或录音原生插件。`tauri-2.12.5/Cargo.toml:84`默认wry/compression/common-controls-v6/dynamic-acl/x11/dbus。runtime Cargo.toml96–102行对wry显式关闭默认features，再启用os-webview/linux-body，x11由上层传递；Wry本身features清单46–70行没有麦克风授权开关。objc2-web-kit依赖378–409行显式启用WKUIDelegate/WKSecurityOrigin等绑定。这些在Mac不意味着运行GTK，target条件仍决定实际依赖。

candidate03构建记录 `docs/verification/unified-candidate03/build/mac-build-identity.json`明确features=default/no proof flag，run-build.py29行实际命令为pnpm mac:build；PREPARATION.md记录无额外features。另只读现有release `.fingerprint/{tauri-63cdcc7b1a459cf5,tauri-runtime-wry-46625547646b829a,wry-306f430d8ba2051a}/lib-*.json`的features：tauri含default/custom-protocol/protocol-asset，runtime含common-controls-v6/dbus/x11，wry含os-webview/linux-body及上层x11项，均不含devtools/mac-proxy；这是当前缓存实录，未将未冻结fingerprint单独冒称candidate03签名输入。

[src-tauri/Info.plist:1](/Users/water/work/2026/Apple-Notes-Clone/src-tauri/Info.plist:1)已有NSMicrophoneUsageDescription“将录音添加到本地备忘录。”与NSCameraUsageDescription。tauri.conf.json37行指定合并Info.plist，minimumSystemVersion12.0。独立诊断已核当前sealed包用途字符串存在、adhoc签名flags0x2、无输出entitlement字典；这些不支持“漏用途字符串”解释，也不足以把某个entitlement或签名选项判为根因。本文没有修改它们。

## 5. 已有运行证据与可做的下一步

已有独立证据见[麦克风有界诊断](../verification/candidate03-mic-preparing-diagnosis-01/README.md)：PID39665的AVCaptureDevice已加载，读取soun授权原值0；本机SDK枚举映射NotDetermined。历史同sealed包路径/PID日志有WebKit audio请求/Prompt、旧f5ada…与当前73012…条件不匹配、AUTHREQ_PROMPTING。不能据此推导当前系统提示可见、用户选择、请求最终settle或全部根因。本文没有再读系统日志或授权状态。

后续有证据支持的区分步骤，需root另行串行安排：

1. 对确切sealed包/同一请求，先做一次可见系统提示与前台inventory观察，记录时间/PID；当前CUA绑定失败不是“没有提示”。保持原权限和包身份，不反复重触发请求。
2. 若已有请求可安全只读观察，记录其最终Promise resolve/reject与真实error.name；不要新发getUserMedia或直接requestAccess来代替。没有这些结果，仍仅能标pending边界。
3. 如必须加诊断日志，另建窄任务记录getStream调用/settle、recorder构造/start、onRecording及WK handler实际kind/结果/时间，独立构建新包分账；不要先改Allow/Deny、权限、签名或超时来掩盖原问题。
4. “requesting可无限等待”已由源码确认，是可单列的体验/取消策略议题。超时本身不能撤回系统请求，任何后续实现仍须保留现有晚resolve stop边界；本次未实现或承诺修复。

本文未产生录音、音轨、正文ACK、冷启或像素验收结果，未改OCR候选或原生权限策略。
