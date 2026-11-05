# 独立录音窗口：最小安全接缝53

2026-11-05，只读准备。依据用户最新要求：录音使用真实独立窗口，切应用、切笔记及编辑原笔记时继续；主界面不遮挡、不锁定。未读变化中的50/52实现，未写产品、运行测试或GUI。本建议替代50旧“固定原Editor且正文不变”的录音目标假设；普通附件保护不因此放宽。

## 当前接缝与冲突

`App.openSeparate`创建`note-*` WebviewWindow及`?note=id`，每窗独立运行App；不是共享React/RecordingSession内存。现有`notes-access`/`notes-metadata`事件负责授权与刷新，没有可靠录音会话/文件交付协议。当前capability只含main/note-*；新增录音窗需显式入口与窄许可，不伪装独立笔记。

当前录音ticket捕获原Editor、bookmark、文档版本/JSON；切Editor会cancel，`rebindAttachmentTarget`拒绝正文变化。直接删documentVersion/JSON比较会让旧bookmark、旧正文和过期授权穿过保护；保留全部比较又无法满足一边编辑一边录音。必须新增录音专用意图接缝，避免复用这条“文档必须不变”的提交前提。

后端附件操作owner是进程session + 实际window + incarnation，`store/query/cancel_attachment_operation`由调用者窗口生成owner。主窗重建后不能查询或重试录音窗的operation来冒认其身份。正文保存使用独立SaveIntent、revision/CAS和真实ACK；现有SaveQueue仅每个renderer内部串行，不是跨窗全局编辑协调器。

## 最小架构建议

1. **宿主管会话归属，录音窗管媒体。** 新建专用`recording-<opaque id>`真实WebviewWindow，非modal/非总在最前，不阻断主窗。宿主建立有界registry，固定sessionId、原noteId、录音窗真实身份、attachment operationId和阶段；入口URL的noteId、guest事件或复用label均不能授权。录音窗持有唯一生产Session、时钟、波形、播放器和最终File；主窗卸载/切笔记不dispose它。无focus/visibility暂停采集策略，不用后台UI定时器计算活动总时间。
2. **附件与正文各有单一负责方。** 录音窗沿真实owner存储同一最终File，重试保持operationId/recordedAt；宿主只向被核定的原note提交方转交已校验附件描述和幂等意图。事件仅作状态/唤醒，需query/重连取回权威阶段，不能把事件到达视为存储或正文ACK。大File不广播、Object URL不跨Webview当作所有权；主窗不得擅自改用新operationId或接管通用journal owner。需要窄的registry委托/回执验证接缝，而不是放宽现有通用query/cancel。
3. **对原note的最新正文施加一次插入操作。** 在原note的当前保存负责方登记录音意图，插入通过真实Editor transaction完成；该笔记切走时，保留每note的pending正文/队列与意图，不改当前所选note。插入排入该note现有保存顺序，基于执行时最新本地正文，后续编辑自然包含附件；不能上传录音开始时整份JSON，也不能给旧正文换一个新revision硬重试。原位置可用同一Editor transaction Mapping持续映射；编辑器更换或锚点删除后需明确、确定的原note末尾回退规则，不凭失效位置插入别处。此回退是新合同应明确的工程行为。
4. **跨窗只指定一个原note插入负责方。** registry分配有代次的提交claim，旧窗口/迟到事件不得重复插入。先排空该note已登记的保存，再在负责方最新正文中插入；正在编辑的同note不能仅因版本已增长被拒绝。原note无活Editor时可在其已排空的最新权威正文上原子追加；仍须和同note dirty队列协调，不能只读数据库快照再覆盖尚未保存的编辑。revision竞争时重新取得最新正文并重施“插入此附件一次”的窄操作，而非重发旧完整JSON。保留授权/锁定/删除检查和CAS；多窗已有分歧正文不能声称自动合并，录音本身不能再成为第二个整正文写入者。
5. **真正正文ACK后才销毁。** 临时卡仅在原note显示会话视图，不是持久节点；对应owner/editor可变化。附件引用已持久化的权威回执确认后移卡、关闭录音窗。失败保持同File/已存附件/意图和可重试窗口；已插入但ACK未到不cancel或重插。跨窗ACK需由宿主关联原note、operation、附件id和实际提交结果，不能接受任意前端布尔“成功”。

## 关闭、重建与审查重点

- 录音窗关闭：未开始直接退出；录制/暂停/试听关闭均走真实收尾、存储和原note正文ACK；忙碌重复关闭幂等，失败保留窗口与材料。主窗关闭或renderer重载不等于录音窗关闭；重新打开主窗从registry重新绑定原note，不能改投当前选择，也不能复用旧窗口claim。
- “主窗重启”应明确为同进程窗口/renderer重建，此时录音窗及registry可继续。整个应用退出需宿主统一协调所有录音收尾后退出，保存失败须可见；进程崩溃/强杀无法仅靠内存registry恢复未编码音频，不冒称有该能力。若要求跨进程恢复已收尾待提交材料，需另有持久恢复记录及通用journal冷清理协调，当前owner模型不能直接保证。
- 用真实录音窗与真实主/独立笔记窗审查：后台继续、切note/应用、同原note持续输入后完成且文字不丢、切回原note附件仅一次、原位置变化/删除、保存并发、响应丢失重连、主窗重建、录音窗重复关闭、授权失效/锁定/删除及未ACK失败保留。确认每次JSON写入只改原note最新正文，选择变化不变更归属；普通附件严校验、冲突保护和其他用户数据继续受保护。
- 52需同步核专用录音窗的真实身份与窄capability（原main/note-*规则不自动涵盖新窗），取消/超时迟到释放仍适用。50/52独审以root重写后的合同和固定源为准，旧锁界面方案不能因transport测试通过而验收；真实后台采音、设备有声和像素对照仍需准确实包。

结论：独立录音窗可复用当前媒体Session/播放controller及附件journal，但需要明确的宿主会话registry、录音专用最新正文插入意图与跨窗ACK。仅搬Panel到新窗、广播File或删除旧版本比较均不足以满足本次要求。此为架构准备，非实现通过。READY STOP。
