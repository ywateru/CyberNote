# Mac录音请求51：本轮挂起的只读定位与最小接缝

2026-11-05，Asia/Shanghai，READY STOP。**本轮准确Mac14的请求已进入WebKit/TCC麦克风路径；09:07:20再次直接记录既有授权code requirement不匹配及prompting。可部分定位权限边界，尚未确诊为何请求未结算。** 系统设置“mac-sealed”开关on、WebKit action:Prompt和TCC AUTHREQ_PROMPTING均不等于当前包已授权、系统提示已被看到或用户已接受。没有修改源码、签名或权限，也未运行新的getUserMedia、采音、GUI、REA注入、代码测试或TCC数据库查询；只新增本文。

## 准确身份与本次运行事实

root保全的[baseline](../verification/recording-interactions50-baseline/)记录上海09:06–09:09自有QA-AUDIO-20261105-50笔记（全部42/对照9，保留），开始后“正在准备麦克风…”与00:00约一分钟不变，取消后恢复正文。requesting AX是“无变化”返回，本身不能证明请求内部阶段。当前[identity.json](../verification/recording-interactions50-baseline/identity.json)保存源d9ce9c4、exe SHA256 `c9f7f35adc675c8058fabeb98f03fa7d1904a2c023e123cc396121264a8e211f`。本人获批只读ps亦确认PID81752仍为：

`artifacts/unified-candidate06/mac-ordinary-loop-build14/mac-attempt01/mac-sealed.app/Contents/MacOS/notes-clone`

初次受限ps被拒，随后获批ps成功；不把受限检查失败当进程消失。[系统麦克风AX](../verification/recording-interactions50-baseline/system-microphone-readonly.ax.txt:66)明确“mac-sealed Value:on”；这只是名称列表观察，不证明当前CDHash满足该授权记录。

只读日志限定最近15分钟，最终过滤为“PID81752 + com.apple.WebKit/WebRTC”或“tccd + com.apple.TCC +消息含com.local.notesclone”。两分支均定位本应用；未补查其它应用或TCC库。第一版过滤曾意外命中runningboard多行进程清单，未保存/引用无关内容；随后收窄上述subsystem/category，不再扩大。

| 上海时间 | 本轮直接记录 |
| --- | --- |
| 09:07:20.321 | notes-clone[81752] requestUserMediaPermissionForFrame；同请求ID `11233782971098570740`、帧2575，persistent access:false。 |
| 09:07:20.342 | tccd：subject com.local.notesclone、service kTCCServiceMicrophone，Failed to match existing code requirement。 |
| 09:07:20.388 | WebKit valid request为video:0/audio:1，action:Prompt；同刻还有input mute handler not set错误，单凭此消息不能判为根因。 |
| 09:07:20.391–.394 | tccd明确msgID `81752.5`及准确Mac14完整路径；.393再次Failed to match existing code requirement；.394 AUTHREQ_PROMPTING。 |

不匹配日志列出的两个条件为 `cdhash H"2cb98e26388e45b40079f18f8f42534ea3e40104"` 与 `cdhash H"1d215208651dd7f7443ffe2ca4641dd62d0d84fc"`。本轮未另查codesign，故只报告其比较失败，不按日志顺序擅自给两值贴“当前/旧”标签；CDHash也不是exe文件SHA256。它把旧candidate03的历史线索推进为**本轮实际请求也有同类不匹配**，不支持复用旧包的73012/f5ada标识。

此过滤会遗漏不含bundle标识的TCC回复，未沿msgID补查整事务；不能以未见最终grant/deny证明没有回复。没有本轮getUserMedia settle或原生授权状态返回，因此仍不能断言挂起完全由签名不匹配造成，也不能断言当前状态为NotDetermined/Denied/Authorized。旧诊断中的授权原值0属于旧进程，不移植到81752。

## 锁定源码能排除与不能排除的事

已实际读当前[media_permission.rs](../../src-tauri/src/media_permission.rs:217)、[Cargo.lock](../../src-tauri/Cargo.lock:4598)及本地精确缓存。锁定Tauri2.12.5、runtime-wry2.12.3、Wry0.57.1；没有用缓存里的Wry0.55.1推断。

- `media_permission::response`同步读取实际WebView资源的可信页面状态，只返回Allow/Deny；没有URL同步调度、OS请求或异步等待。当前custom scheme已接受tauri://localhost空path，因此不能继续照搬“根URL一定被拒”的旧假设；本次真实handler结果仍没记录。
- Wry0.57.1 `src/wkwebview/class/wry_web_view_ui_delegate.rs:128–166`将Allow→WKPermissionDecision::Grant、Deny→Deny、Default→Prompt，末尾立即调用decision_handler。源码没有显示一个故意不调用completion的分支。WebKit日志action:Prompt是内部请求路径，不能反推app handler返回Default；本地策略本就不返回Default。
- Tauri2.12.5 `src/app.rs:1863`注明持久WebView偏好可能跳过新permission handler；没有运行记录不能证明这次一定调用过它。WK网页授权与系统硬件授权必须分开观察。
- [recording-session.ts:17](../../src/recording-session.ts:17)直接调用getUserMedia({audio:true})；[155行](../../src/recording-session.ts:155)await之后才构造MediaRecorder，225/227行start后回调onRecording。当前没有原生AVCaptureDevice预检/请求，requesting没有deadline。源码支持无限等待边界，但无法只凭UI区分await未返回与后续同步步骤未发出onRecording。
- 现有取消会dispose；getUserMedia晚resolve会在accepting=false时stop tracks，不接到新会话。页面取消不等于撤回系统权限请求；新增超时不能删除这条清理边界。[Info.plist](../../src-tauri/Info.plist)已有NSMicrophoneUsageDescription，不支持“当前源码漏说明字符串”的判断。

对照旧[权限源码定位01](mac-recording-permission-source-01.md)与[旧diagnosis](../verification/candidate03-mic-preparing-diagnosis-01/README.md)：等待边界与不匹配类型相似，但本51只以当前PID/时间的新日志建立本次结论。

## 最小可实测修复/诊断接缝

**公开原生预检是推荐的最小诊断与错误出口，不是已证明不可省略的WebKit录音前置条件，也不保证修复本次挂起。** Apple本机公开SDK `MacOSX15.4.sdk/.../AVFoundation.framework/Versions/A/Headers/AVCaptureDevice.h:1894–1930`明确声明以下API，均macOS10.14起可用；WKUIDelegate公开头对应网页媒体决策为macOS12起。

| 接缝 | 下一次窄实现建议；本轮未执行 |
| --- | --- |
| 只查询系统状态 | 在用户点“开始”的单一会话边界，通过受信Tauri原生命令调用`AVCaptureDevice.authorizationStatusForMediaType: AVMediaTypeAudio`。原值0/1/2/3分别NotDetermined/Restricted/Denied/Authorized；记录原值+枚举+时间+attempt，不读TCC库、不新建音频输入。 |
| NotDetermined | 如合同采用显式授权，仅此状态调用公开`requestAccessForMediaType:completionHandler:`，等待真实回调后再次查状态；不与WebKit请求并发，不在每次按钮/页面挂载重复触发。该API会在必要时请求系统提示，属于后续用户主动开始录音流程，本轮没有调用。 |
| Denied/Restricted | 返回可见、可取消的明确错误，不继续启动getUserMedia或无限“正在准备”。系统设置中已有同名on不能覆盖这个当前进程返回。 |
| Authorized | 再调用一次既有getUserMedia；仍记录resolve/reject及error.name、recorder构造/start与onRecording。原生Authorized不保证网页授权、音轨、录音文件或可听性。 |
| 超时/取消 | 只结束本次等待界面/attempt并保留晚resolve track.stop；不声称取消系统prompt。回调可能在任意queue返回，转回应用合适线程更新；异步结果必须核attempt/live，不能复活已关闭录音栏。不要在同步Wry permission callback里阻塞等待原生授权。 |
| 最少阶段诊断 | 原生status前后/请求回调、getStream调用及settle、recorder构造/start/onRecording、WK实际kind/Allow或Deny；仅固定枚举与时间，不记音频、正文或设备私密标识。依靠这些区分OS等待、WebKit等待、recorder失败；不是先把失败统一改成“授权成功”。 |

公开SDK同时说明原生requestAccess本身不阻塞调用线程、必要时显示对话框，回调在任意dispatch queue；它也说明创建AVCaptureDeviceInput时NotDetermined会自动触发授权。故“源码没显式requestAccess”本身不能证明实现违规或必然挂起；此处显式接缝的价值是可观察、分阶段处理与可靠错误出口。

先让50的新包与最小接缝可审，再由root串行安排**当前准确包正常退出/重启后**的状态查询、一次用户主动录音及可见系统提示观察。若仍存在记录不匹配，应固定包与签名身份再报告当前返回；不要立刻反复要求用户授权或全局重置。需要用户重新设置当前应用授权时，应说明准确新包、具体设置与影响，再请求该具体动作。

不建议把adhoc designated requirement放宽为仅identifier来绕过不匹配：可能让任意相同bundle id的本地代码继承麦克风信任。不改TCC库、不全重置、不加私有entitlement、不将WKGrant当OS授权，也不把修改超时当采音修复。稳定开发签名可另行评估，但不在51自行更换身份/重签。

本轮交付是部分定位及最小公开API接缝建议，不是Mac录音成功或50验收通过。原版用户录音未操作，自有baseline笔记保留，主50开发继续。READY STOP。
