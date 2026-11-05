# 录音交互50独审准备

状态：PREPARED，等待作者固定提交；尚未运行50代码、源测试、构建或GUI，未作实现PASS。仅阅读root现有基线、任务/UI合同及既有检查，未读取正在变化的实现worktree。

依据：`docs/plan/tasks/app-recording-interactions50.md`、`docs/ui/recording-desktop.md`及手机三态规格。正式审查只围绕50改动与相关生产接线，不复制历史327输入或全矩阵；工程受控验证与随后真实包/设备音频、原版像素结论分开。

## 已确认的生产边界

- `RecordingSession`持有真实采集资源，暂停快照受实际pause事件、pause序号及requestData槽约束；前缀回放不是最终容器保证。终止等最后data/onstop，dispose关闭迟到事件入口，URL和资源须一次清理。50不应复制或重写采集算法。
- `RecordingPanel`现有最终结果是冻结的同一File/recordedAt对象；submit等待父Promise，失败保留后重试。现有普通cancel则直接dispose/discard，需按50合同改为“有音频的面板关闭走完成保存”。未录/权限请求退出、主动正常关闭、卸载/目标失效/整体窗口生命周期须分别判断，不能把全部cancel路径一律改成保存或一律丢弃。
- `submitRecording`验证相同ticket、File、recordedAt；`AttachmentSubmission`复用operationId、查询存储副作用、至多一次插入，只有原正文ACK后才能释放。`validatePickerTarget`保留原note/editor/owner/bookmark、文档和授权版本；临时卡不能放宽这些条件或将结果转给当前笔记。
- 现有`createRecordingPlayback`只提供skip，依真实媒体seekable范围和seeked确认；`RecordingClock`是活动采集时钟，不能冒作编码时长或媒体播放位置。

## 固定提交后的必要审查

1. 核对提交/差异：仅必要Panel/CSS/playback、波形/临时卡及App/Editor接缝；无schema/持久节点、依赖锁、数据库协议、权限、智能文件夹或共享保存控制器变化。先记录实际改动输入身份，完成后核对未变，不复制全历史。
2. 实际Panel + Session + 生产播放controller组成组件回归：桌面右侧栏分配编辑区域、无遮暗模态，手机三态/安全区保持；录制/暂停/播放位置分别来自相应真实状态。暂停试听后暂停保持位置；结束事实驱动再次从头；试听及尚未完成的play请求不能继续采集，迟到play不能恢复旧播放器。
3. 绝对seek、±15和波形鼠标/触摸/键盘共用同一真实范围限制；包括空/离散范围、首末边界、Home/End、连续拖动及未确认/错位/超时。UI不先展示请求为实际到达；媒体错误与重载必须等待新就绪，禁止忙碌时假成功。
4. 真实onLevel按累计活动时间定位；暂停冻结，继续接续；长录音桶聚合有界且保留此前真实峰值。检查没有随机轨迹、末90值铺满全程或由波形反推编码时长。初始/静音/权限失败不伪装已有音轨。
5. 面板关闭与完成：未录直接退出；录制/暂停正常关闭均真实stop且等最终数据、同一File/ACK后退出；finalizing/saving连续点击或Escape不重复stop/提交；失败保留卡/最终File、关闭不discard、重试不重采集不重复插入。保留未录权限迟到、快照迟到、卸载清理、缺最终事件/资源失败与父保存拒绝的有意义回归。
6. 临时卡在捕获的原Editor/插入点显示同一会话日期、活动总时长及有效动作。装饰增删/更新不改正文JSON、history、附件引用、selection或文档版本；交互不误触正文编辑。切笔记、旧Editor销毁、目标失效不在新笔记显示；完成后的持久附件仍由原保存链路生成一次，卡的消失时机随ACK而非本地stop。

## 可复用检查与必要修订

`scripts/check-recording-panel-browser.mjs`已挂实际Panel/Session/播放器，仅媒体平台/时钟受控；50必须扩成真实desktop/mobile及原Editor卡接缝，不用替身组件通过。旧“Escape录制直接取消且files=0”和“取消试听不保存”断言与新正常关闭合同冲突，应明确修订此类用户关闭断言；卸载/权限迟到/目标失效的清理安全约束继续保持。

`check-recording-preview.mjs`覆盖实际Session快照及播放controller，补绝对seek/结束重播/位置保持；`check-recording-session.mjs`保留采集释放和迟到事件回归；`check-recording-submit.mjs`执行AST提取的真实App父闭包、AttachmentSubmission、桥与SaveQueue，保留同File、存储失败、正文ACK、权限/目标变化、Back/整体关闭/卸载边界。提取器需适配接缝时核对仍执行真实闭包，不能退为复制算法。根据固定差异选择这些相关检查及作者新增真实组件回归，不重跑无关矩阵。

实际浏览器测试依赖已有Playwright/Chrome，不下载。正式执行记录每条命令和真实失败；headless受控媒体不证明麦克风编码、设备有声或像素一致。作者冻结后再确定精确命令及输出目录；本文件仅为准备记录。

## 52原生授权预检独审补充（等待固定提交）

依据root固定`a6282ae`合同`docs/plan/tasks/app-mac-recording-access52.md`及51报告。51只证明准确Mac14本轮进入WebKit/TCC路径、有code requirement不匹配和prompting，未证明当前原生授权状态或挂起完整根因。52验收为正确接线、资源有界和失败可达；不能要求preflight自证已修复TCC，也不能将Authorized/开关on/Prompt计为真正采音。

- 核新增窄helper确实从生产`RecordingSession.start()`在真实用户Start后、getStream前调用；可选环境接缝不影响既有受控环境。仅Mac Tauri调用，Android/普通浏览器/mount不预检。authorized放行、denied/restricted可见失败，只有notDetermined调用公开AVCaptureDevice requestAccess；回调后复查真实状态，未知值/FFI异常必须失败，不默认authorized。一次Start不重复请求。
- 新command沿现有`own_window`校验实际调用窗口及guest label，同时支持main/既有note-*。现有键盘查询仅main，不能直接继承其限制；异步授权回调结束后必须重验窗口存活和同一原生身份，只有同名label不足以排除关闭后替代窗口。新许可仅Mac本地实际窗口，不扩大受信origin或替换现有WebKit媒体handler。
- 检查原生主线程调度、任意queue completion、FFI上下文所有权/释放与一次结算。等待、通道和并发请求有界，主线程不阻塞等权限；超时后OS回调仍可能到达，不能提前释放其裸上下文或累积无界request。现有`on_main`同步通道等待不是异步系统权限回调的完整生命周期方案，需看真实新增接线。
- Session在preflight后重验accepting；取消/卸载/preflight超时/拒绝后的晚成功不能再getStream或构造recorder。getUserMedia等待也有界，错误一次进入onError与幂等清理；timeout不等于撤回系统prompt。晚stream所有轨道逐个stop，即使一轨stop异常也继续释放其它轨；Promise.race不能丢失晚stream。与新会话隔离、结束后定时器清理均需实际Session回归。
- 正式执行仅固定源的typecheck、必要native编译与相关Session/桥/窗口身份回归：拒绝、等待取消、迟到授权、晚stream、一次回调、未知状态、关窗/同label替代和dispatch失败。测试需调用生产接缝，受控stream/回调不代表系统真实授权；不重跑50界面或全历史矩阵。
- 只核允许的Session/helper/plugin/窄capability路径，无TCC读写、签名/设置变更、权限放宽、依赖/锁/schema协议或50Panel/App/CSS/playback变化。实际新包的提示、开始/暂停/完成及有声留给root合并后的准确包验证；本准备未读变化中52工作树、未运行任何52实现。
