# 录音交互50独审准备（1314337最新合同）

状态：PREPARED，等待作者固定提交；尚未运行50代码、源测试、构建或GUI，未作实现PASS。仅阅读root现有基线、任务/UI合同及既有检查，未读取正在变化的实现worktree。

当前依据为root已冻结`1314337`的`docs/plan/tasks/app-recording-interactions50.md`最新纠正节、`docs/ui/recording-desktop.md`、`docs/architecture.md`及手机三态规格。用户要求真实独立非模态录音窗口、后台继续、主窗自由编辑/切笔记。原“仅Panel/右侧栏/不加窗口权限”和锁主界面范围均已被替代，不得据旧范围拒绝新实现。正式审查只围绕新合同改动与相关生产接线，不复制历史327输入或全矩阵；工程受控验证与随后真实双窗/设备音频、原版像素结论分开。

## 已确认的生产边界

- `RecordingSession`持有真实采集资源，暂停快照受实际pause事件、pause序号及requestData槽约束；前缀回放不是最终容器保证。终止等最后data/onstop，dispose关闭迟到事件入口，URL和资源须一次清理。50不应复制或重写采集算法。
- `RecordingPanel`现有最终结果是冻结的同一File/recordedAt对象；submit等待父Promise，失败保留后重试。现有普通cancel则直接dispose/discard，需按50合同改为“有音频的面板关闭走完成保存”。未录/权限请求退出、主动正常关闭、卸载/目标失效/整体窗口生命周期须分别判断，不能把全部cancel路径一律改成保存或一律丢弃。
- `submitRecording`原链验证相同ticket、File、recordedAt；`AttachmentSubmission`复用operationId、查询存储副作用、至多一次插入，只有原正文ACK后才能释放。通用`validatePickerTarget`的严格文档/版本校验保持；录音专用校验按新合同核稳定EditorA、真实映射bookmark、A最新可信正文/待存队列及原owner/授权/operation，不以开始时旧JSON或主窗当前B上下文校验A，也不直接移除通用保护。
- 最新选定方案保持原owner窗及其后端附件operation身份，不转移journal ownership：录音子窗持媒体与最终File，原owner保活EditorA/save queue并缓存收到的同一File。普通主窗close为hide，不通过销毁后新建同label窗口冒认旧owner。非正常owner丢失须明确错误、子窗保留File。
- 现有`createRecordingPlayback`只提供skip，依真实媒体seekable范围和seeked确认；`RecordingClock`是活动采集时钟，不能冒作编码时长或媒体播放位置。

## 固定提交后的必要审查

1. 核对提交/差异：允许Panel/CSS/playback、波形/临时卡、App/Editor/main入口、recording-window/coordinator/transport/目标模块、专用capability及必要Rust ExitRequested/有界registry和生成schema；这是最新授权范围。无新持久schema/节点、依赖锁、数据库协议或通用journal重写，不改智能文件夹、键盘或无关保存控制器。先记录实际改动输入身份，完成后核对未变，不复制全历史。
2. 实际Panel + Session + 生产播放controller组成组件回归：桌面真实独立WebviewWindow，精确label `recording-<标准小写UUID>`与本地专用入口，非modal/非alwaysOnTop，不遮挡或禁用主界面；失焦、最小化、切应用/笔记不主动停录。手机三态/安全区保持。录制总时长与播放位置分开；暂停试听后保持位置，ended驱动再次从头；试听及尚未完成的play请求不能继续采集，迟到play不能恢复旧播放器。
3. 绝对seek、±15和波形鼠标/触摸/键盘共用同一真实范围限制；包括空/离散范围、首末边界、Home/End、连续拖动及未确认/错位/超时。UI不先展示请求为实际到达；媒体错误与重载必须等待新就绪，禁止忙碌时假成功。
4. 真实onLevel按累计活动时间定位；暂停冻结，继续接续；长录音桶聚合有界且保留此前真实峰值。检查没有随机轨迹、末90值铺满全程或由波形反推编码时长。初始/静音/权限失败不伪装已有音轨。
5. 窗口生命周期分别核实：未录子窗可直接退出；录制/暂停/试听的child close均真实stop、等最终数据、原owner同File提交及A正文ACK后close；finalizing/saving重按close/Escape不重复stop/提交，失败保留窗口/卡/File。活跃录音时正常main close必须hide保活原owner/EditorA/save queue，恢复显示仍同身份；不能触发原卸载discard。应用明确Quit/ExitRequested协调所有录音收尾和A ACK后才退出，任一失败终止退出并可恢复。原权限迟到、快照迟到、非正常卸载清理和最终事件缺失仍须回归，不承诺强杀/崩溃恢复内存音频。
6. 源A稳定park且仍可正常编辑：临时卡的增删/更新不改JSON、history、附件引用、selection或文档版本；A的真实本地事务持续映射bookmark。编辑A、切B、编辑B和各自Undo均保留，切回A仍同Editor/原owner；完成在A最新可信正文的映射点插入一次，不重发旧快照、不因正常A编辑版本增长直接拒绝。B不显示A卡、不被强切回、不抢焦点/选区。真正外部变更/撤权/锁定/删除/Editor销毁无法安全映射时，子窗留同File失败，不覆盖A或落B。临时卡随真实A ACK移除。
7. 跨窗采用定向session/operation协议，验证实际sender/接收窗与会话代次，不以URL、任意label或广播事件授权。子窗独占采集/File，原owner收到后只解码/缓存一次，同File/recordedAt/operation幂等提交；重复请求、乱序/迟到、错误session、回执丢失重查均不重复附件/插入/提交。事件、stop、store完成均不能冒充正文ACK；成功回执只在真实原A ACK后返回。owner失活不转移后端ownership，留File并显示可理解错误。
8. root随后补充的必要native barrier接缝纳入固定源审查：允许独立`recording_window.rs` registry及lib begin/finish参与者枚举，唯有精确合法`recording-<标准小写UUID>`无App/正文窗口可排除；原source owner仍参与真实保存/授权屏障。不能改为只取main/note-*而忽略其他未知窗，不能把录音窗排除推成正文ACK或撤权豁免。核正常录音控制、访问失效与owner屏障接线的真实处理，未知/非规范recording label仍保留参与者；最终以作者固定提交及root补充合同记录为准。

## 可复用检查与必要修订

`scripts/check-recording-panel-browser.mjs`已挂实际Panel/Session/播放器，仅媒体平台/时钟受控；50须覆盖实际desktop/mobile、生产coordinator/PM/App保存接线及源A/B，不用替身组件通过。受控窗口适配器仅证明协议工程行为，不证明真实两个原生窗；最终真实双窗/后台与close/Quit由准确包CUA验证。旧“Escape录制直接取消且files=0”“取消试听不保存”及主窗close沿旧discard断言均须据最新合同修订；保留权限迟到和非正常失活清理安全约束，不能用它们否定正常main hide保活。

`check-recording-preview.mjs`覆盖实际Session快照及播放controller，补绝对seek/结束重播/位置保持；`check-recording-session.mjs`保留采集释放和迟到事件回归；`check-recording-submit.mjs`执行AST提取的真实App父闭包、AttachmentSubmission、桥与SaveQueue，保留同File、存储失败、正文ACK及真正权限/目标失效。须区分正常A编辑/park与目标失效，并新增正常main hide、child safe close及整体Quit等待ACK；提取器适配时仍执行真实闭包，不能退为复制算法。根据固定差异选择相关检查及新增真实组件回归，不重跑无关矩阵。

实际浏览器测试依赖已有Playwright/Chrome，不下载。正式执行记录每条命令和真实失败；headless受控媒体不证明麦克风编码、设备有声或像素一致。作者冻结后再确定精确命令及输出目录；本文件仅为准备记录。

## 52原生授权预检独审补充（等待固定提交）

依据root固定`1314337`中更新的`docs/plan/tasks/app-mac-recording-access52.md`及51报告；早期`a6282ae`为历史。51只证明准确Mac14本轮进入WebKit/TCC路径、有code requirement不匹配和prompting，未证明当前原生授权状态或挂起完整根因。52验收为正确接线、资源有界和失败可达；不能要求preflight自证已修复TCC，也不能将Authorized/开关on/Prompt计为真正采音。

- 核新增窄helper确实从生产`RecordingSession.start()`在真实用户Start后、getStream前调用；可选环境接缝不影响既有受控环境。仅Mac Tauri调用，Android/普通浏览器/mount不预检。authorized放行、denied/restricted可见失败，只有notDetermined调用公开AVCaptureDevice requestAccess；回调后复查真实状态，未知值/FFI异常必须失败，不默认authorized。一次Start不重复请求。
- 新command沿现有`own_window`校验实际调用窗口及guest label，同时支持main/既有note-*和精确`recording-<标准小写UUID>`，拒绝大写/非规范/截断/附加字符等录音label；不是任意`recording-*`字符串放行。现有键盘查询仅main，不能直接继承其限制；异步授权回调结束后必须重验实际window/WK存活和同一native身份，只有同名label不足以排除替代窗口。52单独命名Mac麦克风预检capability，只授窄command；录音窗不得加入notes-ui默认toolbar权限。50事件/显示/close能力文件与52麦克风文件分开，不扩大受信origin或替换WebKit媒体handler。
- 检查原生主线程调度、任意queue completion、FFI上下文所有权/释放与一次结算。等待、通道和并发请求有界，主线程不阻塞等权限；超时后OS回调仍可能到达，不能提前释放其裸上下文或累积无界request。现有`on_main`同步通道等待不是异步系统权限回调的完整生命周期方案，需看真实新增接线。
- Session在preflight后重验accepting；取消/卸载/preflight超时/拒绝后的晚成功不能再getStream或构造recorder。getUserMedia等待也有界，错误一次进入onError与幂等清理；timeout不等于撤回系统prompt。晚stream所有轨道逐个stop，即使一轨stop异常也继续释放其它轨；Promise.race不能丢失晚stream。与新会话隔离、结束后定时器清理均需实际Session回归。
- 正式执行仅固定源的typecheck、必要native编译与相关Session/桥/窗口身份回归：拒绝、等待取消、迟到授权、晚stream、一次回调、未知状态、关窗/同label替代和dispatch失败。测试需调用生产接缝，受控stream/回调不代表系统真实授权；不重跑50界面或全历史矩阵。
- 只核允许的Session/helper/plugin/单独麦克风capability路径，无TCC读写、签名/设置变更、通用权限放宽、依赖/锁/持久schema协议或50Panel/App/CSS/playback变化。必要生成schema属于窄command许可接入，不按旧“无权限/无schema文件”范围拒绝。实际新录音窗包的提示、开始/暂停/完成及有声留给root合并后的准确包验证；本准备未读变化中52工作树、未运行任何52实现。

历史说明：最初的“仅Panel/右栏/无新增窗口权限、录音中正文不变、整体退出沿旧生命周期”属于被用户纠正替代的准备，不再作为审查门禁。53准备中的可转移提交claim/销毁后重连建议也不属于选定实现；1314337采用原owner隐藏保活，不转移backend operation ownership。本次只更新此准备文档，产品仍等待各作者固定提交。
